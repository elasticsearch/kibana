/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WeekdayStr } from '@kbn/rrule';
import type { ScheduleType } from '../../../common/schedule';
import type { SplayFormState } from '../../../common/utils/splay_utils';
import { roundUpTo30Min } from './slot_utils';

/**
 * UI-level frequency token. Mirrors the {@link Frequency} subset supported by
 * osquerybeat (`MINUTELY`, `HOURLY`, `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`) but
 * adds the `'custom'` pseudo-mode the form uses for WEEKLY-with-BYDAY selection
 * — and emits as lowercase strings so radio IDs and i18n keys stay readable.
 * The conversion to `Frequency` happens at the form serializer.
 */
export type FrequencyMode =
  // 'minutely' | 'hourly' |
  'daily' | 'custom';
// | 'monthly' | 'yearly';

/**
 * Weekday tokens supported by the custom (WEEKLY) frequency. Reuses
 * {@link WeekdayStr} from `@kbn/rrule` — the same string keys the parser /
 * serializer round-trip through `BYDAY=`.
 */
export const WEEKDAY_TOKENS: readonly WeekdayStr[] = [
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
  'SU',
] as const;

/**
 * Recurrence form state. Field names match {@link RRuleFields} from
 * `common/utils/rrule_serializer.ts` so the form ↔ wire conversion is
 * one-to-one — the only UI-only addition is the discriminator `frequency`,
 * which carries the `'custom'` pseudo-mode that maps to `Frequency.WEEKLY +
 * BYDAY`.
 *
 * The `_unknown` slot preserves forward-compatibility: advanced parts the
 * form cannot render survive a no-op round-trip but are cleared on frequency
 * change.
 */
export interface RecurrenceFormState {
  /** UI-level frequency token. Drives which sub-fields are shown. */
  frequency: FrequencyMode;
  /** RRULE INTERVAL (positive integer). Applies to minutely / hourly / custom. */
  interval: number;
  /** Days of week selected when {@link frequency} is `'custom'`. */
  byweekday: WeekdayStr[];
  // /** Day of month (1–31). Applies to monthly / yearly. */
  // bymonthday: number;
  // /** Month of year (1–12). Applies to yearly. */
  // bymonth: number;
  /**
   * Passthrough for unrecognized RRULE parts encountered on load. Preserved
   * verbatim through save unless the user changes {@link frequency}.
   * Same shape as `RRuleFields['_unknown']`.
   */
  _unknown?: Record<string, string>;
}

/**
 * Splay-time form state. Extends {@link SplayFormState} (value + unit, defined
 * in `common/utils/splay_utils.ts`) with two UI-only fields:
 *
 * - `enabled` — toggle controlling whether the splay sub-fields render.
 * - `rawCompound` — when the loaded splay was a compound Go duration the
 *   single-unit input cannot represent, the form SHALL re-emit this string
 *   unchanged unless the user touches the splay field.
 */
export interface SplayFormStateUI extends SplayFormState {
  enabled: boolean;
  rawCompound?: string;
}

/**
 * Top-level form state for the schedule section. Combines the type-discriminant
 * with the per-mode sub-state. Callers (pack form, query flyout) initialize via
 * {@link createDefaultScheduleFormData} and persist the whole object on save.
 *
 * Per the same-mode constraint, when this state is mounted inside the
 * QueryFlyout the parent SHALL pass `lockedScheduleType={pack.schedule_type}`
 * to `<ScheduleSection>` and the type selector SHALL be locked.
 */
export interface ScheduleFormData {
  scheduleType: ScheduleType;
  /** Pack-level interval (seconds). Used when `scheduleType === 'interval'`. */
  interval: number;
  /** Start date/time as a JS `Date`. The serializer formats RFC 3339 on save. */
  startDate: Date;
  /** Toggle + value for an optional UNTIL bound. */
  stopAfter: {
    enabled: boolean;
    date: Date;
  };
  recurrence: RecurrenceFormState;
  splay: SplayFormStateUI;
}

/**
 * Default form state — Interval mode by default to preserve the legacy shape
 * when the feature flag is on but the user has not picked recurrence yet.
 * The `interval` default matches the existing per-query default elsewhere in
 * the plugin.
 */
export const DEFAULT_INTERVAL_SECONDS = 3600;
export const DEFAULT_RECURRENCE_INTERVAL = 1;
export const DEFAULT_SPLAY_VALUE = 30;

export const createDefaultRecurrence = (): RecurrenceFormState => ({
  frequency: 'daily',
  interval: DEFAULT_RECURRENCE_INTERVAL,
  byweekday: ['MO', 'TU', 'WE', 'TH', 'FR'],
  // bymonthday: DEFAULT_MONTH_DAY,
  // bymonth: DEFAULT_MONTH,
});

export const createDefaultSplay = (): SplayFormStateUI => ({
  enabled: false,
  value: DEFAULT_SPLAY_VALUE,
  unit: 'seconds',
});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const createDefaultScheduleFormData = (
  scheduleType: ScheduleType = 'interval'
): ScheduleFormData => {
  const startDate = roundUpTo30Min(new Date());

  return {
    scheduleType,
    interval: DEFAULT_INTERVAL_SECONDS,
    startDate,
    stopAfter: {
      enabled: false,
      date: new Date(startDate.getTime() + ONE_DAY_MS),
    },
    recurrence: createDefaultRecurrence(),
    splay: createDefaultSplay(),
  };
};

/**
 * Frequencies whose recurrence anchors to a calendar instant rather than to the
 * agent's enrollment moment. These benefit from splay on large fleets.
 */
export const CALENDAR_ANCHORED_FREQUENCIES: ReadonlySet<FrequencyMode> = new Set([
  'daily',
  'custom',
]);

/**
 * Clamp a numeric field value into `[min, max]`. Shared by the interval and
 * frequency-interval inputs so both numeric fields agree on the bound math.
 *
 * - `truncate: true` floors fractional input toward zero (the interval seconds
 *   field accepts a typed `120.7` and keeps `120`).
 * - `truncate: false` (default) rejects non-integer / non-finite input back to
 *   `fallback` (the RRULE INTERVAL field only ever holds whole repeats).
 */
export const clampInt = (
  value: number,
  min: number,
  max: number,
  fallback: number,
  { truncate = false }: { truncate?: boolean } = {}
): number => {
  if (!Number.isFinite(value)) return fallback;
  const normalized = truncate ? Math.trunc(value) : value;
  if (!Number.isInteger(normalized)) return fallback;
  if (normalized < min) return min;
  if (normalized > max) return max;

  return normalized;
};
