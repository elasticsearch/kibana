/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  SavedObjectModelDataBackfillFn,
  SavedObjectsModelDataBackfillChange,
} from '@kbn/core-saved-objects-server';
import { reconcileScheduleIdsToWire } from './backfill_schedule_ids';
import { packSavedObjectModelVersion4 } from './saved_query/saved_object_model_versions';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createMockLogger = () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  log: jest.fn(),
  get: jest.fn(),
  isLevelEnabled: jest.fn().mockReturnValue(true),
});

const createMockScopedClient = () => ({
  find: jest.fn().mockResolvedValue({ saved_objects: [], total: 0 }),
  update: jest.fn().mockResolvedValue({}),
  bulkGet: jest.fn().mockResolvedValue({ saved_objects: [] }),
});

const createMockCoreStart = (
  findResult: unknown = { saved_objects: [], total: 0 },
  scopedClient?: ReturnType<typeof createMockScopedClient>
) => {
  const sc = scopedClient ?? createMockScopedClient();

  return {
    core: {
      savedObjects: {
        createInternalRepository: jest.fn().mockReturnValue({
          find: jest.fn().mockResolvedValue(findResult),
        }),
        getScopedClient: jest.fn().mockReturnValue(sc),
      },
      http: {},
      elasticsearch: {
        client: { asInternalUser: {} },
      },
    } as unknown as Parameters<typeof reconcileScheduleIdsToWire>[0]['coreStart'],
    scopedClient: sc,
  };
};

const createMockOsqueryContext = (packagePolicyService?: unknown) =>
  ({
    getPackagePolicyService: jest.fn().mockReturnValue(
      packagePolicyService ?? {
        list: jest.fn().mockResolvedValue({ items: [] }),
        update: jest.fn().mockResolvedValue({}),
      }
    ),
  } as unknown as Parameters<typeof reconcileScheduleIdsToWire>[0]['osqueryContext']);

// A pack SO that already carries `schedule_id` on every query (the post-V4
// guarantee). The reconciler reads these as the source of truth and projects
// them onto the wire — it never mints.
const buildEnabledPackFindResult = (overrides: Record<string, unknown> = {}) => ({
  saved_objects: [
    {
      id: 'pack-1',
      namespaces: ['default'],
      references: [{ id: 'policy-1', name: 'policy-1', type: 'ingest-agent-policies' }],
      attributes: {
        name: 'reconcile-pack',
        enabled: true,
        queries: [
          { id: 'q1', query: 'SELECT 1', interval: 60, name: 'q1', schedule_id: 'sched-q1' },
          { id: 'q2', query: 'SELECT 2', interval: 120, name: 'q2', schedule_id: 'sched-q2' },
        ],
        ...overrides,
      },
    },
  ],
  total: 1,
});

const buildPackagePolicy = (packKey = 'default--reconcile-pack', packId = 'pack-1') => ({
  id: 'pp-1',
  policy_ids: ['policy-1'],
  package: { name: 'osquery_manager', version: '1.0.0' },
  inputs: [
    {
      type: 'osquery',
      streams: [],
      config: {
        osquery: {
          value: {
            packs: {
              [packKey]: { shard: 100, pack_id: packId, queries: {} },
            },
          },
        },
      },
    },
  ],
});

