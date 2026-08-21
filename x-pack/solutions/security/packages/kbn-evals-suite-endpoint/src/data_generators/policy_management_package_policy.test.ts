/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { agentRouteService, packagePolicyRouteService } from '@kbn/fleet-plugin/common';
import type { KbnClient } from '@kbn/test';
import type { ToolingLog } from '@kbn/tooling-log';
import {
  deleteIndexedFleetEndpointPolicies,
  indexFleetEndpointPolicy,
} from '@kbn/security-solution-plugin/common/endpoint/data_loaders/index_fleet_endpoint_policy';
import type { IndexedFleetEndpointPolicyResponse } from '@kbn/security-solution-plugin/common/endpoint/data_loaders/index_fleet_endpoint_policy';
import { policyFactory } from '@kbn/security-solution-plugin/common/endpoint/models/policy_config';
import type { PolicyConfig } from '@kbn/security-solution-plugin/common/endpoint/types';
import {
  AntivirusRegistrationModes,
  PolicyOperatingSystem,
  ProtectionModes,
} from '@kbn/security-solution-plugin/common/endpoint/types';
import type { Client } from '@elastic/elasticsearch';
import {
  cleanupPolicyManagementLeftoverFleetPolicies,
  EVAL_PM_AGENT_POLICY_NAME,
  EVAL_PM_COMPARE_DETECT_AGENT_POLICY_NAME,
  EVAL_PM_COMPARE_DETECT_PACKAGE_POLICY_NAME,
  EVAL_PM_COMPARE_PREVENT_AGENT_POLICY_NAME,
  EVAL_PM_COMPARE_PREVENT_PACKAGE_POLICY_NAME,
  EVAL_PM_DUPLICATE_A_AGENT_POLICY_NAME,
  EVAL_PM_DUPLICATE_A_PACKAGE_POLICY_NAME,
  EVAL_PM_DUPLICATE_B_AGENT_POLICY_NAME,
  EVAL_PM_DUPLICATE_B_PACKAGE_POLICY_NAME,
  EVAL_PM_PACKAGE_POLICY_NAME,
  EVAL_PM_USED_AGENT_ID,
  POLICY_MANAGEMENT_COMPARE_POLICY_PERSIST_ERROR,
  POLICY_MANAGEMENT_PACKAGE_POLICY_ASSIGNMENT_ERROR,
  POLICY_MANAGEMENT_PACKAGE_POLICY_MALWARE_ERROR,
  POLICY_MANAGEMENT_PACKAGE_POLICY_STATUS_COUNT_ERROR,
  seedPolicyManagementComparePolicies,
  seedPolicyManagementDuplicatePolicies,
  seedPolicyManagementPolicies,
  seedPolicyManagementPackagePolicy,
  seedPolicyManagementUsageEvidence,
} from './policy_management_package_policy';

jest.mock(
  '@kbn/security-solution-plugin/common/endpoint/data_loaders/index_fleet_endpoint_policy',
  () => ({
    indexFleetEndpointPolicy: jest.fn(),
    deleteIndexedFleetEndpointPolicies: jest.fn(),
  })
);

const createLog = (): jest.Mocked<ToolingLog> =>
  ({
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  } as unknown as jest.Mocked<ToolingLog>);

const createIndexed = ({
  integrationPolicies,
  agentPolicyName,
}: {
  integrationPolicies: Array<{ id: string; name: string }>;
  agentPolicyName: string;
}): IndexedFleetEndpointPolicyResponse =>
  ({
    integrationPolicies,
    agentPolicies: [{ id: `${agentPolicyName}-id`, name: agentPolicyName }],
  } as IndexedFleetEndpointPolicyResponse);

const createMalwareOffPolicy = (): PolicyConfig => {
  const policy = policyFactory();
  for (const os of [
    PolicyOperatingSystem.windows,
    PolicyOperatingSystem.mac,
    PolicyOperatingSystem.linux,
  ]) {
    policy[os].malware.mode = ProtectionModes.off;
  }
  return policy;
};

const createPackagePolicyItem = ({
  id,
  name,
  policy,
  policyIds = ['agent-policy-id'],
}: {
  id: string;
  name: string;
  policy: PolicyConfig;
  policyIds?: string[];
}) => ({
  id,
  name,
  revision: 1,
  version: 'WzFd',
  created_by: 'elastic',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_by: 'elastic',
  updated_at: '2026-01-01T00:00:00.000Z',
  enabled: true,
  policy_ids: policyIds,
  secret_references: [{ id: 'secret-1' }],
  inputs: [
    {
      type: 'endpoint',
      enabled: true,
      streams: [],
      compiled_input: { compiled: true },
      config: {
        artifact_manifest: { value: {} },
        policy: { value: policy },
      },
    },
  ],
});

