/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { getToolResultId, createErrorResult } from '@kbn/agent-builder-server';
import { AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID } from '@kbn/management-settings-ids';
import { getConnectorSpec } from '@kbn/connector-specs';
import { isMcpConnector, MCP_CONNECTOR_TYPE_ID } from './types';
import type { ConnectorToolsOptions } from './types';

const schema = z.object({});

/**
 * Creates the list_connectors tool.
 *
 * Lists saved connector instances directly from the Actions client — id, name, type, and a
 * short description only, no sub-action details — so an agent can see what's available without
 * paying the token cost of every connector's full sub-action spec up front (use get_connector for
 * that, one connector at a time). Bypasses sml_search/sml_attach entirely. MCP connectors get a
 * synthesized entry (no @kbn/connector-specs lookup, no network call); get_connector fetches
 * their live tool list on demand. Other connector types without a registered
 * @kbn/connector-specs entry are omitted, since they can't be run via execute_connector_sub_action.
 */
export const createListConnectorsTool = ({
  getActions,
}: ConnectorToolsOptions): BuiltinToolDefinition<typeof schema> => ({
  id: platformCoreTools.listConnectors,
  type: ToolType.builtin,
  annotations: {
    title: 'List Connectors',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  description:
    'Lists saved connector instances directly (id, name, type, description) without first ' +
    'attaching a connector via sml_search/sml_attach. Call get_connector with a connectorId ' +
    'from this list to load its full sub-action spec before invoking it via ' +
    'execute_connector_sub_action.',
  schema,
  tags: ['connector'],
  excludeFromMcp: true,
  availability: {
    cacheMode: 'global',
    handler: async ({ uiSettings }) => {
      const enabled = await uiSettings.get<boolean>(AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID);
      return enabled
        ? { status: 'available' }
        : {
            status: 'unavailable',
            reason: 'Connector tools require Agent Builder experimental features to be enabled',
          };
    },
  },
  handler: async (_input, { request, logger, agentConfiguration }) => {
    try {
      const actions = await getActions();
      const actionsClient = await actions.getActionsClientWithRequest(request);
      const allConnectors = await actionsClient.getAll({ includeSystemActions: false });

      // Runtime-imposed scoping: the connector allow-list comes from the resolved agent
      // configuration. The LLM has no say in this — it's part of the trust boundary.
      const connectorIds = agentConfiguration?.connector_ids;
      const allowedConnectorIds = connectorIds !== undefined ? new Set(connectorIds) : undefined;
      const scopedConnectors = allowedConnectorIds
        ? allConnectors.filter((connector) => allowedConnectorIds.has(connector.id))
        : allConnectors;

      const connectors = scopedConnectors.flatMap((connector) => {
        if (isMcpConnector(connector.actionTypeId)) {
          return [
            {
              connectorId: connector.id,
              name: connector.name,
              connectorType: MCP_CONNECTOR_TYPE_ID,
              displayName: connector.name,
              description: 'MCP connector. Call get_connector for its available tools.',
              isMissingSecrets: connector.isMissingSecrets ?? false,
            },
          ];
        }

        const spec = getConnectorSpec(connector.actionTypeId);
        if (!spec) return [];

        return [
          {
            connectorId: connector.id,
            name: connector.name,
            connectorType: connector.actionTypeId,
            displayName: spec.metadata.displayName,
            description: spec.metadata.description,
            isMissingSecrets: connector.isMissingSecrets ?? false,
          },
        ];
      });

      return {
        results: [
          {
            tool_result_id: getToolResultId(),
            type: ToolResultType.other,
            data: { total: connectors.length, connectors },
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`list_connectors failed: ${message}`);
      return {
        results: [createErrorResult({ message: `Failed to list connectors: ${message}` })],
      };
    }
  },
});
