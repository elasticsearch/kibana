/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import moment from 'moment';
import semverIsValid from 'semver/functions/valid';

import { RequestDiagnosticsAdditionalMetrics } from '../../../common/types';

import { SO_SEARCH_LIMIT, AGENTS_PREFIX, AGENT_MAPPINGS } from '../../constants';

import { NewAgentActionSchema } from '../models';

import { validateKuery } from '../../routes/utils/filter_utils';
import { ListResponseSchema } from '../../routes/schema/utils';

const ActionIdSchema = schema.object({
  actionId: schema.string(),
});

const ActionIdOrMessageSchema = schema.oneOf([
  schema.object(
    {
      actionId: schema.string(),
    },
    { meta: { id: 'action_id_response' } }
  ),
  schema.object(
    {
      message: schema.string(),
    },
    { meta: { id: 'action_message_response' } }
  ),
]);

export const GetAgentsRequestSchema = {
  query: schema.object(
    {
      page: schema.maybe(schema.number({ meta: { description: 'Page number' } })),
      perPage: schema.number({
        defaultValue: 20,
        meta: { description: 'Number of results per page' },
      }),
      kuery: schema.maybe(
        schema.string({
          meta: { description: 'A KQL query string to filter results' },
          validate: (value: string) => {
            const validationObj = validateKuery(value, [AGENTS_PREFIX], AGENT_MAPPINGS, true);
            if (validationObj?.error) {
              return validationObj?.error;
            }
          },
        })
      ),
      showAgentless: schema.boolean({
        defaultValue: true,
        meta: { description: 'When true, include agentless agents in the results' },
      }),
      showInactive: schema.boolean({
        defaultValue: false,
        meta: { description: 'When true, include inactive agents in the results' },
      }),
      withMetrics: schema.boolean({
        defaultValue: false,
        meta: { description: 'When true, include CPU and memory metrics in the response' },
      }),
      showUpgradeable: schema.boolean({
        defaultValue: false,
        meta: { description: 'When true, only return agents that are upgradeable' },
      }),
      getStatusSummary: schema.boolean({
        defaultValue: false,
        meta: { description: 'When true, return a summary of agent statuses in the response' },
      }),
      sortField: schema.maybe(schema.string({ meta: { description: 'Field to sort results by' } })),
      sortOrder: schema.maybe(
        schema.oneOf([schema.literal('asc'), schema.literal('desc')], {
          meta: { description: 'Sort order, ascending or descending' },
        })
      ),
      searchAfter: schema.maybe(
        schema.string({
          meta: { description: 'JSON-encoded array of sort values for `search_after` pagination' },
        })
      ),
      openPit: schema.maybe(
        schema.boolean({
          meta: { description: 'When true, opens a new point-in-time for pagination' },
        })
      ),
      pitId: schema.maybe(
        schema.string({ meta: { description: 'Point-in-time ID for pagination' } })
      ),
      pitKeepAlive: schema.maybe(
        schema.string({
          meta: { description: 'Duration to keep the point-in-time alive, for example, `1m`' },
        })
      ),
    },
    {
      validate: (request) => {
        const usingSearchAfter = !!request.searchAfter;
        const usingPIT = !!(request.openPit || request.pitId || request.pitKeepAlive);

        // If using PIT search, ensure that all required PIT parameters are provided
        if (usingPIT) {
          if (request.openPit && request.pitId) {
            return 'You cannot request to open a new point-in-time with an existing pitId';
          }
          if (!request.pitKeepAlive) {
            return 'You must provide pitKeepAlive when using point-in-time parameters';
          }
        }

        // Ensure that pagination parameters are not over the search limit
        if ((request.page || 1) * request.perPage > SO_SEARCH_LIMIT) {
          return `You cannot use page and perPage page over ${SO_SEARCH_LIMIT} agents`;
        }

        // If using searchAfter:
        //   1. ensure that incompatible pagination parameters are not used
        //   2. ensure that searchAfter is an array
        if (usingSearchAfter) {
          if (request.page) {
            return 'You cannot use page parameter when using searchAfter';
          }
          // ensure that searchAfter is an array after parsing json
          try {
            const searchAfterArray = JSON.parse(request.searchAfter);

            if (!Array.isArray(searchAfterArray) || searchAfterArray.length === 0) {
              return 'searchAfter must be a non-empty array';
            }
          } catch (e) {
            return 'searchAfter must be a non-empty array';
          }
        }
      },
    }
  ),
};

