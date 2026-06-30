/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { TaskStatus } from '@kbn/task-manager-plugin/server';

import { coreMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';

import { agentPolicyService, appContextService } from '../../services';
import { createAppContextStartContractMock } from '../../mocks';
import { createAgentPolicyMock } from '../../../common/mocks';

import type { AgentPolicy } from '../../types';

import { agentlessAgentService } from '../../services/agents/agentless_agent';

import { getAgentsByKuery } from '../../services/agents';

import {
  UPGRADE_AGENT_DEPLOYMENTS_TASK_VERSION,
  UPGRADE_AGENTLESS_DEPLOYMENTS_TASK_TYPE,
  UpgradeAgentlessDeploymentsTask,
} from './upgrade_agentless_deployment';

const systemMock = {
  id: 'c6d16e42-c32d-4dce-8a88-113cfe276ad1',
  name: 'system-1',
  description: '',
  namespace: 'default',
  enabled: true,
  policy_id: '93c46720-c217-11ea-9906-b5b8a21b268e',
  policy_ids: ['93c46720-c217-11ea-9906-b5b8a21b268e'],
  revision: 1,
  package: {
    name: 'system',
    title: 'System',
    version: '0.9.0',
  },
  updated_at: '2020-06-25T16:03:38.159292',
  updated_by: 'kibana',
  created_at: '2020-06-25T16:03:38.159292',
  created_by: 'kibana',
  inputs: [
    {
      config: {},
      enabled: true,
      type: 'system',
      streams: [],
    },
  ],
};
const MOCK_TASK_INSTANCE = {
  id: `${UPGRADE_AGENTLESS_DEPLOYMENTS_TASK_TYPE}:${UPGRADE_AGENT_DEPLOYMENTS_TASK_VERSION}`,
  runAt: new Date(),
  attempts: 1,
  ownerId: '',
  status: TaskStatus.Running,
  startedAt: new Date(),
  scheduledAt: new Date(),
  retryAt: new Date(),
  params: {},
  state: {},
  taskType: UPGRADE_AGENTLESS_DEPLOYMENTS_TASK_TYPE,
};

const mockAgentPolicy: AgentPolicy = createAgentPolicyMock({
  agents: 1,
  id: '93c46720-c217-11ea-9906-b5b8a21b268e',
  package_policies: [systemMock],
});

jest.mock('../../services/agent_policy_update', () => ({
  agentPolicyUpdateEventHandler: jest.fn(),
}));

jest.mock('../../services/agents', () => ({
  getAgentsByKuery: jest.fn(),
  getLatestAvailableAgentVersion: jest.fn(),
}));

describe('Upgrade Agentless Deployments', () => {
  const { createSetup: coreSetupMock } = coreMock;
  const { createSetup: tmSetupMock, createStart: tmStartMock } = taskManagerMock;
  let mockContract: ReturnType<typeof createAppContextStartContractMock>;
  let mockTask: UpgradeAgentlessDeploymentsTask;
  let mockCore: ReturnType<typeof coreSetupMock>;
  let mockTaskManagerSetup: ReturnType<typeof tmSetupMock>;
  let abortController: AbortController;

  const getMockAgentPolicyFetchAllAgentPolicies = (items: AgentPolicy[]) =>
    jest.fn().mockResolvedValue(
      jest.fn(async function* () {
        yield items;
      })()
    );

  beforeEach(() => {
    abortController = new AbortController();
    mockContract = createAppContextStartContractMock();
    appContextService.start(mockContract);
    mockCore = coreSetupMock();
    mockTaskManagerSetup = tmSetupMock();

    mockTask = new UpgradeAgentlessDeploymentsTask({
      core: mockCore,
      taskManager: mockTaskManagerSetup,
      logFactory: loggingSystemMock.create(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Task lifecycle', () => {
    it('Should create task', async () => {
      expect(mockTask).toBeInstanceOf(UpgradeAgentlessDeploymentsTask);
    });

    it('Should register task', async () => {
      expect(mockTaskManagerSetup.registerTaskDefinitions).toHaveBeenCalled();
    });

    it('Should schedule task', async () => {
      const mockTaskManagerStart = tmStartMock();
      await mockTask.start({ taskManager: mockTaskManagerStart });
      expect(mockTaskManagerStart.ensureScheduled).toHaveBeenCalled();
    });
  });

  describe('Task Logic', () => {
    const runTask = async (taskInstance = MOCK_TASK_INSTANCE) => {
      const mockTaskManagerStart = tmStartMock();
      await mockTask.start({ taskManager: mockTaskManagerStart });
      const createTaskRunner =
        mockTaskManagerSetup.registerTaskDefinitions.mock.calls[0][0][
          UPGRADE_AGENTLESS_DEPLOYMENTS_TASK_TYPE
        ].createTaskRunner;
      const taskRunner = createTaskRunner(
        taskManagerMock.createRunContext({ taskInstance, abortController })
      );
      return taskRunner.run();
    };

    const mockAgentPolicyService = agentPolicyService as jest.Mocked<typeof agentPolicyService>;
    const agents = [
      {
        id: 'agent-1',
        policy_id: '93c46720-c217-11ea-9906-b5b8a21b268e',
        status: 'online',
        agent: {
          version: '8.16.0',
        },
      },
      {
        id: 'agent-2',
        policy_id: 'agent-policy-2',
        status: 'inactive',
        agent: {
          version: '8.17.0',
        },
      },
      {
        id: 'agent-3',
        policy_id: 'agent-policy-3',
        status: 'active',
        agent: {
          version: '8.17.0',
        },
      },
    ];
    const mockedGetAgentsByKuery = getAgentsByKuery as jest.Mock;

    beforeEach(() => {
      mockAgentPolicyService.fetchAllAgentPolicies = getMockAgentPolicyFetchAllAgentPolicies([
        mockAgentPolicy,
      ]);
      jest
        .spyOn(appContextService, 'getExperimentalFeatures')
        .mockReturnValue({ enabledUpgradeAgentlessDeploymentsTask: true } as any);

      mockedGetAgentsByKuery.mockResolvedValue({
        agents,
      });

      jest
        .spyOn(agentlessAgentService, 'upgradeAgentlessDeployment')
        .mockResolvedValueOnce(undefined);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should upgrade agentless deployments', async () => {
      await runTask();

      expect(mockAgentPolicyService.fetchAllAgentPolicies).toHaveBeenCalled();
      expect(agentlessAgentService.upgradeAgentlessDeployment).toHaveBeenCalled();
    });

    it('should not upgrade agentless deployments when agent status is updating', async () => {
      mockedGetAgentsByKuery.mockResolvedValue({
        agents: [
          {
            id: 'agent-1',
            policy_id: '93c46720-c217-11ea-9906-b5b8a21b268e',
            status: 'updating',
            agent: {
              version: '8.17.0',
            },
          },
        ],
      });
      await runTask();

      expect(mockAgentPolicyService.fetchAllAgentPolicies).toHaveBeenCalled();
      expect(agentlessAgentService.upgradeAgentlessDeployment).not.toHaveBeenCalled();
    });

    it('should not upgrade agentless deployments when agent status is unhealthy', async () => {
      mockedGetAgentsByKuery.mockResolvedValue({
        agents: [
          {
            id: 'agent-1',
            policy_id: '93c46720-c217-11ea-9906-b5b8a21b268e',
            status: 'updating',
            agent: {
              version: '8.17.0',
            },
          },
        ],
      });
      await runTask();

      expect(mockAgentPolicyService.fetchAllAgentPolicies).toHaveBeenCalled();
      expect(agentlessAgentService.upgradeAgentlessDeployment).not.toHaveBeenCalled();
    });

    it('should upgrade agentless deployments when agent status is online', async () => {
      mockedGetAgentsByKuery.mockResolvedValue({
        agents: [
          {
            id: 'agent-1',
            policy_id: '93c46720-c217-11ea-9906-b5b8a21b268e',
            status: 'online',
            agent: {
              version: '8.17.0',
            },
          },
        ],
      });
      await runTask();

      expect(mockAgentPolicyService.fetchAllAgentPolicies).toHaveBeenCalled();
      expect(agentlessAgentService.upgradeAgentlessDeployment).toHaveBeenCalled();
    });

    it('should not upgrade agentless deployments when agent status is unenroll', async () => {
      mockedGetAgentsByKuery.mockResolvedValue({
        agents: [
          {
            id: 'agent-1',
            policy_id: '93c46720-c217-11ea-9906-b5b8a21b268e',
            status: 'unenroll',
            agent: {
              version: '8.17.0',
            },
          },
        ],
      });
      await runTask();

      expect(mockAgentPolicyService.fetchAllAgentPolicies).toHaveBeenCalled();
      expect(agentlessAgentService.upgradeAgentlessDeployment).not.toHaveBeenCalled();
    });

    it('should not call upgrade agentless api to upgrade when 0 agents', async () => {
      mockedGetAgentsByKuery.mockResolvedValue({
        agents: [],
      });
      await runTask();

      expect(mockAgentPolicyService.fetchAllAgentPolicies).toHaveBeenCalled();
      expect(agentlessAgentService.upgradeAgentlessDeployment).not.toHaveBeenCalled();
    });

    it('should throw an error if task is aborted', async () => {
      abortController.signal.throwIfAborted = jest.fn(() => {
        throw new Error('Task aborted!');
      });

      abortController.abort();
      await runTask();

      expect(abortController.signal.throwIfAborted).toHaveBeenCalled();
    });

    it('should not call upgrade agentless api to upgrade when agent policy is not found', async () => {
      jest
        .spyOn(appContextService, 'getExperimentalFeatures')
        .mockReturnValue({ enabledUpgradeAgentlessDeploymentsTask: false } as any);

      await runTask();

      expect(agentlessAgentService.upgradeAgentlessDeployment).not.toHaveBeenCalled();
    });
  });
});
