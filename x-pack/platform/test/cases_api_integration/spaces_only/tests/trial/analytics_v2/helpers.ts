/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type SuperTest from 'supertest';

export const CASE_INDEX = '.cases';
export const DATA_VIEW_ID_PREFIX = 'cases-analytics-managed-';

const POLL_INTERVAL_MS = 200;
const DEFAULT_TIMEOUT_MS = 15_000;
const BOOTSTRAP_TIMEOUT_MS = 30_000;

const INTERNAL_HEADERS = {
  'kbn-xsrf': 'true',
  'x-elastic-internal-origin': 'kibana',
} as const;

/**
 * Wait for the `.cases` index to exist. Called from the suite's `before`
 * hook to ride out the gap between plugin start firing and
 * `ensureCaseIndex` completing its async bootstrap.
 */
export async function waitForCaseIndexExists(
  es: Client,
  timeoutMs = BOOTSTRAP_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const exists = await es.indices.exists({ index: CASE_INDEX });
    if (exists) return;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${CASE_INDEX} to exist`);
}

/**
 * Poll `.cases` until the analytics doc for the given caseId reaches
 * the expected presence. The v2 writer is fire-and-forget on a
 * separate code path from the SO write — `?refresh=true` on the
 * cases API doesn't refresh `.cases`, so tests must poll-with-refresh.
 */
export async function waitForAnalyticsCase(
  es: Client,
  caseId: string,
  options: { expect: 'present' | 'absent'; timeoutMs?: number } = { expect: 'present' }
): Promise<void> {
  const { expect: expectState, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await es.indices.refresh({ index: CASE_INDEX });
    } catch {
      // Index may have been dropped mid-test — keep polling; the next
      // `get` will throw 404 and the catch below handles it.
    }
    try {
      await es.get({ index: CASE_INDEX, id: caseId });
      if (expectState === 'present') return;
    } catch (err) {
      const status =
        (err as { meta?: { statusCode?: number } })?.meta?.statusCode ??
        (err as { statusCode?: number })?.statusCode;
      if (status === 404 && expectState === 'absent') return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${CASE_INDEX}/${caseId} to be ${expectState}`);
}

/**
 * Poll `.cases` until the doc satisfies a predicate — useful for
 * "patched the case, wait until v2 sees the new value" without relying on a
 * fixed sleep.
 */
export async function waitForAnalyticsCaseUpdate(
  es: Client,
  caseId: string,
  predicate: (source: AnalyticsCaseSource) => boolean,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await es.indices.refresh({ index: CASE_INDEX });
    try {
      const result = await es.get<AnalyticsCaseSource>({ index: CASE_INDEX, id: caseId });
      if (result._source && predicate(result._source)) return;
    } catch {
      // Doc not yet present.
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${CASE_INDEX}/${caseId} to satisfy predicate`);
}

/** Fetch the analytics doc body for a case. Throws if missing. */
export async function getAnalyticsCase(es: Client, caseId: string): Promise<AnalyticsCaseSource> {
  await es.indices.refresh({ index: CASE_INDEX });
  const result = await es.get<AnalyticsCaseSource>({ index: CASE_INDEX, id: caseId });
  if (!result._source) {
    throw new Error(`${CASE_INDEX}/${caseId} has no _source`);
  }
  return result._source;
}

/**
 * `/reset` returns 202 — the destructive cleanup (drop + recreate
 * index, delete data views, clear cache) is synchronous, but the
 * full backfill walk runs asynchronously in a one-shot Task Manager
 * job (`cases.analyticsV2.fullReset`). This helper:
 *   1. Posts to `/reset` and asserts the 202 + `reset_task.id`
 *      envelope.
 *   2. Polls `/state.active_reset` until the task SO disappears
 *      (Task Manager auto-removes one-shot tasks on success) or
 *      transitions to `'failed'`.
 * Returns the final reset task snapshot (`null` on success).
 *
 * Tests that need to assert specific docs are present after reset
 * still call `waitForAnalyticsCase` — this helper just ensures the
 * backfill walk has completed before the test moves on.
 */
export async function resetV2(
  supertest: SuperTest.Agent,
  options: { timeoutMs?: number } = {}
): Promise<V2StateBody['active_reset']> {
  const response = await supertest
    .post('/internal/cases/_analyticsV2/reset')
    .set(INTERNAL_HEADERS)
    .expect(202);

  // Sanity-check the response envelope so a regression that returns
  // 200 (synchronous walk) or omits the task-id payload fails here
  // instead of passing silently.
  if (response.body?.reset_task?.id == null) {
    throw new Error(
      `/reset returned 202 but the body is missing reset_task.id. body=${JSON.stringify(
        response.body
      )}`
    );
  }

  return waitForResetComplete(supertest, options.timeoutMs);
}

/**
 * Polls `/state` until the in-flight reset task either disappears
 * (Task Manager auto-removes one-shot tasks on successful return)
 * or transitions to `'failed'`. Returns the final snapshot (`null`
 * on success, the failed task on failure).
 *
 * Separate from `resetV2` so tests that schedule a reset via a
 * custom handler call (e.g. asserting the 202 response shape
 * directly) can still wait for completion afterward.
 */
export async function waitForResetComplete(
  supertest: SuperTest.Agent,
  timeoutMs = BOOTSTRAP_TIMEOUT_MS
): Promise<V2StateBody['active_reset']> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await getV2State(supertest);
    if (state.active_reset == null) return null;
    if (state.active_reset.status === 'failed') return state.active_reset;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for reset task to complete (${timeoutMs}ms)`);
}

