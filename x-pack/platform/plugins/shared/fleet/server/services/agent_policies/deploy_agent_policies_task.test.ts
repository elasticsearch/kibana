/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';

import { scheduleDeployAgentPoliciesTask } from './deploy_agent_policies_task';

const TASK_TYPE = 'fleet:deploy_agent_policies';

describe('scheduleDeployAgentPoliciesTask', () => {
  it('coalesces a single-policy deploy onto a stable task id', async () => {
    const schedule = jest.fn();
    const ensureScheduled = jest.fn();
    const taskManagerStart = { schedule, ensureScheduled } as unknown as TaskManagerStartContract;

    await scheduleDeployAgentPoliciesTask(taskManagerStart, [
      { id: 'policy-1', spaceId: 'default' },
    ]);

    expect(ensureScheduled).toHaveBeenCalledTimes(1);
    expect(ensureScheduled).toHaveBeenCalledWith(
      expect.objectContaining({
        id: `${TASK_TYPE}:default:policy-1`,
        taskType: TASK_TYPE,
        scope: ['fleet'],
        params: { agentPolicyIdsWithSpace: [{ id: 'policy-1', spaceId: 'default' }] },
      })
    );
    expect(schedule).not.toHaveBeenCalled();
  });

  it('uses a unique task id when coalescing is disabled', async () => {
    const schedule = jest.fn();
    const ensureScheduled = jest.fn();
    const taskManagerStart = { schedule, ensureScheduled } as unknown as TaskManagerStartContract;

    await scheduleDeployAgentPoliciesTask(
      taskManagerStart,
      [{ id: 'policy-1', spaceId: 'default' }],
      { coalesce: false }
    );

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0][0].id).toMatch(new RegExp(`^${TASK_TYPE}:`));
    expect(schedule.mock.calls[0][0].id).not.toBe(`${TASK_TYPE}:default:policy-1`);
    expect(ensureScheduled).not.toHaveBeenCalled();
  });

  it('schedules unique batched tasks when deploying multiple policies', async () => {
    const schedule = jest.fn();
    const ensureScheduled = jest.fn();
    const taskManagerStart = { schedule, ensureScheduled } as unknown as TaskManagerStartContract;

    await scheduleDeployAgentPoliciesTask(taskManagerStart, [
      { id: 'policy-1', spaceId: 'default' },
      { id: 'policy-2', spaceId: 'default' },
    ]);

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0][0].params.agentPolicyIdsWithSpace).toHaveLength(2);
    expect(ensureScheduled).not.toHaveBeenCalled();
  });

  it('does not schedule anything when there are no policies', async () => {
    const schedule = jest.fn();
    const ensureScheduled = jest.fn();
    const taskManagerStart = { schedule, ensureScheduled } as unknown as TaskManagerStartContract;

    await scheduleDeployAgentPoliciesTask(taskManagerStart, []);

    expect(schedule).not.toHaveBeenCalled();
    expect(ensureScheduled).not.toHaveBeenCalled();
  });
});
