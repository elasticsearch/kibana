/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { clampCursorToNotFuture, resetReconciliationTask, RECONCILIATION_TASK_ID } from '.';

describe('clampCursorToNotFuture', () => {
  const logger = loggerMock.create();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns the cursor as-is when it is in the past', () => {
    const past = '2026-01-01T00:00:00.000Z';
    expect(clampCursorToNotFuture(past, logger)).toBe(past);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('returns undefined for a missing cursor (first-ever run)', () => {
    expect(clampCursorToNotFuture(undefined, logger)).toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  /**
   * A future cursor (clock skew or manual SO tampering) would freeze
   * incremental reconciliation: cases would stop appearing in
   * analytics with no errors logged until wall time catches up.
   * Clamping returns `undefined` so the next tick does a full
   * backfill and then resumes incremental.
   */
  it('returns undefined and warns when the cursor is in the future', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(clampCursorToNotFuture(future, logger)).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('persisted reconciliation cursor is in the future')
    );
  });

  /**
   * A corrupted (unparseable) cursor would be passed straight into
   * the KQL filter and silently match nothing, freezing
   * reconciliation. The clamp falls back to a full backfill on the
   * next tick.
   */
  it('returns undefined and warns when the cursor is unparseable', () => {
    expect(clampCursorToNotFuture('not-a-date', logger)).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('persisted reconciliation cursor is unparseable')
    );
  });
});

describe('resetReconciliationTask', () => {
  const logger = loggerMock.create();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('ensures the task is scheduled before clearing state (so the update target exists)', async () => {
    // ensureScheduled guarantees a task SO is on disk for
    // bulkUpdateState to write into. A `remove()` flow would have a
    // silent failure path when the task SO can't be deleted for
    // non-404 reasons.
    const tm = taskManagerMock.createStart();

    await resetReconciliationTask({
      taskManager: tm,
      logger,
      intervalMinutes: 30,
    });

    expect(tm.ensureScheduled).toHaveBeenCalledTimes(1);
    expect(tm.ensureScheduled).toHaveBeenCalledWith(
      expect.objectContaining({
        id: RECONCILIATION_TASK_ID,
        schedule: { interval: '30m' },
        state: {},
      })
    );
    expect(tm.bulkUpdateState).toHaveBeenCalledTimes(1);
    // Order matters: ensureScheduled must complete before bulkUpdateState.
    const ensureOrder = (tm.ensureScheduled as jest.Mock).mock.invocationCallOrder[0];
    const updateOrder = (tm.bulkUpdateState as jest.Mock).mock.invocationCallOrder[0];
    expect(ensureOrder).toBeLessThan(updateOrder);
  });

  /**
   * `/reset` must atomically rewrite the reconciliation task's
   * persisted state. A `remove` + `ensureScheduled` flow leaves the
   * stale cursor behind whenever `remove` fails for anything other
   * than 404 (cluster blip, locked SO, transient ES error), so the
   * next tick walks `updated_at > stale_cursor` and excludes every
   * case the user hasn't touched. `bulkUpdateState` writes the new
   * state regardless of whether the SO already existed.
   */
  it('force-rewrites task state via bulkUpdateState (no remove dependency)', async () => {
    const tm = taskManagerMock.createStart();

    await resetReconciliationTask({
      taskManager: tm,
      logger,
      intervalMinutes: 30,
      initialState: { cases_last_run_at: '2026-05-14T20:00:00.000Z' },
    });

    expect(tm.remove).not.toHaveBeenCalled();
    expect(tm.bulkUpdateState).toHaveBeenCalledTimes(1);
    const [ids, mapFn] = (tm.bulkUpdateState as jest.Mock).mock.calls[0];
    expect(ids).toEqual([RECONCILIATION_TASK_ID]);
    // The map function receives the (irrelevant) prior state and
    // returns the supplied initialState. Pin the contract so a
    // refactor that "preserves" old fields can't silently undo the
    // reset.
    expect(typeof mapFn).toBe('function');
    expect(
      mapFn({ cases_last_run_at: 'stale-cursor', other: 'field' }, RECONCILIATION_TASK_ID)
    ).toEqual({
      cases_last_run_at: '2026-05-14T20:00:00.000Z',
    });
  });

  it('defaults initialState to {} so a no-arg reset performs a full backfill on the next tick', async () => {
    const tm = taskManagerMock.createStart();

    await resetReconciliationTask({
      taskManager: tm,
      logger,
      intervalMinutes: 30,
    });

    const [, mapFn] = (tm.bulkUpdateState as jest.Mock).mock.calls[0];
    expect(mapFn({ cases_last_run_at: 'anything' }, RECONCILIATION_TASK_ID)).toEqual({});
  });

  it('does not throw past the boundary when bulkUpdateState fails (logs at WARN)', async () => {
    // bulkUpdateState can fail if the SO is locked by an in-flight tick
    // or on a transient cluster blip. The reset path runs from a route
    // handler that has already done useful work (dropped + recreated the
    // index, deleted data views, kicked off a direct re-walk); a failure
    // here must not roll those back.
    const tm = taskManagerMock.createStart();
    (tm.bulkUpdateState as jest.Mock).mockRejectedValueOnce(new Error('locked'));

    await expect(
      resetReconciliationTask({ taskManager: tm, logger, intervalMinutes: 30 })
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('locked'));
  });
});
