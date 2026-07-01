/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger, SavedObjectsClientContract } from '@kbn/core/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { CasesAnalyticsV2WriterContract } from '../writer';
import type { CasesActivityV2WriterContract } from '../writer/activity';
import { runReconciliation, type RunReconciliationResult } from './runner';
import { runActivityReconciliation, type RunActivityReconciliationResult } from './activity_runner';
import { resetReconciliationTask } from '.';

/** Inputs for `runFullReset`. */
export interface RunFullResetDeps {
  /** Internal (no request scope) SO client. Same one the periodic task uses. */
  savedObjectsClient: SavedObjectsClientContract;
  /** Cases-surface writer. Real instance, not the noop. */
  writer: CasesAnalyticsV2WriterContract;
  /** Activity-surface writer. Real instance, not the noop. */
  activityWriter: CasesActivityV2WriterContract;
  /**
   * Task Manager start contract. Used after both walks complete to
   * atomically reset the periodic reconciliation task's persisted state.
   * See `resetReconciliationTask` in `./index.ts` for why
   * `bulkUpdateState` is preferred over `remove`+`schedule`.
   *
   * Optional so the function stays callable in environments where Task
   * Manager isn't available; the cursor seed is skipped in that case.
   */
  taskManager: TaskManagerStartContract | null;
  /** Periodic-task cadence; threaded through to `resetReconciliationTask`. */
  intervalMinutes: number;
  /**
   * Inter-page sleep for the reconciliation runners, in milliseconds.
   * Sourced from `xpack.cases.analyticsV2.resetPageDelayMs`. The runners
   * default to `0` (yield via `setImmediate`); administrators raise this on
   * busy clusters to throttle bulk-write pressure during the full
   * backfill.
   */
  pageDelayMs: number;
  /**
   * Optional progress callback fired after each runner page completes.
   * `phase` discriminates which surface is currently being walked, and
   * `processed` is the cumulative count for that surface so the caller
   * (the reset task) can write live counts without per-page bookkeeping.
   *
   * Synchronous and non-blocking. Callers throttle downstream I/O (e.g.
   * `bulkUpdateState`) themselves so the per-page semantics here stay
   * obvious.
   */
  onProgress?: (info: { phase: 'cases' | 'activity'; processed: number }) => void;
  logger: Logger;
}

export interface RunFullResetResult {
  /** Per-surface walk outcomes. `null` if that surface's walk threw mid-flight. */
  cases: RunReconciliationResult | null;
  activity: RunActivityReconciliationResult | null;
  /**
   * ISO timestamp seeded into the periodic task's cases-surface
   * cursor on a successful walk, or `null` when the cases walk
   * failed. Seeding `null` clears the persisted cursor so the next
   * periodic tick falls back to a full cases walk and recovers any
   * docs the failed reset missed.
   */
  casesCursor: string | null;
  /**
   * ISO timestamp seeded into the periodic task's activity-surface
   * cursor on a successful walk, or `null` when the activity walk
   * failed. Same recovery semantics as `casesCursor`.
   */
  activityCursor: string | null;
  /**
   * Per-walk error captured for surface-level isolation. `null` on
   * success. Surfaced so callers can decide whether to log or report a
   * partial failure; this function never throws on a per-surface walk
   * error, so the successful surface's cursor still gets seeded.
   */
  casesError: unknown;
  activityError: unknown;
}

/**
 * The walk-and-seed phase of a full subsystem reset. Invoked by the
 * one-shot Task Manager job `cases.analyticsV2.fullReset`, which is what
 * lets `/reset` return 202 in seconds at large-tenant scale instead of
 * timing out the HTTP request mid-walk.
 *
 * Out of scope here: dropping indices, recreating indices, deleting
 * per-space data views, and clearing the bootstrap cache. Those steps
 * stay in the `/reset` handler because they're `O(spaces)` (fast) and
 * benefit from running synchronously inside the request so the administrator
 * gets immediate confirmation that destructive cleanup succeeded before
 * the much slower walk begins.
 *
 * Per-surface failure isolation: a failure on one surface logs at WARN,
 * is captured in the result, and lets the other surface proceed. The
 * cursor-seed step still runs so the surface that succeeded keeps its
 * progress.
 *
 * Cursor-seed failure is logged at WARN but does not throw. The
 * worst-case effect is that the periodic task re-walks the whole tenant
 * on its next tick — annoying, but not data-corrupting.
 */
export async function runFullReset({
  savedObjectsClient,
  writer,
  activityWriter,
  taskManager,
  intervalMinutes,
  pageDelayMs,
  onProgress,
  logger,
}: RunFullResetDeps): Promise<RunFullResetResult> {
  // Cases first, then activity. Same ordering as the periodic task: a
  // `LOOKUP JOIN .cases ON cases.id` from any post-activity consumer
  // sees the joined case row at least as up-to-date as the activity row
  // that referenced it.
  let casesResult: RunReconciliationResult | null = null;
  let casesError: unknown = null;
  try {
    casesResult = await runReconciliation({
      savedObjectsClient,
      writer,
      logger,
      lastRunAt: undefined,
      pageDelayMs,
      // Wrap the surface-agnostic runner callback to attach a phase tag.
      // Keeps the runners themselves unaware of which surface they're
      // serving.
      onPageComplete: ({ processed }) => onProgress?.({ phase: 'cases', processed }),
    });
  } catch (err) {
    casesError = err;
    logger.warn(
      `reset: full cases re-walk failed mid-flight: ${
        err instanceof Error ? err.message : String(err)
      }. Index is partially populated; the cases cursor is left unset so the next periodic tick will fall back to a full walk and recover the missing docs.`
    );
  }

  let activityResult: RunActivityReconciliationResult | null = null;
  let activityError: unknown = null;
  try {
    activityResult = await runActivityReconciliation({
      savedObjectsClient,
      activityWriter,
      logger,
      lastRunAt: undefined,
      pageDelayMs,
      onPageComplete: ({ processed }) => onProgress?.({ phase: 'activity', processed }),
    });
  } catch (err) {
    activityError = err;
    logger.warn(
      `reset: full activity re-walk failed mid-flight: ${
        err instanceof Error ? err.message : String(err)
      }. Activity index is partially populated; the activity cursor is left unset so the next periodic tick will fall back to a full walk and recover the missing docs.`
    );
  }

  // Per-surface cursor: the walk's tick-start timestamp on success, or
  // `null` on failure. Seeding `null` clears the persisted cursor so
  // the next periodic tick walks the whole surface and repairs any
  // docs the failed reset left behind.
  const casesCursor = casesResult?.newLastRunAt ?? null;
  const activityCursor = activityResult?.newLastRunAt ?? null;

  if (taskManager != null) {
    // Build the seed state with only the surfaces whose cursor we want
    // to persist. Omitting a key on failure leaves that surface
    // cursorless, which the periodic runner treats as a fresh start
    // (see the `lastRunAt ? ... : undefined` filter in `runner.ts`).
    const initialState: Record<string, string> = {};
    if (casesCursor != null) initialState.cases_last_run_at = casesCursor;
    if (activityCursor != null) initialState.activity_last_run_at = activityCursor;
    try {
      await resetReconciliationTask({
        taskManager,
        logger,
        intervalMinutes,
        initialState,
      });
    } catch (err) {
      logger.warn(
        `reset: failed to seed reconciliation cursors: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return {
    cases: casesResult,
    activity: activityResult,
    casesCursor,
    activityCursor,
    casesError,
    activityError,
  };
}
