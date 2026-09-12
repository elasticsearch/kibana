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
import type { PolicyDiffEntry } from '../domain/diff_policy_config';
import { policyIdentifierInputSchema } from '../domain/input_schemas';
import { createPolicyTool } from './create_policy_tool';
import type { PresentedFromTo, PresentedPolicyIdentity, TrimLimits } from './trim_policy_result';
import {
  DEFAULT_TRIM_LIMITS,
  omitTrailingToFit,
  presentBoundedIdentityStrings,
  presentFromTo,
  presentWithinGuardedBudget,
  toPresentationHash,
} from './trim_policy_result';

export const COMPARE_POLICIES_TOOL_ID = 'security.policy_management.compare_policies';

const COMPARE_DIFF_DISPLAY_CAP = 50;
const COMPARE_POLICIES_MAX_RESULT_TOKENS = 12_000;

export type PolicyComparisonRef = Readonly<{ type: 'policy'; idOrName: string }>;

export const policyComparisonRefSchema = z.object({
  type: z.literal('policy'),
  idOrName: policyIdentifierInputSchema.describe(
    'Saved-object id or exact full stored endpoint policy name in the current space. A presented name with name_string_truncated true is display-only; pass policy.id as later idOrName.'
  ),
});

export const comparePoliciesSchema = z.object({
  from: policyComparisonRefSchema.describe('Baseline comparison side: a live policy.'),
  to: policyComparisonRefSchema.describe('Comparison-target side: a live policy.'),
});

type PresentedComparisonSide = Readonly<{
  type: 'policy';
  policy: PresentedPolicyIdentity;
  normalizedHash: string;
}>;

type PresentedDiffEntry = Pick<PolicyDiffEntry, 'path'> & PresentedFromTo;

type PresentedComparison = Readonly<{
  from: PresentedComparisonSide;
  to: PresentedComparisonSide;
  normalized_posture_equal: boolean;
  diffs: readonly PresentedDiffEntry[];
  value_total: number;
  value_truncated: boolean;
}>;

const presentComparisonSide = (presented: PresentedComparisonSide): PresentedComparisonSide => ({
  ...presented,
  policy: presentBoundedIdentityStrings(presented.policy),
  normalizedHash: toPresentationHash(presented.normalizedHash),
});

const presentDiffEntry = (entry: PolicyDiffEntry, limits: TrimLimits): PresentedDiffEntry => ({
  path: entry.path,
  ...presentFromTo(entry, limits),
});

const presentComparePolicies = (
  from: PresentedComparisonSide,
  to: PresentedComparisonSide,
  fullDiff: readonly PolicyDiffEntry[]
): PresentedComparison => {
  const presentedFrom = presentComparisonSide(from);
  const presentedTo = presentComparisonSide(to);
  const capped = fullDiff.slice(0, COMPARE_DIFF_DISPLAY_CAP);

  const buildSkeleton = (): PresentedComparison => ({
    from: presentedFrom,
    to: presentedTo,
    normalized_posture_equal: fullDiff.length === 0,
    diffs: [],
    value_total: fullDiff.length,
    value_truncated: fullDiff.length > 0,
  });

  const build = (keep: number, limits: TrimLimits): PresentedComparison => ({
    from: presentedFrom,
    to: presentedTo,
    normalized_posture_equal: fullDiff.length === 0,
    diffs: capped.slice(0, keep).map((entry) => presentDiffEntry(entry, limits)),
    value_total: fullDiff.length,
    value_truncated: keep < fullDiff.length,
  });

  const defaultFit = omitTrailingToFit(
    (keep) => build(keep, DEFAULT_TRIM_LIMITS),
    capped.length,
    COMPARE_POLICIES_MAX_RESULT_TOKENS,
    buildSkeleton
  );
  if (defaultFit.diffs.length > 0 || fullDiff.length === 0) {
    return defaultFit;
  }

  return presentWithinGuardedBudget(
    (limits) => build(1, limits),
    COMPARE_POLICIES_MAX_RESULT_TOKENS,
    () => defaultFit
  );
};

export const createComparePoliciesTool = ({
  endpointAppContextService,
  getStartServices,
}: {
  endpointAppContextService: EndpointAppContextService;
  getStartServices: StartServicesAccessor;
}): BuiltinSkillBoundedTool<typeof comparePoliciesSchema> =>
  createPolicyTool({
    endpointAppContextService,
    getStartServices,
    id: COMPARE_POLICIES_TOOL_ID,
    description:
      'Compare two Elastic Defend policies in the current space. ' +
      'Accepts live policy references on either side. Returns identities, hashes, and a bounded deterministic diff, ' +
      'plus normalized_posture_equal computed from the complete normalized comparison, which excludes meta.* and *.popup.*.message. ' +
      'The visible diffs list can be bounded independently of that equality result. ' +
      'value_truncated true means the visible diffs are incomplete and value_total is the complete count; ' +
      'a *_string_truncated, *_value_truncated with *_value_total, or *_output_truncated marker on a diff entry means that displayed value is partial. ' +
      'Returned identities follow the same rule: policy.id is the stable later idOrName, and a name with name_string_truncated true is display-only. ' +
      'Does not count endpoints or write policies.',
    schema: comparePoliciesSchema,
    maxResultTokens: COMPARE_POLICIES_MAX_RESULT_TOKENS,
    run: async ({ from, to }: z.infer<typeof comparePoliciesSchema>, service) => {
      const { from: fromRead, to: toRead, diffs } = await service.comparePolicies(from, to);

      return presentComparePolicies(
        {
          type: 'policy' as const,
          policy: fromRead.policy,
          normalizedHash: fromRead.normalizedHash,
        },
        {
          type: 'policy' as const,
          policy: toRead.policy,
          normalizedHash: toRead.normalizedHash,
        },
        diffs
      );
    },
  });
