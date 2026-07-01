/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RefObject } from 'react';

import moment from 'moment';

import type {
  TimePrecision,
  TimeRange,
  TimeRangeBoundsOption,
  TimeRangeTransformOptions,
  InitialFocus,
  AutoRefreshIntervalUnit,
} from './types';
import { DATE_RANGE_INPUT_DELIMITER, DEFAULT_DATE_FORMAT, UNIT_DISPLAY_ABBREV } from './constants';
import { textToTimeRange, getNamedRangeAlias } from './parse';
import type { RangePart } from './parse/parse_range_parts';
import { dateMathToRelativeParts, timeRangeToDisplayText, applyTimePrecision } from './format';
import { MS_PER } from './format/format_duration';

/**
 * Pads a non-negative integer component with leading zeros to `width` digits.
 *
 * @param n - The number to pad.
 * @param width - The width to pad to.
 *
 * @returns The padded number as a string.
 */
const pad = (n: number, width: number): string =>
  String(Math.max(0, Math.floor(n))).padStart(width, '0');

/**
 * Converts an interval in milliseconds to a count and unit for display.
 *
 * @param intervalMs - The interval in milliseconds.
 * @param unit - The unit to use for the display.
 * If `unit` is provided, that unit is used (count is rounded to the nearest whole step).
 * If omitted, picks the largest unit (hours, then minutes, then seconds) that divides
 * `intervalMs` evenly so common values round-trip without drifting (e.g. 90s stays 90s, not 2m).
 *
 * @returns The count and unit for the display.
 */
export function msToAutoRefreshInterval(
  intervalMs: number,
  unit?: AutoRefreshIntervalUnit
): { count: number; unit: AutoRefreshIntervalUnit } {
  if (intervalMs <= 0) {
    return { count: 0, unit: 's' };
  }

  if (unit === 'h') {
    return { count: Math.round(intervalMs / MS_PER.hour), unit: 'h' };
  }
  if (unit === 'm') {
    return { count: Math.round(intervalMs / MS_PER.minute), unit: 'm' };
  }
  if (unit === 's') {
    return { count: Math.round(intervalMs / MS_PER.second), unit: 's' };
  }

  if (intervalMs % MS_PER.hour === 0) {
    return { count: intervalMs / MS_PER.hour, unit: 'h' };
  }
  if (intervalMs % MS_PER.minute === 0) {
    return { count: intervalMs / MS_PER.minute, unit: 'm' };
  }
  if (intervalMs % MS_PER.second === 0) {
    return { count: intervalMs / MS_PER.second, unit: 's' };
  }

  return { count: Math.ceil(intervalMs / MS_PER.second), unit: 's' };
}

/**
 * Converts a count and unit to milliseconds.
 *
 * @param count - The count to convert to milliseconds.
 * @param unit - The unit to convert to milliseconds.
 *
 * @returns The milliseconds.
 */
export function autoRefreshIntervalToMs(count: number, unit: AutoRefreshIntervalUnit): number {
  switch (unit) {
    case 'h':
      return count * MS_PER.hour;
    case 'm':
      return count * MS_PER.minute;
    case 's':
    default:
      return count * MS_PER.second;
  }
}

/**
 * Formats total seconds as a realtime countdown for the toolbar (mm:ss, or hh:mm:ss when hours remain).
 *
 * @param totalSeconds - The total seconds to format.
 *
 * @returns The formatted countdown string.
 */
export function formatAutoRefreshCountdown(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '00:00';
  }

  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (h > 0) {
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(sec, 2)}`;
  }

  return `${pad(m, 2)}:${pad(sec, 2)}`;
}

/**
 * Ceil(ms → seconds) for auto-refresh timer and toolbar; non-negative and safe for invalid ms.
 * Matches `useAutoRefresh` tick length.
 *
 * @param intervalMs - The interval in milliseconds.
 *
 * @returns The total seconds.
 */
export function msToSeconds(intervalMs: number): number {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return 0;
  }

  return Math.ceil(intervalMs / MS_PER.second);
}

/**
 * Formats a Date using the default DateRangePicker format, adjusted for the
 * requested sub-minute precision. Uses moment so the result respects whatever
 * global timezone Kibana has configured via `moment.tz.setDefault(...)`.
 */
export function formatAbsoluteDate(d: Date, precision: TimePrecision = 's'): string {
  return moment(d).format(applyTimePrecision(DEFAULT_DATE_FORMAT, precision));
}

/**
 * Formats a Date as a local ISO-8601 string with full precision but no UTC offset ("Z").
 * e.g. a local 14:12:59.531 → "2026-03-04T14:12:59.531"
 *
 * @deprecated Use `formatAbsoluteDate` instead, which respects moment's configured timezone.
 */
export function toLocalPreciseString(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}` +
    `T${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}.${pad(
      d.getMilliseconds(),
      3
    )}`
  );
}

/**
 * Check a time range is valid
 */