const createInitialPolicy = (antivirusEnabled: boolean): PolicyConfig => {
  const policy = policyFactory();
  policy.windows.antivirus_registration.enabled = antivirusEnabled;
  return policy;
};

const getPolicyConfigFromBody = (body: {
  inputs: Array<{ config: { policy: { value: PolicyConfig } } }>;
}): PolicyConfig => {
  const [input] = body.inputs;
  if (input === undefined) {
    throw new Error('compare fixture test: PUT body missing endpoint input');
  }
  return input.config.policy.value;
};

const createCompareKbnClient = ({
  itemsById,
  persistEnabledByMode,
}: {
  itemsById: Map<string, ReturnType<typeof createPackagePolicyItem>>;
  persistEnabledByMode: boolean;
}): { client: KbnClient; request: jest.Mock } => {
  const putBodiesById = new Map<
    string,
    {
      inputs: Array<{ config: { policy: { value: PolicyConfig } } }>;
    }
  >();
  const request = jest.fn(
    async ({
      method,
      path,
      body,
    }: {
      method: string;
      path: string;
      body?: {
        inputs: Array<{ config: { policy: { value: PolicyConfig } } }>;
      };
    }) => {
      const id = path.split('/').pop();
      if (id === undefined) {
        throw new Error('compare fixture test: request path missing id');
      }

      if (method === 'PUT') {
        if (body === undefined) {
          throw new Error('compare fixture test: PUT missing body');
        }
        putBodiesById.set(id, body);
        return { data: { item: body } };
      }

      if (method === 'GET' && putBodiesById.has(id)) {
        const putBody = putBodiesById.get(id);
        if (putBody === undefined) {
          throw new Error('compare fixture test: missing PUT body for persist GET');
        }
        const persistedPolicy = structuredClone(getPolicyConfigFromBody(putBody));
        if (persistEnabledByMode) {
          persistedPolicy.windows.antivirus_registration.enabled =
            persistedPolicy.windows.malware.mode === ProtectionModes.prevent;
        }
        const seededName =
          id === 'prevent-id'
            ? EVAL_PM_COMPARE_PREVENT_PACKAGE_POLICY_NAME
            : EVAL_PM_COMPARE_DETECT_PACKAGE_POLICY_NAME;
        return {
          data: {
            item: createPackagePolicyItem({
              id,
              name: seededName,
              policy: persistedPolicy,
            }),
          },
        };
      }

      const initialItem = itemsById.get(id);
      if (initialItem === undefined) {
        throw new Error(`compare fixture test: missing GET item for ${id}`);
      }
      return { data: { item: structuredClone(initialItem) } };
    }
  );

  return { client: { request } as unknown as KbnClient, request };
};

const CAPTURED_PACKAGE_POLICY_ID = 'captured-package-policy-id';
const ASSIGNED_AGENT_POLICY_ID = 'agent-policy-id';

const createPaidSeedIndexed = (): IndexedFleetEndpointPolicyResponse =>
  createIndexed({
    integrationPolicies: [{ id: CAPTURED_PACKAGE_POLICY_ID, name: EVAL_PM_PACKAGE_POLICY_NAME }],
    agentPolicyName: EVAL_PM_AGENT_POLICY_NAME,
  });

const createPersistedPaidItem = ({
  policy = createMalwareOffPolicy(),
  policyIds = [ASSIGNED_AGENT_POLICY_ID],
}: {
  policy?: PolicyConfig;
  policyIds?: string[];
} = {}) =>
  createPackagePolicyItem({
    id: CAPTURED_PACKAGE_POLICY_ID,
    name: EVAL_PM_PACKAGE_POLICY_NAME,
    policy,
    policyIds,
  });

const createPaidSeedRequest = ({
  item,
  status,
}: {
  item?: unknown;
  status?: unknown;
} = {}): jest.Mock =>
  jest.fn(async ({ method, path }: { method: string; path: string }) => {
    if (
      method === 'GET' &&
      path === packagePolicyRouteService.getInfoPath(CAPTURED_PACKAGE_POLICY_ID)
    ) {
      if (item === undefined) {
        throw new Error('paid fixture test: package policy GET failed');
      }
      return { data: { item } };
    }
    if (method === 'GET' && path === agentRouteService.getStatusPath()) {
      if (status === undefined) {
        throw new Error('paid fixture test: agent status GET failed');
      }
      return { data: status };
    }
    throw new Error(`paid fixture test: unexpected ${method} ${path}`);
  });

