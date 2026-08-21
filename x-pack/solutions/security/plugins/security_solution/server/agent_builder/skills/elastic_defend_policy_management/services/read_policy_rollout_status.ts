/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import { HostPolicyResponseActionStatus } from '../../../../../common/endpoint/types';
import { INITIAL_POLICY_ID } from '../../../../endpoint/routes/policy';
import type { EndpointAppContextService } from '../../../../endpoint/endpoint_app_context_services';
import {
  evaluateUnitedOutOfDate,
  buildUnitedRolloutStatusSearch,
} from './policy_rollout_status/united_rollout_status_aggregation';
import { normalizeIntegerRevision } from './policy_rollout_status/normalize_integer_revision';
import {
  LATEST_POLICY_RESPONSE_AGENT_TERMS_SIZE,
  searchLatestPolicyResponses,
  type LatestPolicyResponseHit,
} from '../../../../endpoint/services/policy_response/latest_policy_response_aggregation';
import type { PolicyAccessContext } from './access_context';
import {
  createEndpointPolicySnapshot,
  type EndpointPolicySnapshot,
} from '../domain/endpoint_policy_snapshot';
import type { PolicyIdentity } from './read_policy';

export type RevisionCoverageSource =
  | 'united_metadata_tuple_aggregation'
  | 'no_agent_policy_assignments'
  | 'united_index_missing';

export type CurrentRevisionResponsesSource =
  | 'policy_response_latest_per_agent'
  | 'no_agent_policy_assignments'
  | 'united_index_missing'
  | 'united_agent_id_set_empty';

export type RevisionCoverage = Readonly<{
  outOfDateHosts: number;
  classifiedHosts: number;
  undeterminedHosts: number;
  unclassifiedOverflowHosts: number;
  truncated: boolean;
  source: RevisionCoverageSource;
  population: 'readable_united_endpoint_hosts_canonical_assignment_matches_target_agent_policy_ids';
}>;

export type CurrentRevisionResponses = Readonly<{
  needsAttentionHosts: number;
  classifiedHosts: number;
  undeterminedHosts: number;
  upstreamUnclassifiedHosts: number;
  truncated: boolean;
  source: CurrentRevisionResponsesSource;
  population: 'latest_policy_responses_for_assignment_matched_agents_at_current_package_revision';
  responseCoverageIncomplete: boolean;
}>;

export type PolicyRolloutStatus = Readonly<{
  policy: Pick<PolicyIdentity, 'id' | 'name' | 'revision'>;
  spaceId: string;
  revisionCoverage: RevisionCoverage;
  currentRevisionResponses: CurrentRevisionResponses;
}>;

type CurrentPolicyResponseClassification =
  | 'needs_attention'
  | 'no_attention'
  | 'undetermined'
  | 'excluded';

const ROLLOUT_COVERAGE_POPULATION =
  'readable_united_endpoint_hosts_canonical_assignment_matches_target_agent_policy_ids' as const;
const ROLLOUT_RESPONSE_POPULATION =
  'latest_policy_responses_for_assignment_matched_agents_at_current_package_revision' as const;

const POLICY_ROLLOUT_POLICY_RESPONSE_SOURCE_FIELDS = [
  '_id',
  'agent.id',
  'host.os.name',
  'Endpoint.policy.applied.actions',
  'Endpoint.policy.applied.id',
  'Endpoint.policy.applied.version',
  'Endpoint.policy.applied.endpoint_policy_version',
] as const;

const isIndexNotFoundException = (error: unknown): boolean => {
  if (error == null || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    meta?: { body?: { error?: { type?: unknown } } };
    body?: { error?: { type?: unknown } };
  };

  return (
    candidate.meta?.body?.error?.type === 'index_not_found_exception' ||
    candidate.body?.error?.type === 'index_not_found_exception'
  );
};

const toPolicyIdentity = (
  policy: Pick<PolicyIdentity, 'id' | 'name' | 'revision'>
): Pick<PolicyIdentity, 'id' | 'name' | 'revision'> => ({
  id: policy.id,
  name: policy.name,
  revision: policy.revision,
});

const EMPTY_REVISION_COVERAGE_EVIDENCE = {
  outOfDateHosts: 0,
  classifiedHosts: 0,
  undeterminedHosts: 0,
  unclassifiedOverflowHosts: 0,
} as const;

const EMPTY_RESPONSE_EVIDENCE = {
  needsAttentionHosts: 0,
  classifiedHosts: 0,
  undeterminedHosts: 0,
  upstreamUnclassifiedHosts: 0,
} as const;

