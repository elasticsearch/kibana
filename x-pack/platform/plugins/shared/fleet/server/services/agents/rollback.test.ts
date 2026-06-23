/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, SavedObjectsClientContract } from '@kbn/core/server';
import { elasticsearchServiceMock, savedObjectsClientMock } from '@kbn/core/server/mocks';

import type { Agent } from '../../types';
import {
  AgentRollbackError,
  FleetUnauthorizedError,
  HostedAgentPolicyRestrictionRelatedError,
  AgentNotFoundError,
} from '../../errors';
import { SO_SEARCH_LIMIT } from '../../constants';
import { getCurrentNamespace } from '../spaces/get_current_namespace';
import { agentsKueryNamespaceFilter } from '../spaces/agent_namespaces';

import {
  getValidRollbacks,
  sendRollbackAgentAction,
  sendRollbackAgentsActions,
  NO_ROLLBACK_ERROR_MESSAGE,
  EXPIRED_ROLLBACK_ERROR_MESSAGE,
} from './rollback';
import {
  getAgentPolicyForAgent,
  getAgentsById,
  getAgentsByKuery,
  openPointInTime,
  updateAgent,
} from './crud';
import { createAgentAction } from './actions';
import { RollbackActionRunner, rollbackBatch } from './rollback_action_runner';

jest.mock('./crud', () => ({
  getAgentPolicyForAgent: jest.fn(),
  getAgentsById: jest.fn(),
  getAgentsByKuery: jest.fn(),
  openPointInTime: jest.fn(),
  updateAgent: jest.fn(),
}));

jest.mock('./actions', () => ({
  createAgentAction: jest.fn(),
}));

jest.mock('./rollback_action_runner', () => ({
  RollbackActionRunner: jest.fn(),
  rollbackBatch: jest.fn(),
}));

jest.mock('../spaces/get_current_namespace', () => ({
  getCurrentNamespace: jest.fn(),
}));

jest.mock('../spaces/agent_namespaces', () => ({
  agentsKueryNamespaceFilter: jest.fn(),
  buildFilterWithNamespace: jest.requireActual('../spaces/agent_namespaces')
    .buildFilterWithNamespace,
}));

jest.mock('../license', () => ({
  licenseService: {
    hasAtLeast: jest.fn(),
  },
}));

const mockGetAgentPolicyForAgent = getAgentPolicyForAgent as jest.MockedFunction<
  typeof getAgentPolicyForAgent
>;
const mockGetAgentsById = getAgentsById as jest.MockedFunction<typeof getAgentsById>;
const mockGetAgentsByKuery = getAgentsByKuery as jest.MockedFunction<typeof getAgentsByKuery>;
const mockOpenPointInTime = openPointInTime as jest.MockedFunction<typeof openPointInTime>;
const mockUpdateAgent = updateAgent as jest.MockedFunction<typeof updateAgent>;
const mockCreateAgentAction = createAgentAction as jest.MockedFunction<typeof createAgentAction>;
const mockRollbackBatch = rollbackBatch as jest.MockedFunction<typeof rollbackBatch>;
const mockRollbackActionRunner = RollbackActionRunner as jest.MockedClass<
  typeof RollbackActionRunner
>;
const mockGetCurrentNamespace = getCurrentNamespace as jest.MockedFunction<
  typeof getCurrentNamespace
>;
const mockAgentsKueryNamespaceFilter = agentsKueryNamespaceFilter as jest.MockedFunction<
  typeof agentsKueryNamespaceFilter
>;

