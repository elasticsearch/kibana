/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import type { MlPluginSetup } from '@kbn/ml-plugin/server';
import { getJobConfig } from './get_job_config';

const soClient = savedObjectsClientMock.create();
let logger: ReturnType<typeof loggingSystemMock.createLogger>;
let mockJobsFn: jest.Mock;
let mockMl: MlPluginSetup;

const makeJob = (overrides: Record<string, unknown> = {}) => ({
  job_id: 'test-job',
  datafeed_config: {
    indices: ['logs-*'],
    query: { bool: { filter: [{ term: { 'event.action': 'authentication' } }] } },
  },
  analysis_config: {
    detectors: [{ function: 'rare', by_field_name: 'source.ip' }],
    bucket_span: '1h',
  },
  custom_settings: {},
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  logger = loggingSystemMock.createLogger();
  mockJobsFn = jest.fn().mockResolvedValue({ jobs: [makeJob()] });
  mockMl = {
    anomalyDetectorsProvider: jest.fn().mockReturnValue({ jobs: mockJobsFn }),
  } as unknown as MlPluginSetup;
});

describe('getJobConfig', () => {
  it('returns an empty map when jobIds is empty', async () => {
    const result = await getJobConfig({ jobIds: [], logger, ml: mockMl, soClient });

    expect(result.size).toBe(0);
    expect(mockJobsFn).not.toHaveBeenCalled();
  });

  it('calls the ML API once per job ID', async () => {
    mockJobsFn.mockResolvedValue({ jobs: [] });

    await getJobConfig({ jobIds: ['job-a', 'job-b'], logger, ml: mockMl, soClient });

    expect(mockJobsFn).toHaveBeenCalledTimes(2);
    expect(mockJobsFn).toHaveBeenCalledWith('job-a');
    expect(mockJobsFn).toHaveBeenCalledWith('job-b');
  });

  it('extracts baseline fields: sourceIndex, datafeedQuery, detectors, bucketSpanMs', async () => {
    const result = await getJobConfig({ jobIds: ['test-job'], logger, ml: mockMl, soClient });

    expect(result.get('test-job')).toMatchObject({
      sourceIndex: ['logs-*'],
      datafeedQuery: { bool: { filter: [{ term: { 'event.action': 'authentication' } }] } },
      detectors: [{ function: 'rare', by_field_name: 'source.ip' }],
      bucketSpanMs: 3600000,
    });
  });

  it('parses bucket_span string into milliseconds', async () => {
    mockJobsFn.mockResolvedValueOnce({
      jobs: [makeJob({ analysis_config: { detectors: [], bucket_span: '15m' } })],
    });

    const result = await getJobConfig({ jobIds: ['test-job'], logger, ml: mockMl, soClient });

    expect(result.get('test-job')?.bucketSpanMs).toBe(900000);
  });

  it('defaults bucketSpanMs to 1h when bucket_span is absent', async () => {
    mockJobsFn.mockResolvedValueOnce({
      jobs: [makeJob({ analysis_config: { detectors: [] } })],
    });

    const result = await getJobConfig({ jobIds: ['test-job'], logger, ml: mockMl, soClient });

    expect(result.get('test-job')?.bucketSpanMs).toBe(3600000);
  });

  it('logs a warning and falls back to 1h when bucket_span cannot be parsed', async () => {
    mockJobsFn.mockResolvedValueOnce({
      jobs: [makeJob({ analysis_config: { detectors: [], bucket_span: 'not-a-duration' } })],
    });

    const result = await getJobConfig({ jobIds: ['test-job'], logger, ml: mockMl, soClient });

    expect(result.get('test-job')?.bucketSpanMs).toBe(3600000);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid bucket_span'));
  });

  it('defaults datafeedQuery to match_all when absent', async () => {
    mockJobsFn.mockResolvedValueOnce({
      jobs: [makeJob({ datafeed_config: { indices: ['logs-*'] } })],
    });

    const result = await getJobConfig({ jobIds: ['test-job'], logger, ml: mockMl, soClient });

    expect(result.get('test-job')?.datafeedQuery).toEqual({ match_all: {} });
  });

  it('maps custom_settings to jobName, threatTactics, and threatTechniques', async () => {
    mockJobsFn.mockResolvedValueOnce({
      jobs: [
        makeJob({
          custom_settings: {
            security_app_display_name: 'Spike in Logon Events',
            // TA0006 = Credential Access; T1110 = Brute Force
            threat_tactics: ['TA0006'],
            threat_techniques: ['T1110'],
          },
        }),
      ],
    });

    const result = await getJobConfig({ jobIds: ['test-job'], logger, ml: mockMl, soClient });

    expect(result.get('test-job')).toMatchObject({
      jobName: 'Spike in Logon Events',
      threatTactics: ['Credential Access'],
      threatTechniques: ['Brute Force'],
    });
  });

  it('sets jobName to null when security_app_display_name is absent', async () => {
    const result = await getJobConfig({ jobIds: ['test-job'], logger, ml: mockMl, soClient });

    expect(result.get('test-job')?.jobName).toBeNull();
  });

  it('falls back to the raw ID when a tactic/technique ID is not in the MITRE map', async () => {
    mockJobsFn.mockResolvedValueOnce({
      jobs: [
        makeJob({
          custom_settings: {
            threat_tactics: ['UNKNOWN_TACTIC'],
            threat_techniques: ['UNKNOWN_TECHNIQUE'],
          },
        }),
      ],
    });

    const result = await getJobConfig({ jobIds: ['test-job'], logger, ml: mockMl, soClient });

    expect(result.get('test-job')?.threatTactics).toEqual(['UNKNOWN_TACTIC']);
    expect(result.get('test-job')?.threatTechniques).toEqual(['UNKNOWN_TECHNIQUE']);
  });

  it('returns entries for multiple jobs', async () => {
    mockJobsFn
      .mockResolvedValueOnce({ jobs: [makeJob({ job_id: 'job-a' })] })
      .mockResolvedValueOnce({ jobs: [makeJob({ job_id: 'job-b' })] });

    const result = await getJobConfig({
      jobIds: ['job-a', 'job-b'],
      logger,
      ml: mockMl,
      soClient,
    });

    expect(result.size).toBe(2);
    expect(result.has('job-a')).toBe(true);
    expect(result.has('job-b')).toBe(true);
  });

  it('skips jobs that fail and returns the rest', async () => {
    mockJobsFn
      .mockResolvedValueOnce({ jobs: [makeJob({ job_id: 'job-a' })] })
      .mockRejectedValueOnce(new Error('MLJobNotFound'));

    const result = await getJobConfig({ jobIds: ['job-a', 'job-b'], logger, ml: mockMl, soClient });

    expect(result.size).toBe(1);
    expect(result.has('job-a')).toBe(true);
  });

  it('logs a debug message and returns empty map when all jobs fail', async () => {
    mockJobsFn.mockRejectedValue(new Error('cluster unavailable'));

    const result = await getJobConfig({ jobIds: ['job-1'], logger, ml: mockMl, soClient });

    expect(result.size).toBe(0);
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('cluster unavailable'));
  });
});
