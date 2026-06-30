/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger, SavedObject } from '@kbn/core/server';
import type { CasePersistedAttributes } from '../../common/types/case';
import { CASE_INDEX_NAME } from '../constants';
import { buildCaseDoc } from './case_doc_builder';
import { withRetry } from './retry';

/**
 * Default retry budget for analytics writes. A handful of attempts is
 * enough to ride out a brief ES blip; beyond that, reconciliation is the
 * durability backstop. Kept low so a sustained outage doesn't queue
 * unbounded background work.
 */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 250;

/**
 * HTTP status codes treated as transient failures on a per-item bulk
 * response. Anything else (400 mapper_parsing_exception, 403 forbidden,
 * etc.) is permanent — retrying won't help. Distinguishing the two
 * pins the reconciliation cursor on transient blips without
 * freezing the whole tick on a single malformed document.
 */
const RETRYABLE_BULK_ITEM_STATUSES = new Set<number>([408, 409, 429, 500, 502, 503, 504]);

interface CasesAnalyticsV2WriterDeps {
  esClient: ElasticsearchClient;
  logger: Logger;
  /** Override for tests. Production uses the defaults. */
  maxRetries?: number;
  /** Override for tests. Production uses the defaults. */
  retryInitialDelayMs?: number;
}

/**
 * Hook surface invoked by the cases SO services after a successful
 * persisted-write. Mirrors the cases SO API: single + bulk upsert,
 * single + bulk delete.
 *
 * Fire-and-forget: callers don't await, errors log at WARN and never
 * propagate. The cases SO write must never fail because analytics had
 * trouble; reconciliation re-emits anything that exhausts its retry
 * budget.
 *
 * `bulkUpsertCasesAwait` is the only awaitable method. Reconciliation
 * awaits between pages to bound in-flight bulks to one per runner;
 * SO-service hooks always use the fire-and-forget variants.
 */
export interface CasesAnalyticsV2WriterContract {
  upsertCase: (so: SavedObject<CasePersistedAttributes>) => void;
  deleteCase: (caseId: string) => void;
  bulkUpsertCases: (sos: Array<SavedObject<CasePersistedAttributes>>) => void;
  bulkDeleteCases: (caseIds: string[]) => void;
  bulkUpsertCasesAwait: (sos: Array<SavedObject<CasePersistedAttributes>>) => Promise<void>;
}

export class CasesAnalyticsV2Writer implements CasesAnalyticsV2WriterContract {
  private readonly esClient: ElasticsearchClient;
  private readonly logger: Logger;
  private readonly maxRetries: number;
  private readonly retryInitialDelayMs: number;

  constructor(deps: CasesAnalyticsV2WriterDeps) {
    this.esClient = deps.esClient;
    this.logger = deps.logger.get('writer');
    this.maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryInitialDelayMs = deps.retryInitialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  }

  /**
   * Upsert the analytics doc for a case. Called by `CasesService.createCase`
   * and `patchCase` post-success. Fire-and-forget: caller does not await.
   */
  public upsertCase(so: SavedObject<CasePersistedAttributes>): void {
    void this.fireAndForget(`case[id=${so.id}]`, () => this.doUpsertCase(so));
  }

  /**
   * Drop the analytics doc for a case. Called by `CasesService.deleteCase`
   * post-success. Fire-and-forget.
   */
  public deleteCase(caseId: string): void {
    void this.fireAndForget(`case[id=${caseId}]`, () => this.doDeleteCase(caseId));
  }

  /**
   * Bulk-upsert N case docs in a single `_bulk` request. Called by
   * `CasesService.bulkCreateCases` and `bulkPatchCases` post-success.
   * Fire-and-forget. Single bulk keeps the per-cases-write amplification
   * factor at 1× regardless of batch size.
   */
  public bulkUpsertCases(sos: Array<SavedObject<CasePersistedAttributes>>): void {
    if (sos.length === 0) return;
    void this.fireAndForget(`bulk[count=${sos.length}]`, () => this.doBulkUpsertCases(sos));
  }

