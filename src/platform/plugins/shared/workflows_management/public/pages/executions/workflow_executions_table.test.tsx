/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { EXECUTION_TABLE_DEFAULT_PAGE_SIZE } from './workflow_executions_page_constants';
import { WorkflowExecutionsTable } from './workflow_executions_table';
import { WORKFLOWS_EXECUTIONS_MAX_RESULT_WINDOW } from '../../../common';
import { useSerialPolling } from '../../hooks/use_serial_polling';
import { createStartServicesMock } from '../../mocks';
import { getTestProvider } from '../../shared/mocks/test_providers';

jest.setTimeout(30_000);

const mockSetSelectedExecution = jest.fn();
const mockUseWorkflowUrlState = jest.fn(() => ({
  selectedExecutionId: undefined as string | undefined,
  setSelectedExecution: mockSetSelectedExecution,
}));
jest.mock('../../hooks/use_workflow_url_state', () => ({
  useWorkflowUrlState: () => mockUseWorkflowUrlState(),
}));

jest.mock('../../hooks/use_serial_polling', () => ({
  useSerialPolling: jest.fn(),
}));

const mockUseSerialPolling = jest.mocked(useSerialPolling);

jest.mock('./workflow_executions_data_grid', () => ({
  WorkflowExecutionsDataGrid: () => <div data-test-subj="workflowExecutionsDataGridStub" />,
}));

const lastReachablePageIndex = Math.max(
  0,
  Math.floor(WORKFLOWS_EXECUTIONS_MAX_RESULT_WINDOW / EXECUTION_TABLE_DEFAULT_PAGE_SIZE) - 1
);

