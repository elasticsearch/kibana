/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import type { PluginStart as DataViewsPluginStart } from '@kbn/data-views-plugin/server';
import type { SecurityPluginStart } from '@kbn/security-plugin-types-server';
import type {
  EncryptedSavedObjectsPluginSetup,
  EncryptedSavedObjectsPluginStart,
} from '@kbn/encrypted-saved-objects-plugin/server';
import type {
  CoreRequestHandlerContext,
  CustomRequestHandlerContext,
} from '@kbn/core-http-request-handler-context-server';
import type { IRouter } from '@kbn/core-http-server';
import type { Logger } from '@kbn/logging';
import type {
  LicensingApiRequestHandlerContext,
  LicensingPluginStart,
} from '@kbn/licensing-plugin/server';
import type { SpacesPluginSetup, SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { CoreSetup } from '@kbn/core/server';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { AssetManagerClient } from './domain/asset_manager';
import type { EntityMaintainersClient } from './domain/entity_maintainers';
import type { FeatureFlags } from './infra/feature_flags';
import type { LogsExtractionClient } from './domain/logs_extraction';
import type { RemoteLogsExtractionClient } from './domain/logs_extraction/remote';
import type { HistorySnapshotClient } from './domain/history_snapshot';
import type { CRUDClient } from './domain/crud';
import type { ResolutionClient } from './domain/resolution';
import type { RegisterEntityMaintainerConfig } from './tasks/entity_maintainers/types';

export interface EntityStoreSetupPlugins {
  taskManager: TaskManagerSetupContract;
  spaces: SpacesPluginSetup;
  encryptedSavedObjects: EncryptedSavedObjectsPluginSetup;
}

export interface EntityStoreStartPlugins {
  taskManager: TaskManagerStartContract;
  spaces: SpacesPluginStart;
  dataViews: DataViewsPluginStart;
  security: SecurityPluginStart;
  encryptedSavedObjects: EncryptedSavedObjectsPluginStart;
  licensing: LicensingPluginStart;
}

export interface EntityStoreApiRequestHandlerContext {
  core: CoreRequestHandlerContext;
  logger: Logger;
  assetManagerClient: AssetManagerClient;
  entityMaintainersClient: EntityMaintainersClient;
  crudClient: CRUDClient;
  resolutionClient: ResolutionClient;
  remoteLogsExtractionClient: RemoteLogsExtractionClient;
  featureFlags: FeatureFlags;
  logsExtractionClient: LogsExtractionClient;
  historySnapshotClient: HistorySnapshotClient;
  security: SecurityPluginStart;
  namespace: string;
}

export type EntityStoreRequestHandlerContext = CustomRequestHandlerContext<{
  entityStore: EntityStoreApiRequestHandlerContext;
  licensing: LicensingApiRequestHandlerContext;
}>;

export type EntityStorePluginRouter = IRouter<EntityStoreRequestHandlerContext>;

export type RegisterEntityMaintainer = (config: RegisterEntityMaintainerConfig) => void;

export type EntityStoreCRUDClient = Omit<CRUDClient, 'createEntity'>;

export interface EntityStoreStartContract {
  createCRUDClient: (esClient: ElasticsearchClient, namespace: string) => EntityStoreCRUDClient;
  createResolutionClient: (esClient: ElasticsearchClient, namespace: string) => ResolutionClient;
}

export interface EntityStoreSetupContract {
  registerEntityMaintainer: RegisterEntityMaintainer;
}

export type EntityStoreCoreSetup = CoreSetup<EntityStoreStartPlugins, EntityStoreStartContract>;
