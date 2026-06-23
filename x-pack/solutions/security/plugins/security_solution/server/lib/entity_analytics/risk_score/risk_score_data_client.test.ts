/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createOrUpdateComponentTemplate,
  createOrUpdateIndexTemplate,
} from '@kbn/alerting-plugin/server';
import {
  loggingSystemMock,
  elasticsearchServiceMock,
  savedObjectsClientMock,
} from '@kbn/core/server/mocks';

import { RiskScoreDataClient } from './risk_score_data_client';

import { createDataStream } from '../utils/create_datastream';

import * as transforms from '../utils/transforms';
import { createOrUpdateIndex } from '../utils/create_or_update_index';

jest.mock('@kbn/alerting-plugin/server', () => ({
  createOrUpdateComponentTemplate: jest.fn(),
  createOrUpdateIndexTemplate: jest.fn(),
}));

jest.mock('../utils/create_datastream', () => ({
  createDataStream: jest.fn(),
}));

jest.mock('../utils/create_or_update_index', () => ({
  createOrUpdateIndex: jest.fn(),
}));

jest.spyOn(transforms, 'createTransform').mockResolvedValue(Promise.resolve());
jest.spyOn(transforms, 'scheduleTransformNow').mockResolvedValue(Promise.resolve());

let logger: ReturnType<typeof loggingSystemMock.createLogger>;
const esClient = elasticsearchServiceMock.createScopedClusterClient().asCurrentUser;
const totalFieldsLimit = 1000;

