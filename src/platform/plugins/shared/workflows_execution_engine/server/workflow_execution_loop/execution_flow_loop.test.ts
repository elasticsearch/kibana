/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { GraphNodeUnion } from '@kbn/workflows/graph';
import { executionFlowLoop } from './execution_flow_loop';
import { createMockWorkflowExecutionCursor } from '../workflow_context_manager/mocks/workflow_execution_cursor.mock';

jest.mock('./run_node', () => ({
  runNode: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runNode } = require('./run_node');

describe('executionFlowLoop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (runNode as jest.Mock).mockResolvedValue(undefined);
  });

  it('calls runNode while the execution cursor is executing', async () => {
    let iterations = 0;
    const workflowExecutionCursor = createMockWorkflowExecutionCursor({
      currentNode: { id: 'node1' } as GraphNodeUnion,
    });
    workflowExecutionCursor.commitPendingNavigation.mockImplementation(() => {
      iterations += 1;
      if (iterations >= 3) {
        workflowExecutionCursor.setMockCurrentNode(null);
        workflowExecutionCursor.setMockIsExecuting(false);
      }
    });

    const params = {
      workflowExecutionCursor,
      workflowRuntime: {
        executionCursor: workflowExecutionCursor,
        getWorkflowExecution: jest.fn().mockReturnValue({ executionMode: 'parallel_v4' }),
        saveState: jest.fn().mockResolvedValue(undefined),
      },
    } as any;

    await executionFlowLoop(params);

    expect(runNode).toHaveBeenCalledTimes(3);
    expect(workflowExecutionCursor.commitPendingNavigation).toHaveBeenCalledTimes(3);
  });

  it('stops the driver when there is no current node after navigation commit', async () => {
    const workflowExecutionCursor = createMockWorkflowExecutionCursor({
      currentNode: null,
    });

    const params = {
      workflowExecutionCursor,
      workflowRuntime: {
        executionCursor: workflowExecutionCursor,
        getWorkflowExecution: jest.fn().mockReturnValue({ executionMode: 'parallel_v4' }),
        saveState: jest.fn().mockResolvedValue(undefined),
      },
    } as any;

    await executionFlowLoop(params);

    expect(runNode).toHaveBeenCalledTimes(1);
    expect(workflowExecutionCursor.stop).toHaveBeenCalled();
  });

  it('does not commit navigation after runNode parks the cursor', async () => {
    const workflowExecutionCursor = createMockWorkflowExecutionCursor({
      currentNode: { id: 'wait-node' } as GraphNodeUnion,
    });
    (runNode as jest.Mock).mockImplementation(async () => {
      workflowExecutionCursor.stop();
    });

    const saveState = jest.fn().mockResolvedValue(undefined);
    const params = {
      workflowExecutionCursor,
      workflowRuntime: {
        executionCursor: workflowExecutionCursor,
        getWorkflowExecution: jest.fn().mockReturnValue({ executionMode: 'parallel_v4' }),
        saveState,
      },
    } as any;

    await executionFlowLoop(params);

    expect(runNode).toHaveBeenCalledTimes(1);
    expect(workflowExecutionCursor.commitPendingNavigation).not.toHaveBeenCalled();
    expect(saveState).toHaveBeenCalledTimes(1);
    expect(workflowExecutionCursor.currentNode).toEqual(
      expect.objectContaining({ id: 'wait-node' })
    );
  });

  it('does not call runNode when execution cursor is not executing', async () => {
    const workflowExecutionCursor = createMockWorkflowExecutionCursor({
      currentNode: { id: 'node1' } as GraphNodeUnion,
      isExecuting: false,
    });

    const params = {
      workflowExecutionCursor,
      workflowRuntime: {
        executionCursor: workflowExecutionCursor,
        getWorkflowExecution: jest.fn().mockReturnValue({ executionMode: 'parallel_v4' }),
        saveState: jest.fn().mockResolvedValue(undefined),
      },
    } as any;

    await executionFlowLoop(params);

    expect(runNode).not.toHaveBeenCalled();
  });
});
