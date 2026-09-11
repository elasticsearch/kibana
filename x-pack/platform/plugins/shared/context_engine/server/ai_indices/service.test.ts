/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import type { DiagnosticResult } from '@elastic/elasticsearch';
import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { AiIndexService } from './service';
import {
  InvalidAiIndexDestError,
  AiIndexConflictError,
  AiIndexManagedError,
  AiIndexNotFoundError,
  AiIndexIdConflictError,
  AiIndexAlreadyExistsError,
} from './errors';
import { MAX_AI_INDEX_AUTOMATIONS } from '../../common/constants';
import type { AiIndexDocument, AiIndexStorageClient } from './storage';
import { createAiIndexStorageClient } from './storage';

jest.mock('./storage', () => ({
  ...jest.requireActual('./storage'),
  createAiIndexStorageClient: jest.fn(),
}));

const createAiIndexStorageClientMock = createAiIndexStorageClient as jest.Mock;

const createNotFoundError = () =>
  new errors.ResponseError({
    meta: {
      aborted: false,
      attempts: 1,
      connection: null,
      context: null,
      name: 'resource_not_found_exception',
      request: {} as unknown as DiagnosticResult['meta']['request'],
    },
    warnings: [],
    body: 'resource_not_found_exception',
    statusCode: 404,
  });

const createConflictError = () =>
  new errors.ResponseError({
    meta: {
      aborted: false,
      attempts: 1,
      connection: null,
      context: null,
      name: 'version_conflict_engine_exception',
      request: {} as unknown as DiagnosticResult['meta']['request'],
    },
    warnings: [],
    body: 'version_conflict_engine_exception',
    statusCode: 409,
  });

const DEFAULT_SPACE = 'default';
const docId = (aiIndexId: string, spaceId = DEFAULT_SPACE) => `${spaceId}:${aiIndexId}`;

const aiIndexDocument: AiIndexDocument = {
  id: 'customer_support',
  space: DEFAULT_SPACE,
  description: 'KIs representing previously answered, commonly asked questions',
  managed: false,
  dest: { type: 'data_stream', value: 'ai-index-ds-customer_support*' },
  automations: [{ type: 'workflow', value: 'nightly-refresh' }],
  sources: [{ type: 'esql', value: 'FROM ai-index-customer_support | LIMIT 10' }],
  date_created: '2026-07-08T12:10:30.000Z',
  date_modified: '2026-07-08T12:10:30.000Z',
};

const toHttpItem = (document: AiIndexDocument) => {
  const { space: _space, ...item } = document;
  return item;
};

