/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { CONTEXT_TIE_BREAKER_FIELDS_SETTING } from '@kbn/discover-utils';
import type { DiscoverServices } from '../../../build_services';
import { FailureReason, LoadingStatus } from '../services/context_query_state';
import type { ContextAppFetchProps } from './use_context_app_fetch';
import { useContextAppFetch } from './use_context_app_fetch';
import {
  mockAnchorHit,
  mockPredecessorHits,
  mockSuccessorHits,
} from '../__mocks__/use_context_app_fetch';
import { dataViewWithTimefieldMock } from '../../../__mocks__/data_view_with_timefield';
import { searchResponseIncompleteWarningLocalCluster } from '@kbn/search-response-warnings/src/__mocks__/search_response_warnings';
import type { DataView } from '@kbn/data-views-plugin/public';
import { DiscoverTestProvider } from '../../../__mocks__/test_provider';
import { createDiscoverServicesMock } from '../../../__mocks__/services';

const mockInterceptedWarning = {
  originalWarning: searchResponseIncompleteWarningLocalCluster,
};

let mockOverrideInterceptedWarnings = false;
const mockFetchSurroundingDocs = jest.fn();

jest.mock('../services/context', () => {
  const originalModule = jest.requireActual('../services/context');
  return {
    ...originalModule,

    fetchSurroundingDocs: (...args: unknown[]) => mockFetchSurroundingDocs(...args),
  };
});

jest.mock('../services/anchor', () => ({
  fetchAnchor: (anchorId: string, dataView: DataView) => {
    if (!dataView.id || !anchorId) {
      throw new Error();
    }
    return {
      anchorRow: mockAnchorHit,
      interceptedWarnings: mockOverrideInterceptedWarnings ? [mockInterceptedWarning] : undefined,
    };
  },
}));

const initDefaults = (
  tieBreakerFields: string[],
  dataViewId = 'the-data-view-id',
  predecessorCount = 2,
  successorCount = 2
) => {
  const dangerNotification = jest.fn();
  const services = createDiscoverServicesMock();

  services.toastNotifications.addDanger = dangerNotification;
  services.uiSettings.get = ((key: string) => {
    if (key === CONTEXT_TIE_BREAKER_FIELDS_SETTING) {
      return tieBreakerFields;
    }
  }) as unknown as DiscoverServices['uiSettings']['get'];

  const props = {
    dangerNotification,
    props: {
      anchorId: 'mock_anchor_id',
      dataView: { ...dataViewWithTimefieldMock, id: dataViewId },
      appState: {
        predecessorCount,
        successorCount,
      },
    } as ContextAppFetchProps,
  };

  // Reset and setup mock implementation
  mockFetchSurroundingDocs.mockReset();
  mockFetchSurroundingDocs.mockImplementation((type: string, dataView: DataView) => {
    if (!dataView || !dataView.id) {
      throw new Error();
    }
    return {
      rows: type === 'predecessors' ? mockPredecessorHits : mockSuccessorHits,
      interceptedWarnings: mockOverrideInterceptedWarnings ? [mockInterceptedWarning] : undefined,
    };
  });

  return {
    result: renderHook(() => useContextAppFetch(props.props), {
      wrapper: ({ children }: React.PropsWithChildren) => (
        <DiscoverTestProvider services={services}>{children}</DiscoverTestProvider>
      ),
    }).result,
    dangerNotification,
  };
};

