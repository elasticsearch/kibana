/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  buildChangePointHistogramBounds,
  buildChangePointTimeSeriesAggs,
  buildDateHistogramAgg,
} from './change_point_scan_shared';

describe('buildChangePointHistogramBounds', () => {
  it('pins the date_histogram to the lookback window and excludes the open bucket', () => {
    expect(buildChangePointHistogramBounds('now-30m', '30s')).toEqual({
      min: 'now-30m',
      max: 'now-30s',
    });
  });
});

describe('buildDateHistogramAgg', () => {
  it('includes extended_bounds so change_point receives enough buckets', () => {
    const extendedBounds = buildChangePointHistogramBounds('now-30m', '30s');

    expect(buildDateHistogramAgg('30s', extendedBounds)).toEqual({
      date_histogram: {
        field: '@timestamp',
        fixed_interval: '30s',
        min_doc_count: 0,
        extended_bounds: extendedBounds,
      },
    });
  });
});

describe('buildChangePointTimeSeriesAggs', () => {
  it('threads extended_bounds through the over_time histogram', () => {
    const extendedBounds = buildChangePointHistogramBounds('now-30m', '30s');
    const aggs = buildChangePointTimeSeriesAggs('30s', {
      useDistinctSignalCount: false,
      extendedBounds,
    });

    expect(aggs.over_time).toEqual(buildDateHistogramAgg('30s', extendedBounds));
    expect(aggs.change_points).toEqual({
      change_point: { buckets_path: 'over_time>_count' },
    });
  });

  it('uses signal_count for v2 change_point bucket paths', () => {
    const extendedBounds = buildChangePointHistogramBounds('now-30m', '30s');
    const aggs = buildChangePointTimeSeriesAggs('30s', {
      useDistinctSignalCount: true,
      extendedBounds,
    });

    expect(aggs.change_points).toEqual({
      change_point: { buckets_path: 'over_time>signal_count' },
    });
  });
});
