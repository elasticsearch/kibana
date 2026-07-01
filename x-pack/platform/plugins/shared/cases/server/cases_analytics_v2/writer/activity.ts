/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger, SavedObject } from '@kbn/core/server';
import type { UserActionPersistedAttributes } from '../../common/types/user_actions';
import { ACTIVITY_INDEX_NAME } from '../constants';
import { buildActivityDoc } from './activity_doc_builder';
import { withRetry } from './retry';

/**
 * Default retry budget for activity writes. Same defaults as the cases
 * writer — a handful of attempts is enough to ride out a brief ES blip;
 * beyond that, reconciliation is the durability backstop. Kept low so a
 * sustained outage doesn't queue unbounded background work.
 */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 250;

/**
 * HTTP status codes treated as transient failures on a per-item bulk
 * response. Anything else (400 mapper_parsing_exception, 403 forbidden,
 * etc.) is permanent — retrying won't help. Mirrors the cases writer; kept
 * local so the two surfaces evolve their own retry policy if needed.
 */
const RETRYABLE_BULK_ITEM_STATUSES = new Set<number>([408, 409, 429, 500, 502, 503, 504]);

interface CasesActivityV2WriterDeps {
  esClient: ElasticsearchClient;
  logger: Logger;
  /** Override for tests. Production uses the defaults. */
  maxRetries?: number;
  /** Override for tests. Production uses the defaults. */
  retryInitialDelayMs?: number;
}

/**
 * Hook surface invoked by the user-actions SO service after a
 * successful persisted-write. User actions are immutable at the SO
 * layer, so the writer exposes single + bulk upsert and a
 * cascade-delete keyed by case id (mirrors the SO layer's
 * delete-on-case-delete). No per-action delete path.
 *
 * Fire-and-forget: callers don't await, errors log at WARN and never
 * propagate. The user-action SO write must never fail because
 * analytics had trouble; reconciliation re-emits anything that
 * exhausts its retry budget.
 *
 * `bulkUpsertActionsAwait` is the only awaitable method. Reconciliation
 * awaits between pages to bound in-flight bulks to one per runner;
 * SO-service hooks always use the fire-and-forget variants.
 */
export interface CasesActivityV2WriterContract {
  upsertAction: (so: SavedObject<UserActionPersistedAttributes>) => void;
  bulkUpsertActions: (sos: Array<SavedObject<UserActionPersistedAttributes>>) => void;
  bulkDeleteActionsByCaseIds: (caseIds: string[]) => void;
  bulkUpsertActionsAwait: (sos: Array<SavedObject<UserActionPersistedAttributes>>) => Promise<void>;
}

export class CasesActivityV2Writer implements CasesActivityV2WriterContract {
  private readonly esClient: ElasticsearchClient;
  private readonly logger: Logger;
  private readonly maxRetries: number;
  private readonly retryInitialDelayMs: number;

  constructor(deps: CasesActivityV2WriterDeps) {
    this.esClient = deps.esClient;
    this.logger = deps.logger.get('activity-writer');
    this.maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryInitialDelayMs = deps.retryInitialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  }

  /**
   * Upsert the analytics doc for a user action. Called by
   * `UserActionService.create` post-success. Fire-and-forget.
   */
  public upsertAction(so: SavedObject<UserActionPersistedAttributes>): void {
    void this.fireAndForget(`action[id=${so.id}]`, () => this.doUpsertAction(so));
  }

  /**
   * Bulk-upsert N user-action docs in a single `_bulk` request. Called
   * by `UserActionService.bulkCreate` post-success. Fire-and-forget.
   * Single bulk keeps the per-write amplification factor at 1×
   * regardless of batch size.
   */
  public bulkUpsertActions(sos: Array<SavedObject<UserActionPersistedAttributes>>): void {
    if (sos.length === 0) return;
    void this.fireAndForget(`bulk[count=${sos.length}]`, () => this.doBulkUpsertActions(sos));
  }