export const MigrateOptionsSchema = {
  ca_sha256: schema.maybe(schema.string()),
  certificate_authorities: schema.maybe(schema.string()),
  elastic_agent_cert: schema.maybe(schema.string()),
  elastic_agent_cert_key: schema.maybe(schema.string()),
  elastic_agent_cert_key_passphrase: schema.maybe(schema.string()),
  headers: schema.maybe(schema.recordOf(schema.string(), schema.string())),
  insecure: schema.maybe(schema.boolean()),
  proxy_disabled: schema.maybe(schema.boolean()),
  proxy_headers: schema.maybe(schema.recordOf(schema.string(), schema.string())),
  proxy_url: schema.maybe(schema.string()),
  staging: schema.maybe(schema.string()),
  tags: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 10 })),
  replace_token: schema.maybe(schema.string()),
};

export const BulkMigrateOptionsSchema = {
  ca_sha256: schema.maybe(schema.string()),
  certificate_authorities: schema.maybe(schema.string()),
  elastic_agent_cert: schema.maybe(schema.string()),
  elastic_agent_cert_key: schema.maybe(schema.string()),
  elastic_agent_cert_key_passphrase: schema.maybe(schema.string()),
  headers: schema.maybe(schema.recordOf(schema.string(), schema.string())),
  insecure: schema.maybe(schema.boolean()),
  proxy_disabled: schema.maybe(schema.boolean()),
  proxy_headers: schema.maybe(schema.recordOf(schema.string(), schema.string())),
  proxy_url: schema.maybe(schema.string()),
  staging: schema.maybe(schema.string()),
  tags: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 10 })),
};

export const AgentComponentStateSchema = schema.oneOf([
  schema.literal('STARTING'),
  schema.literal('CONFIGURING'),
  schema.literal('HEALTHY'),
  schema.literal('DEGRADED'),
  schema.literal('FAILED'),
  schema.literal('STOPPING'),
  schema.literal('STOPPED'),
]);

export const AgentUpgradeStateTypeSchema = schema.oneOf([
  schema.literal('UPG_REQUESTED'),
  schema.literal('UPG_SCHEDULED'),
  schema.literal('UPG_DOWNLOADING'),
  schema.literal('UPG_EXTRACTING'),
  schema.literal('UPG_REPLACING'),
  schema.literal('UPG_RESTARTING'),
  schema.literal('UPG_FAILED'),
  schema.literal('UPG_WATCHING'),
  schema.literal('UPG_ROLLBACK'),
]);

export const AgentStatusSchema = schema.oneOf([
  schema.literal('offline'),
  schema.literal('error'),
  schema.literal('online'),
  schema.literal('inactive'),
  schema.literal('enrolling'),
  schema.literal('unenrolling'),
  schema.literal('unenrolled'),
  schema.literal('updating'),
  schema.literal('degraded'),
  schema.literal('uninstalled'),
  schema.literal('orphaned'),
]);

