/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CoreSetup,
  CoreStart,
  KibanaRequest,
  Logger,
  Plugin,
  PluginInitializerContext,
  SavedObjectsClientContract,
  SavedObjectsServiceStart,
} from '@kbn/core/server';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import { ApiPrivileges } from '@kbn/core-security-server';

import type { SearchInferenceEndpointsConfig } from './config';
import { DynamicConnectorsPoller } from './lib/dynamic_connectors';
import { defineRoutes } from './routes';
import { InferenceFeatureRegistry } from './inference_feature_registry';
import { getForFeature as getForFeatureFn } from './inference_endpoints';
import { resolveModelsForFeature } from './lib/resolve_models_for_feature';
import { createInferenceSettingsSavedObjectType } from './saved_objects/inference_settings';
import type {
  SearchInferenceEndpointsPluginSetup,
  SearchInferenceEndpointsPluginSetupDependencies,
  SearchInferenceEndpointsPluginStart,
  SearchInferenceEndpointsPluginStartDependencies,
} from './types';
import {
  DYNAMIC_CONNECTORS_POLLING_START_DELAY,
  ELASTIC_INFERENCE_SERVICE_APP_ID,
  INFERENCE_ENDPOINTS_APP_ID,
  INFERENCE_SETTINGS_SO_TYPE,
  MODEL_SETTINGS_APP_ID,
  PLUGIN_ID,
  PLUGIN_NAME,
} from '../common/constants';

// Model settings are admin policy that must apply to every user, including those
// without read access to the settings saved object, so the read bypasses user authz
// while staying scoped to the request's active space.
const getInferenceSettingsClient = (
  savedObjects: SavedObjectsServiceStart,
  request: KibanaRequest
): SavedObjectsClientContract => {
  const internalClient = savedObjects.getUnsafeInternalClient({
    includedHiddenTypes: [INFERENCE_SETTINGS_SO_TYPE],
  });
  const namespace = savedObjects.getScopedClient(request).getCurrentNamespace();
  return namespace ? internalClient.asScopedToNamespace(namespace) : internalClient;
};

