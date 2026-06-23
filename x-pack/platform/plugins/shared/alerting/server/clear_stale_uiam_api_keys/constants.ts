/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IntervalSchedule } from '@kbn/task-manager-plugin/server';

/**
 * Hard-coded serverless project ID this one-off cleanup is allowed to run in.
 * A subset of rules in this project carries a stale, encrypted `uiamApiKey`
 * attribute left behind by the bug fixed in PR #263887 (object-spread leak in
 * the rule update path). Every other project is unaffected and must never be
 * touched by this task: the project-ID check in `start()` is the only gate,
 * and it is intentionally a constant — not a config or feature flag — so it is
 * impossible to enable for the wrong project by misconfiguration.
 */
export const CLEAR_STALE_UIAM_API_KEYS_TARGET_PROJECT_ID = 'f44c1e15748649168249b653444830ed';

export const CLEAR_STALE_UIAM_API_KEYS_TASK_ID = 'clear_stale_uiam_api_keys';
export const CLEAR_STALE_UIAM_API_KEYS_TASK_TYPE = `alerting:${CLEAR_STALE_UIAM_API_KEYS_TASK_ID}`;

/**
 * Daily safety-net interval. Each run is a no-op once the task latches via
 * `state.cleared`, so the recurring schedule costs at most one early state
 * return per day for the lifetime of the task type registration.
 */
export const CLEAR_STALE_UIAM_API_KEYS_TASK_SCHEDULE: IntervalSchedule = { interval: '1d' };

export const CLEAR_STALE_UIAM_API_KEYS_TASK_TIMEOUT = '5m';

/** Delay before the next run when version conflicts left work behind (10 minutes). */
export const CLEAR_STALE_UIAM_API_KEYS_RESCHEDULE_DELAY_MS = 600000;

export const CLEAR_STALE_UIAM_API_KEYS_TAGS = [
  'serverless',
  'alerting',
  'uiam-api-key-cleanup',
  'background-task',
];
