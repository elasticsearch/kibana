/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import { packagePolicyRouteService } from '@kbn/fleet-plugin/common';
import type { KbnClient } from '@kbn/test';
import type { ToolingLog } from '@kbn/tooling-log';
import { metadataCurrentIndexPattern } from '@kbn/security-solution-plugin/common/endpoint/constants';
import {
  deleteIndexedFleetEndpointPolicies,
  indexFleetEndpointPolicy,
} from '@kbn/security-solution-plugin/common/endpoint/data_loaders/index_fleet_endpoint_policy';
import type { IndexedFleetEndpointPolicyResponse } from '@kbn/security-solution-plugin/common/endpoint/data_loaders/index_fleet_endpoint_policy';
import { POLICY_MANAGEMENT_AGENT_ID_PREFIX } from './cleanup';
import {
  EVAL_PM_ROLLOUT_STATUS_AGENT_ID,
  EVAL_PM_ROLLOUT_STATUS_AGENT_POLICY_NAME,
  EVAL_PM_ROLLOUT_STATUS_PACKAGE_POLICY_NAME,
  POLICY_MANAGEMENT_ROLLOUT_STATUS_ASSIGNMENT_ERROR,
  POLICY_MANAGEMENT_ROLLOUT_STATUS_ITEM_ERROR,
  POLICY_MANAGEMENT_ROLLOUT_STATUS_READINESS_TIMEOUT,
  POLICY_MANAGEMENT_ROLLOUT_STATUS_REVISION_ERROR,
  seedPolicyManagementRolloutStatus,
  waitForPolicyManagementTransformPropagation,
} from './policy_management_rollout_status';

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

const ROLLOUT_STATUS_PACKAGE_POLICY_ID = 'rollout-status-package-policy-id';
const ROLLOUT_STATUS_AGENT_POLICY_ID = 'rollout-status-agent-policy-id';
const STALE_PREFIX_AGENT_ID = 'eval-agent-pm-stale-other';

const EXPECTED_READINESS = {
  agentId: EVAL_PM_ROLLOUT_STATUS_AGENT_ID,
  agentPolicyId: ROLLOUT_STATUS_AGENT_POLICY_ID,
  packagePolicyId: ROLLOUT_STATUS_PACKAGE_POLICY_ID,
  packageRevision: 2,
  appliedPackageRevision: 1,
};

const createIndexed = (): IndexedFleetEndpointPolicyResponse =>
  ({
    integrationPolicies: [
      { id: ROLLOUT_STATUS_PACKAGE_POLICY_ID, name: EVAL_PM_ROLLOUT_STATUS_PACKAGE_POLICY_NAME },
    ],
    agentPolicies: [
      {
        id: ROLLOUT_STATUS_AGENT_POLICY_ID,
        name: EVAL_PM_ROLLOUT_STATUS_AGENT_POLICY_NAME,
        revision: 1,
      },
    ],
  } as IndexedFleetEndpointPolicyResponse);

const createItem = ({
  revision,
  policyIds = [ROLLOUT_STATUS_AGENT_POLICY_ID],
}: {
  revision: number;
  policyIds?: string[];
}) => ({
  id: ROLLOUT_STATUS_PACKAGE_POLICY_ID,
  name: EVAL_PM_ROLLOUT_STATUS_PACKAGE_POLICY_NAME,
  revision,
  version: 'WzFd',
  created_by: 'elastic',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_by: 'elastic',
  updated_at: '2026-01-01T00:00:00.000Z',
  policy_ids: policyIds,
  secret_references: [{ id: 'secret-1' }],
  inputs: [
    {
      type: 'endpoint',
      enabled: true,
      streams: [],
      compiled_input: { compiled: true },
      config: { policy: { value: {} } },
    },
  ],
});

const createUnitedSource = ({
  agentId = EVAL_PM_ROLLOUT_STATUS_AGENT_ID,
  agentPolicyId = ROLLOUT_STATUS_AGENT_POLICY_ID,
  packagePolicyId = ROLLOUT_STATUS_PACKAGE_POLICY_ID,
  appliedPackageRevision = 1,
  active = true,
}: {
  agentId?: string;
  agentPolicyId?: string;
  packagePolicyId?: string;
  appliedPackageRevision?: number;
  active?: boolean;
} = {}) => ({
  agent: { id: agentId },
  united: {
    endpoint: {
      agent: { id: agentId },
      Endpoint: {
        policy: {
          applied: {
            id: packagePolicyId,
            endpoint_policy_version: appliedPackageRevision,
            version: 1,
          },
        },
      },
    },
    agent: {
      agent: { id: agentId },
      active,
      policy_id: agentPolicyId,
      policy_revision_idx: 1,
    },
  },
});

