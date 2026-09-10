/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ExecutionStatus, isTerminalStatus, WorkflowRepository } from '@kbn/workflows';
import { NodesFactory } from '../../server/step/nodes_factory';
import { WorkflowRunFixture } from '../workflow_run_fixture';

const executionId = 'fake_workflow_execution_id';
const deferred = () => {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const definition = (terminate = false) => `
steps:
  - name: branches
    type: parallel
    mode: settled
    branch-timeout: 1s
    on-failure:
      fallback:
        - name: forbiddenFallback
          type: console
          with: { message: forbidden }
    branches:
      - name: childBranch
        steps:
          - name: child
            type: workflow.execute
            with: { workflow-id: child-workflow }
          - name: forbiddenAfterChild
            type: console
            with: { message: forbidden }
      - name: sibling
        steps:
          - name: siblingStep
            type: ${terminate ? 'workflow.output' : 'wait'}
            with: ${terminate ? '{ message: chosen }' : '{ duration: 1h }'}
`;
const setup = () => {
  const fixture = new WorkflowRunFixture();
  jest.spyOn(WorkflowRepository.prototype, 'getWorkflow').mockResolvedValue({
    id: 'child-workflow',
    name: 'Child',
    enabled: true,
    valid: true,
    definition: undefined,
    yaml: 'steps: []',
    tags: [],
    createdAt: new Date(),
    createdBy: 'test',
    lastUpdatedAt: new Date(),
    lastUpdatedBy: 'test',
    deleted_at: null,
  });
  fixture.workflowsExecutionEngineMock.executeWorkflow.mockResolvedValue({
    workflowExecutionId: 'child-execution',
  });
  fixture.workflowsExecutionEngineMock.cancelWorkflowExecution.mockResolvedValue(undefined);
  return fixture;
};
const assertCancelledChild = (fixture: WorkflowRunFixture) => {
  expect(fixture.workflowsExecutionEngineMock.executeWorkflow).toHaveBeenCalledTimes(1);
  expect(fixture.workflowsExecutionEngineMock.cancelWorkflowExecution).toHaveBeenCalledTimes(1);
  expect(fixture.workflowsExecutionEngineMock.cancelWorkflowExecution).toHaveBeenCalledWith(
    'child-execution',
    'fake_space_id',
    fixture.fakeKibanaRequest
  );
  const steps = [...fixture.stepExecutionRepositoryMock.stepExecutions.values()];
  expect(
    steps
      .filter((step) => !isTerminalStatus(step.status))
      .map((step) => ({ stepId: step.stepId, status: step.status }))
  ).toEqual([]);
  expect(steps.filter((step) => step.stepId.startsWith('forbidden'))).toEqual([]);
};

afterEach(() => jest.restoreAllMocks());

describe('parallel child workflow cancellation', () => {
  it.each(['cancellation', 'timeout', 'cleanup failure'])(
    'cleans a parked child on %s',
    async (reason) => {
      const fixture = setup();
      await fixture.runWorkflow({ workflowYaml: definition() });
      const workflow = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(executionId);
      if (!workflow) throw new Error('Missing workflow');
      expect(workflow.status).toBe(ExecutionStatus.WAITING);
      if (reason === 'timeout') {
        jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);
      } else {
        workflow.cancelRequested = true;
      }
      if (reason === 'cleanup failure') {
        fixture.workflowsExecutionEngineMock.cancelWorkflowExecution.mockRejectedValue(
          new Error('Child cancellation unavailable')
        );
      }
      await fixture.resumeWorkflow();
      assertCancelledChild(fixture);
      expect(
        fixture.workflowExecutionRepositoryMock.workflowExecutions.get(executionId)?.status
      ).toBe(
        reason === 'cleanup failure'
          ? ExecutionStatus.FAILED
          : reason === 'timeout'
          ? ExecutionStatus.COMPLETED
          : ExecutionStatus.CANCELLED
      );
    }
  );

  it('cancels a child whose start response arrives after active parent cancellation', async () => {
    const fixture = setup();
    const started = deferred();
    const release = deferred();
    fixture.workflowsExecutionEngineMock.executeWorkflow.mockImplementation(async () => {
      started.resolve();
      await release.promise;
      return { workflowExecutionId: 'child-execution' };
    });
    const running = fixture.runWorkflow({ workflowYaml: definition() });
    await started.promise;
    fixture.taskAbortController.abort();
    release.resolve();
    await running;
    assertCancelledChild(fixture);
    expect(
      fixture.workflowExecutionRepositoryMock.workflowExecutions.get(executionId)?.status
    ).toBe(ExecutionStatus.CANCELLED);
  });

  it('cancels the sibling child when a whole-workflow return is accepted', async () => {
    const fixture = setup();
    const started = deferred();
    fixture.workflowsExecutionEngineMock.executeWorkflow.mockImplementation(async () => {
      started.resolve();
      return { workflowExecutionId: 'child-execution' };
    });
    const create = NodesFactory.prototype.create;
    jest
      .spyOn(NodesFactory.prototype, 'create')
      .mockImplementation(function (this: NodesFactory, runtime) {
        const implementation = create.call(this, runtime);
        if (runtime.node.stepId !== 'siblingStep') return implementation;
        return {
          run: async () => {
            await started.promise;
            await implementation.run();
          },
        };
      });
    await fixture.runWorkflow({ workflowYaml: definition(true) });
    assertCancelledChild(fixture);
    expect(
      fixture.workflowExecutionRepositoryMock.workflowExecutions.get(executionId)?.status
    ).toBe(ExecutionStatus.COMPLETED);
    expect(
      [...fixture.stepExecutionRepositoryMock.stepExecutions.values()].find(
        (step) => step.stepId === 'child'
      )?.status
    ).toBe(ExecutionStatus.CANCELLED);
  });
});
