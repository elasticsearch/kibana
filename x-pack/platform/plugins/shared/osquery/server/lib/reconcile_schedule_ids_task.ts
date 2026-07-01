/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Task Manager registration/scheduling helpers for the schedule-id wire
 * reconciler (`reconcileScheduleIdsToWire`). Kept out of `plugin.ts` so the
 * one-shot + re-arm contracts are pure, independently unit-testable units
 * (see `reconcile_schedule_ids_task.test.ts`) rather than closures buried in
 * plugin wiring.
 */

// Persisted Task Manager task-type id. Kept historically named
// `backfillScheduleIds` so existing scheduled tasks are not orphaned across an
// upgrade, even though the task now reconciles rather than backfills.
export const RECONCILE_TASK_TYPE = 'osquery:backfillScheduleIds';

// Delay before a partially-failed reconcile pass re-runs. Long enough to let a
// concurrent package-policy write settle (the usual cause of a 409), short
// enough that customers aren't left on a stale wire for long.
export const RECONCILE_RETRY_DELAY_MS = 5 * 60 * 1000;

/**
 * Build the Task Manager `ensureScheduled` params for the reconciler. The
 * one-shot contract is pinned here: `runAt` is set (run promptly, once) and
 * there is NO recurring `schedule`.
 */
export const buildReconcileTaskSchedule = (runAt: Date) => ({
  id: RECONCILE_TASK_TYPE,
  taskType: RECONCILE_TASK_TYPE,
  scope: ['osquery'],
  runAt,
  params: {},
  state: {},
});

/**
 * Run result for this single-run task: a failed pass re-arms via a near-future
 * `runAt` (a single-run task that returns no `runAt` is never re-run, so
 * `completed: false` alone would abandon it); a clean pass ends the task.
 */
export const buildReconcileRunResult = (hadFailures: boolean, now: Date) =>
  hadFailures
    ? {
        state: { completed: false },
        runAt: new Date(now.getTime() + RECONCILE_RETRY_DELAY_MS),
      }
    : { state: { completed: true } };
