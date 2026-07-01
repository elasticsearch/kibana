/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PropsWithChildren } from 'react';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { useRefreshHelper } from './use_refresh_helper';
import type { WorkpadRoutingContextType } from '../workpad_routing_context';
import { WorkpadRoutingContext } from '../workpad_routing_context';

const mockDispatch = jest.fn();
const mockGetState = jest.fn();
const refreshAction = { type: 'refreshWorkpad' };

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: any) => selector(mockGetState()),
}));

jest.mock('../../../state/actions/workpad', () => ({
  refreshWorkpad: () => refreshAction,
}));

const getMockedContext = (context: any) =>
  ({
    refreshInterval: 0,
    ...context,
  } as WorkpadRoutingContextType);

const getContextWrapper =
  (context: WorkpadRoutingContextType) =>
  ({ children }: PropsWithChildren) =>
    <WorkpadRoutingContext.Provider value={context}>{children}</WorkpadRoutingContext.Provider>;

describe('useRefreshHelper', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers({ legacyFakeTimers: true });
  });

  test('starts a timer to refresh', () => {
    const context = getMockedContext({
      refreshInterval: 1,
    });
    const state = {
      transient: {
        inFlight: false,
      },
    };

    mockGetState.mockReturnValue(state);

    renderHook(useRefreshHelper, { wrapper: getContextWrapper(context) });
    expect(mockDispatch).not.toHaveBeenCalledWith(refreshAction);

    jest.runAllTimers();
    expect(mockDispatch).toHaveBeenCalledWith(refreshAction);
  });

  test('cancels a timer when inflight is active', () => {
    const context = getMockedContext({
      refreshInterval: 100,
    });

    const state = {
      transient: {
        inFlight: false,
      },
    };

    mockGetState.mockReturnValue(state);
    const { rerender } = renderHook(useRefreshHelper, { wrapper: getContextWrapper(context) });

    jest.advanceTimersByTime(context.refreshInterval - 1);
    expect(mockDispatch).not.toHaveBeenCalledWith(refreshAction);

    state.transient.inFlight = true;

    rerender(useRefreshHelper);

    jest.runAllTimers();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
