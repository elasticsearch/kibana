/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ObjectType } from '@kbn/config-schema';
import type {
  SavedObjectModelDataBackfillFn,
  SavedObjectsModelDataBackfillChange,
} from '@kbn/core-saved-objects-server';
import {
  packSavedObjectModelVersion3,
  packSavedObjectModelVersion4,
} from './saved_object_model_versions';

describe('Pack saved object model version 3 forward compatibility', () => {
  const forwardCompatibility = packSavedObjectModelVersion3.schemas?.forwardCompatibility;

  it('exposes a forwardCompatibility schema', () => {
    expect(forwardCompatibility).toBeDefined();
  });

  it('accepts a V3 pack SO with `schedule_type: "rrule"` + `rrule_schedule`', () => {
    const v3Doc = {
      name: 'rrule-pack',
      description: 'pack scheduled by RRULE',
      enabled: true,
      created_at: '2026-05-01T00:00:00.000Z',
      created_by: 'elastic',
      updated_at: '2026-05-01T00:00:00.000Z',
      updated_by: 'elastic',
      schedule_type: 'rrule',
      rrule_schedule: {
        rrule: 'FREQ=DAILY',
        start_date: '2026-05-01T00:00:00.000Z',
      },
      queries: [
        {
          id: 'q1',
          query: 'SELECT * FROM users;',
        },
      ],
    };

    expect(() => (forwardCompatibility as ObjectType).validate(v3Doc)).not.toThrow();
  });

  it('accepts a V3 pack SO with `schedule_type: "interval"` + pack-level `interval`', () => {
    const v3Doc = {
      name: 'interval-pack',
      enabled: true,
      created_at: '2026-05-01T00:00:00.000Z',
      created_by: 'elastic',
      updated_at: '2026-05-01T00:00:00.000Z',
      updated_by: 'elastic',
      schedule_type: 'interval',
      interval: 3600,
      queries: [],
    };

    expect(() => (forwardCompatibility as ObjectType).validate(v3Doc)).not.toThrow();
  });

  it('accepts a pack SO with per-query rrule override (no per-query interval)', () => {
    const perQueryRruleDoc = {
      name: 'per-query-rrule-pack',
      enabled: true,
      created_at: '2026-05-01T00:00:00.000Z',
      created_by: 'elastic',
      updated_at: '2026-05-01T00:00:00.000Z',
      updated_by: 'elastic',
      queries: [
        {
          id: 'q1',
          query: 'SELECT * FROM users;',
          schedule_type: 'rrule',
          rrule_schedule: {
            rrule: 'FREQ=DAILY',
            start_date: '2026-05-01T00:00:00.000Z',
          },
        },
      ],
    };

    expect(() => (forwardCompatibility as ObjectType).validate(perQueryRruleDoc)).not.toThrow();
  });

  it('accepts a legacy pack SO without `schedule_type`', () => {
    const legacyDoc = {
      name: 'legacy-pack',
      enabled: true,
      created_at: '2026-05-01T00:00:00.000Z',
      created_by: 'elastic',
      updated_at: '2026-05-01T00:00:00.000Z',
      updated_by: 'elastic',
      queries: [
        {
          id: 'q1',
          query: 'SELECT * FROM users;',
          interval: 60,
        },
      ],
    };

    expect(() => (forwardCompatibility as ObjectType).validate(legacyDoc)).not.toThrow();
  });

  it('accepts `null` for `schedule_type` / `interval` / `rrule_schedule` (mode-transition clear)', () => {
    const transitioningDoc = {
      name: 'transitioning-pack',
      enabled: true,
      created_at: '2026-05-01T00:00:00.000Z',
      created_by: 'elastic',
      updated_at: '2026-05-01T00:00:00.000Z',
      updated_by: 'elastic',
      schedule_type: null,
      interval: null,
      rrule_schedule: null,
      queries: [],
    };

    expect(() => (forwardCompatibility as ObjectType).validate(transitioningDoc)).not.toThrow();
  });

  // Phase 9 / D29–D32 introduces V4 fields (pack-level osquery `version` +
  // `snapshot` boolean + per-query `enabled` flag). A pack SO migrated forward
  // to V4 in a future Kibana must still load through the V3 forward-compat
  // schema on this Kibana. The forward-compat schema uses `unknowns: 'ignore'`
  // so unrecognized future fields MUST NOT cause it to throw — they just get
  // dropped (the V4 Kibana will see them on subsequent loads).
  //
  // Note: V3 already declares a `version` field on the pack root as
  // `schema.number()` (prebuilt-pack version). The V4 "min osquery version"
  // field uses a different name (kept as `min_osquery_version` in this test)
  // to avoid the type collision; the actual V4 migration is free to pick its
  // own naming when it lands.
  it('accepts a synthetic V4 pack SO with fictitious future root fields', () => {
    const syntheticV4Doc = {
      name: 'forward-compat-pack',
      description: 'pretends to come from a future V4 migration',
      enabled: true,
      created_at: '2026-05-01T00:00:00.000Z',
      created_by: 'elastic',
      updated_at: '2026-05-01T00:00:00.000Z',
      updated_by: 'elastic',
      schedule_type: 'rrule',
      rrule_schedule: {
        rrule: 'FREQ=DAILY',
        start_date: '2026-05-01T00:00:00.000Z',
      },
      min_osquery_version: '5.10.0',
      snapshot: true,
      queries: [
        {
          id: 'q1',
          query: 'SELECT * FROM users;',
          enabled: true,
        },
      ],
    };

    expect(() => (forwardCompatibility as ObjectType).validate(syntheticV4Doc)).not.toThrow();
  });

  it('strips the V4 per-query `schedule_id` on rollback read, keeping every other field', () => {
    const v4StampedDoc = {
      name: 'test-pack-1',
      description: 'A test pack',
      enabled: true,
      created_at: '2024-01-01T00:00:00.000Z',
      created_by: 'elastic',
      updated_at: '2024-01-01T00:00:00.000Z',
      updated_by: 'elastic',
      queries: [
        {
          id: 'query1',
          query: 'select * from processes;',
          interval: 3600,
          timeout: 300,
          schedule_id: '310db1f6-e680-4471-982a-dfe304b6cf5a',
        },
      ],
    };

    const out = (forwardCompatibility as ObjectType).validate(v4StampedDoc) as {
      queries: Array<Record<string, unknown>>;
    };

    expect(out.queries[0]).not.toHaveProperty('schedule_id');
    // The rest of the query round-trips untouched.
    expect(out.queries[0]).toMatchObject({
      id: 'query1',
      query: 'select * from processes;',
      interval: 3600,
      timeout: 300,
    });
  });

  it('preserves per-query rrule overrides on rollback read (only schedule_id is shed)', () => {
    const v4RruleDoc = {
      name: 'rrule-pack',
      enabled: true,
      queries: [
        {
          id: 'q1',
          query: 'select * from uptime;',
          schedule_type: 'rrule',
          rrule_schedule: { rrule: 'FREQ=DAILY', start_date: '2026-05-01T00:00:00.000Z' },
          schedule_id: '00000000-0000-4000-8000-000000000000',
        },
      ],
    };

    const out = (forwardCompatibility as ObjectType).validate(v4RruleDoc) as {
      queries: Array<Record<string, unknown>>;
    };

    expect(out.queries[0]).not.toHaveProperty('schedule_id');
    expect(out.queries[0]).toMatchObject({
      schedule_type: 'rrule',
      rrule_schedule: { rrule: 'FREQ=DAILY', start_date: '2026-05-01T00:00:00.000Z' },
    });
  });
});