export function buildPolicyRolloutStatus({
  snapshot,
  spaceId,
  evidence,
}: {
  snapshot: EndpointPolicySnapshot;
  spaceId: string;
  evidence: Readonly<{
    revisionCoverage: Readonly<{
      source: RevisionCoverageSource;
      outOfDateHosts: number;
      classifiedHosts: number;
      undeterminedHosts: number;
      unclassifiedOverflowHosts: number;
    }>;
    currentRevisionResponses: Readonly<{
      source: CurrentRevisionResponsesSource;
      needsAttentionHosts: number;
      classifiedHosts: number;
      undeterminedHosts: number;
      upstreamUnclassifiedHosts: number;
      responseCoverageIncomplete?: boolean;
    }>;
  }>;
}): PolicyRolloutStatus {
  const revisionCoverage: RevisionCoverage = {
    outOfDateHosts: evidence.revisionCoverage.outOfDateHosts,
    classifiedHosts: evidence.revisionCoverage.classifiedHosts,
    undeterminedHosts: evidence.revisionCoverage.undeterminedHosts,
    unclassifiedOverflowHosts: evidence.revisionCoverage.unclassifiedOverflowHosts,
    truncated: evidence.revisionCoverage.unclassifiedOverflowHosts > 0,
    source: evidence.revisionCoverage.source,
    population: ROLLOUT_COVERAGE_POPULATION,
  };

  const currentRevisionResponses: CurrentRevisionResponses = {
    needsAttentionHosts: evidence.currentRevisionResponses.needsAttentionHosts,
    classifiedHosts: evidence.currentRevisionResponses.classifiedHosts,
    undeterminedHosts: evidence.currentRevisionResponses.undeterminedHosts,
    upstreamUnclassifiedHosts: evidence.currentRevisionResponses.upstreamUnclassifiedHosts,
    truncated: evidence.currentRevisionResponses.upstreamUnclassifiedHosts > 0,
    source: evidence.currentRevisionResponses.source,
    population: ROLLOUT_RESPONSE_POPULATION,
    responseCoverageIncomplete:
      evidence.currentRevisionResponses.responseCoverageIncomplete === true,
  };

  return {
    policy: toPolicyIdentity(snapshot.identity),
    spaceId,
    revisionCoverage,
    currentRevisionResponses,
  };
}

const isActionRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object';

const hasFailureOrWarningAction = (actions: unknown): boolean => {
  if (!Array.isArray(actions)) {
    return false;
  }

  return actions.some((action) => {
    if (!isActionRecord(action)) {
      return false;
    }

    const { status } = action;
    return (
      status === HostPolicyResponseActionStatus.failure ||
      status === HostPolicyResponseActionStatus.warning
    );
  });
};

const classifyCurrentPolicyResponse = (
  hit: LatestPolicyResponseHit,
  packagePolicy: Readonly<{ id: string; revision: number }>
): CurrentPolicyResponseClassification => {
  const applied = hit._source?.Endpoint?.policy?.applied;

  if (applied == null || typeof applied !== 'object') {
    return 'undetermined';
  }

  const { id, endpoint_policy_version: endpointPolicyVersion } = applied;

  if (typeof id !== 'string' || id === '') {
    return 'undetermined';
  }

  if (id === INITIAL_POLICY_ID || id !== packagePolicy.id) {
    return 'excluded';
  }

  const reportedRevision = normalizeIntegerRevision(endpointPolicyVersion);
  if (reportedRevision === undefined) {
    return 'undetermined';
  }

  if (reportedRevision !== packagePolicy.revision) {
    return 'excluded';
  }

  if (!Array.isArray(applied.actions)) {
    return 'undetermined';
  }

  return hasFailureOrWarningAction(applied.actions) ? 'needs_attention' : 'no_attention';
};

const summarizeCurrentPolicyResponses = (
  hits: readonly LatestPolicyResponseHit[],
  packagePolicy: Readonly<{ id: string; revision: number }>
): Readonly<{
  needsAttentionHosts: number;
  classifiedHosts: number;
  undeterminedHosts: number;
}> => {
  let needsAttentionHosts = 0;
  let classifiedHosts = 0;
  let undeterminedHosts = 0;

  for (const hit of hits) {
    const classification = classifyCurrentPolicyResponse(hit, packagePolicy);

    if (classification === 'needs_attention') {
      needsAttentionHosts += 1;
      classifiedHosts += 1;
    } else if (classification === 'no_attention') {
      classifiedHosts += 1;
    } else if (classification === 'undetermined') {
      undeterminedHosts += 1;
    }
  }

  return { needsAttentionHosts, classifiedHosts, undeterminedHosts };
};

