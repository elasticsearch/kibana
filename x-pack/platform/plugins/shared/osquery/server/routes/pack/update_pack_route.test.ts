/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { keyBy } from 'lodash';
import { httpServerMock, httpServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { RequestHandler } from '@kbn/core/server';
import { LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE } from '@kbn/fleet-plugin/common';
import { API_VERSIONS } from '../../../common/constants';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import type { PackSavedObject } from '../../common/types';
import { updatePackRoute } from './update_pack_route';
import { updatePacksRequestBodySchema } from '../../../common/api/packs/update_packs_route';
import { buildRouteValidation } from '../../utils/build_validation/route_validation';
import { createInternalSavedObjectsClientForSpaceId } from '../../utils/get_internal_saved_object_client';
import { getUserInfo } from '../../lib/get_user_info';

jest.mock('../../utils/get_internal_saved_object_client', () => ({
  createInternalSavedObjectsClientForSpaceId: jest.fn(),
}));

jest.mock('../../lib/get_user_info', () => ({
  getUserInfo: jest.fn(),
}));

const mockFetchAllItems = (items: unknown[] = []) =>
  jest.fn().mockResolvedValue(
    (async function* () {
      yield items;
    })()
  );

const fetchAllItemsFromListMock = (listMock: jest.Mock) =>
  jest.fn().mockImplementation(async () => {
    const { items = [] } = await listMock();

    return (async function* () {
      yield items;
    })();
  });

const buildMockContext = () => ({
  core: Promise.resolve({
    elasticsearch: {
      client: {
        asCurrentUser: {},
      },
    },
    savedObjects: {
      client: {},
    },
  }),
});

describe('updatePackRoute', () => {
  let routeHandler: RequestHandler;
  let mockOsqueryContext: OsqueryAppContext;

  const createMockRouter = () => {
    const httpService = httpServiceMock.createSetupContract();

    return httpService.createRouter();
  };

  const basePackSO: {
    id: string;
    references: Array<{ id: string; name: string; type: string }>;
    attributes: Partial<PackSavedObject>;
  } = {
    id: 'pack-id',
    references: [],
    attributes: {
      name: 'my-pack',
      description: 'Test pack',
      queries: [],
      enabled: false,
      version: 1,
      shards: [],
      created_at: '2025-01-01T00:00:00.000Z',
      created_by: 'admin',
      updated_at: '2025-01-01T00:00:00.000Z',
      updated_by: 'admin',
    },
  };

  const buildMockSavedObjectsClient = (
    currentSO: typeof basePackSO,
    updatedSOAttributes?: Partial<PackSavedObject>
  ) => ({
    get: jest.fn().mockResolvedValue(currentSO),
    find: jest.fn().mockResolvedValue({ saved_objects: [] }),
    update: jest.fn().mockResolvedValue({
      id: 'pack-id',
      attributes: { ...currentSO.attributes, ...updatedSOAttributes },
      references: [],
    }),
    list: jest.fn().mockResolvedValue({ items: [] }),
  });

  const setupRoute = (isRruleFeatureEnabled = true) => {
    const mockRouter = createMockRouter();
    mockOsqueryContext = {
      logFactory: {
        get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()),
      },
      security: {},
      getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
      experimentalFeatures: { rruleScheduling: isRruleFeatureEnabled },
      service: {
        getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
        getAgentPolicyService: jest.fn().mockReturnValue({
          getByIds: jest.fn().mockResolvedValue([]),
        }),
        getPackagePolicyService: jest.fn().mockReturnValue({
          list: jest.fn().mockResolvedValue({ items: [] }),
          fetchAllItems: mockFetchAllItems([]),
        }),
      },
    } as unknown as OsqueryAppContext;

    updatePackRoute(mockRouter, mockOsqueryContext);

    const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
    const routeVersion = route.versions[API_VERSIONS.public.v1];
    if (!routeVersion) {
      throw new Error(`Handler for version [${API_VERSIONS.public.v1}] not found!`);
    }

    routeHandler = routeVersion.handler;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getUserInfo as jest.Mock).mockResolvedValue({ username: 'tester', profile_uid: 'uid-1' });
  });

  describe('schedule_type transition', () => {
    it('interval → rrule: returns 200, writes rrule_schedule and nulls interval on SO', async () => {
      const rruleValue = { rrule: 'FREQ=DAILY', start_date: '2026-01-01T00:00:00Z' };
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO, {
        schedule_type: 'rrule',
        interval: null,
        rrule_schedule: rruleValue,
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          name: 'my-pack',
          schedule_type: 'rrule',
          rrule_schedule: rruleValue,
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const updateCall = mockClient.update.mock.calls[0];
      const patchedAttributes = updateCall[2];
      expect(patchedAttributes.schedule_type).toBe('rrule');
      expect(patchedAttributes.interval).toBeNull();
      expect(patchedAttributes.rrule_schedule).toEqual(rruleValue);
    });

    it('rrule → interval: returns 200, writes interval and nulls rrule_schedule on SO', async () => {
      const rruleValue = { rrule: 'FREQ=DAILY', start_date: '2026-01-01T00:00:00Z' };
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          schedule_type: 'rrule' as const,
          interval: null,
          rrule_schedule: rruleValue,
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO, {
        schedule_type: 'interval',
        interval: 120,
        rrule_schedule: null,
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          name: 'my-pack',
          schedule_type: 'interval',
          interval: 120,
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const updateCall = mockClient.update.mock.calls[0];
      const patchedAttributes = updateCall[2];
      expect(patchedAttributes.schedule_type).toBe('interval');
      expect(patchedAttributes.interval).toBe(120);
      expect(patchedAttributes.rrule_schedule).toBeNull();
    });

    it('schedule_type: null — full mode clear: both interval and rrule_schedule are null on SO patch', async () => {
      const rruleValue = { rrule: 'FREQ=DAILY', start_date: '2026-01-01T00:00:00Z' };
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          schedule_type: 'rrule' as const,
          interval: null,
          rrule_schedule: rruleValue,
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO, {
        schedule_type: null,
        interval: null,
        rrule_schedule: null,
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          name: 'my-pack',
          schedule_type: null,
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const updateCall = mockClient.update.mock.calls[0];
      const patchedAttributes = updateCall[2];
      expect(patchedAttributes.schedule_type).toBeNull();
      expect(patchedAttributes.interval).toBeNull();
      expect(patchedAttributes.rrule_schedule).toBeNull();
    });

    it('no schedule fields in body (only name) — no schedule keys on SO patch', async () => {
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO, {});

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { name: 'my-pack-renamed' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const updateCall = mockClient.update.mock.calls[0];
      const patchedAttributes = updateCall[2];
      expect(patchedAttributes).not.toHaveProperty('schedule_type');
      expect(patchedAttributes).not.toHaveProperty('interval');
      expect(patchedAttributes).not.toHaveProperty('rrule_schedule');
    });

    it('same-mode interval change — SO patch carries only interval, no schedule_type or rrule_schedule', async () => {
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO, { interval: 120 });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { name: 'my-pack', interval: 120 },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const updateCall = mockClient.update.mock.calls[0];
      const patchedAttributes = updateCall[2];
      expect(patchedAttributes).not.toHaveProperty('schedule_type');
      expect(patchedAttributes.interval).toBe(120);
      expect(patchedAttributes).not.toHaveProperty('rrule_schedule');
    });

    it('interval → rrule with queries omitted — strips prior-mode per-query interval from SO write', async () => {
      // Flipping to rrule without restating queries must not leave the old per-query interval on the SO.
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
          queries: [
            {
              id: 'fast',
              name: 'fast',
              query: 'SELECT 1',
              interval: 30,
              schedule_type: 'interval' as const,
              schedule_id: 'sched-fast',
              start_date: '2025-01-01T00:00:00.000Z',
            },
            {
              id: 'default',
              name: 'default',
              query: 'SELECT 2',
              schedule_id: 'sched-default',
              start_date: '2025-01-01T00:00:00.000Z',
            },
          ],
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO);

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          schedule_type: 'rrule',
          rrule_schedule: { rrule: 'FREQ=DAILY', start_date: '2026-01-01T00:00:00Z' },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const updateCall = mockClient.update.mock.calls[0];
      const patchedAttributes = updateCall[2];
      // Queries are rewritten on the SO write so cross-mode state doesn't leak.
      const writtenQueries = patchedAttributes.queries as Array<Record<string, unknown>>;
      const fast = writtenQueries.find((q) => q.id === 'fast')!;
      expect(fast).not.toHaveProperty('interval');
      expect(fast).not.toHaveProperty('schedule_type');
      // Existing schedule_id is preserved across the rewrite.
      expect(fast.schedule_id).toBe('sched-fast');
    });

    it('rrule → interval with queries omitted — strips prior-mode per-query rrule_schedule from SO write', async () => {
      const rruleValue = {
        rrule: 'FREQ=MINUTELY;INTERVAL=2',
        start_date: '2026-01-01T00:00:00Z',
      };
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          schedule_type: 'rrule' as const,
          interval: null,
          rrule_schedule: { rrule: 'FREQ=DAILY', start_date: '2026-01-01T00:00:00Z' },
          queries: [
            {
              id: 'overrides',
              name: 'overrides',
              query: 'SELECT 1',
              schedule_type: 'rrule' as const,
              rrule_schedule: rruleValue,
              schedule_id: 'sched-overrides',
              start_date: '2025-01-01T00:00:00.000Z',
            },
          ],
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO);

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { schedule_type: 'interval', interval: 60 },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const updateCall = mockClient.update.mock.calls[0];
      const patchedAttributes = updateCall[2];
      const writtenQueries = patchedAttributes.queries as Array<Record<string, unknown>>;
      const overrides = writtenQueries.find((q) => q.id === 'overrides')!;
      expect(overrides).not.toHaveProperty('rrule_schedule');
      expect(overrides).not.toHaveProperty('schedule_type');
      expect(overrides.schedule_id).toBe('sched-overrides');
    });

    it('V4-migrated pack with originally-no-id rows — every schedule_id survives GET→PUT edit-save', async () => {
      // No-id rows are stamped with their array-position key, so keyBy(queries, 'id')
      // no longer collapses every row under a single `undefined` key.
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          enabled: true,
          queries: [
            {
              id: '0',
              name: 'processes',
              query: 'SELECT * FROM processes;',
              interval: 3600,
              schedule_id: 'v4-minted-0',
              start_date: '2025-01-01T00:00:00.000Z',
            },
            {
              id: '1',
              name: 'users',
              query: 'SELECT * FROM users;',
              interval: 3600,
              schedule_id: 'v4-minted-1',
              start_date: '2025-01-01T00:00:00.000Z',
            },
          ],
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO);

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      // The edit-save PUT restates the queries keyed by the effective key, each
      // value carrying its `id` (the UI round-trip fix).
      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          name: 'my-pack',
          queries: {
            '0': { id: '0', query: 'SELECT * FROM processes;', interval: 3600 },
            '1': { id: '1', query: 'SELECT * FROM users;', interval: 3600 },
          },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const patchedAttributes = mockClient.update.mock.calls[0][2];
      const writtenQueries = patchedAttributes.queries as Array<Record<string, unknown>>;
      const byId = keyBy(writtenQueries, 'id');
      // Both V4-minted schedule_ids survive — none re-generated.
      expect(byId['0'].schedule_id).toBe('v4-minted-0');
      expect(byId['1'].schedule_id).toBe('v4-minted-1');
    });

    it('policy_ids omitted — preserves existing policy attachments (no strip)', async () => {
      // Omitting `policy_ids` must not detach the pack from its current policies.
      const currentSO = {
        ...basePackSO,
        references: [{ id: 'policy-1', name: 'policy-1', type: 'ingest-agent-policies' }],
        attributes: {
          ...basePackSO.attributes,
          enabled: true,
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
        },
      };
      const rruleValue = { rrule: 'FREQ=MINUTELY;INTERVAL=2', start_date: '2026-05-22T14:00:00Z' };
      const updatedSO = {
        ...currentSO,
        attributes: {
          ...currentSO.attributes,
          schedule_type: 'rrule' as const,
          interval: null,
          rrule_schedule: rruleValue,
        },
      };
      // Two-stage get: route reads current SO first, then re-reads the
      // updated SO after writing. Mirror that here.
      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [
          {
            id: 'package-policy-1',
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
                        'default--my-pack': {
                          shard: 100,
                          pack_id: 'pack-id',
                          default_native_schedule: { interval: 60 },
                          queries: {},
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([{ id: 'policy-1', name: 'policy-1' }]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          // `policy_ids` deliberately omitted — must not strip the pack.
          schedule_type: 'rrule',
          rrule_schedule: rruleValue,
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);

      const [, , packagePolicyId, updatedPackagePolicy] = packagePolicyUpdate.mock.calls[0];
      expect(packagePolicyId).toBe('package-policy-1');

      const writtenPacks = updatedPackagePolicy.inputs[0].config.osquery.value.packs;
      expect(writtenPacks).toHaveProperty('default--my-pack');
      const writtenPack = writtenPacks['default--my-pack'];
      expect(writtenPack.pack_name).toBe('my-pack');
      // Mode flipped on the wire: no stale native schedule, rrule slot present.
      expect(writtenPack.default_native_schedule).toBeUndefined();
      expect(writtenPack.default_rrule_schedule).toEqual(rruleValue);
    });

    it('enabled flip true + policy_ids omitted — uses current agent policy ids, not empty set', async () => {
      // When policy_ids is absent, enabling the pack must not detach it from
      // its existing policy.
      const currentSO = {
        ...basePackSO,
        references: [{ id: 'policy-1', name: 'policy-1', type: 'ingest-agent-policies' }],
        attributes: {
          ...basePackSO.attributes,
          enabled: false,
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
        },
      };
      const updatedSO = {
        ...currentSO,
        attributes: { ...currentSO.attributes, enabled: true },
      };

      // Two-stage get: route reads current SO first, then re-reads the updated
      // SO after writing. Mirror the pattern used in the regression test above.
      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [
          {
            id: 'package-policy-1',
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
                        'default--my-pack': {
                          shard: 100,
                          pack_id: 'pack-id',
                          default_native_schedule: { interval: 60 },
                          queries: {},
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([{ id: 'policy-1', name: 'policy-1' }]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          // `policy_ids` deliberately omitted — must NOT detach pack from policy-1.
          enabled: true,
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      // The enable-flip branch must call packagePolicyService.update for policy-1.
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);

      const [, , packagePolicyId, updatedPackagePolicy] = packagePolicyUpdate.mock.calls[0];
      expect(packagePolicyId).toBe('package-policy-1');

      // Pack block for 'default--my-pack' must be present (not stripped).
      const writtenPacks = updatedPackagePolicy.inputs[0].config.osquery.value.packs;
      expect(writtenPacks).toHaveProperty('default--my-pack');
    });

    it('read → merge → write preserves _unknown sub-fields on rrule_schedule when request omits schedule fields', async () => {
      // An SO that already has extra/unknown sub-fields on rrule_schedule
      // must survive a PUT that touches only non-schedule fields.
      // The scheduleSoPatch must be completely empty in this case, so no
      // `rrule_schedule` key reaches the SO write at all.
      const rruleWithUnknown = {
        rrule: 'FREQ=DAILY',
        start_date: '2026-01-01T00:00:00Z',
        _unknown_subfield: 'preserved-value',
      };
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          schedule_type: 'rrule' as const,
          interval: null,
          rrule_schedule: rruleWithUnknown,
        },
      };
      // Second get (after write) returns the SO with the unknown field intact.
      const updatedSO = {
        ...currentSO,
        attributes: { ...currentSO.attributes, description: 'new description' },
      };
      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: [],
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { description: 'new description' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      // scheduleSoPatch must be empty — no schedule key touches the SO write.
      const updateCall = mockClient.update.mock.calls[0];
      const patchedAttributes = updateCall[2];
      expect(patchedAttributes).not.toHaveProperty('schedule_type');
      expect(patchedAttributes).not.toHaveProperty('interval');
      expect(patchedAttributes).not.toHaveProperty('rrule_schedule');

      // The second get returns the SO with _unknown_subfield intact.
      const secondGetResult = await mockClient.get.mock.results[1].value;
      expect(secondGetResult.attributes.rrule_schedule._unknown_subfield).toBe('preserved-value');
    });

    it('partial same-mode rrule update — body sends only `rrule`, merge preserves start_date and splay', async () => {
      // A partial body must be able to PATCH just `rrule` without restating start_date/splay.
      const existingRrule = {
        rrule: 'FREQ=MINUTELY;INTERVAL=2',
        start_date: '2026-01-01T00:00:00Z',
        splay: '30s',
      };
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          schedule_type: 'rrule' as const,
          interval: null,
          rrule_schedule: existingRrule,
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO, {});

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          rrule_schedule: { rrule: 'FREQ=MINUTELY;INTERVAL=3' },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      // The validator must NOT 400 the merged result.
      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const updateCall = mockClient.update.mock.calls[0];
      const patchedAttributes = updateCall[2];
      // Merged result: new `rrule`, preserved `start_date` + `splay`.
      expect(patchedAttributes.rrule_schedule).toEqual({
        rrule: 'FREQ=MINUTELY;INTERVAL=3',
        start_date: '2026-01-01T00:00:00Z',
        splay: '30s',
      });
    });

    it('partial same-mode rrule update — per-query body sends only `splay`, merge preserves rrule and start_date', async () => {
      // Per-query mirror of the pack-level partial-merge case. A client
      // bumping just `splay` on one query override must not have to
      // restate the per-query `rrule` / `start_date`. The strict
      // packQueryRecordRt would 400; the partial variant + per-query
      // merge in update_pack_route lets it through.
      const existingPackRrule = {
        rrule: 'FREQ=MINUTELY;INTERVAL=10',
        start_date: '2026-01-01T00:00:00Z',
      };
      const existingQueryRrule = {
        rrule: 'FREQ=MINUTELY;INTERVAL=10',
        start_date: '2026-01-01T00:00:00Z',
        splay: '15s',
      };
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          schedule_type: 'rrule' as const,
          interval: null,
          rrule_schedule: existingPackRrule,
          queries: [
            {
              id: 'q1',
              name: 'q1',
              query: 'select 1;',
              schedule_id: 'sched-1',
              start_date: '2026-01-01T00:00:00Z',
              schedule_type: 'rrule' as const,
              rrule_schedule: existingQueryRrule,
            },
          ],
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO, {});

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          queries: {
            q1: {
              query: 'select 1;',
              schedule_type: 'rrule',
              rrule_schedule: { splay: '90s' },
            },
          },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const updateCall = mockClient.update.mock.calls[0];
      const writtenQueries = updateCall[2].queries as Array<{
        id: string;
        rrule_schedule?: typeof existingQueryRrule;
      }>;
      const q1Write = writtenQueries.find((q) => q.id === 'q1');
      // Merged result on the per-query override: new `splay`, preserved
      // `rrule` + `start_date` from the existing SO entry.
      expect(q1Write?.rrule_schedule).toEqual({
        rrule: 'FREQ=MINUTELY;INTERVAL=10',
        start_date: '2026-01-01T00:00:00Z',
        splay: '90s',
      });
    });

    it('same-mode update with only schedule_type sent — does not overwrite rrule_schedule, _unknown sub-fields survive', async () => {
      // Sending `schedule_type: 'rrule'` with no `rrule_schedule` in the body
      // is a same-mode, no-transition update. The patch must include
      // `schedule_type` (scheduleTypePresent === true) but NOT `rrule_schedule`
      // (rruleSchedulePresent === false, transitioned === false).
      const rruleWithUnknown = {
        rrule: 'FREQ=DAILY',
        start_date: '2026-01-01T00:00:00Z',
        _unknown_subfield: 'preserved-value',
      };
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          schedule_type: 'rrule' as const,
          interval: null,
          rrule_schedule: rruleWithUnknown,
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO, {});

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          description: 'x',
          schedule_type: 'rrule',
          // rrule_schedule deliberately omitted — same mode, no transition.
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const updateCall = mockClient.update.mock.calls[0];
      const patchedAttributes = updateCall[2];
      // schedule_type is present in the patch (scheduleTypePresent is true).
      expect(patchedAttributes.schedule_type).toBe('rrule');
      // rrule_schedule is NOT in the patch — no overwrite of the existing SO value.
      expect(patchedAttributes).not.toHaveProperty('rrule_schedule');
    });

    it('feature flag off — RRULE body fields stripped, pack without pack-level schedule passes validation', async () => {
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          schedule_type: undefined,
          interval: undefined,
          rrule_schedule: undefined,
        },
      };
      const rruleValue = { rrule: 'FREQ=DAILY', start_date: '2026-01-01T00:00:00Z' };
      const mockClient = buildMockSavedObjectsClient(currentSO, {});

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(false);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          name: 'my-pack',
          schedule_type: 'rrule',
          rrule_schedule: rruleValue,
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const updateCall = mockClient.update.mock.calls[0];
      const patchedAttributes = updateCall[2];
      expect(patchedAttributes).not.toHaveProperty('schedule_type');
      expect(patchedAttributes).not.toHaveProperty('rrule_schedule');
    });

    it('feature flag off + per-query rrule on SO — response queries omit schedule_type and rrule_schedule', async () => {
      const rruleValue = { rrule: 'FREQ=HOURLY', start_date: '2026-01-01T00:00:00Z' };
      const soWithPerQueryRrule = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          queries: [
            {
              id: 'q1',
              name: 'q1',
              query: 'SELECT 1',
              schedule_type: 'rrule',
              rrule_schedule: rruleValue,
              interval: 60,
            },
          ],
        },
      };
      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(soWithPerQueryRrule);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: soWithPerQueryRrule.attributes,
          references: [],
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(false);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { name: 'my-pack' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(getCallCount).toBeGreaterThanOrEqual(2);
      expect(mockResponse.ok).toHaveBeenCalled();
      const responseBody = mockResponse.ok.mock.calls[0][0]?.body as any;
      const responseQuery = responseBody.data.queries.q1;
      expect(responseQuery).toBeDefined();
      expect(responseQuery).not.toHaveProperty('schedule_type');
      expect(responseQuery).not.toHaveProperty('rrule_schedule');
      // Per-query interval (legacy field) MUST still surface.
      expect(responseQuery.interval).toBe(60);
    });

    it('disabled pack PUT with flag off — pack-level schedule_type and rrule_schedule do not leak in response', async () => {
      // Regression for the early-return that previously returned the raw SO
      // bypassing both the response envelope and the flag gate.
      const rruleValue = {
        rrule: 'FREQ=WEEKLY',
        start_date: '2026-06-01T00:00:00Z',
      };
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          enabled: false,
          schedule_type: 'rrule' as const,
          rrule_schedule: rruleValue,
          interval: null,
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO);

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(false);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { description: 'flag-off-leak-probe' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalled();
      const responseBody = mockResponse.ok.mock.calls[0][0]?.body as any;
      // The PackResponseData envelope replaces the raw SO. None of the SO
      // metadata fields are present.
      expect(responseBody.data).not.toHaveProperty('type');
      expect(responseBody.data).not.toHaveProperty('references');
      expect(responseBody.data).not.toHaveProperty('coreMigrationVersion');
      expect(responseBody.data.saved_object_id).toBe('pack-id');
      // Flag-off branch surfaces no schedule fields.
      expect(responseBody.data).not.toHaveProperty('schedule_type');
      expect(responseBody.data).not.toHaveProperty('rrule_schedule');
      expect(responseBody.data).not.toHaveProperty('interval');
    });

    it('disabled pack PUT with flag on — pack-level rrule_schedule surfaces via discriminated response', async () => {
      const rruleValue = {
        rrule: 'FREQ=WEEKLY',
        start_date: '2026-06-01T00:00:00Z',
      };
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          enabled: false,
          schedule_type: 'rrule' as const,
          rrule_schedule: rruleValue,
          interval: null,
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO);

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { description: 'flag-on-probe' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalled();
      const responseBody = mockResponse.ok.mock.calls[0][0]?.body as any;
      expect(responseBody.data.schedule_type).toBe('rrule');
      expect(responseBody.data.rrule_schedule).toEqual(rruleValue);
      expect(responseBody.data).not.toHaveProperty('interval');
    });

    // Regression guard for #279946: duplicated prebuilt pack has stale per-query
    // intervals. After the user sets a pack-level interval (120s), convergence must
    // drop the bare intervals so the wire emits only default_native_schedule, not
    // per-query overrides that would shadow it.
    // Uses distinct non-default values (80/100) to make the drop observable.
    it('legacy→interval transition: duplicated prebuilt pack — bare stale intervals stripped from SO and wire', async () => {
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          // No pack-level schedule_type: legacy state, as a duplicated prebuilt pack starts.
          schedule_type: undefined,
          interval: undefined,
          rrule_schedule: null,
          queries: [
            {
              id: 'forensic-1',
              name: 'forensic-1',
              query: 'SELECT * FROM users;',
              interval: 80, // stale from prebuilt pack — no explicit schedule_type
              schedule_id: 'sched-f1',
              start_date: '2025-01-01T00:00:00.000Z',
            },
            {
              id: 'forensic-2',
              name: 'forensic-2',
              query: 'SELECT * FROM processes;',
              interval: 100,
              schedule_id: 'sched-f2',
              start_date: '2025-01-01T00:00:00.000Z',
            },
          ],
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO);

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { schedule_type: 'interval', interval: 120 },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const updateCall = mockClient.update.mock.calls[0];
      const patchedAttributes = updateCall[2];

      // SO write: bare intervals stripped, schedule_id/start_date preserved.
      const writtenQueries = patchedAttributes.queries as Array<Record<string, unknown>>;
      const f1 = writtenQueries.find((q) => q.id === 'forensic-1')!;
      const f2 = writtenQueries.find((q) => q.id === 'forensic-2')!;
      expect(f1).not.toHaveProperty('interval');
      expect(f1).not.toHaveProperty('schedule_type');
      expect(f1.schedule_id).toBe('sched-f1');
      expect(f2).not.toHaveProperty('interval');
      expect(f2.schedule_id).toBe('sched-f2');

      // Pack-level schedule written.
      expect(patchedAttributes.schedule_type).toBe('interval');
      expect(patchedAttributes.interval).toBe(120);
    });

    // API convergence: a PUT with an already-interval-mode pack and a marker-less
    // per-query interval should converge (drop the bare interval) even without
    // a mode transition.
    it('interval-mode pack: marker-less per-query interval converged on non-transition update', async () => {
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          schedule_type: 'interval' as const,
          interval: 120,
          rrule_schedule: null,
          queries: [],
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO);

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      // PUT with interval mode preserved, bare per-query interval (no marker).
      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          schedule_type: 'interval',
          interval: 120,
          queries: {
            q1: { query: 'SELECT 1', interval: 80 }, // marker-less — should be converged away
            q2: { query: 'SELECT 2', interval: 100, schedule_type: 'interval' }, // explicit — must be preserved
          },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const updateCall = mockClient.update.mock.calls[0];
      const writtenQueries = updateCall[2].queries as Array<Record<string, unknown>>;
      const q1 = writtenQueries.find((q) => q.id === 'q1')!;
      const q2 = writtenQueries.find((q) => q.id === 'q2')!;

      // Marker-less bare interval dropped.
      expect(q1).not.toHaveProperty('interval');
      // Explicit override preserved.
      expect(q2.interval).toBe(100);
      expect(q2.schedule_type).toBe('interval');
    });
  });

  describe('schedule-validation error response shape', () => {
    it('returns a 400 whose body.message carries the human-readable validator string', async () => {
      // Mixed interval+rrule query payload must reject with a structured `{ message }` body.
      const rruleValue = { rrule: 'FREQ=DAILY', start_date: '2026-01-01T00:00:00Z' };
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          schedule_type: 'rrule' as const,
          interval: null,
          rrule_schedule: rruleValue,
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO, {});

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          name: 'my-pack',
          // Same mode (rrule) — the route does NOT strip per-query fields.
          schedule_type: 'rrule',
          rrule_schedule: rruleValue,
          queries: {
            q1: {
              query: 'SELECT 1',
              // Both interval AND rrule_schedule → mutual-exclusivity error.
              interval: 30,
              schedule_type: 'rrule',
              rrule_schedule: rruleValue,
            },
          },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).toHaveBeenCalledTimes(1);
      const badRequestArg = mockResponse.badRequest.mock.calls[0][0] as {
        body: { message: string };
      };
      expect(typeof badRequestArg.body).toBe('object');
      expect(typeof badRequestArg.body.message).toBe('string');
      expect(badRequestArg.body.message.length).toBeGreaterThan(0);
      expect(badRequestArg.body.message).toMatch(/interval|rrule|schedule/i);
    });
  });

  describe('response contract (PUT/GET parity)', () => {
    // PUT response must match the GET/find_packs contract.

    it('derives policy_ids from SO references, not attributes', async () => {
      const currentSO = {
        ...basePackSO,
        // Two attached legacy agent policies + one unrelated reference type
        // (prebuilt pack asset). Only ingest-agent-policies refs should
        // surface as policy_ids; the asset ref must be filtered out.
        references: [
          { id: 'policy-a', name: 'policy-a', type: LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE },
          { id: 'policy-b', name: 'policy-b', type: LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE },
          { id: 'asset-1', name: 'asset-1', type: 'osquery-pack-asset' },
        ],
        attributes: {
          ...basePackSO.attributes,
          // Spurious attrs.policy_ids that must NOT be the source of truth.
          // If buildResponseData regresses to attrs, this stale value will
          // leak into the response — the assertion below catches that.
          policy_ids: ['stale-attrs-only-policy'] as unknown as never,
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO);
      mockClient.get = jest.fn().mockResolvedValue(currentSO);
      mockClient.update = jest.fn().mockResolvedValue({
        id: 'pack-id',
        attributes: currentSO.attributes,
        references: currentSO.references,
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      // The route validates that all currentAgentPolicyIds resolve to known
      // osquery_manager package policies; otherwise it 400s with "invalid
      // policy ids" before reaching buildResponseData. Mock the lookup so
      // policy-a and policy-b are accepted.
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [
          {
            id: 'package-policy-a',
            policy_ids: ['policy-a'],
            package: { name: 'osquery_manager', version: '1.0.0' },
            inputs: [],
          },
          {
            id: 'package-policy-b',
            policy_ids: ['policy-b'],
            package: { name: 'osquery_manager', version: '1.0.0' },
            inputs: [],
          },
        ],
      });

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([
              { id: 'policy-a', name: 'policy-a' },
              { id: 'policy-b', name: 'policy-b' },
            ]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        // Description-only PUT — disabled pack → hits the early-return path
        // that calls buildResponseData without touching agent policies.
        body: { description: 'response-contract-policy-ids-probe' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalled();
      const responseBody = mockResponse.ok.mock.calls[0][0]?.body as any;
      expect(responseBody.data.policy_ids).toEqual(['policy-a', 'policy-b']);
      expect(responseBody.data.policy_ids).not.toContain('stale-attrs-only-policy');
      expect(responseBody.data.policy_ids).not.toContain('asset-1');
    });

    it('drains ALL package-policy pages, not just the first batch (>1000-policy scale)', async () => {
      // Regression: the edit path used to read package policies via an
      // offset-capped `list({ perPage: 1000, page: 1 })`. A deployment with
      // >1000 osquery package policies would then only ever see the first page,
      // silently treating a pack attached via a later-page policy as invalid.
      // The route now drains `fetchAllItems` (keyset). Split the two policies
      // across two batches: if only the first batch were read, `policy-b` would
      // fail validation and the route would 400 instead of 200.
      const currentSO = {
        ...basePackSO,
        references: [
          { id: 'policy-a', name: 'policy-a', type: LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE },
          { id: 'policy-b', name: 'policy-b', type: LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE },
        ],
        attributes: { ...basePackSO.attributes },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO);
      mockClient.get = jest.fn().mockResolvedValue(currentSO);
      mockClient.update = jest.fn().mockResolvedValue({
        id: 'pack-id',
        attributes: currentSO.attributes,
        references: currentSO.references,
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const firstBatch = [
        {
          id: 'package-policy-a',
          policy_ids: ['policy-a'],
          package: { name: 'osquery_manager', version: '1.0.0' },
          inputs: [],
        },
      ];
      // `policy-b`'s package policy lives on the SECOND page only.
      const secondBatch = [
        {
          id: 'package-policy-b',
          policy_ids: ['policy-b'],
          package: { name: 'osquery_manager', version: '1.0.0' },
          inputs: [],
        },
      ];
      const fetchAllItems = jest.fn().mockResolvedValue(
        (async function* () {
          yield firstBatch;
          yield secondBatch;
        })()
      );

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([
              { id: 'policy-a', name: 'policy-a' },
              { id: 'policy-b', name: 'policy-b' },
            ]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            fetchAllItems,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { description: 'multi-page-drain-probe' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      // Both policies (one from each page) resolved → 200, not a 400 that would
      // reject the second-page policy as unknown.
      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      expect(mockResponse.ok).toHaveBeenCalled();
      const responseBody = mockResponse.ok.mock.calls[0][0]?.body as any;
      expect(responseBody.data.policy_ids).toEqual(['policy-a', 'policy-b']);
    });

    it('returns shards as object map (Record<policyId, percent>), not SO array form', async () => {
      const currentSO = {
        ...basePackSO,
        references: [],
        attributes: {
          ...basePackSO.attributes,
          // Internal SO storage shape — array of {key,value}. The response
          // must normalize this to the documented public object form so PUT
          // matches GET / find_packs / the OpenAPI `$ref: Shards`.
          shards: [
            { key: 'policy-a', value: 50 },
            { key: 'policy-b', value: 75 },
          ] as never,
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO);

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { description: 'response-contract-shards-probe' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalled();
      const responseBody = mockResponse.ok.mock.calls[0][0]?.body as any;
      expect(responseBody.data.shards).toEqual({
        'policy-a': 50,
        'policy-b': 75,
      });
      // Make the contract explicit: not an array.
      expect(Array.isArray(responseBody.data.shards)).toBe(false);
    });

    it('empty references and empty shards — policy_ids: [], shards: {}', async () => {
      // Edge case: a pack with no agent policy attachments and no shard
      // overrides should still emit the public contract shapes (empty array
      // / empty object), not undefined or the raw SO empty array.
      const currentSO = {
        ...basePackSO,
        references: [],
        attributes: {
          ...basePackSO.attributes,
          shards: [],
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO);

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { description: 'response-contract-empty-probe' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalled();
      const responseBody = mockResponse.ok.mock.calls[0][0]?.body as any;
      expect(responseBody.data.policy_ids).toEqual([]);
      expect(responseBody.data.shards).toEqual({});
    });
  });

  // The preserve-guard must never regenerate an existing per-query
  // `schedule_id` on edit-save, and must mint one only for a query that
  // genuinely lacks it.
  describe('schedule_id preserve-guard', () => {
    const getWrittenQueries = (mockClient: ReturnType<typeof buildMockSavedObjectsClient>) =>
      mockClient.update.mock.calls[0][2].queries as Array<Record<string, unknown>>;

    it('preserves an existing schedule_id on a policy-only edit', async () => {
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          queries: [
            {
              id: 'q1',
              name: 'q1',
              query: 'SELECT 1',
              interval: 60,
              schedule_id: 'existing-sched-1',
              start_date: '2025-01-01T00:00:00.000Z',
            },
          ],
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO);
      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      // A policy-only edit: the body restates the queries (as the UI does)
      // without touching schedule_id, plus a policy_ids change.
      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          queries: { q1: { query: 'SELECT 1', interval: 60 } },
          policy_ids: [],
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      const q1 = getWrittenQueries(mockClient).find((q) => q.id === 'q1')!;
      expect(q1.schedule_id).toBe('existing-sched-1');
    });

    it('legacy query without schedule_id gets one, and a second edit preserves it', async () => {
      const legacySO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          queries: [{ id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60 }],
        },
      };
      const firstClient = buildMockSavedObjectsClient(legacySO);
      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(firstClient);

      setupRoute(true);

      const firstRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { queries: { q1: { query: 'SELECT 1', interval: 60 } } },
      });
      const firstResponse = httpServerMock.createResponseFactory();
      await routeHandler(buildMockContext() as any, firstRequest, firstResponse);

      expect(firstResponse.badRequest).not.toHaveBeenCalled();
      const mintedQuery = getWrittenQueries(firstClient).find((q) => q.id === 'q1')!;
      const mintedScheduleId = mintedQuery.schedule_id as string;
      expect(mintedScheduleId).toEqual(expect.any(String));
      expect(mintedScheduleId.length).toBeGreaterThan(0);

      // Second edit: the SO now carries the minted schedule_id. A subsequent
      // save must preserve it byte-for-byte.
      const secondSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          queries: getWrittenQueries(firstClient) as PackSavedObject['queries'],
        },
      };
      const secondClient = buildMockSavedObjectsClient(secondSO);
      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(secondClient);

      setupRoute(true);

      const secondRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { queries: { q1: { query: 'SELECT 1', interval: 60 } } },
      });
      const secondResponse = httpServerMock.createResponseFactory();
      await routeHandler(buildMockContext() as any, secondRequest, secondResponse);

      expect(secondResponse.badRequest).not.toHaveBeenCalled();
      const preservedQuery = getWrittenQueries(secondClient).find((q) => q.id === 'q1')!;
      expect(preservedQuery.schedule_id).toBe(mintedScheduleId);
    });

    it('preserves schedule_id across a query rename via the incoming `id`', async () => {
      // The stored query id is `old-name`. The edit renames it (new map key
      // `new-name`) but carries the original `id` in the payload so the guard
      // resolves the stored query and preserves its schedule_id instead of
      // minting a fresh one and severing the query's scheduled history.
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          queries: [
            {
              id: 'old-name',
              name: 'old-name',
              query: 'SELECT 1',
              interval: 60,
              schedule_id: 'sched-to-preserve',
              start_date: '2025-01-01T00:00:00.000Z',
            },
          ],
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO);
      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          queries: {
            'new-name': { id: 'old-name', query: 'SELECT 1', interval: 60 },
          },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      const written = getWrittenQueries(mockClient);
      // The query is written under its new id (rebuilt from the map key)...
      const renamed = written.find((q) => q.id === 'new-name')!;
      expect(renamed).toBeDefined();
      // ...and the original schedule_id survives the rename.
      expect(renamed.schedule_id).toBe('sched-to-preserve');
      // No stale `id` from the payload is persisted onto the query value.
      expect(renamed.id).toBe('new-name');
    });

    it('route validation accepts a per-query `id` on the update body', () => {
      // The rename-preservation path above relies on the request body being
      // allowed to carry a per-query `id`. This pins that the real route
      // validation (io-ts decode + exactCheck) accepts it rather than 400ing.
      const validate = buildRouteValidation(updatePacksRequestBodySchema);
      const ok = jest.fn((value) => ({ value }));
      const badRequest = jest.fn((error) => ({ error }));

      validate({ queries: { 'new-name': { id: 'old-name', query: 'SELECT 1', interval: 60 } } }, {
        ok,
        badRequest,
      } as never);

      expect(badRequest).not.toHaveBeenCalled();
      expect(ok).toHaveBeenCalledTimes(1);
    });

    it('does not let two queries collide on one schedule_id when a stale `id` is reused', async () => {
      // A stale/duplicate client-supplied id must not make two queries
      // inherit the same stored schedule_id — each stored row is consumable once.
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          queries: [
            {
              id: 'q1',
              name: 'q1',
              query: 'SELECT 1',
              interval: 60,
              schedule_id: 'sid-q1',
              start_date: '2025-01-01T00:00:00.000Z',
            },
            {
              id: 'q2',
              name: 'q2',
              query: 'SELECT 2',
              interval: 60,
              schedule_id: 'sid-q2',
              start_date: '2025-01-01T00:00:00.000Z',
            },
          ],
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO);
      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          queries: {
            q1: { id: 'q1', query: 'SELECT 1', interval: 60 },
            q2: { id: 'q1', query: 'SELECT 2', interval: 60 }, // <-- stale/wrong id
          },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      const written = getWrittenQueries(mockClient);
      const q1 = written.find((q) => q.id === 'q1')!;
      const q2 = written.find((q) => q.id === 'q2')!;
      expect(q1.schedule_id).toBe('sid-q1');
      expect(q2.schedule_id).not.toBe('sid-q1');
      expect(q1.schedule_id).not.toBe(q2.schedule_id);
    });

    it('honors an explicit rename `id` claim over another query`s own map key, regardless of order', async () => {
      // Explicit rename intent wins the stored row regardless of key order.
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          queries: [
            {
              id: 'q1',
              name: 'q1',
              query: 'SELECT 1',
              interval: 60,
              schedule_id: 'sid-q1',
              start_date: '2025-01-01T00:00:00.000Z',
            },
          ],
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO);
      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          queries: {
            other: { id: 'q1', query: 'SELECT 2', interval: 60 }, // claims q1's id
            q1: { id: 'q1', query: 'SELECT 1', interval: 60 }, // also claims q1's id
          },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      const written = getWrittenQueries(mockClient);
      const q1 = written.find((q) => q.id === 'q1')!;
      const other = written.find((q) => q.id === 'other')!;
      // The first id-claimant (`other`) wins the stored row; `q1` mints fresh.
      expect(other.schedule_id).toBe('sid-q1');
      expect(q1.schedule_id).not.toBe('sid-q1');
    });

    it('rename plus name reuse does not misattribute schedule_id (regression)', async () => {
      // Rename must win over a new query reusing the freed map key.
      const currentSO = {
        ...basePackSO,
        attributes: {
          ...basePackSO.attributes,
          queries: [
            {
              id: 'old-name',
              name: 'old-name',
              query: 'SELECT 1',
              interval: 60,
              schedule_id: 'sched-to-preserve',
              start_date: '2025-01-01T00:00:00.000Z',
            },
          ],
        },
      };
      const mockClient = buildMockSavedObjectsClient(currentSO);
      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      setupRoute(true);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          queries: {
            'old-name': { query: 'SELECT 2', interval: 60 }, // new query reusing the freed name
            'new-name': { id: 'old-name', query: 'SELECT 1', interval: 60 }, // the rename
          },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      const written = getWrittenQueries(mockClient);
      const renamed = written.find((q) => q.id === 'new-name')!;
      const reused = written.find((q) => q.id === 'old-name')!;
      expect(renamed.schedule_id).toBe('sched-to-preserve');
      expect(reused.schedule_id).toEqual(expect.any(String));
      expect(reused.schedule_id).not.toBe(renamed.schedule_id);
    });
  });

  // A concurrent modification of the Fleet package policy surfaces as a Boom
  // 409 from packagePolicyService.update. The pack SO write already succeeded,
  // so the route must map that specific failure to `response.conflict` (retry
  // guidance) — and rethrow any OTHER failure so it isn't silently downgraded.
  describe('Fleet package-policy update failure handling', () => {
    // Reuses the enable-flip + policy_ids-omitted harness (the branch that
    // calls packagePolicyService.update), varying only the update rejection.
    const setupWithPackagePolicyUpdate = (packagePolicyUpdate: jest.Mock) => {
      const currentSO = {
        ...basePackSO,
        references: [{ id: 'policy-1', name: 'policy-1', type: 'ingest-agent-policies' }],
        attributes: {
          ...basePackSO.attributes,
          enabled: false,
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
        },
      };
      const updatedSO = {
        ...currentSO,
        attributes: { ...currentSO.attributes, enabled: true },
      };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [
          {
            id: 'package-policy-1',
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
                        'default--my-pack': {
                          shard: 100,
                          pack_id: 'pack-id',
                          default_native_schedule: { interval: 60 },
                          queries: {},
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([{ id: 'policy-1', name: 'policy-1' }]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;
    };

    it('maps a Boom 409 conflict from packagePolicyService.update to response.conflict', async () => {
      const packagePolicyUpdate = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('Conflict'), { output: { statusCode: 409 } }));
      setupWithPackagePolicyUpdate(packagePolicyUpdate);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { enabled: true },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      // The pack SO write already succeeded → surface a retryable conflict.
      expect(mockResponse.conflict).toHaveBeenCalledTimes(1);
      // Not swallowed into a 200 nor thrown as a 500.
      expect(mockResponse.ok).not.toHaveBeenCalled();
      const conflictArg = mockResponse.conflict.mock.calls[0][0] as { body: { message: string } };
      expect(conflictArg.body.message).toMatch(/modified concurrently|retry/i);
    });

    it('rethrows a generic (non-409) packagePolicyService.update failure — not downgraded', async () => {
      const packagePolicyUpdate = jest.fn().mockRejectedValue(new Error('boom-generic'));
      setupWithPackagePolicyUpdate(packagePolicyUpdate);

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { enabled: true },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      // A non-conflict error must propagate out of the handler, not be mapped
      // to conflict or swallowed into a success response.
      await expect(
        routeHandler(buildMockContext() as any, mockRequest, mockResponse)
      ).rejects.toThrow('boom-generic');

      expect(mockResponse.conflict).not.toHaveBeenCalled();
      expect(mockResponse.ok).not.toHaveBeenCalled();
    });
  });

  // A Fleet package policy's `policy_ids` can span multiple of the pack's
  // agent policies. Every additive write branch (enable-flip and the merged
  // add/update grouped-write pass) must dedup by resolved package-policy id
  // so a shared package policy is written exactly once. The disable and
  // remove branches are intentionally exempt (they only ever remove).
  describe('Fleet package-policy write dedup', () => {
    const sharedOsqueryPackagePolicy = (policyIds: string[]) => ({
      id: 'shared-package-policy',
      policy_ids: policyIds,
      package: { name: 'osquery_manager', version: '1.0.0' },
      inputs: [
        {
          type: 'osquery',
          streams: [],
          config: { osquery: { value: { packs: {} } } },
        },
      ],
    });

    it('enable branch: shared package policy is updated exactly once', async () => {
      const currentSO = {
        ...basePackSO,
        references: [],
        attributes: {
          ...basePackSO.attributes,
          enabled: false,
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
        },
      };
      const updatedSO = { ...currentSO, attributes: { ...currentSO.attributes, enabled: true } };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [sharedOsqueryPackagePolicy(['policy-a', 'policy-b'])],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([
              { id: 'policy-a', name: 'policy-a' },
              { id: 'policy-b', name: 'policy-b' },
            ]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { enabled: true, policy_ids: ['policy-a', 'policy-b'] },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      // Without dedup this would be called twice (once per agent policy)
      // against the same package-policy id.
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      expect(packagePolicyUpdate.mock.calls[0][2]).toBe('shared-package-policy');

      const writtenPacks =
        packagePolicyUpdate.mock.calls[0][3].inputs[0].config.osquery.value.packs;
      expect(Object.keys(writtenPacks)).toHaveLength(1);
    });

    it('grouped write (newly-added agent policies): two agent policies sharing one package policy update it exactly once', async () => {
      const currentSO = {
        ...basePackSO,
        // No existing agent-policy attachments — both target ids below are newly added.
        references: [],
        attributes: {
          ...basePackSO.attributes,
          enabled: true,
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
        },
      };
      const updatedSO = { ...currentSO };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: [
            { id: 'policy-a', name: 'policy-a', type: 'ingest-agent-policies' },
            { id: 'policy-b', name: 'policy-b', type: 'ingest-agent-policies' },
          ],
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [sharedOsqueryPackagePolicy(['policy-a', 'policy-b'])],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([
              { id: 'policy-a', name: 'policy-a' },
              { id: 'policy-b', name: 'policy-b' },
            ]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        // `enabled` omitted (unchanged) so this hits the add/update/remove
        // diff branch rather than the enable-flip branch.
        body: { policy_ids: ['policy-a', 'policy-b'] },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      expect(packagePolicyUpdate.mock.calls[0][2]).toBe('shared-package-policy');

      // Mirror the enable/update sibling tests: the pack block is written once.
      const writtenPacks =
        packagePolicyUpdate.mock.calls[0][3].inputs[0].config.osquery.value.packs;
      expect(Object.keys(writtenPacks)).toHaveLength(1);
      expect(writtenPacks).toHaveProperty('default--my-pack');
    });

    it('grouped write (already-attached agent policies): two agent policies sharing one package policy update it exactly once', async () => {
      const currentSO = {
        ...basePackSO,
        // Both agent policies are already attached — neither is an add nor a
        // remove, so both resolve into the same grouped write target.
        references: [
          { id: 'policy-a', name: 'policy-a', type: 'ingest-agent-policies' },
          { id: 'policy-b', name: 'policy-b', type: 'ingest-agent-policies' },
        ],
        attributes: {
          ...basePackSO.attributes,
          enabled: true,
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
        },
      };
      const updatedSO = { ...currentSO };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [sharedOsqueryPackagePolicy(['policy-a', 'policy-b'])],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([
              { id: 'policy-a', name: 'policy-a' },
              { id: 'policy-b', name: 'policy-b' },
            ]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        // `enabled` omitted (unchanged) and `policy_ids` identical to the
        // current attachments, so both agent policy ids fall into the
        // `agentPolicyIdsToUpdate` bucket rather than add/remove.
        body: { policy_ids: ['policy-a', 'policy-b'], description: 'updated description' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      // Without dedup this would be called twice (once per agent policy)
      // against the same package-policy id.
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      expect(packagePolicyUpdate.mock.calls[0][2]).toBe('shared-package-policy');

      const writtenPacks =
        packagePolicyUpdate.mock.calls[0][3].inputs[0].config.osquery.value.packs;
      expect(Object.keys(writtenPacks)).toHaveLength(1);
    });

    it('grouped write (already-attached agent policies): shared package policy with differing shards resolves deterministically (max rule)', async () => {
      const currentSO = {
        ...basePackSO,
        references: [
          { id: 'policy-a', name: 'policy-a', type: 'ingest-agent-policies' },
          { id: 'policy-b', name: 'policy-b', type: 'ingest-agent-policies' },
        ],
        attributes: {
          ...basePackSO.attributes,
          enabled: true,
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
        },
      };
      const updatedSO = { ...currentSO };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [sharedOsqueryPackagePolicy(['policy-a', 'policy-b'])],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([
              { id: 'policy-a', name: 'policy-a' },
              { id: 'policy-b', name: 'policy-b' },
            ]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          policy_ids: ['policy-a', 'policy-b'],
          shards: { 'policy-a': 25, 'policy-b': 75 },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      const updatedPackagePolicy = packagePolicyUpdate.mock.calls[0][3];
      const writtenPack =
        updatedPackagePolicy.inputs[0].config.osquery.value.packs['default--my-pack'];
      // The wire has one `shard` slot per pack block, so a shared package policy
      // covering two differently-sharded agent policies must collapse to one
      // value. Widest-wins (max) is order-independent and does not silently
      // shrink the configured rollout.
      expect(writtenPack.shard).toBe(75);
    });

    it('grouped write (mixed already-attached + newly-added): shared package policy is written once with deterministic shard', async () => {
      // policy-a is already attached and policy-b is newly added; both resolve to
      // the SAME package policy. Before add/update were merged into a single
      // grouped-write pass, these were written from two separate passes over the
      // same stale base — the second overwriting the first and dropping policy-a's
      // shard (75) with policy-b's (25).
      const currentSO = {
        ...basePackSO,
        references: [{ id: 'policy-a', name: 'policy-a', type: 'ingest-agent-policies' }],
        attributes: {
          ...basePackSO.attributes,
          enabled: true,
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
        },
      };
      const updatedSO = {
        ...currentSO,
        references: [
          { id: 'policy-a', name: 'policy-a', type: 'ingest-agent-policies' },
          { id: 'policy-b', name: 'policy-b', type: 'ingest-agent-policies' },
        ],
      };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: updatedSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [sharedOsqueryPackagePolicy(['policy-a', 'policy-b'])],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([
              { id: 'policy-a', name: 'policy-a' },
              { id: 'policy-b', name: 'policy-b' },
            ]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        // `enabled` omitted (unchanged) so this hits the add/update/remove diff
        // branch. policy-a stays (update bucket), policy-b is added (add bucket).
        body: {
          policy_ids: ['policy-a', 'policy-b'],
          shards: { 'policy-a': 75, 'policy-b': 25 },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      // Exactly one write to the shared package policy, not one per bucket.
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      expect(packagePolicyUpdate.mock.calls[0][2]).toBe('shared-package-policy');

      const writtenPacks =
        packagePolicyUpdate.mock.calls[0][3].inputs[0].config.osquery.value.packs;
      expect(Object.keys(writtenPacks)).toHaveLength(1);
      // The single write carries the first-explicit shard (policy-a=75, which is
      // first in the policiesList), not just the newly-added policy-b's shard (25).
      expect(writtenPacks['default--my-pack'].shard).toBe(75);
    });

    it('cross-bucket + rename: shared package policy is written once, dropping the old pack key and setting the new one', async () => {
      const currentSO = {
        ...basePackSO,
        references: [{ id: 'policy-a', name: 'policy-a', type: 'ingest-agent-policies' }],
        attributes: {
          ...basePackSO.attributes,
          name: 'my-pack',
          enabled: true,
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
        },
      };
      const updatedSO = {
        ...currentSO,
        references: [
          { id: 'policy-a', name: 'policy-a', type: 'ingest-agent-policies' },
          { id: 'policy-b', name: 'policy-b', type: 'ingest-agent-policies' },
        ],
        attributes: { ...currentSO.attributes, name: 'renamed-pack' },
      };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: updatedSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      // The shared package policy already carries the pack under its OLD name.
      const sharedPackagePolicyWithOldPack = {
        ...sharedOsqueryPackagePolicy(['policy-a', 'policy-b']),
        inputs: [
          {
            type: 'osquery',
            streams: [],
            config: {
              osquery: {
                value: { packs: { 'default--my-pack': { shard: 100, queries: {} } } },
              },
            },
          },
        ],
      };
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [sharedPackagePolicyWithOldPack],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([
              { id: 'policy-a', name: 'policy-a' },
              { id: 'policy-b', name: 'policy-b' },
            ]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: {
          name: 'renamed-pack',
          policy_ids: ['policy-a', 'policy-b'],
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      const writtenPacks =
        packagePolicyUpdate.mock.calls[0][3].inputs[0].config.osquery.value.packs;
      // Old key removed, new key present — exactly one pack entry remains.
      expect(Object.keys(writtenPacks)).toEqual(['default--renamed-pack']);
    });
  });

  describe('disable branch — removes from every wire-attached package policy', () => {
    // Regression for #279224: post-upgrade (9.4.3 → 9.5.0) the wire attachments
    // and the pack SO references can diverge. Disable must scan the wire
    // (policyHasPack), not the references, or the pack keeps running on agents
    // while the SO reads `enabled: false`.
    const buildDisableClient = (currentSO: typeof basePackSO) => {
      const updatedSO = {
        ...currentSO,
        attributes: { ...currentSO.attributes, enabled: false },
      };
      let getCallCount = 0;

      return {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };
    };

    const buildWirePolicy = (id: string, policyIds: string[], packKey = 'default--my-pack') => ({
      id,
      policy_ids: policyIds,
      package: { name: 'osquery_manager', version: '1.0.0' },
      inputs: [
        {
          type: 'osquery',
          streams: [],
          config: {
            osquery: {
              value: {
                packs: {
                  [packKey]: {
                    shard: 100,
                    pack_id: 'pack-id',
                    default_native_schedule: { interval: 60 },
                    queries: {},
                  },
                },
              },
            },
          },
        },
      ],
    });

    const runDisable = async (currentSO: typeof basePackSO, wirePolicies: unknown[]) => {
      const mockClient = buildDisableClient(currentSO);
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({ items: wirePolicies });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { enabled: false },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      return { packagePolicyUpdate, mockResponse };
    };

    it('removes the pack from a wire policy NOT covered by SO references (post-upgrade drift)', async () => {
      const currentSO = {
        ...basePackSO,
        // Diverged: wire carries the pack but the SO no longer references the
        // agent policy that owns the package policy.
        references: [],
        attributes: { ...basePackSO.attributes, name: 'my-pack', enabled: true },
      };

      const { packagePolicyUpdate, mockResponse } = await runDisable(currentSO, [
        buildWirePolicy('package-policy-1', ['policy-1']),
      ]);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);

      const [, , packagePolicyId, updatedPackagePolicy] = packagePolicyUpdate.mock.calls[0];
      expect(packagePolicyId).toBe('package-policy-1');
      const writtenPacks = updatedPackagePolicy.inputs[0].config.osquery.value.packs;
      expect(writtenPacks).not.toHaveProperty('default--my-pack');
    });

    it('removes the pack from EVERY wire-attached policy (global/shard pack, empty references)', async () => {
      const currentSO = {
        ...basePackSO,
        references: [],
        attributes: {
          ...basePackSO.attributes,
          name: 'my-pack',
          enabled: true,
          shards: [{ key: '*', value: 100 }],
        },
      };

      const { packagePolicyUpdate } = await runDisable(currentSO, [
        buildWirePolicy('package-policy-1', ['policy-1']),
        buildWirePolicy('package-policy-2', ['policy-2']),
      ]);

      expect(packagePolicyUpdate).toHaveBeenCalledTimes(2);
      const updatedIds = packagePolicyUpdate.mock.calls.map((call) => call[2]).sort();
      expect(updatedIds).toEqual(['package-policy-1', 'package-policy-2']);
      packagePolicyUpdate.mock.calls.forEach((call) => {
        const writtenPacks = call[3].inputs[0].config.osquery.value.packs;
        expect(writtenPacks).not.toHaveProperty('default--my-pack');
      });
    });

    it('still removes the pack when references are aligned with the wire (no regression)', async () => {
      const currentSO = {
        ...basePackSO,
        references: [{ id: 'policy-1', name: 'policy-1', type: 'ingest-agent-policies' }],
        attributes: { ...basePackSO.attributes, name: 'my-pack', enabled: true },
      };

      const { packagePolicyUpdate } = await runDisable(currentSO, [
        buildWirePolicy('package-policy-1', ['policy-1']),
      ]);

      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      const writtenPacks =
        packagePolicyUpdate.mock.calls[0][3].inputs[0].config.osquery.value.packs;
      expect(writtenPacks).not.toHaveProperty('default--my-pack');
    });

    it('updates a package policy shared by multiple agent policies exactly once', async () => {
      const currentSO = {
        ...basePackSO,
        // Both owning agent policies are referenced, so the pre-fix
        // reference-driven loop resolved the same shared package policy twice
        // and wrote it twice. Keep them populated or this asserts the wire scan
        // rather than the dedup.
        references: [
          { id: 'policy-1', name: 'policy-1', type: 'ingest-agent-policies' },
          { id: 'policy-2', name: 'policy-2', type: 'ingest-agent-policies' },
        ],
        attributes: { ...basePackSO.attributes, name: 'my-pack', enabled: true },
      };

      // One package policy owned by two agent policies. The wire scan iterates
      // package policies (not agent-policy references), so it must be updated a
      // single time rather than once per owning agent policy.
      const { packagePolicyUpdate } = await runDisable(currentSO, [
        buildWirePolicy('shared-package-policy', ['policy-1', 'policy-2']),
      ]);

      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      expect(packagePolicyUpdate.mock.calls[0][2]).toBe('shared-package-policy');
      const writtenPacks =
        packagePolicyUpdate.mock.calls[0][3].inputs[0].config.osquery.value.packs;
      expect(writtenPacks).not.toHaveProperty('default--my-pack');
    });

    it('removes a pack stored on the wire under a legacy (unprefixed) key', async () => {
      const currentSO = {
        ...basePackSO,
        references: [],
        attributes: { ...basePackSO.attributes, name: 'my-pack', enabled: true },
      };

      // Pre-namespacing wire configs keyed packs by bare name (`my-pack`)
      // rather than `default--my-pack`. Disable must clean these up too.
      const { packagePolicyUpdate } = await runDisable(currentSO, [
        buildWirePolicy('package-policy-1', ['policy-1'], 'my-pack'),
      ]);

      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      const writtenPacks =
        packagePolicyUpdate.mock.calls[0][3].inputs[0].config.osquery.value.packs;
      expect(writtenPacks).not.toHaveProperty('my-pack');
      expect(writtenPacks).not.toHaveProperty('default--my-pack');
    });
  });

  describe('policy-diff branch — wire-based detach (drifted references)', () => {
    const buildWirePolicyWithPack = (id: string, policyIds: string[]) => ({
      id,
      policy_ids: policyIds,
      package: { name: 'osquery_manager', version: '1.0.0' },
      inputs: [
        {
          type: 'osquery',
          streams: [],
          config: {
            osquery: {
              value: {
                packs: {
                  'default--my-pack': {
                    shard: 100,
                    pack_id: 'pack-id',
                    default_native_schedule: { interval: 60 },
                    queries: {},
                  },
                },
              },
            },
          },
        },
      ],
    });

    it('detaches the pack from a wire policy no longer targeted even when SO references are stale', async () => {
      const currentSO = {
        ...basePackSO,
        // Stale references: the wire carries the pack on two package policies,
        // but the SO only references one agent policy (post-upgrade drift).
        references: [{ id: 'policy-1', name: 'policy-1', type: 'ingest-agent-policies' }],
        attributes: {
          ...basePackSO.attributes,
          name: 'my-pack',
          enabled: true,
          queries: [{ id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60 }],
          shards: [],
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
        },
      };
      const updatedSO = { ...currentSO };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [
          buildWirePolicyWithPack('package-policy-1', ['policy-1']),
          // Drifted attachment: pack is on the wire but this agent policy is no
          // longer targeted and is absent from the SO references.
          buildWirePolicyWithPack('package-policy-2', ['policy-2']),
        ],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([{ id: 'policy-1', name: 'policy-1' }]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        // `enabled` omitted (unchanged) so this hits the add/update/remove
        // diff branch rather than the enable-flip branch.
        body: { policy_ids: ['policy-1'] },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const callsById = new Map(
        packagePolicyUpdate.mock.calls.map((call) => [call[2] as string, call[3]])
      );
      expect(callsById.has('package-policy-1')).toBe(true);
      expect(callsById.has('package-policy-2')).toBe(true);

      // Still-targeted policy keeps the pack on the wire.
      expect(callsById.get('package-policy-1').inputs[0].config.osquery.value.packs).toHaveProperty(
        'default--my-pack'
      );

      // Drifted, no-longer-targeted policy has the pack removed even though it
      // was not reachable through the SO references.
      expect(
        callsById.get('package-policy-2').inputs[0].config.osquery.value.packs
      ).not.toHaveProperty('default--my-pack');
    });

    it('repairs wire-attached policies in the empty-reference drift state (edit-only PUT writes to wire, never adds new blocks)', async () => {
      // Drift state: SO references are empty but the wire still carries the
      // pack on two package policies. An edit-only PUT (no policy_ids/shards)
      // must rewrite those existing blocks with current metadata — wire-first
      // discovery means references no longer gate the repair.
      const currentSO = {
        ...basePackSO,
        references: [],
        attributes: {
          ...basePackSO.attributes,
          name: 'my-pack',
          enabled: true,
          queries: [
            { id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'sched-q1' },
          ],
          shards: [],
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      };
      const updatedSO = { ...currentSO };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [
          buildWirePolicyWithPack('package-policy-1', ['policy-1']),
          buildWirePolicyWithPack('package-policy-2', ['policy-2']),
        ],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { description: 'edit-only-drifted-pack-probe' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      // Both wire-attached policies get repaired even though SO references are empty.
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(2);
      const writtenIds = packagePolicyUpdate.mock.calls.map((call) => call[2]);
      expect(writtenIds).toContain('package-policy-1');
      expect(writtenIds).toContain('package-policy-2');
      // Blocks are updated with current metadata — not added to new policies.
      const [, , , pp1] = packagePolicyUpdate.mock.calls[0];
      expect(pp1.inputs[0].config.osquery.value.packs['default--my-pack']).toBeDefined();
      expect(
        pp1.inputs[0].config.osquery.value.packs['default--my-pack'].queries.q1.schedule_id
      ).toBe('sched-q1');
    });

    it('still detaches drifted policies when the request does ask to retarget', async () => {
      // Counterpart to the guard above: an explicit `policy_ids: []` IS a
      // retarget request, so the wire must be cleaned even though the resolved
      // write-target set is empty.
      const currentSO = {
        ...basePackSO,
        references: [],
        attributes: {
          ...basePackSO.attributes,
          name: 'my-pack',
          enabled: true,
          queries: [{ id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60 }],
          shards: [],
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
        },
      };
      const updatedSO = { ...currentSO };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [buildWirePolicyWithPack('package-policy-1', ['policy-1'])],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { policy_ids: [] },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      expect(packagePolicyUpdate.mock.calls[0][2]).toBe('package-policy-1');
      expect(
        packagePolicyUpdate.mock.calls[0][3].inputs[0].config.osquery.value.packs
      ).not.toHaveProperty('default--my-pack');
    });

    it('keeps a global pack on the wire when the request omits policy_ids and shards', async () => {
      // A global pack targets policies through its stored `*` shard, not
      // through policy_ids. An edit-only PUT must not resolve to zero write
      // targets and detach the pack from every agent.
      const currentSO = {
        ...basePackSO,
        references: [],
        attributes: {
          ...basePackSO.attributes,
          name: 'my-pack',
          enabled: true,
          queries: [{ id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60 }],
          shards: [{ key: '*', value: 100 }],
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
        },
      };
      const updatedSO = { ...currentSO };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [
          buildWirePolicyWithPack('package-policy-1', ['policy-1']),
          buildWirePolicyWithPack('package-policy-2', ['policy-2']),
        ],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([
              { id: 'policy-1', name: 'policy-1' },
              { id: 'policy-2', name: 'policy-2' },
            ]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { description: 'edit-only-global-pack-probe' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const callsById = new Map(
        packagePolicyUpdate.mock.calls.map((call) => [call[2] as string, call[3]])
      );
      expect([...callsById.keys()].sort()).toEqual(['package-policy-1', 'package-policy-2']);
      callsById.forEach((updatedPackagePolicy) => {
        expect(updatedPackagePolicy.inputs[0].config.osquery.value.packs).toHaveProperty(
          'default--my-pack'
        );
      });

      // The stored `*` shard must survive an edit that never mentions shards.
      expect(mockClient.update.mock.calls[0][2].shards).toEqual([{ key: '*', value: 100 }]);
    });

    it('edit-only save attaches the block to a REFERENCED policy whose wire lacks it (drift repair)', async () => {
      // Write targets are the union of the wire scan and reference-resolved
      // policies. Wire-only would 200 advertising `policy_ids: [policy-extra]`
      // while writing nothing to it.
      const currentSO = {
        ...basePackSO,
        references: [
          { id: 'policy-1', name: 'policy-1', type: 'ingest-agent-policies' },
          { id: 'policy-extra', name: 'policy-extra', type: 'ingest-agent-policies' },
        ],
        attributes: {
          ...basePackSO.attributes,
          name: 'my-pack',
          enabled: true,
          queries: [
            { id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'sched-q1' },
          ],
          shards: [],
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      };
      const updatedSO = { ...currentSO };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      // Only policy-1 carries the pack on the wire; policy-extra does not.
      const policyWithPack = buildWirePolicyWithPack('package-policy-1', ['policy-1']);
      const policyWithoutPack = {
        id: 'package-policy-extra',
        policy_ids: ['policy-extra'],
        package: { name: 'osquery_manager', version: '1.0.0' },
        inputs: [{ type: 'osquery', streams: [], config: { osquery: { value: { packs: {} } } } }],
      };
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [policyWithPack, policyWithoutPack],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([
              { id: 'policy-1', name: 'policy-1' },
              { id: 'policy-extra', name: 'policy-extra' },
            ]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { description: 'edit-only, no policy change' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      // Both are written: the wire-carrying policy is refreshed, and the
      // referenced-but-unwired one has the block created.
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(2);
      const writtenPolicyIds = packagePolicyUpdate.mock.calls.map((call) => call[2]).sort();
      expect(writtenPolicyIds).toEqual(['package-policy-1', 'package-policy-extra']);

      // The newly attached block carries the pack's real schedule metadata, not
      // an empty shell — the whole point of reaching this policy at all.
      const extraCall = packagePolicyUpdate.mock.calls.find(
        (call) => call[2] === 'package-policy-extra'
      );
      const attachedBlock = extraCall![3].inputs[0].config.osquery.value.packs['default--my-pack'];
      expect(attachedBlock.queries.q1.schedule_id).toBe('sched-q1');
      expect(attachedBlock.queries.q1.start_date).toBe('2026-01-01T00:00:00.000Z');
    });

    it('edit-only save heals SO references when wire-attached policies are missing from them', async () => {
      // Wire carries the pack on policy-2 but SO only references policy-1.
      // An edit-only save should repair the SO references to include policy-2.
      const currentSO = {
        ...basePackSO,
        references: [{ id: 'policy-1', name: 'policy-1', type: 'ingest-agent-policies' }],
        attributes: {
          ...basePackSO.attributes,
          name: 'my-pack',
          enabled: true,
          queries: [
            { id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'sched-q1' },
          ],
          shards: [],
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      };
      const updatedSO = { ...currentSO };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: updatedSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      // Both policy-1 and policy-2 carry the pack on the wire.
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [
          buildWirePolicyWithPack('package-policy-1', ['policy-1']),
          buildWirePolicyWithPack('package-policy-2', ['policy-2']),
        ],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([
              { id: 'policy-1', name: 'policy-1' },
              { id: 'policy-2', name: 'policy-2' },
            ]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { description: 'edit-only with reference drift' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      // Wire update: both policies get repaired.
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(2);
      // Reference healing: SO update is called a 2nd time with healed references.
      // First call is the normal SO update; second is the reference heal.
      const soUpdateCalls = mockClient.update.mock.calls;
      const healCall = soUpdateCalls.find(
        (call) =>
          call[0] === 'osquery-pack' && call[2] !== undefined && Object.keys(call[2]).length === 0
      );
      expect(healCall).toBeDefined();
      const healedRefs = healCall![3].references as Array<{ id: string; type: string }>;
      const refIds = healedRefs.filter((r) => r.type === 'ingest-agent-policies').map((r) => r.id);
      expect(refIds).toContain('policy-1');
      expect(refIds).toContain('policy-2');
    });

    it('edit-only reference healing preserves a referenced policy that is absent from the wire', async () => {
      // Regression: healing must be an additive union of SO references and wire
      // attachments, not a wire-derived replacement. policy-3 has the osquery
      // integration (so it passes `getInitialPolicies` validation) but does not
      // carry THIS pack on the wire. Healing is triggered by policy-2 being
      // wire-only, and must NOT drop the policy-3 reference while repairing.
      const currentSO = {
        ...basePackSO,
        references: [
          { id: 'policy-1', name: 'policy-1', type: 'ingest-agent-policies' },
          { id: 'policy-3', name: 'policy-3', type: 'ingest-agent-policies' },
        ],
        attributes: {
          ...basePackSO.attributes,
          name: 'my-pack',
          enabled: true,
          queries: [
            { id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'sched-q1' },
          ],
          shards: [],
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      };
      const updatedSO = { ...currentSO };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: updatedSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      // policy-1 and policy-2 carry THIS pack on the wire. policy-3 has the
      // osquery integration too (a package policy exists for it, so it is a
      // valid target) but carries no pack block for `my-pack`.
      const emptyOsqueryPolicy = {
        id: 'package-policy-3',
        policy_ids: ['policy-3'],
        package: { name: 'osquery_manager', version: '1.0.0' },
        inputs: [
          {
            type: 'osquery',
            streams: [],
            config: { osquery: { value: { packs: {} } } },
          },
        ],
      };
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [
          buildWirePolicyWithPack('package-policy-1', ['policy-1']),
          buildWirePolicyWithPack('package-policy-2', ['policy-2']),
          emptyOsqueryPolicy,
        ],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([
              { id: 'policy-1', name: 'Policy One' },
              { id: 'policy-2', name: 'Policy Two' },
              { id: 'policy-3', name: 'Policy Three' },
            ]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { description: 'edit-only, refs must not shrink' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const healCall = mockClient.update.mock.calls.find(
        (call) =>
          call[0] === 'osquery-pack' && call[2] !== undefined && Object.keys(call[2]).length === 0
      );
      expect(healCall).toBeDefined();
      const healedRefs = healCall![3].references as Array<{
        id: string;
        name?: string;
        type: string;
      }>;
      const agentRefs = healedRefs.filter((r) => r.type === 'ingest-agent-policies');
      const refIds = agentRefs.map((r) => r.id).sort();

      // policy-3 survives even though it carries no block for this pack.
      expect(refIds).toEqual(['policy-1', 'policy-2', 'policy-3']);
      // Healed references carry real policy names, not raw ids.
      expect(agentRefs.find((r) => r.id === 'policy-2')?.name).toBe('Policy Two');
    });

    it('edit-only save succeeds when a wire policy_id points at a DELETED agent policy (heal skips it, no 500)', async () => {
      // The wire can reference an agent policy that no longer exists — drift is
      // the premise of this whole branch. Healing is best-effort: the dangling
      // id is dropped (getByIds ignoreMissing), the response stays 200, and no
      // reference to the dead policy is minted.
      const currentSO = {
        ...basePackSO,
        references: [{ id: 'policy-1', name: 'policy-1', type: 'ingest-agent-policies' }],
        attributes: {
          ...basePackSO.attributes,
          name: 'my-pack',
          enabled: true,
          queries: [
            { id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'sched-q1' },
          ],
          shards: [],
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      };
      const updatedSO = { ...currentSO };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      // policy-2's agent policy was deleted, but its package policy still
      // carries the pack block and lists it in policy_ids.
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [
          buildWirePolicyWithPack('package-policy-1', ['policy-1']),
          buildWirePolicyWithPack('package-policy-2', ['policy-2']),
        ],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            // Only policy-1 still exists; ignoreMissing drops policy-2.
            getByIds: jest
              .fn()
              .mockImplementation(async (_soClient, ids: string[]) =>
                ids.filter((id) => id === 'policy-1').map((id) => ({ id, name: 'Policy One' }))
              ),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { description: 'edit-only with a dangling wire policy id' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      // The save succeeds; the heal failure mode never surfaces as an error.
      expect(mockResponse.ok).toHaveBeenCalled();
      expect(mockResponse.customError).not.toHaveBeenCalled();
      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      // Both wire blocks were still repaired.
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(2);
      // No heal write happened: the only unresolved id was the dangling one.
      const healCall = mockClient.update.mock.calls.find(
        (call) =>
          call[0] === 'osquery-pack' && call[2] !== undefined && Object.keys(call[2]).length === 0
      );
      expect(healCall).toBeUndefined();
    });

    it('edit-only save preserves a deliberate shard on a SHARED package policy (no reset to 100)', async () => {
      // `policyShards` is keyed off the pack's own targets, and `agentPolicyIds`
      // holds only the pack's targets (not the shared policy's co-tenants), so
      // the max collapse sees just policy-a's explicit 25 and preserves it.
      const currentSO = {
        ...basePackSO,
        references: [{ id: 'policy-a', name: 'policy-a', type: 'ingest-agent-policies' }],
        attributes: {
          ...basePackSO.attributes,
          name: 'my-pack',
          enabled: true,
          queries: [
            { id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'sched-q1' },
          ],
          shards: [{ key: 'policy-a', value: 25 }],
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      };
      const updatedSO = { ...currentSO };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const dedicatedPolicy = buildWirePolicyWithPack('package-policy-dedicated', ['policy-a']);
      dedicatedPolicy.inputs[0].config.osquery.value.packs['default--my-pack'].shard = 25;
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyCreate = jest
        .fn()
        .mockResolvedValue({ ...dedicatedPolicy, id: 'package-policy-dedicated' });
      // One package policy shared by BOTH agent policies; the pack targets only policy-a.
      const sharedPolicy = buildWirePolicyWithPack('package-policy-shared', [
        'policy-a',
        'policy-b',
      ]);
      sharedPolicy.inputs[0].config.osquery.value.packs['default--my-pack'].shard = 25;
      const packagePolicyList = jest.fn().mockResolvedValue({ items: [sharedPolicy] });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([{ id: 'policy-a', name: 'policy-a' }]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
            create: packagePolicyCreate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { description: 'edit-only, shards untouched' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      // No dedicated policy: Fleet forbids a second osquery package policy on an
      // agent policy that already has one, so the shared policy is written.
      expect(packagePolicyCreate).not.toHaveBeenCalled();
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      expect(packagePolicyUpdate.mock.calls[0][2]).toBe('package-policy-shared');
      const writtenBlock =
        packagePolicyUpdate.mock.calls[0][3].inputs[0].config.osquery.value.packs[
          'default--my-pack'
        ];
      // The pack's own shard survives: `policyShards` is keyed off the pack's
      // targets, so only policy-a contributes and the max is its explicit 25.
      // Co-tenant policy-b is not in `agentPolicyIds` and never promotes it to 100.
      expect(writtenBlock.shard).toBe(25);
    });

    it('edit-only save preserves a deliberate shard on a LEGACY bare-keyed block', async () => {
      // `policyHasPack` matches the bare `my-pack` key too, which is how a
      // pre-space-key block enters the write set. Reading `existingShard` from
      // the canonical key only would leave it undefined, and an empty target
      // intersection then falls through to DEFAULT_PACK_SHARD — resetting a
      // deliberate 25 to 100 while the SO still reads 25.
      const currentSO = {
        ...basePackSO,
        references: [{ id: 'policy-a', name: 'policy-a', type: 'ingest-agent-policies' }],
        attributes: {
          ...basePackSO.attributes,
          name: 'my-pack',
          enabled: true,
          queries: [
            { id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'sched-q1' },
          ],
          shards: [{ key: 'policy-a', value: 25 }],
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      };
      const updatedSO = { ...currentSO };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      // The drifted package policy carries the block under the LEGACY bare key
      // with the deliberate 25, and hosts only policy-b — a co-tenant the pack
      // does not target. So its target intersection is EMPTY and only the wire
      // shard can save the 25 from DEFAULT_PACK_SHARD.
      const legacyPolicy = buildWirePolicyWithPack('package-policy-legacy', ['policy-b']);
      const legacyPacks = legacyPolicy.inputs[0].config.osquery.value.packs as Record<
        string,
        unknown
      >;
      delete legacyPacks['default--my-pack'];
      legacyPacks['my-pack'] = {
        shard: 25,
        pack_id: 'pack-id',
        default_native_schedule: { interval: 60 },
        queries: {},
      };
      // A second, block-less package policy hosts policy-a so the pack's own
      // shard key validates (`getInitialPolicies` intersects against ALL drained
      // policy_ids) without putting policy-a on the drifted policy above.
      const siblingPolicy = buildWirePolicyWithPack('package-policy-sibling', ['policy-a']);
      delete (siblingPolicy.inputs[0].config.osquery.value.packs as Record<string, unknown>)[
        'default--my-pack'
      ];
      const packagePolicyList = jest
        .fn()
        .mockResolvedValue({ items: [legacyPolicy, siblingPolicy] });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([{ id: 'policy-a', name: 'policy-a' }]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { description: 'edit-only over a legacy bare-keyed block' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      // Both are written: the drifted policy via the wire scan, the sibling via
      // the reference-resolved half of the union (attach-on-edit).
      const legacyWrite = packagePolicyUpdate.mock.calls.find(
        (call) => call[2] === 'package-policy-legacy'
      );
      if (!legacyWrite) throw new Error('drifted package policy was not written');
      const writtenPacks = legacyWrite[3].inputs[0].config.osquery.value.packs;
      // Migrated to the canonical key, and the legacy 25 survived the move.
      expect(writtenPacks['default--my-pack'].shard).toBe(25);
      expect(writtenPacks['my-pack']).toBeUndefined();
    });

    it('edit-only reference heal does NOT invent targeting from a co-tenant on a shared package policy', async () => {
      // The edit form prefills policy_ids from the response, so inventing
      // policy-b here would persist as an explicit retarget on the next save.
      const currentSO = {
        ...basePackSO,
        references: [{ id: 'policy-a', name: 'policy-a', type: 'ingest-agent-policies' }],
        attributes: {
          ...basePackSO.attributes,
          name: 'my-pack',
          enabled: true,
          queries: [
            { id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'sched-q1' },
          ],
          shards: [],
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      };
      const updatedSO = { ...currentSO };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [buildWirePolicyWithPack('package-policy-shared', ['policy-a', 'policy-b'])],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([
              { id: 'policy-a', name: 'policy-a' },
              { id: 'policy-b', name: 'policy-b' },
            ]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { description: 'edit-only on a shared package policy' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      // No heal write: policy-b is a co-tenant, not this pack's drifted target.
      const healCall = mockClient.update.mock.calls.find(
        (call) =>
          call[0] === 'osquery-pack' && call[2] !== undefined && Object.keys(call[2]).length === 0
      );
      expect(healCall).toBeUndefined();
      // And the response must not advertise the invented target.
      const responseBody = (mockResponse.ok.mock.calls[0][0]?.body as any).data;
      expect(responseBody.policy_ids).toEqual(['policy-a']);
    });

    it('edit-only save survives a THROWING reference heal (best-effort, never fails the response)', async () => {
      // The wire save has already committed when healing runs, so a heal
      // failure must be swallowed, not surfaced as a 500.
      const currentSO = {
        ...basePackSO,
        references: [{ id: 'policy-1', name: 'policy-1', type: 'ingest-agent-policies' }],
        attributes: {
          ...basePackSO.attributes,
          name: 'my-pack',
          enabled: true,
          queries: [
            { id: 'q1', name: 'q1', query: 'SELECT 1', interval: 60, schedule_id: 'sched-q1' },
          ],
          shards: [],
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      };
      const updatedSO = { ...currentSO };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: currentSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [
          buildWirePolicyWithPack('package-policy-1', ['policy-1']),
          buildWirePolicyWithPack('package-policy-2', ['policy-2']),
        ],
      });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            // Resolving the drifted id throws — the heal path's own I/O failing.
            getByIds: jest.fn().mockImplementation((_client, ids: string[]) => {
              if (ids.includes('policy-2')) {
                return Promise.reject(new Error('es_unavailable'));
              }

              return Promise.resolve([{ id: 'policy-1', name: 'policy-1' }]);
            }),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { description: 'edit-only, heal blows up' },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      // The save still succeeds; the heal failure is swallowed.
      expect(mockResponse.ok).toHaveBeenCalled();
      expect(mockResponse.customError).not.toHaveBeenCalled();
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(2);
      // No heal write committed, so the response reports the pre-heal refs.
      const responseBody = (mockResponse.ok.mock.calls[0][0]?.body as any).data;
      expect(responseBody.policy_ids).toEqual(['policy-1']);
    });
  });

  describe('over-broad shared integration (issue #285994)', () => {
    // `osquery_manager` declares `multiple: false`, so Fleet permits only ONE
    // osquery package policy per agent policy — a dedicated "targeted" policy can
    // never be created. The pack is written to the shared policy and the
    // over-reach is reported via `targeting_warning`.
    const buildSharedPolicy = (id: string, policyIds: string[]) => ({
      id,
      policy_ids: policyIds,
      package: { name: 'osquery_manager', version: '1.0.0' },
      inputs: [
        {
          type: 'osquery',
          streams: [],
          config: { osquery: { value: { packs: {} } } },
        },
      ],
    });

    it('retarget: writes the shared policy and reports the untargeted agent policy', async () => {
      const currentSO = {
        ...basePackSO,
        references: [
          { id: 'policy-a', name: 'policy-a', type: 'ingest-agent-policies' },
          { id: 'policy-b', name: 'policy-b', type: 'ingest-agent-policies' },
        ],
        attributes: {
          ...basePackSO.attributes,
          enabled: true,
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
        },
      };
      const updatedSO = {
        ...currentSO,
        references: [{ id: 'policy-a', name: 'policy-a', type: 'ingest-agent-policies' }],
        attributes: { ...currentSO.attributes },
      };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: updatedSO.references,
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      // Shared policy covers both; pack retargets to policy-a only.
      const sharedPolicy = buildSharedPolicy('shared-pp-ab', ['policy-a', 'policy-b']);
      const dedicatedPolicyForA = buildSharedPolicy('pp-dedicated-a', ['policy-a']);

      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyCreate = jest.fn().mockResolvedValue(dedicatedPolicyForA);
      const packagePolicyList = jest.fn().mockResolvedValue({ items: [sharedPolicy] });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([
              { id: 'policy-a', name: 'policy-a' },
              { id: 'policy-b', name: 'policy-b' },
            ]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
            create: packagePolicyCreate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        // Retarget: drop policy-b, keep policy-a.
        body: { policy_ids: ['policy-a'] },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalled();
      // Never attempt a dedicated policy: Fleet would always reject it.
      expect(packagePolicyCreate).not.toHaveBeenCalled();
      // The pack still reaches policy-a — writing nothing would be a worse
      // regression than the over-delivery being reported.
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      expect(packagePolicyUpdate.mock.calls[0][2]).toBe('shared-pp-ab');
      // The over-reach onto policy-b is surfaced rather than silently enforced.
      expect((mockResponse.ok.mock.calls[0][0]?.body as any).data.targeting_warning).toEqual({
        untargeted_agent_policy_names: ['policy-b'],
      });
    });

    it('global pack (shards.*) is not split even when the policy is shared', async () => {
      const currentSO = {
        ...basePackSO,
        references: [],
        attributes: {
          ...basePackSO.attributes,
          enabled: false,
          schedule_type: 'interval' as const,
          interval: 60,
          rrule_schedule: null,
          shards: [{ key: '*', value: 100 }],
        },
      };
      const updatedSO = { ...currentSO, attributes: { ...currentSO.attributes, enabled: true } };

      let getCallCount = 0;
      const mockClient = {
        get: jest.fn().mockImplementation(() => {
          getCallCount += 1;

          return Promise.resolve(getCallCount === 1 ? currentSO : updatedSO);
        }),
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        update: jest.fn().mockResolvedValue({
          id: 'pack-id',
          attributes: updatedSO.attributes,
          references: [],
        }),
        list: jest.fn().mockResolvedValue({ items: [] }),
      };

      const sharedPolicy = buildSharedPolicy('shared-pp-ab', ['policy-a', 'policy-b']);
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyCreate = jest.fn();
      const packagePolicyList = jest.fn().mockResolvedValue({ items: [sharedPolicy] });

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: jest.fn().mockResolvedValue([
              { id: 'policy-a', name: 'policy-a' },
              { id: 'policy-b', name: 'policy-b' },
            ]),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
            create: packagePolicyCreate,
          }),
        },
      } as unknown as OsqueryAppContext;

      updatePackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('put', '/api/osquery/packs/{id}');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        params: { id: 'pack-id' },
        body: { enabled: true, shards: { '*': 100 } },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalled();
      // Global pack: no split.
      expect(packagePolicyCreate).not.toHaveBeenCalled();
      // Wrote directly to the shared policy.
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      expect(packagePolicyUpdate.mock.calls[0][2]).toBe('shared-pp-ab');
    });
  });
});
