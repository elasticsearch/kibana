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
import { CASE_USER_ACTION_SAVED_OBJECT } from '../../../common/constants';
import { makeActivityWriterMock, makeUserAction, stubFindOnePage } from '../__test_helpers__';
import { runActivityReconciliation } from './activity_runner';

describe('runActivityReconciliation', () => {
  const logger = loggerMock.create();

  const setup = (actions: Parameters<typeof stubFindOnePage>[1] = []) => {
    const client = savedObjectsClientMock.create();
    stubFindOnePage(client, actions);
    return { client, activityWriter: makeActivityWriterMock() };
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('re-emits every user action created since lastRunAt in a single bulk', async () => {
    const { client, activityWriter } = setup([
      makeUserAction('ua-A', { createdAt: '2026-05-05T00:00:00.000Z' }),
      makeUserAction('ua-B', { createdAt: '2026-05-06T00:00:00.000Z' }),
    ]);

    const result = await runActivityReconciliation({
      savedObjectsClient: client,
      activityWriter,
      logger,
      lastRunAt: '2026-05-04T00:00:00.000Z',
    });

    expect(activityWriter.bulkUpsertActionsAwait).toHaveBeenCalledTimes(1);
    expect(activityWriter.bulkUpsertActionsAwait).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'ua-A' }),
        expect.objectContaining({ id: 'ua-B' }),
      ])
    );
    expect(result.processed).toBe(2);
  });

  /**
   * User actions are immutable, so the filter is a single `created_at`
   * cursor — no `updated_at` clause (contrast the cases runner). Locked
   * structurally because the mocked `find` doesn't apply the filter.
   */
  it('serializes a created_at-only filter (no updated_at branch)', async () => {
    const { client, activityWriter } = setup([]);

    await runActivityReconciliation({
      savedObjectsClient: client,
      activityWriter,
      logger,
      lastRunAt: '2026-05-04T00:00:00.000Z',
    });

    const findArgs = client.find.mock.calls[0]?.[0] as { filter?: KueryNode };
    expect(findArgs.filter).toBeDefined();
    const kuery = toKqlExpression(findArgs.filter as KueryNode);
    const TS = /"?2026-05-04T00\\?:00\\?:00\.000Z"?/;
    expect(kuery).toMatch(new RegExp(`attributes\\.created_at\\s*>\\s*${TS.source}`));
    // No cases-runner-style null-branch on updated_at.
    expect(kuery).not.toMatch(/updated_at/i);
  });

  it('walks every user action when lastRunAt is undefined (backfill / post-reset)', async () => {
    const { client, activityWriter } = setup([makeUserAction('ua-A')]);

    await runActivityReconciliation({
      savedObjectsClient: client,
      activityWriter,
      logger,
      lastRunAt: undefined,
    });

    expect(client.find).toHaveBeenCalledWith(expect.objectContaining({ filter: undefined }));
    // No explicit sort — the SO API defaults to `_shard_doc` under a PIT.
    const findArgs = client.find.mock.calls[0]?.[0] ?? {};
    expect(findArgs).not.toHaveProperty('sortField');
    expect(activityWriter.bulkUpsertActionsAwait).toHaveBeenCalledTimes(1);
  });

  it('passes namespaces: ["*"] to both the PIT open and every paged find', async () => {
    const { client, activityWriter } = setup([makeUserAction('ua-A')]);

    await runActivityReconciliation({
      savedObjectsClient: client,
      activityWriter,
      logger,
      lastRunAt: undefined,
    });

    expect(client.openPointInTimeForType).toHaveBeenCalledWith(
      CASE_USER_ACTION_SAVED_OBJECT,
      expect.objectContaining({ namespaces: ['*'] })
    );
    for (const call of (client.find as jest.Mock).mock.calls) {
      expect((call[0] as { namespaces?: string[] }).namespaces).toEqual(['*']);
    }
  });

  it('advances the cursor to tick-start time on successful drain', async () => {
    const { client, activityWriter } = setup([]); // empty → immediate drain

    const before = Date.now();
    const result = await runActivityReconciliation({
      savedObjectsClient: client,
      activityWriter,
      logger,
      lastRunAt: '2026-05-01T00:00:00.000Z',
    });
    const after = Date.now();

    const cursorMs = new Date(result.newLastRunAt).getTime();
    expect(cursorMs).toBeGreaterThanOrEqual(before);
    expect(cursorMs).toBeLessThanOrEqual(after);
  });

  it('closes the PIT even if find throws', async () => {
    const client = savedObjectsClientMock.create();
    const activityWriter = makeActivityWriterMock();
    client.find.mockRejectedValue(new Error('boom'));

    await expect(
      runActivityReconciliation({
        savedObjectsClient: client,
        activityWriter,
        logger,
        lastRunAt: undefined,
      })
    ).rejects.toThrow('boom');

    expect(client.closePointInTime).toHaveBeenCalledTimes(1);
  });

  /**
   * A writer failure mid-walk must propagate so the tick fails and the
   * cursor stays pinned (the periodic task re-walks the same window). The
   * PIT must still be released.
   */
  it('propagates a writer failure and still closes the PIT', async () => {
    const { client, activityWriter } = setup([makeUserAction('ua-A')]);
    activityWriter.bulkUpsertActionsAwait.mockRejectedValue(new Error('bulk failed'));

    await expect(
      runActivityReconciliation({
        savedObjectsClient: client,
        activityWriter,
        logger,
        lastRunAt: undefined,
      })
    ).rejects.toThrow('bulk failed');

    expect(client.closePointInTime).toHaveBeenCalledTimes(1);
  });
});