export const AgentResponseSchema = schema.object({
  id: schema.string(),
  access_api_key: schema.maybe(schema.string()),
  default_api_key_history: schema.maybe(
    schema.arrayOf(
      schema.object(
        {
          id: schema.string(),
          retired_at: schema.string(),
        },
        {
          meta: { deprecated: true },
        }
      ),
      { maxSize: 100 }
    )
  ),
  outputs: schema.maybe(
    schema.recordOf(
      schema.string(),
      schema.object({
        api_key_id: schema.maybe(schema.string()),
        type: schema.maybe(schema.string()),
        to_retire_api_key_ids: schema.maybe(
          schema.arrayOf(
            schema.object({
              id: schema.string(),
              retired_at: schema.string(),
            }),
            { maxSize: 100 }
          )
        ),
      })
    )
  ),
  status: schema.maybe(AgentStatusSchema),
  pipeline_config: schema.maybe(schema.string({ maxLength: 10000 })),
  last_known_status: schema.maybe(AgentStatusSchema),
  packages: schema.arrayOf(schema.string(), { maxSize: 10000 }),
  sort: schema.maybe(schema.arrayOf(schema.any(), { maxSize: 10 })), // ES can return many different types for `sort` array values, including unsafe numbers
  metrics: schema.maybe(
    schema.object({
      cpu_avg: schema.maybe(schema.number()),
      memory_size_byte_avg: schema.maybe(schema.number()),
    })
  ),
  type: schema.oneOf([
    schema.literal('PERMANENT'),
    schema.literal('EPHEMERAL'),
    schema.literal('TEMPORARY'),
    schema.literal('OPAMP'),
  ]),
  active: schema.boolean(),
  enrolled_at: schema.string(),
  unenrolled_at: schema.maybe(schema.string()),
  unenrollment_started_at: schema.maybe(schema.string()),
  audit_unenrolled_reason: schema.maybe(schema.string()),
  upgraded_at: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
  upgrade_started_at: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
  upgrade_details: schema.maybe(
    schema.oneOf([
      schema.literal(null),
      schema.object({
        target_version: schema.string(),
        action_id: schema.string(),
        state: AgentUpgradeStateTypeSchema,
        metadata: schema.maybe(
          schema.object({
            scheduled_at: schema.maybe(schema.string()),
            download_percent: schema.maybe(schema.number()),
            download_rate: schema.maybe(schema.number()),
            failed_state: schema.maybe(AgentUpgradeStateTypeSchema),
            error_msg: schema.maybe(schema.string()),
            retry_error_msg: schema.maybe(schema.string()),
            retry_until: schema.maybe(schema.string()),
            reason: schema.maybe(schema.string()),
          })
        ),
      }),
    ])
  ),
  upgrade_attempts: schema.maybe(
    schema.oneOf([schema.literal(null), schema.arrayOf(schema.string(), { maxSize: 10000 })])
  ),
  access_api_key_id: schema.maybe(schema.string()),
  default_api_key: schema.maybe(schema.string()),
  default_api_key_id: schema.maybe(schema.string()),
  policy_id: schema.maybe(schema.string()),
  policy_revision: schema.maybe(schema.oneOf([schema.literal(null), schema.number()])),
  last_checkin: schema.maybe(schema.string()),
  last_checkin_status: schema.maybe(
    schema.oneOf([
      schema.literal('error'),
      schema.literal('online'),
      schema.literal('degraded'),
      schema.literal('updating'),
      schema.literal('starting'),
      schema.literal('disconnected'),
    ])
  ),
  last_checkin_message: schema.maybe(schema.string()),
  user_provided_metadata: schema.maybe(schema.recordOf(schema.string(), schema.any())),
  local_metadata: schema.recordOf(schema.string(), schema.any()),
  tags: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
  components: schema.maybe(
    schema.arrayOf(
      schema.object({
        id: schema.string(),
        type: schema.string(),
        status: AgentComponentStateSchema,
        message: schema.string(),
        units: schema.maybe(
          schema.arrayOf(
            schema.object({
              id: schema.string(),
              type: schema.oneOf([
                schema.literal('input'),
                schema.literal('output'),
                schema.literal(''),
              ]),
              status: AgentComponentStateSchema,
              message: schema.string(),
              payload: schema.maybe(schema.recordOf(schema.string(), schema.any())),
            }),
            { maxSize: 10000 }
          )
        ),
      }),
      { maxSize: 10000 }
    )
  ),
  agent: schema.maybe(
    schema
      .object({
        id: schema.string(),
        version: schema.string(),
        type: schema.maybe(schema.string()),
      })
      .extendsDeep({
        unknowns: 'allow',
      })
  ),
  unhealthy_reason: schema.maybe(
    schema.oneOf([
      schema.literal(null),
      schema.arrayOf(
        schema.oneOf([schema.literal('input'), schema.literal('output'), schema.literal('other')]),
        { maxSize: 3 }
      ),
    ])
  ),
  namespaces: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
  upgrade: schema.maybe(
    schema.object({
      rollbacks: schema.maybe(
        schema.arrayOf(
          schema.object({
            valid_until: schema.string(),
            version: schema.string(),
          }),
          {
            maxSize: 100,
          }
        )
      ),
    })
  ),
  identifying_attributes: schema.maybe(schema.recordOf(schema.string(), schema.string())),
  non_identifying_attributes: schema.maybe(schema.recordOf(schema.string(), schema.string())),
  sequence_num: schema.maybe(schema.number()),
  capabilities: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
  health: schema.maybe(schema.recordOf(schema.string(), schema.any())),
  effective_config: schema.maybe(schema.any()),
  signals: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 50 })),
});

