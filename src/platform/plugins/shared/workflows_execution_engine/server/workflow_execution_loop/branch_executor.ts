/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsWorkflowExecution, EsWorkflowStepExecution, StackFrame } from '@kbn/workflows';
import {
  DEFAULT_PARALLEL_MAX_CONCURRENCY,
  DEFAULT_PARALLEL_MAX_FAN_OUT,
  ExecutionStatus,
  isTerminalStatus,
} from '@kbn/workflows';
import { completeTerminationPath, getTerminationPath } from './complete_termination_path';
import { ExecutionBudget } from './execution_budget';
import { outsideExecutionFence } from './execution_fence';
import { runNode } from './run_node';
import { timeoutBranchScopes } from './timeout_branch_scopes';
import type { WorkflowExecutionLoopParams } from './types';
import type { ParallelBranchState } from '../step/parallel_step/types';
import type { StepExecutionRuntime } from '../workflow_context_manager/step_execution_runtime';
import { WorkflowExecutionCursor } from '../workflow_context_manager/workflow_execution_cursor';
import { WorkflowScopeStack } from '../workflow_context_manager/workflow_scope_stack';

export interface BranchExecutionRequest {
  branch: ParallelBranchState;
  branchId: string;
  boundaryNodeId: string;
  exitNodeId: string;
  startNodeId: string;
  stackFrames: StackFrame[];
  navigationOrder: readonly string[];
  parentSignal: AbortSignal;
  deadline?: number;
  onProgress: () => void;
}

type Checkpoint = NonNullable<EsWorkflowStepExecution['executionCheckpoint']>;

// These markers only change navigation/scope; replaying one has no step-state or external effect.
const NAVIGATION_ONLY_NODES = new Set([
  'enter-normal-path',
  'exit-normal-path',
  'enter-fallback-path',
  'exit-fallback-path',
  'enter-then-branch',
  'enter-else-branch',
  'exit-then-branch',
  'exit-else-branch',
  'enter-case-branch',
  'enter-default-branch',
  'exit-case-branch',
  'exit-default-branch',
  'exit-parallel',
]);

/** Runs branch cursors through the common node lifecycle and checkpoints each transition. */
export class BranchExecutor {
  private readonly budget: ExecutionBudget;
  private readonly active = new Map<
    string,
    { runtime: StepExecutionRuntime; done: Promise<void> }
  >();

  private terminationCommit?: Promise<void>;

  public async requestTermination(
    runtime: StepExecutionRuntime,
    output: Record<string, unknown>,
    status: ExecutionStatus,
    error?: Error
  ): Promise<void> {
    if (this.terminationCommit) return this.terminationCommit;
    if (this.params.workflowRuntime.getWorkflowExecution().pendingTermination) return;
    const decision = {
      nodeId: runtime.node.id,
      stackFrames: runtime.scopeStack.stackFrames,
      stepExecutionId: runtime.stepExecutionId,
      status,
      output,
      ...(runtime.stepExecution?.status === ExecutionStatus.FAILED && error
        ? { stepError: { type: error.name, message: error.message } }
        : {}),
      ...(error ? { error: { type: error.name, message: error.message } } : {}),
    };
    this.terminationCommit = this.commitTermination(decision);
    return this.terminationCommit;
  }

  private async commitTermination(
    decision: NonNullable<EsWorkflowExecution['pendingTermination']>
  ): Promise<void> {
    try {
      await this.params.workflowExecutionState.persistTermination(decision);
      outsideExecutionFence(() => {
        completeTerminationPath(this.params, decision);
        this.params.executionFailure?.stopForTermination();
      });
    } catch (cause) {
      throw (
        this.params.executionFailure?.fail(
          'Failed to persist workflow termination',
          cause instanceof Error ? cause : new Error(String(cause))
        ) ?? cause
      );
    }
  }

  public get executionFailure() {
    return this.params.executionFailure;
  }

  public abortActive(): void {
    for (const { runtime } of this.active.values()) runtime.abortController.abort();
  }

