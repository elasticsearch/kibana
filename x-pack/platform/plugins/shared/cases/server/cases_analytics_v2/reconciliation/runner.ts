/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SortResults } from '@elastic/elasticsearch/lib/api/types';
import type { Logger, SavedObjectsClientContract, SavedObjectsFindResult } from '@kbn/core/server';
import { fromKueryExpression, nodeBuilder } from '@kbn/es-query';
import { CASE_SAVED_OBJECT } from '../../../common/constants';
import type { CasePersistedAttributes } from '../../common/types/case';
import type { CasesAnalyticsV2WriterContract } from '../writer';

/**
 * Number of case SOs fetched per ES round-trip. Small enough that Task
 * Manager's task-runtime budget stays comfortable even on cases with heavy
 * `extended_fields` payloads.
 */
const PAGE_SIZE = 100;

/**
 * SO-namespaces value meaning "every namespace". The runner's SO client is
 * the unscoped internal client (no spaces extension), so without this the
 * default `find` / `openPointInTimeForType` behaviour is to look only in
 * the `default` namespace — silently skipping every case in every other
 * space. The SO repository's search DSL builder treats `'*'` as
 * `ALL_NAMESPACES_STRING` and lifts the namespace filter. The same value
 * feeds both the PIT open call and every paged find so snapshot and page
 * reads agree on scope.
 */
const NAMESPACES_ALL: string[] = ['*'];

/**
 * Cap on the per-space breakdown reported in the summary log line.
 * Tenants with thousands of spaces would otherwise emit a log line large
 * enough to disrupt ingest; this keeps the line readable while still
 * surfacing the top contributors to a noisy tick.
 */
const SUMMARY_TOP_N_SPACES = 25;

export interface RunReconciliationDeps {
  /** Internal SO client (no request scope). Used to walk every case across every space. */
  savedObjectsClient: SavedObjectsClientContract;
  writer: CasesAnalyticsV2WriterContract;
  logger: Logger;
  /**
   * ISO timestamp from the previous successful tick. Only cases updated
   * after this point are walked. `undefined` on the first run (backfill
   * mode, walks every case). `/reset` clears the cursor to force a
   * backfill later.
   */
  lastRunAt: string | undefined;
  /**
   * Optional sleep between pages, in milliseconds. Default `0` (yield via
   * `setImmediate` only — see the inter-page yield comment below).
   *
   * Sourced from `xpack.cases.analyticsV2.resetPageDelayMs` and applied
   * only when this runner is invoked from the reset task. The periodic
   * task path leaves it at `0` because the periodic tick is `O(delta)` —
   * bounded and fast, with no need to throttle.
   *
   * Administrators on shared or capacity-constrained clusters can raise this
   * so a post-reset backfill trickles into ES instead of running at full
   * throttle for the duration of the walk.
   */
  pageDelayMs?: number;
  /**
   * Optional progress callback fired after each page's bulk-upsert
   * completes successfully. `processed` is the cumulative count for the
   * current walk (not a per-page delta) so callers implementing
   * throttled progress reporting can write the latest value into task
   * state without bookkeeping.
   *
   * Periodic-task callers omit this — the periodic tick is short enough
   * that mid-run progress isn't useful, and any callback overhead would
   * compound across thousands of ticks per day. The reset task is the
   * only caller; it wires this up to a wall-clock-throttled
   * `bulkUpdateState` so `/state.active_reset.state` reflects live
   * progress during long backfills.
   *
   * Synchronous and non-blocking: callbacks must not do I/O directly
   * (the runner doesn't await them). The reset task's wiring keeps the
   * SO write off the critical path via a fire-and-forget throttled
   * wrapper.
   */
  onPageComplete?: (info: { processed: number }) => void;
}

export interface RunReconciliationResult {
  /** ISO timestamp to persist as the next `last_run_at`. */
  newLastRunAt: string;
  /** Count of cases re-emitted during the tick. Logged + reported via /state. */
  processed: number;
}

