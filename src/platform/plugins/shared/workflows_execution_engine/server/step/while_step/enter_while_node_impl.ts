/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EnterWhileNode } from '@kbn/workflows/graph';
import type { WhileStepState } from './types';
import type { StepExecutionRuntime } from '../../workflow_context_manager/step_execution_runtime';
import type { StepIoService } from '../../workflow_context_manager/step_io_service';
import type { WorkflowExecutionRuntimeManager } from '../../workflow_context_manager/workflow_execution_runtime_manager';
import type { IWorkflowEventLogger } from '../../workflow_event_logger';
import type { NodeImplementation } from '../node_implementation';

export class EnterWhileNodeImpl implements NodeImplementation {
  constructor(
    private node: EnterWhileNode,
    private wfExecutionRuntimeManager: WorkflowExecutionRuntimeManager,
    private stepExecutionRuntime: StepExecutionRuntime,
    private workflowLogger: IWorkflowEventLogger,
    private stepIoService: StepIoService
  ) {}

  public run(): void {
    if (!this.stepExecutionRuntime.getCurrentStepState()) {
      this.enterWhile();
    } else {
      this.advanceIteration();
    }
  }

  private enterWhile(): void {
    this.stepExecutionRuntime.startStep();
    this.stepExecutionRuntime.setInput({
      condition: this.node.configuration.condition,
    });

    // Pin the outputs referenced by the loop condition for the lifetime of the
    // loop. The exit-while node re-evaluates this condition synchronously on
    // every iteration (ExitWhileNodeImpl.run -> evaluateCondition); without
    // pinning, a concurrent flush can evict a referenced source between an
    // inner step's prepareForRead and that re-evaluation, leaving the
    // condition to read `undefined` (premature exit, or a hard
    // `Cannot use 'in' operator` error from KQL path traversal). Unpinned in
    // ExitWhileNodeImpl on loop exit.
    this.stepIoService.pinLoopSource(this.node.stepId, this.node.configuration.condition);

    this.workflowLogger.logDebug(`While step "${this.node.stepId}" starting first iteration.`, {
      workflow: { step_id: this.node.stepId },
    });
    const whileState: WhileStepState = { iteration: 0 };
    this.stepExecutionRuntime.setCurrentStepState(whileState);
    this.wfExecutionRuntimeManager.enterScope('0');
    this.wfExecutionRuntimeManager.navigateToNextNode();
  }

  private advanceIteration(): void {
    const whileState = this.stepExecutionRuntime.getCurrentStepState() as
      | WhileStepState
      | undefined;

    if (!whileState) {
      throw new Error(`While state for step ${this.node.stepId} not found`);
    }

    const iteration = whileState.iteration + 1;

    this.stepExecutionRuntime.setCurrentStepState({ iteration });
    this.wfExecutionRuntimeManager.enterScope(iteration.toString());
    this.wfExecutionRuntimeManager.navigateToNextNode();
  }
}