describe('reconcileScheduleIdsToWire', () => {
  test('mints nothing on the Saved Object (no SO update call)', async () => {
    const scopedClient = createMockScopedClient();
    const packagePolicyUpdate = jest.fn().mockResolvedValue({});
    const packagePolicyList = jest.fn().mockResolvedValue({ items: [buildPackagePolicy()] });

    const { core } = createMockCoreStart(buildEnabledPackFindResult(), scopedClient);
    const osqueryContext = createMockOsqueryContext({
      list: packagePolicyList,
      update: packagePolicyUpdate,
    });
    const logger = createMockLogger();

    const result = await reconcileScheduleIdsToWire({
      coreStart: core,
      osqueryContext,
      logger: logger as unknown as Parameters<typeof reconcileScheduleIdsToWire>[0]['logger'],
    });

    expect(result).toEqual({ hadFailures: false });
    // The reconciler must NEVER write the pack SO — minting is owned by the
    // model version. Only the Fleet package policy is updated.
    expect(scopedClient.update).not.toHaveBeenCalled();
    expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
  });

  test('projects the SO schedule_id onto the Fleet wire', async () => {
    const scopedClient = createMockScopedClient();
    const packagePolicyUpdate = jest.fn().mockResolvedValue({});
    const packagePolicyList = jest.fn().mockResolvedValue({ items: [buildPackagePolicy()] });

    const { core } = createMockCoreStart(buildEnabledPackFindResult(), scopedClient);
    const osqueryContext = createMockOsqueryContext({
      list: packagePolicyList,
      update: packagePolicyUpdate,
    });
    const logger = createMockLogger();

    await reconcileScheduleIdsToWire({
      coreStart: core,
      osqueryContext,
      logger: logger as unknown as Parameters<typeof reconcileScheduleIdsToWire>[0]['logger'],
    });

    const updatedPolicy = packagePolicyUpdate.mock.calls[0][3];
    const packBlock = updatedPolicy.inputs[0].config.osquery.value.packs['default--reconcile-pack'];
    expect(packBlock).toBeDefined();
    expect(packBlock.queries.q1.schedule_id).toBe('sched-q1');
    expect(packBlock.queries.q2.schedule_id).toBe('sched-q2');
    // pack_id is set from the SO id.
    expect(packBlock.pack_id).toBe('pack-1');
  });

  // Build the route-shaped wire a pack would actually carry once reconciled:
  // the reconciler's own projected block PLUS the `shard` field the create/
  // update routes always set (and that `convertSOQueriesToPackConfig` never
  // emits). This is the realistic steady-state input the diff gate must match.
  const buildInSyncPolicyFromFirstReconcile = async () => {
    const firstUpdate = jest.fn().mockResolvedValue({});
    const firstList = jest.fn().mockResolvedValue({ items: [buildPackagePolicy()] });

    const seed = createMockCoreStart(buildEnabledPackFindResult(), createMockScopedClient());
    await reconcileScheduleIdsToWire({
      coreStart: seed.core,
      osqueryContext: createMockOsqueryContext({ list: firstList, update: firstUpdate }),
      logger: createMockLogger() as unknown as Parameters<
        typeof reconcileScheduleIdsToWire
      >[0]['logger'],
    });

    const reconciledPolicy = { ...firstUpdate.mock.calls[0][3], id: 'pp-1' };
    // The first reconcile preserves `shard: 100` from buildPackagePolicy, so
    // reconciledPolicy is already route-shaped (carries `shard`). Assert that
    // rather than re-injecting it, so the fixture can't silently lose realism.
    expect(
      reconciledPolicy.inputs[0].config.osquery.value.packs['default--reconcile-pack'].shard
    ).toBe(100);

    return reconciledPolicy;
  };

  test('skips the package-policy write when a route-shaped wire already matches the SO (no revision churn)', async () => {
    const reconciledPolicy = await buildInSyncPolicyFromFirstReconcile();

    const secondUpdate = jest.fn().mockResolvedValue({});
    const secondList = jest.fn().mockResolvedValue({ items: [reconciledPolicy] });
    const logger = createMockLogger();

    const { core } = createMockCoreStart(buildEnabledPackFindResult(), createMockScopedClient());
    const result = await reconcileScheduleIdsToWire({
      coreStart: core,
      osqueryContext: createMockOsqueryContext({ list: secondList, update: secondUpdate }),
      logger: logger as unknown as Parameters<typeof reconcileScheduleIdsToWire>[0]['logger'],
    });

    expect(result).toEqual({ hadFailures: false });
    expect(secondUpdate).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('already in sync on policy pp-1, skipping write')
    );
  });

  test('preserves the wire-only `shard` field when it does write', async () => {
    const scopedClient = createMockScopedClient();
    const packagePolicyUpdate = jest.fn().mockResolvedValue({});
    // A route-shaped wire whose `schedule_id`s are stale → a write IS needed,
    // but `shard` must survive (it controls pack rollout percentage).
    const stalePolicy = buildPackagePolicy();
    stalePolicy.inputs[0].config.osquery.value.packs['default--reconcile-pack'].shard = 42;
    const packagePolicyList = jest.fn().mockResolvedValue({ items: [stalePolicy] });

    const { core } = createMockCoreStart(buildEnabledPackFindResult(), scopedClient);
    const osqueryContext = createMockOsqueryContext({
      list: packagePolicyList,
      update: packagePolicyUpdate,
    });
    const logger = createMockLogger();

    await reconcileScheduleIdsToWire({
      coreStart: core,
      osqueryContext,
      logger: logger as unknown as Parameters<typeof reconcileScheduleIdsToWire>[0]['logger'],
    });

    const updatedPolicy = packagePolicyUpdate.mock.calls[0][3];
    const packBlock = updatedPolicy.inputs[0].config.osquery.value.packs['default--reconcile-pack'];
    expect(packBlock.shard).toBe(42);
    expect(packBlock.queries.q1.schedule_id).toBe('sched-q1');
  });

  test('migrates a legacy bare-name-keyed wire block to the spaceId--name key and preserves its `shard`', async () => {
    const scopedClient = createMockScopedClient();
    const packagePolicyUpdate = jest.fn().mockResolvedValue({});
    // A pre-`spaceId--name` pack keyed by its bare name (`reconcile-pack`), with
    // a wire-only `shard` set. `policyHasPack` matches via its bare-name
    // fallback, so the reconciler writes — it must migrate the block to the
    // modern key AND carry `shard` across (the SO never carried it).
    const legacyPolicy = buildPackagePolicy('reconcile-pack');
    legacyPolicy.inputs[0].config.osquery.value.packs['reconcile-pack'].shard = 7;
    const packagePolicyList = jest.fn().mockResolvedValue({ items: [legacyPolicy] });

    const { core } = createMockCoreStart(buildEnabledPackFindResult(), scopedClient);
    const osqueryContext = createMockOsqueryContext({
      list: packagePolicyList,
      update: packagePolicyUpdate,
    });
    const logger = createMockLogger();

    await reconcileScheduleIdsToWire({
      coreStart: core,
      osqueryContext,
      logger: logger as unknown as Parameters<typeof reconcileScheduleIdsToWire>[0]['logger'],
    });

    const updatedPolicy = packagePolicyUpdate.mock.calls[0][3];
    const packs = updatedPolicy.inputs[0].config.osquery.value.packs;
    // The legacy key is gone, the modern key holds the migrated block...
    expect(packs['reconcile-pack']).toBeUndefined();
    expect(packs['default--reconcile-pack']).toBeDefined();
    // ...and the `shard` that lived under the legacy key survived the migration.
    expect(packs['default--reconcile-pack'].shard).toBe(7);
    expect(packs['default--reconcile-pack'].queries.q1.schedule_id).toBe('sched-q1');
  });

  test('is idempotent — a second run changes no schedule_id', async () => {
    const scopedClient = createMockScopedClient();
    const packagePolicyUpdate = jest.fn().mockResolvedValue({});
    const packagePolicyList = jest.fn().mockResolvedValue({ items: [buildPackagePolicy()] });

    const osqueryContext = createMockOsqueryContext({
      list: packagePolicyList,
      update: packagePolicyUpdate,
    });
    const logger = createMockLogger();

    const run = () => {
      const { core } = createMockCoreStart(buildEnabledPackFindResult(), scopedClient);

      return reconcileScheduleIdsToWire({
        coreStart: core,
        osqueryContext,
        logger: logger as unknown as Parameters<typeof reconcileScheduleIdsToWire>[0]['logger'],
      });
    };

    await run();
    const firstWire =
      packagePolicyUpdate.mock.calls[0][3].inputs[0].config.osquery.value.packs[
        'default--reconcile-pack'
      ];

    await run();
    const secondWire =
      packagePolicyUpdate.mock.calls[1][3].inputs[0].config.osquery.value.packs[
        'default--reconcile-pack'
      ];

    // Same source-of-truth SO → byte-identical wire, no uuid drift.
    expect(secondWire.queries.q1.schedule_id).toBe(firstWire.queries.q1.schedule_id);
    expect(secondWire.queries.q2.schedule_id).toBe(firstWire.queries.q2.schedule_id);
    expect(secondWire.queries.q1.schedule_id).toBe('sched-q1');
  });

  test('skips disabled packs (only enabled packs reach the wire)', async () => {
    const scopedClient = createMockScopedClient();
    const packagePolicyUpdate = jest.fn().mockResolvedValue({});
    const packagePolicyList = jest.fn().mockResolvedValue({ items: [buildPackagePolicy()] });

    const { core } = createMockCoreStart(
      buildEnabledPackFindResult({ enabled: false }),
      scopedClient
    );
    const osqueryContext = createMockOsqueryContext({
      list: packagePolicyList,
      update: packagePolicyUpdate,
    });
    const logger = createMockLogger();

    const result = await reconcileScheduleIdsToWire({
      coreStart: core,
      osqueryContext,
      logger: logger as unknown as Parameters<typeof reconcileScheduleIdsToWire>[0]['logger'],
    });

    expect(result).toEqual({ hadFailures: false });
    expect(packagePolicyUpdate).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'reconcileScheduleIdsToWire: no enabled packs to reconcile'
    );
  });

  test('returns early when no packs exist', async () => {
    const { core } = createMockCoreStart({ saved_objects: [], total: 0 });
    const logger = createMockLogger();

    const result = await reconcileScheduleIdsToWire({
      coreStart: core,
      osqueryContext: createMockOsqueryContext(),
      logger: logger as unknown as Parameters<typeof reconcileScheduleIdsToWire>[0]['logger'],
    });

    expect(result).toEqual({ hadFailures: false });
    expect(logger.debug).toHaveBeenCalledWith(
      'reconcileScheduleIdsToWire: no enabled packs to reconcile'
    );
  });

  test('flags hadFailures on version conflict (409) so the one-shot task re-arms', async () => {
    const scopedClient = createMockScopedClient();
    const packagePolicyUpdate = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('Conflict'), { statusCode: 409 }));
    const packagePolicyList = jest.fn().mockResolvedValue({ items: [buildPackagePolicy()] });

    const { core } = createMockCoreStart(buildEnabledPackFindResult(), scopedClient);
    const osqueryContext = createMockOsqueryContext({
      list: packagePolicyList,
      update: packagePolicyUpdate,
    });
    const logger = createMockLogger();

    const result = await reconcileScheduleIdsToWire({
      coreStart: core,
      osqueryContext,
      logger: logger as unknown as Parameters<typeof reconcileScheduleIdsToWire>[0]['logger'],
    });

    // A 409 means the pack's wire was NOT written this pass. Because the task
    // is single-run, only `hadFailures: true` makes it re-arm and retry — a
    // swallowed 409 would silently abandon the pack on a stale wire.
    expect(result).toEqual({ hadFailures: true });
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('version conflict for pack pack-1')
    );
  });

  test('logs and flags hadFailures on non-conflict errors', async () => {
    const scopedClient = createMockScopedClient();
    const packagePolicyUpdate = jest.fn().mockRejectedValueOnce(new Error('something went wrong'));
    const packagePolicyList = jest.fn().mockResolvedValue({ items: [buildPackagePolicy()] });

    const { core } = createMockCoreStart(buildEnabledPackFindResult(), scopedClient);
    const osqueryContext = createMockOsqueryContext({
      list: packagePolicyList,
      update: packagePolicyUpdate,
    });
    const logger = createMockLogger();

    const result = await reconcileScheduleIdsToWire({
      coreStart: core,
      osqueryContext,
      logger: logger as unknown as Parameters<typeof reconcileScheduleIdsToWire>[0]['logger'],
    });

    expect(result).toEqual({ hadFailures: true });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to reconcile pack pack-1')
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'reconcileScheduleIdsToWire: reconcile finished with partial failures, will retry'
    );
  });

  describe('isRruleFeatureEnabled flag — Fleet wire fields on reconcile', () => {
    const rruleValue = { rrule: 'FREQ=DAILY', start_date: '2026-01-01T00:00:00Z' };

    const buildRrulePackFindResult = () => ({
      saved_objects: [
        {
          id: 'pack-rrule',
          namespaces: ['default'],
          references: [{ id: 'policy-1', name: 'policy-1', type: 'ingest-agent-policies' }],
          attributes: {
            name: 'rrule-pack',
            enabled: true,
            schedule_type: 'rrule',
            rrule_schedule: rruleValue,
            interval: null,
            queries: [{ id: 'q1', query: 'SELECT 1', name: 'q1', schedule_id: 'sched-q1' }],
          },
        },
      ],
      total: 1,
    });

    test('flag on + rrule-mode SO — wire carries default_rrule_schedule and schedule_id', async () => {
      const scopedClient = createMockScopedClient();
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest
        .fn()
        .mockResolvedValue({ items: [buildPackagePolicy('default--rrule-pack', 'pack-rrule')] });

      const { core } = createMockCoreStart(buildRrulePackFindResult(), scopedClient);
      const osqueryContext = createMockOsqueryContext({
        list: packagePolicyList,
        update: packagePolicyUpdate,
      });
      const logger = createMockLogger();

      const result = await reconcileScheduleIdsToWire({
        coreStart: core,
        osqueryContext,
        logger: logger as unknown as Parameters<typeof reconcileScheduleIdsToWire>[0]['logger'],
        isRruleFeatureEnabled: true,
      });

      expect(result).toEqual({ hadFailures: false });
      expect(scopedClient.update).not.toHaveBeenCalled();

      const packBlock =
        packagePolicyUpdate.mock.calls[0][3].inputs[0].config.osquery.value.packs[
          'default--rrule-pack'
        ];
      expect(packBlock.default_rrule_schedule).toEqual(rruleValue);
      expect(packBlock.default_native_schedule).toBeUndefined();
      expect(packBlock.queries.q1.schedule_id).toBe('sched-q1');
    });

    test('flag off + rrule-mode SO — wire omits rrule fields but still carries schedule_id', async () => {
      const scopedClient = createMockScopedClient();
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest
        .fn()
        .mockResolvedValue({ items: [buildPackagePolicy('default--rrule-pack', 'pack-rrule')] });

      const { core } = createMockCoreStart(buildRrulePackFindResult(), scopedClient);
      const osqueryContext = createMockOsqueryContext({
        list: packagePolicyList,
        update: packagePolicyUpdate,
      });
      const logger = createMockLogger();

      const result = await reconcileScheduleIdsToWire({
        coreStart: core,
        osqueryContext,
        logger: logger as unknown as Parameters<typeof reconcileScheduleIdsToWire>[0]['logger'],
        // isRruleFeatureEnabled omitted (defaults to false) — rollback gate.
      });

      expect(result).toEqual({ hadFailures: false });

      const packBlock =
        packagePolicyUpdate.mock.calls[0][3].inputs[0].config.osquery.value.packs[
          'default--rrule-pack'
        ];
      expect(packBlock.default_rrule_schedule).toBeUndefined();
      expect(packBlock.default_native_schedule).toBeUndefined();
      // schedule_id is mode-independent identity — present regardless of flag.
      expect(packBlock.queries.q1.schedule_id).toBe('sched-q1');
    });

    test('flag off + legacy interval pack — legacy per-query shape plus default_space_id and schedule_id', async () => {
      const scopedClient = createMockScopedClient();
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest
        .fn()
        .mockResolvedValue({ items: [buildPackagePolicy('default--legacy-pack', 'pack-legacy')] });

      const { core } = createMockCoreStart(
        {
          saved_objects: [
            {
              id: 'pack-legacy',
              namespaces: ['default'],
              references: [{ id: 'policy-1', name: 'policy-1', type: 'ingest-agent-policies' }],
              attributes: {
                name: 'legacy-pack',
                enabled: true,
                queries: [
                  {
                    id: 'q1',
                    query: 'SELECT 1',
                    interval: 60,
                    name: 'q1',
                    schedule_id: 'sched-q1',
                  },
                ],
              },
            },
          ],
          total: 1,
        },
        scopedClient
      );

      const osqueryContext = createMockOsqueryContext({
        list: packagePolicyList,
        update: packagePolicyUpdate,
      });
      const logger = createMockLogger();

      const result = await reconcileScheduleIdsToWire({
        coreStart: core,
        osqueryContext,
        logger: logger as unknown as Parameters<typeof reconcileScheduleIdsToWire>[0]['logger'],
      });

      expect(result).toEqual({ hadFailures: false });

      const packBlock =
        packagePolicyUpdate.mock.calls[0][3].inputs[0].config.osquery.value.packs[
          'default--legacy-pack'
        ];
      expect(packBlock.queries.q1.interval).toBe(60);
      expect(packBlock.queries.q1.schedule_id).toBe('sched-q1');
      expect(packBlock.default_native_schedule).toBeUndefined();
      expect(packBlock.default_rrule_schedule).toBeUndefined();
      expect(packBlock.default_space_id).toBe('default');
    });
  });

  describe('integration — legacy SO → model version V4 → reconciler → Fleet wire', () => {
    // End-to-end sanity (FTR-style, in-process): a legacy pack whose queries
    // have NO schedule_id is migrated by the real V4 `data_backfill`, then the
    // reconciler projects the now-minted schedule_id values onto the Fleet
    // package-policy wire. Asserts the full pipeline delivers schedule_id per
    // query without the reconciler minting anything.
    const backfillFn = (
      packSavedObjectModelVersion4.changes.find(
        (change): change is SavedObjectsModelDataBackfillChange => change.type === 'data_backfill'
      ) as SavedObjectsModelDataBackfillChange
    ).backfillFn as SavedObjectModelDataBackfillFn<
      { queries?: Array<Record<string, unknown>> },
      { queries?: Array<Record<string, unknown>> }
    >;

    test('legacy queries gain schedule_id via V4, and the reconciler carries them to the wire', async () => {
      // 1) Legacy SO: queries with no schedule_id.
      const legacyQueries = [
        { id: 'q1', query: 'SELECT 1', interval: 60, name: 'q1' },
        { id: 'q2', query: 'SELECT 2', interval: 120, name: 'q2' },
      ];

      // 2) Run the REAL model-version backfill.
      const migrated = backfillFn(
        { id: 'pack-legacy', type: 'osquery-pack', attributes: { queries: legacyQueries } } as any,

        {} as any
      ) as { attributes: { queries: Array<Record<string, unknown>> } };

      const migratedQueries = migrated.attributes.queries;
      migratedQueries.forEach((q) => expect(q.schedule_id).toMatch(UUID_REGEX));

      // 3) Feed the migrated SO into the reconciler.
      const scopedClient = createMockScopedClient();
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest
        .fn()
        .mockResolvedValue({ items: [buildPackagePolicy('default--legacy-pack', 'pack-legacy')] });

      const { core } = createMockCoreStart(
        {
          saved_objects: [
            {
              id: 'pack-legacy',
              namespaces: ['default'],
              references: [{ id: 'policy-1', name: 'policy-1', type: 'ingest-agent-policies' }],
              attributes: {
                name: 'legacy-pack',
                enabled: true,
                queries: migratedQueries,
              },
            },
          ],
          total: 1,
        },
        scopedClient
      );

      const osqueryContext = createMockOsqueryContext({
        list: packagePolicyList,
        update: packagePolicyUpdate,
      });
      const logger = createMockLogger();

      const result = await reconcileScheduleIdsToWire({
        coreStart: core,
        osqueryContext,
        logger: logger as unknown as Parameters<typeof reconcileScheduleIdsToWire>[0]['logger'],
      });

      // 4) The reconciler minted nothing and the wire carries each schedule_id.
      expect(result).toEqual({ hadFailures: false });
      expect(scopedClient.update).not.toHaveBeenCalled();

      const packBlock =
        packagePolicyUpdate.mock.calls[0][3].inputs[0].config.osquery.value.packs[
          'default--legacy-pack'
        ];
      expect(packBlock.queries.q1.schedule_id).toBe(migratedQueries[0].schedule_id);
      expect(packBlock.queries.q2.schedule_id).toBe(migratedQueries[1].schedule_id);
    });
  });
});