export const GetAgentsResponseSchema = ListResponseSchema(AgentResponseSchema).extends({
  pit: schema.maybe(schema.string()),
  nextSearchAfter: schema.maybe(schema.string()),
  statusSummary: schema.maybe(schema.recordOf(AgentStatusSchema, schema.number())),
});

export const GetAgentResponseSchema = schema.object({
  item: AgentResponseSchema,
});

export const GetOneAgentRequestSchema = {
  params: schema.object({
    agentId: schema.string({ meta: { description: 'The agent ID' } }),
  }),
  query: schema.object({
    withMetrics: schema.boolean({
      defaultValue: false,
      meta: { description: 'When true, include CPU and memory metrics in the response' },
    }),
  }),
};

export const GetAgentEffectiveConfigRequestSchema = {
  params: schema.object({
    agentId: schema.string({
      meta: { description: 'The agent ID to get effective config of' },
    }),
  }),
};

export const GetAgentEffectiveConfigResponseSchema = schema.object({
  effective_config: schema.maybe(schema.any()),
});

export const PostNewAgentActionRequestSchema = {
  body: schema.object({
    action: NewAgentActionSchema,
  }),
  params: schema.object({
    agentId: schema.string({ meta: { description: 'The agent ID' } }),
  }),
};

export const PostNewAgentActionResponseSchema = schema.object({
  item: schema.object({
    id: schema.string(),
    type: schema.string(), // literals
    data: schema.maybe(schema.any()),
    sent_at: schema.maybe(schema.string()),
    created_at: schema.string(),
    ack_data: schema.maybe(schema.any()),
    agents: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 10000 })),
    namespaces: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
    expiration: schema.maybe(schema.string()),
    start_time: schema.maybe(schema.string()),
    minimum_execution_duration: schema.maybe(schema.number()),
    rollout_duration_seconds: schema.maybe(schema.number()),
    source_uri: schema.maybe(schema.string()),
    total: schema.maybe(schema.number()),
  }),
});

export const PostCancelActionRequestSchema = {
  params: schema.object({
    actionId: schema.string({ meta: { description: 'The ID of the action to cancel' } }),
  }),
};

export const PostRetrieveAgentsByActionsRequestSchema = {
  body: schema.object({
    actionIds: schema.arrayOf(schema.string(), { maxSize: 1000 }),
  }),
};

export const PostRetrieveAgentsByActionsResponseSchema = schema.object({
  items: schema.arrayOf(schema.string(), { maxSize: 10000 }),
});

export const PostAgentUnenrollRequestSchema = {
  params: schema.object({
    agentId: schema.string({ meta: { description: 'The agent ID' } }),
  }),
  body: schema.nullable(
    schema.object({
      force: schema.maybe(schema.boolean()),
      revoke: schema.maybe(schema.boolean()),
    })
  ),
};

export const PostBulkAgentUnenrollRequestSchema = {
  body: schema.object({
    agents: schema.oneOf([
      schema.arrayOf(
        schema.string({
          meta: {
            description: 'list of agent IDs',
          },
        }),
        { maxSize: 10000 }
      ),
      schema.string({
        meta: {
          description: 'KQL query string, leave empty to action all agents',
        },
      }),
    ]),
    force: schema.maybe(
      schema.boolean({
        meta: {
          description: 'Unenrolls hosted agents too',
        },
      })
    ),
    revoke: schema.maybe(
      schema.boolean({
        meta: {
          description: 'Revokes API keys of agents',
        },
      })
    ),
    batchSize: schema.maybe(schema.number()),
    includeInactive: schema.maybe(
      schema.boolean({
        meta: {
          description: 'When passing agents by KQL query, unenrolls inactive agents too',
        },
      })
    ),
  }),
};

