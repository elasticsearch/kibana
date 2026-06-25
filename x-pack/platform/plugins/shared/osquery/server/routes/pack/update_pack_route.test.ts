/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock, httpServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { RequestHandler } from '@kbn/core/server';
import { LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE } from '@kbn/fleet-plugin/common';
import { API_VERSIONS } from '../../../common/constants';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import type { PackSavedObject } from '../../common/types';
import { updatePackRoute } from './update_pack_route';
import { createInternalSavedObjectsClientForSpaceId } from '../../utils/get_internal_saved_object_client';
import { getUserInfo } from '../../lib/get_user_info';

jest.mock('../../utils/get_internal_saved_object_client', () => ({
  createInternalSavedObjectsClientForSpaceId: jest.fn(),
}));

jest.mock('../../lib/get_user_info', () => ({
  getUserInfo: jest.fn(),
}));

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
    it('B11 — interval → rrule: returns 200, writes rrule_schedule and nulls interval on SO', async () => {
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

    it('B12 — rrule → interval: returns 200, writes interval and nulls rrule_schedule on SO', async () => {
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
      // Repro from the review: pack runs interval with per-query `fast.interval: 30`.
      // PUT flips schedule_type to rrule WITHOUT restating queries. Without the
      // transition strip, the per-query interval survives on the SO and leaks
      // via GET/find as cross-mode state.
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

    it('policy_ids omitted — preserves existing policy attachments (no strip)', async () => {
      // Reproduces the schedule-update bug: when a PUT updates schedule fields
      // without restating `policy_ids`, the pack must remain attached to its
      // current policies. Previously, missing `policy_ids` was interpreted as
      // "intersect with empty set" by getInitialPolicies, which then drove
      // the pack out of every Fleet package policy block.
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
      // Mode flipped on the wire: no stale native schedule, rrule slot present.
      expect(writtenPack.default_native_schedule).toBeUndefined();
      expect(writtenPack.default_rrule_schedule).toEqual(rruleValue);
    });

    it('enabled flip true + policy_ids omitted — uses current agent policy ids, not empty set', async () => {
      // Locks the enable-flip branch at update_pack_route.ts:371.
      // `const policyIds = policy_ids || !isEmpty(shards) ? policiesList : currentAgentPolicyIds`
      // When `policy_ids` is absent and shards is empty, `policiesList` is built
      // from `currentAgentPolicyIds` via `getInitialPolicies`, so the pack must
      // remain attached to its existing policy. A regression here would silently
      // detach the pack from every policy on every enable toggle.
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

    it('partial same-mode rrule update — body sends only `rrule`, merge preserves start_date and splay (regression for PR#270639 r3313372939)', async () => {
      // A client editing one knob of an existing pack-level RRULE
      // (e.g. bumping `INTERVAL=2 → INTERVAL=3`) must be able to PATCH
      // just `rrule_schedule.rrule` without restating `start_date` /
      // `splay`. The strict io-ts variant (`rrule` + `start_date`
      // required) would 400 such a body before the route's
      // read → merge → write logic ran. The partial variant lets it
      // through; `resolvePackScheduleForUpdate` merges against the
      // current SO; `validatePackScheduleFields` enforces the strict
      // shape on the merged result.
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
  });

  describe('schedule-validation error response shape (6.8 / design D4)', () => {
    it('returns a 400 whose body.message carries the human-readable validator string', async () => {
      // A same-mode rrule pack (no transition → no per-query strip) whose query
      // override carries both `interval` and `rrule_schedule` is a mixed payload
      // the validator rejects. The rejection MUST be a structured `{ message }`
      // body — not a bare string — so the client toast (`error.body.message`)
      // renders the reason.
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
              // Both interval AND rrule_schedule → mutual-exclusivity error
              // (utils.ts:717).
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
      // Structured body — `message` is a non-empty human-readable string, not
      // a bare-string body (which would leave `error.body.message` undefined).
      expect(typeof badRequestArg.body).toBe('object');
      expect(typeof badRequestArg.body.message).toBe('string');
      expect(badRequestArg.body.message.length).toBeGreaterThan(0);
      // The mode-mismatch message names the conflict.
      expect(badRequestArg.body.message).toMatch(/interval|rrule|schedule/i);
    });
  });

  describe('response contract (PUT/GET parity)', () => {
    // Regression for CodeRabbit PR#270639 r4381326725 — buildResponseData was
    // pulling `policy_ids` from `attrs.policy_ids` (always undefined: the route
    // writes policies to `references`, not attributes) and emitting `shards` in
    // the SO array form instead of the public object map. These tests pin the
    // PUT response to the same contract as GET / find_packs.

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
});
