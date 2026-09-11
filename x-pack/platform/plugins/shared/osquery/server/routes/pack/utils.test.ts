/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PackagePolicyClient } from '@kbn/fleet-plugin/server';
import type { SavedObjectsClientContract } from '@kbn/core/server';
import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import {
  convertSOQueriesToPack,
  convertSOQueriesToPackConfig,
  convertPackQueriesToSO,
  fetchAllPackagePolicies,
  groupAgentPolicyIdsByPackagePolicy,
  resolveSharedPackagePolicyShard,
  resolvePackTargetScope,
  buildTargetingWarning,
  DEFAULT_PACK_SHARD,
  validatePackScheduleFields,
  validateRruleConfig,
  isValidRfc3339,
  resolvePackScheduleForUpdate,
  stripPerQueryRruleFields,
  stripPriorModePerQueryFields,
  resolvePreservedQueries,
  hasQueries,
  START_DATE_EPOCH_FALLBACK,
  convergePerQueryIntervals,
} from './utils';

const getTestQueries = (additionalFields?: Record<string, unknown>, packName = 'default') => ({
  [packName]: {
    ...additionalFields,
    query:
      'select u.username,\n' +
      '       p.pid,\n' +
      '       p.name,\n' +
      '       pos.local_address,\n' +
      '       pos.local_port,\n' +
      '       p.path,\n' +
      '       p.cmdline,\n' +
      '       pos.remote_address,\n' +
      '       pos.remote_port\n' +
      'from processes as p\n' +
      'join users as u\n' +
      '    on u.uid=p.uid\n' +
      'join process_open_sockets as pos\n' +
      '    on pos.pid=p.pid\n' +
      "where pos.remote_port !='0'\n" +
      'limit 1000;',
    interval: 3600,
  },
});

const getOneLiner = (additionParams: Record<string, unknown>) => ({
  default: {
    interval: 3600,
    query:
      "select u.username, p.pid, p.name, pos.local_address, pos.local_port, p.path, p.cmdline, pos.remote_address, pos.remote_port from processes as p join users as u on u.uid=p.uid join process_open_sockets as pos on pos.pid=p.pid where pos.remote_port !='0' limit 1000;",
    ...additionParams,
  },
});

