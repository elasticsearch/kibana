/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const gapAutoFillSchedulerLimits = {
  /**
   * Maximum number of backfills gap fill scheduler can schedule
   * default value is 1000, which is big enough for most use cases
   */
  maxBackfills: {
    min: 1,
    max: 5000,
    defaultValue: 1000,
  },
  /**
   * How many times to retry to automatically fill a gap
   * if the gap is not filled after the retries, the gap will be skipped
   * default value is 3, which is a should work if error was caused by a temporary issue
   * if the error is caused by a permanent issue, the gap will be skipped
   */
  numRetries: {
    min: 1,
    max: 10,
    defaultValue: 3,
  },
  minScheduleIntervalInMs: 60 * 1000,
  maxScopeSize: 100,
  maxRuleTypesSize: 100,
} as const;

export const GAP_AUTO_FILL_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
  SKIPPED: 'skipped',
  NO_GAPS: 'no_gaps',
} as const;

export type GapAutoFillStatus = (typeof GAP_AUTO_FILL_STATUS)[keyof typeof GAP_AUTO_FILL_STATUS];