  /**
   * Cascade-delete every analytics activity doc whose `cases.id` matches
   * one of the supplied case ids. Called by `CasesService.bulkDelete*`
   * for case-level deletions. Fire-and-forget. The reconciliation
   * filter (`created_at > tracker`) won't re-emit a doc whose source SO
   * is gone, so this is the only path that drops cascade-orphaned
   * activity docs.
   *
   * Implemented as `delete_by_query` rather than `_bulk`: the writer
   * doesn't know which user-action ids existed for the deleted cases,
   * and the SO service has already deleted the user-action SOs, so a
   * `terms` query on `cases.id` is the cheapest correct path.
   *
   * Known limitation: this is the ONLY path that drops cascade-orphaned
   * activity docs. Reconciliation walks forward on `created_at` and
   * never revisits a deleted case, so if this fire-and-forget delete
   * exhausts its retry budget the affected docs are orphaned
   * permanently — a `LOOKUP JOIN .cases` would surface activity for a
   * case that no longer exists. There is no reconciliation backstop;
   * `/reset` (which drops and rebuilds the index) is the only recovery.
   */
  public bulkDeleteActionsByCaseIds(caseIds: string[]): void {
    if (caseIds.length === 0) return;
    void this.fireAndForget(`delete-by-cases[count=${caseIds.length}]`, () =>
      this.doDeleteActionsByCaseIds(caseIds)
    );
  }

