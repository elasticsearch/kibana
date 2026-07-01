/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/server';
import { SavedObjectsClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type {
  BoundInferenceClient,
  InferenceClient,
  AnonymizationRule,
  ChatCompleteAnonymizationTarget,
  AnonymizationSettings,
} from '@kbn/inference-common';
import { aiAnonymizationSettings } from '@kbn/inference-common';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { InferenceTaskType } from '@elastic/elasticsearch/lib/api/types';
import { GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING } from '@kbn/management-settings-ids';
import {
  createClient as createInferenceClient,
  createClientWithoutRequest,
  createChatModel,
} from './inference_client';
import { RegexWorkerService } from './chat_complete/anonymization/regex_worker_service';
import { registerRoutes } from './routes';
import type { InferenceConfig } from './config';
import type {
  InferenceBoundClientCreateOptions,
  InferenceClientCreateOptions,
  InferenceServerSetup,
  InferenceServerStart,
  InferenceSetupDependencies,
  InferenceStartDependencies,
} from './types';
import { getUiSettings } from '../common/ui_settings';
import { getConnectorList } from './util/get_connector_list';
import { loadDefaultConnector } from './util/load_default_connector';
import { getConnectorById, getConnectorByIdWithoutClientRequest } from './util/get_connector_by_id';
import { getInferenceEndpoints } from './util/get_inference_endpoints';
import { getInferenceEndpointById } from './util/get_inference_endpoint_by_id';
import { InferenceEndpointIdCache } from './util/inference_endpoint_id_cache';
import { TokenUsageLogger } from './token_usage';
import { installTokenUsageDashboard } from './dashboard';

const parseLegacyAnonymizationRules = (value: unknown): AnonymizationRule[] => {
  let parsed: unknown = value;

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as AnonymizationSettings).rules)
  ) {
    return [];
  }

  const allRules = (parsed as AnonymizationSettings).rules;
  const enabledRules = allRules.filter((rule) => rule.enabled);
  return enabledRules;
};

export const resolveReplacementsEncryptionKey = async ({
  namespace,
  anonymizationEnabled,
  policyService,
}: {
  namespace: string;
  anonymizationEnabled: boolean;
  policyService?: {
    getReplacementsEncryptionKey: (targetNamespace: string) => Promise<string>;
  };
}): Promise<string | undefined> => {
  if (!anonymizationEnabled || !policyService) {
    return undefined;
  }

  return policyService.getReplacementsEncryptionKey(namespace);
};

