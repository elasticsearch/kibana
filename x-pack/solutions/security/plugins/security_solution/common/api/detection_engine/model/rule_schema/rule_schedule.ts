/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { RuleIntervalFrom, RuleIntervalTo } from './common_attributes.gen';
import { TimeDuration as TimeDurationSchema } from './time_duration';

export type RuleSchedule = z.infer<typeof RuleSchedule>;
export const RuleSchedule = z.object({
  interval: TimeDurationSchema({ allowedUnits: ['s', 'm', 'h'] }),
  from: RuleIntervalFrom,
  to: RuleIntervalTo,
});

export const DEFAULT_RULE_SCHEDULE = {
  interval: '5m',
  from: 'now-6m',
  to: 'now',
} as const satisfies RuleSchedule;

/**
 * Simpler version of RuleSchedule. It's only feasible when
 * - `to` equals `now` (current moment in time)
 * - `from` is less than `now` - `interval`
 *
 * Examples:
 *
 * - rule schedule: interval = 10m, from = now-15m, to = now
 *   simpler rule schedule: interval = 10m, lookback = 5m
 *
 * - rule schedule: interval = 1h, from = now-120m, to = now
 *   simpler rule schedule: interval = 10m, lookback = 5m
 */
export type SimpleRuleSchedule = z.infer<typeof SimpleRuleSchedule>;
export const SimpleRuleSchedule = z.object({
  /**
   * Rule running interval in time duration format, e.g. `2m`, `3h`
   */
  interval: TimeDurationSchema({ allowedUnits: ['s', 'm', 'h'] }),
  /**
   * Non-negative additional source events look-back to compensate rule execution delays
   * in time duration format, e.g. `2m`, `3h`.
   *
   * Having `interval`, `from` and `to` and can be calculated as
   *
   * lookback = now - `interval` - `from`, where `now` is the current moment in time
   *
   * In the other words rules use time range [now - interval - lookback, now]
   * to select source events for analysis.
   */
  lookback: TimeDurationSchema({ allowedUnits: ['s', 'm', 'h'] }),
});
