/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  elasticsearchServiceMock,
  httpServerMock,
  loggingSystemMock,
  savedObjectsClientMock,
} from '@kbn/core/server/mocks';
import type { Entity } from '@kbn/entity-store/common';
import { euid } from '@kbn/entity-store/common/euid_helpers';
import type { ExperimentalFeatures } from '../../../../../../common';
import type { AnomalySummaryEntry } from '../../../../../../common/api/entity_analytics/anomaly_summary';
import { getAnomalyData } from './get_anomaly_data';
import { getEntityAnomalies } from '../../../anomaly_summary';

jest.mock('../../../anomaly_summary');
jest.mock('@kbn/entity-store/common/euid_helpers', () => ({
  euid: {
    dsl: {
      getEuidFilterBasedOnDocument: jest.fn(),
    },
  },
}));

const esClient = elasticsearchServiceMock.createScopedClusterClient().asCurrentUser;
const soClient = savedObjectsClientMock.create();
const logger = loggingSystemMock.createLogger();
const request = httpServerMock.createKibanaRequest();

const makeEntity = (opts: { id?: string; type?: string }): Entity => {
  const base = {
    entity: {
      id: opts.id,
      EngineMetadata: { Type: opts.type },
    },
  };
  if (opts.id && opts.type === 'user') {
    return {
      ...base,
      user: { name: opts.id },
      event: { kind: 'asset' },
    } as unknown as Entity;
  }
  return base as unknown as Entity;
};

const makeAnomalySummaryEntry = (
  overrides: Partial<AnomalySummaryEntry> = {}
): AnomalySummaryEntry => ({
  jobId: 'security-job-1',
  jobName: null,
  detectorIndex: 0,
  detectorFunction: 'rare',
  fieldName: null,
  byFieldName: null,
  byFieldValue: null,
  overFieldName: null,
  overFieldValue: null,
  partitionFieldName: null,
  partitionFieldValue: null,
  recordScore: 75,
  recordId: 'record-1',
  timestamp: '2023-11-14T22:13:20.000Z',
  actual: [],
  typical: [],
  baselineValues: [],
  ...overrides,
});

const experimentalFeaturesApiOn = {
  entityAnalyticsAnomalyDetails: true,
} as unknown as ExperimentalFeatures;

const experimentalFeaturesApiOff = {
  entityAnalyticsAnomalyDetails: false,
} as unknown as ExperimentalFeatures;

const makeMl = (
  jobs: Array<{ id: string; groups?: string[]; displayName?: string; description?: string }> = [],
  anomalies: unknown[] = []
) => {
  const mockGetAnomaliesTableData = jest.fn().mockResolvedValue({ anomalies, interval: 'auto' });
  return {
    jobServiceProvider: jest.fn().mockReturnValue({
      jobsSummary: jest.fn().mockResolvedValue(
        jobs.map((j) => ({
          id: j.id,
          groups: j.groups ?? ['security'],
          description: j.description ?? '',
          customSettings: j.displayName ? { security_app_display_name: j.displayName } : undefined,
        }))
      ),
    }),
    resultsServiceProvider: jest.fn().mockReturnValue({
      getAnomaliesTableData: mockGetAnomaliesTableData,
    }),
    _getAnomaliesTableData: mockGetAnomaliesTableData,
  };
};

const makeUiSettingsClient = (anomalyScore = 50) => ({
  get: jest.fn().mockResolvedValue(anomalyScore),
});

const baseOptions = {
  esClient,
  logger,
  request,
  soClient,
  fromDate: 0,
  toDate: 1_700_000_000_000,
};

const mockEuidFilter = { term: { 'user.name': 'mock-euid-entity' } };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(euid.dsl.getEuidFilterBasedOnDocument).mockReturnValue(mockEuidFilter);
});

