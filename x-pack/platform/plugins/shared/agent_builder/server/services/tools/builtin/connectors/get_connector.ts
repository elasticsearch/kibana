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
import { getToolResultId, createErrorResult, formatSchemaForLlm } from '@kbn/agent-builder-server';
import { AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID } from '@kbn/management-settings-ids';
import { getConnectorSpec } from '@kbn/connector-specs';
import type { ActionScope } from '@kbn/connector-specs';
import type { ListToolsResponse, Tool, ToolAnnotations } from '@kbn/mcp-client';
import { fromJSONSchema } from '@kbn/zod/v4/from_json_schema';
import { listMcpTools } from '../../tool_types/mcp/tool_type';
import { isMcpConnector, MCP_CONNECTOR_TYPE_ID } from './types';
import type { ConnectorToolsOptions } from './types';

const schema = z.object({
  connectorId: z.string().min(1).describe('Connector instance ID, as returned by list_connectors.'),
});

// Duplicated from attachment_types/connector.ts (agent_builder_platform plugin) — that helper
// isn't exported from a shared package, and isn't worth extracting one for a ~5-line PoC.
function formatAnnotationHint(scope: ActionScope | undefined): string {
  if (!scope || scope === 'read') return '';
  return scope === 'destroy' ? '[DESTROY]' : '[WRITE]';
}

// Mirrors formatAnnotationHint but for MCP's advisory ToolAnnotations. Per the MCP spec, these
// hints are untrusted/server-supplied — default to '[WRITE]' (confirm) unless the server
// explicitly declares the tool read-only.
function formatMcpAnnotationHint(annotations: ToolAnnotations | undefined): string {
  if (annotations?.destructiveHint === true) return '[DESTROY]';
  if (annotations?.readOnlyHint === true) return '';
  return '[WRITE]';
}

const MCP_TOOLS_CACHE_TTL_MS = 30_000;

function formatMcpToolParameters(inputSchema: Record<string, unknown>): string {
  const properties = (inputSchema as { properties?: Record<string, unknown> }).properties;
  if (!properties || Object.keys(properties).length === 0) return 'No parameters';

  try {
    const zodSchema = fromJSONSchema(inputSchema);
    return zodSchema ? formatSchemaForLlm(zodSchema) : 'No parameters';
  } catch {
    return 'No parameters';
  }
}

/**
 * Creates the get_connector tool.
 *
 * Loads the full sub-action spec — names, descriptions, scope hints, and parameter schemas —
 * for one connector instance, so execute_connector_sub_action can be called correctly. Split
 * out from list_connectors so listing many connectors stays cheap; the full spec is only paid
 * for on the one connector actually being used.
 */
