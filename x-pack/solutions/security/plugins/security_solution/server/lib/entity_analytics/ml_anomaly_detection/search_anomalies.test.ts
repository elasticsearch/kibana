/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import type { MlPluginSetup } from '@kbn/ml-plugin/server';
import { searchEntityAnomalies } from './search_anomalies';
import { makeHit, makeResponse } from './test_helpers';

jest.mock('./get_security_ml_job_ids', () => ({
  getSecurityMlJobIds: jest.fn().mockResolvedValue(['security-job-1', 'security-job-2']),
}));

jest.mock('@kbn/entity-store/common/euid_helpers', () => ({
  euid: {
    painless: {
      getEuidRuntimeMapping: jest.fn().mockReturnValue({ type: 'keyword', source: 'mock-script' }),
    },
  },
}));

let mockMlAnomalySearch: jest.Mock;
let mockMl: MlPluginSetup;
let logger: ReturnType<typeof loggingSystemMock.createLogger>;
const soClient = savedObjectsClientMock.create();

const defaultOpts = {
  entityType: 'user' as const,
  entityId: 'user:alice',
};

beforeEach(() => {
  jest.clearAllMocks();
  logger = loggingSystemMock.createLogger();
  mockMlAnomalySearch = jest.fn().mockResolvedValue(makeResponse([]));
  mockMl = {
    mlSystemProvider: jest.fn().mockReturnValue({ mlAnomalySearch: mockMlAnomalySearch }),
    modulesProvider: jest.fn().mockReturnValue({ listModules: jest.fn().mockResolvedValue([]) }),
  } as unknown as MlPluginSetup;
});

