/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import apm from 'elastic-apm-node';
import { ExecutionStatus, isTerminalStatus } from '@kbn/workflows';
import { ExecutionError } from '@kbn/workflows/server';
import { completeTerminationPath } from './complete_termination_path';
import { ExecutionFailure } from './execution_failure';
import { outsideExecutionFence } from './execution_fence';
import { executionFlowLoop } from './execution_flow_loop';
import { flushState, persistenceLoop } from './persistence_loop';
import type { WorkflowExecutionLoopParams } from './types';
import { emitHitlLifecycle } from '../step/wait_for_input_step/hitl_lifecycle_auditor';
import { getTerminalWorkflowRefreshOptions } from '../workflow_context_manager/workflow_execution_state';
import { isWorkflowTaskManagerAbortSignal } from '../workflow_task_shutdown';

const TASK_MANAGER_ABORT_CANCELLATION_REASON = 'Cancelled because Task Manager aborted the task';

/**
 * Executes the main workflow execution loop, processing nodes sequentially until completion.
 *
 * This function serves as the primary entry point for workflow execution, continuously
 * processing workflow nodes until the workflow reaches a terminal state (completed, failed,
 * or cancelled). The loop orchestrates the execution of individual workflow steps and
 * ensures proper logging and state management throughout the process.
 *
 * The execution loop follows this pattern:
 * 1. Check if workflow is still in RUNNING state
 * 2. Execute the current workflow node via runNode()
 * 3. Flush any pending log events to ensure proper audit trail
 * 4. Repeat until workflow execution is complete
 *
 * The loop will automatically terminate when:
 * - Workflow completes successfully (ExecutionStatus.COMPLETED)
 * - Workflow fails due to an error (ExecutionStatus.FAILED)
 * - Workflow is cancelled (ExecutionStatus.CANCELLED)
 * - Any other non-RUNNING status is reached
 * - The execution cursor's `stop()` is called while the workflow remains RUNNING
 */
export async function workflowExecutionLoop(params: WorkflowExecutionLoopParams) {
  const executionFailure = new ExecutionFailure();
  const executionParams = { ...params, executionFailure };
  try {
    const pending = params.workflowRuntime.getWorkflowExecution().pendingTermination;
    if (pending) outsideExecutionFence(() => completeTerminationPath(executionParams, pending));
    await runWorkflowExecutionLoop(executionParams);
  } catch (error) {
    executionFailure.fail(
      'Workflow execution persistence failed',
      error instanceof Error ? error : new Error(String(error))
    );
  }
  if (!executionFailure.error) return;
  // Failed flush queues cannot safely be reused to record the terminal disposition.
  // This write is attempted only after both drivers have stopped.
  const failure = executionFailure.error;
  const update = {
    id: params.workflowRuntime.getWorkflowExecution().id,
    status: ExecutionStatus.FAILED,
    pendingTermination: null,
    error: ExecutionError.fromError(failure).toSerializableObject(),
    finishedAt: new Date().toISOString(),
  };
  outsideExecutionFence(() => {
    params.workflowExecutionCursor.captureError(failure);
    params.workflowExecutionCursor.stop();
    params.workflowExecutionState.updateWorkflowExecution(update);
  });
  await params.workflowExecutionRepository.updateWorkflowExecution(
    update,
    getTerminalWorkflowRefreshOptions(params.workflowRuntime.getWorkflowExecution())
  );
}

