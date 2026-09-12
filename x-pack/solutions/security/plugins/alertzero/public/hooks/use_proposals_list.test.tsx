/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { coreMock } from '@kbn/core/public/mocks';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { API_VERSIONS, ALERTZERO_PROPOSALS_URL } from '@kbn/alertzero-common';
import type { GetProposalsListResponse } from '../../common/proposals/list';
import { queryKeys } from '../query_keys';
import { useProposalsList, DEFAULT_PROPOSALS_WINDOW_HOURS } from './use_proposals_list';

const makeResponse = (
  overrides: Partial<GetProposalsListResponse> = {}
): GetProposalsListResponse => ({
  groups: { closed: [] },
  total: 0,
  truncated: false,
  ...overrides,
});

const createWrapper = (get: jest.Mock, queryClient: QueryClient) => {
  const services = { ...coreMock.createStart(), http: { get } };
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <KibanaContextProvider services={services}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </KibanaContextProvider>
  );
  return Wrapper;
};

describe('useProposalsList', () => {
  it('requests the grouped list with the AlertZero internal v1 version', async () => {
    // The version is the whole point: this route does NOT take
    // AGENTIC_INVESTIGATIONS_API_VERSION, and passing it is a runtime 400 the types
    // can't catch.
    const response = makeResponse();
    const get = jest.fn().mockResolvedValue(response);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = createWrapper(get, queryClient);

    const { result } = renderHook(() => useProposalsList(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(get).toHaveBeenCalledWith(ALERTZERO_PROPOSALS_URL, {
      version: API_VERSIONS.internal.v1,
      query: { windowHours: DEFAULT_PROPOSALS_WINDOW_HOURS },
    });
  });

  it('passes an explicit window through to the query', async () => {
    const get = jest.fn().mockResolvedValue(makeResponse());
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = createWrapper(get, queryClient);

    const { result } = renderHook(() => useProposalsList(72), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(get).toHaveBeenCalledWith(ALERTZERO_PROPOSALS_URL, {
      version: API_VERSIONS.internal.v1,
      query: { windowHours: 72 },
    });
  });

  it('keys the cache separately from the per-conversation list', async () => {
    // A shared key would let this hook surface a flat payload with no `groups`.
    const flatResponse = { proposals: [], total: 0 };
    const groupedResponse = makeResponse({ groups: { closed: [], investigate: [] } });
    const get = jest.fn().mockResolvedValue(groupedResponse);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // Pre-seed the per-conversation cache so a key collision would cause a cache hit.
    queryClient.setQueryData(queryKeys.proposals.list(), flatResponse);

    const wrapper = createWrapper(get, queryClient);
    const { result } = renderHook(() => useProposalsList(), { wrapper });

    // Should be a cache miss: the hook must actually call the server.
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);

    // And the data should have the grouped shape, not the flat one.
    expect(result.current.data).toHaveProperty('groups');
  });

  it('keeps the previous groups while a new window is fetching', async () => {
    // keepPreviousData is silently droppable in a refactor; this pins it.
    const firstResponse = makeResponse({ groups: { closed: [], investigate: [] }, total: 0 });
    let resolveSecond: ((v: GetProposalsListResponse) => void) | undefined;
    const get = jest
      .fn()
      .mockResolvedValueOnce(firstResponse)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          })
      );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = createWrapper(get, queryClient);

    const { result, rerender } = renderHook(
      ({ hours }: { hours: number }) => useProposalsList(hours),
      {
        wrapper,
        initialProps: { hours: 24 },
      }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(firstResponse);

    // Switch to a different window — the hook switches query keys.
    rerender({ hours: 48 });
    await waitFor(() => expect(result.current.isFetching).toBe(true));

    // Previous data must still be present while the new request is in-flight.
    expect(result.current.data).toBe(firstResponse);

    // Resolve the second request so the hook settles cleanly.
    resolveSecond!(makeResponse());
    await waitFor(() => expect(result.current.isFetching).toBe(false));
  });
});
