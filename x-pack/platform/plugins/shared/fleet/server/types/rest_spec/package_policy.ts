/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

import {
  CreatePackagePolicyRequestBodySchema,
  DryRunPackagePolicySchema,
  PackagePolicyPackageSchema,
  PackagePolicyResponseSchema,
  PackagePolicyStatusResponseSchema,
  SimplifiedCreatePackagePolicyRequestBodySchema,
  UpdatePackagePolicyRequestBodySchema,
} from '../models';

import { inputsFormat } from '../../../common/constants';

import {
  LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  PACKAGE_POLICIES_MAPPINGS,
} from '../../constants';

import { validateKuery } from '../../routes/utils/filter_utils';

import { BulkRequestBodySchema } from './common';

export const GetPackagePoliciesRequestSchema = {
  query: schema.object({
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
        meta: { description: 'When true, only show policies with available upgrades' },
      })
    ),
    kuery: schema.maybe(
      schema.string({
        meta: { description: 'A KQL query string to filter results' },
        validate: (value: string) => {
          const validationObj = validateKuery(
            value,
            [LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE, PACKAGE_POLICY_SAVED_OBJECT_TYPE],
            PACKAGE_POLICIES_MAPPINGS,
            true
          );
          if (validationObj?.error) {
            return validationObj?.error;
          }
        },
      })
    ),
    format: schema.maybe(
      schema.oneOf([schema.literal(inputsFormat.Simplified), schema.literal(inputsFormat.Legacy)], {
        meta: { description: 'Format for the response: simplified or legacy' },
      })
    ),
    withAgentCount: schema.maybe(
      schema.boolean({
        meta: { description: 'When true, include the agent count per package policy' },
      })
    ),
  }),
};

export const BulkGetPackagePoliciesRequestSchema = {
  body: BulkRequestBodySchema,
  query: schema.object({
    format: schema.maybe(
      schema.oneOf([schema.literal(inputsFormat.Simplified), schema.literal(inputsFormat.Legacy)], {
        meta: { description: 'Format for the response: simplified or legacy' },
      })
    ),
  }),
};

export const BulkGetPackagePoliciesResponseBodySchema = schema.object(
  { items: schema.arrayOf(PackagePolicyResponseSchema, { maxSize: 10000 }) },
  { meta: { id: 'bulk_get_package_policies_response' } }
);

export const GetOnePackagePolicyRequestSchema = {
  params: schema.object({
    packagePolicyId: schema.string({ meta: { description: 'The ID of the package policy' } }),
  }),
  query: schema.object({
    format: schema.maybe(
      schema.oneOf([schema.literal(inputsFormat.Simplified), schema.literal(inputsFormat.Legacy)], {
        meta: { description: 'Format for the response: simplified or legacy' },
      })
    ),
  }),
};

export const CreatePackagePolicyRequestSchema = {
  body: schema.oneOf(
    [CreatePackagePolicyRequestBodySchema, SimplifiedCreatePackagePolicyRequestBodySchema],
    {
      meta: {
        description: 'You should use inputs as an object and not use the deprecated inputs array.',
      },
    }
  ),
  query: schema.object({
    format: schema.maybe(
      schema.oneOf([schema.literal(inputsFormat.Simplified), schema.literal(inputsFormat.Legacy)], {
        meta: { description: 'Format for the response: simplified or legacy' },
      })
    ),
  }),
};

export const CreatePackagePolicyResponseSchema = schema.object(
  { item: PackagePolicyResponseSchema },
  { meta: { id: 'create_package_policy_response' } }
);

export const UpdatePackagePolicyRequestSchema = {
  ...GetOnePackagePolicyRequestSchema,
  body: schema.oneOf([
    UpdatePackagePolicyRequestBodySchema,
    SimplifiedCreatePackagePolicyRequestBodySchema,
  ]),
  query: schema.object({
    format: schema.maybe(
      schema.oneOf([schema.literal(inputsFormat.Simplified), schema.literal(inputsFormat.Legacy)], {
        meta: { description: 'Format for the response: simplified or legacy' },
      })
    ),
  }),
};

export const DeletePackagePoliciesRequestSchema = {
  body: schema.object(
    {
      packagePolicyIds: schema.arrayOf(schema.string(), { maxSize: 1000 }),
      force: schema.maybe(schema.boolean()),
    },
    { meta: { id: 'delete_package_policies_request' } }
  ),
};

