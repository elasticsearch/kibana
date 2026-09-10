/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import apm from 'elastic-apm-node';
import { BranchExecutor } from './branch_executor';
import { runNode } from './run_node';
import type { WorkflowExecutionLoopParams } from './types';

/**
 * Runs nodes until the cursor stops (terminal, parked wait, or cancel).
 */
export async function executionFlowLoop(params: WorkflowExecutionLoopParams) {
  params.workflowRuntime.branchExecutor = new BranchExecutor(params);
  while (params.workflowExecutionCursor.isExecuting) {
    await runNode(params);
    if (params.workflowRuntime.getWorkflowExecution().pendingTermination) {
      params.workflowExecutionCursor.stop();
      return;
    }
    // Parked wait: keep currentNode for resume. Committing a stale undefined
    // nextNodeId would clear the cursor and persist a false COMPLETED.
    if (!params.workflowExecutionCursor.isExecuting) {
      const parkedSaveSpan = apm.startSpan('save state', 'workflow', 'persistence');
      await params.workflowRuntime.saveState();
      parkedSaveSpan?.end();
      return;
    }
    params.workflowExecutionCursor.commitPendingNavigation();
    const saveStateSpan = apm.startSpan('save state', 'workflow', 'persistence');
    await params.workflowRuntime.saveState();
    saveStateSpan?.end();
    if (!params.workflowExecutionCursor.currentNode) {
      params.workflowExecutionCursor.stop();
    }
  }
}
