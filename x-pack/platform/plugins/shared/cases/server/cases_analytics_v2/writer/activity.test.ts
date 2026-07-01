/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { ACTIVITY_INDEX_NAME } from '../constants';
import { makeUserAction } from '../__test_helpers__';
import { CasesActivityV2Writer } from './activity';

/**
 * Builds the activity writer wired to fresh ES + logger mocks. The retry
 * budget is intentionally tight (1 retry, 1 ms delay) so failure-path
 * tests don't bake real wall-clock backoff into the suite. Mirrors
 * `writer/writer.test.ts` for the cases surface.
 */
const buildWriterUnderTest = () => {
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  const logger = loggerMock.create();
  const writer = new CasesActivityV2Writer({
    esClient,
    logger,
    maxRetries: 1,
    retryInitialDelayMs: 1,
  });
  // The writer names a child logger; reads go through it.
  const childLogger = (logger.get as jest.Mock).mock.results[0]?.value ?? logger;
  return { writer, esClient, logger, childLogger };
};

const flushMicrotasks = () => new Promise((r) => setImmediate(r));

describe('CasesActivityV2Writer', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('upsertAction', () => {
    it('indexes a single doc keyed on the user-action id', async () => {
      const { writer, esClient } = buildWriterUnderTest();
      (esClient.index as unknown as jest.Mock).mockResolvedValue({ result: 'created' });

      writer.upsertAction(makeUserAction('ua-1'));
      await flushMicrotasks();

      expect(esClient.index).toHaveBeenCalledTimes(1);
      const arg = (esClient.index as unknown as jest.Mock).mock.calls[0][0];
      expect(arg.index).toBe(ACTIVITY_INDEX_NAME);
      expect(arg.id).toBe('ua-1');
      expect(arg.document).toBeDefined();
    });

    it('downgrades a post-retry-budget index failure to WARN (not ERROR)', async () => {
      const { writer, esClient, childLogger } = buildWriterUnderTest();
      (esClient.index as unknown as jest.Mock).mockRejectedValue(new Error('boom'));

      writer.upsertAction(makeUserAction('ua-1'));
      await new Promise((r) => setTimeout(r, 50));

      expect(childLogger.error).not.toHaveBeenCalled();
      expect(childLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('write failed after'),
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });

  describe('bulkUpsertActions', () => {
    it('dispatches one `_bulk` with a header + doc per action', async () => {
      const { writer, esClient } = buildWriterUnderTest();
      (esClient.bulk as unknown as jest.Mock).mockResolvedValue({ errors: false, items: [] });

      writer.bulkUpsertActions([makeUserAction('ua-A'), makeUserAction('ua-B')]);
      await flushMicrotasks();

      expect(esClient.bulk).toHaveBeenCalledTimes(1);
      const operations = (esClient.bulk as unknown as jest.Mock).mock.calls[0][0].operations;
      // 2 actions × 2 entries (header + doc) = 4.
      expect(operations).toHaveLength(4);
      expect(operations[0]).toEqual({ index: { _index: ACTIVITY_INDEX_NAME, _id: 'ua-A' } });
      expect(operations[2]).toEqual({ index: { _index: ACTIVITY_INDEX_NAME, _id: 'ua-B' } });
    });

    it('skips dispatch on empty input', async () => {
      const { writer, esClient } = buildWriterUnderTest();
      writer.bulkUpsertActions([]);
      await flushMicrotasks();
      expect(esClient.bulk).not.toHaveBeenCalled();
    });

    it('logs per-item failures at WARN but does not throw', async () => {
      const { writer, esClient, childLogger } = buildWriterUnderTest();
      (esClient.bulk as unknown as jest.Mock).mockResolvedValue({
        errors: true,
        items: [
          { index: { _id: 'ua-A', status: 201 } },
          { index: { _id: 'ua-B', status: 400, error: { reason: 'mapper exception' } } },
        ],
      });

      writer.bulkUpsertActions([makeUserAction('ua-A'), makeUserAction('ua-B')]);
      await flushMicrotasks();

      const warnCalls = (childLogger.warn as jest.Mock).mock.calls.map(([m]: [string]) => m);
      expect(
        warnCalls.some((m: string) => m.includes('ua-B') && m.includes('mapper exception'))
      ).toBe(true);
    });
  });

  describe('bulkUpsertActionsAwait', () => {
    it('resolves on success and dispatches one bulk', async () => {
      const { writer, esClient } = buildWriterUnderTest();
      (esClient.bulk as unknown as jest.Mock).mockResolvedValue({ errors: false, items: [] });

      await expect(
        writer.bulkUpsertActionsAwait([makeUserAction('ua-A')])
      ).resolves.toBeUndefined();
      expect(esClient.bulk).toHaveBeenCalledTimes(1);
    });

    it('skips dispatch on empty input', async () => {
      const { writer, esClient } = buildWriterUnderTest();
      await writer.bulkUpsertActionsAwait([]);
      expect(esClient.bulk).not.toHaveBeenCalled();
    });

    /**
     * A bulk-level transport failure must throw so the reconciliation
     * tick fails and the cursor stays pinned; the same window re-walks
     * on the next tick.
     */
    it('throws when the bulk request fails its retry budget — keeps cursor pinned', async () => {
      const { writer, esClient, childLogger } = buildWriterUnderTest();
      (esClient.bulk as unknown as jest.Mock).mockRejectedValue(new Error('cluster down'));

      await expect(writer.bulkUpsertActionsAwait([makeUserAction('ua-A')])).rejects.toThrow(
        'cluster down'
      );
      expect(childLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('bulk-awaited write failed after'),
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    /**
     * A transient per-item failure (429 / 503 / 504) throws so the
     * cursor stays pinned — a user action's `created_at` never moves, so
     * the next tick's window still covers it.
     */
    it('throws when at least one item failed with a retryable status', async () => {
      const { writer, esClient } = buildWriterUnderTest();
      (esClient.bulk as unknown as jest.Mock).mockResolvedValue({
        errors: true,
        items: [{ index: { _id: 'ua-A', status: 429, error: { reason: 'queue full' } } }],
      });

      await expect(writer.bulkUpsertActionsAwait([makeUserAction('ua-A')])).rejects.toThrow(
        /retryable item failure/
      );
    });

    /**
     * A permanent per-item failure (e.g. a mapper exception) logs at
     * WARN and resolves; reconciliation cannot self-heal a poison doc
     * and throwing would freeze every subsequent tick on it.
     */
    it('does not throw when the only item failures are permanent (400 mapper exception)', async () => {
      const { writer, esClient, childLogger } = buildWriterUnderTest();
      (esClient.bulk as unknown as jest.Mock).mockResolvedValue({
        errors: true,
        items: [
          { index: { _id: 'ua-A', status: 400, error: { reason: 'mapper_parsing_exception' } } },
        ],
      });

      await expect(
        writer.bulkUpsertActionsAwait([makeUserAction('ua-A')])
      ).resolves.toBeUndefined();
      expect(childLogger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/bulk-upsert item failed.*ua-A.*status=400.*retryable=false/)
      );
    });
  });

  describe('bulkDeleteActionsByCaseIds', () => {
    it('issues a delete_by_query with a terms filter on cases.id', async () => {
      const { writer, esClient } = buildWriterUnderTest();
      (esClient.deleteByQuery as unknown as jest.Mock).mockResolvedValue({ deleted: 3 });

      writer.bulkDeleteActionsByCaseIds(['case-1', 'case-2']);
      await flushMicrotasks();

      expect(esClient.deleteByQuery).toHaveBeenCalledTimes(1);
      const arg = (esClient.deleteByQuery as unknown as jest.Mock).mock.calls[0][0];
      expect(arg.index).toBe(ACTIVITY_INDEX_NAME);
      expect(arg.refresh).toBe(false);
      expect(arg.conflicts).toBe('proceed');
      expect(arg.query).toEqual({ terms: { 'cases.id': ['case-1', 'case-2'] } });
    });

    it('skips dispatch on empty input', async () => {
      const { writer, esClient } = buildWriterUnderTest();
      writer.bulkDeleteActionsByCaseIds([]);
      await flushMicrotasks();
      expect(esClient.deleteByQuery).not.toHaveBeenCalled();
    });

    it('swallows a 404 on the index (bootstrap not yet run) without WARN', async () => {
      const { writer, esClient, childLogger } = buildWriterUnderTest();
      (esClient.deleteByQuery as unknown as jest.Mock).mockRejectedValue({ statusCode: 404 });

      writer.bulkDeleteActionsByCaseIds(['case-1']);
      await new Promise((r) => setTimeout(r, 50));

      expect(childLogger.warn).not.toHaveBeenCalled();
    });

    it('logs at WARN after exhausting retries on a non-404 failure', async () => {
      const { writer, esClient, childLogger } = buildWriterUnderTest();
      (esClient.deleteByQuery as unknown as jest.Mock).mockRejectedValue(new Error('boom'));

      writer.bulkDeleteActionsByCaseIds(['case-1']);
      await new Promise((r) => setTimeout(r, 50));

      expect(childLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('write failed after'),
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });
});