const loadConfiguredRevisions = async (
  access: PolicyAccessContext,
  agentPolicyIds: readonly string[]
): Promise<Readonly<Record<string, { id: string; revision: number }>>> => {
  const agentPolicies = await access.fleet.agentPolicy.getByIds(
    access.fleet.getSoClient(),
    [...agentPolicyIds],
    { ignoreMissing: true }
  );
  const configuredByAgentPolicyId: Record<string, { id: string; revision: number }> = {};

  for (const agentPolicy of agentPolicies) {
    configuredByAgentPolicyId[agentPolicy.id] = {
      id: agentPolicy.id,
      revision: agentPolicy.revision,
    };
  }

  return configuredByAgentPolicyId;
};

export const readPolicyRolloutStatus = async (
  access: PolicyAccessContext,
  endpointAppContextService: EndpointAppContextService,
  input: Readonly<{ packagePolicy: PackagePolicy }>,
  request: KibanaRequest
): Promise<PolicyRolloutStatus> => {
  const snapshot = createEndpointPolicySnapshot(input.packagePolicy);
  const spaceId = access.spaceId;
  const agentPolicyIds = snapshot.agentPolicyIds;

  if (agentPolicyIds.length === 0) {
    return buildPolicyRolloutStatus({
      snapshot,
      spaceId,
      evidence: {
        revisionCoverage: {
          ...EMPTY_REVISION_COVERAGE_EVIDENCE,
          source: 'no_agent_policy_assignments',
        },
        currentRevisionResponses: {
          ...EMPTY_RESPONSE_EVIDENCE,
          source: 'no_agent_policy_assignments',
        },
      },
    });
  }

  const configuredByAgentPolicyId = await loadConfiguredRevisions(access, agentPolicyIds);
  const esClient = await endpointAppContextService.getReadEsClient(request);
  const ccsEnabled = await endpointAppContextService.isCcsEnabled();
  const isCpsRead = await endpointAppContextService.isCpsRead(request);
  const currentPackagePolicy = { id: snapshot.identity.id, revision: snapshot.identity.revision };

  let unitedAggregations: unknown;
  let unitedClusters: unknown;

  try {
    const unitedResult = await esClient.search(
      buildUnitedRolloutStatusSearch({
        agentPolicyIds: [...agentPolicyIds],
        ccsEnabled,
        ...(isCpsRead ? { cpsSpaceId: spaceId } : {}),
      })
    );
    unitedAggregations = unitedResult.aggregations;
    unitedClusters = unitedResult._clusters;
  } catch (error) {
    if (isIndexNotFoundException(error)) {
      return buildPolicyRolloutStatus({
        snapshot,
        spaceId,
        evidence: {
          revisionCoverage: {
            ...EMPTY_REVISION_COVERAGE_EVIDENCE,
            source: 'united_index_missing',
          },
          currentRevisionResponses: {
            ...EMPTY_RESPONSE_EVIDENCE,
            source: 'united_index_missing',
          },
        },
      });
    }

    throw error;
  }

  const evaluation = evaluateUnitedOutOfDate({
    aggregations: unitedAggregations,
    packagePolicy: currentPackagePolicy,
    configuredByAgentPolicyId,
  });
  const revisionCoverageEvidence = {
    source: 'united_metadata_tuple_aggregation' as const,
    outOfDateHosts: evaluation.outOfDateHosts,
    classifiedHosts: evaluation.classifiedHosts,
    undeterminedHosts: evaluation.undeterminedHosts,
    unclassifiedOverflowHosts: evaluation.overflowHosts,
  };

  if (evaluation.agentIds.length === 0) {
    return buildPolicyRolloutStatus({
      snapshot,
      spaceId,
      evidence: {
        revisionCoverage: revisionCoverageEvidence,
        currentRevisionResponses: {
          ...EMPTY_RESPONSE_EVIDENCE,
          upstreamUnclassifiedHosts: evaluation.agentOverflow,
          source: 'united_agent_id_set_empty',
        },
      },
    });
  }

  const latestResponses = await searchLatestPolicyResponses(esClient, {
    agentIds: evaluation.agentIds,
    termsSize: LATEST_POLICY_RESPONSE_AGENT_TERMS_SIZE,
    ccsEnabled: ccsEnabled && !isCpsRead,
    sourceFields: POLICY_ROLLOUT_POLICY_RESPONSE_SOURCE_FIELDS,
    excludeInitialPolicy: false,
    unitedClusters,
  });

  return buildPolicyRolloutStatus({
    snapshot,
    spaceId,
    evidence: {
      revisionCoverage: revisionCoverageEvidence,
      currentRevisionResponses: {
        ...summarizeCurrentPolicyResponses(latestResponses.hits, currentPackagePolicy),
        upstreamUnclassifiedHosts: evaluation.agentOverflow,
        responseCoverageIncomplete: latestResponses.coverageIncomplete,
        source: 'policy_response_latest_per_agent',
      },
    },
  });
};
