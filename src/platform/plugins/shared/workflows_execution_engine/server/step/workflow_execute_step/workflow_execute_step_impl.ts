/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from '@kbn/core/server';
import type {
  EsWorkflow,
  WorkflowExecuteAsyncStep,
  WorkflowExecuteStep,
  WorkflowRepository,
} from '@kbn/workflows';
import type { WorkflowExecuteAsyncGraphNode, WorkflowExecuteGraphNode } from '@kbn/workflows/graph';
import { WorkflowExecuteAsyncStrategy } from './strategies/workflow_execute_async_strategy';
import { WorkflowExecuteSyncStrategy } from './strategies/workflow_execute_sync_strategy';
import type { StrategyResult } from './types';
import type { WorkflowsExecutionEngineConfig } from '../../config';
import type { StepExecutionRepository } from '../../repositories/step_execution_repository';
import type { WorkflowExecutionRepository } from '../../repositories/workflow_execution_repository';
import type { WorkflowsExecutionEnginePluginStart } from '../../types';
import type { StepExecutionRuntime } from '../../workflow_context_manager/step_execution_runtime';
import type { WorkflowExecutionRuntimeManager } from '../../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../../workflow_event_logger';
import type { CancellableNode, NodeImplementation } from '../node_implementation';

export interface WorkflowExecuteStepImplInit {
  node: WorkflowExecuteGraphNode | WorkflowExecuteAsyncGraphNode;
  stepExecutionRuntime: StepExecutionRuntime;
  workflowExecutionRuntime: WorkflowExecutionRuntimeManager;
  workflowRepository: WorkflowRepository;
  spaceId: string;
  request: KibanaRequest;
  workflowsExecutionEngine: WorkflowsExecutionEnginePluginStart;
  workflowExecutionRepository: WorkflowExecutionRepository;
  stepExecutionRepository: StepExecutionRepository;
  workflowLogger: IWorkflowEventLogger;
  config: WorkflowsExecutionEngineConfig;
}

export class WorkflowExecuteStepImpl implements NodeImplementation, CancellableNode {
  private syncExecutor: WorkflowExecuteSyncStrategy;
  private asyncExecutor: WorkflowExecuteAsyncStrategy;

  constructor(private readonly init: WorkflowExecuteStepImplInit) {
    const {
      node: _node,
      stepExecutionRuntime,
      workflowsExecutionEngine,
      workflowExecutionRepository,
      stepExecutionRepository,
      workflowLogger,
    } = init;
    this.syncExecutor = new WorkflowExecuteSyncStrategy(
      workflowsExecutionEngine,
      workflowExecutionRepository,
      stepExecutionRepository,
      stepExecutionRuntime,
      workflowLogger
    );
    this.asyncExecutor = new WorkflowExecuteAsyncStrategy(
      workflowsExecutionEngine,
      workflowExecutionRepository,
      stepExecutionRuntime,
      workflowLogger
    );
  }

  private getInput(): { workflowId: string; inputs: Record<string, unknown> } {
    const step = this.init.node.configuration as WorkflowExecuteStep | WorkflowExecuteAsyncStep;
    const renderedWith =
      this.init.stepExecutionRuntime.contextManager.renderValueAccordingToContext(
        step.with || {}
      ) as Record<string, unknown>;
    const { 'workflow-id': workflowId, inputs = {} } = renderedWith;
    const mappedInputs =
      typeof inputs === 'object' && inputs !== null ? (inputs as Record<string, unknown>) : {};
    return { workflowId: String(workflowId ?? ''), inputs: mappedInputs };
  }

  private assertValidWorkflowId(workflowId: string): void {
    if (workflowId.trim().length > 0) {
      return;
    }

    const { node, stepExecutionRuntime } = this.init;
    throw new Error(
      `${node.type} step "${node.stepId}" in workflow "${stepExecutionRuntime.workflowExecution.workflowId}" rendered an empty workflow-id.`
    );
  }

  /**
   * Applies strategy result to step and workflow runtime (completed/failed → finish or fail step
   * and navigate; waiting/cancelled → no navigation).
   */
  private handleResult(result: StrategyResult): void {
    const { stepExecutionRuntime, workflowExecutionRuntime } = this.init;
    if (result.status === 'completed') {
      stepExecutionRuntime.finishStep(result.output);
      workflowExecutionRuntime.navigateToNextNode();
    } else if (result.status === 'failed') {
      stepExecutionRuntime.failStep(result.error as Error);
      workflowExecutionRuntime.navigateToNextNode();
    }
    // result.status === 'waiting' | 'cancelled': no navigation
  }

