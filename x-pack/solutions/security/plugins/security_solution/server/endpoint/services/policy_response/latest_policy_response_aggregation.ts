/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SearchRequest } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core/server';

import { policyIndexPattern } from '../../../../common/endpoint/constants';
import { INITIAL_POLICY_ID } from '../../routes/policy';
import { prefixIndexPatternsWithCcs } from '../../utils/ccs_utils';

export const LATEST_POLICY_RESPONSE_AGENT_TERMS_SIZE = 1500;

export interface LatestPolicyResponseAggregationParams {
  agentIds: readonly string[];
  termsSize: number;
  ccsEnabled: boolean;
  sourceFields: readonly string[];
  excludeInitialPolicy: boolean;
  unitedClusters?: unknown;
}

export interface LatestPolicyResponseAction {
  name: string;
  message: string;
  status: string;
}

export interface LatestPolicyResponseSource {
  agent?: { id?: string };
  Endpoint?: {
    policy?: {
      applied?: {
        id?: string;
        version?: number;
        endpoint_policy_version?: number;
        actions?: LatestPolicyResponseAction[];
      };
    };
  };
  host?: { os?: { name?: string } };
}

export interface LatestPolicyResponseHit {
  _id: string;
  _source?: LatestPolicyResponseSource;
}

export interface LatestPolicyResponseAggregation {
  latest_actions?: {
    buckets?: Array<{
      key?: string;
      doc_count?: number;
      latest_event?: {
        hits?: {
          hits?: Array<{
            _id?: string;
            _source?: LatestPolicyResponseSource;
          }>;
        };
      };
    }>;
    sum_other_doc_count?: number;
  };
}

export interface LatestPolicyResponseAggregationResult {
  hits: LatestPolicyResponseHit[];
  overflowAgents: number;
  coverageIncomplete: boolean;
}

const INCOMPLETE_CLUSTER_STATUSES = new Set(['skipped', 'failed', 'partial']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object';

const toFiniteCount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const clusterShardTotal = (detail: Record<string, unknown>): number | undefined => {
  const shards = detail._shards;
  if (!isRecord(shards)) {
    return undefined;
  }

  return toFiniteCount(shards.total);
};

const hasIncompleteClusterStatus = (clusters: unknown): boolean => {
  if (!isRecord(clusters)) {
    return false;
  }

  for (const key of ['skipped', 'failed', 'partial'] as const) {
    const count = toFiniteCount(clusters[key]);
    if (count !== undefined && count > 0) {
      return true;
    }
  }

  const { details } = clusters;
  if (!isRecord(details)) {
    return false;
  }

  return Object.values(details).some((detail) => {
    if (!isRecord(detail)) {
      return false;
    }

    const { status } = detail;
    return typeof status === 'string' && INCOMPLETE_CLUSTER_STATUSES.has(status);
  });
};

const hasUnitedPolicyClusterMismatch = (
  unitedClusters: unknown,
  policyClusters: unknown
): boolean => {
  if (!isRecord(unitedClusters) || !isRecord(policyClusters)) {
    return false;
  }

  const unitedDetails = unitedClusters.details;
  const policyDetails = policyClusters.details;
  if (!isRecord(unitedDetails) || !isRecord(policyDetails)) {
    return false;
  }

  return Object.entries(unitedDetails).some(([clusterName, unitedDetail]) => {
    if (!isRecord(unitedDetail)) {
      return false;
    }

    const unitedShards = clusterShardTotal(unitedDetail);
    if (unitedShards === undefined || unitedShards <= 0) {
      return false;
    }

    const policyDetail = policyDetails[clusterName];
    if (!isRecord(policyDetail)) {
      return true;
    }

    return clusterShardTotal(policyDetail) === 0;
  });
};

export const evaluateLatestPolicyResponseCoverageIncomplete = ({
  ccsEnabled,
  policyClusters,
  unitedClusters,
}: {
  ccsEnabled: boolean;
  policyClusters: unknown;
  unitedClusters?: unknown;
}): boolean => {
  if (!ccsEnabled) {
    return false;
  }

  return (
    hasIncompleteClusterStatus(policyClusters) ||
    hasUnitedPolicyClusterMismatch(unitedClusters, policyClusters)
  );
};

const INITIAL_POLICY_MUST_NOT = {
  term: {
    'Endpoint.policy.applied.id': INITIAL_POLICY_ID,
  },
} as const;

export const buildLatestPolicyResponseAggregation = ({
  agentIds,
  termsSize,
  ccsEnabled,
  sourceFields,
  excludeInitialPolicy,
}: LatestPolicyResponseAggregationParams): SearchRequest => ({
  allow_no_indices: true,
  ignore_unavailable: true,
  index: [prefixIndexPatternsWithCcs(policyIndexPattern, ccsEnabled)],
  query: {
    bool: {
      must: [
        {
          terms: {
            'agent.id': [...agentIds],
          },
        },
      ],
      ...(excludeInitialPolicy ? { must_not: [INITIAL_POLICY_MUST_NOT] } : {}),
    },
  },
  size: 0,
  aggs: {
    latest_actions: {
      terms: {
        field: 'agent.id',
        size: termsSize,
      },
      aggs: {
        latest_event: {
          top_hits: {
            size: 1,
            sort: [
              {
                'event.created': {
                  order: 'desc',
                },
              },
            ],
            _source: [...sourceFields],
          },
        },
      },
    },
  },
});

export const parseLatestPolicyResponseAggregation = (
  aggregations: LatestPolicyResponseAggregation | undefined
): LatestPolicyResponseAggregationResult => {
  const latestActions = aggregations?.latest_actions;
  const buckets = Array.isArray(latestActions?.buckets) ? latestActions.buckets : [];
  const overflowAgents =
    typeof latestActions?.sum_other_doc_count === 'number' ? latestActions.sum_other_doc_count : 0;

  const hits = buckets.flatMap((bucket) => {
    const latestHit = bucket?.latest_event?.hits?.hits?.[0];
    if (!latestHit || typeof latestHit._id !== 'string') {
      return [];
    }

    return [{ _id: latestHit._id, _source: latestHit._source }];
  });

  return { hits, overflowAgents, coverageIncomplete: false };
};

export const searchLatestPolicyResponses = async (
  esClient: ElasticsearchClient,
  params: LatestPolicyResponseAggregationParams
): Promise<LatestPolicyResponseAggregationResult> => {
  if (params.agentIds.length === 0) {
    return { hits: [], overflowAgents: 0, coverageIncomplete: false };
  }

  const result = await esClient.search<LatestPolicyResponseSource, LatestPolicyResponseAggregation>(
    buildLatestPolicyResponseAggregation(params)
  );

  return {
    ...parseLatestPolicyResponseAggregation(result.aggregations),
    coverageIncomplete: evaluateLatestPolicyResponseCoverageIncomplete({
      ccsEnabled: params.ccsEnabled,
      policyClusters: result._clusters,
      unitedClusters: params.unitedClusters,
    }),
  };
};