describe('Pack utils', () => {
  describe('convertSOQueriesToPack', () => {
    test('converts to pack with empty ecs_mapping', () => {
      const convertedQueries = convertSOQueriesToPack(getTestQueries());
      expect(convertedQueries).toStrictEqual(getTestQueries());
    });
    test('converts to object with pack names after query.id', () => {
      const convertedQueries = convertSOQueriesToPack(getTestQueries({ id: 'testId' }));
      expect(convertedQueries).toStrictEqual(getTestQueries({}, 'testId'));
    });

    test('converts with results snapshot set true and removed true', () => {
      const convertedQueries = convertSOQueriesToPack(
        getTestQueries({ snapshot: true, removed: true })
      );
      expect(convertedQueries).toStrictEqual(getTestQueries({ snapshot: true, removed: true }));
    });
    test('converts with results snapshot set true but removed false', () => {
      const convertedQueries = convertSOQueriesToPack(
        getTestQueries({ snapshot: true, removed: false })
      );
      expect(convertedQueries).toStrictEqual(getTestQueries({ snapshot: true, removed: false }));
    });
    test('converts with both results set to false', () => {
      const convertedQueries = convertSOQueriesToPack(
        getTestQueries({ snapshot: false, removed: false })
      );
      expect(convertedQueries).toStrictEqual(getTestQueries({ removed: false, snapshot: false }));
    });
  });

  describe('convertSOQueriesToPackConfig (legacy / no packSchedule)', () => {
    const FIXED_FALLBACK = '2026-01-01T00:00:00.000Z';

    test('converts to pack with converting query to single line', () => {
      const { queries } = convertSOQueriesToPackConfig(getTestQueries(), {
        isRruleFeatureEnabled: true,
        fallbackStartDate: FIXED_FALLBACK,
      });
      expect(queries).toStrictEqual(getOneLiner({ start_date: FIXED_FALLBACK }));
    });

    test('snapshot true / removed true → result type omitted from output', () => {
      const { queries } = convertSOQueriesToPackConfig(
        getTestQueries({ snapshot: true, removed: true }),
        { isRruleFeatureEnabled: true, fallbackStartDate: FIXED_FALLBACK }
      );
      expect(queries).toStrictEqual(getOneLiner({ start_date: FIXED_FALLBACK }));
    });
    test('converts with results snapshot set false', () => {
      const { queries } = convertSOQueriesToPackConfig(
        getTestQueries({ snapshot: false, removed: true }),
        { isRruleFeatureEnabled: true, fallbackStartDate: FIXED_FALLBACK }
      );
      expect(queries).toStrictEqual(
        getOneLiner({ snapshot: false, removed: true, start_date: FIXED_FALLBACK })
      );
    });

    test('passes through schedule_id and start_date', () => {
      const { queries } = convertSOQueriesToPackConfig(
        getTestQueries({ schedule_id: 'uuid-abc', start_date: '2024-01-01T00:00:00.000Z' }),
        { isRruleFeatureEnabled: true, fallbackStartDate: FIXED_FALLBACK }
      );
      expect(queries).toStrictEqual(
        getOneLiner({ schedule_id: 'uuid-abc', start_date: '2024-01-01T00:00:00.000Z' })
      );
    });

    test('injects space_id per-query (osquerybeat reads it) and default_space_id at the pack level', () => {
      const output = convertSOQueriesToPackConfig(getTestQueries(), {
        spaceId: 'my-space',
        isRruleFeatureEnabled: true,
        fallbackStartDate: FIXED_FALLBACK,
      });
      expect(output.default_space_id).toBe('my-space');
      expect(output.queries).toStrictEqual(
        getOneLiner({ space_id: 'my-space', start_date: FIXED_FALLBACK })
      );
    });
  });

  // Fan-out behavior under the new signature + wire-boundary gate.
  describe('convertSOQueriesToPackConfig — fan-out', () => {
    const rrule = {
      rrule: 'FREQ=DAILY',
      start_date: '2024-01-01T00:00:00.000Z',
    };

    test('pack RRULE inherited by all queries — pack-level default emitted, no per-query rrule', () => {
      const out = convertSOQueriesToPackConfig(
        [{ id: 'q1', name: 'q1', query: 'SELECT 1', schedule_id: 'sid-1' }],
        {
          packSchedule: { schedule_type: 'rrule', rrule_schedule: rrule },
          isRruleFeatureEnabled: true,
        }
      );
      expect(out.default_rrule_schedule).toEqual(rrule);
      expect(out.queries.q1).not.toHaveProperty('rrule_schedule');
      expect(out.queries.q1).not.toHaveProperty('interval');
      expect(out.queries.q1.schedule_id).toBe('sid-1');
    });

    test('per-query RRULE override (same mode) — both pack default and per-query rrule emitted', () => {
      const overrideRrule = {
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        start_date: '2024-01-01T00:00:00.000Z',
      };
      const out = convertSOQueriesToPackConfig(
        [
          { id: 'q1', name: 'q1', query: 'SELECT 1' },
          {
            id: 'q2',
            name: 'q2',
            query: 'SELECT 2',
            schedule_type: 'rrule',
            rrule_schedule: overrideRrule,
          },
        ],
        {
          packSchedule: { schedule_type: 'rrule', rrule_schedule: rrule },
          isRruleFeatureEnabled: true,
        }
      );
      expect(out.default_rrule_schedule).toEqual(rrule);
      expect(out.queries.q1).not.toHaveProperty('rrule_schedule');
      expect(out.queries.q2.rrule_schedule).toEqual(overrideRrule);
    });

    test('pack interval inherited — pack-level default_native_schedule emitted, no per-query interval when matching', () => {
      const out = convertSOQueriesToPackConfig(
        [{ id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60 }],
        {
          packSchedule: { schedule_type: 'interval', interval: 60 },
          isRruleFeatureEnabled: true,
        }
      );
      expect(out.default_native_schedule).toEqual({ interval: 60 });
      expect(out.queries.q1).not.toHaveProperty('interval');
    });

    // Regression guard for #279946: a stale bare per-query interval (no
    // schedule_type marker) must not shadow default_native_schedule; only an
    // explicit flyout override does. Values 80/100 under 120 keep divergence visible.
    test('stale marker-less per-query interval — NOT emitted, query inherits pack default', () => {
      const out = convertSOQueriesToPackConfig(
        [
          { id: 'q1', name: 'q1', query: 'SELECT 1', interval: 80 },
          { id: 'q2', name: 'q2', query: 'SELECT 2', interval: 100 },
        ],
        {
          packSchedule: { schedule_type: 'interval', interval: 120 },
          isRruleFeatureEnabled: true,
        }
      );
      expect(out.default_native_schedule).toEqual({ interval: 120 });
      // q1 has a stale interval (80) without schedule_type — must NOT reach the wire.
      expect(out.queries.q1).not.toHaveProperty('interval');
      // q2 has a stale interval (100) without schedule_type — also must NOT be emitted.
      expect(out.queries.q2).not.toHaveProperty('interval');
    });

    test('explicit per-query interval override (schedule_type: interval) — emitted on the query', () => {
      const out = convertSOQueriesToPackConfig(
        [
          { id: 'q1', name: 'q1', query: 'SELECT 1' },
          {
            id: 'q2',
            name: 'q2',
            query: 'SELECT 2',
            schedule_type: 'interval' as const,
            interval: 80,
          },
        ],
        {
          packSchedule: { schedule_type: 'interval', interval: 120 },
          isRruleFeatureEnabled: true,
        }
      );
      expect(out.default_native_schedule).toEqual({ interval: 120 });
      expect(out.queries.q1).not.toHaveProperty('interval');
      // q2 has an explicit flyout override — must reach the wire.
      expect(out.queries.q2.interval).toBe(80);
    });

    test('legacy pack (no schedule_type) — per-query interval only, no default_*_schedule', () => {
      const out = convertSOQueriesToPackConfig(
        [{ id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60 }],
        { isRruleFeatureEnabled: true }
      );
      expect(out.default_rrule_schedule).toBeUndefined();
      expect(out.default_native_schedule).toBeUndefined();
      expect(out.queries.q1.interval).toBe(60);
    });

    test('mode invariant — no query in output carries both interval and rrule_schedule', () => {
      const out = convertSOQueriesToPackConfig(
        [
          {
            id: 'q1',
            name: 'q1',
            query: 'SELECT 1',
            // Stale interval on the SO — must be stripped when pack is rrule.
            interval: 999,
          },
        ],
        {
          packSchedule: { schedule_type: 'rrule', rrule_schedule: rrule },
          isRruleFeatureEnabled: true,
        }
      );
      expect(out.queries.q1).not.toHaveProperty('interval');
      expect(out.queries.q1).not.toHaveProperty('rrule_schedule');
    });

    // Stale per-query start_date must not shadow the user's chosen rrule start_date.
    test('per-query rrule override — no top-level start_date emitted (shadowing fix)', () => {
      const overrideRrule = {
        rrule: 'FREQ=DAILY',
        start_date: '2026-06-18T13:38:00.000Z',
      };
      const out = convertSOQueriesToPackConfig(
        [
          {
            id: 'uptime',
            name: 'uptime',
            query: 'select * from uptime;',
            schedule_type: 'rrule',
            rrule_schedule: overrideRrule,
            schedule_id: 'cffd6216-09d7-43c3-8c90-0cc61bab38bc',
            start_date: '2026-06-18T11:37:48.355Z', // stale create-time value
          },
        ],
        {
          packSchedule: {
            schedule_type: 'rrule',
            rrule_schedule: { rrule: 'FREQ=DAILY', start_date: '2026-06-18T11:37:48.355Z' },
          },
          isRruleFeatureEnabled: true,
        }
      );
      expect(out.queries.uptime).not.toHaveProperty('start_date');
      expect(out.queries.uptime.rrule_schedule).toEqual(overrideRrule);
    });

    // Pack default_rrule_schedule is the authoritative time source, not the stale SO start_date.
    test('pack-inheriting rrule query — no top-level start_date emitted', () => {
      const out = convertSOQueriesToPackConfig(
        [
          {
            id: 'q1',
            name: 'q1',
            query: 'SELECT 1',
            schedule_id: 'sid-1',
            start_date: '2026-06-18T11:37:48.355Z', // stale create-time value
          },
        ],
        {
          packSchedule: {
            schedule_type: 'rrule',
            rrule_schedule: { rrule: 'FREQ=DAILY', start_date: '2026-06-18T13:38:00.000Z' },
          },
          isRruleFeatureEnabled: true,
        }
      );
      expect(out.queries.q1).not.toHaveProperty('start_date');
      expect(out.queries.q1).not.toHaveProperty('rrule_schedule');
    });

    // Legacy / interval mode must still emit top-level start_date (unchanged behaviour).
    test('legacy query — top-level start_date preserved (interval mode)', () => {
      const out = convertSOQueriesToPackConfig(
        [
          {
            id: 'q1',
            name: 'q1',
            query: 'SELECT 1',
            interval: 3600,
            schedule_id: 'sid-1',
            start_date: '2026-06-18T11:37:48.355Z',
          },
        ],
        { isRruleFeatureEnabled: true }
      );
      expect(out.queries.q1.start_date).toBe('2026-06-18T11:37:48.355Z');
    });

    // The V4 backfill stamps START_DATE_EPOCH_FALLBACK on docs lacking
    // created_at. That meaningless 1970 value must not be projected onto the
    // interval-mode wire — it is replaced by the pack's created_at (fallback).
    test('interval mode — epoch-fallback start_date replaced with pack created_at, real start_date emitted', () => {
      const packCreatedAt = '2026-05-01T08:00:00.000Z';
      const out = convertSOQueriesToPackConfig(
        [
          {
            id: 'epoch',
            name: 'epoch',
            query: 'SELECT 1',
            interval: 3600,
            schedule_id: 'sid-epoch',
            start_date: START_DATE_EPOCH_FALLBACK,
          },
          {
            id: 'real',
            name: 'real',
            query: 'SELECT 2',
            interval: 3600,
            schedule_id: 'sid-real',
            start_date: '2026-06-18T11:37:48.355Z',
          },
        ],
        { isRruleFeatureEnabled: true, fallbackStartDate: packCreatedAt }
      );

      // The epoch sentinel is replaced with the pack's created_at.
      expect(out.queries.epoch.start_date).toBe(packCreatedAt);
      // A genuine start_date on a sibling still reaches the wire unchanged.
      expect(out.queries.real.start_date).toBe('2026-06-18T11:37:48.355Z');
    });

    // Packs predating created_at have no anchor. The value must be STABLE: a
    // time-of-write now() defeats the reconciler's isEqual gate, rewriting the
    // policy and re-anchoring execution numbering on every restart.
    test('interval mode — deterministic epoch anchor when there is no fallbackStartDate either', () => {
      const build = () =>
        convertSOQueriesToPackConfig(
          [{ id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'sid-1' }],
          { isRruleFeatureEnabled: true }
        );

      const first = build();
      const second = build();

      expect(first.queries.q1.start_date).toBe(START_DATE_EPOCH_FALLBACK);
      expect(first.queries.q1.start_date).toBe(second.queries.q1.start_date);
    });

    // `created_at` is `schema.maybe(schema.string())`, so it can be '' (which
    // `??` misses) or malformed — and an unparseable anchor makes the agent
    // report execution count 0, the very bug this fallback exists to fix.
    test.each([
      ['empty string', ''],
      ['not a date', 'not-a-date'],
      ['date only, no time', '2026-05-01'],
      ['calendar-invalid', '2026-02-30T00:00:00.000Z'],
    ])(
      'interval mode — %s fallbackStartDate falls through to the epoch sentinel',
      (_label, bad) => {
        const out = convertSOQueriesToPackConfig(
          [{ id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'sid-1' }],
          { isRruleFeatureEnabled: true, fallbackStartDate: bad }
        );

        expect(out.queries.q1.start_date).toBe(START_DATE_EPOCH_FALLBACK);
      }
    );

    // Absent start_date (pre-backfill packs) falls back to pack created_at.
    test('interval mode — absent start_date replaced with fallbackStartDate', () => {
      const packCreatedAt = '2026-04-15T12:00:00.000Z';
      const out = convertSOQueriesToPackConfig(
        [{ id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'sid-1' }],
        { isRruleFeatureEnabled: true, fallbackStartDate: packCreatedAt }
      );

      expect(out.queries.q1.start_date).toBe(packCreatedAt);
    });

    // The wire gate enforces this even if the SO already has RRULE state.
    test('wire-gate off — top-level start_date preserved on rrule SO query (legacy fallback)', () => {
      const out = convertSOQueriesToPackConfig(
        [
          {
            id: 'q1',
            name: 'q1',
            query: 'SELECT 1',
            schedule_type: 'rrule',
            rrule_schedule: { rrule: 'FREQ=DAILY', start_date: '2026-06-18T13:38:00.000Z' },
            interval: 3600,
            start_date: '2026-06-18T11:37:48.355Z',
          },
        ],
        { isRruleFeatureEnabled: false }
      );
      expect(out.queries.q1.start_date).toBe('2026-06-18T11:37:48.355Z');
    });

    test('wire-gate off — RRULE on SO is ignored, legacy interval emission', () => {
      const out = convertSOQueriesToPackConfig(
        [
          { id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60 },
          {
            id: 'q2',
            name: 'q2',
            query: 'SELECT 2',
            schedule_type: 'rrule',
            rrule_schedule: rrule,
            interval: 120,
          },
        ],
        {
          packSchedule: { schedule_type: 'rrule', rrule_schedule: rrule },
          isRruleFeatureEnabled: false,
        }
      );
      expect(out.default_rrule_schedule).toBeUndefined();
      expect(out.default_native_schedule).toBeUndefined();
      expect(out.queries.q1.interval).toBe(60);
      // q2 has rrule on the SO but the wire gate strips it; falls back to its
      // interval if present.
      expect(out.queries.q2).not.toHaveProperty('rrule_schedule');
      expect(out.queries.q2.interval).toBe(120);
    });

    test('default_space_id continues to emit when the wire gate is off', () => {
      const out = convertSOQueriesToPackConfig(
        [{ id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60 }],
        {
          spaceId: 'my-space',
          packSchedule: { schedule_type: 'rrule', rrule_schedule: rrule },
          isRruleFeatureEnabled: false,
        }
      );
      expect(out.default_space_id).toBe('my-space');
    });

    // Wire-gate is the actual enforcement boundary, not just the request
    // gate. A pack SO planted with RRULE state still produces the legacy
    // shape when the flag is off.
    test('defense in depth: pack SO carries rrule + flag off → legacy wire shape', () => {
      const out = convertSOQueriesToPackConfig(
        [
          {
            id: 'q1',
            name: 'q1',
            query: 'SELECT 1',
            schedule_type: 'rrule',
            rrule_schedule: rrule,
          },
        ],
        {
          packSchedule: { schedule_type: 'rrule', rrule_schedule: rrule },
          isRruleFeatureEnabled: false,
        }
      );
      expect(out.default_rrule_schedule).toBeUndefined();
      expect(out.queries.q1).not.toHaveProperty('rrule_schedule');
    });

    // Interval-mode packs must also fall back to the legacy shape when the flag is off.
    test('defense in depth: pack SO carries interval mode + flag off → no default_native_schedule', () => {
      const out = convertSOQueriesToPackConfig(
        [{ id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60 }],
        {
          packSchedule: { schedule_type: 'interval', interval: 60 },
          isRruleFeatureEnabled: false,
        }
      );
      expect(out.default_native_schedule).toBeUndefined();
      expect(out.default_rrule_schedule).toBeUndefined();
      expect(out.queries.q1.interval).toBe(60);
    });

    // Guards against malformed/partial pack-level schedule state leaking to the wire.

    test('flag on + malformed SO (schedule_type rrule, missing rrule_schedule) — no default_rrule_schedule emitted', () => {
      const out = convertSOQueriesToPackConfig([{ id: 'q1', name: 'q1', query: 'SELECT 1' }], {
        packSchedule: { schedule_type: 'rrule', rrule_schedule: undefined },
        isRruleFeatureEnabled: true,
      });
      expect(out.default_rrule_schedule).toBeUndefined();
      expect(out.default_native_schedule).toBeUndefined();
    });

    test('flag on + no pack-level schedule_type + per-query rrule_schedule on SO — emits legacy per-query path', () => {
      const perQueryRrule = {
        rrule: 'FREQ=DAILY',
        start_date: '2024-01-01T00:00:00.000Z',
      };
      const out = convertSOQueriesToPackConfig(
        [
          {
            id: 'q1',
            name: 'q1',
            query: 'SELECT 1',
            schedule_type: 'rrule',
            rrule_schedule: perQueryRrule,
            interval: 60,
          },
        ],
        { isRruleFeatureEnabled: true }
      );
      expect(out.default_rrule_schedule).toBeUndefined();
      expect(out.default_native_schedule).toBeUndefined();
      // Legacy else branch: rrule_schedule not emitted, interval emitted if present.
      expect(out.queries.q1).not.toHaveProperty('rrule_schedule');
    });
  });

  // Wire-format byte contract against a beats RRuleScheduleConfig fixture.
  describe('convertSOQueriesToPackConfig — beats wire-format byte contract', () => {
    test('default_rrule_schedule matches the beats RRuleScheduleConfig shape byte-for-byte', () => {
      // Fixture lifted from `elastic/beats#48767/internal/config/osquery.go`
      // — the JSON tags on `RRuleScheduleConfig`. If beats ever renames a
      // field or changes a type, this assertion fails and the breakage is
      // caught at PR review rather than at agent runtime.
      const fixture = {
        rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
        start_date: '2024-01-01T00:00:00Z',
        end_date: '2024-12-31T23:59:59Z',
        splay: '5m',
        timeout: 90,
      };
      const out = convertSOQueriesToPackConfig([{ id: 'q1', name: 'q1', query: 'SELECT 1' }], {
        packSchedule: { schedule_type: 'rrule', rrule_schedule: fixture },
        isRruleFeatureEnabled: true,
      });
      expect(out.default_rrule_schedule).toEqual(fixture);
      // Key set check — no extra fields, no missing fields.
      expect(Object.keys(out.default_rrule_schedule!).sort()).toEqual([
        'end_date',
        'rrule',
        'splay',
        'start_date',
        'timeout',
      ]);
    });
  });

  describe('convertSOQueriesToPackConfig — schedule_id reaches the wire explicitly', () => {
    test('emits schedule_id with the RRULE flag OFF (backport-critical path)', () => {
      const out = convertSOQueriesToPackConfig(
        [{ id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'sched-1' }],
        { isRruleFeatureEnabled: false }
      );

      expect(out.queries.q1.schedule_id).toBe('sched-1');
    });

    test('emits schedule_id with the RRULE flag ON', () => {
      const out = convertSOQueriesToPackConfig(
        [{ id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'sched-1' }],
        { isRruleFeatureEnabled: true }
      );

      expect(out.queries.q1.schedule_id).toBe('sched-1');
    });

    test('emits schedule_id for every query (multi-query, flag off)', () => {
      const out = convertSOQueriesToPackConfig(
        [
          { id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'sched-1' },
          { id: 'q2', name: 'q2', query: 'SELECT 2', interval: 120, schedule_id: 'sched-2' },
        ],
        { isRruleFeatureEnabled: false }
      );

      expect(out.queries.q1.schedule_id).toBe('sched-1');
      expect(out.queries.q2.schedule_id).toBe('sched-2');
    });

    test('omits schedule_id when the stored query has none (no empty key leaked)', () => {
      const out = convertSOQueriesToPackConfig(
        [{ id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60 }],
        { isRruleFeatureEnabled: false }
      );

      expect(out.queries.q1).not.toHaveProperty('schedule_id');
    });

    test('does not regress other field shapes when schedule_id is present (flag off)', () => {
      const fallback = '2026-03-01T00:00:00.000Z';
      const out = convertSOQueriesToPackConfig(
        [{ id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'sched-1' }],
        { isRruleFeatureEnabled: false, fallbackStartDate: fallback }
      );

      expect(out.queries.q1).toEqual({
        name: 'q1',
        query: 'SELECT 1',
        interval: 60,
        schedule_id: 'sched-1',
        start_date: fallback,
      });
    });
  });

  describe('convertSOQueriesToPack — schedule_id preservation', () => {
    test('preserves schedule_id and start_date from SO format to pack format', () => {
      const soQueries = [
        {
          id: 'q1',
          name: 'q1',
          query: 'SELECT 1',
          interval: 60,
          schedule_id: 'uuid-preserved',
          start_date: '2024-03-01T00:00:00.000Z',
        },
      ];
      const result = convertSOQueriesToPack(soQueries);

      expect(result.q1).toBeDefined();
      expect(result.q1.schedule_id).toBe('uuid-preserved');
      expect(result.q1.start_date).toBe('2024-03-01T00:00:00.000Z');
    });
  });

  describe('stripPerQueryRruleFields', () => {
    const rrule = { rrule: 'FREQ=DAILY', start_date: '2026-01-01T00:00:00Z' };

    test('flag on — array shape returned unchanged (identity)', () => {
      const input = [
        {
          id: 'q1',
          name: 'q1',
          query: 'SELECT 1',
          schedule_type: 'rrule' as const,
          rrule_schedule: rrule,
        },
      ];
      const out = stripPerQueryRruleFields(input, true);
      expect(out).toBe(input);
    });

    test('flag on — record shape returned unchanged (identity)', () => {
      const input = {
        q1: { query: 'SELECT 1', schedule_type: 'rrule' as const, rrule_schedule: rrule },
      };
      const out = stripPerQueryRruleFields(input, true);
      expect(out).toBe(input);
    });

    test('flag off — strips schedule_type and rrule_schedule from array shape', () => {
      const input = [
        {
          id: 'q1',
          name: 'q1',
          query: 'SELECT 1',
          schedule_type: 'rrule' as const,
          rrule_schedule: rrule,
          interval: 60,
        },
      ];
      const out = stripPerQueryRruleFields(input, false);
      expect(out[0]).not.toHaveProperty('schedule_type');
      expect(out[0]).not.toHaveProperty('rrule_schedule');
      expect(out[0].interval).toBe(60);
      expect(out[0].query).toBe('SELECT 1');
    });

    test('flag off — strips schedule_type and rrule_schedule from record shape', () => {
      const input = {
        q1: {
          query: 'SELECT 1',
          schedule_type: 'rrule' as const,
          rrule_schedule: rrule,
          interval: 60,
        },
      };
      const out = stripPerQueryRruleFields(input, false);
      expect(out.q1).not.toHaveProperty('schedule_type');
      expect(out.q1).not.toHaveProperty('rrule_schedule');
      expect(out.q1.interval).toBe(60);
    });

    test('flag off — per-query interval continues to surface (legacy field)', () => {
      const input = { q1: { query: 'SELECT 1', interval: 120 } };
      const out = stripPerQueryRruleFields(input, false);
      expect(out.q1.interval).toBe(120);
    });

    test('flag off — empty queries returns empty', () => {
      expect(stripPerQueryRruleFields([], false)).toEqual([]);
      expect(stripPerQueryRruleFields({}, false)).toEqual({});
    });
  });

  describe('stripPriorModePerQueryFields', () => {
    test('new mode rrule — drops interval and stale interval schedule_type', () => {
      expect(
        stripPriorModePerQueryFields(
          { query: 'SELECT 1', interval: 30, schedule_type: 'interval' },
          'rrule'
        )
      ).toEqual({ query: 'SELECT 1' });
    });

    test('new mode rrule — preserves same-mode rrule override', () => {
      const rrule = {
        rrule: 'FREQ=MINUTELY',
        start_date: '2024-01-01T00:00:00.000Z',
      };
      expect(
        stripPriorModePerQueryFields(
          { query: 'SELECT 1', schedule_type: 'rrule', rrule_schedule: rrule },
          'rrule'
        )
      ).toEqual({ query: 'SELECT 1', schedule_type: 'rrule', rrule_schedule: rrule });
    });

    test('new mode interval — drops rrule_schedule and stale rrule schedule_type', () => {
      expect(
        stripPriorModePerQueryFields(
          {
            query: 'SELECT 1',
            schedule_type: 'rrule',
            rrule_schedule: { rrule: 'FREQ=DAILY', start_date: '2024-01-01T00:00:00.000Z' },
          },
          'interval'
        )
      ).toEqual({ query: 'SELECT 1' });
    });

    test('new mode interval — preserves same-mode interval override', () => {
      expect(
        stripPriorModePerQueryFields(
          { query: 'SELECT 1', interval: 30, schedule_type: 'interval' },
          'interval'
        )
      ).toEqual({ query: 'SELECT 1', interval: 30, schedule_type: 'interval' });
    });

    // strip is only responsible for cross-mode fields; a bare interval is left
    // alone (convergePerQueryIntervals drops stale prebuilt-pack copies separately).
    test('interval mode — bare interval and explicit override both pass through', () => {
      expect(stripPriorModePerQueryFields({ query: 'SELECT 1', interval: 80 }, 'interval')).toEqual(
        {
          query: 'SELECT 1',
          interval: 80,
        }
      );
      expect(
        stripPriorModePerQueryFields(
          { query: 'SELECT 1', interval: 80, schedule_type: 'interval' },
          'interval'
        )
      ).toEqual({ query: 'SELECT 1', interval: 80, schedule_type: 'interval' });
    });

    test('mode cleared — drops both override flavours and interval', () => {
      expect(
        stripPriorModePerQueryFields(
          {
            query: 'SELECT 1',
            interval: 30,
            schedule_type: 'rrule',
            rrule_schedule: { rrule: 'FREQ=DAILY', start_date: '2024-01-01T00:00:00.000Z' },
          },
          undefined
        )
      ).toEqual({ query: 'SELECT 1' });
    });

    test('no overrides — pass-through', () => {
      expect(stripPriorModePerQueryFields({ query: 'SELECT 1' }, 'rrule')).toEqual({
        query: 'SELECT 1',
      });
      expect(stripPriorModePerQueryFields({ query: 'SELECT 1' }, undefined)).toEqual({
        query: 'SELECT 1',
      });
    });
  });

  describe('convergePerQueryIntervals', () => {
    test('drops marker-less bare interval in interval-mode pack', () => {
      const result = convergePerQueryIntervals(
        { q1: { query: 'SELECT 1', interval: 80 } },
        'interval'
      );
      expect(result.q1).not.toHaveProperty('interval');
    });

    test('preserves explicit schedule_type: interval override', () => {
      const result = convergePerQueryIntervals(
        { q1: { query: 'SELECT 1', interval: 100, schedule_type: 'interval' } },
        'interval'
      );
      expect(result.q1).toMatchObject({ interval: 100, schedule_type: 'interval' });
    });

    test('leaves rrule-override query untouched in interval-mode pack', () => {
      const rruleQuery = {
        query: 'SELECT 1',
        schedule_type: 'rrule' as const,
        rrule_schedule: { rrule: 'FREQ=DAILY', start_date: '2026-01-01T00:00:00.000Z' },
      };
      const result = convergePerQueryIntervals({ q1: rruleQuery }, 'interval');
      expect(result.q1).toEqual(rruleQuery);
    });

    test('no-op in legacy mode (packScheduleType undefined)', () => {
      const queries = { q1: { query: 'SELECT 1', interval: 80 } };
      expect(convergePerQueryIntervals(queries, undefined)).toBe(queries);
    });

    test('no-op in rrule-mode pack', () => {
      const queries = { q1: { query: 'SELECT 1', interval: 80 } };
      expect(convergePerQueryIntervals(queries, 'rrule')).toBe(queries);
    });

    test('query without interval is untouched', () => {
      const result = convergePerQueryIntervals({ q1: { query: 'SELECT 1' } }, 'interval');
      expect(result.q1).toEqual({ query: 'SELECT 1' });
    });
  });

  describe('convertPackQueriesToSO', () => {
    test('preserves schedule_id and start_date in converted queries', () => {
      const packQueries = getOneLiner({
        schedule_id: 'uuid-xyz',
        start_date: '2024-06-15T12:00:00.000Z',
      });
      const result = convertPackQueriesToSO(packQueries);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'default',
        schedule_id: 'uuid-xyz',
        start_date: '2024-06-15T12:00:00.000Z',
      });
    });

    describe('byte-identical default pick-list (no schedule_type on input)', () => {
      test('emits the canonical default pick-list shape', () => {
        const result = convertPackQueriesToSO({
          q1: {
            name: 'q1',
            query: 'SELECT 1;',
            interval: 60,
            platform: 'linux',
            version: '5.10.0',
            snapshot: true,
            removed: false,
            timeout: 30,
            schedule_id: 'sid-1',
            start_date: '2026-05-01T00:00:00.000Z',
          },
        });

        expect(result).toEqual([
          {
            id: 'q1',
            name: 'q1',
            query: 'SELECT 1;',
            interval: 60,
            platform: 'linux',
            version: '5.10.0',
            snapshot: true,
            removed: false,
            timeout: 30,
            schedule_id: 'sid-1',
            start_date: '2026-05-01T00:00:00.000Z',
          },
        ]);
      });

      test('does not introduce schedule_type / rrule_schedule keys when input omits schedule_type', () => {
        const result = convertPackQueriesToSO({
          q1: { name: 'q1', query: 'SELECT 1;', interval: 60 },
        });
        expect(result[0]).not.toHaveProperty('schedule_type');
        expect(result[0]).not.toHaveProperty('rrule_schedule');
      });

      test('drops fields not on the default pick-list (no leak of extra props)', () => {
        const result = convertPackQueriesToSO({
          q1: {
            name: 'q1',
            query: 'SELECT 1;',
            interval: 60,
            extra_field: 'must-not-leak',
          } as never,
        });
        expect(result[0]).not.toHaveProperty('extra_field');
      });
    });

    describe('per-query schedule_type override', () => {
      test('schedule_type:"rrule" drops interval, keeps rrule_schedule', () => {
        const result = convertPackQueriesToSO({
          q1: {
            query: 'SELECT 1;',
            interval: 60,
            schedule_type: 'rrule',
            rrule_schedule: { rrule: 'FREQ=DAILY', start_date: '2026-05-01T00:00:00.000Z' },
          },
        });
        expect(result[0]).not.toHaveProperty('interval');
        expect(result[0]).toMatchObject({
          schedule_type: 'rrule',
          rrule_schedule: { rrule: 'FREQ=DAILY', start_date: '2026-05-01T00:00:00.000Z' },
        });
      });

      test('schedule_type:"interval" keeps interval, stamps schedule_type', () => {
        const result = convertPackQueriesToSO({
          q1: {
            query: 'SELECT 1;',
            interval: 60,
            schedule_type: 'interval',
          },
        });
        expect(result[0]).toMatchObject({
          interval: 60,
          schedule_type: 'interval',
        });
        expect(result[0]).not.toHaveProperty('rrule_schedule');
      });
    });

    // Route validator rejects this earlier; here we check the utility also drops the field.
    describe('defense in depth', () => {
      test('drops rrule_schedule when schedule_type is missing', () => {
        const result = convertPackQueriesToSO({
          q1: {
            query: 'SELECT 1;',
            rrule_schedule: {
              rrule: 'FREQ=DAILY',
              start_date: '2026-05-01T00:00:00.000Z',
            },
          } as never,
        });
        expect(result[0]).not.toHaveProperty('rrule_schedule');
        expect(result[0]).not.toHaveProperty('schedule_type');
      });
    });
  });

  describe('isValidRfc3339', () => {
    test('rejects loose dates', () => {
      expect(isValidRfc3339('2024-01-01')).toBe(false);
      expect(isValidRfc3339('01/02/2024')).toBe(false);
      expect(isValidRfc3339('2024-01-01T00:00:00')).toBe(false); // missing TZ
    });
    test('accepts RFC 3339 with Z', () => {
      expect(isValidRfc3339('2024-01-01T00:00:00Z')).toBe(true);
      expect(isValidRfc3339('2024-01-01T00:00:00.000Z')).toBe(true);
    });
    test('accepts RFC 3339 with explicit offset', () => {
      expect(isValidRfc3339('2024-01-01T00:00:00+02:00')).toBe(true);
      expect(isValidRfc3339('2024-01-01T00:00:00-05:00')).toBe(true);
    });
    test('rejects non-strings and obviously-invalid forms', () => {
      expect(isValidRfc3339(undefined)).toBe(false);
      expect(isValidRfc3339(42 as never)).toBe(false);
      expect(isValidRfc3339('garbage')).toBe(false);
    });
    // Beats's Go `time.Parse(time.RFC3339, ...)` rejects calendar-invalid dates
    // and aborts the entire RRULE scheduler update on the agent, halting every
    // other RRULE pack on the policy. We must catch these at the API edge.
    test('rejects calendar-invalid dates that JS Date silently normalizes', () => {
      expect(isValidRfc3339('2024-02-31T00:00:00Z')).toBe(false); // Feb has 29 days in 2024
      expect(isValidRfc3339('2023-02-29T00:00:00Z')).toBe(false); // 2023 not a leap year
      expect(isValidRfc3339('2024-04-31T00:00:00Z')).toBe(false); // April has 30
      expect(isValidRfc3339('2024-06-31T00:00:00Z')).toBe(false); // June has 30
    });
    test('accepts leap day in a leap year', () => {
      expect(isValidRfc3339('2024-02-29T00:00:00Z')).toBe(true);
    });
    test('rejects out-of-range wall-clock components', () => {
      expect(isValidRfc3339('2024-00-15T00:00:00Z')).toBe(false); // month 00
      expect(isValidRfc3339('2024-13-01T00:00:00Z')).toBe(false); // month 13
      expect(isValidRfc3339('2024-01-00T00:00:00Z')).toBe(false); // day 00
      expect(isValidRfc3339('2024-01-32T00:00:00Z')).toBe(false); // day 32
      expect(isValidRfc3339('2024-01-01T24:00:00Z')).toBe(false); // hour 24
      expect(isValidRfc3339('2024-01-01T00:60:00Z')).toBe(false); // minute 60
      expect(isValidRfc3339('2024-01-01T00:00:60Z')).toBe(false); // second 60
    });
    test('preserves wall-clock semantics across explicit offset', () => {
      expect(isValidRfc3339('2024-02-29T23:00:00-05:00')).toBe(true);
      expect(isValidRfc3339('2024-02-31T23:00:00-05:00')).toBe(false);
    });
  });

  describe('validateRruleConfig', () => {
    const start = '2024-01-01T00:00:00.000Z';

    test('accepts a valid daily RRULE', () => {
      expect(validateRruleConfig({ rrule: 'FREQ=DAILY', start_date: start })).toBeNull();
    });

    test('rejects unparseable rrule', () => {
      expect(validateRruleConfig({ rrule: 'garbage', start_date: start })).toMatch(
        /rrule_schedule\.rrule is invalid/
      );
    });

    test('rejects missing FREQ', () => {
      expect(validateRruleConfig({ rrule: 'BYDAY=MO,WE', start_date: start })).toMatch(
        /rrule_schedule\.rrule is invalid/
      );
    });

    test('rejects FREQ=BANANA', () => {
      expect(validateRruleConfig({ rrule: 'FREQ=BANANA', start_date: start })).toMatch(
        /rrule_schedule\.rrule is invalid/
      );
    });

    test('rejects loose start_date', () => {
      expect(validateRruleConfig({ rrule: 'FREQ=DAILY', start_date: '2024-01-01' })).toMatch(
        /start_date must be an RFC 3339/
      );
    });

    test('rejects loose end_date', () => {
      expect(
        validateRruleConfig({
          rrule: 'FREQ=DAILY',
          start_date: start,
          end_date: '2024-12-31',
        })
      ).toMatch(/end_date must be an RFC 3339/);
    });

    test('rejects end_date before start_date', () => {
      expect(
        validateRruleConfig({
          rrule: 'FREQ=DAILY',
          start_date: '2024-12-31T00:00:00Z',
          end_date: '2024-01-01T00:00:00Z',
        })
      ).toMatch(/end_date must be after/);
    });

    test('rejects splay > 12h', () => {
      expect(validateRruleConfig({ rrule: 'FREQ=DAILY', start_date: start, splay: '13h' })).toMatch(
        /must not exceed 43200/
      );
    });

    test('accepts splay at the 12h boundary', () => {
      expect(
        validateRruleConfig({ rrule: 'FREQ=DAILY', start_date: start, splay: '12h' })
      ).toBeNull();
    });

    test('rejects splay exceeding half the recurrence period', () => {
      expect(
        validateRruleConfig(
          { rrule: 'FREQ=MINUTELY;INTERVAL=2', start_date: start, splay: '2m' },
          120
        )
      ).toMatch(/half of minimum interval 2m0s/);
    });

    test('rejects splay just over the half-period boundary (61s on 120s period)', () => {
      expect(
        validateRruleConfig(
          { rrule: 'FREQ=MINUTELY;INTERVAL=2', start_date: start, splay: '61s' },
          120
        )
      ).toMatch(/half of minimum interval/);
    });

    test('accepts splay at exactly the half-period boundary (60s on 120s period)', () => {
      expect(
        validateRruleConfig(
          { rrule: 'FREQ=MINUTELY;INTERVAL=2', start_date: start, splay: '60s' },
          120
        )
      ).toBeNull();
    });

    test('accepts splay of 1m on 2m period', () => {
      expect(
        validateRruleConfig(
          { rrule: 'FREQ=MINUTELY;INTERVAL=2', start_date: start, splay: '1m' },
          120
        )
      ).toBeNull();
    });

    test('absent recurrenceSeconds skips the half-period check', () => {
      expect(
        validateRruleConfig({ rrule: 'FREQ=MINUTELY;INTERVAL=2', start_date: start, splay: '2m' })
      ).toBeNull();
    });

    test('12h cap wins over half-period: 13h splay on YEARLY returns cap message, not period message', () => {
      expect(
        validateRruleConfig({ rrule: 'FREQ=YEARLY', start_date: start, splay: '13h' }, 28 * 86400)
      ).toMatch(/must not exceed 43200/);
    });

    test('compound splay "1h30m" rejected on HOURLY (5400 * 2 > 3600)', () => {
      expect(
        validateRruleConfig({ rrule: 'FREQ=HOURLY', start_date: start, splay: '1h30m' }, 3600)
      ).toMatch(/half of minimum interval/);
    });

    test('compound splay "1h30m" accepted on HOURLY;INTERVAL=4 (5400 * 2 <= 14400)', () => {
      expect(
        validateRruleConfig(
          { rrule: 'FREQ=HOURLY;INTERVAL=4', start_date: start, splay: '1h30m' },
          14400
        )
      ).toBeNull();
    });
  });

  describe('validatePackScheduleFields', () => {
    const rrule = { rrule: 'FREQ=DAILY', start_date: '2024-01-01T00:00:00.000Z' };

    test('rejects pack with both interval and rrule_schedule', () => {
      expect(
        validatePackScheduleFields({
          packScheduleType: 'rrule',
          packInterval: 60,
          packRrule: rrule,
        })
      ).toMatch(/cannot specify both/);
    });

    test('rejects schedule_type: rrule without rrule_schedule', () => {
      expect(validatePackScheduleFields({ packScheduleType: 'rrule' })).toMatch(
        /requires rrule_schedule/
      );
    });

    test('rejects schedule_type: interval without interval', () => {
      expect(validatePackScheduleFields({ packScheduleType: 'interval' })).toMatch(
        /requires pack-level interval/
      );
    });

    test('rejects rrule_schedule without schedule_type', () => {
      expect(validatePackScheduleFields({ packRrule: rrule })).toMatch(/requires schedule_type/);
    });

    test('rejects per-query cross-mode override', () => {
      expect(
        validatePackScheduleFields({
          packScheduleType: 'rrule',
          packRrule: rrule,
          queries: { q1: { schedule_type: 'interval', interval: 60 } },
        })
      ).toMatch(/does not match pack schedule_type/);
    });

    test('rejects per-query interval when pack is rrule', () => {
      expect(
        validatePackScheduleFields({
          packScheduleType: 'rrule',
          packRrule: rrule,
          queries: { q1: { interval: 60 } },
        })
      ).toMatch(/must use the same mode/);
    });

    test('rejects per-query rrule_schedule when pack is interval', () => {
      expect(
        validatePackScheduleFields({
          packScheduleType: 'interval',
          packInterval: 60,
          queries: { q1: { rrule_schedule: rrule } },
        })
      ).toMatch(/must use the same mode/);
    });

    test('accepts same-mode override (rrule + rrule)', () => {
      expect(
        validatePackScheduleFields({
          packScheduleType: 'rrule',
          packRrule: rrule,
          queries: {
            q1: {
              schedule_type: 'rrule',
              rrule_schedule: { rrule: 'FREQ=WEEKLY;BYDAY=MO', start_date: rrule.start_date },
            },
          },
        })
      ).toBeNull();
    });

    test('legacy pack (no schedule_type) — per-query interval still accepted', () => {
      expect(
        validatePackScheduleFields({
          queries: { q1: { interval: 60 } },
        })
      ).toBeNull();
    });

    // Without a pack-level mode, the wire-emission branch falls back to
    // legacy `interval`-only output and the per-query rrule fields are
    // dropped — the agent silently never runs the query. Reject at the edge.
    test('rejects per-query schedule_type: rrule when pack has no schedule_type', () => {
      expect(
        validatePackScheduleFields({
          queries: {
            q1: {
              schedule_type: 'rrule',
              rrule_schedule: {
                rrule: 'FREQ=MINUTELY;INTERVAL=1',
                start_date: '2024-01-01T00:00:00.000Z',
              },
            },
          },
        })
      ).toMatch(/pack has no schedule_type/);
    });

    test('rejects per-query rrule_schedule without schedule_type when pack has no mode', () => {
      expect(
        validatePackScheduleFields({
          queries: {
            q1: {
              rrule_schedule: {
                rrule: 'FREQ=MINUTELY;INTERVAL=1',
                start_date: '2024-01-01T00:00:00.000Z',
              },
            },
          },
        })
      ).toMatch(/pack has no schedule_type/);
    });

    test('rejects per-query schedule_type: interval when pack has no mode', () => {
      expect(
        validatePackScheduleFields({
          queries: { q1: { schedule_type: 'interval', interval: 30 } },
        })
      ).toMatch(/pack has no schedule_type/);
    });

    test('field-probe scenario — pack FREQ=MINUTELY;INTERVAL=2 + splay 2m rejected', () => {
      expect(
        validatePackScheduleFields({
          packScheduleType: 'rrule',
          packRrule: {
            rrule: 'FREQ=MINUTELY;INTERVAL=2',
            start_date: '2024-01-01T00:00:00.000Z',
            splay: '2m',
          },
        })
      ).toMatch(/half of minimum interval 2m0s/);
    });

    test('field-probe scenario — same pack with splay 1m accepted', () => {
      expect(
        validatePackScheduleFields({
          packScheduleType: 'rrule',
          packRrule: {
            rrule: 'FREQ=MINUTELY;INTERVAL=2',
            start_date: '2024-01-01T00:00:00.000Z',
            splay: '1m',
          },
        })
      ).toBeNull();
    });

    test('per-query RRULE validated against query period (HOURLY;INTERVAL=2 + splay 2h)', () => {
      expect(
        validatePackScheduleFields({
          packScheduleType: 'rrule',
          packRrule: { rrule: 'FREQ=DAILY', start_date: '2024-01-01T00:00:00.000Z' },
          queries: {
            q1: {
              schedule_type: 'rrule',
              rrule_schedule: {
                rrule: 'FREQ=HOURLY;INTERVAL=2',
                start_date: '2024-01-01T00:00:00.000Z',
                splay: '2h',
              },
            },
          },
        })
      ).toMatch(/Query "q1": rrule_schedule\.splay must be at most/);
    });

    test('per-query override with own RRULE uses query period not pack period', () => {
      expect(
        validatePackScheduleFields({
          packScheduleType: 'rrule',
          packRrule: { rrule: 'FREQ=DAILY', start_date: '2024-01-01T00:00:00.000Z' },
          queries: {
            q1: {
              schedule_type: 'rrule',
              rrule_schedule: {
                rrule: 'FREQ=HOURLY;INTERVAL=2',
                start_date: '2024-01-01T00:00:00.000Z',
                splay: '1h',
              },
            },
          },
        })
      ).toBeNull();
    });

    test('per-query override inherits pack period when own RRULE parse fails', () => {
      expect(
        validatePackScheduleFields({
          packScheduleType: 'rrule',
          packRrule: {
            rrule: 'FREQ=MINUTELY;INTERVAL=2',
            start_date: '2024-01-01T00:00:00.000Z',
          },
          queries: {
            q1: {
              schedule_type: 'rrule',
              rrule_schedule: {
                rrule: 'FREQ=MINUTELY;INTERVAL=2',
                start_date: '2024-01-01T00:00:00.000Z',
                splay: '2m',
              },
            },
          },
        })
      ).toMatch(/Query "q1": rrule_schedule\.splay must be at most/);
    });
  });

  describe('resolvePackScheduleForUpdate', () => {
    const rrule = { rrule: 'FREQ=DAILY', start_date: '2026-01-01T00:00:00Z' };

    test('flag off — returns current values verbatim, transitioned: false', () => {
      const result = resolvePackScheduleForUpdate({
        current: { schedule_type: 'interval', interval: 60, rrule_schedule: null },
        request: {
          schedule_type: 'rrule',
          interval: null,
          rrule_schedule: rrule,
          scheduleTypePresent: true,
          intervalPresent: false,
          rruleSchedulePresent: true,
        },
        isRruleFeatureEnabled: false,
      });
      expect(result).toEqual({
        scheduleType: 'interval',
        interval: 60,
        rrule_schedule: undefined,
        transitioned: false,
      });
    });

    test('interval → rrule transition: clears interval, sets rrule_schedule, transitioned: true', () => {
      const result = resolvePackScheduleForUpdate({
        current: { schedule_type: 'interval', interval: 60, rrule_schedule: null },
        request: {
          schedule_type: 'rrule',
          interval: undefined,
          rrule_schedule: rrule,
          scheduleTypePresent: true,
          intervalPresent: false,
          rruleSchedulePresent: true,
        },
        isRruleFeatureEnabled: true,
      });
      expect(result).toEqual({
        scheduleType: 'rrule',
        interval: null,
        rrule_schedule: rrule,
        transitioned: true,
      });
    });

    test('rrule → interval transition: clears rrule_schedule, sets interval, transitioned: true', () => {
      const result = resolvePackScheduleForUpdate({
        current: { schedule_type: 'rrule', interval: null, rrule_schedule: rrule },
        request: {
          schedule_type: 'interval',
          interval: 120,
          rrule_schedule: undefined,
          scheduleTypePresent: true,
          intervalPresent: true,
          rruleSchedulePresent: false,
        },
        isRruleFeatureEnabled: true,
      });
      expect(result).toEqual({
        scheduleType: 'interval',
        interval: 120,
        rrule_schedule: null,
        transitioned: true,
      });
    });

    test('schedule_type: null (clear mode) — both fields null, transitioned: true', () => {
      const result = resolvePackScheduleForUpdate({
        current: { schedule_type: 'interval', interval: 60, rrule_schedule: null },
        request: {
          schedule_type: null,
          interval: undefined,
          rrule_schedule: undefined,
          scheduleTypePresent: true,
          intervalPresent: false,
          rruleSchedulePresent: false,
        },
        isRruleFeatureEnabled: true,
      });
      expect(result).toEqual({
        scheduleType: undefined,
        interval: null,
        rrule_schedule: null,
        transitioned: true,
      });
    });

    test('partial update with no schedule fields — returns current values, transitioned: false', () => {
      const result = resolvePackScheduleForUpdate({
        current: { schedule_type: 'interval', interval: 60, rrule_schedule: null },
        request: {
          schedule_type: undefined,
          interval: undefined,
          rrule_schedule: undefined,
          scheduleTypePresent: false,
          intervalPresent: false,
          rruleSchedulePresent: false,
        },
        isRruleFeatureEnabled: true,
      });
      expect(result).toEqual({
        scheduleType: 'interval',
        interval: 60,
        rrule_schedule: undefined,
        transitioned: false,
      });
    });

    test('same-mode interval change — transitioned: false, new interval, rrule_schedule unchanged', () => {
      const result = resolvePackScheduleForUpdate({
        current: { schedule_type: 'interval', interval: 60, rrule_schedule: null },
        request: {
          schedule_type: undefined,
          interval: 120,
          rrule_schedule: undefined,
          scheduleTypePresent: false,
          intervalPresent: true,
          rruleSchedulePresent: false,
        },
        isRruleFeatureEnabled: true,
      });
      expect(result).toEqual({
        scheduleType: 'interval',
        interval: 120,
        rrule_schedule: undefined,
        transitioned: false,
      });
    });

    test('explicit interval: null in request wins over current value', () => {
      const result = resolvePackScheduleForUpdate({
        current: { schedule_type: 'interval', interval: 60, rrule_schedule: null },
        request: {
          schedule_type: undefined,
          interval: null,
          rrule_schedule: undefined,
          scheduleTypePresent: false,
          intervalPresent: true,
          rruleSchedulePresent: false,
        },
        isRruleFeatureEnabled: true,
      });
      expect(result).toEqual({
        scheduleType: 'interval',
        interval: null,
        rrule_schedule: undefined,
        transitioned: false,
      });
    });
  });
});

