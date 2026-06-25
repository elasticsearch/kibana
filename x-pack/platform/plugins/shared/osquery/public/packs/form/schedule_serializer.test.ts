/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { serializeSchedule, deserializeSchedule } from './schedule_serializer';
import type { ScheduleFormData } from '../../components/schedule_section/types';
import {
  createDefaultScheduleFormData,
  createDefaultRecurrence,
  DEFAULT_INTERVAL_SECONDS,
} from '../../components/schedule_section/types';

// Helpers

const makeIntervalFormData = (interval: number): ScheduleFormData => ({
  ...createDefaultScheduleFormData('interval'),
  interval,
});

const makeRruleFormData = (overrides: Partial<ScheduleFormData> = {}): ScheduleFormData => ({
  ...createDefaultScheduleFormData('rrule'),
  scheduleType: 'rrule',
  startDate: new Date('2024-01-01T00:00:00.000Z'),
  recurrence: {
    ...createDefaultRecurrence(),
    frequency: 'daily',
  },
  splay: { enabled: false, value: 30, unit: 'seconds' },
  stopAfter: { enabled: false, date: new Date('2024-01-01T00:00:00.000Z') },
  ...overrides,
});

describe('schedule_serializer', () => {
  describe('serializeSchedule', () => {
    it('should emit schedule_type interval and interval field for interval mode', () => {
      const result = serializeSchedule(makeIntervalFormData(7200));

      expect(result.schedule_type).toBe('interval');
      expect(result.interval).toBe(7200);
      expect(result).not.toHaveProperty('rrule_schedule');
    });

    it('should emit schedule_type rrule and rrule_schedule for rrule mode', () => {
      const result = serializeSchedule(makeRruleFormData());

      expect(result.schedule_type).toBe('rrule');
      expect(result.rrule_schedule).toBeDefined();
      expect(result.rrule_schedule?.rrule).toMatch(/FREQ=DAILY/);
      expect(result).not.toHaveProperty('interval');
    });

    it('should omit interval from rrule result (mutual exclusivity)', () => {
      const result = serializeSchedule(makeRruleFormData());

      // The wire shape must not carry `interval` alongside `rrule_schedule` —
      // the server uses `schedule_type` as the discriminant and rejects mixed
      // payloads.
      expect(result.interval).toBeUndefined();
    });

    it('should emit start_date as RFC 3339 string', () => {
      const RFC3339_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

      const result = serializeSchedule(
        makeRruleFormData({ startDate: new Date('2024-06-15T08:30:00.000Z') })
      );

      expect(result.rrule_schedule?.start_date).toMatch(RFC3339_REGEX);
    });

    it('should omit end_date when stopAfter is disabled', () => {
      const result = serializeSchedule(
        makeRruleFormData({
          stopAfter: { enabled: false, date: new Date('2025-01-01T00:00:00.000Z') },
        })
      );

      expect(result.rrule_schedule).not.toHaveProperty('end_date');
    });

    it('should emit end_date when stopAfter is enabled with a valid date', () => {
      const endDate = new Date('2025-12-31T00:00:00.000Z');
      const result = serializeSchedule(
        makeRruleFormData({
          stopAfter: { enabled: true, date: endDate },
        })
      );

      expect(result.rrule_schedule?.end_date).toBeDefined();
      expect(new Date(result.rrule_schedule!.end_date!).toISOString()).toBe(endDate.toISOString());
    });

    it('should emit splay string when splay is enabled', () => {
      const result = serializeSchedule(
        makeRruleFormData({
          splay: { enabled: true, value: 30, unit: 'seconds' },
        })
      );

      expect(result.rrule_schedule?.splay).toBe('30s');
    });

    it('should omit splay when splay is disabled', () => {
      const result = serializeSchedule(
        makeRruleFormData({
          splay: { enabled: false, value: 30, unit: 'seconds' },
        })
      );

      expect(result.rrule_schedule).not.toHaveProperty('splay');
    });

    it('should serialize custom (weekly) recurrence with BYDAY', () => {
      const result = serializeSchedule(
        makeRruleFormData({
          recurrence: {
            frequency: 'custom',
            interval: 1,
            byweekday: ['MO', 'WE', 'FR'],
          },
        })
      );

      expect(result.rrule_schedule?.rrule).toContain('FREQ=WEEKLY');
      expect(result.rrule_schedule?.rrule).toContain('BYDAY=MO,WE,FR');
    });
  });

  describe('deserializeSchedule', () => {
    it('should deserialize interval input to interval form state', () => {
      const result = deserializeSchedule({ schedule_type: 'interval', interval: 7200 });

      expect(result.scheduleType).toBe('interval');
      expect(result.interval).toBe(7200);
    });

    it('should fall back to default interval when input is undefined (legacy pack)', () => {
      const result = deserializeSchedule(undefined);

      expect(result.scheduleType).toBe('interval');
      expect(result.interval).toBe(DEFAULT_INTERVAL_SECONDS);
    });

    it('should deserialize rrule input to rrule form state with correct startDate', () => {
      const startDateIso = '2024-03-15T09:00:00.000Z';
      const result = deserializeSchedule({
        schedule_type: 'rrule',
        rrule_schedule: {
          rrule: 'FREQ=DAILY',
          start_date: startDateIso,
        },
      });

      expect(result.scheduleType).toBe('rrule');
      expect(result.startDate.toISOString()).toBe(startDateIso);
      expect(result.recurrence.frequency).toBe('daily');
    });

    it('seeds stopAfter.date to startDate + 1 day when end_date is missing', () => {
      // When a saved pack has no UNTIL bound, the toggle-off placeholder for
      // the end-date picker must already be > startDate so flipping the
      // toggle on lands in a valid state.
      const startDateIso = '2024-03-15T09:00:00.000Z';
      const result = deserializeSchedule({
        schedule_type: 'rrule',
        rrule_schedule: {
          rrule: 'FREQ=DAILY',
          start_date: startDateIso,
        },
      });

      expect(result.stopAfter.enabled).toBe(false);
      const expected = new Date(new Date(startDateIso).getTime() + 24 * 60 * 60 * 1000);
      expect(result.stopAfter.date.toISOString()).toBe(expected.toISOString());
    });

    it('preserves end_date verbatim when present on the saved object', () => {
      const startDateIso = '2024-03-15T09:00:00.000Z';
      const endDateIso = '2024-04-01T09:00:00.000Z';
      const result = deserializeSchedule({
        schedule_type: 'rrule',
        rrule_schedule: {
          rrule: 'FREQ=DAILY',
          start_date: startDateIso,
          end_date: endDateIso,
        },
      });

      expect(result.stopAfter.enabled).toBe(true);
      expect(result.stopAfter.date.toISOString()).toBe(endDateIso);
    });

    it('should round-trip interval mode: serialize → deserialize', () => {
      const original = makeIntervalFormData(1800);
      const serialized = serializeSchedule(original);
      const restored = deserializeSchedule(serialized);

      expect(restored.scheduleType).toBe('interval');
      expect(restored.interval).toBe(1800);
    });

    it('should round-trip rrule daily mode: serialize → deserialize', () => {
      const startDate = new Date('2024-05-10T00:00:00.000Z');
      const original = makeRruleFormData({ startDate });
      const serialized = serializeSchedule(original);
      const restored = deserializeSchedule({
        schedule_type: serialized.schedule_type,
        rrule_schedule: serialized.rrule_schedule,
      });

      expect(restored.scheduleType).toBe('rrule');
      expect(restored.startDate.toISOString()).toBe(startDate.toISOString());
      expect(restored.recurrence.frequency).toBe('daily');
    });
  });

  // 11.2.2/11.2.3: recognized-but-unrenderable parts fold into `_unknown` so a
  // no-op deserialize → serialize round-trip preserves the original RRULE.
  describe('_unknown fold round-trip', () => {
    const roundTripRrule = (rrule: string): string => {
      const restored = deserializeSchedule({
        schedule_type: 'rrule',
        rrule_schedule: { rrule, start_date: '2026-01-01T00:00:00.000Z' },
      });

      return serializeSchedule(restored).rrule_schedule!.rrule;
    };

    it('preserves INTERVAL on a DAILY freq (previously dropped)', () => {
      // The daily branch renders no interval control; folding into `_unknown`
      // keeps the round-trip lossless.
      expect(roundTripRrule('FREQ=DAILY;INTERVAL=2')).toBe('FREQ=DAILY;INTERVAL=2');
    });

    it('preserves BYMONTHDAY on a MONTHLY freq', () => {
      // MONTHLY is not renderable — FREQ + BYMONTHDAY both survive verbatim.
      expect(roundTripRrule('FREQ=MONTHLY;BYMONTHDAY=15')).toBe('FREQ=MONTHLY;BYMONTHDAY=15');
    });

    it('preserves a WEEKLY rule with no BYDAY (no Mon–Fri injection)', () => {
      // "Every 3 weeks on the start date's weekday" has no Custom selection to
      // render, so it folds into `_unknown` and round-trips byte-stable instead
      // of being rewritten to FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,TU,WE,TH,FR.
      expect(roundTripRrule('FREQ=WEEKLY;INTERVAL=3')).toBe('FREQ=WEEKLY;INTERVAL=3');
    });

    it('surfaces a non-empty _unknown so the advanced-parts advisory can render', () => {
      const restored = deserializeSchedule({
        schedule_type: 'rrule',
        rrule_schedule: {
          rrule: 'FREQ=MONTHLY;BYMONTHDAY=15',
          start_date: '2026-01-01T00:00:00.000Z',
        },
      });

      expect(restored.recurrence._unknown).toBeDefined();
      expect(Object.keys(restored.recurrence._unknown ?? {}).length).toBeGreaterThan(0);
    });

    it('does not double-emit a part present as both a typed field and _unknown', () => {
      // Custom (WEEKLY) emits BYDAY from the typed `byweekday` field. A stray
      // `_unknown.BYDAY` (e.g. left over from external state) must be dropped by
      // the serializer dedup — the typed field wins and BYDAY appears once.
      const data = makeRruleFormData({
        recurrence: {
          ...createDefaultRecurrence(),
          frequency: 'custom',
          byweekday: ['MO'],
          _unknown: { BYDAY: 'TU,WE' },
        },
      });

      const out = serializeSchedule(data).rrule_schedule!.rrule;
      expect(out.match(/BYDAY=/g)?.length ?? 0).toBe(1);
      expect(out).toContain('BYDAY=MO');
      expect(out).not.toContain('TU,WE');
    });
  });
});
