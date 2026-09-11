/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ExecutionStatus, isTerminalStatus } from '@kbn/workflows';
import { ExecutionError } from '@kbn/workflows/server';
import type { WorkflowExecutionLoopParams } from './types';
import type { NodeWithErrorCatching } from '../step/node_implementation';
import type { StepExecutionRuntime } from '../workflow_context_manager/step_execution_runtime';
import { WorkflowScopeStack } from '../workflow_context_manager/workflow_scope_stack';

/**
 * Handles workflow execution errors by bubbling them up through the scope hierarchy
 * and invoking error handlers at each level.
 *
 * This function implements a sophisticated error handling mechanism that:
 * 1. Marks the failed step as FAILED in the execution state
 * 2. Traverses the scope stack in reverse order (bottom-up) to handle errors at each nested level
 * 3. Invokes custom error handlers on nodes that implement the `NodeWithErrorCatching` interface
 * 4. Ensures proper cleanup and state consistency during error propagation
 *
 * The error bubbling process works by:
 * - Starting from the innermost scope where the error occurred
 * - Moving outward through each parent scope in the stack
 * - Giving each scope's node a chance to handle or transform the error
 * - Continuing until either the error is resolved or all scopes are exhausted
 *
 * Error handling flow:
 * 1. Check if there's an active workflow error, return early if none
 * 2. Update the failed step's status to FAILED with error details
 * 3. Iterate through scope stack from innermost to outermost:
 *    - Navigate to the scope's node and exit the current scope
 *    - Create a step context for the error-handling node
 *    - Check if the node implements error catching capabilities
 *    - Invoke the node's catchError method if available
 *    - Handle any errors thrown during error handling itself
 *    - Update step status if error persists after handling attempt
 * 4. Continue until error is resolved or scope stack is exhausted
 *
 * @param params - The workflow execution parameters containing:
 *   - workflowRuntime: Runtime manager for workflow state and navigation
 *   - workflowExecutionGraph: The workflow graph definition
 *   - workflowExecutionState: Current execution state for step updates
 *   - workflowLogger: Logger for error events and debugging
 *   - nodesFactory: Factory for creating node implementations
 *   - esClient: Elasticsearch client for data operations
 *   - fakeRequest: Request context for service interactions
 *   - coreStart: Kibana core services
 *
 * @param failedStepExecutionRuntime - The context manager for the step that originally failed,
 *   used to update the step's status and identify the failure point
 */
export async function catchError(
  params: WorkflowExecutionLoopParams,
  failedStepExecutionRuntime: StepExecutionRuntime
) {
  const { workflowExecutionCursor, workflowLogger, stepExecutionRuntimeFactory, nodesFactory } =
    params;

  // Workflow-level timeout is finalized in EnterWorkflowTimeoutZoneNodeImpl.monitor()
  // (TIMED_OUT on the workflow, cursor error cleared). run_node still invokes catch_error
  // in finally; without this guard we would re-capture the timed-out step's error and run
  // generic error bubbling (navigateToNode + commitPendingNavigation), which wrongly clears
  // scopeStack and can override the timeout outcome. Interrupted steps are FAILED today;
  // CANCELLED is the better fit and will likely replace FAILED for those steps later.
  if (params.workflowRuntime.getWorkflowExecution().status === ExecutionStatus.TIMED_OUT) {
    return;
  }

  try {
    // Loop through nested scopes in reverse order to handle errors at each level.
    // The loop continues while:
    // 1. There's an active error in the workflow execution
    // 2. There are items in the execution stack
    // 3. The top stack entry has nested scopes to process
    // This allows error handling to bubble up through the scope hierarchy.
    // Don't overwrite a higher-priority error already set by onTaskAbort (e.g. the sync-
    // execution timeout). The step's error is a consequence of that abort; the timeout
    // message is what callers need to see.
    if (
      failedStepExecutionRuntime.stepExecutionExists() &&
      failedStepExecutionRuntime.error &&
      !workflowExecutionCursor.error
    ) {
      workflowExecutionCursor.captureError(failedStepExecutionRuntime.error);
    } else if (failedStepExecutionRuntime.stepExecutionExists()) {
      const stepExecution = failedStepExecutionRuntime.stepExecution;
      // Only finalize the step here if it has NOT already reached a terminal state
      // on its own. A step that already settled itself (e.g. a parallel step that
      // called failStep with its aggregate output under fail-fast, workflow.output/
      // workflow.fail that COMPLETED before setting the error, or a streaming step
      // that failed with partial output) must be left as-is — re-calling failStep
      // here would overwrite its status/output (clobbering the persisted output to
      // null) even though the step already recorded its own terminal disposition.
      if (
        workflowExecutionCursor.error &&
        (!stepExecution?.status || !isTerminalStatus(stepExecution.status))
      ) {
        failedStepExecutionRuntime.failStep(
          ExecutionError.fromError(workflowExecutionCursor.error)
        );
      }
    }

    if (!workflowExecutionCursor.error) {
      return;
    }

    let workflowScopeStack = WorkflowScopeStack.fromStackFrames(
      workflowExecutionCursor.currentStackFrames
    );
    while (workflowExecutionCursor.error && !workflowScopeStack.isEmpty()) {
      const scopeEntry = workflowScopeStack.getCurrentScope();
      const newWorkflowScopeStack = workflowScopeStack.exitScope();
      const currentNode = workflowExecutionCursor.currentNode;

      if (!currentNode) {
        throw new Error('No current node ID in workflow execution state. This should not happen.');
      }

      workflowExecutionCursor.navigateToNode(scopeEntry.nodeId);

      const stepExecutionRuntime = stepExecutionRuntimeFactory.createStepExecutionRuntime({
        nodeId: scopeEntry.nodeId,
        stackFrames: newWorkflowScopeStack.stackFrames,
      });
      const stepImplementation = nodesFactory.create(stepExecutionRuntime);

      if ((stepImplementation as unknown as NodeWithErrorCatching).catchError) {
        const stepErrorCatcher = stepImplementation as unknown as NodeWithErrorCatching;
        const failedContext = stepExecutionRuntimeFactory.createStepExecutionRuntime({
          nodeId: currentNode.id,
          stackFrames: workflowScopeStack.stackFrames,
        });

        try {
          await Promise.resolve(stepErrorCatcher.catchError(failedContext));
        } catch (error) {
          workflowExecutionCursor.captureError(error);
        }
      }

      workflowExecutionCursor.commitPendingNavigation();

      workflowScopeStack = WorkflowScopeStack.fromStackFrames(
        workflowExecutionCursor.currentStackFrames
      );

      if (workflowExecutionCursor.error) {
        if (stepExecutionRuntime.stepExecutionExists()) {
          // Same rule as above: don't clobber a scope that already settled itself
          // (e.g. a parallel step that failed with its aggregate output). Only
          // finalize scopes still non-terminal while the error bubbles up.
          const scopeStatus = stepExecutionRuntime.stepExecution?.status;
          if (!scopeStatus || !isTerminalStatus(scopeStatus)) {
            stepExecutionRuntime.failStep(ExecutionError.fromError(workflowExecutionCursor.error));
          }
        }
      }
    }
  } catch (error) {
    workflowExecutionCursor.captureError(error);
    workflowLogger.logError(
      `Error in catchError: ${error.message}. Workflow execution may be in an inconsistent state.`
    );
  }

  if (workflowExecutionCursor.error) {
    workflowExecutionCursor.stop();
  }
}