const createSearchClient = ({
  currentSource = { agent: { id: EVAL_PM_ROLLOUT_STATUS_AGENT_ID } },
  unitedSource = createUnitedSource(),
}: {
  currentSource?: Record<string, unknown> | undefined;
  unitedSource?: Record<string, unknown> | undefined;
} = {}): Client =>
  ({
    search: jest.fn(async ({ index }: { index: string }) => {
      if (index === metadataCurrentIndexPattern) {
        return {
          hits: { hits: currentSource === undefined ? [] : [{ _source: currentSource }] },
        };
      }
      return {
        hits: { hits: unitedSource === undefined ? [] : [{ _source: unitedSource }] },
      };
    }),
    create: jest.fn().mockResolvedValue({}),
    deleteByQuery: jest.fn().mockResolvedValue({}),
  } as unknown as Client);

const expectSeedRejectsWithCleanup = async (item: unknown, expectedError: string) => {
  const indexed = createIndexed();
  jest.mocked(indexFleetEndpointPolicy).mockResolvedValue(indexed);

  const request = jest.fn(async () => ({ data: { item } }));
  const esClient = {
    create: jest.fn(),
    deleteByQuery: jest.fn().mockResolvedValue({}),
  } as unknown as Client;
  const internalEsClient = {
    delete: jest.fn().mockResolvedValue({}),
    index: jest.fn(),
    deleteByQuery: jest.fn().mockResolvedValue({}),
  } as unknown as Client;
  const kbnClient = { request } as unknown as KbnClient;

  await expect(
    seedPolicyManagementRolloutStatus({
      kbnClient,
      esClient,
      internalEsClient,
      log: createLog(),
    })
  ).rejects.toThrow(expectedError);

  expect(internalEsClient.delete).toHaveBeenCalledWith(
    { index: '.fleet-agents', id: EVAL_PM_ROLLOUT_STATUS_AGENT_ID, refresh: true },
    { ignore: [404] }
  );
  expect(deleteIndexedFleetEndpointPolicies).toHaveBeenCalledWith(kbnClient, indexed);
  expect(esClient.create).not.toHaveBeenCalled();
  expect(internalEsClient.index).not.toHaveBeenCalled();
  expect(esClient.deleteByQuery).toHaveBeenCalledWith(
    expect.objectContaining({
      query: { prefix: { 'agent.id': POLICY_MANAGEMENT_AGENT_ID_PREFIX } },
    })
  );
};

