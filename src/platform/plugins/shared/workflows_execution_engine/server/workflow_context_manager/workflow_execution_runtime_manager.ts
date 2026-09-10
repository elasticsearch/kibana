/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import agent from 'elastic-apm-node';
import { AsyncLocalStorage } from 'node:async_hooks';
import { addTransactionLabels } from '@kbn/apm-utils';
import type { CoreStart } from '@kbn/core/server';
import type { EsWorkflowExecution, SerializedError, StackFrame } from '@kbn/workflows';
import {
  ExecutionStatus,
  isEventDrivenWorkflowTriggerSource,
  isTerminalStatus,
} from '@kbn/workflows';
import type { GraphNodeUnion, WorkflowGraph } from '@kbn/workflows/graph';
import { ExecutionError } from '@kbn/workflows/server';
import {
  getActiveOtelSpanId,
  getActiveOtelTraceId,
  getAlertingRuleId,
  getTraceId,
  setCurrentTransaction,
} from './apm_internal';
import { buildWorkflowContext } from './build_workflow_context';
import type { StepExecutionRuntimeFactory } from './step_execution_runtime_factory';
import type { StepIoService } from './step_io_service';
import type { ContextDependencies } from './types';
import type { WorkflowExecutionCursor } from './workflow_execution_cursor';
import type { WorkflowExecutionState } from './workflow_execution_state';
import type { ScopeData } from './workflow_scope_stack';
import { WorkflowScopeStack } from './workflow_scope_stack';
import type { WorkflowExecutionTelemetryClient } from '../lib/telemetry/workflow_execution_telemetry_client';
import type { IWorkflowEventLogger } from '../workflow_event_logger';
import type { BranchExecutor } from '../workflow_execution_loop/branch_executor';
import { canWriteExecution } from '../workflow_execution_loop/execution_fence';

interface WorkflowExecutionRuntimeManagerInit {
  workflowExecutionState: WorkflowExecutionState;
  stepIoService: StepIoService;
  workflowExecution: EsWorkflowExecution;
  workflowExecutionGraph: WorkflowGraph;
  workflowExecutionCursor: WorkflowExecutionCursor;
  workflowLogger: IWorkflowEventLogger;
  coreStart?: CoreStart;
  dependencies?: ContextDependencies;
  telemetryClient?: WorkflowExecutionTelemetryClient;
}

