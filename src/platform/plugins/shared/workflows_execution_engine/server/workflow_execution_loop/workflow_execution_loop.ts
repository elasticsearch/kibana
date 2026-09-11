/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import apm from 'elastic-apm-node';
import { ExecutionStatus } from '@kbn/workflows';
import { executionFlowLoop } from './execution_flow_loop';
import { flushState, persistenceLoop } from './persistence_loop';
import type { WorkflowExecutionLoopParams } from './types';
import { emitHitlLifecycle } from '../step/wait_for_input_step/hitl_lifecycle_auditor';
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

    const reason = params.signal.reason;
    // When the abort carries an explicit error (e.g. a pre-LLM or sync-execution
    // timeout), treat it as FAILED so the error detail is surfaced to callers.
    // A plain abort (no reason, or an AbortError from a no-arg abort()) keeps
    // CANCELLED semantics — that represents an intentional stop (user disconnect).
    const isFailureAbort = reason instanceof Error && reason.name !== 'AbortError';
    if (isFailureAbort) {
      workflowExecutionCursor.captureError(reason);
      params.workflowExecutionState.updateWorkflowExecution({
        status: ExecutionStatus.FAILED,
      });
    } else {
      params.workflowExecutionState.updateWorkflowExecution({
        cancelRequested: true,
        cancelledAt: new Date().toISOString(),
        cancellationReason: 'Task aborted',
        status: ExecutionStatus.CANCELLED,
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
    if (params.executionMode === 'sync') {
      await executionFlowLoop(params);
    } else {
      await Promise.all([
        executionFlowLoop(params).finally(() => {
          // Signal persistence loop to stop waiting and exit
          persistenceAbortController.abort();
        }),
        persistenceLoop(params, persistenceAbortController.signal),
      ]);
    }
  } catch (error) {
    workflowExecutionCursor.captureError(error);
  } finally {
    const finalFlushSpan = apm.startSpan('final flush state', 'workflow', 'persistence');
    if (params.executionMode !== 'sync') {
      await flushState(params, {
        workflowLogFlushSignal: params.signal,
      });
    }
    finalFlushSpan?.end();
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
