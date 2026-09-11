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
import { cancelWorkflowIfRequested } from './cancel_workflow_if_requested';
import { catchError } from './catch_error';
import { handleExecutionDelay } from './handle_execution_delay';
import { processNodeStackMonitoring } from './run_stack_monitor/process_node_stack_monitoring';
import { runStackMonitor } from './run_stack_monitor/run_stack_monitor';
import type { WorkflowExecutionLoopParams } from './types';
import type { NodeImplementation } from '../step/node_implementation';
import { isCancellableNode } from '../step/node_implementation';
import type { StepExecutionRuntime } from '../workflow_context_manager/step_execution_runtime';
import type { IWorkflowEventLogger } from '../workflow_event_logger';

/**
 * Invokes the cancellable node's `onCancel` hook when the step's abort signal fired.
 * Errors are logged and swallowed so workflow teardown can continue.
 */
async function runOnCancelIfNeeded(
  nodeImplementation: NodeImplementation,
  stepExecutionRuntime: StepExecutionRuntime,
  workflowLogger: IWorkflowEventLogger
): Promise<void> {
  if (
    !stepExecutionRuntime.abortController.signal.aborted ||
    !isCancellableNode(nodeImplementation)
  ) {
    return;
  }

  try {
    await nodeImplementation.onCancel();
  } catch (onCancelError) {
    workflowLogger.logError(
      'Failed to execute onCancel hook - continuing execution',
      onCancelError instanceof Error ? onCancelError : new Error(String(onCancelError))
    );
  }
}

/**
 * Executes a single step in the workflow execution process.
 *
 * This function orchestrates the execution of a workflow node by:
 * 1. Creating a context manager for the current step
 * 2. Checking the execution cursor and in-memory workflow state to skip execution when
 *    the driver is stopped (`stop()`) or the workflow is no longer RUNNING
 * 3. Creating and running the node implementation
 * 4. Running monitoring in parallel to handle cancellation, timeouts, and other control flow
 * 5. Managing error handling and state persistence
 *
 * The execution uses a race condition between the step execution and monitoring to ensure
 * proper cancellation and timeout handling. The async monitoring loop runs every 500ms in
 * parallel with step execution to detect cancellations without blocking step startup.
 *
 * @param params - The workflow execution loop parameters containing:
 *   - workflowRuntime: Runtime instance managing workflow state and navigation
 *   - workflowExecutionCursor: Current node and execution-loop gate (`isExecuting`, `start` / `stop`)
 *   - workflowExecutionGraph: The workflow graph definition
 *   - workflowExecutionState: Current execution state
 *   - nodesFactory: Factory for creating node implementations
 *   - esClient: Elasticsearch client for data operations
 *   - fakeRequest: Request object for context
 *   - coreStart: Kibana core services
 *
 * @returns Promise that resolves when the step execution is complete
 *
 * @throws Will catch and handle errors through the workflow runtime's error handling mechanism
 */
