/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializer, PluginInitializerContext } from '@kbn/core/server';
import type { InboxConfig } from './config';
import type {
  InboxPluginSetup,
  InboxPluginStart,
  InboxSetupDependencies,
  InboxStartDependencies,
} from './types';

export type {
  InboxPluginSetup,
  InboxPluginStart,
  InboxActionProvider,
  InboxActionProviderFacetBucket,
  InboxActionProviderFacetsResult,
  InboxActionProviderListParams,
  InboxActionProviderListProcessedParams,
  InboxActionProviderListResult,
  InboxRequestContext,
} from './types';

export type {
  InboxActionConflictError,
  InvalidInboxActionSourceIdError,
} from './services/inbox_action_registry';
export {
  createInboxActionConflictError,
  createInvalidInboxActionSourceIdError,
  isInboxActionConflictError,
  isInvalidInboxActionSourceIdError,
} from './services/inbox_action_registry';

export const plugin: PluginInitializer<
  InboxPluginSetup,
  InboxPluginStart,
  InboxSetupDependencies,
  InboxStartDependencies
> = async (pluginInitializerContext: PluginInitializerContext<InboxConfig>) => {
  const { InboxPlugin } = await import('./plugin');
  return new InboxPlugin(pluginInitializerContext);
};

export { config } from './config';
