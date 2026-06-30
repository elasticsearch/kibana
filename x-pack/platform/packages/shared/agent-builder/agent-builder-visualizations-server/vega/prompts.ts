/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BaseMessageLike } from '@langchain/core/messages';
import type { EsqlEsqlColumnInfo } from '@elastic/elasticsearch/lib/api/types';
import { selectVegaExample } from './reference_examples';
import { EUI_SINGLE_SERIES_COLOR, EUI_TEXT_PARAGRAPH, EUI_CHART_CONFIG } from './colors';

/**
 * Describe the result columns of the backing ES|QL query so the model binds
 * encodings to real field names and types instead of guessing.
 */
const formatColumns = (columns: EsqlEsqlColumnInfo[] | undefined): string => {
  if (!columns || columns.length === 0) {
    return 'No column information is available; infer fields from the ES|QL query.';
  }

  return columns.map((column) => `- "${column.name}" (${column.type})`).join('\n');
};

/**
 * When the request matches a known chart type, build the reference-example block
 * injected into the prompt. A raw-Vega example also switches the author into raw
 * Vega (v5) with the rules that keep the spec bindable and renderable in Kibana;
 * a Vega-Lite example is a worked pattern to follow.
 */
const formatExampleSection = (nlQuery: string): string => {
  const example = selectVegaExample(nlQuery);
  if (!example) {
    return '';
  }

  const serialized = JSON.stringify(example.spec, null, 2);

  if (example.dialect === 'vega') {
    return `
RAW VEGA REQUIRED:
This request needs raw Vega (v5), not Vega-Lite — Vega-Lite cannot express it. Author a raw Vega spec following these rules:
- Declare a base data set named exactly "source" whose "url" is the inline ES|QL source { "%type%": "esql", "query": <the query above> } (as in the example). Derived data sets must reference it via "source": "source".
- DO NOT set top-level "width"/"height"; the system sizes the chart. Use the ES|QL query verbatim — the system re-binds and validates it.
- If the reference example sets a top-level "autosize" (e.g. {"type": "pad", "contains": "padding"}), keep it EXACTLY. A spec whose layout is derived from the "width"/"height" signals (e.g. a manual small-multiples grid) MUST use "pad"; the default "fit" shrinks those signals to the content and collapses the layout.
- Use "scales" whose ranges are "width"/"height" so the chart fills its container, a "marks" array for the visuals, and "signals" only if needed.
- Reference flat ES|QL columns. In "expr"/"signal" strings use bracket access for dotted names (datum['geo.dest']); in "field" references escape dots ("geo\\.dest").

REFERENCE EXAMPLE (${example.name}): ${example.guidance}
<reference_example>
${serialized}
</reference_example>
`;
  }

  return `
REFERENCE EXAMPLE (${example.name}): ${example.guidance}
Follow this Vega-Lite reference, adapting the field names to the columns listed above and keeping the EUI colors. Bind the data with the inline ES|QL source as shown: "data": { "url": { "%type%": "esql", "query": <the query above> } }.
<reference_example>
${serialized}
</reference_example>
`;
};