export const PostRemoveCollectorRequestSchema = {
  params: schema.object({
    agentId: schema.string({ meta: { description: 'The collector agent ID' } }),
  }),
};

export const PostBulkRemoveCollectorsRequestSchema = {
  body: schema.object({
    agents: schema.oneOf([
      schema.arrayOf(
        schema.string({
          meta: { description: 'List of collector agent IDs' },
        }),
        { maxSize: 10000 }
      ),
      schema.string({
        meta: { description: 'KQL query string. Leave empty to target all collectors' },
      }),
    ]),
    includeInactive: schema.maybe(
      schema.boolean({
        meta: {
          description: 'When passing collectors by KQL query, also removes inactive collectors',
        },
      })
    ),
  }),
};

function validateVersion(s: string) {
  if (!semverIsValid(s)) {
    return 'not a valid semver';
  }
}

export const PostAgentUpgradeRequestSchema = {
  params: schema.object({
    agentId: schema.string({ meta: { description: 'The agent ID' } }),
  }),
  body: schema.object({
    source_uri: schema.maybe(schema.string()),
    version: schema.string({
      validate: validateVersion,
    }),
    force: schema.maybe(schema.boolean()),
    skipRateLimitCheck: schema.maybe(schema.boolean()),
  }),
};

export const PostBulkAgentUpgradeRequestSchema = {
  body: schema.object({
    agents: schema.oneOf([schema.arrayOf(schema.string(), { maxSize: 10000 }), schema.string()]),
    source_uri: schema.maybe(schema.string()),
    version: schema.string({ validate: validateVersion }),
    force: schema.maybe(schema.boolean()),
    skipRateLimitCheck: schema.maybe(schema.boolean()),
    rollout_duration_seconds: schema.maybe(schema.number({ min: 600 })),
    start_time: schema.maybe(
      schema.string({
        validate: (v: string) => {
          if (!moment(v).isValid()) {
            return 'not a valid date';
          }
        },
      })
    ),
    batchSize: schema.maybe(schema.number()),
    includeInactive: schema.boolean({ defaultValue: false }),
  }),
};

export const PostAgentReassignRequestSchema = {
  params: schema.object({
    agentId: schema.string({ meta: { description: 'The agent ID' } }),
  }),
  body: schema.object({
    policy_id: schema.string(),
  }),
};

export const PostRequestDiagnosticsActionRequestSchema = {
  params: schema.object({
    agentId: schema.string({ meta: { description: 'The agent ID' } }),
  }),
  body: schema.nullable(
    schema.object({
      additional_metrics: schema.maybe(
        schema.arrayOf(schema.oneOf([schema.literal(RequestDiagnosticsAdditionalMetrics.CPU)]), {
          maxSize: 1,
        })
      ),
    })
  ),
};

export const PostBulkRequestDiagnosticsActionRequestSchema = {
  body: schema.object({
    agents: schema.oneOf([schema.arrayOf(schema.string(), { maxSize: 10000 }), schema.string()]),
    batchSize: schema.maybe(schema.number()),
    additional_metrics: schema.maybe(
      schema.arrayOf(schema.oneOf([schema.literal(RequestDiagnosticsAdditionalMetrics.CPU)]), {
        maxSize: 1,
      })
    ),
  }),
};

export const ListAgentUploadsRequestSchema = {
  params: schema.object({
    agentId: schema.string({ meta: { description: 'The agent ID' } }),
  }),
};

export const ListAgentUploadsResponseSchema = schema.object({
  items: schema.arrayOf(
    schema.object({
      id: schema.string(),
      name: schema.string(),
      filePath: schema.string(),
      createTime: schema.string(),
      status: schema.oneOf([
        schema.literal('READY'),
        schema.literal('AWAITING_UPLOAD'),
        schema.literal('DELETED'),
        schema.literal('EXPIRED'),
        schema.literal('IN_PROGRESS'),
        schema.literal('FAILED'),
      ]),
      actionId: schema.string(),
      error: schema.maybe(schema.string()),
    }),
    { maxSize: 10000 }
  ),
});

