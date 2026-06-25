/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MAX_SPLAY_SECONDS } from '../../../common/schedule';
import { splayInSeconds, sumCompoundSeconds } from '../../../common/utils/splay_utils';
import { floorTo30Min } from './slot_utils';
import type { ScheduleFormData } from './types';
import {
  AT_LEAST_ONE_DAY_ERROR,
  SPLAY_MAX_ERROR,
  START_DATE_IN_PAST_ERROR,
  STOP_AFTER_BEFORE_START_ERROR,
} from './translations';

const isValidDate = (date: unknown): date is Date =>
  date instanceof Date && !Number.isNaN(date.getTime());

export interface ValidateScheduleOptions {
  /**
   * The start date hydrated from the persisted schedule (via
   * `deserializeSchedule`). When the current `startDate` is unchanged from this
   * value, the past-start rule is skipped: an existing long-running RRULE pack
   * legitimately has an elapsed `DTSTART`, and editing unrelated fields (rename,
   * splay, queries) must not be blocked just because the original start is in
   * the past. The rule still fires when the user actively picks a new past slot,
   * and always fires in create mode (no original to compare against).
   */
  originalStartDate?: Date;
}

/**
 * Pure submit-time validator for the schedule section. Mirrors the inline field
 * errors but answers a single question for the form / flyout `onSubmit`: "is the
 * whole schedule submittable?". Returns an array of
 * human-readable i18n strings — empty when the schedule is valid.
 *
 * Interval-mode schedules are always valid here (the numeric field clamps its
 * own input). The rules below only apply to recurrence mode.
 */
export const validateScheduleFormData = (
  data: ScheduleFormData,
  options: ValidateScheduleOptions = {}
): string[] => {
  const errors: string[] = [];

  if (data.scheduleType !== 'rrule') {
    return errors;
  }

  // (a) Custom (WEEKLY) recurrence with no weekday selected never fires.
  if (data.recurrence.frequency === 'custom' && data.recurrence.byweekday.length === 0) {
    errors.push(AT_LEAST_ONE_DAY_ERROR);
  }

  const startIsUnchanged =
    isValidDate(options.originalStartDate) &&
    isValidDate(data.startDate) &&
    data.startDate.getTime() === options.originalStartDate.getTime();

  if (
    !startIsUnchanged &&
    isValidDate(data.startDate) &&
    data.startDate.getTime() < floorTo30Min(new Date()).getTime()
  ) {
    errors.push(START_DATE_IN_PAST_ERROR);
  }

  // (b) Stop date must be strictly after the start date (RRULE UNTIL > DTSTART).
  if (
    data.stopAfter.enabled &&
    isValidDate(data.stopAfter.date) &&
    isValidDate(data.startDate) &&
    data.stopAfter.date.getTime() <= data.startDate.getTime()
  ) {
    errors.push(STOP_AFTER_BEFORE_START_ERROR);
  }

  // (c) Splay over the 12h cap, including the summed-compound case.
  if (data.splay.enabled) {
    const splaySeconds = data.splay.rawCompound
      ? sumCompoundSeconds(data.splay.rawCompound)
      : splayInSeconds({ value: data.splay.value, unit: data.splay.unit });

    if (splaySeconds > MAX_SPLAY_SECONDS) {
      errors.push(SPLAY_MAX_ERROR);
    }
  }

  return errors;
};
