/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { JsonValue } from '@kbn/utility-types';
import type {
  EsWorkflowExecution,
  EsWorkflowStepExecution,
  StackFrame,
  WorkflowTokenUsage,
} from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import type { GraphNodeUnion, WorkflowGraph } from '@kbn/workflows/graph';
import { ExecutionError } from '@kbn/workflows/server';
import type { StepIoService } from './step_io_service';
import type { WorkflowContextManager } from './workflow_context_manager';
import type { WorkflowExecutionState } from './workflow_execution_state';
import { WorkflowScopeStack } from './workflow_scope_stack';
import type { RunStepResult } from '../step/node_implementation';
import { extractTokenUsage, parseDuration } from '../utils';

import type { IWorkflowEventLogger, WorkflowEventFlushOptions } from '../workflow_event_logger';

interface StepExecutionRuntimeInit {
  contextManager: WorkflowContextManager;
  workflowExecutionState: WorkflowExecutionState;
  stepIoService: StepIoService;
  workflowExecutionGraph: WorkflowGraph;
  stepLogger: IWorkflowEventLogger;
  stepExecutionId: string;
  node: GraphNodeUnion;
  stackFrames: StackFrame[];
}

/**
 * Manages the runtime execution state of a workflow, including step execution, results, and transitions.
 *
 * The `StepExecutionRuntime` class is responsible for orchestrating the execution of workflow steps,
 * tracking their statuses, results, and runtime states, and updating the overall workflow execution status.
 * It maintains the topological order of steps, supports step navigation, and interacts with repositories to persist
 * execution data.
 *
 * Key responsibilities:
 * - Tracks execution status, results, and runtime state for each workflow step.
 * - Navigates between steps according to topological order, skipping steps as needed.
 * - Initiates and finalizes step and workflow executions, updating persistent storage.
 * - Handles workflow completion and error propagation.
 * - Creates APM traces compatible with APM TraceWaterfall embeddable
 *
 * @remarks
 * This class assumes that workflow steps are represented as nodes in a directed acyclic graph (DAG),
 * and uses topological sorting to determine execution order.
 */
export class StepExecutionRuntime {
  private workflowExecutionState: WorkflowExecutionState;
  private stepIoService: StepIoService;
  private workflowGraph: WorkflowGraph;
  private stackFrames: StackFrame[];

  public contextManager: WorkflowContextManager;
  public readonly stepExecutionId: string;
  public readonly stepLogger: IWorkflowEventLogger;
  public readonly node: GraphNodeUnion;
  public readonly abortController = new AbortController();

  public get scopeStack(): WorkflowScopeStack {
    return WorkflowScopeStack.fromStackFrames(this.stackFrames);
  }

  public get stepExecution(): EsWorkflowStepExecution | undefined {
    return this.workflowExecutionState.getStepExecution(this.stepExecutionId);
  }

  public get workflowExecution() {
    return this.workflowExecutionState.getWorkflowExecution();
  }

  private get topologicalOrder(): string[] {
    return this.workflowGraph.topologicalOrder;
  }

  private getStepName(): string {
    if (
      'configuration' in this.node &&
      this.node.configuration != null &&
      typeof this.node.configuration === 'object' &&
      'name' in this.node.configuration
    ) {
      const rawName = this.node.configuration.name;
      if (typeof rawName === 'string') {
        return rawName;
      }
    }

    return this.node.stepId;
  }

  constructor(stepExecutionRuntimeInit: StepExecutionRuntimeInit) {
    this.workflowGraph = stepExecutionRuntimeInit.workflowExecutionGraph;
    this.contextManager = stepExecutionRuntimeInit.contextManager;

    // Use workflow execution ID as traceId for APM compatibility
    this.stepLogger = stepExecutionRuntimeInit.stepLogger;
    this.workflowExecutionState = stepExecutionRuntimeInit.workflowExecutionState;
    this.stepIoService = stepExecutionRuntimeInit.stepIoService;
    this.node = stepExecutionRuntimeInit.node;
    this.stepExecutionId = stepExecutionRuntimeInit.stepExecutionId;
    this.stackFrames = stepExecutionRuntimeInit.stackFrames;
  }

  public stepExecutionExists(): boolean {
    return !!this.workflowExecutionState.getStepExecution(this.stepExecutionId);
  }

  public getCurrentStepResult(): RunStepResult | undefined {
    if (!this.stepExecutionExists()) {
      return undefined;
    }
    const error = this.stepIoService.getStepError(this.stepExecutionId);
    return {
      input: this.stepIoService.getStepInput(this.stepExecutionId) || {},
      output: this.stepIoService.getStepOutput(this.stepExecutionId) || {},
      error: error ? new ExecutionError(error) : undefined,
    };
  }

