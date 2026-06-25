/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';

import { usePackQueryForm } from './use_pack_query_form';
import type { PackQueryFormData, PackSOQueryFormData } from './use_pack_query_form';
import type { ScheduleFormData } from '../../components/schedule_section/types';
import {
  createDefaultScheduleFormData,
  createDefaultRecurrence,
} from '../../components/schedule_section/types';

// Helpers

const makeIntervalSchedule = (intervalSeconds: number): ScheduleFormData => ({
  ...createDefaultScheduleFormData('interval'),
  interval: intervalSeconds,
});

const makeRruleSchedule = (
  _unusedRrule: string = 'FREQ=DAILY',
  startDate: Date = new Date('2024-01-01T00:00:00.000Z')
): ScheduleFormData => ({
  ...createDefaultScheduleFormData('rrule'),
  scheduleType: 'rrule',
  startDate,
  recurrence: {
    ...createDefaultRecurrence(),
    frequency: 'daily',
  },
  splay: { enabled: false, value: 30, unit: 'seconds' },
  stopAfter: { enabled: false, date: startDate },
});

const makeBasePayload = (overrides: Partial<PackQueryFormData> = {}): PackQueryFormData => ({
  id: 'test-query',
  query: 'select * from processes;',
  interval: 3600,
  timeout: 60,
  snapshot: true,
  removed: false,
  ecs_mapping: {},
  override_pack_schedule: false,
  schedule: makeIntervalSchedule(3600),
  ...overrides,
});

// Render the hook and return the serializer closure.
const getSerializer = (props: Parameters<typeof usePackQueryForm>[0]) => {
  const { result } = renderHook(() => usePackQueryForm(props));

  return result.current.serializer;
};

