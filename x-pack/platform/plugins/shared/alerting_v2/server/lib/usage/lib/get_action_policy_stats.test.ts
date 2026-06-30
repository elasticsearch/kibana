/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { getActionPolicyStats } from './get_action_policy_stats';

const elasticsearch = elasticsearchServiceMock.createStart();
const esClient = elasticsearch.client.asInternalUser;

beforeEach(() => {
  jest.resetAllMocks();
});

function mockSearchResponse({
  total = 5,
  uniqueWorkflowCount = 3,
  countWithMatcher = 2,
  countAgentBuilderAssisted = 1,
  countWithGroupBy = 1,
  avgGroupByFieldsCount = 2.5,
  throttleIntervalBuckets = [
    { key: '5m', doc_count: 3 },
    { key: '1h', doc_count: 2 },
  ],
}: {
  total?: number;
  uniqueWorkflowCount?: number;
  countWithMatcher?: number;
  countAgentBuilderAssisted?: number;
  countWithGroupBy?: number;
  avgGroupByFieldsCount?: number | null;
  throttleIntervalBuckets?: Array<{ key: string; doc_count: number }>;
} = {}) {
  esClient.search.mockResponseOnce({
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: { total: { value: total, relation: 'eq' }, max_score: null, hits: [] },
    aggregations: {
      unique_workflow_count: { value: uniqueWorkflowCount },
      count_with_matcher: { doc_count: countWithMatcher },
      count_agent_builder_assisted: { doc_count: countAgentBuilderAssisted },
      count_by_throttle_interval: { buckets: throttleIntervalBuckets },
      count_with_group_by: { doc_count: countWithGroupBy },
      avg_group_by_fields_count: { value: avgGroupByFieldsCount },
    },
  } as any);
}

describe('getActionPolicyStats', () => {
  it('returns stats from aggregations', async () => {
    mockSearchResponse({});

    const result = await getActionPolicyStats(esClient);

    expect(result).toEqual({
      action_policies_count: 5,
      action_policies_unique_workflow_count: 3,
      action_policies_count_with_matcher: 2,
      action_policies_count_agent_builder_assisted: 1,
      action_policies_count_with_group_by: 1,
      action_policies_avg_group_by_fields_count: 2.5,
      action_policies_count_by_throttle_interval: [
        {
          name: '5m',
          value: 3,
        },
        {
          name: '1h',
          value: 2,
        },
      ],
    });
  });

  it('returns null avg when no policies have group_by', async () => {
    mockSearchResponse({
      total: 3,
      countWithGroupBy: 0,
      avgGroupByFieldsCount: null,
      throttleIntervalBuckets: [],
    });

    const result = await getActionPolicyStats(esClient);

    expect(result.action_policies_avg_group_by_fields_count).toBeNull();
    expect(result.action_policies_count_by_throttle_interval).toEqual([]);
  });

  it('returns empty results when no action policies exist', async () => {
    mockSearchResponse({
      total: 0,
      uniqueWorkflowCount: 0,
      countWithMatcher: 0,
      countAgentBuilderAssisted: 0,
      countWithGroupBy: 0,
      avgGroupByFieldsCount: null,
      throttleIntervalBuckets: [],
    });

    const result = await getActionPolicyStats(esClient);

    expect(result).toEqual({
      action_policies_count: 0,
      action_policies_unique_workflow_count: 0,
      action_policies_count_with_matcher: 0,
      action_policies_count_agent_builder_assisted: 0,
      action_policies_count_with_group_by: 0,
      action_policies_avg_group_by_fields_count: null,
      action_policies_count_by_throttle_interval: [],
    });
  });

  it('returns defaults when aggregations are undefined', async () => {
    esClient.search.mockResponseOnce({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: { total: { value: 0, relation: 'eq' }, max_score: null, hits: [] },
    } as any);

    const result = await getActionPolicyStats(esClient);

    expect(result).toEqual({
      action_policies_count: 0,
      action_policies_unique_workflow_count: 0,
      action_policies_count_with_matcher: 0,
      action_policies_count_agent_builder_assisted: 0,
      action_policies_count_with_group_by: 0,
      action_policies_avg_group_by_fields_count: null,
      action_policies_count_by_throttle_interval: [],
    });
  });

  it('handles numeric hits.total format', async () => {
    esClient.search.mockResponseOnce({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: { total: 7, max_score: null, hits: [] },
      aggregations: {
        unique_workflow_count: { value: 4 },
        count_with_matcher: { doc_count: 1 },
        count_agent_builder_assisted: { doc_count: 0 },
        count_by_throttle_interval: { buckets: [] },
        count_with_group_by: { doc_count: 0 },
        avg_group_by_fields_count: { value: null },
      },
    } as any);

    const result = await getActionPolicyStats(esClient);

    expect(result.action_policies_count).toBe(7);
  });
});