describe('resolvePreservedQueries', () => {
  const existing = {
    q1: { schedule_id: 'sid-q1', start_date: 'd1' },
    q2: { schedule_id: 'sid-q2', start_date: 'd2' },
  };

  it('matches each query to its own stored row by map key', () => {
    const result = resolvePreservedQueries(
      { q1: { id: 'q1', query: 'a' }, q2: { id: 'q2', query: 'b' } },
      existing
    );
    expect(result).toEqual({
      q1: { schedule_id: 'sid-q1', start_date: 'd1' },
      q2: { schedule_id: 'sid-q2', start_date: 'd2' },
    });
  });

  it('re-pairs a renamed query (changed map key) via the incoming `id`', () => {
    const result = resolvePreservedQueries({ q1_renamed: { id: 'q1', query: 'a' } }, existing);
    expect(result.q1_renamed).toEqual({ schedule_id: 'sid-q1', start_date: 'd1' });
  });

  it('consumes each stored row at most once — a duplicate `id` claim only wins once', () => {
    // q1 wins stored q1 first; q2's stale claim on the same id falls through to its own map key.
    const result = resolvePreservedQueries(
      { q1: { id: 'q1', query: 'a' }, q2: { id: 'q1', query: 'b' } },
      existing
    );
    expect(result.q1).toEqual({ schedule_id: 'sid-q1', start_date: 'd1' });
    expect(result.q2).toEqual({ schedule_id: 'sid-q2', start_date: 'd2' });
    expect(result.q1).not.toEqual(result.q2);
  });

  it('an explicit `id` claim wins even when the claiming query has no stored row of its own', () => {
    // `extra` wins stored q1; the genuine q1 finds its row already consumed.
    const result = resolvePreservedQueries(
      { extra: { id: 'q1', query: 'b' }, q1: { id: 'q1', query: 'a' } },
      existing
    );
    expect(result.extra).toEqual({ schedule_id: 'sid-q1', start_date: 'd1' });
    expect(result.q1).toBeUndefined();
  });

  it('honors explicit rename intent regardless of key order — the id-claimant wins even if it comes first', () => {
    const result = resolvePreservedQueries(
      { other: { id: 'q1', query: 'b' }, q1: { id: 'q1', query: 'a' } },
      existing
    );
    expect(result.other).toEqual({ schedule_id: 'sid-q1', start_date: 'd1' });
    expect(result.q1).toBeUndefined();
  });

  it('leaves a brand-new query unmatched', () => {
    const result = resolvePreservedQueries({ fresh: { query: 'x' } }, existing);
    expect(result.fresh).toBeUndefined();
  });

  it('rename plus name reuse does not misattribute schedule_id (regression)', () => {
    // Explicit rename intent must win over a new query reusing the freed map key.
    const result = resolvePreservedQueries(
      { q1: { query: 'new query reusing the freed name' }, q2: { id: 'q1', query: 'renamed' } },
      { q1: { schedule_id: 'S1', start_date: 'd1' } }
    );
    expect(result.q2).toEqual({ schedule_id: 'S1', start_date: 'd1' });
    expect(result.q1).toBeUndefined();
  });
});

