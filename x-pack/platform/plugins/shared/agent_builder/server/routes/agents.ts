/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import path from 'node:path';
import {
  AGENT_ACCESS_CONTROL_MAX_ENTRIES,
  AGENT_ACCESS_CONTROL_PRINCIPAL_ID_MAX_LENGTH,
  AgentAccessControlMode,
  AgentAccessControlRole,
} from '@kbn/agent-builder-common';
import { MAX_AI_INDEX_ID_LENGTH } from '@kbn/context-engine-plugin/common/constants';
import { CONTEXT_ENGINE_ENABLED_SETTING_ID } from '@kbn/management-settings-ids';
import type { RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';
import { publicApiPath } from '../../common/constants';
import { AGENT_BUILDER_READ_SECURITY, AGENTS_WRITE_SECURITY } from './route_security';
import type {
  AgentDefinitionWithPermissions,
  GetAgentResponse,
  CreateAgentResponse,
  UpdateAgentResponse,
  DeleteAgentResponse,
  GetAgentAccessControlResponse,
  ListAgentResponse,
  UpdateAgentAccessControlRequestBody,
  UpdateAgentAccessControlResponse,
} from '../../common/http_api/agents';
import type { AgentBuilderHandlerContext } from '../request_handler_context';
import { asError } from '../utils/as_error';

const TOOL_SELECTION_SCHEMA = schema.arrayOf(
  schema.object(
    {
      tool_ids: schema.arrayOf(
        schema.string({
          meta: { description: 'Tool ID to be available to the agent.' },
        }),
        {
          meta: { description: 'Array of tool IDs that the agent can use.' },
        }
      ),
    },
    {
      meta: { description: 'Tool selection configuration for the agent.' },
    }
  )
);

const SKILLS_SCHEMA = schema.arrayOf(
  schema.string({
    meta: { description: 'Skill ID to be available to the agent.' },
  }),
  {
    maxSize: 100,
    meta: { description: 'Array of skill IDs to be available to the agent.' },
  }
);

const PLUGINS_SCHEMA = schema.arrayOf(
  schema.string({
    meta: { description: 'Plugin ID to assign to the agent.' },
  }),
  {
    maxSize: 100,
    meta: { description: 'Array of plugin IDs to assign to the agent.' },
  }
);

const CONNECTORS_SCHEMA = schema.arrayOf(
  schema.string({
    meta: { description: 'Connector ID to associate with the agent.' },
  }),
  {
    maxSize: 100,
    meta: { description: 'Array of connector IDs to associate with the agent.' },
  }
);

const AI_INDICES_SCHEMA = schema.arrayOf(
  schema.string({
    meta: { description: 'AI indices to associate with the agent.' },
    maxLength: MAX_AI_INDEX_ID_LENGTH,
  }),
  {
    maxSize: 100,
    meta: { description: 'Array of AI indices to associate with the agent.' },
  }
);

/**
 * `ai_indices` is only readable and writable while the Context Engine is enabled. The setting is
 * registered by the `agentBuilderSml` plugin, a required dependency of `agentBuilder`.
 */
export const isContextEngineEnabled = async (ctx: AgentBuilderHandlerContext): Promise<boolean> => {
  const { uiSettings } = await ctx.core;
  return Boolean(await uiSettings.client.get(CONTEXT_ENGINE_ENABLED_SETTING_ID));
};

/**
 * Strips fields gated by experimental feature flags from an incoming write body,
 * leaving stored values intact so they reactivate when the flag is toggled back on.
 */
const handleExperimentalFeatures = async <T extends { configuration?: { ai_indices?: string[] } }>(
  body: T,
  ctx: AgentBuilderHandlerContext
): Promise<{ body: T; contextEngineEnabled: boolean }> => {
  const contextEngineEnabled = await isContextEngineEnabled(ctx);

  if (!body.configuration) {
    return { body, contextEngineEnabled };
  }

  if (!contextEngineEnabled) {
    const { ai_indices: _stripped, ...restConfig } = body.configuration;
    return { body: { ...body, configuration: restConfig } as T, contextEngineEnabled };
  }

  return { body, contextEngineEnabled };
};

/**
 * Shapes `ai_indices` for a response: absent while the Context Engine is disabled, and present
 * with an empty-list default while it is enabled.
 */
const withAiIndices = <T extends AgentDefinitionWithPermissions>(
  agent: T,
  contextEngineEnabled: boolean
): T => {
  const { ai_indices: aiIndices, ...configuration } = agent.configuration;

  return contextEngineEnabled
    ? { ...agent, configuration: { ...configuration, ai_indices: aiIndices ?? [] } }
    : { ...agent, configuration };
};

const ACCESS_CONTROL_MODE_SCHEMA = schema.oneOf(
  [
    schema.literal(AgentAccessControlMode.Public),
    schema.literal(AgentAccessControlMode.Shared),
    schema.literal(AgentAccessControlMode.Private),
  ],
  {
    meta: {
      description:
        '**Technical Preview; added in 9.4.0.** Access-control mode: `public` (any privileged user can read/write), `shared` (any privileged user can read, only owner can write), `private` (only owner can read/write). Agents created without an access-control mode default to `private`.',
    },
  }
);

const ACCESS_CONTROL_ENTRIES_SCHEMA = schema.arrayOf(
  schema.object(
    {
      type: schema.literal('user'),
      id: schema.maybe(
        schema.string({
          minLength: 1,
          maxLength: AGENT_ACCESS_CONTROL_PRINCIPAL_ID_MAX_LENGTH,
          meta: {
            description:
              'Stable identifier of the user to grant access to (Kibana user profile uid). Preferred over `name`.',
          },
        })
      ),
      name: schema.maybe(
        schema.string({
          minLength: 1,
          maxLength: AGENT_ACCESS_CONTROL_PRINCIPAL_ID_MAX_LENGTH,
          meta: {
            description:
              'Deprecated. Case-sensitive Kibana username of the user to grant access to. Use `id` instead; `name` is only kept so existing entries can be sent back unchanged.',
          },
        })
      ),
      role: schema.oneOf(
        [
          schema.literal(AgentAccessControlRole.User),
          schema.literal(AgentAccessControlRole.Editor),
          schema.literal(AgentAccessControlRole.Manager),
        ],
        {
          meta: {
            description:
              'Role granted to the principal. Roles are hierarchical: `user` allows viewing, listing, reading, and running the agent; `editor` adds updating the agent and its access control; `manager` adds deleting the agent and managing access control.',
          },
        }
      ),
    },
    {
      validate: (entry) =>
        entry.id === undefined && entry.name === undefined
          ? 'Each ACL entry requires an `id` or a `name`'
          : undefined,
    }
  ),
  {
    maxSize: AGENT_ACCESS_CONTROL_MAX_ENTRIES,
    meta: {
      description:
        'Access-control entries to apply to the agent. Each entry has a `type` (currently only `user` is supported), a `role`, and either an `id` (the principal user profile uid, preferred) or a deprecated `name` (username).',
    },
  }
);

const ACCESS_CONTROL_MODE_ONLY_SCHEMA = schema.object({
  access_mode: ACCESS_CONTROL_MODE_SCHEMA,
});

export function registerAgentRoutes({
  router,
  getInternalServices,
  logger,
  analyticsService,
}: RouteDependencies) {
  const wrapHandler = getHandlerWrapper({ logger });

  // List agents
  router.versioned
    .get({
      path: `${publicApiPath}/agents`,
      security: AGENT_BUILDER_READ_SECURITY,
      access: 'public',
      summary: 'List agents',
      description:
        'List all available agents. Use this endpoint to retrieve complete agent information including their current configuration and assigned tools. To learn more about agents, refer to the [agents documentation](https://www.elastic.co/docs/explore-analyze/ai-features/agent-builder/agent-builder-agents).',
      options: {
        tags: ['agent', 'oas-tag:agent builder'],
        availability: {
          since: '9.2.0',
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: false,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/agents_list.yaml'),
        },
      },
      wrapHandler(async (ctx, request, response) => {
        const { agents: agentsService } = getInternalServices();
        const service = await agentsService.getRegistry({ request });
        const agents = await service.list();
        const contextEngineEnabled = await isContextEngineEnabled(ctx);
        return response.ok<ListAgentResponse>({
          body: { results: agents.map((agent) => withAiIndices(agent, contextEngineEnabled)) },
        });
      })
    );

  // Get agent by id
  router.versioned
    .get({
      path: `${publicApiPath}/agents/{id}`,
      security: AGENT_BUILDER_READ_SECURITY,
      access: 'public',
      summary: 'Get an agent by ID',
      description:
        'Get a specific agent by ID. Use this endpoint to retrieve the complete agent definition including all configuration details and tool assignments. To learn more about agents, refer to the [agents documentation](https://www.elastic.co/docs/explore-analyze/ai-features/agent-builder/agent-builder-agents).',
      options: {
        tags: ['agent', 'oas-tag:agent builder'],
        availability: {
          since: '9.2.0',
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            params: schema.object({
              id: schema.string({
                meta: { description: 'The unique identifier of the agent to retrieve.' },
              }),
            }),
          },
        },
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/agents_get_by_id.yaml'),
        },
      },
      wrapHandler(async (ctx, request, response) => {
        const { agents } = getInternalServices();
        const service = await agents.getRegistry({ request });

        const profile = await service.get(request.params.id);
        const contextEngineEnabled = await isContextEngineEnabled(ctx);
        return response.ok<GetAgentResponse>({
          body: withAiIndices(profile, contextEngineEnabled),
        });
      })
    );

  // Create agent
  router.versioned
    .post({
      path: `${publicApiPath}/agents`,
      security: AGENTS_WRITE_SECURITY,
      access: 'public',
      summary: 'Create an agent',
      description:
        "Create a new agent. Use this endpoint to define the agent's behavior, appearance, and capabilities through comprehensive configuration options. To learn more about agents, refer to the [agents documentation](https://www.elastic.co/docs/explore-analyze/ai-features/agent-builder/agent-builder-agents).",
      options: {
        tags: ['agent', 'oas-tag:agent builder'],
        availability: {
          since: '9.2.0',
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            body: schema.object({
              id: schema.string({
                meta: { description: 'Unique identifier for the agent.' },
              }),
              name: schema.string({
                meta: { description: 'Display name for the agent.' },
              }),
              description: schema.string({
                meta: { description: 'Description of what the agent does.' },
              }),
              avatar_color: schema.maybe(
                schema.string({
                  meta: { description: 'Optional hex color code for the agent avatar.' },
                })
              ),
              avatar_symbol: schema.maybe(
                schema.string({
                  meta: { description: 'Optional symbol/initials for the agent avatar.' },
                })
              ),
              labels: schema.maybe(
                schema.arrayOf(
                  schema.string({
                    meta: { description: 'Label for categorizing the agent.' },
                  }),
                  {
                    meta: {
                      description: 'Optional labels for categorizing and organizing agents.',
                    },
                  }
                )
              ),
              access_control: schema.maybe(ACCESS_CONTROL_MODE_ONLY_SCHEMA),
              configuration: schema.object(
                {
                  instructions: schema.maybe(
                    schema.string({
                      meta: {
                        description: 'Optional system instructions that define the agent behavior.',
                      },
                    })
                  ),
                  tools: TOOL_SELECTION_SCHEMA,
                  skill_ids: schema.maybe(SKILLS_SCHEMA),
                  enable_elastic_capabilities: schema.maybe(
                    schema.boolean({
                      meta: {
                        description:
                          'When true, enables built-in Elastic capabilities for the agent.',
                      },
                    })
                  ),
                  workflow_ids: schema.maybe(
                    schema.arrayOf(
                      schema.string({
                        meta: {
                          description:
                            'Optional list of workflow IDs. When set, these workflows run before every agent execution, in order.',
                        },
                      }),
                      { maxSize: 100 }
                    )
                  ),
                  post_execution_workflow_ids: schema.maybe(
                    schema.arrayOf(
                      schema.string({
                        maxLength: 512,
                        meta: {
                          description:
                            'Optional list of workflow IDs. When set, these workflows run after the agent finishes each round.',
                        },
                      }),
                      { maxSize: 100 }
                    )
                  ),
                  plugin_ids: schema.maybe(PLUGINS_SCHEMA),
                  connector_ids: schema.maybe(CONNECTORS_SCHEMA),
                  ai_indices: schema.maybe(AI_INDICES_SCHEMA),
                },
                {
                  meta: { description: 'Configuration settings for the agent.' },
                }
              ),
            }),
          },
        },
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/agents_create.yaml'),
        },
      },
      wrapHandler(async (ctx, request, response) => {
        const { agents, auditLogService } = getInternalServices();
        const service = await agents.getRegistry({ request });

        const { body: createBody, contextEngineEnabled } = await handleExperimentalFeatures(
          request.body,
          ctx
        );

        try {
          const createdProfile = await service.create(createBody);
          analyticsService?.reportAgentCreated({
            agentId: request.body.id,
            toolSelection: request.body.configuration.tools,
          });
          auditLogService.logAgentCreated(request, {
            agentId: createdProfile.id,
            agentName: createdProfile.name,
          });
          return response.ok<CreateAgentResponse>({
            body: withAiIndices(createdProfile, contextEngineEnabled),
          });
        } catch (error) {
          auditLogService.logAgentCreated(request, {
            agentId: request.body.id,
            agentName: request.body.name,
            error: asError(error),
          });
          throw error;
        }
      })
    );

  // Update agent
  router.versioned
    .put({
      path: `${publicApiPath}/agents/{id}`,
      security: AGENTS_WRITE_SECURITY,
      access: 'public',
      summary: 'Update an agent',
      description:
        "Update an existing agent configuration. Use this endpoint to modify any aspect of the agent's behavior, appearance, or capabilities. To learn more about agents, refer to the [agents documentation](https://www.elastic.co/docs/explore-analyze/ai-features/agent-builder/agent-builder-agents).",
      options: {
        tags: ['agent', 'oas-tag:agent builder'],
        availability: {
          since: '9.2.0',
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            params: schema.object({
              id: schema.string({
                meta: { description: 'The unique identifier of the agent to update.' },
              }),
            }),
            body: schema.object({
              name: schema.maybe(
                schema.string({
                  meta: { description: 'Updated display name for the agent.' },
                })
              ),
              description: schema.maybe(
                schema.string({
                  meta: { description: 'Updated description of what the agent does.' },
                })
              ),
              avatar_color: schema.maybe(
                schema.string({
                  meta: { description: 'Updated hex color code for the agent avatar.' },
                })
              ),
              avatar_symbol: schema.maybe(
                schema.string({
                  meta: { description: 'Updated symbol/initials for the agent avatar.' },
                })
              ),
              labels: schema.maybe(
                schema.arrayOf(
                  schema.string({
                    meta: { description: 'Updated label for categorizing the agent.' },
                  }),
                  {
                    meta: { description: 'Updated labels for categorizing and organizing agents.' },
                  }
                )
              ),
              access_control: schema.maybe(ACCESS_CONTROL_MODE_ONLY_SCHEMA),
              configuration: schema.maybe(
                schema.object(
                  {
                    instructions: schema.maybe(
                      schema.string({
                        meta: {
                          description:
                            'Updated system instructions that define the agent behavior.',
                        },
                      })
                    ),
                    tools: schema.maybe(TOOL_SELECTION_SCHEMA),
                    skill_ids: schema.maybe(SKILLS_SCHEMA),
                    enable_elastic_capabilities: schema.maybe(
                      schema.boolean({
                        meta: {
                          description:
                            'When true, enables built-in Elastic capabilities for the agent.',
                        },
                      })
                    ),
                    workflow_ids: schema.maybe(
                      schema.arrayOf(
                        schema.string({
                          meta: {
                            description:
                              'Updated list of workflow IDs. When set, these workflows run every agent execution, in order.',
                          },
                        }),
                        { maxSize: 100 }
                      )
                    ),
                    post_execution_workflow_ids: schema.maybe(
                      schema.arrayOf(
                        schema.string({
                          maxLength: 512,
                          meta: {
                            description:
                              'Updated list of workflow IDs. When set, these workflows run after the agent finishes each round.',
                          },
                        }),
                        { maxSize: 100 }
                      )
                    ),
                    plugin_ids: schema.maybe(PLUGINS_SCHEMA),
                    connector_ids: schema.maybe(CONNECTORS_SCHEMA),
                    ai_indices: schema.maybe(AI_INDICES_SCHEMA),
                  },
                  {
                    meta: { description: 'Updated configuration settings for the agent.' },
                  }
                )
              ),
            }),
          },
        },
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/agents_update.yaml'),
        },
      },
      wrapHandler(async (ctx, request, response) => {
        const { agents, auditLogService } = getInternalServices();
        const service = await agents.getRegistry({ request });

        const { body: updateBody, contextEngineEnabled } = await handleExperimentalFeatures(
          request.body,
          ctx
        );

        try {
          const profile = await service.update(request.params.id, updateBody);
          analyticsService?.reportAgentUpdated({
            agentId: profile.id,
            toolSelection: profile.configuration.tools,
          });
          auditLogService.logAgentUpdated(request, {
            agentId: profile.id,
            agentName: profile.name,
          });
          return response.ok<UpdateAgentResponse>({
            body: withAiIndices(profile, contextEngineEnabled),
          });
        } catch (error) {
          auditLogService.logAgentUpdated(request, {
            agentId: request.params.id,
            error: asError(error),
          });
          throw error;
        }
      })
    );

  // Delete agent
  router.versioned
    .delete({
      path: `${publicApiPath}/agents/{id}`,
      security: AGENTS_WRITE_SECURITY,
      access: 'public',
      summary: 'Delete an agent',
      description:
        'Delete an agent by ID. This action cannot be undone. To learn more about agents, refer to the [agents documentation](https://www.elastic.co/docs/explore-analyze/ai-features/agent-builder/agent-builder-agents).',
      options: {
        tags: ['agent', 'oas-tag:agent builder'],
        availability: {
          since: '9.2.0',
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            params: schema.object({
              id: schema.string({
                meta: { description: 'The unique identifier of the agent to delete.' },
              }),
            }),
          },
        },
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/agents_delete.yaml'),
        },
      },
      wrapHandler(async (ctx, request, response) => {
        const { agents, auditLogService } = getInternalServices();
        const service = await agents.getRegistry({ request });

        try {
          const result = await service.delete({ id: request.params.id });
          if (result) {
            auditLogService.logAgentDeleted(request, { agentId: request.params.id });
          } else {
            auditLogService.logAgentDeleted(request, {
              agentId: request.params.id,
              error: new Error('Agent delete returned false'),
            });
          }
          return response.ok<DeleteAgentResponse>({
            body: {
              success: result,
            },
          });
        } catch (error) {
          auditLogService.logAgentDeleted(request, {
            agentId: request.params.id,
            error: asError(error),
          });
          throw error;
        }
      })
    );

  // Get agent access control
  router.versioned
    .get({
      path: `${publicApiPath}/agents/{id}/access_control`,
      security: AGENT_BUILDER_READ_SECURITY,
      access: 'public',
      summary: "Get an agent's access control list",
      description:
        'Get the access control for a specific agent. Callers without permission to manage access control receive `permissions.update_access_control: false` and only their own entry. To learn more about agents, refer to the [agents documentation](https://www.elastic.co/docs/explore-analyze/ai-features/agent-builder/agent-builder-agents).',
      options: {
        tags: ['agent', 'oas-tag:agent builder'],
        availability: { since: '9.5.0' },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            params: schema.object({
              id: schema.string({
                meta: {
                  description:
                    'The unique identifier of the agent whose access control to retrieve.',
                },
              }),
            }),
          },
        },
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/agents_access_control_get.yaml'),
        },
      },
      wrapHandler(async (ctx, request, response) => {
        const { agents } = getInternalServices();
        const service = await agents.getRegistry({ request });
        const body = await service.getAccessControl(request.params.id);

        return response.ok<GetAgentAccessControlResponse>({ body });
      })
    );

  // Update agent access control
  router.versioned
    .put({
      path: `${publicApiPath}/agents/{id}/access_control`,
      security: AGENTS_WRITE_SECURITY,
      access: 'public',
      summary: "Update an agent's access control list",
      description:
        'Replace the per-agent access-control entries. Each entry identifies one user by their stable user profile `id` (preferred) or, for entries created before ids were adopted, by `name`. The agent owner, cluster admins, and anyone access control grants Manager can call this endpoint. Each call replaces the entire entries list — the most recent successful update wins. To learn more about agents, refer to the [agents documentation](https://www.elastic.co/docs/explore-analyze/ai-features/agent-builder/agent-builder-agents).',
      options: {
        tags: ['agent', 'oas-tag:agent builder'],
        availability: { since: '9.5.0' },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            params: schema.object({
              id: schema.string({
                meta: {
                  description: 'The unique identifier of the agent whose access control to update.',
                },
              }),
            }),
            body: schema.object({
              entries: ACCESS_CONTROL_ENTRIES_SCHEMA,
            }),
          },
        },
        options: {
          oasOperationObject: () =>
            path.join(__dirname, 'examples/agents_access_control_update.yaml'),
        },
      },
      wrapHandler(async (ctx, request, response) => {
        const { agents, auditLogService } = getInternalServices();
        const service = await agents.getRegistry({ request });

        try {
          const updatedAccessControl = await service.updateAccessControl(
            request.params.id,
            request.body as UpdateAgentAccessControlRequestBody
          );
          auditLogService.logAgentUpdated(request, {
            agentId: request.params.id,
          });
          return response.ok<UpdateAgentAccessControlResponse>({ body: updatedAccessControl });
        } catch (error) {
          auditLogService.logAgentUpdated(request, {
            agentId: request.params.id,
            error: asError(error),
          });
          throw error;
        }
      })
    );
}