describe('policy management rollout-status fixtures', () => {
  beforeEach(() => {
    jest.mocked(indexFleetEndpointPolicy).mockReset();
    jest.mocked(deleteIndexedFleetEndpointPolicies).mockReset();
    jest.mocked(deleteIndexedFleetEndpointPolicies).mockResolvedValue({
      integrationPolicies: undefined,
      agentPolicies: undefined,
    });
  });

  it('does not treat a stale prefix-matching united document as ready and reports expected identity and last observed facts', async () => {
    const esClient = createSearchClient({
      unitedSource: createUnitedSource({ agentId: STALE_PREFIX_AGENT_ID }),
    });

    await expect(
      waitForPolicyManagementTransformPropagation(esClient, createLog(), EXPECTED_READINESS, {
        maxWaitMs: 20,
        pollIntervalMs: 0,
      })
    ).rejects.toThrow(POLICY_MANAGEMENT_ROLLOUT_STATUS_READINESS_TIMEOUT);
    expect(STALE_PREFIX_AGENT_ID.startsWith(POLICY_MANAGEMENT_AGENT_ID_PREFIX)).toBe(true);
    expect(STALE_PREFIX_AGENT_ID).not.toBe(EVAL_PM_ROLLOUT_STATUS_AGENT_ID);
  });

  it('seeds a Fleet agent and endpoint metadata with an applied revision behind the live package policy', async () => {
    const indexed = createIndexed();
    jest.mocked(indexFleetEndpointPolicy).mockResolvedValue(indexed);

    let persistedRevision = 1;
    const request = jest.fn(
      async ({
        method,
        path,
        body,
      }: {
        method: string;
        path: string;
        body?: Record<string, unknown>;
      }) => {
        if (method === 'PUT') {
          if (body === undefined || !Array.isArray(body.inputs)) {
            throw new Error('rollout-status fixture test: PUT missing inputs');
          }
          expect(body.inputs[0]).toEqual(
            expect.objectContaining({
              config: {
                policy: {
                  value: {
                    linux: {
                      events: {
                        process: false,
                      },
                    },
                  },
                },
              },
            })
          );
          persistedRevision = 2;
          return { data: { item: body } };
        }
        if (
          method === 'GET' &&
          path === packagePolicyRouteService.getInfoPath(ROLLOUT_STATUS_PACKAGE_POLICY_ID)
        ) {
          return { data: { item: createItem({ revision: persistedRevision }) } };
        }
        throw new Error(`unexpected ${method} ${path}`);
      }
    );

    const esClient = createSearchClient();
    const internalEsClient = {
      index: jest.fn().mockResolvedValue({}),
      deleteByQuery: jest.fn().mockResolvedValue({}),
    } as unknown as Client;

    const seeded = await seedPolicyManagementRolloutStatus({
      kbnClient: { request } as unknown as KbnClient,
      esClient,
      internalEsClient,
      log: createLog(),
    });

    expect(seeded.packageRevision).toBe(2);
    expect(seeded.appliedPackageRevision).toBe(1);

    expect(esClient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({
          Endpoint: {
            status: 'enrolled',
            policy: {
              applied: expect.objectContaining({
                endpoint_policy_version: 1,
              }),
            },
          },
        }),
      })
    );
  });

  it('throws and cleans captured policies plus prefix-scoped docs when revision does not increase', async () => {
    const indexed = createIndexed();
    jest.mocked(indexFleetEndpointPolicy).mockResolvedValue(indexed);

    const request = jest.fn(async () => {
      return { data: { item: createItem({ revision: 1 }) } };
    });
    const esClient = {
      create: jest.fn(),
      search: jest.fn(),
      deleteByQuery: jest.fn().mockResolvedValue({}),
    } as unknown as Client;
    const internalEsClient = {
      index: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
      deleteByQuery: jest.fn().mockResolvedValue({}),
    } as unknown as Client;
    const client = { request } as unknown as KbnClient;

    await expect(
      seedPolicyManagementRolloutStatus({
        kbnClient: client,
        esClient,
        internalEsClient,
        log: createLog(),
      })
    ).rejects.toThrow(POLICY_MANAGEMENT_ROLLOUT_STATUS_REVISION_ERROR);

    expect(internalEsClient.delete).toHaveBeenCalledWith(
      { index: '.fleet-agents', id: EVAL_PM_ROLLOUT_STATUS_AGENT_ID, refresh: true },
      { ignore: [404] }
    );
    expect((internalEsClient.delete as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (deleteIndexedFleetEndpointPolicies as jest.Mock).mock.invocationCallOrder[0]
    );
    expect(deleteIndexedFleetEndpointPolicies).toHaveBeenCalledWith(client, indexed);
    expect(esClient.deleteByQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { prefix: { 'agent.id': POLICY_MANAGEMENT_AGENT_ID_PREFIX } },
      })
    );
    expect(esClient.create).not.toHaveBeenCalled();
    expect(esClient.search).not.toHaveBeenCalled();
  });

  it('rejects with the item readiness error when Fleet returns no package policy item', async () => {
    await expectSeedRejectsWithCleanup(undefined, POLICY_MANAGEMENT_ROLLOUT_STATUS_ITEM_ERROR);
  });

  it('rejects with the assignment error when multiple unique policy ids remain', async () => {
    await expectSeedRejectsWithCleanup(
      createItem({
        revision: 1,
        policyIds: [ROLLOUT_STATUS_AGENT_POLICY_ID, 'rollout-status-agent-policy-id-two'],
      }),
      POLICY_MANAGEMENT_ROLLOUT_STATUS_ASSIGNMENT_ERROR
    );
  });
});