export const GetAgentUploadFileRequestSchema = {
  params: schema.object({
    fileId: schema.string({ meta: { description: 'The ID of the uploaded file' } }),
    fileName: schema.string({ meta: { description: 'The name of the uploaded file' } }),
  }),
};

export const DeleteAgentUploadFileRequestSchema = {
  params: schema.object({
    fileId: schema.string({ meta: { description: 'The ID of the uploaded file' } }),
  }),
};

export const DeleteAgentUploadFileResponseSchema = schema.object({
  id: schema.string(),
  deleted: schema.boolean(),
});

export const PostBulkAgentReassignRequestSchema = {
  body: schema.object({
    policy_id: schema.string(),
    agents: schema.oneOf([schema.arrayOf(schema.string(), { maxSize: 10000 }), schema.string()]),
    batchSize: schema.maybe(schema.number()),
    includeInactive: schema.boolean({ defaultValue: false }),
  }),
};

export const DeleteAgentRequestSchema = {
  params: schema.object({
    agentId: schema.string({ meta: { description: 'The agent ID' } }),
  }),
};

export const DeleteAgentResponseSchema = schema.object({
  action: schema.literal('deleted'),
});

export const UpdateAgentRequestSchema = {
  params: schema.object({
    agentId: schema.string({ meta: { description: 'The agent ID' } }),
  }),
  body: schema.object({
    user_provided_metadata: schema.maybe(schema.recordOf(schema.string(), schema.any())),
    tags: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 10 })),
  }),
};

export const MigrateSingleAgentRequestSchema = {
  params: schema.object({
    agentId: schema.string({ meta: { description: 'The agent ID' } }),
  }),
  body: schema.object({
    uri: schema.uri(),
    enrollment_token: schema.string(),
    settings: schema.maybe(schema.object(MigrateOptionsSchema)),
  }),
};

export const MigrateSingleAgentResponseSchema = ActionIdSchema;

export const BulkMigrateAgentsRequestSchema = {
  body: schema.object({
    agents: schema.oneOf([schema.arrayOf(schema.string(), { maxSize: 10000 }), schema.string()]),
    uri: schema.uri(),
    enrollment_token: schema.string(),
    settings: schema.maybe(schema.object(BulkMigrateOptionsSchema)),
    batchSize: schema.maybe(schema.number()),
  }),
};

export const BulkMigrateAgentsResponseSchema = ActionIdSchema;

export const PostBulkUpdateAgentTagsRequestSchema = {
  body: schema.object({
    agents: schema.oneOf([schema.arrayOf(schema.string(), { maxSize: 10000 }), schema.string()]),
    tagsToAdd: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 10 })),
    tagsToRemove: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 10 })),
    batchSize: schema.maybe(schema.number()),
    includeInactive: schema.boolean({ defaultValue: false }),
  }),
};

export const PostBulkActionResponseSchema = ActionIdSchema;

export const GetAgentStatusRequestSchema = {
  query: schema.object({
    policyId: schema.maybe(schema.string({ meta: { description: 'Filter by agent policy ID' } })),
    policyIds: schema.maybe(
      schema.oneOf([schema.arrayOf(schema.string(), { maxSize: 1000 }), schema.string()], {
        meta: { description: 'Filter by one or more agent policy IDs' },
      })
    ),
    kuery: schema.maybe(
      schema.string({
        meta: { description: 'A KQL query string to filter results' },
        validate: (value: string) => {
          const validationObj = validateKuery(value, [AGENTS_PREFIX], AGENT_MAPPINGS, true);
          if (validationObj?.error) {
            return validationObj?.error;
          }
        },
      })
    ),
  }),
};

