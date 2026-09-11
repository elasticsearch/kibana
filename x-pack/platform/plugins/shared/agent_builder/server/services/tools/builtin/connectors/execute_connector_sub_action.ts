/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import { AuthorizationStatus, isAuthorizationMethod } from '@kbn/agent-builder-common/agents';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { getToolResultId, createErrorResult } from '@kbn/agent-builder-server';
import { AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID } from '@kbn/management-settings-ids';
import { getConnectorSpec, isToolAction } from '@kbn/connector-specs';
import { buildMcpCallToolExecuteParams } from '../../tool_types/mcp/tool_type';
import { isMcpConnector } from './types';
import type { ConnectorToolsOptions } from './types';

const connectorIdValidationMessage =
  'connectorId must be at the root of the arguments (copy the value from the get_connector result). ' +
  'Do not send only sub-action fields at the root; include connectorId and subAction together.';

const subActionValidationMessage =
  'subAction must be at the root — use the exact name from the get_connector result (for example searchMessages). ' +
  'It is not inferred from params or other fields.';

export const executeConnectorSubActionArgsSchema = z
  .object({
    connectorId: z
      .string()
      .min(1, connectorIdValidationMessage)
      .describe(
        'Connector instance ID at the **root** of the arguments object (not inside params). ' +
          'Must match the connectorId returned by get_connector.'
      ),
    subAction: z
      .string()
      .min(1, subActionValidationMessage)
      .describe(
        'Exact sub-action name at the **root** (must match a name listed under subActions in the get_connector result). ' +
          'Do not guess or infer from params.'
      ),
    params: z
      .record(z.string(), z.any())
      .optional()
      .describe(
        'Parameters for the chosen sub-action only — include each field the sub-action expects. ' +
          'Do not put those fields next to connectorId at the root; they belong in params.'
      ),
  })
  .strict();

/**
 * Creates the execute_connector_sub_action tool.
 *
 * This tool allows agents to execute any connector sub-action directly,
 * replacing the need for per-connector workflow tools.
 */