describe('test useContextAppFetch', () => {
  it('should fetch all correctly', async () => {
    const { result } = initDefaults(['_doc']);

    expect(result.current.fetchedState.anchorStatus.value).toBe(LoadingStatus.UNINITIALIZED);
    expect(result.current.fetchedState.predecessorsStatus.value).toBe(LoadingStatus.UNINITIALIZED);
    expect(result.current.fetchedState.successorsStatus.value).toBe(LoadingStatus.UNINITIALIZED);

    await act(async () => {
      await result.current.fetchAllRows();
    });

    expect(result.current.fetchedState.anchorStatus.value).toBe(LoadingStatus.LOADED);
    expect(result.current.fetchedState.predecessorsStatus.value).toBe(LoadingStatus.LOADED);
    expect(result.current.fetchedState.successorsStatus.value).toBe(LoadingStatus.LOADED);
    expect(result.current.fetchedState.anchor).toEqual({ ...mockAnchorHit, isAnchor: true });
    expect(result.current.fetchedState.predecessors).toEqual(mockPredecessorHits);
    expect(result.current.fetchedState.successors).toEqual(mockSuccessorHits);
    expect(result.current.fetchedState.predecessorsInterceptedWarnings).toBeUndefined();
    expect(result.current.fetchedState.successorsInterceptedWarnings).toBeUndefined();
    expect(result.current.fetchedState.anchorInterceptedWarnings).toBeUndefined();
  });

  it('should set anchorStatus to failed when tieBreakingField array is empty', async () => {
    const { result } = initDefaults([]);

    expect(result.current.fetchedState.anchorStatus.value).toBe(LoadingStatus.UNINITIALIZED);

    await act(async () => {
      await result.current.fetchAllRows();
    });

    expect(result.current.fetchedState.anchorStatus.value).toBe(LoadingStatus.FAILED);
    expect(result.current.fetchedState.anchorStatus.reason).toBe(FailureReason.INVALID_TIEBREAKER);
    expect(result.current.fetchedState.anchor).toEqual({});
    expect(result.current.fetchedState.predecessors).toEqual([]);
    expect(result.current.fetchedState.successors).toEqual([]);
  });

  it('should set anchorStatus to failed when invalid dataViewId provided', async () => {
    const { result, dangerNotification } = initDefaults(['_doc'], '');

    expect(result.current.fetchedState.anchorStatus.value).toBe(LoadingStatus.UNINITIALIZED);

    await act(async () => {
      await result.current.fetchAllRows();
    });

    expect(dangerNotification.mock.calls.length).toBe(1);
    expect(result.current.fetchedState.anchorStatus.value).toBe(LoadingStatus.FAILED);
    expect(result.current.fetchedState.anchorStatus.reason).toBe(FailureReason.UNKNOWN);
    expect(result.current.fetchedState.anchor).toEqual({});
    expect(result.current.fetchedState.predecessors).toEqual([]);
    expect(result.current.fetchedState.successors).toEqual([]);
  });

  it('should fetch context rows correctly', async () => {
    const { result } = initDefaults(['_doc']);

    expect(result.current.fetchedState.predecessorsStatus.value).toBe(LoadingStatus.UNINITIALIZED);
    expect(result.current.fetchedState.successorsStatus.value).toBe(LoadingStatus.UNINITIALIZED);

    await act(async () => {
      await result.current.fetchContextRows(mockAnchorHit);
    });

    expect(result.current.fetchedState.predecessorsStatus.value).toBe(LoadingStatus.LOADED);
    expect(result.current.fetchedState.successorsStatus.value).toBe(LoadingStatus.LOADED);
    expect(result.current.fetchedState.predecessors).toEqual(mockPredecessorHits);
    expect(result.current.fetchedState.successors).toEqual(mockSuccessorHits);
  });

  it('should set context rows statuses to failed when invalid dataViewId provided', async () => {
    const { result, dangerNotification } = initDefaults(['_doc'], '');

    expect(result.current.fetchedState.predecessorsStatus.value).toBe(LoadingStatus.UNINITIALIZED);
    expect(result.current.fetchedState.successorsStatus.value).toBe(LoadingStatus.UNINITIALIZED);

    await act(async () => {
      await result.current.fetchContextRows(mockAnchorHit);
    });

    expect(dangerNotification.mock.calls.length).toBe(2); // for successors and predecessors
    expect(result.current.fetchedState.predecessorsStatus.value).toBe(LoadingStatus.FAILED);
    expect(result.current.fetchedState.successorsStatus.value).toBe(LoadingStatus.FAILED);
    expect(result.current.fetchedState.successorsStatus.reason).toBe(FailureReason.UNKNOWN);
    expect(result.current.fetchedState.successorsStatus.reason).toBe(FailureReason.UNKNOWN);
    expect(result.current.fetchedState.predecessors).toEqual([]);
    expect(result.current.fetchedState.successors).toEqual([]);
  });

  it('should handle warnings', async () => {
    mockOverrideInterceptedWarnings = true;

    const { result } = initDefaults(['_doc']);

    expect(result.current.fetchedState.anchorStatus.value).toBe(LoadingStatus.UNINITIALIZED);
    expect(result.current.fetchedState.predecessorsStatus.value).toBe(LoadingStatus.UNINITIALIZED);
    expect(result.current.fetchedState.successorsStatus.value).toBe(LoadingStatus.UNINITIALIZED);

    await act(async () => {
      await result.current.fetchAllRows();
    });

    expect(result.current.fetchedState.anchorStatus.value).toBe(LoadingStatus.LOADED);
    expect(result.current.fetchedState.predecessorsStatus.value).toBe(LoadingStatus.LOADED);
    expect(result.current.fetchedState.successorsStatus.value).toBe(LoadingStatus.LOADED);
    expect(result.current.fetchedState.anchor).toEqual({ ...mockAnchorHit, isAnchor: true });
    expect(result.current.fetchedState.predecessors).toEqual(mockPredecessorHits);
    expect(result.current.fetchedState.successors).toEqual(mockSuccessorHits);
    expect(result.current.fetchedState.predecessorsInterceptedWarnings).toEqual([
      mockInterceptedWarning,
    ]);
    expect(result.current.fetchedState.successorsInterceptedWarnings).toEqual([
      mockInterceptedWarning,
    ]);
    expect(result.current.fetchedState.anchorInterceptedWarnings).toEqual([mockInterceptedWarning]);
  });

  it('should pass correct size parameter from appState to fetchSurroundingDocs', async () => {
    const predecessorCount = 7;
    const successorCount = 3;
    const { result } = initDefaults(['_doc'], 'the-data-view-id', predecessorCount, successorCount);

    await act(async () => {
      await result.current.fetchAllRows();
    });

    // Verify fetchSurroundingDocs was called with correct size for predecessors
    const predecessorCalls = mockFetchSurroundingDocs.mock.calls.filter(
      (call) => call[0] === 'predecessors'
    );
    expect(predecessorCalls.length).toBeGreaterThan(0);
    expect(predecessorCalls[0][5]).toBe(predecessorCount); // size is the 6th parameter (index 5)

    // Verify fetchSurroundingDocs was called with correct size for successors
    const successorCalls = mockFetchSurroundingDocs.mock.calls.filter(
      (call) => call[0] === 'successors'
    );
    expect(successorCalls.length).toBeGreaterThan(0);
    expect(successorCalls[0][5]).toBe(successorCount); // size is the 6th parameter (index 5)
  });
});
