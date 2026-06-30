/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import { platformCoreTools } from '@kbn/agent-builder-common';
import { listWorkflowExecutionsTool } from './list_workflow_executions';

const mockExecution = {
  id: 'exec-1',
  workflowId: 'wf-1',
  status: 'completed' as const,
  startedAt: '2024-01-01T00:00:00Z',
  finishedAt: '2024-01-01T00:01:00Z',
  duration: 60000,
  triggeredBy: 'manual',
  executedBy: 'user@example.com',
  spaceId: 'default',
  stepId: undefined,
  isTestRun: false,
  error: null,
};

const createWorkflowsManagement = () => ({
  management: {
    getWorkflowExecutions: jest.fn().mockResolvedValue({
      results: [mockExecution],
      total: 1,
      page: 1,
      size: 10,
    }),
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
  listWorkflowExecutionsTool({
    workflowsManagement: wm as any,
    getSecurity: () => createSecurity(hasAllRequested) as any,
  });

const mockContext = {
  spaceId: 'default',
  request: {} as KibanaRequest,
};

describe('listWorkflowExecutionsTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have the correct tool id', () => {
    const tool = buildTool(createWorkflowsManagement());
    expect(tool.id).toBe(platformCoreTools.listWorkflowExecutions);
  });

  it('should call getWorkflowExecutions with defaults when no params provided', async () => {
    const wm = createWorkflowsManagement();
    const tool = buildTool(wm);

    await tool.handler({}, mockContext as any);

    expect(wm.management.getWorkflowExecutions).toHaveBeenCalledWith(
      { workflowId: undefined, statuses: undefined, page: 1, size: 10, omitStepRuns: true },
      'default'
    );
  });

  it('should forward workflowId when provided', async () => {
    const wm = createWorkflowsManagement();
    const tool = buildTool(wm);

    await tool.handler({ workflowId: 'wf-abc' }, mockContext as any);

    expect(wm.management.getWorkflowExecutions).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: 'wf-abc' }),
      'default'
    );
  });

  it('should forward statuses when provided', async () => {
    const wm = createWorkflowsManagement();
    const tool = buildTool(wm);

    await tool.handler({ statuses: ['failed'] }, mockContext as any);

    expect(wm.management.getWorkflowExecutions).toHaveBeenCalledWith(
      expect.objectContaining({ statuses: ['failed'] }),
      'default'
    );
  });

  it('should forward limit and page when provided', async () => {
    const wm = createWorkflowsManagement();
    const tool = buildTool(wm);

    await tool.handler({ limit: 25, page: 2 }, mockContext as any);

    expect(wm.management.getWorkflowExecutions).toHaveBeenCalledWith(
      expect.objectContaining({ size: 25, page: 2 }),
      'default'
    );
  });

  it('should return slim execution summaries without internal fields', async () => {
    const wm = createWorkflowsManagement();
    const tool = buildTool(wm);

    const result = await tool.handler({}, mockContext as any);

    const executions = ((result as any).results[0] as any).data.executions;
    expect(executions).toHaveLength(1);
    expect(executions[0]).toEqual({
      executionId: 'exec-1',
      workflowId: 'wf-1',
      status: 'completed',
      startedAt: '2024-01-01T00:00:00Z',
      finishedAt: '2024-01-01T00:01:00Z',
      duration: 60000,
      triggeredBy: 'manual',
      executedBy: 'user@example.com',
    });
    expect(executions[0]).not.toHaveProperty('spaceId');
    expect(executions[0]).not.toHaveProperty('isTestRun');
    expect(executions[0]).not.toHaveProperty('error');
  });

  it('should include pagination metadata in the result', async () => {
    const wm = createWorkflowsManagement();
    const tool = buildTool(wm);

    const result = await tool.handler({}, mockContext as any);

    const data = ((result as any).results[0] as any).data;
    expect(data.total).toBe(1);
    expect(data.page).toBe(1);
    expect(data.size).toBe(10);
  });

  it('should return an error result when the API throws', async () => {
    const wm = createWorkflowsManagement();
    wm.management.getWorkflowExecutions.mockRejectedValue(new Error('ES unavailable'));
    const tool = buildTool(wm);

    const result = await tool.handler({}, mockContext as any);

    expect(result).toEqual({
      results: [
        {
          type: 'error',
          data: { message: 'Failed to list workflow executions: ES unavailable' },
        },
      ],
    });
  });

  it('should not read executions and return an empty list when the caller lacks readExecution', async () => {
    const wm = createWorkflowsManagement();
    const tool = buildTool(wm, false);

    const result = await tool.handler({}, mockContext as any);

    expect(wm.management.getWorkflowExecutions).not.toHaveBeenCalled();
    const data = ((result as any).results[0] as any).data;
    expect(data.executions).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('should return an empty list when no executions exist', async () => {
    const wm = createWorkflowsManagement();
    wm.management.getWorkflowExecutions.mockResolvedValue({
      results: [],
      total: 0,
      page: 1,
      size: 10,
    });
    const tool = buildTool(wm);

    const result = await tool.handler({}, mockContext as any);

    const data = ((result as any).results[0] as any).data;
    expect(data.executions).toEqual([]);
    expect(data.total).toBe(0);
  });
});
