/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClientMock } from '@kbn/core/server/mocks';
import { coreMock } from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import type { TaskManagerSetupContract } from '@kbn/task-manager-plugin/server';
import { TaskStatus } from '@kbn/task-manager-plugin/server';
import { getDeleteTaskRunResult } from '@kbn/task-manager-plugin/server/task';
import type { CoreSetup } from '@kbn/core/server';
import { loggingSystemMock } from '@kbn/core/server/mocks';

import { createAppContextStartContractMock } from '../mocks';

import { appContextService } from '../services';
import { bulkUpdateAgents, fetchAllAgentsByKuery } from '../services/agents';

import type { Agent } from '../types';

import { AgentStatusChangeTask, TYPE, VERSION } from './agent_status_change_task';

jest.mock('../services');
jest.mock('../services/agents');
jest.mock('../services/outputs/helpers');
jest.mock('../services/agent_policy', () => ({
  getAgentPolicySavedObjectType: jest.fn().mockResolvedValue('fleet-agent-policies'),
  agentPolicyService: {
    list: jest.fn().mockResolvedValue({
      items: [{ id: 'agentless-policy-1', name: 'Agentless Policy 1' } as any],
    }),
  },
}));

const MOCK_TASK_INSTANCE = {
  id: `${TYPE}:${VERSION}`,
  runAt: new Date(),
  attempts: 0,
  ownerId: '',
  status: TaskStatus.Running,
  startedAt: new Date(),
  scheduledAt: new Date(),
  retryAt: new Date(),
  params: {},
  state: {},
  taskType: TYPE,
};

const mockedFetchAllAgentsByKuery = fetchAllAgentsByKuery as jest.MockedFunction<
  typeof fetchAllAgentsByKuery
>;
const getMockFetchAllAgentsByKuery = (items: Agent[]) =>
  jest.fn(async function* () {
    yield items;
  })();
const mockBulkUpdateAgents = bulkUpdateAgents as jest.MockedFunction<typeof bulkUpdateAgents>;