  /**
   * Bulk-delete N analytics docs in a single `_bulk` request. Called by
   * `CasesService.bulkDeleteCaseEntities` for entries whose SO delete
   * succeeded. Fire-and-forget.
   */
  public bulkDeleteCases(caseIds: string[]): void {
    if (caseIds.length === 0) return;
    void this.fireAndForget(`bulk-delete[count=${caseIds.length}]`, () =>
      this.doBulkDeleteCases(caseIds)
    );
  }

  /**
   * Awaitable bulk-upsert. Same dispatch as `bulkUpsertCases`; reserved
   * for the reconciliation runner so a 50k-case backfill awaits between
   * pages instead of firing hundreds of concurrent bulks at the ES pool.
   *
   * Throws on bulk-level failure or after retries exhaust on bulks with
   * retryable per-item failures (429 / 503 / etc.). Reconciliation
   * relies on this to keep its cursor pinned: advancing past a tick with
   * a transient blip would mean the affected cases never get re-walked
   * (their `updated_at` doesn't change). Permanent per-item failures
   * (e.g. mapper errors) are logged but do not throw — those cases
   * cannot be repaired by reconciliation and must not freeze every
   * subsequent tick.
   */
  public async bulkUpsertCasesAwait(
    sos: Array<SavedObject<CasePersistedAttributes>>
  ): Promise<void> {
    if (sos.length === 0) return;
    try {
      await withRetry({
        op: () => this.doBulkUpsertCases(sos, { throwOnRetryableItemFailures: true }),
        maxRetries: this.maxRetries,
        initialDelayMs: this.retryInitialDelayMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `cases-analyticsV2: bulk-awaited write failed after ${this.maxRetries} retries [count=${sos.length}]: ${message}. Cursor pinned; reconciliation will retry the same window.`,
        { error: err }
      );
      throw err;
    }
  }

  // ----- Private "do" methods. Throw on failure so the retry wrapper can see. -----

  private async doUpsertCase(so: SavedObject<CasePersistedAttributes>): Promise<void> {
    const doc = buildCaseDoc(so);
    await this.esClient.index({
      index: CASE_INDEX_NAME,
      id: so.id,
      document: doc,
    });
  }

  private async doDeleteCase(caseId: string): Promise<void> {
    try {
      await this.esClient.delete({ index: CASE_INDEX_NAME, id: caseId });
    } catch (err) {
      // 404 is acceptable: the doc may never have been indexed (analytics
      // off at create time, or the upsert failed and reconciliation
      // hadn't picked it up yet). The desired post-state — doc absent —
      // is already met.
      if (err?.statusCode === 404 || err?.meta?.statusCode === 404) return;
      throw err;
    }
  }

  /**
   * Single `_bulk` request that indexes every supplied case as an upsert
   * (operation type `index`, which overwrites by `_id`). The bulk-level
   * promise resolves regardless of individual item failures; per-item
   * errors (typically mapper exceptions on a single bad doc) are logged
   * but don't trigger retry. Reconciliation is the backstop for those.
   *
   * Throws only on bulk-request-level failure (network, cluster down,
   * etc.), which lets `withRetry` re-attempt the entire batch.
   */
  private async doBulkUpsertCases(
    sos: Array<SavedObject<CasePersistedAttributes>>,
    opts?: { throwOnRetryableItemFailures?: boolean }
  ): Promise<void> {
    // The ES `_bulk` API takes a flat array alternating between operation
    // headers and document bodies. `operations` accepts arbitrary header
    // shapes; plain object literals avoid pulling in estypes for one line
    // each.
    const operations: object[] = [];
    for (const so of sos) {
      operations.push({ index: { _index: CASE_INDEX_NAME, _id: so.id } });
      operations.push(buildCaseDoc(so));
    }
    const response = await this.esClient.bulk({ operations });
    if (!response.errors) return;

    const ids: string[] = [];
    for (const so of sos) ids.push(so.id);
    const { retryableCount } = this.logBulkItemErrors('upsert', ids, response.items, 'index');

    if (opts?.throwOnRetryableItemFailures && retryableCount > 0) {
      throw new Error(
        `cases-analyticsV2: bulk upsert had ${retryableCount}/${sos.length} retryable item failure(s)`
      );
    }
  }

  /**
   * Single `_bulk` request that deletes every supplied case id. Per-item
   * 404s are swallowed (doc absent is the desired post-state). Other
   * per-item errors are logged but don't trigger retry; reconciliation is
   * the backstop. Throws on bulk-request-level failures so `withRetry`
   * can re-attempt.
   */
  private async doBulkDeleteCases(caseIds: string[]): Promise<void> {
    const operations: object[] = [];
    for (const id of caseIds) {
      operations.push({ delete: { _index: CASE_INDEX_NAME, _id: id } });
    }
    const response = await this.esClient.bulk({ operations });
    if (response.errors) {
      this.logBulkItemErrors('delete', caseIds, response.items, 'delete');
    }
  }

  /**
   * Walk bulk-response items, log per-item errors at WARN, and report
   * how many were transient (retryable). Skips 404s for delete
   * ops — "already absent" is the desired post-state.
   */
  private logBulkItemErrors(
    label: 'upsert' | 'delete',
    ids: string[],
    items: BulkResponseItem[],
    opKey: 'index' | 'delete'
  ): { loggedCount: number; retryableCount: number } {
    let loggedCount = 0;
    let retryableCount = 0;
    for (let idx = 0; idx < items.length; idx++) {
      const op = items[idx][opKey];
      // Skip items that succeeded. For delete ops, also skip 404s —
      // "already absent" matches the desired post-state.
      if (op?.error != null && !(opKey === 'delete' && op.status === 404)) {
        const status = op.status ?? 0;
        const isRetryable = RETRYABLE_BULK_ITEM_STATUSES.has(status);
        if (isRetryable) retryableCount++;

        this.logger.warn(
          `cases-analyticsV2: bulk-${label} item failed [id=${
            ids[idx]
          }, status=${status}, retryable=${isRetryable}]: ${op.error.reason ?? 'unknown'}`
        );
        loggedCount++;
      }
    }
    if (loggedCount > 0) {
      this.logger.warn(
        `cases-analyticsV2: bulk-${label} completed with ${loggedCount}/${ids.length} item failures (${retryableCount} retryable)`
      );
    }
    return { loggedCount, retryableCount };
  }

  /**
   * Fire-and-forget wrapper. Errors log at WARN, not ERROR: bulk write
   * amplification means a transient blip could spam thousands of lines
   * and trip on-call alerting on something reconciliation will repair
   * anyway.
   *
   * The returned promise resolves on success or after the post-retry-
   * budget log; it never rejects. Single-item callers `void` it.
   */
  private fireAndForget(targetId: string, op: () => Promise<void>): Promise<void> {
    return withRetry({
      op,
      maxRetries: this.maxRetries,
      initialDelayMs: this.retryInitialDelayMs,
    }).catch((err: Error) => {
      this.logger.warn(
        `cases-analyticsV2: write failed after ${this.maxRetries} retries [${targetId}]: ${err.message}. Reconciliation will retry.`,
        { error: err }
      );
    });
  }
}

/**
 * Minimal shape of a single response item from `esClient.bulk`. The full
 * type from `@elastic/elasticsearch` carries every possible operation
 * shape and ends up needing casts at every use; this captures only what
 * the writer reads — status code and error reason — keyed by op type.
 *
 * `error.reason` is `string | null | undefined` to match the ES client's
 * `ErrorCause.reason` (upstream allows `null`); the structural assignment
 * from `response.items` only type-checks when nullability matches. The
 * `?? 'unknown'` fallback at the call site handles both `null` and
 * `undefined`.
 */
interface BulkResponseItem {
  index?: { status?: number; error?: { reason?: string | null } };
  delete?: { status?: number; error?: { reason?: string | null } };
}

/**
 * No-op writer used when v2 is disabled. SO services hold an
 * unconditional writer reference, so every call site can dispatch
 * without an `if (writer)` guard — when the feature flag is off, the
 * reference is this no-op.
 */
export const V2_NOOP_WRITER: CasesAnalyticsV2WriterContract = {
  upsertCase: () => {},
  deleteCase: () => {},
  bulkUpsertCases: () => {},
  bulkDeleteCases: () => {},
  bulkUpsertCasesAwait: async () => {},
};
