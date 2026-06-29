/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * EUI Borealis design tokens (light theme), the single source of truth for the
 * colors used in the Vega reference specs and the author prompt. Resolve these
 * named constants instead of hardcoding hex literals inline.
 * https://eui.elastic.co/docs/getting-started/theming/tokens/colors/
 */

/**
 * Categorical, color-blind-safe data-vis palette (euiColorVis0..9).
 *
 * Prefer NOT to hardcode this in specs: Kibana's Vega renderer themes the
 * default categorical palette (raw-Vega `range: "category"`, Vega-Lite nominal
 * color) to these colors and stays theme-aware (light/dark). This constant
 * exists only to derive the single-series default below.
 */
const EUI_VIS_COLORS = [
  '#16C5C0',
  '#A6EDEA',
  '#61A2FF',
  '#BFDBFF',
  '#EE72A6',
  '#FFC7DB',
  '#F6726A',
  '#FFC9C2',
  '#EAAE01',
  '#FCD883',
] as const;

/** Safe default for a single (non-categorical) series — the first vis color. */
export const EUI_SINGLE_SERIES_COLOR = EUI_VIS_COLORS[0];

/** textParagraph — labels and explicit text-mark fills. */
export const EUI_TEXT_PARAGRAPH = '#1D2A3E';
/** textHeading — titles. */
export const EUI_TEXT_HEADING = '#111C2C';
/** textSubdued — axis lines / ticks. */
export const EUI_TEXT_SUBDUED = '#516381';
/** textSuccess — positive deltas. */
export const EUI_TEXT_SUCCESS = '#09724D';
/** textDanger — negative deltas. */
export const EUI_TEXT_DANGER = '#A71627';

/** backgroundBaseSubdued — neutral surface for in-chart controls. */
export const EUI_BACKGROUND_SUBDUED = '#F6F9FC';
/** borderBasePlain — neutral border for in-chart controls. */
export const EUI_BORDER_PLAIN = '#CAD3E2';

/**
 * Shared, EUI-aligned chart config: dark, readable text on the light panel.
 * Reused by the reference example specs and advertised in the author prompt so
 * generated charts match Elastic's look.
 */
export const EUI_CHART_CONFIG = {
  axis: {
    domainColor: EUI_TEXT_SUBDUED,
    tickColor: EUI_TEXT_SUBDUED,
    labelColor: EUI_TEXT_PARAGRAPH,
    titleColor: EUI_TEXT_HEADING,
  },
  legend: { labelColor: EUI_TEXT_PARAGRAPH, titleColor: EUI_TEXT_HEADING },
  title: { color: EUI_TEXT_HEADING, subtitleColor: EUI_TEXT_PARAGRAPH },
  view: { stroke: null },
} as const;