export const GetAgentStatusResponseSchema = schema.object({
  results: schema.object({
    events: schema.number(),
    online: schema.number(),
    error: schema.number(),
    offline: schema.number(),
    uninstalled: schema.maybe(schema.number()),
    orphaned: schema.maybe(schema.number()),
    other: schema.number(),
    updating: schema.number(),
    inactive: schema.number(),
    unenrolled: schema.number(),
    all: schema.number(),
    active: schema.number(),
  }),
});

export const GetAgentDataRequestSchema = {
  query: schema.object({
    agentsIds: schema.oneOf(
      [schema.arrayOf(schema.string(), { maxSize: 10000 }), schema.string()],
      {
        meta: { description: 'Agent IDs to check data for, as an array or comma-separated string' },
      }
    ),
    pkgName: schema.maybe(
      schema.string({ meta: { description: 'Filter by integration package name' } })
    ),
    pkgVersion: schema.maybe(
      schema.string({ meta: { description: 'Filter by integration package version' } })
    ),
    previewData: schema.boolean({
      defaultValue: false,
      meta: { description: 'When true, return a preview of the ingested data' },
    }),
  }),
};

export const GetAgentDataResponseSchema = schema.object({
  items: schema.arrayOf(
    schema.recordOf(
      schema.string(),
      schema.object({
        data: schema.boolean(),
      })
    ),
    { maxSize: 10000 }
  ),
  dataPreview: schema.arrayOf(schema.any(), { maxSize: 10000 }),
});

export const GetActionStatusRequestSchema = {
  query: schema.object({
    page: schema.number({ defaultValue: 0, meta: { description: 'Page number' } }),
    perPage: schema.number({
      defaultValue: 20,
      meta: { description: 'Number of results per page' },
    }),
    date: schema.maybe(
      schema.string({
        meta: { description: 'Return actions created before this date' },
        validate: (v: string) => {
          if (!moment(v).isValid()) {
            return 'not a valid date';
          }
        },
      })
    ),
    latest: schema.maybe(
      schema.number({ meta: { description: 'Return only the latest N actions' } })
    ),
    errorSize: schema.number({
      defaultValue: 5,
      meta: { description: 'Number of error details to include per action' },
    }),
  }),
};

export const GetActionStatusResponseSchema = schema.object({
  items: schema.arrayOf(
    schema.object({
      actionId: schema.string(),
      is_automatic: schema.maybe(schema.boolean()),

      nbAgentsActionCreated: schema.number({
        meta: {
          description: 'number of agents included in action from kibana',
        },
      }),
      nbAgentsAck: schema.number({
        meta: {
          description: 'number of agents that acknowledged the action',
        },
      }),
      nbAgentsFailed: schema.number({
        meta: {
          description: 'number of agents that failed to execute the action',
        },
      }),
      version: schema.maybe(
        schema.string({
          meta: {
            description: 'agent version number (UPGRADE action)',
          },
        })
      ),
      startTime: schema.maybe(
        schema.string({
          meta: {
            description: 'start time of action (scheduled actions)',
          },
        })
      ),
      type: schema.oneOf([
        schema.literal('UPGRADE'),
        schema.literal('UNENROLL'),
        schema.literal('SETTINGS'),
        schema.literal('POLICY_REASSIGN'),
        schema.literal('CANCEL'),
        schema.literal('FORCE_UNENROLL'),
        schema.literal('REQUEST_DIAGNOSTICS'),
        schema.literal('UPDATE_TAGS'),
        schema.literal('POLICY_CHANGE'),
        schema.literal('INPUT_ACTION'),
        schema.literal('MIGRATE'),
        schema.literal('PRIVILEGE_LEVEL_CHANGE'),
        schema.literal('ROLLBACK'),
        schema.literal('REMOVE_COLLECTOR'),
      ]),
      nbAgentsActioned: schema.number({
        meta: {
          description: 'number of agents actioned',
        },
      }),
      status: schema.oneOf([
        schema.literal('COMPLETE'),
        schema.literal('EXPIRED'),
        schema.literal('CANCELLED'),
        schema.literal('FAILED'),
        schema.literal('IN_PROGRESS'),
        schema.literal('ROLLOUT_PASSED'),
      ]),
      expiration: schema.maybe(schema.string()),
      completionTime: schema.maybe(schema.string()),
      cancellationTime: schema.maybe(schema.string()),
      newPolicyId: schema.maybe(
        schema.string({
          meta: {
            description: 'new policy id (POLICY_REASSIGN action)',
          },
        })
      ),
      creationTime: schema.string({
        meta: {
          description: 'creation time of action',
        },
      }),
      hasRolloutPeriod: schema.maybe(schema.boolean()),
      latestErrors: schema.maybe(
        schema.arrayOf(
          schema.object(
            {
              agentId: schema.string(),
              error: schema.string(),
              timestamp: schema.string(),
              hostname: schema.maybe(schema.string()),
            },
            {
              meta: {
                description: 'latest errors that happened when the agents executed the action',
              },
            }
          ),
          { maxSize: 10 }
        )
      ),
      revision: schema.maybe(
        schema.number({
          meta: {
            description: 'new policy revision (POLICY_CHANGE action)',
          },
        })
      ),
      policyId: schema.maybe(
        schema.string({
          meta: {
            description: 'policy id (POLICY_CHANGE action)',
          },
        })
      ),
    }),
    { maxSize: 10000 }
  ),
});

