/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import { getPalettes } from '@kbn/palettes';
import { chartTypeRegistry } from './chart_type_registry';

/**
 * Number of color stops sampled from each categorical palette in the prompt
 */
const CATEGORICAL_PALETTE_PREVIEW_STEPS = 5;

/**
 * Mirrors Lens palette pickers for agent prompts. Legacy palettes are excluded
 * so the agent uses the default/current palette set unless the user asks otherwise.
 */
const lensColorPalettes = getPalettes(false)
  .getAll()
  .filter(({ legacy }) => !legacy);

/**
 * Mirrors the Lens dynamic color picker: gradient palettes.
 */
const lensDynamicColorPalettes = lensColorPalettes.filter((palette) => palette.type === 'gradient');

/**
 * Mirrors the Lens categorical color picker.
 */
const lensCategoricalColorPalettes = lensColorPalettes.filter(
  (palette) => palette.type === 'categorical'
);

const formatPalettePreview = ({
  name,
  colors,
}: {
  name: string;
  colors: readonly string[];
}): string => `- ${name}: ${colors.join(', ')}`;

const getDynamicPalettePreviews = (steps: number): string[] =>
  lensDynamicColorPalettes.map((palette) =>
    formatPalettePreview({ name: palette.name, colors: palette.colors(steps) })
  );

const getCategoricalPalettePreviews = (): string[] =>
  lensCategoricalColorPalettes.map((palette) =>
    formatPalettePreview({
      name: `${palette.id} (${palette.name})`,
      colors: palette.colors(CATEGORICAL_PALETTE_PREVIEW_STEPS),
    })
  );

const getChartSpecificRules = (chartType: SupportedChartType): string[] => {
  switch (chartType) {
    case SupportedChartType.Gauge:
      return [
        '- Gauge default: mirror Lens with `range: "percentage"` and exactly 4 bands: `0 <= value < 25`, `25 <= value < 50`, `50 <= value < 75`, `75 <= value <= 100`.',
        '- If the user asks for a non-default gauge palette, keep those same percentage bands and only change the step colors.',
        '- Do not invent absolute gauge thresholds from units like bytes, requests, or rates unless the user gave those thresholds.',
      ];
    case SupportedChartType.Metric:
      return [
        '- Metric placement: set `apply_color_to: "value"`; do not color the background unless the user asks.',
        '- For clearly bounded metrics, use explicit 3-band `steps` by default. Examples: percent, ratio, CPU/memory/disk utilization, error rate, success rate, or SLO compliance.',
        '- Metric charts use 3 bands; prefer "Status", "Negative", "Positive", or "Temperature" when thresholds have semantic meaning.',
        '- For bounded adverse metrics like error rate %, higher values are worse; use a status/adverse palette with thresholds in the same percent scale as the metric output.',
        '- For unbounded values like raw counts, bytes, durations, throughput, or rates with unknown scale, prefer `color: { type: "auto" }` or omit `color` unless the user provides thresholds or asks for a custom palette.',
      ];
    case SupportedChartType.Heatmap:
      return [
        '- Heatmap defaults are data-bound in Lens and use the "Temperature" palette, so prefer `color: { type: "auto" }` or omit `color`.',
        '- Use explicit `steps` only when the user requests a custom palette or gives thresholds.',
      ];
    case SupportedChartType.Datatable:
      return [
        '- Datatable placement: prefer `apply_color_to: "badge"`; avoid cell background or text coloring unless the user asks.',
        '- Add datatable coloring only when it improves readability, highlights status/severity, or the user asks for colored values.',
        '- Numeric datatable columns: when coloring is useful, use `apply_color_to: "badge"` with `color: { type: "auto" }` so Lens computes stops from table data.',
        '- Categorical datatable columns: when coloring is useful, use `color: { mode: "categorical", palette: "<palette id>", mapping: [] }` so Lens assigns colors to actual values.',
      ];
    default:
      return [];
  }
};

/**
 * Returns chart-specific coloring guidance for the visualization config prompt.
 */
