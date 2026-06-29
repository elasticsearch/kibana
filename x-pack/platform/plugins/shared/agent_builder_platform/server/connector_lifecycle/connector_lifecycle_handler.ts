/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AttachmentType } from '@kbn/agent-builder-common/attachments';
import type { Logger } from '@kbn/logging';
import {
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
  CONTEXT_ENGINE_ENABLED_SETTING_ID,
} from '@kbn/management-settings-ids';
import type {
  ConnectorLifecyclePostCreateParams,
  ConnectorLifecyclePostDeleteParams,
} from '@kbn/actions-plugin/server';
import type { CoreStart } from '@kbn/core/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { AgentContextLayerPluginStart } from '@kbn/agent-context-layer-plugin/server';

interface ConnectorLifecycleHandlerDeps {
  logger: Logger;
  getStartServices: () => Promise<
    [
      CoreStart,
      { spaces?: SpacesPluginStart; agentContextLayer: AgentContextLayerPluginStart },
      unknown
    ]
  >;
}

export function createConnectorLifecycleHandler(deps: ConnectorLifecycleHandlerDeps) {
  const { logger, getStartServices } = deps;

  return {
    async onPostCreate(params: ConnectorLifecyclePostCreateParams): Promise<void> {
      if (!params.wasSuccessful) {
        logger.debug(
          `Connector lifecycle: onPostCreate called with wasSuccessful=false for connector ${params.connectorId}`
        );
        return;
      }

      const { connectorId, connectorType } = params;

      try {
        const [coreStart, startDeps] = await getStartServices();
        const request = params.request;
        const soClient = coreStart.savedObjects.getScopedClient(request);
        const uiSettingsClient = coreStart.uiSettings.asScopedToClient(soClient);
        // SML ingest lives in the Agent Builder family, so crawling connectors
        // into SML requires both the Agent Builder experimental flag and the
        // dedicated Context Engine flag. Both must be enabled.
        const [isExperimentalEnabled, isContextEngineEnabled] = await Promise.all([
          uiSettingsClient.get<boolean>(AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID),
          uiSettingsClient.get<boolean>(CONTEXT_ENGINE_ENABLED_SETTING_ID),
        ]);
        if (!isExperimentalEnabled || !isContextEngineEnabled) return;

        try {
          await startDeps.agentContextLayer.indexAttachment({
            request,
            originId: connectorId,
            attachmentType: AttachmentType.connector,
            action: 'create',
            includedHiddenTypes: ['action'],
          });
          logger.info(`Connector lifecycle: indexed connector ${connectorId} into SML`);
        } catch (smlError) {
          logger.warn(
            `Connector lifecycle: failed to index connector ${connectorId} into SML: ${
              (smlError as Error).message
            }`
          );
        }
      } catch (error) {
        logger.error(
          `Connector lifecycle: failed to handle post-create for connector ${connectorId} (type: ${connectorType}): ${
            (error as Error).message
          }`
        );
      }
    },

    async onPostDelete(params: ConnectorLifecyclePostDeleteParams): Promise<void> {
      const { connectorId, connectorType } = params;

      logger.info(
        `Connector lifecycle: cleaning up deleted connector ${connectorId} (type: ${connectorType})`
      );

      try {
        const [, startDeps] = await getStartServices();
        const request = params.request;

        try {
          await startDeps.agentContextLayer.indexAttachment({
            request,
            originId: connectorId,
            attachmentType: AttachmentType.connector,
            action: 'delete',
          });
          logger.info(`Connector lifecycle: removed connector ${connectorId} from SML`);
        } catch (smlError) {
          logger.warn(
            `Connector lifecycle: failed to remove connector ${connectorId} from SML: ${
              (smlError as Error).message
            }`
          );
        }
      } catch (error) {
        logger.error(
          `Connector lifecycle: failed to clean up for connector ${connectorId}: ${
            (error as Error).message
          }`
        );
      }
    },
  };
}