/**
 * Manages the runtime execution state of a workflow, including step execution, results, and transitions.
 *
 * The `WorkflowExecutionRuntimeManager` class is responsible for orchestrating the execution of workflow steps,
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

export class WorkflowExecutionRuntimeManager {
  public branchExecutor?: BranchExecutor;
  private workflowLogger: IWorkflowEventLogger | null = null;

  private workflowExecutionState: WorkflowExecutionState;
  private readonly rootExecutionCursor: WorkflowExecutionCursor;
  private readonly branchExecutionCursor = new AsyncLocalStorage<WorkflowExecutionCursor>();

  private stepIoService: StepIoService;
  private entryTransactionId?: string;
  private workflowTransaction?: agent.Transaction; // APM transaction instance
  private workflowGraph: WorkflowGraph;
  private coreStart?: CoreStart;
  private dependencies?: ContextDependencies;
  private telemetryClient?: WorkflowExecutionTelemetryClient;
  private telemetryReported: boolean = false;

  constructor(workflowExecutionRuntimeManagerInit: WorkflowExecutionRuntimeManagerInit) {
    this.workflowGraph = workflowExecutionRuntimeManagerInit.workflowExecutionGraph;
    this.rootExecutionCursor = workflowExecutionRuntimeManagerInit.workflowExecutionCursor;

    // Use workflow execution ID as traceId for APM compatibility
    this.workflowLogger = workflowExecutionRuntimeManagerInit.workflowLogger;
    this.workflowExecutionState = workflowExecutionRuntimeManagerInit.workflowExecutionState;
    this.stepIoService = workflowExecutionRuntimeManagerInit.stepIoService;
    this.coreStart = workflowExecutionRuntimeManagerInit.coreStart;
    this.dependencies = workflowExecutionRuntimeManagerInit.dependencies;
    this.telemetryClient = workflowExecutionRuntimeManagerInit.telemetryClient;
  }

  private get workflowExecutionCursor(): WorkflowExecutionCursor {
    return this.branchExecutionCursor.getStore() ?? this.rootExecutionCursor;
  }

  public withExecutionCursor<T>(cursor: WorkflowExecutionCursor, run: () => T): T {
    return this.branchExecutionCursor.run(cursor, run);
  }

  public get workflowExecution() {
    return this.workflowExecutionState.getWorkflowExecution();
  }

  /**
   * Get the APM trace ID for this workflow execution
   */
  public getTraceId(): string {
    return this.getWorkflowExecution().id;
  }

  /**
   * Get the entry transaction ID (main workflow transaction)
   */
  public getEntryTransactionId(): string | undefined {
    return this.entryTransactionId;
  }

  public getWorkflowExecutionStatus(): ExecutionStatus {
    return this.workflowExecutionState.getWorkflowExecution().status;
  }

  public getWorkflowExecution(): EsWorkflowExecution {
    return this.workflowExecutionState.getWorkflowExecution();
  }

  public getCurrentNode(): GraphNodeUnion | null {
    return this.workflowExecutionCursor.currentNode;
  }

  public navigateToNode(nodeId: string): void {
    this.workflowExecutionCursor.navigateToNode(nodeId);
  }

  public navigateToNextNode(): void {
    this.workflowExecutionCursor.navigateToNextNode();
  }

  public navigateToAfterNode(nodeId: string): void {
    this.workflowExecutionCursor.navigateToAfterNode(nodeId);
  }

  public getCurrentNodeScope(): StackFrame[] {
    return this.workflowExecutionCursor.currentStackFrames;
  }

  /**
   * Replaces the global scope stack outright. Unlike {@link enterScope} /
   * {@link exitScope}, this is not guarded by the current node type. It exists
   * for control-flow nodes (e.g. the parallel fan-out node) that drive nested
   * branch steps in-process and must temporarily install — then restore — a
   * branch's scope so per-branch context (e.g. {{ foreach.item }}) resolves.
   */
  public setScopeStack(scopeStack: StackFrame[]): void {
    if (!canWriteExecution()) return;
    this.workflowExecutionState.updateWorkflowExecution({ scopeStack: [...scopeStack] });
  }

  /**
   * Enters a new scope in the workflow execution context.
   *
   * This method creates a new scope frame and pushes it onto the scope stack, establishing
   * a new execution context for nested workflow operations. Scopes are used to track
   * hierarchical execution contexts such as loops, conditionals, or sub-workflows.
   *
   * @param subScopeId - Optional identifier for the sub-scope being entered
   *
   * @remarks
   * This method includes a guard condition that prevents scope entry if the current node
   * is not an appropriate "enter" node. The scope update will be silently ignored if:
   * - The current node type does not start with 'enter' (e.g., 'enter-foreach', 'enter-if', etc)
   *
   * This guard ensures that scopes are only created at the correct workflow execution points,
   * maintaining the integrity of the execution context hierarchy.
   */
  public enterScope(subScopeId?: string): void {
    this.workflowExecutionCursor.setCurrentScopeId(subScopeId);
  }

  public setWorkflowOutputs(outputs: Record<string, unknown>): void {
    if (!canWriteExecution()) return;
    this.workflowExecutionState.updateWorkflowExecution({
      context: {
        ...(this.workflowExecution.context || {}),
        output: outputs,
      },
    });
  }

  public setWorkflowStatus(status: ExecutionStatus): void {
    if (!canWriteExecution()) return;
    this.workflowExecutionState.updateWorkflowExecution({ status });

    if (isTerminalStatus(status)) {
      this.workflowExecutionCursor.stop();
    }
  }

  /**
   * Sets workflow status to CANCELLED with a reason (and cancelledAt, cancelledBy).
   * Use when workflow.output has status: 'cancelled' or when cancelling with a specific message.
   */
  public setWorkflowCancelled(reason: string): void {
    if (!canWriteExecution()) return;
    const cancelledAt = new Date().toISOString();
    this.workflowExecutionState.updateWorkflowExecution({
      status: ExecutionStatus.CANCELLED,
      cancellationReason: reason,
      cancelledAt,
      cancelledBy: 'workflow',
    });
    this.workflowExecutionCursor.stop();
  }

  /**
   * Finishes ancestor enter-node step executions by walking a local copy of the scope
   * stack. Does **not** mutate the execution cursor stack; scope position is reconciled
   * by navigation and {@link WorkflowExecutionCursor.commitPendingNavigation}.
   *
   * The local {@link WorkflowScopeStack.exitScope} calls exist only to compute the
   * correct `stackFrames` when creating each ancestor's `StepExecutionRuntime`.
   *
   * @param inclusive — when true the scope that matches {@link shouldStop} is also
   *   popped and finished. Defaults to false (stop *before* the matching scope).
   *
   * Used by:
   * - loop.break — stop at and *include* the enclosing loop enter node (inclusive)
   * - loop.continue — stop *before* the enclosing loop enter node (exclusive)
   */
  public unwindScopes(
    stepExecutionRuntimeFactory: StepExecutionRuntimeFactory,
    shouldStop?: (scope: ScopeData) => boolean,
    { inclusive = false }: { inclusive?: boolean } = {}
  ): void {
    let scopeStack = WorkflowScopeStack.fromStackFrames(
      this.workflowExecutionCursor.currentStackFrames
    );

    while (!scopeStack.isEmpty()) {
      const currentScope = scopeStack.getCurrentScope();
      const matched = shouldStop?.(currentScope) ?? false;
      if (matched && !inclusive) {
        break;
      }

      scopeStack = scopeStack.exitScope();

      const scopeStepRuntime = stepExecutionRuntimeFactory.createStepExecutionRuntime({
        nodeId: currentScope.nodeId,
        stackFrames: scopeStack.stackFrames,
      });
      if (scopeStepRuntime.stepExecutionExists()) {
        scopeStepRuntime.finishStep();
      }

      if (matched && inclusive) {
        break;
      }
    }
  }

  /**
   * @deprecated Temporary bridge for node implementations. Prefer reading
   * `workflowExecutionCursor.error` directly once nodes receive cursor access.
   */
  public getWorkflowErrorSerialized(): SerializedError | undefined {
    return this.workflowExecutionCursor.error
      ? ExecutionError.fromError(this.workflowExecutionCursor.error).toSerializableObject()
      : undefined;
  }

  /**
   * @deprecated Temporary bridge for node implementations. Prefer writing
   * `workflowExecutionCursor.error` directly once nodes receive cursor access.
   */
  public setWorkflowError(error: Error | undefined): void {
    if (error) {
      this.workflowExecutionCursor.captureError(error);
    } else {
      this.workflowExecutionCursor.clearError();
    }
  }

  public markWorkflowTimeouted(): void {
    if (!canWriteExecution()) return;
    const finishedAt = new Date().toISOString();
    this.workflowExecutionState.updateWorkflowExecution({
      status: ExecutionStatus.TIMED_OUT,
      finishedAt,
      duration:
        new Date(finishedAt).getTime() - new Date(this.workflowExecution.startedAt).getTime(),
    });
    this.workflowExecutionCursor.stop();
  }

  public async start(): Promise<void> {
    this.workflowLogger?.logInfo('Starting workflow execution with APM tracing', {
      workflow: { execution_id: this.workflowExecution.id },
    });

    const existingTransaction = agent.currentTransaction;

    if (existingTransaction) {
      // Check if this is triggered by alerting (has alerting labels) or task manager directly
      const alertingRuleId = getAlertingRuleId(existingTransaction);
      const isTriggeredByAlerting = alertingRuleId !== undefined;

      this.workflowLogger?.logDebug('Found existing transaction context', {
        transaction: {
          name: existingTransaction.name,
          type: existingTransaction.type,
          is_triggered_by_alerting: isTriggeredByAlerting,
          alerting_rule_id: alertingRuleId,
          transaction_id: existingTransaction.ids?.['transaction.id'],
        },
      });

      if (isTriggeredByAlerting) {
        // For alerting-triggered workflows, create a dedicated workflow transaction
        // This provides a focused view for the embeddable instead of the entire alerting trace
        this.workflowLogger?.logInfo(
          'Creating dedicated workflow transaction within alerting trace'
        );

        const workflowTransaction = agent.startTransaction(
          `workflow.execution.${this.workflowExecution.workflowId}`,
          'workflow_execution'
        );

        this.workflowTransaction = workflowTransaction;

        setCurrentTransaction(agent, workflowTransaction);

        addTransactionLabels({
          workflow_execution_id: this.workflowExecution.id,
          workflow_id: this.workflowExecution.workflowId,
          service_name: 'kibana',
          transaction_hierarchy: 'alerting->workflow->steps',
          triggered_by: 'alerting',
          parent_alerting_rule_id: alertingRuleId,
        });

        // Store the workflow transaction ID (not the alerting transaction ID)
        const workflowTransactionId = workflowTransaction.ids?.['transaction.id'];
        if (workflowTransactionId) {
          this.workflowLogger?.logDebug('Storing workflow transaction ID', {
            transaction: { workflow_transaction_id: workflowTransactionId },
          });

          this.workflowExecutionState.updateWorkflowExecution({
            entryTransactionId: workflowTransactionId,
          });

          this.workflowLogger?.logDebug('Workflow transaction ID stored in workflow execution');
        }

        // Capture trace ID from the workflow transaction, falling back to the
        // active OTEL span context under EDOT-only instrumentation.
        const realTraceId = getTraceId(workflowTransaction) ?? getActiveOtelTraceId();

        if (realTraceId) {
          this.workflowLogger?.logDebug('Captured APM trace ID from workflow transaction', {
            trace: { trace_id: realTraceId },
          });
          this.workflowExecutionState.updateWorkflowExecution({
            traceId: realTraceId,
          });
        }
      } else {
        // For task manager triggered workflows, reuse the existing transaction
        this.workflowLogger?.logInfo('Reusing task manager transaction for workflow execution');

        this.workflowTransaction = existingTransaction;

        const taskManagerLabels: Record<string, string | number | boolean> = {
          workflow_execution_id: this.workflowExecution.id,
          workflow_id: this.workflowExecution.workflowId,
          service_name: 'kibana',
          transaction_hierarchy: 'task->steps',
          triggered_by: 'task_manager',
        };

        const { triggeredBy } = this.workflowExecution;
        if (triggeredBy && isEventDrivenWorkflowTriggerSource(this.workflowExecution)) {
          taskManagerLabels.event_trigger_id = triggeredBy;
        }

        addTransactionLabels(taskManagerLabels);

        // Store the task transaction ID in the workflow execution
        const taskTransactionId = existingTransaction.ids?.['transaction.id'];
        if (taskTransactionId) {
          this.workflowLogger?.logDebug('Storing task transaction ID', {
            transaction: { task_transaction_id: taskTransactionId },
          });

          this.workflowExecutionState.updateWorkflowExecution({
            entryTransactionId: taskTransactionId,
          });

          this.workflowLogger?.logDebug('Task transaction ID stored in workflow execution');
        }

        // Capture trace ID from the task transaction, falling back to the
        // active OTEL span context under EDOT-only instrumentation.
        const realTraceId = getTraceId(existingTransaction) ?? getActiveOtelTraceId();

        if (realTraceId) {
          this.workflowLogger?.logDebug('Captured APM trace ID from task transaction', {
            trace: { trace_id: realTraceId },
          });
          this.workflowExecutionState.updateWorkflowExecution({
            traceId: realTraceId,
          });
        }
      }

      // Set the transaction outcome to success by default
      // It will be overridden if the workflow fails
      existingTransaction.outcome = 'success';
    } else {
      // No APM transaction. Under EDOT-only instrumentation this is the normal path rather
      // than an error: spans are exported by OTEL, there is just no APM agent to read them
      // from. Read the trace id from the active OTEL span context so the execution stays
      // linkable to its own trace.
      const otelTraceId = getActiveOtelTraceId();

      if (otelTraceId) {
        this.workflowLogger?.logDebug('Captured OTEL trace ID (no APM transaction)', {
          trace: { trace_id: otelTraceId },
        });
        this.workflowExecutionState.updateWorkflowExecution({
          traceId: otelTraceId,
          entryTransactionId: getActiveOtelSpanId(),
        });

        // Mirror the APM branches: addTransactionLabels also writes to the
        // active OTEL span, keeping trace -> execution lookup searchable.
        // Under EDOT-only instrumentation there is no APM transaction, so
        // alert-triggered executions land here too; attribute them via the
        // execution's `triggeredBy` instead of mislabeling them as task manager.
        const { triggeredBy } = this.workflowExecution;
        const isTriggeredByAlerting = triggeredBy === 'alert';

        const otelLabels: Record<string, string | number | boolean> = {
          workflow_execution_id: this.workflowExecution.id,
          workflow_id: this.workflowExecution.workflowId,
          service_name: 'kibana',
          transaction_hierarchy: isTriggeredByAlerting
            ? 'alerting->workflow->steps'
            : 'task->steps',
          triggered_by: isTriggeredByAlerting ? 'alerting' : 'task_manager',
        };

        if (triggeredBy && isEventDrivenWorkflowTriggerSource(this.workflowExecution)) {
          otelLabels.event_trigger_id = triggeredBy;
        }

        addTransactionLabels(otelLabels);
      } else {
        this.workflowLogger?.logWarn(
          'No active Task Manager transaction or OTEL span found, proceeding without tracing'
        );
      }
    }

    const updatedWorkflowExecution: Partial<EsWorkflowExecution> = {
      currentNodeId: this.workflowExecutionCursor.currentNode?.id,
      scopeStack: [],
      status: ExecutionStatus.RUNNING,
      startedAt: new Date().toISOString(),
    };
    this.workflowExecutionState.updateWorkflowExecution(updatedWorkflowExecution);
    this.logWorkflowStart();
    await this.stepIoService.flush();
  }

  public async resume(): Promise<void> {
    if (!this.workflowExecution.currentNodeId) {
      throw new Error(
        'Execution can`t be resummed because current node ID is not set in execution state'
      );
    }
    await this.stepIoService.load();
    this.stepIoService.evictCompletedLoopsOnResume(this.workflowGraph);
    this.workflowExecutionCursor.navigateToNode(this.workflowExecution.currentNodeId);
    this.workflowExecutionCursor.commitPendingNavigation();
    const updatedWorkflowExecution: Partial<EsWorkflowExecution> = {
      status: ExecutionStatus.RUNNING,
    };
    this.workflowExecutionState.updateWorkflowExecution(updatedWorkflowExecution);
  }

  public async saveState(): Promise<void> {
    const workflowExecution = this.workflowExecutionState.getWorkflowExecution();
    const workflowExecutionUpdate: Partial<EsWorkflowExecution> = {
      currentNodeId: this.workflowExecutionCursor.currentNode?.id,
      scopeStack: this.workflowExecutionCursor.currentStackFrames,
    };

    if (isTerminalStatus(workflowExecution.status)) {
      // Preserve a terminal status already written by cancel/timeout paths.
      // A stale cursor error must not downgrade CANCELLED → FAILED.
      workflowExecutionUpdate.status = workflowExecution.status;
      // When the status is FAILED (e.g. set by workflow.fail via setWorkflowStatus),
      // the cursor error was captured separately and must also be persisted.
      if (
        workflowExecution.status === ExecutionStatus.FAILED &&
        this.workflowExecutionCursor.error
      ) {
        workflowExecutionUpdate.error = ExecutionError.fromError(
          this.workflowExecutionCursor.error
        ).toSerializableObject();
      }
    } else if (this.workflowExecutionCursor.error) {
      workflowExecutionUpdate.status = ExecutionStatus.FAILED;
      workflowExecutionUpdate.error = ExecutionError.fromError(
        this.workflowExecutionCursor.error
      ).toSerializableObject();
    } else if (!this.workflowExecutionCursor.currentNode) {
      // Parked waits must stay WAITING*; COMPLETED here races TM resume.
      const isParkedWait =
        workflowExecution.status === ExecutionStatus.WAITING ||
        workflowExecution.status === ExecutionStatus.WAITING_FOR_INPUT ||
        workflowExecution.status === ExecutionStatus.WAITING_FOR_CHILD;
      if (!isParkedWait) {
        workflowExecutionUpdate.status = ExecutionStatus.COMPLETED;
      }
    }

    if (
      (workflowExecutionUpdate.status && isTerminalStatus(workflowExecutionUpdate.status)) ||
      isTerminalStatus(workflowExecution.status)
    ) {
      const startedAt = new Date(workflowExecution.startedAt);
      const finishDate = new Date();
      workflowExecutionUpdate.finishedAt = finishDate.toISOString();
      workflowExecutionUpdate.duration = finishDate.getTime() - startedAt.getTime();
      workflowExecutionUpdate.context = buildWorkflowContext(
        this.workflowExecution,
        this.coreStart,
        this.dependencies
      );
      this.logWorkflowComplete(workflowExecutionUpdate.status === ExecutionStatus.COMPLETED);

      // Update the workflow transaction outcome when workflow completes
      if (this.workflowTransaction) {
        const isSuccess = workflowExecutionUpdate.status === ExecutionStatus.COMPLETED;
        this.workflowTransaction.outcome = isSuccess ? 'success' : 'failure';

        // For alerting-triggered workflows, we created a dedicated transaction and need to end it
        const isTriggeredByAlerting = this.workflowTransaction.type === 'workflow_execution';
        if (isTriggeredByAlerting) {
          this.workflowTransaction.end();
          this.workflowLogger?.logDebug('Workflow transaction ended (alerting-triggered)', {
            transaction: { outcome: this.workflowTransaction.outcome },
          });
        } else {
          // For task manager triggered workflows, Task Manager will handle ending
          this.workflowLogger?.logDebug(
            'Task transaction outcome updated (task manager will end)',
            {
              transaction: { outcome: this.workflowTransaction.outcome },
            }
          );
        }
      }

      // Report telemetry for terminal status (only once)
      this.reportTelemetryIfTerminal(workflowExecution, workflowExecutionUpdate);
    }

    this.workflowExecutionState.updateWorkflowExecution(workflowExecutionUpdate);
  }

  private logWorkflowStart(): void {
    this.workflowLogger?.logInfo('Workflow execution started', {
      event: { action: 'workflow-start', category: ['workflow'] },
      tags: ['workflow', 'execution', 'start'],
    });
  }

  private logWorkflowComplete(success: boolean): void {
    this.workflowLogger?.logInfo(
      `Workflow execution ${success ? 'completed successfully' : 'failed'}`,
      {
        event: {
          action: 'workflow-complete',
          category: ['workflow'],
          outcome: success ? 'success' : 'failure',
        },
        tags: ['workflow', 'execution', 'complete'],
      }
    );
  }

  /**
   * Reports telemetry for workflow execution when it reaches a terminal status.
   * Only reports once per execution to avoid duplicate events.
   */
  private reportTelemetryIfTerminal(
    workflowExecution: EsWorkflowExecution,
    workflowExecutionUpdate: Partial<EsWorkflowExecution>
  ): void {
    const finalStatus = workflowExecutionUpdate.status || workflowExecution.status;
    if (!this.telemetryClient || this.telemetryReported || !isTerminalStatus(finalStatus)) {
      return;
    }

    this.telemetryReported = true;
    const stepExecutions = this.workflowExecutionState.getAllStepExecutions();
    const finalWorkflowExecution = {
      ...workflowExecution,
      ...workflowExecutionUpdate,
      status: finalStatus,
    } as EsWorkflowExecution;

    const outputSizeStats = this.stepIoService.getOutputSizeStats();
    this.telemetryClient.reportWorkflowExecutionTerminated({
      workflowExecution: finalWorkflowExecution,
      stepExecutions,
      finalStatus,
      outputSizeStats,
    });
  }
}