describe('usePackQueryForm', () => {
  describe('serializer', () => {
    it('should strip schedule_type and interval from query when pack is rrule-scheduled and override is off', () => {
      const serialize = getSerializer({
        uniqueQueryIds: [],
        packSchedule: {
          schedule_type: 'rrule',
          rrule_schedule: {
            rrule: 'FREQ=DAILY',
            start_date: '2024-01-01T00:00:00.000Z',
          },
        },
      });

      const payload = makeBasePayload({
        // The query carries a stale interval from being uploaded/pre-existing
        interval: 3600,
        override_pack_schedule: false,
        schedule: makeRruleSchedule(),
      });

      const result = serialize(payload);

      // Wire-boundary guarantee: no interval or timeout on a query that inherits
      // an rrule pack schedule. Server rejects "Query carries interval but the
      // pack uses schedule_type 'rrule'".
      expect(result).not.toHaveProperty('interval');
      expect(result).not.toHaveProperty('timeout');
      expect(result).not.toHaveProperty('schedule_type');
      expect(result).not.toHaveProperty('rrule_schedule');
    });

    it('should emit rrule_schedule and schedule_type when pack is rrule and override is on with matching type', () => {
      const packSchedule = {
        schedule_type: 'rrule' as const,
        rrule_schedule: {
          rrule: 'FREQ=DAILY',
          start_date: '2024-01-01T00:00:00.000Z',
        },
      };

      const serialize = getSerializer({
        uniqueQueryIds: [],
        packSchedule,
      });

      const startDate = new Date('2024-06-01T00:00:00.000Z');
      const payload = makeBasePayload({
        override_pack_schedule: true,
        schedule: makeRruleSchedule('FREQ=DAILY', startDate),
      });

      const result = serialize(payload) as PackSOQueryFormData;

      expect(result.schedule_type).toBe('rrule');
      expect(result.rrule_schedule).toBeDefined();
      expect(result.rrule_schedule?.rrule).toMatch(/FREQ=DAILY/);
      // Interval must be stripped when rrule override is active
      expect(result).not.toHaveProperty('interval');
    });

    it('should strip interval/timeout in the mode-mismatch branch when the pack is rrule (3.1)', () => {
      // the mode-mismatch guard
      // previously returned `base` intact, leaking a stale `interval` into a
      // mixed-mode payload the backend rejects. It now strips interval/timeout
      // when the pack is rrule.
      const serialize = getSerializer({
        uniqueQueryIds: [],
        packSchedule: {
          schedule_type: 'rrule' as const,
          rrule_schedule: {
            rrule: 'FREQ=DAILY',
            start_date: '2024-01-01T00:00:00.000Z',
          },
        },
      });

      // Override is on but the serialized schedule_type is 'interval' — the
      // mode-mismatch branch (e.g. a stale override on a duplicated prebuilt pack).
      const payload = makeBasePayload({
        interval: 7200,
        timeout: 90,
        override_pack_schedule: true,
        schedule: makeIntervalSchedule(7200),
      });

      const result = serialize(payload) as PackSOQueryFormData;

      expect(result).not.toHaveProperty('schedule_type');
      expect(result).not.toHaveProperty('rrule_schedule');
      expect(result).not.toHaveProperty('interval');
      expect(result).not.toHaveProperty('timeout');
    });

    it('the strip is lossless — switching the pack back to interval re-emits the interval', () => {
      const payload = makeBasePayload({
        interval: 7200,
        override_pack_schedule: true,
        schedule: makeIntervalSchedule(7200),
      });

      const serializeAsRrule = getSerializer({
        uniqueQueryIds: [],
        packSchedule: {
          schedule_type: 'rrule' as const,
          rrule_schedule: {
            rrule: 'FREQ=DAILY',
            start_date: '2024-01-01T00:00:00.000Z',
          },
        },
      });
      const rruleResult = serializeAsRrule(payload) as PackSOQueryFormData;
      expect(rruleResult).not.toHaveProperty('interval');

      const serializeAsInterval = getSerializer({
        uniqueQueryIds: [],
        packSchedule: { schedule_type: 'interval' as const, interval: 3600 },
      });
      const intervalResult = serializeAsInterval(payload) as PackSOQueryFormData;
      // Switching the pack back to interval emits the override interval again.
      expect(intervalResult.schedule_type).toBe('interval');
      expect(intervalResult.interval).toBe('7200');
    });

    it('should emit interval string when pack is interval-scheduled and override is on', () => {
      const serialize = getSerializer({
        uniqueQueryIds: [],
        packSchedule: {
          schedule_type: 'interval' as const,
          interval: 3600,
        },
      });

      const payload = makeBasePayload({
        override_pack_schedule: true,
        schedule: makeIntervalSchedule(7200),
      });

      const result = serialize(payload) as PackSOQueryFormData;

      expect(result.schedule_type).toBe('interval');
      expect(result.interval).toBe('7200');
      expect(result).not.toHaveProperty('rrule_schedule');
    });

    it('should strip schedule fields when override is off and no pack schedule is set', () => {
      const serialize = getSerializer({
        uniqueQueryIds: [],
        // No packSchedule → legacy per-query interval mode
      });

      const payload = makeBasePayload({
        interval: 3600,
        override_pack_schedule: false,
        schedule: makeIntervalSchedule(3600),
      });

      const result = serialize(payload) as PackSOQueryFormData;

      // Without a pack schedule, the base is returned as-is: interval is set
      // but schedule_type is not emitted (the query inherits nothing from pack).
      expect(result).not.toHaveProperty('schedule_type');
      expect(result).not.toHaveProperty('rrule_schedule');
      // interval is still on the base because we are in legacy mode
      expect(result.interval).toBe('3600');
    });

    it('should strip interval (inherited) but preserve timeout when pack is interval-scheduled and override is off', () => {
      const serialize = getSerializer({
        uniqueQueryIds: [],
        packSchedule: {
          schedule_type: 'interval' as const,
          interval: 3600,
        },
      });

      const payload = makeBasePayload({
        interval: 7200,
        timeout: 90,
        override_pack_schedule: false,
        schedule: makeIntervalSchedule(7200),
      });

      const result = serialize(payload) as PackSOQueryFormData;

      // Query inherits the pack-level interval, so the per-query interval and
      // schedule discriminator are stripped...
      expect(result).not.toHaveProperty('interval');
      expect(result).not.toHaveProperty('schedule_type');
      expect(result).not.toHaveProperty('rrule_schedule');
      // ...but `timeout` is an independent per-query field (beats reads
      // `Query.timeout` in interval mode) and MUST be preserved.
      expect(result.timeout).toBe(90);
    });

    it('should emit rrule_schedule with RFC 3339 start_date when override is on with rrule mode', () => {
      const RFC3339_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

      const serialize = getSerializer({
        uniqueQueryIds: [],
        packSchedule: {
          schedule_type: 'rrule' as const,
          rrule_schedule: {
            rrule: 'FREQ=DAILY',
            start_date: '2024-01-01T00:00:00.000Z',
          },
        },
      });

      const startDate = new Date('2024-06-15T12:00:00.000Z');
      const payload = makeBasePayload({
        override_pack_schedule: true,
        schedule: makeRruleSchedule('FREQ=DAILY', startDate),
      });

      const result = serialize(payload) as PackSOQueryFormData;

      expect(result.rrule_schedule?.start_date).toMatch(RFC3339_REGEX);
    });
  });
});
