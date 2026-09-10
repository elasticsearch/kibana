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
import type { ExecutionBudget } from './execution_budget';
import { awaitCancellation } from './execution_failure';
import { createExecutionFence, outsideExecutionFence } from './execution_fence';
import { handleExecutionDelay } from './handle_execution_delay';
import { runOnCancelIfNeeded } from './run_node_cancellation';
import { processNodeStackMonitoring } from './run_stack_monitor/process_node_stack_monitoring';
import { runStackMonitor } from './run_stack_monitor/run_stack_monitor';
import type { WorkflowExecutionLoopParams } from './types';
import type { NodeImplementation } from '../step/node_implementation';
import type { StepExecutionRuntime } from '../workflow_context_manager/step_execution_runtime';

export interface RunNodeOptions {
  runtime?: StepExecutionRuntime;
  parentSignal?: AbortSignal;
  deadline?: number;
  budget?: ExecutionBudget;
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
export async function runNode(
  params: WorkflowExecutionLoopParams,
  options: RunNodeOptions = {}
): Promise<void> {
  const { workflowExecutionCursor, stepExecutionRuntimeFactory } = params;
  const node = workflowExecutionCursor.currentNode;
  let monitorAbortController: AbortController | undefined;
  let stepExecutionRuntime: StepExecutionRuntime | undefined;
  let nodeImplementation: NodeImplementation | undefined;
  const fence = createExecutionFence(() => workflowExecutionCursor.currentStackFrames);
  const monitorFence = createExecutionFence(() => workflowExecutionCursor.currentStackFrames);
  let monitorOperation: Promise<void> | undefined;
  let release: (() => void) | undefined;
  const inFlightOperations: Array<Promise<void>> = [];
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let unlinkFailure: (() => void) | undefined;
  let unlinkAbort: (() => void) | undefined;
  let closeAbortWait: (() => void) | undefined;

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

  const finalizeNode = async (): Promise<void> => {
    fence.close();
    monitorAbortController?.abort();
    monitorFence.close();
    unlinkAbort?.();
    closeAbortWait?.();
    if (deadlineTimer) clearTimeout(deadlineTimer);
    // Ignoring abort must not let an operation release capacity while its I/O is still active.
    if (release) void Promise.allSettled(inFlightOperations).then(release);

    // Run cancellation cleanup in `finally` so it fires on BOTH the normal path
    // and the path where a monitor (cancellation or a timeout zone) threw and
    // bypassed the try body. `runOnCancelIfNeeded` only acts when the step's
    // abort signal fired and the node is cancellable, and `onCancel` is required
    // to be idempotent, so this is safe to call unconditionally here.
    if (nodeImplementation && stepExecutionRuntime) {
      const implementation = nodeImplementation;
      const runtime = stepExecutionRuntime;
      await outsideExecutionFence(() =>
        runOnCancelIfNeeded(implementation, runtime, params.workflowLogger, params.executionFailure)
      );
    }

    if (
      params.executionFailure &&
      (monitorOperation || stepExecutionRuntime?.abortController.signal.aborted)
    ) {
      const operations = monitorOperation
        ? [...inFlightOperations, monitorOperation]
        : inFlightOperations;
      await awaitCancellation(
        Promise.allSettled(operations).then(() => undefined),
        params.cancellationGraceMs ?? 5000,
        params.executionFailure
      );
    }

    if (
      stepExecutionRuntime &&
      !params.executionFailure?.signal.aborted &&
      !(params.boundaryNodeId && stepExecutionRuntime.abortController.signal.aborted)
    ) {
      const catchErrorSpan = apm.startSpan('catch error handling', 'workflow', 'error_handling');
      if (params.boundaryNodeId)
        await catchError(params, stepExecutionRuntime, params.boundaryNodeId);
      else await catchError(params, stepExecutionRuntime);
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

    unlinkFailure?.();
    if (params.executionFailure?.error) nodeSpan?.setOutcome('failure');
    nodeSpan?.end();
    params.executionFailure?.throwIfFailed();
  };

  try {
    params.executionFailure?.throwIfFailed();
    stepExecutionRuntime =
      options.runtime ??
      stepExecutionRuntimeFactory.createStepExecutionRuntime({
        nodeId: node.id,
        stackFrames: workflowExecutionCursor.currentStackFrames,
      });

    // Build the node implementation before the cancel short-circuit so cancellable nodes
    // (e.g. workflow.execute holding a child execution) still get their onCancel hook.
    nodeImplementation = params.nodesFactory.create(stepExecutionRuntime);
    const runtime = stepExecutionRuntime;
    const implementation = nodeImplementation;
    const parentSignal = options.parentSignal ?? params.signal;
    const abort = () => {
      fence.close();
      runtime.abortController.abort(parentSignal.reason);
    };
    parentSignal.addEventListener('abort', abort, { once: true });
    unlinkAbort = () => parentSignal.removeEventListener('abort', abort);
    if (parentSignal.aborted) abort();
    if (params.workflowRuntime.getWorkflowExecution().pendingTermination)
      params.executionFailure?.stopForTermination();
    const failureSignal = params.executionFailure?.signal;
    if (failureSignal) {
      const fail = () => {
        fence.close();
        runtime.abortController.abort(failureSignal.reason);
      };
      failureSignal.addEventListener('abort', fail, { once: true });
      unlinkFailure = () => failureSignal.removeEventListener('abort', fail);
      if (failureSignal.aborted) fail();
    }
    if (options.deadline !== undefined) {
      const timeout = () => {
        fence.close();
        runtime.abortController.abort(new Error('Parallel branch deadline exceeded'));
      };
      const remaining = options.deadline - Date.now();
      if (remaining <= 0) timeout();
      else deadlineTimer = setTimeout(timeout, remaining);
    }
    const aborted = new Promise<void>((resolve) => {
      const onAbort = () => {
        fence.close();
        resolve();
      };
      runtime.abortController.signal.addEventListener('abort', onAbort, { once: true });
      closeAbortWait = () => runtime.abortController.signal.removeEventListener('abort', onAbort);
      if (runtime.abortController.signal.aborted) onAbort();
    });

    if (params.workflowExecutionState.getWorkflowExecution().cancelRequested) {
      await cancelWorkflowIfRequested(
        params.workflowExecutionRepository,
        params.workflowExecutionState,
        stepExecutionRuntime,
        params.workflowLogger,
        workflowExecutionCursor,
        stepExecutionRuntime.abortController,
        params.executionFailure
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

    if (runtime.abortController.signal.aborted) return;
    // Parallel coordinators release execution capacity while their descendants run.
    if (options.budget && node.type !== 'enter-parallel') {
      release = await options.budget.acquire(runtime.abortController.signal);
    }
    if (runtime.abortController.signal.aborted) return;

    // Pre-warm: rehydrate any evicted step outputs that the upcoming step will need.
    // This must happen before getContext() is called (which is synchronous).
    if (params.executionFailure) {
      const failure = params.executionFailure;
      const hydration = fence
        .run(() => runtime.contextManager.ensureContextReady())
        .catch((error) => {
          throw failure.fail(
            'Failed to rehydrate workflow context',
            error instanceof Error ? error : new Error(String(error))
          );
        });
      inFlightOperations.push(hydration);
      await Promise.race([hydration, aborted]);
      if (runtime.abortController.signal.aborted) return;
    } else {
      await stepExecutionRuntime.contextManager.ensureContextReady();
    }

    const monitorController = new AbortController();
    monitorAbortController = monitorController;

    // Run stack monitoring once before the race so timeouts/cancel win over step.run().
    if (params.executionFailure) {
      const initialMonitoring = monitorFence.run(() => processNodeStackMonitoring(params, runtime));
      inFlightOperations.push(initialMonitoring);
      await Promise.race([initialMonitoring, aborted]);
      if (runtime.abortController.signal.aborted) return;
    } else {
      await processNodeStackMonitoring(params, stepExecutionRuntime);
    }

    /**
     * Run monitoring in parallel with step execution to handle:
     * - Cancellation detection
     * - Timeout monitoring
     * - Custom monitoring logic for monitor-able nodes
     * The order of these promises is important - we want to stop monitoring
     */
    const runMonitorPromise = monitorFence.run(() =>
      runStackMonitor(params, runtime, monitorController).catch((error) => {
        if (!params.boundaryNodeId || !runtime.abortController.signal.aborted)
          workflowExecutionCursor.captureError(error);
        throw error;
      })
    );
    monitorOperation = runMonitorPromise;
    let runStepPromise: Promise<void> = Promise.resolve();

    // Sometimes monitoring can prevent the step from running, e.g. when the workflow is cancelled, timeout occurred right before running step, etc.
    if (
      !monitorAbortController.signal.aborted &&
      !stepExecutionRuntime.abortController.signal.aborted
    ) {
      runStepPromise = (async () => {
        try {
          await fence.run(() => Promise.resolve(implementation.run()));
          if (
            stepExecutionRuntime &&
            !params.boundaryNodeId &&
            !runtime.abortController.signal.aborted
          ) {
            await handleExecutionDelay(params, stepExecutionRuntime);
          }
        } finally {
          if (stepExecutionRuntime) {
            await stepExecutionRuntime.flushEventLogs({ signal: params.signal }).catch((error) => {
              throw (
                params.executionFailure?.fail(
                  'Failed to flush step events',
                  error instanceof Error ? error : new Error(String(error))
                ) ?? error
              );
            });
          }
        }
      })();
    }

    inFlightOperations.push(runStepPromise);
    await Promise.race([runMonitorPromise, runStepPromise, aborted]);
    nodeSpan?.setOutcome('success');
  } catch (error) {
    if (
      !params.executionFailure?.error &&
      (!params.boundaryNodeId || !stepExecutionRuntime?.abortController.signal.aborted)
    )
      workflowExecutionCursor.captureError(error);
    nodeSpan?.setOutcome('failure');
  } finally {
    await finalizeNode();
  }
}