describe('getAnomalyData', () => {
  describe('when entities array is empty', () => {
    it('returns an empty array without any calls', async () => {
      const result = await getAnomalyData({
        ...baseOptions,
        entities: [],
        experimentalFeatures: experimentalFeaturesApiOn,
        ml: makeMl() as never,
        uiSettingsClient: makeUiSettingsClient() as never,
      });

      expect(result).toEqual([]);
      expect(jest.mocked(getEntityAnomalies)).not.toHaveBeenCalled();
    });
  });

  describe('when entityAnalyticsAnomalyDetails is true', () => {
    it('returns empty array when ml is null', async () => {
      const result = await getAnomalyData({
        ...baseOptions,
        entities: [makeEntity({ id: 'user:alice', type: 'user' })],
        experimentalFeatures: experimentalFeaturesApiOn,
        ml: undefined,
        uiSettingsClient: makeUiSettingsClient() as never,
      });

      expect(result).toEqual([[]]);
      expect(jest.mocked(getEntityAnomalies)).not.toHaveBeenCalled();
    });

    it('returns empty array per entity when entity id is missing', async () => {
      const result = await getAnomalyData({
        ...baseOptions,
        entities: [makeEntity({ type: 'user' })],
        experimentalFeatures: experimentalFeaturesApiOn,
        ml: makeMl() as never,
        uiSettingsClient: makeUiSettingsClient() as never,
      });

      expect(jest.mocked(getEntityAnomalies)).not.toHaveBeenCalled();
      expect(result).toEqual([[]]);
    });

    it('calls getEntityAnomalies with the correct parameters', async () => {
      jest.mocked(getEntityAnomalies).mockResolvedValue({ anomalies: [], total: 0 });

      await getAnomalyData({
        ...baseOptions,
        entities: [makeEntity({ id: 'user:alice', type: 'user' })],
        experimentalFeatures: experimentalFeaturesApiOn,
        ml: makeMl() as never,
        uiSettingsClient: makeUiSettingsClient() as never,
      });

      expect(jest.mocked(getEntityAnomalies)).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'user:alice',
          entityType: 'user',
          fromMs: 0,
          toMs: 1_700_000_000_000,
        })
      );
    });

    it('maps anomaly results to AnomalyRecord correctly', async () => {
      const entry = makeAnomalySummaryEntry({ jobId: 'security-job-1', recordScore: 88 });
      jest.mocked(getEntityAnomalies).mockResolvedValue({ anomalies: [entry], total: 1 });

      const result = await getAnomalyData({
        ...baseOptions,
        entities: [makeEntity({ id: 'user:alice', type: 'user' })],
        experimentalFeatures: experimentalFeaturesApiOn,
        ml: makeMl([{ id: 'security-job-1', displayName: 'Security Job One' }]) as never,
        uiSettingsClient: makeUiSettingsClient() as never,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].source).toEqual(entry);
      expect(result[0][0].job).toEqual({ name: 'Security Job One', description: '' });
    });

    it('issues one getEntityAnomalies call per entity and returns results in input order', async () => {
      const entryA = makeAnomalySummaryEntry({ jobId: 'job-a', recordScore: 90 });
      const entryB = makeAnomalySummaryEntry({ jobId: 'job-b', recordScore: 50 });
      jest
        .mocked(getEntityAnomalies)
        .mockResolvedValueOnce({ anomalies: [entryA], total: 1 })
        .mockResolvedValueOnce({ anomalies: [entryB], total: 1 });

      const result = await getAnomalyData({
        ...baseOptions,
        entities: [
          makeEntity({ id: 'user:alice', type: 'user' }),
          makeEntity({ id: 'user:bob', type: 'user' }),
        ],
        experimentalFeatures: experimentalFeaturesApiOn,
        ml: makeMl() as never,
        uiSettingsClient: makeUiSettingsClient() as never,
      });

      expect(jest.mocked(getEntityAnomalies)).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      expect((result[0][0].source as AnomalySummaryEntry).recordScore).toBe(90);
      expect((result[1][0].source as AnomalySummaryEntry).recordScore).toBe(50);
    });
  });

  describe('when entityAnalyticsAnomalyDetails is false', () => {
    it('returns empty arrays when ml is not provided', async () => {
      const result = await getAnomalyData({
        ...baseOptions,
        entities: [makeEntity({ id: 'user:alice', type: 'user' })],
        experimentalFeatures: experimentalFeaturesApiOff,
        ml: undefined,
        uiSettingsClient: makeUiSettingsClient() as never,
      });

      expect(result).toEqual([[]]);
      expect(esClient.search).not.toHaveBeenCalled();
    });

    it('returns empty array for entity missing id or type', async () => {
      const ml = makeMl([{ id: 'security-job-1' }]);

      const result = await getAnomalyData({
        ...baseOptions,
        entities: [makeEntity({ type: 'user' }), makeEntity({ id: 'user:alice' })],
        experimentalFeatures: experimentalFeaturesApiOff,
        ml: ml as never,
        uiSettingsClient: makeUiSettingsClient() as never,
      });

      expect(result).toEqual([[], []]);
    });

    it('calls getAnomaliesTableData with the entity filter as the last argument', async () => {
      const ml = makeMl([{ id: 'security-job-1' }]);

      await getAnomalyData({
        ...baseOptions,
        entities: [makeEntity({ id: 'user:alice', type: 'user' })],
        experimentalFeatures: experimentalFeaturesApiOff,
        ml: ml as never,
        uiSettingsClient: makeUiSettingsClient(50) as never,
      });

      expect(ml._getAnomaliesTableData).toHaveBeenCalledWith(
        ['security-job-1'],
        [],
        [],
        'auto',
        expect.any(Array),
        0,
        1_700_000_000_000,
        expect.any(String),
        500,
        10,
        { bool: { filter: [mockEuidFilter] } }
      );
    });

    it('maps anomaly results to AnomalyRecord using job metadata', async () => {
      const anomalySource = { record_score: 72, job_id: 'security-job-1' };
      const ml = makeMl(
        [
          {
            id: 'security-job-1',
            displayName: 'Unusual Login',
            description: 'Detects unusual logins',
          },
        ],
        [{ jobId: 'security-job-1', source: anomalySource }]
      );

      const result = await getAnomalyData({
        ...baseOptions,
        entities: [makeEntity({ id: 'user:alice', type: 'user' })],
        experimentalFeatures: experimentalFeaturesApiOff,
        ml: ml as never,
        uiSettingsClient: makeUiSettingsClient() as never,
      });

      expect(result[0]).toHaveLength(1);
      expect(result[0][0].source).toEqual(anomalySource);
      expect(result[0][0].job).toEqual({
        name: 'Unusual Login',
        description: 'Detects unusual logins',
      });
    });

    it('excludes jobs that do not belong to the security group', async () => {
      const ml = makeMl(
        [{ id: 'other-job', groups: ['other-group'] }, { id: 'security-job-1' }],
        []
      );

      await getAnomalyData({
        ...baseOptions,
        entities: [makeEntity({ id: 'user:alice', type: 'user' })],
        experimentalFeatures: experimentalFeaturesApiOff,
        ml: ml as never,
        uiSettingsClient: makeUiSettingsClient() as never,
      });

      const [calledJobIds] = ml._getAnomaliesTableData.mock.calls[0];
      expect(calledJobIds).toEqual(['security-job-1']);
      expect(calledJobIds).not.toContain('other-job');
    });

    it('uses job id as name fallback when security_app_display_name is absent', async () => {
      const ml = makeMl([{ id: 'security-job-1' }], [{ jobId: 'security-job-1', source: {} }]);

      const result = await getAnomalyData({
        ...baseOptions,
        entities: [makeEntity({ id: 'user:alice', type: 'user' })],
        experimentalFeatures: experimentalFeaturesApiOff,
        ml: ml as never,
        uiSettingsClient: makeUiSettingsClient() as never,
      });

      expect(result[0][0].job?.name).toBe('security-job-1');
    });

    it('returns empty arrays per entity when getAnomaliesTableData throws', async () => {
      const ml = makeMl([{ id: 'security-job-1' }]);
      ml._getAnomaliesTableData.mockRejectedValue(new Error('anomaly fetch failed'));

      const result = await getAnomalyData({
        ...baseOptions,
        entities: [makeEntity({ id: 'user:alice', type: 'user' })],
        experimentalFeatures: experimentalFeaturesApiOff,
        ml: ml as never,
        uiSettingsClient: makeUiSettingsClient() as never,
      });

      expect(result).toEqual([[]]);
    });
  });
});