  public isTerminationPath(runtime: StepExecutionRuntime): boolean {
    const decision = this.params.workflowRuntime.getWorkflowExecution().pendingTermination;
    return Boolean(
      decision &&
        getTerminationPath(this.params, decision).some(
          (ancestor) => ancestor.stepExecutionId === runtime.stepExecutionId
        )
    );
  }

  public cancelBranchRuntime(runtime: StepExecutionRuntime): void {
    if (runtime.stepExecution && isTerminalStatus(runtime.stepExecution.status)) return;
    const workflow = this.params.workflowRuntime.getWorkflowExecution();
    if (
      !workflow.pendingTermination &&
      !workflow.cancelRequested &&
      workflow.status !== ExecutionStatus.CANCELLED
    ) {
      runtime.timeoutStep(new Error('Parallel branch was terminated by a timeout.'));
      return;
    }
    this.params.workflowExecutionState.upsertStep({
      id: runtime.stepExecutionId,
      status: ExecutionStatus.CANCELLED,
      finishedAt: new Date().toISOString(),
    });
    this.params.workflowLogger
      .createStepLogger(runtime.stepExecutionId, runtime.node.stepId)
      .logInfo('Step cancelled', { event: { action: 'step-cancelled', outcome: 'unknown' } });
  }

  public async cancelActiveBranch(branchId: string): Promise<boolean> {
    const active = this.active.get(branchId);
    if (!active) return false;
    active.runtime.abortController.abort();
    outsideExecutionFence(() => this.cancelBranchRuntime(active.runtime));
    await active.done;
    return true;
  }

  constructor(
    private readonly params: WorkflowExecutionLoopParams,
    limit = params.parallelLimits?.maxConcurrentOperations ?? DEFAULT_PARALLEL_MAX_CONCURRENCY
  ) {
    this.budget = new ExecutionBudget(limit);
  }

  public assertFanOutCapacity(additional: number): void {
    let outstanding = additional;
    for (const step of this.params.workflowExecutionState.getAllStepExecutions()) {
      if (step.stepType === 'parallel' && Array.isArray(step.state?.branches)) {
        for (const branch of step.state.branches) {
          if (branch.status === 'running' || branch.status === 'pending') outstanding++;
        }
      }
    }
    const maxOutstanding =
      this.params.parallelLimits?.maxOutstandingBranches ?? DEFAULT_PARALLEL_MAX_FAN_OUT;
    if (outstanding > maxOutstanding) {
      throw new Error(`Workflow parallel fan-out exceeds ${maxOutstanding} outstanding branches.`);
    }
  }

  public async advance(request: BranchExecutionRequest): Promise<void> {
    const { branch, parentSignal } = request;
    const cursor = new WorkflowExecutionCursor({
      workflowExecutionGraph: this.params.workflowExecutionGraph,
      navigationOrder: request.navigationOrder,
      nodeId: branch.currentNodeId ?? request.startNodeId,
      stackFrames: branch.stackFrames ?? request.stackFrames,
    });
    try {
      this.params.executionFailure?.throwIfFailed();
      await this.params.workflowRuntime.withExecutionCursor(cursor, async () => {
        const limit = this.params.parallelLimits?.maxTransitionsPerTick ?? 1000;
        for (let transitions = 0; transitions < limit; transitions++) {
          this.params.executionFailure?.throwIfFailed();
          if (parentSignal.aborted) return;
          const checkpoint = await this.advanceNode(request, cursor);
          if (!checkpoint || parentSignal.aborted) return;
          await this.commitProgress(request, checkpoint);
          if (branch.status !== 'running' || branch.waiting || checkpoint.yielded) return;
          cursor.restorePosition(checkpoint.currentNodeId, checkpoint.stackFrames);
        }
        Object.assign(branch, { waiting: false });
        request.onProgress();
      });
    } catch (error) {
      throw (
        this.params.executionFailure?.fail(
          'Parallel checkpoint or cursor transition failed',
          error instanceof Error ? error : new Error(String(error))
        ) ?? error
      );
    }
  }