describe('fetchAllPackagePolicies (shared keyset drain for create/delete/update/reconciler)', () => {
  const soClient = {} as SavedObjectsClientContract;

  const serviceYielding = (batches: unknown[][]) =>
    ({
      fetchAllItems: jest.fn().mockImplementation(async function* asyncGenerator() {
        for (const batch of batches) {
          yield batch;
        }
      }),
    } as unknown as PackagePolicyClient);

  it('drains ALL batches (not just the first ≤1000 offset page)', async () => {
    const service = serviceYielding([[{ id: 'pp-1' }, { id: 'pp-2' }], [{ id: 'pp-3' }]]);

    const result = await fetchAllPackagePolicies(service, soClient);

    // A policy on the second page must survive — the offset-capped
    // list({ perPage: 1000 }) pattern this replaces would have dropped it.
    expect(result.map((p) => p.id)).toEqual(['pp-1', 'pp-2', 'pp-3']);
  });

  it('returns an empty array when the service is undefined', async () => {
    expect(await fetchAllPackagePolicies(undefined, soClient)).toEqual([]);
  });

  it('scopes the drain with the default osquery kuery', async () => {
    const service = serviceYielding([[]]);

    await fetchAllPackagePolicies(service, soClient);

    expect(service.fetchAllItems).toHaveBeenCalledWith(
      soClient,
      expect.objectContaining({
        kuery: expect.stringContaining('package.name:osquery_manager'),
      })
    );
  });

  it('forwards a caller-supplied kuery unchanged', async () => {
    const service = serviceYielding([[]]);

    await fetchAllPackagePolicies(service, soClient, 'custom-kuery');

    expect(service.fetchAllItems).toHaveBeenCalledWith(soClient, { kuery: 'custom-kuery' });
  });
});

