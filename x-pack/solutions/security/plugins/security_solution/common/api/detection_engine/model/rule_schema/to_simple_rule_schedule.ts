/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { calcDateMathDiff } from '@kbn/securitysolution-utils/date_math';
import {
  TimeDuration as TimeDurationUtil,
  getTimeDurationUnit,
} from '@kbn/securitysolution-utils/time_duration';
import type { RuleSchedule, SimpleRuleSchedule } from './rule_schedule';

/**
 * Transforms RuleSchedule to SimpleRuleSchedule by replacing `from` and `to` with `lookback`.
 *
 * The transformation is only possible when `to` equals to `now` and result `lookback` is non-negative.
 */
export function toSimpleRuleSchedule(ruleSchedule: RuleSchedule): SimpleRuleSchedule | undefined {
  if (ruleSchedule.to !== 'now') {
    return undefined;
  }

  const lookBackMs = calcDateMathDiff(ruleSchedule.from, `now-${ruleSchedule.interval}`);

  if (lookBackMs === undefined || lookBackMs < 0) {
    return undefined;
  }

  // Preserve the unit used in `from` (e.g. `now-360s`) so the look-back is
  // displayed in the exact format the user entered instead of being normalized.
  const fromUnit = getTimeDurationUnit(ruleSchedule.from);

  return {
    interval: ruleSchedule.interval,
    lookback: TimeDurationUtil.fromMilliseconds(lookBackMs, fromUnit).toString(),
  };
}
