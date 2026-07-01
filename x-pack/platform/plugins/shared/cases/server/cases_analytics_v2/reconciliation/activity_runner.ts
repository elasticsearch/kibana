/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SortResults } from '@elastic/elasticsearch/lib/api/types';
import type { Logger, SavedObjectsClientContract, SavedObjectsFindResult } from '@kbn/core/server';
import { nodeBuilder } from '@kbn/es-query';
import { CASE_USER_ACTION_SAVED_OBJECT } from '../../../common/constants';
import type { UserActionPersistedAttributes } from '../../common/types/user_actions';
import type { CasesActivityV2WriterContract } from '../writer/activity';

/**
 * User-action SOs fetched per ES round-trip. Matched to the cases runner's
 * page size. The per-page sync CPU is dominated by `JSON.stringify` over
 * the polymorphic `payload` field, which can be large for bulk-attachment
 * or push payloads — 100 keeps the worst-case sync span between event-loop
 * yields bounded; throughput is limited by ES bulk roundtrip latency, not
 * page count.
 */
const PAGE_SIZE = 100;

/**
 * SO-namespaces value meaning "every namespace". Same rationale as in the
 * cases runner: the unscoped internal client defaults to the `default`
 * namespace; explicit `['*']` opts every space in. Kept identical to the
 * cases runner's value so a future change to the contract can be found
 * with one search.
 */
const NAMESPACES_ALL: string[] = ['*'];

/**
 * Cap on the per-space breakdown reported in the summary log line. Same
 * rationale as in the cases runner.
 */
const SUMMARY_TOP_N_SPACES = 25;

export interface RunActivityReconciliationDeps {
  /** Internal SO client (no request scope). Used to walk every user action across every space. */
  savedObjectsClient: SavedObjectsClientContract;
  activityWriter: CasesActivityV2WriterContract;
  logger: Logger;
  /**
   * ISO timestamp from the previous successful tick. Only user actions
   * created after this point are walked. `undefined` on the first run
   * (backfill mode, walks every user action). `/reset` clears the cursor
   * to force a backfill later.
   */
  lastRunAt: string | undefined;
  /**
   * Optional sleep between pages, in milliseconds. Default `0`. Same
   * semantics as the cases runner's `pageDelayMs`. Activity volume
   * outpaces cases volume by ~15× in measured tenants, so this knob has
   * a larger wall-clock impact on the activity walk.
   */
  pageDelayMs?: number;
  /**
   * Optional progress callback. Same shape and semantics as the cases
   * runner's `onPageComplete`. Fired after each page's bulk-upsert with
   * the cumulative `processed` count. Synchronous; callers do their own
   * throttling for downstream I/O.
   */
  onPageComplete?: (info: { processed: number }) => void;
}

export interface RunActivityReconciliationResult {
  /** ISO timestamp to persist as the next `last_run_at`. */
  newLastRunAt: string;
  /** Count of user actions re-emitted during the tick. */
  processed: number;
}

/**
 * Activity reconciliation tick. Walks every user-action saved object
 * created since the last successful tick and re-emits its analytics doc
 * via the writer.
 *
 * Filtered on `created_at` only because user actions are immutable at the
 * SO layer — once written, they're never patched, so there is no
 * `updated_at` to consult. The cases runner's split filter (cursor on
 * `updated_at`, plus a `updated_at IS MISSING AND created_at > lastRunAt`
 * branch for never-patched cases) collapses to just the `created_at`
 * cursor here.
 *
 * Cascade-on-case-delete is not handled here. When a case is deleted, its
 * user-action SOs are cascaded by the SO layer; reconciliation walks
 * forward in time from the cursor and never sees the gap. The activity
 * writer's `bulkDeleteActionsByCaseIds` path (called from
 * `CasesService.deleteCase` and `bulkDeleteCaseEntities`) is the only
 * path that drops orphaned analytics docs — if those cascades are ever
 * lost, the activity index ends up with stale rows and there's no cheap
 * way to detect that here without re-walking every SO.
 */
