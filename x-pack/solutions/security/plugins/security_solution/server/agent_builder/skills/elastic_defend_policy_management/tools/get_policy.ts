/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { z } from '@kbn/zod/v4';
import type { StartServicesAccessor } from '@kbn/core/server';
import type { EndpointAppContextService } from '../../../../endpoint/endpoint_app_context_services';
import { policyIdentifierInputSchema } from '../domain/input_schemas';
import type { NormalizedPolicyConfig } from '../domain/normalized_policy_config';
import type { PolicyIdentity } from '../services/read_policy';
import { createPolicyTool } from './create_policy_tool';
import type { PolicyTrimMetadata, PresentedPolicyIdentity, TrimLimits } from './trim_policy_result';
import {
  parentTrimMetadata,
  presentBoundedIdentityStrings,
  presentWithinGuardedBudget,
  toPresentationHash,
  trimPolicyResultWithMeta,
} from './trim_policy_result';

export const GET_POLICY_TOOL_ID = 'security.policy_management.get_policy';

const GET_POLICY_MAX_RESULT_TOKENS = 12_000;

export const getPolicySchema = z.object({
  idOrName: policyIdentifierInputSchema.describe(
    'Saved-object id or exact full stored endpoint policy name in the current space. A presented name with name_string_truncated true is display-only; pass policy.id as later idOrName.'
  ),
});

type PresentedGetPolicyFallback = Readonly<{
  policy: PresentedPolicyIdentity;
  normalizedHash: string;
}>;

type PresentedGetPolicy = PresentedGetPolicyFallback &
  Readonly<{
    config: unknown;
  }> &
  PolicyTrimMetadata;

const presentGetPolicy = (
  policy: PolicyIdentity,
  normalizedConfig: NormalizedPolicyConfig,
  serviceHash: string
): PresentedGetPolicy | PresentedGetPolicyFallback => {
  const identity = presentBoundedIdentityStrings(policy);
  const normalizedHash = toPresentationHash(serviceHash);

  const buildFull = (limits: TrimLimits): PresentedGetPolicy => {
    const trimmed = trimPolicyResultWithMeta(normalizedConfig, limits);
    return {
      policy: identity,
      normalizedHash,
      config: trimmed.value,
      ...parentTrimMetadata(trimmed.value, trimmed.metadata),
    };
  };

  const buildFallback = (): PresentedGetPolicyFallback => ({
    policy: identity,
    normalizedHash,
  });

  return presentWithinGuardedBudget(buildFull, GET_POLICY_MAX_RESULT_TOKENS, buildFallback);
};

export const createGetPolicyTool = ({
  endpointAppContextService,
  getStartServices,
}: {
  endpointAppContextService: EndpointAppContextService;
  getStartServices: StartServicesAccessor;
}): BuiltinSkillBoundedTool<typeof getPolicySchema> =>
  createPolicyTool({
    endpointAppContextService,
    getStartServices,
    id: GET_POLICY_TOOL_ID,
    description:
      'Get one Elastic Defend endpoint policy by saved-object id or exact name in the current space. ' +
      'Returns bounded identity, a full-config normalized hash, and a structurally bounded presented config. ' +
      'When name_string_truncated is true, the displayed name is display-only; pass policy.id as later idOrName. ' +
      'Does not count endpoints or write policies.',
    schema: getPolicySchema,
    maxResultTokens: GET_POLICY_MAX_RESULT_TOKENS,
    run: async ({ idOrName }: z.infer<typeof getPolicySchema>, service) => {
      const { policy, normalizedConfig, normalizedHash } = await service.getPolicy({
        idOrName,
      });

      return presentGetPolicy(policy, normalizedConfig, normalizedHash);
    },
  });
