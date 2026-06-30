/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

import {
  AgentPolicyResponseSchema,
  FullAgentPolicyResponseSchema,
  NewAgentPolicySchema,
} from '../models';
import { inputsFormat } from '../../../common/constants';
import { LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE, AGENT_POLICY_MAPPINGS } from '../../constants';

import { validateKuery } from '../../routes/utils/filter_utils';

import { BulkRequestBodySchema } from './common';
import { CreatePackagePolicyRequestSchema } from './package_policy';

export const GetAgentPoliciesRequestSchema = {
  query: schema.object(
    {
      page: schema.maybe(schema.number({ defaultValue: 1, meta: { description: 'Page number' } })),
      perPage: schema.maybe(
        schema.number({ defaultValue: 20, meta: { description: 'Number of results per page' } })
      ),
      sortField: schema.maybe(schema.string({ meta: { description: 'Field to sort results by' } })),
      sortOrder: schema.maybe(
        schema.oneOf([schema.literal('desc'), schema.literal('asc')], {
          meta: { description: 'Sort order, ascending or descending' },
        })
      ),
      showUpgradeable: schema.maybe(
        schema.boolean({
          meta: { description: 'When true, only show policies with upgradeable agents' },
        })
      ),
      kuery: schema.maybe(
        schema.string({
          meta: { description: 'A KQL query string to filter results' },
          validate: (value: string) => {
            const validationObj = validateKuery(
              value,
              [LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE],
              AGENT_POLICY_MAPPINGS,
              true
            );
            if (validationObj?.error) {
              return validationObj?.error;
            }
          },
        })
      ),
      noAgentCount: schema.maybe(
        schema.boolean({
          meta: { description: 'use withAgentCount instead', deprecated: true },
        })
      ),
      withAgentCount: schema.maybe(
        schema.boolean({
          meta: { description: 'get policies with agent count' },
        })
      ),
      full: schema.maybe(
        schema.boolean({
          meta: { description: 'get full policies with package policies populated' },
        })
      ),
      format: schema.maybe(
        schema.oneOf(
          [schema.literal(inputsFormat.Simplified), schema.literal(inputsFormat.Legacy)],
          {
            meta: { description: 'Format for the response: simplified or legacy' },
          }
        )
      ),
    },
    {
      validate: (query) => {
        if (
          query.perPage &&
          query.perPage > 100 &&
          (query.full || query.noAgentCount === false || query.withAgentCount === true)
        ) {
          return 'perPage should be less or equal to 100 when fetching full policies or agent count.';
        }
      },
    }
  ),
};

export const BulkGetAgentPoliciesRequestSchema = {
  body: BulkRequestBodySchema.extends({
    full: schema.maybe(
      schema.boolean({
        meta: { description: 'get full policies with package policies populated' },
      })
    ),
  }),
  query: schema.object({
    format: schema.maybe(
      schema.oneOf([schema.literal(inputsFormat.Simplified), schema.literal(inputsFormat.Legacy)], {
        meta: { description: 'Format for the response: simplified or legacy' },
      })
    ),
  }),
};

export const BulkGetAgentPoliciesResponseSchema = schema.object(
  { items: schema.arrayOf(AgentPolicyResponseSchema, { maxSize: 10000 }) },
  { meta: { id: 'bulk_get_agent_policies_response' } }
);

export const GetOneAgentPolicyRequestSchema = {
  params: schema.object({
    agentPolicyId: schema.string({ meta: { description: 'The ID of the agent policy' } }),
  }),
  query: schema.object({
    format: schema.maybe(
      schema.oneOf([schema.literal(inputsFormat.Simplified), schema.literal(inputsFormat.Legacy)], {
        meta: { description: 'Format for the response: simplified or legacy' },
      })
    ),
  }),
};

export const GetAutoUpgradeAgentsStatusRequestSchema = {
  params: schema.object({
    agentPolicyId: schema.string({ meta: { description: 'The ID of the agent policy' } }),
  }),
};

export const CreateAgentPolicyRequestSchema = {
  body: NewAgentPolicySchema,
  query: schema.object({
    sys_monitoring: schema.maybe(
      schema.boolean({
        meta: { description: 'Whether to add the system integration to the new agent policy' },
      })
    ),
  }),
};

export const CreateAgentAndPackagePolicyRequestSchema = {
  body: CreateAgentPolicyRequestSchema.body.extends(
    {
      package_policies: schema.arrayOf(CreatePackagePolicyRequestSchema.body, { maxSize: 1000 }),
    },
    { meta: { id: 'create_agent_and_package_policy_request_body' } }
  ),
  query: schema.intersection([
    CreateAgentPolicyRequestSchema.query,
    CreatePackagePolicyRequestSchema.query,
  ]),
};