export function isValidTimeRange(range: TimeRange): boolean {
  const { startDate, endDate } = range;
  // both dates are valid
  if (startDate === null || endDate === null) {
    return false;
  }
  // start must be before or equal to end
  return startDate.getTime() <= endDate.getTime();
}

/**
 * Returns `true` when the range label already conveys its duration, making
 * the badge redundant. This includes relative-to-now ranges (e.g. "Last 15
 * minutes") and named ranges (e.g. "today", "yesterday", "this week").
 */
export function isRelativeToNow(range: TimeRange): boolean {
  if (range.isNaturalLanguage) return true;
  const [startType, endType] = range.type;
  return (
    (startType === 'RELATIVE' && endType === 'NOW') ||
    (startType === 'NOW' && endType === 'RELATIVE')
  );
}

/**
 * Resolve the `initialFocus` target within the panel.
 * A string is treated as a CSS selector; a ref as a direct element handle.
 * Falls back to the panel div itself when unset.
 */
export function resolveInitialFocus(
  panelRef: RefObject<HTMLElement>,
  initialFocus?: InitialFocus
): HTMLElement | null {
  if (typeof initialFocus === 'string') {
    return panelRef.current?.querySelector<HTMLElement>(initialFocus) ?? null;
  }
  if (initialFocus && 'current' in initialFocus) {
    return initialFocus.current;
  }
  return panelRef.current;
}

/**
 * Returns a human-readable display label for a time range option.
 *
 * Natural-language labels (e.g. "Last 15 minutes", "Today") are kept verbatim —
 * they carry semantics the bounds alone can't reconstruct (e.g. "now/d to now/d"
 * is "Today"). Every other label is regenerated from the bounds using the same
 * pipeline as the control button (build text → parse → format), so the list always
 * uses the `→` delimiter and honours the current `timePrecision`, rather than
 * echoing a frozen display string or a raw input-form label saved earlier.
 */
export function getOptionDisplayLabel(
  option: TimeRangeBoundsOption,
  options?: Pick<TimeRangeTransformOptions, 'timePrecision'>
): string {
  if (option.label && textToTimeRange(option.label).isNaturalLanguage) {
    return option.label;
  }

  const text = `${option.start} ${DATE_RANGE_INPUT_DELIMITER} ${option.end}`;
  const timeRange = textToTimeRange(text);
  return timeRangeToDisplayText(timeRange, options);
}

/**
 * Generates a compact offset shorthand from a time range option's bounds,
 * without resolving to absolute dates. Returns `null` when any bound is
 * absolute (no stable offset) or when both bounds are `now`.
 *
 * @example
 * getOptionShorthand({ start: 'now-15m', end: 'now' }) // "-15m"
 * getOptionShorthand({ start: 'now', end: 'now+3d' })  // "+3d"
 * getOptionShorthand({ start: 'now-7d', end: 'now-1d' }) // "-7d - -1d"
 * getOptionShorthand({ start: '2025-01-01', end: 'now' }) // null
 */
export function getOptionShorthand(option: TimeRangeBoundsOption): string | null {
  // Named range alias (e.g. "today" → "td", "yesterday" → "yd")
  const alias = getNamedRangeAlias(option.start, option.end);
  if (alias) return alias;

  let startOffset = boundToRelativeShorthand(option.start);
  const endOffset = boundToRelativeShorthand(option.end);

  if (startOffset === null || endOffset === null) return null;
  if (startOffset === 'now' && endOffset === 'now') return null;
  if (startOffset !== 'now' && startOffset.includes('/')) {
    if (endOffset !== 'now') return null;
    startOffset = startOffset.replace(/\/[smhdwMy]$/, '');
  }
  if (endOffset !== 'now' && endOffset.includes('/')) return null;
  if (startOffset === 'now') return endOffset;
  if (endOffset === 'now') return startOffset;

  return `${startOffset} ${DATE_RANGE_INPUT_DELIMITER} ${endOffset}`;
}

/**
 * Determines the text to populate the input with when an option is selected.
 *
 * 1. If the option has a natural-language label (e.g. "Last 15 minutes", "Today"),
 *    returns it so that input round-trips. Only natural-language labels qualify:
 *    display-form labels (e.g. "Feb 3 → Feb 10") must not leak into the input, and
 *    we cannot rely on `!isInvalid` because moment's forgiving parser "validates"
 *    them by matching a fragment and discarding the rest (producing garbage bounds).
 * 2. Otherwise derives re-parseable input text from the bounds: relative offsets
 *    are stripped of the `now` prefix (e.g. "-15m"), absolute bounds are formatted
 *    as readable dates rather than raw ISO, and `timePrecision` is honoured. The
 *    bounds are reproduced verbatim (rounding included) so that re-applying the
 *    text yields exactly the stored range — no unintended rounding change.
 */
export function getOptionInputText(option: TimeRangeBoundsOption): string {
  if (option.label && textToTimeRange(option.label).isNaturalLanguage) {
    return option.label;
  }

  const startFragment = boundToInputFragment(option.start);
  const endFragment = boundToInputFragment(option.end);

  if (startFragment.isNow && endFragment.isNow) return 'now';
  if (startFragment.isNow) return endFragment.text;
  if (endFragment.isNow) return startFragment.text;

  return `${startFragment.text} ${DATE_RANGE_INPUT_DELIMITER} ${endFragment.text}`;
}

