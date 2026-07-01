/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { QueryLink } from '@kbn/significant-events-schema';
import {
  RULES_BUCKET_SIZE,
  buildChangePointHistogramBounds,
  buildChangePointTimeSeriesAggs,
} from './change_point_scan_shared';
import { ALERTS_READER_V1, ALERTS_READER_V2 } from './alerts_reader';

const SPACE_ID = 'default';
const RULE_UUID = 'rule-abc';
const LOOKBACK = 'now-30m';
const BUCKET_INTERVAL = '30s';
const WINDOW_INTERVAL = '5m';

const makeQueryLink = (
  overrides: { rule_id?: string; stream_name?: string; title?: string } = {}
): QueryLink => ({
  query: {
    id: 'q1',
    type: 'match',
    title: overrides.title ?? 'Test rule',
    description: 'desc',
    esql: { query: 'FROM logs | WHERE body.text:"error"' },
    severity_score: 60,
  },
  stream_name: overrides.stream_name ?? 'logs.test',
  rule_backed: true,
  rule_id: overrides.rule_id ?? RULE_UUID,
});

function createEsClient() {
  const search = jest.fn();
  const count = jest.fn();
  return {
    search,
    count,
    client: { search, count } as unknown as ElasticsearchClient,
  };
}

describe('SignificantEventsAlertsReaderV1', () => {
  const reader = ALERTS_READER_V1;

  it('counts alerts with a document count query', async () => {
    const { client, count } = createEsClient();
    count.mockResolvedValue({ count: 17 });

    const result = await reader.countAlerts(client, { lookback: LOOKBACK, spaceId: SPACE_ID });

    expect(result).toBe(17);
    expect(count).toHaveBeenCalledWith({
      index: '.alerts-streams.alerts-default',
      ignore_unavailable: true,
      query: {
        bool: {
          filter: [
            { terms: { 'kibana.space_ids': [SPACE_ID, '*'] } },
            { range: { '@timestamp': { gte: LOOKBACK } } },
          ],
        },
      },
    });
  });

  it('scopes countAlerts to a single rule when ruleUuid is provided', async () => {
    const { client, count } = createEsClient();
    count.mockResolvedValue({ count: 3 });

    await reader.countAlerts(client, {
      lookback: LOOKBACK,
      spaceId: SPACE_ID,
      ruleUuid: RULE_UUID,
    });

    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          bool: {
            filter: expect.arrayContaining([{ term: { 'kibana.alert.rule.uuid': RULE_UUID } }]),
          },
        },
      })
    );
  });

  it('enriches change-point buckets from ES metadata when present', async () => {
    const { client, search } = createEsClient();
    search.mockResolvedValue({
      aggregations: {
        by_rule: {
          buckets: [
            {
              key: RULE_UUID,
              doc_count: 100,
              rule_name: {
                top: [{ metrics: { 'kibana.alert.rule.name': 'From Elasticsearch' } }],
              },
              stream: { buckets: [{ key: 'logs.from-es' }] },
              change_points: { type: { mean_shift: { p_value: 0.01 } } },
              last_5m: { doc_count: 5 },
              last_floor_window: { doc_count: 8 },
            },
          ],
        },
      },
    });

    const result = await reader.runChangePointScan(
      client,
      { lookback: LOOKBACK, bucketInterval: BUCKET_INTERVAL, spaceId: SPACE_ID },
      [makeQueryLink()]
    );

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: '.alerts-streams.alerts-default',
        aggs: {
          by_rule: {
            terms: { field: 'kibana.alert.rule.uuid', size: RULES_BUCKET_SIZE },
            aggs: {
              rule_name: {
                top_metrics: {
                  metrics: [{ field: 'kibana.alert.rule.name' }],
                  sort: { '@timestamp': 'desc' },
                  size: 1,
                },
              },
              stream: {
                terms: { field: 'kibana.alert.rule.tags', exclude: 'streams', size: 1 },
              },
              ...buildChangePointTimeSeriesAggs(BUCKET_INTERVAL, {
                useDistinctSignalCount: false,
                includeFloorWindow: true,
                extendedBounds: buildChangePointHistogramBounds(LOOKBACK, BUCKET_INTERVAL),
              }),
            },
          },
        },
      })
    );
    expect(result.by_rule.buckets).toEqual([
      {
        key: RULE_UUID,
        doc_count: 100,
        rule_name: {
          top: [{ metrics: { 'kibana.alert.rule.name': 'From Elasticsearch' } }],
        },
        stream: { buckets: [{ key: 'logs.from-es' }] },
        change_points: { type: { mean_shift: { p_value: 0.01 } } },
        last_5m: { doc_count: 5 },
        last_floor_window: { doc_count: 8 },
      },
    ]);
  });

  it('falls back to query link metadata when change-point buckets lack rule metadata', async () => {
    const { client, search } = createEsClient();
    search.mockResolvedValue({
      aggregations: {
        by_rule: {
          buckets: [{ key: RULE_UUID, doc_count: 12 }],
        },
      },
    });

    const result = await reader.runChangePointScan(
      client,
      { lookback: LOOKBACK, bucketInterval: BUCKET_INTERVAL, spaceId: SPACE_ID },
      [makeQueryLink({ title: 'Linked rule title' })]
    );

    expect(result.by_rule.buckets[0]).toEqual(
      expect.objectContaining({
        doc_count: 12,
        rule_name: {
          top: [{ metrics: { 'kibana.alert.rule.name': 'Linked rule title' } }],
        },
        stream: { buckets: [{ key: 'logs.test' }] },
        change_points: { type: {} },
        last_5m: { doc_count: 0 },
        last_floor_window: { doc_count: 0 },
      })
    );
  });

  it('returns rule activity aggregations without normalizing bucket counts', async () => {
    const { client, search } = createEsClient();
    const aggregations = {
      activity_windows: {
        buckets: [{ key: 1_700_000_000_000, doc_count: 9 }],
      },
      peak: { value: 9 },
    };
    search.mockResolvedValue({ aggregations });

    const result = await reader.runRuleActivity(client, {
      ruleUuid: RULE_UUID,
      lookback: LOOKBACK,
      windowInterval: WINDOW_INTERVAL,
      spaceId: SPACE_ID,
    });

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        aggs: {
          activity_windows: {
            date_histogram: {
              field: '@timestamp',
              fixed_interval: WINDOW_INTERVAL,
              min_doc_count: 0,
            },
          },
          peak: {
            max_bucket: { buckets_path: 'activity_windows._count' },
          },
        },
      })
    );
    expect(result.aggregations).toEqual(aggregations);
  });

  it('returns alert window aggregations as doc_count filters', async () => {
    const { client, search } = createEsClient();
    const aggregations = {
      current_window: { doc_count: 4 },
      reference_window: { doc_count: 2 },
    };
    search.mockResolvedValue({ aggregations });

    const result = await reader.runRuleAlertWindows(client, {
      ruleUuid: RULE_UUID,
      currentLookback: 'now-5m',
      referenceLookbackGte: 'now-10m',
      referenceLookbackLt: 'now-5m',
      spaceId: SPACE_ID,
    });

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        aggs: {
          current_window: {
            filter: { range: { '@timestamp': { gte: 'now-5m' } } },
          },
          reference_window: {
            filter: {
              range: { '@timestamp': { gte: 'now-10m', lt: 'now-5m' } },
            },
          },
        },
      })
    );
    expect(result.aggregations).toEqual(aggregations);
  });
});