export async function runNode(params: WorkflowExecutionLoopParams): Promise<void> {
  const { workflowExecutionCursor, stepExecutionRuntimeFactory } = params;
  const node = workflowExecutionCursor.currentNode;
  let monitorAbortController: AbortController | undefined;
  let stepExecutionRuntime: StepExecutionRuntime | undefined;
  let nodeImplementation: NodeImplementation | undefined;
  let abortStepRelay: (() => void) | undefined;

  if (!node) {
    return;
  }

  if (!workflowExecutionCursor.isExecuting) {
    return;
  }

  // Create a span for the entire node execution lifecycle
  const nodeSpan = apm.startSpan(`node: ${node.stepId || node.id}`, 'workflow', 'node');
  if (nodeSpan) {
    nodeSpan.setLabel('node_id', node.id);
    nodeSpan.setLabel('node_type', node.stepType);
    if (node.stepId) {
      nodeSpan.setLabel('step_id', node.stepId);
    }
  }

  try {
    stepExecutionRuntime = stepExecutionRuntimeFactory.createStepExecutionRuntime({
      nodeId: node.id,
      stackFrames: workflowExecutionCursor.currentStackFrames,
    });

    // Cascade the execution-level abort to the step's controller so that in-flight I/O
    // (e.g. LLM streaming in call_site.proceed) is cancelled immediately when the sync
    // execution timeout fires rather than waiting for streaming to finish naturally.
    const runtimeRef = stepExecutionRuntime;
    abortStepRelay = () => runtimeRef.abortController.abort(params.signal.reason);
    if (params.signal.aborted) {
      abortStepRelay();
    } else {
      params.signal.addEventListener('abort', abortStepRelay, { once: true });
    }

    // Build the node implementation before the cancel short-circuit so cancellable nodes
    // (e.g. workflow.execute holding a child execution) still get their onCancel hook.
    nodeImplementation = params.nodesFactory.create(stepExecutionRuntime);

    if (params.workflowExecutionState.getWorkflowExecution().cancelRequested) {
      await cancelWorkflowIfRequested(
        params.workflowExecutionRepository,
        params.workflowExecutionState,
        stepExecutionRuntime,
        params.workflowLogger,
        workflowExecutionCursor,
        stepExecutionRuntime.abortController
      );
    }

    /**
     * Check in-memory workflow state to skip execution if workflow is no longer running.
     * This is instant (no ES call) and catches cancellations that were already detected.
     * When cancelRequested is true, status is always updated to CANCELLED, so this check
     * covers both cancellation and other terminal states (COMPLETED, FAILED, etc.).
     */
    if (params.workflowRuntime.getWorkflowExecution().status !== ExecutionStatus.RUNNING) {
      // onCancel cleanup runs in the `finally` block (which covers both this
      // short-circuit and the monitor-threw path), so it is not invoked here.
      nodeSpan?.setOutcome('unknown');
      nodeSpan?.end();
      return;
    }

    // Pre-warm: rehydrate any evicted step outputs that the upcoming step will need.
    // This must happen before getContext() is called (which is synchronous).
    await stepExecutionRuntime.contextManager.ensureContextReady();

    monitorAbortController = new AbortController();

    // Run stack monitoring once before the race so timeouts/cancel win over step.run().
    await processNodeStackMonitoring(params, stepExecutionRuntime);

    /**
     * Run monitoring in parallel with step execution to handle:
     * - Cancellation detection
     * - Timeout monitoring
     * - Custom monitoring logic for monitor-able nodes
     * The order of these promises is important - we want to stop monitoring
     */
    const runMonitorPromise = runStackMonitor(params, stepExecutionRuntime, monitorAbortController);
    let runStepPromise: Promise<void> = Promise.resolve();

    // Sometimes monitoring can prevent the step from running, e.g. when the workflow is cancelled, timeout occurred right before running step, etc.
    if (
      !monitorAbortController.signal.aborted &&
      !stepExecutionRuntime.abortController.signal.aborted
    ) {
      runStepPromise = (async () => {
        try {
          await Promise.resolve(nodeImplementation.run());
          if (stepExecutionRuntime) {
            await handleExecutionDelay(params, stepExecutionRuntime);
          }
        } finally {
          if (stepExecutionRuntime) {
            await stepExecutionRuntime.flushEventLogs({
              signal: params.signal,
            });
          }
        }
      })();
    }

    await Promise.race([runMonitorPromise, runStepPromise]);
    nodeSpan?.setOutcome('success');
  } catch (error) {
    // Don't overwrite a higher-priority error already captured by onTaskAbort (e.g. the
    // sync-execution timeout error). The catch fires for monitor/step rejections that are
    // consequences of that abort, not the root cause.
    if (!workflowExecutionCursor.error) {
      workflowExecutionCursor.captureError(error);
    }
    nodeSpan?.setOutcome('failure');
  } finally {
    if (abortStepRelay) {
      params.signal.removeEventListener('abort', abortStepRelay);
    }
    monitorAbortController?.abort();

    // Run cancellation cleanup in `finally` so it fires on BOTH the normal path
    // and the path where a monitor (cancellation or a timeout zone) threw and
    // bypassed the try body. `runOnCancelIfNeeded` only acts when the step's
    // abort signal fired and the node is cancellable, and `onCancel` is required
    // to be idempotent, so this is safe to call unconditionally here.
    if (nodeImplementation && stepExecutionRuntime) {
      await runOnCancelIfNeeded(nodeImplementation, stepExecutionRuntime, params.workflowLogger);
    }

    if (stepExecutionRuntime) {
      const catchErrorSpan = apm.startSpan('catch error handling', 'workflow', 'error_handling');
      await catchError(params, stepExecutionRuntime);
      catchErrorSpan?.end();
    }

    // Note: predecessor outputs that `prepareForRead` rehydrated for this
    // step are released by the *next* step's `prepareForRead` (deferred
    // release) so that consecutive consumers of the same predecessor reuse
    // the in-memory copy instead of re-fetching from ES. The execution
    // loop's final-flush path is responsible for the workflow-end cleanup
    // — see `releaseTransientlyRehydratedOutputs` in `workflow_execution_loop`.

    // Release the read-pins set by ensureContextReady so outputs that were
    // only needed by this node become eviction-eligible again. Must run after
    // the node's synchronous getContext() reads have all completed.
    // Idempotent — safe even if ensureContextReady took the eviction-disabled
    // fast path and never set any pins.
    stepExecutionRuntime?.contextManager.releaseReadPins();

    nodeSpan?.end();
  }
}
