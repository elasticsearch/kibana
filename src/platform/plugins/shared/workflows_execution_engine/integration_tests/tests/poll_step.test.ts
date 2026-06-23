/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server/task';
import { ExecutionStatus, StepCategory } from '@kbn/workflows';
import { createPollServerStepDefinition } from '@kbn/workflows-extensions/server';
import { z } from '@kbn/zod/v4';
import { FakeConnectors } from '../mocks/actions_plugin_mock';
import { WorkflowRunFixture } from '../workflow_run_fixture';

/** Next wake-up must be >5s so the engine schedules `workflow:resume` instead of in-process sleep. */
const LONG_POLL_MS = 6_000;

const pollOnlyStep = createPollServerStepDefinition({
  id: 'integration.pollOnly',
  category: StepCategory.Kibana,
  label: 'Poll-only (integration)',
  description: 'Completes after two poll invocations',
  inputSchema: z.object({}),
  outputSchema: z.object({ pollsUsed: z.number() }),
  poll: async ({ state }) => {
    const count = (state as { count?: number } | undefined)?.count ?? 0;
    if (count + 1 >= 2) {
      return { output: { pollsUsed: count + 1 } };
    }
    return { state: { count: count + 1 } };
  },
  policy: { strategy: 'fixed', intervalMs: LONG_POLL_MS },
  ceilings: { maxAttempts: 10, maxWaitMs: 120_000 },
});

const startThenPollStep = createPollServerStepDefinition({
  id: 'integration.runThenPoll',
  category: StepCategory.Kibana,
  label: 'Start + poll (integration)',
  description: 'Start seeds state; poll flips ready then completes',
  inputSchema: z.object({}),
  outputSchema: z.object({ done: z.literal(true) }),
  start: async () => ({ state: { ready: false as boolean } }),
  poll: async ({ state }) => {
    const s = state as { ready: boolean } | undefined;
    if (s?.ready) {
      return { output: { done: true as const } };
    }
    return { state: { ready: true } };
  },
  policy: { strategy: 'fixed', intervalMs: LONG_POLL_MS },
  ceilings: { maxAttempts: 10, maxWaitMs: 120_000 },
});

const wireStepMocks = (fixture: WorkflowRunFixture) => {
  (fixture.dependencies.workflowsExtensions.getStepDefinition as jest.Mock).mockImplementation(
    (id: string) => {
      if (id === 'integration.pollOnly') {
        return pollOnlyStep;
      }
      if (id === 'integration.runThenPoll') {
        return startThenPollStep;
      }
      return undefined;
    }
  );
  (fixture.dependencies.workflowsExtensions.hasStepDefinition as jest.Mock).mockImplementation(
    (id: string) => id === 'integration.pollOnly' || id === 'integration.runThenPoll'
  );
};

describe('workflow with durable poll steps', () => {
  describe('poll-only step schedules resume then completes', () => {
    let workflowRunFixture: WorkflowRunFixture;

    beforeAll(async () => {
      workflowRunFixture = new WorkflowRunFixture();
      wireStepMocks(workflowRunFixture);
      const yaml = `
steps:
  - name: firstConnectorStep
    type: slack
    connector-id: ${FakeConnectors.slack1.name}
    with:
      message: 'Before poll'

  - name: pollStep
    type: integration.pollOnly
    with: {}

  - name: lastConnectorStep
    type: slack
    connector-id: ${FakeConnectors.slack2.name}
    with:
      message: 'After poll'
`;
      jest.clearAllMocks();
      await workflowRunFixture.runWorkflow({ workflowYaml: yaml });
    });

    it('puts workflow in WAITING after first poll schedules a long delay', async () => {
      const wf = workflowRunFixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      );
      expect(wf?.status).toBe(ExecutionStatus.WAITING);
    });

    it('schedules workflow:resume', async () => {
      expect(workflowRunFixture.taskManagerMock.schedule).toHaveBeenCalledTimes(1);
      const call = (workflowRunFixture.taskManagerMock.schedule as jest.Mock).mock
        .calls[0][0] as ConcreteTaskInstance;
      expect(call.taskType).toBe('workflow:resume');
    });

    describe('after resume', () => {
      beforeAll(async () => {
        await workflowRunFixture.resumeWorkflow();
      });

      it('completes the workflow', async () => {
        const wf = workflowRunFixture.workflowExecutionRepositoryMock.workflowExecutions.get(
          'fake_workflow_execution_id'
        );
        expect(wf?.status).toBe(ExecutionStatus.COMPLETED);
      });

      it('completes the poll step with expected output', async () => {
        const pollExecutions = Array.from(
          workflowRunFixture.stepExecutionRepositoryMock.stepExecutions.values()
        ).filter((se) => se.stepId === 'pollStep');
        expect(pollExecutions.length).toBe(1);
        expect(pollExecutions[0].status).toBe(ExecutionStatus.COMPLETED);
      });
    });
  });

  describe('start + poll step schedules resume then completes', () => {
    let workflowRunFixture: WorkflowRunFixture;

    beforeAll(async () => {
      workflowRunFixture = new WorkflowRunFixture();
      wireStepMocks(workflowRunFixture);
      const yaml = `
steps:
  - name: firstConnectorStep
    type: slack
    connector-id: ${FakeConnectors.slack1.name}
    with:
      message: 'Before start+poll'

  - name: runPollStep
    type: integration.runThenPoll
    with: {}

  - name: lastConnectorStep
    type: slack
    connector-id: ${FakeConnectors.slack2.name}
    with:
      message: 'After start+poll'
`;
      jest.clearAllMocks();
      await workflowRunFixture.runWorkflow({ workflowYaml: yaml });
    });

    it('waits with a scheduled resume task', async () => {
      expect(workflowRunFixture.taskManagerMock.schedule).toHaveBeenCalled();
      const wf = workflowRunFixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      );
      expect(wf?.status).toBe(ExecutionStatus.WAITING);
    });

    describe('after resume', () => {
      beforeAll(async () => {
        // First resume: first poll invocation (after `start` hand-off). Second
        // resume: second poll returns output and the workflow continues.
        await workflowRunFixture.resumeWorkflow();
        await workflowRunFixture.resumeWorkflow();
      });

      it('completes the workflow', async () => {
        const wf = workflowRunFixture.workflowExecutionRepositoryMock.workflowExecutions.get(
          'fake_workflow_execution_id'
        );
        expect(wf?.status).toBe(ExecutionStatus.COMPLETED);
      });
    });
  });
});
