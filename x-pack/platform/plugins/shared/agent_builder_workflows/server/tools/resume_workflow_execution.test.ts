/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import { ExecutionStatus } from '@kbn/workflows';
import { platformCoreTools } from '@kbn/agent-builder-common';
import { resumeWorkflowExecutionTool } from './resume_workflow_execution';

jest.mock('@kbn/agent-builder-tools-base/workflows', () => ({
  getExecutionState: jest.fn(),
}));

const { getExecutionState } = jest.requireMock('@kbn/agent-builder-tools-base/workflows');

describe('resumeWorkflowExecutionTool', () => {
  const createWorkflowsManagement = () => ({
    management: {
      resumeWorkflowExecution: jest.fn().mockResolvedValue(undefined),
      getWorkflowExecution: jest.fn(),
    },
  });

  const mockContext = {
    spaceId: 'default',
    request: {} as KibanaRequest,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have the correct tool id', () => {
    const tool = resumeWorkflowExecutionTool({
      workflowsManagement: createWorkflowsManagement() as any,
    });
    expect(tool.id).toBe(platformCoreTools.resumeWorkflowExecution);
  });

  it('should call resumeWorkflowExecution with correct params', async () => {
    const wm = createWorkflowsManagement();
    const tool = resumeWorkflowExecutionTool({ workflowsManagement: wm as any });

    getExecutionState.mockResolvedValue({
      execution_id: 'exec-1',
      status: ExecutionStatus.RUNNING,
    });

    await tool.handler({ executionId: 'exec-1', input: { approved: true } }, mockContext as any);

    expect(wm.management.resumeWorkflowExecution).toHaveBeenCalledWith(
      'exec-1',
      'default',
      { approved: true },
      mockContext.request,
      { channel: 'agent_builder' }
    );
  });

  it('should return resumed state on success', async () => {
    const wm = createWorkflowsManagement();
    const tool = resumeWorkflowExecutionTool({ workflowsManagement: wm as any });

    const executionState = {
      execution_id: 'exec-1',
      status: ExecutionStatus.COMPLETED,
      output: { result: 'done' },
    };
    getExecutionState.mockResolvedValue(executionState);

    const result = await tool.handler(
      { executionId: 'exec-1', input: { approved: true } },
      mockContext as any
    );

    expect(result).toEqual({
      results: [
        {
          type: 'other',
          data: {
            resumed: true,
            execution: executionState,
          },
        },
      ],
    });
  });

  it('should return error result when resume fails', async () => {
    const wm = createWorkflowsManagement();
    wm.management.resumeWorkflowExecution.mockRejectedValue(
      new Error('Execution not in WAITING_FOR_INPUT status')
    );
    const tool = resumeWorkflowExecutionTool({ workflowsManagement: wm as any });

    const result = await tool.handler({ executionId: 'exec-1', input: {} }, mockContext as any);

    expect(result).toEqual({
      results: [
        {
          type: 'error',
          data: {
            message:
              'Failed to resume workflow execution: Execution not in WAITING_FOR_INPUT status',
          },
        },
      ],
    });
  });

  it('should return resumed: true with fallback when state fetch throws after a successful resume', async () => {
    const wm = createWorkflowsManagement();
    const tool = resumeWorkflowExecutionTool({ workflowsManagement: wm as any });
    getExecutionState.mockRejectedValue(new Error('timeout'));

    const result = await tool.handler(
      { executionId: 'exec-1', input: { approved: true } },
      mockContext as any
    );

    // Resume succeeded — must not surface an error that would cause the LLM to retry.
    expect(result).toEqual({
      results: [
        {
          type: 'other',
          data: {
            resumed: true,
            execution: { execution_id: 'exec-1', status: 'unknown' },
          },
        },
      ],
    });
  });

  it('should handle null execution state after resume', async () => {
    const wm = createWorkflowsManagement();
    const tool = resumeWorkflowExecutionTool({ workflowsManagement: wm as any });
    getExecutionState.mockResolvedValue(null);

    const result = await tool.handler(
      { executionId: 'exec-1', input: { val: 1 } },
      mockContext as any
    );

    expect(result).toEqual({
      results: [
        {
          type: 'other',
          data: {
            resumed: true,
            execution: { execution_id: 'exec-1', status: 'unknown' },
          },
        },
      ],
    });
  });
});