describe('SignificantEventsAlertsReaderV2', () => {
  const reader = ALERTS_READER_V2;

  it('counts alerts with a distinct group_hash cardinality aggregation', async () => {
    const { client, search } = createEsClient();
    search.mockResolvedValue({ aggregations: { signal_count: { value: 21 } } });

    const result = await reader.countAlerts(client, { lookback: LOOKBACK, spaceId: SPACE_ID });

    expect(result).toBe(21);
    expect(search).toHaveBeenCalledWith({
      index: '.rule-events',
      ignore_unavailable: true,
      size: 0,
      query: {
        bool: {
          filter: [
            { term: { type: 'signal' } },
            { term: { space_id: SPACE_ID } },
            { range: { '@timestamp': { gte: LOOKBACK } } },
          ],
        },
      },
      aggs: {
        signal_count: {
          cardinality: { field: 'group_hash' },
        },
      },
    });
  });

  it('scopes countAlerts to a single rule when ruleUuid is provided', async () => {
    const { client, search } = createEsClient();
    search.mockResolvedValue({ aggregations: { signal_count: { value: 0 } } });

    await reader.countAlerts(client, {
      lookback: LOOKBACK,
      spaceId: SPACE_ID,
      ruleUuid: RULE_UUID,
    });

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          bool: {
            filter: expect.arrayContaining([{ term: { 'rule.id': RULE_UUID } }]),
          },
        },
      })
    );
  });

  it('normalizes change-point buckets to distinct signal counts and query link metadata', async () => {
    const { client, search } = createEsClient();
    search.mockResolvedValue({
      aggregations: {
        by_rule: {
          buckets: [
            {
              key: RULE_UUID,
              doc_count: 100,
              signal_count: { value: 42 },
              change_points: { type: { mean_shift: { p_value: 0.02 } } },
              last_5m: { signal_count: { value: 5 } },
              last_floor_window: { doc_count: 10, signal_count: { value: 8 } },
            },
          ],
        },
      },
    });

    const result = await reader.runChangePointScan(
      client,
      { lookback: LOOKBACK, bucketInterval: BUCKET_INTERVAL, spaceId: SPACE_ID },
      [makeQueryLink({ title: 'Linked rule title' })]
    );

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: '.rule-events',
        aggs: {
          by_rule: {
            terms: { field: 'rule.id', size: RULES_BUCKET_SIZE },
            aggs: {
              signal_count: {
                cardinality: { field: 'group_hash' },
              },
              ...buildChangePointTimeSeriesAggs(BUCKET_INTERVAL, {
                useDistinctSignalCount: true,
                includeFloorWindow: true,
                extendedBounds: buildChangePointHistogramBounds(LOOKBACK, BUCKET_INTERVAL),
              }),
            },
          },
        },
      })
    );
    expect(result.by_rule.buckets).toEqual([
      {
        key: RULE_UUID,
        doc_count: 42,
        rule_name: {
          top: [{ metrics: { 'kibana.alert.rule.name': 'Linked rule title' } }],
        },
        stream: { buckets: [{ key: 'logs.test' }] },
        change_points: { type: { mean_shift: { p_value: 0.02 } } },
        last_5m: { doc_count: 5 },
        last_floor_window: { doc_count: 8 },
      },
    ]);
  });

  it('normalizes rule activity windows to doc_count from signal_count', async () => {
    const { client, search } = createEsClient();
    search.mockResolvedValue({
      aggregations: {
        activity_windows: {
          buckets: [
            { key: 1_700_000_000_000, doc_count: 100, signal_count: { value: 9 } },
            { key: 1_700_000_300_000, doc_count: 50, signal_count: { value: 3 } },
          ],
        },
        peak: { value: 9 },
      },
    });

    const result = await reader.runRuleActivity(client, {
      ruleUuid: RULE_UUID,
      lookback: LOOKBACK,
      windowInterval: WINDOW_INTERVAL,
      spaceId: SPACE_ID,
    });

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        aggs: {
          activity_windows: {
            date_histogram: {
              field: '@timestamp',
              fixed_interval: WINDOW_INTERVAL,
              min_doc_count: 0,
            },
            aggs: {
              signal_count: {
                cardinality: { field: 'group_hash' },
              },
            },
          },
          peak: {
            max_bucket: { buckets_path: 'activity_windows>signal_count' },
          },
        },
      })
    );
    expect(result.aggregations).toEqual({
      activity_windows: {
        buckets: [
          { key: 1_700_000_000_000, doc_count: 9 },
          { key: 1_700_000_300_000, doc_count: 3 },
        ],
      },
      peak: { value: 9 },
    });
  });

  it('normalizes alert window aggregations to doc_count from signal_count', async () => {
    const { client, search } = createEsClient();
    search.mockResolvedValue({
      aggregations: {
        current_window: { doc_count: 100, signal_count: { value: 4 } },
        reference_window: { doc_count: 80, signal_count: { value: 2 } },
      },
    });

    const result = await reader.runRuleAlertWindows(client, {
      ruleUuid: RULE_UUID,
      currentLookback: 'now-5m',
      referenceLookbackGte: 'now-10m',
      referenceLookbackLt: 'now-5m',
      spaceId: SPACE_ID,
    });

    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        aggs: {
          current_window: {
            filter: { range: { '@timestamp': { gte: 'now-5m' } } },
            aggs: {
              signal_count: {
                cardinality: { field: 'group_hash' },
              },
            },
          },
          reference_window: {
            filter: {
              range: { '@timestamp': { gte: 'now-10m', lt: 'now-5m' } },
            },
            aggs: {
              signal_count: {
                cardinality: { field: 'group_hash' },
              },
            },
          },
        },
      })
    );
    expect(result.aggregations).toEqual({
      current_window: { doc_count: 4 },
      reference_window: { doc_count: 2 },
    });
  });
});
