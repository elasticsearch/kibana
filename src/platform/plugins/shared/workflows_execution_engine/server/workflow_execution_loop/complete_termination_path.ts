/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsWorkflowExecution } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import type { WorkflowExecutionLoopParams } from './types';
import type { StepExecutionRuntime } from '../workflow_context_manager/step_execution_runtime';
import { WorkflowScopeStack } from '../workflow_context_manager/workflow_scope_stack';

type Termination = NonNullable<EsWorkflowExecution['pendingTermination']>;

/** Resolves the accepted return and its exact ancestor records, excluding sibling scopes. */
export const getTerminationPath = (
  params: WorkflowExecutionLoopParams,
  decision: Termination
): StepExecutionRuntime[] => {
  const runtimes = [
    params.stepExecutionRuntimeFactory.createStepExecutionRuntime({
      nodeId: decision.nodeId,
      stackFrames: decision.stackFrames,
    }),
  ];
  let scope = WorkflowScopeStack.fromStackFrames(decision.stackFrames);
  while (!scope.isEmpty()) {
    const current = scope.getCurrentScope();
    scope = scope.exitScope();
    runtimes.push(
      params.stepExecutionRuntimeFactory.createStepExecutionRuntime({
        nodeId: current.nodeId,
        stackFrames: scope.stackFrames,
      })
    );
  }
  return [...new Map(runtimes.map((runtime) => [runtime.stepExecutionId, runtime])).values()];
};

/** Completes an accepted return path before cancellation can misclassify it as timed out. */
export const completeTerminationPath = (
  params: WorkflowExecutionLoopParams,
  decision: Termination
): void => {
  for (const runtime of getTerminationPath(params, decision).filter(
    (candidate) => candidate.stepExecution || candidate.stepExecutionId === decision.stepExecutionId
  )) {
    // A root terminator may commit its decision before its first step document is flushed.
    if (!runtime.stepExecution) runtime.startStep();
    if (runtime.stepExecutionId === decision.stepExecutionId && decision.stepError) {
      params.workflowExecutionState.upsertStep({
        id: runtime.stepExecutionId,
        executionCheckpoint: null,
      });
      if (runtime.stepExecution?.status !== ExecutionStatus.FAILED) {
        const error = new Error(decision.stepError.message);
        error.name = decision.stepError.type;
        runtime.failStep(error);
      }
    } else {
      params.workflowExecutionState.upsertStep({
        id: runtime.stepExecutionId,
        error: null,
        executionCheckpoint: null,
      });
      if (runtime.stepExecution?.status !== ExecutionStatus.COMPLETED) {
        runtime.finishStep(
          runtime.stepExecutionId === decision.stepExecutionId ? decision.output : undefined
        );
      }
    }
  }
};
