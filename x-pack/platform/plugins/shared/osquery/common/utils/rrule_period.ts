/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Frequency, type Weekday } from '@kbn/rrule';
import { parseRRule } from './rrule_parser';

const SEC = {
  MIN: 60,
  HOUR: 3600,
  DAY: 86400,
  WEEK: 604800,
  MONTH_FLOOR: 28 * 86400,
  YEAR_FLOOR: 365 * 86400,
} as const;

// Worst-case month length used for the BYMONTHDAY cyclic gap. February's 28
// days is the tightest wrap any positive BYMONTHDAY=N can produce, so anchoring
// the cycle at 28 keeps the derived period a conservative lower bound.
const MONTH_FLOOR_DAYS = 28;

/**
 * Compute the minimum cyclic gap (in days) between selected weekdays.
 *
 * Example: MO(1), WE(3), FR(5) → gaps [2,2,3] → min 2 days.
 * Example: MO(1), FR(5) → gaps [4,3] → min 3 days (FR→MO wraps: 7-4=3).
 */
const minCyclicGapDays = (weekdays: Weekday[]): number => {
  const sorted = [...weekdays].sort((a, b) => a - b);
  if (sorted.length < 2) return 7;

  let min = Infinity;
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const next = sorted[(i + 1) % sorted.length];
    const gap = next > current ? next - current : 7 - current + next;
    if (gap < min) min = gap;
  }

  return min;
};

/**
 * Compute the minimum cyclic gap (in days) between selected BYMONTHDAY values.
 * The cycle is anchored at the worst-case month length (28 days), so the
 * returned gap is a conservative lower bound across every calendar month.
 *
 * Example: BYMONTHDAY=1,15 → gaps [14, 14 (=28-15+1)] → min 14 days.
 * Example: BYMONTHDAY=1 → single day → 28 (the month floor itself).
 *
 * Negative values (Nth-from-last-day) are not handled here: across variable
 * month lengths they can collide with positive values on the same day. Callers
 * fall back to the unconditional MONTH_FLOOR when any negative is present.
 */
const minCyclicGapDaysOnMonth = (monthdays: number[]): number => {
  const sorted = [...monthdays].sort((a, b) => a - b);
  if (sorted.length < 2) return MONTH_FLOOR_DAYS;

  let min = Infinity;
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const next = sorted[(i + 1) % sorted.length];
    const gap = next > current ? next - current : MONTH_FLOOR_DAYS - current + next;
    if (gap < min) min = gap;
  }

  return min;
};

/**
 * Conservative lower bound (in seconds) of the gap between two consecutive
 * occurrences of an RRULE. "Conservative" means this value is never larger
 * than the period the agent computes — so any splay we accept, the agent will
 * also accept.
 *
 * Accepts the already-serialized RRULE string; parses it internally using
 * {@link parseRRule}. Returns `undefined` when the string is unparseable so
 * callers can skip the half-period check rather than reject on a parse error
 * (the upstream validator surfaces parse errors via its own path).
 *
 * TODO(UI): this helper lives in `common/utils/` so it can be imported by
 * both server validators and the future ScheduleSection UI component that
 * caps the splay input based on the current FREQ/INTERVAL selection.
 */
export const safeDerivePeriodSeconds = (rrule: string): number | undefined => {
  let fields;
  try {
    fields = parseRRule(rrule);
  } catch {
    return undefined;
  }

  return derivePeriodSeconds(fields);
};

/**
 * Derive the conservative period from pre-parsed {@link RRuleFields}. Exported
 * for unit testing individual frequency branches without going through the
 * string parser.
 */
export const derivePeriodSeconds = (fields: ReturnType<typeof parseRRule>): number => {
  const interval = fields.interval ?? 1;

  switch (fields.freq) {
    case Frequency.MINUTELY:
      return SEC.MIN * interval;

    case Frequency.HOURLY:
      return SEC.HOUR * interval;

    case Frequency.DAILY:
      return SEC.DAY * interval;

    case Frequency.WEEKLY:
      if (fields.byweekday && fields.byweekday.length > 1) {
        return minCyclicGapDays(fields.byweekday) * SEC.DAY;
      }

      return SEC.WEEK * interval;

    case Frequency.MONTHLY:
      if (
        fields.bymonthday &&
        fields.bymonthday.length > 1 &&
        fields.bymonthday.every((d) => d > 0)
      ) {
        return minCyclicGapDaysOnMonth(fields.bymonthday) * SEC.DAY;
      }

      return SEC.MONTH_FLOOR * interval;

    case Frequency.YEARLY:
      return SEC.YEAR_FLOOR * interval;

    default:
      return SEC.MIN;
  }
};
