/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ExitWhileNode, WorkflowGraph } from '@kbn/workflows/graph';
import type { WhileStepState } from './types';
import type { StepExecutionRuntime } from '../../workflow_context_manager/step_execution_runtime';
import type { StepIoService } from '../../workflow_context_manager/step_io_service';
import type { WorkflowExecutionRuntimeManager } from '../../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../../workflow_event_logger';
import { evaluateCondition } from '../evaluate_condition';
import type { NodeImplementation } from '../node_implementation';

export class ExitWhileNodeImpl implements NodeImplementation {
  constructor(
    private node: ExitWhileNode,
    private stepExecutionRuntime: StepExecutionRuntime,
    private wfExecutionRuntimeManager: WorkflowExecutionRuntimeManager,
    private workflowLogger: IWorkflowEventLogger,
    private stepIoService: StepIoService,
    private workflowGraph: WorkflowGraph
  ) {}

  public run(): void {
    const whileState = this.stepExecutionRuntime.getCurrentStepState() as
      | WhileStepState
      | undefined;

    if (!whileState) {
      throw new Error(`While state for step ${this.node.stepId} not found`);
    }

    const nextIteration = whileState.iteration + 1;
    const maxReached =
      this.node.maxIterations !== undefined && nextIteration >= this.node.maxIterations;

    if (!maxReached) {
      // The while scope has already been popped from the execution scope stack by
      // run_node.ts exitScope() before this node runs, so getContext() won't include
      // the while context. Inject it explicitly from the step state.
      const whileAdditionalContext: Record<string, unknown> = {
        while: { iteration: nextIteration },
      };
      const context = {
        ...this.stepExecutionRuntime.contextManager.getContext(),
        ...whileAdditionalContext,
      };

      // Re-pin the condition source right before evaluating it. The enter-while
      // pin can only protect sources that already had an execution at loop
      // entry; a condition that references a step produced *inside* the loop
      // body has no execution yet at enter-while, so nothing was pinned for it.
      // By the time we reach exit-while the inner step has run and its latest
      // output is resident (rehydrated by prepareForRead), but it is not pinned
      // — a concurrent flush could evict it in the window between that read and
      // the synchronous render/evaluate below. Pinning here (additive, cleared
      // on loop exit by unpinLoopScope) closes that residual TOCTOU gap.
      this.stepIoService.pinLoopSource(this.node.stepId, this.node.condition);

      const renderedCondition = this.stepExecutionRuntime.contextManager.renderValueWithContext(
        this.node.condition,
        context
      );
      const conditionResult = evaluateCondition(renderedCondition, context, this.node.stepId);
      if (conditionResult) {
        this.wfExecutionRuntimeManager.navigateToNode(this.node.startNodeId);
        return;
      }
    }

    if (maxReached && this.node.onLimit === 'fail') {
      // Loop is terminating — release the condition-source pin taken at
      // enter-while so those outputs become evictable again.
      this.stepIoService.unpinLoopScope(this.node.stepId);
      // Evict before throwing — high-iteration loops that fail at the limit
      // are precisely the scenario most likely to cause memory pressure.
      const innerStepIds = this.workflowGraph.getInnerStepIds(this.node.stepId);
      this.stepIoService.evictStaleLoopOutputs(innerStepIds);
      throw new Error(
        `While step "${this.node.stepId}" exceeded max-iterations limit of ${this.node.maxIterations}. ` +
          `Completed ${nextIteration} iterations.`
      );
    }

    // Loop is terminating normally (condition false or max-iterations reached)
    // — release the condition-source pin taken at enter-while.
    this.stepIoService.unpinLoopScope(this.node.stepId);
    this.stepExecutionRuntime.finishStep({
      exitReason: maxReached ? 'max-iterations' : 'condition',
    });
    const innerStepIds = this.workflowGraph.getInnerStepIds(this.node.stepId);
    this.stepIoService.evictStaleLoopOutputs(innerStepIds);
    this.workflowLogger.logDebug(
      `Evicted stale in-memory outputs for ${innerStepIds.size} inner step(s) of while "${this.node.stepId}"`,
      { workflow: { step_id: this.node.stepId } }
    );

    this.workflowLogger.logDebug(
      `Exiting while step "${this.node.stepId}" after ${
        maxReached ? 'max-iterations' : 'condition'
      }. Completed ${nextIteration} iterations.`,
      { workflow: { step_id: this.node.stepId } }
    );
    this.wfExecutionRuntimeManager.navigateToNextNode();
  }
}
