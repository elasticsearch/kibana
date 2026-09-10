/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ExecutionStatus } from '@kbn/workflows';
import { WorkflowOutputStepImpl } from './workflow_output_step_impl';

const createRuntime = () => {
  const scopeStack = {
    isEmpty: jest.fn().mockReturnValue(true),
  };
  return {
    startStep: jest.fn(),
    flushEventLogs: jest.fn().mockResolvedValue(undefined),
    failStep: jest.fn(),
    finishStep: jest.fn(),
    stepExecutionExists: jest.fn(() => true),
    contextManager: {
      renderValueAccordingToContext: jest.fn((v) => v),
    },
    scopeStack,
  };
};

const createWorkflowRuntime = (outputs?: unknown[]) => ({
  branchExecutor: { requestTermination: jest.fn().mockResolvedValue(undefined) },
  getWorkflowExecution: jest.fn(() => ({
    workflowDefinition: { outputs },
  })),
  setWorkflowStatus: jest.fn(),
  setWorkflowOutputs: jest.fn(),
  setWorkflowCancelled: jest.fn(),
  setWorkflowError: jest.fn(),
});

describe('WorkflowOutputStepImpl', () => {
  it('completes workflow with outputs on completed status', async () => {
    const stepExecutionRuntime = createRuntime();
    const workflowRuntime = createWorkflowRuntime();
    const workflowLogger = { logError: jest.fn(), logInfo: jest.fn() };
    const step = new WorkflowOutputStepImpl(
      { configuration: { status: 'completed', with: { answer: 42 } } } as any,
      stepExecutionRuntime as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    await step.run();

    expect(workflowRuntime.branchExecutor.requestTermination).toHaveBeenCalledWith(
      stepExecutionRuntime,
      { answer: 42 },
      ExecutionStatus.COMPLETED,
      undefined
    );
  });

  it('marks workflow as cancelled and keeps explicit cancellation reason', async () => {
    const stepExecutionRuntime = createRuntime();
    const workflowRuntime = createWorkflowRuntime();
    const workflowLogger = { logError: jest.fn(), logInfo: jest.fn() };
    const step = new WorkflowOutputStepImpl(
      {
        configuration: {
          name: 'output-step',
          status: 'cancelled',
          with: { reason: 'requested by user' },
        },
      } as any,
      stepExecutionRuntime as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    await step.run();

    expect(workflowRuntime.branchExecutor.requestTermination).toHaveBeenCalledWith(
      stepExecutionRuntime,
      { reason: 'requested by user' },
      ExecutionStatus.CANCELLED,
      undefined
    );
    expect(workflowRuntime.setWorkflowStatus).not.toHaveBeenCalledWith(ExecutionStatus.CANCELLED);
  });

  it('marks workflow as failed when status is failed', async () => {
    const stepExecutionRuntime = createRuntime();
    const workflowRuntime = createWorkflowRuntime();
    const workflowLogger = { logError: jest.fn(), logInfo: jest.fn() };
    const step = new WorkflowOutputStepImpl(
      {
        configuration: {
          status: 'failed',
          with: { message: 'failed on purpose' },
        },
      } as any,
      stepExecutionRuntime as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    await step.run();

    expect(workflowRuntime.branchExecutor.requestTermination).toHaveBeenCalledWith(
      stepExecutionRuntime,
      { message: 'failed on purpose' },
      ExecutionStatus.FAILED,
      expect.objectContaining({ message: 'failed on purpose' })
    );
  });

  it('falls back to completed status when no explicit status is provided', async () => {
    const stepExecutionRuntime = createRuntime();
    const workflowRuntime = createWorkflowRuntime();
    const workflowLogger = { logError: jest.fn(), logInfo: jest.fn() };
    const step = new WorkflowOutputStepImpl(
      {
        configuration: {
          with: { result: 'ok' },
        },
      } as any,
      stepExecutionRuntime as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    await step.run();

    expect(workflowRuntime.branchExecutor.requestTermination).toHaveBeenCalledWith(
      stepExecutionRuntime,
      { result: 'ok' },
      ExecutionStatus.COMPLETED,
      undefined
    );
  });

  it('fails with validation error when outputs do not match schema', async () => {
    const stepExecutionRuntime = createRuntime();
    const workflowRuntime = createWorkflowRuntime([
      { name: 'answer', type: 'string', required: true },
    ]);
    const workflowLogger = { logError: jest.fn(), logInfo: jest.fn() };
    const step = new WorkflowOutputStepImpl(
      {
        configuration: {
          status: 'completed',
          with: { answer: 42 },
        },
      } as any,
      stepExecutionRuntime as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    await step.run();

    expect(stepExecutionRuntime.failStep).toHaveBeenCalledWith(expect.any(Error));
    expect(workflowRuntime.branchExecutor.requestTermination).toHaveBeenCalledWith(
      stepExecutionRuntime,
      {},
      ExecutionStatus.FAILED,
      expect.any(Error)
    );
    expect(workflowLogger.logError).toHaveBeenCalledWith(
      expect.stringContaining('Output validation failed'),
      expect.any(Error),
      expect.any(Object)
    );
  });

  it('uses empty object when with is not provided (workflow.fail case)', async () => {
    const stepExecutionRuntime = createRuntime();
    const workflowRuntime = createWorkflowRuntime();
    const workflowLogger = { logError: jest.fn(), logInfo: jest.fn() };
    const step = new WorkflowOutputStepImpl(
      {
        configuration: {
          status: 'failed',
        },
      } as any,
      stepExecutionRuntime as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    await step.run();

    expect(workflowRuntime.branchExecutor.requestTermination).toHaveBeenCalledWith(
      stepExecutionRuntime,
      {},
      ExecutionStatus.FAILED,
      expect.objectContaining({ message: 'Workflow terminated with failed status' })
    );
  });

  it('delegates ancestor completion with the terminating scope to the coordinator', async () => {
    const scopeStack = {
      isEmpty: jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true),
      getCurrentScope: jest.fn().mockReturnValue({
        nodeId: 'ancestor-node',
        stepId: 'ancestor-step',
        nodeType: 'enter-foreach',
      }),
      exitScope: jest.fn().mockReturnValue({
        isEmpty: jest.fn().mockReturnValue(true),
        stackFrames: [],
      }),
    };
    const stepExecutionRuntime = {
      ...createRuntime(),
      scopeStack,
    };
    const workflowRuntime = createWorkflowRuntime();
    const workflowLogger = { logError: jest.fn(), logInfo: jest.fn() };
    const step = new WorkflowOutputStepImpl(
      { configuration: { status: 'completed', with: { ok: true } } } as any,
      stepExecutionRuntime as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    await step.run();

    expect(workflowRuntime.branchExecutor.requestTermination).toHaveBeenCalledWith(
      stepExecutionRuntime,
      { ok: true },
      ExecutionStatus.COMPLETED,
      undefined
    );
    expect(stepExecutionRuntime.scopeStack).toBe(scopeStack);
  });

  it('handles catch block when run throws a non-Error', async () => {
    const stepExecutionRuntime = createRuntime();
    stepExecutionRuntime.contextManager.renderValueAccordingToContext.mockReturnValue({
      bad: 'value',
    });
    const workflowRuntime = createWorkflowRuntime();
    workflowRuntime.getWorkflowExecution.mockImplementation(() => {
      throw new Error('string error');
    });
    const workflowLogger = { logError: jest.fn(), logInfo: jest.fn() };
    const step = new WorkflowOutputStepImpl(
      { configuration: { status: 'completed', with: { x: 1 } } } as any,
      stepExecutionRuntime as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    await step.run();

    expect(stepExecutionRuntime.failStep).toHaveBeenCalledWith(expect.any(Error));
    expect(workflowRuntime.setWorkflowStatus).toHaveBeenCalledWith(ExecutionStatus.FAILED);
  });

  it('uses message from cancelled output as cancellation reason', async () => {
    const stepExecutionRuntime = createRuntime();
    const workflowRuntime = createWorkflowRuntime();
    const workflowLogger = { logError: jest.fn(), logInfo: jest.fn() };
    const step = new WorkflowOutputStepImpl(
      {
        configuration: {
          status: 'cancelled',
          with: { message: 'cancelled via message' },
        },
      } as any,
      stepExecutionRuntime as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    await step.run();

    expect(workflowRuntime.branchExecutor.requestTermination).toHaveBeenCalledWith(
      stepExecutionRuntime,
      { message: 'cancelled via message' },
      ExecutionStatus.CANCELLED,
      undefined
    );
  });

  it('delegates cancellation without an explicit reason to the coordinator', async () => {
    const stepExecutionRuntime = createRuntime();
    const workflowRuntime = createWorkflowRuntime();
    const workflowLogger = { logError: jest.fn(), logInfo: jest.fn() };
    const step = new WorkflowOutputStepImpl(
      {
        configuration: {
          name: 'myStep',
          status: 'cancelled',
          with: {},
        },
      } as any,
      stepExecutionRuntime as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    await step.run();

    expect(workflowRuntime.branchExecutor.requestTermination).toHaveBeenCalledWith(
      stepExecutionRuntime,
      {},
      ExecutionStatus.CANCELLED,
      undefined
    );
  });

  it('uses reason from failed output for error message', async () => {
    const stepExecutionRuntime = createRuntime();
    const workflowRuntime = createWorkflowRuntime();
    const workflowLogger = { logError: jest.fn(), logInfo: jest.fn() };
    const step = new WorkflowOutputStepImpl(
      {
        configuration: {
          status: 'failed',
          with: { reason: 'custom failure reason' },
        },
      } as any,
      stepExecutionRuntime as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    await step.run();

    expect(workflowRuntime.branchExecutor.requestTermination).toHaveBeenCalledWith(
      stepExecutionRuntime,
      { reason: 'custom failure reason' },
      ExecutionStatus.FAILED,
      expect.objectContaining({ message: 'custom failure reason' })
    );
  });
});
