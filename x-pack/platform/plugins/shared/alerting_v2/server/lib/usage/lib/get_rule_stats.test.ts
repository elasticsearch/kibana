/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { getRuleStats } from './get_rule_stats';

const elasticsearch = elasticsearchServiceMock.createStart();
const esClient = elasticsearch.client.asInternalUser;

beforeEach(() => {
  jest.resetAllMocks();
});

function mockRuleSearchResponse({
  total = 20,
  countEnabled = 15,
  countAgentBuilderAssisted = 7,
  kindBuckets = [
    { key: 'metric', doc_count: 12 },
    { key: 'log', doc_count: 8 },
  ],
  scheduleBuckets = [
    { key: '1m', doc_count: 10 },
    { key: '5m', doc_count: 10 },
  ],
  lookbackBuckets = [{ key: '5m', doc_count: 20 }],
  avgPendingCount = 3.0,
  avgRecoveringCount = 2.0,
  pendingTimeframeBuckets = [{ key: '5m', doc_count: 8 }],
  recoveringTimeframeBuckets = [{ key: '10m', doc_count: 6 }],
  countWithGrouping = 4,
  avgGroupingFieldsCount = 2.0,
  minCreatedAt = '2026-01-15T12:00:00.000Z',
}: {
  total?: number;
  countEnabled?: number;
  countAgentBuilderAssisted?: number;
  kindBuckets?: Array<{ key: string; doc_count: number }>;
  scheduleBuckets?: Array<{ key: string; doc_count: number }>;
  lookbackBuckets?: Array<{ key: string; doc_count: number }>;
  avgPendingCount?: number | null;
  avgRecoveringCount?: number | null;
  pendingTimeframeBuckets?: Array<{ key: string; doc_count: number }>;
  recoveringTimeframeBuckets?: Array<{ key: string; doc_count: number }>;
  countWithGrouping?: number;
  avgGroupingFieldsCount?: number | null;
  minCreatedAt?: string | null;
} = {}) {
  esClient.search.mockResponseOnce({
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: { total: { value: total, relation: 'eq' }, max_score: null, hits: [] },
    aggregations: {
      count_enabled: { doc_count: countEnabled },
      count_agent_builder_assisted: { doc_count: countAgentBuilderAssisted },
      count_by_kind: { buckets: kindBuckets },
      count_by_schedule: { buckets: scheduleBuckets },
      count_by_lookback: { buckets: lookbackBuckets },
      avg_pending_count: { value: avgPendingCount },
      avg_recovering_count: { value: avgRecoveringCount },
      count_by_pending_timeframe: { buckets: pendingTimeframeBuckets },
      count_by_recovering_timeframe: { buckets: recoveringTimeframeBuckets },
      count_with_grouping: { doc_count: countWithGrouping },
      avg_grouping_fields_count: { value: avgGroupingFieldsCount },
      min_created_at: {
        value: minCreatedAt ? Date.parse(minCreatedAt) : null,
        value_as_string: minCreatedAt ?? undefined,
      },
    },
  } as any);
}

describe('getRuleStats', () => {
  it('returns stats from aggregations', async () => {
    mockRuleSearchResponse({});

    const result = await getRuleStats(esClient);

    expect(result).toEqual({
      count_total: 20,
      count_enabled: 15,
      count_agent_builder_assisted: 7,
      count_by_kind: { metric: 12, log: 8 },
      count_by_schedule: [
        { name: '1m', value: 10 },
        { name: '5m', value: 10 },
      ],
      count_by_lookback: [{ name: '5m', value: 20 }],
      avg_pending_count: 3.0,
      avg_recovering_count: 2.0,
      count_by_pending_timeframe: [{ name: '5m', value: 8 }],
      count_by_recovering_timeframe: [{ name: '10m', value: 6 }],
      count_with_grouping: 4,
      avg_grouping_fields_count: 2.0,
      min_created_at: '2026-01-15T12:00:00.000Z',
    });
  });

  it('returns empty results when no rules exist', async () => {
    mockRuleSearchResponse({
      total: 0,
      countEnabled: 0,
      countAgentBuilderAssisted: 0,
      kindBuckets: [],
      scheduleBuckets: [],
      lookbackBuckets: [],
      avgPendingCount: null,
      avgRecoveringCount: null,
      pendingTimeframeBuckets: [],
      recoveringTimeframeBuckets: [],
      countWithGrouping: 0,
      avgGroupingFieldsCount: null,
      minCreatedAt: null,
    });

    const result = await getRuleStats(esClient);

    expect(result).toEqual({
      count_total: 0,
      count_enabled: 0,
      count_agent_builder_assisted: 0,
      count_by_kind: {},
      count_by_schedule: [],
      count_by_lookback: [],
      avg_pending_count: null,
      avg_recovering_count: null,
      count_by_pending_timeframe: [],
      count_by_recovering_timeframe: [],
      count_with_grouping: 0,
      avg_grouping_fields_count: null,
      min_created_at: null,
    });
  });

  it('returns defaults when aggregations are undefined', async () => {
    esClient.search.mockResponseOnce({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: { total: { value: 0, relation: 'eq' }, max_score: null, hits: [] },
    } as any);

    const result = await getRuleStats(esClient);

    expect(result).toEqual({
      count_total: 0,
      count_enabled: 0,
      count_agent_builder_assisted: 0,
      count_by_kind: {},
      count_by_schedule: [],
      count_by_lookback: [],
      avg_pending_count: null,
      avg_recovering_count: null,
      count_by_pending_timeframe: [],
      count_by_recovering_timeframe: [],
      count_with_grouping: 0,
      avg_grouping_fields_count: null,
      min_created_at: null,
    });
  });

  it('handles numeric hits.total format', async () => {
    esClient.search.mockResponseOnce({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: { total: 3, max_score: null, hits: [] },
      aggregations: {
        count_enabled: { doc_count: 2 },
        count_agent_builder_assisted: { doc_count: 1 },
        count_by_kind: { buckets: [] },
        count_by_schedule: { buckets: [] },
        count_by_lookback: { buckets: [] },
        avg_pending_count: { value: null },
        avg_recovering_count: { value: null },
        count_by_pending_timeframe: { buckets: [] },
        count_by_recovering_timeframe: { buckets: [] },
        count_with_grouping: { doc_count: 0 },
        avg_grouping_fields_count: { value: null },
        min_created_at: { value: null },
      },
    } as any);

    const result = await getRuleStats(esClient);

    expect(result.count_total).toBe(3);
  });
});
