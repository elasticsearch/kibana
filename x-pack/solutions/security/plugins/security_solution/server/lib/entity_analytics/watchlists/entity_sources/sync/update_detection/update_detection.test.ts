/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SearchRequest } from '@elastic/elasticsearch/lib/api/types';
import {
  elasticsearchServiceMock,
  loggingSystemMock,
  savedObjectsClientMock,
} from '@kbn/core/server/mocks';
import type { CRUDClient } from '@kbn/entity-store/server/domain/crud/crud_client';
import { createUpdateDetectionService } from './update_detection';
import type { WatchlistDataSources } from '../../../../../../../common/api/entity_analytics';
import type { EntityStoreEntityIdsByType, WatchlistsByEuid } from '../../../entities/service';
import type { CorrelationMap } from '../../../entities/types';

const emptyWatchlistsByEuid: WatchlistsByEuid = new Map();

const createMockCrudClient = (): jest.Mocked<CRUDClient> =>
  ({
    searchLatestEntities: jest
      .fn()
      .mockResolvedValue({ records: [], total: 0, inspect: { dsl: [], response: [] } }),
    bulkUpdateEntity: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<CRUDClient>);

jest.mock('../../infra/entity_source_client');

const { WatchlistEntitySourceClient, mockGetLastProcessedMarker, mockUpdateLastProcessedMarker } =
  jest.requireMock('../../infra/entity_source_client') as {
    WatchlistEntitySourceClient: jest.Mock;
    mockGetLastProcessedMarker: jest.Mock;
    mockUpdateLastProcessedMarker: jest.Mock;
  };

type CapturedSearchRequest = SearchRequest & {
  aggs?: {
    entities?: {
      aggs?: {
        latest_doc?: unknown;
      };
    };
  };
  query?: {
    bool?: {
      must?: unknown[];
    };
  };
};

const indexSource: WatchlistDataSources.MonitoringEntitySource = {
  id: 'index-source-1',
  type: 'index',
  name: 'test-index',
  indexPattern: 'logs-*',
  identifierField: 'user.name',
  enabled: true,
  range: { start: 'now-10d', end: 'now' },
};

const integrationSource: WatchlistDataSources.MonitoringEntitySource = {
  id: 'integration-source-1',
  type: 'entity_analytics_integration',
  name: 'test-integration',
  indexPattern: 'logs-entityanalytics_okta.user-default',
  integrationName: 'entityanalytics_okta',
  enabled: true,
};

const createEntityStoreEntityIdsByType = (
  overrides: Partial<EntityStoreEntityIdsByType> = {}
): EntityStoreEntityIdsByType => ({
  user: [],
  host: [],
  service: [],
  generic: [],
  ...overrides,
});

describe('Watchlist update detection service', () => {
  const createDescriptorClient = () =>
    new WatchlistEntitySourceClient({
      soClient: savedObjectsClientMock.create(),
      namespace: 'default',
    });

  let logger: ReturnType<typeof loggingSystemMock.createLogger>;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = loggingSystemMock.createLogger();
  });

  describe('index source (correlation-based sync)', () => {
    it('queries source index by identifierField and correlation values, then applies bulk upsert', async () => {
      const searchCalls: CapturedSearchRequest[] = [];
      const watchlist = {
        id: 'test-watchlist-id',
        name: 'test-watchlist',
        index: '.watchlist-entities-default',
      };
      const internalEsClient = elasticsearchServiceMock.createElasticsearchClient();
      const dataEsClient = elasticsearchServiceMock.createElasticsearchClient();

      const correlationMap: CorrelationMap = new Map([
        ['jdoe', { euids: ['user:jdoe'], entityType: 'user' as const }],
      ]);

      dataEsClient.search.mockImplementation((params?: SearchRequest) => {
        if (!params) {
          throw new Error('Expected search params');
        }
        searchCalls.push(params as CapturedSearchRequest);
        if (params.index === watchlist.index) {
          return Promise.resolve({ hits: { hits: [] } } as never);
        }
        return Promise.resolve({
          aggregations: {
            identifiers: {
              buckets: [{ key: { identifier: 'jdoe' }, doc_count: 1 }],
              after_key: undefined,
            },
          },
        } as never);
      });
      internalEsClient.bulk.mockResolvedValue({ errors: false } as never);

      const service = createUpdateDetectionService({
        internalEsClient,
        dataEsClient,
        logger,
        crudClient: createMockCrudClient(),
        watchlist,
      });

      await service.updateDetection(
        indexSource,
        createEntityStoreEntityIdsByType({ user: ['user:jdoe'] }),
        correlationMap,
        emptyWatchlistsByEuid
      );

      expect(searchCalls.length).toBeGreaterThan(0);
      const sourceSearchParams = searchCalls[0];
      expect(sourceSearchParams.index).toBe(indexSource.indexPattern);
      expect(sourceSearchParams.query?.bool?.must).toContainEqual({
        terms: { 'user.name': ['jdoe'] },
      });
      expect(sourceSearchParams.query?.bool?.must).toContainEqual({
        range: { '@timestamp': { gte: 'now-10d', lte: 'now' } },
      });
      expect(dataEsClient.search).toHaveBeenCalledWith({
        index: indexSource.indexPattern,
        ...sourceSearchParams,
      });
      expect(internalEsClient.search).not.toHaveBeenCalled();
      expect(internalEsClient.bulk).toHaveBeenCalled();
      expect(dataEsClient.bulk).not.toHaveBeenCalled();
    });

    it('skips sync when correlation map is empty', async () => {
      const internalEsClient = elasticsearchServiceMock.createElasticsearchClient();
      const dataEsClient = elasticsearchServiceMock.createElasticsearchClient();

      const watchlist2 = {
        id: 'test-watchlist-id',
        name: 'test-watchlist',
        index: '.watchlist-entities-default',
      };
      const service = createUpdateDetectionService({
        internalEsClient,
        dataEsClient,
        logger,
        crudClient: createMockCrudClient(),
        watchlist: watchlist2,
      });

      const correlationMap: CorrelationMap = new Map();
      const result = await service.updateDetection(
        indexSource,
        createEntityStoreEntityIdsByType(),
        correlationMap,
        emptyWatchlistsByEuid
      );

      expect(result).toEqual([]);
      expect(dataEsClient.search).not.toHaveBeenCalled();
      expect(internalEsClient.bulk).not.toHaveBeenCalled();
    });

    it('logs warning and returns empty when correlationMap is not provided', async () => {
      const esClient = elasticsearchServiceMock.createElasticsearchClient();

      const watchlist3 = {
        id: 'test-watchlist-id',
        name: 'test-watchlist',
        index: '.watchlist-entities-default',
      };
      const service = createUpdateDetectionService({
        internalEsClient: esClient,
        dataEsClient: esClient,
        logger,
        crudClient: createMockCrudClient(),
        watchlist: watchlist3,
      });

      const result = await service.updateDetection(
        indexSource,
        createEntityStoreEntityIdsByType({ user: ['user:jdoe'] }),
        undefined,
        emptyWatchlistsByEuid
      );

      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('correlationMap not provided')
      );
    });
  });

  describe('integration source without descriptorClient', () => {
    it('logs warning and returns empty array without calling search or bulk', async () => {
      const internalEsClient = elasticsearchServiceMock.createElasticsearchClient();
      const dataEsClient = elasticsearchServiceMock.createElasticsearchClient();

      const watchlist4 = {
        id: 'test-watchlist-id',
        name: 'test-watchlist',
        index: '.watchlist-entities-default',
      };
      const service = createUpdateDetectionService({
        internalEsClient,
        dataEsClient,
        logger,
        crudClient: createMockCrudClient(),
        watchlist: watchlist4,
      });

      const result = await service.updateDetection(
        integrationSource,
        createEntityStoreEntityIdsByType({ user: ['user:jdoe'] }),
        undefined,
        emptyWatchlistsByEuid
      );

      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('descriptorClient not available')
      );
      expect(dataEsClient.search).not.toHaveBeenCalled();
      expect(internalEsClient.bulk).not.toHaveBeenCalled();
    });
  });

  describe('integration source with descriptorClient', () => {
    it('fetches sync marker, uses it in search, and updates marker after processing', async () => {
      const syncMarker = '2024-01-01T00:00:00Z';
      const descriptorClient = createDescriptorClient();
      mockGetLastProcessedMarker.mockResolvedValue(syncMarker);
      mockUpdateLastProcessedMarker.mockResolvedValue(undefined);

      const searchCalls: CapturedSearchRequest[] = [];
      const internalEsClient = elasticsearchServiceMock.createElasticsearchClient();
      const dataEsClient = elasticsearchServiceMock.createElasticsearchClient();
      dataEsClient.search.mockImplementation((params?: SearchRequest) => {
        if (!params) {
          throw new Error('Expected search params');
        }
        searchCalls.push(params as CapturedSearchRequest);
        return Promise.resolve({
          aggregations: {
            entities: {
              buckets: [],
              after_key: undefined,
            },
          },
        } as never);
      });
      internalEsClient.bulk.mockResolvedValue({ errors: false } as never);

      const watchlist5 = {
        id: 'test-watchlist-id',
        name: 'test-watchlist',
        index: '.watchlist-entities-default',
      };
      const service = createUpdateDetectionService({
        internalEsClient,
        dataEsClient,
        logger,
        descriptorClient,
        crudClient: createMockCrudClient(),
        watchlist: watchlist5,
      });

      await service.updateDetection(
        integrationSource,
        createEntityStoreEntityIdsByType({ user: ['user:jdoe'] }),
        undefined,
        emptyWatchlistsByEuid
      );

      expect(mockGetLastProcessedMarker).toHaveBeenCalledWith(integrationSource);
      expect(searchCalls.length).toBeGreaterThan(0);
      const firstSearchParams = searchCalls[0];
      expect(firstSearchParams.query?.bool?.must).toContainEqual({
        terms: { euid: ['user:jdoe'] },
      });
      expect(firstSearchParams.query?.bool?.must).toContainEqual({
        range: { '@timestamp': { gte: syncMarker, lte: 'now' } },
      });
      expect(firstSearchParams.aggs?.entities?.aggs?.latest_doc).toBeDefined();
      expect(mockUpdateLastProcessedMarker).not.toHaveBeenCalled();
    });

    it('updates sync marker when maxTimestamp is extracted from buckets', async () => {
      const syncMarker = '2024-01-01T00:00:00Z';
      const maxTimestamp = '2024-01-15T12:00:00Z';
      const descriptorClient = createDescriptorClient();
      mockGetLastProcessedMarker.mockResolvedValue(syncMarker);
      mockUpdateLastProcessedMarker.mockResolvedValue(undefined);

      const targetIndex = '.watchlist-entities-default';
      const internalEsClient = elasticsearchServiceMock.createElasticsearchClient();
      const dataEsClient = elasticsearchServiceMock.createElasticsearchClient();
      dataEsClient.search.mockImplementation((params?: SearchRequest) => {
        if (!params) {
          throw new Error('Expected search params');
        }
        if (params.index === targetIndex) {
          return Promise.resolve({ hits: { hits: [] } } as never);
        }
        return Promise.resolve({
          aggregations: {
            entities: {
              buckets: [
                {
                  key: { euid: 'user:jdoe' },
                  latest_doc: {
                    hits: {
                      hits: [{ _source: { '@timestamp': maxTimestamp, 'user.name': 'jdoe' } }],
                    },
                  },
                },
              ],
              after_key: undefined,
            },
          },
        } as never);
      });
      internalEsClient.bulk.mockResolvedValue({ errors: false } as never);

      const watchlist6 = {
        id: 'test-watchlist-id',
        name: 'test-watchlist',
        index: '.watchlist-entities-default',
      };
      const service = createUpdateDetectionService({
        internalEsClient,
        dataEsClient,
        logger,
        descriptorClient,
        crudClient: createMockCrudClient(),
        watchlist: watchlist6,
      });

      await service.updateDetection(
        integrationSource,
        createEntityStoreEntityIdsByType({ user: ['user:jdoe'] }),
        undefined,
        emptyWatchlistsByEuid
      );

      expect(mockUpdateLastProcessedMarker).toHaveBeenCalledWith(integrationSource, maxTimestamp);
    });
  });
});