export async function runActivityReconciliation({
  savedObjectsClient,
  activityWriter,
  logger,
  lastRunAt,
  pageDelayMs = 0,
  onPageComplete,
}: RunActivityReconciliationDeps): Promise<RunActivityReconciliationResult> {
  // Tick start, captured before any I/O. Persisted as the new cursor on
  // a successful drain so user actions created during the tick fall into
  // the next window rather than being skipped.
  const tickStartedAt = new Date().toISOString();

  // Single clause — see the function docstring for why `created_at` is
  // sufficient.
  const filter = lastRunAt
    ? nodeBuilder.range(`${CASE_USER_ACTION_SAVED_OBJECT}.attributes.created_at`, 'gt', lastRunAt)
    : undefined;

  // Open a PIT for consistent paging against a fixed snapshot.
  // `NAMESPACES_ALL` is required because an unscoped internal SO client
  // otherwise scopes to `default`. See the cases runner for details.
  const pit = await savedObjectsClient.openPointInTimeForType(CASE_USER_ACTION_SAVED_OBJECT, {
    namespaces: NAMESPACES_ALL,
  });

  let processed = 0;
  let searchAfter: SortResults | undefined;
  // Per-space counts for the summary log line.
  const processedBySpace = new Map<string, number>();

  try {
    while (true) {
      const page = await savedObjectsClient.find<UserActionPersistedAttributes>({
        type: CASE_USER_ACTION_SAVED_OBJECT,
        filter,
        // Required even with the unscoped internal SO client — see the
        // cases runner for the detailed explanation. Without it, every
        // user action in every non-default space is silently skipped.
        namespaces: NAMESPACES_ALL,
        // No `sortField` — under PIT the SO API defaults to `_shard_doc`
        // (unique per doc, optimal for `searchAfter` walks). Analytics
        // docs are idempotent on `_id`, so traversal order isn't
        // meaningful.
        perPage: PAGE_SIZE,
        pit: { id: pit.id },
        searchAfter,
      });

      if (page.saved_objects.length === 0) {
        break;
      }

      // Dispatch the page as a single `_bulk` request and await it
      // before fetching the next page. Same rationale as in the cases
      // runner: bounded concurrency, one round-trip per page, retryable
      // failures pin the cursor and force a re-walk.
      await activityWriter.bulkUpsertActionsAwait(page.saved_objects);

      for (const so of page.saved_objects) {
        processed++;
        const space = so.namespaces?.[0] ?? 'default';
        processedBySpace.set(space, (processedBySpace.get(space) ?? 0) + 1);
      }

      // Live progress signal — see the matching call in `runner.ts`
      // (post-upsert, post-counts, fire-and-forget).
      onPageComplete?.({ processed });

      searchAfter = getLastSort(page.saved_objects);

      if (page.saved_objects.length < PAGE_SIZE) {
        break;
      }

      // Yield to the event loop between pages — see the matching comment
      // in `runner.ts`. User actions outnumber cases ~15:1 in measured
      // tenants, so this yield matters more here: a backfill walk is
      // otherwise a long sync-CPU train inside a single handler.
      if (pageDelayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, pageDelayMs));
      } else {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
  } finally {
    // Always close the PIT — leaked PITs hold ES resources until they expire.
    await savedObjectsClient.closePointInTime(pit.id);
  }

  const perSpaceSummary = formatTopSpaces(processedBySpace);

  logger.info(
    `cases-analyticsV2: activity reconciliation processed=${processed}${perSpaceSummary} lastRunAt=${
      lastRunAt ?? '<none>'
    } newLastRunAt=${tickStartedAt}`
  );

  return { newLastRunAt: tickStartedAt, processed };
}

function getLastSort<T>(results: Array<SavedObjectsFindResult<T>>): SortResults | undefined {
  return results[results.length - 1]?.sort;
}

/**
 * Top-N per-space counts formatted as ` by_space={a=10, b=8, ...}` for
 * the summary log. Returns an empty string when no docs were processed.
 *
 * Mirrors the cases runner's helper. Not extracted to a shared helper
 * because the two surfaces evolve independently and a shared helper would
 * couple them.
 */
function formatTopSpaces(processedBySpace: Map<string, number>): string {
  if (processedBySpace.size === 0) return '';

  const top: Array<[string, number]> = [];
  for (const entry of processedBySpace) {
    if (top.length < SUMMARY_TOP_N_SPACES) {
      top.push(entry);
    } else {
      let minIdx = 0;
      for (let i = 1; i < top.length; i++) {
        if (top[i][1] < top[minIdx][1]) minIdx = i;
      }
      if (entry[1] > top[minIdx][1]) top[minIdx] = entry;
    }
  }
  top.sort((a, b) => b[1] - a[1]);

  let summary = ' by_space={';
  for (let i = 0; i < top.length; i++) {
    if (i > 0) summary += ', ';
    summary += `${top[i][0]}=${top[i][1]}`;
  }
  if (processedBySpace.size > SUMMARY_TOP_N_SPACES) {
    summary += `, ... +${processedBySpace.size - SUMMARY_TOP_N_SPACES} more`;
  }
  summary += '}';
  return summary;
}
