/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { validateDataView } from '@kbn/data-view-validation';
import { LogExtractionInstallParams } from '../../constants';
import { parseDurationToMs } from '../../../infra/time';
import type { LogExtractionTypeOverride } from '../../../domain/saved_objects';
import {
  LOG_EXTRACTION_DELAY_DEFAULT,
  LOG_EXTRACTION_LOOKBACK_PERIOD_DEFAULT,
} from '../../../domain/saved_objects';

const MIN_FREQUENCY_MS = 30 * 1000;

/** Params of either config layer. Fields are only checked when a value is supplied: `undefined` and `null` both mean "nothing to check". */
type LogExtractionParams = LogExtractionInstallParams | LogExtractionTypeOverride;

function validateFrequencyParam(data: LogExtractionParams, ctx: z.RefinementCtx): void {
  if (data.frequency == null) {
    return;
  }
  if (!isValidFrequency(data.frequency)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['frequency'],
      message: 'must be a valid duration of at least 30 seconds (e.g. 1m, 30s)',
    });
  }
}

function isValidFrequency(frequency: string): boolean {
  try {
    return parseDurationToMs(frequency) >= MIN_FREQUENCY_MS;
  } catch {
    return false;
  }
}

function validateIndexPatternList(
  patterns: string[] | null | undefined,
  fieldName: 'additionalIndexPatterns' | 'excludedIndexPatterns',
  ctx: z.RefinementCtx
): void {
  if (patterns == null) {
    return;
  }
  patterns.forEach((value, i) => {
    const isEmpty = value.trim().length === 0;
    const errors = validateDataView(value);
    const illegalChars = errors.ILLEGAL_CHARACTERS ?? [];
    const hasSpaces = errors.CONTAINS_SPACES;
    const validIndexPattern = illegalChars.length === 0 && !hasSpaces;

    if (isEmpty || !validIndexPattern) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [fieldName, i],
        message: 'must be a non-empty, valid index pattern (no spaces or illegal characters)',
      });
    }
  });
}

function validateDelayVsLookbackPeriod(data: LogExtractionParams, ctx: z.RefinementCtx): void {
  const hasDelay = data.delay != null;
  const hasLookback = data.lookbackPeriod != null;
  if (!hasDelay && !hasLookback) {
    return;
  }

  if (isDelayGteLookbackPeriod(data.delay, data.lookbackPeriod)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['delay'],
      message: 'must be less than lookbackPeriod',
    });
  }
}

function isDelayGteLookbackPeriod(delay?: string | null, lookbackPeriod?: string | null): boolean {
  const lookbackPeriodValue = lookbackPeriod ?? LOG_EXTRACTION_LOOKBACK_PERIOD_DEFAULT;
  const delayValue = delay ?? LOG_EXTRACTION_DELAY_DEFAULT;
  try {
    const lookbackPeriodMs = parseDurationToMs(lookbackPeriodValue);
    const delayMs = parseDurationToMs(delayValue);
    return delayMs >= lookbackPeriodMs;
  } catch {
    return false;
  }
}

export function validateLogExtractionParams(
  data: LogExtractionParams | undefined,
  ctx: z.RefinementCtx
): void {
  if (!data) return;

  validateFrequencyParam(data, ctx);
  validateIndexPatternList(data.additionalIndexPatterns, 'additionalIndexPatterns', ctx);
  validateIndexPatternList(data.excludedIndexPatterns, 'excludedIndexPatterns', ctx);
  validateDelayVsLookbackPeriod(data, ctx);
}

export const LogExtractionInstallSchema = LogExtractionInstallParams.superRefine(
  validateLogExtractionParams
).optional();

export const LogExtractionUpdadeSchema = LogExtractionInstallParams.superRefine(
  validateLogExtractionParams
);
