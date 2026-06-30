/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getErrorGroups, getErrorGroupsHistogramInterval } from './get_error_groups';
import { getUptimeESMockClient } from './test_helpers';

describe('getErrorGroupsHistogramInterval', () => {
  it('targets ~24 buckets across the window (7d -> 7h)', () => {
    const interval = getErrorGroupsHistogramInterval(
      '2026-06-20T08:00:00.000Z',
      '2026-06-27T08:00:00.000Z'
    );
    expect(interval).toBe(7 * 60 * 60 * 1000);
  });

  it('targets ~24 buckets across the window (24h -> 1h)', () => {
    const interval = getErrorGroupsHistogramInterval(
      '2026-06-26T08:00:00.000Z',
      '2026-06-27T08:00:00.000Z'
    );
    expect(interval).toBe(60 * 60 * 1000);
  });

  it('clamps to a 1-minute floor for very short windows', () => {
    const interval = getErrorGroupsHistogramInterval(
      '2026-06-27T08:00:00.000Z',
      '2026-06-27T08:10:00.000Z'
    );
    expect(interval).toBe(60_000);
  });

  it('falls back to 1h when the range cannot be parsed or is inverted', () => {
    expect(getErrorGroupsHistogramInterval('', '')).toBe(60 * 60 * 1000);
    expect(getErrorGroupsHistogramInterval('now', 'now-1d')).toBe(60 * 60 * 1000);
  });
});

describe('getErrorGroups', () => {
  const emptyAggsResponse = {
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: { hits: [], max_score: 0, total: { value: 0, relation: 'eq' as const } },
    aggregations: { error_groups: { buckets: [] } },
  };

  // Regression guard for the blank "Errors over time" chart: all error groups
  // must share ONE aligned time grid. A per-group `auto_date_histogram` gave
  // short-lived groups a finer interval, collapsing the merged chart's bars to
  // sub-pixel width. We assert we request a single shared `fixed_interval`
  // `date_histogram` with `extended_bounds`, and never an `auto_date_histogram`.
  it('buckets all groups on a single shared fixed_interval grid', async () => {
    const { esClient, syntheticsEsClient } = getUptimeESMockClient();
    esClient.search.mockResponseOnce(emptyAggsResponse as any);

    await getErrorGroups({
      syntheticsEsClient,
      from: '2026-06-20T08:00:00.000Z',
      to: '2026-06-27T08:00:00.000Z',
      spaceId: 'default',
    });

    const call: any = esClient.search.mock.calls[0][0];
    const overTime = call.aggs.error_groups.aggs.over_time;

    expect(overTime.auto_date_histogram).toBeUndefined();
    expect(overTime.date_histogram).toEqual({
      field: '@timestamp',
      fixed_interval: `${7 * 60 * 60 * 1000}ms`,
      min_doc_count: 0,
      extended_bounds: {
        min: Date.parse('2026-06-20T08:00:00.000Z'),
        max: Date.parse('2026-06-27T08:00:00.000Z'),
      },
    });
  });

  it('maps category buckets into error groups with histograms', async () => {
    const { esClient, syntheticsEsClient } = getUptimeESMockClient();
    esClient.search.mockResponseOnce({
      ...emptyAggsResponse,
      aggregations: {
        error_groups: {
          buckets: [
            {
              key: 'EOF',
              doc_count: 1440,
              error_states: { value: 1 },
              affected_monitors: { value: 1 },
              affected_locations: { value: 1 },
              first_seen: { value_as_string: '2026-01-16T17:06:22.412Z' },
              last_seen: { value_as_string: '2026-06-27T08:00:00.000Z' },
              per_state: {
                buckets: [
                  {
                    key: 'state-1',
                    latest: {
                      hits: {
                        hits: [
                          {
                            _source: {
                              '@timestamp': '2026-06-27T08:00:00.000Z',
                              config_id: 'cfg-1',
                              monitor: { name: 'tcp-ES', type: 'tcp' },
                              state: { id: 'state-1', duration_ms: '13965247346' },
                              observer: { name: 'us-east', geo: { name: 'US East' } },
                              error: { message: 'EOF' },
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
              },
              over_time: {
                buckets: [
                  { key: 1782547200000, doc_count: 700 },
                  { key: 1782572400000, doc_count: 720 },
                  { key: 1782597600000, doc_count: 20 },
                ],
              },
            },
          ],
        },
      },
    } as any);

    const { groups } = await getErrorGroups({
      syntheticsEsClient,
      from: '2026-06-20T08:00:00.000Z',
      to: '2026-06-27T08:00:00.000Z',
      spaceId: 'default',
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      name: 'EOF',
      pattern: 'persistent',
      monitorCount: 1,
      histogram: [
        { timestamp: 1782547200000, count: 700 },
        { timestamp: 1782572400000, count: 720 },
        { timestamp: 1782597600000, count: 20 },
      ],
    });
  });
});
