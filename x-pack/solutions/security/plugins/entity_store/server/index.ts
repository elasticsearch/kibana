/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializerContext } from '@kbn/core-plugins-server';

export type {
  EntityStoreSetupContract,
  EntityStoreStartContract,
  EntityStoreCRUDClient,
} from './types';
export type { RegisterEntityMaintainerConfig } from './tasks/entity_maintainers/types';
export type { EntityUpdateClient, BulkObject, BulkObjectResponse } from './domain/crud';
export type { EntityMetadataClient } from './domain/entity_metadata';
export type { ResolutionClient } from './domain/resolution';
export { getLatestEntitiesIndexName, getEntitiesAlias, ENTITY_LATEST } from '../common';
export { getHistorySnapshotIndexPattern } from './domain/asset_manager/history_snapshot_index';
export { ENGINE_METADATA_TYPE_FIELD } from './domain/logs_extraction/query_builder_commons';
export { getFieldValue } from '../common/domain/euid/commons';
export { EngineDescriptorTypeName } from './domain/saved_objects/engine_descriptor/types';
export { EntityStoreGlobalStateTypeName } from './domain/saved_objects/global_state/types';
export { enterpriseLicenseMiddleware } from './routes/middleware/enterprise_license';

export async function plugin(initializerContext: PluginInitializerContext) {
  const { EntityStorePlugin } = await import('./plugin');
  return new EntityStorePlugin(initializerContext);
}
