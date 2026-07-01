/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { ISavedObjectsRepository } from '@kbn/core-saved-objects-api-server';
import { createSmlCrawlerStateStorage } from './sml_crawler_state_storage';
import { createSmlStorage } from './sml_storage';
import { SmlCrawlerImpl } from './sml_crawler';
import type { SmlTypeDefinition, SmlListItem } from './types';

jest.mock('./sml_crawler_state_storage', () => {
  const client = {
    search: jest.fn(),
    bulk: jest.fn().mockResolvedValue({ errors: false, items: [] }),
    delete: jest.fn().mockResolvedValue({}),
    index: jest.fn().mockResolvedValue({}),
  };
  return {
    smlCrawlerStateIndexName: '.test-sml-crawler-state',
    createSmlCrawlerStateStorage: jest.fn().mockReturnValue({
      getClient: jest.fn().mockReturnValue(client),
    }),
  };
});

const EXPECTED_SCHEMA_VERSION = 'current-schema-hash';

jest.mock('@kbn/storage-adapter', () => ({
  getSchemaVersion: jest.fn().mockReturnValue(EXPECTED_SCHEMA_VERSION),
}));

jest.mock('./sml_storage', () => ({
  smlIndexName: '.test-sml-data',
  storageSettings: { name: '.test-sml-data', schema: { properties: {} } },
  createSmlStorage: jest.fn(),
}));

jest.mock('@kbn/es-errors', () => ({
  isResponseError: jest.fn(
    (error: unknown) => typeof (error as { statusCode?: unknown })?.statusCode === 'number'
  ),
}));

const mockUpdateMappingsIfNeeded = jest.fn();

const mockSmlClient = {
  clean: jest.fn().mockResolvedValue({ acknowledged: true }),
  existsIndex: jest.fn().mockResolvedValue(false),
  reconcileMappings: mockUpdateMappingsIfNeeded,
};

const getMockSmlClient = () => mockSmlClient;

const getMockStateClient = () =>
  (createSmlCrawlerStateStorage as jest.Mock)({ logger: {}, esClient: {} }).getClient();

async function* yieldPages(...pages: SmlListItem[][]): AsyncIterable<SmlListItem[]> {
  for (const page of pages) {
    yield page;
  }
}

