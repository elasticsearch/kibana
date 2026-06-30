/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MgetResponse, SearchResponse } from '@elastic/elasticsearch/lib/api/types';
import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { Entity } from '@kbn/entity-store/common';
import { ESSENTIAL_ALERT_FIELDS } from '../../../../../../common/constants';
import { getRiskScoreData } from './get_risk_score_data';
import type { EntityRiskScoreRecord } from '../../../../../../common/api/entity_analytics/common';

const logger = loggingSystemMock.createLogger();
const esClient = elasticsearchServiceMock.createScopedClusterClient().asCurrentUser;

const makeRiskScore = (overrides: Partial<EntityRiskScoreRecord> = {}): EntityRiskScoreRecord => ({
  '@timestamp': '2026-05-28T15:48:14.198Z',
  id_field: 'entity.id',
  id_value: 'user:carol@local',
  calculated_level: 'Moderate',
  calculated_score: 153,
  calculated_score_norm: 59,
  category_1_score: 59,
  category_1_count: 1,
  inputs: [],
  notes: [],
  ...overrides,
});

const makeInput = (id: string, index = '.alerts-security.alerts-default') => ({
  id,
  index,
  category: 'category_1',
  description: 'Alert from Rule: test',
  risk_score: 99,
  contribution_score: 38,
  timestamp: '2026-05-28T15:46:39.445Z',
});

const makeSearchResponse = (riskScore: EntityRiskScoreRecord | undefined, entityType = 'user') =>
  ({
    hits: {
      hits: riskScore ? [{ _source: { [entityType]: { risk: riskScore } } }] : [],
    },
  } as unknown as SearchResponse<Record<string, { risk: EntityRiskScoreRecord }>>);

const makeFoundDoc = (
  _id: string,
  source: Record<string, unknown> = {},
  _index = '.alerts-security.alerts-default'
) => ({
  _id,
  _index,
  found: true,
  _source: { kibana: { alert: { rule: { name: 'test' } } }, ...source },
});

const makeMissingDoc = (_id: string) => ({ _id, found: false });

const makeEntity = (id: string, type: string): Entity =>
  ({ entity: { id, EngineMetadata: { Type: type } } } as unknown as Entity);