describe('WorkflowExecutionsTable', () => {
  const defaultQuery = { query: '', language: 'kuery' as const };
  const defaultTimeRange = { from: 'now-24h', to: 'now' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWorkflowUrlState.mockReturnValue({
      selectedExecutionId: undefined,
      setSelectedExecution: mockSetSelectedExecution,
    });
  });

  it('calls the internal executions search API', async () => {
    const services = createStartServicesMock();
    jest.mocked(services.http.get).mockResolvedValue({
      results: [],
      page: 1,
      size: EXECUTION_TABLE_DEFAULT_PAGE_SIZE,
      total: 0,
    });

    render(
      <WorkflowExecutionsTable
        filters={[]}
        query={defaultQuery}
        spaceId="my-space"
        timeRange={defaultTimeRange}
      />,
      { wrapper: getTestProvider({ services }) }
    );

    await waitFor(() => {
      expect(screen.getByTestId('workflowExecutionsTableEmpty')).toBeInTheDocument();
    });

    expect(services.http.get).toHaveBeenCalledWith(
      '/api/workflows/workflow/executions',
      expect.objectContaining({
        version: '2023-10-31',
        query: expect.objectContaining({
          page: 1,
          size: EXECUTION_TABLE_DEFAULT_PAGE_SIZE,
          trackTotalHits: true,
          sortField: expect.any(String),
          sortOrder: expect.any(String),
        }),
      })
    );
  });

  it('configures live polling with the current search key', async () => {
    const services = createStartServicesMock();
    jest.mocked(services.http.get).mockResolvedValue({
      results: [],
      page: 1,
      size: 25,
      total: 0,
    });

    render(
      <WorkflowExecutionsTable
        filters={[]}
        liveUpdateIntervalMs={2500}
        query={defaultQuery}
        spaceId="my-space"
        timeRange={defaultTimeRange}
      />,
      { wrapper: getTestProvider({ services }) }
    );

    await waitFor(() => {
      expect(screen.getByTestId('workflowExecutionsTableEmpty')).toBeInTheDocument();
    });
    expect(mockUseSerialPolling).toHaveBeenCalledWith({
      enabled: true,
      immediate: false,
      intervalMs: 2500,
      pollKey: expect.any(String),
      poll: expect.any(Function),
    });

    const { poll } = mockUseSerialPolling.mock.calls[0][0];
    await poll();
    await waitFor(() => expect(services.http.get).toHaveBeenCalledTimes(2));
  });

  it('shows empty state when search returns no executions', async () => {
    const services = createStartServicesMock();
    jest.mocked(services.http.get).mockResolvedValue({
      results: [],
      page: 1,
      size: EXECUTION_TABLE_DEFAULT_PAGE_SIZE,
      total: 0,
    });

    render(
      <WorkflowExecutionsTable
        filters={[]}
        query={defaultQuery}
        spaceId="default"
        timeRange={defaultTimeRange}
      />,
      { wrapper: getTestProvider({ services }) }
    );

    await waitFor(() => {
      expect(screen.getByTestId('workflowExecutionsTableEmpty')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('workflowExecutionsTableError')).not.toBeInTheDocument();
  });

  it('does not show a persistent pagination-limit callout when total exceeds the result window', async () => {
    const services = createStartServicesMock();

    jest.mocked(services.http.get).mockResolvedValue({
      results: [
        {
          id: 'exec-1',
          spaceId: 'default',
          workflowId: 'wf-1',
          status: 'completed',
          isTestRun: false,
          startedAt: '2024-01-01T10:00:00Z',
          finishedAt: '2024-01-01T10:00:03Z',
          duration: 3000,
          error: null,
        },
      ],
      page: 1,
      size: EXECUTION_TABLE_DEFAULT_PAGE_SIZE,
      total: WORKFLOWS_EXECUTIONS_MAX_RESULT_WINDOW + 500,
    });

    render(
      <WorkflowExecutionsTable
        filters={[]}
        query={defaultQuery}
        spaceId="default"
        timeRange={defaultTimeRange}
      />,
      { wrapper: getTestProvider({ services }) }
    );

    await waitFor(() => {
      expect(screen.getByTestId('workflowExecutionsTable')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('workflowExecutionsTablePaginationLimit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('executionsTableEndOfResults')).not.toBeInTheDocument();
  });

  it('shows the end-of-results strip on the last reachable page when total exceeds the window', async () => {
    const services = createStartServicesMock();

    jest.mocked(services.http.get).mockResolvedValue({
      results: [
        {
          id: 'exec-1',
          spaceId: 'default',
          workflowId: 'wf-1',
          status: 'completed',
          isTestRun: false,
          startedAt: '2024-01-01T10:00:00Z',
          finishedAt: '2024-01-01T10:00:03Z',
          duration: 3000,
          error: null,
        },
      ],
      page: 1,
      size: EXECUTION_TABLE_DEFAULT_PAGE_SIZE,
      total: WORKFLOWS_EXECUTIONS_MAX_RESULT_WINDOW + 500,
    });

    render(
      <WorkflowExecutionsTable
        filters={[]}
        query={defaultQuery}
        spaceId="default"
        timeRange={defaultTimeRange}
      />,
      { wrapper: getTestProvider({ services }) }
    );

    await waitFor(() => {
      expect(screen.getByTestId('workflowExecutionsTable')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`pagination-button-${lastReachablePageIndex}`));

    await waitFor(() => {
      expect(screen.getByTestId('executionsTableEndOfResults')).toBeInTheDocument();
    });
  });

  it('shows a generic error prompt for non-index errors', async () => {
    const services = createStartServicesMock();

    jest.mocked(services.http.get).mockRejectedValue(new Error('cluster unavailable'));

    render(
      <WorkflowExecutionsTable
        filters={[]}
        query={defaultQuery}
        spaceId="default"
        timeRange={defaultTimeRange}
      />,
      { wrapper: getTestProvider({ services }) }
    );

    await waitFor(() => {
      expect(screen.getByTestId('workflowExecutionsTableError')).toBeInTheDocument();
    });
    expect(screen.getByText('Failed to load executions')).toBeInTheDocument();
  });
});
