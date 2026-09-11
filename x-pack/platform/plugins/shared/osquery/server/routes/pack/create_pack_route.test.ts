/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock, httpServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { RequestHandler } from '@kbn/core/server';
import { API_VERSIONS } from '../../../common/constants';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import { createPackRoute } from './create_pack_route';
import { createInternalSavedObjectsClientForSpaceId } from '../../utils/get_internal_saved_object_client';
import { getUserInfo } from '../../lib/get_user_info';

jest.mock('../../utils/get_internal_saved_object_client', () => ({
  createInternalSavedObjectsClientForSpaceId: jest.fn(),
}));

jest.mock('../../lib/get_user_info', () => ({
  getUserInfo: jest.fn(),
}));

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

const osqueryPackagePolicy = (overrides: Record<string, unknown>) => ({
  id: 'package-policy-placeholder',
  policy_ids: [] as string[],
  package: { name: 'osquery_manager', version: '1.0.0' },
  inputs: [
    {
      type: 'osquery',
      streams: [],
      config: { osquery: { value: { packs: {} } } },
    },
  ],
  ...overrides,
});

describe('createPackRoute', () => {
  let routeHandler: RequestHandler;
  let mockOsqueryContext: OsqueryAppContext;

  const createMockRouter = () => {
    const httpService = httpServiceMock.createSetupContract();

    return httpService.createRouter();
  };

  const setupRoute = ({
    agentPolicies,
    packagePolicies,
    packagePolicyUpdate,
  }: {
    agentPolicies: Array<{ id: string; name: string }>;
    packagePolicies: Array<Record<string, unknown>>;
    packagePolicyUpdate: jest.Mock;
  }) => {
    const mockClient = {
      find: jest.fn().mockResolvedValue({ saved_objects: [] }),
      create: jest.fn().mockImplementation((_type, attributes, options) =>
        Promise.resolve({
          id: 'pack-id',
          attributes,
          references: options?.references ?? [],
        })
      ),
    };

    (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);
    (getUserInfo as jest.Mock).mockResolvedValue({ username: 'tester', profile_uid: 'uid-1' });

    const packagePolicyList = jest.fn().mockResolvedValue({ items: packagePolicies });

    const mockRouter = createMockRouter();
    mockOsqueryContext = {
      logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
      security: {},
      getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
      experimentalFeatures: { rruleScheduling: true },
      service: {
        getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
        getAgentPolicyService: jest.fn().mockReturnValue({
          getByIds: jest.fn().mockResolvedValue(agentPolicies),
        }),
        getPackagePolicyService: jest.fn().mockReturnValue({
          list: packagePolicyList,
          fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
          update: packagePolicyUpdate,
        }),
      },
    } as unknown as OsqueryAppContext;

    createPackRoute(mockRouter, mockOsqueryContext);
    const route = mockRouter.versioned.getRoute('post', '/api/osquery/packs');
    const routeVersion = route.versions[API_VERSIONS.public.v1];
    if (!routeVersion) {
      throw new Error(`Handler for version [${API_VERSIONS.public.v1}] not found!`);
    }

    routeHandler = routeVersion.handler;

    return { mockClient };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Fleet package-policy write dedup', () => {
    it('a package policy shared by two agent policies is written exactly once', async () => {
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      setupRoute({
        agentPolicies: [
          { id: 'agent-policy-a', name: 'agent-policy-a' },
          { id: 'agent-policy-b', name: 'agent-policy-b' },
        ],
        packagePolicies: [
          osqueryPackagePolicy({
            id: 'shared-package-policy',
            // Both agent policies resolve to this one Fleet package policy.
            policy_ids: ['agent-policy-a', 'agent-policy-b'],
          }),
        ],
        packagePolicyUpdate,
      });

      const mockRequest = httpServerMock.createKibanaRequest({
        body: {
          name: 'my-pack',
          enabled: true,
          policy_ids: ['agent-policy-a', 'agent-policy-b'],
          queries: { q1: { query: 'SELECT 1', interval: 60 } },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      expect(mockResponse.ok).toHaveBeenCalled();
      // The duplicate-schedule bug: without dedup, this would be called twice
      // (once per agent policy) against the SAME package-policy id.
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);

      const [, , packagePolicyId, updatedPackagePolicy] = packagePolicyUpdate.mock.calls[0];
      expect(packagePolicyId).toBe('shared-package-policy');

      const writtenPacks = updatedPackagePolicy.inputs[0].config.osquery.value.packs;
      // The pack block appears exactly once (a single key), not duplicated.
      expect(Object.keys(writtenPacks)).toHaveLength(1);
      expect(writtenPacks).toHaveProperty('default--my-pack');
    });

    it('two agent policies resolving to distinct package policies each get updated once', async () => {
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      setupRoute({
        agentPolicies: [
          { id: 'agent-policy-a', name: 'agent-policy-a' },
          { id: 'agent-policy-b', name: 'agent-policy-b' },
        ],
        packagePolicies: [
          osqueryPackagePolicy({ id: 'package-policy-a', policy_ids: ['agent-policy-a'] }),
          osqueryPackagePolicy({ id: 'package-policy-b', policy_ids: ['agent-policy-b'] }),
        ],
        packagePolicyUpdate,
      });

      const mockRequest = httpServerMock.createKibanaRequest({
        body: {
          name: 'my-pack',
          enabled: true,
          policy_ids: ['agent-policy-a', 'agent-policy-b'],
          queries: { q1: { query: 'SELECT 1', interval: 60 } },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(2);
      const updatedPolicyIds = packagePolicyUpdate.mock.calls.map((call) => call[2]);
      expect(updatedPolicyIds.sort()).toEqual(['package-policy-a', 'package-policy-b']);
    });

    it('1:1 agent-policy-to-package-policy targeting writes the same config as a single agent policy', async () => {
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      setupRoute({
        agentPolicies: [{ id: 'agent-policy-a', name: 'agent-policy-a' }],
        packagePolicies: [
          osqueryPackagePolicy({ id: 'package-policy-a', policy_ids: ['agent-policy-a'] }),
        ],
        packagePolicyUpdate,
      });

      const mockRequest = httpServerMock.createKibanaRequest({
        body: {
          name: 'my-pack',
          enabled: true,
          policy_ids: ['agent-policy-a'],
          shards: { 'agent-policy-a': 50 },
          queries: { q1: { query: 'SELECT 1', interval: 60 } },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      const updatedPackagePolicy = packagePolicyUpdate.mock.calls[0][3];
      const writtenPack =
        updatedPackagePolicy.inputs[0].config.osquery.value.packs['default--my-pack'];
      // Parity with the pre-dedup behaviour for the 1:1 case: the single agent
      // policy's own shard is used unchanged and the surrounding pack block
      // (id/name/queries) is written intact — not just the shard.
      expect(writtenPack.shard).toBe(50);
      expect(writtenPack.pack_id).toBe('pack-id');
      expect(writtenPack.pack_name).toBe('my-pack');
      expect(Object.keys(writtenPack.queries)).toEqual(['q1']);
      expect(writtenPack.queries.q1).toEqual(
        expect.objectContaining({ query: 'SELECT 1', interval: 60 })
      );
    });

    it('shared package policy with differing shards resolves deterministically (max rule)', async () => {
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      setupRoute({
        agentPolicies: [
          { id: 'agent-policy-a', name: 'agent-policy-a' },
          { id: 'agent-policy-b', name: 'agent-policy-b' },
        ],
        packagePolicies: [
          osqueryPackagePolicy({
            id: 'shared-package-policy',
            policy_ids: ['agent-policy-a', 'agent-policy-b'],
          }),
        ],
        packagePolicyUpdate,
      });

      const mockRequest = httpServerMock.createKibanaRequest({
        body: {
          name: 'my-pack',
          enabled: true,
          policy_ids: ['agent-policy-a', 'agent-policy-b'],
          shards: { 'agent-policy-a': 25, 'agent-policy-b': 75 },
          queries: { q1: { query: 'SELECT 1', interval: 60 } },
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
  });

  describe('per-query interval convergence on create', () => {
    it('marker-less bare per-query interval is dropped when pack uses interval mode', async () => {
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const { mockClient } = setupRoute({
        agentPolicies: [],
        packagePolicies: [],
        packagePolicyUpdate,
      });

      const mockRequest = httpServerMock.createKibanaRequest({
        body: {
          name: 'my-pack',
          enabled: false,
          policy_ids: [],
          schedule_type: 'interval',
          interval: 60,
          queries: {
            q1: { query: 'SELECT 1', interval: 300 }, // marker-less — should be converged away
          },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();
      expect(mockResponse.ok).toHaveBeenCalled();

      const createCall = mockClient.create.mock.calls[0];
      const createdAttributes = createCall[1];
      // Queries are stored as an object keyed by id, not an array.
      const writtenQuery = createdAttributes.queries.q1;
      // Marker-less bare interval must not reach the SO.
      expect(writtenQuery).not.toHaveProperty('interval');
      expect(writtenQuery).not.toHaveProperty('schedule_type');
    });

    it('explicit schedule_type: interval override is preserved on create', async () => {
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const { mockClient } = setupRoute({
        agentPolicies: [],
        packagePolicies: [],
        packagePolicyUpdate,
      });

      const mockRequest = httpServerMock.createKibanaRequest({
        body: {
          name: 'my-pack',
          enabled: false,
          policy_ids: [],
          schedule_type: 'interval',
          interval: 60,
          queries: {
            q1: { query: 'SELECT 1', interval: 300, schedule_type: 'interval' }, // explicit — must be preserved
          },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.badRequest).not.toHaveBeenCalled();

      const createCall = mockClient.create.mock.calls[0];
      const createdAttributes = createCall[1];
      // Queries are stored as an object keyed by id, not an array.
      const writtenQuery = createdAttributes.queries.q1;
      // Explicit override must survive convergence.
      expect(writtenQuery.interval).toBe(300);
      expect(writtenQuery.schedule_type).toBe('interval');
    });
  });

  describe('targeting_warning (over-broad shared integration detection)', () => {
    it('emits a targeting warning when the shared package policy covers an untargeted agent policy', async () => {
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});

      // Pack targets only agent-policy-a, but the shared policy also covers
      // agent-policy-b — b is untargeted and should appear in the warning.
      const packagePolicyList = jest.fn().mockResolvedValue({
        items: [
          osqueryPackagePolicy({
            id: 'shared-package-policy',
            policy_ids: ['agent-policy-a', 'agent-policy-b'],
          }),
        ],
      });

      const mockClient = {
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        create: jest.fn().mockImplementation((_type, attributes, options) =>
          Promise.resolve({
            id: 'pack-id',
            attributes,
            references: options?.references ?? [],
          })
        ),
      };

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);
      (getUserInfo as jest.Mock).mockResolvedValue({ username: 'tester', profile_uid: 'uid-1' });

      const getByIds = jest
        .fn()
        // First call: resolve targeted agent policy (agent-policy-a)
        .mockResolvedValueOnce([{ id: 'agent-policy-a', name: 'Agent Policy A' }])
        // Second call: resolve untargeted agent policy (agent-policy-b) for warning
        .mockResolvedValueOnce([{ id: 'agent-policy-b', name: 'Agent Policy B' }]);

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({ getByIds }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
          }),
        },
      } as unknown as OsqueryAppContext;

      createPackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('post', '/api/osquery/packs');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;

      const mockRequest = httpServerMock.createKibanaRequest({
        body: {
          name: 'my-pack',
          enabled: true,
          policy_ids: ['agent-policy-a'],
          queries: { q1: { query: 'SELECT 1', interval: 60 } },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalled();
      const body = mockResponse.ok.mock.calls[0][0]?.body as { data: Record<string, unknown> };
      expect(body.data.targeting_warning).toBeDefined();
      expect(body.data.targeting_warning).toEqual({
        untargeted_agent_policy_names: ['Agent Policy B'],
      });
    });

    it('does not emit a targeting warning when the package policy is not over-broad', async () => {
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      setupRoute({
        agentPolicies: [{ id: 'agent-policy-a', name: 'Agent Policy A' }],
        packagePolicies: [
          osqueryPackagePolicy({
            id: 'dedicated-package-policy',
            // Dedicated: covers only the targeted agent policy
            policy_ids: ['agent-policy-a'],
          }),
        ],
        packagePolicyUpdate,
      });

      const mockRequest = httpServerMock.createKibanaRequest({
        body: {
          name: 'my-pack',
          enabled: true,
          policy_ids: ['agent-policy-a'],
          queries: { q1: { query: 'SELECT 1', interval: 60 } },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalled();
      const body = mockResponse.ok.mock.calls[0][0]?.body as { data: Record<string, unknown> };
      expect(body.data.targeting_warning).toBeUndefined();
    });

    it('does not emit a targeting warning for a global pack even with a shared integration', async () => {
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      setupRoute({
        agentPolicies: [
          { id: 'agent-policy-a', name: 'Agent Policy A' },
          { id: 'agent-policy-b', name: 'Agent Policy B' },
        ],
        packagePolicies: [
          osqueryPackagePolicy({
            id: 'shared-package-policy',
            policy_ids: ['agent-policy-a', 'agent-policy-b'],
          }),
        ],
        packagePolicyUpdate,
      });

      const mockRequest = httpServerMock.createKibanaRequest({
        body: {
          name: 'global-pack',
          enabled: true,
          // Global pack: shards contains * key
          shards: { '*': 100 },
          queries: { q1: { query: 'SELECT 1', interval: 60 } },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalled();
      const body = mockResponse.ok.mock.calls[0][0]?.body as { data: Record<string, unknown> };
      expect(body.data.targeting_warning).toBeUndefined();
    });
  });

  describe('over-broad shared integration (issue #285994)', () => {
    // `osquery_manager` declares `multiple: false`, so Fleet permits only ONE
    // osquery package policy per agent policy. Kibana therefore cannot narrow
    // delivery by creating a dedicated policy — it writes the shared policy as
    // usual and reports the over-reach via `targeting_warning`.
    const setupOverBroadRoute = ({
      packagePolicyUpdate,
      packagePolicyCreate,
      agentPolicyNames = [{ id: 'agent-policy-b', name: 'policy-b' }],
      getByIds,
    }: {
      packagePolicyUpdate: jest.Mock;
      packagePolicyCreate: jest.Mock;
      agentPolicyNames?: Array<{ id: string; name: string }>;
      getByIds?: jest.Mock;
    }) => {
      const packagePolicies = [
        osqueryPackagePolicy({
          id: 'shared-pp-ab',
          policy_ids: ['agent-policy-a', 'agent-policy-b'],
        }),
      ];
      const packagePolicyList = jest.fn().mockResolvedValue({ items: packagePolicies });
      const mockClient = {
        find: jest.fn().mockResolvedValue({ saved_objects: [] }),
        create: jest
          .fn()
          .mockImplementation((_type, attributes, options) =>
            Promise.resolve({ id: 'pack-id', attributes, references: options?.references ?? [] })
          ),
      };

      (createInternalSavedObjectsClientForSpaceId as jest.Mock).mockResolvedValue(mockClient);
      (getUserInfo as jest.Mock).mockResolvedValue({ username: 'tester', profile_uid: 'uid-1' });

      const mockRouter = createMockRouter();
      mockOsqueryContext = {
        logFactory: { get: jest.fn().mockReturnValue(loggingSystemMock.createLogger()) },
        security: {},
        getStartServices: jest.fn().mockResolvedValue([{}, { security: {} }, {}]),
        experimentalFeatures: { rruleScheduling: true },
        service: {
          getActiveSpace: jest.fn().mockResolvedValue({ id: 'default' }),
          getAgentPolicyService: jest.fn().mockReturnValue({
            getByIds: getByIds ?? jest.fn().mockResolvedValue(agentPolicyNames),
          }),
          getPackagePolicyService: jest.fn().mockReturnValue({
            list: packagePolicyList,
            fetchAllItems: fetchAllItemsFromListMock(packagePolicyList),
            update: packagePolicyUpdate,
            create: packagePolicyCreate,
          }),
        },
      } as unknown as OsqueryAppContext;

      createPackRoute(mockRouter, mockOsqueryContext);
      const route = mockRouter.versioned.getRoute('post', '/api/osquery/packs');
      const routeVersion = route.versions[API_VERSIONS.public.v1];
      if (!routeVersion) throw new Error('no route version');
      routeHandler = routeVersion.handler;
    };

    it('writes the pack to the shared policy and warns about the untargeted agent policy', async () => {
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyCreate = jest.fn();
      setupOverBroadRoute({ packagePolicyUpdate, packagePolicyCreate });

      const mockRequest = httpServerMock.createKibanaRequest({
        body: {
          name: 'my-pack',
          enabled: true,
          // Only target agent-policy-a, NOT agent-policy-b.
          policy_ids: ['agent-policy-a'],
          queries: { q1: { query: 'SELECT 1', interval: 60 } },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalled();
      // Never attempt a dedicated policy: Fleet would always reject it.
      expect(packagePolicyCreate).not.toHaveBeenCalled();
      // The pack still reaches its target — silently writing nothing would be a
      // worse regression than the over-delivery being reported.
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      expect(packagePolicyUpdate.mock.calls[0][2]).toBe('shared-pp-ab');
      const writtenPack =
        packagePolicyUpdate.mock.calls[0][3].inputs[0].config.osquery.value.packs[
          'default--my-pack'
        ];
      expect(writtenPack.pack_name).toBe('my-pack');

      expect((mockResponse.ok.mock.calls[0][0]?.body as any).data.targeting_warning).toEqual({
        untargeted_agent_policy_names: ['policy-b'],
      });
    });

    it('reports the raw id when an untargeted agent policy no longer resolves', async () => {
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyCreate = jest.fn();
      setupOverBroadRoute({
        packagePolicyUpdate,
        packagePolicyCreate,
        agentPolicyNames: [],
      });

      const mockRequest = httpServerMock.createKibanaRequest({
        body: {
          name: 'my-pack',
          enabled: true,
          policy_ids: ['agent-policy-a'],
          queries: { q1: { query: 'SELECT 1', interval: 60 } },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalled();
      expect((mockResponse.ok.mock.calls[0][0]?.body as any).data.targeting_warning).toEqual({
        untargeted_agent_policy_names: ['agent-policy-b'],
      });
    });

    it('does not warn when the pack is created disabled (nothing is written)', async () => {
      // A disabled pack reaches no agent policy at all, so reporting over-reach
      // would be misleading — and would cost a needless agent-policy lookup.
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyCreate = jest.fn();
      setupOverBroadRoute({ packagePolicyUpdate, packagePolicyCreate });

      const mockRequest = httpServerMock.createKibanaRequest({
        body: {
          name: 'my-pack',
          enabled: false,
          policy_ids: ['agent-policy-a'],
          queries: { q1: { query: 'SELECT 1', interval: 60 } },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalled();
      expect(packagePolicyUpdate).not.toHaveBeenCalled();
      expect(
        (mockResponse.ok.mock.calls[0][0]?.body as any).data.targeting_warning
      ).toBeUndefined();
    });

    it('global pack (shards.*) is exactly targeted and carries no warning', async () => {
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyCreate = jest.fn();
      setupOverBroadRoute({ packagePolicyUpdate, packagePolicyCreate });

      const mockRequest = httpServerMock.createKibanaRequest({
        body: {
          name: 'my-pack',
          enabled: true,
          policy_ids: ['agent-policy-a'],
          shards: { '*': 100 },
          queries: { q1: { query: 'SELECT 1', interval: 60 } },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalled();
      expect(packagePolicyCreate).not.toHaveBeenCalled();
      // A global pack intends to reach everything, so reaching agent-policy-b is
      // not over-reach and the shared policy is still written.
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      expect(packagePolicyUpdate.mock.calls[0][2]).toBe('shared-pp-ab');
      expect(
        (mockResponse.ok.mock.calls[0][0]?.body as any).data.targeting_warning
      ).toBeUndefined();
    });

    it('still succeeds when targeting warning name lookup fails (best-effort)', async () => {
      // Pack SO + Fleet write are already committed; a failed warning must not
      // turn a successful create into an error response.
      const packagePolicyUpdate = jest.fn().mockResolvedValue({});
      const packagePolicyCreate = jest.fn();
      const getByIds = jest
        .fn()
        // First call: resolve targeted agent policies for SO references.
        .mockResolvedValueOnce([{ id: 'agent-policy-a', name: 'Agent Policy A' }])
        // Second call: buildTargetingWarning name lookup — fail.
        .mockRejectedValueOnce(new Error('agent policy lookup failed'));

      setupOverBroadRoute({ packagePolicyUpdate, packagePolicyCreate, getByIds });

      const mockRequest = httpServerMock.createKibanaRequest({
        body: {
          name: 'my-pack',
          enabled: true,
          policy_ids: ['agent-policy-a'],
          queries: { q1: { query: 'SELECT 1', interval: 60 } },
        },
      });
      const mockResponse = httpServerMock.createResponseFactory();

      await routeHandler(buildMockContext() as any, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalled();
      expect(packagePolicyUpdate).toHaveBeenCalledTimes(1);
      expect(
        (mockResponse.ok.mock.calls[0][0]?.body as any).data.targeting_warning
      ).toBeUndefined();
    });
  });
});
