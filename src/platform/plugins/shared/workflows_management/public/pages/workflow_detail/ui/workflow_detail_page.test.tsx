/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { useWorkflowsCapabilities } from '@kbn/workflows-ui';
import { WorkflowDetailPage } from './workflow_detail_page';
import { PLUGIN_ID } from '../../../../common';
import { createMockStore } from '../../../entities/workflows/store/__mocks__/store.mock';
import { setWorkflow } from '../../../entities/workflows/store/workflow_detail/slice';
import { mockWorkflowsManagementCapabilities } from '../../../hooks/__mocks__/use_workflows_capabilities';
import { createStartServicesMock } from '../../../mocks';
import { getTestProvider } from '../../../shared/mocks/test_providers';

const createMockHttpFetchError = (message: string, status: number) =>
  Object.assign(new Error(message), {
    name: 'HttpFetchError',
    request: {} as Request,
    response: { status } as Response,
    body: { message },
  });

interface WorkflowDetailPageProps {
  id?: string;
}

const mockUseWorkflowsBreadcrumbs = jest.fn();
const mockUseWorkflowUrlState = jest.fn();

let mockLoadConnectors = jest.fn();
let mockLoadWorkflow = jest.fn();
let mockAsyncThunkState: { isLoading: boolean; error: unknown | null } = {
  isLoading: false,
  error: null,
};

jest.mock('../../../hooks/use_workflow_breadcrumbs/use_workflow_breadcrumbs', () => ({
  useWorkflowsBreadcrumbs: () => mockUseWorkflowsBreadcrumbs(),
}));
jest.mock('../../../hooks/use_workflow_url_state', () => ({
  useWorkflowUrlState: () => mockUseWorkflowUrlState(),
}));

jest.mock('@kbn/workflows-ui', () => ({
  ...jest.requireActual('@kbn/workflows-ui'),
  useWorkflowsCapabilities: jest.fn(),
}));

const mockUseWorkflowsCapabilities = useWorkflowsCapabilities as jest.MockedFunction<
  typeof useWorkflowsCapabilities
>;

jest.mock('../../../entities/workflows/store/workflow_detail/thunks/load_connectors_thunk', () => ({
  loadConnectorsThunk: (...args: unknown[]) => mockLoadConnectors(...args),
}));
jest.mock('../../../entities/workflows/store/workflow_detail/thunks/load_workflow_thunk', () => ({
  loadWorkflowThunk: (...args: unknown[]) => mockLoadWorkflow(...args),
}));

jest.mock('./workflow_not_found_page', () => ({
  WorkflowNotFoundPage: ({ onBackToWorkflows }: { onBackToWorkflows: () => void }) => (
    <div data-test-subj="workflow-not-found-page">
      <button
        type="button"
        data-test-subj="workflowDetailBackToWorkflowsButton"
        onClick={onBackToWorkflows}
      >
        {'Back to Workflows'}
      </button>
    </div>
  ),
}));

jest.mock('./workflow_detail_header', () => ({
  WorkflowDetailHeader: () => <div data-test-subj="workflow-detail-header">{'Header'}</div>,
}));
jest.mock('./workflow_detail_editor', () => ({
  WorkflowDetailEditor: () => <div data-test-subj="workflow-detail-editor">{'Editor'}</div>,
}));
jest.mock('./workflow_detail_layout', () => ({
  WorkflowEditorLayout: ({ editor, executionList, executionDetail }: any) => (
    <div data-test-subj="workflow-editor-layout">
      {editor}
      {executionList}
      {executionDetail}
    </div>
  ),
}));
jest.mock('./workflow_detail_test_modal', () => ({
  WorkflowDetailTestModal: () => (
    <div data-test-subj="workflow-detail-test-modal">{'Test Modal'}</div>
  ),
}));
jest.mock('./workflow_detail_test_step_modal', () => ({
  WorkflowDetailTestStepModal: () => (
    <div data-test-subj="workflow-detail-test-step-modal">{'Test Step Modal'}</div>
  ),
}));
jest.mock('../../../features/workflow_execution_detail', () => ({
  WorkflowExecutionDetail: ({ executionId }: { executionId: string }) => (
    <div data-test-subj="workflow-execution-detail">{executionId}</div>
  ),
}));
jest.mock('../../../features/workflow_execution_list/ui/workflow_execution_list_stateful', () => ({
  WorkflowExecutionList: ({ workflowId }: { workflowId: string }) => (
    <div data-test-subj="workflow-execution-list">{workflowId}</div>
  ),
}));