const mockPaidSeedIndex = (indexed: IndexedFleetEndpointPolicyResponse): void => {
  jest.mocked(indexFleetEndpointPolicy).mockResolvedValue(indexed);
  jest.mocked(deleteIndexedFleetEndpointPolicies).mockResolvedValue({
    integrationPolicies: undefined,
    agentPolicies: undefined,
  });
};

describe('policy management package policy fixtures', () => {
  beforeEach(() => {
    jest.mocked(indexFleetEndpointPolicy).mockReset();
    jest.mocked(deleteIndexedFleetEndpointPolicies).mockReset();
  });

  describe('paid fixture persisted postconditions', () => {
    const expectCleanupAfterFailure = async ({
      error,
      item,
      status,
      request,
    }: {
      error: string;
      item?: unknown;
      status?: unknown;
      request?: jest.Mock;
    }): Promise<jest.Mock> => {
      const indexed = createPaidSeedIndexed();
      mockPaidSeedIndex(indexed);
      const requestFn =
        request ??
        createPaidSeedRequest({
          item,
          status,
        });
      const client = { request: requestFn } as unknown as KbnClient;

      await expect(
        seedPolicyManagementPackagePolicy({ kbnClient: client, log: createLog() })
      ).rejects.toThrow(error);

      expect(deleteIndexedFleetEndpointPolicies).toHaveBeenCalledTimes(1);
      expect(deleteIndexedFleetEndpointPolicies).toHaveBeenCalledWith(client, indexed);
      return requestFn;
    };

    it('throws and cleans up when persisted malware is not off on every OS', async () => {
      await expectCleanupAfterFailure({
        error: POLICY_MANAGEMENT_PACKAGE_POLICY_MALWARE_ERROR,
        item: createPersistedPaidItem({ policy: policyFactory() }),
      });
    });

    it('throws and cleans up when persisted assignment ids are not unique', async () => {
      await expectCleanupAfterFailure({
        error: POLICY_MANAGEMENT_PACKAGE_POLICY_ASSIGNMENT_ERROR,
        item: createPersistedPaidItem({
          policyIds: [ASSIGNED_AGENT_POLICY_ID, 'second-agent-policy-id'],
        }),
      });
    });

    it('throws and cleans up when Fleet status results.all is greater than zero', async () => {
      const request = await expectCleanupAfterFailure({
        error: POLICY_MANAGEMENT_PACKAGE_POLICY_STATUS_COUNT_ERROR,
        item: createPersistedPaidItem(),
        status: { results: { all: 1 } },
      });

      expect(request).toHaveBeenCalledTimes(2);
    });
  });

  describe('live compare prevent/detect pair', () => {
    const preventIndexed = createIndexed({
      integrationPolicies: [
        { id: 'prevent-id', name: EVAL_PM_COMPARE_PREVENT_PACKAGE_POLICY_NAME },
      ],
      agentPolicyName: EVAL_PM_COMPARE_PREVENT_AGENT_POLICY_NAME,
    });
    const detectIndexed = createIndexed({
      integrationPolicies: [{ id: 'detect-id', name: EVAL_PM_COMPARE_DETECT_PACKAGE_POLICY_NAME }],
      agentPolicyName: EVAL_PM_COMPARE_DETECT_AGENT_POLICY_NAME,
    });

    const mockIndexByName = () => {
      jest.mocked(indexFleetEndpointPolicy).mockImplementation(async (_client, policyName) => {
        if (policyName === EVAL_PM_COMPARE_PREVENT_PACKAGE_POLICY_NAME) {
          return preventIndexed;
        }
        if (policyName === EVAL_PM_COMPARE_DETECT_PACKAGE_POLICY_NAME) {
          return detectIndexed;
        }
        throw new Error(`unexpected package policy name ${policyName}`);
      });
    };

    const createItemsById = () => {
      const preventPolicy = createInitialPolicy(false);
      const detectPolicy = createInitialPolicy(true);
      return new Map([
        [
          'prevent-id',
          createPackagePolicyItem({
            id: 'prevent-id',
            name: EVAL_PM_COMPARE_PREVENT_PACKAGE_POLICY_NAME,
            policy: preventPolicy,
          }),
        ],
        [
          'detect-id',
          createPackagePolicyItem({
            id: 'detect-id',
            name: EVAL_PM_COMPARE_DETECT_PACKAGE_POLICY_NAME,
            policy: detectPolicy,
          }),
        ],
      ]);
    };

    it('indexes both sides, writes helper-produced bodies, and verifies persisted PolicyConfig', async () => {
      mockIndexByName();

      const { client, request } = createCompareKbnClient({
        itemsById: createItemsById(),
        persistEnabledByMode: true,
      });
      const seeded = await seedPolicyManagementComparePolicies({
        kbnClient: client,
        log: createLog(),
      });

      expect(indexFleetEndpointPolicy).toHaveBeenCalledTimes(2);
      expect(seeded.prevent.id).toBe('prevent-id');
      expect(seeded.detect.id).toBe('detect-id');

      const preventPut = request.mock.calls.find((call) => call[0].method === 'PUT');
      const detectPut = [...request.mock.calls].reverse().find((call) => call[0].method === 'PUT');
      const preventConfig = getPolicyConfigFromBody(preventPut?.[0].body);
      const detectConfig = getPolicyConfigFromBody(detectPut?.[0].body);

      for (const os of [
        PolicyOperatingSystem.windows,
        PolicyOperatingSystem.mac,
        PolicyOperatingSystem.linux,
      ]) {
        expect(preventConfig[os].malware.mode).toBe(ProtectionModes.prevent);
        expect(preventConfig[os].popup.malware.enabled).toBe(true);
        expect(detectConfig[os].malware.mode).toBe(ProtectionModes.detect);
        expect(detectConfig[os].popup.malware.enabled).toBe(false);
      }

      expect(preventConfig.windows.antivirus_registration.mode).toBe(
        AntivirusRegistrationModes.sync
      );
      expect(detectConfig.windows.antivirus_registration.mode).toBe(
        AntivirusRegistrationModes.sync
      );
      expect(preventConfig.windows.antivirus_registration.enabled).toBe(false);
      expect(detectConfig.windows.antivirus_registration.enabled).toBe(true);
    });

    it('throws and deletes every captured resource when persisted derivation does not match', async () => {
      mockIndexByName();

      const { client } = createCompareKbnClient({
        itemsById: createItemsById(),
        persistEnabledByMode: false,
      });

      await expect(
        seedPolicyManagementComparePolicies({ kbnClient: client, log: createLog() })
      ).rejects.toThrow(POLICY_MANAGEMENT_COMPARE_POLICY_PERSIST_ERROR);

      expect(deleteIndexedFleetEndpointPolicies).toHaveBeenCalledTimes(1);
      expect(deleteIndexedFleetEndpointPolicies).toHaveBeenCalledWith(client, preventIndexed);
    });

    it('deletes every captured resource when the second side fails after the first indexed', async () => {
      jest
        .mocked(indexFleetEndpointPolicy)
        .mockResolvedValueOnce(preventIndexed)
        .mockRejectedValueOnce(new Error('detect index failed'));

      const { client } = createCompareKbnClient({
        itemsById: createItemsById(),
        persistEnabledByMode: true,
      });

      await expect(
        seedPolicyManagementComparePolicies({ kbnClient: client, log: createLog() })
      ).rejects.toThrow('detect index failed');

      expect(deleteIndexedFleetEndpointPolicies).toHaveBeenCalledTimes(1);
      expect(deleteIndexedFleetEndpointPolicies).toHaveBeenCalledWith(client, preventIndexed);
    });
  });

  describe('duplicate pair and enrolled-agent usage', () => {
    const firstIndexed = createIndexed({
      integrationPolicies: [{ id: 'dup-a-id', name: EVAL_PM_DUPLICATE_A_PACKAGE_POLICY_NAME }],
      agentPolicyName: EVAL_PM_DUPLICATE_A_AGENT_POLICY_NAME,
    });
    const secondIndexed = createIndexed({
      integrationPolicies: [{ id: 'dup-b-id', name: EVAL_PM_DUPLICATE_B_PACKAGE_POLICY_NAME }],
      agentPolicyName: EVAL_PM_DUPLICATE_B_AGENT_POLICY_NAME,
    });

    const createDuplicateItemsById = () => {
      const firstPolicy = createInitialPolicy(true);
      const secondPolicy = createInitialPolicy(true);
      return new Map([
        [
          'dup-a-id',
          createPackagePolicyItem({
            id: 'dup-a-id',
            name: EVAL_PM_DUPLICATE_A_PACKAGE_POLICY_NAME,
            policy: firstPolicy,
          }),
        ],
        [
          'dup-b-id',
          createPackagePolicyItem({
            id: 'dup-b-id',
            name: EVAL_PM_DUPLICATE_B_PACKAGE_POLICY_NAME,
            policy: secondPolicy,
          }),
        ],
      ]);
    };

    const mockDuplicateIndexByName = () => {
      jest.mocked(indexFleetEndpointPolicy).mockImplementation(async (_client, policyName) => {
        if (policyName === EVAL_PM_DUPLICATE_A_PACKAGE_POLICY_NAME) {
          return firstIndexed;
        }
        if (policyName === EVAL_PM_DUPLICATE_B_PACKAGE_POLICY_NAME) {
          return secondIndexed;
        }
        throw new Error(`unexpected package policy name ${policyName}`);
      });
    };

    it('writes identical detect-mode configs on both duplicate sides', async () => {
      mockDuplicateIndexByName();
      jest.mocked(deleteIndexedFleetEndpointPolicies).mockResolvedValue({
        integrationPolicies: undefined,
        agentPolicies: undefined,
      });

      const { client, request } = createCompareKbnClient({
        itemsById: createDuplicateItemsById(),
        persistEnabledByMode: true,
      });
      const seeded = await seedPolicyManagementDuplicatePolicies({
        kbnClient: client,
        log: createLog(),
      });

      expect(seeded.first.id).toBe('dup-a-id');
      expect(seeded.second.id).toBe('dup-b-id');
      expect(deleteIndexedFleetEndpointPolicies).not.toHaveBeenCalled();

      const firstPut = request.mock.calls.find((call) => call[0].method === 'PUT');
      const secondPut = [...request.mock.calls].reverse().find((call) => call[0].method === 'PUT');
      const firstConfig = getPolicyConfigFromBody(firstPut?.[0].body);
      const secondConfig = getPolicyConfigFromBody(secondPut?.[0].body);

      for (const os of [
        PolicyOperatingSystem.windows,
        PolicyOperatingSystem.mac,
        PolicyOperatingSystem.linux,
      ]) {
        expect(firstConfig[os].malware.mode).toBe(ProtectionModes.detect);
        expect(secondConfig[os].malware.mode).toBe(ProtectionModes.detect);
        expect(firstConfig[os].popup.malware.enabled).toBe(true);
        expect(secondConfig[os].popup.malware.enabled).toBe(true);
      }
    });

    it('indexes enrolled-agent usage evidence against the supplied agent policy', async () => {
      const internalEsClient = {
        index: jest.fn().mockResolvedValue({}),
      } as unknown as Client;

      const seeded = await seedPolicyManagementUsageEvidence({
        internalEsClient,
        agentPolicyId: 'prevent-agent-policy-id',
        log: createLog(),
      });

      expect(seeded.agentId).toBe(EVAL_PM_USED_AGENT_ID);
      expect(internalEsClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            active: true,
            policy_id: 'prevent-agent-policy-id',
          }),
        })
      );
    });

    it('releases the usage agent before captured policies when seeding fails', async () => {
      const preventIndexed = createIndexed({
        integrationPolicies: [
          { id: 'prevent-id', name: EVAL_PM_COMPARE_PREVENT_PACKAGE_POLICY_NAME },
        ],
        agentPolicyName: EVAL_PM_COMPARE_PREVENT_AGENT_POLICY_NAME,
      });
      const detectIndexed = createIndexed({
        integrationPolicies: [
          { id: 'detect-id', name: EVAL_PM_COMPARE_DETECT_PACKAGE_POLICY_NAME },
        ],
        agentPolicyName: EVAL_PM_COMPARE_DETECT_AGENT_POLICY_NAME,
      });

      jest.mocked(indexFleetEndpointPolicy).mockImplementation(async (_client, policyName) => {
        if (policyName === EVAL_PM_COMPARE_PREVENT_PACKAGE_POLICY_NAME) {
          return preventIndexed;
        }
        if (policyName === EVAL_PM_COMPARE_DETECT_PACKAGE_POLICY_NAME) {
          return detectIndexed;
        }
        if (policyName === EVAL_PM_DUPLICATE_A_PACKAGE_POLICY_NAME) {
          return firstIndexed;
        }
        if (policyName === EVAL_PM_DUPLICATE_B_PACKAGE_POLICY_NAME) {
          return secondIndexed;
        }
        throw new Error(`unexpected package policy name ${policyName}`);
      });
      jest.mocked(deleteIndexedFleetEndpointPolicies).mockResolvedValue({
        integrationPolicies: undefined,
        agentPolicies: undefined,
      });

      const itemsById = new Map([
        [
          'prevent-id',
          createPackagePolicyItem({
            id: 'prevent-id',
            name: EVAL_PM_COMPARE_PREVENT_PACKAGE_POLICY_NAME,
            policy: createInitialPolicy(false),
          }),
        ],
        [
          'detect-id',
          createPackagePolicyItem({
            id: 'detect-id',
            name: EVAL_PM_COMPARE_DETECT_PACKAGE_POLICY_NAME,
            policy: createInitialPolicy(true),
          }),
        ],
        ...createDuplicateItemsById(),
      ]);
      const { client } = createCompareKbnClient({
        itemsById,
        persistEnabledByMode: true,
      });
      const internalEsClient = {
        index: jest.fn().mockRejectedValue(new Error('usage index failed')),
        delete: jest.fn().mockResolvedValue({}),
      } as unknown as Client;

      await expect(
        seedPolicyManagementPolicies({
          kbnClient: client,
          internalEsClient,
          log: createLog(),
        })
      ).rejects.toThrow('usage index failed');

      expect(internalEsClient.delete).toHaveBeenCalledWith(
        { index: '.fleet-agents', id: EVAL_PM_USED_AGENT_ID, refresh: true },
        { ignore: [404] }
      );
      expect((internalEsClient.delete as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
        (deleteIndexedFleetEndpointPolicies as jest.Mock).mock.invocationCallOrder[0]
      );
      expect(deleteIndexedFleetEndpointPolicies).toHaveBeenCalledTimes(4);
    });
  });

  describe('leftover Fleet policy pre-clean', () => {
    const createListingClient = ({
      packagePolicyIds = [],
      agentPolicyIds = [],
    }: {
      packagePolicyIds?: string[];
      agentPolicyIds?: string[];
    }) => {
      const request = jest.fn(async ({ path, method }: { path: string; method: string }) => {
        if (method === 'GET') {
          const isAgentPolicy = path.includes('agent_policies');
          const ids = isAgentPolicy ? agentPolicyIds : packagePolicyIds;
          return { data: { items: ids.map((id) => ({ id })) } };
        }
        return { data: {} };
      });
      return { request } as unknown as KbnClient & { request: jest.Mock };
    };

    it('deletes leftovers, package policies before agent policies', async () => {
      const client = createListingClient({
        packagePolicyIds: ['leftover-pkg'],
        agentPolicyIds: ['leftover-agent'],
      });

      await cleanupPolicyManagementLeftoverFleetPolicies({
        kbnClient: client,
        log: createLog(),
        packagePolicyNames: [EVAL_PM_PACKAGE_POLICY_NAME],
        agentPolicyNames: [EVAL_PM_AGENT_POLICY_NAME],
      });

      const deletes = client.request.mock.calls
        .map(([options]) => options)
        .filter((options) => options.method === 'POST');

      expect(deletes).toHaveLength(2);
      expect(deletes[0].body).toEqual({ packagePolicyIds: ['leftover-pkg'], force: true });
      expect(deletes[1].body).toEqual({ agentPolicyId: 'leftover-agent', force: true });
    });

    it('warns and continues when a lookup or delete fails', async () => {
      const request = jest.fn(async ({ path }: { path: string }) => {
        if (path.includes('agent_policies')) {
          return { data: { items: [] } };
        }
        throw new Error('fleet unavailable');
      });
      const client = { request } as unknown as KbnClient;
      const log = createLog();

      await expect(
        cleanupPolicyManagementLeftoverFleetPolicies({
          kbnClient: client,
          log,
          packagePolicyNames: [EVAL_PM_PACKAGE_POLICY_NAME],
          agentPolicyNames: [EVAL_PM_AGENT_POLICY_NAME],
        })
      ).resolves.toBeUndefined();

      expect(log.warning).toHaveBeenCalledWith(
        expect.stringContaining(EVAL_PM_PACKAGE_POLICY_NAME)
      );
    });
  });
});
