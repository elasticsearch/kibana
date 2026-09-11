/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
export const TASK_MANAGER_INDEX = '.kibana_task_manager';
// Not a saved object index: Task Manager creates and writes this one directly. It keeps the
// `.kibana_task_manager` prefix so it stays covered by the existing system index privileges.
export const TASK_MANAGER_CLAIM_NUDGE_INDEX = '.kibana_task_manager_claim_nudge';

// Well-known id of the single saved object that stores the runtime task
// execution control (pause/resume) state. Fetched by id only, never searched.
export const TASK_EXECUTION_CONTROL_SO_ID = 'task-execution-control';
export const CONCURRENCY_ALLOW_LIST_BY_TASK_TYPE: string[] = [
  // for testing
  'sampleTaskWithSingleConcurrency',
  'sampleTaskWithLimitedConcurrency',
  'timedTaskWithSingleConcurrency',
  'timedTaskWithLimitedConcurrency',
  'sampleTaskSharedConcurrencyType1',
  'sampleTaskSharedConcurrencyType2',

  // task types requiring a concurrency
  'report:execute',
  'report:execute-scheduled',
  'ad_hoc_run-backfill',
];

export const EVENT_LOG_PROVIDER = 'taskManager';
export const EVENT_LOG_ACTIONS = {
  taskRunStart: 'task-run-start',
  taskRun: 'task-run',
  taskCancel: 'task-cancel',
};

export enum EventLogOutcomes {
  success = 'success',
  failure = 'failure',
}

const UIAM_LOGS_COMMON_TAGS = ['serverless', 'task-manager', 'uiam'];

export const UIAM_LOGS_GRANT_TAGS = [...UIAM_LOGS_COMMON_TAGS, 'uiam-api-key-grant'];
export const UIAM_LOGS_INVALIDATE_TAGS = [...UIAM_LOGS_COMMON_TAGS, 'uiam-api-key-invalidate'];
export const UIAM_LOGS_CREDENTIALS_TAGS = [
  ...UIAM_LOGS_COMMON_TAGS,
  'uiam-api-key-invalid-credentials',
];
export const UIAM_LOGS_USAGE_TAGS = [...UIAM_LOGS_COMMON_TAGS, 'uiam-api-key-missing'];
