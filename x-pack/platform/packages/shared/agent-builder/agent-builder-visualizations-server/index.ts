/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  buildVisualizationConfig,
  type BuildVisualizationConfigParams,
} from './lens/build_visualization_config';
export { getChartTypeSelectionPromptContent } from './lens/chart_type_guidance';
export type { VisualizationConfig } from './lens/types';
export { esqlAdditionalInstructions } from './shared/esql_instructions';
export { decideVisualizationApproach } from './decide_visualization_approach';
export type { VisualizationRenderer, VisualizationApproach } from './decide_visualization_approach';
export { extractTextFromMessage } from './utils/extract_text_from_message';

export {
  buildVegaConfig,
  createVegaGraph,
  normalizeVegaSpec,
  VEGA_LITE_SCHEMA,
  escapeVegaFieldReferences,
  createAuthorVegaSpecPrompt,
  validateVegaSpec,
} from './vega';
export type { BuildVegaConfigParams, BuildVegaConfigResult, VegaValidationResult } from './vega';
