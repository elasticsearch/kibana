/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import path from 'node:path';
import { AgentAccessControlRole, AgentAccessControlMode } from '@kbn/agent-builder-common';
import type { RouteDependencies } from './types';
import { getHandlerWrapper } from './wrap_handler';
import { publicApiPath } from '../../common/constants';
import { AGENT_BUILDER_READ_SECURITY, AGENTS_WRITE_SECURITY } from './route_security';
import type {
  GetAgentResponse,
  CreateAgentResponse,
  UpdateAgentResponse,
  DeleteAgentResponse,
  GetAgentAccessControlResponse,
  ListAgentResponse,
  UpdateAgentAccessControlRequestBody,
  UpdateAgentAccessControlResponse,
} from '../../common/http_api/agents';
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

const ACCESS_CONTROL_MODE_SCHEMA = schema.oneOf(
  [
    schema.literal(AgentAccessControlMode.Public),
    schema.literal(AgentAccessControlMode.Shared),
    schema.literal(AgentAccessControlMode.Private),
  ],
  {
    meta: {
      description:
        '**Technical Preview; added in 9.4.0.** Access-control mode: `public` (any privileged user can read/write), `shared` (any privileged user can read, only owner can write), `private` (only owner can read/write).',
    },
  }
);

const ACCESS_CONTROL_ENTRIES_SCHEMA = schema.arrayOf(
  schema.object({
    type: schema.literal('user'),
    name: schema.string({
      minLength: 1,
      maxLength: 1024,
      meta: {
        description: 'Case-sensitive Kibana username of the principal to grant access to.',
      },
    }),
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
  }),
  {
    maxSize: 100,
    meta: {
      description:
        'Access-control entries to apply to the agent. Each entry has a `type` (currently only `user` is supported), a `name` (the principal username), and a `role`.',
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
        return response.ok<ListAgentResponse>({
          body: { results: agents },
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
        return response.ok<GetAgentResponse>({ body: profile });
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
                  plugin_ids: schema.maybe(PLUGINS_SCHEMA),
                  connector_ids: schema.maybe(CONNECTORS_SCHEMA),
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

        try {
          const createdProfile = await service.create(request.body);
          analyticsService?.reportAgentCreated({
            agentId: request.body.id,
            toolSelection: request.body.configuration.tools,
          });
          auditLogService.logAgentCreated(request, {
            agentId: createdProfile.id,
            agentName: createdProfile.name,
          });
          return response.ok<CreateAgentResponse>({ body: createdProfile });
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
                    plugin_ids: schema.maybe(PLUGINS_SCHEMA),
                    connector_ids: schema.maybe(CONNECTORS_SCHEMA),
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

        try {
          const profile = await service.update(request.params.id, request.body);
          analyticsService?.reportAgentUpdated({
            agentId: profile.id,
            toolSelection: profile.configuration.tools,
          });
          auditLogService.logAgentUpdated(request, {
            agentId: profile.id,
            agentName: profile.name,
          });
          return response.ok<UpdateAgentResponse>({ body: profile });
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
        'Replace the per-agent access-control entries. The agent owner, cluster admins, and anyone access control grants Manager can call this endpoint. Each call replaces the entire entries list — the most recent successful update wins. To learn more about agents, refer to the [agents documentation](https://www.elastic.co/docs/explore-analyze/ai-features/agent-builder/agent-builder-agents).',
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
