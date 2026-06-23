/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { MlPluginSetup } from '@kbn/ml-plugin/server';
import { getEntityAnomalies } from './get_anomaly_details';
import type { AnomalyHit } from '../ml_anomaly_detection/types';
import type { JobConfig } from '../ml_anomaly_detection/get_job_config';

jest.mock('../ml_anomaly_detection', () => ({
  searchEntityAnomalies: jest.fn(),
  fetchBaselineBehavior: jest.fn(),
  getJobConfig: jest.fn(),
  getSecurityMlJobIds: jest.fn(),
}));

const { searchEntityAnomalies, fetchBaselineBehavior, getJobConfig, getSecurityMlJobIds } =
  jest.requireMock('../ml_anomaly_detection');

const makeAnomaly = (overrides: Partial<AnomalyHit> = {}): AnomalyHit => ({
  _id: 'anomaly-1',
  entityId: 'user:alice',
  jobId: 'security-job-1',
  detectorIndex: 0,
  detectorFunction: 'rare',
  timestamp: 1778241600000,
  recordScore: 75,
  actual: 5,
  typical: 1,
  byFieldName: 'source.ip',
  byFieldValue: 'evil-ip',
  ...overrides,
});

const makeJobConfig = (overrides: Partial<JobConfig> = {}): JobConfig => ({
  sourceIndex: ['logs-*'],
  datafeedQuery: { match_all: {} },
  detectors: [],
  bucketSpanMs: 3600000,
  jobName: null,
  threatTactics: [],
  threatTechniques: [],
  ...overrides,
});

const soClient = savedObjectsClientMock.create();
let logger: ReturnType<typeof loggingSystemMock.createLogger>;
let esClient: ElasticsearchClient;
let mockMl: MlPluginSetup;

const defaultParams = {
  entityId: 'user:alice',
  entityType: 'user' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  logger = loggingSystemMock.createLogger();
  esClient = {} as unknown as ElasticsearchClient;
  mockMl = {
    mlSystemProvider: jest.fn().mockReturnValue({}),
  } as unknown as MlPluginSetup;
  searchEntityAnomalies.mockResolvedValue({ hits: [], total: 0 });
  getSecurityMlJobIds.mockResolvedValue([]);
  getJobConfig.mockResolvedValue(new Map());
  fetchBaselineBehavior.mockImplementation(
    ({ anomaly }: { anomaly: ReturnType<typeof makeAnomaly> }) => Promise.resolve(anomaly)
  );
});

