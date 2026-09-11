/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CoreSetup,
  CoreStart,
  ElasticsearchClient,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { schema } from '@kbn/config-schema';
import { i18n } from '@kbn/i18n';
import { CONTEXT_ENGINE_FEEDBACK_LOOP_ENABLED_SETTING_ID } from '../common/constants';
import { apiPrivileges } from '../common/features';
import type {
  ContextEnginePluginSetup,
  ContextEnginePluginStart,
  ContextEngineSetupDependencies,
  ContextEngineStartDependencies,
} from './types';
import { registerFeatures } from './features';
import { registerAiIndexRoutes } from './routes/ai_indices';
import { registerSignalRoutes } from './routes/signals';
import { AiIndexService } from './ai_indices/service';
import { AiIndexRegistry } from './ai_indices/registry';
import { ImprovementsService } from './improvements/service';
import { installImprovementsIndexTemplate } from './improvements/storage';
import { SignalsService } from './signals/service';
import type { SignalsServiceApi } from './signals/service';
import { registerSignalGeneratorTaskDefinition, scheduleSignalGenerator } from './tasks';
import { createVerifyKiStepDefinition } from './step_types/verify_ki_step';
import { registerStepDefinitions } from './step_types';
import { ContextEngineAnalyticsService } from './telemetry';
import { isContextEngineEnabledInSpace } from './utils/is_context_engine_enabled_in_space';