describe('AgentStatusChangeTask', () => {
  const { createSetup: coreSetupMock } = coreMock;
  const { createSetup: tmSetupMock, createStart: tmStartMock } = taskManagerMock;

  let mockContract: ReturnType<typeof createAppContextStartContractMock>;
  let mockTask: AgentStatusChangeTask;
  let mockCore: CoreSetup;
  let mockTaskManagerSetup: jest.Mocked<TaskManagerSetupContract>;

  beforeEach(async () => {
    mockContract = createAppContextStartContractMock();
    appContextService.start(mockContract);
    mockCore = coreSetupMock({
      pluginStartContract: {},
    });
    mockTaskManagerSetup = tmSetupMock();
    mockTask = new AgentStatusChangeTask({
      core: mockCore,
      taskManager: mockTaskManagerSetup,
      logFactory: loggingSystemMock.create(),
      config: {
        taskInterval: '10m',
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Task lifecycle', () => {
    it('Should create task', () => {
      expect(mockTask).toBeInstanceOf(AgentStatusChangeTask);
    });

    it('Should register task', () => {
      expect(mockTaskManagerSetup.registerTaskDefinitions).toHaveBeenCalled();
    });

    it('Should schedule task', async () => {
      const mockTaskManagerStart = tmStartMock();
      await mockTask.start({ taskManager: mockTaskManagerStart });
      expect(mockTaskManagerStart.ensureScheduled).toHaveBeenCalled();
    });
  });

  describe('Task logic', () => {
    let esClient: ElasticsearchClientMock;
    const runTask = async (taskInstance = MOCK_TASK_INSTANCE) => {
      const mockTaskManagerStart = tmStartMock();
      await mockTask.start({ taskManager: mockTaskManagerStart });
      const createTaskRunner =
        mockTaskManagerSetup.registerTaskDefinitions.mock.calls[0][0][TYPE].createTaskRunner;
      const taskRunner = createTaskRunner(taskManagerMock.createRunContext({ taskInstance }));
      return taskRunner.run();
    };

    beforeEach(async () => {
      const [{ elasticsearch }] = await mockCore.getStartServices();
      esClient = elasticsearch.client.asInternalUser as ElasticsearchClientMock;
      jest
        .spyOn(appContextService, 'getExperimentalFeatures')
        .mockReturnValue({ enableAgentStatusAlerting: true } as any);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('Should not run if task is outdated', async () => {
      const result = await runTask({ ...MOCK_TASK_INSTANCE, id: 'old-id' });

      expect(result).toEqual(getDeleteTaskRunResult());
    });

    it('should record agent status change', async () => {
      const agents = [
        {
          id: 'agent-1',
          policy_id: 'agentless-policy-1',
          status: 'unhealthy',
          namespaces: ['default'],
          local_metadata: {
            host: {
              hostname: 'host1',
            },
          },
        },
        {
          id: 'agent-2',
          policy_id: 'agent-policy-2',
          status: 'online',
          namespaces: ['space1'],
          local_metadata: {
            host: {
              hostname: 'host2',
            },
          },
          last_known_status: 'offline',
        },
      ] as unknown as Agent[];
      mockedFetchAllAgentsByKuery
        .mockResolvedValueOnce(getMockFetchAllAgentsByKuery(agents))
        .mockResolvedValue(getMockFetchAllAgentsByKuery([]));

      await runTask();

      expect(mockBulkUpdateAgents).toHaveBeenCalledWith(
        esClient,
        [
          {
            agentId: 'agent-1',
            data: {
              last_known_status: 'unhealthy',
            },
          },
          {
            agentId: 'agent-2',
            data: {
              last_known_status: 'online',
            },
          },
        ],
        {}
      );
      expect(esClient.bulk).toHaveBeenCalledWith(
        expect.objectContaining({
          operations: expect.arrayContaining([
            expect.objectContaining({
              '@timestamp': expect.any(String),
              agent: {
                id: 'agent-1',
              },
              agentless: true,
              data_stream: {
                dataset: 'elastic_agent.status_change',
                namespace: 'default',
                type: 'logs',
              },
              hostname: 'host1',
              policy_id: 'agentless-policy-1',
              space_id: ['default'],
              status: 'unhealthy',
            }),
            expect.objectContaining({
              '@timestamp': expect.any(String),
              agent: {
                id: 'agent-2',
              },
              agentless: false,
              data_stream: {
                dataset: 'elastic_agent.status_change',
                namespace: 'default',
                type: 'logs',
              },
              hostname: 'host2',
              policy_id: 'agent-policy-2',
              space_id: ['space1'],
              status: 'online',
            }),
          ]),
        })
      );
    });

    it('should do nothing when no agents changed status', async () => {
      const agents = [] as unknown as Agent[];
      mockedFetchAllAgentsByKuery
        .mockResolvedValueOnce(getMockFetchAllAgentsByKuery(agents))
        .mockResolvedValue(getMockFetchAllAgentsByKuery([]));

      await runTask();

      expect(mockBulkUpdateAgents).not.toHaveBeenCalled();
      expect(esClient.bulk).not.toHaveBeenCalled();
    });

    it('should do nothing when feature flag is disabled', async () => {
      jest
        .spyOn(appContextService, 'getExperimentalFeatures')
        .mockReturnValue({ enableAgentStatusAlerting: false } as any);
      const agents = [
        {
          id: 'agent-3',
          policy_id: 'agent-policy-3',
          status: 'online',
          namespaces: ['default'],
          local_metadata: {
            host: {
              hostname: 'host3',
            },
          },
          last_known_status: 'offline',
        },
      ] as unknown as Agent[];
      mockedFetchAllAgentsByKuery
        .mockResolvedValueOnce(getMockFetchAllAgentsByKuery(agents))
        .mockResolvedValue(getMockFetchAllAgentsByKuery([]));

      await runTask();

      expect(mockBulkUpdateAgents).not.toHaveBeenCalled();
      expect(esClient.bulk).not.toHaveBeenCalled();
    });
  });
});