describe('AiIndexService', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;
  let storageClient: jest.Mocked<Pick<AiIndexStorageClient, 'get' | 'index' | 'search' | 'delete'>>;
  let service: AiIndexService;

  beforeEach(() => {
    jest.clearAllMocks();
    esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.indices.resolveIndex.mockResponse({
      indices: [],
      aliases: [],
      data_streams: [
        {
          name: 'ai-index-ds-customer_support',
          backing_indices: [],
          timestamp_field: '@timestamp',
        },
      ],
    });

    storageClient = {
      get: jest.fn(),
      index: jest.fn(),
      search: jest.fn(),
      delete: jest.fn(),
    };
    createAiIndexStorageClientMock.mockReturnValue(storageClient);

    service = new AiIndexService({
      esClient,
      logger: loggingSystemMock.createLogger(),
    });
  });

  const properties = {
    description: 'KIs representing previously answered, commonly asked questions',
    dest: { type: 'data_stream' as const, value: 'ai-index-ds-customer_support*' },
    automations: [{ type: 'workflow' as const, value: 'nightly-refresh' }],
    sources: [{ type: 'esql' as const, value: 'FROM ai-index-customer_support | LIMIT 10' }],
  };

  describe('create', () => {
    it('creates with op_type create, without looking up the existing document', async () => {
      await expect(
        service.create('customer_support', DEFAULT_SPACE, properties)
      ).resolves.toBeUndefined();

      expect(storageClient.get).not.toHaveBeenCalled();
      expect(storageClient.index).toHaveBeenCalledWith({
        id: docId('customer_support'),
        op_type: 'create',
        refresh: 'wait_for',
        document: expect.objectContaining({
          ...properties,
          id: 'customer_support',
          space: DEFAULT_SPACE,
          date_created: expect.any(String),
          date_modified: expect.any(String),
        }),
      });
    });

    it('throws AiIndexAlreadyExistsError when the id already exists (409)', async () => {
      storageClient.index.mockRejectedValue(createConflictError());

      await expect(
        service.create('customer_support', DEFAULT_SPACE, properties)
      ).rejects.toBeInstanceOf(AiIndexAlreadyExistsError);
    });

    it('refuses to create a reserved managed id', async () => {
      service = new AiIndexService({
        esClient,
        logger: loggingSystemMock.createLogger(),
        managedBootstrap: {
          isManaged: (id) => id === 'elastic',
          getManagedIds: () => ['elastic'],
          ensure: jest.fn(),
        },
      });

      await expect(service.create('elastic', DEFAULT_SPACE, properties)).rejects.toBeInstanceOf(
        AiIndexManagedError
      );
      expect(storageClient.index).not.toHaveBeenCalled();
    });

    it('rejects an invalid dest before writing', async () => {
      await expect(
        service.create('customer_support', DEFAULT_SPACE, {
          ...properties,
          dest: { type: 'data_stream', value: 'customer_support*' },
        })
      ).rejects.toBeInstanceOf(InvalidAiIndexDestError);
      expect(storageClient.index).not.toHaveBeenCalled();
    });
  });

  describe('put', () => {
    it('creates an AI index with op_type create when none exists', async () => {
      storageClient.get.mockRejectedValue(createNotFoundError());

      await expect(service.put('customer_support', DEFAULT_SPACE, properties)).resolves.toBe(
        'created'
      );

      expect(storageClient.index).toHaveBeenCalledWith({
        id: docId('customer_support'),
        op_type: 'create',
        refresh: 'wait_for',
        document: expect.objectContaining({
          ...properties,
          id: 'customer_support',
          space: DEFAULT_SPACE,
          managed: false,
          date_created: expect.any(String),
          date_modified: expect.any(String),
        }),
      });
    });

    it('updates an existing AI index, preserving date_created and asserting seq_no', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _seq_no: 7,
        _primary_term: 2,
        _source: aiIndexDocument,
      });

      await expect(service.put('customer_support', DEFAULT_SPACE, properties)).resolves.toBe(
        'updated'
      );

      // The search-based get only returns _seq_no/_primary_term when asked.
      expect(storageClient.get).toHaveBeenCalledWith({
        id: docId('customer_support'),
        seq_no_primary_term: true,
      });

      const [indexArgs] = storageClient.index.mock.calls[0];
      expect(indexArgs.if_seq_no).toBe(7);
      expect(indexArgs.if_primary_term).toBe(2);
      expect(indexArgs.document?.date_created).toBe(aiIndexDocument.date_created);
      expect(indexArgs.document?.date_modified).not.toBe(aiIndexDocument.date_modified);
    });

    it('persists feedback_analysis when updating an existing AI index', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _seq_no: 7,
        _primary_term: 2,
        _source: aiIndexDocument,
      });

      await expect(
        service.put('customer_support', DEFAULT_SPACE, {
          ...properties,
          feedback_analysis: { enabled: true, agent_id: 'my-analysis-agent' },
        })
      ).resolves.toBe('updated');

      const [indexArgs] = storageClient.index.mock.calls[0];
      expect(indexArgs.document?.feedback_analysis).toEqual({
        enabled: true,
        agent_id: 'my-analysis-agent',
      });
    });

    it('throws AiIndexConflictError when a concurrent create wins (409)', async () => {
      storageClient.get.mockRejectedValue(createNotFoundError());
      storageClient.index.mockRejectedValue(createConflictError());

      await expect(
        service.put('customer_support', DEFAULT_SPACE, properties)
      ).rejects.toBeInstanceOf(AiIndexConflictError);
    });

    it('throws AiIndexConflictError when a concurrent update wins (409)', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _seq_no: 7,
        _primary_term: 2,
        _source: aiIndexDocument,
      });
      storageClient.index.mockRejectedValue(createConflictError());

      await expect(
        service.put('customer_support', DEFAULT_SPACE, properties)
      ).rejects.toBeInstanceOf(AiIndexConflictError);
    });

    it('throws AiIndexManagedError when the entry is managed', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _seq_no: 1,
        _primary_term: 1,
        _source: { ...aiIndexDocument, managed: true },
      });

      await expect(
        service.put('customer_support', DEFAULT_SPACE, properties)
      ).rejects.toBeInstanceOf(AiIndexManagedError);
      expect(storageClient.index).not.toHaveBeenCalled();
    });

    it('refuses to put a reserved managed id that does not exist yet', async () => {
      storageClient.get.mockRejectedValue(createNotFoundError());
      service = new AiIndexService({
        esClient,
        logger: loggingSystemMock.createLogger(),
        managedBootstrap: {
          isManaged: (id) => id === 'elastic',
          getManagedIds: () => ['elastic'],
          ensure: jest.fn(),
        },
      });

      await expect(service.put('elastic', DEFAULT_SPACE, properties)).rejects.toBeInstanceOf(
        AiIndexManagedError
      );
      expect(storageClient.index).not.toHaveBeenCalled();
    });

    it('allows a data_stream dest with no matches yet (lazy creation)', async () => {
      esClient.indices.resolveIndex.mockResponse({ indices: [], aliases: [], data_streams: [] });
      storageClient.get.mockRejectedValue(createNotFoundError());

      await expect(service.put('customer_support', DEFAULT_SPACE, properties)).resolves.toBe(
        'created'
      );
      expect(storageClient.index).toHaveBeenCalled();
    });

    it('allows a data_stream dest when resolveIndex returns 404', async () => {
      esClient.indices.resolveIndex.mockRejectedValue(createNotFoundError());
      storageClient.get.mockRejectedValue(createNotFoundError());

      await expect(service.put('customer_support', DEFAULT_SPACE, properties)).resolves.toBe(
        'created'
      );
      expect(storageClient.index).toHaveBeenCalled();
    });

    it('rejects a data_stream dest when a plain index exists at that name', async () => {
      esClient.indices.resolveIndex.mockResponse({
        indices: [{ name: 'ai-index-ds-customer_support', attributes: ['open'] }],
        aliases: [],
        data_streams: [],
      });

      await expect(
        service.put('customer_support', DEFAULT_SPACE, properties)
      ).rejects.toBeInstanceOf(InvalidAiIndexDestError);
      expect(storageClient.index).not.toHaveBeenCalled();
    });

    it('rejects a data_stream dest value not prefixed with ai-index-ds- without resolving it', async () => {
      await expect(
        service.put('customer_support', DEFAULT_SPACE, {
          ...properties,
          dest: { type: 'data_stream', value: 'customer_support*' },
        })
      ).rejects.toBeInstanceOf(InvalidAiIndexDestError);
      expect(esClient.indices.resolveIndex).not.toHaveBeenCalled();
      expect(storageClient.index).not.toHaveBeenCalled();
    });

    it('rejects a data_stream dest not prefixed with ai-index-ds-', async () => {
      esClient.indices.resolveIndex.mockResponse({
        indices: [],
        aliases: [],
        data_streams: [
          {
            name: 'ai-index-idx-customer_support',
            backing_indices: [],
            timestamp_field: '@timestamp',
          },
        ],
      });

      await expect(
        service.put('customer_support', DEFAULT_SPACE, properties)
      ).rejects.toBeInstanceOf(InvalidAiIndexDestError);
      expect(storageClient.index).not.toHaveBeenCalled();
    });

    const indexProperties = {
      ...properties,
      dest: { type: 'index' as const, value: 'ai-index-idx-logs-*' },
    };

    it('creates an index AI index when the value matches an index', async () => {
      esClient.indices.resolveIndex.mockResponse({
        indices: [{ name: 'ai-index-idx-logs-app', attributes: ['open'] }],
        aliases: [],
        data_streams: [],
      });
      storageClient.get.mockRejectedValue(createNotFoundError());

      await expect(service.put('logs', DEFAULT_SPACE, indexProperties)).resolves.toBe('created');
      expect(storageClient.index).toHaveBeenCalled();
    });

    it('allows an index dest that matches no index yet (lazy creation)', async () => {
      esClient.indices.resolveIndex.mockResponse({
        indices: [],
        aliases: [],
        data_streams: [],
      });
      storageClient.get.mockRejectedValue(createNotFoundError());

      await expect(service.put('logs', DEFAULT_SPACE, indexProperties)).resolves.toBe('created');
      expect(storageClient.index).toHaveBeenCalled();
    });

    it('rejects an index dest when a data stream exists at that name', async () => {
      esClient.indices.resolveIndex.mockResponse({
        indices: [],
        aliases: [],
        data_streams: [
          { name: 'ai-index-idx-logs', backing_indices: [], timestamp_field: '@timestamp' },
        ],
      });

      await expect(service.put('logs', DEFAULT_SPACE, indexProperties)).rejects.toBeInstanceOf(
        InvalidAiIndexDestError
      );
      expect(storageClient.index).not.toHaveBeenCalled();
    });

    it('rejects a system index dest', async () => {
      esClient.indices.resolveIndex.mockResponse({
        indices: [{ name: 'ai-index-idx-security', attributes: ['open', 'hidden', 'system'] }],
        aliases: [],
        data_streams: [],
      });

      await expect(service.put('logs', DEFAULT_SPACE, indexProperties)).rejects.toBeInstanceOf(
        InvalidAiIndexDestError
      );
      expect(storageClient.index).not.toHaveBeenCalled();
    });

    it('allows a hidden but non-system index dest', async () => {
      esClient.indices.resolveIndex.mockResponse({
        indices: [{ name: 'ai-index-idx-sml-data', attributes: ['open', 'hidden'] }],
        aliases: [],
        data_streams: [],
      });
      storageClient.get.mockRejectedValue(createNotFoundError());

      await expect(service.put('logs', DEFAULT_SPACE, indexProperties)).resolves.toBe('created');
      // Hidden indices only resolve when expand_wildcards includes them.
      expect(esClient.indices.resolveIndex).toHaveBeenCalledWith({
        name: indexProperties.dest.value,
        expand_wildcards: ['open', 'hidden', 'closed'],
      });
      expect(storageClient.index).toHaveBeenCalled();
    });

    it('allows a closed hidden but non-system index dest', async () => {
      esClient.indices.resolveIndex.mockResponse({
        indices: [{ name: 'ai-index-idx-sml-data', attributes: ['closed', 'hidden'] }],
        aliases: [],
        data_streams: [],
      });
      storageClient.get.mockRejectedValue(createNotFoundError());

      await expect(service.put('logs', DEFAULT_SPACE, indexProperties)).resolves.toBe('created');
      // Closed indices only resolve when expand_wildcards includes 'closed'.
      expect(esClient.indices.resolveIndex).toHaveBeenCalledWith({
        name: indexProperties.dest.value,
        expand_wildcards: ['open', 'hidden', 'closed'],
      });
      expect(storageClient.index).toHaveBeenCalled();
    });

    it('rejects a mixed expression that includes a system index', async () => {
      esClient.indices.resolveIndex.mockResponse({
        indices: [
          { name: 'ai-index-idx-logs-app', attributes: ['open'] },
          { name: 'ai-index-idx-kibana', attributes: ['open', 'hidden', 'system'] },
        ],
        aliases: [],
        data_streams: [],
      });

      await expect(
        service.put('logs', DEFAULT_SPACE, {
          ...indexProperties,
          dest: { type: 'index', value: 'ai-index-idx-logs-*,ai-index-idx-kibana*' },
        })
      ).rejects.toBeInstanceOf(InvalidAiIndexDestError);
      expect(storageClient.index).not.toHaveBeenCalled();
    });

    it('rejects an index dest value not prefixed with ai-index-idx- without resolving it', async () => {
      await expect(
        service.put('logs', DEFAULT_SPACE, {
          ...indexProperties,
          dest: { type: 'index', value: '.kibana*' },
        })
      ).rejects.toBeInstanceOf(InvalidAiIndexDestError);
      expect(esClient.indices.resolveIndex).not.toHaveBeenCalled();
      expect(storageClient.index).not.toHaveBeenCalled();
    });

    it('rejects a mixed expression when one expression lacks the prefix', async () => {
      await expect(
        service.put('logs', DEFAULT_SPACE, {
          ...indexProperties,
          dest: { type: 'index', value: 'ai-index-idx-logs-*,.kibana*' },
        })
      ).rejects.toBeInstanceOf(InvalidAiIndexDestError);
      expect(esClient.indices.resolveIndex).not.toHaveBeenCalled();
      expect(storageClient.index).not.toHaveBeenCalled();
    });

    it('rejects an index dest not prefixed with ai-index-idx-', async () => {
      esClient.indices.resolveIndex.mockResponse({
        indices: [{ name: 'ai-index-logs-app', attributes: ['open'] }],
        aliases: [],
        data_streams: [],
      });

      await expect(service.put('logs', DEFAULT_SPACE, indexProperties)).rejects.toBeInstanceOf(
        InvalidAiIndexDestError
      );
      expect(storageClient.index).not.toHaveBeenCalled();
    });
  });

  describe('putManaged', () => {
    const managedProperties = {
      description: 'Elastic managed AI index',
      dest: { type: 'index' as const, value: 'ai-index-idx-sml-data' },
      automations: [],
      sources: [],
    };

    const mockValidIndexDest = () =>
      esClient.indices.resolveIndex.mockResponse({
        indices: [{ name: 'ai-index-idx-sml-data', attributes: ['open'] }],
        aliases: [],
        data_streams: [],
      });

    it('writes managed: true to the document', async () => {
      mockValidIndexDest();
      storageClient.get.mockRejectedValue(createNotFoundError());

      await expect(service.putManaged('elastic', DEFAULT_SPACE, managedProperties)).resolves.toBe(
        'created'
      );

      expect(storageClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          id: docId('elastic'),
          document: expect.objectContaining({
            id: 'elastic',
            space: DEFAULT_SPACE,
            managed: true,
          }),
        })
      );
    });

    it('overwrites an existing managed entry (idempotent upsert)', async () => {
      mockValidIndexDest();
      storageClient.get.mockResolvedValue({
        _id: docId('elastic'),
        _index: '.contextengine-ai-indices',
        found: true,
        _seq_no: 7,
        _primary_term: 2,
        _source: {
          ...aiIndexDocument,
          id: 'elastic',
          managed: true,
        },
      });

      await expect(service.putManaged('elastic', DEFAULT_SPACE, managedProperties)).resolves.toBe(
        'updated'
      );

      const [indexArgs] = storageClient.index.mock.calls[0];
      expect(indexArgs.if_seq_no).toBe(7);
      expect(indexArgs.if_primary_term).toBe(2);
      expect(indexArgs.document?.managed).toBe(true);
    });

    it('throws AiIndexIdConflictError when the id is taken by an unmanaged entry', async () => {
      mockValidIndexDest();
      storageClient.get.mockResolvedValue({
        _id: docId('elastic'),
        _index: '.contextengine-ai-indices',
        found: true,
        _source: {
          ...aiIndexDocument,
          id: 'elastic',
          managed: false,
        },
      });

      await expect(
        service.putManaged('elastic', DEFAULT_SPACE, managedProperties)
      ).rejects.toBeInstanceOf(AiIndexIdConflictError);
      expect(storageClient.index).not.toHaveBeenCalled();
    });
  });

  describe('setFeedbackAnalysis', () => {
    const feedbackAnalysis = {
      enabled: true,
      agent_id: 'my-analysis-agent',
      schedule: { interval: '24h' },
      signal_time_range: { type: 'relative' as const, from: 'now-30d' },
    };

    const mockStored = (document: AiIndexDocument) => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _seq_no: 7,
        _primary_term: 2,
        _source: document,
      });
    };

    it('writes the block and leaves the rest of the entry untouched', async () => {
      mockStored(aiIndexDocument);

      await expect(
        service.setFeedbackAnalysis('customer_support', DEFAULT_SPACE, feedbackAnalysis)
      ).resolves.toEqual(feedbackAnalysis);

      const [indexArgs] = storageClient.index.mock.calls[0];
      expect(indexArgs.document).toEqual(
        expect.objectContaining({
          feedback_analysis: feedbackAnalysis,
          description: aiIndexDocument.description,
          dest: aiIndexDocument.dest,
          automations: aiIndexDocument.automations,
          sources: aiIndexDocument.sources,
          date_created: aiIndexDocument.date_created,
        })
      );
    });

    it('guards the write with optimistic concurrency control', async () => {
      mockStored(aiIndexDocument);

      await service.setFeedbackAnalysis('customer_support', DEFAULT_SPACE, feedbackAnalysis);

      const [indexArgs] = storageClient.index.mock.calls[0];
      expect(indexArgs.if_seq_no).toBe(7);
      expect(indexArgs.if_primary_term).toBe(2);
    });

    it('is permitted on managed AI indices, and preserves the managed flag', async () => {
      mockStored({ ...aiIndexDocument, managed: true });

      await expect(
        service.setFeedbackAnalysis('customer_support', DEFAULT_SPACE, feedbackAnalysis)
      ).resolves.toEqual(feedbackAnalysis);

      const [indexArgs] = storageClient.index.mock.calls[0];
      expect(indexArgs.document?.managed).toBe(true);
    });

    it('replaces the previous block rather than merging into it', async () => {
      mockStored({
        ...aiIndexDocument,
        feedback_analysis: { enabled: true, agent_id: 'previous-agent' },
      });

      await service.setFeedbackAnalysis('customer_support', DEFAULT_SPACE, { enabled: false });

      const [indexArgs] = storageClient.index.mock.calls[0];
      expect(indexArgs.document?.feedback_analysis).toEqual({ enabled: false });
    });

    it('does not re-validate the dest, so a stale backing store can still be switched off', async () => {
      mockStored(aiIndexDocument);

      await service.setFeedbackAnalysis('customer_support', DEFAULT_SPACE, { enabled: false });

      expect(esClient.indices.resolveIndex).not.toHaveBeenCalled();
    });

    it('throws AiIndexNotFoundError when the AI index does not exist', async () => {
      storageClient.get.mockRejectedValue(createNotFoundError());

      await expect(
        service.setFeedbackAnalysis('missing', DEFAULT_SPACE, feedbackAnalysis)
      ).rejects.toBeInstanceOf(AiIndexNotFoundError);
      expect(storageClient.index).not.toHaveBeenCalled();
    });

    it('throws AiIndexConflictError when a concurrent write wins (409)', async () => {
      mockStored(aiIndexDocument);
      storageClient.index.mockRejectedValue(createConflictError());

      await expect(
        service.setFeedbackAnalysis('customer_support', DEFAULT_SPACE, feedbackAnalysis)
      ).rejects.toBeInstanceOf(AiIndexConflictError);
    });
  });

  describe('get', () => {
    it('returns the AI index with its id', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _source: aiIndexDocument,
      });

      await expect(service.get('customer_support', DEFAULT_SPACE)).resolves.toEqual(
        toHttpItem(aiIndexDocument)
      );
    });

    it('defaults managed to false for legacy documents without the field', async () => {
      const legacyDocument = { ...aiIndexDocument };
      delete (legacyDocument as { managed?: boolean }).managed;
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _source: legacyDocument,
      });

      await expect(service.get('customer_support', DEFAULT_SPACE)).resolves.toEqual(
        expect.objectContaining({ id: 'customer_support', managed: false })
      );
    });

    it('round-trips feedback_analysis from the stored document to the item', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _source: {
          ...aiIndexDocument,
          feedback_analysis: {
            enabled: true,
            agent_id: 'my-analysis-agent',
            schedule: { interval: '24h' },
            signal_time_range: { type: 'relative' as const, from: 'now-30d' },
          },
        },
      });

      await expect(service.get('customer_support', DEFAULT_SPACE)).resolves.toEqual(
        expect.objectContaining({
          feedback_analysis: {
            enabled: true,
            agent_id: 'my-analysis-agent',
            schedule: { interval: '24h' },
            signal_time_range: { type: 'relative', from: 'now-30d' },
          },
        })
      );
    });

    it('omits feedback_analysis when the stored document has none', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _source: aiIndexDocument,
      });

      await expect(service.get('customer_support', DEFAULT_SPACE)).resolves.not.toHaveProperty(
        'feedback_analysis'
      );
    });

    it('persists feedback_analysis when creating an AI index', async () => {
      await service.create('customer_support', DEFAULT_SPACE, {
        ...properties,
        feedback_analysis: { enabled: false, agent_id: 'my-analysis-agent' },
      });

      expect(storageClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            feedback_analysis: { enabled: false, agent_id: 'my-analysis-agent' },
          }),
        })
      );
    });

    it('throws AiIndexNotFoundError when the AI index does not exist', async () => {
      storageClient.get.mockRejectedValue(createNotFoundError());

      await expect(service.get('missing', DEFAULT_SPACE)).rejects.toBeInstanceOf(
        AiIndexNotFoundError
      );
    });

    it('throws AiIndexNotFoundError when the stored document belongs to another space', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('ops_logs', 'team'),
        _index: '.contextengine-ai-indices',
        found: true,
        _source: { ...aiIndexDocument, id: 'ops_logs', space: 'team' },
      });

      await expect(service.get('ops_logs', 'team_ops')).rejects.toBeInstanceOf(
        AiIndexNotFoundError
      );
    });

    it('rethrows unexpected errors', async () => {
      storageClient.get.mockRejectedValue(new Error('boom'));

      await expect(service.get('customer_support', DEFAULT_SPACE)).rejects.toThrow('boom');
    });

    it('ensures a missing managed AI index and returns it', async () => {
      const managedDocument: AiIndexDocument = {
        ...aiIndexDocument,
        id: 'elastic',
        managed: true,
      };
      const ensure = jest.fn().mockImplementation(async () => {
        storageClient.get.mockResolvedValue({
          _id: docId('elastic'),
          _index: '.contextengine-ai-indices',
          found: true,
          _source: managedDocument,
        });
      });
      storageClient.get.mockRejectedValueOnce(createNotFoundError());
      service = new AiIndexService({
        esClient,
        logger: loggingSystemMock.createLogger(),
        managedBootstrap: {
          isManaged: (id) => id === 'elastic',
          getManagedIds: () => ['elastic'],
          ensure,
        },
      });

      await expect(service.get('elastic', DEFAULT_SPACE)).resolves.toEqual(
        toHttpItem(managedDocument)
      );
      expect(ensure).toHaveBeenCalledWith('elastic', DEFAULT_SPACE);
    });

    it('throws AiIndexNotFoundError when managed ensure succeeds but the document is still missing', async () => {
      const ensure = jest.fn().mockResolvedValue(undefined);
      storageClient.get.mockRejectedValue(createNotFoundError());
      service = new AiIndexService({
        esClient,
        logger: loggingSystemMock.createLogger(),
        managedBootstrap: {
          isManaged: (id) => id === 'elastic',
          getManagedIds: () => ['elastic'],
          ensure,
        },
      });

      await expect(service.get('elastic', DEFAULT_SPACE)).rejects.toBeInstanceOf(
        AiIndexNotFoundError
      );
      expect(ensure).toHaveBeenCalledWith('elastic', DEFAULT_SPACE);
    });

    it('rethrows when managed ensure fails', async () => {
      const ensure = jest.fn().mockRejectedValue(new InvalidAiIndexDestError('dest not ready'));
      storageClient.get.mockRejectedValue(createNotFoundError());
      service = new AiIndexService({
        esClient,
        logger: loggingSystemMock.createLogger(),
        managedBootstrap: {
          isManaged: (id) => id === 'elastic',
          getManagedIds: () => ['elastic'],
          ensure,
        },
      });

      await expect(service.get('elastic', DEFAULT_SPACE)).rejects.toBeInstanceOf(
        InvalidAiIndexDestError
      );
    });
  });

  describe('list', () => {
    it('returns AI indices mapped from search hits, asking ES to sort by id', async () => {
      const billingDocument: AiIndexDocument = {
        ...aiIndexDocument,
        id: 'billing',
      };
      storageClient.search.mockResolvedValue({
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: {
          hits: [
            {
              _id: docId('billing'),
              _index: '.contextengine-ai-indices',
              _source: billingDocument,
            },
            {
              _id: docId('customer_support'),
              _index: '.contextengine-ai-indices',
              _source: aiIndexDocument,
            },
          ],
        },
      } as unknown as Awaited<ReturnType<AiIndexStorageClient['search']>>);

      await expect(service.list(DEFAULT_SPACE)).resolves.toEqual([
        toHttpItem(billingDocument),
        toHttpItem(aiIndexDocument),
      ]);

      expect(storageClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          size: 100,
          query: { term: { space: DEFAULT_SPACE } },
          sort: [{ id: 'asc' }],
        })
      );
    });

    it('ensures missing managed AI indices and re-lists', async () => {
      const managedDocument: AiIndexDocument = {
        ...aiIndexDocument,
        id: 'elastic',
        managed: true,
      };
      const emptySearch = {
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: { hits: [] },
      } as unknown as Awaited<ReturnType<AiIndexStorageClient['search']>>;
      const filledSearch = {
        ...emptySearch,
        hits: {
          hits: [
            {
              _id: docId('elastic'),
              _index: '.contextengine-ai-indices',
              _source: managedDocument,
            },
          ],
        },
      } as unknown as Awaited<ReturnType<AiIndexStorageClient['search']>>;
      const ensure = jest.fn().mockResolvedValue(undefined);
      storageClient.search.mockResolvedValueOnce(emptySearch).mockResolvedValueOnce(filledSearch);
      service = new AiIndexService({
        esClient,
        logger: loggingSystemMock.createLogger(),
        managedBootstrap: {
          isManaged: (id) => id === 'elastic',
          getManagedIds: () => ['elastic'],
          ensure,
        },
      });

      await expect(service.list(DEFAULT_SPACE)).resolves.toEqual([toHttpItem(managedDocument)]);
      expect(ensure).toHaveBeenCalledWith('elastic', DEFAULT_SPACE);
      expect(storageClient.search).toHaveBeenCalledTimes(2);
    });

    it('logs and continues when one managed AI index fails to bootstrap, returning the rest', async () => {
      const okDocument: AiIndexDocument = { ...aiIndexDocument, id: 'ok', managed: true };
      const emptySearch = {
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: { hits: [] },
      } as unknown as Awaited<ReturnType<AiIndexStorageClient['search']>>;
      const filledSearch = {
        ...emptySearch,
        hits: {
          hits: [
            {
              _id: docId('ok'),
              _index: '.contextengine-ai-indices',
              _source: okDocument,
            },
          ],
        },
      } as unknown as Awaited<ReturnType<AiIndexStorageClient['search']>>;
      storageClient.search.mockResolvedValueOnce(emptySearch).mockResolvedValueOnce(filledSearch);
      const logger = loggingSystemMock.createLogger();
      const ensure = jest.fn().mockImplementation(async (id: string) => {
        if (id === 'broken') {
          throw new InvalidAiIndexDestError('dest is invalid');
        }
      });
      service = new AiIndexService({
        esClient,
        logger,
        managedBootstrap: {
          isManaged: (id) => id === 'ok' || id === 'broken',
          getManagedIds: () => ['ok', 'broken'],
          ensure,
        },
      });

      await expect(service.list(DEFAULT_SPACE)).resolves.toEqual([toHttpItem(okDocument)]);
      expect(ensure).toHaveBeenCalledWith('ok', DEFAULT_SPACE);
      expect(ensure).toHaveBeenCalledWith('broken', DEFAULT_SPACE);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('broken'));
    });
  });

  describe('delete', () => {
    it('resolves when the AI index is deleted', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _source: aiIndexDocument,
      });
      storageClient.delete.mockResolvedValue({ acknowledged: true, result: 'deleted' });

      await expect(service.delete('customer_support', DEFAULT_SPACE)).resolves.toBeUndefined();
      expect(storageClient.delete).toHaveBeenCalledWith({ id: docId('customer_support') });
    });

    it('throws AiIndexNotFoundError when the AI index does not exist', async () => {
      storageClient.get.mockRejectedValue(createNotFoundError());

      await expect(service.delete('missing', DEFAULT_SPACE)).rejects.toBeInstanceOf(
        AiIndexNotFoundError
      );
      expect(storageClient.delete).not.toHaveBeenCalled();
    });

    it('throws AiIndexManagedError when the entry is managed', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _source: { ...aiIndexDocument, managed: true },
      });

      await expect(service.delete('customer_support', DEFAULT_SPACE)).rejects.toBeInstanceOf(
        AiIndexManagedError
      );
      expect(storageClient.delete).not.toHaveBeenCalled();
    });

    it('throws AiIndexNotFoundError when the entry is removed concurrently', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _source: aiIndexDocument,
      });
      storageClient.delete.mockResolvedValue({ acknowledged: true, result: 'not_found' });

      await expect(service.delete('customer_support', DEFAULT_SPACE)).rejects.toBeInstanceOf(
        AiIndexNotFoundError
      );
    });
  });

  describe('assertCanAcceptAutomation', () => {
    it('throws AiIndexNotFoundError when the AI index does not exist', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('missing'),
        _index: '.contextengine-ai-indices',
        found: false,
      });

      await expect(
        service.assertCanAcceptAutomation('missing', DEFAULT_SPACE)
      ).rejects.toBeInstanceOf(AiIndexNotFoundError);
    });

    it('throws AiIndexManagedError when the entry is managed', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _seq_no: 1,
        _primary_term: 1,
        _source: { ...aiIndexDocument, managed: true },
      });

      await expect(
        service.assertCanAcceptAutomation('customer_support', DEFAULT_SPACE, {
          type: 'workflow',
          value: 'wf-new',
        })
      ).rejects.toBeInstanceOf(AiIndexManagedError);
    });

    it('rejects when the automation limit is reached', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _seq_no: 1,
        _primary_term: 1,
        _source: {
          ...aiIndexDocument,
          automations: Array.from({ length: MAX_AI_INDEX_AUTOMATIONS }, (_, index) => ({
            type: 'workflow' as const,
            value: `wf-${index}`,
          })),
        },
      });

      await expect(
        service.assertCanAcceptAutomation('customer_support', DEFAULT_SPACE, {
          type: 'workflow',
          value: 'wf-new',
        })
      ).rejects.toThrow(/maximum number of automations/);
    });

    it('allows already attached workflows when the automation limit is reached', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _seq_no: 1,
        _primary_term: 1,
        _source: {
          ...aiIndexDocument,
          automations: Array.from({ length: MAX_AI_INDEX_AUTOMATIONS }, (_, index) => ({
            type: 'workflow' as const,
            value: index === 0 ? 'nightly-refresh' : `wf-${index}`,
          })),
        },
      });

      await expect(
        service.assertCanAcceptAutomation('customer_support', DEFAULT_SPACE, {
          type: 'workflow',
          value: 'nightly-refresh',
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('addAutomation', () => {
    it('appends a workflow automation to the AI index', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _seq_no: 7,
        _primary_term: 2,
        _source: aiIndexDocument,
      });
      storageClient.index.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        _seq_no: 8,
        _primary_term: 2,
        _shards: { total: 1, successful: 1, failed: 0 },
        _version: 2,
        result: 'updated',
      } as Awaited<ReturnType<AiIndexStorageClient['index']>>);

      await expect(
        service.addAutomation('customer_support', DEFAULT_SPACE, {
          type: 'workflow',
          value: 'wf-new',
        })
      ).resolves.toBe('attached');

      expect(storageClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          id: docId('customer_support'),
          if_seq_no: 7,
          if_primary_term: 2,
          document: expect.objectContaining({
            automations: [
              { type: 'workflow', value: 'nightly-refresh' },
              { type: 'workflow', value: 'wf-new' },
            ],
          }),
        })
      );
    });

    it('returns already_attached when the workflow is already linked', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _seq_no: 7,
        _primary_term: 2,
        _source: aiIndexDocument,
      });

      await expect(
        service.addAutomation('customer_support', DEFAULT_SPACE, {
          type: 'workflow',
          value: 'nightly-refresh',
        })
      ).resolves.toBe('already_attached');
      expect(storageClient.index).not.toHaveBeenCalled();
    });

    it('retries on concurrent writes', async () => {
      storageClient.get
        .mockResolvedValueOnce({
          _id: docId('customer_support'),
          _index: '.contextengine-ai-indices',
          found: true,
          _seq_no: 7,
          _primary_term: 2,
          _source: aiIndexDocument,
        })
        .mockResolvedValueOnce({
          _id: docId('customer_support'),
          _index: '.contextengine-ai-indices',
          found: true,
          _seq_no: 8,
          _primary_term: 2,
          _source: {
            ...aiIndexDocument,
            automations: [
              ...aiIndexDocument.automations,
              { type: 'workflow', value: 'wf-concurrent' },
            ],
          },
        });
      storageClient.index.mockRejectedValueOnce(createConflictError()).mockResolvedValueOnce({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        _seq_no: 9,
        _primary_term: 2,
        _shards: { total: 1, successful: 1, failed: 0 },
        _version: 3,
        result: 'updated',
      } as Awaited<ReturnType<AiIndexStorageClient['index']>>);

      await expect(
        service.addAutomation('customer_support', DEFAULT_SPACE, {
          type: 'workflow',
          value: 'wf-new',
        })
      ).resolves.toBe('attached');
      expect(storageClient.index).toHaveBeenCalledTimes(2);
    });

    it('throws AiIndexManagedError when the entry is managed', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _seq_no: 1,
        _primary_term: 1,
        _source: { ...aiIndexDocument, managed: true },
      });

      await expect(
        service.addAutomation('customer_support', DEFAULT_SPACE, {
          type: 'workflow',
          value: 'wf-new',
        })
      ).rejects.toBeInstanceOf(AiIndexManagedError);
    });

    it('rejects when the automation limit is reached', async () => {
      storageClient.get.mockResolvedValue({
        _id: docId('customer_support'),
        _index: '.contextengine-ai-indices',
        found: true,
        _seq_no: 1,
        _primary_term: 1,
        _source: {
          ...aiIndexDocument,
          automations: Array.from({ length: MAX_AI_INDEX_AUTOMATIONS }, (_, index) => ({
            type: 'workflow' as const,
            value: `wf-${index}`,
          })),
        },
      });

      await expect(
        service.addAutomation('customer_support', DEFAULT_SPACE, {
          type: 'workflow',
          value: 'wf-new',
        })
      ).rejects.toThrow(/maximum number of automations/);
    });
  });
});
