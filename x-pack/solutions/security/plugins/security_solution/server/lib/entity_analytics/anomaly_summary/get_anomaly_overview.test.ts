/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, SavedObjectsClientContract } from '@kbn/core/server';
import type { MlPluginSetup } from '@kbn/ml-plugin/server';
import { getEntityAnomalyOverview } from './get_anomaly_overview';
import { getJobConfig, getSecurityMlJobIds } from '../ml_anomaly_detection';

jest.mock('../ml_anomaly_detection', () => ({
  getJobConfig: jest.fn(),
  getSecurityMlJobIds: jest.fn(),
}));

const mockGetJobConfig = getJobConfig as jest.Mock;
const mockGetSecurityMlJobIds = getSecurityMlJobIds as jest.Mock;

const mockMlAnomalySearch = jest.fn();
const mockMl = {
  mlSystemProvider: jest.fn().mockReturnValue({ mlAnomalySearch: mockMlAnomalySearch }),
} as unknown as MlPluginSetup;

const mockLogger: Logger = {
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
} as unknown as Logger;

const mockSoClient = {} as SavedObjectsClientContract;

const FROM_MS = 1_700_000_000_000;
const TO_MS = FROM_MS + 7 * 24 * 60 * 60 * 1000; // 7 days later

const baseParams = {
  entityId: 'entity-1',
  entityType: 'host' as const,
  fromMs: FROM_MS,
  toMs: TO_MS,
  logger: mockLogger,
  ml: mockMl,
  soClient: mockSoClient,
};

const emptyResult = {
  anomalyByTimeBucket: [],
  recentAnomalies: [],
  tacticCounts: {},
  totalAnomaliesCount: 0,
  from: FROM_MS,
  to: TO_MS,
};