describe('getEntityAnomalies', () => {
  it('returns empty array when no anomalies are found', async () => {
    searchEntityAnomalies.mockResolvedValue({ hits: [], total: 0 });

    const result = await getEntityAnomalies({
      ...defaultParams,
      esClient,
      logger,
      ml: mockMl,
      soClient,
    });

    expect(result.anomalies).toEqual([]);
    expect(result.total).toBe(0);
    expect(fetchBaselineBehavior).not.toHaveBeenCalled();
  });

  it('maps an EnrichedAnomalyHit to an AnomalySummaryEntry correctly', async () => {
    const anomaly = makeAnomaly({
      _id: 'a1',
      timestamp: 1_700_000_000_000,
      recordScore: 88,
      actual: 10,
      typical: 2,
      byFieldName: 'source.ip',
      byFieldValue: 'evil-ip',
    });
    searchEntityAnomalies.mockResolvedValue({ hits: [anomaly], total: 1 });
    fetchBaselineBehavior.mockResolvedValue({
      ...anomaly,
      baselineValues: ['10.0.0.1', '10.0.0.2'],
      anomalousValue: 'evil-ip',
      anomalousValueCount: 3,
    });

    const result = await getEntityAnomalies({
      ...defaultParams,
      esClient,
      logger,
      ml: mockMl,
      soClient,
    });

    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0]).toMatchObject({
      jobId: 'security-job-1',
      detectorIndex: 0,
      detectorFunction: 'rare',
      byFieldName: 'source.ip',
      byFieldValue: 'evil-ip',
      recordScore: 88,
      timestamp: new Date(1_700_000_000_000).toISOString(),
      actual: [10],
      typical: [2],
      baselineValues: ['10.0.0.1', '10.0.0.2'],
      anomalousValue: 'evil-ip',
      anomalousValueCount: 3,
    });
  });

  it('converts numeric anomalousValue to string', async () => {
    const anomaly = makeAnomaly({ _id: 'a1' });
    searchEntityAnomalies.mockResolvedValue({ hits: [anomaly], total: 1 });
    fetchBaselineBehavior.mockResolvedValue({ ...anomaly, anomalousValue: 42 });

    const result = await getEntityAnomalies({
      ...defaultParams,
      esClient,
      logger,
      ml: mockMl,
      soClient,
    });

    expect(result.anomalies[0].anomalousValue).toBe('42');
  });

  it('converts baseline values to strings', async () => {
    const anomaly = makeAnomaly({ _id: 'a1' });
    searchEntityAnomalies.mockResolvedValue({ hits: [anomaly], total: 1 });
    fetchBaselineBehavior.mockResolvedValue({ ...anomaly, baselineValues: [1.5, 2.5] });

    const result = await getEntityAnomalies({
      ...defaultParams,
      esClient,
      logger,
      ml: mockMl,
      soClient,
    });

    expect(result.anomalies[0].baselineValues).toEqual(['1.5', '2.5']);
  });

  it('preserves the query-time order', async () => {
    const a1 = makeAnomaly({ _id: 'a1', jobId: 'job-A', timestamp: 2000, recordScore: 90 });
    const a2 = makeAnomaly({ _id: 'a2', jobId: 'job-B', timestamp: 1000, recordScore: 50 });
    searchEntityAnomalies.mockResolvedValue({ hits: [a1, a2], total: 2 });

    fetchBaselineBehavior.mockImplementation(
      ({ anomaly, jobId }: { anomaly: unknown; jobId: string }) =>
        Promise.resolve({ ...(anomaly as object), baselineValues: [`baseline-${jobId}`] })
    );

    const result = await getEntityAnomalies({
      ...defaultParams,
      esClient,
      logger,
      ml: mockMl,
      soClient,
    });

    expect(result.anomalies).toHaveLength(2);
    expect(result.anomalies[0].jobId).toBe('job-A');
    expect(result.anomalies[1].jobId).toBe('job-B');
  });

  it('rejects when fetchBaselineBehavior throws', async () => {
    const anomaly = makeAnomaly({ _id: 'a1', actual: 5, typical: 1 });
    searchEntityAnomalies.mockResolvedValue({ hits: [anomaly], total: 1 });
    fetchBaselineBehavior.mockRejectedValue(new Error('source index unavailable'));

    await expect(
      getEntityAnomalies({
        ...defaultParams,
        esClient,
        logger,
        ml: mockMl,
        soClient,
      })
    ).rejects.toThrow('source index unavailable');
  });

  it('calls fetchBaselineBehavior once per anomaly record', async () => {
    const anomalies = [
      makeAnomaly({ _id: 'a1', jobId: 'job-A' }),
      makeAnomaly({ _id: 'a2', jobId: 'job-A' }),
      makeAnomaly({ _id: 'a3', jobId: 'job-B' }),
    ];
    searchEntityAnomalies.mockResolvedValue({ hits: anomalies, total: 3 });
    fetchBaselineBehavior.mockImplementation(({ anomaly }: { anomaly: unknown }) =>
      Promise.resolve(anomaly)
    );

    await getEntityAnomalies({
      ...defaultParams,
      esClient,
      logger,
      ml: mockMl,
      soClient,
    });

    expect(fetchBaselineBehavior).toHaveBeenCalledTimes(3);
  });

  it('passes the resolved jobConfig to fetchBaselineBehavior', async () => {
    const anomaly = makeAnomaly({ _id: 'a1', jobId: 'job-A' });
    const jobConfig = makeJobConfig({ sourceIndex: ['custom-index'] });
    searchEntityAnomalies.mockResolvedValue({ hits: [anomaly], total: 1 });
    getJobConfig.mockResolvedValue(new Map([['job-A', jobConfig]]));

    await getEntityAnomalies({
      ...defaultParams,
      esClient,
      logger,
      ml: mockMl,
      soClient,
    });

    expect(fetchBaselineBehavior).toHaveBeenCalledWith(
      expect.objectContaining({ jobConfig, jobId: 'job-A' })
    );
  });

  it('passes null jobConfig when the job is unknown', async () => {
    const anomaly = makeAnomaly({ _id: 'a1', jobId: 'unknown-job' });
    searchEntityAnomalies.mockResolvedValue({ hits: [anomaly], total: 1 });
    getJobConfig.mockResolvedValue(new Map()); // no entry for unknown-job

    await getEntityAnomalies({
      ...defaultParams,
      esClient,
      logger,
      ml: mockMl,
      soClient,
    });

    expect(fetchBaselineBehavior).toHaveBeenCalledWith(
      expect.objectContaining({ jobConfig: null })
    );
  });

  it('populates jobName, threatTactics, and threatTechniques from getJobConfig result', async () => {
    const anomaly = makeAnomaly({ _id: 'a1', jobId: 'auth_high_count_ea' });
    searchEntityAnomalies.mockResolvedValue({ hits: [anomaly], total: 1 });
    fetchBaselineBehavior.mockResolvedValue(anomaly);
    getJobConfig.mockResolvedValue(
      new Map([
        [
          'auth_high_count_ea',
          makeJobConfig({
            jobName: 'Spike in Logon Events',
            threatTactics: ['Credential Access'],
            threatTechniques: ['Brute Force'],
          }),
        ],
      ])
    );

    const result = await getEntityAnomalies({
      ...defaultParams,
      esClient,
      logger,
      ml: mockMl,
      soClient,
    });

    expect(result.anomalies[0].jobName).toBe('Spike in Logon Events');
    expect(result.anomalies[0].threatTactics).toEqual(['Credential Access']);
    expect(result.anomalies[0].threatTechniques).toEqual(['Brute Force']);
  });

  it('calls getJobConfig with the full set of security ML job IDs', async () => {
    getSecurityMlJobIds.mockResolvedValue(['job-A', 'job-B', 'job-C']);

    await getEntityAnomalies({
      ...defaultParams,
      esClient,
      logger,
      ml: mockMl,
      soClient,
    });

    expect(getJobConfig).toHaveBeenCalledWith(
      expect.objectContaining({ jobIds: ['job-A', 'job-B', 'job-C'] })
    );
  });

  it('forwards fromMs, toMs, jobIds, sort, and pagination to searchEntityAnomalies', async () => {
    searchEntityAnomalies.mockResolvedValue({ hits: [], total: 0 });

    await getEntityAnomalies({
      ...defaultParams,
      esClient,
      fromMs: 1_700_000_000_000,
      toMs: 1_700_100_000_000,
      jobIds: ['job-A'],
      sort: [{ field: 'record_score', order: 'desc' }],
      offset: 10,
      pageSize: 20,
      logger,
      ml: mockMl,
      soClient,
    });

    expect(searchEntityAnomalies).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'user:alice',
        entityType: 'user',
        fromMs: 1_700_000_000_000,
        toMs: 1_700_100_000_000,
        jobIds: ['job-A'],
        sort: [{ field: 'record_score', order: 'desc' }],
        from: 10,
        size: 20,
      })
    );
  });

  describe('threatTactics filtering', () => {
    it('filters searchEntityAnomalies to jobs matching the given tactics', async () => {
      getSecurityMlJobIds.mockResolvedValue(['job-A', 'job-B', 'job-C']);
      getJobConfig.mockResolvedValue(
        new Map([
          ['job-A', makeJobConfig({ threatTactics: ['Credential Access'] })],
          ['job-B', makeJobConfig({ threatTactics: ['Discovery'] })],
          ['job-C', makeJobConfig({ threatTactics: [] })],
        ])
      );

      await getEntityAnomalies({
        ...defaultParams,
        esClient,
        logger,
        ml: mockMl,
        soClient,
        threatTactics: ['Credential Access'],
      });

      expect(searchEntityAnomalies).toHaveBeenCalledWith(
        expect.objectContaining({ jobIds: ['job-A'] })
      );
    });

    it('returns empty results without calling searchEntityAnomalies when no jobs match', async () => {
      getSecurityMlJobIds.mockResolvedValue(['job-A']);
      getJobConfig.mockResolvedValue(
        new Map([['job-A', makeJobConfig({ threatTactics: ['Discovery'] })]])
      );

      const result = await getEntityAnomalies({
        ...defaultParams,
        esClient,
        logger,
        ml: mockMl,
        soClient,
        threatTactics: ['Credential Access'],
      });

      expect(result).toEqual({ anomalies: [], total: 0 });
      expect(searchEntityAnomalies).not.toHaveBeenCalled();
    });

    it('intersects threatTactics-matched jobs with an explicit jobIds filter', async () => {
      getSecurityMlJobIds.mockResolvedValue(['job-A', 'job-B']);
      getJobConfig.mockResolvedValue(
        new Map([
          ['job-A', makeJobConfig({ threatTactics: ['Credential Access'] })],
          ['job-B', makeJobConfig({ threatTactics: ['Credential Access'] })],
        ])
      );

      await getEntityAnomalies({
        ...defaultParams,
        esClient,
        logger,
        ml: mockMl,
        soClient,
        jobIds: ['job-B'],
        threatTactics: ['Credential Access'],
      });

      expect(searchEntityAnomalies).toHaveBeenCalledWith(
        expect.objectContaining({ jobIds: ['job-B'] })
      );
    });

    it('does not filter jobs when threatTactics is an empty array', async () => {
      getSecurityMlJobIds.mockResolvedValue(['job-A', 'job-B']);

      await getEntityAnomalies({
        ...defaultParams,
        esClient,
        logger,
        ml: mockMl,
        soClient,
        threatTactics: [],
      });

      expect(searchEntityAnomalies).toHaveBeenCalledWith(
        expect.objectContaining({ jobIds: undefined })
      );
    });
  });

  it('forwards toMs to fetchBaselineBehavior', async () => {
    const anomaly = makeAnomaly({ _id: 'a1' });
    searchEntityAnomalies.mockResolvedValue({ hits: [anomaly], total: 1 });

    await getEntityAnomalies({
      ...defaultParams,
      esClient,
      toMs: 1_700_100_000_000,
      logger,
      ml: mockMl,
      soClient,
    });

    expect(fetchBaselineBehavior).toHaveBeenCalledWith(
      expect.objectContaining({ toMs: 1_700_100_000_000 })
    );
  });
});