export const getColorPalettesPromptContent = (chartType: SupportedChartType): string => {
  const entry = chartTypeRegistry[chartType];
  const coloringOptions = entry.prompt.config?.options?.coloring;
  const dynamicColoringOptions = coloringOptions?.dynamic;
  const supportsDynamic = dynamicColoringOptions !== undefined;
  const supportsCategorical = coloringOptions?.categorical ?? false;

  if (!supportsDynamic && !supportsCategorical) {
    return '';
  }

  const stepsCount = dynamicColoringOptions?.recommendedStepCount ?? 5;
  const lines: string[] = ['COLOR PALETTE RULES:', ''];
  let sectionNumber = 1;
  const nextSection = () => sectionNumber++;

  lines.push(
    `${nextSection()}) DEFAULT POLICY`,
    '- Prefer Lens defaults for unknown-scale data: use `color: { type: "auto" }` or omit `color` when Lens can calculate better thresholds at render time.',
    '- Generate explicit numeric `steps` only when the chart-specific rules allow it, or when the user asks for a custom palette or exact thresholds.',
    '- Do not color neutral data with no useful color meaning.',
    ''
  );

  const chartSpecificRules = getChartSpecificRules(chartType);
  if (chartSpecificRules.length) {
    lines.push(`${nextSection()}) ${chartType.toUpperCase()} RULES`, ...chartSpecificRules, '');
  }

  if (supportsDynamic && supportsCategorical) {
    lines.push(
      `${nextSection()}) CHOOSE the coloring mode based on the column type`,
      '- Only add color when it adds meaning, improves readability, highlights status/severity, or the user asks for colored values.',
      '- Numeric columns → when coloring is useful, use `color: { type: "auto" }` by default; use `color: { type: "dynamic", range, steps: [...] }` only when explicit steps are allowed.',
      '- Keyword / text columns → when coloring is useful, use `color: { mode: "categorical", palette: "<palette id>", mapping: [] }`.',
      '- NEVER apply categorical mapping to a numeric column or dynamic palette steps to a keyword column.',
      '- NEVER use the deprecated `type: "legacy_dynamic"`.',
      ''
    );
  }

  if (supportsDynamic) {
    lines.push(
      `${nextSection()}) DYNAMIC STEPS`,
      '- Pick exactly ONE dynamic palette from the list below: "Status" for threshold bands, "Temperature" for intensity, "Complementary" for divergence, "Negative"/"Positive" for adverse/favorable values, or "Cool"/"Warm"/"Gray" for neutral magnitude.'
    );

    lines.push(
      `- Use exactly ${stepsCount} step${
        stepsCount === 1 ? '' : 's'
      }; every \`steps[*].color\` hex MUST come from that one palette preview line exactly as written.`,
      '- Step thresholds are data values, not display labels; keep them in the same unit and scale as the metric column. For rates, do not assume per-second thresholds unless the ES|QL query computes per-second values.',
      '- Keep palette order by default; to reverse, reverse the `steps` colors yourself. There is no `reverse` field.',
      ''
    );
  }

  if (supportsCategorical) {
    lines.push(
      `${nextSection()}) CATEGORICAL MAPPING — pick a palette by id`,
      '- Set `color: { mode: "categorical", palette: "<palette id>", mapping: [] }` and let Lens auto-assign a distinct color per distinct value at render time.',
      '- The `palette` value MUST be one of the categorical palette ids listed below verbatim (e.g. `"default"`, `"severity"`).',
      '- Leave `mapping: []` by default. Only define explicit `mapping[]` entries when the user names specific values to color.',
      '- When the user does name explicit values, use `color: { type: "color_code", value: "#hex" }` for each entry, drawing the hex from one of the palettes below.',
      ''
    );
  }

  if (supportsDynamic) {
    lines.push(
      `Available dynamic palettes (canonical ${stepsCount}-stop previews from the Lens UI palette picker, sized to match the ${stepsCount} \`steps\` you must produce for a ${chartType} chart):`,
      ...getDynamicPalettePreviews(stepsCount),
      ''
    );
  }

  if (supportsCategorical) {
    lines.push(
      `Available categorical palettes (${CATEGORICAL_PALETTE_PREVIEW_STEPS}-color preview of each palette from the Lens UI color-mapping picker; pass the id, not the name):`,
      ...getCategoricalPalettePreviews()
    );
  }

  return lines.join('\n').trimEnd();
};
