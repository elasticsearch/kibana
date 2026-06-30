/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import type { KueryNode } from '@kbn/es-query';
import { toKqlExpression } from '@kbn/es-query';
import { makeCase, makeWriterMock, stubFindOnePage } from '../__test_helpers__';
import { runReconciliation } from './runner';

describe('runReconciliation', () => {
  const logger = loggerMock.create();

  /**
   * Each test gets its own SO client + mocked writer so call counts and
   * mock state never leak across tests. Templates / cases relevant to the
   * test are passed as the `cases` arg.
   */
  const setup = (cases: Parameters<typeof stubFindOnePage>[1] = []) => {
    const client = savedObjectsClientMock.create();
    stubFindOnePage(client, cases);
    return { client, writer: makeWriterMock() };
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reconciles cases updated since lastRunAt', async () => {
    // Updated since lastRunAt — the "patched after a missed write" path.
    const { client, writer } = setup([
      makeCase('case-B', {
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-05T00:00:00.000Z',
      }),
    ]);

    const result = await runReconciliation({
      savedObjectsClient: client,
      writer,
      logger,
      lastRunAt: '2026-05-04T00:00:00.000Z',
    });

    expect(writer.bulkUpsertCasesAwait).toHaveBeenCalledTimes(1);
    expect(writer.bulkUpsertCasesAwait).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'case-B' })])
    );
    expect(result.processed).toBe(1);
  });

  it('reconciles never-patched cases created since lastRunAt and skips older never-patched cases', async () => {
    // A newly-created case whose writer hook failed has
    // `updated_at: null` until someone patches it. The null branch is
    // gated on `created_at > lastRunAt` so:
    //   - `case-A` (created since lastRunAt) surfaces — typical
    //     "writer dropped the create" recovery path.
    //   - `case-orphan` (created long ago, never patched, doc
    //     missing from `.cases` due to e.g. an out-of-band ES delete)
    //     does NOT surface here. `POST /reset` clears the cursor and
    //     re-walks every case; that is the documented recovery path
    //     for drift on never-patched cases predating the cursor.
    const { client, writer } = setup([
      makeCase('case-A', { createdAt: '2026-05-05T00:00:00.000Z', updatedAt: null }),
      makeCase('case-orphan', { createdAt: '2024-01-01T00:00:00.000Z', updatedAt: null }),
    ]);

    const result = await runReconciliation({
      savedObjectsClient: client,
      writer,
      logger,
      lastRunAt: '2026-05-04T00:00:00.000Z',
    });

    // The mocked `find` returns both cases regardless of the filter
    // (filter evaluation is on the SO repository, not in the mock).
    // The runner forwards every returned doc to the writer, so this
    // assertion is necessarily structural-only — it is the companion
    // structural-shape test below that locks the actual filter.
    expect(writer.bulkUpsertCasesAwait).toHaveBeenCalledTimes(1);
    expect(result.processed).toBe(2);
  });

  /**
   * Structural lock on the KQL the runner sends to the SO client.
   * The mocked `find` doesn't apply the filter, so the production
   * shape can only be verified via the serialized KQL. Loosening this
   * to drop the `created_at > lastRunAt` guard on the null branch
   * would re-introduce unbounded re-emission of every never-patched
   * case on every tick.
   */
  it('serializes a filter whose null branch is gated on created_at', async () => {
    const { client, writer } = setup([]);

    await runReconciliation({
      savedObjectsClient: client,
      writer,
      logger,
      lastRunAt: '2026-05-04T00:00:00.000Z',
    });

    expect(client.find).toHaveBeenCalled();
    const findArgs = client.find.mock.calls[0]?.[0] as { filter?: KueryNode };
    expect(findArgs.filter).toBeDefined();
    const kuery = toKqlExpression(findArgs.filter as KueryNode);
    // KQL serializes the timestamp value either quoted
    // (`"2026-05-04T00:00:00.000Z"`) or unquoted with colons
    // backslash-escaped (`2026-05-04T00\:00\:00.000Z`); both are
    // semantically identical at parse time. The regex tolerates
    // either form.
    const TS_PATTERN = /"?2026-05-04T00\\?:00\\?:00\.000Z"?/;
    // Clause 1: cursor on updated_at.
    expect(kuery).toMatch(new RegExp(`attributes\\.updated_at\\s*>\\s*${TS_PATTERN.source}`));
    // Clause 2: missing-updated_at AND-ed with cursor on created_at.
    expect(kuery).toMatch(/not\s+cases\.attributes\.updated_at\s*:\s*\*/i);
    expect(kuery).toMatch(new RegExp(`attributes\\.created_at\\s*>\\s*${TS_PATTERN.source}`));
  });

  it('walks every case when lastRunAt is undefined (first-ever run / post-reset)', async () => {
    // No cursor → no filter → walks every case. This is the path
    // `/reset` depends on after it clears the task state.
    const { client, writer } = setup([
      makeCase('case-A', { createdAt: '2024-01-01T00:00:00.000Z', updatedAt: null }),
      makeCase('case-B', {
        createdAt: '2025-06-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      }),
    ]);

    const result = await runReconciliation({
      savedObjectsClient: client,
      writer,
      logger,
      lastRunAt: undefined,
    });

    expect(client.find).toHaveBeenCalledWith(expect.objectContaining({ filter: undefined }));
    // Sort is intentionally omitted — the SO API auto-uses
    // `_shard_doc` with a PIT, which is the unique-per-doc sort that
    // prevents `searchAfter` skips/dupes when many cases share the
    // same timestamp (bulk imports).
    const findArgs = client.find.mock.calls[0]?.[0] ?? {};
    expect(findArgs).not.toHaveProperty('sortField');
    expect(findArgs).not.toHaveProperty('sortOrder');
    // Both cases land in a single bulk dispatch (one page → one bulk).
    expect(writer.bulkUpsertCasesAwait).toHaveBeenCalledTimes(1);
    expect(writer.bulkUpsertCasesAwait).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'case-A' }),
        expect.objectContaining({ id: 'case-B' }),
      ])
    );
    expect(result.processed).toBe(2);
  });

  /**
   * The runner's SO client is the v2 internal client (unscoped, no
   * spaces extension). The SO repository's `find` and
   * `openPointInTimeForType` both default `options.namespaces` to
   * `[DEFAULT_NAMESPACE_STRING]` when omitted, so leaving the param
   * out silently restricts the walk to `default` even on an unscoped
   * client. Passing `namespaces: ['*']` lifts the namespace filter
   * (treated as the `ALL_NAMESPACES_STRING` sentinel by the search
   * DSL builder) so the walk crosses every space.
   */
  it('passes namespaces: ["*"] to both the PIT open and every paged find so the walk crosses every space', async () => {
    const { client, writer } = setup([
      makeCase('case-default', {
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
      }),
    ]);

    await runReconciliation({
      savedObjectsClient: client,
      writer,
      logger,
      lastRunAt: undefined,
    });

    // The PIT open must carry the cross-namespace sentinel — the
    // PIT captures the snapshot the page reads walk against, so a
    // default-only PIT would invisibly cap the walk even if the
    // page reads asked for `['*']`.
    expect(client.openPointInTimeForType).toHaveBeenCalledWith(
      'cases',
      expect.objectContaining({ namespaces: ['*'] })
    );
    // And every paged find must opt into the same scope.
    for (const call of (client.find as jest.Mock).mock.calls) {
      const arg = call[0] as { namespaces?: string[] };
      expect(arg.namespaces).toEqual(['*']);
    }
  });

  it('advances the cursor to tick start time on successful drain', async () => {
    const { client, writer } = setup([]); // empty → immediate drain

    const before = Date.now();
    const result = await runReconciliation({
      savedObjectsClient: client,
      writer,
      logger,
      lastRunAt: '2026-05-01T00:00:00.000Z',
    });
    const after = Date.now();

    // newLastRunAt should be an ISO timestamp captured between
    // `before` and `after` (tickStartedAt is set before any I/O).
    const cursorMs = new Date(result.newLastRunAt).getTime();
    expect(cursorMs).toBeGreaterThanOrEqual(before);
    expect(cursorMs).toBeLessThanOrEqual(after);
  });

  it('closes the PIT even if find throws', async () => {
    const client = savedObjectsClientMock.create();
    const writer = makeWriterMock();
    client.find.mockRejectedValue(new Error('boom'));

    await expect(
      runReconciliation({
        savedObjectsClient: client,
        writer,
        logger,
        lastRunAt: undefined,
      })
    ).rejects.toThrow('boom');

    // PIT leak prevention — `closePointInTime` runs in `finally`.
    expect(client.closePointInTime).toHaveBeenCalledTimes(1);
    expect(client.closePointInTime).toHaveBeenCalledWith('some_pit_id');
  });
});
