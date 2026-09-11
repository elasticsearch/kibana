/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MonitorableNode } from '../../step/node_implementation';
import type { StepExecutionRuntime } from '../../workflow_context_manager/step_execution_runtime';
import { WorkflowScopeStack } from '../../workflow_context_manager/workflow_scope_stack';
import { cancelWorkflowIfRequested } from '../cancel_workflow_if_requested';
import type { WorkflowExecutionLoopParams } from '../types';

/**
 * Processes the node stack and invokes monitor() on each monitorable node.
 *
 * This function traverses the node stack from outermost to innermost scope,
 * creating appropriate execution contexts for each node and invoking their
 * monitor() method if they implement the MonitorableNode interface.
 *
 * @param params - Workflow execution loop parameters containing factories and state
 * @param monitoredStepExecutionRuntime - The runtime context for the step being monitored
 *
 * @returns Promise that resolves when all nodes in the stack have been processed
 */
export async function processNodeStackMonitoring(
  params: WorkflowExecutionLoopParams,
  monitoredStepExecutionRuntime: StepExecutionRuntime
): Promise<void> {
  const nodeStackFrames = params.workflowRuntime.getCurrentNodeScope();
  let nodeStack = WorkflowScopeStack.fromStackFrames(nodeStackFrames);

  while (!nodeStack.isEmpty()) {
    const scopeData = nodeStack.getCurrentScope();
    nodeStack = nodeStack.exitScope();
    const scopeStepExecutionRuntime = params.stepExecutionRuntimeFactory.createStepExecutionRuntime(
      {
        nodeId: scopeData.nodeId,
        stackFrames: nodeStack.stackFrames,
      }
    );

    const nodeImplementation = params.nodesFactory.create(scopeStepExecutionRuntime);

    if (typeof (nodeImplementation as unknown as MonitorableNode).monitor === 'function') {
      const monitored = nodeImplementation as unknown as MonitorableNode;
      await Promise.resolve(monitored.monitor(monitoredStepExecutionRuntime));
    }
  }

  if (params.executionMode !== 'sync') {
    await cancelWorkflowIfRequested(
      params.workflowExecutionRepository,
      params.workflowExecutionState,
      monitoredStepExecutionRuntime,
      params.workflowLogger,
      params.workflowExecutionCursor,
      monitoredStepExecutionRuntime.abortController
    );
  }
}
