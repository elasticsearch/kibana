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

describe('waitForInput step', () => {
  let fixture: WorkflowRunFixture;

  beforeEach(() => {
    fixture = new WorkflowRunFixture();
  });

  describe('basic pause and resume', () => {
    const yaml = `
steps:
  - name: ask
    type: waitForInput
    with:
      message: "Approve?"
  - name: log
    type: console
    with:
      message: "done"
`;

    it('should pause the workflow in WAITING_FOR_INPUT status', async () => {
      await fixture.runWorkflow({ workflowYaml: yaml });
      const exec = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      );
      expect(exec?.status).toBe(ExecutionStatus.WAITING_FOR_INPUT);
    });

    it('should set the step status to WAITING_FOR_INPUT', async () => {
      await fixture.runWorkflow({ workflowYaml: yaml });
      const steps = Array.from(fixture.stepExecutionRepositoryMock.stepExecutions.values());
      const askStep = steps.find((s) => s.stepId === 'ask');
      expect(askStep?.status).toBe(ExecutionStatus.WAITING_FOR_INPUT);
    });

    it('should resume and complete after providing input', async () => {
      await fixture.runWorkflow({ workflowYaml: yaml });

      // Simulate resume: set resumeInput and run again
      const exec = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      )!;
      exec.context = { ...exec.context, resumeInput: { approved: true } };
      fixture.workflowExecutionRepositoryMock.workflowExecutions.set(exec.id, exec);

      await fixture.resumeWorkflow();

      const updated = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      );
      expect(updated?.status).toBe(ExecutionStatus.COMPLETED);
    });

    it('should pass resumeInput as step output', async () => {
      await fixture.runWorkflow({ workflowYaml: yaml });

      const exec = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      )!;
      exec.context = {
        ...exec.context,
        resumeInput: { approved: true, note: 'ok' },
        resumedBy: 'test-user',
      };
      fixture.workflowExecutionRepositoryMock.workflowExecutions.set(exec.id, exec);

      await fixture.resumeWorkflow();

      const steps = Array.from(fixture.stepExecutionRepositoryMock.stepExecutions.values());
      const askStep = steps.find((s) => s.stepId === 'ask');
      expect(askStep?.output).toEqual({
        response: { approved: true, note: 'ok' },
        respondedBy: 'test-user',
      });
      expect(askStep?.status).toBe(ExecutionStatus.COMPLETED);
    });
  });

  describe('inside foreach loop', () => {
    const foreachYaml = `
steps:
  - name: loop
    type: foreach
    foreach: '["alpha", "beta", "gamma"]'
    steps:
      - name: ask_for_input
        type: waitForInput
        with:
          message: "Approve item"
      - name: log_item
        type: console
        with:
          message: "received"
`;

    it('should pause on the first iteration', async () => {
      await fixture.runWorkflow({ workflowYaml: foreachYaml });

      const exec = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      );
      expect(exec?.status).toBe(ExecutionStatus.WAITING_FOR_INPUT);

      // Only the first iteration's ask_for_input should exist
      const waitingSteps = Array.from(
        fixture.stepExecutionRepositoryMock.stepExecutions.values()
      ).filter((s) => s.stepId === 'ask_for_input');
      expect(waitingSteps.length).toBe(1);
      expect(waitingSteps[0].status).toBe(ExecutionStatus.WAITING_FOR_INPUT);
    });

    it('should resume first iteration and pause on the second', async () => {
      await fixture.runWorkflow({ workflowYaml: foreachYaml });

      // Resume iteration 1
      const exec = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      )!;
      exec.context = { ...exec.context, resumeInput: { value: 'input-1' } };
      fixture.workflowExecutionRepositoryMock.workflowExecutions.set(exec.id, exec);
      await fixture.resumeWorkflow();

      // Should be paused again (second iteration)
      const updated = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      );
      expect(updated?.status).toBe(ExecutionStatus.WAITING_FOR_INPUT);

      // Two ask_for_input steps now (one completed, one waiting)
      const askSteps = Array.from(
        fixture.stepExecutionRepositoryMock.stepExecutions.values()
      ).filter((s) => s.stepId === 'ask_for_input');
      expect(askSteps.length).toBe(2);
      expect(askSteps.filter((s) => s.status === ExecutionStatus.COMPLETED).length).toBe(1);
      expect(askSteps.filter((s) => s.status === ExecutionStatus.WAITING_FOR_INPUT).length).toBe(1);
    });

    it('should complete after resuming all three iterations', async () => {
      await fixture.runWorkflow({ workflowYaml: foreachYaml });

      for (let i = 0; i < 3; i++) {
        const exec = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(
          'fake_workflow_execution_id'
        )!;
        exec.context = { ...exec.context, resumeInput: { iteration: i } };
        fixture.workflowExecutionRepositoryMock.workflowExecutions.set(exec.id, exec);
        await fixture.resumeWorkflow();
      }

      const final = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      );
      expect(final?.status).toBe(ExecutionStatus.COMPLETED);

      // All three ask_for_input steps completed
      const askSteps = Array.from(
        fixture.stepExecutionRepositoryMock.stepExecutions.values()
      ).filter((s) => s.stepId === 'ask_for_input');
      expect(askSteps.length).toBe(3);
      expect(askSteps.every((s) => s.status === ExecutionStatus.COMPLETED)).toBe(true);
    });

    it('should isolate output per iteration', async () => {
      await fixture.runWorkflow({ workflowYaml: foreachYaml });

      const inputs = [{ val: 'a' }, { val: 'b' }, { val: 'c' }];
      for (const input of inputs) {
        const exec = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(
          'fake_workflow_execution_id'
        )!;
        exec.context = { ...exec.context, resumeInput: input };
        fixture.workflowExecutionRepositoryMock.workflowExecutions.set(exec.id, exec);
        await fixture.resumeWorkflow();
      }

      const askSteps = Array.from(fixture.stepExecutionRepositoryMock.stepExecutions.values())
        .filter((s) => s.stepId === 'ask_for_input')
        .sort((a, b) => (a.stepExecutionIndex ?? 0) - (b.stepExecutionIndex ?? 0));

      expect(askSteps.length).toBe(3);
      expect(askSteps[0].output).toEqual({ response: { val: 'a' }, respondedBy: 'unknown' });
      expect(askSteps[1].output).toEqual({ response: { val: 'b' }, respondedBy: 'unknown' });
      expect(askSteps[2].output).toEqual({ response: { val: 'c' }, respondedBy: 'unknown' });
    });
  });

  describe('with schema', () => {
    const schemaYaml = `
steps:
  - name: get_info
    type: waitForInput
    with:
      message: "Provide details"
      schema:
        type: object
        properties:
          ticket:
            type: string
          priority:
            type: string
            enum: [low, medium, high]
            default: medium
        required:
          - ticket
  - name: done
    type: console
    with:
      message: "done"
`;

    it('should pause and resume with schema-conforming input', async () => {
      await fixture.runWorkflow({ workflowYaml: schemaYaml });

      const exec = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      )!;
      exec.context = {
        ...exec.context,
        resumeInput: { ticket: 'T-42', priority: 'high' },
      };
      fixture.workflowExecutionRepositoryMock.workflowExecutions.set(exec.id, exec);
      await fixture.resumeWorkflow();

      const updated = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      );
      expect(updated?.status).toBe(ExecutionStatus.COMPLETED);

      const step = Array.from(fixture.stepExecutionRepositoryMock.stepExecutions.values()).find(
        (s) => s.stepId === 'get_info'
      );
      expect(step?.output).toEqual({
        response: { ticket: 'T-42', priority: 'high' },
        respondedBy: 'unknown',
      });
    });
  });

  describe('resume after workflow-level timeout has already fired', () => {
    // Regression: an analyst responds to an Inbox entry whose parent workflow
    // has sat paused long enough to exceed `settings.timeout`. On the resume
    // iteration the workflow-level monitor fires concurrently with the
    // waitForInput step, aborts the step runtime, and calls
    // `failStep(TimeoutError)`. Before the fix, `WaitForInputStepImpl.run()`
    // then re-entered `tryEnterWaitUntil` (which saw the in-memory status as
    // FAILED, not WAITING_FOR_INPUT), and the subsequent upsert overwrote
    // `status` back to `waiting_for_input` — leaving `error`/`finishedAt`
    // in place and producing a zombie that the Inbox listing keeps
    // resurfacing forever.
    const timeoutYaml = `
settings:
  timeout: 200ms

steps:
  - name: ask
    type: waitForInput
    with:
      message: "Approve?"
  - name: log
    type: console
    with:
      message: "done"
`;

    it('must not reset a timed-out step back to WAITING_FOR_INPUT on resume', async () => {
      await fixture.runWorkflow({ workflowYaml: timeoutYaml });

      const pausedExec = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      );
      expect(pausedExec?.status).toBe(ExecutionStatus.WAITING_FOR_INPUT);

      // Push us comfortably past the 200ms workflow-level timeout so the
      // monitor's first pass during the resume iteration fires
      // synchronously, racing with the step's run().
      await new Promise((resolve) => setTimeout(resolve, 350));

      const exec = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      )!;
      exec.context = { ...exec.context, resumeInput: { approved: true } };
      fixture.workflowExecutionRepositoryMock.workflowExecutions.set(exec.id, exec);

      await fixture.resumeWorkflow();

      const askStep = Array.from(fixture.stepExecutionRepositoryMock.stepExecutions.values()).find(
        (s) => s.stepId === 'ask'
      );

      // The zombie shape we must never persist again: status=waiting_for_input
      // alongside finishedAt+error. Either the step is FAILED/TIMED_OUT (the
      // timeout won the race and the fix prevented re-entry), or the step is
      // COMPLETED (the step ran first and the resume succeeded before the
      // monitor noticed the deadline). Both are acceptable; the zombie is not.
      expect(askStep).toBeDefined();
      expect([
        ExecutionStatus.FAILED,
        ExecutionStatus.TIMED_OUT,
        ExecutionStatus.COMPLETED,
      ]).toContain(askStep!.status);
      if (askStep!.status !== ExecutionStatus.COMPLETED) {
        expect(askStep!.error?.message).toContain('Failed due to workflow timeout');
        expect(askStep!.finishedAt).toBeDefined();
      }
    });
  });
});