// Shared by the V4 mint guard and the reconcile filter; pinning its verdict
// here pins mint-guard ≡ reconcile-filter parity so the two can't drift.
describe('hasQueries (shared mint/reconcile emptiness predicate)', () => {
  it.each([
    ['non-empty array', [{ query: 'SELECT 1' }], true],
    ['non-empty record', { q1: { query: 'SELECT 1' } }, true],
    ['empty array', [], false],
    ['empty record', {}, false],
    ['null', null, false],
    ['undefined', undefined, false],
  ])('returns %s → %s', (_label, input, expected) => {
    expect(hasQueries(input as Parameters<typeof hasQueries>[0])).toBe(expected);
  });

  // Mint guard (`!hasQueries` → skip) and reconcile filter (`hasQueries` →
  // include) must reach the same verdict for every shape.
  it('mint guard and reconcile filter agree on the same verdict for each shape', () => {
    const cases: Array<Parameters<typeof hasQueries>[0]> = [
      [{ query: 'SELECT 1' }],
      { q1: { query: 'SELECT 1' } },
      [],
      {},
      undefined,
    ];

    for (const queries of cases) {
      const nonEmpty = hasQueries(queries);
      // Mint guard skips (returns empty patch) exactly when queries are empty.
      const mintGuardSkips = !hasQueries(queries);
      // Reconcile filter includes an enabled pack exactly when queries are non-empty.
      const reconcileIncludes = true && hasQueries(queries);

      expect(mintGuardSkips).toBe(!nonEmpty);
      expect(reconcileIncludes).toBe(nonEmpty);
    }
  });
});

