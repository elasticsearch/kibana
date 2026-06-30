/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { ModelProvider } from '@kbn/agent-builder-server';
import { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import { getChartTypeSelectionPromptContent } from './lens/chart_type_guidance';

/**
 * Which engine renders a generated visualization. Lens is the default for
 * standard charts; Vega is the fallback for requests Lens cannot express.
 */
export type VisualizationRenderer = 'lens' | 'vega';

/**
 * The chosen rendering approach. When Lens is selected the best-fitting chart
 * type is carried so the Lens generator can skip a redundant chart-type guess;
 * Vega carries no chart type because it authors a free-form spec.
 */
export type VisualizationApproach =
  | { renderer: 'lens'; chartType: SupportedChartType; reasoning?: string }
  | { renderer: 'vega'; reasoning?: string };

const approachSchema = z
  .object({
    renderer: z
      .enum(['lens', 'vega'])
      .describe(
        'Pick "lens" whenever one of the available Lens chart types can express the request. Pick "vega" ONLY when none of them can.'
      ),
    chartType: z
      .nativeEnum(SupportedChartType)
      .optional()
      .describe('Required when renderer is "lens": the best-fitting Lens chart type.'),
    reasoning: z.string().optional().describe('Brief explanation for the decision.'),
  })
  .describe('Decision on how to render a data visualization.');

const buildSystemPrompt = (existingType?: string): string =>
  [
    'You are a data visualization expert. Decide whether a request is best served by a standard Lens chart or by a custom Vega-Lite specification.',
    '',
    'You MUST call the "decide_visualization_approach" tool. Do NOT respond with plain text.',
    '',
    'Prefer Lens. Choose "lens" and the most appropriate chart type whenever one of the available Lens chart types can express the request:',
    getChartTypeSelectionPromptContent(),
    '',
    'Vega here means Vega-Lite only (no raw Vega). Choose "vega" ONLY when no Lens chart type fits but Vega-Lite can express the request, for example:',
    '- Small multiples / faceting (a grid of the same chart split by a category)',
    '- Repeated or layered/combination charts (e.g. bars plus an overlaid line)',
    '- Scatter / bubble plots with an encoded size dimension',
    '',
    'Do NOT choose "vega" for diagrams Vega-Lite cannot express — Sankey / flow / alluvial diagrams, network / node-link graphs, chord diagrams, or maps. For those, choose "lens" with the closest standard chart (e.g. a bar chart of the top source→destination combinations) so the user still gets a working visualization.',
    '',
    'When you choose "lens" you MUST also provide "chartType". When you choose "vega" omit "chartType".',
    existingType ? `\nThe existing visualization currently uses: ${existingType}.` : '',
  ]
    .filter(Boolean)
    .join('\n');

/**
 * Ask the model whether to render a request with Lens or Vega. Defaults to a
 * Lens metric if the model selects Lens without naming a chart type.
 */
export async function decideVisualizationApproach(
  modelProvider: ModelProvider,
  nlQuery: string,
  existingType?: string
): Promise<VisualizationApproach> {
  const model = await modelProvider.getDefaultModel();
  const structuredModel = model.chatModel.withStructuredOutput(approachSchema, {
    name: 'decide_visualization_approach',
  });

  const response = await structuredModel.invoke([
    { role: 'system', content: buildSystemPrompt(existingType) },
    { role: 'user', content: nlQuery },
  ]);

  if (response.renderer === 'vega') {
    return { renderer: 'vega', reasoning: response.reasoning };
  }

  return {
    renderer: 'lens',
    chartType: response.chartType ?? SupportedChartType.Metric,
    reasoning: response.reasoning,
  };
}