describe('RiskScoreDataClient', () => {
  let riskScoreDataClient: RiskScoreDataClient;
  let riskScoreDataClientWithNameSpace: RiskScoreDataClient;
  let riskScoreDataClientWithLongNameSpace: RiskScoreDataClient;
  let mockSavedObjectClient: ReturnType<typeof savedObjectsClientMock.create>;

  beforeEach(() => {
    logger = loggingSystemMock.createLogger();
    mockSavedObjectClient = savedObjectsClientMock.create();
    const options = {
      logger,
      kibanaVersion: '8.9.0',
      esClient,
      soClient: mockSavedObjectClient,
      namespace: 'default',
    };
    riskScoreDataClient = new RiskScoreDataClient(options);
    const optionsWithNamespace = { ...options, namespace: 'space-1' };
    riskScoreDataClientWithNameSpace = new RiskScoreDataClient(optionsWithNamespace);
    const optionsWithLongNamespace = { ...options, namespace: 'a_a-'.repeat(200) };
    riskScoreDataClientWithLongNameSpace = new RiskScoreDataClient(optionsWithLongNamespace);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getWriter', () => {
    it('should return a writer object', async () => {
      const writer = await riskScoreDataClient.getWriter({ namespace: 'default' });
      expect(writer).toBeDefined();
      expect(typeof writer?.bulk).toBe('function');
    });

    it('should cache and return the same writer for the same namespace', async () => {
      const writer1 = await riskScoreDataClient.getWriter({ namespace: 'default' });
      const writer2 = await riskScoreDataClient.getWriter({ namespace: 'default' });
      const writer3 = await riskScoreDataClient.getWriter({ namespace: 'space-1' });

      expect(writer1).toEqual(writer2);
      expect(writer2).not.toEqual(writer3);
    });
  });

  describe('init success', () => {
    it('should initialize risk engine resources in the appropriate space', async () => {
      // Default namespace
      esClient.cluster.existsComponentTemplate.mockResolvedValue(false);
      await riskScoreDataClient.init();
      assertComponentTemplate('default');
      assertIndexTemplate('default');
      assertDataStream('default');

      // Space-1 namespace
      esClient.cluster.existsComponentTemplate.mockResolvedValue(false);
      await riskScoreDataClientWithNameSpace.init();
      assertComponentTemplate('space-1');
      assertIndexTemplate('space-1');
      assertDataStream('space-1');

      expect(
        (createOrUpdateComponentTemplate as jest.Mock).mock.lastCall[0].template.template
      ).toMatchSnapshot();
    });
  });

  describe('initLegacyTransforms success', () => {
    it('should initialize legacy risk engine transforms in the appropriate space', async () => {
      // Default namespace
      await riskScoreDataClient.initLegacyTransforms();
      assertIndex('default');
      assertTransform('default');

      // Space-1 namespace
      await riskScoreDataClientWithNameSpace.initLegacyTransforms();
      assertIndex('space-1');
      assertTransform('space-1');

      // Space with more than 36 characters
      await riskScoreDataClientWithLongNameSpace.initLegacyTransforms();
      assertTransform('a_a-'.repeat(200));
    });
  });

  describe('init error', () => {
    it('should handle errors during initialization', async () => {
      const error = new Error('There error');
      (createOrUpdateIndexTemplate as jest.Mock).mockRejectedValueOnce(error);

      try {
        await riskScoreDataClient.init();
      } catch (e) {
        expect(logger.error).toHaveBeenCalledWith(
          `Error initializing risk engine resources: ${error.message}`
        );
      }
    });
  });
  describe('upgrade process', () => {
    it('upserts the configuration for the latest risk score index when upgrading', async () => {
      await riskScoreDataClient.upgradeIfNeeded();

      expect(esClient.indices.putMapping).toHaveBeenCalledWith(
        expect.objectContaining({
          dynamic: 'false',
        })
      );
    });
  });

  describe('tearDown', () => {
    it('deletes all resources', async () => {
      const errors = await riskScoreDataClient.tearDown();

      expect(esClient.transform.deleteTransform).toHaveBeenCalledTimes(1);
      expect(esClient.indices.deleteDataStream).toHaveBeenCalledTimes(1);
      expect(esClient.indices.deleteIndexTemplate).toHaveBeenCalledTimes(1);
      expect(esClient.cluster.deleteComponentTemplate).toHaveBeenCalledTimes(2);
      expect(errors).toEqual([]);
    });

    it('returns errors when promises are rejected', async () => {
      const error = new Error('test error');

      esClient.transform.deleteTransform.mockRejectedValueOnce(error);
      esClient.indices.deleteDataStream.mockRejectedValueOnce(error);
      esClient.indices.deleteIndexTemplate.mockRejectedValueOnce(error);
      esClient.cluster.deleteComponentTemplate.mockRejectedValueOnce(error);

      const errors = await riskScoreDataClient.tearDown();

      expect(errors).toEqual([error, error, error, error]);
    });
  });

  describe('getRiskScoreHistory', () => {
    const mockSearchHits = (
      hits: Array<{ timestamp: string; entityType: string; risk: Record<string, unknown> }>
    ) => ({
      hits: {
        hits: hits.map((h) => ({
          _source: {
            '@timestamp': h.timestamp,
            [h.entityType]: {
              risk: {
                '@timestamp': h.timestamp,
                ...h.risk,
              },
            },
          },
        })),
      },
    });

    const defaultParams = {
      entityType: 'host',
      entityId: 'host:test-id',
      range: { gte: 'now-90d', lte: 'now' } as const,
      pageSize: 100,
    };

    it('returns mapped history entries from ES hits', async () => {
      esClient.search.mockResolvedValueOnce(
        mockSearchHits([
          {
            timestamp: '2026-01-01T00:00:00.000Z',
            entityType: 'host',
            risk: {
              calculated_score_norm: 42,
              calculated_level: 'Low',
            },
          },
          {
            timestamp: '2026-01-02T00:00:00.000Z',
            entityType: 'host',
            risk: {
              calculated_score_norm: 78,
              calculated_level: 'High',
              calculated_score: 150.5,
              score_type: 'base',
            },
          },
        ]) as never
      );

      const result = await riskScoreDataClient.getRiskScoreHistory(defaultParams);

      expect(result).toEqual([
        {
          '@timestamp': '2026-01-01T00:00:00.000Z',
          calculated_score_norm: 42,
          calculated_level: 'Low',
        },
        {
          '@timestamp': '2026-01-02T00:00:00.000Z',
          calculated_score_norm: 78,
          calculated_level: 'High',
          calculated_score: 150.5,
          score_type: 'base',
        },
      ]);
    });

    it('queries the time-series index with correct filters', async () => {
      esClient.search.mockResolvedValueOnce(mockSearchHits([]) as never);

      await riskScoreDataClient.getRiskScoreHistory(defaultParams);

      const searchCall = esClient.search.mock.calls[0][0] as Record<string, unknown>;
      const filters = (searchCall.query as { bool: { filter: Array<Record<string, unknown>> } })
        .bool.filter;

      expect(filters).toEqual(
        expect.arrayContaining([
          { term: { 'host.risk.id_field': 'entity.id' } },
          { term: { 'host.risk.id_value': 'host:test-id' } },
          { range: { '@timestamp': { gte: 'now-90d', lte: 'now' } } },
        ])
      );
    });

    it('includes score_type filter when provided', async () => {
      esClient.search.mockResolvedValueOnce(mockSearchHits([]) as never);

      await riskScoreDataClient.getRiskScoreHistory({
        ...defaultParams,
        scoreType: 'propagated',
      });

      const searchCall = esClient.search.mock.calls[0][0] as Record<string, unknown>;
      const filters = (searchCall.query as { bool: { filter: Array<Record<string, unknown>> } })
        .bool.filter;

      expect(filters).toEqual(
        expect.arrayContaining([{ term: { 'host.risk.score_type': 'propagated' } }])
      );
    });

    it('handles base score_type with OR for missing field', async () => {
      esClient.search.mockResolvedValueOnce(mockSearchHits([]) as never);

      await riskScoreDataClient.getRiskScoreHistory({
        ...defaultParams,
        scoreType: 'base',
      });

      const searchCall = esClient.search.mock.calls[0][0] as Record<string, unknown>;
      const filters = (searchCall.query as { bool: { filter: Array<Record<string, unknown>> } })
        .bool.filter;

      expect(filters).toEqual(
        expect.arrayContaining([
          {
            bool: {
              should: [
                { term: { 'host.risk.score_type': 'base' } },
                { bool: { must_not: { exists: { field: 'host.risk.score_type' } } } },
              ],
              minimum_should_match: 1,
            },
          },
        ])
      );
    });

    it('caps page size at 1000', async () => {
      esClient.search.mockResolvedValueOnce(mockSearchHits([]) as never);

      await riskScoreDataClient.getRiskScoreHistory({
        ...defaultParams,
        pageSize: 5000,
      });

      const searchCall = esClient.search.mock.calls[0][0] as Record<string, unknown>;
      expect(searchCall.size).toBe(1000);
    });

    it('excludes hits with missing _source', async () => {
      esClient.search.mockResolvedValueOnce({
        hits: { hits: [{ _source: undefined }] },
      } as never);

      const result = await riskScoreDataClient.getRiskScoreHistory(defaultParams);

      expect(result).toEqual([]);
    });

    it('uses shared RISK_SCORE_HISTORY_PAGE_SIZE_MAX constant for cap', async () => {
      esClient.search.mockResolvedValueOnce({ hits: { hits: [] } } as never);

      await riskScoreDataClient.getRiskScoreHistory({
        ...defaultParams,
        pageSize: 500,
      });

      const searchCall = esClient.search.mock.calls[0][0] as Record<string, unknown>;
      expect(searchCall.size).toBe(500);
    });

    it('uses user entity type for field paths', async () => {
      esClient.search.mockResolvedValueOnce(mockSearchHits([]) as never);

      await riskScoreDataClient.getRiskScoreHistory({
        ...defaultParams,
        entityType: 'user',
        entityId: 'user:alice',
      });

      const searchCall = esClient.search.mock.calls[0][0] as Record<string, unknown>;
      const filters = (searchCall.query as { bool: { filter: Array<Record<string, unknown>> } })
        .bool.filter;

      expect(filters).toEqual(
        expect.arrayContaining([
          { term: { 'user.risk.id_field': 'entity.id' } },
          { term: { 'user.risk.id_value': 'user:alice' } },
        ])
      );
    });

    it('returns empty array when no hits', async () => {
      esClient.search.mockResolvedValueOnce({ hits: { hits: [] } } as never);

      const result = await riskScoreDataClient.getRiskScoreHistory(defaultParams);

      expect(result).toEqual([]);
    });
  });

  describe('getDailyAverageRiskScoreNormSeries', () => {
    const mockAggResponse = (
      buckets: Array<{ key: string; scores: number[] }> = []
    ): { aggregations: { by_entity: { buckets: unknown[] } } } => ({
      aggregations: {
        by_entity: {
          buckets: buckets.map((b) => ({
            key: b.key,
            scores_over_time: {
              buckets: b.scores.map((v) => ({ avg_score: { value: v } })),
            },
          })),
        },
      },
    });

    it('returns an empty map without issuing a query when no entity ids are provided', async () => {
      const result = await riskScoreDataClient.getDailyAverageRiskScoreNormSeries({
        entityType: 'host',
        entityIds: [],
      });

      expect(result.size).toBe(0);
      expect(esClient.search).not.toHaveBeenCalled();
    });

    it('filters on `<entityType>.risk.id_field === "entity.id"` and aggregates by `<entityType>.risk.id_value`', async () => {
      esClient.search.mockResolvedValueOnce(mockAggResponse() as never);

      await riskScoreDataClient.getDailyAverageRiskScoreNormSeries({
        entityType: 'host',
        entityIds: ['host:InnoDB'],
      });

      const searchCall = esClient.search.mock.calls[0][0] as Record<string, unknown>;
      const filters = (searchCall.query as { bool: { filter: Array<Record<string, unknown>> } })
        .bool.filter;

      expect(filters).toEqual(
        expect.arrayContaining([
          { term: { 'host.risk.id_field': 'entity.id' } },
          { terms: { 'host.risk.id_value': ['host:InnoDB'] } },
        ])
      );

      const aggs = searchCall.aggs as { by_entity: { terms: { field: string } } };
      expect(aggs.by_entity.terms.field).toBe('host.risk.id_value');

      // Sanity: name-based filtering and aggregation are forbidden under the new contract.
      const body = JSON.stringify(searchCall);
      expect(body).not.toContain('"host.name"');
      expect(body).not.toContain('"user.name"');
    });

    it('parameterises the field paths by entityType (user)', async () => {
      esClient.search.mockResolvedValueOnce(mockAggResponse() as never);

      await riskScoreDataClient.getDailyAverageRiskScoreNormSeries({
        entityType: 'user',
        entityIds: ['user:alice'],
      });

      const searchCall = esClient.search.mock.calls[0][0] as Record<string, unknown>;
      const filters = (searchCall.query as { bool: { filter: Array<Record<string, unknown>> } })
        .bool.filter;

      expect(filters).toEqual(
        expect.arrayContaining([
          { term: { 'user.risk.id_field': 'entity.id' } },
          { terms: { 'user.risk.id_value': ['user:alice'] } },
        ])
      );

      const aggs = searchCall.aggs as { by_entity: { terms: { field: string } } };
      expect(aggs.by_entity.terms.field).toBe('user.risk.id_value');
    });

    it('returns a map keyed by EUID directly, not by `${entityType}:${euid}`', async () => {
      esClient.search.mockResolvedValueOnce(
        mockAggResponse([{ key: 'host:InnoDB', scores: [50, 60, 70] }]) as never
      );

      const result = await riskScoreDataClient.getDailyAverageRiskScoreNormSeries({
        entityType: 'host',
        entityIds: ['host:InnoDB'],
      });

      expect(Array.from(result.keys())).toEqual(['host:InnoDB']);
      expect(result.get('host:InnoDB')).toEqual([50, 60, 70]);
    });

    it('returns V2-written documents (`<entityType>.risk.id_field === "entity.id"`)', async () => {
      esClient.search.mockResolvedValueOnce(
        mockAggResponse([{ key: 'host:InnoDB', scores: [42] }]) as never
      );

      const result = await riskScoreDataClient.getDailyAverageRiskScoreNormSeries({
        entityType: 'host',
        entityIds: ['host:InnoDB'],
      });

      expect(result.get('host:InnoDB')).toEqual([42]);
    });

    it('excludes legacy-written documents — the `id_field === "entity.id"` filter eliminates raw-name docs', async () => {
      // Simulate Elasticsearch's perspective: the legacy doc has
      // host.risk.id_field === 'host.name', so the filter rejects it at the query
      // level and the response contains no bucket for it.
      esClient.search.mockResolvedValueOnce(mockAggResponse([]) as never);

      const result = await riskScoreDataClient.getDailyAverageRiskScoreNormSeries({
        entityType: 'host',
        entityIds: ['host:InnoDB'],
      });

      expect(result.size).toBe(0);
    });
  });
});

