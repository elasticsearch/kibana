/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import {
  MAX_AI_INDEX_QUERY_LENGTH,
  MAX_AI_INDEX_QUERY_LIMIT,
  MAX_AI_INDEX_QUERY_PARAM_KEY_LENGTH,
  MAX_AI_INDEX_QUERY_PARAM_VALUE_LENGTH,
  MAX_AI_INDEX_QUERY_PARAMS,
  MIN_FEEDBACK_ANALYSIS_INTERVAL_MINUTES,
} from './constants';
import type { QueryAiIndicesRequest } from './http_api/ai_indices';

// Starts with a lowercase letter or number, then lowercase letters, numbers, hyphens, or underscores.
export const AI_INDEX_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** Returns a translated error message for an invalid AI index id, or `undefined` when valid. */
export const validateAiIndexId = (value: string): string | undefined =>
  AI_INDEX_ID_PATTERN.test(value)
    ? undefined
    : i18n.translate('xpack.contextEngine.aiIndexId.error.invalidFormat', {
        defaultMessage:
          'Must start with a lowercase letter or number, then use lowercase letters, numbers, hyphens, and underscores.',
      });

const INTERVAL_PATTERN = /^([1-9][0-9]*)(m|h|d)$/;

// Months and years are approximated. These durations are only compared against
// each other to catch a signal window shorter than the schedule interval, so
// calendar-accurate arithmetic would not change any outcome.
const UNIT_MINUTES: Record<string, number> = {
  m: 1,
  h: 60,
  d: 1440,
  w: 10080,
  M: 43200,
  y: 525600,
};

/** Minutes in a schedule interval such as `30m`, `1h` or `7d`; `undefined` when malformed. */
export const parseIntervalMinutes = (value: string): number | undefined => {
  const match = INTERVAL_PATTERN.exec(value);
  return match ? Number(match[1]) * UNIT_MINUTES[match[2]] : undefined;
};

/** Returns a translated error message for an invalid schedule interval, or `undefined` when valid. */
export const validateFeedbackAnalysisInterval = (value: string): string | undefined => {
  const minutes = parseIntervalMinutes(value);
  if (minutes === undefined) {
    return i18n.translate('xpack.contextEngine.feedbackAnalysis.error.invalidInterval', {
      defaultMessage:
        'Must be a positive number followed by m (minutes), h (hours), or d (days), for example 30m, 1h, or 7d.',
    });
  }
  if (minutes < MIN_FEEDBACK_ANALYSIS_INTERVAL_MINUTES) {
    return i18n.translate('xpack.contextEngine.feedbackAnalysis.error.intervalBelowFloor', {
      defaultMessage: 'Must be at least {minMinutes} minutes.',
      values: { minMinutes: MIN_FEEDBACK_ANALYSIS_INTERVAL_MINUTES },
    });
  }
  return undefined;
};

const RELATIVE_FROM_PATTERN = /^now-([1-9][0-9]*)(m|h|d|w|M|y)$/;

/** Minutes covered by a relative signal window such as `now-30d`; `undefined` when malformed. */
export const parseRelativeFromMinutes = (value: string): number | undefined => {
  const match = RELATIVE_FROM_PATTERN.exec(value);
  return match ? Number(match[1]) * UNIT_MINUTES[match[2]] : undefined;
};

/** Returns a translated error message for an invalid relative signal window, or `undefined` when valid. */
export const validateRelativeSignalWindow = (value: string): string | undefined =>
  parseRelativeFromMinutes(value) === undefined
    ? i18n.translate('xpack.contextEngine.feedbackAnalysis.error.invalidRelativeFrom', {
        defaultMessage:
          'Must be date math relative to now, for example now-7d, now-12h, or now-1M.',
      })
    : undefined;

/** Returns a translated error message for an invalid absolute signal window, or `undefined` when valid. */
export const validateAbsoluteSignalWindow = (value: string): string | undefined =>
  Number.isNaN(Date.parse(value))
    ? i18n.translate('xpack.contextEngine.feedbackAnalysis.error.invalidAbsoluteFrom', {
        defaultMessage: 'Must be an ISO 8601 date, for example 2026-01-31T00:00:00.000Z.',
      })
    : undefined;

