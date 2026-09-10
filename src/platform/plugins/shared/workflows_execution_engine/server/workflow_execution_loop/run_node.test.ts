/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsWorkflowExecution, StackFrame } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import type { GraphNodeUnion } from '@kbn/workflows/graph';

import * as catchErrorModule from './catch_error';
import { ExecutionBudget } from './execution_budget';
import { ExecutionFailure } from './execution_failure';
import * as handleExecutionDelayModule from './handle_execution_delay';
import { runNode } from './run_node';
import * as runStackMonitorModule from './run_stack_monitor/run_stack_monitor';
import type { WorkflowExecutionLoopParams } from './types';
import type { CancellableNode, NodeImplementation } from '../step/node_implementation';
import {
  createMockWorkflowExecutionCursor,
  type MockWorkflowExecutionCursor,
} from '../workflow_context_manager/mocks/workflow_execution_cursor.mock';
import type { StepExecutionRuntime } from '../workflow_context_manager/step_execution_runtime';
import type { WorkflowExecutionState } from '../workflow_context_manager/workflow_execution_state';
import { WorkflowScopeStack } from '../workflow_context_manager/workflow_scope_stack';
import { createMockWorkflowEventLogger } from '../workflow_event_logger/mocks';
import { WorkflowTaskManagerAbortError } from '../workflow_task_shutdown';

jest.mock('./run_stack_monitor/run_stack_monitor');
jest.mock('./catch_error');
jest.mock('./handle_execution_delay');

const mockCatchError = catchErrorModule.catchError as jest.Mock;
const mockHandleExecutionDelay = handleExecutionDelayModule.handleExecutionDelay as jest.Mock;
const mockRunStackMonitor = runStackMonitorModule.runStackMonitor as jest.Mock;

type RunNodeTestParams = Omit<
  jest.Mocked<WorkflowExecutionLoopParams>,
  'workflowExecutionCursor'
> & {
  workflowExecutionCursor: MockWorkflowExecutionCursor;
};

