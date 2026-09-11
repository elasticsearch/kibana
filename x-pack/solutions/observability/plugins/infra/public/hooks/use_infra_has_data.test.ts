/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { FETCH_STATUS } from './use_fetcher';
import { useInfraHasData } from './use_infra_has_data';

const mockUseFetcher = jest.fn();

jest.mock('./use_fetcher', () => ({
  ...jest.requireActual('./use_fetcher'),
  useFetcher: (...args: unknown[]) => mockUseFetcher(...args),
}));

describe('useInfraHasData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('asks for cluster-level metrics existence rather than the current time range', async () => {
    mockUseFetcher.mockReturnValue({ data: { hasData: true }, status: FETCH_STATUS.SUCCESS });

    renderHook(() => useInfraHasData());

    type FetchCallback = (callApi: jest.Mock) => Promise<unknown>;
    const [fetchCallback] = mockUseFetcher.mock.calls[0] as [FetchCallback];
    const callApi = jest.fn();
    await fetchCallback(callApi);

    expect(callApi).toHaveBeenCalledWith('/api/metrics/source/hasData', {
      method: 'GET',
      query: { source: 'all' },
    });
  });

  it('reports data and skips onboarding when metrics exist', () => {
    mockUseFetcher.mockReturnValue({ data: { hasData: true }, status: FETCH_STATUS.SUCCESS });

    const { result } = renderHook(() => useInfraHasData());

    expect(result.current).toEqual({ hasData: true, loading: false, showOnboarding: false });
  });

  it('shows onboarding when the check succeeds and the cluster is empty', () => {
    mockUseFetcher.mockReturnValue({ data: { hasData: false }, status: FETCH_STATUS.SUCCESS });

    const { result } = renderHook(() => useInfraHasData());

    expect(result.current).toEqual({ hasData: false, loading: false, showOnboarding: true });
  });

  it('does not show onboarding while the check is pending', () => {
    mockUseFetcher.mockReturnValue({ data: undefined, status: FETCH_STATUS.LOADING });

    const { result } = renderHook(() => useInfraHasData());

    expect(result.current).toEqual({ hasData: false, loading: true, showOnboarding: false });
  });

  it('fails open so a failed check keeps the page instead of swapping in onboarding', () => {
    mockUseFetcher.mockReturnValue({ data: undefined, status: FETCH_STATUS.FAILURE });

    const { result } = renderHook(() => useInfraHasData());

    expect(result.current).toEqual({ hasData: false, loading: false, showOnboarding: false });
  });
});
