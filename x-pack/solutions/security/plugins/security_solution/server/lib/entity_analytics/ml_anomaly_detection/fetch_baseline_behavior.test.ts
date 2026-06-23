/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { ElasticsearchClient } from '@kbn/core/server';
import { fetchBaselineBehavior } from './fetch_baseline_behavior';
import { makeAnomaly } from './test_helpers';
import type { JobConfig } from './get_job_config';

jest.mock('@kbn/entity-store/common/euid_helpers', () => ({
  euid: {
    painless: {
      getEuidRuntimeMapping: jest.fn().mockReturnValue({ type: 'keyword', script: { source: '' } }),
    },
  },
}));

const MOCK_CURRENT_TIME = 1778241600000; // 2026-05-08T12:00:00.000Z

let logger: ReturnType<typeof loggingSystemMock.createLogger>;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(MOCK_CURRENT_TIME);
  jest.clearAllMocks();
  logger = loggingSystemMock.createLogger();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('fetchBaselineBehavior', () => {
  let mockEsSearch: jest.Mock;
  let esClient: ElasticsearchClient;

  const makeJobConfig = (overrides: Partial<JobConfig> = {}): JobConfig => ({
    sourceIndex: ['logs-*'],
    datafeedQuery: { bool: { filter: [{ term: { 'event.action': 'authentication' } }] } },
    detectors: [{ function: 'rare', by_field_name: 'source.ip' }],
    bucketSpanMs: 3600000,
    jobName: null,
    threatTactics: [],
    threatTechniques: [],
    ...overrides,
  });

  const defaultOpts = {
    entityId: 'user:alice',
    entityType: 'user' as const,
    jobId: 'test-job',
    jobConfig: makeJobConfig(),
  };

  beforeEach(() => {
    mockEsSearch = jest.fn().mockResolvedValue({ aggregations: {} });
    esClient = { search: mockEsSearch } as unknown as ElasticsearchClient;
  });

  it('returns original anomaly when jobConfig is null', async () => {
    const anomaly = makeAnomaly();

    const result = await fetchBaselineBehavior({
      ...defaultOpts,
      anomaly,
      jobConfig: null,
      esClient,
      logger,
    });

    expect(result).toEqual(anomaly);
    expect(mockEsSearch).not.toHaveBeenCalled();
  });

  it('returns original anomaly when sourceIndex is empty', async () => {
    const anomaly = makeAnomaly();

    const result = await fetchBaselineBehavior({
      ...defaultOpts,
      anomaly,
      jobConfig: makeJobConfig({ sourceIndex: [] }),
      esClient,
      logger,
    });

    expect(result).toEqual(anomaly);
    expect(mockEsSearch).not.toHaveBeenCalled();
  });

  it('returns original anomaly when detectors list is empty', async () => {
    const anomaly = makeAnomaly();

    const result = await fetchBaselineBehavior({
      ...defaultOpts,
      anomaly,
      jobConfig: makeJobConfig({ detectors: [] }),
      esClient,
      logger,
    });

    expect(result).toEqual(anomaly);
    expect(mockEsSearch).not.toHaveBeenCalled();
  });

  describe('rare detector', () => {
    it('returns an enriched anomaly with baseline values and anomalous value count', async () => {
      const anomaly = makeAnomaly({ byFieldName: 'source.ip', byFieldValue: 'evil-ip' });
      mockEsSearch.mockResolvedValueOnce({
        aggregations: {
          baseline: { buckets: [{ key: '10.0.0.1', doc_count: 5 }] },
          anomaly: { doc_count: 3 },
        },
      });

      const result = await fetchBaselineBehavior({ ...defaultOpts, anomaly, esClient, logger });

      expect(result).toEqual({
        ...anomaly,
        baselineValues: ['10.0.0.1'],
        anomalousValue: 'evil-ip',
        anomalousValueCount: 3,
      });
    });

    it('excludes the anomalous by_field_value from the baseline terms agg', async () => {
      const anomaly = makeAnomaly({ byFieldName: 'source.ip', byFieldValue: 'evil-ip' });
      mockEsSearch.mockResolvedValueOnce({ aggregations: {} });

      await fetchBaselineBehavior({ ...defaultOpts, anomaly, esClient, logger });

      const body = mockEsSearch.mock.calls[0][0];
      expect(body.aggs.baseline.terms.exclude).toEqual(['evil-ip']);
      expect(body.aggs.anomaly.filter).toEqual({ term: { 'source.ip': 'evil-ip' } });
    });

    it('applies the timestamp range filter using bucketSpanMs as the upper bound', async () => {
      const anomaly = makeAnomaly({
        timestamp: 1_000_000,
        byFieldName: 'source.ip',
        byFieldValue: 'evil-ip',
      });
      mockEsSearch.mockResolvedValueOnce({ aggregations: {} });

      await fetchBaselineBehavior({ ...defaultOpts, anomaly, esClient, logger });

      const body = mockEsSearch.mock.calls[0][0];
      const tsRange = body.query.bool.filter.find(
        (f: unknown) => typeof f === 'object' && f !== null && 'range' in (f as object)
      ) as { range: { '@timestamp': { lte: number; gte: string } } };
      expect(tsRange.range['@timestamp'].lte).toBe(1_000_000 + 3_600_000);
      expect(tsRange.range['@timestamp'].gte).toBe('now-30d');
    });

    it('uses fromMs as the timestamp lower bound when provided', async () => {
      const anomaly = makeAnomaly({
        timestamp: 1_000_000,
        byFieldName: 'source.ip',
        byFieldValue: 'evil-ip',
      });
      mockEsSearch.mockResolvedValueOnce({ aggregations: {} });

      await fetchBaselineBehavior({
        ...defaultOpts,
        anomaly,
        fromMs: 1_700_000_000_000,
        esClient,
        logger,
      });

      const body = mockEsSearch.mock.calls[0][0];
      const tsRange = body.query.bool.filter.find(
        (f: unknown) => typeof f === 'object' && f !== null && 'range' in (f as object)
      ) as { range: { '@timestamp': { lte: number; gte: number } } };
      expect(tsRange.range['@timestamp'].gte).toBe(1_700_000_000_000);
    });

    it('uses toMs as the upper bound when toMs is before the bucket span end', async () => {
      // timestamp=1_000_000, bucketSpanMs=3_600_000 → bucket end = 4_600_000
      // toMs=2_000_000 < 4_600_000, so lte should be capped at toMs
      const anomaly = makeAnomaly({
        timestamp: 1_000_000,
        byFieldName: 'source.ip',
        byFieldValue: 'evil-ip',
      });
      mockEsSearch.mockResolvedValueOnce({ aggregations: {} });

      await fetchBaselineBehavior({ ...defaultOpts, anomaly, toMs: 2_000_000, esClient, logger });

      const body = mockEsSearch.mock.calls[0][0];
      const tsRange = body.query.bool.filter.find(
        (f: unknown) => typeof f === 'object' && f !== null && 'range' in (f as object)
      ) as { range: { '@timestamp': { lte: number } } };
      expect(tsRange.range['@timestamp'].lte).toBe(2_000_000);
    });

    it('uses the bucket span end as the upper bound when toMs is after the bucket span end', async () => {
      // timestamp=1_000_000, bucketSpanMs=3_600_000 → bucket end = 4_600_000
      // toMs=5_000_000 > 4_600_000, so lte should remain at the bucket end
      const anomaly = makeAnomaly({
        timestamp: 1_000_000,
        byFieldName: 'source.ip',
        byFieldValue: 'evil-ip',
      });
      mockEsSearch.mockResolvedValueOnce({ aggregations: {} });

      await fetchBaselineBehavior({ ...defaultOpts, anomaly, toMs: 5_000_000, esClient, logger });

      const body = mockEsSearch.mock.calls[0][0];
      const tsRange = body.query.bool.filter.find(
        (f: unknown) => typeof f === 'object' && f !== null && 'range' in (f as object)
      ) as { range: { '@timestamp': { lte: number } } };
      expect(tsRange.range['@timestamp'].lte).toBe(1_000_000 + 3_600_000);
    });

    it('returns original anomaly (with anomalousValue) when search throws', async () => {
      const anomaly = makeAnomaly({ byFieldName: 'source.ip', byFieldValue: 'evil-ip' });
      mockEsSearch.mockRejectedValueOnce(new Error('cluster unavailable'));

      const result = await fetchBaselineBehavior({ ...defaultOpts, anomaly, esClient, logger });

      expect(result).toMatchObject({ ...anomaly, anomalousValue: 'evil-ip' });
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('cluster unavailable'));
    });

    it('search request matches snapshot', async () => {
      const anomaly = makeAnomaly({ byFieldName: 'source.ip', byFieldValue: 'evil-ip' });
      mockEsSearch.mockResolvedValueOnce({ aggregations: {} });

      await fetchBaselineBehavior({ ...defaultOpts, anomaly, esClient, logger });

      expect(mockEsSearch.mock.calls[0][0]).toMatchSnapshot();
    });
  });

  describe('time_of_day detector', () => {
    const timeOfDayConfig = makeJobConfig({ detectors: [{ function: 'time_of_day' }] });

    it('returns enriched anomaly with typical as baseline and actual as anomalous value', async () => {
      const anomaly = makeAnomaly({ actual: 43200, typical: 36000 });
      mockEsSearch.mockResolvedValueOnce({ aggregations: { time_bucket: { doc_count: 10 } } });

      const result = await fetchBaselineBehavior({
        ...defaultOpts,
        jobConfig: timeOfDayConfig,
        anomaly,
        esClient,
        logger,
      });

      expect(result).toEqual({
        ...anomaly,
        baselineValues: [36000],
        anomalousValue: 43200,
        anomalousValueCount: 10,
      });
    });

    it('filters the time_bucket agg by hour_of_day derived from actual', async () => {
      // actual = 43200 → hour = Math.floor(43200 / 3600) = 12
      const anomaly = makeAnomaly({ actual: 43200 });
      mockEsSearch.mockResolvedValueOnce({ aggregations: { time_bucket: { doc_count: 0 } } });

      await fetchBaselineBehavior({
        ...defaultOpts,
        jobConfig: timeOfDayConfig,
        anomaly,
        esClient,
        logger,
      });

      const body = mockEsSearch.mock.calls[0][0];
      expect(body.aggs.time_bucket.filter).toEqual({ term: { hour_of_day: 12 } });
    });

    it('includes hour_of_day and day_of_week runtime mappings', async () => {
      mockEsSearch.mockResolvedValueOnce({ aggregations: { time_bucket: { doc_count: 0 } } });

      await fetchBaselineBehavior({
        ...defaultOpts,
        jobConfig: timeOfDayConfig,
        anomaly: makeAnomaly(),
        esClient,
        logger,
      });

      const body = mockEsSearch.mock.calls[0][0];
      expect(body.runtime_mappings.hour_of_day).toBeDefined();
      expect(body.runtime_mappings.day_of_week).toBeDefined();
    });

    it('caps the timestamp upper bound at toMs when toMs is before the bucket span end', async () => {
      // timestamp=1_000_000, bucketSpanMs=3_600_000 → bucket end = 4_600_000
      // toMs=2_000_000 < 4_600_000, so lte should be capped at toMs
      const anomaly = makeAnomaly({ actual: 43200, timestamp: 1_000_000 });
      mockEsSearch.mockResolvedValueOnce({ aggregations: { time_bucket: { doc_count: 0 } } });

      await fetchBaselineBehavior({
        ...defaultOpts,
        jobConfig: timeOfDayConfig,
        anomaly,
        toMs: 2_000_000,
        esClient,
        logger,
      });

      const body = mockEsSearch.mock.calls[0][0];
      const tsRange = body.query.bool.filter.find(
        (f: unknown) => typeof f === 'object' && f !== null && 'range' in (f as object)
      ) as { range: { '@timestamp': { lte: number } } };
      expect(tsRange.range['@timestamp'].lte).toBe(2_000_000);
    });

    it('search request matches snapshot', async () => {
      const anomaly = makeAnomaly({ actual: 43200, typical: 36000 });
      mockEsSearch.mockResolvedValueOnce({ aggregations: { time_bucket: { doc_count: 0 } } });

      await fetchBaselineBehavior({
        ...defaultOpts,
        jobConfig: timeOfDayConfig,
        anomaly,
        esClient,
        logger,
      });

      expect(mockEsSearch.mock.calls[0][0]).toMatchSnapshot();
    });
  });

  describe('time_of_week detector', () => {
    const timeOfWeekConfig = makeJobConfig({ detectors: [{ function: 'time_of_week' }] });

    it('filters the time_bucket agg by day_of_week and hour_of_day', async () => {
      // actual = 259200 → 3 full days from Sunday midnight (Wednesday, hour 0)
      const anomaly = makeAnomaly({ actual: 259200 });
      mockEsSearch.mockResolvedValueOnce({ aggregations: { time_bucket: { doc_count: 7 } } });

      await fetchBaselineBehavior({
        ...defaultOpts,
        jobConfig: timeOfWeekConfig,
        anomaly,
        esClient,
        logger,
      });

      const body = mockEsSearch.mock.calls[0][0];
      expect(body.aggs.time_bucket.filter).toEqual({
        bool: {
          filter: [{ term: { day_of_week: 3 } }, { term: { hour_of_day: 0 } }],
        },
      });
    });

    it('returns anomalousValueCount from the time_bucket doc_count', async () => {
      const anomaly = makeAnomaly({ actual: 259200, typical: 0 });
      mockEsSearch.mockResolvedValueOnce({ aggregations: { time_bucket: { doc_count: 7 } } });

      const result = await fetchBaselineBehavior({
        ...defaultOpts,
        jobConfig: timeOfWeekConfig,
        anomaly,
        esClient,
        logger,
      });

      expect(result).toEqual({
        ...anomaly,
        baselineValues: [0],
        anomalousValue: 259200,
        anomalousValueCount: 7,
      });
    });
  });

  describe('metric (default) detector', () => {
    const metricConfig = makeJobConfig({
      detectors: [{ function: 'high_mean', field_name: 'bytes' }],
    });

    it('does not call search', async () => {
      await fetchBaselineBehavior({
        ...defaultOpts,
        jobConfig: metricConfig,
        anomaly: makeAnomaly(),
        esClient,
        logger,
      });

      expect(mockEsSearch).not.toHaveBeenCalled();
    });

    it('returns anomalousValue equal to actual and baselineValues equal to [typical]', async () => {
      const anomaly = makeAnomaly({ actual: 100, typical: 10 });

      const result = await fetchBaselineBehavior({
        ...defaultOpts,
        jobConfig: metricConfig,
        anomaly,
        esClient,
        logger,
      });

      expect(result).toEqual({ ...anomaly, anomalousValue: 100, baselineValues: [10] });
    });
  });

  it('dispatches to the correct handler based on anomaly.detectorIndex', async () => {
    const twoDetectorConfig = makeJobConfig({
      detectors: [
        { function: 'rare', by_field_name: 'source.ip' },
        { function: 'high_mean', field_name: 'bytes' },
      ],
    });

    // anomaly for detector 1 (high_mean) — should use defaultBaselineForAnomaly (no search)
    const result = await fetchBaselineBehavior({
      ...defaultOpts,
      jobConfig: twoDetectorConfig,
      anomaly: makeAnomaly({ detectorIndex: 1, actual: 200, typical: 50 }),
      esClient,
      logger,
    });

    expect(mockEsSearch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ anomalousValue: 200, baselineValues: [50] });
  });
});
