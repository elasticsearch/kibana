/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializer } from '@kbn/core/public';
import {
  ApmSourceAccessPlugin,
  type ApmSourceAccessPluginSetup,
  type ApmSourceAccessPluginStart,
} from './plugin';

export const plugin: PluginInitializer<
  ApmSourceAccessPluginSetup,
  ApmSourceAccessPluginStart
> = () => new ApmSourceAccessPlugin();

export type { ApmSourceAccessPluginStart, ApmSourceAccessPluginSetup };

export {
  APM_INDEX_PATTERN_MAX_LENGTH,
  validateApmIndexSetting,
  validateApmIndices,
} from '../common/apm_indices_validation';
export type {
  ApmIndexSettingKey,
  ApmIndexValidationErrors,
  ApmIndexValidationValues,
} from '../common/apm_indices_validation';
export type { APMIndices } from '../common/config_schema';

export { callSourcesAPI, type SourcesApiOptions } from './api';
