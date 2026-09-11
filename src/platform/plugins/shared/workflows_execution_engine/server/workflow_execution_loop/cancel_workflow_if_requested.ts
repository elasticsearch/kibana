/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ExecutionStatus } from '@kbn/workflows';
import type { WorkflowExecutionPersistence } from '../repositories/execution_persistence';
import { buildStepExecutionId } from '../utils';
import type { StepExecutionRuntime } from '../workflow_context_manager/step_execution_runtime';
import type { WorkflowExecutionCursorApi } from '../workflow_context_manager/workflow_execution_cursor';
import type { WorkflowExecutionState } from '../workflow_context_manager/workflow_execution_state';
import type { IWorkflowEventLogger } from '../workflow_event_logger';

/**
 * This function retrieves the current workflow execution and verifies if cancellation requested.
 * In case when cancelRequested is true, it aborts the monitoredContext.abortController and marks the workflow as cancelled.
 * When monitoredContext.abortController.abort() is called, it will send cancellation signal to currently running node/step,
 * and in case if the node/step supports cancellation (like HTTP step with AbortSignal), it will stop its execution immediately.
 *
 * This function is designed to be resilient - if the cancellation check fails (e.g., due to network issues),
 * it will log the error but not throw, allowing the step execution to continue. This prevents infrastructure
 * issues from causing step execution failures.
 */
export async function cancelWorkflowIfRequested(
  workflowExecutionRepository: WorkflowExecutionPersistence,
  workflowExecutionState: WorkflowExecutionState,
  monitoredStepExecutionRuntime: StepExecutionRuntime,
  workflowLogger: IWorkflowEventLogger,
  workflowExecutionCursor: WorkflowExecutionCursorApi,
  monitorAbortController?: AbortController
): Promise<void> {
  if (!workflowExecutionState.getWorkflowExecution().cancelRequested) {
    try {
      const currentExecution = await workflowExecutionRepository.getWorkflowExecutionById(
        workflowExecutionState.getWorkflowExecution().id,
        workflowExecutionState.getWorkflowExecution().spaceId
      );

      if (!currentExecution?.cancelRequested) {
        return;
      }
    } catch (error) {
      // If the cancellation check fails (e.g., network timeout, Elasticsearch unavailable),
      // log the error but don't throw. This prevents infrastructure issues from causing
      // step execution failures. The workflow will continue executing, and cancellation
      // will be checked again on the next monitoring cycle.
      workflowLogger.logError(
        'Failed to check workflow cancellation status - continuing execution',
        error instanceof Error ? error : new Error(String(error))
      );
      return;
    }
  }

  monitorAbortController?.abort();
  monitoredStepExecutionRuntime.abortController.abort();
  let nodeStack = monitoredStepExecutionRuntime.scopeStack;

  // mark current step scopes as cancelled
  while (!nodeStack.isEmpty()) {
    const scopeData = nodeStack.getCurrentScope();
    nodeStack = nodeStack.exitScope();
    const stepExecutionId = buildStepExecutionId(
      workflowExecutionState.getWorkflowExecution().id,
      scopeData.stepId,
      nodeStack.stackFrames
    );

    if (workflowExecutionState.getStepExecution(stepExecutionId)) {
      workflowExecutionState.upsertStep({
        id: stepExecutionId,
        status: ExecutionStatus.CANCELLED,
      });
    }
  }

  workflowExecutionState.upsertStep({
    id: monitoredStepExecutionRuntime.stepExecutionId,
    status: ExecutionStatus.CANCELLED,
    stepId: monitoredStepExecutionRuntime.node.stepId,
    stepType: monitoredStepExecutionRuntime.node.stepType,
    scopeStack: monitoredStepExecutionRuntime.scopeStack.stackFrames,
  });
  workflowExecutionState.updateWorkflowExecution({
    status: ExecutionStatus.CANCELLED,
  });
  workflowExecutionCursor.stop();
}