export const GetAvailableAgentVersionsResponseSchema = schema.object({
  items: schema.arrayOf(schema.string(), { maxSize: 10000 }),
});

export const ChangeAgentPrivilegeLevelRequestSchema = {
  params: schema.object({
    agentId: schema.string({
      meta: { description: 'The agent ID to change privilege level for' },
    }),
  }),
  body: schema.nullable(
    schema.object({
      user_info: schema.maybe(
        schema.object({
          username: schema.maybe(schema.string()),
          groupname: schema.maybe(schema.string()),
          password: schema.maybe(schema.string()),
        })
      ),
    })
  ),
};

export const ChangeAgentPrivilegeLevelResponseSchema = ActionIdOrMessageSchema;

export const BulkChangeAgentsPrivilegeLevelRequestSchema = {
  body: schema.object({
    agents: schema.oneOf([schema.arrayOf(schema.string(), { maxSize: 10000 }), schema.string()]),
    batchSize: schema.maybe(schema.number()),
    user_info: schema.maybe(
      schema.object({
        username: schema.maybe(schema.string()),
        groupname: schema.maybe(schema.string()),
        password: schema.maybe(schema.string()),
      })
    ),
  }),
};

export const BulkChangeAgentsPrivilegeLevelResponseSchema = ActionIdSchema;

export const PostAgentRollbackRequestSchema = {
  params: schema.object({
    agentId: schema.string({
      meta: { description: 'The agent ID to rollback' },
    }),
  }),
};

export const PostAgentRollbackResponseSchema = ActionIdOrMessageSchema;

export const PostBulkAgentRollbackRequestSchema = {
  body: schema.object({
    agents: schema.oneOf([schema.arrayOf(schema.string(), { maxSize: 10000 }), schema.string()]),
    batchSize: schema.maybe(schema.number()),
    includeInactive: schema.boolean({ defaultValue: false }),
  }),
};

export const PostBulkAgentRollbackResponseSchema = schema.object({
  actionIds: schema.arrayOf(schema.string(), { maxSize: 10000 }),
});

export const PostGenerateAgentsReportRequestSchema = {
  body: schema.object({
    agents: schema.oneOf([
      schema.arrayOf(schema.string(), { maxSize: 10000 }),
      schema.string({
        validate: (value: string) => {
          const validationObj = validateKuery(value, [AGENTS_PREFIX], AGENT_MAPPINGS, true);
          if (validationObj?.error) {
            return validationObj?.error;
          }
        },
      }),
    ]),
    fields: schema.arrayOf(schema.string(), { maxSize: 100 }),
    timezone: schema.maybe(schema.string()),
    sort: schema.maybe(
      schema.object({
        field: schema.maybe(schema.string()),
        direction: schema.maybe(schema.oneOf([schema.literal('asc'), schema.literal('desc')])),
      })
    ),
  }),
};

export const PostGenerateAgentsReportResponseSchema = schema.object({
  url: schema.string(),
});
