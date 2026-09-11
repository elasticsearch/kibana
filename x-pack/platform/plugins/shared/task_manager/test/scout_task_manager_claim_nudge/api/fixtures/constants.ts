/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const COMMON_HEADERS = {
  'kbn-xsrf': 'some-xsrf-token',
  'x-elastic-internal-origin': 'kibana',
  'Content-Type': 'application/json;charset=UTF-8',
} as const;

// An existing Task Manager task type that is a no-op when there are no API keys pending
// invalidation, so these tests can let it actually execute. It reschedules itself minutes out
// after running, which is how the tests detect that a run happened.
export const TEST_TASK_TYPE = 'task_manager:invalidate_api_keys';

// Absorbs CI jitter while staying far below the 60s `poll_interval` in the
// `task_manager_claim_nudge` Scout config, so only a nudge can meet it.
export const NUDGE_CLAIM_BUDGET_MS = 5_000;

// How long the negative control waits to show nothing claims the task on its own. Separate from the
// budget above so tuning one for CI jitter cannot silently weaken the other.
export const NO_CLAIM_OBSERVATION_MS = 5_000;

// How far past `runSoon` the task's `runAt` must move before it counts as evidence that the task
// actually ran and rescheduled itself, rather than merely having been reset to now by `runSoon`.
export const RESCHEDULE_EVIDENCE_MS = 5_000;

export const ONE_HOUR_MS = 60 * 60 * 1000;
