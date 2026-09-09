/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RunningQuery } from '../../../common/types';
import { QueryDetailFlyout } from './query_detail_flyout';
import { useQueryActivityAppContext, type QueryActivityAppContextValue } from '../app_context';

jest.mock('../app_context', () => ({
  __esModule: true,
  useQueryActivityAppContext: jest.fn(),
}));

const mockUseQueryActivityAppContext = useQueryActivityAppContext as jest.MockedFunction<
  typeof useQueryActivityAppContext
>;

const createQuery = (overrides: Partial<RunningQuery> = {}): RunningQuery => ({
  taskId: 'node1:123',
  queryType: 'DSL',
  source: 'Discover',
  startTime: Date.now() - 60_000,
  runningTimeMs: 60_000,
  indices: 1,
  query: '{"query":{"match_all":{}}}',
  cancellable: true,
  cancelled: false,
  ...overrides,
});

const mockContext = (
  fetchQueryDetails: jest.Mock,
  discoverLocator?: { getRedirectUrl: jest.Mock }
) =>
  ({
    chrome: {} as any,
    dataViews: { get: jest.fn().mockResolvedValue({}) } as any,
    http: { basePath: { prepend: jest.fn((path: string) => path) } } as any,
    notifications: {} as any,
    apiService: { fetchQueryDetails } as any,
    url: {
      locators: {
        get: jest.fn(() => discoverLocator),
      },
    } as any,
    docLinks: {
      links: {
        management: {
          queryActivity: 'https://www.elastic.co/guide/en/kibana/current/query-activity.html',
        },
      },
    } as any,
    capabilities: {
      canCancelTasks: true,
      canViewTasks: true,
      isLoading: false,
      missingClusterPrivileges: [],
    },
  } as QueryActivityAppContextValue);

const renderFlyout = (
  query: RunningQuery,
  overrides: {
    onStopQuery?: jest.Mock;
    onQueryNoLongerRunning?: jest.Mock;
  } = {}
) => {
  const onStopQuery = overrides.onStopQuery ?? jest.fn();
  const renderResult = renderWithKibanaRenderContext(
    <QueryDetailFlyout
      summary={query}
      isStopRequested={false}
      onClose={() => {}}
      onStopQuery={onStopQuery}
      onQueryNoLongerRunning={overrides.onQueryNoLongerRunning}
    />
  );
  return { onStopQuery, ...renderResult };
};

describe('QueryDetailFlyout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a loading state while fetching details', () => {
    const fetchQueryDetails = jest.fn(() => new Promise(() => {}));
    mockUseQueryActivityAppContext.mockReturnValue(mockContext(fetchQueryDetails));

    renderFlyout(createQuery());

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders fetched details and the trace ID link', async () => {
    const query = createQuery({ traceId: 'trace-123' });
    const fetchQueryDetails = jest.fn().mockResolvedValue({
      data: { query },
      error: null,
    });
    const discoverLocator = {
      getRedirectUrl: jest.fn(() => '/app/discover#/?_a=()'),
    };
    mockUseQueryActivityAppContext.mockReturnValue(mockContext(fetchQueryDetails, discoverLocator));

    renderFlyout(query);

    const link = await screen.findByTestId('queryActivityFlyoutTraceIdLink');
    expect(link).toHaveTextContent('trace-123');
    expect(fetchQueryDetails).toHaveBeenCalledWith(query.taskId);
  });

  it('shows when the query completed and requests a list refresh', async () => {
    const fetchQueryDetails = jest.fn().mockResolvedValue({
      data: null,
      error: { attributes: { code: 'QUERY_NOT_FOUND' } },
    });
    const onQueryNoLongerRunning = jest.fn();
    mockUseQueryActivityAppContext.mockReturnValue(mockContext(fetchQueryDetails));

    renderFlyout(createQuery(), { onQueryNoLongerRunning });

    expect(await screen.findByText('This query is no longer running')).toBeInTheDocument();
    expect(onQueryNoLongerRunning).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Cancel query' })).not.toBeInTheDocument();
  });

  it('shows a generic error when details cannot be loaded', async () => {
    const fetchQueryDetails = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'Unavailable' },
    });
    mockUseQueryActivityAppContext.mockReturnValue(mockContext(fetchQueryDetails));

    renderFlyout(createQuery());

    expect(await screen.findByText('Unable to load query details')).toBeInTheDocument();
  });

  it('allows cancellation while details are loading', async () => {
    const user = userEvent.setup();
    const query = createQuery();
    const fetchQueryDetails = jest.fn(() => new Promise(() => {}));
    const onStopQuery = jest.fn();
    mockUseQueryActivityAppContext.mockReturnValue(mockContext(fetchQueryDetails));

    renderFlyout(query, { onStopQuery });
    await user.click(screen.getByRole('button', { name: 'Cancel query' }));

    await waitFor(() => expect(onStopQuery).toHaveBeenCalledWith(query.taskId));
  });

  it('ignores a detail response after the flyout closes', async () => {
    let resolveRequest: (value: {
      data: null;
      error: { attributes: { code: string } };
    }) => void = () => {};
    const fetchQueryDetails = jest.fn(
      () =>
        new Promise<{
          data: null;
          error: { attributes: { code: string } };
        }>((resolve) => {
          resolveRequest = resolve;
        })
    );
    const onQueryNoLongerRunning = jest.fn();
    mockUseQueryActivityAppContext.mockReturnValue(mockContext(fetchQueryDetails));

    const { unmount } = renderFlyout(createQuery(), { onQueryNoLongerRunning });
    unmount();
    resolveRequest({
      data: null,
      error: { attributes: { code: 'QUERY_NOT_FOUND' } },
    });

    await Promise.resolve();
    expect(onQueryNoLongerRunning).not.toHaveBeenCalled();
  });
});
