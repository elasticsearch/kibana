/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  elasticsearchServiceMock,
  loggingSystemMock,
  savedObjectsClientMock,
} from '@kbn/core/server/mocks';
import { createEntitySourcesService } from './entity_sources_service';

jest.mock('../management/watchlist_config');
jest.mock('./infra/entity_source_client');
jest.mock('../entities/service');
jest.mock('./sync/index_sync');
jest.mock('../entities/utils');
jest.mock('./bulk/soft_delete');
jest.mock('@kbn/security-plugin/server/authentication/api_keys/fake_kibana_request', () => ({
  getFakeKibanaRequest: jest.fn().mockReturnValue({ fakeRequest: true }),
}));

const { mockListEntitySources } = jest.requireMock('./infra/entity_source_client') as {
  mockListEntitySources: jest.Mock;
};

const { mockWatchlistGet, mockGetEntitySourceIds, mockWatchlistList } = jest.requireMock(
  '../management/watchlist_config'
) as {
  mockWatchlistGet: jest.Mock;
  mockGetEntitySourceIds: jest.Mock;
  mockWatchlistList: jest.Mock;
};

const { mockListEntityStoreEntities } = jest.requireMock('../entities/service') as {
  mockListEntityStoreEntities: jest.Mock;
};

const { mockPlainIndexSync, mockCreateIndexSyncService } = jest.requireMock(
  './sync/index_sync'
) as {
  mockPlainIndexSync: jest.Mock;
  mockCreateIndexSyncService: jest.Mock;
};

const { mockGetIndexForWatchlist } = jest.requireMock('../entities/utils') as {
  mockGetIndexForWatchlist: jest.Mock;
};

const { applyBulkRemoveSource: mockApplyBulkRemoveSource } = jest.requireMock(
  './bulk/soft_delete'
) as {
  applyBulkRemoveSource: jest.Mock;
};

