/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock, type MockedLogger } from '@kbn/logging-mocks';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import type { RelationshipMetadataDoc } from '../../../common/domain/entity_metadata/relationship_metadata';
import { EntityMetadataClient } from './entity_metadata_client';
import { runWithSpan } from '../../telemetry/traces';

jest.mock('../../telemetry/traces', () => {
  const actual = jest.requireActual('../../telemetry/traces');
  return {
    ...actual,
    runWithSpan: jest.fn(actual.runWithSpan),
  };
});

const makeDoc = (overrides: Partial<RelationshipMetadataDoc> = {}): RelationshipMetadataDoc =>
  ({
    '@timestamp': '2026-05-15T10:30:00.000Z',
    'event.kind': 'event',
    'event.action': 'relationship_observed',
    'entity.id': 'user:alice@corp',
    'entity.source': 'elastic_defend',
    'entity.relationships.accesses_frequently.target': 'host:laptopA',
    'related.user': ['alice'],
    'related.hosts': ['laptopA'],
    Maintainer: {
      kind: 'accesses_frequently_and_infrequently',
      scan_id: 'scan-1',
      lookback_window: 'now-30d',
    },
    ...overrides,
  } as RelationshipMetadataDoc);

describe('EntityMetadataClient', () => {
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;
  let logger: MockedLogger;
  let client: EntityMetadataClient;

  beforeEach(() => {
    esClient = elasticsearchServiceMock.createElasticsearchClient();
    logger = loggerMock.create();
    client = new EntityMetadataClient({ esClient, logger, namespace: 'default' });
    (runWithSpan as jest.Mock).mockClear();
  });

  // Drains the helper `datasource` (so the mock counts docs) and invokes
  // `onDrop` once per simulated drop before resolving to bulk stats.
  const mockHelpersBulk = (drops: Array<{ status: number; error?: { reason?: string } }> = []) => {
    const impl = jest.fn().mockImplementation(async (opts: any) => {
      let total = 0;
      for await (const _ of opts.datasource) total++;
      for (const drop of drops) {
        opts.onDrop({ ...drop, document: {}, operation: { create: {} }, retried: false });
      }
      const failed = drops.length;
      return { total, failed, successful: total - failed };
    });
    esClient.helpers.bulk = impl as unknown as typeof esClient.helpers.bulk;
    return impl;
  };

  describe('bulkAppendMetadata', () => {
    it('returns zero counts and skips helpers.bulk when no docs are passed', async () => {
      const result = await client.bulkAppendMetadata([]);
      expect(result).toEqual({ successful: 0, failed: 0 });
      expect(esClient.helpers.bulk).not.toHaveBeenCalled();
    });

    it('calls helpers.bulk with the namespace-scoped metadata datastream name', async () => {
      mockHelpersBulk();
      await client.bulkAppendMetadata([makeDoc()]);
      const [call] = esClient.helpers.bulk.mock.calls;
      const { index } = call[0] as { index: string };
      expect(index).toBe('.entities.v2.metadata.security_default');
    });

    it('uses the `create` bulk op (datastreams are append-only)', async () => {
      mockHelpersBulk();
      await client.bulkAppendMetadata([makeDoc()]);
      const [call] = esClient.helpers.bulk.mock.calls;
      const { onDocument } = call[0] as { onDocument: (doc: unknown) => unknown };
      expect(onDocument(makeDoc())).toEqual({ create: {} });
    });

    it('passes the docs through as the helper datasource', async () => {
      mockHelpersBulk();
      const doc = makeDoc({ 'entity.id': 'user:bob@corp' });
      await client.bulkAppendMetadata([doc]);
      const [call] = esClient.helpers.bulk.mock.calls;
      const { datasource } = call[0] as { datasource: unknown[] };
      expect(datasource).toEqual([doc]);
    });

    it('returns the successful/failed counts reported by the helper', async () => {
      mockHelpersBulk();
      const result = await client.bulkAppendMetadata([makeDoc(), makeDoc()]);
      expect(result).toEqual({ successful: 2, failed: 0 });
    });

    it('reports dropped docs in the failed count and logs each drop without throwing', async () => {
      mockHelpersBulk([{ status: 503, error: { reason: 'index read-only' } }]);
      const result = await client.bulkAppendMetadata([makeDoc(), makeDoc()]);
      expect(result).toEqual({ successful: 1, failed: 1 });
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('index read-only'));
    });

    it('does NOT throw on partial bulk failures', async () => {
      mockHelpersBulk([{ status: 400, error: { reason: 'bad field' } }]);
      await expect(client.bulkAppendMetadata([makeDoc()])).resolves.toEqual({
        successful: 0,
        failed: 1,
      });
    });

    it('propagates exceptions from helpers.bulk (does not swallow transport errors)', async () => {
      esClient.helpers.bulk.mockRejectedValueOnce(new Error('transport failure'));
      await expect(client.bulkAppendMetadata([makeDoc()])).rejects.toThrow(/transport failure/);
    });

    it('wraps the call in runWithSpan with the entityStore.metadata.bulk_append name', async () => {
      mockHelpersBulk();
      await client.bulkAppendMetadata([makeDoc()]);
      const calls = (runWithSpan as jest.Mock).mock.calls;
      const spanNames = calls.map((c) => (c[0] as { name?: string }).name);
      expect(spanNames).toContain('entityStore.metadata.bulk_append');
    });

    it('records the doc count on the tracing span attributes', async () => {
      mockHelpersBulk();
      await client.bulkAppendMetadata([makeDoc(), makeDoc(), makeDoc()]);
      const calls = (runWithSpan as jest.Mock).mock.calls;
      const matching = calls.find(
        (c) => (c[0] as { name?: string }).name === 'entityStore.metadata.bulk_append'
      );
      expect(matching).toBeDefined();
      const attrs = (matching![0] as { attributes?: Record<string, unknown> }).attributes ?? {};
      expect(attrs['entity_store.metadata.operation']).toBe('bulk_append');
      expect(attrs['entity_store.objects.count']).toBe(3);
    });
  });
});
