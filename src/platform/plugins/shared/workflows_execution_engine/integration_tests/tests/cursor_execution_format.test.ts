/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ExecutionStatus } from '@kbn/workflows';
import { WorkflowRunFixture } from '../workflow_run_fixture';

const executionId = 'fake_workflow_execution_id';
const sequential = `
steps:
  - name: pause
    type: wait
    with: { duration: 1h }
  - name: result
    type: console
    with: { message: resumed }
`;
const parallel = `
steps:
  - name: branches
    type: parallel
    foreach: [a, b]
    steps:
      - name: pause
        type: wait
        with: { duration: 1h }
      - name: result
        type: console
        with: { message: resumed }
`;

afterEach(() => jest.restoreAllMocks());

describe('cursor execution format', () => {
  it.each([sequential, parallel])(
    'uses the cursor engine for new executions and resumes',
    async (workflowYaml) => {
      const fixture = new WorkflowRunFixture();
      await fixture.runWorkflow({ workflowYaml });
      const workflow = () =>
        fixture.workflowExecutionRepositoryMock.workflowExecutions.get(executionId);
      expect(workflow()?.executionMode).toBe('parallel_v4');
      expect(workflow()?.status).toBe(ExecutionStatus.WAITING);
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 3_600_100);
      await fixture.resumeWorkflow();
      expect(workflow()?.status).toBe(ExecutionStatus.COMPLETED);
      expect(
        [...fixture.stepExecutionRepositoryMock.stepExecutions.values()].filter(
          (step) => step.stepId === 'result'
        )
      ).toHaveLength(workflowYaml === sequential ? 1 : 2);
    }
  );

  it.each([undefined, 'legacy', 'future_engine'])(
    'rejects unsupported resumed format %s before loading checkpoints',
    async (mode) => {
      const fixture = new WorkflowRunFixture();
      await fixture.runWorkflow({ workflowYaml: sequential });
      const workflow = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(executionId);
      if (!workflow) throw new Error('Missing workflow');
      expect(workflow.status).toBe(ExecutionStatus.WAITING);
      Reflect.set(workflow, 'executionMode', mode);
      const load = jest.spyOn(fixture.stepExecutionRepositoryMock, 'getStepExecutionsByIds');
      await fixture.resumeWorkflow();
      expect(
        fixture.workflowExecutionRepositoryMock.workflowExecutions.get(executionId)
      ).toMatchObject({
        status: ExecutionStatus.FAILED,
        error: { message: expect.stringContaining('legacy checkpoints cannot be resumed') },
      });
      expect(load).not.toHaveBeenCalled();
      expect(
        [...fixture.stepExecutionRepositoryMock.stepExecutions.values()].filter(
          (step) => step.stepId === 'result'
        )
      ).toEqual([]);
    }
  );

  it('rejects an unmarked pending execution with existing step history', async () => {
    const fixture = new WorkflowRunFixture();
    await fixture.runWorkflow({ workflowYaml: sequential });
    const workflow = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(executionId);
    if (!workflow) throw new Error('Missing workflow');
    delete workflow.executionMode;
    workflow.status = ExecutionStatus.PENDING;
    const load = jest.spyOn(fixture.stepExecutionRepositoryMock, 'getStepExecutionsByIds');
    await fixture.resumeWorkflow();
    expect(
      fixture.workflowExecutionRepositoryMock.workflowExecutions.get(executionId)?.status
    ).toBe(ExecutionStatus.FAILED);
    expect(load).not.toHaveBeenCalled();
  });

  it('does not relabel an already-terminal legacy execution', async () => {
    const fixture = new WorkflowRunFixture();
    await fixture.runWorkflow({
      workflowYaml: 'steps: [{ name: result, type: console, with: { message: done } }]',
    });
    const workflow = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(executionId);
    if (!workflow) throw new Error('Missing workflow');
    workflow.executionMode = 'legacy';
    const update = jest.spyOn(fixture.workflowExecutionRepositoryMock, 'updateWorkflowExecution');
    await fixture.resumeWorkflow();
    expect(update).not.toHaveBeenCalled();
    expect(workflow.status).toBe(ExecutionStatus.COMPLETED);
  });

  it('fails a sequential execution on event persistence failure without running fallback', async () => {
    const fixture = new WorkflowRunFixture();
    fixture.createEventDocuments.mockRejectedValue(new Error('Event store unavailable'));
    await fixture.runWorkflow({
      workflowYaml: `
steps:
  - name: effect
    type: console
    with: { message: effect }
    on-failure:
      fallback:
        - name: forbidden
          type: console
          with: { message: forbidden }
`,
    });
    expect(
      fixture.workflowExecutionRepositoryMock.workflowExecutions.get(executionId)?.status
    ).toBe(ExecutionStatus.FAILED);
    expect(
      [...fixture.stepExecutionRepositoryMock.stepExecutions.values()].filter(
        (step) => step.stepId === 'forbidden'
      )
    ).toEqual([]);
  });
});
