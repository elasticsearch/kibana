/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { KibanaRequest } from '@kbn/core/server';
import type {
  EntityStoreApiRequestHandlerContext,
  EntityStoreCoreSetup,
  EntityStoreRequestHandlerContext,
} from './types';
import { AssetManagerClient } from './domain/asset_manager';
import { EntityMaintainersClient } from './domain/entity_maintainers';
import { FeatureFlags } from './infra/feature_flags';
import { EngineDescriptorClient, EntityStoreGlobalStateClient } from './domain/saved_objects';
import { LogsExtractionClient } from './domain/logs_extraction';
import { createRemoteLogsExtractionClient } from './domain/logs_extraction/remote';
import { HistorySnapshotClient } from './domain/history_snapshot';
import { CRUDClient } from './domain/crud';
import { ResolutionClient } from './domain/resolution';
import type { TelemetryReporter } from './telemetry/events';

interface EntityStoreApiRequestHandlerContextDeps {
  coreSetup: EntityStoreCoreSetup;
  context: Omit<EntityStoreRequestHandlerContext, 'entityStore'>;
  logger: Logger;
  request: KibanaRequest;
  isServerless: boolean;
  analytics: TelemetryReporter;
}

export async function createRequestHandlerContext({
  logger,
  context,
  coreSetup,
  request,
  isServerless,
  analytics,
}: EntityStoreApiRequestHandlerContextDeps): Promise<EntityStoreApiRequestHandlerContext> {
  const core = await context.core;
  const [coreStart, startPlugins] = await coreSetup.getStartServices();
  const taskManagerStart = startPlugins.taskManager;
  const namespace = startPlugins.spaces.spacesService.getSpaceId(request);

  const dataViewsService = await startPlugins.dataViews.dataViewsServiceFactory(
    core.savedObjects.client,
    core.elasticsearch.client.asInternalUser,
    request
  );

  const engineDescriptorClient = new EngineDescriptorClient(
    core.savedObjects.client,
    namespace,
    logger
  );

  const globalStateClient = new EntityStoreGlobalStateClient(
    core.savedObjects.client,
    namespace,
    logger
  );

  const esClient = core.elasticsearch.client.asCurrentUser;
  const cpsClient = coreStart.elasticsearch.client.asScoped(request, {
    projectRouting: 'space',
  }).asCurrentUser;

  const crudClient = new CRUDClient({
    logger,
    esClient,
    namespace,
  });
  const { client: remoteLogsExtractionClient, stateClient: remoteLogExtractionStateClient } =
    createRemoteLogsExtractionClient({
      logger,
      namespace,
      soClient: core.savedObjects.client,
      esClient,
      cpsClient,
      isServerless,
    });

  const logsExtractionClient = new LogsExtractionClient({
    logger,
    namespace,
    esClient,
    dataViewsService,
    engineDescriptorClient,
    globalStateClient,
    remoteLogsExtractionClient,
  });

  const historySnapshotClient = new HistorySnapshotClient({
    logger,
    esClient,
    namespace,
    globalStateClient,
  });

  return {
    core,
    logger,
    assetManagerClient: new AssetManagerClient({
      logger,
      esClient: core.elasticsearch.client.asCurrentUser,
      taskManager: taskManagerStart,
      engineDescriptorClient,
      globalStateClient,
      remoteLogExtractionStateClient,
      namespace,
      isServerless,
      logsExtractionClient,
      security: startPlugins.security,
      analytics,
      savedObjectsClient: core.savedObjects.client,
    }),
    entityMaintainersClient: new EntityMaintainersClient({
      logger,
      taskManager: taskManagerStart,
      namespace,
      analytics,
      coreStart,
      licensing: startPlugins.licensing,
    }),
    crudClient,
    resolutionClient: new ResolutionClient({
      logger,
      esClient: core.elasticsearch.client.asCurrentUser,
      namespace,
    }),
    remoteLogsExtractionClient,
    featureFlags: new FeatureFlags(core.uiSettings.client),
    logsExtractionClient,
    historySnapshotClient,
    security: startPlugins.security,
    namespace,
  };
}
