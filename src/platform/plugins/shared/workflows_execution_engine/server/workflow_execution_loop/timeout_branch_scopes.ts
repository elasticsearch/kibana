/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { StackFrame } from '@kbn/workflows';
import { isTerminalStatus } from '@kbn/workflows';
import type { StepExecutionRuntime } from '../workflow_context_manager/step_execution_runtime';
import type { StepExecutionRuntimeFactory } from '../workflow_context_manager/step_execution_runtime_factory';
import { WorkflowScopeStack } from '../workflow_context_manager/workflow_scope_stack';

/** Terminalizes active enclosing records up to the owning parallel boundary without touching siblings. */
export const timeoutBranchScopes = (
  factory: StepExecutionRuntimeFactory,
  stackFrames: StackFrame[],
  boundaryNodeId: string,
  error: Error,
  terminalize: (runtime: StepExecutionRuntime) => void = (runtime) => runtime.timeoutStep(error)
): void => {
  let scope = WorkflowScopeStack.fromStackFrames(stackFrames);
  const visited = new Set<string>();
  while (!scope.isEmpty()) {
    const current = scope.getCurrentScope();
    if (current.nodeId === boundaryNodeId) return;
    scope = scope.exitScope();
    const runtime = factory.createStepExecutionRuntime({
      nodeId: current.nodeId,
      stackFrames: scope.stackFrames,
    });
    if (
      !visited.has(runtime.stepExecutionId) &&
      runtime.stepExecution &&
      !isTerminalStatus(runtime.stepExecution.status)
    ) {
      terminalize(runtime);
    }
    visited.add(runtime.stepExecutionId);
  }
};
