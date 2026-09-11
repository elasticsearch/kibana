/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { agentBuilderDefaultAiIndexId } from '@kbn/agent-builder-common';
import type {
  AgentBuilderSmlPluginSetup,
  AgentBuilderSmlPluginStart,
  AgentBuilderSmlSetupDependencies,
  AgentBuilderSmlStartDependencies,
} from './types';
import { registerFeatures } from './features';
import { registerUISettings } from './ui_settings';
import { registerSearchRoute } from './routes/search';
import { registerAutocompleteRoute } from './routes/autocomplete';
import { createSmlService, type SmlServiceInstance } from './services/sml/sml_service';
import { smlAiIndexDescription, smlIndexName } from './services/sml/sml_storage';
import {
  registerSmlCrawlerTaskDefinition,
  scheduleSmlCrawlerTasks,
} from './services/sml/sml_task_definitions';
import { resolveSmlAttachItems } from './services/sml/execute_sml_attach_items';
import type { SmlService } from './services/sml/types';
import { buildIndexAttachment, buildDeleteAttachment } from './start_contract';

export class AgentBuilderSmlPlugin
  implements
    Plugin<
      AgentBuilderSmlPluginSetup,
      AgentBuilderSmlPluginStart,
      AgentBuilderSmlSetupDependencies,
      AgentBuilderSmlStartDependencies
    >
{
  private logger: Logger;
  private smlServiceInstance: SmlServiceInstance;
  private smlService?: SmlService;

  constructor(context: PluginInitializerContext) {
    this.logger = context.logger.get();
    this.smlServiceInstance = createSmlService();
  }

  setup(
    coreSetup: CoreSetup<AgentBuilderSmlStartDependencies, AgentBuilderSmlPluginStart>,
    setupDeps: AgentBuilderSmlSetupDependencies
  ): AgentBuilderSmlPluginSetup {
    registerFeatures({ features: setupDeps.features });
    registerUISettings({ uiSettings: coreSetup.uiSettings });

    const smlSetup = this.smlServiceInstance.setup({ logger: this.logger.get('sml') });

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
    registerAutocompleteRoute({
      router,
      coreSetup,
      logger: this.logger,
      getSmlService,
    });

    setupDeps.contextEngine?.registerAiIndex(agentBuilderDefaultAiIndexId, {
      description: smlAiIndexDescription,
      dest: { type: 'index', value: smlIndexName },
      automations: [],
      sources: [],
    });

    return {
      registerType: smlSetup.registerType,
    };
  }

  start(
    coreStart: CoreStart,
    { taskManager, spaces, security, contextEngine }: AgentBuilderSmlStartDependencies
  ): AgentBuilderSmlPluginStart {
    const { elasticsearch, savedObjects } = coreStart;

    this.smlService = this.smlServiceInstance.start({
      logger: this.logger.get('sml'),
      securityAuthz: security?.authz,
      ensureDefaultAiIndex: (spaceId: string) =>
        contextEngine?.ensureAiIndex?.(agentBuilderDefaultAiIndexId, spaceId) ?? Promise.resolve(),
    });

    const smlService = this.smlService;

    scheduleSmlCrawlerTasks({
      taskManager,
      smlService,
      logger: this.logger.get('sml'),
    }).catch((error) => {
      this.logger.error(`Failed to schedule SML crawler tasks: ${error.message}`);
    });

    const startContract: AgentBuilderSmlPluginStart = {
      search: smlService.search,
      getTypeDefinition: smlService.getTypeDefinition,
      resolveSmlAttachItems: (params) => resolveSmlAttachItems({ ...params, sml: smlService }),
      indexAttachment: buildIndexAttachment({
        smlService,
        elasticsearch,
        savedObjects,
        spaces,
        logger: this.logger.get('sml'),
      }),
      deleteAttachment: buildDeleteAttachment({
        smlService,
        elasticsearch,
        savedObjects,
        spaces,
        logger: this.logger.get('sml'),
      }),
    };

    return startContract;
  }

  stop() {}
}