describe('rollback', () => {
  let esClient: jest.Mocked<ElasticsearchClient>;
  let soClient: jest.Mocked<SavedObjectsClientContract>;
  let mockLicenseService: { hasAtLeast: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    esClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
    soClient = savedObjectsClientMock.create();

    mockGetCurrentNamespace.mockReturnValue('default');
    mockAgentsKueryNamespaceFilter.mockResolvedValue(undefined);

    // Get the mocked license service and default to having the required license
    mockLicenseService = jest.requireMock('../license').licenseService;
    mockLicenseService.hasAtLeast.mockReturnValue(true);
  });

  describe('getValidRollbacks', () => {
    it('should return only valid (non-expired) rollbacks', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 1000 * 60 * 60); // 1 hour from now
      const pastDate = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago

      const agent: Agent = {
        id: 'agent-1',
        type: 'PERMANENT',
        active: true,
        enrolled_at: '2023-01-01T00:00:00Z',
        local_metadata: {},
        upgrade: {
          rollbacks: [
            {
              version: '8.10.0',
              valid_until: futureDate.toISOString(),
            },
            {
              version: '8.9.0',
              valid_until: pastDate.toISOString(),
            },
            {
              version: '8.8.0',
              valid_until: futureDate.toISOString(),
            },
          ],
        },
      } as Agent;

      const validRollbacks = getValidRollbacks(agent);

      expect(validRollbacks).toHaveLength(2);
      expect(validRollbacks[0].version).toBe('8.10.0');
      expect(validRollbacks[1].version).toBe('8.8.0');
    });

    it('should return empty array when all rollbacks are expired', () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago

      const agent: Agent = {
        id: 'agent-1',
        type: 'PERMANENT',
        active: true,
        enrolled_at: '2023-01-01T00:00:00Z',
        local_metadata: {},
        upgrade: {
          rollbacks: [
            {
              version: '8.9.0',
              valid_until: pastDate.toISOString(),
            },
          ],
        },
      } as Agent;

      const validRollbacks = getValidRollbacks(agent);

      expect(validRollbacks).toHaveLength(0);
    });

    it('should return empty array when agent has no rollbacks', () => {
      const agent: Agent = {
        id: 'agent-1',
        type: 'PERMANENT',
        active: true,
        enrolled_at: '2023-01-01T00:00:00Z',
        local_metadata: {},
      } as Agent;

      const validRollbacks = getValidRollbacks(agent);

      expect(validRollbacks).toHaveLength(0);
    });

    it('should return empty array when upgrade is undefined', () => {
      const agent: Agent = {
        id: 'agent-1',
        type: 'PERMANENT',
        active: true,
        enrolled_at: '2023-01-01T00:00:00Z',
        local_metadata: {},
        upgrade: undefined,
      } as Agent;

      const validRollbacks = getValidRollbacks(agent);

      expect(validRollbacks).toHaveLength(0);
    });
  });

  describe('sendRollbackAgentAction', () => {
    const mockActionId = 'action-123';
    const mockAgentId = 'agent-1';
    const now = new Date();
    const futureDate = new Date(now.getTime() + 1000 * 60 * 60); // 1 hour from now

    it('should successfully send rollback action for agent with valid rollback', async () => {
      const agent: Agent = {
        id: mockAgentId,
        type: 'PERMANENT',
        active: true,
        enrolled_at: '2023-01-01T00:00:00Z',
        local_metadata: {},
        upgrade: {
          rollbacks: [
            {
              version: '8.10.0',
              valid_until: futureDate.toISOString(),
            },
          ],
        },
      } as Agent;

      const mockAgentPolicy = {
        id: 'policy-1',
        is_managed: false,
      };

      mockGetAgentPolicyForAgent.mockResolvedValue(mockAgentPolicy as any);
      mockCreateAgentAction.mockResolvedValue({ id: mockActionId } as any);
      mockUpdateAgent.mockResolvedValue(undefined);

      const actionId = await sendRollbackAgentAction(soClient, esClient, agent);

      expect(actionId).toBe(mockActionId);
      expect(mockGetAgentPolicyForAgent).toHaveBeenCalledWith(soClient, esClient, mockAgentId);
      expect(mockCreateAgentAction).toHaveBeenCalledWith(esClient, soClient, {
        agents: [mockAgentId],
        created_at: expect.any(String),
        data: {
          version: '8.10.0',
          rollback: true,
        },
        ack_data: {
          version: '8.10.0',
          rollback: true,
        },
        type: 'UPGRADE',
        namespaces: ['default'],
      });
      expect(mockUpdateAgent).toHaveBeenCalledWith(esClient, mockAgentId, {
        upgraded_at: null,
        upgrade_started_at: expect.any(String),
      });
    });

    it('should throw error when agent has no rollbacks', async () => {
      const agent: Agent = {
        id: mockAgentId,
        type: 'PERMANENT',
        active: true,
        enrolled_at: '2023-01-01T00:00:00Z',
        local_metadata: {},
      } as Agent;

      await expect(sendRollbackAgentAction(soClient, esClient, agent)).rejects.toThrow(
        AgentRollbackError
      );
      await expect(sendRollbackAgentAction(soClient, esClient, agent)).rejects.toThrow(
        NO_ROLLBACK_ERROR_MESSAGE
      );

      expect(mockGetAgentPolicyForAgent).not.toHaveBeenCalled();
      expect(mockCreateAgentAction).not.toHaveBeenCalled();
    });

    it('should throw error when all rollbacks are expired', async () => {
      const pastDate = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago

      const agent: Agent = {
        id: mockAgentId,
        type: 'PERMANENT',
        active: true,
        enrolled_at: '2023-01-01T00:00:00Z',
        local_metadata: {},
        upgrade: {
          rollbacks: [
            {
              version: '8.9.0',
              valid_until: pastDate.toISOString(),
            },
          ],
        },
      } as Agent;

      await expect(sendRollbackAgentAction(soClient, esClient, agent)).rejects.toThrow(
        AgentRollbackError
      );
      await expect(sendRollbackAgentAction(soClient, esClient, agent)).rejects.toThrow(
        EXPIRED_ROLLBACK_ERROR_MESSAGE
      );

      expect(mockGetAgentPolicyForAgent).not.toHaveBeenCalled();
      expect(mockCreateAgentAction).not.toHaveBeenCalled();
    });

    it('should throw error when agent policy is hosted', async () => {
      const agent: Agent = {
        id: mockAgentId,
        type: 'PERMANENT',
        active: true,
        enrolled_at: '2023-01-01T00:00:00Z',
        local_metadata: {},
        upgrade: {
          rollbacks: [
            {
              version: '8.10.0',
              valid_until: futureDate.toISOString(),
            },
          ],
        },
      } as Agent;

      const mockAgentPolicy = {
        id: 'policy-1',
        is_managed: true,
      };

      mockGetAgentPolicyForAgent.mockResolvedValue(mockAgentPolicy as any);

      await expect(sendRollbackAgentAction(soClient, esClient, agent)).rejects.toThrow(
        HostedAgentPolicyRestrictionRelatedError
      );

      expect(mockGetAgentPolicyForAgent).toHaveBeenCalledWith(soClient, esClient, mockAgentId);
      expect(mockCreateAgentAction).not.toHaveBeenCalled();
    });

    it('should use the first valid rollback version', async () => {
      const agent: Agent = {
        id: mockAgentId,
        type: 'PERMANENT',
        active: true,
        enrolled_at: '2023-01-01T00:00:00Z',
        local_metadata: {},
        upgrade: {
          rollbacks: [
            {
              version: '8.10.0',
              valid_until: futureDate.toISOString(),
            },
            {
              version: '8.9.0',
              valid_until: futureDate.toISOString(),
            },
          ],
        },
      } as Agent;

      const mockAgentPolicy = {
        id: 'policy-1',
        is_managed: false,
      };

      mockGetAgentPolicyForAgent.mockResolvedValue(mockAgentPolicy as any);
      mockCreateAgentAction.mockResolvedValue({ id: mockActionId } as any);
      mockUpdateAgent.mockResolvedValue(undefined);

      await sendRollbackAgentAction(soClient, esClient, agent);

      expect(mockCreateAgentAction).toHaveBeenCalledWith(
        esClient,
        soClient,
        expect.objectContaining({
          data: {
            version: '8.10.0',
            rollback: true,
          },
        })
      );
    });

    it('should use current namespace from soClient', async () => {
      const agent: Agent = {
        id: mockAgentId,
        type: 'PERMANENT',
        active: true,
        enrolled_at: '2023-01-01T00:00:00Z',
        local_metadata: {},
        upgrade: {
          rollbacks: [
            {
              version: '8.10.0',
              valid_until: futureDate.toISOString(),
            },
          ],
        },
      } as Agent;

      const mockAgentPolicy = {
        id: 'policy-1',
        is_managed: false,
      };

      mockGetCurrentNamespace.mockReturnValue('custom-space');
      mockGetAgentPolicyForAgent.mockResolvedValue(mockAgentPolicy as any);
      mockCreateAgentAction.mockResolvedValue({ id: mockActionId } as any);
      mockUpdateAgent.mockResolvedValue(undefined);

      await sendRollbackAgentAction(soClient, esClient, agent);

      expect(mockCreateAgentAction).toHaveBeenCalledWith(
        esClient,
        soClient,
        expect.objectContaining({
          namespaces: ['custom-space'],
        })
      );
    });

    it('should throw FleetUnauthorizedError when license is insufficient', async () => {
      mockLicenseService.hasAtLeast.mockReturnValue(false);

      const agent: Agent = {
        id: mockAgentId,
        type: 'PERMANENT',
        active: true,
        enrolled_at: '2023-01-01T00:00:00Z',
        local_metadata: {},
        upgrade: {
          rollbacks: [
            {
              version: '8.10.0',
              valid_until: futureDate.toISOString(),
            },
          ],
        },
      } as Agent;

      await expect(sendRollbackAgentAction(soClient, esClient, agent)).rejects.toThrow(
        FleetUnauthorizedError
      );

      await expect(sendRollbackAgentAction(soClient, esClient, agent)).rejects.toThrow(
        'Agent upgrade rollback requires an enterprise license.'
      );

      expect(mockGetAgentPolicyForAgent).not.toHaveBeenCalled();
      expect(mockCreateAgentAction).not.toHaveBeenCalled();
    });

    it('should throw AgentRollbackError if agent is unenrolling', async () => {
      const agent: Agent = {
        id: mockAgentId,
        type: 'PERMANENT',
        active: true,
        enrolled_at: '2023-01-01T00:00:00Z',
        local_metadata: {},
        unenrollment_started_at: '2023-06-01T00:00:00Z',
        upgrade: {
          rollbacks: [
            {
              version: '8.10.0',
              valid_until: futureDate.toISOString(),
            },
          ],
        },
      } as Agent;

      await expect(sendRollbackAgentAction(soClient, esClient, agent)).rejects.toThrow(
        AgentRollbackError
      );
      await expect(sendRollbackAgentAction(soClient, esClient, agent)).rejects.toThrow(
        'cannot roll back an unenrolling or unenrolled agent'
      );

      expect(mockGetAgentPolicyForAgent).not.toHaveBeenCalled();
      expect(mockCreateAgentAction).not.toHaveBeenCalled();
    });

    it('should throw AgentRollbackError if agent is unenrolled', async () => {
      const agent: Agent = {
        id: mockAgentId,
        type: 'PERMANENT',
        active: false,
        enrolled_at: '2023-01-01T00:00:00Z',
        local_metadata: {},
        unenrolled_at: '2023-06-01T00:00:00Z',
        upgrade: {
          rollbacks: [
            {
              version: '8.10.0',
              valid_until: futureDate.toISOString(),
            },
          ],
        },
      } as Agent;

      await expect(sendRollbackAgentAction(soClient, esClient, agent)).rejects.toThrow(
        AgentRollbackError
      );
      await expect(sendRollbackAgentAction(soClient, esClient, agent)).rejects.toThrow(
        'cannot roll back an unenrolling or unenrolled agent'
      );

      expect(mockGetAgentPolicyForAgent).not.toHaveBeenCalled();
      expect(mockCreateAgentAction).not.toHaveBeenCalled();
    });

    it('should throw AgentRollbackError if agent is upgrading', async () => {
      const agent: Agent = {
        id: mockAgentId,
        type: 'PERMANENT',
        active: true,
        enrolled_at: '2023-01-01T00:00:00Z',
        local_metadata: {},
        upgrade_started_at: '2023-06-01T00:00:00Z',
        upgrade: {
          rollbacks: [
            {
              version: '8.10.0',
              valid_until: futureDate.toISOString(),
            },
          ],
        },
      } as Agent;

      await expect(sendRollbackAgentAction(soClient, esClient, agent)).rejects.toThrow(
        AgentRollbackError
      );
      await expect(sendRollbackAgentAction(soClient, esClient, agent)).rejects.toThrow(
        'cannot roll back an upgrading agent'
      );

      expect(mockGetAgentPolicyForAgent).not.toHaveBeenCalled();
      expect(mockCreateAgentAction).not.toHaveBeenCalled();
    });
  });

  describe('sendRollbackAgentsActions', () => {
    const mockActionId1 = 'action-1';
    const mockActionId2 = 'action-2';
    const now = new Date();
    const futureDate = new Date(now.getTime() + 1000 * 60 * 60); // 1 hour from now
    mockGetCurrentNamespace.mockReturnValue('default');

    describe('with agents array', () => {
      it('should send rollback actions for multiple agents', async () => {
        const agents: Agent[] = [
          {
            id: 'agent-1',
            type: 'PERMANENT',
            active: true,
            enrolled_at: '2023-01-01T00:00:00Z',
            local_metadata: {},
            upgrade: {
              rollbacks: [
                {
                  version: '8.10.0',
                  valid_until: futureDate.toISOString(),
                },
              ],
            },
          },
          {
            id: 'agent-2',
            type: 'PERMANENT',
            active: true,
            enrolled_at: '2023-01-01T00:00:00Z',
            local_metadata: {},
            upgrade: {
              rollbacks: [
                {
                  version: '8.10.0',
                  valid_until: futureDate.toISOString(),
                },
              ],
            },
          },
        ] as Agent[];

        mockRollbackBatch.mockResolvedValue({
          actionIds: [mockActionId1, mockActionId2],
        });

        const result = await sendRollbackAgentsActions(soClient, esClient, {
          agents,
        });

        expect(result.actionIds).toEqual([mockActionId1, mockActionId2]);
        expect(mockRollbackBatch).toHaveBeenCalledWith(esClient, agents, {}, {}, ['default']);
      });

      it('should handle empty agents array', async () => {
        mockRollbackBatch.mockResolvedValue({
          actionIds: [],
        });

        const result = await sendRollbackAgentsActions(soClient, esClient, {
          agents: [],
        });

        expect(result.actionIds).toEqual([]);
        expect(mockRollbackBatch).toHaveBeenCalledWith(esClient, [], {}, {}, ['default']);
      });
    });

    describe('with agentIds', () => {
      it('should fetch agents by IDs and send rollback actions', async () => {
        const agentIds = ['agent-1', 'agent-2'];
        const agents: Agent[] = [
          {
            id: 'agent-1',
            type: 'PERMANENT',
            active: true,
            enrolled_at: '2023-01-01T00:00:00Z',
            local_metadata: {},
          },
          {
            id: 'agent-2',
            type: 'PERMANENT',
            active: true,
            enrolled_at: '2023-01-01T00:00:00Z',
            local_metadata: {},
          },
        ] as Agent[];

        mockGetAgentsById.mockResolvedValue(agents);
        mockRollbackBatch.mockResolvedValue({
          actionIds: [mockActionId1],
        });

        const result = await sendRollbackAgentsActions(soClient, esClient, {
          agentIds,
        });

        expect(result.actionIds).toEqual([mockActionId1]);
        expect(mockGetAgentsById).toHaveBeenCalledWith(esClient, soClient, agentIds);
        expect(mockRollbackBatch).toHaveBeenCalledWith(esClient, agents, {}, {}, ['default']);
      });

      it('should handle agents not found', async () => {
        const agentIds = ['agent-1', 'agent-2'];
        const agent1: Agent = {
          id: 'agent-1',
          type: 'PERMANENT',
          active: true,
          enrolled_at: '2023-01-01T00:00:00Z',
          local_metadata: {},
        } as Agent;

        mockGetAgentsById.mockResolvedValue([agent1, { id: 'agent-2', notFound: true }] as any);
        mockRollbackBatch.mockResolvedValue({
          actionIds: [mockActionId1],
        });

        const result = await sendRollbackAgentsActions(soClient, esClient, {
          agentIds,
        });

        expect(result.actionIds).toEqual([mockActionId1]);
        expect(mockRollbackBatch).toHaveBeenCalledWith(
          esClient,
          [agent1],
          { 'agent-2': expect.any(AgentNotFoundError) },
          {},
          ['default']
        );
      });
    });

    describe('with kuery', () => {
      it('should fetch agents by kuery and send rollback actions when total <= batchSize', async () => {
        const kuery = 'status:online';
        const agents: Agent[] = [
          {
            id: 'agent-1',
            type: 'PERMANENT',
            active: true,
            enrolled_at: '2023-01-01T00:00:00Z',
            local_metadata: {},
          },
        ] as Agent[];

        mockGetAgentsByKuery.mockResolvedValue({
          agents,
          total: 1,
          page: 1,
          perPage: SO_SEARCH_LIMIT,
        });
        mockRollbackBatch.mockResolvedValue({
          actionIds: [mockActionId1],
        });

        const result = await sendRollbackAgentsActions(soClient, esClient, {
          kuery,
        });

        expect(result.actionIds).toEqual([mockActionId1]);
        expect(mockGetAgentsByKuery).toHaveBeenNthCalledWith(1, esClient, soClient, {
          kuery: `(${kuery})`,
          showAgentless: undefined,
          showInactive: false,
          page: 1,
          perPage: 0,
        });
        expect(mockGetAgentsByKuery).toHaveBeenNthCalledWith(2, esClient, soClient, {
          kuery: `(${kuery})`,
          showAgentless: undefined,
          showInactive: false,
          page: 1,
          perPage: SO_SEARCH_LIMIT,
        });
        expect(mockRollbackBatch).toHaveBeenCalledWith(esClient, agents, {}, {}, ['default']);
      });

      it('should use RollbackActionRunner when total > batchSize', async () => {
        const kuery = 'status:online';
        const batchSize = 100;
        const total = 250;
        const pitId = 'pit-123';

        const mockRunnerInstance = {
          processAgentsInBatches: jest.fn().mockResolvedValue({ actionId: mockActionId1 }),
          getAllActionIds: jest.fn().mockReturnValue([mockActionId1, mockActionId2]),
        };

        mockGetAgentsByKuery.mockResolvedValue({
          agents: [],
          total,
          page: 1,
          perPage: batchSize,
        });
        mockOpenPointInTime.mockResolvedValue(pitId);
        mockRollbackActionRunner.mockImplementation(() => mockRunnerInstance as any);

        const result = await sendRollbackAgentsActions(soClient, esClient, {
          kuery,
          batchSize,
        });

        expect(result.actionIds).toEqual([mockActionId1, mockActionId2]);
        expect(mockGetAgentsByKuery).toHaveBeenCalledWith(esClient, soClient, {
          kuery: `(${kuery})`,
          showAgentless: undefined,
          showInactive: false,
          page: 1,
          perPage: 0,
        });
        expect(mockOpenPointInTime).toHaveBeenCalledWith(esClient);
        expect(mockRollbackActionRunner).toHaveBeenCalledWith(
          esClient,
          soClient,
          expect.objectContaining({
            kuery,
            batchSize,
            total,
            spaceId: 'default',
          }),
          { pitId }
        );
        expect(mockRunnerInstance.processAgentsInBatches).toHaveBeenCalled();
      });

      it('should apply namespace filter to kuery', async () => {
        const kuery = 'status:online';
        const namespaceFilter = 'namespaces:default';

        mockAgentsKueryNamespaceFilter.mockResolvedValue(namespaceFilter);
        mockGetAgentsByKuery.mockResolvedValue({
          agents: [],
          total: 1,
          page: 1,
          perPage: SO_SEARCH_LIMIT,
        });
        mockRollbackBatch.mockResolvedValue({
          actionIds: [],
        });

        await sendRollbackAgentsActions(soClient, esClient, {
          kuery,
        });

        expect(mockGetAgentsByKuery).toHaveBeenCalledWith(
          esClient,
          soClient,
          expect.objectContaining({
            kuery: `(${namespaceFilter}) AND (${kuery})`,
          })
        );
      });

      it('should handle showAgentless option', async () => {
        const kuery = 'status:online';

        mockGetAgentsByKuery.mockResolvedValue({
          agents: [],
          total: 1,
          page: 1,
          perPage: SO_SEARCH_LIMIT,
        });
        mockRollbackBatch.mockResolvedValue({
          actionIds: [],
        });

        await sendRollbackAgentsActions(soClient, esClient, {
          kuery,
          showAgentless: true,
        });

        expect(mockGetAgentsByKuery).toHaveBeenCalledWith(
          esClient,
          soClient,
          expect.objectContaining({
            showAgentless: true,
          })
        );
      });

      it('should handle includeInactive option', async () => {
        const kuery = 'status:online';

        mockGetAgentsByKuery.mockResolvedValue({
          agents: [],
          total: 1,
          page: 1,
          perPage: SO_SEARCH_LIMIT,
        });
        mockRollbackBatch.mockResolvedValue({
          actionIds: [],
        });

        await sendRollbackAgentsActions(soClient, esClient, {
          kuery,
          includeInactive: true,
        });

        expect(mockGetAgentsByKuery).toHaveBeenCalledWith(
          esClient,
          soClient,
          expect.objectContaining({
            showInactive: true,
          })
        );
      });

      it('should use custom batchSize', async () => {
        const kuery = 'status:online';
        const customBatchSize = 50;

        mockGetAgentsByKuery.mockResolvedValue({
          agents: [],
          total: 1,
          page: 1,
          perPage: customBatchSize,
        });
        mockRollbackBatch.mockResolvedValue({
          actionIds: [],
        });

        await sendRollbackAgentsActions(soClient, esClient, {
          kuery,
          batchSize: customBatchSize,
        });

        expect(mockGetAgentsByKuery).toHaveBeenCalledWith(
          esClient,
          soClient,
          expect.objectContaining({
            perPage: customBatchSize,
          })
        );
      });
    });

    describe('license check', () => {
      it('should throw FleetUnauthorizedError when license is insufficient', async () => {
        mockLicenseService.hasAtLeast.mockReturnValue(false);

        const agents: Agent[] = [
          {
            id: 'agent-1',
            type: 'PERMANENT',
            active: true,
            enrolled_at: '2023-01-01T00:00:00Z',
            local_metadata: {},
          },
        ] as Agent[];

        await expect(sendRollbackAgentsActions(soClient, esClient, { agents })).rejects.toThrow(
          FleetUnauthorizedError
        );

        await expect(sendRollbackAgentsActions(soClient, esClient, { agents })).rejects.toThrow(
          'Agent upgrade rollback requires an enterprise license.'
        );

        expect(mockRollbackBatch).not.toHaveBeenCalled();
      });

      it('should throw FleetUnauthorizedError when license is insufficient for agentIds', async () => {
        mockLicenseService.hasAtLeast.mockReturnValue(false);

        await expect(
          sendRollbackAgentsActions(soClient, esClient, { agentIds: ['agent-1'] })
        ).rejects.toThrow(FleetUnauthorizedError);

        await expect(
          sendRollbackAgentsActions(soClient, esClient, { agentIds: ['agent-1'] })
        ).rejects.toThrow('Agent upgrade rollback requires an enterprise license.');

        expect(mockGetAgentsById).not.toHaveBeenCalled();
      });

      it('should throw FleetUnauthorizedError when license is insufficient for kuery', async () => {
        mockLicenseService.hasAtLeast.mockReturnValue(false);

        await expect(
          sendRollbackAgentsActions(soClient, esClient, { kuery: 'status:online' })
        ).rejects.toThrow(FleetUnauthorizedError);

        await expect(
          sendRollbackAgentsActions(soClient, esClient, { kuery: 'status:online' })
        ).rejects.toThrow('Agent upgrade rollback requires an enterprise license.');

        expect(mockGetAgentsByKuery).not.toHaveBeenCalled();
      });
    });
  });
});