  private async advanceNode(
    request: BranchExecutionRequest,
    cursor: WorkflowExecutionCursor
  ): Promise<Checkpoint | undefined> {
    const node = cursor.currentNode;
    if (!node || node.id === request.exitNodeId) throw new Error('Branch cursor escaped its body');
    const stackFrames = cursor.currentStackFrames;
    const runtime = this.params.stepExecutionRuntimeFactory.createStepExecutionRuntime({
      nodeId: node.id,
      stackFrames,
    });
    const sequence = request.branch.sequence ?? 0;
    if (NAVIGATION_ONLY_NODES.has(node.type)) {
      cursor.clearPendingNavigation();
      await this.invokeNode(request, cursor, runtime);
      if (request.parentSignal.aborted) return;
      return this.buildCheckpoint(request, runtime, cursor, node.id, stackFrames, sequence);
    }
    const recovered = runtime.stepExecution?.executionCheckpoint;
    if (
      recovered?.branchId === request.branchId &&
      recovered.sequence === sequence &&
      recovered.nodeId === node.id
    ) {
      for (const update of recovered.scopeUpdates ?? [])
        this.params.workflowExecutionState.upsertStep(update);
      await this.params.stepIoService.flushStepChanges();
      return recovered;
    }
    // Persist discoverability before starting an external operation.
    this.params.workflowExecutionState.upsertStep({
      id: runtime.stepExecutionId,
      stepId: node.stepId,
      stepType: node.stepType,
      scopeStack: runtime.scopeStack.stackFrames,
      ...(!runtime.stepExecution
        ? {
            status: ExecutionStatus.RUNNING,
            startedAt: new Date().toISOString(),
            topologicalIndex: this.params.workflowExecutionGraph.topologicalOrder.indexOf(node.id),
          }
        : {}),
    });
    await this.params.stepIoService.flushStepChanges();
    await this.params.workflowExecutionState.flushWorkflowDoc();
    const scopeIds = this.getScopeIds(stackFrames, request.boundaryNodeId);
    const releaseNodeWrites = this.params.stepIoService.holdStepWrites(
      node.type === 'enter-parallel' ? [] : [runtime.stepExecutionId]
    );
    const releaseScopeWrites = this.params.stepIoService.holdStepWrites(
      scopeIds.filter((id) => id !== runtime.stepExecutionId)
    );
    try {
      cursor.clearPendingNavigation();
      Object.assign(request.branch, { currentNodeId: node.id, stackFrames });
      request.onProgress();
      await this.invokeNode(request, cursor, runtime);
      if (request.parentSignal.aborted) return;
      const checkpoint = this.buildCheckpoint(
        request,
        runtime,
        cursor,
        node.id,
        stackFrames,
        sequence
      );
      checkpoint.scopeUpdates = this.snapshotScopes(scopeIds);
      this.params.workflowExecutionState.upsertStep({
        id: runtime.stepExecutionId,
        executionCheckpoint: checkpoint,
      });
      // Commit the result and transition together before publishing any scope updates.
      releaseNodeWrites();
      await this.params.stepIoService.flushStepChanges();
      releaseScopeWrites();
      await this.params.stepIoService.flushStepChanges();
      return checkpoint;
    } finally {
      releaseNodeWrites();
      releaseScopeWrites();
    }
  }

  private async invokeNode(
    request: BranchExecutionRequest,
    cursor: WorkflowExecutionCursor,
    runtime: StepExecutionRuntime
  ): Promise<void> {
    let finishInvocation: () => void = () => {};
    const done = new Promise<void>((resolve) => {
      finishInvocation = resolve;
    });
    this.active.set(request.branchId, { runtime, done });
    try {
      await runNode(
        { ...this.params, workflowExecutionCursor: cursor, boundaryNodeId: request.boundaryNodeId },
        {
          runtime,
          parentSignal: request.parentSignal,
          deadline: request.deadline,
          budget: this.budget,
        }
      );
    } finally {
      finishInvocation();
      this.active.delete(request.branchId);
    }
  }

