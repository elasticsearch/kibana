/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { ModelProvider } from '@kbn/agent-builder-server';
import { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import { getChartTypeSelectionPromptContent } from './chart_type_guidance';

const chartTypeSchema = z
  .object({
    chartType: z
      .nativeEnum(SupportedChartType)
      .describe('The most appropriate chart type for the visualization'),
    reasoning: z
      .string()
      .optional()
      .describe('Brief explanation for why this chart type was selected'),
  })
  .describe('Chart type selection for data visualization');

export async function guessChartType(
  modelProvider: ModelProvider,
  nlQuery: string,
  existingType?: string
) {
  const model = await modelProvider.getDefaultModel();

  // Create a structured output model
  const structuredModel = model.chatModel.withStructuredOutput(chartTypeSchema, {
    name: 'select_chart_type',
  });

  const response = await structuredModel.invoke([
    {
      role: 'system',
      content: `You are a data visualization expert. Based on the user's query, suggest the most appropriate chart type from the available options.

You MUST call the 'select_chart_type' tool to provide your chart type selection. Do NOT respond with plain text.

${getChartTypeSelectionPromptContent()}
${existingType ? `- The existing chart type is: ${existingType}` : ''}`,
    },
    {
      role: 'user',
      content: existingType
        ? `Existing chart type to modify: ${existingType}\n\nUser query: ${nlQuery}`
        : nlQuery,
    },
  ]);

  return response.chartType ?? SupportedChartType.Metric;
}