export const DeletePackagePoliciesResponseBodySchema = schema.arrayOf(
  PackagePolicyStatusResponseSchema.extends(
    {
      policy_id: schema.maybe(
        schema.oneOf([
          schema.literal(null),
          schema.string({
            meta: {
              description: 'Use `policy_ids` instead',
              deprecated: true,
            },
          }),
        ])
      ),
      policy_ids: schema.arrayOf(schema.string(), { maxSize: 10000 }),
      output_id: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
      package: PackagePolicyPackageSchema,
    },
    // Distinct meta.id so this extension does not collide with the base
    // `package_policy_status_response` component in the OAS shared schemas
    // map. Without this, the OAS bundler's last-write-wins semantics on the
    // shared schemas registry cause this extension's keys to be dropped when
    // another route registers the bare base under the same id.
    { meta: { id: 'delete_package_policies_response_item' } }
  ),
  { maxSize: 10000 }
);

export const DeleteOnePackagePolicyRequestSchema = {
  params: schema.object({
    packagePolicyId: schema.string({ meta: { description: 'The ID of the package policy' } }),
  }),
  query: schema.object({
    force: schema.maybe(
      schema.boolean({
        meta: { description: 'When true, delete the package policy even if it is managed' },
      })
    ),
  }),
};

export const DeleteOnePackagePolicyResponseSchema = schema.object(
  { id: schema.string() },
  { meta: { id: 'delete_one_package_policy_response' } }
);

export const UpgradePackagePoliciesRequestSchema = {
  body: schema.object(
    { packagePolicyIds: schema.arrayOf(schema.string(), { maxSize: 1000 }) },
    { meta: { id: 'upgrade_package_policies_request' } }
  ),
};

export const UpgradePackagePoliciesResponseBodySchema = schema.arrayOf(
  PackagePolicyStatusResponseSchema,
  { maxSize: 10000 }
);

export const DryRunPackagePoliciesRequestSchema = {
  body: schema.object(
    {
      packagePolicyIds: schema.arrayOf(schema.string(), { maxSize: 1000 }),
      packageVersion: schema.maybe(schema.string()),
    },
    { meta: { id: 'dry_run_package_policies_request' } }
  ),
};

export const DryRunPackagePoliciesResponseBodySchema = schema.arrayOf(
  schema.object({
    name: schema.maybe(schema.string()),
    statusCode: schema.maybe(schema.number()),
    body: schema.maybe(schema.object({ message: schema.string() })),
    hasErrors: schema.boolean(),
    diff: schema.maybe(
      schema.arrayOf(
        schema.oneOf([
          PackagePolicyResponseSchema.extends({
            id: schema.maybe(schema.string()),
          }),
          DryRunPackagePolicySchema,
        ]),
        { maxSize: 2 }
      )
    ),
    agent_diff: schema.maybe(
      schema.arrayOf(
        schema.arrayOf(
          schema
            .object({
              id: schema.string(),
              name: schema.string(),
              revision: schema.number(),
              type: schema.string(),
              data_stream: schema.object({
                namespace: schema.string(),
              }),
              use_output: schema.string(),
              package_policy_id: schema.string(),
              meta: schema.maybe(
                schema.object({
                  package: schema
                    .object({
                      name: schema.string(),
                      version: schema.string(),
                    })
                    .extendsDeep({
                      // equivalent of allowing extra keys like `[key: string]: any;`
                      unknowns: 'allow',
                    }),
                })
              ),
              streams: schema.maybe(
                schema.arrayOf(
                  schema
                    .object({
                      id: schema.maybe(schema.string()),
                      data_stream: schema.object({
                        dataset: schema.string(),
                        type: schema.maybe(schema.string()),
                      }),
                    })
                    .extendsDeep({
                      unknowns: 'allow',
                    }),
                  { maxSize: 10000 }
                )
              ),
              processors: schema.maybe(
                schema.arrayOf(
                  schema.object({
                    add_fields: schema.object({
                      target: schema.string(),
                      fields: schema.recordOf(
                        schema.string(),
                        schema.oneOf([schema.string(), schema.number()])
                      ),
                    }),
                  }),
                  { maxSize: 10000 }
                )
              ),
            })
            .extendsDeep({
              unknowns: 'allow',
            }),
          { maxSize: 10000 }
        ),
        { maxSize: 1 }
      )
    ),
  }),
  { maxSize: 10000 }
);
