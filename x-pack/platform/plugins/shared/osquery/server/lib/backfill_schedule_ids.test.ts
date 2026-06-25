/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { backfillScheduleIds } from './backfill_schedule_ids';

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
    } as unknown as Parameters<typeof backfillScheduleIds>[0]['coreStart'],
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
  } as unknown as Parameters<typeof backfillScheduleIds>[0]['osqueryContext']);

describe('backfillScheduleIds', () => {
  test('skips when all packs already have schedule_id values', async () => {
    const { core } = createMockCoreStart({
      saved_objects: [
        {
          id: 'pack-1',
          namespaces: ['default'],
          references: [],
          attributes: {
            name: 'test-pack',
            enabled: true,
            queries: [{ id: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'existing-uuid' }],
          },
        },
      ],
      total: 1,
    });

    const logger = createMockLogger();

    const result = await backfillScheduleIds({
      coreStart: core,
      osqueryContext: createMockOsqueryContext(),
      logger: logger as unknown as Parameters<typeof backfillScheduleIds>[0]['logger'],
    });

    expect(result).toEqual({ hadFailures: false });
    expect(logger.debug).toHaveBeenCalledWith(
      'backfillScheduleIds: all packs already have schedule_id values'
    );
  });

  test('generates schedule_id for queries missing them', async () => {
    const scopedClient = createMockScopedClient();
    const { core } = createMockCoreStart(
      {
        saved_objects: [
          {
            id: 'pack-1',
            namespaces: ['default'],
            references: [],
            attributes: {
              name: 'test-pack',
              enabled: false,
              queries: [
                { id: 'q1', query: 'SELECT 1', interval: 60, name: 'q1' },
                {
                  id: 'q2',
                  query: 'SELECT 2',
                  interval: 120,
                  name: 'q2',
                  schedule_id: 'keep-me',
                  start_date: '2024-01-01T00:00:00.000Z',
                },
              ],
            },
          },
        ],
        total: 1,
      },
      scopedClient
    );

    const logger = createMockLogger();

    await backfillScheduleIds({
      coreStart: core,
      osqueryContext: createMockOsqueryContext(),
      logger: logger as unknown as Parameters<typeof backfillScheduleIds>[0]['logger'],
    });

    expect(scopedClient.update).toHaveBeenCalledTimes(1);
    const updateCall = scopedClient.update.mock.calls[0];
    const updatedQueries = updateCall[2].queries;

    expect(updatedQueries[0].schedule_id).toMatch(UUID_REGEX);
    expect(updatedQueries[0].start_date).toBeDefined();

    expect(updatedQueries[1].schedule_id).toBe('keep-me');
    expect(updatedQueries[1].start_date).toBe('2024-01-01T00:00:00.000Z');
  });

  test('continues on version conflict (409)', async () => {
    const scopedClient = createMockScopedClient();
    const { core } = createMockCoreStart(
      {
        saved_objects: [
          {
            id: 'pack-1',
            namespaces: ['default'],
            references: [],
            attributes: {
              name: 'pack-conflict',
              enabled: false,
              queries: [{ id: 'q1', query: 'SELECT 1', interval: 60, name: 'q1' }],
            },
          },
          {
            id: 'pack-2',
            namespaces: ['default'],
            references: [],
            attributes: {
              name: 'pack-ok',
              enabled: false,
              queries: [{ id: 'q2', query: 'SELECT 2', interval: 120, name: 'q2' }],
            },
          },
        ],
        total: 2,
      },
      scopedClient
    );

    scopedClient.update
      .mockRejectedValueOnce(Object.assign(new Error('Conflict'), { statusCode: 409 }))
      .mockResolvedValueOnce({});

    const logger = createMockLogger();

    await backfillScheduleIds({
      coreStart: core,
      osqueryContext: createMockOsqueryContext(),
      logger: logger as unknown as Parameters<typeof backfillScheduleIds>[0]['logger'],
    });

    expect(scopedClient.update).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('version conflict for pack pack-1')
    );
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('backfilled pack pack-2'));
  });

  test('logs and skips on non-conflict errors', async () => {
    const scopedClient = createMockScopedClient();
    const { core } = createMockCoreStart(
      {
        saved_objects: [
          {
            id: 'pack-1',
            namespaces: ['default'],
            references: [],
            attributes: {
              name: 'broken-pack',
              enabled: false,
              queries: [{ id: 'q1', query: 'SELECT 1', interval: 60, name: 'q1' }],
            },
          },
        ],
        total: 1,
      },
      scopedClient
    );

    scopedClient.update.mockRejectedValueOnce(new Error('something went wrong'));

    const logger = createMockLogger();

    const result = await backfillScheduleIds({
      coreStart: core,
      osqueryContext: createMockOsqueryContext(),
      logger: logger as unknown as Parameters<typeof backfillScheduleIds>[0]['logger'],
    });

    expect(result).toEqual({ hadFailures: true });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('failed to backfill pack pack-1')
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'backfillScheduleIds: backfill finished with partial failures, will retry'
    );
  });

  test('returns hadFailures false on full success', async () => {
    const scopedClient = createMockScopedClient();
    const { core } = createMockCoreStart(
      {
        saved_objects: [
          {
            id: 'pack-1',
            namespaces: ['default'],
            references: [],
            attributes: {
              name: 'ok-pack',
              enabled: false,
              queries: [{ id: 'q1', query: 'SELECT 1', interval: 60, name: 'q1' }],
            },
          },
        ],
        total: 1,
      },
      scopedClient
    );

    const logger = createMockLogger();

    const result = await backfillScheduleIds({
      coreStart: core,
      osqueryContext: createMockOsqueryContext(),
      logger: logger as unknown as Parameters<typeof backfillScheduleIds>[0]['logger'],
    });

    expect(result).toEqual({ hadFailures: false });
    expect(logger.info).toHaveBeenCalledWith('backfillScheduleIds: backfill complete');
  });

  test('returns early when no packs exist', async () => {
    const { core } = createMockCoreStart({ saved_objects: [], total: 0 });
    const logger = createMockLogger();

    const result = await backfillScheduleIds({
      coreStart: core,
      osqueryContext: createMockOsqueryContext(),
      logger: logger as unknown as Parameters<typeof backfillScheduleIds>[0]['logger'],
    });

    expect(result).toEqual({ hadFailures: false });
    expect(logger.debug).toHaveBeenCalledWith(
      'backfillScheduleIds: all packs already have schedule_id values'
    );
  });

  describe('isRruleFeatureEnabled flag — Fleet wire fields on backfill', () => {
    // These tests lock the wire-gate contract for the backfill code path:
    // when isRruleFeatureEnabled is true and the SO has schedule_type 'rrule',
    // the Fleet package-policy update must carry `default_rrule_schedule` and
    // must NOT carry `default_native_schedule`. When the flag is false (or
    // omitted), neither rrule wire field must appear.
    const rruleValue = { rrule: 'FREQ=DAILY', start_date: '2026-01-01T00:00:00Z' };

    const buildRrulePackFindResult = () => ({
      saved_objects: [
        {
          id: 'pack-rrule',
          namespaces: ['default'],
          // policyHasPack checks inputs[0].config.osquery.value.packs.<key>
          references: [{ id: 'policy-1', name: 'policy-1', type: 'ingest-agent-policies' }],
          attributes: {
            name: 'rrule-pack',
            enabled: true,
            schedule_type: 'rrule',
            rrule_schedule: rruleValue,
            interval: null,
            queries: [
              // schedule_id missing — triggers the backfill branch
              { id: 'q1', query: 'SELECT 1', name: 'q1' },
            ],
          },
        },
      ],
      total: 1,
    });

    const buildPackagePolicy = () => ({
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
                  // Key must match makePackKey('rrule-pack', 'default') = 'default--rrule-pack'
                  'default--rrule-pack': {
                    shard: 100,
                    pack_id: 'pack-rrule',
                    queries: {},
                  },
                },
              },
            },
          },
        },
      ],
    });

    test('flag on + rrule-mode SO queries — backfill writes pack-level rrule wire fields', async () => {
      const scopedClient = createMockScopedClient();
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({ items: [buildPackagePolicy()] });

      const { core } = createMockCoreStart(buildRrulePackFindResult(), scopedClient);
      const osqueryContext = createMockOsqueryContext({
        list: packagePolicyList,
        update: packagePolicyUpdate,
      });
      const logger = createMockLogger();

      const result = await backfillScheduleIds({
        coreStart: core,
        osqueryContext,
        logger: logger as unknown as Parameters<typeof backfillScheduleIds>[0]['logger'],
        isRruleFeatureEnabled: true,
      });

      expect(result).toEqual({ hadFailures: false });

      // SO update must have assigned a fresh UUID to the query.
      expect(scopedClient.update).toHaveBeenCalledTimes(1);
      const updatedQueries = scopedClient.update.mock.calls[0][2].queries;
      expect(updatedQueries[0].schedule_id).toMatch(UUID_REGEX);

      // Fleet update must have been called exactly once.
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);

      const updatedPolicy = packagePolicyUpdate.mock.calls[0][3];
      const packBlock = updatedPolicy.inputs[0].config.osquery.value.packs['default--rrule-pack'];
      expect(packBlock).toBeDefined();
      // Flag-on + rrule mode: rrule wire field present.
      expect(packBlock.default_rrule_schedule).toEqual(rruleValue);
      // Interval wire field must NOT be present in rrule mode.
      expect(packBlock.default_native_schedule).toBeUndefined();
    });

    test('flag off + rrule-mode SO queries — backfill omits rrule wire fields', async () => {
      const scopedClient = createMockScopedClient();
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({ items: [buildPackagePolicy()] });

      const { core } = createMockCoreStart(buildRrulePackFindResult(), scopedClient);
      const osqueryContext = createMockOsqueryContext({
        list: packagePolicyList,
        update: packagePolicyUpdate,
      });
      const logger = createMockLogger();

      const result = await backfillScheduleIds({
        coreStart: core,
        osqueryContext,
        logger: logger as unknown as Parameters<typeof backfillScheduleIds>[0]['logger'],
        // isRruleFeatureEnabled omitted (defaults to false) — rollback gate
      });

      expect(result).toEqual({ hadFailures: false });

      // SO update still writes the schedule_id backfill.
      expect(scopedClient.update).toHaveBeenCalledTimes(1);
      const updatedQueries = scopedClient.update.mock.calls[0][2].queries;
      expect(updatedQueries[0].schedule_id).toMatch(UUID_REGEX);

      // Fleet update must still be called (pack is enabled).
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);

      const updatedPolicy = packagePolicyUpdate.mock.calls[0][3];
      const packBlock = updatedPolicy.inputs[0].config.osquery.value.packs['default--rrule-pack'];
      expect(packBlock).toBeDefined();
      // Flag-off: neither rrule nor native-schedule wire fields should appear.
      expect(packBlock.default_rrule_schedule).toBeUndefined();
      expect(packBlock.default_native_schedule).toBeUndefined();
    });

    test('flag off + legacy interval pack — wire is the legacy per-query shape plus default_space_id', async () => {
      // Locks the refactor contract from the new convertSOQueriesToPackConfig
      // signature: on the backfill path (which only ever runs flag-off in
      // practice) the emitted wire must stay equivalent to the pre-feature
      // output — per-query `interval` preserved, no pack-level schedule
      // defaults — with `default_space_id` as the single additive pack-level
      // field.
      const scopedClient = createMockScopedClient();
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [
          {
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
                        'default--legacy-pack': { shard: 100, pack_id: 'pack-legacy', queries: {} },
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      });

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
                // No schedule_type — legacy interval pack.
                queries: [
                  // schedule_id missing — triggers the backfill branch.
                  { id: 'q1', query: 'SELECT 1', interval: 60, name: 'q1' },
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

      const result = await backfillScheduleIds({
        coreStart: core,
        osqueryContext,
        logger: logger as unknown as Parameters<typeof backfillScheduleIds>[0]['logger'],
        // isRruleFeatureEnabled omitted (defaults to false).
      });

      expect(result).toEqual({ hadFailures: false });
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);

      const updatedPolicy = packagePolicyUpdate.mock.calls[0][3];
      const packBlock = updatedPolicy.inputs[0].config.osquery.value.packs['default--legacy-pack'];
      expect(packBlock).toBeDefined();

      // Legacy per-query shape preserved: query carries its own `interval`.
      expect(packBlock.queries.q1.interval).toBe(60);
      // No pack-level schedule defaults are emitted.
      expect(packBlock.default_native_schedule).toBeUndefined();
      expect(packBlock.default_rrule_schedule).toBeUndefined();
      // `default_space_id` is the single additive pack-level field.
      expect(packBlock.default_space_id).toBe('default');
    });
  });
});