const createMockDefinition = (overrides: Partial<SmlTypeDefinition> = {}): SmlTypeDefinition => ({
  id: 'test-type',
  list: jest.fn().mockReturnValue(yieldPages()),
  getSmlData: jest.fn().mockResolvedValue({ chunks: [] }),
  toAttachment: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const mockIndexer = {
  indexAttachment: jest.fn().mockResolvedValue(undefined),
  deleteAttachment: jest.fn().mockResolvedValue(undefined),
  deleteChunks: jest.fn().mockResolvedValue(undefined),
};

const createMockLogger = () => {
  const log = loggerMock.create();
  log.get = jest.fn().mockReturnValue(log);
  return log;
};

const createMockEsClient = (): jest.Mocked<ElasticsearchClient> => {
  const indices = {
    exists: jest.fn().mockResolvedValue(false),
    existsAlias: jest.fn().mockResolvedValue(false),
    delete: jest.fn().mockResolvedValue({ acknowledged: true }),
    deleteIndexTemplate: jest.fn().mockResolvedValue({ acknowledged: true }),
    get: jest.fn().mockResolvedValue({}),
    getMapping: jest.fn().mockResolvedValue({
      '.test-sml-data-000001': {
        mappings: { _meta: { version: EXPECTED_SCHEMA_VERSION } },
      },
    }),
  };
  return {
    indices,
    count: jest.fn().mockResolvedValue({ count: 0 }),
    // findManualOriginIds (in sml_crawler.ts) calls search on the SML data index.
    // Default: no manual entries for any origin id.
    search: jest.fn().mockResolvedValue({ hits: { hits: [] } }),
  } as unknown as jest.Mocked<ElasticsearchClient>;
};

const createMockSavedObjectsClient = (): jest.Mocked<ISavedObjectsRepository> =>
  ({} as jest.Mocked<ISavedObjectsRepository>);

describe('SmlCrawlerImpl', () => {
  let logger: ReturnType<typeof createMockLogger>;
  let esClient: jest.Mocked<ElasticsearchClient>;
  let savedObjectsClient: jest.Mocked<ISavedObjectsRepository>;
  let mockStateClient: ReturnType<typeof getMockStateClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = createMockLogger();
    esClient = createMockEsClient();
    savedObjectsClient = createMockSavedObjectsClient();
    mockStateClient = getMockStateClient();
    mockStateClient.search.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });
    mockStateClient.bulk.mockResolvedValue({ errors: false, items: [] });
    mockSmlClient.existsIndex.mockResolvedValue(false);
    mockSmlClient.clean.mockResolvedValue({ acknowledged: true });
    mockUpdateMappingsIfNeeded.mockResolvedValue(undefined);
    (createSmlStorage as jest.Mock).mockReturnValue({
      getClient: jest.fn().mockReturnValue(getMockSmlClient()),
    });
  });

  describe('new items detected', () => {
    it('when list yields items not in state, writes state docs with update_action create', async () => {
      const items = [{ id: 'a', updatedAt: '2024-01-01', spaces: ['default'] }];
      const definition = createMockDefinition({
        list: jest.fn().mockReturnValue(yieldPages(items)),
      });
      // countStateDocs returns 0 (no prior state)
      // batchLookupState returns empty (item is new)
      // sweepStaleState returns empty (nothing stale)
      mockStateClient.search.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      expect(mockStateClient.bulk).toHaveBeenCalled();
      const bulkCall = mockStateClient.bulk.mock.calls.find((c: unknown[]) =>
        (
          c[0] as { operations?: Array<{ index?: { document?: { update_action?: string } } }> }
        ).operations?.some(
          (op: { index?: { document?: { update_action?: string } } }) =>
            op.index?.document?.update_action === 'create'
        )
      );
      expect(bulkCall).toBeDefined();
      const createOp = (
        bulkCall![0] as {
          operations?: Array<{ index?: { document?: { update_action?: string } } }>;
        }
      ).operations?.find(
        (op: { index?: { document?: { update_action?: string } } }) =>
          op.index?.document?.update_action === 'create'
      );
      expect(createOp).toBeDefined();
      const createOpDoc = (
        createOp as { index?: { document?: { origin_id?: string; spaces?: string[] } } }
      ).index?.document;
      expect(createOpDoc?.origin_id).toBe('a');
      expect(createOpDoc?.spaces).toEqual(['default']);
    });
  });

  describe('updated items', () => {
    it('when list yields item with newer updatedAt than state, creates update action', async () => {
      const items = [{ id: 'a', updatedAt: '2024-01-02', spaces: ['default'] }];
      const definition = createMockDefinition({
        list: jest.fn().mockReturnValue(yieldPages(items)),
      });
      // countStateDocs returns 1
      mockStateClient.search
        .mockResolvedValueOnce({ hits: { hits: [], total: { value: 1 } } })
        // batchLookupState returns existing doc with older timestamp
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _source: {
                  origin_id: 'a',
                  type_id: 'test-type',
                  spaces: ['default'],
                  created_at: '2024-01-01',
                  updated_at: '2024-01-01',
                  update_action: undefined,
                  last_crawled_at: '2024-01-01',
                },
              },
            ],
          },
        })
        // sweepStaleState returns empty
        .mockResolvedValue({ hits: { hits: [] } });
      (esClient.count as jest.Mock).mockResolvedValue({ count: 1 });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      const bulkCall = mockStateClient.bulk.mock.calls.find((c: unknown[]) =>
        (
          c[0] as { operations?: Array<{ index?: { document?: { update_action?: string } } }> }
        ).operations?.some(
          (op: { index?: { document?: { update_action?: string } } }) =>
            op.index?.document?.update_action === 'update'
        )
      );
      expect(bulkCall).toBeDefined();
    });
  });

  describe('deleted items (mark-and-sweep)', () => {
    it('sweeps state docs with stale last_crawled_at and marks them for deletion', async () => {
      const definition = createMockDefinition({
        list: jest.fn().mockReturnValue(yieldPages()),
      });
      // countStateDocs returns 1
      mockStateClient.search
        .mockResolvedValueOnce({ hits: { hits: [], total: { value: 1 } } })
        // sweepStaleState finds stale doc
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'test-type:deleted-item',
                sort: ['deleted-item'],
                _source: {
                  origin_id: 'deleted-item',
                  type_id: 'test-type',
                  spaces: ['default'],
                  created_at: '2024-01-01',
                  updated_at: '2024-01-01',
                  update_action: undefined,
                  last_crawled_at: '2023-12-01',
                },
              },
            ],
          },
        })
        .mockResolvedValue({ hits: { hits: [] } });
      (esClient.count as jest.Mock).mockResolvedValue({ count: 1 });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      const bulkCall = mockStateClient.bulk.mock.calls.find((c: unknown[]) =>
        (
          c[0] as { operations?: Array<{ index?: { document?: { update_action?: string } } }> }
        ).operations?.some(
          (op: { index?: { document?: { update_action?: string } } }) =>
            op.index?.document?.update_action === 'delete'
        )
      );
      expect(bulkCall).toBeDefined();
      const deleteOp = (
        bulkCall![0] as {
          operations?: Array<{ index?: { document?: { update_action?: string } } }>;
        }
      ).operations?.find(
        (op: { index?: { document?: { update_action?: string } } }) =>
          op.index?.document?.update_action === 'delete'
      );
      expect(deleteOp).toBeDefined();
      const deleteOpDoc = (deleteOp as { index?: { document?: { origin_id?: string } } }).index
        ?.document;
      expect(deleteOpDoc?.origin_id).toBe('deleted-item');
    });
  });

  describe('unchanged items', () => {
    it('when list matches state (same updatedAt, same spaces), stamps last_crawled_at but no action change', async () => {
      const items = [{ id: 'a', updatedAt: '2024-01-01', spaces: ['default'] }];
      const definition = createMockDefinition({
        list: jest.fn().mockReturnValue(yieldPages(items)),
      });
      // countStateDocs returns 1
      mockStateClient.search
        .mockResolvedValueOnce({ hits: { hits: [], total: { value: 1 } } })
        // batchLookupState returns matching doc
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _source: {
                  origin_id: 'a',
                  type_id: 'test-type',
                  spaces: ['default'],
                  created_at: '2024-01-01',
                  updated_at: '2024-01-01',
                  update_action: undefined,
                  last_crawled_at: '2024-01-01',
                },
              },
            ],
          },
        })
        // sweepStaleState returns empty
        .mockResolvedValue({ hits: { hits: [] } });
      (esClient.count as jest.Mock).mockResolvedValue({ count: 1 });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      // Should still write bulk (to update last_crawled_at), but with no update_action
      const stateWriteCalls = mockStateClient.bulk.mock.calls.filter((c: unknown[]) =>
        (
          c[0] as { operations?: Array<{ index?: { document?: { update_action?: string } } }> }
        ).operations?.some((op: { index?: { document?: { update_action?: string } } }) =>
          ['create', 'update', 'delete'].includes(op.index?.document?.update_action ?? '')
        )
      );
      expect(stateWriteCalls.length).toBe(0);
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('no state changes needed'));
    });
  });

  describe('space change detection', () => {
    it('when item.spaces differs from state.spaces, creates update action', async () => {
      const items = [{ id: 'a', updatedAt: '2024-01-01', spaces: ['default', 'space-2'] }];
      const definition = createMockDefinition({
        list: jest.fn().mockReturnValue(yieldPages(items)),
      });
      // countStateDocs returns 1
      mockStateClient.search
        .mockResolvedValueOnce({ hits: { hits: [], total: { value: 1 } } })
        // batchLookupState returns doc with different spaces
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _source: {
                  origin_id: 'a',
                  type_id: 'test-type',
                  spaces: ['default'],
                  created_at: '2024-01-01',
                  updated_at: '2024-01-01',
                  update_action: undefined,
                  last_crawled_at: '2024-01-01',
                },
              },
            ],
          },
        })
        // sweepStaleState returns empty
        .mockResolvedValue({ hits: { hits: [] } });
      (esClient.count as jest.Mock).mockResolvedValue({ count: 1 });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      const bulkCall = mockStateClient.bulk.mock.calls.find((c: unknown[]) =>
        (
          c[0] as { operations?: Array<{ index?: { document?: { update_action?: string } } }> }
        ).operations?.some(
          (op: { index?: { document?: { update_action?: string } } }) =>
            op.index?.document?.update_action === 'update'
        )
      );
      expect(bulkCall).toBeDefined();
    });
  });

  describe('processQueue', () => {
    it('for create/update calls indexer.indexAttachment then bulk ACKs with update_action undefined', async () => {
      const definition = createMockDefinition({
        list: jest
          .fn()
          .mockReturnValue(yieldPages([{ id: 'a', updatedAt: '2024-01-01', spaces: ['default'] }])),
      });
      // countStateDocs returns 0
      mockStateClient.search
        .mockResolvedValueOnce({ hits: { hits: [], total: { value: 0 } } })
        // batchLookupState returns empty (new item)
        .mockResolvedValueOnce({ hits: { hits: [] } })
        // sweepStaleState returns empty
        .mockResolvedValueOnce({ hits: { hits: [] } })
        // processQueue finds pending create action
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'test-type:a',
                sort: ['a'],
                _source: {
                  origin_id: 'a',
                  type_id: 'test-type',
                  spaces: ['default'],
                  created_at: '2024-01-01',
                  updated_at: '2024-01-01',
                  update_action: 'create',
                  last_crawled_at: '2024-01-01',
                },
              },
            ],
          },
        })
        .mockResolvedValue({ hits: { hits: [] } });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      expect(mockIndexer.indexAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          originId: 'a',
          attachmentType: 'test-type',
          action: 'create',
          spaces: ['default'],
        })
      );

      const ackBulkCalls = mockStateClient.bulk.mock.calls.filter((c: unknown[]) =>
        (
          c[0] as { operations?: Array<{ index?: { document?: { update_action?: unknown } } }> }
        ).operations?.some(
          (op: { index?: { document?: { update_action?: unknown } } }) =>
            op.index?.document !== undefined && op.index.document.update_action === undefined
        )
      );
      expect(ackBulkCalls.length).toBeGreaterThan(0);
    });

    it('skips hits without _id and logs warning', async () => {
      const definition = createMockDefinition({
        list: jest.fn().mockReturnValue(yieldPages()),
      });
      // countStateDocs returns 0
      mockStateClient.search
        .mockResolvedValueOnce({ hits: { hits: [], total: { value: 0 } } })
        // sweepStaleState returns empty
        .mockResolvedValueOnce({ hits: { hits: [] } })
        // processQueue returns hit without _id
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: undefined,
                sort: ['no-id'],
                _source: {
                  origin_id: 'no-id',
                  type_id: 'test-type',
                  spaces: ['default'],
                  update_action: 'create',
                  last_crawled_at: '2024-01-01',
                },
              },
            ],
          },
        })
        .mockResolvedValue({ hits: { hits: [] } });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      expect(logger.warn).toHaveBeenCalledWith('SML crawler: skipping hit without _id');
      expect(mockIndexer.indexAttachment).not.toHaveBeenCalled();
    });

    it('skips create/update for origin_ids that already have a manual entry and ACKs them', async () => {
      const definition = createMockDefinition({
        list: jest.fn().mockReturnValue(
          yieldPages([
            { id: 'manual-origin', updatedAt: '2024-01-01', spaces: ['default'] },
            { id: 'normal-origin', updatedAt: '2024-01-01', spaces: ['default'] },
          ])
        ),
      });
      mockStateClient.search
        // countStateDocs returns 0
        .mockResolvedValueOnce({ hits: { hits: [], total: { value: 0 } } })
        // batchLookupState returns empty for new items
        .mockResolvedValueOnce({ hits: { hits: [] } })
        // sweepStaleState returns empty
        .mockResolvedValueOnce({ hits: { hits: [] } })
        // processQueue finds both pending create actions
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'test-type:manual-origin',
                sort: ['manual-origin'],
                _source: {
                  origin_id: 'manual-origin',
                  type_id: 'test-type',
                  spaces: ['default'],
                  created_at: '2024-01-01',
                  updated_at: '2024-01-01',
                  update_action: 'create',
                  last_crawled_at: '2024-01-01',
                },
              },
              {
                _id: 'test-type:normal-origin',
                sort: ['normal-origin'],
                _source: {
                  origin_id: 'normal-origin',
                  type_id: 'test-type',
                  spaces: ['default'],
                  created_at: '2024-01-01',
                  updated_at: '2024-01-01',
                  update_action: 'create',
                  last_crawled_at: '2024-01-01',
                },
              },
            ],
          },
        })
        .mockResolvedValue({ hits: { hits: [] } });

      // findManualOriginUris returns one of the candidates as manual
      (esClient.search as jest.Mock).mockResolvedValue({
        hits: {
          hits: [{ _source: { origin: { uri: 'test-type://manual-origin' } } }],
        },
      });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      // Indexer must only be called for non-manual origin
      expect(mockIndexer.indexAttachment).toHaveBeenCalledTimes(1);
      expect(mockIndexer.indexAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ originId: 'normal-origin' })
      );

      // Both items should have been ACKed (update_action cleared)
      const ackOps = mockStateClient.bulk.mock.calls
        .flatMap((c: unknown[]) => (c[0] as { operations?: unknown[] }).operations ?? [])
        .filter(
          (op: { index?: { _id?: string; document?: { update_action?: unknown } } }) =>
            op.index?.document !== undefined && op.index.document.update_action === undefined
        );
      const ackedIds = ackOps.map((op: { index?: { _id?: string } }) => op.index?._id);
      expect(ackedIds).toEqual(
        expect.arrayContaining(['test-type:manual-origin', 'test-type:normal-origin'])
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining("skipping 'create' for origin 'manual-origin'")
      );
    });

    it('manual-origin protection does NOT apply to delete actions', async () => {
      const definition = createMockDefinition({
        list: jest.fn().mockReturnValue(yieldPages()),
      });
      mockStateClient.search
        // countStateDocs returns 1
        .mockResolvedValueOnce({ hits: { hits: [], total: { value: 1 } } })
        // sweepStaleState marks one stale doc for deletion
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'test-type:manual-origin',
                sort: ['manual-origin'],
                _source: {
                  origin_id: 'manual-origin',
                  type_id: 'test-type',
                  spaces: ['default'],
                  created_at: '2024-01-01',
                  updated_at: '2024-01-01',
                  update_action: undefined,
                  last_crawled_at: '2023-12-01',
                },
              },
            ],
          },
        })
        // processQueue picks up the delete action
        .mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _id: 'test-type:manual-origin',
                sort: ['manual-origin'],
                _source: {
                  origin_id: 'manual-origin',
                  type_id: 'test-type',
                  spaces: ['default'],
                  created_at: '2024-01-01',
                  updated_at: '2024-01-01',
                  update_action: 'delete',
                  last_crawled_at: '2024-01-01',
                },
              },
            ],
          },
        })
        .mockResolvedValue({ hits: { hits: [] } });

      (esClient.count as jest.Mock).mockResolvedValue({ count: 1 });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      // findManualOriginIds is not queried for delete-only batches
      expect(esClient.search).not.toHaveBeenCalled();
      expect(mockIndexer.indexAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ originId: 'manual-origin', action: 'delete' })
      );
    });
  });

  describe('data integrity check', () => {
    it('when state has items but countSmlDocuments returns 0, forces re-index of all items', async () => {
      const items = [{ id: 'a', updatedAt: '2024-01-01', spaces: ['default'] }];
      const definition = createMockDefinition({
        list: jest.fn().mockReturnValue(yieldPages(items)),
      });
      // countStateDocs returns 1 (has prior state)
      mockStateClient.search
        .mockResolvedValueOnce({ hits: { hits: [], total: { value: 1 } } })
        // sweepStaleState returns empty
        .mockResolvedValue({ hits: { hits: [] } });
      // SML data index is empty
      (esClient.count as jest.Mock).mockResolvedValue({ count: 0 });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('data integrity mismatch'));
      const createOp = mockStateClient.bulk.mock.calls
        .flatMap((c: unknown[]) => (c[0] as { operations?: unknown[] }).operations ?? [])
        .find(
          (op: { index?: { document?: { update_action?: string } } }) =>
            op.index?.document?.update_action === 'create'
        );
      expect(createOp).toBeDefined();
    });
  });

  describe('schema version check', () => {
    it('mapping update failure: drops index and forces full re-index', async () => {
      const mappingError = {
        statusCode: 400,
        body: { error: { type: 'mapper_parsing_exception' } },
      };
      mockUpdateMappingsIfNeeded.mockRejectedValue(mappingError);

      const items = [{ id: 'a', updatedAt: '2024-01-01', spaces: ['default'] }];
      const definition = createMockDefinition({
        list: jest.fn().mockReturnValue(yieldPages(items)),
      });
      mockStateClient.search.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      expect(mockUpdateMappingsIfNeeded).toHaveBeenCalledTimes(1);
      expect(mockSmlClient.clean).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('mapping update failed'));
      const createOp = mockStateClient.bulk.mock.calls
        .flatMap((c: unknown[]) => (c[0] as { operations?: unknown[] }).operations ?? [])
        .find(
          (op: { index?: { document?: { update_action?: string } } }) =>
            op.index?.document?.update_action === 'create'
        );
      expect(createOp).toBeDefined();
    });

    it('non-response error propagates immediately without retrying', async () => {
      const networkError = new Error('connection refused');
      mockUpdateMappingsIfNeeded.mockRejectedValue(networkError);

      const definition = createMockDefinition();
      mockStateClient.search.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await expect(crawler.crawl({ definition, esClient, savedObjectsClient })).rejects.toThrow(
        'connection refused'
      );

      expect(mockUpdateMappingsIfNeeded).toHaveBeenCalledTimes(1);
      expect(mockSmlClient.clean).not.toHaveBeenCalled();
    });

    it('additive mapping change: applies in-place without cleaning', async () => {
      const items = [{ id: 'a', updatedAt: '2024-01-01', spaces: ['default'] }];
      const definition = createMockDefinition({
        list: jest.fn().mockReturnValue(yieldPages(items)),
      });
      mockStateClient.search.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      expect(mockUpdateMappingsIfNeeded).toHaveBeenCalledTimes(1);
      expect(mockSmlClient.clean).not.toHaveBeenCalled();
    });

    it('index does not exist: updateMappingsIfNeeded resolves cleanly, crawl proceeds without cleaning', async () => {
      const items = [{ id: 'a', updatedAt: '2024-01-01', spaces: ['default'] }];
      const definition = createMockDefinition({
        list: jest.fn().mockReturnValue(yieldPages(items)),
      });
      mockStateClient.search.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      expect(mockUpdateMappingsIfNeeded).toHaveBeenCalledTimes(1);
      expect(mockSmlClient.clean).not.toHaveBeenCalled();
    });

    it('404 from mapping update: race condition treated as no-op, does not clean', async () => {
      mockUpdateMappingsIfNeeded.mockRejectedValueOnce({ statusCode: 404 });

      const items = [{ id: 'a', updatedAt: '2024-01-01', spaces: ['default'] }];
      const definition = createMockDefinition({
        list: jest.fn().mockReturnValue(yieldPages(items)),
      });
      mockStateClient.search.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      expect(mockSmlClient.clean).not.toHaveBeenCalled();
    });
  });

  describe('list() failure', () => {
    it('logs error and returns without processing', async () => {
      async function* failingList(): AsyncIterable<SmlListItem[]> {
        throw new Error('list failed');
      }
      const definition = createMockDefinition({
        list: jest.fn().mockReturnValue(failingList()),
      });
      // countStateDocs returns 0
      mockStateClient.search.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to list items'));
      expect(mockIndexer.indexAttachment).not.toHaveBeenCalled();
    });
  });

  describe('state bulk failure', () => {
    it('logs error and throws, preventing further processing', async () => {
      const items = [{ id: 'a', updatedAt: '2024-01-01', spaces: ['default'] }];
      const definition = createMockDefinition({
        list: jest.fn().mockReturnValue(yieldPages(items)),
      });
      // countStateDocs returns 0
      mockStateClient.search.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });
      mockStateClient.bulk
        .mockRejectedValueOnce(new Error('bulk failed'))
        .mockResolvedValue({ errors: false, items: [] });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('failed to update state'));
      expect(mockIndexer.indexAttachment).not.toHaveBeenCalled();
    });
  });

  describe('multi-page streaming', () => {
    it('processes multiple pages without accumulating all items in memory', async () => {
      const page1 = [{ id: 'a', updatedAt: '2024-01-01', spaces: ['default'] }];
      const page2 = [{ id: 'b', updatedAt: '2024-01-01', spaces: ['default'] }];
      const definition = createMockDefinition({
        list: jest.fn().mockReturnValue(yieldPages(page1, page2)),
      });
      // countStateDocs returns 0
      // batchLookupState returns empty for both pages
      // sweepStaleState returns empty
      mockStateClient.search.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });

      const crawler = new SmlCrawlerImpl({ indexer: mockIndexer, logger });
      await crawler.crawl({ definition, esClient, savedObjectsClient });

      // Should have written two separate bulk calls (one per page)
      const stateWriteCalls = mockStateClient.bulk.mock.calls.filter((c: unknown[]) =>
        (
          c[0] as { operations?: Array<{ index?: { document?: { origin_id?: string } } }> }
        ).operations?.some(
          (op: { index?: { document?: { origin_id?: string } } }) =>
            op.index?.document?.origin_id !== undefined
        )
      );
      expect(stateWriteCalls.length).toBe(2);

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('enumerated 2 item(s)'));
    });
  });
});
