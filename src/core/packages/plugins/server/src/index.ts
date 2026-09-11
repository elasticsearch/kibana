/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type {
  PrebootPlugin,
  Plugin,
  PluginConfigDescriptor,
  PluginConfigSchema,
  PluginInitializer,
  PluginInitializerContext,
  PluginManifest,
  SharedGlobalConfig,
  MakeUsageFromSchema,
  ExposedToBrowserDescriptor,
  DynamicConfigDescriptor,
} from './types';

export { SharedGlobalConfigKeys } from './shared_global_config';

export type { InitState } from './deferred_init';

export {
  DeferredInitializationError,
  isDeferredInitializationError,
} from '@kbn/core-deferred-init-common';
