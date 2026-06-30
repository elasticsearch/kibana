/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClientMock } from '@kbn/core/server/mocks';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';

import type { PackagePolicy } from '../../../common/types/models';

import { getPolicyThroughput } from './throughput';

jest.mock('../epm/elasticsearch/retry', () => ({
  retryTransientEsErrors: (fn: () => Promise<unknown>) => fn(),
}));

const makePolicy = (
  streams: Array<{ enabled: boolean; type?: string; dataset: string }>
): PackagePolicy =>
  ({
    id: 'test-policy-id',
    name: 'test-policy',
    namespace: 'default',
    enabled: true,
    policy_ids: [],
    inputs: [
      {
        type: 'test-input',
        enabled: true,
        streams: streams.map((s) => ({
          enabled: s.enabled,
          data_stream: { type: s.type ?? 'logs', dataset: s.dataset },
        })),
      },
    ],
  } as unknown as PackagePolicy);

const BUCKET_INTERVAL_SECONDS = 30 * 60; // 1800s — mirrors the constant in throughput.ts
const FULL_WINDOW_SECONDS = 24 * 3600; // 86400s

describe('getPolicyThroughput', () => {
  let esClient: ElasticsearchClientMock;
  let dateSpy: jest.SpyInstance;

  beforeEach(() => {
    esClient = elasticsearchServiceMock.createElasticsearchClient();
    dateSpy = jest.spyOn(Date, 'now');
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  it('returns empty result without calling ES when there are no enabled streams', async () => {
    const policy = makePolicy([{ enabled: false, dataset: 'nginx.access' }]);
    const result = await getPolicyThroughput(esClient, policy);
    expect(result).toEqual({ averagePerSecond: 0, series: [] });
    expect(esClient.search).not.toHaveBeenCalled();
  });

  it('returns empty result when all inputs have no streams', async () => {
    const policy = { ...makePolicy([]), inputs: [] } as unknown as PackagePolicy;
    const result = await getPolicyThroughput(esClient, policy);
    expect(result).toEqual({ averagePerSecond: 0, series: [] });
    expect(esClient.search).not.toHaveBeenCalled();
  });

  it('returns empty result on ES 404', async () => {
    const policy = makePolicy([{ enabled: true, dataset: 'nginx.access' }]);
    esClient.search.mockRejectedValue({ statusCode: 404 });
    const result = await getPolicyThroughput(esClient, policy);
    expect(result).toEqual({ averagePerSecond: 0, series: [] });
  });

  it('rethrows non-404 ES errors', async () => {
    const policy = makePolicy([{ enabled: true, dataset: 'nginx.access' }]);
    const error = { statusCode: 500, message: 'internal error' };
    esClient.search.mockRejectedValue(error);
    await expect(getPolicyThroughput(esClient, policy)).rejects.toEqual(error);
  });

  it('deduplicates index patterns from streams sharing the same type+dataset', async () => {
    const policy = makePolicy([
      { enabled: true, dataset: 'nginx.access' },
      { enabled: true, dataset: 'nginx.access' },
    ]);
    esClient.search.mockResolvedValue({
      aggregations: { throughput: { buckets: [] } },
    } as any);

    await getPolicyThroughput(esClient, policy);

    const callArgs = esClient.search.mock.calls[0][0] as any;
    expect(callArgs.index).toBe('logs-nginx.access-*');
  });

  it('joins multiple distinct index patterns with a comma', async () => {
    const policy = makePolicy([
      { enabled: true, type: 'logs', dataset: 'nginx.access' },
      { enabled: true, type: 'metrics', dataset: 'nginx.status' },
    ]);
    esClient.search.mockResolvedValue({
      aggregations: { throughput: { buckets: [] } },
    } as any);

    await getPolicyThroughput(esClient, policy);

    const callArgs = esClient.search.mock.calls[0][0] as any;
    expect(callArgs.index).toBe('logs-nginx.access-*,metrics-nginx.status-*');
  });

  it('builds series with y = peak bucket count / 10s window', async () => {
    const NOW_MS = 7_200_000;
    dateSpy.mockReturnValue(NOW_MS);
    const FIRST_KEY = 3_600_000;

    const policy = makePolicy([{ enabled: true, dataset: 'nginx.access' }]);
    esClient.search.mockResolvedValue({
      aggregations: {
        throughput: {
          buckets: [
            { key: FIRST_KEY, doc_count: 60, peak_per_window: { value: 30 } },
            { key: FIRST_KEY + 1_800_000, doc_count: 0, peak_per_window: { value: null } },
          ],
        },
      },
    } as any);

    const { series } = await getPolicyThroughput(esClient, policy);

    expect(series).toEqual([
      { x: FIRST_KEY, y: 3 }, // 30 / 10s = 3 events/s
      { x: FIRST_KEY + 1_800_000, y: 0 }, // null peak → 0
    ]);
  });

  it('normalises averagePerSecond by the observed span from the first non-empty bucket', async () => {
    // now = 7200s, firstBucket = 3600s → span = max(3600, 1800) = 3600s
    const NOW_MS = 7_200_000;
    dateSpy.mockReturnValue(NOW_MS);
    const FIRST_KEY = 3_600_000;

    const policy = makePolicy([{ enabled: true, dataset: 'nginx.access' }]);
    esClient.search.mockResolvedValue({
      aggregations: {
        throughput: {
          buckets: [{ key: FIRST_KEY, doc_count: 360, peak_per_window: { value: 10 } }],
        },
      },
    } as any);

    const { averagePerSecond } = await getPolicyThroughput(esClient, policy);

    // span = 7200 - 3600 = 3600s; 360 docs / 3600s = 0.1 events/s
    expect(averagePerSecond).toBeCloseTo(0.1);
  });

  it(`floors the observed span at ${BUCKET_INTERVAL_SECONDS}s when data just arrived`, async () => {
    // now = 100s, firstBucket = 99s → raw span = 1s → floored to 1800s
    const NOW_MS = 100_000;
    dateSpy.mockReturnValue(NOW_MS);
    const FIRST_KEY = 99_000;

    const policy = makePolicy([{ enabled: true, dataset: 'nginx.access' }]);
    esClient.search.mockResolvedValue({
      aggregations: {
        throughput: {
          buckets: [{ key: FIRST_KEY, doc_count: 1800, peak_per_window: { value: 5 } }],
        },
      },
    } as any);

    const { averagePerSecond } = await getPolicyThroughput(esClient, policy);

    // span floored to 1800s; 1800 docs / 1800s = 1 event/s
    expect(averagePerSecond).toBeCloseTo(1);
  });

  it(`uses ${FULL_WINDOW_SECONDS}s denominator when all buckets are empty`, async () => {
    dateSpy.mockReturnValue(7_200_000);
    const policy = makePolicy([{ enabled: true, dataset: 'nginx.access' }]);
    esClient.search.mockResolvedValue({
      aggregations: {
        throughput: {
          buckets: [
            { key: 3_600_000, doc_count: 0, peak_per_window: { value: null } },
            { key: 5_400_000, doc_count: 0, peak_per_window: { value: null } },
          ],
        },
      },
    } as any);

    const { averagePerSecond, series } = await getPolicyThroughput(esClient, policy);

    // totalDocs = 0 → 0 / 86400 = 0
    expect(averagePerSecond).toBe(0);
    expect(series).toEqual([
      { x: 3_600_000, y: 0 },
      { x: 5_400_000, y: 0 },
    ]);
  });

  it('returns empty series and zero average when aggregations are missing', async () => {
    dateSpy.mockReturnValue(7_200_000);
    const policy = makePolicy([{ enabled: true, dataset: 'nginx.access' }]);
    esClient.search.mockResolvedValue({} as any);

    const result = await getPolicyThroughput(esClient, policy);

    expect(result).toEqual({ averagePerSecond: 0, series: [] });
  });
});