export const createGetConnectorTool = ({
  getActions,
}: ConnectorToolsOptions): BuiltinToolDefinition<typeof schema> => {
  // Short-lived cache for listMcpTools, keyed by the originating request + connector, so an
  // agent that calls get_connector on the same MCP connector more than once within one execution
  // (e.g. re-verifying a spec before invoking it) doesn't pay a full external round-trip every
  // time. Keying on request.id (rather than connectorId alone) bounds entries to a single
  // request's lifetime and avoids leaking data across requests. Mirrors the intent of
  // getDynamicProps's per-resolution memoization in tool_type.ts, but scoped by a TTL instead of
  // a resolution lifecycle since this handler has no equivalent lifecycle to hook into.
  const mcpToolsCache = new Map<
    string,
    { expiresAt: number; promise: Promise<ListToolsResponse> }
  >();

  const getCachedMcpTools = (
    params: Parameters<typeof listMcpTools>[0]
  ): Promise<ListToolsResponse> => {
    const cacheKey = `${params.request.id}:${params.connectorId}`;
    const cached = mcpToolsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.promise;
    }

    const promise = listMcpTools(params);
    promise.catch(() => mcpToolsCache.delete(cacheKey));
    mcpToolsCache.set(cacheKey, { expiresAt: Date.now() + MCP_TOOLS_CACHE_TTL_MS, promise });
    return promise;
  };

  return {
    id: platformCoreTools.getConnector,
    type: ToolType.builtin,
    annotations: {
      title: 'Get Connector',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      'Loads the full sub-action spec for one connector instance — sub-action names, descriptions, ' +
      'scope hints, and parameter schemas — so execute_connector_sub_action can be called with the ' +
      'correct connectorId, subAction, and params. Call this with a connectorId from list_connectors ' +
      'before invoking a connector for the first time in a conversation.',
    schema,
    tags: ['connector'],
    excludeFromMcp: true,
    availability: {
      cacheMode: 'global',
      handler: async ({ uiSettings }) => {
        const enabled = await uiSettings.get<boolean>(
          AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID
        );
        return enabled
          ? { status: 'available' }
          : {
              status: 'unavailable',
              reason: 'Connector tools require Agent Builder experimental features to be enabled',
            };
      },
    },
    handler: async ({ connectorId }, context) => {
      // Runtime-imposed scoping: the connector allow-list comes from the resolved agent
      // configuration. The LLM has no say in this — it's part of the trust boundary. Checked
      // before resolving the connector so a non-attached connectorId isn't even confirmed to exist.
      const connectorIds = context.agentConfiguration?.connector_ids;
      if (connectorIds !== undefined && !connectorIds.includes(connectorId)) {
        return {
          results: [
            createErrorResult({
              message:
                `Connector '${connectorId}' is not available to this agent. ` +
                'Use list_connectors to see the connectors attached to this agent.',
              metadata: { connectorId },
            }),
          ],
        };
      }

      try {
        const actions = await getActions();
        const actionsClient = await actions.getActionsClientWithRequest(context.request);

        let connector;
        try {
          connector = await actionsClient.get({ id: connectorId });
        } catch (error) {
          return {
            results: [
              createErrorResult({
                message: `Failed to resolve connector '${connectorId}': ${
                  (error as Error).message
                }`,
                metadata: { connectorId },
              }),
            ],
          };
        }

        if (isMcpConnector(connector.actionTypeId)) {
          const { tools } = await getCachedMcpTools({
            actions,
            request: context.request,
            connectorId,
          });

          const subActions = tools.map((tool: Tool) => ({
            subAction: tool.name,
            description: tool.description ?? tool.name,
            hint: formatMcpAnnotationHint(tool.annotations),
            parameters: formatMcpToolParameters(tool.inputSchema),
          }));

          return {
            results: [
              {
                tool_result_id: getToolResultId(),
                type: ToolResultType.other,
                data: {
                  connectorId: connector.id,
                  name: connector.name,
                  connectorType: MCP_CONNECTOR_TYPE_ID,
                  displayName: connector.name,
                  description: 'MCP connector',
                  subActions,
                },
              },
            ],
          };
        }

        const spec = getConnectorSpec(connector.actionTypeId);
        if (!spec) {
          return {
            results: [
              createErrorResult({
                message:
                  `No connector spec found for type '${connector.actionTypeId}' (connector ` +
                  `'${connectorId}'). This connector type does not support sub-action execution ` +
                  'via execute_connector_sub_action.',
                metadata: { connectorId, connectorType: connector.actionTypeId },
              }),
            ],
          };
        }

        const subActions = Object.entries(spec.actions)
          .filter(([, action]) => action.isTool)
          .map(([subAction, action]) => ({
            subAction,
            description: action.description ?? subAction,
            hint: formatAnnotationHint(action.scope),
            parameters: action.input ? formatSchemaForLlm(action.input) : 'No parameters',
          }));

        return {
          results: [
            {
              tool_result_id: getToolResultId(),
              type: ToolResultType.other,
              data: {
                connectorId: connector.id,
                name: connector.name,
                connectorType: connector.actionTypeId,
                displayName: spec.metadata.displayName,
                description: spec.metadata.description,
                subActions,
              },
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.logger.error(`get_connector failed: ${message}`);
        return {
          results: [createErrorResult({ message: `Failed to get connector: ${message}` })],
        };
      }
    },
  };
};
