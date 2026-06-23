/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import { loggerMock } from '@kbn/logging-mocks';
import {
  KnowledgeIndicatorClient,
  type KnowledgeIndicatorClientDeps,
} from './knowledge_indicator_client';
import { computeFeatureUuid } from '@kbn/streams-schema';
import { type StoredFeatureKnowledgeIndicator, type StoredTombstone } from '../data_stream';
import { KI_TYPE_FEATURE, KI_TYPE_QUERY } from '../fields';

jest.mock('../../../sig_events/latest_source_query', () => {
  const actual = jest.requireActual('../../../sig_events/latest_source_query');
  return {
    ...actual,
    executeAndDecodeSource: jest.fn(),
  };
});

jest.mock('./bulk_with_inference_fallback', () => {
  const actual = jest.requireActual('./bulk_with_inference_fallback');
  return {
    ...actual,
    bulkCreateWithInferenceFallback: jest.fn(async (_logger, attempt) =>
      attempt({ includeEmbedding: true })
    ),
  };
});

import { executeAndDecodeSource } from '../../../sig_events/latest_source_query';

const STREAM = 'logs-app';

// Mirrors the server-side derivation: the stored document `id` is the
// deterministic uuid computed from (slug, stream_name, type).
function featureUuid(slug: string, type = 'entity'): string {
  return computeFeatureUuid({ id: slug, stream_name: STREAM, type });
}

function createFeatureDoc(
  overrides: Partial<StoredFeatureKnowledgeIndicator> & { slug?: string } = {}
): StoredFeatureKnowledgeIndicator {
  const { slug = 'feat-1', ...rest } = overrides;
  return {
    '@timestamp': '2026-01-01T00:00:00.000Z',
    id: featureUuid(slug),
    type: KI_TYPE_FEATURE,
    'stream.name': STREAM,
    title: 'Some entity',
    description: 'desc',
    feature: {
      slug,
      type: 'entity',
      subtype: 'service',
      properties: { name: 'checkout' },
      confidence: 80,
    },
    ...rest,
  };
}

function createComputedFeatureDoc(): StoredFeatureKnowledgeIndicator {
  return createFeatureDoc({
    id: 'computed-1-uuid',
    feature: {
      slug: 'computed-1',
      type: 'dataset_analysis',
      properties: {},
      confidence: 100,
    },
  });
}

function makeClient(): {
  client: KnowledgeIndicatorClient;
  create: jest.Mock;
  runEsql: jest.Mock;
  logger: Logger;
} {
  const create = jest.fn().mockResolvedValue({ errors: false, items: [] });
  const dataStreamClient = {
    create,
  } as unknown as KnowledgeIndicatorClientDeps['dataStreamClient'];
  const logger = loggerMock.create() as unknown as Logger;
  const deps: KnowledgeIndicatorClientDeps = {
    dataStreamClient,
    esClient: {} as KnowledgeIndicatorClientDeps['esClient'],
    rulesManagementClient: {
      createRule: jest.fn().mockResolvedValue(undefined),
      updateRule: jest.fn().mockResolvedValue(undefined),
      bulkDeleteRules: jest.fn().mockResolvedValue(undefined),
    },
    soClient: {} as KnowledgeIndicatorClientDeps['soClient'],
    logger,
  };
  const client = new KnowledgeIndicatorClient(deps);
  return { client, create, runEsql: executeAndDecodeSource as jest.Mock, logger };
}

beforeEach(() => {
  (executeAndDecodeSource as jest.Mock).mockReset();
});

