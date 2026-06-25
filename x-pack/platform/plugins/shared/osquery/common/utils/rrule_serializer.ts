/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Frequency, Weekday, type WeekdayStr } from '@kbn/rrule';

/**
 * Subset of RFC 5545 RRULE parts that osquerybeat (`teambition/rrule-go`) understands
 * and that the osquery pack scheduler exposes via the UI.
 *
 * Supported frequencies: `MINUTELY`, `HOURLY`, `DAILY`, `WEEKLY`, `MONTHLY`,
 * `YEARLY`. `SECONDLY` is intentionally NOT supported — sub-minute scheduling
 * is out of scope for the pack scheduler.
 *
 * Notes:
 * - `freq` is required; everything else is optional.
 * - `_unknown` is a passthrough slot for parts the parser did not recognize. It
 *   preserves round-trip fidelity so schedules saved by future Kibana versions
 *   are not silently downgraded (see design D9).
 * - `dtstart`/`UNTIL` are intentionally NOT modeled here: osquerybeat consumes
 *   them via the separate `start_date`/`end_date` JSON fields.
 */
export interface RRuleFields {
  freq: Frequency;
  interval?: number;
  byweekday?: Weekday[];
  bymonthday?: number[];
  bymonth?: number[];
  /**
   * Passthrough for unrecognized `KEY=VALUE` parts encountered during parsing,
   * keyed by the (uppercased) RRULE part name. Re-emitted verbatim by the
   * serializer in insertion order, after recognized parts.
   */
  _unknown?: Record<string, string>;
}

const FREQUENCY_TO_STRING: Partial<Record<Frequency, string>> = {
  [Frequency.YEARLY]: 'YEARLY',
  [Frequency.MONTHLY]: 'MONTHLY',
  [Frequency.WEEKLY]: 'WEEKLY',
  [Frequency.DAILY]: 'DAILY',
  [Frequency.HOURLY]: 'HOURLY',
  [Frequency.MINUTELY]: 'MINUTELY',
};

const WEEKDAY_TO_STRING: Record<Weekday, WeekdayStr> = {
  [Weekday.MO]: 'MO',
  [Weekday.TU]: 'TU',
  [Weekday.WE]: 'WE',
  [Weekday.TH]: 'TH',
  [Weekday.FR]: 'FR',
  [Weekday.SA]: 'SA',
  [Weekday.SU]: 'SU',
};

const isPositiveInteger = (value: number): boolean => Number.isInteger(value) && value > 0;

/**
 * Serialize {@link RRuleFields} into an RFC 5545 RRULE string consumable by
 * osquerybeat (e.g. `"FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=2"`).
 *
 * Output ordering is stable: `FREQ`, `INTERVAL`, `BYMONTH`, `BYMONTHDAY`,
 * `BYDAY`, then any `_unknown` parts in insertion order. `INTERVAL` is omitted
 * when `1` (the RFC default) to keep output minimal.
 */
export const serializeRRule = (fields: RRuleFields): string => {
  const { freq, interval, byweekday, bymonthday, bymonth, _unknown } = fields;

  const freqLabel = FREQUENCY_TO_STRING[freq];
  if (!freqLabel) {
    throw new Error(`Invalid RRULE frequency: ${freq}`);
  }

  const parts: string[] = [`FREQ=${freqLabel}`];
  const emittedKeys = new Set<string>(['FREQ']);

  if (interval !== undefined && interval !== 1) {
    if (!isPositiveInteger(interval)) {
      throw new Error(`RRULE INTERVAL must be a positive integer, got ${interval}`);
    }

    parts.push(`INTERVAL=${interval}`);
    emittedKeys.add('INTERVAL');
  }

  if (bymonth && bymonth.length > 0) {
    parts.push(`BYMONTH=${bymonth.join(',')}`);
    emittedKeys.add('BYMONTH');
  }

  if (bymonthday && bymonthday.length > 0) {
    parts.push(`BYMONTHDAY=${bymonthday.join(',')}`);
    emittedKeys.add('BYMONTHDAY');
  }

  if (byweekday && byweekday.length > 0) {
    parts.push(`BYDAY=${byweekday.map((day) => WEEKDAY_TO_STRING[day]).join(',')}`);
    emittedKeys.add('BYDAY');
  }

  if (_unknown) {
    for (const [key, value] of Object.entries(_unknown)) {
      if (emittedKeys.has(key.toUpperCase())) {
        continue;
      }

      // Reject delimiter characters in unknown values: an unescaped `;`, `=`,
      // or newline would corrupt the next parse and could let a malicious or
      // malformed future-Kibana write smuggle synthetic parts past validation.
      if (/[;=\n\r]/.test(value)) {
        throw new Error(
          `RRULE _unknown value for "${key}" contains forbidden delimiter character (;, =, \\n, \\r)`
        );
      }

      parts.push(`${key}=${value}`);
    }
  }

  return parts.join(';');
};