  public getCurrentStepState(): Record<string, unknown> | undefined {
    return this.workflowExecutionState.getStepExecution(this.stepExecutionId)?.state;
  }

  public setCurrentStepState(state: Record<string, unknown> | undefined): void {
    const stepId = this.node.stepId;
    this.workflowExecutionState.upsertStep({
      id: this.stepExecutionId,
      stepId,
      state,
    });
  }

  public startStep(): void {
    const stepId = this.node.stepId;
    const stepStartedAt = new Date();

    this.workflowExecutionState.upsertStep({
      id: this.stepExecutionId,
      stepId: this.node.stepId,
      stepType: this.node.stepType,
      scopeStack: this.workflowExecution.scopeStack,
      topologicalIndex: this.topologicalOrder.indexOf(this.node.id),
      status: ExecutionStatus.RUNNING,
      startedAt: this.stepExecution?.startedAt ?? stepStartedAt.toISOString(),
    });
    this.logStepStart(stepId, this.stepExecutionId);
  }

  public setInput(input: Record<string, unknown>): void {
    this.stepIoService.setStepInput(this.stepExecutionId, input as JsonValue);
  }

  /**
   * Marks the step as COMPLETED.
   *
   * Lifecycle vs IO split: the lifecycle write (status, finishedAt,
   * executionTimeMs) goes through `WorkflowExecutionState.upsertStep` here
   * directly; the IO write (output, optional size) goes through the IO
   * service. Both calls happen synchronously on the same tick, so the
   * persistence loop cannot interleave between them — the flush queue
   * receives one merged entry per step id, identical to the previous
   * single-call shape.
   *
   * @param sizeBytes Optional pre-measured output size (Layer 2 enforcement)
   *   forwarded to the IO service for eviction/telemetry. Omit when the
   *   step has no output to size.
   */
  public finishStep(stepOutput?: unknown, sizeBytes?: number): void {
    const startedStepExecution = this.workflowExecutionState.getStepExecution(this.stepExecutionId);
    const finishedAt = new Date().toISOString();
    const executionTimeMs = startedStepExecution?.startedAt
      ? new Date(finishedAt).getTime() - new Date(startedStepExecution.startedAt).getTime()
      : undefined;

    const usage = this.recordTokenUsage(stepOutput);

    this.workflowExecutionState.upsertStep({
      id: this.stepExecutionId,
      status: ExecutionStatus.COMPLETED,
      finishedAt,
      ...(usage ? { usage } : {}),
      ...(executionTimeMs !== undefined ? { executionTimeMs } : {}),
    });
    this.stepIoService.setStepOutput(
      this.stepExecutionId,
      (stepOutput ?? null) as JsonValue | null,
      sizeBytes
    );
    this.logStepComplete({
      id: this.stepExecutionId,
      status: ExecutionStatus.COMPLETED,
      finishedAt,
      executionTimeMs,
    });
  }

  /**
   * Marks the step as FAILED.
   *
   * Same lifecycle/IO split as {@link finishStep}: status / error /
   * scopeStack / timing go through state, the FAILED-step output goes through
   * the IO service. Atomicity is preserved because the two writes share a
   * synchronous tick.
   *
   * @param error - The error that caused the step to fail.
   * @param partialOutput - Optional partial output to persist alongside the
   *   failure (e.g. token-usage metadata accumulated before a stream errored).
   *   When provided it is stored via the IO service instead of the usual
   *   `null` sentinel, so downstream readers can still reach
   *   `steps.x.output.metadata.usage`, and any reported token usage is rolled
   *   into the per-execution total.
   */
  public failStep(error: Error, partialOutput?: unknown): void {
    const executionError = ExecutionError.fromError(error);
    const serializedError = executionError.toSerializableObject();

    this.workflowExecutionState.setLastFailedStepContext({
      stepId: this.node.stepId,
      stepName: this.getStepName(),
      stepExecutionId: this.stepExecutionId,
    });

    const startedStepExecution = this.workflowExecutionState.getStepExecution(this.stepExecutionId);
    const finishedAt = new Date().toISOString();
    const executionTimeMs = startedStepExecution?.startedAt
      ? new Date(finishedAt).getTime() - new Date(startedStepExecution.startedAt).getTime()
      : undefined;

    const usage = this.recordTokenUsage(partialOutput);

    this.workflowExecutionState.updateWorkflowExecution({
      error: serializedError,
    });
    this.workflowExecutionState.upsertStep({
      id: this.stepExecutionId,
      stepId: this.node.stepId,
      stepType: this.node.stepType,
      status: ExecutionStatus.FAILED,
      scopeStack: this.stackFrames,
      finishedAt,
      error: serializedError,
      ...(usage ? { usage } : {}),
      ...(executionTimeMs !== undefined ? { executionTimeMs } : {}),
    });
    // When partial output is provided, persist it so it remains reachable via
    // `steps.x.output`. Otherwise write the `null` FAILED-step sentinel —
    // distinct from `undefined` (evicted) so the eviction predicate can keep
    // them apart.
    this.stepIoService.setStepOutput(
      this.stepExecutionId,
      partialOutput !== undefined ? (partialOutput as JsonValue) : null
    );
    this.logStepFail(executionError);
  }

