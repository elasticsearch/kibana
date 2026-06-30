/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BaseMessageLike } from '@langchain/core/messages';
import type { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import { getChartTypeConfigPromptContent } from './chart_type_guidance';
import { getColorPalettesPromptContent } from './color_palettes';

export const createGenerateConfigPrompt = ({
  nlQuery,
  esqlQuery,
  chartType,
  schema,
  existingConfig,
  additionalChartConfigInstructions,
  additionalContext,
}: {
  nlQuery: string;
  esqlQuery: string;
  chartType: SupportedChartType;
  schema: object;
  existingConfig?: string;
  additionalChartConfigInstructions?: string;
  additionalContext?: string;
}): BaseMessageLike[] => {
  const chartTypeConfigPromptContent = getChartTypeConfigPromptContent(chartType);
  const colorPalettesPromptContent = getColorPalettesPromptContent(chartType);
  const esqlQueryJson = JSON.stringify(esqlQuery);

  return [
    [
      'system',
      `You are a Kibana Lens visualization configuration expert. Generate a valid configuration for a ${chartType} visualization based on the provided schema and ES|QL query.

Schema for ${chartType}:
<schema type="${chartType}">
${JSON.stringify(schema)}
</schema>

${
  existingConfig
    ? `Existing configuration to modify:
  <existing_configuration>
  ${existingConfig}
  </existing_configuration>
  `
    : ''
}

DATA SOURCE RULES:
1. The ES|QL query is owned and injected by the system automatically. DO NOT output a 'data_source' field, and do not restate, copy, or modify the query anywhere in the config.
2. The configuration is built around this query; its result columns are the only columns available to bind: ${esqlQueryJson}
3. For ES|QL column bindings use { column: '<esql column name>', ...other options }, and every bound column must be one produced by that query.
4. Follow the schema definition strictly, with the single exception that you must omit the 'data_source' field.

TITLE RULES:
- Omit the 'title' field when the chart already displays the information within itself (e.g. metric, gauge, tagcloud, waffle charts show their value and label directly).
- When a title is needed, make it self-explanatory and exhaustive so that axis titles become unnecessary.
- NEVER duplicate information across the chart title, axis titles, and metric labels.

NUMBER FORMAT RULES:
- Always apply a 'format' to columns when the data has a well-known unit:
  - CPU / utilization percentages → { type: "percent", decimals: 1, compact: true }
  - Bytes (disk, memory, network volume) → { type: "bytes", decimals: 1 }
  - Bits (network throughput) → { type: "bits", decimals: 1 }
  - Durations (response time, latency) → { type: "duration", from: "<source unit>", to: "" } where <source unit> matches the ES field unit (e.g. "ms", "s", "micros")
- When column names or the user query hint at a unit (e.g. "cpu", "percent", "bytes_in", "disk_used", "latency_ms"), infer the correct format even if the user did not explicitly ask for it.
- Do NOT apply a format when the metric is a plain count, rate, or when the unit is ambiguous.

${colorPalettesPromptContent ? `${colorPalettesPromptContent}\n` : ''}
${chartTypeConfigPromptContent ? `${chartTypeConfigPromptContent}` : ''}

${additionalChartConfigInstructions ?? ''}

Your task is to generate a ${chartType} visualization configuration based on the following information:

<user_query>
${nlQuery}
</user_query>

Generate the ${chartType} visualization configuration.

IMPORTANT: Return ONLY the JSON configuration wrapped in a markdown code block like this:
\`\`\`json
{
  // your configuration here
}
\`\`\`

${additionalContext ?? ''}`,
    ],
    // Human message required for Bedrock to work properly
    ['human', 'Generate the visualization configuration.'],
  ];
};
