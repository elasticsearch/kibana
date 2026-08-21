/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import type { StartServicesAccessor } from '@kbn/core/server';
import type { EndpointAppContextService } from '../../../../endpoint/endpoint_app_context_services';
import type { PolicyDiffEntry } from '../domain/diff_policy_config';
import {
  assessPolicyChangeParamsSchema,
  type AssessPolicyChangeParams,
  type PolicyChangeFact,
  type PolicyChangeOperation,
  type PolicyChangeSideEffect,
} from '../domain/impact';
import type { AssessPolicyChangeDto } from '../services/assess_change';
import { createPolicyTool } from './create_policy_tool';
import type {
  PolicyTrimMetadata,
  PresentedFromTo,
  PresentedPolicyIdentity,
  TrimLimits,
} from './trim_policy_result';
import {
  DEFAULT_TRIM_LIMITS,
  TIGHTEST_TRIM_LIMITS,
  omitTrailingToFit,
  parentTrimMetadata,
  presentBoundedIdentityStrings,
  presentFromTo,
  presentWithinGuardedBudget,
  trimPolicyResultWithMeta,
  tryOmitTrailingToFit,
} from './trim_policy_result';

type PresentedRequestedOperation =
  | Exclude<PolicyChangeOperation, { op: 'set_field' }>
  | (Extract<PolicyChangeOperation, { op: 'set_field' }> & PolicyTrimMetadata);

type PresentedRequestedOperationIdentity =
  | Exclude<PolicyChangeOperation, { op: 'set_field' }>
  | { readonly op: 'set_field'; readonly path: string; readonly value_truncated: true };

type PresentedPolicyChangeFact = Readonly<{
  path: PolicyChangeFact['path'];
  originKind: PolicyChangeFact['origin']['kind'];
  registryKind: PolicyChangeFact['registry']['kind'];
  origin: Omit<PolicyChangeFact['origin'], 'kind'>;
  registry: Omit<PolicyChangeFact['registry'], 'kind'>;
  eligibility: PolicyChangeFact['eligibility'];
}> &
  PresentedFromTo;

type PresentedNormalizedDiff = Pick<PolicyDiffEntry, 'path'> & PresentedFromTo;

type PresentedSideEffect = Readonly<{
  path: PolicyChangeSideEffect['path'];
  reason: PolicyChangeSideEffect['reason'];
  registryKind: PolicyChangeSideEffect['registry']['kind'];
  registry: Omit<PolicyChangeSideEffect['registry'], 'kind'>;
}> &
  PresentedFromTo;

type PresentedPolicy = PresentedPolicyIdentity<
  Pick<
    AssessPolicyChangeDto['assessment']['policy']['snapshot']['identity'],
    'id' | 'name' | 'revision' | 'version'
  >
>;

type PresentedBlastRadius = Pick<
  AssessPolicyChangeDto['enrollment'],
  'population' | 'source' | 'status'
>;

type PresentedGlobalBlocker = AssessPolicyChangeDto['assessment']['globalBlockers'][number];

type SectionPrefix = (typeof ARRAY_TRIM_PREFIX)[keyof typeof ARRAY_TRIM_PREFIX];

type PresentedSectionTruncation = {
  readonly [K in `${SectionPrefix}_value_truncated`]?: true;
} & {
  readonly [K in `${SectionPrefix}_value_total`]?: number;
};

type AssessmentPresentation = Readonly<{
  policy: PresentedPolicy;
  spaceId: string;
  requestedOperations: readonly (
    | PresentedRequestedOperation
    | PresentedRequestedOperationIdentity
  )[];
  requestedImpact: readonly PresentedPolicyChangeFact[];
  expandedChanges: readonly PresentedPolicyChangeFact[];
  normalizedDiff: readonly PresentedNormalizedDiff[];
  sideEffects: readonly PresentedSideEffect[];
  globalBlockers: readonly PresentedGlobalBlocker[];
  blastRadius: PresentedBlastRadius;
}> &
  PresentedSectionTruncation;

export const ASSESS_POLICY_CHANGE_TOOL_ID = 'security.policy_management.assess_policy_change';

export const assessPolicyChangeSchema = assessPolicyChangeParamsSchema;

const ASSESS_DISPLAY_CAP = 50;
const ASSESS_POLICY_CHANGE_MAX_RESULT_TOKENS = 12_000;

const ARRAY_TRIM_PREFIX = {
  requestedOperations: 'requested_operations',
  requestedImpact: 'requested_impact',
  expandedChanges: 'expanded_changes',
  normalizedDiff: 'normalized_diff',
  sideEffects: 'side_effects',
  globalBlockers: 'global_blockers',
} as const;

const arrayTrimMeta = (
  name: keyof typeof ARRAY_TRIM_PREFIX,
  kept: number,
  total: number
): Record<string, NonNullable<PolicyTrimMetadata[keyof PolicyTrimMetadata]>> =>
  kept < total
    ? {
        [`${ARRAY_TRIM_PREFIX[name]}_value_truncated`]: true,
        [`${ARRAY_TRIM_PREFIX[name]}_value_total`]: total,
      }
    : {};