  /**
   * Normalizes any LLM token usage the step reported (`output.metadata.usage`)
   * and rolls it into the per-execution total. Returns the normalized usage so
   * the caller can also persist it on the step execution. No-op (returns
   * `undefined`) for steps that don't report usage. Shared by `finishStep`
   * (full output) and `failStep` (partial output before a failure).
   */
  private recordTokenUsage(stepOutput: unknown): WorkflowTokenUsage | undefined {
    const usage = extractTokenUsage(stepOutput);
    this.workflowExecutionState.accumulateUsage(usage);
    return usage;
  }

  public async flushEventLogs(options?: WorkflowEventFlushOptions): Promise<void> {
    await this.stepLogger?.flushEvents(options);
  }

  /**
   * Attempts to enter a wait state for the step execution based on a relative delay duration.
   * If the step is already in a wait state, it exits the wait state instead.
   *
   * @param delay - The delay duration as a string (e.g., "5s", "1m", "2h").
   * @returns A boolean indicating whether the step has entered a wait state (true) or exited it (false).
   */
  public tryEnterDelay(delay: string): boolean {
    return this.tryEnterWaitUntil(new Date(new Date().getTime() + parseDuration(delay)));
  }

  /**
   * Attempts to enter a wait state for the step execution.
   * If the step is already in a wait state, it clears the state and returns false (exit wait).
   *
   * "Already waiting" is detected by two complementary signals:
   * - `state.resumeAt` is present: used by timer-based waits (e.g. `wait` step) where a resume
   *   date is written on entry and cleared on exit.
   * - `stepExecution.status === waitingStatus`: used by indefinite waits (e.g. `waitForInput`)
   *   where no `resumeAt` is written but the status alone marks the wait.
   *
   * @param resumeDate - When provided, stored as `resumeAt` so the scheduler can wake the step
   *   at that time. Omit for indefinite waits triggered externally (e.g. resume API).
   * @param waitingStatus - Status to set while waiting. Defaults to `ExecutionStatus.WAITING`.
   * @returns `true` if the step has entered a wait state, `false` if it has exited one.
   */
  public tryEnterWaitUntil(
    resumeDate?: Date,
    waitingStatus: ExecutionStatus = ExecutionStatus.WAITING
  ): boolean {
    // For timer-based waits, resumeAt is the sole sentinel (written on entry, cleared on exit).
    // For indefinite waits (no resumeDate), status is the sentinel since no resumeAt is written.
    const alreadyWaiting =
      resumeDate != null
        ? this.stepExecution?.state?.resumeAt != null
        : this.stepExecution?.status === waitingStatus;

    if (alreadyWaiting) {
      const newState = { ...(this.stepExecution?.state || {}) };
      delete newState.resumeAt;
      this.workflowExecutionState.upsertStep({
        id: this.stepExecutionId,
        state: Object.keys(newState).length ? newState : undefined,
      });
      return false;
    }

    this.workflowExecutionState.upsertStep({
      id: this.stepExecutionId,
      stepId: this.node.stepId,
      stepType: this.node.stepType,
      scopeStack: this.workflowExecution.scopeStack,
      topologicalIndex: this.topologicalOrder.indexOf(this.node.id),
      startedAt: this.stepExecution?.startedAt || new Date().toISOString(),
      status: waitingStatus,
      state: this.buildWaitState(resumeDate),
    });
    return true;
  }

  /**
   * Builds the step state for entering a wait. When a resumeDate is provided (timer-based),
   * adds resumeAt to existing state. When omitted (indefinite), explicitly strips any residual
   * resumeAt so a prior timer sentinel cannot leak into an indefinite wait record.
   */
  private buildWaitState(resumeDate: Date | undefined): Record<string, unknown> | undefined {
    const existing = this.stepExecution?.state ?? {};
    if (resumeDate) {
      return { ...existing, resumeAt: resumeDate.toISOString() };
    }
    const { resumeAt: _stripped, ...rest } = existing;
    return Object.keys(rest).length ? rest : undefined;
  }

