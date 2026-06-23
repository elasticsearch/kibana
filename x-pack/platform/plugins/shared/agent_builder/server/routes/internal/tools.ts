/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { listSearchSources } from '@kbn/agent-builder-genai-utils';
import { CONNECTOR_ID as MCP_CONNECTOR_ID } from '@kbn/connector-schemas/mcp/constants';
import type { ListToolsResponse } from '@kbn/mcp-client';
import {
  type ActionTypeExecutorResult,
  AgentBuilderConnectorFeatureId,
} from '@kbn/actions-plugin/common';
import { ToolType, isMcpTool, type McpToolDefinition } from '@kbn/agent-builder-common/tools';
import type { RouteDependencies } from '../types';
import { getHandlerWrapper } from '../wrap_handler';
import type {
  BulkDeleteToolResponse,
  BulkDeleteToolResult,
  ResolveSearchSourcesResponse,
  ListWorkflowsResponse,
  GetWorkflowResponse,
  GetToolTypeInfoResponse,
  GetToolHealthResponse,
  ListToolHealthResponse,
  BulkCreateMcpToolsResponse,
  ListConnectorsResponse,
  ConnectorItem,
  ListMcpToolsResponse,
  GetConnectorResponse,
  ListMcpToolsHealthResponse,
  McpToolHealthState,
  McpToolHealthStatus,
  ValidateNamespaceResponse,
  BulkDeleteConnectorResult,
  BulkDeleteConnectorsResponse,
} from '../../../common/http_api/tools';
import { OAUTH_STATUS } from '../../../common/http_api/tools';
import { internalApiPath } from '../../../common/constants';
import { AGENT_BUILDER_READ_SECURITY, TOOLS_WRITE_SECURITY } from '../route_security';
import { getToolTypeInfo, bulkCreateMcpTools } from '../../services/tools/utils';
import { toConnectorItem } from '../utils';

const USER_CONNECTOR_TOKEN_TYPE = 'user_connector_token';
const PER_USER_AUTH_MODE = 'per-user';

