/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import { getToolHandler } from './handler';

jest.mock('../../utils/get_observability_data_sources', () => ({
  getObservabilityDataSources: jest.fn(async () => ({
    apmIndexPatterns: { transaction: 'traces-apm*,apm-*' },
  })),
}));

const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn() } as any;

function createEsClient(search: jest.Mock): IScopedClusterClient {
  return { asCurrentUser: { search } } as unknown as IScopedClusterClient;
}

function run(search: jest.Mock) {
  return getToolHandler({
    core: {} as any,
    plugins: {} as any,
    logger,
    esClient: createEsClient(search),
    start: 'now-15m',
    end: 'now',
    kqlFilter: 'service.name: "frontend"',
    metric: 'latency',
    percentileThreshold: 95,
    limit: 10,
  });
}

describe('get_apm_correlations handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns an empty result when no documents match the filter', async () => {
    const search = jest.fn().mockResolvedValueOnce({ hits: { total: { value: 0 } } });

    const result = await run(search);

    expect(result.correlations).toEqual([]);
    expect(result.totalTransactions).toBe(0);
    // Only the overall-count query runs; no percentile query when there are no hits.
    expect(search).toHaveBeenCalledTimes(1);
  });

  // Regression: previously threw "Could not compute duration percentile (p95)" and
  // aborted the whole investigation flow. Now it degrades to an empty result.
  it('returns an empty result (does not throw) when the duration percentile is null', async () => {
    const search = jest
      .fn()
      // overall count — documents DO match the filter
      .mockResolvedValueOnce({ hits: { total: { value: 5 } } })
      // percentile aggregation — but none carry a usable transaction.duration.us value
      .mockResolvedValueOnce({
        aggregations: { duration_percentile: { values: { '95': null } } },
      });

    const result = await run(search);

    expect(result.metric).toBe('latency');
    expect(result.totalTransactions).toBe(5);
    expect(result.correlations).toEqual([]);
    expect(result.subset).toEqual({
      totalTransactions: 0,
      definition: { metric: 'latency', percentileThreshold: 95, durationThresholdUs: undefined },
    });
    // Count + percentile queries ran; it stopped before computing the subset.
    expect(search).toHaveBeenCalledTimes(2);
  });
});