export const createAuthorVegaSpecPrompt = ({
  nlQuery,
  esqlQuery,
  columns,
  existingSpec,
  additionalContext,
}: {
  nlQuery: string;
  esqlQuery: string;
  columns?: EsqlEsqlColumnInfo[];
  existingSpec?: string;
  additionalContext?: string;
}): BaseMessageLike[] => {
  const esqlQueryJson = JSON.stringify(esqlQuery);

  return [
    [
      'system',
      `You are a Vega visualization expert. By default, author a single valid Vega-Lite (v6) specification for the user's request.

Use Vega-Lite when a standard chart cannot express the request, for example repeated charts, layered or combination charts (e.g. bars with an overlaid line), or scatter/bubble plots with an encoded size. Escalate to raw Vega (v5) for charts Vega-Lite cannot express well in Kibana: Sankey / flow diagrams, and responsive small multiples / faceting / trellis (Vega-Lite's facet/repeat sizes each sub-view in fixed pixels and does NOT reflow to fill the panel). When raw Vega is required, the instructions below say so explicitly.
${formatExampleSection(nlQuery)}
${
  existingSpec
    ? `Existing specification to modify (keep what still applies, change only what the request asks for):
<existing_specification>
${existingSpec}
</existing_specification>
`
    : ''
}
DATA SOURCE RULES:
1. Bind the data with Kibana's inline ES|QL source, as in the reference examples: for Vega-Lite a top-level "data": { "url": { "%type%": "esql", "query": <the exact query below> } }; for raw Vega a base data set named "source" with that same "url" (derived sets reference it via "source": "source"). Use the query verbatim — do not modify it; the system re-binds and validates it.
2. The spec is built around this ES|QL query; its result columns are the only fields you may reference in encodings: ${esqlQueryJson}
3. Reference each column by its exact name as produced by the query. If the query uses the time-picker params (?_tstart / ?_tend), add "%timefield%": "@timestamp" to the url so Kibana binds the time range.

Columns available in the data (reference these EXACT names):
<columns>
${formatColumns(columns)}
</columns>

ENCODING TYPES:
- Pick the correct "type" for every encoded field: "nominal" (unordered categories), "ordinal" (ordered categories), "quantitative" (continuous numbers), "temporal" (dates/times).

CHART CHOICE:
- PIE/DONUT: do NOT use "arc" marks. Prefer a sorted horizontal bar chart (it is easier to read and compare); pre-sort the categories in the ES|QL query (SORT … DESC).
- Keep the spec minimal: include only what is needed to render the requested chart. Do NOT add decorative text layers with a constant "value" (e.g. a center label that just repeats a word); a text layer must encode a real field.

COLOR:
- A single series needs a single color (safe default "${EUI_SINGLE_SERIES_COLOR}"). Do NOT hand-author a "domain"; let it derive from the data.
- Use "color" only for a meaningful dimension. For categorical fields, rely on Kibana's themed Elastic palette so the chart stays on-brand and works in light AND dark mode: in raw Vega use a color scale with "range": "category"; in Vega-Lite omit the color "scale" entirely (or set "scale": {"scheme": "category"}). Do NOT hardcode a hex "range" array and do NOT force a built-in scheme like "tableau10". For quantitative fields a sequential "scheme" ("blues", "viridis") is fine.

LAYOUT & STYLE RULES:
- DO NOT set top-level "width" or "height"; the system makes the chart fill its container. Do NOT set fixed mark sizes (e.g. arc "outerRadius") that prevent the chart from filling its panel.
- Provide a clear, self-explanatory "title"; prefer it over redundant axis titles.
- Use readable, EUI-aligned text colors (dark on the light panel). Include this config: "config": ${JSON.stringify(
        EUI_CHART_CONFIG
      )}. For any explicit text/label color (e.g. a "text" mark "fill" or "color"), use the dark "${EUI_TEXT_PARAGRAPH}"; never use washed-out light grays.
- SORT IN LAYERED SPECS: when a categorical axis is shared across layers, pre-sort rows in ES|QL (SORT … DESC) and set "sort": null on that encoding to avoid "conflicting sort properties" warnings.
- SHARED SCALES IN LAYERED SPECS: when multiple layers encode the same field on a shared scale (e.g. "color"), configure the "legend"/"axis"/"scale" on ONE layer only. Do NOT set "legend": null on one layer while another sets a legend for the same scale — conflicting per-layer settings trigger "Conflicting legend property" warnings.
- INDICATOR / BIG-NUMBER charts: stack the text marks in clearly separated vertical bands and NEVER center two large text marks on the same point. A single big value is safest; when adding a label or a secondary value (e.g. "Previous", "% change"), give each its own non-overlapping band and size fonts so the tallest mark cannot grow into its neighbours at any panel aspect ratio — overlapping text is rejected by validation.

DOTS IN FIELD NAMES:
- Vega treats an unescaped dot in a field name as nested-object access, but ES|QL columns are flat. For a column whose name contains a dot (e.g. "geo.dest"), backslash-escape every dot in "field" strings ("geo\\.dest") and use bracket access in expressions (datum['geo.dest']).

Your task is to author the visualization specification for the following request:

<user_query>
${nlQuery}
</user_query>

IMPORTANT: Return ONLY the JSON specification wrapped in a markdown code block:
\`\`\`json
{
  // your Vega or Vega-Lite specification here
}
\`\`\`

${additionalContext ?? ''}`,
    ],
    // Human message required for Bedrock to work properly
    ['human', 'Author the visualization specification.'],
  ];
};