  /**
   * Unconditionally enters (or re-enters) a wait state until `resumeDate`,
   * merging `additionalState` into the persisted step state.
   *
   * Unlike {@link tryEnterWaitUntil}, this does NOT toggle: every call writes
   * `status: WAITING` and `resumeAt`. Use this for steps that re-enter the
   * wait loop on every iteration (e.g. durable poll steps), where the
   * "are we already waiting?" detection is owned by the caller (typically via
   * an engine-bookkeeping field stored alongside `additionalState`).
   *
   * @param resumeDate When the step should be woken via the resume task.
   * @param additionalState Fields to merge into the persisted step state. The
   *   engine writes `resumeAt` itself; callers do not need to pass it.
   * @param forceTaskSchedule When true, {@link handle_execution_delay} schedules a Task Manager
   *   resume even if the sleep is under its 5 s in-process threshold. Durable poll steps set this
   *   after the first continuation so sub-5 s poll intervals do not pin the worker.
   */
  public enterWaitUntil(
    resumeDate: Date,
    additionalState?: Record<string, unknown>,
    forceTaskSchedule?: boolean
  ): void {
    const existing = this.stepExecution?.state ?? {};
    const nextState: Record<string, unknown> = {
      ...existing,
      ...(additionalState ?? {}),
      resumeAt: resumeDate.toISOString(),
      forceTaskSchedule,
    };
    // `undefined` cannot round-trip through JSON persistence — a spread of
    // `{ __authorState: undefined }` would otherwise leave a stale key from
    // `existing`. Strip keys whose merged value is explicitly `undefined`.
    for (const key of Object.keys(nextState)) {
      if (nextState[key] === undefined) {
        delete nextState[key];
      }
    }
    this.workflowExecutionState.upsertStep({
      id: this.stepExecutionId,
      stepId: this.node.stepId,
      stepType: this.node.stepType,
      scopeStack: this.workflowExecution.scopeStack,
      topologicalIndex: this.topologicalOrder.indexOf(this.node.id),
      startedAt: this.stepExecution?.startedAt || new Date().toISOString(),
      status: ExecutionStatus.WAITING,
      state: nextState,
    });
  }

  /** Modifies workflow-level execution state. Use sparingly — prefer step output for step-scoped data. */
  public updateWorkflowExecution(update: Partial<EsWorkflowExecution>): void {
    this.workflowExecutionState.updateWorkflowExecution(update);
  }

  private logStepStart(stepId: string, stepExecutionId: string): void {
    this.stepLogger?.logInfo(`Step '${stepId}' started`, {
      workflow: { step_id: stepId, step_execution_id: stepExecutionId },
      event: { action: 'step-start', category: ['workflow', 'step'] },
      tags: ['workflow', 'step', 'start'],
      labels: {
        step_type: this.node.stepType,
        connector_type: this.node.stepType,
        step_name: this.node.stepId,
        step_id: stepId,
      },
    });
  }

  private logStepComplete(step: Partial<EsWorkflowStepExecution>): void {
    const isSuccess = step?.status === ExecutionStatus.COMPLETED;
    const stepId = this.node.stepId;
    this.stepLogger?.logInfo(`Step '${stepId}' ${isSuccess ? 'completed' : 'failed'}`, {
      workflow: { step_id: stepId, step_execution_id: step.id },
      event: {
        action: 'step-complete',
        category: ['workflow', 'step'],
        outcome: isSuccess ? 'success' : 'failure',
      },
      tags: ['workflow', 'step', 'complete'],
      labels: {
        step_type: this.node.stepType,
        connector_type: this.node.stepType,
        step_name: this.node.stepId,
        step_id: this.node.stepId,
        execution_time_ms: step.executionTimeMs,
      },
      ...(step.error && {
        error: step.error,
      }),
    });
  }

  private logStepFail(executionError: ExecutionError): void {
    const stepName = this.node.stepId;
    const stepType = this.node.stepType || 'unknown';

    const message = `Step '${stepName}' failed: ${executionError.message}`;

    const tags = ['workflow', 'step', 'fail'];
    if (executionError.type === 'StepSizeLimitExceeded') {
      tags.push('response-size-exceeded');
    }

    this.stepLogger?.logError(message, executionError, {
      workflow: { step_id: this.node.stepId, step_execution_id: this.stepExecutionId },
      event: { action: 'step-fail', category: ['workflow', 'step'] },
      tags,
      labels: {
        step_type: stepType,
        connector_type: stepType,
        step_name: stepName,
        step_id: this.node.stepId,
      },
    });
  }
}