jest.mock('../../../hooks/use_async_thunk', () => ({
  useAsyncThunkState: (mockedThunk: Function) => [mockedThunk, mockAsyncThunkState],
}));

describe('WorkflowDetailPage', () => {
  const mockWorkflow = {
    id: 'test-workflow-123',
    name: 'Test Workflow',
    enabled: true,
    yaml: 'version: "1"\nname: Test Workflow\ntriggers:\n  - type: manual\nsteps:\n  - type: log\n    with:\n      message: hello',
    lastUpdatedAt: '2024-01-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    createdBy: 'test-user',
    lastUpdatedBy: 'test-user',
    definition: null,
    valid: true,
  };

  const renderWithProviders = (
    props: WorkflowDetailPageProps,
    storeSetup?: (
      store: ReturnType<typeof createMockStore>
    ) => void | ReturnType<typeof createMockStore>
  ) => {
    let store = createMockStore();

    if (storeSetup) {
      const result = storeSetup(store);
      if (result) {
        store = result;
      }
    }

    const services = createStartServicesMock();
    const navigateToApp = jest.spyOn(services.application, 'navigateToApp');

    const view = render(<WorkflowDetailPage {...props} />, {
      wrapper: getTestProvider({ store, services }),
    });

    return { ...view, navigateToApp };
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockAsyncThunkState = {
      isLoading: false,
      error: null,
    };
    mockLoadConnectors = jest.fn().mockReturnValue(Promise.resolve());
    mockLoadWorkflow = jest.fn().mockReturnValue(Promise.resolve());

    mockUseWorkflowsBreadcrumbs.mockImplementation(() => undefined);
    mockUseWorkflowsCapabilities.mockReturnValue(mockWorkflowsManagementCapabilities);
    mockUseWorkflowUrlState.mockReturnValue({
      activeTab: 'workflow' as const,
      selectedExecutionId: undefined,
      setSelectedExecution: jest.fn(),
      setActiveTab: jest.fn(),
    });
  });

  describe('when loading existing workflow', () => {
    it('should load workflow when id is provided', () => {
      renderWithProviders({ id: 'test-workflow-123' }, (s) => {
        s.dispatch(setWorkflow(mockWorkflow));
      });

      expect(mockLoadConnectors).toHaveBeenCalled();
      expect(mockLoadWorkflow).toHaveBeenCalledWith({ id: 'test-workflow-123' });
    });

    it('should set default yaml when no id is provided', () => {
      const store = createMockStore();
      const dispatchSpy = jest.spyOn(store, 'dispatch');

      renderWithProviders({ id: undefined }, () => store);

      expect(mockLoadConnectors).toHaveBeenCalled();
      expect(dispatchSpy).toHaveBeenCalled();
    });
  });

  describe('when error occurs', () => {
    it('should render the not found page for 404 workflow load errors', () => {
      mockAsyncThunkState = {
        isLoading: false,
        error: createMockHttpFetchError('Workflow not found', 404),
      };

      renderWithProviders({ id: 'test-workflow-123' });

      expect(screen.getByTestId('workflow-not-found-page')).toBeInTheDocument();
    });

    it('should navigate to workflows list when back button is clicked', () => {
      mockAsyncThunkState = {
        isLoading: false,
        error: createMockHttpFetchError('Workflow not found', 404),
      };

      const { navigateToApp } = renderWithProviders({ id: 'test-workflow-123' });

      fireEvent.click(screen.getByTestId('workflowDetailBackToWorkflowsButton'));

      expect(navigateToApp).toHaveBeenCalledWith(PLUGIN_ID, undefined);
    });

    it('should display generic error message for non-not-found failures', () => {
      mockAsyncThunkState = {
        isLoading: false,
        error: createMockHttpFetchError('Internal server error', 500),
      };

      renderWithProviders({ id: 'test-workflow-123' });

      expect(screen.getByText('Unable to load workflow')).toBeInTheDocument();
      expect(screen.getByText(/Internal server error/)).toBeInTheDocument();
      expect(screen.queryByTestId('workflow-not-found-page')).not.toBeInTheDocument();
    });
  });

  describe('when loading state', () => {
    it('should pass loading state to header', () => {
      mockAsyncThunkState = { isLoading: true, error: null };

      renderWithProviders({ id: 'test-workflow-123' });

      expect(screen.getByTestId('workflow-detail-header')).toBeInTheDocument();
    });
  });

  describe('when rendering different tabs', () => {
    it('should render editor layout with execution list when activeTab is executions', () => {
      mockUseWorkflowUrlState.mockReturnValue({
        activeTab: 'executions' as const,
        selectedExecutionId: undefined,
        setSelectedExecution: jest.fn(),
        setActiveTab: jest.fn(),
      });

      renderWithProviders({ id: 'test-workflow-123' }, (s) => {
        s.dispatch(setWorkflow(mockWorkflow));
      });

      expect(screen.getByTestId('workflow-execution-list')).toHaveTextContent('test-workflow-123');
    });

    it('should render editor layout with execution detail when selectedExecutionId is set', () => {
      mockUseWorkflowUrlState.mockReturnValue({
        activeTab: 'executions' as const,
        selectedExecutionId: 'execution-123',
        setSelectedExecution: jest.fn(),
        setActiveTab: jest.fn(),
      });

      renderWithProviders({ id: 'test-workflow-123' }, (s) => {
        s.dispatch(setWorkflow(mockWorkflow));
      });

      expect(screen.getByTestId('workflow-execution-detail')).toHaveTextContent('execution-123');
    });
  });

  describe('when rendering standard layout', () => {
    it('should render editor and header without sidebar when no execution selected', () => {
      mockUseWorkflowUrlState.mockReturnValue({
        activeTab: 'workflow' as const,
        selectedExecutionId: undefined,
        setSelectedExecution: jest.fn(),
        setActiveTab: jest.fn(),
      });

      renderWithProviders({ id: 'test-workflow-123' }, (s) => {
        s.dispatch(setWorkflow(mockWorkflow));
      });

      expect(screen.getByTestId('workflow-detail-header')).toBeInTheDocument();
      expect(screen.getByTestId('workflow-detail-editor')).toBeInTheDocument();
      expect(screen.getByTestId('workflow-editor-layout')).toBeInTheDocument();
      expect(screen.queryByTestId('workflow-execution-list')).not.toBeInTheDocument();
      expect(screen.queryByTestId('workflow-execution-detail')).not.toBeInTheDocument();
    });
  });

  describe('breadcrumbs', () => {
    it('should call useWorkflowsBreadcrumbs hook with workflow name', () => {
      renderWithProviders({ id: 'test-workflow-123' }, (s) => {
        s.dispatch(setWorkflow({ ...mockWorkflow, name: 'My Workflow' }));
      });

      expect(mockUseWorkflowsBreadcrumbs).toHaveBeenCalled();
    });
  });

  describe('useEffect dependencies', () => {
    it('should call loadConnectors on mount', () => {
      renderWithProviders({ id: 'test-workflow-123' });
      expect(mockLoadConnectors).toHaveBeenCalledTimes(1);
    });

    it('should call loadWorkflow when id changes', () => {
      const store = createMockStore();
      const services = createStartServicesMock();
      const wrapper = getTestProvider({ store, services });

      const { rerender } = render(<WorkflowDetailPage id="test-workflow-123" />, { wrapper });

      expect(mockLoadWorkflow).toHaveBeenCalledTimes(1);
      expect(mockLoadWorkflow).toHaveBeenLastCalledWith({ id: 'test-workflow-123' });

      rerender(<WorkflowDetailPage id="different-workflow-456" />);

      expect(mockLoadWorkflow).toHaveBeenCalledWith({ id: 'different-workflow-456' });
    });
  });

  describe('workflow test modal', () => {
    it('should render workflow detail test modal', () => {
      renderWithProviders({ id: 'test-workflow-123' });
      expect(screen.getByTestId('workflow-detail-test-modal')).toBeInTheDocument();
    });
  });

  describe('workflow test step modal', () => {
    it('should render workflow detail test step modal', () => {
      renderWithProviders({ id: 'test-workflow-123' });
      expect(screen.getByTestId('workflow-detail-test-step-modal')).toBeInTheDocument();
    });
  });

  describe('workflow execution detail close handler', () => {
    it('should handle closing execution detail', () => {
      mockUseWorkflowUrlState.mockReturnValue({
        activeTab: 'executions' as const,
        selectedExecutionId: 'execution-123',
        setSelectedExecution: jest.fn(),
        setActiveTab: jest.fn(),
      });

      renderWithProviders({ id: 'test-workflow-123' }, (s) => {
        s.dispatch(setWorkflow(mockWorkflow));
      });

      expect(screen.getByTestId('workflow-execution-detail')).toBeInTheDocument();
    });
  });

  describe('readWorkflowExecution gate', () => {
    it('switches to workflow tab when executions tab is not allowed', () => {
      const setActiveTab = jest.fn();
      mockUseWorkflowsCapabilities.mockReturnValue({
        ...mockWorkflowsManagementCapabilities,
        canReadWorkflowExecution: false,
      });
      mockUseWorkflowUrlState.mockReturnValue({
        activeTab: 'executions' as const,
        selectedExecutionId: undefined,
        setSelectedExecution: jest.fn(),
        setActiveTab,
      });

      renderWithProviders({ id: 'test-workflow-123' }, (s) => {
        s.dispatch(setWorkflow(mockWorkflow));
      });

      expect(setActiveTab).toHaveBeenCalledWith('workflow');
    });

    it('clears selected execution on workflow tab when execution read is not allowed', () => {
      const setSelectedExecution = jest.fn();
      mockUseWorkflowsCapabilities.mockReturnValue({
        ...mockWorkflowsManagementCapabilities,
        canReadWorkflowExecution: false,
      });
      mockUseWorkflowUrlState.mockReturnValue({
        activeTab: 'workflow' as const,
        selectedExecutionId: 'execution-123',
        setSelectedExecution,
        setActiveTab: jest.fn(),
      });

      renderWithProviders({ id: 'test-workflow-123' }, (s) => {
        s.dispatch(setWorkflow(mockWorkflow));
      });

      expect(setSelectedExecution).toHaveBeenCalledWith(null);
    });

    it('does not mount execution list when execution read is not allowed', () => {
      mockUseWorkflowsCapabilities.mockReturnValue({
        ...mockWorkflowsManagementCapabilities,
        canReadWorkflowExecution: false,
      });
      mockUseWorkflowUrlState.mockReturnValue({
        activeTab: 'executions' as const,
        selectedExecutionId: undefined,
        setSelectedExecution: jest.fn(),
        setActiveTab: jest.fn(),
      });

      renderWithProviders({ id: 'test-workflow-123' }, (s) => {
        s.dispatch(setWorkflow(mockWorkflow));
      });

      expect(screen.queryByTestId('workflow-execution-list')).not.toBeInTheDocument();
    });
  });
});
