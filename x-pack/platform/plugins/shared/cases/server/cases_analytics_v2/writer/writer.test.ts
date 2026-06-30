/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { CASE_INDEX_NAME } from '../constants';
import { makeCase } from '../__test_helpers__';
import { CasesAnalyticsV2Writer } from '.';

/**
 * Builds the writer under test wired to fresh ES + logger mocks. The
 * retry budget is intentionally tight (1 retry, 1 ms delay) so the
 * failure-path tests don't bake real wall-clock backoff into the suite.
 */
const buildWriterUnderTest = () => {
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  const logger = loggerMock.create();
  const writer = new CasesAnalyticsV2Writer({
    esClient,
    logger,
    maxRetries: 1,
    retryInitialDelayMs: 1,
  });
  return { writer, esClient, logger };
};

describe('CasesAnalyticsV2Writer', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('bulkUpsertCases', () => {
    it('dispatches one `_bulk` request with index ops per case', async () => {
      const { writer, esClient } = buildWriterUnderTest();
      (esClient.bulk as unknown as jest.Mock).mockResolvedValue({ errors: false, items: [] });

      writer.bulkUpsertCases([makeCase('case-A'), makeCase('case-B')]);
      // Fire-and-forget — flush microtasks.
      await new Promise((r) => setImmediate(r));

      expect(esClient.bulk).toHaveBeenCalledTimes(1);
      const operations = (esClient.bulk as unknown as jest.Mock).mock.calls[0][0].operations;
      // 2 cases × 2 entries (header + doc) = 4 operations.
      expect(operations).toHaveLength(4);
      expect(operations[0]).toEqual({
        index: { _index: CASE_INDEX_NAME, _id: 'case-A' },
      });
      expect(operations[2]).toEqual({
        index: { _index: CASE_INDEX_NAME, _id: 'case-B' },
      });
    });

    it('skips dispatch when the array is empty', async () => {
      const { writer, esClient } = buildWriterUnderTest();

      writer.bulkUpsertCases([]);
      await new Promise((r) => setImmediate(r));

      expect(esClient.bulk).not.toHaveBeenCalled();
    });

    it('logs per-item failures at WARN but does not throw to the caller', async () => {
      const { writer, esClient, logger } = buildWriterUnderTest();
      (esClient.bulk as unknown as jest.Mock).mockResolvedValue({
        errors: true,
        items: [
          { index: { _id: 'case-A', status: 201 } },
          { index: { _id: 'case-B', status: 400, error: { reason: 'mapper exception' } } },
        ],
      });

      writer.bulkUpsertCases([makeCase('case-A'), makeCase('case-B')]);
      await new Promise((r) => setImmediate(r));

      // First call: the per-item failure for case-B.
      const childLogger = (logger.get as jest.Mock).mock.results[0]?.value ?? logger;
      const warnCalls = (childLogger.warn as jest.Mock).mock.calls.map(([msg]: [string]) => msg);
      expect(
        warnCalls.some((m: string) => m.includes('case-B') && m.includes('mapper exception'))
      ).toBe(true);
    });
  });

  describe('bulkDeleteCases', () => {
    it('dispatches one `_bulk` request with delete ops per id', async () => {
      const { writer, esClient } = buildWriterUnderTest();
      (esClient.bulk as unknown as jest.Mock).mockResolvedValue({ errors: false, items: [] });

      writer.bulkDeleteCases(['a', 'b', 'c']);
      await new Promise((r) => setImmediate(r));

      const operations = (esClient.bulk as unknown as jest.Mock).mock.calls[0][0].operations;
      expect(operations).toEqual([
        { delete: { _index: CASE_INDEX_NAME, _id: 'a' } },
        { delete: { _index: CASE_INDEX_NAME, _id: 'b' } },
        { delete: { _index: CASE_INDEX_NAME, _id: 'c' } },
      ]);
    });

    it('treats per-item 404s as no-ops (no WARN log)', async () => {
      const { writer, esClient, logger } = buildWriterUnderTest();
      (esClient.bulk as unknown as jest.Mock).mockResolvedValue({
        errors: true,
        items: [
          { delete: { _id: 'a', status: 200 } },
          {
            delete: {
              _id: 'b',
              status: 404,
              error: { reason: 'document_missing_exception' },
            },
          },
        ],
      });

      writer.bulkDeleteCases(['a', 'b']);
      await new Promise((r) => setImmediate(r));

      const childLogger = (logger.get as jest.Mock).mock.results[0]?.value ?? logger;
      // Should NOT log anything about case-b — 404 = post-state met.
      const warnCalls = (childLogger.warn as jest.Mock).mock.calls.map(([msg]: [string]) => msg);
      expect(warnCalls.some((m: string) => m.includes('case-b'))).toBe(false);
    });
  });

  describe('bulkUpsertCasesAwait', () => {
    it('resolves to undefined on success and dispatches one bulk', async () => {
      const { writer, esClient } = buildWriterUnderTest();
      (esClient.bulk as unknown as jest.Mock).mockResolvedValue({ errors: false, items: [] });

      const result = await writer.bulkUpsertCasesAwait([makeCase('case-A')]);
      expect(result).toBeUndefined();
      expect(esClient.bulk).toHaveBeenCalledTimes(1);
    });

    /**
     * On a bulk-level transport failure (ES unreachable / 5xx on the
     * whole bulk), the awaited bulk must throw instead of resolving
     * so the reconciliation tick fails and the cursor stays pinned.
     * Self-heals on the next reconciliation tick.
     */
    it('throws (does not resolve) when the bulk request fails its retry budget — keeps cursor pinned', async () => {
      const { writer, esClient, logger } = buildWriterUnderTest();
      (esClient.bulk as unknown as jest.Mock).mockRejectedValue(new Error('cluster down'));

      await expect(writer.bulkUpsertCasesAwait([makeCase('case-A')])).rejects.toThrow(
        'cluster down'
      );

      const childLogger = (logger.get as jest.Mock).mock.results[0]?.value ?? logger;
      expect(childLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('bulk-awaited write failed after'),
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    /**
     * On a transient per-item failure (429 / 503 / 504), the awaited
     * bulk throws so the cursor stays pinned and the failed cases
     * get re-walked on the next tick. The next tick's `updated_at`
     * filter would otherwise miss them — `updated_at` doesn't move
     * on a failed write.
     */
    it('throws when at least one item failed with a retryable status', async () => {
      const { writer, esClient } = buildWriterUnderTest();
      (esClient.bulk as unknown as jest.Mock).mockResolvedValue({
        errors: true,
        items: [{ index: { _id: 'case-A', status: 429, error: { reason: 'queue full' } } }],
      });

      await expect(writer.bulkUpsertCasesAwait([makeCase('case-A')])).rejects.toThrow(
        /retryable item failure/
      );
    });

    /**
     * On a permanent per-item failure (e.g. a mapper exception on a
     * single bad doc), the bad item logs at WARN and the rest of the
     * page completes; reconciliation continues. Throwing here would
     * freeze every subsequent tick on the same poison doc.
     * Recovery requires fixing the source SO — reconciliation cannot
     * self-heal a permanent indexing error.
     */
    it('does not throw when the only item failures are permanent (e.g. 400 mapper exception)', async () => {
      const { writer, esClient, logger } = buildWriterUnderTest();
      (esClient.bulk as unknown as jest.Mock).mockResolvedValue({
        errors: true,
        items: [
          {
            index: {
              _id: 'case-A',
              status: 400,
              error: { reason: 'mapper_parsing_exception' },
            },
          },
        ],
      });

      await expect(writer.bulkUpsertCasesAwait([makeCase('case-A')])).resolves.toBeUndefined();

      const childLogger = (logger.get as jest.Mock).mock.results[0]?.value ?? logger;
      expect(childLogger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/bulk-upsert item failed.*case-A.*status=400.*retryable=false/)
      );
    });

    it('skips dispatch on empty input', async () => {
      const { writer, esClient } = buildWriterUnderTest();

      await writer.bulkUpsertCasesAwait([]);
      expect(esClient.bulk).not.toHaveBeenCalled();
    });
  });

  describe('fireAndForget logging', () => {
    /**
     * When a single-case write exhausts its retry budget on a
     * transient ES 5xx, the case is temporarily missing from
     * analytics; reconciliation repairs it on the next tick. The
     * post-retry log uses WARN so transient blips don't generate
     * ERROR alert spam.
     */
    it('downgrades post-retry-budget failures to WARN (not ERROR)', async () => {
      const { writer, esClient, logger } = buildWriterUnderTest();
      (esClient.index as unknown as jest.Mock).mockRejectedValue(new Error('boom'));

      writer.upsertCase(makeCase('case-A'));
      await new Promise((r) => setTimeout(r, 100));

      const childLogger = (logger.get as jest.Mock).mock.results[0]?.value ?? logger;
      expect(childLogger.error).not.toHaveBeenCalled();
      expect(childLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('write failed after'),
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });
});
