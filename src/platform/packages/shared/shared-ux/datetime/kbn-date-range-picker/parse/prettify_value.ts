/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import moment from 'moment';

import { DATE_RANGE_INPUT_DELIMITER, DEFAULT_DATE_FORMAT } from '../constants';
import type { TimePrecision, TimeRangeBoundsOption } from '../types';
import { applyTimePrecision } from '../format';
import { PARSER_DELIMITERS, buildDelimiterPattern, textToTimeRange } from './parse_text';

/**
 * Simplifies a dateMath value string into a compact shorthand suitable for
 * display in the input field.
 *
 * - `now-7d/d to now`          → `-7d`
 * - `now to now+1d`            → `+1d`
 * - `now-30d/d to now-7d/d`    → `-30d to -7d/d`
 * - `now/w to now`             → `now/w to now` (now + rounding only → unchanged)
 * - Natural language ("last 3 weeks") and absolute dates pass through unchanged.
 *
 * Rounding is only stripped from the **start** bound (the end bound keeps its
 * rounding intact) because start-bound rounding is controlled by the
 * `roundRelativeTime` setting.
 */

// Matches a dateMath relative expression with an offset: optional "now", sign, digits, unit, optional rounding.
// Does NOT match bare "now" or "now/unit" (those have no offset).
const DATEMATH_OFFSET_RE = /^(now)?([+-])(\d+)([a-zA-Z]+)(\/[smhdwMy])?$/;

/**
 * Builds the full set of delimiter patterns by combining the parser's
 * configured delimiters, the universal dash, and an optional consumer delimiter.
 *
 * TODO use constant for dash delimiter (need to solve taking the parser into account)
 */
const getDelimiterPatterns = (extraDelimiter?: string): RegExp[] => {
  const delimiters = [...PARSER_DELIMITERS, DATE_RANGE_INPUT_DELIMITER, '-'];
  if (extraDelimiter) delimiters.push(extraDelimiter);

  return delimiters.map(buildDelimiterPattern).filter((p): p is RegExp => p !== null);
};

/**
 * Formats an ISO 8601 date string into a human-readable display format at the
 * requested sub-minute precision. Returns `null` if the string is not a valid
 * ISO date.
 */
const prettifyAbsoluteDate = (bound: string, precision: TimePrecision = 'ms'): string | null => {
  const parsed = moment(bound, moment.ISO_8601, true);
  return parsed.isValid()
    ? parsed.format(applyTimePrecision(DEFAULT_DATE_FORMAT, precision))
    : null;
};

/**
 * Strips the `now` prefix and rounding suffix from a dateMath offset bound.
 * Returns `null` if the bound is not a relative offset expression
 * (bare `now`, `now/w`, absolute dates, natural language all return null).
 */
const prettifyStartBound = (bound: string): string | null => {
  const match = bound.match(DATEMATH_OFFSET_RE);
  if (!match) return null;

  // first two values omitted on purpose
  const [, , sign, count, unit] = match;
  return `${sign}${count}${unit}`;
};

/**
 * Strips only the `now` prefix from a dateMath offset bound, keeping rounding.
 * Returns `null` if the bound is not a relative offset expression.
 */
const prettifyEndBound = (bound: string): string | null => {
  const match = bound.match(DATEMATH_OFFSET_RE);
  if (!match) return null;

  // first two values omitted on purpose
  const [, , sign, count, unit, rounding] = match;
  return `${sign}${count}${unit}${rounding ?? ''}`;
};

export interface PrettifyValueOptions {
  /** Optional consumer-provided delimiter (from `TimeRangeTransformOptions`). */
  extraDelimiter?: string;
  /** Presets to match against — if the value's bounds match a preset, its label is used. */
  presets?: TimeRangeBoundsOption[];
}

/**
 * Tries to match a split `{start, end}` pair against a preset.
 * Returns the preset label only when it is natural language (e.g. "Last 7 days",
 * "Today") and therefore safe to show in the editable input. Display-form labels
 * (e.g. `"Feb 3 → Feb 10"`) must not leak into the input; we gate on
 * `isNaturalLanguage` rather than `!isInvalid` because moment's forgiving parser
 * "validates" display labels by matching a fragment, so they are prettified from
 * their bounds instead.
 */
const matchPresetBounds = (
  start: string,
  end: string,
  presets: TimeRangeBoundsOption[]
): string | null => {
  const match = presets.find((p) => p.start === start && p.end === end);
  if (!match?.label) return null;

  return textToTimeRange(match.label).isNaturalLanguage ? match.label : null;
};

/**
 * Prettifies a controlled `value` string for display in the edit input.
 *
 * @param value The raw value string, typically `"{start} to {end}"`.
 * @param options Optional config: extra delimiter and presets.
 * @returns A simplified string, or the original value if no simplification applies.
 */
export const prettifyValue = (value: string, options?: PrettifyValueOptions): string => {
  const trimmed = value.trim();
  if (!trimmed) return value;

  const { extraDelimiter, presets = [] } = options ?? {};
  const patterns = getDelimiterPatterns(extraDelimiter);

  // Try splitting on delimiters
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const [, rawStart, rawEnd] = match;
      const start = rawStart.trim();
      const end = rawEnd.trim();

      // Check if bounds match a preset label
      if (presets.length > 0) {
        const presetLabel = matchPresetBounds(start, end, presets);
        if (presetLabel) return presetLabel;
      }

      const prettyStart = prettifyStartBound(start);
      const prettyEnd = prettifyEndBound(end);

      // Both bounds are "now" (with or without rounding) — format any absolute dates
      if (!prettyStart && !prettyEnd) {
        const absStart = prettifyAbsoluteDate(start);
        const absEnd = prettifyAbsoluteDate(end);
        if (!absStart && !absEnd) return trimmed;
        const delim = DATE_RANGE_INPUT_DELIMITER;
        return `${absStart ?? start} ${delim} ${absEnd ?? end}`;
      }

      // One bound is "now" and the other is a relative offset → collapse
      if (end === 'now' && prettyStart) return prettyStart;
      if (start === 'now' && prettyEnd) return prettyEnd;

      const delim = DATE_RANGE_INPUT_DELIMITER;

      // Both are relative offsets → show "start {delim} end" with prettified bounds
      if (prettyStart && prettyEnd) return `${prettyStart} ${delim} ${prettyEnd}`;

      // One side is a relative offset, other is absolute/now-rounding → prettify what we can
      return `${prettyStart ?? prettifyAbsoluteDate(start) ?? start} ${delim} ${
        prettyEnd ?? prettifyAbsoluteDate(end) ?? end
      }`;
    }
  }

  // No delimiter found — try prettifying as a single dateMath expression (start-bound rules)
  if (trimmed === 'now') return trimmed;
  const prettySingle = prettifyStartBound(trimmed);
  if (prettySingle) return prettySingle;

  // Try formatting as an absolute ISO date
  const prettyAbsolute = prettifyAbsoluteDate(trimmed);
  if (prettyAbsolute) return prettyAbsolute;

  // Natural language or anything else — pass through unchanged
  return trimmed;
};
