/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { buildVegaConfig } from './build_config';
export type { BuildVegaConfigParams, BuildVegaConfigResult } from './build_config';
export { createVegaGraph } from './graph';
export { normalizeVegaSpec, VEGA_LITE_SCHEMA } from './normalize_spec';
export { escapeVegaFieldReferences } from './field_escaping';
export { createAuthorVegaSpecPrompt } from './prompts';
export { validateVegaSpec } from './vega_validator';
export type { VegaValidationResult } from './vega_validator';
