/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Type, TypeOf } from '@kbn/config-schema';
import { offeringBasedSchema, schema } from '@kbn/config-schema';
import type { PluginConfigDescriptor } from '@kbn/core/server';
import {
  KIBANA_PRODUCT_TIERS,
  KIBANA_SOLUTIONS,
  type KibanaProductTier,
  type KibanaSolution,
} from '@kbn/projects-solutions-groups';

const apmConfigSchema = schema.object({
  url: schema.maybe(schema.string()),
  secret_token: schema.maybe(schema.string()),
  ui: schema.maybe(
    schema.object({
      url: schema.maybe(schema.string()),
    })
  ),
});

const managedOtlpConfigSchema = schema.object({
  url: schema.maybe(schema.string()),
});

/**
 * Builds a nested conditional schema for product tiers based on the project type.
 * Something like
 * ```
 * schema.conditional(
 *   schema.siblingRef('project_type'),
 *   KIBANA_OBSERVABILITY_SOLUTION,
 *   schema.oneOf([
 *     schema.literal(KIBANA_OBSERVABILITY_COMPLETE_TIER),
 *     schema.literal(KIBANA_OBSERVABILITY_LOGS_ESSENTIALS_TIER),
 *   ]),
 *   schema.conditional(
 *     schema.siblingRef('project_type'),
 *     KIBANA_SECURITY_SOLUTION,
 *     schema.oneOf([
 *       schema.literal(KIBANA_SECURITY_COMPLETE_TIER),
 *       schema.literal(KIBANA_SECURITY_ESSENTIALS_TIER),
 *       schema.literal(KIBANA_SECURITY_SEARCH_AI_LAKE_TIER),
 *     ]),
 *     // Iterates over all other solutions and eventually returns a schema.never()
 *     schema.never()
 *   ),
 * );
 * ```
 */
function createProductTiersSchema() {
  return Object.entries(KIBANA_PRODUCT_TIERS).reduce<Type<KibanaProductTier> | Type<never>>(
    (acc, [productType, tiers]) => {
      const tiersSchema = tiers.length
        ? schema.oneOf(
            tiers.map((tier) => schema.literal(tier)) as [Type<KibanaProductTier>] // This cast is needed because it's different to Type<T>[] :sight:
          )
        : schema.never();

      return schema.conditional(schema.siblingRef('project_type'), productType, tiersSchema, acc);
    },
    schema.never()
  );
}

const configSchema = schema.object({
  apm: schema.maybe(apmConfigSchema),
  base_url: schema.maybe(schema.string()),
  cname: schema.maybe(schema.string()),
  csp: schema.maybe(schema.string()),
  region: schema.maybe(schema.string()),
  deployments_url: schema.string({ defaultValue: '/deployments' }),
  deployment_url: schema.maybe(schema.string()),
  create_deployment_url: schema.string({ defaultValue: '/deployments/create' }),
  id: schema.maybe(schema.string()),
  isSaasContainer: schema.maybe(schema.boolean()),
  organization_id: schema.maybe(schema.string()),
  billing_url: schema.maybe(schema.string()),
  performance_url: schema.maybe(schema.string()),
  users_and_roles_url: schema.maybe(schema.string()),
  organization_url: schema.maybe(schema.string()),
  profile_url: schema.maybe(schema.string()),
  projects_url: offeringBasedSchema({ serverless: schema.string({ defaultValue: '/projects/' }) }),
  create_project_url: offeringBasedSchema({
    serverless: schema.string({ defaultValue: '/projects/create' }),
  }),
  trial_end_date: schema.maybe(schema.string()),
  is_elastic_staff_owned: schema.maybe(schema.boolean()),
  managed_otlp: schema.maybe(managedOtlpConfigSchema),
  onboarding: schema.maybe(
    schema.object({
      default_solution: schema.maybe(schema.string()),
    })
  ),
  serverless: schema.maybe(
    schema.object(
      {
        project_id: schema.maybe(schema.string()),
        project_name: schema.maybe(schema.string()),
        project_type: schema.maybe(
          schema.oneOf(
            KIBANA_SOLUTIONS.map((solution) => schema.literal(solution)) as [
              Type<KibanaSolution> // This cast is needed because it's different to Type<T>[] :sight:
            ]
          )
        ),
        product_tier: schema.maybe(createProductTiersSchema()),
        orchestrator_target: schema.maybe(schema.string()),
        in_trial: schema.maybe(schema.boolean()),
      },
      // avoid future chicken-and-egg situation with the component populating the config
      { unknowns: 'ignore' }
    )
  ),
});

export type CloudConfigType = TypeOf<typeof configSchema>;

export const config: PluginConfigDescriptor<CloudConfigType> = {
  exposeToBrowser: {
    base_url: true,
    cname: true,
    csp: true,
    region: true,
    deployments_url: true,
    deployment_url: true,
    create_deployment_url: true,
    id: true,
    isSaasContainer: true,
    organization_id: true,
    billing_url: true,
    users_and_roles_url: true,
    performance_url: true,
    organization_url: true,
    profile_url: true,
    projects_url: true,
    create_project_url: true,
    trial_end_date: true,
    is_elastic_staff_owned: true,
    managed_otlp: {
      url: true,
    },
    serverless: {
      project_id: true,
      project_name: true,
      project_type: true,
      product_tier: true,
      orchestrator_target: true,
      in_trial: true,
    },
    onboarding: {
      default_solution: true,
    },
  },
  schema: configSchema,
};