/** GET the /state route. */
export async function getV2State(supertest: SuperTest.Agent): Promise<V2StateBody> {
  const response = await supertest
    .get('/internal/cases/_analyticsV2/state')
    .set(INTERNAL_HEADERS)
    .expect(200);
  return response.body as V2StateBody;
}

/**
 * POST `/reconcile/run_soon`, then block until a reconciliation tick
 * scheduled by this call completes.
 *
 * The route is idempotent: when TM has the task `Claiming`/`Running`
 * it returns 200 with `already_running: true` (right contract for
 * operators, insufficient for tests — the in-flight tick may pre-date
 * the caller's SO mutations). Retry until TM updates `runAt = now`,
 * then wait for `cases_last_run_at` to advance, which the runner
 * writes on a successful drain.
 */
export async function runReconcileSoon(
  supertest: SuperTest.Agent,
  options: { timeoutMs?: number } = {}
): Promise<void> {
  const { timeoutMs = BOOTSTRAP_TIMEOUT_MS } = options;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out scheduling a fresh reconciliation tick (TM reported already-running for ${timeoutMs}ms)`
      );
    }
    const { body } = await supertest
      .post('/internal/cases/_analyticsV2/reconcile/run_soon')
      .set(INTERNAL_HEADERS)
      .expect(200);
    if (body?.already_running !== true) break;
    await sleep(POLL_INTERVAL_MS);
  }

  // Capture cursor after the clean schedule so a stale in-flight tick
  // that finished during the retry above can't satisfy the wait.
  const baseline = (await getV2State(supertest)).reconciliation.last_run?.cases_last_run_at ?? null;

  while (Date.now() < deadline) {
    const cursor = (await getV2State(supertest)).reconciliation.last_run?.cases_last_run_at ?? null;
    if (cursor != null && cursor !== baseline) return;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for reconciliation cursor to advance from ${baseline}`);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ----- Response shape types (subset asserted against in tests) -----

export interface AnalyticsCaseSource {
  '@timestamp': string;
  // Top-level scoping fields for implicit-privileges DLS (singular space_id —
  // cases are space-isolated). See server `mappings/case.ts`.
  space_id: string;
  owner: string;
  cases: {
    id: string;
    title: string;
    description?: string;
    // Mirror of top-level `owner` for data-view grouping.
    owner: string;
    status: string;
    severity: string;
    tags?: string[];
    updated_at?: string | null;
    created_at?: string;
    [k: string]: unknown;
  };
}

export interface V2StateBody {
  enabled: boolean;
  /** Aliases for the cases-surface fields under `surfaces.cases`. */
  index: string;
  index_exists: boolean;
  surfaces: {
    cases: { index: string; index_exists: boolean };
  };
  reconciliation: {
    task_type: string;
    last_run: {
      cases_last_run_at?: string;
      runs?: number;
      next_run_at?: string;
      status?: string;
    } | null;
  };
  /**
   * Live or most-recently-failed reset task. `null` when no reset
   * is scheduled, or when the most recent reset succeeded (Task
   * Manager auto-removes one-shot tasks on success). A non-null
   * snapshot with `status: 'failed'` is the administrator's signal
   * that the backfill walk threw.
   */
  active_reset: {
    task_id: string;
    status: string;
    scheduled_at: string;
    attempts: number;
    /**
     * Mirrors `ResetTaskState` in `reset_task.ts`. Updated live by
     * the reset task's wall-clock-throttled progress writer (every
     * ~30s during the walk): `phase`, `cases_processed`, and
     * `started_at` populate progressively. `cases_cursor`,
     * `completed_at`, and `cases_error` only land in the final
     * write at task completion.
     */
    state: ActiveResetState;
  } | null;
}

export interface ActiveResetState {
  phase?: 'cases' | 'completed' | null;
  cases_processed?: number | null;
  cases_cursor?: string | null;
  started_at?: string;
  completed_at?: string | null;
  cases_error?: string | null;
}