export class SearchInferenceEndpointsPlugin
  implements
    Plugin<
      SearchInferenceEndpointsPluginSetup,
      SearchInferenceEndpointsPluginStart,
      SearchInferenceEndpointsPluginSetupDependencies,
      SearchInferenceEndpointsPluginStartDependencies
    >
{
  private readonly logger: Logger;
  private readonly config: SearchInferenceEndpointsConfig;
  private dynamicConnectorsPoller?: DynamicConnectorsPoller;
  private readonly featureRegistry: InferenceFeatureRegistry;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
    this.config = initializerContext.config.get<SearchInferenceEndpointsConfig>();
    this.featureRegistry = new InferenceFeatureRegistry(this.logger);
  }

  public setup(
    core: CoreSetup<
      SearchInferenceEndpointsPluginStartDependencies,
      SearchInferenceEndpointsPluginStart
    >,
    plugins: SearchInferenceEndpointsPluginSetupDependencies
  ) {
    this.logger.debug('searchInferenceEndpoints: Setup');
    const router = core.http.createRouter();

    core.savedObjects.registerType(createInferenceSettingsSavedObjectType());

    const featureRegistry = this.featureRegistry;

    const getForFeature = async (featureId: string, request: KibanaRequest) => {
      const [coreStart, pluginsStart] = await core.getStartServices();
      const soClient = getInferenceSettingsClient(coreStart.savedObjects, request);
      const getConnectorById = (id: string) => pluginsStart.inference.getConnectorById(id, request);
      return getForFeatureFn(featureRegistry, soClient, getConnectorById, featureId, this.logger);
    };

    const getConnectorList = async (request: KibanaRequest) => {
      const [, pluginsStart] = await core.getStartServices();
      return pluginsStart.inference.getConnectorList(request);
    };

    const getConnectorById = async (id: string, request: KibanaRequest) => {
      const [, pluginsStart] = await core.getStartServices();
      return pluginsStart.inference.getConnectorById(id, request);
    };

    defineRoutes({
      logger: this.logger,
      router,
      featureRegistry: this.featureRegistry,
      getForFeature,
      getConnectorList,
      getConnectorById,
    });

    plugins.features.registerKibanaFeature({
      id: PLUGIN_ID,
      minimumLicense: 'enterprise',
      name: PLUGIN_NAME,
      order: 4000,
      category: DEFAULT_APP_CATEGORIES.management,
      app: [],
      catalogue: [],
      management: {
        modelManagement: [
          ELASTIC_INFERENCE_SERVICE_APP_ID,
          INFERENCE_ENDPOINTS_APP_ID,
          MODEL_SETTINGS_APP_ID,
        ],
      },
      privileges: {
        all: {
          app: [],
          api: [ApiPrivileges.manage(PLUGIN_ID)],
          catalogue: [],
          management: {
            modelManagement: [
              ELASTIC_INFERENCE_SERVICE_APP_ID,
              INFERENCE_ENDPOINTS_APP_ID,
              MODEL_SETTINGS_APP_ID,
            ],
          },
          savedObject: {
            all: [INFERENCE_SETTINGS_SO_TYPE],
            read: [],
          },
          ui: [],
        },
        read: {
          disabled: true,
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        },
      },
    });

    return {
      features: {
        register: this.featureRegistry.register.bind(this.featureRegistry),
      },
    };
  }

  public start(core: CoreStart, plugins: SearchInferenceEndpointsPluginStartDependencies) {
    if (this.config.dynamicConnectors.enabled) {
      this.logger.debug(
        `dynamic connectors enabled: ${this.config.dynamicConnectors.enabled} - polling ${this.config.dynamicConnectors.pollingIntervalMins} mins`
      );
      this.dynamicConnectorsPoller = new DynamicConnectorsPoller(
        this.logger,
        plugins.actions,
        core.elasticsearch.client.asInternalUser,
        this.config.dynamicConnectors.pollingIntervalMins
      );

      setTimeout(() => {
        this.dynamicConnectorsPoller?.start();
      }, DYNAMIC_CONNECTORS_POLLING_START_DELAY);
    }

    const featureRegistry = this.featureRegistry;

    return {
      features: {
        get: featureRegistry.get.bind(featureRegistry),
        getAll: featureRegistry.getAll.bind(featureRegistry),
        register: featureRegistry.register.bind(featureRegistry),
      },
      endpoints: {
        getForFeature: async (featureId: string, request: KibanaRequest) => {
          const soClient = getInferenceSettingsClient(core.savedObjects, request);
          const getConnectorById = (id: string) => plugins.inference.getConnectorById(id, request);
          const uiSettingsClient = core.uiSettings.asScopedToClient(
            core.savedObjects.getScopedClient(request)
          );
          const getConnectorById = (id: string) => plugins.inference.getConnectorById(id, request);
          const resolveFeatureEndpoints = (fId: string) =>
            getForFeatureFn(featureRegistry, soClient, getConnectorById, fId, this.logger);
          const getConnectorList = () => plugins.inference.getConnectorList(request);

          const result = await resolveModelsForFeature({
            getForFeature: resolveFeatureEndpoints,
            getConnectorList,
            getConnectorById,
            uiSettingsClient,
            featureId,
            logger: this.logger,
          });

          return {
            endpoints: result.connectors,
            warnings: result.warnings,
            soEntryFound: result.soEntryFound,
          };
        },
      },
    };
  }

  public stop() {
    if (this.dynamicConnectorsPoller) {
      const dynamicConnectorsPoller = this.dynamicConnectorsPoller;
      this.dynamicConnectorsPoller = undefined;
      dynamicConnectorsPoller.stop();
    }
  }
}