  /**
   * Awaitable bulk-upsert. Same dispatch as `bulkUpsertActions`;
   * reserved for the reconciliation runner so a large user-actions
   * backfill awaits between pages instead of firing many concurrent
   * bulks at the ES pool.
   *
   * Throws on bulk-level failure or after retries exhaust on bulks with
   * retryable per-item failures (429 / 503 / etc.). Reconciliation
   * relies on this to keep its cursor pinned: advancing past a tick
   * with a transient blip would leave the affected user actions
   * un-mirrored forever (their `created_at` doesn't change). Permanent
   * per-item failures (e.g. mapper errors) are logged but do not throw;
   * those docs cannot be repaired by reconciliation and must not freeze
   * every subsequent tick.
   */
  public async bulkUpsertActionsAwait(
    sos: Array<SavedObject<UserActionPersistedAttributes>>
  ): Promise<void> {
    if (sos.length === 0) return;
    try {
      await withRetry({
        op: () => this.doBulkUpsertActions(sos, { throwOnRetryableItemFailures: true }),
        maxRetries: this.maxRetries,
        initialDelayMs: this.retryInitialDelayMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `cases-analyticsV2: activity bulk-awaited write failed after ${this.maxRetries} retries [count=${sos.length}]: ${message}. Tracker pinned; reconciliation will retry the same window.`,
        { error: err }
      );
      throw err;
    }
  }

  // ----- Private "do" methods. Throw on failure so the retry wrapper can see. -----

  private async doUpsertAction(so: SavedObject<UserActionPersistedAttributes>): Promise<void> {
    const doc = buildActivityDoc(so);
    await this.esClient.index({
      index: ACTIVITY_INDEX_NAME,
      id: so.id,
      document: doc,
    });
  }

  /**
   * Single `_bulk` request that indexes every supplied user-action as
   * an upsert (operation type `index`, which overwrites by `_id`). The
   * bulk-level promise resolves regardless of individual item failures;
   * per-item errors (typically mapper exceptions on a single bad doc)
   * are logged but don't trigger retry. Reconciliation is the backstop.
   *
   * Throws only on bulk-request-level failure (network, cluster down,
   * etc.), which lets `withRetry` re-attempt the entire batch.
   */
  private async doBulkUpsertActions(
    sos: Array<SavedObject<UserActionPersistedAttributes>>,
    opts?: { throwOnRetryableItemFailures?: boolean }
  ): Promise<void> {
    const operations: object[] = [];
    for (const so of sos) {
      operations.push({ index: { _index: ACTIVITY_INDEX_NAME, _id: so.id } });
      operations.push(buildActivityDoc(so));
    }
    const response = await this.esClient.bulk({ operations });
    if (!response.errors) return;

    const ids: string[] = [];
    for (const so of sos) ids.push(so.id);
    const { retryableCount } = this.logBulkItemErrors('upsert', ids, response.items, 'index');

    if (opts?.throwOnRetryableItemFailures && retryableCount > 0) {
      throw new Error(
        `cases-analyticsV2: activity bulk upsert had ${retryableCount}/${sos.length} retryable item failure(s)`
      );
    }
  }

  private async doDeleteActionsByCaseIds(caseIds: string[]): Promise<void> {
    try {
      await this.esClient.deleteByQuery({
        index: ACTIVITY_INDEX_NAME,
        // `refresh: false`: bulk cascade deletes are background work.
        // Forcing a refresh on every case-batch delete would be
        // expensive on tenants that delete in bulk, and the small
        // window where analytics docs survive past the case SO delete
        // is acceptable since this surface is eventually consistent.
        refresh: false,
        // `conflicts: proceed`: a concurrent reconciliation re-emit
        // could race; skip the conflicting doc rather than failing the
        // whole delete-by-query. The next reconciliation tick won't
        // re-emit anyway because the source SO is gone.
        conflicts: 'proceed',
        query: {
          terms: { 'cases.id': caseIds },
        },
      });
    } catch (err) {
      // 404 on the index itself means the bootstrap hasn't happened yet
      // (analytics was enabled mid-flight). Nothing to delete.
      if (err?.statusCode === 404 || err?.meta?.statusCode === 404) return;
      throw err;
    }
  }

  /**
   * Walk bulk-response items, log per-item errors at WARN, and report
   * how many were transient (retryable).
   */
  private logBulkItemErrors(
    label: 'upsert',
    ids: string[],
    items: BulkResponseItem[],
    opKey: 'index'
  ): { loggedCount: number; retryableCount: number } {
    let loggedCount = 0;
    let retryableCount = 0;
    for (let idx = 0; idx < items.length; idx++) {
      const op = items[idx][opKey];
      // Skip items that succeeded; only failures get logged.
      if (op?.error != null) {
        const status = op.status ?? 0;
        const isRetryable = RETRYABLE_BULK_ITEM_STATUSES.has(status);
        if (isRetryable) retryableCount++;

        this.logger.warn(
          `cases-analyticsV2: activity bulk-${label} item failed [id=${
            ids[idx]
          }, status=${status}, retryable=${isRetryable}]: ${op.error.reason ?? 'unknown'}`
        );
        loggedCount++;
      }
    }
    if (loggedCount > 0) {
      this.logger.warn(
        `cases-analyticsV2: activity bulk-${label} completed with ${loggedCount}/${ids.length} item failures (${retryableCount} retryable)`
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
        `cases-analyticsV2: activity write failed after ${this.maxRetries} retries [${targetId}]: ${err.message}. Reconciliation will retry.`,
        { error: err }
      );
    });
  }
}

/**
 * Minimal shape of a single response item from `esClient.bulk`. Mirrors
 * the cases writer's shape; only the `index` op is needed because
 * cascade deletes go via `delete_by_query` rather than per-item bulk
 * deletes.
 */
interface BulkResponseItem {
  index?: { status?: number; error?: { reason?: string | null } };
}

/** No-op activity writer used when v2 is disabled. See `V2_NOOP_WRITER` in `../writer`. */
export const V2_NOOP_ACTIVITY_WRITER: CasesActivityV2WriterContract = {
  upsertAction: () => {},
  bulkUpsertActions: () => {},
  bulkDeleteActionsByCaseIds: () => {},
  bulkUpsertActionsAwait: async () => {},
};