describe('searchEntityAnomalies', () => {
  it('returns empty result without querying ML when no security job IDs are known', async () => {
    const { getSecurityMlJobIds } = jest.requireMock('./get_security_ml_job_ids');
    getSecurityMlJobIds.mockResolvedValueOnce([]);

    const result = await searchEntityAnomalies({ ...defaultOpts, logger, ml: mockMl, soClient });

    expect(result.hits).toEqual([]);
    expect(result.total).toBe(0);
    expect(mockMlAnomalySearch).not.toHaveBeenCalled();
  });

  it('returns empty result when filterJobIds has no overlap with security job IDs', async () => {
    const result = await searchEntityAnomalies({
      ...defaultOpts,
      jobIds: ['non-security-job'],
      logger,
      ml: mockMl,
      soClient,
    });

    expect(result.hits).toEqual([]);
    expect(result.total).toBe(0);
    expect(mockMlAnomalySearch).not.toHaveBeenCalled();
  });

  it('sends the correct base query to mlAnomalySearch', async () => {
    const { euid } = jest.requireMock('@kbn/entity-store/common/euid_helpers');

    await searchEntityAnomalies({ ...defaultOpts, logger, ml: mockMl, soClient });

    expect(euid.painless.getEuidRuntimeMapping).toHaveBeenCalledWith('user');
    expect(mockMlAnomalySearch).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: ['entity_id'],
        runtime_mappings: { entity_id: { type: 'keyword', source: 'mock-script' } },
        query: {
          bool: {
            filter: expect.arrayContaining([
              { term: { result_type: 'record' } },
              { term: { is_interim: false } },
              { range: { record_score: { gte: 1 } } },
              { range: { timestamp: { gte: 'now-30d' } } },
              { term: { entity_id: 'user:alice' } },
              { terms: { job_id: ['security-job-1', 'security-job-2'] } },
            ]),
          },
        },
      }),
      []
    );
  });

  it('uses now-DEFAULT_ML_AD_LOOKBACK as the timestamp lower bound when fromMs is not provided', async () => {
    await searchEntityAnomalies({ ...defaultOpts, logger, ml: mockMl, soClient });

    const [body] = mockMlAnomalySearch.mock.calls[0];
    const tsFilter = body.query.bool.filter.find(
      (f: unknown) =>
        typeof f === 'object' &&
        f !== null &&
        'range' in (f as object) &&
        'timestamp' in (f as { range: object }).range
    );
    expect(tsFilter).toEqual({ range: { timestamp: { gte: 'now-30d' } } });
  });

  it('uses fromMs as the timestamp lower bound when provided', async () => {
    await searchEntityAnomalies({
      ...defaultOpts,
      fromMs: 1_700_000_000_000,
      logger,
      ml: mockMl,
      soClient,
    });

    const [body] = mockMlAnomalySearch.mock.calls[0];
    const tsFilter = body.query.bool.filter.find(
      (f: unknown) =>
        typeof f === 'object' &&
        f !== null &&
        'range' in (f as object) &&
        'timestamp' in (f as { range: object }).range
    );
    expect(tsFilter).toEqual({ range: { timestamp: { gte: 1_700_000_000_000 } } });
  });

  it('omits the lte bound from the timestamp filter when toMs is not provided', async () => {
    await searchEntityAnomalies({ ...defaultOpts, logger, ml: mockMl, soClient });

    const [body] = mockMlAnomalySearch.mock.calls[0];
    const tsFilter = body.query.bool.filter.find(
      (f: unknown) =>
        typeof f === 'object' &&
        f !== null &&
        'range' in (f as object) &&
        'timestamp' in (f as { range: object }).range
    );
    expect(tsFilter.range.timestamp).not.toHaveProperty('lte');
  });

  it('uses toMs as the timestamp upper bound when provided', async () => {
    await searchEntityAnomalies({
      ...defaultOpts,
      fromMs: 1_700_000_000_000,
      toMs: 1_700_100_000_000,
      logger,
      ml: mockMl,
      soClient,
    });

    const [body] = mockMlAnomalySearch.mock.calls[0];
    const tsFilter = body.query.bool.filter.find(
      (f: unknown) =>
        typeof f === 'object' &&
        f !== null &&
        'range' in (f as object) &&
        'timestamp' in (f as { range: object }).range
    );
    expect(tsFilter).toEqual({
      range: { timestamp: { gte: 1_700_000_000_000, lte: 1_700_100_000_000 } },
    });
  });

  it('intersects filterJobIds with security job IDs', async () => {
    await searchEntityAnomalies({
      ...defaultOpts,
      jobIds: ['security-job-1', 'unrelated-job'],
      logger,
      ml: mockMl,
      soClient,
    });

    const [body] = mockMlAnomalySearch.mock.calls[0];
    const jobFilter = body.query.bool.filter.find(
      (f: unknown) => typeof f === 'object' && f !== null && 'terms' in (f as object)
    );
    // 'unrelated-job' is not in the security job IDs list, so only 'security-job-1' survives.
    expect(jobFilter).toEqual({ terms: { job_id: ['security-job-1'] } });
  });

  it('uses all security job IDs in the filter when filterJobIds is omitted', async () => {
    await searchEntityAnomalies({ ...defaultOpts, logger, ml: mockMl, soClient });

    const [body] = mockMlAnomalySearch.mock.calls[0];
    const jobFilter = body.query.bool.filter.find(
      (f: unknown) => typeof f === 'object' && f !== null && 'terms' in (f as object)
    );
    expect(jobFilter).toEqual({ terms: { job_id: ['security-job-1', 'security-job-2'] } });
  });

  it('uses default sort (timestamp desc) when sort is not provided', async () => {
    await searchEntityAnomalies({ ...defaultOpts, logger, ml: mockMl, soClient });

    const [body] = mockMlAnomalySearch.mock.calls[0];
    expect(body.sort).toEqual([{ timestamp: { order: 'desc' } }]);
  });

  it('maps sort field names to the corresponding ML record field names', async () => {
    await searchEntityAnomalies({
      ...defaultOpts,
      sort: [
        { field: 'timestamp', order: 'asc' },
        { field: 'record_score', order: 'desc' },
        { field: 'job_id', order: 'asc' },
      ],
      logger,
      ml: mockMl,
      soClient,
    });

    const [body] = mockMlAnomalySearch.mock.calls[0];
    expect(body.sort).toEqual([
      { timestamp: { order: 'asc' } },
      { record_score: { order: 'desc' } },
      { job_id: { order: 'asc' } },
    ]);
  });

  it('passes from and size to mlAnomalySearch', async () => {
    await searchEntityAnomalies({
      ...defaultOpts,
      from: 20,
      size: 10,
      logger,
      ml: mockMl,
      soClient,
    });

    const [body] = mockMlAnomalySearch.mock.calls[0];
    expect(body.from).toBe(20);
    expect(body.size).toBe(10);
  });

  it('uses from=0 and size=100 as defaults', async () => {
    await searchEntityAnomalies({ ...defaultOpts, logger, ml: mockMl, soClient });

    const [body] = mockMlAnomalySearch.mock.calls[0];
    expect(body.from).toBe(0);
    expect(body.size).toBe(100);
  });

  it('maps a full hit to an AnomalyHit correctly', async () => {
    mockMlAnomalySearch.mockResolvedValueOnce(
      makeResponse([
        makeHit({
          id: 'hit-abc',
          entityId: 'user:alice',
          jobId: 'security-job-1',
          detectorIndex: 2,
          detectorFunction: 'rare',
          timestamp: 1_700_000_000_000,
          recordScore: 88,
          actual: [10],
          typical: [2],
          byFieldName: 'source.ip',
          byFieldValue: 'evil-ip',
        }),
      ])
    );

    const result = await searchEntityAnomalies({ ...defaultOpts, logger, ml: mockMl, soClient });

    expect(result.hits).toEqual([
      {
        _id: 'hit-abc',
        entityId: 'user:alice',
        jobId: 'security-job-1',
        detectorIndex: 2,
        detectorFunction: 'rare',
        timestamp: 1_700_000_000_000,
        recordScore: 88,
        actual: 10,
        typical: 2,
        fieldName: undefined,
        byFieldName: 'source.ip',
        byFieldValue: 'evil-ip',
        overFieldName: undefined,
        overFieldValue: undefined,
        partitionFieldName: 'host.name',
        partitionFieldValue: 'web-01',
      },
    ]);
  });

  it('returns multiple hits in the order returned by ES', async () => {
    mockMlAnomalySearch.mockResolvedValueOnce(
      makeResponse([
        makeHit({ id: 'h1', entityId: 'user:alice', jobId: 'security-job-1', recordScore: 90 }),
        makeHit({ id: 'h2', entityId: 'user:alice', jobId: 'security-job-2', recordScore: 50 }),
      ])
    );

    const result = await searchEntityAnomalies({ ...defaultOpts, logger, ml: mockMl, soClient });

    expect(result.hits).toHaveLength(2);
    expect(result.hits[0]._id).toBe('h1');
    expect(result.hits[1]._id).toBe('h2');
  });

  it('skips hits where actual or typical is missing', async () => {
    for (const field of ['actual', 'typical'] as const) {
      jest.clearAllMocks();
      mockMlAnomalySearch = jest.fn().mockResolvedValue(makeResponse([]));
      mockMl = {
        mlSystemProvider: jest.fn().mockReturnValue({ mlAnomalySearch: mockMlAnomalySearch }),
      } as unknown as MlPluginSetup;

      const hit = makeHit({ entityId: 'user:alice' });
      delete (hit._source as Record<string, unknown>)[field];
      mockMlAnomalySearch.mockResolvedValueOnce(makeResponse([hit]));

      const result = await searchEntityAnomalies({ ...defaultOpts, logger, ml: mockMl, soClient });
      expect(result.hits).toEqual([]);
    }
  });

  it('skips hits where detector_index is missing', async () => {
    const hit = makeHit({ entityId: 'user:alice' });
    delete (hit._source as Record<string, unknown>).detector_index;
    mockMlAnomalySearch.mockResolvedValueOnce(makeResponse([hit]));

    const result = await searchEntityAnomalies({ ...defaultOpts, logger, ml: mockMl, soClient });
    expect(result.hits).toEqual([]);
  });

  it('skips hits where entity_id runtime field is missing', async () => {
    mockMlAnomalySearch.mockResolvedValueOnce(makeResponse([makeHit({ noEntityId: true })]));

    const result = await searchEntityAnomalies({ ...defaultOpts, logger, ml: mockMl, soClient });
    expect(result.hits).toEqual([]);
  });

  it('skips hits where _source is missing', async () => {
    mockMlAnomalySearch.mockResolvedValueOnce(makeResponse([makeHit({ noSource: true })]));

    const result = await searchEntityAnomalies({ ...defaultOpts, logger, ml: mockMl, soClient });
    expect(result.hits).toEqual([]);
  });

  it('returns empty result and logs a warning when mlAnomalySearch throws', async () => {
    mockMlAnomalySearch.mockRejectedValueOnce(new Error('ES cluster unavailable'));

    const result = await searchEntityAnomalies({ ...defaultOpts, logger, ml: mockMl, soClient });

    expect(result.hits).toEqual([]);
    expect(result.total).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('ES cluster unavailable'));
  });

  it('returns empty result when there are no matching hits', async () => {
    mockMlAnomalySearch.mockResolvedValueOnce(makeResponse([]));

    const result = await searchEntityAnomalies({ ...defaultOpts, logger, ml: mockMl, soClient });
    expect(result.hits).toEqual([]);
    expect(result.total).toBe(0);
  });
});
