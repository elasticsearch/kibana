/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type { PluginConfig } from './config';
import type {
  PluginSetupDependencies,
  PluginStartDependencies,
  AgentBuilderPlatformPluginSetup,
  AgentBuilderPlatformPluginStart,
} from './types';
import { registerTools } from './tools';
import { registerAttachmentTypes } from './attachment_types';
import { registerSkills } from './skills';
import { createConnectorSmlType } from './sml_types/connector';
import { createConnectorLifecycleHandler } from './connector_lifecycle/connector_lifecycle_handler';
import { getTracingFeaturesEnabled } from './tracing/get_tracing_features_enabled';
import { syncTracingPlatformFeatures } from './tracing/sync_tracing_platform_features';

export class AgentBuilderPlatformPlugin
  implements
    Plugin<
      AgentBuilderPlatformPluginSetup,
      AgentBuilderPlatformPluginStart,
      PluginSetupDependencies,
      PluginStartDependencies
    >
{
  private logger: Logger;

  constructor(context: PluginInitializerContext<PluginConfig>) {
    this.logger = context.logger.get();
  }

  setup(
    coreSetup: CoreSetup<PluginStartDependencies, AgentBuilderPlatformPluginStart>,
    setupDeps: PluginSetupDependencies
  ): AgentBuilderPlatformPluginSetup {
    registerTools({
      coreSetup,
      setupDeps,
    });
    registerAttachmentTypes({
      coreSetup,
      setupDeps,
    });
    registerSkills(setupDeps.agentBuilder);

    const connectorSmlType = createConnectorSmlType({
      getActionSavedObjectsClient: async (request) => {
        const [coreStart] = await coreSetup.getStartServices();
        return coreStart.savedObjects.getScopedClient(request, { includedHiddenTypes: ['action'] });
      },
      logger: this.logger.get('sml-connector'),
    });
    setupDeps.agentContextLayer.registerType(connectorSmlType);

    const connectorLifecycleHandler = createConnectorLifecycleHandler({
      logger: this.logger.get('connector-lifecycle'),
      getStartServices: coreSetup.getStartServices,
    });

    setupDeps.actions.registerConnectorLifecycleListener({
      connectorTypes: '*',
      onPostCreate: connectorLifecycleHandler.onPostCreate,
      onPostDelete: connectorLifecycleHandler.onPostDelete,
    });

    return {};
  }

  start(coreStart: CoreStart): AgentBuilderPlatformPluginStart {
    void (async () => {
      try {
        const tracingFeaturesEnabled = await getTracingFeaturesEnabled(coreStart);

        await syncTracingPlatformFeatures({
          coreStart,
          logger: this.logger,
          enabled: tracingFeaturesEnabled,
        });
      } catch (error) {
        this.logger.error(
          `Failed to sync Agent Builder tracing platform features: ${(error as Error).message}`
        );
      }
    })();

    return {
      tracingFeatures: {
        sync: ({ enabled, spaceId }) =>
          syncTracingPlatformFeatures({
            coreStart,
            logger: this.logger,
            enabled,
            spaceId,
          }),
      },
    };
  }

  stop() {}
}
