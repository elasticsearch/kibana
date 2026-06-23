/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  IRouter,
  Logger,
  PluginInitializerContext,
  Plugin,
  CoreSetup,
  CoreStart,
} from '@kbn/core/server';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import { SEARCH_PROJECT_SETTINGS } from '@kbn/serverless-search-settings';
import type { DataViewsServerPluginStart } from '@kbn/data-views-plugin/server';
import { registerApiKeyRoutes } from './routes/api_key_routes';
import { registerIndicesRoutes } from './routes/indices_routes';

import type { ServerlessSearchConfig } from './config';
import type {
  ServerlessSearchPluginSetup,
  ServerlessSearchPluginStart,
  SetupDependencies,
  StartDependencies,
} from './types';
import { registerConnectorsRoutes } from './routes/connectors_routes';
import { registerTelemetryUsageCollector } from './collectors/connectors/telemetry';
import { registerMappingRoutes } from './routes/mapping_routes';
import { registerIngestPipelineRoutes } from './routes/ingest_pipeline_routes';

export interface RouteDependencies {
  http: CoreSetup<StartDependencies>['http'];
  logger: Logger;
  router: IRouter;
  getSecurity: () => Promise<SecurityPluginStart>;
}

export class ServerlessSearchPlugin
  implements
    Plugin<
      ServerlessSearchPluginSetup,
      ServerlessSearchPluginStart,
      SetupDependencies,
      StartDependencies
    >
{
  // @ts-ignore config is not used for now
  private readonly config: ServerlessSearchConfig;
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.config = initializerContext.config.get<ServerlessSearchConfig>();
    this.logger = initializerContext.logger.get();
  }
  private async createDefaultDataView(core: CoreStart, dataViews: DataViewsServerPluginStart) {
    const dataViewsService = await dataViews.dataViewsServiceFactory(
      core.savedObjects.createInternalRepository(),
      core.elasticsearch.client.asInternalUser,
      undefined,
      true
    );
    const dataViewExists = await dataViewsService.get('default_all_data_id').catch(() => false);
    if (!dataViewExists) {
      const defaultDataViewExists = await dataViewsService.defaultDataViewExists();
      if (!defaultDataViewExists) {
        await dataViewsService.createAndSave({
          allowNoIndex: false,
          name: 'default:all-data',
          title: '*,-.*',
          id: 'default_all_data_id',
        });
      }
    }
    return;
  }

  public setup(
    { getStartServices, http }: CoreSetup<StartDependencies>,
    { features, serverless, usageCollection }: SetupDependencies
  ) {
    const router = http.createRouter();
    const dependencies = {
      http,
      logger: this.logger,
      router,
      getSecurity: async () => {
        const [, { security }] = await getStartServices();
        return security;
      },
    };

    registerApiKeyRoutes(dependencies);
    registerConnectorsRoutes(dependencies);
    registerIndicesRoutes(dependencies);
    registerMappingRoutes(dependencies);
    registerIngestPipelineRoutes(dependencies);

    if (usageCollection) {
      registerTelemetryUsageCollector(usageCollection, this.logger);
    }

    features.registerElasticsearchFeature({
      id: 'serverlessSearch',
      privileges: [
        {
          requiredClusterPrivileges: ['manage'],
          ui: ['manageCluster'],
        },
      ],
    });

    serverless.setupProjectSettings(SEARCH_PROJECT_SETTINGS);
    return {};
  }

  public start(core: CoreStart, { dataViews }: StartDependencies) {
    this.createDefaultDataView(core, dataViews).catch(() => {});
    return {};
  }

  public stop() {}
}
