/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { SignificantEventsWorkflowStatus } from '@kbn/significant-events-schema';
import {
  SignificantEventsDiscoveryProvider,
  useSignificantEventsDiscoveryContext,
} from './significant_events_discovery_context';

jest.mock('../../../../hooks/use_kibana', () => ({
  useKibana: jest.fn(),
}));

jest.mock('../../../../hooks/significant_events/use_significant_events_discovery_api', () => ({
  useSignificantEventsDiscoveryApi: jest.fn(),
}));

import { useKibana } from '../../../../hooks/use_kibana';
import { useSignificantEventsDiscoveryApi } from '../../../../hooks/significant_events/use_significant_events_discovery_api';

const mockUseKibana = useKibana as jest.MockedFunction<typeof useKibana>;
const mockUseApi = useSignificantEventsDiscoveryApi as jest.MockedFunction<
  typeof useSignificantEventsDiscoveryApi
>;

interface StatusResponse {
  status: SignificantEventsWorkflowStatus;
  executionId?: string;
  error?: string;
}

const STATUS_QUERY_KEY = ['significant_events_discovery_status'];

const addSuccess = jest.fn();
const addDanger = jest.fn();
const addError = jest.fn();

const trigger = jest.fn();
const cancel = jest.fn();

const createSetup = (onComplete?: () => void) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SignificantEventsDiscoveryProvider onComplete={onComplete}>
        {children}
      </SignificantEventsDiscoveryProvider>
    </QueryClientProvider>
  );
  const setStatus = (status: StatusResponse) => queryClient.setQueryData(STATUS_QUERY_KEY, status);
  return { wrapper, setStatus, queryClient };
};

const renderContext = (onComplete?: () => void) => {
  const { wrapper, setStatus, queryClient } = createSetup(onComplete);
  const view = renderHook(() => useSignificantEventsDiscoveryContext(), { wrapper });
  return { ...view, setStatus, queryClient };
};

describe('SignificantEventsDiscoveryProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockUseKibana.mockReturnValue({
      core: { notifications: { toasts: { addSuccess, addDanger, addError } } },
    } as unknown as ReturnType<typeof useKibana>);
    mockUseApi.mockReturnValue({
      triggerSignificantEventsDiscovery: trigger,
      cancelSignificantEventsDiscovery: cancel,
      getSignificantEventsDiscoveryStatus: jest.fn(async () => undefined),
    } as unknown as ReturnType<typeof useSignificantEventsDiscoveryApi>);
  });

  it('starts not running', () => {
    const { result } = renderContext();
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isCanceling).toBe(false);
  });

  describe('handleRun', () => {
    it('optimistically sets isRunning before the trigger resolves', async () => {
      trigger.mockResolvedValue({ executionId: 'exec-1' });
      const { result } = renderContext();

      act(() => {
        result.current.handleRun();
      });

      expect(result.current.isRunning).toBe(true);
      await waitFor(() => expect(trigger).toHaveBeenCalledTimes(1));
    });

    it('resets running state and shows an error toast when the trigger fails', async () => {
      trigger.mockRejectedValue(new Error('boom'));
      const { result } = renderContext();

      act(() => {
        result.current.handleRun();
      });

      await waitFor(() => expect(addError).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(result.current.isRunning).toBe(false));
    });
  });

  describe('handleCancel', () => {
    it('optimistically sets isCanceling and calls cancel', async () => {
      cancel.mockImplementation(() => new Promise(() => {}));
      const { result } = renderContext();

      act(() => {
        result.current.handleCancel();
      });

      await waitFor(() => expect(result.current.isCanceling).toBe(true));
      expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('clears isCanceling and shows an error toast when cancel fails', async () => {
      cancel.mockRejectedValue(new Error('nope'));
      const { result } = renderContext();

      act(() => {
        result.current.handleCancel();
      });

      await waitFor(() => expect(addError).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(result.current.isCanceling).toBe(false));
    });
  });

  describe('terminal status transitions', () => {
    it('fires the success toast and onComplete when a run completes', async () => {
      trigger.mockResolvedValue({ executionId: 'exec-1' });
      const onComplete = jest.fn();
      const { result, setStatus } = renderContext(onComplete);

      act(() => {
        result.current.handleRun();
      });
      await waitFor(() => expect(result.current.isRunning).toBe(true));

      act(() => {
        setStatus({ status: SignificantEventsWorkflowStatus.InProgress, executionId: 'exec-1' });
      });
      act(() => {
        setStatus({ status: SignificantEventsWorkflowStatus.Completed, executionId: 'exec-1' });
      });

      await waitFor(() => expect(addSuccess).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(result.current.isRunning).toBe(false));
    });

    it('fires a danger toast when a run fails', async () => {
      trigger.mockResolvedValue({ executionId: 'exec-1' });
      const { result, setStatus } = renderContext();

      act(() => {
        result.current.handleRun();
      });
      await waitFor(() => expect(result.current.isRunning).toBe(true));

      act(() => {
        setStatus({ status: SignificantEventsWorkflowStatus.InProgress, executionId: 'exec-1' });
      });
      act(() => {
        setStatus({
          status: SignificantEventsWorkflowStatus.Failed,
          executionId: 'exec-1',
          error: 'kaboom',
        });
      });

      await waitFor(() => expect(addDanger).toHaveBeenCalledTimes(1));
      expect(addDanger).toHaveBeenCalledWith(expect.objectContaining({ text: 'kaboom' }));
    });
  });

  // Regression coverage for triggering a run while a previous run's terminal
  // status is already cached (the reported "stuck loading" + "instant success
  // toast" bugs).
  describe('triggering with a stale completed status cached', () => {
    it('does not fire a success toast on click for a previously cached completion', async () => {
      trigger.mockImplementation(() => new Promise(() => {}));
      const { result, setStatus } = renderContext();

      // A previous run is completed in the cache before the user clicks.
      act(() => {
        setStatus({ status: SignificantEventsWorkflowStatus.Completed, executionId: 'old-exec' });
      });
      act(() => {
        result.current.handleRun();
      });

      expect(result.current.isRunning).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
      // The cached completion is a different execution and must not toast.
      expect(addSuccess).not.toHaveBeenCalled();
    });

    it('stays running while the poll reports the previous run, then toasts on the new completion', async () => {
      trigger.mockResolvedValue({ executionId: 'new-exec' });
      const onComplete = jest.fn();
      const { result, setStatus } = renderContext(onComplete);

      act(() => {
        setStatus({ status: SignificantEventsWorkflowStatus.Completed, executionId: 'old-exec' });
      });
      act(() => {
        result.current.handleRun();
      });
      await waitFor(() => expect(result.current.isRunning).toBe(true));

      // Poll still reports the previous (completed) run — must stay running and
      // not toast, since its execution id differs from the one we triggered.
      act(() => {
        setStatus({ status: SignificantEventsWorkflowStatus.Completed, executionId: 'old-exec' });
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(result.current.isRunning).toBe(true);
      expect(addSuccess).not.toHaveBeenCalled();

      // The new execution surfaces and completes.
      act(() => {
        setStatus({ status: SignificantEventsWorkflowStatus.Completed, executionId: 'new-exec' });
      });

      await waitFor(() => expect(result.current.isRunning).toBe(false));
      await waitFor(() => expect(addSuccess).toHaveBeenCalledTimes(1));
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  // Reproduces the reported bug: switching tabs remounts the page (the tab is a
  // route path param), so the provider's React state is discarded while the
  // QueryClient (status poll) persists. Running state must be restored from the
  // cached server status on the new mount.
  describe('remount (tab switch) with the same QueryClient', () => {
    it('restores isRunning from the cached in-progress status after a remount', async () => {
      const { queryClient, setStatus } = createSetup();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <SignificantEventsDiscoveryProvider>{children}</SignificantEventsDiscoveryProvider>
        </QueryClientProvider>
      );

      // A run is in progress on the server.
      act(() => {
        setStatus({ status: SignificantEventsWorkflowStatus.InProgress, executionId: 'exec-1' });
      });

      const first = renderHook(() => useSignificantEventsDiscoveryContext(), { wrapper });
      await waitFor(() => expect(first.result.current.isRunning).toBe(true));

      // Simulate a tab switch: unmount the provider, then mount a fresh one with
      // the same (persisted) QueryClient.
      first.unmount();

      const second = renderHook(() => useSignificantEventsDiscoveryContext(), { wrapper });

      // Running state is restored from the cached server status, not lost.
      await waitFor(() => expect(second.result.current.isRunning).toBe(true));
    });

    it('does not re-toast a completion that was already handled before the remount', async () => {
      const { queryClient, setStatus } = createSetup();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <SignificantEventsDiscoveryProvider>{children}</SignificantEventsDiscoveryProvider>
        </QueryClientProvider>
      );

      const first = renderHook(() => useSignificantEventsDiscoveryContext(), { wrapper });

      // Run completes while the first instance is mounted (toasts once).
      act(() => {
        setStatus({ status: SignificantEventsWorkflowStatus.InProgress, executionId: 'exec-1' });
      });
      act(() => {
        first.result.current.handleRun();
      });
      await waitFor(() => expect(first.result.current.isRunning).toBe(true));
      act(() => {
        setStatus({ status: SignificantEventsWorkflowStatus.Completed, executionId: 'exec-1' });
      });
      await waitFor(() => expect(addSuccess).toHaveBeenCalledTimes(1));

      // Tab switch remount with the completion still cached — must not re-toast.
      first.unmount();
      renderHook(() => useSignificantEventsDiscoveryContext(), { wrapper });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(addSuccess).toHaveBeenCalledTimes(1);
    });
  });
});
