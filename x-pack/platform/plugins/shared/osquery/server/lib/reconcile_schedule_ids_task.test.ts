/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  RECONCILE_TASK_TYPE,
  buildReconcileTaskSchedule,
  buildReconcileRunResult,
} from './reconcile_schedule_ids_task';

describe('buildReconcileTaskSchedule (one-shot reconcile task registration)', () => {
  it('schedules the reconcile task as a one-shot run (runAt set, no recurring interval)', () => {
    const runAt = new Date('2026-06-25T00:00:00.000Z');
    const params = buildReconcileTaskSchedule(runAt);

    // One-shot: runAt drives a single prompt execution.
    expect(params.runAt).toBe(runAt);
    // No recurring schedule — the daily heartbeat is gone now that minting is
    // owned by the model version. Re-run pressure on a failed pass comes from
    // the explicit `runAt` re-arm in buildReconcileRunResult, NOT a schedule.
    expect(params).not.toHaveProperty('schedule');
  });

  it('keeps the persisted task-type id stable so existing scheduled tasks are not orphaned', () => {
    const params = buildReconcileTaskSchedule(new Date('2026-06-25T00:00:00.000Z'));

    expect(params.id).toBe(RECONCILE_TASK_TYPE);
    expect(params.taskType).toBe(RECONCILE_TASK_TYPE);
    expect(RECONCILE_TASK_TYPE).toBe('osquery:backfillScheduleIds');
    expect(params.scope).toEqual(['osquery']);
  });
});

describe('buildReconcileRunResult (single-run re-arm contract)', () => {
  const now = new Date('2026-06-25T00:00:00.000Z');

  it('marks the task completed for good on a clean pass', () => {
    expect(buildReconcileRunResult(false, now)).toEqual({ state: { completed: true } });
  });

  it('re-arms with a future runAt on a failed pass so the task is not silently abandoned', () => {
    const result = buildReconcileRunResult(true, now);

    // completed:false alone would NOT re-run a single-run task — the runAt is
    // what actually retries the unreconciled packs.
    expect(result.state).toEqual({ completed: false });
    expect(result.runAt).toBeInstanceOf(Date);
    expect((result.runAt as Date).getTime()).toBeGreaterThan(now.getTime());
  });
});