describe('Pack saved object model version 4 — schedule_id backfill (security-team#17841)', () => {
  // Extract the `data_backfill` change's backfillFn from the model version so
  // we exercise the real migration logic, not a re-implementation.
  const dataBackfillChange = packSavedObjectModelVersion4.changes.find(
    (change): change is SavedObjectsModelDataBackfillChange => change.type === 'data_backfill'
  );
  const backfillFn = dataBackfillChange?.backfillFn as SavedObjectModelDataBackfillFn<
    { queries?: Array<Record<string, unknown>> },
    { queries?: Array<Record<string, unknown>> }
  >;

  // The runner passes the full document and a context object; only `attributes`
  // is read by our backfillFn. Cast through `any` to keep the test focused.
  const runBackfill = (attributes: { queries?: Array<Record<string, unknown>> }) =>
    backfillFn({ id: 'pack-id', type: 'osquery-pack', attributes } as any, {} as any);

  it('registers a single data_backfill change (no mappings_addition for schedule_id)', () => {
    expect(packSavedObjectModelVersion4.changes).toHaveLength(1);
    expect(packSavedObjectModelVersion4.changes[0].type).toBe('data_backfill');
  });

  it('(a) legacy doc → every query gains a non-empty schedule_id', () => {
    const result = runBackfill({
      queries: [
        { id: 'q1', query: 'SELECT 1', interval: 60 },
        { id: 'q2', query: 'SELECT 2', interval: 120 },
      ],
    });

    const queries = (result as { attributes: { queries: Array<Record<string, unknown>> } })
      .attributes.queries;
    expect(queries).toHaveLength(2);
    queries.forEach((q) => {
      expect(typeof q.schedule_id).toBe('string');
      expect((q.schedule_id as string).length).toBeGreaterThan(0);
    });
    // Distinct ids minted per query.
    expect(queries[0].schedule_id).not.toBe(queries[1].schedule_id);
  });

  it('pre-9.4 legacy shape — queries with no `id` still each gain a schedule_id', () => {
    // The oldest packs predate BOTH the per-query `id` and `schedule_id`
    // fields. The mint keys off neither, so it must
    // still assign a distinct schedule_id to every query and leave the rest
    // untouched.
    const result = runBackfill({
      queries: [
        { query: 'SELECT 1', interval: 60 },
        { query: 'SELECT 2', interval: 120 },
      ],
    });

    const queries = (result as { attributes: { queries: Array<Record<string, unknown>> } })
      .attributes.queries;
    expect(queries).toHaveLength(2);
    queries.forEach((q) => {
      expect(typeof q.schedule_id).toBe('string');
      expect((q.schedule_id as string).length).toBeGreaterThan(0);
    });
    expect(queries[0].schedule_id).not.toBe(queries[1].schedule_id);
    // Original fields preserved; no `id` is invented.
    expect(queries[0].query).toBe('SELECT 1');
    expect(queries[0]).not.toHaveProperty('id');
  });

  it('(b) idempotency — a query with an existing schedule_id is unchanged', () => {
    const result = runBackfill({
      queries: [
        { id: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'already-here' },
        { id: 'q2', query: 'SELECT 2', interval: 120 },
      ],
    });

    const queries = (result as { attributes: { queries: Array<Record<string, unknown>> } })
      .attributes.queries;
    // Existing schedule_id preserved byte-for-byte.
    expect(queries[0].schedule_id).toBe('already-here');
    // The legacy sibling still gets one.
    expect(typeof queries[1].schedule_id).toBe('string');
    expect((queries[1].schedule_id as string).length).toBeGreaterThan(0);
  });

  it('(c) start_date is NOT introduced by the backfill', () => {
    const result = runBackfill({
      queries: [{ id: 'q1', query: 'SELECT 1', interval: 60 }],
    });

    const queries = (result as { attributes: { queries: Array<Record<string, unknown>> } })
      .attributes.queries;
    expect(queries[0]).not.toHaveProperty('start_date');
  });

  it('(c) an existing start_date is preserved but never minted', () => {
    const result = runBackfill({
      queries: [
        { id: 'q1', query: 'SELECT 1', interval: 60, start_date: '2024-01-01T00:00:00.000Z' },
        { id: 'q2', query: 'SELECT 2', interval: 120 },
      ],
    });

    const queries = (result as { attributes: { queries: Array<Record<string, unknown>> } })
      .attributes.queries;
    // Pre-existing start_date untouched.
    expect(queries[0].start_date).toBe('2024-01-01T00:00:00.000Z');
    // No start_date conjured for the query that lacked one.
    expect(queries[1]).not.toHaveProperty('start_date');
  });

  it('preserves all other per-query fields verbatim', () => {
    const result = runBackfill({
      queries: [
        {
          id: 'q1',
          query: 'SELECT 1',
          interval: 60,
          platform: 'linux',
          ecs_mapping: [{ key: 'host.name', value: { field: 'name' } }],
        },
      ],
    });

    const query = (result as { attributes: { queries: Array<Record<string, unknown>> } }).attributes
      .queries[0];
    expect(query.id).toBe('q1');
    expect(query.query).toBe('SELECT 1');
    expect(query.interval).toBe(60);
    expect(query.platform).toBe('linux');
    expect(query.ecs_mapping).toEqual([{ key: 'host.name', value: { field: 'name' } }]);
  });

  it('returns the full queries array (data_backfill replaces arrays wholesale)', () => {
    const result = runBackfill({
      queries: [
        { id: 'q1', query: 'SELECT 1' },
        { id: 'q2', query: 'SELECT 2' },
        { id: 'q3', query: 'SELECT 3' },
      ],
    });

    const queries = (result as { attributes: { queries: Array<Record<string, unknown>> } })
      .attributes.queries;
    expect(queries.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
  });

  it('is a no-op (empty attribute patch) for a pack with no queries', () => {
    expect(runBackfill({ queries: [] })).toEqual({ attributes: {} });
    expect(runBackfill({})).toEqual({ attributes: {} });
  });

  it('(d) backfills regardless of feature-flag state (no flag input exists)', () => {
    // The backfillFn takes no feature-flag argument by construction — it is
    // structurally unconditional. This test pins that contract: the function
    // arity does not include any flag, so it cannot be flag-gated.
    expect(backfillFn.length).toBeLessThanOrEqual(2); // (document, context) only
    const result = runBackfill({ queries: [{ id: 'q1', query: 'SELECT 1' }] });
    expect(
      typeof (result as { attributes: { queries: Array<Record<string, unknown>> } }).attributes
        .queries[0].schedule_id
    ).toBe('string');
  });

  it('(e) forward-compat — a rolled-back node reads a V4-migrated doc without throwing', () => {
    const forwardCompatibility = packSavedObjectModelVersion4.schemas?.forwardCompatibility;
    expect(forwardCompatibility).toBeDefined();

    // Simulate the migrated doc: queries now carry schedule_id.
    const migratedDoc = {
      name: 'migrated-pack',
      enabled: true,
      created_at: '2026-05-01T00:00:00.000Z',
      created_by: 'elastic',
      updated_at: '2026-05-01T00:00:00.000Z',
      updated_by: 'elastic',
      queries: [
        {
          id: 'q1',
          query: 'SELECT * FROM users;',
          interval: 60,
          schedule_id: '11111111-1111-1111-1111-111111111111',
        },
      ],
    };

    expect(() => (forwardCompatibility as ObjectType).validate(migratedDoc)).not.toThrow();
  });
});