/**
 * Single reconciliation tick. Walks every case saved object updated since
 * the last successful tick and re-emits its analytics doc via the writer.
 *
 * Acts as the durability backstop for the primary write path (SO-service
 * hooks), which logs and swallows errors so analytics never blocks the
 * user's request. A transient ES blip can leave a case un-mirrored; every
 * tick re-walks recent activity and `writer.upsertCase` is idempotent,
 * so misses repair on the next tick.
 *
 * Uses PIT + `searchAfter` rather than `find` paging because the SO
 * `find` API caps at `index.max_result_window` (~10k); a backfill from an
 * empty cursor can exceed that. PIT + `searchAfter` has no such cap.
 *
 * On successful drain, `last_run_at` advances to the tick start time
 * captured before any I/O — cases updated during the tick land in the
 * next tick's window. The caller persists the returned cursor.
 */
export async function runReconciliation({
  savedObjectsClient,
  writer,
  logger,
  lastRunAt,
  pageDelayMs = 0,
  onPageComplete,
}: RunReconciliationDeps): Promise<RunReconciliationResult> {
  // Tick start, captured before any I/O. Persisted as the new cursor on a
  // successful drain so the next tick sees only cases updated after this
  // moment. Cases updated during the tick fall into the next window
  // rather than being skipped.
  const tickStartedAt = new Date().toISOString();

  // KQL filter passed to the SO client. The `attributes.` prefix is
  // required because SOs are stored namespaced under their type.
  //
  // Newly-created cases land in the SO store with `updated_at = null`
  // (see `transformNewCase` in `common/utils.ts`) and stay that way
  // until someone patches the case. The cursor-based `updated_at`
  // range therefore can't catch a never-patched case on its own — the
  // null branch is the path that picks up newly-created cases the
  // writer missed at create time.
  //
  //   - clause 1: updated_at > lastRunAt
  //                 (existing case, patched since the previous tick)
  //   - clause 2: updated_at IS MISSING AND created_at > lastRunAt
  //                 (never-patched case, created since the previous
  //                  tick — typically the writer missed it at create
  //                  time)
  //
  // The `created_at > lastRunAt` guard on clause 2 keeps the per-tick
  // walk bounded by recent activity rather than re-emitting every
  // never-patched case ever created. Drift between the SO store and
  // `.cases` for a case that was never patched and was created before
  // `lastRunAt` (e.g. an out-of-band ES delete) is repaired by
  // `POST /reset`, which clears the cursor and walks every case.
  //
  // `fromKueryExpression('not <field>:*')` is the standard KQL idiom for
  // "field is missing or null"; there's no `nodeBuilder` helper for it.
  const filter = lastRunAt
    ? nodeBuilder.or([
        nodeBuilder.range(`${CASE_SAVED_OBJECT}.attributes.updated_at`, 'gt', lastRunAt),
        nodeBuilder.and([
          fromKueryExpression(`not ${CASE_SAVED_OBJECT}.attributes.updated_at:*`),
          nodeBuilder.range(`${CASE_SAVED_OBJECT}.attributes.created_at`, 'gt', lastRunAt),
        ]),
      ])
    : undefined;

  // Open a PIT so paging is consistent against a fixed snapshot of the
  // index — concurrent writes don't shift the results. `NAMESPACES_ALL`
  // is required for the same reason as on the page reads below: under an
  // unscoped internal SO client, omitting it scopes the snapshot to the
  // `default` namespace.
  const pit = await savedObjectsClient.openPointInTimeForType(CASE_SAVED_OBJECT, {
    namespaces: NAMESPACES_ALL,
  });

  let processed = 0;
  let searchAfter: SortResults | undefined;
  // Per-space counts for the summary log line. Lets administrators answer
  // "where did the missing case live?" without an extra query.
  const processedBySpace = new Map<string, number>();

  try {
    while (true) {
      const page = await savedObjectsClient.find<CasePersistedAttributes>({
        type: CASE_SAVED_OBJECT,
        filter,
        // Must pass `namespaces: ['*']` even with the unscoped internal
        // SO client. When the spaces extension is absent the SO
        // repository's `find` defaults `options.namespaces` to
        // `[DEFAULT_NAMESPACE_STRING]` (see
        // `core/saved-objects/api-server-internal/.../find.ts`), silently
        // restricting the walk to `default` and skipping every case in
        // every other space.
        namespaces: NAMESPACES_ALL,
        // No `sortField` — with a PIT the SO API defaults to `_shard_doc`,
        // which is unique per doc (no ties → no `searchAfter` skips or
        // dupes when many cases share the same timestamp, e.g. bulk
        // imports) and is the recommended sort for PIT walks per the ES
        // docs. Result order isn't analytically meaningful since upsert
        // is idempotent.
        perPage: PAGE_SIZE,
        pit: { id: pit.id },
        searchAfter,
      });

      if (page.saved_objects.length === 0) {
        break;
      }

      // Dispatch the page as a single `_bulk` request and await it before
      // fetching the next page:
      //   1. Bulk dispatch collapses N ES `index` requests into one,
      //      keeping the connection pool from saturating on cold-start or
      //      post-reset walks that can span tens of thousands of cases.
      //   2. Awaiting between pages bounds concurrency to one in-flight
      //      bulk per runner. A fanout loop could push thousands of
      //      writes into ES while the runner kept paging, overflowing the
      //      indexing queue (429s) and exhausting the writer's retry
      //      budget — reconciliation would then drop docs the next tick
      //      has to repair.
      //
      // `bulkUpsertCasesAwait` throws on bulk-level failure or retry
      // exhaustion (retryable per-item failures like 429s count as
      // retryable). The throw aborts the tick before the cursor is
      // persisted, so the next tick re-walks the same window. Permanent
      // per-item failures (e.g. mapper errors) are logged inside the
      // writer but do not throw; those cases can't be repaired by
      // reconciliation and rely on the case's next update to retry.
      await writer.bulkUpsertCasesAwait(page.saved_objects);

      for (const so of page.saved_objects) {
        processed++;
        // Bucket by space for the summary log. Cases SOs are
        // `multiple-isolated`, so `namespaces` is always a single-element
        // array; `?? 'default'` is a safety net for the theoretical
        // empty-array edge case.
        const space = so.namespaces?.[0] ?? 'default';
        processedBySpace.set(space, (processedBySpace.get(space) ?? 0) + 1);
      }

      // Live progress signal for callers wiring this into `/state`. Fired
      // after the bulk-upsert and counts loop so the reported value
      // reflects what's actually been mirrored to ES, not what was merely
      // read from the SO store. Fire-and-forget: the callback must not
      // throw or do I/O directly, and the runner doesn't await it.
      onPageComplete?.({ processed });

      // The last result's `sort` field is the cursor for the next page.
      searchAfter = getLastSort(page.saved_objects);

      // Partial page = end of the result set; no point in another round-trip.
      if (page.saved_objects.length < PAGE_SIZE) {
        break;
      }

      // Yield to the event loop between pages. Each await on `find` /
      // `bulkUpsert` only yields for the duration of its I/O; on a warm
      // cache or healthy cluster the I/O resolves fast enough that the
      // next page's CPU work (doc-build + operations array + ES client
      // NDJSON serialization) runs back-to-back, accumulating a single
      // long ELU span that trips Kibana's "Event loop utilization
      // exceeded threshold" warning and starves concurrent requests.
      //
      //   - `pageDelayMs == 0` (default; periodic-task path): yield via
      //     `setImmediate`. Schedules onto the macrotask queue after
      //     pending I/O so other requests waiting on I/O are serviced
      //     before the next page begins. Sub-millisecond.
      //   - `pageDelayMs > 0` (reset-task path with administrator-tuned
      //     throttle): sleep for the configured duration. Trades
      //     wall-clock walk time for reduced ES indexing pressure during
      //     a long backfill. See `xpack.cases.analyticsV2.resetPageDelayMs`.
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

  // Top-N spaces by processed count. Bounded selection keeps the log
  // line readable at thousands of spaces.
  const perSpaceSummary = formatTopSpaces(processedBySpace);

  logger.info(
    `cases-analyticsV2: reconciliation processed=${processed}${perSpaceSummary} lastRunAt=${
      lastRunAt ?? '<none>'
    } newLastRunAt=${tickStartedAt}`
  );

  return { newLastRunAt: tickStartedAt, processed };
}

/** Last result's `sort` field — the cursor fed back as `searchAfter`. */
function getLastSort<T>(results: Array<SavedObjectsFindResult<T>>): SortResults | undefined {
  return results[results.length - 1]?.sort;
}

/**
 * Top-N per-space counts formatted as ` by_space={a=10, b=8, ...}` for
 * the summary log. Returns an empty string when no cases were processed.
 *
 * Uses a bounded partial-sort so cost stays `O(S × N)` rather than
 * `O(S log S)` at thousands of spaces.
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