  private snapshotScopes(scopeIds: string[]): Checkpoint['scopeUpdates'] {
    return scopeIds.flatMap((id) => {
      const step = this.params.workflowExecutionState.getStepExecution(id);
      if (!step) return [];
      return [
        structuredClone({
          id,
          status: step.status,
          state: step.state,
          error: step.error,
          finishedAt: step.finishedAt,
        }),
      ];
    });
  }

  private getScopeIds(stackFrames: StackFrame[], boundaryNodeId: string): string[] {
    const ids: string[] = [];
    let scope = WorkflowScopeStack.fromStackFrames(stackFrames);
    while (!scope.isEmpty()) {
      const current = scope.getCurrentScope();
      if (current.nodeId === boundaryNodeId) break;
      scope = scope.exitScope();
      const runtime = this.params.stepExecutionRuntimeFactory.createStepExecutionRuntime({
        nodeId: current.nodeId,
        stackFrames: scope.stackFrames,
      });
      ids.push(runtime.stepExecutionId);
    }
    return [...new Set(ids)];
  }

  private buildCheckpoint(
    request: BranchExecutionRequest,
    runtime: StepExecutionRuntime,
    cursor: WorkflowExecutionCursor,
    nodeId: string,
    stackFrames: StackFrame[],
    sequence: number
  ): Checkpoint {
    const base = {
      branchId: request.branchId,
      sequence,
      nodeId,
      currentNodeId: nodeId,
      stackFrames,
      waiting: false,
    };
    if (this.isTerminationPath(runtime)) return { ...base, status: 'completed' };
    if (runtime.abortController.signal.aborted) {
      outsideExecutionFence(() =>
        runtime.timeoutStep(new Error('Parallel branch was terminated by a timeout.'))
      );
      outsideExecutionFence(() =>
        timeoutBranchScopes(
          this.params.stepExecutionRuntimeFactory,
          stackFrames,
          request.boundaryNodeId,
          new Error('Parallel branch was terminated by a timeout.')
        )
      );
      return { ...base, status: 'timed_out' };
    }
    if (cursor.error) return { ...base, status: 'failed' };
    const execution = runtime.stepExecution;
    if (runtime.node.type === 'enter-parallel' && execution?.state?.parallelYield === true) {
      return { ...base, status: 'running', yielded: true, stackFrames: cursor.currentStackFrames };
    }

    const waiting =
      (execution?.status === ExecutionStatus.WAITING && Boolean(execution.state?.resumeAt)) ||
      execution?.status === ExecutionStatus.WAITING_FOR_CHILD ||
      execution?.status === ExecutionStatus.WAITING_FOR_INPUT;
    if (waiting)
      return { ...base, status: 'running', waiting: true, stackFrames: cursor.currentStackFrames };
    if (cursor.nextNode?.id === request.exitNodeId) return { ...base, status: 'completed' };
    if (!cursor.nextNode)
      throw new Error(`Node ${nodeId} returned without navigation or a durable wait`);
    cursor.commitPendingNavigation();
    return {
      ...base,
      status: 'running',
      currentNodeId: cursor.currentNode?.id ?? nodeId,
      stackFrames: cursor.currentStackFrames,
    };
  }

  private async commitProgress(
    request: BranchExecutionRequest,
    checkpoint: Checkpoint
  ): Promise<void> {
    if (request.parentSignal.aborted) return;
    Object.assign(request.branch, {
      status: checkpoint.status,
      currentNodeId: checkpoint.currentNodeId,
      stackFrames: checkpoint.stackFrames,
      sequence: checkpoint.sequence + 1,
      waiting: checkpoint.waiting,
      ...(checkpoint.status === 'timed_out' ? { timedOut: true } : {}),
      ...(checkpoint.status !== 'running' ? { finishedAt: Date.now() } : {}),
    });
    request.onProgress();
    await this.params.stepIoService.flushStepChanges();
  }
}
