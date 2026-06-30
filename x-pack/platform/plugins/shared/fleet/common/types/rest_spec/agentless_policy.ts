/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type TypeOf, schema } from '@kbn/config-schema';

import { SO_SEARCH_LIMIT } from '../../constants';

import { SimplifiedCreatePackagePolicyRequestBodySchema } from '../models/package_policy_schema';
import type { AgentlessPolicyResponseSchema } from '../models/agentless_policy_schema';

export const CreateAgentlessPolicyRequestSchema = {
  body: SimplifiedCreatePackagePolicyRequestBodySchema.extends(
    {
      // Remove all properties that are not relevant for agentless policies
      policy_id: undefined,
      policy_ids: undefined,
      supports_agentless: undefined,
      output_id: undefined,
      condition: undefined,
      policy_template: schema.maybe(
        schema.string({
          meta: {
            description:
              'The policy template to use for the agentless package policy. If not provided, the default policy template is used.',
          },
        })
      ),
      // Only available for agentless integration policies.
      // On standard package policies this field is rejected by server-side validation.
      global_data_tags: schema.maybe(
        schema.arrayOf(
          schema.object({
            name: schema.string({
              meta: { description: 'Name of the custom field. The name cannot contain spaces.' },
            }),
            value: schema.oneOf([schema.string(), schema.number()], {
              meta: { description: 'Value of the custom field.' },
            }),
          }),
          {
            maxSize: 100,
          }
        )
      ),
      // Cloud connector configuration - all connector settings go here
      cloud_connector: schema.maybe(
        schema.object({
          enabled: schema.boolean({
            defaultValue: false,
            meta: { description: 'Set to `true` to enable cloud connectors for this policy.' },
          }),
          cloud_connector_id: schema.maybe(
            schema.string({
              meta: {
                description:
                  'ID of an existing cloud connector to reuse. If not provided, a new connector is created.',
              },
            })
          ),
          name: schema.maybe(
            schema.string({
              minLength: 1,
              maxLength: 255,
              meta: {
                description:
                  'Name for the cloud connector. If not provided, a name is generated automatically from the credentials.',
              },
            })
          ),
          target_csp: schema.maybe(
            schema.oneOf([schema.literal('aws'), schema.literal('azure'), schema.literal('gcp')], {
              meta: {
                description:
                  'Target cloud service provider. If not provided, the provider is detected automatically from the inputs.',
              },
            })
          ),
        })
      ),
    },
    // Distinct meta.id so this extension does not silently overwrite the
    // `simplified_create_package_policy_request` named component in the OAS
    // shared schemas map. ObjectType.extends() inherits `meta.id` from the
    // base when the caller does not provide a fresh one, and the OAS bundler's
    // shared registry is last-write-wins on collisions.
    { meta: { id: 'create_agentless_policy_request' } }
  ),
};

export const DeleteAgentlessPolicyRequestSchema = {
  query: schema.object({
    force: schema.maybe(
      schema.boolean({
        defaultValue: false,
        meta: {
          description: 'Force delete the policy even if the policy is managed.',
        },
      })
    ),
  }),
  params: schema.object({
    policyId: schema.string({
      meta: {
        description: 'The ID of the policy to delete.',
      },
    }),
  }),
};

export const DeleteAgentlessPolicyResponseSchema = schema.object(
  {
    id: schema.string({
      meta: {
        description: 'The ID of the deleted agentless package policy.',
      },
    }),
  },
  {
    meta: {
      description: 'Response for deleting an agentless package policy.',
    },
  }
);

export type CreateAgentlessPolicyResponse = TypeOf<typeof AgentlessPolicyResponseSchema>;

export interface CreateAgentlessPolicyRequest {
  body: TypeOf<typeof CreateAgentlessPolicyRequestSchema.body>;
}

/**
 * Request body for creating an agentless policy.
 *
 * Derived from the route schema so it always reflects the accepted contract: a
 * `cloud_connector` may carry `name`/`target_csp` when creating a new connector
 * (instead of `cloud_connector_id`), and `package.title` is not required.
 */
export type NewAgentlessPolicy = CreateAgentlessPolicyRequest['body'];

export type DeleteAgentlessPolicyResponse = TypeOf<typeof DeleteAgentlessPolicyResponseSchema>;

export interface DeleteAgentlessPolicyRequest {
  params: TypeOf<typeof DeleteAgentlessPolicyRequestSchema.params>;
  query: TypeOf<typeof DeleteAgentlessPolicyRequestSchema.query>;
}

export const AgentlessPolicyThroughputSchema = schema.object({
  policyId: schema.string({
    maxLength: 256,
    meta: { description: 'The ID of the agentless package policy.' },
  }),
  averagePerSecond: schema.number({
    meta: { description: 'Average ingest rate over the observed span in events per second.' },
  }),
  series: schema.arrayOf(
    schema.object({
      x: schema.number({ meta: { description: 'Bucket start timestamp in epoch milliseconds.' } }),
      y: schema.number({
        meta: { description: 'Peak events per second in this 30-minute bucket.' },
      }),
    }),
    { maxSize: 256, meta: { description: '30-minute throughput buckets over the last 24h.' } }
  ),
});

export const GetBulkAgentlessPolicyThroughputRequestSchema = {
  body: schema.object({
    policyIds: schema.arrayOf(schema.string({ maxLength: 500 }), {
      maxSize: SO_SEARCH_LIMIT,
      meta: { description: 'IDs of the agentless package policies to query.' },
    }),
  }),
};

export const GetBulkAgentlessPolicyThroughputResponseSchema = schema.object({
  items: schema.arrayOf(AgentlessPolicyThroughputSchema, {
    maxSize: SO_SEARCH_LIMIT,
    meta: { description: 'Throughput data for each requested policy.' },
  }),
});

export type AgentlessPolicyThroughput = TypeOf<typeof AgentlessPolicyThroughputSchema>;
export type GetBulkAgentlessPolicyThroughputResponse = TypeOf<
  typeof GetBulkAgentlessPolicyThroughputResponseSchema
>;
