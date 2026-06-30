/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import { ExecutionStatus } from '@kbn/workflows';
import { platformCoreTools } from '@kbn/agent-builder-common';
import { getWorkflowExecutionStatusTool } from './get_workflow_execution_status';

jest.mock('@kbn/agent-builder-tools-base/workflows', () => ({
  getExecutionState: jest.fn(),
}));

const { getExecutionState } = jest.requireMock('@kbn/agent-builder-tools-base/workflows');

const createWorkflowsManagement = () => ({
  management: {
    getWorkflowExecution: jest.fn(),
  },
});

const createSecurity = (hasAllRequested = true) => ({
  authz: {
    actions: { api: { get: jest.fn((priv: string) => `api:${priv}`) } },
    checkPrivilegesWithRequest: jest.fn().mockReturnValue({
      atSpace: jest.fn().mockResolvedValue({ hasAllRequested }),
    }),
  },
});

const buildTool = (wm: ReturnType<typeof createWorkflowsManagement>, hasAllRequested = true) =>
  getWorkflowExecutionStatusTool({
    workflowsManagement: wm as any,
    getSecurity: () => createSecurity(hasAllRequested) as any,
  });

const mockContext = {
  spaceId: 'default',
  request: {} as KibanaRequest,
};

describe('getWorkflowExecutionStatusTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have the correct tool id', () => {
    const tool = buildTool(createWorkflowsManagement());
    expect(tool.id).toBe(platformCoreTools.getWorkflowExecutionStatus);
  });

  it('should return the execution state when the caller has readExecution', async () => {
    const tool = buildTool(createWorkflowsManagement());
    const execution = {
      execution_id: 'exec-1',
      status: ExecutionStatus.COMPLETED,
      output: { secret_value: 'CANARY' },
    };
    getExecutionState.mockResolvedValue(execution);

    const result = await tool.handler({ executionId: 'exec-1' }, mockContext as any);

    expect(result).toEqual({ results: [{ type: 'other', data: { execution } }] });
  });

  it('should not read the execution and return not-found when the caller lacks readExecution', async () => {
    const tool = buildTool(createWorkflowsManagement(), false);

    const result = await tool.handler({ executionId: 'exec-1' }, mockContext as any);

    expect(getExecutionState).not.toHaveBeenCalled();
    expect(result).toEqual({
      results: [
        {
          type: 'error',
          data: { message: "Workflow execution with ID 'exec-1' not found." },
        },
      ],
    });
  });

  it('should return not-found when the execution does not exist', async () => {
    const tool = buildTool(createWorkflowsManagement());
    getExecutionState.mockResolvedValue(null);

    const result = await tool.handler({ executionId: 'missing' }, mockContext as any);

    expect(result).toEqual({
      results: [
        {
          type: 'error',
          data: { message: "Workflow execution with ID 'missing' not found." },
        },
      ],
    });
  });

  it('should return an error result when the API throws', async () => {
    const tool = buildTool(createWorkflowsManagement());
    getExecutionState.mockRejectedValue(new Error('ES unavailable'));

    const result = await tool.handler({ executionId: 'exec-1' }, mockContext as any);

    expect(result).toEqual({
      results: [
        {
          type: 'error',
          data: { message: 'Failed to retrieve workflow execution status: ES unavailable' },
        },
      ],
    });
  });
});