async function runWorkflowExecutionLoop(
  params: WorkflowExecutionLoopParams & { executionFailure: ExecutionFailure }
) {
  const { workflowExecutionCursor, workflowRuntime } = params;
  // Create an abort controller to signal the persistence loop to exit immediately
  // when execution completes (instead of waiting for the next 500ms flush cycle)
  const persistenceAbortController = new AbortController();

  const onTaskAbort = () => {
    const wasWaitingForInput =
      workflowRuntime.getWorkflowExecution().status === ExecutionStatus.WAITING_FOR_INPUT;
    if (isWorkflowTaskManagerAbortSignal(params.signal)) {
      params.workflowExecutionState.updateWorkflowExecution({
        cancelRequested: true,
        status: ExecutionStatus.CANCELLED,
        cancelledAt: new Date().toISOString(),
        cancellationReason: TASK_MANAGER_ABORT_CANCELLATION_REASON,
        cancelledBy: 'system',
      });
      if (wasWaitingForInput) {
        emitHitlLifecycle({
          type: 'canceled',
          executionId: workflowRuntime.getWorkflowExecution().id,
        });
      }
      persistenceAbortController.abort();
      return;
    }

    params.workflowExecutionState.updateWorkflowExecution({
      cancelRequested: true,
      cancelledAt: new Date().toISOString(),
      cancellationReason: 'Task aborted',
      status: ExecutionStatus.CANCELLED,
    });
    if (wasWaitingForInput) {
      emitHitlLifecycle({
        type: 'canceled',
        executionId: workflowRuntime.getWorkflowExecution().id,
      });
    }
    // Also abort persistence loop when task is aborted
    persistenceAbortController.abort();
    workflowExecutionCursor.stop();
  };

  params.signal.addEventListener('abort', onTaskAbort, { once: true });
  if (params.signal.aborted) {
    onTaskAbort();
  }

  try {
    workflowExecutionCursor.start();
    // Run execution and persistence loops in parallel
    // When execution finishes, signal persistence loop to exit immediately
    const runDriver = async (run: () => Promise<void>): Promise<void> => {
      try {
        await run();
      } catch (error) {
        params.executionFailure?.fail(
          'Workflow execution driver failed',
          error instanceof Error ? error : new Error(String(error))
        );
        persistenceAbortController.abort();
        throw error;
      }
    };
    const drivers = [
      runDriver(() => executionFlowLoop(params).finally(() => persistenceAbortController.abort())),
      runDriver(() => persistenceLoop(params, persistenceAbortController.signal)),
    ];
    const results = await Promise.allSettled(drivers);
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    params.executionFailure.throwIfFailed();
  } catch (error) {
    workflowExecutionCursor.captureError(error);
    workflowExecutionCursor.stop();
    workflowRuntime.branchExecutor?.abortActive();
    const fatalError = params.executionFailure?.error;
    if (fatalError) {
      outsideExecutionFence(() => {
        const serializedError = ExecutionError.fromError(fatalError).toSerializableObject();
        for (const step of params.workflowExecutionState.getAllStepExecutions()) {
          if (!isTerminalStatus(step.status))
            params.workflowExecutionState.upsertStep({
              id: step.id,
              status: ExecutionStatus.FAILED,
              error: serializedError,
              finishedAt: new Date().toISOString(),
            });
        }
      });
    }
  } finally {
    params.signal.removeEventListener('abort', onTaskAbort);
    const finalFlushSpan = apm.startSpan('final flush state', 'workflow', 'persistence');
    await flushState(params, {
      workflowLogFlushSignal: params.signal,
    });
    finalFlushSpan?.end();
  }

  const termination = workflowRuntime.getWorkflowExecution().pendingTermination;
  if (termination && !params.executionFailure?.error) {
    outsideExecutionFence(() => {
      const workflow = workflowRuntime.getWorkflowExecution();
      completeTerminationPath(params, termination);
      params.workflowExecutionState.updateWorkflowExecution({
        status: termination.status,
        pendingTermination: null,
        error: termination.error ?? null,
        context: { ...workflow.context, output: termination.output },
        ...(termination.status === ExecutionStatus.CANCELLED
          ? {
              cancelledAt: new Date().toISOString(),
              cancelledBy: 'workflow',
              cancellationReason: String(
                termination.output.reason ??
                  termination.output.message ??
                  'Workflow termination requested'
              ),
            }
          : {}),
      });
      workflowExecutionCursor.clearError();
      if (termination.error)
        workflowExecutionCursor.captureError(new Error(termination.error.message));
      workflowExecutionCursor.stop();
      for (const step of params.workflowExecutionState.getAllStepExecutions()) {
        if (!isTerminalStatus(step.status))
          params.workflowExecutionState.upsertStep({
            id: step.id,
            status: ExecutionStatus.CANCELLED,
            finishedAt: new Date().toISOString(),
          });
      }
    });
  }

  if (
    params.executionFailure &&
    workflowRuntime.getWorkflowExecution().status === ExecutionStatus.CANCELLED
  ) {
    outsideExecutionFence(() => {
      for (const step of params.workflowExecutionState.getAllStepExecutions()) {
        if (!isTerminalStatus(step.status)) {
          params.workflowExecutionState.upsertStep({
            id: step.id,
            status: ExecutionStatus.CANCELLED,
            finishedAt: new Date().toISOString(),
          });
          params.workflowLogger.logInfo('Step cancelled', {
            workflow: { step_id: step.stepId, step_execution_id: step.id },
            event: { action: 'step-cancelled', outcome: 'unknown' },
          });
        }
      }
    });
  }

  // Final save to ensure workflow state is persisted after execution loop
  const finalSaveSpan = apm.startSpan('final save state', 'workflow', 'persistence');
  await workflowRuntime.saveState();
  finalSaveSpan?.end();

  // Flush the final state (including terminal status) to Elasticsearch
  const finalStateFlushSpan = apm.startSpan('final state flush', 'workflow', 'persistence');
  await params.stepIoService.flush();
  finalStateFlushSpan?.end();

  // Workflow-end cleanup for transiently-rehydrated outputs. The per-step
  // release lives in `prepareForRead` (deferred-release pattern), so the
  // last step's transient set is still resident when the loop exits — this
  // call drops it. Idempotent and a no-op when nothing is transient.
  params.stepIoService.releaseTransientlyRehydratedOutputs();

  const finalLogFlushSpan = apm.startSpan('final flush logs', 'workflow', 'logging');
  await params.workflowLogger.flushEvents({
    signal: params.signal,
  });
  finalLogFlushSpan?.end();
  params.signal.removeEventListener('abort', onTaskAbort);
}