const makeSearchResponse = (
  timeBuckets: Array<{
    key: number;
    doc_count: number;
    max_score: number | null;
    jobBuckets?: Array<{ key: string; doc_count: number }>;
  }>,
  allJobKeys: string[] = [],
  total: number = 0
) => ({
  hits: { hits: [], total: { value: total } },
  aggregations: {
    by_time: {
      buckets: timeBuckets.map((b) => ({
        key_as_string: new Date(b.key).toISOString(),
        key: b.key,
        doc_count: b.doc_count,
        max_score: { value: b.max_score },
        jobs: { buckets: b.jobBuckets ?? [] },
      })),
    },
    all_jobs: { buckets: allJobKeys.map((k) => ({ key: k })) },
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockMl.mlSystemProvider = jest.fn().mockReturnValue({ mlAnomalySearch: mockMlAnomalySearch });
});

describe('getEntityAnomalyOverview', () => {
  describe('when there are no security ML jobs', () => {
    it('returns empty result without calling mlAnomalySearch', async () => {
      mockGetSecurityMlJobIds.mockResolvedValue([]);

      const result = await getEntityAnomalyOverview(baseParams);

      expect(result).toEqual(emptyResult);
      expect(mockMlAnomalySearch).not.toHaveBeenCalled();
    });
  });

  describe('when the search returns no anomalies', () => {
    it('returns empty result when all_jobs buckets is empty', async () => {
      mockGetSecurityMlJobIds.mockResolvedValue(['job-1']);
      mockGetJobConfig.mockResolvedValue(new Map());
      mockMlAnomalySearch.mockResolvedValue(makeSearchResponse([], [], 0));

      const result = await getEntityAnomalyOverview(baseParams);

      expect(result).toEqual(emptyResult);
    });
  });

  describe('when mlAnomalySearch throws', () => {
    it('logs a warning and returns empty result', async () => {
      mockGetSecurityMlJobIds.mockResolvedValue(['job-1']);
      mockGetJobConfig.mockResolvedValue(new Map());
      mockMlAnomalySearch.mockRejectedValue(new Error('ES error'));

      const result = await getEntityAnomalyOverview(baseParams);

      expect(result).toEqual(emptyResult);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('entity-1'));
    });
  });

  describe('with anomaly data', () => {
    const JOB_A = 'job-a';
    const JOB_B = 'job-b';

    const jobConfigMap = new Map([
      [JOB_A, { threatTactics: ['Execution', 'Discovery'], threatTechniques: [] }],
      [JOB_B, { threatTactics: ['Persistence'], threatTechniques: [] }],
    ]);

    const bucket1Key = FROM_MS + 1000;
    const bucket2Key = FROM_MS + 2 * 60 * 60 * 1000;

    const searchResponse = makeSearchResponse(
      [
        {
          key: bucket1Key,
          doc_count: 3,
          max_score: 75.5,
          jobBuckets: [
            { key: JOB_A, doc_count: 2 },
            { key: JOB_B, doc_count: 1 },
          ],
        },
        {
          key: bucket2Key,
          doc_count: 2,
          max_score: 50,
          jobBuckets: [{ key: JOB_A, doc_count: 2 }],
        },
      ],
      [JOB_A, JOB_B],
      5
    );

    beforeEach(() => {
      mockGetSecurityMlJobIds.mockResolvedValue([JOB_A, JOB_B]);
      mockGetJobConfig.mockResolvedValue(jobConfigMap);
      mockMlAnomalySearch.mockResolvedValue(searchResponse);
    });

    it('returns anomaly entries for each non-empty time bucket', async () => {
      const result = await getEntityAnomalyOverview(baseParams);

      expect(result.anomalyByTimeBucket).toHaveLength(2);
      expect(result.anomalyByTimeBucket[0]).toMatchObject({
        timestamp: new Date(bucket1Key).toISOString(),
        maxScore: 75.5,
      });
      expect(result.anomalyByTimeBucket[1]).toMatchObject({
        timestamp: new Date(bucket2Key).toISOString(),
        maxScore: 50,
      });
    });

    it('aggregates tactics per bucket from job configs', async () => {
      const result = await getEntityAnomalyOverview(baseParams);

      expect(result.anomalyByTimeBucket[0].threatTactics).toEqual(
        expect.arrayContaining(['Execution', 'Discovery', 'Persistence'])
      );
      expect(result.anomalyByTimeBucket[1].threatTactics).toEqual(
        expect.arrayContaining(['Execution', 'Discovery'])
      );
    });

    it('deduplicates tactics within a bucket', async () => {
      const duplicateJobConfig = new Map([
        [JOB_A, { threatTactics: ['Execution'], threatTechniques: [] }],
        [JOB_B, { threatTactics: ['Execution'], threatTechniques: [] }],
      ]);
      mockGetJobConfig.mockResolvedValue(duplicateJobConfig);

      const result = await getEntityAnomalyOverview(baseParams);

      expect(result.anomalyByTimeBucket[0].threatTactics).toEqual(['Execution']);
    });

    it('counts tactic occurrences across all buckets', async () => {
      const result = await getEntityAnomalyOverview(baseParams);

      // JOB_A appears in bucket1 (doc_count 2) and bucket2 (doc_count 2) → Execution: 4, Discovery: 4
      // JOB_B appears in bucket1 (doc_count 1) → Persistence: 1
      expect(result.tacticCounts).toEqual({
        Execution: 4,
        Discovery: 4,
        Persistence: 1,
      });
    });

    it('returns the total anomaly count from hits.total', async () => {
      const result = await getEntityAnomalyOverview(baseParams);

      expect(result.totalAnomaliesCount).toBe(5);
    });

    it('returns the effective from/to timestamps', async () => {
      const result = await getEntityAnomalyOverview(baseParams);

      expect(result.from).toBe(FROM_MS);
      expect(result.to).toBe(TO_MS);
    });
  });

  describe('tactic filtering', () => {
    it('filters jobs to those matching requested threatTactics before searching', async () => {
      const jobConfigMap = new Map([
        ['job-execution', { threatTactics: ['Execution'], threatTechniques: [] }],
        ['job-persistence', { threatTactics: ['Persistence'], threatTechniques: [] }],
      ]);

      mockGetSecurityMlJobIds.mockResolvedValue(['job-execution', 'job-persistence']);
      mockGetJobConfig.mockResolvedValue(jobConfigMap);
      mockMlAnomalySearch.mockResolvedValue(makeSearchResponse([], [], 0));

      await getEntityAnomalyOverview({ ...baseParams, threatTactics: ['Execution'] });

      const searchCall = mockMlAnomalySearch.mock.calls[0][0];
      const jobTermsFilter = searchCall.query.bool.filter.find(
        (f: Record<string, unknown>) => f.terms !== undefined
      );
      expect(jobTermsFilter?.terms?.job_id).toEqual(['job-execution']);
    });

    it('passes all jobs when threatTactics is empty', async () => {
      const jobConfigMap = new Map([
        ['job-a', { threatTactics: ['Execution'], threatTechniques: [] }],
        ['job-b', { threatTactics: ['Persistence'], threatTechniques: [] }],
      ]);

      mockGetSecurityMlJobIds.mockResolvedValue(['job-a', 'job-b']);
      mockGetJobConfig.mockResolvedValue(jobConfigMap);
      mockMlAnomalySearch.mockResolvedValue(makeSearchResponse([], [], 0));

      await getEntityAnomalyOverview({ ...baseParams, threatTactics: [] });

      const searchCall = mockMlAnomalySearch.mock.calls[0][0];
      const jobTermsFilter = searchCall.query.bool.filter.find(
        (f: Record<string, unknown>) => f.terms !== undefined
      );
      expect(jobTermsFilter?.terms?.job_id).toEqual(['job-a', 'job-b']);
    });
  });

  describe('buckets with null max_score', () => {
    it('excludes buckets where max_score is null', async () => {
      mockGetSecurityMlJobIds.mockResolvedValue(['job-a']);
      mockGetJobConfig.mockResolvedValue(
        new Map([['job-a', { threatTactics: [], threatTechniques: [] }]])
      );
      mockMlAnomalySearch.mockResolvedValue(
        makeSearchResponse(
          [
            {
              key: FROM_MS + 1000,
              doc_count: 2,
              max_score: null,
              jobBuckets: [{ key: 'job-a', doc_count: 2 }],
            },
            {
              key: FROM_MS + 2000,
              doc_count: 1,
              max_score: 42,
              jobBuckets: [{ key: 'job-a', doc_count: 1 }],
            },
          ],
          ['job-a'],
          3
        )
      );

      const result = await getEntityAnomalyOverview(baseParams);

      expect(result.anomalyByTimeBucket).toHaveLength(1);
      expect(result.anomalyByTimeBucket[0].maxScore).toBe(42);
    });
  });

  describe('bucket interval', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    const getFixedInterval = () => {
      const searchCall = mockMlAnomalySearch.mock.calls[0][0];
      return searchCall.aggs.by_time.date_histogram.fixed_interval;
    };

    beforeEach(() => {
      mockGetSecurityMlJobIds.mockResolvedValue(['job-a']);
      mockGetJobConfig.mockResolvedValue(new Map());
      mockMlAnomalySearch.mockResolvedValue(makeSearchResponse([], [], 0));
    });

    it('uses 1h interval for spans ≤ 2 days', async () => {
      await getEntityAnomalyOverview({
        ...baseParams,
        fromMs: FROM_MS,
        toMs: FROM_MS + 2 * DAY_MS,
      });
      expect(getFixedInterval()).toBe('1h');
    });

    it('uses 1d interval for spans between 2 and 30 days', async () => {
      await getEntityAnomalyOverview({
        ...baseParams,
        fromMs: FROM_MS,
        toMs: FROM_MS + 7 * DAY_MS,
      });
      expect(getFixedInterval()).toBe('1d');
    });

    it('uses 7d interval for spans > 30 days', async () => {
      await getEntityAnomalyOverview({
        ...baseParams,
        fromMs: FROM_MS,
        toMs: FROM_MS + 31 * DAY_MS,
      });
      expect(getFixedInterval()).toBe('7d');
    });
  });

  describe('default time range', () => {
    it('defaults to the last 30 days when fromMs/toMs are omitted', async () => {
      mockGetSecurityMlJobIds.mockResolvedValue([]);

      const before = Date.now();
      const result = await getEntityAnomalyOverview({
        entityId: 'entity-1',
        entityType: 'host' as const,
        logger: mockLogger,
        ml: mockMl,
        soClient: mockSoClient,
      });
      const after = Date.now();

      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(result.to).toBeGreaterThanOrEqual(before);
      expect(result.to).toBeLessThanOrEqual(after);
      expect(result.to - result.from).toBeCloseTo(thirtyDaysMs, -3);
    });
  });
});
