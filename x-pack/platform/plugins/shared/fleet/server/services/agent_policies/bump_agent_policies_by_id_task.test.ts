/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ConcreteTaskInstance,
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { loggingSystemMock } from '@kbn/core/server/mocks';

import { agentPolicyService } from '../agent_policy';

import { appContextService } from '..';

import {
  registerBumpAgentPoliciesByIdTask,
  scheduleBumpAgentPoliciesByIdTask,
} from './bump_agent_policies_by_id_task';

jest.mock('../app_context');
jest.mock('../agent_policy');
jest.mock('../epm/packages/cache', () => ({
  runWithCache: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

const mockedAgentPolicyService = jest.mocked(agentPolicyService);
const mockedAppContextService = jest.mocked(appContextService);

const TASK_TYPE = 'fleet:bump_agent_policies_by_id';

const getRegisteredTaskRunner = (
  taskInstance: ConcreteTaskInstance,
  abortController = new AbortController()
): { run: () => Promise<unknown>; abortController: AbortController } => {
  const registerTaskDefinitions = jest.fn();
  registerBumpAgentPoliciesByIdTask({
    registerTaskDefinitions,
  } as unknown as TaskManagerSetupContract);

  const definition = registerTaskDefinitions.mock.calls[0][0][TASK_TYPE];
  return {
    ...(definition.createTaskRunner(
      taskManagerMock.createRunContext({ taskInstance, abortController })
    ) as any),
    abortController,
  };
};

const buildTaskInstance = (params: Record<string, unknown>): ConcreteTaskInstance =>
  ({ params } as unknown as ConcreteTaskInstance);

describe('bump_agent_policies_by_id_task', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAppContextService.getLogger.mockReturnValue(loggingSystemMock.createLogger());
  });

  describe('task runner', () => {
    it('bumps the policies grouped by space, preserving the user', async () => {
      const user = { username: 'jdoe' } as any;
      const runner = getRegisteredTaskRunner(
        buildTaskInstance({
          agentPolicyIdsWithSpace: [
            { id: 'policy-1', spaceId: 'default' },
            { id: 'policy-2', spaceId: 'space-a' },
            { id: 'policy-3', spaceId: 'space-a' },
          ],
          user,
        })
      );

      await runner.run();

      expect(mockedAgentPolicyService.bumpAgentPoliciesByIds).toHaveBeenCalledTimes(2);
      expect(mockedAgentPolicyService.bumpAgentPoliciesByIds).toHaveBeenCalledWith(
        ['policy-1'],
        { user },
        'default'
      );
      expect(mockedAgentPolicyService.bumpAgentPoliciesByIds).toHaveBeenCalledWith(
        ['policy-2', 'policy-3'],
        { user },
        'space-a'
      );
    });

    it('does nothing when there are no policies to bump', async () => {
      const runner = getRegisteredTaskRunner(buildTaskInstance({ agentPolicyIdsWithSpace: [] }));

      await runner.run();

      expect(mockedAgentPolicyService.bumpAgentPoliciesByIds).not.toHaveBeenCalled();
    });

    it('stops processing further spaces when aborted', async () => {
      const abortController = new AbortController();
      abortController.abort();

      const runner = getRegisteredTaskRunner(
        buildTaskInstance({
          agentPolicyIdsWithSpace: [
            { id: 'policy-1', spaceId: 'default' },
            { id: 'policy-2', spaceId: 'space-a' },
          ],
        }),
        abortController
      );

      await runner.run();

      expect(mockedAgentPolicyService.bumpAgentPoliciesByIds).not.toHaveBeenCalled();
    });
  });

  describe('scheduleBumpAgentPoliciesByIdTask', () => {
    it('schedules the task with the policy ids and user', async () => {
      const schedule = jest.fn();
      const taskManagerStart = { schedule } as unknown as TaskManagerStartContract;
      const agentPolicyIdsWithSpace = [{ id: 'policy-1', spaceId: 'default' }];
      const user = { username: 'jdoe' } as any;

      await scheduleBumpAgentPoliciesByIdTask(taskManagerStart, agentPolicyIdsWithSpace, user);

      expect(schedule).toHaveBeenCalledTimes(1);
      expect(schedule).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: TASK_TYPE,
          scope: ['fleet'],
          params: { agentPolicyIdsWithSpace, user },
        })
      );
    });

    it('splits large sets into multiple tasks of at most 100 policies each', async () => {
      const schedule = jest.fn();
      const taskManagerStart = { schedule } as unknown as TaskManagerStartContract;
      const agentPolicyIdsWithSpace = Array.from({ length: 250 }, (_, i) => ({
        id: `policy-${i}`,
        spaceId: 'default',
      }));

      await scheduleBumpAgentPoliciesByIdTask(taskManagerStart, agentPolicyIdsWithSpace);

      expect(schedule).toHaveBeenCalledTimes(3);
      expect(schedule.mock.calls[0][0].params.agentPolicyIdsWithSpace).toHaveLength(100);
      expect(schedule.mock.calls[1][0].params.agentPolicyIdsWithSpace).toHaveLength(100);
      expect(schedule.mock.calls[2][0].params.agentPolicyIdsWithSpace).toHaveLength(50);
    });

    it('does not schedule anything when there are no policies', async () => {
      const schedule = jest.fn();
      const taskManagerStart = { schedule } as unknown as TaskManagerStartContract;

      await scheduleBumpAgentPoliciesByIdTask(taskManagerStart, []);

      expect(schedule).not.toHaveBeenCalled();
    });
  });
});