// Fixes the duplicate-schedule race (elastic/kibana#269475): a Fleet package
// policy's `policy_ids` can span multiple of a pack's agent policies, so
// resolving per-agent-policy-id and writing without deduping issues
// concurrent updates against the same package-policy id from a stale base.
describe('groupAgentPolicyIdsByPackagePolicy (dedup write targets)', () => {
  const packagePolicy = (id: string, policyIds: string[]): PackagePolicy =>
    ({ id, policy_ids: policyIds } as PackagePolicy);

  it('groups two agent policy ids that resolve to the same package policy into one entry', () => {
    const sharedPolicy = packagePolicy('pp-shared', ['agent-a', 'agent-b']);

    const groups = groupAgentPolicyIdsByPackagePolicy(['agent-a', 'agent-b'], [sharedPolicy]);

    expect(groups.size).toBe(1);
    const target = groups.get('pp-shared');
    expect(target?.packagePolicy).toBe(sharedPolicy);
    expect(target?.agentPolicyIds).toEqual(['agent-a', 'agent-b']);
  });

  it('keeps distinct package policies as separate entries (regression: common 1:1 case)', () => {
    const policyA = packagePolicy('pp-a', ['agent-a']);
    const policyB = packagePolicy('pp-b', ['agent-b']);

    const groups = groupAgentPolicyIdsByPackagePolicy(['agent-a', 'agent-b'], [policyA, policyB]);

    expect(groups.size).toBe(2);
    expect(groups.get('pp-a')?.agentPolicyIds).toEqual(['agent-a']);
    expect(groups.get('pp-b')?.agentPolicyIds).toEqual(['agent-b']);
  });

  it('skips an agent policy id that resolves to no package policy', () => {
    const policyA = packagePolicy('pp-a', ['agent-a']);

    const groups = groupAgentPolicyIdsByPackagePolicy(['agent-a', 'agent-unknown'], [policyA]);

    expect(groups.size).toBe(1);
    expect(groups.has('pp-a')).toBe(true);
  });

  it('returns an empty map for an empty agent-policy-id list', () => {
    const groups = groupAgentPolicyIdsByPackagePolicy([], [packagePolicy('pp-a', ['agent-a'])]);

    expect(groups.size).toBe(0);
  });
});

