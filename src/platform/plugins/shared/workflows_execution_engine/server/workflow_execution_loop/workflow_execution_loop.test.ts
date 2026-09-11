/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ExecutionStatus } from '@kbn/workflows';
import { workflowExecutionLoop } from './workflow_execution_loop';
import { createMockWorkflowExecutionCursor } from '../workflow_context_manager/mocks/workflow_execution_cursor.mock';
import { WorkflowTaskManagerAbortError } from '../workflow_task_shutdown';

jest.mock('elastic-apm-node', () => ({
  __esModule: true,
  default: {
    startSpan: jest.fn(() => ({ end: jest.fn() })),
  },
}));

jest.mock('./execution_flow_loop', () => ({
  executionFlowLoop: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./persistence_loop', () => ({
  persistenceLoop: jest.fn().mockResolvedValue(undefined),
  flushState: jest.fn().mockResolvedValue(undefined),
}));

describe('workflowExecutionLoop', () => {
  const createParams = () => ({
    workflowExecutionCursor: createMockWorkflowExecutionCursor(),
    workflowRuntime: {
      saveState: jest.fn().mockResolvedValue(undefined),
      setWorkflowError: jest.fn(),
      getWorkflowExecution: jest.fn().mockReturnValue({
        id: 'exec-1',
        status: ExecutionStatus.RUNNING,
      }),
    },
    workflowExecutionState: {
      updateWorkflowExecution: jest.fn(),
    },
    stepIoService: {
      flush: jest.fn().mockResolvedValue(undefined),
      // Workflow-end safety release added with the deferred-release pattern.
      releaseTransientlyRehydratedOutputs: jest.fn(),
    },
    workflowLogger: {
      flushEvents: jest.fn().mockResolvedValue(undefined),
      logWarn: jest.fn(),
    },
    signal: new AbortController().signal,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs execution and persistence loops and flushes state', async () => {
    const params = createParams();
    await workflowExecutionLoop(params as any);

    const { executionFlowLoop } = jest.requireMock('./execution_flow_loop') as {
      executionFlowLoop: jest.Mock;
    };
    const { persistenceLoop, flushState } = jest.requireMock('./persistence_loop') as {
      persistenceLoop: jest.Mock;
      flushState: jest.Mock;
    };

    expect(executionFlowLoop).toHaveBeenCalledWith(params);
    expect(persistenceLoop).toHaveBeenCalled();
    expect(flushState).toHaveBeenCalled();
    expect(params.workflowExecutionCursor.start).toHaveBeenCalled();
    expect(params.workflowRuntime.saveState).toHaveBeenCalled();
    expect(params.stepIoService.flush).toHaveBeenCalled();
    // Workflow-end cleanup for transient rehydrations (deferred-release pattern).
    expect(params.stepIoService.releaseTransientlyRehydratedOutputs).toHaveBeenCalled();
    expect(params.workflowLogger.flushEvents).toHaveBeenCalled();
  });

  it('uses the shared execution loop without periodic persistence in sync mode', async () => {
    const params = { ...createParams(), executionMode: 'sync' as const };
    await workflowExecutionLoop(params as any);

    const { executionFlowLoop } = jest.requireMock('./execution_flow_loop') as {
      executionFlowLoop: jest.Mock;
    };
    const { persistenceLoop, flushState } = jest.requireMock('./persistence_loop') as {
      persistenceLoop: jest.Mock;
      flushState: jest.Mock;
    };

    expect(executionFlowLoop).toHaveBeenCalledWith(params);
    expect(persistenceLoop).not.toHaveBeenCalled();
    expect(flushState).not.toHaveBeenCalled();
    expect(params.workflowRuntime.saveState).toHaveBeenCalled();
    expect(params.stepIoService.flush).toHaveBeenCalled();
  });

  it('sets workflow error when execution loop throws', async () => {
    const params = createParams();
    const testError = new Error('execution failed');

    const { executionFlowLoop } = jest.requireMock('./execution_flow_loop') as {
      executionFlowLoop: jest.Mock;
    };
    (executionFlowLoop as jest.Mock).mockRejectedValueOnce(testError);

    await workflowExecutionLoop(params as any);

    expect(params.workflowExecutionCursor.error).toEqual(
      expect.objectContaining({ message: 'execution failed' })
    );
  });

  it('updates execution state when task abort is signaled during workflow execution', async () => {
    const params = createParams();
    const abortController = new AbortController();
    const loopPromise = workflowExecutionLoop({ ...params, signal: abortController.signal } as any);
    abortController.abort();
    await loopPromise;

    expect(params.workflowExecutionState.updateWorkflowExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        cancelRequested: true,
        status: ExecutionStatus.CANCELLED,
      })
    );
    expect(params.workflowExecutionCursor.stop).toHaveBeenCalled();
  });

  it('marks abort-with-error-reason (e.g. timeout) as FAILED and captures the error', async () => {
    const params = createParams();
    const abortController = new AbortController();
    const timeoutError = new Error('Pre-LLM anonymization timed out after 5000ms');
    const loopPromise = workflowExecutionLoop({ ...params, signal: abortController.signal } as any);
    abortController.abort(timeoutError);
    await loopPromise;

    expect(params.workflowExecutionCursor.captureError).toHaveBeenCalledWith(timeoutError);
    expect(params.workflowExecutionState.updateWorkflowExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ExecutionStatus.FAILED,
      })
    );
    expect(params.workflowExecutionCursor.stop).toHaveBeenCalled();
  });

  it('treats AbortError DOMException as CANCELLED (not FAILED) — signal from sync timeout or platform abort', async () => {
    const params = createParams();
    const abortController = new AbortController();
    const loopPromise = workflowExecutionLoop({ ...params, signal: abortController.signal } as any);
    abortController.abort(new DOMException('timeout', 'AbortError'));
    await loopPromise;

    expect(params.workflowExecutionState.updateWorkflowExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ExecutionStatus.CANCELLED,
      })
    );
    expect(params.workflowExecutionCursor.captureError).not.toHaveBeenCalled();
  });

  it('marks Task Manager abort as system cancellation and suppresses workflow log errors', async () => {
    const params = createParams();
    const abortController = new AbortController();
    const { flushState } = jest.requireMock('./persistence_loop') as { flushState: jest.Mock };
    const loopPromise = workflowExecutionLoop({ ...params, signal: abortController.signal } as any);
    abortController.abort(new WorkflowTaskManagerAbortError());
    await loopPromise;

    expect(params.workflowExecutionState.updateWorkflowExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        cancelRequested: true,
        status: ExecutionStatus.CANCELLED,
        cancellationReason: 'Cancelled because Task Manager aborted the task',
        cancelledBy: 'system',
      })
    );
    expect(flushState).toHaveBeenCalledWith(params, {
      workflowLogFlushSignal: params.signal,
    });
    expect(params.workflowRuntime.saveState).toHaveBeenCalled();
    expect(params.stepIoService.flush).toHaveBeenCalled();
    expect(params.workflowLogger.flushEvents).toHaveBeenCalledWith({
      signal: params.signal,
    });
  });
});
