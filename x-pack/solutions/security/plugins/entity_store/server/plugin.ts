/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializerContext, CoreStart, Plugin, Logger } from '@kbn/core/server';
import { registerRoutes } from './routes';
import type {
  EntityStoreCoreSetup,
  EntityStoreRequestHandlerContext,
  EntityStoreSetupPlugins,
  EntityStoreStartPlugins,
  EntityStoreStartContract,
  EntityStoreSetupContract,
} from './types';
import { createRequestHandlerContext } from './request_context_factory';
import { PLUGIN_ID } from '../common';
import { registerTasks } from './tasks/register_tasks';
import { registerUiSettings } from './infra/feature_flags/register';
import {
  EngineDescriptorType,
  EntityStoreGlobalStateType,
  LegacyCcsLogExtractionStateType,
  RemoteLogExtractionStateType,
} from './domain/saved_objects';
import { registerEntityMaintainerTask } from './tasks/entity_maintainers';
import type { RegisterEntityMaintainerConfig } from './tasks/entity_maintainers/types';
import { CRUDClient } from './domain/crud';
import { ResolutionClient } from './domain/resolution';
import { registerTelemetry, createReportEvent } from './telemetry/events';
import { automatedResolutionMaintainerConfig } from './maintainers/automated_resolution';

export class EntityStorePlugin
  implements
    Plugin<
      EntityStoreSetupContract,
      EntityStoreStartContract,
      EntityStoreSetupPlugins,
      EntityStoreStartPlugins
    >
{
  private readonly logger: Logger;
  private readonly isServerless: boolean;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
    this.isServerless = initializerContext.env.packageInfo.buildFlavor === 'serverless';
  }

  public setup(
    core: EntityStoreCoreSetup,
    plugins: EntityStoreSetupPlugins
  ): EntityStoreSetupContract {
    plugins.taskManager.registerCanEncryptedSavedObjects(plugins.encryptedSavedObjects.canEncrypt);

    this.logger.debug('Registering telemetry events');
    registerTelemetry(core.analytics);

    const router = core.http.createRouter<EntityStoreRequestHandlerContext>();
    core.http.registerRouteHandlerContext<EntityStoreRequestHandlerContext, typeof PLUGIN_ID>(
      PLUGIN_ID,
      (context, request) =>
        createRequestHandlerContext({
          context,
          coreSetup: core,
          logger: this.logger,
          request,
          isServerless: this.isServerless,
          analytics: createReportEvent(core.analytics),
        })
    );

    registerTasks(plugins.taskManager, this.logger, core, this.isServerless);
    this.logger.debug('Registering routes');
    registerRoutes(router);

    this.logger.debug('Registering ui settings');
    registerUiSettings(core.uiSettings);

    this.logger.debug('Registering saved objects types');
    core.savedObjects.registerType(EngineDescriptorType);
    core.savedObjects.registerType(EntityStoreGlobalStateType);
    core.savedObjects.registerType(RemoteLogExtractionStateType);
    core.savedObjects.registerType(LegacyCcsLogExtractionStateType);

    registerEntityMaintainerTask({
      taskManager: plugins.taskManager,
      logger: this.logger,
      config: automatedResolutionMaintainerConfig,
      core,
      analytics: createReportEvent(core.analytics),
    });

    return {
      registerEntityMaintainer: (config: RegisterEntityMaintainerConfig) =>
        registerEntityMaintainerTask({
          taskManager: plugins.taskManager,
          logger: this.logger,
          config,
          core,
          analytics: createReportEvent(core.analytics),
        }),
    };
  }

  public start(core: CoreStart, plugins: EntityStoreStartPlugins): EntityStoreStartContract {
    this.logger.info('Initializing plugin');

    plugins.taskManager.registerEncryptedSavedObjectsClient(
      plugins.encryptedSavedObjects.getClient({
        includedHiddenTypes: ['task'],
      })
    );

    plugins.taskManager.registerApiKeyInvalidateFn(
      plugins.security?.authc.apiKeys.invalidateAsInternalUser
    );

    const logger = this.logger;
    return {
      createCRUDClient: (esClient, namespace) => new CRUDClient({ logger, esClient, namespace }),
      createResolutionClient: (esClient, namespace) =>
        new ResolutionClient({ logger, esClient, namespace }),
    };
  }

  public stop() {
    this.logger.info('Stopping plugin');
  }
}