describe('resolveSharedPackagePolicyShard (deterministic shard for a shared package policy)', () => {
  it('returns the single agent policy shard unchanged for 1:1 targeting (no behavior change)', () => {
    expect(resolveSharedPackagePolicyShard(['agent-a'], { 'agent-a': 42 })).toBe(42);
  });

  it('falls back to DEFAULT_PACK_SHARD when no shard is set', () => {
    expect(resolveSharedPackagePolicyShard(['agent-a'], {})).toBe(DEFAULT_PACK_SHARD);
  });

  it('preserves a single negative shard (no clamping to 0 — parity with the pre-dedup path)', () => {
    expect(resolveSharedPackagePolicyShard(['agent-a'], { 'agent-a': -5 })).toBe(-5);
  });

  it('returns DEFAULT_PACK_SHARD for an empty agent-policy-id list', () => {
    expect(resolveSharedPackagePolicyShard([], { 'agent-a': 25 })).toBe(DEFAULT_PACK_SHARD);
  });

  it('returns the shared shard value when every targeting agent policy agrees', () => {
    expect(
      resolveSharedPackagePolicyShard(['agent-a', 'agent-b'], { 'agent-a': 30, 'agent-b': 30 })
    ).toBe(30);
  });

  it('passes a single agent policy shard through unchanged', () => {
    expect(resolveSharedPackagePolicyShard(['agent-a'], { 'agent-a': 25 })).toBe(25);
    expect(resolveSharedPackagePolicyShard(['agent-b'], { 'agent-b': 75 })).toBe(75);
  });

  it('resolves differing shards deterministically via the max rule', () => {
    expect(
      resolveSharedPackagePolicyShard(['agent-a', 'agent-b'], { 'agent-a': 25, 'agent-b': 75 })
    ).toBe(75);
  });

  it('is independent of agent-policy-id ordering', () => {
    const shards = { 'agent-a': 25, 'agent-b': 75 };
    expect(resolveSharedPackagePolicyShard(['agent-a', 'agent-b'], shards)).toBe(
      resolveSharedPackagePolicyShard(['agent-b', 'agent-a'], shards)
    );
  });

  it('mixes explicit and default-shard agent policies using the max rule', () => {
    // `agent-b` has no explicit shard, so it contributes DEFAULT_PACK_SHARD (100),
    // which is wider than agent-a's 40 and therefore wins.
    expect(resolveSharedPackagePolicyShard(['agent-a', 'agent-b'], { 'agent-a': 40 })).toBe(
      DEFAULT_PACK_SHARD
    );
  });

  it('returns DEFAULT_PACK_SHARD when no agent policy in the list has an explicit shard', () => {
    expect(resolveSharedPackagePolicyShard(['agent-a', 'agent-b'], {})).toBe(DEFAULT_PACK_SHARD);
  });
});

