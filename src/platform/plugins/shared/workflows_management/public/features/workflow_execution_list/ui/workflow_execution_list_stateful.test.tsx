/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { ExecutionStatus, type WorkflowExecutionListDto } from '@kbn/workflows';
import { createMockWorkflowApi, createMockWorkflowsCapabilities } from '@kbn/workflows-ui/mocks';
import { WorkflowExecutionList } from './workflow_execution_list_stateful';
import { useKibana } from '../../../hooks/use_kibana';
import { createUseKibanaMockValue } from '../../../mocks';
import { TestWrapper } from '../../../shared/test_utils';

const mockSetSelectedExecution = jest.fn();
const mockRefetch = jest.fn().mockResolvedValue(undefined);

const mockWorkflowApi = createMockWorkflowApi();
const mockUseWorkflowsCapabilities = jest.fn(() => createMockWorkflowsCapabilities());

jest.mock('../../../hooks/use_kibana');

jest.mock('@kbn/workflows-ui', () => ({
  useWorkflowsApi: () => mockWorkflowApi,
  useWorkflowsCapabilities: () => mockUseWorkflowsCapabilities(),
}));

jest.mock('../../../hooks/use_telemetry', () => ({
  useTelemetry: () => ({
    reportWorkflowExecutionsCancelled: jest.fn(),
  }),
}));

jest.mock('../../../hooks/use_workflow_url_state', () => ({
  useWorkflowUrlState: () => ({
    selectedExecutionId: null,
    setSelectedExecution: mockSetSelectedExecution,
  }),
}));

jest.mock('../../../hooks/use_workflows_experimental_ui_setting', () => ({
  useWorkflowsExperimentalUiSetting: jest.fn().mockReturnValue(false),
}));

const mockWorkflowExecutions: WorkflowExecutionListDto = {
  results: [
    {
      id: 'exec-1',
      spaceId: 'default',
      status: ExecutionStatus.COMPLETED,
      isTestRun: false,
      startedAt: '2024-01-01T10:00:00Z',
      finishedAt: '2024-01-01T10:01:00Z',
      error: null,
      duration: 60000,
      workflowId: 'wf-1',
      workflowName: 'Test Workflow',
    },
  ],
  page: 1,
  size: 100,
  total: 1,
};

const mockWorkflowExecutionsWithRunning: WorkflowExecutionListDto = {
  results: [
    {
      id: 'exec-running',
      spaceId: 'default',
      status: ExecutionStatus.RUNNING,
      isTestRun: false,
      startedAt: '2024-01-01T12:00:00Z',
      finishedAt: '2024-01-01T12:00:00Z',
      error: null,
      duration: 1000,
      workflowId: 'wf-1',
      workflowName: 'Test Workflow',
    },
  ],
  page: 1,
  size: 100,
  total: 1,
};

const mockUseWorkflowExecutions = jest.fn();
jest.mock('../../../entities/workflows/model/use_workflow_executions', () => ({
  useWorkflowExecutions: (...args: unknown[]) => mockUseWorkflowExecutions(...args),
}));

describe('WorkflowExecutionList (stateful)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWorkflowsCapabilities.mockReturnValue(createMockWorkflowsCapabilities());
    mockWorkflowApi.cancelAllWorkflowExecutions.mockResolvedValue(undefined);
    (useKibana as jest.Mock).mockReturnValue(createUseKibanaMockValue());

    mockUseWorkflowExecutions.mockReturnValue({
      data: mockWorkflowExecutions,
      isInitialLoading: false,
      isLoadingMore: false,
      error: null,
      setPaginationObserver: jest.fn(),
      refetch: mockRefetch,
    });
  });

  const renderComponent = (workflowId: string | null = 'wf-1') => {
    return render(
      <TestWrapper>
        <WorkflowExecutionList workflowId={workflowId} />
      </TestWrapper>
    );
  };

  it('renders the execution list', () => {
    renderComponent();
    expect(screen.getByTestId('workflowExecutionList')).toBeInTheDocument();
  });

  it('passes loading state from the hook', () => {
    mockUseWorkflowExecutions.mockReturnValue({
      data: null,
      isInitialLoading: true,
      isLoadingMore: false,
      error: null,
      setPaginationObserver: jest.fn(),
      refetch: mockRefetch,
    });
    renderComponent();
    expect(screen.getByText('Loading executions...')).toBeInTheDocument();
  });

  it('passes error state from the hook', () => {
    mockUseWorkflowExecutions.mockReturnValue({
      data: null,
      isInitialLoading: false,
      isLoadingMore: false,
      error: new Error('Network error'),
      setPaginationObserver: jest.fn(),
      refetch: mockRefetch,
    });
    renderComponent();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('passes execution data from the hook', () => {
    renderComponent();
    expect(screen.getAllByTestId('workflowExecutionListItem')).toHaveLength(1);
  });

  it('calls useWorkflowExecutions with the workflowId', () => {
    renderComponent('wf-123');
    expect(mockUseWorkflowExecutions).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: 'wf-123' })
    );
  });

  it('calls setSelectedExecution when an execution item is clicked', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('workflowExecutionListItem'));
    expect(mockSetSelectedExecution).toHaveBeenCalledWith('exec-1');
  });

  it('footer cancel calls the bulk cancel API and refetches executions', async () => {
    mockUseWorkflowExecutions.mockReturnValue({
      data: mockWorkflowExecutionsWithRunning,
      isInitialLoading: false,
      isLoadingMore: false,
      error: null,
      setPaginationObserver: jest.fn(),
      refetch: mockRefetch,
    });
    renderComponent();
    fireEvent.click(screen.getByTestId('cancelAllActiveExecutionsButton'));
    const dialog = await screen.findByTestId('cancelAllActiveExecutionsConfirmationModal');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel all' }));
    await waitFor(() =>
      expect(mockWorkflowApi.cancelAllWorkflowExecutions).toHaveBeenCalledWith('wf-1')
    );
    await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  });

  it('disables bulk cancel when the user lacks cancel capability', () => {
    mockUseWorkflowsCapabilities.mockReturnValue({
      ...createMockWorkflowsCapabilities(),
      canCancelWorkflowExecution: false,
    });
    mockUseWorkflowExecutions.mockReturnValue({
      data: mockWorkflowExecutionsWithRunning,
      isInitialLoading: false,
      isLoadingMore: false,
      error: null,
      setPaginationObserver: jest.fn(),
      refetch: mockRefetch,
    });
    renderComponent();
    expect(screen.getByTestId('cancelAllActiveExecutionsButton')).toBeDisabled();
    expect(mockWorkflowApi.cancelAllWorkflowExecutions).not.toHaveBeenCalled();
  });
});
