/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, PropsWithChildren } from 'react';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import {
  API_VERSIONS,
  INBOX_ACTIONS_HISTORY_URL,
  INBOX_ACTIONS_URL,
  type ListInboxActionsHistoryResponse,
  type ListInboxActionsResponse,
} from '@kbn/inbox-common';
import { useInboxActions, useInboxActionsHistory } from './use_inbox_api';
import { createStubInboxAction } from '../../common/test_helpers';

jest.mock('@kbn/kibana-react-plugin/public');

const useKibanaMock = useKibana as jest.MockedFunction<typeof useKibana>;

const createWrapper = (): FC<PropsWithChildren<{}>> => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useInboxActions', () => {
  let httpGet: jest.Mock;

  const mockResponse: ListInboxActionsResponse = {
    actions: [createStubInboxAction()],
    total: 1,
  };

  beforeEach(() => {
    httpGet = jest.fn().mockResolvedValue(mockResponse);
    useKibanaMock.mockReturnValue({
      services: {
        http: { get: httpGet },
      },
    } as unknown as ReturnType<typeof useKibana>);
  });

  it('issues a GET against INBOX_ACTIONS_URL pinned to the v1 internal API version', async () => {
    const { result } = renderHook(() => useInboxActions(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(httpGet).toHaveBeenCalledTimes(1);
    const [url, options] = httpGet.mock.calls[0];
    expect(url).toBe(INBOX_ACTIONS_URL);
    expect(options.version).toBe(API_VERSIONS.internal.v1);
    expect(result.current.data).toEqual(mockResponse);
  });

  it('omits query params entirely when no filters are provided', async () => {
    const { result } = renderHook(() => useInboxActions(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = httpGet.mock.calls[0];
    expect(options.query).toEqual({});
  });

  it('translates camelCase hook filters into snake_case API query params', async () => {
    const { result } = renderHook(
      () =>
        useInboxActions({
          status: 'pending',
          sourceApp: 'securitySolution',
          page: 2,
          perPage: 10,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = httpGet.mock.calls[0];
    expect(options.query).toEqual({
      status: 'pending',
      source_app: 'securitySolution',
      page: 2,
      per_page: 10,
    });
  });

  it('includes only the filters that are set', async () => {
    const { result } = renderHook(() => useInboxActions({ status: 'approved' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = httpGet.mock.calls[0];
    expect(options.query).toEqual({ status: 'approved' });
  });
});

describe('useInboxActionsHistory', () => {
  let httpGet: jest.Mock;

  const mockResponse: ListInboxActionsHistoryResponse = {
    actions: [
      createStubInboxAction({
        status: 'approved',
        responded_at: '2026-04-24T16:00:00.000Z',
        response_input: { approved: true },
      }),
    ],
    total: 1,
  };

  beforeEach(() => {
    httpGet = jest.fn().mockResolvedValue(mockResponse);
    useKibanaMock.mockReturnValue({
      services: { http: { get: httpGet } },
    } as unknown as ReturnType<typeof useKibana>);
  });

  it('issues a GET against INBOX_ACTIONS_HISTORY_URL pinned to the v1 internal API version', async () => {
    const { result } = renderHook(() => useInboxActionsHistory(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(httpGet).toHaveBeenCalledTimes(1);
    const [url, options] = httpGet.mock.calls[0];
    expect(url).toBe(INBOX_ACTIONS_HISTORY_URL);
    expect(options.version).toBe(API_VERSIONS.internal.v1);
    expect(result.current.data).toEqual(mockResponse);
  });

  it('translates camelCase filters into the history endpoint query params', async () => {
    const { result } = renderHook(
      () => useInboxActionsHistory({ sourceApp: 'workflows', page: 2, perPage: 10 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, options] = httpGet.mock.calls[0];
    expect(options.query).toEqual({ source_app: 'workflows', page: 2, per_page: 10 });
  });
});
