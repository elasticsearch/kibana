/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ExitForeachNode, WorkflowGraph } from '@kbn/workflows/graph';
import type { ForeachStepState } from './types';
import type { StepExecutionRuntime } from '../../workflow_context_manager/step_execution_runtime';
import type { StepIoService } from '../../workflow_context_manager/step_io_service';
import type { WorkflowExecutionRuntimeManager } from '../../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../../workflow_event_logger';
import type { NodeImplementation } from '../node_implementation';

export class ExitForeachNodeImpl implements NodeImplementation {
  constructor(
    private node: ExitForeachNode,
    private stepExecutionRuntime: StepExecutionRuntime,
    private wfExecutionRuntimeManager: WorkflowExecutionRuntimeManager,
    private workflowLogger: IWorkflowEventLogger,
    private stepIoService: StepIoService,
    private workflowGraph: WorkflowGraph
  ) {}

  public run(): void {
    const foreachState = this.stepExecutionRuntime.getCurrentStepState() as
      | ForeachStepState
      | undefined;

    if (!foreachState) {
      throw new Error(`Foreach state for step ${this.node.stepId} not found`);
    }

    const nextIndex = foreachState.index + 1;
    const hasMoreItems = nextIndex < foreachState.total;
    const maxReached =
      this.node.maxIterations !== undefined && nextIndex >= this.node.maxIterations;

    if (hasMoreItems && !maxReached) {
      this.wfExecutionRuntimeManager.navigateToNode(this.node.startNodeId);
      return;
    }

    if (maxReached && hasMoreItems && this.node.onLimit === 'fail') {
      // Evict before throwing — high-iteration loops that fail at the limit
      // are precisely the scenario most likely to cause memory pressure.
      this.stepIoService.unpinForeachScope(this.node.stepId);
      const innerStepIds = this.workflowGraph.getInnerStepIds(this.node.stepId);
      this.stepIoService.evictStaleLoopOutputs(innerStepIds);
      throw new Error(
        `Foreach step "${this.node.stepId}" exceeded max-iterations limit of ${this.node.maxIterations}. ` +
          `Processed ${nextIndex} of ${foreachState.total} items.`
      );
    }

    this.stepExecutionRuntime.finishStep();
    // Unpin the loop's source outputs now that the loop has finished iterating.
    // They were pinned during the loop scope-walk to keep them resident across
    // the per-iteration source re-evaluation (see StepIoService.pinLatestExecutionIdsForScope).
    this.stepIoService.unpinForeachScope(this.node.stepId);
    const innerStepIds = this.workflowGraph.getInnerStepIds(this.node.stepId);
    this.stepIoService.evictStaleLoopOutputs(innerStepIds);
    this.workflowLogger.logDebug(
      `Evicted stale in-memory outputs for ${innerStepIds.size} inner step(s) of foreach "${this.node.stepId}"`,
      { workflow: { step_id: this.node.stepId } }
    );

    const reason =
      maxReached && hasMoreItems
        ? `reached max-iterations limit of ${this.node.maxIterations}`
        : 'processing all items';
    this.workflowLogger.logDebug(
      `Exiting foreach step "${this.node.stepId}" after ${reason}. ` +
        `Processed ${nextIndex} of ${foreachState.total} items.`,
      { workflow: { step_id: this.node.stepId } }
    );
    this.wfExecutionRuntimeManager.navigateToNextNode();
  }
}
