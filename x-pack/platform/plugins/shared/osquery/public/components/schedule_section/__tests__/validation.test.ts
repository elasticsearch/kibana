/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { validateScheduleFormData } from '../validation';
import { createDefaultScheduleFormData } from '../types';
import type { ScheduleFormData } from '../types';
import {
  AT_LEAST_ONE_DAY_ERROR,
  SPLAY_MAX_ERROR,
  START_DATE_IN_PAST_ERROR,
  STOP_AFTER_BEFORE_START_ERROR,
} from '../translations';

const recurrenceState = (overrides: Partial<ScheduleFormData> = {}): ScheduleFormData => ({
  ...createDefaultScheduleFormData('rrule'),
  ...overrides,
});

// "now" pinned with fake timers so the past-start rule (floorTo30Min(now)) is
// deterministic regardless of when the suite runs.
const NOW = new Date('2026-06-19T12:00:00.000Z');
// A start safely in the future relative to NOW — used by cases that exercise
// the OTHER rules without tripping the past-start rule.
const START = new Date('2026-06-20T00:00:00.000Z');

describe('validateScheduleFormData', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('interval mode', () => {
    it('is always valid (the numeric field clamps its own input)', () => {
      expect(validateScheduleFormData(createDefaultScheduleFormData('interval'))).toEqual([]);
    });
  });

  describe('happy path (recurrence)', () => {
    it('returns no errors for a valid daily recurrence with splay off', () => {
      const data = recurrenceState({
        startDate: START,
        recurrence: { frequency: 'daily', interval: 1, byweekday: [] },
        stopAfter: { enabled: false, date: new Date(START.getTime() + 86_400_000) },
        splay: { enabled: false, value: 30, unit: 'seconds' },
      });

      expect(validateScheduleFormData(data)).toEqual([]);
    });

    it('returns no errors for a custom recurrence with at least one weekday', () => {
      const data = recurrenceState({
        recurrence: { frequency: 'custom', interval: 1, byweekday: ['MO'] },
      });

      expect(validateScheduleFormData(data)).toEqual([]);
    });
  });

  describe('custom recurrence with no weekday', () => {
    it('flags an empty byweekday on the custom frequency', () => {
      const data = recurrenceState({
        recurrence: { frequency: 'custom', interval: 1, byweekday: [] },
      });

      expect(validateScheduleFormData(data)).toContain(AT_LEAST_ONE_DAY_ERROR);
    });

    it('does not flag empty byweekday on the daily frequency', () => {
      const data = recurrenceState({
        recurrence: { frequency: 'daily', interval: 1, byweekday: [] },
      });

      expect(validateScheduleFormData(data)).not.toContain(AT_LEAST_ONE_DAY_ERROR);
    });
  });

  describe('rule (b): stop date before start', () => {
    it('flags a stop date on or before the start date', () => {
      const data = recurrenceState({
        startDate: START,
        stopAfter: { enabled: true, date: new Date(START.getTime() - 1) },
      });

      expect(validateScheduleFormData(data)).toContain(STOP_AFTER_BEFORE_START_ERROR);
    });

    it('flags a stop date equal to the start date (must be strictly after)', () => {
      const data = recurrenceState({
        startDate: START,
        stopAfter: { enabled: true, date: new Date(START.getTime()) },
      });

      expect(validateScheduleFormData(data)).toContain(STOP_AFTER_BEFORE_START_ERROR);
    });

    it('does not flag a stop date strictly after the start date', () => {
      const data = recurrenceState({
        startDate: START,
        stopAfter: { enabled: true, date: new Date(START.getTime() + 1000) },
      });

      expect(validateScheduleFormData(data)).not.toContain(STOP_AFTER_BEFORE_START_ERROR);
    });

    it('ignores the stop date when the toggle is off', () => {
      const data = recurrenceState({
        startDate: START,
        stopAfter: { enabled: false, date: new Date(START.getTime() - 1) },
      });

      expect(validateScheduleFormData(data)).not.toContain(STOP_AFTER_BEFORE_START_ERROR);
    });
  });

  describe('rule (c): splay over the 12h cap', () => {
    it('flags a single-unit splay above 12 hours', () => {
      const data = recurrenceState({
        splay: { enabled: true, value: 13, unit: 'hours' },
      });

      expect(validateScheduleFormData(data)).toContain(SPLAY_MAX_ERROR);
    });

    it('does not flag a single-unit splay at the 12h boundary', () => {
      const data = recurrenceState({
        splay: { enabled: true, value: 12, unit: 'hours' },
      });

      expect(validateScheduleFormData(data)).not.toContain(SPLAY_MAX_ERROR);
    });

    it('flags an over-cap compound splay via the summed total', () => {
      const data = recurrenceState({
        splay: { enabled: true, value: 1, unit: 'hours', rawCompound: '13h0m' },
      });

      expect(validateScheduleFormData(data)).toContain(SPLAY_MAX_ERROR);
    });

    it('does not flag a within-cap compound splay', () => {
      const data = recurrenceState({
        splay: { enabled: true, value: 1, unit: 'hours', rawCompound: '1h30m' },
      });

      expect(validateScheduleFormData(data)).not.toContain(SPLAY_MAX_ERROR);
    });

    it('ignores splay when the toggle is off', () => {
      const data = recurrenceState({
        splay: { enabled: false, value: 13, unit: 'hours' },
      });

      expect(validateScheduleFormData(data)).not.toContain(SPLAY_MAX_ERROR);
    });
  });

  describe('rule (a2): start date in the past', () => {
    it('flags a start date whose 30-minute slot has fully elapsed', () => {
      const data = recurrenceState({
        // 11:00 — its slot (11:00–11:30) is entirely before NOW (12:00).
        startDate: new Date('2026-06-19T11:00:00.000Z'),
      });

      expect(validateScheduleFormData(data)).toContain(START_DATE_IN_PAST_ERROR);
    });

    it('does not flag a start in the current 30-minute slot (tick tolerance)', () => {
      const data = recurrenceState({
        // 12:00 == floorTo30Min(NOW); the current slot is not yet "past".
        startDate: new Date('2026-06-19T12:00:00.000Z'),
      });

      expect(validateScheduleFormData(data)).not.toContain(START_DATE_IN_PAST_ERROR);
    });

    it('does not flag a start a few seconds before now but within the current slot', () => {
      const data = recurrenceState({
        // 12:00:00 .. NOW is 12:00:00; a value at 12:00 sits at the slot floor
        // and stays valid even though wall-clock may have ticked past it.
        startDate: new Date('2026-06-19T12:15:00.000Z'),
      });

      expect(validateScheduleFormData(data)).not.toContain(START_DATE_IN_PAST_ERROR);
    });

    it('does not flag a future start date', () => {
      const data = recurrenceState({ startDate: START });

      expect(validateScheduleFormData(data)).not.toContain(START_DATE_IN_PAST_ERROR);
    });

    it('does not apply the past-start rule in interval mode', () => {
      const data: ScheduleFormData = {
        ...createDefaultScheduleFormData('interval'),
        startDate: new Date('2026-06-19T11:00:00.000Z'),
      };

      expect(validateScheduleFormData(data)).not.toContain(START_DATE_IN_PAST_ERROR);
    });

    it('exempts an unchanged past start from a persisted schedule (edit mode)', () => {
      // An existing long-running pack has an elapsed DTSTART. Editing unrelated
      // fields must not be blocked, so a start unchanged from the persisted
      // value is exempt from the past-start rule.
      const past = new Date('2024-01-01T00:00:00.000Z');
      const data = recurrenceState({ startDate: past });

      expect(validateScheduleFormData(data, { originalStartDate: past })).not.toContain(
        START_DATE_IN_PAST_ERROR
      );
    });

    it('still flags a newly-picked past start even in edit mode', () => {
      // The user actively moved the start to a different past slot — that is a
      // fresh invalid choice, not the preserved original, so it is still caught.
      const original = new Date('2024-01-01T00:00:00.000Z');
      const data = recurrenceState({ startDate: new Date('2026-06-19T10:00:00.000Z') });

      expect(validateScheduleFormData(data, { originalStartDate: original })).toContain(
        START_DATE_IN_PAST_ERROR
      );
    });
  });

  it('accumulates multiple errors at once', () => {
    const data = recurrenceState({
      startDate: START,
      recurrence: { frequency: 'custom', interval: 1, byweekday: [] },
      stopAfter: { enabled: true, date: new Date(START.getTime() - 1) },
      splay: { enabled: true, value: 13, unit: 'hours' },
    });

    const errors = validateScheduleFormData(data);
    expect(errors).toContain(AT_LEAST_ONE_DAY_ERROR);
    expect(errors).toContain(STOP_AFTER_BEFORE_START_ERROR);
    expect(errors).toContain(SPLAY_MAX_ERROR);
    expect(errors).toHaveLength(3);
  });
});
