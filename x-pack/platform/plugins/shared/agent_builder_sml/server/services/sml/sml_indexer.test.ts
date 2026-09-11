/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type {
  ISavedObjectsRepository,
  SavedObjectsClientContract,
} from '@kbn/core-saved-objects-api-server';
import { createSmlIndexer } from './sml_indexer';
import { smlIndexName } from './sml_storage';
import { SmlUnregisteredTypeError } from './sml_errors';
import type { SmlContext, SmlEntry, SmlIndexerOriginParams, SmlTypeDefinition } from './types';

jest.mock('./sml_storage', () => ({
  smlIndexName: '.test-sml-data',
}));

jest.mock('./sml_service', () => ({
  isNotFoundError: jest.fn(
    (error: unknown) => (error as { statusCode?: number })?.statusCode === 404
  ),
}));

// Distinct mock id per call so tests can assert each bulk operation gets its
// own _id. Reset in `beforeEach` so cross-test counts stay stable.
let mockUuidCounter = 0;
jest.mock('uuid', () => ({ v4: () => `mock-uuid-${++mockUuidCounter}` }));

// Shared so a test can arrange the response before `createMockEsClient()` is called.
const bulkMock = jest.fn();

const createMockEsClient = (): jest.Mocked<ElasticsearchClient> =>
  ({
    bulk: bulkMock,
    deleteByQuery: jest.fn().mockResolvedValue({ deleted: 0 }),
    count: jest.fn().mockResolvedValue({ count: 0 }),
  } as unknown as jest.Mocked<ElasticsearchClient>);

const createMockLogger = () => {
  const log = loggerMock.create();
  log.get = jest.fn().mockReturnValue(log);
  return log;
};

const createMockSmlTypeDefinition = (
  overrides: Partial<SmlTypeDefinition> = {}
): SmlTypeDefinition => ({
  id: 'test-type',
  list: jest.fn(),
  getSmlEntry: jest.fn(),
  toAttachment: jest.fn(),
  ...overrides,
});

const createMockRegistry = (definition?: SmlTypeDefinition) => ({
  get: jest.fn().mockReturnValue(definition),
  list: jest.fn().mockReturnValue(definition ? [definition] : []),
  register: jest.fn(),
  has: jest.fn().mockReturnValue(!!definition),
});

const captureSmlEntryClient = () => {
  const captured: { client?: SavedObjectsClientContract } = {};
  const getSmlEntry = jest.fn(async (_originId: string, context: SmlContext): Promise<SmlEntry> => {
    captured.client = context.savedObjectsClient;
    return { type: 'lens', title: 'T', content: 'c' };
  });
  return { captured, getSmlEntry };
};

const createIndexerParams = (
  overrides: {
    originId?: string;
    attachmentType?: string;
    spaces?: string[];
    esClient?: jest.Mocked<ElasticsearchClient>;
    logger?: ReturnType<typeof createMockLogger>;
    action?: 'create' | 'update' | 'delete';
    savedObjectsClient?: ISavedObjectsRepository;
    clientHasSpacesExtension?: boolean;
  } = {}
): SmlIndexerOriginParams => ({
  originId: overrides.originId ?? 'att-123',
  attachmentType: overrides.attachmentType ?? 'lens',
  spaces: overrides.spaces ?? ['default'],
  esClient: overrides.esClient ?? createMockEsClient(),
  savedObjectsClient: overrides.savedObjectsClient ?? ({} as unknown as ISavedObjectsRepository),
  logger: overrides.logger ?? createMockLogger(),
  action: overrides.action ?? 'create',
  clientHasSpacesExtension: overrides.clientHasSpacesExtension,
});