const presentRequestedOperation = (
  operation: PolicyChangeOperation,
  limits: TrimLimits
): PresentedRequestedOperation => {
  if (operation.op !== 'set_field') {
    return { ...operation };
  }

  const valueTrim = trimPolicyResultWithMeta(operation.value, limits);
  return {
    op: operation.op,
    path: operation.path,
    value: valueTrim.value,
    ...parentTrimMetadata(valueTrim.value, valueTrim.metadata),
  };
};

const presentRequestedOperationIdentity = (
  operation: PolicyChangeOperation
): PresentedRequestedOperationIdentity => {
  if (operation.op !== 'set_field') {
    return { ...operation };
  }

  return {
    op: operation.op,
    path: operation.path,
    value_truncated: true,
  };
};

const presentPolicyChangeFact = (
  entry: PolicyChangeFact,
  limits: TrimLimits
): PresentedPolicyChangeFact => {
  const { kind: originKind, ...origin } = entry.origin;
  const { kind: registryKind, ...registry } = entry.registry;

  return {
    path: entry.path,
    originKind,
    registryKind,
    origin,
    registry,
    eligibility: entry.eligibility,
    ...presentFromTo(entry, limits),
  };
};

const presentNormalizedDiff = (
  entry: PolicyDiffEntry,
  limits: TrimLimits
): PresentedNormalizedDiff => ({
  path: entry.path,
  ...presentFromTo(entry, limits),
});

const presentSideEffect = (
  entry: PolicyChangeSideEffect,
  limits: TrimLimits
): PresentedSideEffect => {
  const { kind: registryKind, ...registry } = entry.registry;

  return {
    path: entry.path,
    reason: entry.reason,
    registryKind,
    registry,
    ...presentFromTo(entry, limits),
  };
};

const presentAssessmentPolicy = (
  policy: AssessPolicyChangeDto['assessment']['policy']['snapshot']['identity']
): PresentedPolicy =>
  presentBoundedIdentityStrings({
    id: policy.id,
    name: policy.name,
    revision: policy.revision,
    version: policy.version,
  });

const presentBlastRadius = (
  blastRadius: AssessPolicyChangeDto['enrollment']
): PresentedBlastRadius => {
  const { population, source, status } = blastRadius;
  return { population, source, status };
};