describe('runNode', () => {
  let mockParams: RunNodeTestParams;
  let taskAbortController: AbortController;
  let workflowExecution: EsWorkflowExecution;
  let mockNode: GraphNodeUnion;
  let mockNodeImplementation: jest.Mocked<NodeImplementation>;
  let mockStepExecutionRuntime: jest.Mocked<StepExecutionRuntime>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default implementations for mocks
    mockRunStackMonitor.mockImplementation(
      async (
        _params: WorkflowExecutionLoopParams,
        _stepExecutionRuntime: StepExecutionRuntime,
        _monitorAbortController: AbortController
      ) => {
        // Simulate the monitoring loop running briefly
        await new Promise((resolve) => setTimeout(resolve, 100));
        // Don't abort by default - let the step run to completion
      }
    );

    mockCatchError.mockResolvedValue(undefined);
    mockHandleExecutionDelay.mockResolvedValue(undefined);

    taskAbortController = new AbortController();
    workflowExecution = {
      id: 'test-workflow-execution-id',
      workflowId: 'test-workflow-id',
      spaceId: 'default',
      status: ExecutionStatus.RUNNING,
      cancelRequested: false,
      startedAt: '2025-08-05T20:00:00.000Z',
    } as EsWorkflowExecution;

    mockNode = {
      id: 'node1',
      stepId: 'test-step-id',
      stepType: 'data.set',
    } as GraphNodeUnion;

    const emptyStackFrames: StackFrame[] = [];
    const scopeStack = WorkflowScopeStack.fromStackFrames(emptyStackFrames);

    mockStepExecutionRuntime = {
      stepExecutionId: 'test-step-execution-id',
      node: mockNode,
      scopeStack,
      abortController: new AbortController(),
      flushEventLogs: jest.fn().mockResolvedValue(undefined),
      contextManager: {
        ensureContextReady: jest.fn().mockResolvedValue(undefined),
        releaseReadPins: jest.fn(),
      },
    } as unknown as jest.Mocked<StepExecutionRuntime>;

    mockNodeImplementation = {
      run: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NodeImplementation>;

    const workflowExecutionCursor = createMockWorkflowExecutionCursor({
      currentNode: mockNode,
      currentStackFrames: emptyStackFrames,
      isExecuting: true,
    });

    mockParams = {
      workflowRuntime: {
        executionCursor: workflowExecutionCursor,
        enterScope: jest.fn(),
        getWorkflowExecution: jest.fn().mockReturnValue(workflowExecution),
        getCurrentNodeScope: jest.fn().mockReturnValue(emptyStackFrames),
        setWorkflowError: jest.fn(),
        saveState: jest.fn().mockResolvedValue(undefined),
      },
      workflowExecutionCursor,
      stepExecutionRuntimeFactory: {
        createStepExecutionRuntime: jest.fn().mockReturnValue(mockStepExecutionRuntime),
      },
      nodesFactory: {
        create: jest.fn().mockReturnValue(mockNodeImplementation),
      },
      workflowExecutionState: {
        getWorkflowExecution: jest.fn().mockReturnValue(workflowExecution),
      } as unknown as jest.Mocked<WorkflowExecutionState>,
      workflowLogger: createMockWorkflowEventLogger(),
      workflowExecutionRepository: {
        getWorkflowExecutionById: jest.fn().mockResolvedValue(null),
      },
      stepIoService: {
        releaseTransientlyRehydratedOutputs: jest.fn(),
      },
      signal: taskAbortController.signal,
    } as unknown as RunNodeTestParams;
  });

  describe('when workflow is running', () => {
    it('should start step execution immediately without blocking ES call', async () => {
      await runNode(mockParams);

      // Verify that step execution started
      expect(mockNodeImplementation.run).toHaveBeenCalled();

      // Verify the in-memory status check was used (not an ES call)
      expect(mockParams.workflowRuntime.getWorkflowExecution).toHaveBeenCalled();

      // Verify step execution runtime was created
      expect(
        mockParams.stepExecutionRuntimeFactory.createStepExecutionRuntime
      ).toHaveBeenCalledWith({
        nodeId: 'node1',
        stackFrames: [],
      });

      // Verify node implementation was created
      expect(mockParams.nodesFactory.create).toHaveBeenCalledWith(mockStepExecutionRuntime);
    });

    it('should run monitoring in parallel with step execution', async () => {
      await runNode(mockParams);

      // Verify monitoring was started
      expect(mockRunStackMonitor).toHaveBeenCalledWith(
        mockParams,
        mockStepExecutionRuntime,
        expect.any(AbortController)
      );

      // Verify both step and monitoring ran
      expect(mockNodeImplementation.run).toHaveBeenCalled();
    });

    it('should flush step event logs after step execution', async () => {
      await runNode(mockParams);

      expect(mockStepExecutionRuntime.flushEventLogs).toHaveBeenCalledTimes(1);
    });

    it('should pass the task abort signal when Task Manager aborts during step execution', async () => {
      mockNodeImplementation.run.mockImplementation(async () => {
        taskAbortController.abort(new WorkflowTaskManagerAbortError());
      });

      await runNode(mockParams);

      expect(mockHandleExecutionDelay).not.toHaveBeenCalled();
      expect(mockStepExecutionRuntime.abortController.signal.aborted).toBe(true);
      expect(mockStepExecutionRuntime.flushEventLogs).toHaveBeenCalledWith({
        signal: mockParams.signal,
      });
    });
  });

  it('bounds cancellation while the initial monitor is waiting on storage', async () => {
    const failure = new ExecutionFailure();
    jest
      .spyOn(mockParams.workflowExecutionRepository, 'getWorkflowExecutionById')
      .mockImplementation(() => new Promise(() => {}));
    const run = runNode(
      { ...mockParams, executionFailure: failure, cancellationGraceMs: 10 },
      { deadline: Date.now() + 10 }
    );
    await expect(run).rejects.toThrow('Cancelled operation did not settle');
    expect(mockNodeImplementation.run).not.toHaveBeenCalled();
    expect(mockCatchError).not.toHaveBeenCalled();
  });

  it('fails the execution when an operation never settles and bypasses workflow handlers', async () => {
    const failure = new ExecutionFailure();
    const budget = new ExecutionBudget(1);
    mockNodeImplementation.run.mockImplementation(() => new Promise<void>(() => {}));
    await expect(
      runNode(
        {
          ...mockParams,
          boundaryNodeId: 'parallel',
          executionFailure: failure,
          cancellationGraceMs: 10,
        },
        { budget, deadline: Date.now() + 10 }
      )
    ).rejects.toThrow('Cancelled operation did not settle');
    expect(failure.signal.aborted).toBe(true);
    expect(mockCatchError).not.toHaveBeenCalled();
    expect(() => budget.acquire(failure.signal)).toThrow();
  });

  it('retains operation capacity until an abort-ignoring node actually settles', async () => {
    const budget = new ExecutionBudget(1);
    let finish: () => void = () => {};
    const operation = new Promise<void>((resolve) => {
      finish = resolve;
    });
    mockNodeImplementation.run.mockImplementation(() => operation);
    await runNode(
      { ...mockParams, boundaryNodeId: 'parallel' },
      { budget, deadline: Date.now() + 10 }
    );
    expect(mockStepExecutionRuntime.abortController.signal.aborted).toBe(true);
    let admitted = false;
    const queued = budget.acquire(new AbortController().signal).then((release) => {
      admitted = true;
      return release;
    });
    await Promise.resolve();
    expect(admitted).toBe(false);
    finish();
    const release = await queued;
    expect(admitted).toBe(true);
    release();
  });

  describe('when workflow is cancelled before step starts', () => {
    it('should apply cancel from memory and skip step when cancelRequested is true', async () => {
      workflowExecution.cancelRequested = true;
      workflowExecution.status = ExecutionStatus.RUNNING;

      const workflowLogger = createMockWorkflowEventLogger();
      const workflowExecutionRepository = {
        getWorkflowExecutionById: jest.fn(),
      };

      (mockParams as unknown as WorkflowExecutionLoopParams).workflowLogger = workflowLogger;
      (mockParams as unknown as WorkflowExecutionLoopParams).workflowExecutionRepository =
        workflowExecutionRepository as unknown as WorkflowExecutionLoopParams['workflowExecutionRepository'];

      const upsertStep = jest.fn();
      const updateWorkflowExecution = jest.fn((patch: Partial<EsWorkflowExecution>) => {
        Object.assign(workflowExecution, patch);
      });
      mockParams.workflowExecutionState = {
        ...mockParams.workflowExecutionState,
        getWorkflowExecution: jest.fn().mockReturnValue(workflowExecution),
        getStepExecution: jest.fn().mockReturnValue(undefined),
        upsertStep,
        updateWorkflowExecution,
      } as unknown as jest.Mocked<WorkflowExecutionState>;

      await runNode(mockParams);

      expect(workflowExecutionRepository.getWorkflowExecutionById).not.toHaveBeenCalled();
      expect(mockNodeImplementation.run).not.toHaveBeenCalled();
      expect(workflowExecution.status).toBe(ExecutionStatus.CANCELLED);
    });

    it('should call onCancel on a cancellable node when cancelRequested short-circuits run()', async () => {
      workflowExecution.cancelRequested = true;
      workflowExecution.status = ExecutionStatus.RUNNING;

      mockParams.workflowExecutionState = {
        ...mockParams.workflowExecutionState,
        getWorkflowExecution: jest.fn().mockReturnValue(workflowExecution),
        getStepExecution: jest.fn().mockReturnValue(undefined),
        upsertStep: jest.fn(),
        updateWorkflowExecution: jest.fn((patch: Partial<EsWorkflowExecution>) => {
          Object.assign(workflowExecution, patch);
        }),
      } as unknown as jest.Mocked<WorkflowExecutionState>;

      const cancellableNodeImpl: NodeImplementation & CancellableNode = {
        run: jest.fn().mockResolvedValue(undefined),
        onCancel: jest.fn().mockResolvedValue(undefined),
      };
      (mockParams.nodesFactory.create as jest.Mock).mockReturnValue(cancellableNodeImpl);

      await runNode(mockParams);

      expect(cancellableNodeImpl.run).not.toHaveBeenCalled();
      expect(cancellableNodeImpl.onCancel).toHaveBeenCalledTimes(1);
      expect(workflowExecution.status).toBe(ExecutionStatus.CANCELLED);
    });

    it('should not call onCancel on a non-cancellable node when cancelRequested short-circuits run()', async () => {
      workflowExecution.cancelRequested = true;
      workflowExecution.status = ExecutionStatus.RUNNING;

      mockParams.workflowExecutionState = {
        ...mockParams.workflowExecutionState,
        getWorkflowExecution: jest.fn().mockReturnValue(workflowExecution),
        getStepExecution: jest.fn().mockReturnValue(undefined),
        upsertStep: jest.fn(),
        updateWorkflowExecution: jest.fn((patch: Partial<EsWorkflowExecution>) => {
          Object.assign(workflowExecution, patch);
        }),
      } as unknown as jest.Mocked<WorkflowExecutionState>;

      await runNode(mockParams);

      expect(mockNodeImplementation.run).not.toHaveBeenCalled();
      expect(workflowExecution.status).toBe(ExecutionStatus.CANCELLED);
    });

    it('should log and swallow errors from onCancel during cancelRequested short-circuit', async () => {
      workflowExecution.cancelRequested = true;
      workflowExecution.status = ExecutionStatus.RUNNING;

      mockParams.workflowExecutionState = {
        ...mockParams.workflowExecutionState,
        getWorkflowExecution: jest.fn().mockReturnValue(workflowExecution),
        getStepExecution: jest.fn().mockReturnValue(undefined),
        upsertStep: jest.fn(),
        updateWorkflowExecution: jest.fn((patch: Partial<EsWorkflowExecution>) => {
          Object.assign(workflowExecution, patch);
        }),
      } as unknown as jest.Mocked<WorkflowExecutionState>;

      const onCancelError = new Error('onCancel failed');
      const cancellableNodeImpl: NodeImplementation & CancellableNode = {
        run: jest.fn().mockResolvedValue(undefined),
        onCancel: jest.fn().mockRejectedValue(onCancelError),
      };
      (mockParams.nodesFactory.create as jest.Mock).mockReturnValue(cancellableNodeImpl);

      await runNode(mockParams);

      expect(cancellableNodeImpl.onCancel).toHaveBeenCalledTimes(1);
      expect(mockParams.workflowLogger.logError).toHaveBeenCalledWith(
        'Failed to execute onCancel hook - continuing execution',
        onCancelError
      );
      expect(workflowExecution.status).toBe(ExecutionStatus.CANCELLED);
    });

    it('should skip step execution if workflow status is not RUNNING', async () => {
      workflowExecution.status = ExecutionStatus.CANCELLED;

      await runNode(mockParams);

      expect(mockNodeImplementation.run).not.toHaveBeenCalled();
      expect(mockParams.workflowRuntime.getWorkflowExecution).toHaveBeenCalled();
    });

    it('should skip step execution if workflow status is FAILED', async () => {
      workflowExecution.status = ExecutionStatus.FAILED;

      await runNode(mockParams);

      expect(mockNodeImplementation.run).not.toHaveBeenCalled();
    });

    it('should skip step execution if workflow status is COMPLETED', async () => {
      workflowExecution.status = ExecutionStatus.COMPLETED;

      await runNode(mockParams);

      expect(mockNodeImplementation.run).not.toHaveBeenCalled();
    });
  });

  describe('when there is no current node', () => {
    it('should return early without executing step', async () => {
      mockParams.workflowExecutionCursor.setMockCurrentNode(null);

      await runNode(mockParams);

      expect(mockNodeImplementation.run).not.toHaveBeenCalled();
    });
  });

  describe('when execution cursor is stopped', () => {
    it('should return early without executing step', async () => {
      mockParams.workflowExecutionCursor.setMockIsExecuting(false);

      await runNode(mockParams);

      expect(mockNodeImplementation.run).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle step execution errors', async () => {
      const error = new Error('Step execution failed');
      mockNodeImplementation.run.mockRejectedValue(error);

      await runNode(mockParams);

      expect(mockParams.workflowExecutionCursor.error).toEqual(
        expect.objectContaining({ message: 'Step execution failed' })
      );
      expect(mockStepExecutionRuntime.flushEventLogs).toHaveBeenCalledTimes(1);
    });

    it('should call catchError when error occurs', async () => {
      const error = new Error('Step execution failed');
      (mockNodeImplementation.run as jest.Mock).mockRejectedValue(error);

      await runNode(mockParams);

      expect(mockCatchError).toHaveBeenCalledWith(mockParams, mockStepExecutionRuntime);
    });
  });

  describe('monitoring integration', () => {
    it('should abort monitoring when step completes', async () => {
      await runNode(mockParams);

      expect(mockNodeImplementation.run).toHaveBeenCalled();
    });

    it('should handle monitoring preventing step execution via abort signal', async () => {
      // Mock monitoring that aborts immediately
      mockRunStackMonitor.mockImplementation(
        async (
          _params: WorkflowExecutionLoopParams,
          _stepExecutionRuntime: StepExecutionRuntime,
          monitorAbortController: AbortController
        ) => {
          monitorAbortController.abort();
        }
      );

      await runNode(mockParams);

      // Step should still be created but may not run depending on timing
      expect(mockParams.stepExecutionRuntimeFactory.createStepExecutionRuntime).toHaveBeenCalled();
    });
  });

  describe('onCancel lifecycle hook', () => {
    const setupCancellableNode = (onCancel: jest.Mock) => {
      const cancellableNodeImpl: NodeImplementation & CancellableNode = {
        run: jest.fn().mockResolvedValue(undefined),
        onCancel,
      };
      (mockParams.nodesFactory.create as jest.Mock).mockReturnValue(cancellableNodeImpl);
      return cancellableNodeImpl;
    };

    const simulateAbortDuringRun = () => {
      mockRunStackMonitor.mockImplementation(async () => {
        await new Promise<void>((resolve) => process.nextTick(resolve));
        mockStepExecutionRuntime.abortController.abort();
      });
    };

    it('should call onCancel after run() when abort signal was triggered', async () => {
      const mockOnCancel = jest.fn().mockResolvedValue(undefined);
      const cancellableNode = setupCancellableNode(mockOnCancel);
      cancellableNode.run = jest.fn(async () => {
        await new Promise<void>((resolve) => process.nextTick(resolve));
      });
      simulateAbortDuringRun();

      await runNode(mockParams);

      expect(cancellableNode.run).toHaveBeenCalled();
      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it('should not call onCancel when abort signal was not triggered', async () => {
      const mockOnCancel = jest.fn();
      setupCancellableNode(mockOnCancel);

      await runNode(mockParams);

      expect(mockOnCancel).not.toHaveBeenCalled();
    });

    it('should not call onCancel on a non-CancellableNode even if aborted', async () => {
      mockNodeImplementation.run = jest.fn(async () => {
        await new Promise<void>((resolve) => process.nextTick(resolve));
      });
      simulateAbortDuringRun();

      await runNode(mockParams);

      expect(mockNodeImplementation.run).toHaveBeenCalled();
    });

    it('should handle onCancel errors gracefully without throwing', async () => {
      const onCancelError = new Error('onCancel failed');
      const mockOnCancel = jest.fn().mockRejectedValue(onCancelError);
      const cancellableNode = setupCancellableNode(mockOnCancel);
      cancellableNode.run = jest.fn(async () => {
        await new Promise<void>((resolve) => process.nextTick(resolve));
      });
      simulateAbortDuringRun();

      const workflowLogger = createMockWorkflowEventLogger();
      (mockParams as unknown as Record<string, unknown>).workflowLogger = workflowLogger;

      await runNode(mockParams);

      expect(mockOnCancel).toHaveBeenCalled();
      expect(workflowLogger.logError).toHaveBeenCalledWith(
        'Failed to execute onCancel hook - continuing execution',
        onCancelError
      );
    });

    it('should call onCancel when a monitor (e.g. timeout zone) aborts and throws', async () => {
      // Regression: a step-level timeout zone aborts the step's runtime and then
      // throws a TimeoutError from the monitor. That rejection bubbles out of the
      // run/monitor race into runNode's catch, which previously skipped the
      // onCancel call. Cleanup now lives in `finally`, so a cancellable node
      // (e.g. parallel) still gets to release/timeout its parked children.
      const mockOnCancel = jest.fn().mockResolvedValue(undefined);
      const cancellableNode = setupCancellableNode(mockOnCancel);
      cancellableNode.run = jest.fn(async () => {
        await new Promise<void>((resolve) => process.nextTick(resolve));
      });
      mockRunStackMonitor.mockImplementation(async () => {
        await new Promise<void>((resolve) => process.nextTick(resolve));
        mockStepExecutionRuntime.abortController.abort();
        throw new Error('Step execution exceeded the configured timeout of 4s.');
      });

      await runNode(mockParams);

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
      expect(mockParams.workflowExecutionCursor.captureError).toHaveBeenCalled();
    });

    it('should handle synchronous onCancel that throws', async () => {
      const syncError = new Error('sync onCancel error');
      const mockOnCancel = jest.fn().mockImplementation(() => {
        throw syncError;
      });
      const cancellableNode = setupCancellableNode(mockOnCancel);
      cancellableNode.run = jest.fn(async () => {
        await new Promise<void>((resolve) => process.nextTick(resolve));
      });
      simulateAbortDuringRun();

      const workflowLogger = createMockWorkflowEventLogger();
      (mockParams as unknown as Record<string, unknown>).workflowLogger = workflowLogger;

      await runNode(mockParams);

      expect(workflowLogger.logError).toHaveBeenCalledWith(
        'Failed to execute onCancel hook - continuing execution',
        syncError
      );
    });
  });

  describe('releaseReadPins lifecycle hook (pin cleanup on node exit)', () => {
    it('calls releaseReadPins on every successful run', async () => {
      await runNode(mockParams);

      expect(mockStepExecutionRuntime.contextManager.releaseReadPins).toHaveBeenCalledTimes(1);
    });

    it('calls releaseReadPins even when run() throws', async () => {
      mockNodeImplementation.run.mockRejectedValue(new Error('node exploded'));

      await runNode(mockParams);

      // Error is caught → captureError on the cursor, but the finally block still fires.
      expect(mockParams.workflowExecutionCursor.captureError).toHaveBeenCalled();
      expect(mockStepExecutionRuntime.contextManager.releaseReadPins).toHaveBeenCalledTimes(1);
    });

    it('calls releaseReadPins on the status !== RUNNING short-circuit even though ensureContextReady never ran', async () => {
      // Verifies idempotency: the pin release fires in finally regardless of whether
      // ensureContextReady set any pins (eviction-disabled fast path, or early return).
      workflowExecution.status = ExecutionStatus.CANCELLED;

      await runNode(mockParams);

      expect(mockNodeImplementation.run).not.toHaveBeenCalled();
      expect(mockStepExecutionRuntime.contextManager.releaseReadPins).toHaveBeenCalledTimes(1);
    });
  });
});