export class InferencePlugin
  implements
    Plugin<
      InferenceServerSetup,
      InferenceServerStart,
      InferenceSetupDependencies,
      InferenceStartDependencies
    >
{
  private logger: Logger;
  private config: InferenceConfig;
  private regexWorker?: RegexWorkerService;
  private endpointIdCache: InferenceEndpointIdCache;
  private tokenUsageLogger: TokenUsageLogger;

  constructor(context: PluginInitializerContext<InferenceConfig>) {
    this.logger = context.logger.get();
    this.config = context.config.get<InferenceConfig>();
    this.endpointIdCache = new InferenceEndpointIdCache();
    this.tokenUsageLogger = new TokenUsageLogger(this.logger);
  }
  setup(
    coreSetup: CoreSetup<InferenceStartDependencies, InferenceServerStart>,
    pluginsSetup: InferenceSetupDependencies
  ): InferenceServerSetup {
    coreSetup.uiSettings.register(getUiSettings());
    const router = coreSetup.http.createRouter();

    registerRoutes({
      router,
      coreSetup,
      logger: this.logger,
    });

    return {};
  }

  start(core: CoreStart, pluginsStart: InferenceStartDependencies): InferenceServerStart {
    const anonymizationEnabled = pluginsStart.anonymization?.isEnabled() ?? false;
    this.endpointIdCache.setEsClient(core.elasticsearch.client.asInternalUser);
    this.tokenUsageLogger.setEsClient(core.elasticsearch.client.asInternalUser);

    const installDashboardIfTokenUsageTrackingEnabled = async () => {
      const internalRepository = core.savedObjects.createInternalRepository();
      const internalClient = new SavedObjectsClient(internalRepository);
      const uiSettingsClient = core.uiSettings.asScopedToClient(internalClient);
      const isEnabled = await uiSettingsClient.get<boolean>(GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING);
      if (!isEnabled) {
        return;
      }
      const savedObjectsImporter = core.savedObjects.createImporter(internalClient);
      await installTokenUsageDashboard(savedObjectsImporter, this.logger);
    };

    installDashboardIfTokenUsageTrackingEnabled().catch((e) => {
      this.logger.error(`Failed to install token usage dashboard: ${e.message}`);
    });

    if (anonymizationEnabled) {
      this.logger.info(
        'Persistent anonymization replacements key material is auto-managed per space via the anonymization plugin'
      );
    }

    this.regexWorker = new RegexWorkerService(
      this.config.workers.anonymization,
      this.logger.get('regex_worker')
    );

    const createAnonymizationRulesPromise = async (request: KibanaRequest) => {
      const namespace =
        core.savedObjects.getScopedClient(request).getCurrentNamespace() ?? 'default';
      const scopedSavedObjectsClient = core.savedObjects.getScopedClient(request);
      const uiSettingsClient = core.uiSettings.asScopedToClient(scopedSavedObjectsClient);
      const policyService = pluginsStart.anonymization?.getPolicyService();

      const getLegacyRules = async (): Promise<AnonymizationRule[]> => {
        const legacySettings = await uiSettingsClient.get<unknown>(aiAnonymizationSettings);
        const parsedRules = parseLegacyAnonymizationRules(legacySettings);
        return parsedRules;
      };

      if (!anonymizationEnabled || !policyService) {
        return getLegacyRules();
      }

      await policyService.ensureGlobalProfile(namespace);
      const globalProfile = await policyService.getGlobalProfile(namespace);
      if (!globalProfile) {
        return [];
      }

      const regexRules: AnonymizationRule[] = globalProfile.rules.regexRules.map((rule) => ({
        type: 'RegExp',
        enabled: rule.enabled,
        pattern: rule.pattern,
        entityClass: rule.entityClass,
      }));
      const nerRules: AnonymizationRule[] = globalProfile.rules.nerRules.map((rule) => ({
        type: 'NER',
        enabled: rule.enabled,
        modelId: rule.modelId,
        allowedEntityClasses: rule.allowedEntityClasses,
      }));

      return [...regexRules, ...nerRules];
    };

    const getAnonymizationOptions = (request: KibanaRequest) => {
      const namespace =
        core.savedObjects.getScopedClient(request).getCurrentNamespace() ?? 'default';
      const policyService = pluginsStart.anonymization?.getPolicyService();
      const replacementsEncryptionKeyPromise = resolveReplacementsEncryptionKey({
        namespace,
        anonymizationEnabled,
        policyService,
      });
      return {
        namespace,
        anonymizationRulesPromise: createAnonymizationRulesPromise(request),
        regexWorker: (() => {
          if (!this.regexWorker) {
            this.logger.error(
              'RegexWorkerService is not initialized — Anonymization plugin.start() may not have completed'
            );
          }
          return this.regexWorker!;
        })(),
        esClient: core.elasticsearch.client.asScoped(request).asCurrentUser,
        anonymization: {
          saltPromise: anonymizationEnabled ? policyService?.getSalt(namespace) : undefined,
          resolveEffectivePolicy: async (target?: ChatCompleteAnonymizationTarget) => {
            if (!anonymizationEnabled || !policyService || !target) {
              return undefined;
            }
            return policyService.resolveEffectivePolicy(namespace, {
              type: target.targetType,
              id: target.targetId,
            });
          },
          replacements: {
            esClient: core.elasticsearch.client.asInternalUser,
            encryptionKeyPromise: replacementsEncryptionKeyPromise,
            usePersistentReplacements: anonymizationEnabled,
            requireEncryptionKey: anonymizationEnabled,
          },
        },
      };
    };

    const createTokenUsageTrackingEnabledCheck = (request: KibanaRequest) => {
      return async () => {
        try {
          const scopedSavedObjectsClient = core.savedObjects.getScopedClient(request);
          const uiSettingsClient = core.uiSettings.asScopedToClient(scopedSavedObjectsClient);
          return await uiSettingsClient.get<boolean>(GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING);
        } catch (e) {
          return false;
        }
      };
    };

    return {
      getClient: <T extends InferenceClientCreateOptions>(options: T) => {
        return createInferenceClient({
          ...options,
          ...getAnonymizationOptions(options.request),
          actions: pluginsStart.actions,
          logger: this.logger.get('client'),
          esClient: core.elasticsearch.client.asScoped(options.request).asCurrentUser,
          endpointIdCache: this.endpointIdCache,
          tokenUsageLogger: this.tokenUsageLogger,
          isTokenUsageTrackingEnabled: createTokenUsageTrackingEnabledCheck(options.request),
        }) as T extends InferenceBoundClientCreateOptions ? BoundInferenceClient : InferenceClient;
      },

      getChatModel: async (options) => {
        return createChatModel({
          request: options.request,
          connectorId: options.connectorId,
          chatModelOptions: options.chatModelOptions,
          callbacks: options.callbacks,
          ...getAnonymizationOptions(options.request),
          actions: pluginsStart.actions,
          anonymizationRulesPromise: createAnonymizationRulesPromise(options.request),
          regexWorker: this.regexWorker!,
          esClient: core.elasticsearch.client.asScoped(options.request).asCurrentUser,
          endpointIdCache: this.endpointIdCache,
          logger: this.logger,
          tokenUsageLogger: this.tokenUsageLogger,
          isTokenUsageTrackingEnabled: createTokenUsageTrackingEnabledCheck(options.request),
        });
      },

      getConnectorList: async (request: KibanaRequest) => {
        const esClient = core.elasticsearch.client.asScoped(request).asCurrentUser;
        return getConnectorList({
          actions: pluginsStart.actions,
          request,
          esClient,
          logger: this.logger,
        });
      },
      getDefaultConnector: async (request: KibanaRequest) => {
        const esClient = core.elasticsearch.client.asScoped(request).asCurrentUser;
        const scopedSavedObjectsClient = core.savedObjects.getScopedClient(request);
        const uiSettingsClient = core.uiSettings.asScopedToClient(scopedSavedObjectsClient);
        return loadDefaultConnector({
          actions: pluginsStart.actions,
          request,
          esClient,
          uiSettingsClient,
          logger: this.logger,
        });
      },
      getConnectorById: async (id: string, request: KibanaRequest) => {
        const esClient = core.elasticsearch.client.asScoped(request).asCurrentUser;
        return getConnectorById({
          connectorId: id,
          actions: pluginsStart.actions,
          request,
          esClient,
          logger: this.logger,
        });
      },
      getClientWithoutRequest: (actionsClient, esClient) => {
        return createClientWithoutRequest({
          actionsClient,
          logger: this.logger,
          regexWorker: this.regexWorker!,
          esClient,
          endpointIdCache: this.endpointIdCache,
        });
      },
      getConnectorByIdWithoutClientRequest: async (id, actionsClient, esClient) => {
        return getConnectorByIdWithoutClientRequest({
          connectorId: id,
          actionsClient,
          esClient,
          logger: this.logger,
        });
      },
      getInferenceEndpoints: async (taskType?: InferenceTaskType) => {
        const esClient = core.elasticsearch.client.asInternalUser;
        return getInferenceEndpoints({ esClient, taskType });
      },
      getInferenceEndpointById: async (inferenceId: string) => {
        const esClient = core.elasticsearch.client.asInternalUser;
        return getInferenceEndpointById({ inferenceId, esClient });
      },
      installTokenUsageDashboard: async () => {
        const internalRepository = core.savedObjects.createInternalRepository();
        const internalClient = new SavedObjectsClient(internalRepository);
        const savedObjectsImporter = core.savedObjects.createImporter(internalClient);
        await installTokenUsageDashboard(savedObjectsImporter, this.logger);
      },
    };
  }

  async stop() {
    await this.regexWorker?.stop();
  }
}