const baseOptions = {
  logger,
  esClient,
  spaceId: 'default',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getRiskScoreData', () => {
  describe('when entities array is empty', () => {
    it('returns an empty array without searching', async () => {
      const result = await getRiskScoreData({ ...baseOptions, entities: [] });

      expect(result).toEqual([]);
      expect(esClient.search).not.toHaveBeenCalled();
      expect(esClient.mget).not.toHaveBeenCalled();
    });
  });

  describe('when entity fields are missing', () => {
    it.each([
      { entity: {} },
      { entity: { id: 'carol' } },
      { entity: { EngineMetadata: { Type: 'user' } } },
    ] as unknown as Entity[])('returns empty result without searching for %o', async (entity) => {
      const result = await getRiskScoreData({ ...baseOptions, entities: [entity] });

      expect(esClient.search).not.toHaveBeenCalled();
      expect(result).toEqual([{ riskScore: undefined, alertDocuments: [] }]);
    });
  });

  describe('when getAlerts is false', () => {
    it('skips mget and returns empty alertDocuments', async () => {
      const riskScore = makeRiskScore({ inputs: [makeInput('alert-1')] });
      jest.mocked(esClient.search).mockResolvedValue(makeSearchResponse(riskScore));

      const result = await getRiskScoreData({
        ...baseOptions,
        entities: [makeEntity('carol', 'user')],
        getAlerts: false,
      });

      expect(esClient.mget).not.toHaveBeenCalled();
      expect(esClient.search).toHaveBeenCalledWith({
        allow_no_indices: false,
        from: 0,
        ignore_unavailable: true,
        index: ['risk-score.risk-score-default'],
        query: {
          bool: {
            filter: [{ terms: { 'user.name': ['carol'] } }, { exists: { field: 'user.name' } }],
          },
        },
        size: 1,
        sort: [{ '@timestamp': 'desc' }],
        track_total_hits: true,
      });
      expect(result).toEqual([{ riskScore, alertDocuments: [] }]);
    });
  });

  describe('when there is no risk score for an entity', () => {
    it('returns undefined riskScore with empty alertDocuments', async () => {
      jest.mocked(esClient.search).mockResolvedValue(makeSearchResponse(undefined));

      const result = await getRiskScoreData({
        ...baseOptions,
        entities: [makeEntity('carol', 'user')],
      });

      expect(esClient.mget).not.toHaveBeenCalled();
      expect(result).toEqual([{ riskScore: undefined, alertDocuments: [] }]);
    });
  });

  describe('when the risk score has no inputs', () => {
    it('returns the risk score with empty alertDocuments without calling mget', async () => {
      const riskScore = makeRiskScore({ inputs: [] });
      jest.mocked(esClient.search).mockResolvedValue(makeSearchResponse(riskScore));

      const result = await getRiskScoreData({
        ...baseOptions,
        entities: [makeEntity('carol', 'user')],
      });

      expect(esClient.mget).not.toHaveBeenCalled();
      expect(result).toEqual([{ riskScore, alertDocuments: [] }]);
    });
  });

  describe('when the risk score has inputs', () => {
    it('calls mget with the correct doc IDs and indices', async () => {
      const input = makeInput('alert-1', '.alerts-security.alerts-default');
      const riskScore = makeRiskScore({ inputs: [input] });
      jest.mocked(esClient.search).mockResolvedValue(makeSearchResponse(riskScore));
      jest
        .mocked(esClient.mget)
        .mockResolvedValue({ docs: [makeFoundDoc('alert-1')] } as MgetResponse);

      await getRiskScoreData({
        ...baseOptions,
        entities: [makeEntity('carol', 'user')],
      });

      expect(esClient.mget).toHaveBeenCalledWith({
        _source_includes: ESSENTIAL_ALERT_FIELDS,
        docs: [{ _id: 'alert-1', _index: '.alerts-security.alerts-default' }],
      });
    });

    it('returns alertDocuments for found alerts', async () => {
      const input = makeInput('alert-1');
      const riskScore = makeRiskScore({ inputs: [input] });
      const alertSource = { kibana: { alert: { rule: { name: 'test' } } } };
      jest.mocked(esClient.search).mockResolvedValue(makeSearchResponse(riskScore));
      jest
        .mocked(esClient.mget)
        .mockResolvedValue({ docs: [makeFoundDoc('alert-1', alertSource)] } as MgetResponse);

      const result = await getRiskScoreData({
        ...baseOptions,
        entities: [makeEntity('carol', 'user')],
      });

      expect(result).toEqual([
        {
          riskScore,
          alertDocuments: [{ kibana: { alert: { rule: { name: 'test' } } } }],
        },
      ]);
    });

    it('excludes alert documents that were not found', async () => {
      const riskScore = makeRiskScore({
        inputs: [makeInput('alert-found'), makeInput('alert-missing')],
      });
      jest.mocked(esClient.search).mockResolvedValue(makeSearchResponse(riskScore));
      jest.mocked(esClient.mget).mockResolvedValue({
        docs: [makeFoundDoc('alert-found'), makeMissingDoc('alert-missing')],
      } as MgetResponse);

      const result = await getRiskScoreData({
        ...baseOptions,
        entities: [makeEntity('carol', 'user')],
      });

      expect(result[0].alertDocuments).toHaveLength(1);
      expect(result[0].alertDocuments[0]).toMatchObject({
        kibana: { alert: { rule: { name: 'test' } } },
      });
    });
  });

  describe('with multiple entities', () => {
    it('fetches risk scores in parallel and issues a single mget for all inputs', async () => {
      const riskScoreA = makeRiskScore({ id_value: 'user:alice', inputs: [makeInput('alert-a')] });
      const riskScoreB = makeRiskScore({ id_value: 'user:bob', inputs: [makeInput('alert-b')] });
      jest
        .mocked(esClient.search)
        .mockResolvedValueOnce(makeSearchResponse(riskScoreA))
        .mockResolvedValueOnce(makeSearchResponse(riskScoreB));
      jest.mocked(esClient.mget).mockResolvedValue({
        docs: [makeFoundDoc('alert-a'), makeFoundDoc('alert-b')],
      } as MgetResponse);

      const result = await getRiskScoreData({
        ...baseOptions,
        entities: [makeEntity('alice', 'user'), makeEntity('bob', 'user')],
      });

      expect(esClient.search).toHaveBeenCalledTimes(2);
      expect(esClient.mget).toHaveBeenCalledTimes(1);
      expect(esClient.mget.mock.calls[0][0]?.docs).toHaveLength(2);

      expect(result[0].riskScore?.id_value).toBe('user:alice');
      expect(result[0].alertDocuments).toHaveLength(1);
      expect(result[1].riskScore?.id_value).toBe('user:bob');
      expect(result[1].alertDocuments).toHaveLength(1);
    });

    it('does not mis-assign alerts when the same _id exists in multiple indices', async () => {
      const riskScoreA = makeRiskScore({
        id_value: 'user:alice',
        inputs: [makeInput('shared-id', '.alerts-security.alerts-default')],
      });
      const riskScoreB = makeRiskScore({
        id_value: 'user:bob',
        inputs: [makeInput('shared-id', '.alerts-security.alerts-space2')],
      });
      jest
        .mocked(esClient.search)
        .mockResolvedValueOnce(makeSearchResponse(riskScoreA))
        .mockResolvedValueOnce(makeSearchResponse(riskScoreB));

      const sourceA = { entity: 'alice-alert' };
      const sourceB = { entity: 'bob-alert' };
      jest.mocked(esClient.mget).mockResolvedValue({
        docs: [
          makeFoundDoc('shared-id', sourceA, '.alerts-security.alerts-default'),
          makeFoundDoc('shared-id', sourceB, '.alerts-security.alerts-space2'),
        ],
      } as MgetResponse);

      const result = await getRiskScoreData({
        ...baseOptions,
        entities: [makeEntity('alice', 'user'), makeEntity('bob', 'user')],
      });

      expect(result[0].alertDocuments[0]).toMatchObject(sourceA);
      expect(result[1].alertDocuments[0]).toMatchObject(sourceB);
    });

    it('correctly assigns alert documents to each entity when inputs share the same index', async () => {
      const riskScoreA = makeRiskScore({ id_value: 'user:alice', inputs: [makeInput('alert-a')] });
      const riskScoreB = makeRiskScore({ id_value: 'user:bob', inputs: [makeInput('alert-b')] });
      jest
        .mocked(esClient.search)
        .mockResolvedValueOnce(makeSearchResponse(riskScoreA))
        .mockResolvedValueOnce(makeSearchResponse(riskScoreB));

      const sourceA = { entity: 'alice-alert' };
      const sourceB = { entity: 'bob-alert' };
      jest.mocked(esClient.mget).mockResolvedValue({
        docs: [makeFoundDoc('alert-a', sourceA), makeFoundDoc('alert-b', sourceB)],
      } as MgetResponse);

      const result = await getRiskScoreData({
        ...baseOptions,
        entities: [makeEntity('alice', 'user'), makeEntity('bob', 'user')],
      });

      expect(result[0].alertDocuments[0]).toMatchObject(sourceA);
      expect(result[1].alertDocuments[0]).toMatchObject(sourceB);
    });
  });

  describe('error handling', () => {
    it('returns empty results when search throws', async () => {
      jest.mocked(esClient.search).mockRejectedValue(new Error('search failed'));

      const result = await getRiskScoreData({
        ...baseOptions,
        entities: [makeEntity('carol', 'user')],
      });

      expect(result).toEqual([{ riskScore: undefined, alertDocuments: [] }]);
    });

    it('returns empty results for all entities when any search in a parallel batch throws', async () => {
      jest
        .mocked(esClient.search)
        .mockResolvedValueOnce(makeSearchResponse(makeRiskScore({ id_value: 'user:alice' })))
        .mockRejectedValueOnce(new Error('search failed for bob'));

      const result = await getRiskScoreData({
        ...baseOptions,
        entities: [makeEntity('alice', 'user'), makeEntity('bob', 'user')],
      });

      expect(result).toEqual([
        { riskScore: undefined, alertDocuments: [] },
        { riskScore: undefined, alertDocuments: [] },
      ]);
    });

    it('returns empty results when mget throws', async () => {
      const riskScore = makeRiskScore({ inputs: [makeInput('alert-1')] });
      jest.mocked(esClient.search).mockResolvedValue(makeSearchResponse(riskScore));
      jest.mocked(esClient.mget).mockRejectedValue(new Error('mget failed'));

      const result = await getRiskScoreData({
        ...baseOptions,
        entities: [makeEntity('carol', 'user')],
      });

      expect(result).toEqual([{ riskScore: undefined, alertDocuments: [] }]);
    });
  });
});
