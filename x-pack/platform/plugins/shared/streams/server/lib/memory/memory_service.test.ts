/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import { loggerMock } from '@kbn/logging-mocks';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import type { MemoryEntry } from './types';
import { MemoryServiceImpl } from './memory_service';
import { MEMORIES_DATA_STREAM } from '../../../common/constants';

jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

import { v4 as uuidV4 } from 'uuid';

const mockedUuidV4 = uuidV4 as jest.MockedFunction<() => string>;

type MemoryDocument = MemoryEntry & { '@timestamp'?: string; _id?: string };

const sortByLatest = (a: MemoryDocument, b: MemoryDocument) => {
  if (b.version !== a.version) {
    return b.version - a.version;
  }
  return b.updated_at.localeCompare(a.updated_at);
};

const matchesFilter = (doc: MemoryDocument, filter: Record<string, unknown>): boolean =>
  Object.entries(filter).every(([field, value]) => {
    const docValue = doc[field as keyof MemoryDocument];
    // Array fields (categories/tags/references) match if the term is one of their values.
    return Array.isArray(docValue) ? docValue.some((item) => item === value) : docValue === value;
  });

const filterByQuery = (
  docs: MemoryDocument[],
  query: Record<string, unknown>
): MemoryDocument[] => {
  if (query.match_all) {
    return docs;
  }

  const bool = query.bool as { filter?: Array<Record<string, unknown>> } | undefined;
  if (!bool?.filter) {
    return docs;
  }

  return docs.filter((doc) =>
    bool.filter!.every((clause) => {
      if ('term' in clause) {
        const term = clause.term as Record<string, unknown>;
        return matchesFilter(doc, term);
      }
      if ('terms' in clause) {
        const terms = clause.terms as Record<string, unknown>;
        const [[field, values]] = Object.entries(terms);
        const fieldValues = values as unknown[];
        return fieldValues.includes(doc[field as keyof MemoryDocument]);
      }
      if ('ids' in clause) {
        const ids = clause.ids as { values?: unknown[] };
        return (ids.values ?? []).includes(doc._id);
      }
      return true;
    })
  );
};

const collapseDocuments = (
  docs: MemoryDocument[],
  field: keyof MemoryDocument,
  size: number
): MemoryDocument[] => {
  const groups = new Map<string, MemoryDocument[]>();
  for (const doc of docs) {
    const key = String(doc[field]);
    const group = groups.get(key) ?? [];
    group.push(doc);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => group.sort(sortByLatest)[0]!)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, size);
};

// For retriever-based queries (semantic/hybrid), extract the effective filter so the mock can
// apply the same ids-based correctness invariant as a plain bool query.
const extractRetrieverFilter = (retriever: Record<string, unknown>): Record<string, unknown> => {
  const rrf = retriever.rrf as { filter?: Record<string, unknown> } | undefined;
  if (rrf?.filter) return rrf.filter;

  interface InnerStandard {
    retriever?: { standard?: { filter?: Record<string, unknown> } };
  }
  interface LinearRetriever {
    retrievers?: InnerStandard[];
  }
  const linear = retriever.linear as LinearRetriever | undefined;
  const innerFilter = linear?.retrievers?.[0]?.retriever?.standard?.filter;
  if (innerFilter) return innerFilter;

  return { match_all: {} };
};