/** Returns a new Date set to the start of the given day (00:00:00.000). */
export function getStartDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/** Returns a new Date set to the end of the given day (23:59:59.999). */
export function getEndDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/**
 * Formats a date range using the default DateRangePicker format with the standard delimiter.
 * e.g. "Mar 4, 2026, 10:00:00 - Mar 5, 2026, 23:30:00"
 *
 * Uses moment so the result respects Kibana's configured timezone.
 */
export function formatDateRange(start: Date, end: Date, precision: TimePrecision = 's'): string {
  return `${formatAbsoluteDate(
    start,
    precision
  )} ${DATE_RANGE_INPUT_DELIMITER} ${formatAbsoluteDate(end, precision)}`;
}

/**
 * Extracts the offset portion from a date math bound string, or
 * returns `null` for absolute dates and rounding-only expressions
 * that have no stable offset representation.
 *
 * - `"now"` → `"now"` (sentinel, not an offset)
 * - `"now-15m"` → `"-15m"`
 * - `"now+3d/d"` → `"+3d/d"`
 * - `"now/d"` → `null` (rounding only, no numeric offset)
 * - `"2025-01-01"` → `null`
 */
function boundToRelativeShorthand(bound: string): string | 'now' | null {
  if (bound === 'now') return 'now';

  const parts = dateMathToRelativeParts(bound);
  if (!parts) return null;

  const sign = parts.isFuture ? '+' : '-';
  const displayUnit = UNIT_DISPLAY_ABBREV[parts.unit] ?? parts.unit;
  const round = parts.round ? `/${parts.round}` : '';
  return `${sign}${parts.count}${displayUnit}${round}`;
}

/**
 * Converts a date math bound into a user-friendly input fragment.
 * - Relative offsets are stripped of the `now` prefix via `boundToRelativeShorthand`,
 *   keeping any rounding suffix so the range round-trips unchanged.
 * - Absolute ISO bounds are formatted as readable dates (honouring `timePrecision`)
 *   instead of leaking the raw ISO string into the input.
 * - Rounding-only datemath (e.g. `now/d`) and anything unrecognised pass through as-is.
 */
function boundToInputFragment(bound: string): { text: string; isNow: boolean } {
  const shorthand = boundToRelativeShorthand(bound);
  if (shorthand === 'now') return { text: '', isNow: true };
  if (shorthand !== null) return { text: shorthand, isNow: false };

  const parsed = moment(bound, moment.ISO_8601, true);
  if (parsed.isValid()) {
    return { text: formatAbsoluteDate(parsed.toDate(), 'ms'), isNow: false };
  }

  return { text: bound, isNow: false };
}

const getRangePartMatchIndex = (part: RangePart): 0 | 1 => part.rangeIndex ?? 0;

/**
 * Finds the edit-input part that corresponds to a clicked idle-display part by
 * matching on `kind` and `rangeIndex` and preserving the part's ordinal position
 * within its peers.
 */
export function findCorrespondingInputPart(
  inputParts: RangePart[],
  displayPart: RangePart,
  displayParts: RangePart[]
): RangePart | undefined {
  const displayRangeIndex = getRangePartMatchIndex(displayPart);
  const displayOrdinal = displayParts.filter(
    (part) =>
      part.navigable &&
      part.kind === displayPart.kind &&
      getRangePartMatchIndex(part) === displayRangeIndex &&
      part.start < displayPart.start
  ).length;

  const candidates = inputParts.filter(
    (part) => part.kind === displayPart.kind && getRangePartMatchIndex(part) === displayRangeIndex
  );

  return candidates[displayOrdinal];
}

/**
 * Computes the `scrollLeft` value that centers a character range within a single-line input.
 * Pass one offset to center on a caret position, or both to center on the midpoint of a range.
 * Uses canvas text measurement; falls back to a proportional estimate when 2d context is unavailable.
 */
export function getInputScrollLeftToCenter(
  input: HTMLInputElement,
  startOffset: number,
  endOffset: number = startOffset
): number {
  if (input.scrollWidth <= input.clientWidth) return 0;

  const maxScrollLeft = input.scrollWidth - input.clientWidth;
  const clamp = (value: number) => Math.max(0, Math.min(value, maxScrollLeft));
  const style = window.getComputedStyle(input);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    const ratio = startOffset / Math.max(input.value.length, 1);
    return clamp(input.scrollWidth * ratio - input.clientWidth / 2);
  }

  ctx.font = style.font;
  const leftInset = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.borderLeftWidth) || 0);
  const startX = leftInset + ctx.measureText(input.value.substring(0, startOffset)).width;
  const rangeWidth = ctx.measureText(input.value.substring(startOffset, endOffset)).width;
  const midX = startX + rangeWidth / 2;

  return clamp(midX - input.clientWidth / 2);
}