const presentAssessPolicyChange = (dto: AssessPolicyChangeDto): AssessmentPresentation => {
  const { assessment, enrollment, spaceId } = dto;
  const policy = presentAssessmentPolicy(assessment.policy.snapshot.identity);
  const blastRadius = presentBlastRadius(enrollment);
  const requestedOperations = assessment.requestedOperations;
  const requestedImpact = assessment.changes.filter(({ origin }) => origin.kind === 'direct');
  const expandedChanges = assessment.changes;
  const requestedTotal = requestedOperations.length;

  const build = (
    keep: number,
    limits: TrimLimits,
    requestedKeep: number = requestedTotal
  ): AssessmentPresentation => {
    const requested = requestedOperations.slice(0, requestedKeep);
    const requestedImpactRows = requestedImpact.slice(0, keep);
    const expanded = expandedChanges.slice(0, keep);
    const diffs = assessment.normalizedDiff.slice(0, keep);
    const sides = assessment.sideEffects.slice(0, keep);
    const blockers = assessment.globalBlockers.slice(0, keep);

    return {
      policy,
      spaceId,
      requestedOperations: requested.map((operation) =>
        presentRequestedOperation(operation, limits)
      ),
      ...arrayTrimMeta('requestedOperations', requested.length, requestedTotal),
      requestedImpact: requestedImpactRows.map((entry) => presentPolicyChangeFact(entry, limits)),
      ...arrayTrimMeta('requestedImpact', requestedImpactRows.length, requestedImpact.length),
      expandedChanges: expanded.map((entry) => presentPolicyChangeFact(entry, limits)),
      ...arrayTrimMeta('expandedChanges', expanded.length, expandedChanges.length),
      normalizedDiff: diffs.map((entry) => presentNormalizedDiff(entry, limits)),
      ...arrayTrimMeta('normalizedDiff', diffs.length, assessment.normalizedDiff.length),
      sideEffects: sides.map((entry) => presentSideEffect(entry, limits)),
      ...arrayTrimMeta('sideEffects', sides.length, assessment.sideEffects.length),
      globalBlockers: blockers.map((entry) => ({ ...entry })),
      ...arrayTrimMeta('globalBlockers', blockers.length, assessment.globalBlockers.length),
      blastRadius,
    };
  };

  const buildIdentityRequested = (requestedKeep: number): AssessmentPresentation => {
    const requested = requestedOperations.slice(0, requestedKeep);

    return {
      policy,
      spaceId,
      requestedOperations: requested.map(presentRequestedOperationIdentity),
      ...arrayTrimMeta('requestedOperations', requested.length, requestedTotal),
      requestedImpact: [],
      ...arrayTrimMeta('requestedImpact', 0, requestedImpact.length),
      expandedChanges: [],
      ...arrayTrimMeta('expandedChanges', 0, expandedChanges.length),
      normalizedDiff: [],
      ...arrayTrimMeta('normalizedDiff', 0, assessment.normalizedDiff.length),
      sideEffects: [],
      ...arrayTrimMeta('sideEffects', 0, assessment.sideEffects.length),
      globalBlockers: [],
      ...arrayTrimMeta('globalBlockers', 0, assessment.globalBlockers.length),
      blastRadius,
    };
  };

  const skeleton = (): AssessmentPresentation => ({
    policy,
    spaceId,
    requestedOperations: [],
    ...arrayTrimMeta('requestedOperations', 0, requestedTotal),
    requestedImpact: [],
    ...arrayTrimMeta('requestedImpact', 0, requestedImpact.length),
    expandedChanges: [],
    ...arrayTrimMeta('expandedChanges', 0, expandedChanges.length),
    normalizedDiff: [],
    ...arrayTrimMeta('normalizedDiff', 0, assessment.normalizedDiff.length),
    sideEffects: [],
    ...arrayTrimMeta('sideEffects', 0, assessment.sideEffects.length),
    globalBlockers: [],
    ...arrayTrimMeta('globalBlockers', 0, assessment.globalBlockers.length),
    blastRadius,
  });

  const defaultFit = tryOmitTrailingToFit(
    (keep) => build(keep, DEFAULT_TRIM_LIMITS),
    ASSESS_DISPLAY_CAP,
    ASSESS_POLICY_CHANGE_MAX_RESULT_TOKENS
  );

  if (defaultFit !== undefined) {
    const keptRequestedImpact = defaultFit.requestedImpact;
    const keptExpanded = defaultFit.expandedChanges;
    const keptDiffs = defaultFit.normalizedDiff;
    const keptSides = defaultFit.sideEffects;
    if (
      keptRequestedImpact.length > 0 ||
      keptExpanded.length > 0 ||
      keptDiffs.length > 0 ||
      keptSides.length > 0 ||
      (requestedImpact.length === 0 &&
        expandedChanges.length === 0 &&
        assessment.normalizedDiff.length === 0 &&
        assessment.sideEffects.length === 0 &&
        assessment.globalBlockers.length === 0)
    ) {
      return defaultFit;
    }
  }

  return presentWithinGuardedBudget(
    (limits) => build(1, limits),
    ASSESS_POLICY_CHANGE_MAX_RESULT_TOKENS,
    () =>
      omitTrailingToFit(
        (requestedKeep) => build(0, TIGHTEST_TRIM_LIMITS, requestedKeep),
        requestedTotal,
        ASSESS_POLICY_CHANGE_MAX_RESULT_TOKENS,
        () =>
          omitTrailingToFit(
            buildIdentityRequested,
            requestedTotal,
            ASSESS_POLICY_CHANGE_MAX_RESULT_TOKENS,
            skeleton
          )
      )
  );
};

export const createAssessPolicyChangeTool = ({
  endpointAppContextService,
  getStartServices,
}: {
  endpointAppContextService: EndpointAppContextService;
  getStartServices: StartServicesAccessor;
}): BuiltinSkillBoundedTool<typeof assessPolicyChangeSchema> =>
  createPolicyTool({
    endpointAppContextService,
    getStartServices,
    id: ASSESS_POLICY_CHANGE_TOOL_ID,
    description:
      'Assess a bounded proposed change to one Elastic Defend endpoint policy in the current space. ' +
      'Returns requested operations, requested direct impact, expanded intent, normalized diff, and derived side effects as separate facts, ' +
      'plus policy identity and version, enrolled-agent blast-radius source, population, and complete status map, ' +
      'globalBlockers as whole-policy blockers distinct from per-path eligibility, ' +
      'and per-path eligibility computed from registry license, current license, product features, and environment. ' +
      'Uses status.all as the enrolled-agent headline only when that key is present. ' +
      'Each returned section can be bounded; when a section is truncated its *_value_truncated is true and *_value_total is the complete count, and an empty truncated section is not a no-op and is not evidence of no impact. Section-level *_value_truncated uses *_value_total and means the section is incomplete; nested operation value_truncated means the displayed operation value is partial. ' +
      'Does not write policies.',
    schema: assessPolicyChangeSchema,
    maxResultTokens: ASSESS_POLICY_CHANGE_MAX_RESULT_TOKENS,
    run: async (params: AssessPolicyChangeParams, service) => {
      const dto = await service.assessPolicyChange(params);
      return presentAssessPolicyChange(dto);
    },
  });