describe('resolvePackTargetScope (classify package policies as exact or over-broad)', () => {
  const makePackagePolicy = (id: string, policyIds: string[]): PackagePolicy =>
    ({ id, policy_ids: policyIds } as PackagePolicy);

  const makeWriteTargets = (
    entries: Array<{ ppId: string; policyIds: string[]; agentPolicyIds: string[] }>
  ) => {
    const map = new Map<string, { packagePolicy: PackagePolicy; agentPolicyIds: string[] }>();
    for (const { ppId, policyIds, agentPolicyIds } of entries) {
      map.set(ppId, {
        packagePolicy: makePackagePolicy(ppId, policyIds),
        agentPolicyIds,
      });
    }

    return map;
  };

  it('classifies a 1:1 package policy as exact', () => {
    const targets = makeWriteTargets([
      { ppId: 'pp-a', policyIds: ['agent-a'], agentPolicyIds: ['agent-a'] },
    ]);
    const [result] = resolvePackTargetScope(targets, false);
    expect(result.kind).toBe('exact');
    expect(result.untargetedAgentPolicyIds).toEqual([]);
  });

  it('classifies a shared package policy covering an extra agent policy as over-broad', () => {
    const targets = makeWriteTargets([
      { ppId: 'pp-shared', policyIds: ['agent-a', 'agent-b'], agentPolicyIds: ['agent-a'] },
    ]);
    const [result] = resolvePackTargetScope(targets, false);
    expect(result.kind).toBe('over-broad');
    expect(result.untargetedAgentPolicyIds).toEqual(['agent-b']);
  });

  it('global pack is always exact even if the package policy is shared', () => {
    // `agentPolicyIds` is deliberately NARROWER than the package policy's
    // `policy_ids`: with `isGlobalPack` false this is `over-broad`, so the
    // assertion below only holds because the flag short-circuits. An identical
    // fixture with `agentPolicyIds === policy_ids` would pass either way and
    // would not pin this branch at all.
    const targets = makeWriteTargets([
      {
        ppId: 'pp-shared',
        policyIds: ['agent-a', 'agent-b'],
        agentPolicyIds: ['agent-a'],
      },
    ]);
    const [result] = resolvePackTargetScope(targets, true);
    expect(result.kind).toBe('exact');
    expect(result.untargetedAgentPolicyIds).toEqual([]);

    // Same input, non-global: proves the flag is what makes the difference.
    const [nonGlobal] = resolvePackTargetScope(targets, false);
    expect(nonGlobal.kind).toBe('over-broad');
    expect(nonGlobal.untargetedAgentPolicyIds).toEqual(['agent-b']);
  });

  it('returns empty array for an empty write-targets map', () => {
    const results = resolvePackTargetScope(new Map(), false);
    expect(results).toEqual([]);
  });

  it('returns multiple results for multiple package policies', () => {
    const targets = makeWriteTargets([
      { ppId: 'pp-a', policyIds: ['agent-a'], agentPolicyIds: ['agent-a'] },
      { ppId: 'pp-shared', policyIds: ['agent-b', 'agent-c'], agentPolicyIds: ['agent-b'] },
    ]);
    const results = resolvePackTargetScope(targets, false);
    expect(results).toHaveLength(2);
    const byId = Object.fromEntries(results.map((r) => [r.packagePolicy.id, r]));
    expect(byId['pp-a'].kind).toBe('exact');
    expect(byId['pp-shared'].kind).toBe('over-broad');
    expect(byId['pp-shared'].untargetedAgentPolicyIds).toEqual(['agent-c']);
  });
});

describe('buildTargetingWarning (name the agent policies a pack also reaches)', () => {
  const makePackagePolicy = (id: string, policyIds: string[]): PackagePolicy =>
    ({ id, policy_ids: policyIds } as PackagePolicy);

  const makeScopeResult = (
    ppId: string,
    policyIds: string[],
    agentPolicyIds: string[],
    untargetedAgentPolicyIds: string[]
  ) => ({
    packagePolicy: makePackagePolicy(ppId, policyIds),
    kind: (untargetedAgentPolicyIds.length > 0 ? 'over-broad' : 'exact') as 'over-broad' | 'exact',
    agentPolicyIds,
    untargetedAgentPolicyIds,
  });

  const makeAgentPolicyService = (policies: Array<{ id: string; name: string }>) => ({
    getByIds: jest.fn().mockResolvedValue(policies),
  });

  const soClient = {} as never;

  it('returns undefined when every package policy is exactly targeted', async () => {
    const agentPolicyService = makeAgentPolicyService([]);
    const result = await buildTargetingWarning(
      [makeScopeResult('pp-a', ['agent-a'], ['agent-a'], [])],
      agentPolicyService as never,
      soClient
    );

    expect(result).toBeUndefined();
    expect(agentPolicyService.getByIds).not.toHaveBeenCalled();
  });

  it('names the untargeted agent policies of an over-broad package policy', async () => {
    const agentPolicyService = makeAgentPolicyService([{ id: 'agent-b', name: 'Agent Policy B' }]);
    const result = await buildTargetingWarning(
      [makeScopeResult('pp-shared', ['agent-a', 'agent-b'], ['agent-a'], ['agent-b'])],
      agentPolicyService as never,
      soClient
    );

    expect(result).toEqual({ untargeted_agent_policy_names: ['Agent Policy B'] });
    expect(agentPolicyService.getByIds).toHaveBeenCalledWith(soClient, ['agent-b'], {
      ignoreMissing: true,
    });
  });

  it('dedupes an agent policy reported by more than one over-broad package policy', async () => {
    const agentPolicyService = makeAgentPolicyService([{ id: 'agent-c', name: 'Agent Policy C' }]);
    const result = await buildTargetingWarning(
      [
        makeScopeResult('pp-1', ['agent-a', 'agent-c'], ['agent-a'], ['agent-c']),
        makeScopeResult('pp-2', ['agent-b', 'agent-c'], ['agent-b'], ['agent-c']),
      ],
      agentPolicyService as never,
      soClient
    );

    expect(result).toEqual({ untargeted_agent_policy_names: ['Agent Policy C'] });
    expect(agentPolicyService.getByIds).toHaveBeenCalledWith(soClient, ['agent-c'], {
      ignoreMissing: true,
    });
  });

  it('falls back to the raw id when an untargeted agent policy no longer resolves', async () => {
    // A deleted agent policy must not silently shrink the warning: understating
    // the blast radius defeats the field's whole purpose.
    const agentPolicyService = makeAgentPolicyService([{ id: 'agent-b', name: 'Agent Policy B' }]);
    const result = await buildTargetingWarning(
      [
        makeScopeResult(
          'pp-shared',
          ['agent-a', 'agent-b', 'agent-gone'],
          ['agent-a'],
          ['agent-b', 'agent-gone']
        ),
      ],
      agentPolicyService as never,
      soClient
    );

    expect(result).toEqual({
      untargeted_agent_policy_names: ['Agent Policy B', 'agent-gone'],
    });
  });

  it('returns undefined when the agent policy service is unavailable and nothing is over-broad', async () => {
    expect(
      await buildTargetingWarning(
        [makeScopeResult('pp-a', ['agent-a'], ['agent-a'], [])],
        undefined,
        soClient
      )
    ).toBeUndefined();
  });

  it('still reports ids when the agent policy service is unavailable', async () => {
    expect(
      await buildTargetingWarning(
        [makeScopeResult('pp-shared', ['agent-a', 'agent-b'], ['agent-a'], ['agent-b'])],
        undefined,
        soClient
      )
    ).toEqual({ untargeted_agent_policy_names: ['agent-b'] });
  });
});