const createInMemoryEsClient = () => {
  const memoryDocs: MemoryDocument[] = [];
  let docCounter = 0;
  const esClient = elasticsearchServiceMock.createElasticsearchClient();

  // Memory page writes go through DataStreamClient.create, which issues a bulk request.
  esClient.bulk.mockImplementation(async (params) => {
    const request = params as { index?: string; operations?: unknown[] };
    const operations = request.operations ?? [];
    const items: unknown[] = [];
    // Operations alternate [actionMetadata, document]; documents sit at odd indices.
    for (let i = 1; i < operations.length; i += 2) {
      if (request.index === MEMORIES_DATA_STREAM) {
        const doc = operations[i] as MemoryDocument;
        // Each appended document gets a unique _id, mirroring an append-only data stream.
        doc._id = `doc-${docCounter++}`;
        memoryDocs.push(doc);
      }
      items.push({ create: { status: 201, _id: 'doc', _index: String(request.index) } });
    }
    return { errors: false, took: 0, items } as never;
  });

  esClient.search.mockImplementation(async (params) => {
    const request = params as {
      index?: string;
      query?: Record<string, unknown>;
      retriever?: Record<string, unknown>;
      collapse?: { field?: string };
      size?: number;
      _source?: boolean;
      fields?: string[];
    };

    if (request.index !== MEMORIES_DATA_STREAM || (!request.query && !request.retriever)) {
      return { hits: { hits: [], total: { value: 0 } } } as never;
    }

    // Retriever-based queries (semantic/hybrid) embed the ids filter inside the retriever.
    // Extract it so the mock can apply the same correctness invariant as a plain query.
    const effectiveQuery = request.query ?? extractRetrieverFilter(request.retriever!);

    const filtered = filterByQuery(memoryDocs, effectiveQuery);
    const collapseField = request.collapse?.field as keyof MemoryDocument | undefined;
    const size = request.size ?? filtered.length;

    const winners = collapseField
      ? collapseDocuments(filtered, collapseField, size)
      : filtered.sort(sortByLatest).slice(0, size);

    return {
      hits: {
        hits: winners.map((source) => {
          const hit: {
            _id?: string;
            _source?: MemoryDocument;
            fields?: Record<string, unknown[]>;
          } = { _id: source._id };
          if (request._source !== false) {
            hit._source = source;
          }
          if (request.fields?.length) {
            hit.fields = {};
            for (const field of request.fields) {
              const value = source[field as keyof MemoryDocument];
              hit.fields[field] = Array.isArray(value) ? value : [value];
            }
          }
          return hit;
        }),
        total: { value: winners.length },
      },
    } as never;
  });

  return { esClient, memoryDocs };
};

