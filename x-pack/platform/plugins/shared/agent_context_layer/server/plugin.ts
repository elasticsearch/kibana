/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID } from '@kbn/management-settings-ids';
import type {
  AgentContextLayerPluginSetup,
  AgentContextLayerPluginStart,
  AgentContextLayerSetupDependencies,
  AgentContextLayerStartDependencies,
} from './types';
import { registerFeatures } from './features';
import { registerSearchRoute } from './routes/search';
import { registerGetRoute } from './routes/get';
import { registerListRoute } from './routes/list';
import { registerUpsertRoute } from './routes/upsert';
import { registerDeleteRoute } from './routes/delete';
import { registerAutocompleteRoute } from './routes/autocomplete';
import { createSmlService, type SmlServiceInstance } from './services/sml/sml_service';
import {
  registerSmlCrawlerTaskDefinition,
  scheduleSmlCrawlerTasks,
} from './services/sml/sml_task_definitions';
import { resolveSmlAttachItems } from './services/sml/execute_sml_attach_items';
import type { SmlService } from './services/sml/types';
import { registerAgentContextLayerWorkflowSteps } from './workflow_steps';
import { corpusEntrySmlType } from './sml_types/corpus_entry';

export class AgentContextLayerPlugin
  implements
    Plugin<
      AgentContextLayerPluginSetup,
      AgentContextLayerPluginStart,
      AgentContextLayerSetupDependencies,
      AgentContextLayerStartDependencies
    >
{
  private logger: Logger;
  private smlServiceInstance: SmlServiceInstance;
  private smlService?: SmlService;
  private startContract?: AgentContextLayerPluginStart;
  private spaces?: AgentContextLayerStartDependencies['spaces'];
  private security?: AgentContextLayerStartDependencies['security'];
  private coreStart?: CoreStart;

  constructor(context: PluginInitializerContext) {
    this.logger = context.logger.get();
    this.smlServiceInstance = createSmlService();
  }

  setup(
    coreSetup: CoreSetup<AgentContextLayerStartDependencies, AgentContextLayerPluginStart>,
    setupDeps: AgentContextLayerSetupDependencies
  ): AgentContextLayerPluginSetup {
    registerFeatures({ features: setupDeps.features });

    const smlSetup = this.smlServiceInstance.setup({ logger: this.logger.get('sml') });

    // Register the neutral 'corpus_entry' SML type so workflow authors can sink
    // ad-hoc / eval documents via contextEngine.addEntry without reusing a
    // solution-owned type.
    smlSetup.registerType(corpusEntrySmlType);

    registerSmlCrawlerTaskDefinition({
      taskManager: setupDeps.taskManager,
      getCrawlerDeps: async () => {
        const [coreStart] = await coreSetup.getStartServices();
        if (!this.smlService) {
          throw new Error('getCrawlerDeps called before service start');
        }
        return {
          smlService: this.smlService,
          elasticsearch: coreStart.elasticsearch,
          savedObjects: coreStart.savedObjects,
          uiSettings: coreStart.uiSettings,
          logger: this.logger.get('sml'),
        };
      },
    });

    const getSmlService = (): SmlService => {
      if (!this.smlService) {
        throw new Error('SML service not available — plugin has not started');
      }
      return this.smlService;
    };

    const router = coreSetup.http.createRouter();
    registerSearchRoute({
      router,
      coreSetup,
      logger: this.logger,
      getSmlService,
    });
    registerGetRoute({ router, coreSetup, logger: this.logger, getSmlService });
    registerListRoute({ router, coreSetup, logger: this.logger, getSmlService });
    registerUpsertRoute({ router, coreSetup, logger: this.logger, getSmlService });
    registerDeleteRoute({ router, coreSetup, logger: this.logger, getSmlService });
    registerAutocompleteRoute({
      router,
      coreSetup,
      logger: this.logger,
      getSmlService,
    });

    if (setupDeps.workflowsExtensions) {
      registerAgentContextLayerWorkflowSteps({
        workflowsExtensions: setupDeps.workflowsExtensions,
        getStartContract: () => {
          if (!this.startContract) {
            throw new Error(
              'Agent Context Layer start contract is not available — plugin has not started'
            );
          }
          return this.startContract;
        },
        getSpaces: () => this.spaces,
        getSecurity: () => this.security,
        isFeatureEnabled: async (request) => {
          // Mirrors `withSmlFeatureFlag` (HTTP routes) and the per-run
          // check inside the SML crawler task. Request-scoped so per-space
          // overrides of the experimental setting are honored.
          if (!this.coreStart) {
            throw new Error('Agent Context Layer feature-flag check called before plugin start');
          }
          const soClient = this.coreStart.savedObjects.getScopedClient(request);
          const uiSettingsClient = this.coreStart.uiSettings.asScopedToClient(soClient);
          return uiSettingsClient.get<boolean>(AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID);
        },
      });
    }

    return {
      registerType: smlSetup.registerType,
    };
  }

  start(
    coreStart: CoreStart,
    { taskManager, spaces, security }: AgentContextLayerStartDependencies
  ): AgentContextLayerPluginStart {
    const { elasticsearch, savedObjects } = coreStart;

    this.smlService = this.smlServiceInstance.start({
      logger: this.logger.get('sml'),
      securityAuthz: security?.authz,
    });
    this.spaces = spaces;
    this.security = security;
    this.coreStart = coreStart;

    const smlService = this.smlService;

    scheduleSmlCrawlerTasks({
      taskManager,
      smlService,
      logger: this.logger.get('sml'),
    }).catch((error) => {
      this.logger.error(`Failed to schedule SML crawler tasks: ${error.message}`);
    });

    const startContract: AgentContextLayerPluginStart = {
      search: smlService.search,
      getDocuments: async ({ ids, request, spaceId }) => {
        if (ids.length === 0) {
          return new Map();
        }
        const resolvedSpaceId = spaceId ?? spaces?.spacesService?.getSpaceId(request) ?? 'default';
        const esClient = elasticsearch.client.asScoped(request);

        // Authorize IDs first, then fetch only the documents the user can access.
        // Unauthorized or missing IDs are absent from the returned map — callers
        // cannot distinguish "denied" from "not found", which is intentional to
        // avoid leaking existence of documents the user is not allowed to see.
        const accessMap = await smlService.checkItemsAccess({
          ids,
          spaceId: resolvedSpaceId,
          esClient,
          request,
        });
        const authorizedIds = ids.filter((id) => accessMap.get(id) === true);
        if (authorizedIds.length === 0) {
          return new Map();
        }
        return smlService.getDocuments({
          ids: authorizedIds,
          spaceId: resolvedSpaceId,
          esClient,
        });
      },
      getTypeDefinition: smlService.getTypeDefinition,
      resolveSmlAttachItems: (params) => resolveSmlAttachItems({ ...params, sml: smlService }),
      indexAttachment: async (params) => {
        const soClient = savedObjects.getScopedClient(params.request, {
          ...(params.includedHiddenTypes?.length
            ? { includedHiddenTypes: params.includedHiddenTypes }
            : {}),
        });
        const spaceId =
          params.spaceId ?? spaces?.spacesService?.getSpaceId(params.request) ?? 'default';
        const base = {
          originId: params.originId,
          attachmentType: params.attachmentType,
          action: params.action,
          spaces: [spaceId],
          esClient: elasticsearch.client.asInternalUser,
          savedObjectsClient: soClient,
          logger: this.logger.get('sml'),
        };
        if (params.content !== undefined) {
          return smlService.indexAttachment({ ...base, content: params.content });
        }
        return smlService.indexAttachment({ ...base, force: params.force });
      },
      deleteAttachment: async (params) => {
        const soClient = savedObjects.getScopedClient(params.request, {
          ...(params.includedHiddenTypes?.length
            ? { includedHiddenTypes: params.includedHiddenTypes }
            : {}),
        });
        const spaceId =
          params.spaceId ?? spaces?.spacesService?.getSpaceId(params.request) ?? 'default';
        return smlService.deleteAttachment({
          originId: params.originId,
          attachmentType: params.attachmentType,
          spaces: [spaceId],
          esClient: elasticsearch.client.asInternalUser,
          savedObjectsClient: soClient,
          logger: this.logger.get('sml'),
          ...(params.ingestionMethod !== undefined
            ? { ingestionMethod: params.ingestionMethod }
            : {}),
        });
      },
    };

    this.startContract = startContract;

    return startContract;
  }

  stop() {}
}
