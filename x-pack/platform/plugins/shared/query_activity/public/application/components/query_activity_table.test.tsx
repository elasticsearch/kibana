/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RunningQuery } from '../../../common/types';
import { QueryActivityTable } from './query_activity_table';
import { useQueryActivityAppContext, type QueryActivityAppContextValue } from '../app_context';

jest.mock('../app_context', () => ({
  __esModule: true,
  useQueryActivityAppContext: jest.fn(),
}));

const mockUseQueryActivityAppContext = useQueryActivityAppContext as jest.MockedFunction<
  typeof useQueryActivityAppContext
>;

const STOP_REQUESTED_STORAGE_KEY = 'xpack.queryActivity.stopRequestedTasks';

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

const mockContext = (overrides: Partial<QueryActivityAppContextValue> = {}) =>
  ({
    chrome: {} as any,
    http: { basePath: { prepend: jest.fn((path: string) => path) } } as any,
    notifications: {} as any,
    apiService: {
      fetchQueryDetails: jest.fn().mockResolvedValue({
        data: { query: createQuery() },
        error: null,
      }),
    } as any,
    url: {
      locators: {
        get: jest.fn(() => undefined),
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
    ...overrides,
  } as QueryActivityAppContextValue);

const renderTable = async (params: {
  queries: RunningQuery[];
  canCancelTasks?: boolean;
  onCancelQuery?: (taskId: string) => Promise<boolean>;
  contextOverrides?: Partial<QueryActivityAppContextValue>;
}) => {
  const user = userEvent.setup();

  const { queries, canCancelTasks = true } = params;
  const onCancelQuery = params.onCancelQuery ?? jest.fn().mockResolvedValue(true);

  mockUseQueryActivityAppContext.mockReturnValue(
    mockContext({
      capabilities: {
        canCancelTasks,
        canViewTasks: true,
        isLoading: false,
        missingClusterPrivileges: [],
      },
      ...params.contextOverrides,
    })
  );

  renderWithKibanaRenderContext(
    <QueryActivityTable queries={queries} onCancelQuery={onCancelQuery} />
  );

  return { user, onCancelQuery };
};

describe('QueryActivityTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('renders the "Not available" label when source is empty', async () => {
    const query = createQuery({ source: '' });
    await renderTable({ queries: [query] });

    expect(await screen.findByText(query.taskId)).toBeInTheDocument();
    expect(screen.getByText('Not available')).toBeInTheDocument();
  });

  it('shows the stop action only when the user can cancel tasks and the query is cancellable', async () => {
    const query = createQuery({ cancellable: true, cancelled: false });

    await renderTable({ queries: [query], canCancelTasks: true });
    expect(await screen.findByLabelText('Cancel query')).toBeInTheDocument();

    cleanup();
    await renderTable({ queries: [query], canCancelTasks: false });
    expect(screen.queryByLabelText('Cancel query')).not.toBeInTheDocument();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();

    cleanup();
    await renderTable({ queries: [createQuery({ cancellable: false })], canCancelTasks: true });
    expect(screen.queryByLabelText('Cancel query')).not.toBeInTheDocument();

    cleanup();
    await renderTable({ queries: [createQuery({ cancelled: true })], canCancelTasks: true });
    expect(screen.queryByLabelText('Cancel query')).not.toBeInTheDocument();
  });

  it('opens the query detail flyout when clicking the task id', async () => {
    const query = createQuery({ taskId: 'node1:flyout' });
    const fetchQueryDetails = jest.fn().mockResolvedValue({
      data: { query },
      error: null,
    });
    const { user } = await renderTable({
      queries: [query],
      contextOverrides: {
        apiService: { fetchQueryDetails } as any,
      },
    });

    await user.click(await screen.findByText(query.taskId));

    expect(await screen.findByText('Indices')).toBeInTheDocument();
    expect(fetchQueryDetails).toHaveBeenCalledWith(query.taskId);
  });

  it('cancels a query after confirmation and shows the "Cancelling the query…" state', async () => {
    const query = createQuery({ taskId: 'node1:stop' });
    const onCancelQuery = jest.fn().mockResolvedValue(true);
    const { user } = await renderTable({ queries: [query], onCancelQuery });

    await user.click(await screen.findByLabelText('Cancel query'));
    expect(await screen.findByText('Cancel this query?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel the query' }));

    await waitFor(() => {
      expect(onCancelQuery).toHaveBeenCalledWith(query.taskId);
    });

    expect(await screen.findByText(/Cancel(l)?ing the query/)).toBeInTheDocument();
  });

  it('renders the "Cancelling the query…" state when localStorage is pre-seeded', async () => {
    const query = createQuery({ taskId: 'node1:seeded' });
    window.localStorage.setItem(
      STOP_REQUESTED_STORAGE_KEY,
      JSON.stringify({ [query.taskId]: Date.now() })
    );

    await renderTable({ queries: [query], canCancelTasks: true });

    expect(await screen.findByText(/Cancel(l)?ing the query/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Cancel query')).not.toBeInTheDocument();
  });
});