  async run(): Promise<void> {
    const { node, stepExecutionRuntime, workflowExecutionRuntime } = this.init;

    // On poll resume: only check child state (no startStep, no validation). Strategy decides
    // whether it has resumable state; no node-type or state-shape coupling here.
    if (this.syncExecutor.canResume()) {
      try {
        const result = await this.syncExecutor.resume(this.init.spaceId);
        this.handleResult(result);
      } catch (error) {
        stepExecutionRuntime.failStep(error as Error);
        workflowExecutionRuntime.navigateToNextNode();
      }
      return;
    }

    // First iteration only: start step and run validation
    stepExecutionRuntime.startStep();

    const { workflowId, inputs } = this.getInput();

    // Persist resolved inputs for observability in the execution UI
    stepExecutionRuntime.setInput({ 'workflow-id': workflowId, inputs });

    // Select executor based on step type
    const executor = node.type === 'workflow.execute' ? this.syncExecutor : this.asyncExecutor;

    try {
      this.assertValidWorkflowId(workflowId);

      const rawDepth = stepExecutionRuntime.workflowExecution.context?.parentDepth;
      const currentDepth = (typeof rawDepth === 'number' ? rawDepth : -1) + 1;
      const maxWorkflowDepth = this.init.config.maxWorkflowDepth;
      if (currentDepth >= maxWorkflowDepth) {
        const error = new Error(
          `Workflow composition depth limit (${maxWorkflowDepth}) exceeded at step "${node.stepId}" in workflow "${stepExecutionRuntime.workflowExecution.workflowId}". Refactor to reduce nesting.`
        );
        stepExecutionRuntime.failStep(error);
        workflowExecutionRuntime.navigateToNextNode();
        return;
      }

      const targetWorkflow = await this.getWorkflow(workflowId);
      if (!targetWorkflow) {
        const error = new Error(
          `Workflow not found: "${workflowId}" (referenced by step "${node.stepId}" in workflow "${stepExecutionRuntime.workflowExecution.workflowId}")`
        );
        stepExecutionRuntime.failStep(error);
        workflowExecutionRuntime.navigateToNextNode();
        return;
      }

      try {
        await this.ensureWorkflowIsExecutable(targetWorkflow);
      } catch (error) {
        stepExecutionRuntime.failStep(error as Error);
        workflowExecutionRuntime.navigateToNextNode();
        return;
      }

      if (stepExecutionRuntime.abortController.signal.aborted) return;

      const result = await executor.execute(
        targetWorkflow,
        inputs,
        this.init.spaceId,
        this.init.request,
        currentDepth
      );

      this.handleResult(result);
    } catch (error) {
      stepExecutionRuntime.failStep(error as Error);
      workflowExecutionRuntime.navigateToNextNode();
    }
  }

  async onCancel(): Promise<void> {
    await this.syncExecutor.cancel(this.init.spaceId, this.init.request);
  }

  private async getWorkflow(workflowId: string): Promise<EsWorkflow | null> {
    const isManagedParentRun = this.isManagedParentExecution();
    return this.init.workflowRepository.getWorkflow(workflowId, this.init.spaceId, {
      includeGlobal: isManagedParentRun,
      managedFilter: isManagedParentRun ? 'all' : 'unmanaged',
    });
  }

  private isManagedParentExecution(): boolean {
    const { workflowExecution } = this.init.stepExecutionRuntime;
    return workflowExecution.managed === true;
  }

  private async ensureWorkflowIsExecutable(workflow: EsWorkflow): Promise<void> {
    const { node, stepExecutionRuntime } = this.init;
    const currentWorkflowId = stepExecutionRuntime.workflowExecution.workflowId;
    // Prevent a workflow from triggering itself (direct self-referencing)
    if (workflow.id === currentWorkflowId) {
      throw new Error(
        `Workflow "${workflow.id}" cannot call itself (self-referencing detected at step "${node.stepId}")`
      );
    }
    // Note: workflow visibility is validated by the repository fetch.
    // Global definitions are included only for managed parent workflow runs.
    if (!workflow.enabled) {
      throw new Error(
        `Workflow "${workflow.id}" is disabled (referenced by step "${node.stepId}" in workflow "${currentWorkflowId}")`
      );
    }
    if (!workflow.valid) {
      throw new Error(
        `Workflow "${workflow.id}" is not valid (referenced by step "${node.stepId}" in workflow "${currentWorkflowId}")`
      );
    }
  }
}