describe('MemoryServiceImpl', () => {
  const user = 'test-user';
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = loggerMock.create();
    mockedUuidV4.mockReset();
  });

  const createService = () => {
    const { esClient } = createInMemoryEsClient();
    const service = new MemoryServiceImpl({ logger, esClient });
    return { service, esClient };
  };

  it('creates, reads, updates, and lists a memory page', async () => {
    mockedUuidV4
      .mockReturnValueOnce('entry-uuid-1')
      .mockReturnValueOnce('history-uuid-1')
      .mockReturnValueOnce('history-uuid-2');
    const { service } = createService();

    const created = await service.create({
      name: 'nginx-overview',
      title: 'Nginx overview',
      content: '# Nginx',
      categories: ['services'],
      user,
    });

    expect(created).toMatchObject({
      id: 'entry-uuid-1',
      name: 'nginx-overview',
      version: 1,
    });

    await expect(service.getByName({ name: 'nginx-overview' })).resolves.toMatchObject({
      title: 'Nginx overview',
    });

    mockedUuidV4.mockReturnValueOnce('history-uuid-3');
    const updated = await service.update({
      id: created.id,
      title: 'Nginx overview v2',
      user,
    });

    expect(updated.version).toBe(2);
    await expect(service.get({ id: created.id })).resolves.toMatchObject({
      title: 'Nginx overview v2',
      version: 2,
    });

    await expect(service.listAll()).resolves.toEqual([
      expect.objectContaining({ name: 'nginx-overview', version: 2 }),
    ]);
  });

  it('soft-deletes a page so it is hidden from reads and listAll', async () => {
    mockedUuidV4
      .mockReturnValueOnce('entry-uuid-1')
      .mockReturnValueOnce('history-uuid-1')
      .mockReturnValueOnce('history-uuid-2');
    const { service } = createService();

    const created = await service.create({
      name: 'to-delete',
      title: 'Delete me',
      content: 'content',
      user,
    });

    await service.delete({ id: created.id, user });

    await expect(service.getByName({ name: 'to-delete' })).resolves.toBeUndefined();
    await expect(service.get({ id: created.id })).rejects.toMatchObject({
      output: { statusCode: 404 },
    });
    await expect(service.listAll()).resolves.toEqual([]);
    await expect(service.getCategoryTree()).resolves.toEqual({ tree: [], uncategorized: [] });
  });

  it('restores a deleted page when recreated with the same name', async () => {
    mockedUuidV4
      .mockReturnValueOnce('entry-uuid-1')
      .mockReturnValueOnce('history-uuid-1')
      .mockReturnValueOnce('history-uuid-2')
      .mockReturnValueOnce('history-uuid-3');
    const { service } = createService();

    const created = await service.create({
      name: 'restorable-page',
      title: 'Original',
      content: 'original body',
      categories: ['test'],
      user,
    });

    await service.delete({ id: created.id, user });

    const restored = await service.create({
      name: 'restorable-page',
      title: 'Restored',
      content: 'restored body',
      categories: ['test', 'restored'],
      user,
    });

    expect(restored).toMatchObject({
      id: created.id,
      name: 'restorable-page',
      title: 'Restored',
      content: 'restored body',
      version: 3,
      created_at: created.created_at,
      created_by: created.created_by,
    });
    expect(restored.is_deleted).not.toBe(true);

    await expect(service.getByName({ name: 'restorable-page' })).resolves.toMatchObject({
      title: 'Restored',
      version: 3,
    });
    await expect(service.listAll()).resolves.toEqual([
      expect.objectContaining({ name: 'restorable-page', version: 3 }),
    ]);
  });

  it('rejects creating a page when the name is already live', async () => {
    mockedUuidV4.mockReturnValueOnce('entry-uuid-1').mockReturnValueOnce('history-uuid-1');
    const { service } = createService();

    await service.create({
      name: 'duplicate',
      title: 'First',
      content: 'first',
      user,
    });

    await expect(
      service.create({
        name: 'duplicate',
        title: 'Second',
        content: 'second',
        user,
      })
    ).rejects.toMatchObject({
      output: { statusCode: 400 },
    });
  });

  it('renames a page, tombstones the old name, and resolves get by id', async () => {
    mockedUuidV4
      .mockReturnValueOnce('entry-uuid-1')
      .mockReturnValueOnce('history-uuid-1')
      .mockReturnValueOnce('history-uuid-2');
    const { service } = createService();

    const created = await service.create({
      name: 'old-name',
      title: 'Original title',
      content: 'original content',
      user,
    });

    mockedUuidV4.mockReturnValueOnce('history-uuid-3');
    const renamed = await service.rename({
      id: created.id,
      newName: 'new-name',
      user,
    });

    expect(renamed).toMatchObject({
      id: created.id,
      name: 'new-name',
      version: 3,
    });

    await expect(service.getByName({ name: 'old-name' })).resolves.toBeUndefined();
    await expect(service.getByName({ name: 'new-name' })).resolves.toMatchObject({
      id: created.id,
      name: 'new-name',
      version: 3,
    });
    await expect(service.get({ id: created.id })).resolves.toMatchObject({
      name: 'new-name',
      version: 3,
    });
    await expect(service.listAll()).resolves.toEqual([
      expect.objectContaining({ id: created.id, name: 'new-name', version: 3 }),
    ]);
  });

  it('excludes soft-deleted pages from search results', async () => {
    mockedUuidV4
      .mockReturnValueOnce('entry-uuid-1')
      .mockReturnValueOnce('history-uuid-1')
      .mockReturnValueOnce('history-uuid-2')
      .mockReturnValueOnce('entry-uuid-2')
      .mockReturnValueOnce('history-uuid-3')
      .mockReturnValueOnce('history-uuid-4');
    const { service } = createService();

    const live = await service.create({
      name: 'live-page',
      title: 'Live page',
      content: 'live content',
      user,
    });

    const doomed = await service.create({
      name: 'deleted-page',
      title: 'Deleted page',
      content: 'deleted content',
      user,
    });

    await service.delete({ id: doomed.id, user });

    const results = await service.search({ query: 'page', size: 10 });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: live.id, name: 'live-page' });
  });

  it('search returns a live result even when a deleted page also matched the query', async () => {
    mockedUuidV4
      .mockReturnValueOnce('live-uuid')
      .mockReturnValueOnce('history-uuid-1')
      .mockReturnValueOnce('deleted-uuid')
      .mockReturnValueOnce('history-uuid-2')
      .mockReturnValueOnce('history-uuid-3');
    const { service } = createService();

    await service.create({ name: 'b-live', title: 'Live', content: 'searchable', user });
    const doomed = await service.create({
      name: 'a-deleted',
      title: 'Deleted',
      content: 'searchable',
      user,
    });
    await service.delete({ id: doomed.id, user });

    // Only the live page's latest version is matched; the tombstone is never a candidate.
    await expect(service.search({ query: 'searchable', size: 1 })).resolves.toEqual([
      expect.objectContaining({ name: 'b-live' }),
    ]);
  });

  it('listByCategory does not return a page whose latest version dropped the category', async () => {
    mockedUuidV4
      .mockReturnValueOnce('entry-uuid-1')
      .mockReturnValueOnce('history-uuid-1')
      .mockReturnValueOnce('history-uuid-2');
    const { service } = createService();

    const created = await service.create({
      name: 'categorized',
      title: 'Categorized',
      content: 'content',
      categories: ['services'],
      user,
    });

    // Page is initially listed under the category.
    await expect(service.listByCategory({ category: 'services' })).resolves.toEqual([
      expect.objectContaining({ id: created.id, version: 1 }),
    ]);

    // Latest version drops the category — an older (v1) document still carries it in the stream.
    await service.update({ id: created.id, categories: [], user });

    // Two-phase read must resolve the latest version and exclude the stale match.
    await expect(service.listByCategory({ category: 'services' })).resolves.toEqual([]);
  });

  describe('search mode behaviour', () => {
    it('mode: keyword does not widen Phase 1 to match-all — no retriever is issued', async () => {
      mockedUuidV4.mockReturnValueOnce('k-entry').mockReturnValueOnce('k-hist');
      const { service, esClient } = createService();

      await service.create({ name: 'page', title: 'Page', content: 'content', user });

      // Override: throw if a retriever-based request is ever issued
      const base = esClient.search.getMockImplementation()!;
      esClient.search.mockImplementation(async (params) => {
        if ((params as { retriever?: unknown }).retriever) {
          throw new Error('retriever must not be used in keyword mode');
        }
        return base(params as never);
      });

      await expect(service.search({ query: 'page', mode: 'keyword' })).resolves.toHaveLength(1);
    });

    it('auto-resolved hybrid falls back to keyword and warns when retriever search throws', async () => {
      mockedUuidV4.mockReturnValueOnce('fb-entry').mockReturnValueOnce('fb-hist');
      const { service, esClient } = createService();

      await service.create({ name: 'fallback-page', title: 'Fallback', content: 'content', user });

      const base = esClient.search.getMockImplementation()!;
      esClient.search.mockImplementation(async (params) => {
        if ((params as { retriever?: unknown }).retriever) {
          throw new Error('inference_service_not_found: model still loading');
        }
        return base(params as never);
      });

      // No explicit mode → auto-resolves to hybrid → falls back to keyword on error
      const results = await service.search({ query: 'fallback-page' });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ name: 'fallback-page' });
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('falling back to keyword'));
    });

    it('explicit hybrid mode propagates retriever errors without fallback', async () => {
      mockedUuidV4.mockReturnValueOnce('ex-entry').mockReturnValueOnce('ex-hist');
      const { service, esClient } = createService();

      await service.create({ name: 'explicit-page', title: 'Explicit', content: 'content', user });

      const base = esClient.search.getMockImplementation()!;
      esClient.search.mockImplementation(async (params) => {
        if ((params as { retriever?: unknown }).retriever) {
          throw new Error('inference endpoint unavailable');
        }
        return base(params as never);
      });

      // Explicit mode → no fallback → error propagates
      await expect(service.search({ query: 'explicit-page', mode: 'hybrid' })).rejects.toThrow(
        'inference endpoint unavailable'
      );
    });
  });

  it('getBacklinks does not return a page whose latest version dropped the reference', async () => {
    mockedUuidV4
      .mockReturnValueOnce('target-uuid')
      .mockReturnValueOnce('history-uuid-1')
      .mockReturnValueOnce('source-uuid')
      .mockReturnValueOnce('history-uuid-2')
      .mockReturnValueOnce('history-uuid-3');
    const { service } = createService();

    const target = await service.create({
      name: 'target',
      title: 'Target',
      content: 'target content',
      user,
    });

    const source = await service.create({
      name: 'source',
      title: 'Source',
      content: 'links to target',
      references: [target.id],
      user,
    });

    await expect(service.getBacklinks({ id: target.id })).resolves.toEqual([
      expect.objectContaining({ id: source.id, version: 1 }),
    ]);

    // Latest version of source removes the reference; v1 still references target in the stream.
    await service.update({ id: source.id, references: [], user });

    await expect(service.getBacklinks({ id: target.id })).resolves.toEqual([]);
  });
});
