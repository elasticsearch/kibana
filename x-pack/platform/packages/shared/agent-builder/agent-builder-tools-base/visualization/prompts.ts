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

export const esqlAdditionalInstructions = `
You are generating an ES|QL query for a Kibana Lens visualization. The query will be used to create a visualization in Kibana.

For that purpose, follow these guidelines:

## Human-readable column aliases

Use human-readable column aliases in STATS/EVAL (e.g. \`Unique Visitors\` not \`unique_visitors\`). Wrap multi-word aliases in backticks.

## Time picker compatibility

Visualization ES|QL must respond to the Lens time picker. If a time field exists, use the event-time field, typically \`@timestamp\`, \`timestamp\`, or another event date. Reference \`?_tstart\` and \`?_tend\` in the query.
For time-series charts, pass \`?_tstart\` and \`?_tend\` to the bucket function.
For categorical, metric, or any other charts that do not group by time, add a filter such as \`WHERE <time field> >= ?_tstart AND <time field> < ?_tend\`.
Do not hardcode absolute times or now()-based ranges.

## Time Bucketing

### FROM

For time series charts, use auto buckets: \`BUCKET(<time field>, 75, ?_tstart, ?_tend)\` or \`TBUCKET(75, ?_tstart, ?_tend)\`, not hardcoded intervals like \`DATE_TRUNC(1 hour, <time field>)\`.
Omit \`LIMIT\`; the bucket range already bounds the results.

e.g. with for a normal index with FROM and BUCKET:

\`\`\`esql
FROM logs | STATS count = COUNT() BY bucket = BUCKET(timestamp, 75, ?_tstart, ?_tend)
\`\`\`

### TS

The visualization framework automatically adds the correct time range to the query for time series when using TS,
meaning you **do not need** to filter using TRANGE manually.

The only exception when you should use the variables to manually filter the timeframe with TS is for TBUCKET,

e.g.

\`\`\`esql
TS logs-tsds | STATS count = COUNT() BY bucket = TBUCKET(75, ?_tstart, ?_tend)
\`\`\`

Also omit \`LIMIT\` (same reasons as with FROM).`;