export const UpdateAgentPolicyRequestSchema = {
  ...GetOneAgentPolicyRequestSchema,
  body: NewAgentPolicySchema.extends(
    {
      force: schema.maybe(schema.boolean()),
      bumpRevision: schema.maybe(schema.boolean()),
    },
    { meta: { id: 'update_agent_policy_request_body' } }
  ),
};

export const CopyAgentPolicyRequestSchema = {
  ...GetOneAgentPolicyRequestSchema,
  body: schema.object(
    {
      name: schema.string({ minLength: 1 }),
      description: schema.maybe(schema.string()),
    },
    { meta: { id: 'copy_agent_policy_request' } }
  ),
};

export const DeleteAgentPolicyRequestSchema = {
  body: schema.object(
    {
      agentPolicyId: schema.string({ meta: { description: 'The ID of the agent policy' } }),
      force: schema.maybe(
        schema.boolean({
          meta: { description: 'bypass validation checks that can prevent agent policy deletion' },
        })
      ),
    },
    { meta: { id: 'delete_agent_policy_request' } }
  ),
};

export const DeleteAgentPolicyResponseSchema = schema.object(
  {
    id: schema.string(),
    name: schema.string(),
  },
  { meta: { id: 'delete_agent_policy_response' } }
);

export const GetFullAgentPolicyRequestSchema = {
  params: schema.object({
    agentPolicyId: schema.string({ meta: { description: 'The ID of the agent policy' } }),
  }),
  query: schema.object({
    download: schema.maybe(
      schema.boolean({
        meta: { description: 'If true, returns the policy as a downloadable file' },
      })
    ),
    standalone: schema.maybe(
      schema.boolean({
        meta: { description: 'If true, returns the policy formatted for standalone agents' },
      })
    ),
    kubernetes: schema.maybe(
      schema.boolean({
        meta: { description: 'If true, returns the policy formatted for Kubernetes deployment' },
      })
    ),
    revision: schema.maybe(
      schema.number({
        meta: {
          description:
            'If provided, returns the policy at the specified revision. Cannot be used with standalone or kubernetes flags.',
        },
      })
    ),
  }),
};

export const GetFullAgentPolicyResponseSchema = schema.object(
  { item: schema.oneOf([schema.string(), FullAgentPolicyResponseSchema]) },
  { meta: { id: 'get_full_agent_policy_response' } }
);

export const DownloadFullAgentPolicyResponseSchema = schema.string();

export const GetK8sManifestRequestSchema = {
  query: schema.object({
    download: schema.maybe(
      schema.boolean({
        meta: { description: 'If true, returns the manifest as a downloadable file' },
      })
    ),
    fleetServer: schema.maybe(
      schema.string({
        meta: { description: 'Fleet Server host URL to include in the manifest' },
      })
    ),
    enrolToken: schema.maybe(
      schema.string({
        meta: { description: 'Enrollment token to include in the manifest' },
      })
    ),
  }),
};

export const GetK8sManifestResponseScheme = schema.object(
  { item: schema.string() },
  { meta: { id: 'get_k8s_manifest_response' } }
);

export const GetAgentPolicyOutputsRequestSchema = {
  params: schema.object({
    agentPolicyId: schema.string({ meta: { description: 'The ID of the agent policy' } }),
  }),
};

export const GetListAgentPolicyOutputsRequestSchema = {
  body: schema.object(
    {
      ids: schema.arrayOf(schema.string(), {
        meta: { description: 'list of package policy ids' },
        maxSize: 1000,
      }),
    },
    { meta: { id: 'get_list_agent_policy_outputs_request' } }
  ),
};

export const RunAgentPolicyRevisionsCleanupTaskRequestSchema = {
  body: schema.object(
    {
      maxRevisions: schema.maybe(
        schema.number({
          min: 1,
          meta: { description: 'maximum revisions to keep per policy' },
        })
      ),
      maxPolicies: schema.maybe(
        schema.number({
          min: 1,
          meta: { description: 'maximum number of policies to process for this task' },
        })
      ),
    },
    { meta: { id: 'run_agent_policy_revisions_cleanup_task_request' } }
  ),
};

export const RunAgentPolicyRevisionsCleanupTaskResponseSchema = schema.object(
  {
    success: schema.boolean({ meta: { description: 'whether the cleanup task ran successfully' } }),
    totalDeletedRevisions: schema.number({
      meta: { description: 'total number of deleted policy revisions' },
    }),
  },
  { meta: { id: 'run_agent_policy_revisions_cleanup_task_response' } }
);