const assertComponentTemplate = (namespace: string) => {
  expect(createOrUpdateComponentTemplate).toHaveBeenCalledWith(
    expect.objectContaining({
      logger,
      esClient,
      template: expect.objectContaining({
        name: `.risk-score-mappings-${namespace}`,
        _meta: {
          managed: true,
        },
      }),
      totalFieldsLimit: 1000,
    })
  );
};

const assertIndexTemplate = (namespace: string) => {
  expect(createOrUpdateIndexTemplate).toHaveBeenCalledWith({
    logger,
    esClient,
    template: expect.objectContaining({
      name: `.risk-score.risk-score-${namespace}-index-template`,
      data_stream: { hidden: true },
      index_patterns: [`risk-score.risk-score-${namespace}`],
      composed_of: [`.risk-score-mappings-${namespace}`],
    }),
  });
};

const assertDataStream = (namespace: string) => {
  expect(createDataStream).toHaveBeenCalledWith({
    logger,
    esClient,
    totalFieldsLimit,
    indexPatterns: {
      template: `.risk-score.risk-score-${namespace}-index-template`,
      alias: `risk-score.risk-score-${namespace}`,
    },
  });
};

const assertIndex = (namespace: string) => {
  expect(createOrUpdateIndex).toHaveBeenCalledWith({
    logger,
    esClient,
    options: {
      index: `risk-score.risk-score-latest-${namespace}`,
      mappings: {
        dynamic: false,
        properties: {
          '@timestamp': {
            ignore_malformed: false,
            type: 'date',
          },
          event: {
            properties: {
              ingested: {
                type: 'date',
              },
            },
          },
          host: {
            properties: {
              name: {
                type: 'keyword',
              },
              risk: {
                properties: {
                  calculated_level: {
                    type: 'keyword',
                  },
                  calculated_score: {
                    type: 'float',
                  },
                  calculated_score_norm: {
                    type: 'float',
                  },
                  category_1_count: {
                    type: 'long',
                  },
                  category_1_score: {
                    type: 'float',
                  },
                  modifiers: {
                    properties: {
                      contribution: {
                        type: 'float',
                      },
                      metadata: {
                        type: 'flattened',
                      },
                      modifier_value: {
                        type: 'float',
                      },
                      subtype: {
                        type: 'keyword',
                      },
                      type: {
                        type: 'keyword',
                      },
                    },
                    type: 'object',
                  },
                  id_field: {
                    type: 'keyword',
                  },
                  id_value: {
                    type: 'keyword',
                  },
                  calculation_run_id: {
                    type: 'keyword',
                  },
                  score_type: {
                    type: 'keyword',
                  },
                  notes: {
                    type: 'keyword',
                  },
                  related_entities: {
                    type: 'object',
                    properties: {
                      entity_id: {
                        type: 'keyword',
                      },
                      relationship_type: {
                        type: 'keyword',
                      },
                    },
                  },
                  inputs: {
                    properties: {
                      id: {
                        type: 'keyword',
                      },
                      index: {
                        type: 'keyword',
                      },
                      category: {
                        type: 'keyword',
                      },
                      description: {
                        type: 'keyword',
                      },
                      risk_score: {
                        type: 'float',
                      },
                      timestamp: {
                        type: 'date',
                      },
                    },
                    type: 'object',
                  },
                },
                type: 'object',
              },
            },
          },
          service: {
            properties: {
              name: {
                type: 'keyword',
              },
              risk: {
                properties: {
                  calculated_level: {
                    type: 'keyword',
                  },
                  calculated_score: {
                    type: 'float',
                  },
                  calculated_score_norm: {
                    type: 'float',
                  },
                  category_1_count: {
                    type: 'long',
                  },
                  category_1_score: {
                    type: 'float',
                  },
                  modifiers: {
                    properties: {
                      contribution: {
                        type: 'float',
                      },
                      metadata: {
                        type: 'flattened',
                      },
                      modifier_value: {
                        type: 'float',
                      },
                      subtype: {
                        type: 'keyword',
                      },
                      type: {
                        type: 'keyword',
                      },
                    },
                    type: 'object',
                  },
                  id_field: {
                    type: 'keyword',
                  },
                  id_value: {
                    type: 'keyword',
                  },
                  calculation_run_id: {
                    type: 'keyword',
                  },
                  score_type: {
                    type: 'keyword',
                  },
                  inputs: {
                    properties: {
                      category: {
                        type: 'keyword',
                      },
                      description: {
                        type: 'keyword',
                      },
                      id: {
                        type: 'keyword',
                      },
                      index: {
                        type: 'keyword',
                      },
                      risk_score: {
                        type: 'float',
                      },
                      timestamp: {
                        type: 'date',
                      },
                    },
                    type: 'object',
                  },
                  notes: {
                    type: 'keyword',
                  },
                  related_entities: {
                    type: 'object',
                    properties: {
                      entity_id: {
                        type: 'keyword',
                      },
                      relationship_type: {
                        type: 'keyword',
                      },
                    },
                  },
                },
                type: 'object',
              },
            },
          },
          user: {
            properties: {
              name: {
                type: 'keyword',
              },
              risk: {
                properties: {
                  calculated_level: {
                    type: 'keyword',
                  },
                  calculated_score: {
                    type: 'float',
                  },
                  calculated_score_norm: {
                    type: 'float',
                  },
                  category_1_count: {
                    type: 'long',
                  },
                  category_1_score: {
                    type: 'float',
                  },
                  modifiers: {
                    properties: {
                      contribution: {
                        type: 'float',
                      },
                      metadata: {
                        type: 'flattened',
                      },
                      modifier_value: {
                        type: 'float',
                      },
                      subtype: {
                        type: 'keyword',
                      },
                      type: {
                        type: 'keyword',
                      },
                    },
                    type: 'object',
                  },
                  id_field: {
                    type: 'keyword',
                  },
                  id_value: {
                    type: 'keyword',
                  },
                  calculation_run_id: {
                    type: 'keyword',
                  },
                  score_type: {
                    type: 'keyword',
                  },
                  notes: {
                    type: 'keyword',
                  },
                  related_entities: {
                    type: 'object',
                    properties: {
                      entity_id: {
                        type: 'keyword',
                      },
                      relationship_type: {
                        type: 'keyword',
                      },
                    },
                  },
                  inputs: {
                    properties: {
                      id: {
                        type: 'keyword',
                      },
                      index: {
                        type: 'keyword',
                      },
                      category: {
                        type: 'keyword',
                      },
                      description: {
                        type: 'keyword',
                      },
                      risk_score: {
                        type: 'float',
                      },
                      timestamp: {
                        type: 'date',
                      },
                    },
                    type: 'object',
                  },
                },
                type: 'object',
              },
            },
          },
        },
      },
      settings: {
        'index.default_pipeline': null,
      },
    },
  });
};

const assertTransform = (namespace: string) => {
  expect(transforms.createTransform).toHaveBeenCalledWith({
    logger,
    esClient,
    transform: {
      dest: {
        index: `risk-score.risk-score-latest-${namespace}`,
      },
      frequency: '1h',
      latest: {
        sort: '@timestamp',
        unique_key: ['host.name', 'user.name', 'service.name'],
      },
      source: {
        index: [`risk-score.risk-score-${namespace}`],
        query: {
          bool: {
            filter: [
              {
                range: {
                  '@timestamp': {
                    gte: 'now-24h',
                  },
                },
              },
            ],
          },
        },
      },
      sync: {
        time: {
          delay: '0s',
          field: '@timestamp',
        },
      },
      transform_id: transforms.getLatestTransformId(namespace),
      settings: {
        unattended: true,
      },
      _meta: {
        version: 3,
        managed: true,
        managed_by: 'security-entity-analytics',
        space_id: namespace,
      },
    },
  });
};
