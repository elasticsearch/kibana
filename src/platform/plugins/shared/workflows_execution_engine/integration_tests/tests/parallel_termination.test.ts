/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsWorkflowExecution, EsWorkflowStepExecution } from '@kbn/workflows';
import { ExecutionStatus, isTerminalStatus } from '@kbn/workflows';
import { NodesFactory } from '../../server/step/nodes_factory';
import { WorkflowRunFixture } from '../workflow_run_fixture';

const deferred = () => {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const executionId = 'fake_workflow_execution_id';

const definition = (type: string) => `
steps:
  - name: branches
    type: parallel
    on-failure:
      retry: { max-attempts: 2, delay: 1ms }
      fallback:
        - name: forbiddenFallback
          type: console
          with: { message: forbidden }
    branches:
      - name: waiting
        steps:
          - name: pause
            type: wait
            with: { duration: 1h }
          - name: forbiddenAfterWait
            type: console
            with: { message: forbidden }
      - name: returning
        steps:
          - name: terminate
            type: ${type}
            with: { message: chosen }
      - name: competing
        steps:
          - name: later
            type: workflow.output
            with: { message: later }
  - name: forbiddenAfterJoin
    type: console
    with: { message: forbidden }
`;

afterEach(() => jest.restoreAllMocks());

const assertTerminationRecords = (fixture: WorkflowRunFixture) => {
  const steps = [...fixture.stepExecutionRepositoryMock.stepExecutions.values()];
  const winner = steps.find((step) => step.stepId === 'terminate');
  expect(winner).toMatchObject({
    status: ExecutionStatus.COMPLETED,
    error: null,
    executionCheckpoint: null,
  });
  expect(steps.filter((step) => step.stepId === 'branches').map((step) => step.status)).toEqual(
    expect.arrayContaining([ExecutionStatus.COMPLETED])
  );
  expect(
    steps
      .filter((step) => step.stepId === 'branches')
      .every((step) => step.status === ExecutionStatus.COMPLETED)
  ).toBe(true);
  expect(steps.find((step) => step.stepId === 'pause')?.status).toBe(ExecutionStatus.CANCELLED);
  const events = fixture.createEventDocuments.mock.calls.flatMap(([request]) => request.documents);
  const completions = events.filter(
    (event) => event.workflow?.step_id === 'terminate' && event.event?.action === 'step-complete'
  );
  expect(completions).toHaveLength(1);
  expect(completions[0]).toMatchObject({ event: { outcome: 'success' } });
  expect(completions[0].error).toBeUndefined();
  expect(
    events.filter(
      (event) => event.workflow?.step_id === 'terminate' && event.event?.outcome === 'failure'
    )
  ).toEqual([]);
};

describe('coordinated workflow termination', () => {
  it('recovers an accepted result after a crash before sibling cleanup', async () => {
    const fixture = new WorkflowRunFixture();
    const repository = fixture.workflowExecutionRepositoryMock;
    const update = repository.updateWorkflowExecution.bind(repository);
    let snapshot:
      | { workflow: EsWorkflowExecution; steps: Map<string, EsWorkflowStepExecution> }
      | undefined;
    jest.spyOn(repository, 'updateWorkflowExecution').mockImplementation(async (patch) => {
      await update(patch);
      if (patch.pendingTermination && !snapshot) {
        const workflow = repository.workflowExecutions.get(executionId);
        if (!workflow) throw new Error('Missing workflow');
        snapshot = structuredClone({
          workflow,
          steps: fixture.stepExecutionRepositoryMock.stepExecutions,
        });
      }
    });
    await fixture.runWorkflow({ workflowYaml: definition('workflow.output') });
    if (!snapshot) throw new Error('Missing termination commit');
    repository.workflowExecutions.set(executionId, snapshot.workflow);
    fixture.stepExecutionRepositoryMock.stepExecutions.clear();
    for (const [id, step] of snapshot.steps) {
      if (step.stepId === 'terminate') {
        step.status = ExecutionStatus.TIMED_OUT;
        step.error = { type: 'TimeoutError', message: 'stale timeout' };
        const decision = snapshot.workflow.pendingTermination;
        if (!decision) throw new Error('Missing decision');
        step.executionCheckpoint = {
          branchId: 'returning',
          sequence: 1,
          nodeId: decision.nodeId,
          currentNodeId: decision.nodeId,
          stackFrames: decision.stackFrames,
          status: 'timed_out',
          waiting: false,
        };
      }
      fixture.stepExecutionRepositoryMock.stepExecutions.set(id, step);
    }
    fixture.createEventDocuments.mockClear();
    await fixture.resumeWorkflow();
    const workflow = repository.workflowExecutions.get(executionId);
    expect(workflow?.status).toBe(ExecutionStatus.COMPLETED);
    expect(workflow?.context.output).toEqual({ message: 'chosen' });
    const steps = [...fixture.stepExecutionRepositoryMock.stepExecutions.values()];
    expect(steps.every((step) => isTerminalStatus(step.status))).toBe(true);
    assertTerminationRecords(fixture);
    expect(steps.filter((step) => step.stepId.startsWith('forbidden'))).toEqual([]);
  });

  it.each([
    ['workflow.output', ExecutionStatus.COMPLETED],
    ['workflow.fail', ExecutionStatus.FAILED],
  ])('%s terminates all branches and bypasses parent error handlers', async (type, status) => {
    const fixture = new WorkflowRunFixture();
    await fixture.runWorkflow({ workflowYaml: definition(type) });
    const workflow = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(executionId);
    expect(workflow?.status).toBe(status);
    expect(workflow?.context.output).toEqual({ message: 'chosen' });
    if (status === ExecutionStatus.FAILED) expect(workflow?.error?.message).toBe('chosen');
    const steps = [...fixture.stepExecutionRepositoryMock.stepExecutions.values()];
    expect(steps.filter((step) => step.stepId.startsWith('forbidden'))).toEqual([]);
    expect(steps.every((step) => isTerminalStatus(step.status))).toBe(true);
    assertTerminationRecords(fixture);
    expect(steps.find((step) => step.stepId === 'terminate')?.status).toBe(
      ExecutionStatus.COMPLETED
    );
  });
});

it.each([false, true])(
  'preserves output-validation failure through recovery (parallel: %s)',
  async (parallel) => {
    const fixture = new WorkflowRunFixture();
    const repository = fixture.workflowExecutionRepositoryMock;
    const update = repository.updateWorkflowExecution.bind(repository);
    let snapshot:
      | { workflow: EsWorkflowExecution; steps: Map<string, EsWorkflowStepExecution> }
      | undefined;
    jest.spyOn(repository, 'updateWorkflowExecution').mockImplementation(async (patch, options) => {
      await update(patch, options);
      const workflow = repository.workflowExecutions.get(executionId);
      if (patch.pendingTermination && workflow && !snapshot) {
        snapshot = structuredClone({
          workflow,
          steps: fixture.stepExecutionRepositoryMock.stepExecutions,
        });
      }
    });
    const invalidStep = `
  - name: invalid_output
    type: workflow.output
    with: { answer: 42 }
`;
    await fixture.runWorkflow({
      workflowYaml: `
outputs:
  - name: answer
    type: string
    required: true
steps:
${
  parallel
    ? `
  - name: branches
    type: parallel
    branches:
      - name: invalid
        steps:
${invalidStep
  .split('\n')
  .map((line) => `        ${line}`)
  .join('\n')}
`
    : invalidStep
}
`,
    });
    const assertFailedOutput = () => {
      const workflow = repository.workflowExecutions.get(executionId);
      const steps = [...fixture.stepExecutionRepositoryMock.stepExecutions.values()];
      expect(workflow?.status).toBe(ExecutionStatus.FAILED);
      expect(steps.find((step) => step.stepId === 'invalid_output')).toMatchObject({
        status: ExecutionStatus.FAILED,
        error: { message: expect.stringContaining('Output validation failed') },
        executionCheckpoint: null,
      });
      expect(steps.every((step) => isTerminalStatus(step.status))).toBe(true);
      const events = fixture.createEventDocuments.mock.calls.flatMap(
        ([request]) => request.documents
      );
      expect(
        events.filter(
          (event) =>
            event.workflow?.step_id === 'invalid_output' && event.event?.action === 'step-complete'
        )
      ).toEqual([]);
    };
    assertFailedOutput();
    if (!snapshot) throw new Error('Missing termination commit');
    repository.workflowExecutions.set(executionId, snapshot.workflow);
    fixture.stepExecutionRepositoryMock.stepExecutions.clear();
    for (const [key, step] of snapshot.steps)
      fixture.stepExecutionRepositoryMock.stepExecutions.set(key, step);
    fixture.createEventDocuments.mockClear();
    await fixture.resumeWorkflow();
    assertFailedOutput();
  }
);

it('keeps cancellation behind the termination commit and safely resumes an earlier snapshot', async () => {
  const fixture = new WorkflowRunFixture();
  const commitStarted = deferred();
  const allowCommit = deferred();
  const cleanup = jest.fn();
  let blocked = true;
  const repo = fixture.workflowExecutionRepositoryMock;
  const update = repo.updateWorkflowExecution.bind(repo);
  jest.spyOn(repo, 'updateWorkflowExecution').mockImplementation(async (patch, options) => {
    if (blocked && patch.pendingTermination) {
      commitStarted.resolve();
      await allowCommit.promise;
    }
    await update(patch, options);
  });
  const create = NodesFactory.prototype.create;
  jest
    .spyOn(NodesFactory.prototype, 'create')
    .mockImplementation(function (this: NodesFactory, runtime) {
      const implementation = create.call(this, runtime);
      if (runtime.node.stepId !== 'pause') return implementation;
      return {
        run: () => implementation.run(),
        onCancel: async () => {
          cleanup();
        },
      };
    });
  const running = fixture.runWorkflow({
    workflowYaml: `
steps:
  - name: branches
    type: parallel
    branches:
      - name: waiting
        steps:
          - name: pause
            type: wait
            with: { duration: 1h }
          - name: forbidden_after_wait
            type: console
            with: { message: forbidden }
      - name: returning
        steps:
          - name: terminate
            type: workflow.output
            with: { result: chosen }
  - name: forbidden_after_join
    type: console
    with: { message: forbidden }
`,
  });
  await commitStarted.promise;

  await new Promise((resolve) => setTimeout(resolve, 600));
  const snapshot = structuredClone({
    workflow: repo.workflowExecutions.get(executionId),
    steps: fixture.stepExecutionRepositoryMock.stepExecutions,
  });
  const cancelledBeforeCommit = cleanup.mock.calls.length;
  blocked = false;
  allowCommit.resolve();
  await running;
  expect(cancelledBeforeCommit).toBe(0);
  if (!snapshot.workflow) throw new Error('Missing execution');
  repo.workflowExecutions.set(executionId, snapshot.workflow);
  fixture.stepExecutionRepositoryMock.stepExecutions.clear();
  for (const [key, step] of snapshot.steps)
    fixture.stepExecutionRepositoryMock.stepExecutions.set(key, step);
  await fixture.resumeWorkflow();
  const after = {
    workflow: repo.workflowExecutions.get(executionId),
    steps: [...fixture.stepExecutionRepositoryMock.stepExecutions.values()],
  };
  expect(after.workflow?.status).toBe(ExecutionStatus.COMPLETED);
  expect(after.workflow?.context.output).toEqual({ result: 'chosen' });
  expect(after.steps.filter((step) => step.stepId.startsWith('forbidden'))).toEqual([]);
});

it('fails the execution without workflow handlers when the termination commit fails', async () => {
  const fixture = new WorkflowRunFixture();
  const repository = fixture.workflowExecutionRepositoryMock;
  const update = repository.updateWorkflowExecution.bind(repository);
  jest.spyOn(repository, 'updateWorkflowExecution').mockImplementation(async (patch, options) => {
    if (patch.pendingTermination) throw new Error('Termination storage unavailable');
    await update(patch, options);
  });
  await fixture.runWorkflow({ workflowYaml: definition('workflow.output') });
  const workflow = repository.workflowExecutions.get(executionId);
  expect(workflow?.status).toBe(ExecutionStatus.FAILED);
  expect(workflow?.error?.message).toContain('Failed to persist workflow termination');
  expect(workflow?.context.output).toBeUndefined();
  const steps = [...fixture.stepExecutionRepositoryMock.stepExecutions.values()];
  expect(steps.filter((step) => step.stepId.startsWith('forbidden'))).toEqual([]);
});
