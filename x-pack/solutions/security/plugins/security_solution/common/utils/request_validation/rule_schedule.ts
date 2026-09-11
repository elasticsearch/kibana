/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { calcDateMathDiff } from '@kbn/securitysolution-utils/date_math';
import { TimeDuration } from '@kbn/securitysolution-utils/time_duration';
import { DEFAULT_RULE_SCHEDULE } from '../../api/detection_engine/model/rule_schema/rule_schedule';

interface RuleScheduleValidationPayload {
  interval?: string;
  from?: string;
  to?: string;
}

export const validateRuleSchedule = (
  { interval, from, to }: RuleScheduleValidationPayload,
  defaults?: RuleScheduleValidationPayload
): string[] => {
  const effectiveInterval = interval ?? defaults?.interval;
  const effectiveFrom = from ?? defaults?.from;
  const effectiveTo = to ?? defaults?.to;

  if (effectiveInterval == null || effectiveFrom == null || effectiveTo == null) {
    return [];
  }

  const intervalDuration = TimeDuration.parse(effectiveInterval);
  const timeRangeDuration = calcDateMathDiff(effectiveFrom, effectiveTo);

  if (intervalDuration == null || timeRangeDuration == null) {
    return [];
  }

  if (timeRangeDuration < intervalDuration.toMilliseconds()) {
    return [
      'the time range defined by "from" and "to" must be greater than or equal to "interval"',
    ];
  }

  return [];
};

export const validateRuleScheduleWithDefaults = (
  schedule: RuleScheduleValidationPayload
): string[] => validateRuleSchedule(schedule, DEFAULT_RULE_SCHEDULE);