export function registerInternalToolsRoutes({
  router,
  coreSetup,
  getInternalServices,
  logger,
  pluginsSetup: { workflowsManagement },
}: RouteDependencies) {
  const wrapHandler = getHandlerWrapper({ logger });

  // bulk delete tools
  router.post(
    {
      path: `${internalApiPath}/tools/_bulk_delete`,
      validate: {
        body: schema.object({
          ids: schema.arrayOf(schema.string({ minLength: 1 }), { minSize: 1, maxSize: 1000 }),
          force: schema.boolean({ defaultValue: true }),
        }),
      },
      options: { access: 'internal' },
      security: TOOLS_WRITE_SECURITY,
    },
    wrapHandler(async (ctx, request, response) => {
      const { ids, force } = request.body;
      const { tools: toolService, agents: agentsService, auditLogService } = getInternalServices();

      if (!force) {
        const { agents } = await agentsService.getAgentsUsingTools({
          request,
          toolIds: ids,
        });
        if (agents.length > 0) {
          return response.conflict({
            body: {
              message:
                'One or more tools are used by agents. Use force=true to remove them from agents and delete.',
              attributes: {
                code: 'TOOL_USED_BY_AGENTS',
                agents,
              },
            },
          });
        }
      } else {
        const { agents } = await agentsService.removeToolRefsFromAgents({
          request,
          toolIds: ids,
        });
        for (const agent of agents) {
          auditLogService.logAgentUpdated(request, {
            agentId: agent.id,
            agentName: agent.name,
          });
        }
      }

      const registry = await toolService.getRegistry({ request });
      const deleteResults = await Promise.allSettled(ids.map((id) => registry.delete(id)));

      const results: BulkDeleteToolResult[] = deleteResults.map((result, index) => {
        if (result.status !== 'fulfilled') {
          return {
            toolId: ids[index],
            success: false,
            reason: result.reason.toJSON?.() ?? {
              error: { message: 'Unknown error' },
            },
          };
        }

        return {
          toolId: ids[index],
          success: true,
        };
      });

      auditLogService.logBulkToolDeleteResults(request, { ids, deleteResults });

      return response.ok<BulkDeleteToolResponse>({
        body: { results },
      });
    })
  );

  // bulk create MCP tools from connector (internal)
  router.post(
    {
      path: `${internalApiPath}/tools/_bulk_create_mcp`,
      validate: {
        body: schema.object({
          connector_id: schema.string(),
          tools: schema.arrayOf(
            schema.object({
              name: schema.string(),
              description: schema.maybe(schema.string()),
            })
          ),
          namespace: schema.maybe(schema.string()),
          tags: schema.arrayOf(schema.string(), { defaultValue: [] }),
          skip_existing: schema.boolean({ defaultValue: true }),
        }),
      },
      options: { access: 'internal' },
      security: TOOLS_WRITE_SECURITY,
    },
    wrapHandler(async (ctx, request, response) => {
      const {
        connector_id: connectorId,
        tools,
        namespace,
        tags,
        skip_existing: skipExisting,
      } = request.body;
      const { tools: toolService, auditLogService } = getInternalServices();
      const [, { actions }] = await coreSetup.getStartServices();
      const registry = await toolService.getRegistry({ request });

      const { results, summary } = await bulkCreateMcpTools({
        registry,
        actions,
        request,
        connectorId,
        tools,
        namespace,
        tags,
        skipExisting,
      });

      auditLogService.logBulkCreateMcpToolResults(request, { results });

      return response.ok<BulkCreateMcpToolsResponse>({
        body: {
          results,
          summary,
        },
      });
    })
  );

  // validate namespace for MCP tool import (internal)
  router.get(
    {
      path: `${internalApiPath}/tools/_validate_namespace`,
      validate: {
        query: schema.object({
          namespace: schema.string(),
          connector_id: schema.maybe(schema.string()),
        }),
      },
      options: { access: 'internal' },
      security: AGENT_BUILDER_READ_SECURITY,
    },
    wrapHandler(async (ctx, request, response) => {
      const { namespace, connector_id: connectorId } = request.query;
      const { tools: toolService } = getInternalServices();
      const registry = await toolService.getRegistry({ request });

      const allTools = await registry.list({ types: [ToolType.mcp] });

      const toolsInNamespace = allTools.filter((tool) => {
        const lastDotIndex = tool.id.lastIndexOf('.');
        if (lastDotIndex > 0) {
          const toolNamespace = tool.id.substring(0, lastDotIndex);
          return toolNamespace === namespace;
        }
        return false;
      });

      if (toolsInNamespace.length === 0) {
        return response.ok<ValidateNamespaceResponse>({
          body: {
            isValid: true,
            conflictingNamespaces: [],
          },
        });
      }

      // If connectorId is provided, check if all tools in the namespace belong to the same connector
      // This allows reusing a namespace for the same MCP server
      if (connectorId) {
        const allToolsBelongToSameConnector = toolsInNamespace.every((tool) => {
          if (isMcpTool(tool)) {
            return tool.configuration.connector_id === connectorId;
          }
          return false;
        });

        if (allToolsBelongToSameConnector) {
          return response.ok<ValidateNamespaceResponse>({
            body: {
              isValid: true,
              conflictingNamespaces: [],
            },
          });
        }
      }

      return response.ok<ValidateNamespaceResponse>({
        body: {
          isValid: false,
          conflictingNamespaces: [namespace],
        },
      });
    })
  );

  // resolve search sources (internal)
  router.get(
    {
      path: `${internalApiPath}/tools/_resolve_search_sources`,
      validate: {
        query: schema.object({
          pattern: schema.string(),
        }),
      },
      options: { access: 'internal' },
      security: AGENT_BUILDER_READ_SECURITY,
    },
    wrapHandler(async (ctx, request, response) => {
      const esClient = (await ctx.core).elasticsearch.client.asCurrentUser;
      const { pattern } = request.query;

      const {
        indices,
        aliases,
        data_streams: dataStreams,
      } = await listSearchSources({
        pattern,
        includeHidden: false,
        excludeIndicesRepresentedAsAlias: true,
        excludeIndicesRepresentedAsDatastream: true,
        esClient,
      });

      const results = [
        ...indices.map((i) => ({ type: 'index' as const, name: i.name })),
        ...aliases.map((a) => ({ type: 'alias' as const, name: a.name })),
        ...dataStreams.map((d) => ({ type: 'data_stream' as const, name: d.name })),
      ];
      return response.ok<ResolveSearchSourcesResponse>({
        body: {
          results,
          total: results.length,
        },
      });
    })
  );

  // list available tool types (internal)
  router.get(
    {
      path: `${internalApiPath}/tools/_types_info`,
      validate: false,
      options: { access: 'internal' },
      security: AGENT_BUILDER_READ_SECURITY,
    },
    wrapHandler(async (ctx, request, response) => {
      const { tools } = getInternalServices();

      const toolTypes = tools.getToolDefinitions();

      return response.ok<GetToolTypeInfoResponse>({
        body: {
          toolTypes: getToolTypeInfo(toolTypes),
        },
      });
    })
  );

  // list workflows (internal)
  router.get(
    {
      path: `${internalApiPath}/tools/_list_workflows`,
      validate: {
        query: schema.object({
          page: schema.number({ defaultValue: 1 }),
          limit: schema.number({ defaultValue: 10000 }),
        }),
      },
      options: { access: 'internal' },
      security: AGENT_BUILDER_READ_SECURITY,
    },
    wrapHandler(async (ctx, request, response) => {
      if (!workflowsManagement) {
        return response.ok<ListWorkflowsResponse>({
          body: {
            results: [],
          },
        });
      }

      const currentSpace = (await ctx.agentBuilder).spaces.getSpaceId();

      const { results } = await workflowsManagement.management.getWorkflows(
        { page: request.query.page, size: request.query.limit, enabled: [true] },
        currentSpace
      );

      return response.ok<ListWorkflowsResponse>({
        body: {
          results: results.map((workflow) => ({
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
          })),
        },
      });
    })
  );

  // get workflow (internal)
  router.get(
    {
      path: `${internalApiPath}/tools/_get_workflow/{id}`,
      validate: {
        params: schema.object({
          id: schema.string(),
        }),
      },
      options: { access: 'internal' },
      security: AGENT_BUILDER_READ_SECURITY,
    },
    wrapHandler(async (ctx, request, response) => {
      if (!workflowsManagement) {
        return response.ok<GetWorkflowResponse>({
          body: {
            id: '',
            name: '',
            description: '',
          },
        });
      }

      const currentSpace = (await ctx.agentBuilder).spaces.getSpaceId();

      const workflow = await workflowsManagement.management.getWorkflow(
        request.params.id,
        currentSpace
      );

      return response.ok<GetWorkflowResponse>({
        body: {
          id: workflow!.id,
          name: workflow!.name,
          description: workflow!.description,
        },
      });
    })
  );

  // list all tool health statuses for the current space (internal)
  router.get(
    {
      path: `${internalApiPath}/tools/_health`,
      validate: false,
      options: { access: 'internal' },
      security: AGENT_BUILDER_READ_SECURITY,
    },
    wrapHandler(async (ctx, request, response) => {
      const { tools } = getInternalServices();
      const healthClient = tools.getHealthClient({ request });
      const healthStates = await healthClient.listBySpace();

      return response.ok<ListToolHealthResponse>({
        body: {
          results: healthStates,
        },
      });
    })
  );

  // get health status for a specific tool (internal)
  router.get(
    {
      path: `${internalApiPath}/tools/{toolId}/_health`,
      validate: {
        params: schema.object({
          toolId: schema.string(),
        }),
      },
      options: { access: 'internal' },
      security: AGENT_BUILDER_READ_SECURITY,
    },
    wrapHandler(async (ctx, request, response) => {
      const { tools } = getInternalServices();
      const healthClient = tools.getHealthClient({ request });
      const health = await healthClient.get(request.params.toolId);

      if (!health) {
        return response.notFound({
          body: { message: `No health data found for tool '${request.params.toolId}'` },
        });
      }

      return response.ok<GetToolHealthResponse>({
        body: { health },
      });
    })
  );

  // list connectors (internal)
  router.get(
    {
      path: `${internalApiPath}/tools/_list_connectors`,
      validate: {
        query: schema.object({
          type: schema.maybe(schema.string()),
        }),
      },
      options: { access: 'internal' },
      security: AGENT_BUILDER_READ_SECURITY,
    },
    wrapHandler(async (ctx, request, response) => {
      const [coreStart, pluginsStart] = await coreSetup.getStartServices();
      const actionsClient = await pluginsStart.actions.getActionsClientWithRequest(request);
      const [allConnectors, compatibleTypes] = await Promise.all([
        actionsClient.getAll(),
        actionsClient.listTypes({ featureId: AgentBuilderConnectorFeatureId }),
      ]);

      const compatibleTypeIds = new Set(compatibleTypes.map((t) => t.id));
      const { type } = request.query;

      const filteredConnectors = allConnectors
        .filter((connector) => compatibleTypeIds.has(connector.actionTypeId))
        .filter((connector) => (type ? connector.actionTypeId === type : true));

      // Check OAuth authorization status for per-user connectors.
      // Batch query user_connector_token saved objects to determine which
      // OAuth connectors the current user has authorized.
      const oauthConnectorIds = filteredConnectors
        .filter((connector) => connector.authMode === PER_USER_AUTH_MODE)
        .map((connector) => connector.id);

      const authorizedConnectorIds = new Set<string>();
      if (oauthConnectorIds.length > 0) {
        const currentUser = coreStart.security.authc.getCurrentUser(request);
        if (currentUser?.profile_uid) {
          const soClient = coreStart.savedObjects.getScopedClient(request, {
            includedHiddenTypes: [USER_CONNECTOR_TOKEN_TYPE],
          });
          const connectorIdFilter = oauthConnectorIds
            .map((id) => `${USER_CONNECTOR_TOKEN_TYPE}.attributes.connectorId: "${id}"`)
            .join(' OR ');
          const tokenResults = await soClient.find<{ connectorId: string }>({
            type: USER_CONNECTOR_TOKEN_TYPE,
            perPage: oauthConnectorIds.length,
            filter: `${USER_CONNECTOR_TOKEN_TYPE}.attributes.profileUid: "${currentUser.profile_uid}" AND (${connectorIdFilter})`,
          });
          for (const token of tokenResults.saved_objects) {
            if (token.attributes.connectorId) {
              authorizedConnectorIds.add(token.attributes.connectorId);
            }
          }
        }
      }

      const connectors: ConnectorItem[] = filteredConnectors.map((connector) => {
        const isOAuth = connector.authMode === PER_USER_AUTH_MODE;
        return toConnectorItem(connector, {
          oauthStatus: isOAuth
            ? authorizedConnectorIds.has(connector.id)
              ? OAUTH_STATUS.AUTHORIZED
              : OAUTH_STATUS.DISCONNECTED
            : undefined,
        });
      });

      return response.ok<ListConnectorsResponse>({
        body: {
          connectors,
        },
      });
    })
  );

  // get connector by ID (internal)
  router.get(
    {
      path: `${internalApiPath}/tools/_get_connector/{connectorId}`,
      validate: {
        params: schema.object({
          connectorId: schema.string(),
        }),
      },
      options: { access: 'internal' },
      security: AGENT_BUILDER_READ_SECURITY,
    },
    wrapHandler(async (ctx, request, response) => {
      const [coreStart, pluginsStart] = await coreSetup.getStartServices();
      const actionsClient = await pluginsStart.actions.getActionsClientWithRequest(request);
      const { connectorId } = request.params;

      const connector = await actionsClient.get({ id: connectorId });

      let oauthStatus;
      if (connector.authMode === PER_USER_AUTH_MODE) {
        const currentUser = coreStart.security.authc.getCurrentUser(request);
        if (currentUser?.profile_uid) {
          const soClient = coreStart.savedObjects.getScopedClient(request, {
            includedHiddenTypes: [USER_CONNECTOR_TOKEN_TYPE],
          });
          const tokenResult = await soClient.find<{ connectorId: string }>({
            type: USER_CONNECTOR_TOKEN_TYPE,
            perPage: 1,
            filter: `${USER_CONNECTOR_TOKEN_TYPE}.attributes.profileUid: "${currentUser.profile_uid}" AND ${USER_CONNECTOR_TOKEN_TYPE}.attributes.connectorId: "${connectorId}"`,
          });
          oauthStatus = tokenResult.total > 0 ? OAUTH_STATUS.AUTHORIZED : OAUTH_STATUS.DISCONNECTED;
        } else {
          oauthStatus = OAUTH_STATUS.DISCONNECTED;
        }
      }

      return response.ok<GetConnectorResponse>({
        body: {
          connector: toConnectorItem(connector, { oauthStatus }),
        },
      });
    })
  );

  // bulk delete connectors (internal)
  router.post(
    {
      path: `${internalApiPath}/connectors/_bulk_delete`,
      validate: {
        body: schema.object({
          ids: schema.arrayOf(schema.string({ minLength: 1 }), { minSize: 1, maxSize: 100 }),
        }),
      },
      options: { access: 'internal' },
      security: TOOLS_WRITE_SECURITY,
    },
    wrapHandler(async (ctx, request, response) => {
      const [, pluginsStart] = await coreSetup.getStartServices();
      const actionsClient = await pluginsStart.actions.getActionsClientWithRequest(request);
      const { ids } = request.body;

      const deleteResults = await Promise.allSettled(ids.map((id) => actionsClient.delete({ id })));

      const results: BulkDeleteConnectorResult[] = deleteResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return { connectorId: ids[index], success: true };
        }
        return {
          connectorId: ids[index],
          success: false,
          reason: result.reason.toJSON?.() ?? {
            error: { message: 'Unknown error' },
          },
        };
      });

      return response.ok<BulkDeleteConnectorsResponse>({
        body: { results },
      });
    })
  );

  // list MCP tools (internal)
  router.get(
    {
      path: `${internalApiPath}/tools/_list_mcp_tools`,
      validate: {
        query: schema.object({
          connectorId: schema.string(),
        }),
      },
      options: { access: 'internal' },
      security: AGENT_BUILDER_READ_SECURITY,
    },
    wrapHandler(async (ctx, request, response) => {
      const [, pluginsStart] = await coreSetup.getStartServices();
      const actionsClient = await pluginsStart.actions.getActionsClientWithRequest(request);

      const { connectorId } = request.query;

      const connector = await actionsClient.get({ id: connectorId });

      if (connector.actionTypeId !== MCP_CONNECTOR_ID) {
        return response.badRequest({
          body: {
            message: `Connector '${connectorId}' is not an MCP connector. Expected type '${MCP_CONNECTOR_ID}', got '${connector.actionTypeId}'`,
          },
        });
      }

      const executeResult = (await actionsClient.execute({
        actionId: request.query.connectorId,
        params: {
          subAction: 'listTools',
        },
      })) as ActionTypeExecutorResult<ListToolsResponse>;

      if (executeResult.status === 'error') {
        return response.customError({
          statusCode: 500,
          body: {
            message: `Failed to list MCP tools for connector '${connectorId}': ${executeResult.message}`,
          },
        });
      }

      const mcpTools = executeResult.data?.tools ?? [];

      return response.ok<ListMcpToolsResponse>({
        body: {
          mcpTools,
        },
      });
    })
  );

  // list health status for all MCP tools (internal)
  router.get(
    {
      path: `${internalApiPath}/tools/_mcp_health`,
      validate: false,
      options: { access: 'internal' },
      security: AGENT_BUILDER_READ_SECURITY,
    },
    wrapHandler(async (ctx, request, response) => {
      const [, pluginsStart] = await coreSetup.getStartServices();
      const actionsClient = await pluginsStart.actions.getActionsClientWithRequest(request);
      const { tools: toolService } = getInternalServices();

      const registry = await toolService.getRegistry({ request });
      const healthClient = toolService.getHealthClient({ request });

      const mcpTools: McpToolDefinition[] = (await registry.list({ types: [ToolType.mcp] })).filter(
        (tool) => isMcpTool(tool)
      );

      if (mcpTools.length === 0) {
        return response.ok<ListMcpToolsHealthResponse>({
          body: { results: [] },
        });
      }

      const healthStates = await healthClient.listBySpace();
      const healthByToolId = new Map(
        healthStates.map((healthState) => [healthState.toolId, healthState])
      );

      const connectorIds = [...new Set(mcpTools.map((tool) => tool.configuration.connector_id))];

      const connectorResults = await Promise.allSettled(
        connectorIds.map(async (connectorId) => {
          const connector = await actionsClient.get({ id: connectorId });
          const executeResult = (await actionsClient.execute({
            actionId: connectorId,
            params: { subAction: 'listTools' },
          })) as ActionTypeExecutorResult<ListToolsResponse>;

          return {
            connectorId,
            connector,
            mcpServerTools: executeResult.status === 'ok' ? executeResult.data?.tools ?? [] : [],
            listToolsError: executeResult.status === 'error' ? executeResult.message : undefined,
          };
        })
      );

      const connectorDataMap = new Map<
        string,
        {
          exists: boolean;
          mcpServerTools: string[];
          listToolsError?: string;
        }
      >();

      for (let i = 0; i < connectorIds.length; i++) {
        const connectorId = connectorIds[i];
        const result = connectorResults[i];

        if (result.status === 'fulfilled') {
          connectorDataMap.set(connectorId, {
            exists: true,
            mcpServerTools: result.value.mcpServerTools.map((mcpServerTool) => mcpServerTool.name),
            listToolsError: result.value.listToolsError,
          });
        } else {
          connectorDataMap.set(connectorId, {
            exists: false,
            mcpServerTools: [],
          });
        }
      }

      const results: McpToolHealthState[] = mcpTools.map((tool) => {
        const toolConnectorId = tool.configuration.connector_id;
        const mcpToolName = tool.configuration.tool_name;
        const connectorData = connectorDataMap.get(toolConnectorId);
        const toolHealth = healthByToolId.get(tool.id);

        let status: McpToolHealthStatus = 'healthy';
        let errorMessage: string | undefined;

        // Check connector exists
        if (!connectorData?.exists) {
          status = 'connector_not_found';
          errorMessage = `Connector '${toolConnectorId}' not found`;
        }
        // Check if listing MCP tools failed
        else if (connectorData.listToolsError) {
          status = 'list_tools_failed';
          errorMessage = connectorData.listToolsError;
        }
        // Check if the specific MCP tool exists on the server
        else if (!connectorData.mcpServerTools.includes(mcpToolName)) {
          status = 'tool_not_found';
          errorMessage = `Tool '${mcpToolName}' not found on MCP server`;
        }
        // Check if the tool has failed health checks
        else if (toolHealth && toolHealth.status !== 'healthy') {
          status = 'tool_unhealthy';
          errorMessage = toolHealth.errorMessage;
        }

        return {
          toolId: tool.id,
          connectorId: toolConnectorId,
          mcpToolName,
          status,
          errorMessage,
        };
      });

      return response.ok<ListMcpToolsHealthResponse>({
        body: { results },
      });
    })
  );
}