describe('createEntitySourcesService', () => {
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  const soClient = savedObjectsClientMock.create();
  const logger = loggingSystemMock.createLogger();
  const namespace = 'default';
  const mockGetStartServices = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStartServices.mockResolvedValue([
      { elasticsearch: { client: {} } },
      { encryptedSavedObjects: undefined },
    ]);

    mockWatchlistGet.mockResolvedValue({ name: 'VIP Users' });
    mockGetEntitySourceIds.mockResolvedValue(['source-a', 'source-c']);
    mockListEntitySources.mockResolvedValue({
      sources: [
        {
          id: 'source-a',
          type: 'index',
          identifierField: 'user.id',
        },
        {
          id: 'source-b',
          type: 'integration',
          integrationName: 'entityanalytics_ad',
        },
        {
          id: 'source-c',
          type: 'integration',
          integrationName: 'entityanalytics_okta',
        },
      ],
    });
    mockListEntityStoreEntities
      .mockImplementationOnce(async function* () {
        yield {
          entityIdsByType: { user: ['user:1'], host: [], service: [], generic: [] },
          correlationMap: new Map(),
          watchlistsByEuid: new Map(),
          maxEntityId: 'user:1',
        };
      })
      .mockImplementationOnce(async function* () {
        yield {
          entityIdsByType: { user: ['user:2'], host: ['host:1'], service: [], generic: [] },
          watchlistsByEuid: new Map(),
          maxEntityId: 'user:2',
        };
      });
    mockPlainIndexSync.mockResolvedValue(undefined);
    mockGetIndexForWatchlist.mockReturnValue('.lists-watchlist-vip-users-default');
  });

  it('syncs integration sources and skips index sources that have no stored API key', async () => {
    const service = createEntitySourcesService({
      esClient,
      soClient,
      logger,
      namespace,
      getStartServices: mockGetStartServices as never,
      hasEncryptionKey: true,
    });

    await service.syncWatchlist('watchlist-1');

    expect(mockWatchlistGet).toHaveBeenCalledWith('watchlist-1');
    expect(mockGetEntitySourceIds).toHaveBeenCalledWith('watchlist-1');
    expect(mockListEntitySources).toHaveBeenCalledWith({});
    expect(mockGetIndexForWatchlist).toHaveBeenCalledWith(namespace);

    // source-a (index) is skipped — no API key. source-c (integration) syncs.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Skipping index source source-a: no API key stored')
    );
    expect(mockListEntityStoreEntities).toHaveBeenCalledTimes(1);
    expect(mockListEntityStoreEntities).toHaveBeenCalledWith({
      type: 'integration',
      name: 'entityanalytics_okta',
    });

    // source-c gets one page call + one tail call
    expect(mockPlainIndexSync).toHaveBeenCalledTimes(2);
    expect(mockPlainIndexSync).toHaveBeenCalledWith([
      expect.objectContaining({
        source: expect.objectContaining({ id: 'source-c' }),
        entityStoreEntityIdsByType: { user: ['user:1'], host: [], service: [], generic: [] },
        watchlistsByEuid: expect.any(Map),
        pageRange: expect.objectContaining({ lte: expect.any(String) }),
      }),
    ]);
    expect(mockPlainIndexSync).toHaveBeenCalledWith([
      expect.objectContaining({
        source: expect.objectContaining({ id: 'source-c' }),
        entityStoreEntityIdsByType: { user: [], host: [], service: [], generic: [] },
      }),
    ]);

    expect(logger.info).toHaveBeenCalledWith(
      '[WatchlistSync] Completed sync for watchlist watchlist-1 (VIP Users)'
    );
  });

  it('uses a scoped ES client for an index source when an API key is stored', async () => {
    const mockDataEsClient = elasticsearchServiceMock.createElasticsearchClient();
    const mockCoreElasticsearchClient = {
      asScoped: jest.fn().mockReturnValue({ asCurrentUser: mockDataEsClient }),
    };
    const mockEsoClientGet = jest.fn().mockResolvedValue({
      attributes: { apiKeyId: 'key-id', apiKey: 'key-secret' },
    });
    const mockEncryptedSavedObjects = {
      getClient: () => ({ getDecryptedAsInternalUser: mockEsoClientGet }),
    };

    const getStartServices = jest
      .fn()
      .mockResolvedValue([
        { elasticsearch: { client: mockCoreElasticsearchClient } },
        { encryptedSavedObjects: mockEncryptedSavedObjects },
      ]);

    const service = createEntitySourcesService({
      esClient,
      soClient,
      logger,
      namespace,
      getStartServices: getStartServices as never,
      hasEncryptionKey: true,
    });

    await service.syncWatchlist('watchlist-1');

    // source-a (index) should be synced via the scoped client
    expect(mockCreateIndexSyncService).toHaveBeenCalledWith(
      expect.objectContaining({
        internalEsClient: esClient,
        dataEsClient: mockDataEsClient,
      })
    );
    // source-c (integration) uses the plain esClient for both
    expect(mockCreateIndexSyncService).toHaveBeenCalledWith(
      expect.objectContaining({
        internalEsClient: esClient,
        dataEsClient: esClient,
      })
    );
  });

  describe('syncAllWatchlists', () => {
    const createService = () =>
      createEntitySourcesService({
        esClient,
        soClient,
        logger,
        namespace,
        getStartServices: mockGetStartServices as never,
        hasEncryptionKey: true,
      });

    it('syncs each watchlist returned by list', async () => {
      mockWatchlistList.mockResolvedValue([
        { id: 'wl-1', name: 'VIP Users' },
        { id: 'wl-2', name: 'Privileged Hosts' },
      ]);

      const service = createService();
      // Stub syncWatchlist indirectly via the mocks it calls
      mockWatchlistGet.mockResolvedValue({ name: 'stub' });
      mockGetEntitySourceIds.mockResolvedValue([]);
      mockListEntitySources.mockResolvedValue({ sources: [] });

      await service.syncAllWatchlists();

      expect(mockWatchlistList).toHaveBeenCalledTimes(1);
      // syncWatchlist is called once per watchlist — get is the first call it makes
      expect(mockWatchlistGet).toHaveBeenCalledTimes(2);
      expect(mockWatchlistGet).toHaveBeenCalledWith('wl-1');
      expect(mockWatchlistGet).toHaveBeenCalledWith('wl-2');
    });

    it('skips sync and logs debug when no watchlists exist', async () => {
      mockWatchlistList.mockResolvedValue([]);

      const service = createService();
      await service.syncAllWatchlists();

      expect(logger.debug).toHaveBeenCalledWith(
        'No watchlists found for namespace "default". Skipping sync.'
      );
      expect(mockWatchlistGet).not.toHaveBeenCalled();
    });

    it('filters out watchlists without an id', async () => {
      mockWatchlistList.mockResolvedValue([
        { id: 'wl-1', name: 'VIP Users' },
        { id: undefined, name: 'No ID' },
        { name: 'Also No ID' },
      ]);

      const service = createService();
      mockWatchlistGet.mockResolvedValue({ name: 'stub' });
      mockGetEntitySourceIds.mockResolvedValue([]);
      mockListEntitySources.mockResolvedValue({ sources: [] });

      await service.syncAllWatchlists();

      expect(mockWatchlistGet).toHaveBeenCalledTimes(1);
      expect(mockWatchlistGet).toHaveBeenCalledWith('wl-1');
    });

    it('cleans up orphaned entities when no sources are linked', async () => {
      mockWatchlistList.mockResolvedValue([{ id: 'wl-1', name: 'Cleaned' }]);

      const service = createService();
      mockWatchlistGet.mockResolvedValue({ name: 'Cleaned', id: 'wl-1' });
      mockGetEntitySourceIds.mockResolvedValue([]);
      mockListEntitySources.mockResolvedValue({ sources: [] });

      // Mock: aggregation returns one orphaned source ID (not csv)
      esClient.search
        .mockResolvedValueOnce({
          aggregations: {
            source_ids: {
              buckets: [
                { key: 'orphaned-source-1', doc_count: 3 },
                { key: 'csv', doc_count: 2 },
              ],
            },
          },
        } as never)
        // Mock: buildWatchlistsByEuid — first search returns euids
        .mockResolvedValueOnce({
          hits: { hits: [{ _source: { entity: { id: 'user:alice' } } }] },
        } as never)
        // Mock: buildWatchlistsByEuid — entity store query for watchlist memberships
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _source: {
                  entity: { id: 'user:alice', attributes: { watchlists: ['wl-1'] } },
                },
              },
            ],
          },
        } as never)
        // Mock: findEntitiesBySource — paginated search for stale entities
        .mockResolvedValueOnce({
          hits: { hits: [{ _id: 'user:alice:doc1' }] },
        } as never);

      await service.syncAllWatchlists();

      expect(mockApplyBulkRemoveSource).toHaveBeenCalledWith(
        expect.objectContaining({
          staleEntities: [{ docId: 'user:alice:doc1', sourceId: 'orphaned-source-1' }],
        })
      );
      // no active sources so plainIndexSync is never called
      expect(mockPlainIndexSync).not.toHaveBeenCalled();
    });

    it('continues syncing remaining watchlists when one fails', async () => {
      mockWatchlistList.mockResolvedValue([
        { id: 'wl-1', name: 'Failing' },
        { id: 'wl-2', name: 'Succeeding' },
      ]);

      const service = createService();
      mockWatchlistGet
        .mockRejectedValueOnce(new Error('get failed'))
        .mockResolvedValueOnce({ name: 'Succeeding' });
      mockGetEntitySourceIds.mockResolvedValue([]);
      mockListEntitySources.mockResolvedValue({ sources: [] });

      await service.syncAllWatchlists();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to sync watchlist "Failing" (wl-1): get failed')
      );
      // Second watchlist still synced
      expect(mockWatchlistGet).toHaveBeenCalledWith('wl-2');
    });

    it('stops syncing remaining watchlists when abort signal fires between iterations', async () => {
      mockWatchlistList.mockResolvedValue([
        { id: 'wl-1', name: 'First' },
        { id: 'wl-2', name: 'Second' },
      ]);

      const controller = new AbortController();
      const service = createService();

      // Abort after the first watchlist completes
      mockWatchlistGet.mockImplementationOnce(async () => {
        controller.abort();
        return { name: 'First' };
      });
      mockGetEntitySourceIds.mockResolvedValue([]);
      mockListEntitySources.mockResolvedValue({ sources: [] });

      await service.syncAllWatchlists({ abortSignal: controller.signal });

      expect(mockWatchlistGet).toHaveBeenCalledTimes(1);
      expect(mockWatchlistGet).toHaveBeenCalledWith('wl-1');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Abort signal received: stopping watchlist sync')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Watchlist sync for namespace "default" stopped (abort) before all 2 watchlist(s) were processed'
        )
      );
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringMatching(/Completed sync of 2 watchlist/)
      );
    });

    it('does not sync any watchlists when abort signal is already fired', async () => {
      mockWatchlistList.mockResolvedValue([{ id: 'wl-1', name: 'VIP Users' }]);

      const controller = new AbortController();
      controller.abort();

      const service = createService();
      await service.syncAllWatchlists({ abortSignal: controller.signal });

      expect(mockWatchlistGet).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Watchlist sync for namespace "default" stopped (abort) before all 1 watchlist(s) were processed'
        )
      );
    });
  });

  describe('syncWatchlist abort handling', () => {
    const createService = () =>
      createEntitySourcesService({
        esClient,
        soClient,
        logger,
        namespace,
        getStartServices: mockGetStartServices as never,
        hasEncryptionKey: true,
      });

    it('skips cleanup when abort signal fires after plainIndexSync', async () => {
      const controller = new AbortController();

      // Need one active source so the paginated loop calls plainIndexSync at least once
      mockGetEntitySourceIds.mockResolvedValue(['source-c']);
      mockListEntitySources.mockResolvedValue({
        sources: [{ id: 'source-c', type: 'integration', integrationName: 'entityanalytics_okta' }],
      });
      mockListEntityStoreEntities.mockImplementationOnce(async function* () {
        yield {
          entityIdsByType: { user: ['user:1'], host: [], service: [], generic: [] },
          correlationMap: new Map(),
          watchlistsByEuid: new Map(),
          maxEntityId: 'user:1',
        };
      });

      // Abort mid-way through syncWatchlist, after plainIndexSync runs
      mockPlainIndexSync.mockImplementation(async () => {
        controller.abort();
      });

      const service = createService();
      await service.syncWatchlist('watchlist-1', controller.signal);

      // First page pass calls plainIndexSync; abort fires so tail pass is skipped
      expect(mockPlainIndexSync).toHaveBeenCalledTimes(1);
      // cleanupOrphanedEntities triggers an esClient.search for orphaned source agg —
      // it should not be called after abort
      expect(esClient.search).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Abort signal received: after index sync for watchlist watchlist-1, skipping cleanup'
        )
      );
    });
  });
});