describe('createSmlIndexer', () => {
  beforeEach(() => {
    mockUuidCounter = 0;
    bulkMock.mockReset();
    bulkMock.mockResolvedValue({ errors: false, items: [] });
  });

  describe('indexAttachment', () => {
    it('delete action: calls deleteByQuery and does NOT call getSmlEntry', async () => {
      const getSmlEntry = jest.fn();
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens', getSmlEntry }));
      const logger = createMockLogger();
      const esClient = createMockEsClient();
      const indexer = createSmlIndexer({ registry, logger });

      await indexer.indexAttachment(
        createIndexerParams({
          originId: 'att-1',
          attachmentType: 'lens',
          action: 'delete',
          esClient,
          logger,
        })
      );

      expect(esClient.deleteByQuery).toHaveBeenCalledTimes(1);
      expect(esClient.deleteByQuery).toHaveBeenCalledWith({
        index: smlIndexName,
        ignore_unavailable: true,
        allow_no_indices: true,
        query: {
          bool: {
            filter: [
              { term: { 'attributes.origin.uri': 'lens://att-1' } },
              { term: { 'attributes.ingestion_method': 'crawled' } },
            ],
          },
        },
        refresh: false,
      });
      expect(getSmlEntry).not.toHaveBeenCalled();
    });

    it('create action: calls getSmlEntry, deletes existing entry, indexes the new one with permissions from getPermissions hook', async () => {
      const smlEntry = {
        type: 'lens',
        title: 'My Viz',
        content: 'content',
      };
      const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
      const getPermissions = jest.fn().mockReturnValue({
        kibana: { privileges: { name: ['perm1'] } },
      });
      const registry = createMockRegistry(
        createMockSmlTypeDefinition({ id: 'lens', getSmlEntry, getPermissions })
      );
      const logger = createMockLogger();
      const esClient = createMockEsClient();
      const contextLogger = createMockLogger();
      const indexer = createSmlIndexer({ registry, logger });

      await indexer.indexAttachment(
        createIndexerParams({
          originId: 'att-2',
          attachmentType: 'lens',
          action: 'create',
          spaces: ['default', 'space-2'],
          esClient,
          logger: contextLogger,
        })
      );

      expect(getSmlEntry).toHaveBeenCalledTimes(1);
      expect(getSmlEntry).toHaveBeenCalledWith('att-2', {
        esClient,
        savedObjectsClient: {},
        logger: contextLogger,
      });
      expect(getPermissions).toHaveBeenCalledWith('att-2', {
        esClient,
        savedObjectsClient: {},
        logger: contextLogger,
      });
      expect(esClient.deleteByQuery).toHaveBeenCalledTimes(1);
      expect(esClient.deleteByQuery).toHaveBeenCalledWith({
        index: smlIndexName,
        ignore_unavailable: true,
        allow_no_indices: true,
        query: { bool: { filter: [{ term: { 'attributes.origin.uri': 'lens://att-2' } }] } },
        refresh: false,
      });
      expect(bulkMock).toHaveBeenCalledTimes(1);
      const bulkCall = bulkMock.mock.calls[0][0];
      expect(bulkCall.index).toBe(smlIndexName);
      expect(bulkCall.refresh).toBe('wait_for');
      expect(bulkCall.operations).toHaveLength(2);
      // _id is a bare UUID (no `${type}:${origin}:...` prefix) so it cannot
      // overflow ES's 512-byte _id limit no matter how long caller-supplied
      // inputs are. Document carries `origin_id`/`type` as searchable fields.
      expect(bulkCall.operations[0].index._id).toBe('mock-uuid-1');
      expect(bulkCall.operations[1]).toEqual({
        type: 'lens',
        title: 'My Viz',
        content: 'content',
        permissions: {
          kibana: {
            privileges: [
              { space: 'default', name: ['perm1'], count: 1 },
              { space: 'space-2', name: ['perm1'], count: 1 },
            ],
          },
        },
        attributes: {
          id: 'mock-uuid-1',
          origin: { uri: 'lens://att-2' },
          created_at: expect.any(String),
          updated_at: expect.any(String),
          ingestion_method: 'crawled',
        },
      });
    });

    it('create action: round-trips all new schema fields (tags, attributes, references, description, user_id)', async () => {
      const smlEntry = {
        type: 'dashboard',
        title: 'Sales Q3',
        content: 'sales dashboard for Q3 with revenue and conversion metrics',
        description: 'Quarterly sales overview, executive audience',
        tags: ['sales', 'executive', 'quarterly'],
        attributes: {
          owner_team: 'sales-ops',
          fields: [{ name: 'revenue', type: 'currency' }],
        },
        user_id: 'user-7',
        references: [{ uri: 'category://sales' }, { uri: 'dashboard://parent-1' }],
      };
      const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
      const getPermissions = jest.fn().mockReturnValue({
        kibana: { privileges: { name: ['ai_index:dashboard/read'] } },
      });
      const registry = createMockRegistry(
        createMockSmlTypeDefinition({ id: 'dashboard', getSmlEntry, getPermissions })
      );
      const logger = createMockLogger();
      const esClient = createMockEsClient();
      const indexer = createSmlIndexer({ registry, logger });

      await indexer.indexAttachment(
        createIndexerParams({
          originId: 'dash-100',
          attachmentType: 'dashboard',
          action: 'create',
          spaces: ['default'],
          esClient,
        })
      );

      expect(bulkMock).toHaveBeenCalledTimes(1);
      const bulkCall = bulkMock.mock.calls[0][0];
      expect(bulkCall.operations[1]).toEqual({
        type: 'dashboard',
        title: 'Sales Q3',
        content: 'sales dashboard for Q3 with revenue and conversion metrics',
        description: 'Quarterly sales overview, executive audience',
        tags: ['sales', 'executive', 'quarterly'],
        references: [{ uri: 'category://sales' }, { uri: 'dashboard://parent-1' }],
        permissions: {
          kibana: {
            privileges: [{ space: 'default', name: ['ai_index:dashboard/read'], count: 1 }],
          },
        },
        attributes: {
          owner_team: 'sales-ops',
          fields: [{ name: 'revenue', type: 'currency' }],
          id: 'mock-uuid-1',
          origin: { uri: 'dashboard://dash-100' },
          user_id: 'user-7',
          created_at: expect.any(String),
          updated_at: expect.any(String),
          ingestion_method: 'crawled',
        },
      });
    });

    it('producer attributes cannot override the SML bookkeeping keys', async () => {
      const smlEntry = {
        type: 'dashboard',
        title: 'Forged',
        content: 'c',
        attributes: {
          // `origin.uri` gates deleteEntry and `ingestion_method` gates manual-entry
          // protection, so a type writer must not be able to forge either.
          origin: { uri: 'dashboard://somebody-elses-origin' },
          ingestion_method: 'manual',
          id: 'forged-id',
          owner_team: 'sales-ops',
        },
      };
      const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
      const registry = createMockRegistry(
        createMockSmlTypeDefinition({ id: 'dashboard', getSmlEntry })
      );
      const logger = createMockLogger();
      const esClient = createMockEsClient();
      const indexer = createSmlIndexer({ registry, logger });

      await indexer.indexAttachment(
        createIndexerParams({
          originId: 'dash-1',
          attachmentType: 'dashboard',
          action: 'create',
          esClient,
          logger,
        })
      );

      const { attributes } = bulkMock.mock.calls[0][0].operations[1];
      expect(attributes.origin).toEqual({ uri: 'dashboard://dash-1' });
      expect(attributes.ingestion_method).toBe('crawled');
      expect(attributes.id).toBe('mock-uuid-1');
      expect(attributes.owner_team).toBe('sales-ops');
    });

    it('update action: same as create (delete-then-write)', async () => {
      const smlEntry = { type: 'lens', title: 'Updated', content: 'new content' };
      const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens', getSmlEntry }));
      const logger = createMockLogger();
      const esClient = createMockEsClient();
      const indexer = createSmlIndexer({ registry, logger });

      await indexer.indexAttachment(
        createIndexerParams({
          originId: 'att-3',
          attachmentType: 'lens',
          action: 'update',
          esClient,
        })
      );

      expect(getSmlEntry).toHaveBeenCalledTimes(1);
      expect(esClient.deleteByQuery).toHaveBeenCalledTimes(1);
      expect(bulkMock).toHaveBeenCalledTimes(1);
    });

    it('non-default space without spaces extension: injects namespace on .get()', async () => {
      const { captured, getSmlEntry } = captureSmlEntryClient();
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens', getSmlEntry }));
      const indexer = createSmlIndexer({ registry, logger: createMockLogger() });
      const realGet = jest.fn().mockResolvedValue({ id: 'att-9', type: 'lens', attributes: {} });
      const mockRepo = { get: realGet } as unknown as ISavedObjectsRepository;

      await indexer.indexAttachment(
        createIndexerParams({
          originId: 'att-9',
          attachmentType: 'lens',
          action: 'create',
          spaces: ['my-space'],
          savedObjectsClient: mockRepo,
          clientHasSpacesExtension: false,
        })
      );

      expect(captured.client).toBeDefined();
      await captured.client?.get('lens', 'att-9');
      expect(realGet).toHaveBeenCalledWith('lens', 'att-9', { namespace: 'my-space' });
    });

    it('non-default space without spaces extension: injects namespace on bulkGet', async () => {
      const { captured, getSmlEntry } = captureSmlEntryClient();
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens', getSmlEntry }));
      const indexer = createSmlIndexer({ registry, logger: createMockLogger() });
      const realBulkGet = jest.fn().mockResolvedValue({ saved_objects: [] });
      const mockRepo = {
        get: jest.fn(),
        bulkGet: realBulkGet,
      } as unknown as ISavedObjectsRepository;

      await indexer.indexAttachment(
        createIndexerParams({
          originId: 'att-11',
          attachmentType: 'lens',
          action: 'create',
          spaces: ['my-space'],
          savedObjectsClient: mockRepo,
          clientHasSpacesExtension: false,
        })
      );

      expect(captured.client).toBeDefined();
      await captured.client?.bulkGet([{ type: 'lens', id: 'att-11', namespaces: ['wrong-space'] }]);
      expect(realBulkGet).toHaveBeenCalledWith([{ type: 'lens', id: 'att-11' }], {
        namespace: 'my-space',
      });
    });

    it('non-default space without spaces extension: injects namespace on resolve', async () => {
      const { captured, getSmlEntry } = captureSmlEntryClient();
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens', getSmlEntry }));
      const indexer = createSmlIndexer({ registry, logger: createMockLogger() });
      const realResolve = jest
        .fn()
        .mockResolvedValue({ saved_object: { id: 'att-14', type: 'lens', attributes: {} } });
      const mockRepo = {
        get: jest.fn(),
        resolve: realResolve,
      } as unknown as ISavedObjectsRepository;

      await indexer.indexAttachment(
        createIndexerParams({
          originId: 'att-14',
          attachmentType: 'lens',
          action: 'create',
          spaces: ['my-space'],
          savedObjectsClient: mockRepo,
          clientHasSpacesExtension: false,
        })
      );

      expect(captured.client).toBeDefined();
      await captured.client?.resolve('lens', 'att-14');
      expect(realResolve).toHaveBeenCalledWith('lens', 'att-14', { namespace: 'my-space' });
    });

    it('non-default space without spaces extension: injects namespace on bulkResolve', async () => {
      const { captured, getSmlEntry } = captureSmlEntryClient();
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens', getSmlEntry }));
      const indexer = createSmlIndexer({ registry, logger: createMockLogger() });
      const realBulkResolve = jest.fn().mockResolvedValue({ resolved_objects: [] });
      const mockRepo = {
        get: jest.fn(),
        bulkResolve: realBulkResolve,
      } as unknown as ISavedObjectsRepository;

      await indexer.indexAttachment(
        createIndexerParams({
          originId: 'att-15',
          attachmentType: 'lens',
          action: 'create',
          spaces: ['my-space'],
          savedObjectsClient: mockRepo,
          clientHasSpacesExtension: false,
        })
      );

      expect(captured.client).toBeDefined();
      await captured.client?.bulkResolve([{ type: 'lens', id: 'att-15' }]);
      expect(realBulkResolve).toHaveBeenCalledWith([{ type: 'lens', id: 'att-15' }], {
        namespace: 'my-space',
      });
    });

    it('spaces-extension client with non-default space: passes the client through unchanged and does not warn', async () => {
      const { captured, getSmlEntry } = captureSmlEntryClient();
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens', getSmlEntry }));
      const contextLogger = createMockLogger();
      const indexer = createSmlIndexer({ registry, logger: createMockLogger() });
      const mockRepo = {} as unknown as ISavedObjectsRepository;

      await indexer.indexAttachment(
        createIndexerParams({
          originId: 'att-12',
          attachmentType: 'lens',
          action: 'create',
          spaces: ['my-space'],
          savedObjectsClient: mockRepo,
          logger: contextLogger,
          clientHasSpacesExtension: true,
        })
      );

      expect(captured.client).toBe(mockRepo);
      expect(contextLogger.warn).not.toHaveBeenCalled();
    });

    it("all-spaces ('*') without spaces extension: passes the client through without namespace injection", async () => {
      const { captured, getSmlEntry } = captureSmlEntryClient();
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens', getSmlEntry }));
      const indexer = createSmlIndexer({ registry, logger: createMockLogger() });
      const mockRepo = { get: jest.fn() } as unknown as ISavedObjectsRepository;

      await indexer.indexAttachment(
        createIndexerParams({
          originId: 'att-13',
          attachmentType: 'lens',
          action: 'create',
          spaces: ['*'],
          savedObjectsClient: mockRepo,
          clientHasSpacesExtension: false,
        })
      );

      expect(captured.client).toBe(mockRepo);
    });

    it('unknown type in origin mode: throws SmlUnregisteredTypeError without touching ES', async () => {
      const registry = createMockRegistry(undefined);
      registry.list.mockReturnValue([]);
      const logger = createMockLogger();
      const esClient = createMockEsClient();
      const indexer = createSmlIndexer({ registry, logger });

      await expect(
        indexer.indexAttachment(
          createIndexerParams({
            originId: 'att-4',
            attachmentType: 'unknown-type',
            action: 'create',
            esClient,
            logger,
          })
        )
      ).rejects.toBeInstanceOf(SmlUnregisteredTypeError);
      // Origin-mode writes must surface the type-registration failure
      // *before* touching ES so the data plane and the registry can't
      // silently drift.
      expect(esClient.deleteByQuery).not.toHaveBeenCalled();
    });

    it('getSmlEntry returns undefined: deletes existing entry and does not index', async () => {
      const getSmlEntry = jest.fn().mockResolvedValue(undefined);
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens', getSmlEntry }));
      const logger = createMockLogger();
      const esClient = createMockEsClient();
      const indexer = createSmlIndexer({ registry, logger });

      await indexer.indexAttachment(
        createIndexerParams({
          originId: 'att-5',
          attachmentType: 'lens',
          action: 'create',
          esClient,
        })
      );

      expect(getSmlEntry).toHaveBeenCalledTimes(1);
      expect(esClient.deleteByQuery).toHaveBeenCalledTimes(1);
      expect(bulkMock).not.toHaveBeenCalled();
    });

    it('getSmlEntry returns undefined (second case): deletes existing entry and does not index', async () => {
      const getSmlEntry = jest.fn().mockResolvedValue(undefined);
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens', getSmlEntry }));
      const logger = createMockLogger();
      const esClient = createMockEsClient();
      const indexer = createSmlIndexer({ registry, logger });

      await indexer.indexAttachment(
        createIndexerParams({
          originId: 'att-6',
          attachmentType: 'lens',
          action: 'create',
          esClient,
        })
      );

      expect(getSmlEntry).toHaveBeenCalledTimes(1);
      expect(esClient.deleteByQuery).toHaveBeenCalledTimes(1);
      expect(bulkMock).not.toHaveBeenCalled();
    });

    it('deleteEntry handles 404 gracefully', async () => {
      const error404 = Object.assign(new Error('index_not_found_exception'), {
        statusCode: 404,
      });
      const esClient = createMockEsClient();
      esClient.deleteByQuery.mockRejectedValue(error404);

      const registry = createMockRegistry(
        createMockSmlTypeDefinition({ id: 'lens', getSmlEntry: jest.fn() })
      );
      const logger = createMockLogger();
      const indexer = createSmlIndexer({ registry, logger });

      await indexer.indexAttachment(
        createIndexerParams({
          originId: 'att-7',
          attachmentType: 'lens',
          action: 'delete',
          esClient,
          logger,
        })
      );

      expect(esClient.deleteByQuery).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('deleteEntry warns on non-404 errors', async () => {
      const error500 = Object.assign(new Error('internal error'), { statusCode: 500 });
      const esClient = createMockEsClient();
      esClient.deleteByQuery.mockRejectedValue(error500);

      const registry = createMockRegistry(
        createMockSmlTypeDefinition({ id: 'lens', getSmlEntry: jest.fn() })
      );
      const logger = createMockLogger();
      const indexer = createSmlIndexer({ registry, logger });

      await indexer.indexAttachment(
        createIndexerParams({
          originId: 'att-8',
          attachmentType: 'lens',
          action: 'delete',
          esClient,
          logger,
        })
      );

      expect(esClient.deleteByQuery).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('failed to delete crawled entry')
      );
    });

    it('bulk index errors are logged', async () => {
      bulkMock.mockResolvedValue({
        errors: true,
        items: [{ index: { error: { type: 'mapper_parsing_exception', reason: 'failed' } } }],
      });

      const smlEntry = { type: 'lens', title: 'T', content: 'c' };
      const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens', getSmlEntry }));
      const logger = createMockLogger();
      const esClient = createMockEsClient();
      const indexer = createSmlIndexer({ registry, logger });

      await indexer.indexAttachment(
        createIndexerParams({
          originId: 'att-9',
          attachmentType: 'lens',
          action: 'create',
          esClient,
          logger,
        })
      );

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('bulk index errors'));
    });

    it('bulk index throws on failure', async () => {
      bulkMock.mockRejectedValue(new Error('Connection refused'));

      const smlEntry = { type: 'lens', title: 'T', content: 'c' };
      const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens', getSmlEntry }));
      const logger = createMockLogger();
      const esClient = createMockEsClient();
      const indexer = createSmlIndexer({ registry, logger });

      await expect(
        indexer.indexAttachment(
          createIndexerParams({
            originId: 'att-10',
            attachmentType: 'lens',
            action: 'create',
            esClient,
            logger,
          })
        )
      ).rejects.toThrow('Connection refused');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to index SML data')
      );
    });

    describe('manual-entry protection (origin mode)', () => {
      it('skips getSmlEntry and write when a manual entry already exists', async () => {
        const getSmlEntry = jest.fn();
        const registry = createMockRegistry(
          createMockSmlTypeDefinition({ id: 'lens', getSmlEntry })
        );
        const logger = createMockLogger();
        const esClient = createMockEsClient();
        // hasManualEntry returns true
        (esClient.count as jest.Mock).mockResolvedValue({ count: 1 });
        const indexer = createSmlIndexer({ registry, logger });

        await indexer.indexAttachment(
          createIndexerParams({
            originId: 'att-protected',
            attachmentType: 'lens',
            action: 'create',
            esClient,
            logger,
          })
        );

        expect(esClient.count).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.objectContaining({
              bool: expect.objectContaining({
                filter: expect.arrayContaining([
                  { term: { 'attributes.origin.uri': 'lens://att-protected' } },
                  { term: { 'attributes.ingestion_method': 'manual' } },
                ]),
              }),
            }),
          })
        );
        expect(getSmlEntry).not.toHaveBeenCalled();
        expect(esClient.deleteByQuery).not.toHaveBeenCalled();
        expect(bulkMock).not.toHaveBeenCalled();
        expect(logger.debug).toHaveBeenCalledWith(
          expect.stringContaining("skipping origin-mode index for 'att-protected'")
        );
      });

      it('force=true overrides existing manual entry and writes as crawled', async () => {
        const smlEntry = { type: 'lens', title: 'Forced', content: 'c' };
        const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
        const registry = createMockRegistry(
          createMockSmlTypeDefinition({ id: 'lens', getSmlEntry })
        );
        const logger = createMockLogger();
        const esClient = createMockEsClient();
        (esClient.count as jest.Mock).mockResolvedValue({ count: 1 });
        const indexer = createSmlIndexer({ registry, logger });

        await indexer.indexAttachment({
          ...createIndexerParams({
            originId: 'att-forced',
            attachmentType: 'lens',
            action: 'create',
            esClient,
          }),
          force: true,
        });

        // hasManualEntry is bypassed entirely when force=true
        expect(esClient.count).not.toHaveBeenCalled();
        expect(getSmlEntry).toHaveBeenCalledTimes(1);
        expect(bulkMock).toHaveBeenCalledTimes(1);
        expect(bulkMock.mock.calls[0][0].operations[1].attributes.ingestion_method).toBe('crawled');
      });

      it('delete action proceeds regardless of manual entries', async () => {
        const getSmlEntry = jest.fn();
        const registry = createMockRegistry(
          createMockSmlTypeDefinition({ id: 'lens', getSmlEntry })
        );
        const logger = createMockLogger();
        const esClient = createMockEsClient();
        (esClient.count as jest.Mock).mockResolvedValue({ count: 1 });
        const indexer = createSmlIndexer({ registry, logger });

        await indexer.indexAttachment(
          createIndexerParams({
            originId: 'att-delete-protected',
            attachmentType: 'lens',
            action: 'delete',
            esClient,
          })
        );

        expect(esClient.count).not.toHaveBeenCalled();
        expect(getSmlEntry).not.toHaveBeenCalled();
        expect(esClient.deleteByQuery).toHaveBeenCalledTimes(1);
      });

      it('hasManualEntry treats unexpected ES errors as manual-entry-present (fail-closed)', async () => {
        // Fail-closed: a transient ES error skips the crawl tick rather than risking
        // destruction of admin-curated manual entries.
        const getSmlEntry = jest.fn();
        const registry = createMockRegistry(
          createMockSmlTypeDefinition({ id: 'lens', getSmlEntry })
        );
        const logger = createMockLogger();
        const esClient = createMockEsClient();
        (esClient.count as jest.Mock).mockRejectedValue(
          Object.assign(new Error('boom'), { statusCode: 500 })
        );
        const indexer = createSmlIndexer({ registry, logger });

        await indexer.indexAttachment(
          createIndexerParams({
            originId: 'att-flaky',
            attachmentType: 'lens',
            action: 'create',
            esClient,
            logger,
          })
        );

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('hasManualEntry check failed')
        );
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('fail-closed'));
        expect(getSmlEntry).not.toHaveBeenCalled();
        expect(esClient.deleteByQuery).not.toHaveBeenCalled();
        expect(bulkMock).not.toHaveBeenCalled();
      });

      it('hasManualEntry index_not_found still treats origin as fresh (no fail-closed)', async () => {
        // index_not_found is unambiguous — fail-closed here would block first-write crawls on new clusters.
        const smlEntry = { type: 'lens', title: 'T', content: 'c' };
        const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
        const registry = createMockRegistry(
          createMockSmlTypeDefinition({ id: 'lens', getSmlEntry })
        );
        const logger = createMockLogger();
        const esClient = createMockEsClient();
        (esClient.count as jest.Mock).mockRejectedValue(
          Object.assign(new Error('index_not_found_exception'), {
            statusCode: 404,
            body: { error: { type: 'index_not_found_exception' } },
          })
        );
        const indexer = createSmlIndexer({ registry, logger });

        await indexer.indexAttachment(
          createIndexerParams({
            originId: 'att-fresh',
            attachmentType: 'lens',
            action: 'create',
            esClient,
            logger,
          })
        );

        expect(getSmlEntry).toHaveBeenCalledTimes(1);
        expect(bulkMock).toHaveBeenCalledTimes(1);
      });
    });

    describe('getPermissions hook', () => {
      it('stamps fully-shaped empty permissions when type has no getPermissions hook', async () => {
        const smlEntry = { type: 'lens', title: 'No Perms', content: 'c' };
        const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
        const registry = createMockRegistry(
          createMockSmlTypeDefinition({ id: 'lens', getSmlEntry /* no getPermissions */ })
        );
        const logger = createMockLogger();
        const esClient = createMockEsClient();
        const indexer = createSmlIndexer({ registry, logger });

        await indexer.indexAttachment(
          createIndexerParams({
            originId: 'att-no-perms',
            attachmentType: 'lens',
            action: 'create',
            esClient,
          })
        );

        const bulkCall = bulkMock.mock.calls[0][0];
        expect(bulkCall.operations[1].permissions).toEqual({
          kibana: { privileges: [{ space: 'default', name: [], count: 0 }] },
        });
      });

      it('getPermissions returning zero actions: entry is still written with one `{ space, name: [], count: 0 }` element per space', async () => {
        // An empty action list must NOT drop the entry. Each space still gets its privilege
        // element; `count: 0` makes the ES-side `terms_set` (minimum_should_match_field: count)
        // require zero matches, so the entry stays visible — including in autocomplete — to any
        // caller with access to that space.
        const smlEntry = { type: 'lens', title: 'Zero Actions', content: 'c' };
        const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
        // what it falls back to if no-one implements the optional getPermissions hook
        const getPermissions = jest.fn().mockResolvedValue({
          kibana: { privileges: { name: [] } },
        });
        const registry = createMockRegistry(
          createMockSmlTypeDefinition({ id: 'lens', getSmlEntry, getPermissions })
        );
        const logger = createMockLogger();
        const esClient = createMockEsClient();
        const indexer = createSmlIndexer({ registry, logger });

        await indexer.indexAttachment(
          createIndexerParams({
            originId: 'att-zero-actions',
            attachmentType: 'lens',
            action: 'create',
            spaces: ['space-b', 'default'],
            esClient,
          })
        );

        expect(bulkMock).toHaveBeenCalledTimes(1);
        const bulkCall = bulkMock.mock.calls[0][0];
        expect(bulkCall.operations[1].permissions).toEqual({
          kibana: {
            privileges: [
              { space: 'default', name: [], count: 0 },
              { space: 'space-b', name: [], count: 0 },
            ],
          },
        });
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it('awaits async getPermissions and stamps the resolved value', async () => {
        const smlEntry = { type: 'lens', title: 'T', content: 'c' };
        const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
        const getPermissions = jest.fn().mockImplementation(
          async () =>
            new Promise<{
              kibana: { privileges: { name: string[] } };
            }>((resolve) =>
              setImmediate(() =>
                resolve({
                  kibana: { privileges: { name: ['ai_index:lens/read'] } },
                })
              )
            )
        );
        const registry = createMockRegistry(
          createMockSmlTypeDefinition({ id: 'lens', getSmlEntry, getPermissions })
        );
        const logger = createMockLogger();
        const esClient = createMockEsClient();
        const indexer = createSmlIndexer({ registry, logger });

        await indexer.indexAttachment(
          createIndexerParams({
            originId: 'att-async',
            attachmentType: 'lens',
            action: 'create',
            esClient,
          })
        );

        expect(getPermissions).toHaveBeenCalledTimes(1);
        const bulkCall = bulkMock.mock.calls[0][0];
        expect(bulkCall.operations[1].permissions).toEqual({
          kibana: {
            privileges: [{ space: 'default', name: ['ai_index:lens/read'], count: 1 }],
          },
        });
      });

      it('getPermissions returning partial shape gets folded into fully-shaped permissions', async () => {
        // Half-populated returns from a hand-written hook are normalised so
        // the document mapping always sees the kibana sub-array.
        const smlEntry = { type: 'lens', title: 'T', content: 'c' };
        const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
        const getPermissions = jest.fn().mockReturnValue({
          kibana: { privileges: { name: ['p1'] } },
        } as unknown);
        const registry = createMockRegistry(
          createMockSmlTypeDefinition({ id: 'lens', getSmlEntry, getPermissions })
        );
        const logger = createMockLogger();
        const esClient = createMockEsClient();
        const indexer = createSmlIndexer({ registry, logger });

        await indexer.indexAttachment(
          createIndexerParams({
            originId: 'att-partial',
            attachmentType: 'lens',
            action: 'create',
            esClient,
          })
        );

        const bulkCall = bulkMock.mock.calls[0][0];
        expect(bulkCall.operations[1].permissions).toEqual({
          kibana: {
            privileges: [{ space: 'default', name: ['p1'], count: 1 }],
          },
        });
      });

      it('getPermissions throw: propagates the throw and leaves existing entry intact (fail-closed)', async () => {
        // The throw propagates before any ES mutation: the existing entry
        // stays intact and no un-gated entry is written. Assert all three:
        //  - the throw bubbles out
        //  - deleteByQuery is never called (origin not wiped)
        //  - bulk is never called (no new entry written)
        const smlEntry = { type: 'lens', title: 'T', content: 'c' };
        const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
        const getPermissions = jest.fn().mockImplementation(() => {
          throw new Error('upstream lookup failed');
        });
        const registry = createMockRegistry(
          createMockSmlTypeDefinition({ id: 'lens', getSmlEntry, getPermissions })
        );
        const logger = createMockLogger();
        const esClient = createMockEsClient();
        const indexer = createSmlIndexer({ registry, logger });

        await expect(
          indexer.indexAttachment(
            createIndexerParams({
              originId: 'att-throws',
              attachmentType: 'lens',
              action: 'create',
              esClient,
            })
          )
        ).rejects.toThrow('upstream lookup failed');

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining("type 'lens' getPermissions threw for origin 'att-throws'")
        );
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('aborting origin-mode write')
        );
        expect(esClient.deleteByQuery).not.toHaveBeenCalled();
        expect(bulkMock).not.toHaveBeenCalled();
      });

      it('getPermissions is called once per origin', async () => {
        const smlEntry = { type: 'lens', title: 'A', content: 'a' };
        const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
        const getPermissions = jest.fn().mockResolvedValue({
          kibana: { privileges: { name: ['p1'] } },
        });
        const registry = createMockRegistry(
          createMockSmlTypeDefinition({ id: 'lens', getSmlEntry, getPermissions })
        );
        const logger = createMockLogger();
        const esClient = createMockEsClient();
        const indexer = createSmlIndexer({ registry, logger });

        await indexer.indexAttachment(
          createIndexerParams({
            originId: 'att-single',
            attachmentType: 'lens',
            action: 'create',
            esClient,
          })
        );

        expect(getPermissions).toHaveBeenCalledTimes(1);
        const ops = bulkMock.mock.calls[0][0].operations;
        expect(ops).toHaveLength(2);
        expect(ops[1].permissions).toEqual({
          kibana: {
            privileges: [{ space: 'default', name: ['p1'], count: 1 }],
          },
        });
      });

      it('normalizes a spaces list containing "*" to exactly ["*"]', async () => {
        const smlEntry = { type: 'dashboard', title: 'T', content: 'c' };
        const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
        const getPermissions = jest.fn().mockReturnValue({
          kibana: { privileges: { name: ['ai_index:dashboard/read'] } },
        });
        const registry = createMockRegistry(
          createMockSmlTypeDefinition({ id: 'dashboard', getSmlEntry, getPermissions })
        );
        const logger = createMockLogger();
        const esClient = createMockEsClient();
        const indexer = createSmlIndexer({ registry, logger });

        await indexer.indexAttachment(
          createIndexerParams({
            originId: 'dash-wildcard',
            attachmentType: 'dashboard',
            action: 'create',
            spaces: ['*'],
            esClient,
          })
        );

        const bulkCall = bulkMock.mock.calls[0][0];
        expect(bulkCall.operations[1].permissions).toEqual({
          kibana: {
            privileges: [{ space: '*', name: ['ai_index:dashboard/read'], count: 1 }],
          },
        });
      });

      it('dedupes duplicate raw privilege names before computing count', async () => {
        const smlEntry = { type: 'lens', title: 'T', content: 'c' };
        const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
        const getPermissions = jest.fn().mockReturnValue({
          kibana: { privileges: { name: ['p1', 'p1'] } },
        });
        const registry = createMockRegistry(
          createMockSmlTypeDefinition({ id: 'lens', getSmlEntry, getPermissions })
        );
        const logger = createMockLogger();
        const esClient = createMockEsClient();
        const indexer = createSmlIndexer({ registry, logger });

        await indexer.indexAttachment(
          createIndexerParams({
            originId: 'att-dedupe',
            attachmentType: 'lens',
            action: 'create',
            spaces: ['default'],
            esClient,
          })
        );

        const bulkCall = bulkMock.mock.calls[0][0];
        expect(bulkCall.operations[1].permissions).toEqual({
          kibana: {
            privileges: [{ space: 'default', name: ['p1'], count: 1 }],
          },
        });
      });

      it('skips indexing without deleting the existing entry when an item resolves to zero spaces', async () => {
        const smlEntry = { type: 'lens', title: 'T', content: 'c' };
        const getSmlEntry = jest.fn().mockResolvedValue(smlEntry);
        const registry = createMockRegistry(
          createMockSmlTypeDefinition({ id: 'lens', getSmlEntry })
        );
        const logger = createMockLogger();
        const esClient = createMockEsClient();
        const indexer = createSmlIndexer({ registry, logger });

        await indexer.indexAttachment(
          createIndexerParams({
            originId: 'att-no-spaces',
            attachmentType: 'lens',
            action: 'create',
            spaces: [],
            esClient,
            logger,
          })
        );

        expect(bulkMock).not.toHaveBeenCalled();
        // The existing entry must survive: the skip happens before the pre-index delete.
        expect(esClient.deleteByQuery).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('has no spaces — skipping (fail closed)')
        );
      });
    });
  });

  describe('deleteAttachment', () => {
    const createDeleteParams = (
      overrides: {
        originId?: string;
        attachmentType?: string;
        spaces?: string[];
        esClient?: jest.Mocked<ElasticsearchClient>;
        logger?: ReturnType<typeof createMockLogger>;
        ingestionMethod?: 'crawled' | 'manual' | 'all';
      } = {}
    ) => ({
      originId: overrides.originId ?? 'att-123',
      attachmentType: overrides.attachmentType ?? 'lens',
      spaces: overrides.spaces ?? ['default'],
      esClient: overrides.esClient ?? createMockEsClient(),
      savedObjectsClient: {} as unknown as ISavedObjectsRepository,
      logger: overrides.logger ?? createMockLogger(),
      ...(overrides.ingestionMethod !== undefined
        ? { ingestionMethod: overrides.ingestionMethod }
        : {}),
    });

    it('omits ingestion_method filter when ingestionMethod is "all" (wipes the entry for the origin)', async () => {
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens' }));
      const logger = createMockLogger();
      const esClient = createMockEsClient();
      const indexer = createSmlIndexer({ registry, logger });

      await indexer.deleteAttachment(
        createDeleteParams({ originId: 'att-wipe-all', ingestionMethod: 'all', esClient })
      );

      expect(esClient.deleteByQuery).toHaveBeenCalledTimes(1);
      const callArgs = (esClient.deleteByQuery as jest.Mock).mock.calls[0][0];
      // No ingestion_method term means both manual + crawled are removed.
      // Space guard is present because createDeleteParams defaults spaces to ['default'].
      expect(callArgs.query.bool.filter).toEqual([
        { term: { 'attributes.origin.uri': 'lens://att-wipe-all' } },
        {
          nested: {
            path: 'permissions.kibana.privileges',
            query: { terms: { 'permissions.kibana.privileges.space': ['default', '*'] } },
          },
        },
      ]);
    });

    it('filters on ingestion_method=manual when ingestionMethod is "manual"', async () => {
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens' }));
      const logger = createMockLogger();
      const esClient = createMockEsClient();
      const indexer = createSmlIndexer({ registry, logger });

      await indexer.deleteAttachment(
        createDeleteParams({ originId: 'att-wipe-manual', ingestionMethod: 'manual', esClient })
      );

      expect(esClient.deleteByQuery).toHaveBeenCalledTimes(1);
      const callArgs = (esClient.deleteByQuery as jest.Mock).mock.calls[0][0];
      expect(callArgs.query.bool.filter).toEqual([
        { term: { 'attributes.origin.uri': 'lens://att-wipe-manual' } },
        { term: { 'attributes.ingestion_method': 'manual' } },
        {
          nested: {
            path: 'permissions.kibana.privileges',
            query: { terms: { 'permissions.kibana.privileges.space': ['default', '*'] } },
          },
        },
      ]);
    });

    it('defaults to ingestionMethod="crawled" when omitted (back-compat with crawler/connector lifecycle callers)', async () => {
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens' }));
      const logger = createMockLogger();
      const esClient = createMockEsClient();
      const indexer = createSmlIndexer({ registry, logger });

      await indexer.deleteAttachment(
        createDeleteParams({ originId: 'att-default-scope', esClient })
      );

      expect(esClient.deleteByQuery).toHaveBeenCalledTimes(1);
      const callArgs = (esClient.deleteByQuery as jest.Mock).mock.calls[0][0];
      expect(callArgs.query.bool.filter).toEqual([
        { term: { 'attributes.origin.uri': 'lens://att-default-scope' } },
        { term: { 'attributes.ingestion_method': 'crawled' } },
        {
          nested: {
            path: 'permissions.kibana.privileges',
            query: { terms: { 'permissions.kibana.privileges.space': ['default', '*'] } },
          },
        },
      ]);
    });

    it('scopes delete to caller space via nested space filter', async () => {
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens' }));
      const logger = createMockLogger();
      const esClient = createMockEsClient();
      const indexer = createSmlIndexer({ registry, logger });

      await indexer.deleteAttachment(
        createDeleteParams({
          originId: 'att-space-a',
          ingestionMethod: 'all',
          spaces: ['space-a'],
          esClient,
        })
      );

      const callArgs = (esClient.deleteByQuery as jest.Mock).mock.calls[0][0];
      expect(callArgs.query.bool.filter).toContainEqual({
        nested: {
          path: 'permissions.kibana.privileges',
          query: { terms: { 'permissions.kibana.privileges.space': ['space-a', '*'] } },
        },
      });
    });

    it('omits space filter when spaces is empty (global delete for crawler)', async () => {
      const registry = createMockRegistry(createMockSmlTypeDefinition({ id: 'lens' }));
      const logger = createMockLogger();
      const esClient = createMockEsClient();
      const indexer = createSmlIndexer({ registry, logger });

      await indexer.deleteAttachment(
        createDeleteParams({ originId: 'att-global', ingestionMethod: 'all', spaces: [], esClient })
      );

      const callArgs = (esClient.deleteByQuery as jest.Mock).mock.calls[0][0];
      // No space guard when spaces is empty — global delete.
      expect(callArgs.query.bool.filter).toEqual([
        { term: { 'attributes.origin.uri': 'lens://att-global' } },
      ]);
    });
  });
});
