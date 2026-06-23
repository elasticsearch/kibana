/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook, waitFor } from '@testing-library/react';
import type { QueryClient } from '@kbn/react-query';
import type { WorkflowExecutionListDto } from '@kbn/workflows';
import { ExecutionStatus, ExecutionType } from '@kbn/workflows/types/v1';
import { useWorkflowsApi } from '@kbn/workflows-ui';
import { createMockWorkflowApi, type MockWorkflowApi } from '@kbn/workflows-ui/mocks';
import { useWorkflowExecutions } from './use_workflow_executions';
import { createQueryClientWrapper, createTestQueryClient } from '../../../shared/test_utils';

jest.mock('@kbn/workflows-ui', () => ({
  useWorkflowsApi: jest.fn(),
}));

const mockUseWorkflowsApi = useWorkflowsApi as jest.MockedFunction<typeof useWorkflowsApi>;

describe('useWorkflowExecutions', () => {
  let mockWorkflowApi: MockWorkflowApi;
  let mockGetWorkflowExecutions: jest.MockedFunction<MockWorkflowApi['getWorkflowExecutions']>;
  let queryClient: QueryClient;

  const executionsPage1: WorkflowExecutionListDto = {
    results: [
      {
        id: 'exec-1',
        spaceId: 'default',
        status: ExecutionStatus.COMPLETED,
        isTestRun: false,
        startedAt: '2024-01-01T10:00:00Z',
        finishedAt: '2024-01-01T10:01:00Z',
        error: null,
        duration: 60_000,
        workflowId: 'wf-1',
        workflowName: 'Test Workflow',
      },
      {
        id: 'exec-2',
        spaceId: 'default',
        status: ExecutionStatus.RUNNING,
        isTestRun: false,
        startedAt: '2024-01-01T11:00:00Z',
        finishedAt: '2024-01-01T11:00:00Z',
        error: null,
        duration: 1_000,
        workflowId: 'wf-1',
        workflowName: 'Test Workflow',
      },
    ],
    page: 1,
    size: 100,
    total: 2,
  };

  const renderExecutionsHook = (
    params: Parameters<typeof useWorkflowExecutions>[0],
    options?: Parameters<typeof useWorkflowExecutions>[1]
  ) =>
    renderHook(() => useWorkflowExecutions(params, { retry: false, ...options }), {
      wrapper: createQueryClientWrapper(queryClient),
    });

  const waitForExecutionsFetch = async () => {
    await waitFor(() => expect(mockGetWorkflowExecutions).toHaveBeenCalled());
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkflowApi = createMockWorkflowApi();
    mockGetWorkflowExecutions = mockWorkflowApi.getWorkflowExecutions;
    mockGetWorkflowExecutions.mockResolvedValue(executionsPage1);
    mockUseWorkflowsApi.mockReturnValue(mockWorkflowApi);
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('should fetch executions for a workflow', async () => {
    renderExecutionsHook({ workflowId: 'wf-1' });

    await waitForExecutionsFetch();

    expect(mockGetWorkflowExecutions).toHaveBeenCalledWith(
      'wf-1',
      expect.objectContaining({
        page: 1,
        size: 100,
      })
    );
  });

  it('should not fetch when workflowId is null', () => {
    renderExecutionsHook({ workflowId: null });

    expect(mockGetWorkflowExecutions).not.toHaveBeenCalled();
  });

  it('should flatten pages into allExecutions data', async () => {
    const { result } = renderExecutionsHook({ workflowId: 'wf-1' });

    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(result.current.data).toEqual(executionsPage1);
  });

  it('should pass statuses filter to query params', async () => {
    const statuses: ExecutionStatus[] = [ExecutionStatus.COMPLETED, ExecutionStatus.FAILED];

    renderExecutionsHook({ workflowId: 'wf-1', statuses });

    await waitForExecutionsFetch();

    expect(mockGetWorkflowExecutions).toHaveBeenCalledWith(
      'wf-1',
      expect.objectContaining({
        statuses,
      })
    );
  });

  it('should pass executionTypes filter to query params', async () => {
    const executionTypes: ExecutionType[] = [ExecutionType.TEST];

    renderExecutionsHook({ workflowId: 'wf-1', executionTypes });

    await waitForExecutionsFetch();

    expect(mockGetWorkflowExecutions).toHaveBeenCalledWith(
      'wf-1',
      expect.objectContaining({
        executionTypes,
      })
    );
  });

  it('should pass executedBy filter when it has entries', async () => {
    const executedBy = ['user-1'];

    renderExecutionsHook({ workflowId: 'wf-1', executedBy });

    await waitForExecutionsFetch();

    expect(mockGetWorkflowExecutions).toHaveBeenCalledWith(
      'wf-1',
      expect.objectContaining({
        executedBy: ['user-1'],
      })
    );
  });

  it('should not include executedBy when the array is empty', async () => {
    const executedBy: string[] = [];

    renderExecutionsHook({ workflowId: 'wf-1', executedBy });

    await waitForExecutionsFetch();

    const callParams = mockGetWorkflowExecutions.mock.calls[0][1];
    expect(callParams).not.toHaveProperty('executedBy');
  });

  it('should pass omitStepRuns when provided', async () => {
    renderExecutionsHook({ workflowId: 'wf-1', omitStepRuns: true });

    await waitForExecutionsFetch();

    expect(mockGetWorkflowExecutions).toHaveBeenCalledWith(
      'wf-1',
      expect.objectContaining({
        omitStepRuns: true,
      })
    );
  });

  it('should pass time range and sort params when provided', async () => {
    renderExecutionsHook({
      workflowId: 'wf-1',
      startedAfter: 'now-1w',
      startedBefore: 'now',
      finishedAfter: '2026-05-01T00:00:00.000Z',
      finishedBefore: '2026-05-14T00:00:00.000Z',
      sortField: 'finishedAt',
      sortOrder: 'desc',
    });

    await waitForExecutionsFetch();

    expect(mockGetWorkflowExecutions).toHaveBeenCalledWith(
      'wf-1',
      expect.objectContaining({
        startedAfter: 'now-1w',
        startedBefore: 'now',
        finishedAfter: '2026-05-01T00:00:00.000Z',
        finishedBefore: '2026-05-14T00:00:00.000Z',
        sortField: 'finishedAt',
        sortOrder: 'desc',
      })
    );
  });

  it('should use custom page size when provided', async () => {
    renderExecutionsHook({ workflowId: 'wf-1', size: 25 });

    await waitForExecutionsFetch();

    expect(mockGetWorkflowExecutions).toHaveBeenCalledWith(
      'wf-1',
      expect.objectContaining({
        size: 25,
      })
    );
  });

  it('should return null data when there are no pages', () => {
    const { result } = renderExecutionsHook({ workflowId: null });

    expect(result.current.data).toBeNull();
  });

  it('should handle HTTP errors', async () => {
    mockGetWorkflowExecutions.mockRejectedValue(new Error('Server error'));

    const { result } = renderExecutionsHook({ workflowId: 'wf-1' }, { retry: false });

    await waitFor(() => expect(result.current.error).toBeTruthy());
  });

  it('should expose hasNextPage as false when all results fit in one page', async () => {
    const { result } = renderExecutionsHook({ workflowId: 'wf-1' });

    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(result.current.hasNextPage).toBe(false);
  });

  it('should expose hasNextPage as true when total exceeds page size', async () => {
    mockGetWorkflowExecutions.mockResolvedValue({
      results: [executionsPage1.results[0]],
      page: 1,
      size: 1,
      total: 3,
    });

    const { result } = renderExecutionsHook({ workflowId: 'wf-1', size: 1 });

    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(result.current.hasNextPage).toBe(true);
  });
});
