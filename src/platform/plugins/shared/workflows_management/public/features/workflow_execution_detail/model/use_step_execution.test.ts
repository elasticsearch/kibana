/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { ExecutionStatus } from '@kbn/workflows';
import { useWorkflowsApi } from '@kbn/workflows-ui';
import { useStepExecution } from './use_step_execution';

jest.mock('@kbn/workflows-ui', () => ({
  useWorkflowsApi: jest.fn(),
}));
const mockUseWorkflowsApi = useWorkflowsApi as jest.MockedFunction<typeof useWorkflowsApi>;

const createWrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return Wrapper;
};

describe('useStepExecution', () => {
  let mockGetStepExecution: jest.Mock;
  let queryClient: QueryClient;

  const stepResponse = {
    stepId: 'step-1',
    status: 'completed',
    input: { arg: 'value' },
    output: { result: 'ok' },
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockGetStepExecution = jest.fn().mockResolvedValue(stepResponse);
    mockUseWorkflowsApi.mockReturnValue({
      getStepExecution: mockGetStepExecution,
    } as any);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    queryClient.clear();
  });

  it('should not fetch when stepExecutionId is undefined', () => {
    const { result } = renderHook(
      () => useStepExecution('exec-1', undefined, ExecutionStatus.COMPLETED),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.isFetching).toBe(false);
    expect(mockGetStepExecution).not.toHaveBeenCalled();
  });

  it('should fetch when both IDs are provided', async () => {
    const { result } = renderHook(
      () => useStepExecution('exec-1', 'step-doc-1', ExecutionStatus.COMPLETED),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetStepExecution).toHaveBeenCalledWith('exec-1', 'step-doc-1');
    expect(result.current.data).toEqual(stepResponse);
  });

  it('should set staleTime to Infinity for terminal step status', async () => {
    const { result } = renderHook(
      () => useStepExecution('exec-1', 'step-doc-1', ExecutionStatus.COMPLETED),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cachedQuery = queryClient.getQueryCache().findAll({
      queryKey: ['stepExecution', 'exec-1', 'step-doc-1'],
    })[0];
    expect(cachedQuery.state.isInvalidated).toBe(false);
    expect(cachedQuery.state.dataUpdateCount).toBe(1);

    mockGetStepExecution.mockClear();
    await act(async () => {
      jest.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(mockGetStepExecution).not.toHaveBeenCalled();
  });

  it('should poll when fetched data has non-terminal status', async () => {
    const runningResponse = { ...stepResponse, status: 'running', output: undefined };
    mockGetStepExecution.mockResolvedValue(runningResponse);

    const { result } = renderHook(
      () => useStepExecution('exec-1', 'step-doc-1', ExecutionStatus.RUNNING),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetStepExecution).toHaveBeenCalledTimes(1);

    mockGetStepExecution.mockClear();
    await act(async () => {
      jest.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    await waitFor(() => expect(mockGetStepExecution).toHaveBeenCalled());
  });

  it('should stop polling when fetched data transitions to terminal status', async () => {
    const runningResponse = { ...stepResponse, status: 'running', output: undefined };
    mockGetStepExecution.mockResolvedValue(runningResponse);

    const { result } = renderHook(
      () => useStepExecution('exec-1', 'step-doc-1', ExecutionStatus.RUNNING),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Now the fetched data returns terminal status
    mockGetStepExecution.mockResolvedValue(stepResponse);
    mockGetStepExecution.mockClear();
    await act(async () => {
      jest.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    await waitFor(() => expect(mockGetStepExecution).toHaveBeenCalledTimes(1));

    mockGetStepExecution.mockClear();
    await act(async () => {
      jest.advanceTimersByTime(15_000);
      await Promise.resolve();
    });
    expect(mockGetStepExecution).not.toHaveBeenCalled();
  });

  it('should keep polling when external status is terminal but fetched data is not yet', async () => {
    // Simulates ES eventual consistency: lightweight polling says completed,
    // but the full step document hasn't refreshed yet.
    const runningResponse = { ...stepResponse, status: 'running', output: undefined };
    mockGetStepExecution.mockResolvedValue(runningResponse);

    const { result } = renderHook(
      () => useStepExecution('exec-1', 'step-doc-1', ExecutionStatus.COMPLETED),
      { wrapper: createWrapper(queryClient) }
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isSuccess).toBe(true);

    mockGetStepExecution.mockClear();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    expect(mockGetStepExecution).toHaveBeenCalled();
  });

  it('should use the correct query key structure', async () => {
    renderHook(() => useStepExecution('exec-1', 'step-doc-1', ExecutionStatus.COMPLETED), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() =>
      expect(
        queryClient.getQueryCache().findAll({
          queryKey: ['stepExecution', 'exec-1', 'step-doc-1'],
        })
      ).toHaveLength(1)
    );
  });
});