export const createExecuteConnectorSubActionTool = ({
  getActions,
}: ConnectorToolsOptions): BuiltinToolDefinition<typeof executeConnectorSubActionArgsSchema> => ({
  id: platformCoreTools.executeConnectorSubAction,
  type: ToolType.builtin,
  description:
    'Runs one sub-action on a saved connector. ' +
    'Arguments must look like: {"connectorId":"<id>","subAction":"<name>","params":{...}}. ' +
    'Keep connectorId and subAction at the root; put every argument for the sub-action inside params, not at the root. ' +
    'Use get_connector to get the Connector ID, allowed sub-action names, and parameter definitions. ' +
    'Do not invent names or parameters. ' +
    'Connectors API: https://www.elastic.co/docs/api/doc/kibana/group/endpoint-connectors — ' +
    'Connectors reference: https://www.elastic.co/docs/reference/kibana/connectors-kibana',
  schema: executeConnectorSubActionArgsSchema,
  tags: ['connector', 'sub-action'],
  excludeFromMcp: true,
  annotations: {
    title: 'Execute Connector Sub-Action',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
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
  handler: async ({ connectorId, subAction, params }, context) => {
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
            metadata: { connectorId, subAction },
          }),
        ],
      };
    }

    const actions = await getActions();
    const actionsClient = await actions.getActionsClientWithRequest(context.request);

    // Resolve the connector type from the connector ID
    let connectorType: string;
    try {
      const connector = await actionsClient.get({ id: connectorId });
      connectorType = connector.actionTypeId;
    } catch (error) {
      return {
        results: [
          createErrorResult({
            message: `Failed to resolve connector '${connectorId}': ${(error as Error).message}`,
            metadata: { connectorId, subAction },
          }),
        ],
      };
    }

    // Build the underlying execute() params. MCP has no static allow-list of tool names — the
    // MCP server itself is authoritative, and an invalid name surfaces as an error through the
    // shared, connector-type-agnostic handling below (same as the existing static ToolType.mcp
    // execution path, which also doesn't pre-validate tool names).
    let executeSubAction: string;
    let executeSubActionParams: Record<string, unknown>;

    if (isMcpConnector(connectorType)) {
      const mcpParams = buildMcpCallToolExecuteParams(subAction, params ?? {});
      executeSubAction = mcpParams.subAction;
      executeSubActionParams = mcpParams.subActionParams;
    } else {
      // Validate that we have a known connector spec
      const spec = getConnectorSpec(connectorType);
      if (!spec) {
        return {
          results: [
            createErrorResult({
              message:
                `No connector spec found for type '${connectorType}' (connector '${connectorId}'). ` +
                'This connector type does not support sub-action execution via this tool.',
              metadata: { connectorId, connectorType, subAction },
            }),
          ],
        };
      }

      // Validate that the sub-action is marked as a tool in the connector spec
      if (!isToolAction(spec, subAction)) {
        return {
          results: [
            createErrorResult({
              message:
                `Sub-action '${subAction}' is not available as a tool on connector type '${connectorType}'. ` +
                'Call get_connector to find the correct sub-action names.',
              metadata: { connectorId, connectorType, subAction },
            }),
          ],
        };
      }

      executeSubAction = subAction;
      executeSubActionParams = params ?? {};
    }

    const resolveAuthorizationResult = ({
      authMethod,
      connectorName,
    }: {
      authMethod: unknown;
      connectorName?: string;
    }) => {
      if (!isAuthorizationMethod(authMethod)) {
        return undefined;
      }
      const promptId = `tools.${context.callContext.toolId}.authorization.${connectorId}`;
      const { status } = context.prompts.checkAuthorizationStatus(promptId);
      const resolvedConnectorName = connectorName ?? connectorId;

      if (status === AuthorizationStatus.unprompted) {
        return context.prompts.askForAuthorization({
          id: promptId,
          connector_id: connectorId,
          connector_name: resolvedConnectorName,
          connector_type: connectorType,
          auth_method: authMethod,
        });
      }

      if (status === AuthorizationStatus.declined) {
        return {
          results: [
            createErrorResult({
              message:
                `The user declined to authorize the '${resolvedConnectorName}' connector, so the '${subAction}' sub-action cannot run. ` +
                'Do not retry this sub-action and do not instruct the user to authorize the connector themselves. ' +
                'Briefly let the user know the request was not completed because authorization was declined.',
              metadata: { connectorId, connectorType, subAction, authorizationStatus: status },
            }),
          ],
        };
      }

      return undefined;
    };

    let executeResult;
    try {
      executeResult = await actionsClient.execute({
        actionId: connectorId,
        params: {
          subAction: executeSubAction,
          subActionParams: executeSubActionParams,
        },
      });
    } catch (error) {
      return {
        results: [
          createErrorResult({
            message:
              `Failed to execute sub-action '${subAction}' on connector '${connectorId}': ${
                (error as Error).message
              }` +
              ' — Call get_connector to find valid sub-action names and their required parameters.',
            metadata: { connectorId, subAction },
          }),
        ],
      };
    }

    if (executeResult.status === 'error') {
      if (executeResult.errorName === 'ConnectorAuthorizationError') {
        const { errorMeta } = executeResult;
        const connectorName =
          typeof errorMeta?.connectorName === 'string' ? errorMeta.connectorName : undefined;
        const authResult = resolveAuthorizationResult({
          authMethod: errorMeta?.authMethod,
          connectorName,
        });
        if (authResult) {
          return authResult;
        }
      }
      return {
        results: [
          createErrorResult({
            message:
              `Connector sub-action '${subAction}' returned an error: ${
                executeResult.message ?? 'Unknown error'
              }` +
              ' — Call get_connector for the correct sub-action names and required parameters.',
            metadata: {
              connectorId,
              subAction,
              serviceMessage: executeResult.serviceMessage,
            },
          }),
        ],
      };
    }

    return {
      results: [
        {
          tool_result_id: getToolResultId(),
          type: ToolResultType.other,
          data: executeResult.data ?? { message: 'Sub-action executed successfully' },
        },
      ],
    };
  },
});