/**
 * A relative signal window shorter than the schedule interval leaves signals
 * that arrive between runs permanently unanalyzed. Overlap is harmless — the
 * improvements store de-duplicates re-proposals — so only the gap is rejected.
 */
export const validateSignalWindowCoversInterval = (
  interval: string,
  signalTimeRange: { type: 'relative' | 'absolute'; from: string }
): string | undefined => {
  // An absolute "since" window is open-ended, so it always covers the interval.
  if (signalTimeRange.type !== 'relative') {
    return undefined;
  }

  const windowMinutes = parseRelativeFromMinutes(signalTimeRange.from);
  const intervalMinutes = parseIntervalMinutes(interval);
  // Malformed values are already reported by the per-field validators.
  if (windowMinutes === undefined || intervalMinutes === undefined) {
    return undefined;
  }

  return windowMinutes >= intervalMinutes
    ? undefined
    : i18n.translate('xpack.contextEngine.feedbackAnalysis.error.windowShorterThanInterval', {
        defaultMessage:
          'The signal time range ({from}) must cover at least one schedule interval ({interval}), or signals that arrive between runs are never analyzed.',
        values: { from: signalTimeRange.from, interval },
      });
};

/** Returns an error message for an invalid AI-index query row limit, or `undefined` when valid. */
export const validateAiIndexQueryLimit = (value: number): string | undefined =>
  Number.isInteger(value) && value >= 1 && value <= MAX_AI_INDEX_QUERY_LIMIT
    ? undefined
    : i18n.translate('xpack.contextEngine.aiIndexQuery.error.invalidLimit', {
        defaultMessage: 'Must be an integer between 1 and {max}.',
        values: { max: MAX_AI_INDEX_QUERY_LIMIT },
      });

/**
 * Returns an error message for an out-of-bounds AI-index query request, or `undefined` when valid.
 * The HTTP schema enforces the same bounds; this guards the service for callers that bypass it,
 * such as agent tools calling the service directly.
 */
export const validateQueryAiIndicesRequest = ({
  query,
  params,
  limit,
}: QueryAiIndicesRequest): string | undefined => {
  if (query.length === 0 || query.length > MAX_AI_INDEX_QUERY_LENGTH) {
    return i18n.translate('xpack.contextEngine.aiIndexQuery.error.invalidQueryLength', {
      defaultMessage: 'query must be between 1 and {max} characters.',
      values: { max: MAX_AI_INDEX_QUERY_LENGTH },
    });
  }
  if (limit !== undefined) {
    const limitError = validateAiIndexQueryLimit(limit);
    if (limitError) {
      return `limit: ${limitError}`;
    }
  }
  if (params === undefined) {
    return undefined;
  }
  const entries = Object.entries(params);
  if (entries.length > MAX_AI_INDEX_QUERY_PARAMS) {
    return i18n.translate('xpack.contextEngine.aiIndexQuery.error.tooManyParams', {
      defaultMessage: 'params must not have more than {max} entries.',
      values: { max: MAX_AI_INDEX_QUERY_PARAMS },
    });
  }
  const invalid = entries.find(
    ([key, value]) =>
      key.length === 0 ||
      key.length > MAX_AI_INDEX_QUERY_PARAM_KEY_LENGTH ||
      (typeof value === 'string' && value.length > MAX_AI_INDEX_QUERY_PARAM_VALUE_LENGTH) ||
      (typeof value === 'number' && !Number.isFinite(value))
  );
  return invalid
    ? i18n.translate('xpack.contextEngine.aiIndexQuery.error.invalidParam', {
        defaultMessage:
          'params keys must be 1 to {maxKey} characters, string values at most {maxValue} characters, and numbers finite.',
        values: {
          maxKey: MAX_AI_INDEX_QUERY_PARAM_KEY_LENGTH,
          maxValue: MAX_AI_INDEX_QUERY_PARAM_VALUE_LENGTH,
        },
      })
    : undefined;
};