export class ContextEnginePlugin
  implements
    Plugin<
      ContextEnginePluginSetup,
      ContextEnginePluginStart,
      ContextEngineSetupDependencies,
      ContextEngineStartDependencies
    >
{
  private logger: Logger;
  private aiIndexService?: AiIndexService;
  private signalsService?: SignalsService;
  private createImprovementsService?: (esClient: ElasticsearchClient) => ImprovementsService;
  private esClient?: ElasticsearchClient;
  private isFeedbackLoopEnabled: () => Promise<boolean> = async () => false;
  private readonly aiIndexRegistry = new AiIndexRegistry();
  private analyticsService?: ContextEngineAnalyticsService;

  constructor(context: PluginInitializerContext) {
    this.logger = context.logger.get();
  }

  setup(
    coreSetup: CoreSetup<ContextEngineStartDependencies, ContextEnginePluginStart>,
    setupDeps: ContextEngineSetupDependencies
  ): ContextEnginePluginSetup {
    registerFeatures({ features: setupDeps.features });

    this.analyticsService = new ContextEngineAnalyticsService(
      coreSetup.analytics,
      this.logger.get('telemetry')
    );
    this.analyticsService.registerContextEngineEventTypes();
    const analyticsService = this.analyticsService;

    setupDeps.workflowsExtensions.registerStepDefinition(
      createVerifyKiStepDefinition(coreSetup, this.logger.get('context_steps'), analyticsService)
    );

    coreSetup.uiSettings.registerGlobal({
      [CONTEXT_ENGINE_FEEDBACK_LOOP_ENABLED_SETTING_ID]: {
        name: i18n.translate('xpack.contextEngine.uiSettings.feedbackLoop.name', {
          defaultMessage: 'Context Engine feedback loop',
        }),
        description: i18n.translate('xpack.contextEngine.uiSettings.feedbackLoop.description', {
          defaultMessage:
            'Generates classified signals from Agent Builder traces to power the Context Engine feedback loop.',
        }),
        schema: schema.boolean(),
        value: false,
        experimental: true,
        requiresPageReload: false,
        readonly: false,
      },
    });

    registerSignalGeneratorTaskDefinition({
      taskManager: setupDeps.taskManager,
      getEsClient: () => {
        if (!this.esClient) {
          throw new Error('Elasticsearch client not available — plugin has not started');
        }
        return this.esClient;
      },
      getSignalsService: (): SignalsServiceApi => {
        if (!this.signalsService) {
          throw new Error('Signals service not available — plugin has not started');
        }
        return this.signalsService;
      },
      getFeedbackLoopEnabled: () => this.isFeedbackLoopEnabled(),
      logger: this.logger.get('signal_generator'),
    });

    const router = coreSetup.http.createRouter();
    registerAiIndexRoutes({
      router,
      logger: this.logger.get('routes'),
      getAiIndexService: () => {
        if (!this.aiIndexService) {
          throw new Error('AI index service not available — plugin has not started');
        }
        return this.aiIndexService;
      },
      getImprovementsService: (esClient) => {
        if (!this.createImprovementsService) {
          throw new Error('Improvements service not available — plugin has not started');
        }
        return this.createImprovementsService(esClient);
      },
      getActions: async () => {
        const [, startDeps] = await coreSetup.getStartServices();
        return startDeps.actions;
      },
      getSpaces: async () => {
        const [, startDeps] = await coreSetup.getStartServices();
        return startDeps.spaces;
      },
    });

    registerStepDefinitions({
      workflowsExtensions: setupDeps.workflowsExtensions,
      analyticsService,
      logger: this.logger.get('context_steps'),
      getAiIndexService: () => {
        if (!this.aiIndexService) {
          throw new Error('AI index service not available — plugin has not started');
        }
        return this.aiIndexService;
      },
      isContextEngineEnabled: async (spaceId) => {
        const [coreStart] = await coreSetup.getStartServices();
        return isContextEngineEnabledInSpace({
          savedObjects: coreStart.savedObjects,
          uiSettings: coreStart.uiSettings,
          spaceId,
        });
      },
      checkWritePrivilege: async (request, spaceId) => {
        const [, startDeps] = await coreSetup.getStartServices();
        const { security } = startDeps;
        if (!security) {
          return true;
        }
        const { hasAllRequested } = await security.authz
          .checkPrivilegesWithRequest(request)
          .atSpace(spaceId, {
            kibana: [security.authz.actions.api.get(apiPrivileges.writeContextEngine)],
          });
        return hasAllRequested;
      },
    });

    // Read-only Signals routes (reads run as the current user, scoped to the active space).
    registerSignalRoutes({
      router,
      getSpaces: async () => {
        const [, startDeps] = await coreSetup.getStartServices();
        return startDeps.spaces;
      },
      // Reads the current value at request time (assigned in start(), after this setup() runs).
      getFeedbackLoopEnabled: () => this.isFeedbackLoopEnabled(),
    });

    return {
      registerAiIndex: (id, properties) => this.aiIndexRegistry.register(id, properties),
    };
  }

  start(coreStart: CoreStart, startDeps: ContextEngineStartDependencies): ContextEnginePluginStart {
    this.aiIndexRegistry.freeze();
    const aiIndexLogger = this.logger.get('ai_indices');

    this.esClient = coreStart.elasticsearch.client.asInternalUser;

    const ensureAiIndex = async (id: string, spaceId: string): Promise<void> => {
      const enabled = await isContextEngineEnabledInSpace({
        savedObjects: coreStart.savedObjects,
        uiSettings: coreStart.uiSettings,
        spaceId,
      });
      if (!enabled) {
        return;
      }
      if (!this.aiIndexService) {
        throw new Error('AI index service not available — plugin has not started');
      }
      await this.aiIndexRegistry.ensure({
        id,
        spaceId,
        aiIndexService: this.aiIndexService,
        logger: aiIndexLogger,
      });
    };

    this.aiIndexService = new AiIndexService({
      esClient: this.esClient,
      logger: aiIndexLogger,
      managedBootstrap: {
        isManaged: (id) => this.aiIndexRegistry.has(id),
        getManagedIds: () => this.aiIndexRegistry.getManagedIds(),
        ensure: ensureAiIndex,
      },
    });

    this.signalsService = new SignalsService({
      esClient: this.esClient,
      logger: this.logger.get('signals'),
    });
    const signalsService = this.signalsService;

    const improvementsLogger = this.logger.get('improvements');
    this.createImprovementsService = (esClient: ElasticsearchClient) =>
      new ImprovementsService({ esClient, logger: improvementsLogger });
    const createImprovementsService = this.createImprovementsService;

    // Installed as Kibana, with the cluster privilege it already holds. The index is left for the
    // first user write to create from it, so the store needs no grant on the internal user.
    installImprovementsIndexTemplate({
      esClient: this.esClient,
      logger: improvementsLogger,
    }).catch((err) => {
      improvementsLogger.warn(
        `Failed to install the improvements index template: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    });

    const soClient = coreStart.savedObjects.createInternalRepository();
    const globalUiSettings = coreStart.uiSettings.globalAsScopedToClient(soClient);

    this.isFeedbackLoopEnabled = async () =>
      (await globalUiSettings.get<boolean>(CONTEXT_ENGINE_FEEDBACK_LOOP_ENABLED_SETTING_ID)) ??
      false;

    scheduleSignalGenerator({ taskManager: startDeps.taskManager }).catch((err) => {
      this.logger.warn(
        `Failed to schedule signal generator: ${err instanceof Error ? err.message : String(err)}`
      );
    });

    return {
      getAiIndexService: () => {
        if (!this.aiIndexService) {
          throw new Error('AI index service not available — plugin has not started');
        }
        return this.aiIndexService;
      },
      ensureAiIndex,
      getSignalsService: () => signalsService,
      getImprovementsService: (esClient) => createImprovementsService(esClient),
    };
  }

  stop() {}
}
