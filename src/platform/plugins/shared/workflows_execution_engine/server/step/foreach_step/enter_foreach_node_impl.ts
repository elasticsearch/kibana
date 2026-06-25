/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EnterForeachNode } from '@kbn/workflows/graph';
import type { ForeachStepState } from './types';
import { isTemplateExpression } from '../../utils';
import type { StepExecutionRuntime } from '../../workflow_context_manager/step_execution_runtime';
import type { StepIoService } from '../../workflow_context_manager/step_io_service';
import type { WorkflowExecutionRuntimeManager } from '../../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../../workflow_event_logger';
import type { NodeImplementation } from '../node_implementation';

export class EnterForeachNodeImpl implements NodeImplementation {
  constructor(
    private node: EnterForeachNode,
    private wfExecutionRuntimeManager: WorkflowExecutionRuntimeManager,
    private stepExecutionRuntime: StepExecutionRuntime,
    private workflowLogger: IWorkflowEventLogger,
    private stepIoService: StepIoService
  ) {}

  public async run(): Promise<void> {
    if (!this.stepExecutionRuntime.getCurrentStepState()) {
      await this.enterForeach();
    } else {
      this.advanceIteration();
    }
  }

  private async enterForeach(): Promise<void> {
    this.stepExecutionRuntime.startStep();
    const foreachConfig = this.node.configuration.foreach;
    this.stepExecutionRuntime.setInput({
      foreach: Array.isArray(foreachConfig) ? JSON.stringify(foreachConfig) : foreachConfig,
    });
    // Pin the loop's source outputs for the lifetime of the loop. The foreach
    // re-evaluates its source expression synchronously on every iteration
    // (WorkflowContextManager.buildForeachContext); without pinning, a
    // concurrent flush can evict the source between an inner step's
    // prepareForRead and that re-evaluation, blanking the loop item. Unpinned
    // in ExitForeachNodeImpl.
    this.stepIoService.pinForeachSource(this.node.stepId, foreachConfig);

    const evaluatedItems = this.getItems();

    if (evaluatedItems.length === 0) {
      // No iterations will run — release the pin we just took.
      this.stepIoService.unpinForeachScope(this.node.stepId);
      this.workflowLogger.logDebug(
        `Foreach step "${this.node.stepId}" has no items to iterate over. Skipping execution.`,
        {
          workflow: { step_id: this.node.stepId },
        }
      );
      this.stepExecutionRuntime.setCurrentStepState({
        total: 0,
      });
      this.stepExecutionRuntime.finishStep();
      this.wfExecutionRuntimeManager.navigateToNode(this.node.exitNodeId);
      return;
    }

    this.workflowLogger.logDebug(
      `Foreach step "${this.node.stepId}" will iterate over ${evaluatedItems.length} items.`,
      {
        workflow: { step_id: this.node.stepId },
      }
    );

    // Initialize foreach state — only store index and total to avoid
    // persisting the entire items array on every iteration.
    const foreachState = {
      index: 0,
      total: evaluatedItems.length,
    };

    this.stepExecutionRuntime.setCurrentStepState(foreachState);
    // Enter a new scope for the first iteration
    this.wfExecutionRuntimeManager.enterScope(foreachState.index.toString());
    this.wfExecutionRuntimeManager.navigateToNextNode();
  }

  private advanceIteration(): void {
    const currentForeachState = this.stepExecutionRuntime.getCurrentStepState() as
      | ForeachStepState
      | undefined;

    if (!currentForeachState) {
      throw new Error(`Foreach state for step ${this.node.stepId} not found`);
    }

    const currentIndex = currentForeachState.index as number;

    const index = currentIndex + 1;
    const newForeachState: ForeachStepState = { index, total: currentForeachState.total };
    // Only persist index and total — no need to store the full items array.
    this.stepExecutionRuntime.setCurrentStepState(newForeachState);
    // Enter a new scope for the new iteration
    this.wfExecutionRuntimeManager.enterScope(index.toString());
    this.wfExecutionRuntimeManager.navigateToNextNode();
  }

  private getItems(): unknown[] {
    const expression = this.node.configuration.foreach;
    let resolvedValue = this.processForeachConfiguration();

    if (typeof resolvedValue === 'string') {
      try {
        resolvedValue = JSON.parse(resolvedValue);
      } catch {
        throw new Error(`Unable to parse rendered value: ${resolvedValue}`);
      }
    }

    if (!Array.isArray(resolvedValue)) {
      throw new Error(
        `Foreach expression must evaluate to an array. ` +
          `Expression "${expression}" resolved to ${typeof resolvedValue}${
            resolvedValue === null
              ? ' (null)'
              : resolvedValue === undefined
              ? ' (undefined)'
              : `: ${JSON.stringify(resolvedValue).substring(0, 100)}${
                  JSON.stringify(resolvedValue).length > 100 ? '...' : ''
                }`
          }. `
      );
    }

    return resolvedValue;
  }

  private processForeachConfiguration(): unknown {
    const expression = this.node.configuration.foreach;

    if (!expression) {
      throw new Error(
        'Foreach configuration is required. Please specify an array or expression that evaluates to an array.'
      );
    }

    if (Array.isArray(expression)) {
      return expression;
    }

    if (isTemplateExpression(expression)) {
      return this.stepExecutionRuntime.contextManager.evaluateExpressionInContext(expression);
    }

    return this.stepExecutionRuntime.contextManager.renderValueAccordingToContext(expression);
  }
}