describe('KnowledgeIndicatorClient.bulk', () => {
  describe('exclude', () => {
    it('reads the latest revision and appends a new one with excluded=true', async () => {
      const { client, create, runEsql } = makeClient();
      const latest = createFeatureDoc();
      runEsql.mockResolvedValueOnce({ hits: [latest] });

      const result = await client.bulk(STREAM, [{ exclude: { id: latest.id } }]);

      expect(result).toEqual({ applied: 1, skipped: 0 });
      expect(create).toHaveBeenCalledTimes(1);
      const [{ documents }] = create.mock.calls[0];
      expect(documents).toHaveLength(1);
      const written = documents[0] as StoredFeatureKnowledgeIndicator;
      expect(written.id).toBe(latest.id);
      expect(written.type).toBe(KI_TYPE_FEATURE);
      expect(written.excluded).toBe(true);
      // Payload preserved
      expect(written.feature).toEqual(latest.feature);
      expect(written.title).toBe(latest.title);
      // Fresh @timestamp
      expect(written['@timestamp']).not.toBe(latest['@timestamp']);
    });

    it('skips computed features', async () => {
      const { client, create, runEsql } = makeClient();
      runEsql.mockResolvedValueOnce({ hits: [createComputedFeatureDoc()] });

      const result = await client.bulk(STREAM, [{ exclude: { id: 'computed-1' } }]);

      expect(result).toEqual({ applied: 0, skipped: 1 });
      expect(create).not.toHaveBeenCalled();
    });

    it('skips when the latest revision is already excluded', async () => {
      const { client, create, runEsql } = makeClient();
      runEsql.mockResolvedValueOnce({ hits: [createFeatureDoc({ excluded: true })] });

      const result = await client.bulk(STREAM, [{ exclude: { id: 'feat-1' } }]);

      expect(result).toEqual({ applied: 0, skipped: 1 });
      expect(create).not.toHaveBeenCalled();
    });

    it('skips unknown ids', async () => {
      const { client, create, runEsql } = makeClient();
      runEsql.mockResolvedValueOnce({ hits: [] });

      const result = await client.bulk(STREAM, [{ exclude: { id: 'missing' } }]);

      expect(result).toEqual({ applied: 0, skipped: 1 });
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('reads the latest revision and re-indexes with excluded cleared and fresh timestamps', async () => {
      const { client, create, runEsql } = makeClient();
      const latest = createFeatureDoc({ excluded: true });
      runEsql.mockResolvedValueOnce({ hits: [latest] });

      const result = await client.bulk(STREAM, [{ restore: { id: latest.id } }]);

      expect(result).toEqual({ applied: 1, skipped: 0 });
      expect(runEsql).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledTimes(1);
      const [{ documents }] = create.mock.calls[0];
      expect(documents).toHaveLength(1);
      const written = documents[0] as StoredFeatureKnowledgeIndicator;
      expect(written.id).toBe(latest.id);
      expect(written.type).toBe(KI_TYPE_FEATURE);
      expect(written.excluded).toBeUndefined();
      // Payload preserved
      expect(written.feature).toEqual(latest.feature);
      expect(written.title).toBe(latest.title);
      // Fresh @timestamp
      expect(written['@timestamp']).not.toBe(latest['@timestamp']);
    });

    it('skips unknown ids', async () => {
      const { client, create, runEsql } = makeClient();
      runEsql.mockResolvedValueOnce({ hits: [] });

      const result = await client.bulk(STREAM, [{ restore: { id: 'missing' } }]);

      expect(result).toEqual({ applied: 0, skipped: 1 });
      expect(create).not.toHaveBeenCalled();
    });

    it('skips computed features', async () => {
      const { client, create, runEsql } = makeClient();
      runEsql.mockResolvedValueOnce({ hits: [createComputedFeatureDoc()] });

      const result = await client.bulk(STREAM, [{ restore: { id: 'computed-1' } }]);

      expect(result).toEqual({ applied: 0, skipped: 1 });
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('reads the latest revision and appends a tombstone for known ids', async () => {
      const { client, create, runEsql } = makeClient();
      runEsql.mockResolvedValueOnce({ hits: [createFeatureDoc({ id: 'feat-1' })] });

      const result = await client.bulk(STREAM, [
        { delete: { type: KI_TYPE_FEATURE, id: 'feat-1' } },
      ]);

      expect(result).toEqual({ applied: 1, skipped: 0 });
      expect(runEsql).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledTimes(1);
      const [{ documents }] = create.mock.calls[0];
      const written = documents[0] as StoredTombstone;
      expect(written.deleted).toBe(true);
    });

    it('skips unknown ids', async () => {
      const { client, create, runEsql } = makeClient();
      runEsql.mockResolvedValueOnce({ hits: [] });

      const result = await client.bulk(STREAM, [
        { delete: { type: KI_TYPE_FEATURE, id: 'non-existent' } },
      ]);

      expect(result).toEqual({ applied: 0, skipped: 1 });
      expect(create).not.toHaveBeenCalled();
    });
  });
});

describe('KnowledgeIndicatorClient.deleteIndicators', () => {
  it('tombstones every active revision when the create succeeds', async () => {
    const { client, create, runEsql } = makeClient();
    runEsql.mockResolvedValueOnce({
      hits: [createFeatureDoc({ id: 'feat-1' }), createFeatureDoc({ id: 'feat-2' })],
    });

    await client.deleteIndicators(STREAM);

    expect(create).toHaveBeenCalledTimes(1);
    const [{ documents }] = create.mock.calls[0];
    expect(documents).toHaveLength(2);
    expect(documents.every((d: StoredTombstone) => d.deleted === true)).toBe(true);
  });

  it('throws when the tombstone write reports errors', async () => {
    const { client, create, runEsql } = makeClient();
    runEsql.mockResolvedValueOnce({ hits: [createFeatureDoc({ id: 'feat-1' })] });
    create.mockResolvedValueOnce({
      errors: true,
      items: [
        {
          create: { status: 500, error: { type: 'es_rejected_execution_exception', reason: 'x' } },
        },
      ],
    });

    await expect(client.deleteIndicators(STREAM)).rejects.toThrow(/Failed to delete indicators/);
  });

  it('is a no-op when there are no active revisions', async () => {
    const { client, create, runEsql } = makeClient();
    runEsql.mockResolvedValueOnce({ hits: [] });

    await client.deleteIndicators(STREAM);

    expect(create).not.toHaveBeenCalled();
  });
});

describe('KnowledgeIndicatorClient.getFeatures', () => {
  const printedQueryFor = (runEsql: jest.Mock): string => {
    const query = runEsql.mock.calls[0][1] as { print: () => string };
    return query.print();
  };

  it('hides excluded features by default', async () => {
    const { client, runEsql } = makeClient();
    runEsql.mockResolvedValueOnce({ hits: [createFeatureDoc()] });

    await client.getFeatures(STREAM);

    expect(runEsql).toHaveBeenCalledTimes(1);
    // The default filter must include `excluded` — distinct from the
    // tombstone-only filter applied when includeExcluded=true.
    expect(printedQueryFor(runEsql)).toContain('excluded');
  });

  it('returns active and excluded merged when includeExcluded is set', async () => {
    const { client, runEsql } = makeClient();
    const active = createFeatureDoc({ slug: 'a' });
    const excluded = createFeatureDoc({ slug: 'b', excluded: true });
    runEsql.mockResolvedValueOnce({ hits: [active, excluded] });

    const { hits } = await client.getFeatures(STREAM, { includeExcluded: true });

    expect(hits).toHaveLength(2);
    // includeExcluded relaxes back to the tombstone-only filter — should not
    // mention `excluded`.
    expect(printedQueryFor(runEsql)).not.toContain('excluded');
    expect(hits.find((h) => h.id === 'b')?.excluded).toBe(true);
  });

  it('applies feature.type filter when options.type is provided', async () => {
    const { client, runEsql } = makeClient();
    runEsql.mockResolvedValueOnce({ hits: [] });

    await client.getFeatures(STREAM, { type: ['entity'] });

    expect(runEsql).toHaveBeenCalledTimes(1);
    expect(printedQueryFor(runEsql)).toContain('feature.type');
  });
});

describe('KnowledgeIndicatorClient.getLatestRevisionTimestamp', () => {
  const printedQueryFor = (runEsql: jest.Mock): string => {
    const query = runEsql.mock.calls[0][1] as { print: () => string };
    return query.print();
  };

  it('returns the newest @timestamp among matching live revisions', async () => {
    const { client, runEsql } = makeClient();
    runEsql.mockResolvedValueOnce({
      hits: [
        createFeatureDoc({ id: 'a', '@timestamp': '2026-04-01T00:00:00.000Z' }),
        createFeatureDoc({ id: 'b', '@timestamp': '2026-05-01T00:00:00.000Z' }),
        createFeatureDoc({ id: 'c', '@timestamp': '2026-03-01T00:00:00.000Z' }),
      ],
    });

    const result = await client.getLatestRevisionTimestamp(STREAM);

    expect(result).toEqual({ '@timestamp': '2026-05-01T00:00:00.000Z' });
  });

  it('returns null when no revisions match', async () => {
    const { client, runEsql } = makeClient();
    runEsql.mockResolvedValueOnce({ hits: [] });

    const result = await client.getLatestRevisionTimestamp(STREAM);

    expect(result).toBeNull();
  });

  it('filters tombstones and excluded revisions via the post-grouping WHERE', async () => {
    const { client, runEsql } = makeClient();
    runEsql.mockResolvedValueOnce({ hits: [] });

    await client.getLatestRevisionTimestamp(STREAM);

    expect(runEsql).toHaveBeenCalledTimes(1);
    // The post-grouping filter must reference both `deleted` and
    // `excluded` so groups whose latest revision is a tombstone or an
    // exclusion drop out. Without this, user-driven bulk deletes or
    // bulk excludes would extend the identification throttle.
    const printed = printedQueryFor(runEsql);
    expect(printed).toContain('deleted');
    expect(printed).toContain('excluded');
  });

  it('passes the feature-type filter through to the WHERE clause', async () => {
    const { client, runEsql } = makeClient();
    runEsql.mockResolvedValueOnce({ hits: [] });

    await client.getLatestRevisionTimestamp(STREAM, { types: ['entity', 'metric'] });

    expect(printedQueryFor(runEsql)).toContain('feature.type');
  });
});

describe('KnowledgeIndicatorClient.getExcludedFeatures', () => {
  const printedQueryFor = (runEsql: jest.Mock): string => {
    const query = runEsql.mock.calls[0][1] as { print: () => string };
    return query.print();
  };

  it('returns excluded features in the order returned by ES|QL (sort pushed into query)', async () => {
    const { client, runEsql } = makeClient();
    const older = createFeatureDoc({
      slug: 'old',
      excluded: true,
      '@timestamp': '2026-01-01T00:00:00.000Z',
    });
    const newer = createFeatureDoc({
      slug: 'new',
      excluded: true,
      '@timestamp': '2026-02-01T00:00:00.000Z',
    });
    // ES|QL returns newest-first (DESC); the client preserves that order.
    runEsql.mockResolvedValueOnce({ hits: [newer, older] });

    const { hits } = await client.getExcludedFeatures(STREAM);

    expect(hits.map((h) => h.id)).toEqual(['new', 'old']);
    expect(hits.every((h) => h.excluded === true)).toBe(true);
  });

  it('includes a @timestamp DESC sort in the ES|QL query', async () => {
    const { client, runEsql } = makeClient();
    runEsql.mockResolvedValueOnce({ hits: [] });

    await client.getExcludedFeatures(STREAM);

    expect(runEsql).toHaveBeenCalledTimes(1);
    const printed = printedQueryFor(runEsql);
    expect(printed).toContain('@timestamp');
    expect(printed.toUpperCase()).toContain('SORT');
    expect(printed.toUpperCase()).toContain('DESC');
  });
});

describe('KnowledgeIndicatorClient.findIndicators keyword search', () => {
  function makeClientWithSearch(): {
    client: KnowledgeIndicatorClient;
    runEsql: jest.Mock;
    search: jest.Mock;
  } {
    const create = jest.fn().mockResolvedValue({ errors: false, items: [] });
    const search = jest.fn().mockResolvedValue({
      hits: { hits: [], total: { value: 0 } },
    });
    const dataStreamClient = {
      create,
    } as unknown as KnowledgeIndicatorClientDeps['dataStreamClient'];
    const logger = loggerMock.create() as unknown as Logger;
    const deps: KnowledgeIndicatorClientDeps = {
      dataStreamClient,
      esClient: { search } as unknown as KnowledgeIndicatorClientDeps['esClient'],
      rulesManagementClient: {
        createRule: jest.fn().mockResolvedValue(undefined),
        updateRule: jest.fn().mockResolvedValue(undefined),
        bulkDeleteRules: jest.fn().mockResolvedValue(undefined),
      },
      soClient: {} as KnowledgeIndicatorClientDeps['soClient'],
      logger,
    };
    const client = new KnowledgeIndicatorClient(deps);
    return { client, runEsql: executeAndDecodeSource as jest.Mock, search };
  }

  it('uses only feature fields when type is [feature]', async () => {
    const { client, runEsql, search } = makeClientWithSearch();
    runEsql.mockResolvedValueOnce({ hits: [createFeatureDoc()] });

    await client.findIndicators(STREAM, 'checkout', {
      types: [KI_TYPE_FEATURE],
      searchMode: 'keyword',
    });

    expect(search).toHaveBeenCalledTimes(1);
    const { retriever } = search.mock.calls[0][0] as {
      retriever: {
        standard: { query: { bool: { should: Array<{ wildcard: Record<string, unknown> }> } } };
      };
    };
    const fields = retriever.standard.query.bool.should.map((c) => Object.keys(c.wildcard)[0]);
    expect(fields).toContain('feature.type');
    expect(fields).toContain('feature.subtype');
    expect(fields).toContain('tags');
    expect(fields).not.toContain('query.esql');
    expect(fields).not.toContain('query.features.id');
  });

  it('uses only query fields when type is [query]', async () => {
    const { client, runEsql, search } = makeClientWithSearch();
    runEsql.mockResolvedValueOnce({ hits: [] });

    await client.findIndicators(STREAM, 'SELECT', {
      types: [KI_TYPE_QUERY],
      searchMode: 'keyword',
    });

    // No hits from ES|QL phase → search is not called (early return).
    // Test the field set by calling with a doc present.
    (executeAndDecodeSource as jest.Mock).mockReset();
    const fakeQuery = {
      '@timestamp': '2026-01-01T00:00:00.000Z',
      id: 'q-1',
      type: KI_TYPE_QUERY,
      'stream.name': STREAM,
      title: 'Error query',
      description: 'desc',
      query: {
        esql: 'FROM logs | WHERE body.text:"error"',
        query_type: 'match',
        rule_backed: false,
        rule_id: 'r1',
      },
    };
    runEsql.mockResolvedValueOnce({ hits: [fakeQuery] });
    search.mockClear();
    search.mockResolvedValueOnce({ hits: { hits: [], total: { value: 0 } } });

    await client.findIndicators(STREAM, 'SELECT', {
      types: [KI_TYPE_QUERY],
      searchMode: 'keyword',
    });

    expect(search).toHaveBeenCalledTimes(1);
    const { retriever } = search.mock.calls[0][0] as {
      retriever: {
        standard: { query: { bool: { should: Array<{ wildcard: Record<string, unknown> }> } } };
      };
    };
    const fields = retriever.standard.query.bool.should.map((c) => Object.keys(c.wildcard)[0]);
    expect(fields).toContain('query.esql');
    expect(fields).toContain('query.features.id');
    expect(fields).not.toContain('feature.type');
    expect(fields).not.toContain('feature.subtype');
    expect(fields).not.toContain('tags');
  });

  it('dedupes ranked rows to one per group and emits the phase-1 latest payload', async () => {
    const { client, runEsql, search } = makeClientWithSearch();

    const latestTs = '2026-03-01T00:00:00.000Z';
    const olderTs = '2026-01-01T00:00:00.000Z';

    // Phase 1: the authoritative latest revision for the group.
    runEsql.mockResolvedValueOnce({
      hits: [
        createFeatureDoc({ id: 'feat-1', '@timestamp': latestTs, title: 'authoritative-latest' }),
      ],
    });

    // Phase 2: ES ranks several rows for the same group — two share the latest
    // timestamp (a tie) with different payloads, one is an older revision. The
    // result must be a single hit carrying the phase-1 payload regardless of
    // which row ranked first.
    search.mockResolvedValueOnce({
      hits: {
        total: { value: 3 },
        hits: [
          {
            _id: 'aaa',
            _source: createFeatureDoc({ id: 'feat-1', '@timestamp': latestTs, title: 'tie-a' }),
          },
          {
            _id: 'zzz',
            _source: createFeatureDoc({ id: 'feat-1', '@timestamp': latestTs, title: 'tie-b' }),
          },
          {
            _id: 'mmm',
            _source: createFeatureDoc({ id: 'feat-1', '@timestamp': olderTs, title: 'stale' }),
          },
        ],
      },
    });

    const { hits } = await client.findIndicators(STREAM, 'checkout', {
      types: [KI_TYPE_FEATURE],
      searchMode: 'keyword',
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].type).toBe('feature');
    expect(hits[0].type === 'feature' && hits[0].feature.title).toBe('authoritative-latest');
  });

  it('drops a group whose latest revision did not match the query', async () => {
    const { client, runEsql, search } = makeClientWithSearch();

    // Phase 1 latest is newer than any matching ranked row below.
    runEsql.mockResolvedValueOnce({
      hits: [createFeatureDoc({ id: 'feat-1', '@timestamp': '2026-03-01T00:00:00.000Z' })],
    });

    // Only a stale revision matched the query — the group must not resurface.
    search.mockResolvedValueOnce({
      hits: {
        total: { value: 1 },
        hits: [
          {
            _id: 'old',
            _source: createFeatureDoc({ id: 'feat-1', '@timestamp': '2026-01-01T00:00:00.000Z' }),
          },
        ],
      },
    });

    const { hits } = await client.findIndicators(STREAM, 'checkout', {
      types: [KI_TYPE_FEATURE],
      searchMode: 'keyword',
    });

    expect(hits).toHaveLength(0);
  });
});
