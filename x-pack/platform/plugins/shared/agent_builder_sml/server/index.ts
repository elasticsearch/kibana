/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializer, PluginInitializerContext } from '@kbn/core/server';
import type {
  AgentBuilderSmlPluginSetup,
  AgentBuilderSmlPluginStart,
  AgentBuilderSmlSetupDependencies,
  AgentBuilderSmlStartDependencies,
} from './types';

export type {
  AgentBuilderSmlPluginSetup,
  AgentBuilderSmlPluginStart,
  SmlIndexAttachmentParams,
} from './types';

export type {
  SmlTypeDefinition,
  SmlEntry,
  SmlListItem,
  SmlSearchResult,
  SmlSearchConstraints,
  SmlSearchFilters,
  SmlDocument,
  SmlDocumentAttributes,
  SmlIndexAction,
} from './services/sml/types';

export { kibanaPermissions } from './services/sml/permissions/kibana';
export { getSmlOriginId } from './services/sml/sml_origin';

export { smlAiIndexDescription, smlIndexName } from './services/sml/sml_storage';
export { SmlSearchFilterType } from '../common/http_api/sml';

export const plugin: PluginInitializer<
  AgentBuilderSmlPluginSetup,
  AgentBuilderSmlPluginStart,
  AgentBuilderSmlSetupDependencies,
  AgentBuilderSmlStartDependencies
> = async (pluginInitializerContext: PluginInitializerContext) => {
  const { AgentBuilderSmlPlugin } = await import('./plugin');
  return new AgentBuilderSmlPlugin(pluginInitializerContext);
};
