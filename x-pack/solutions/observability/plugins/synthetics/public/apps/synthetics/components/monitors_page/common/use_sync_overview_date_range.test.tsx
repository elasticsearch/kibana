/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { useDispatch } from 'react-redux';
import { WrappedHelper } from '../../../utils/testing';
import { setOverviewPageStateAction } from '../../../state';
import { useSyncOverviewDateRange } from './use_sync_overview_date_range';

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useDispatch: jest.fn(),
}));

/**
 * The overview always scopes status by the page-level date picker, so the URL
 * range has to reach `pageState` (where the overview-status fetch reads it).
 * This hook is mounted above the grid's empty-state early return so the sync
 * keeps working even when `<NoMonitorsFound />` replaces the toolbar.
 */
describe('useSyncOverviewDateRange', () => {
  const dispatch = jest.fn();

  beforeEach(() => {
    dispatch.mockReset();
    (useDispatch as jest.Mock).mockReturnValue(dispatch);
  });

  const renderForUrl = (url: string) => {
    const history = createMemoryHistory({ initialEntries: [url] });
    const wrapper = ({ children }: React.PropsWithChildren) => (
      <WrappedHelper history={history}>{children as React.ReactElement}</WrappedHelper>
    );
    const result = renderHook(() => useSyncOverviewDateRange(), { wrapper });
    return { ...result, history };
  };

  const findCalls = (actionCreator: { type: string }) =>
    dispatch.mock.calls.filter(([action]) => action?.type === actionCreator.type);

  it('mirrors the URL date range into pageState on mount', () => {
    renderForUrl('/?dateRangeStart=now-7d&dateRangeEnd=now');

    expect(findCalls(setOverviewPageStateAction)).toHaveLength(1);
    expect(dispatch).toHaveBeenCalledWith(
      setOverviewPageStateAction({ dateRangeStart: 'now-7d', dateRangeEnd: 'now' })
    );
  });

  it('falls back to the overview default range when the URL has none', () => {
    renderForUrl('/');

    expect(dispatch).toHaveBeenCalledWith(
      setOverviewPageStateAction({ dateRangeStart: 'now-12h', dateRangeEnd: 'now' })
    );
  });

  it('mirrors subsequent picker changes into pageState', () => {
    const { history } = renderForUrl('/?dateRangeStart=now-24h&dateRangeEnd=now');
    dispatch.mockClear();

    act(() => {
      history.push('/?dateRangeStart=now-7d&dateRangeEnd=now');
    });

    expect(dispatch).toHaveBeenCalledWith(
      setOverviewPageStateAction({ dateRangeStart: 'now-7d', dateRangeEnd: 'now' })
    );
  });
});
