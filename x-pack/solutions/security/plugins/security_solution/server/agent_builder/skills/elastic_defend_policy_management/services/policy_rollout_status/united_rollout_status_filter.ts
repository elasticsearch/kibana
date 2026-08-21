/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { uniq } from 'lodash';
import type {
  QueryDslBoolQuery,
  QueryDslQueryContainer,
} from '@elastic/elasticsearch/lib/api/types';
import { buildBaseEndpointMetadataFilter } from '../../../../../../common/endpoint/utils/endpoint_metadata_filter';

export const UNITED_ROLLOUT_STATUS_ASSIGNMENT_FIELD = 'policy_rollout.applied_agent_policy_id';

const isBoolQueryContainer = (
  query: QueryDslQueryContainer
): query is QueryDslQueryContainer & { bool: QueryDslBoolQuery } =>
  typeof query === 'object' && query !== null && 'bool' in query && query.bool !== undefined;

const asFilterClauses = (filter: QueryDslBoolQuery['filter']): QueryDslQueryContainer[] => {
  if (Array.isArray(filter)) {
    return filter;
  }
  if (filter === undefined) {
    return [];
  }
  return [filter];
};

export function buildUnitedRolloutStatusFilter(agentPolicyIds: string[]): QueryDslQueryContainer {
  const uniqueAgentPolicyIds = uniq(agentPolicyIds);
  if (uniqueAgentPolicyIds.length === 0) {
    return { match_none: {} };
  }

  const assignmentClause: QueryDslQueryContainer = {
    terms: { [UNITED_ROLLOUT_STATUS_ASSIGNMENT_FIELD]: uniqueAgentPolicyIds },
  };
  const baseQuery = buildBaseEndpointMetadataFilter();
  if (!isBoolQueryContainer(baseQuery)) {
    throw new Error('buildBaseEndpointMetadataFilter() must return a bool query');
  }

  const { bool: baseBool } = baseQuery;

  return {
    bool: {
      ...baseBool,
      filter: [...asFilterClauses(baseBool.filter), assignmentClause],
    },
  };
}
