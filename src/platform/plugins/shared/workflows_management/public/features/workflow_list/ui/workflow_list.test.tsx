/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { useLocation } from 'react-router-dom';
import type { WorkflowListDto, WorkflowListItemDto, WorkflowsSearchParams } from '@kbn/workflows';
import { createMockWorkflowsCapabilities as mockCreateMockWorkflowsCapabilities } from '@kbn/workflows-ui/mocks';
import { WorkflowList } from './workflow_list';
import { PLUGIN_ID } from '../../../../common';
import { createUseKibanaMockValue } from '../../../mocks';
import { TestProvider } from '../../../shared/mocks/test_providers';

// --- Mocks ---

jest.mock('../../../hooks/use_kibana');

const mockUseWorkflows = jest.fn();

jest.mock('@kbn/workflows-ui', () => {
  const actual = jest.requireActual('@kbn/workflows-ui');
  return {
    ...actual,
    useWorkflows: (...args: unknown[]) => mockUseWorkflows(...args),
    useWorkflowsCapabilities: jest.fn(() => mockCreateMockWorkflowsCapabilities()),
  };
});

const mockKibanaValue = createUseKibanaMockValue();
const { application: mockApplication } = mockKibanaValue.services;

(mockApplication.getUrlForApp as jest.Mock).mockReturnValue('/app/workflows/wf-1');

jest.mock('../../../hooks/use_telemetry', () => ({
  useTelemetry: () => ({
    reportWorkflowListViewed: jest.fn(),
    reportWorkflowExported: jest.fn(),
    reportWorkflowDeleted: jest.fn(),
    reportWorkflowUpdated: jest.fn(),
    reportWorkflowCloned: jest.fn(),
    reportWorkflowRunInitiated: jest.fn(),
  }),
}));

const mockRefetch = jest.fn().mockResolvedValue({ data: null });

jest.mock('./use_event_driven_execution_status', () => ({
  useEventDrivenExecutionStatus: () => ({
    eventDrivenExecutionEnabled: true,
    isLoading: false,
    error: false,
  }),
}));

const mockDeleteWorkflows = { mutate: jest.fn() };
const mockRunWorkflow = { mutate: jest.fn() };
const mockCloneWorkflow = { mutate: jest.fn() };
const mockUpdateWorkflow = { mutate: jest.fn() };

interface WorkflowExecuteModalMockProps {
  onSubmit: (data: Record<string, unknown>, triggerTab: 'manual') => void;
}

jest.mock('../../../entities/workflows/model/use_workflow_actions', () => ({
  useWorkflowActions: () => ({
    deleteWorkflows: mockDeleteWorkflows,
    runWorkflow: mockRunWorkflow,
    cloneWorkflow: mockCloneWorkflow,
    updateWorkflow: mockUpdateWorkflow,
  }),
}));

jest.mock('./use_export_with_references', () => ({
  useExportWithReferences: () => ({
    exportModalState: null,
    startExport: jest.fn(),
    handleIgnore: jest.fn(),
    handleAddDirect: jest.fn(),
    handleAddAll: jest.fn(),
    handleCancel: jest.fn(),
  }),
}));

// Mock child components to keep tests focused
jest.mock('./export_references_modal', () => ({
  ExportReferencesModal: () => <div data-test-subj="export-references-modal" />,
}));

jest.mock('./workflows_utility_bar', () => ({
  WorkflowsUtilityBar: () => <div data-test-subj="workflows-utility-bar">{'Utility Bar'}</div>,
}));

jest.mock('../../../components', () => ({
  WorkflowsEmptyState: ({ onCreateWorkflow }: { onCreateWorkflow?: () => void }) => (
    <div data-test-subj="workflows-empty-state">
      <button type="button" onClick={onCreateWorkflow}>
        {'Create Workflow'}
      </button>
    </div>
  ),
}));

jest.mock('../../../components/workflows_empty_state/workflows_empty_state', () => ({
  WorkflowsEmptyStateReadOnly: () => <div data-test-subj="workflows-empty-state-readonly" />,
}));

jest.mock('../../run_workflow/ui/workflow_execute_modal', () => ({
  WorkflowExecuteModal: ({ onSubmit }: WorkflowExecuteModalMockProps) => (
    <button
      type="button"
      data-test-subj="workflow-execute-modal"
      onClick={() => onSubmit({}, 'manual')}
    >
      {'Run workflow'}
    </button>
  ),
}));

jest.mock('../../../shared/ui', () => ({
  getRunTooltipContent: () => 'Run',
  ManagedWorkflowBadge: ({ dataTestSubj = 'managedWorkflowBadge' }: { dataTestSubj?: string }) => (
    <span data-test-subj={dataTestSubj}>{'Managed'}</span>
  ),
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  WorkflowStatus: ({ valid }: { valid: boolean }) => <span>{valid ? 'Valid' : 'Invalid'}</span>,
}));

jest.mock('../../../widgets/worflows_triggers_list/worflows_triggers_list', () => ({
  WorkflowsTriggersList: () => <span>{'Triggers'}</span>,
}));

// --- Test helpers ---

const createMockWorkflow = (overrides: Partial<WorkflowListItemDto> = {}): WorkflowListItemDto => ({
  id: 'wf-1',
  name: 'My Test Workflow',
  description: 'A workflow for testing',
  enabled: true,
  definition: {
    version: '1',
    name: 'My Test Workflow',
    enabled: true,
    triggers: [],
    steps: [],
  },
  createdAt: '2024-01-01T00:00:00Z',
  history: [],
  valid: true,
  ...overrides,
});
const PAGE = 1;
const SIZE = 20;
const defaultSearch: WorkflowsSearchParams = { page: PAGE, size: SIZE };

const createMockWorkflowListDto = (
  workflows: WorkflowListItemDto[] = [createMockWorkflow()]
): WorkflowListDto => ({
  results: workflows,
  total: workflows.length,
  page: PAGE,
  size: SIZE,
});

describe('WorkflowList', () => {
  const setSearch = jest.fn();
  const onCreateWorkflow = jest.fn();

  const defaultProps = {
    search: defaultSearch,
    setSearch,
    onCreateWorkflow,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-configure auto-mock after clearAllMocks
    const { useKibana } = jest.requireMock('../../../hooks/use_kibana') as {
      useKibana: jest.Mock;
    };
    useKibana.mockReturnValue(mockKibanaValue);
    (mockApplication.getUrlForApp as jest.Mock).mockReturnValue('/app/workflows/wf-1');

    mockUseWorkflows.mockReturnValue({
      data: createMockWorkflowListDto(),
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
  });

  const renderComponent = (
    overrides: Partial<typeof defaultProps> = {},
    initialEntries?: string[]
  ) => {
    return render(
      <TestProvider initialEntries={initialEntries}>
        <WorkflowList {...defaultProps} {...overrides} />
      </TestProvider>
    );
  };

  describe('loading state', () => {
    it('shows loading spinner when workflows are loading', () => {
      mockUseWorkflows.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: mockRefetch,
      });
      renderComponent();
      expect(screen.getByText('Loading workflows...')).toBeInTheDocument();
    });

    it('does not show the table when loading', () => {
      mockUseWorkflows.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: mockRefetch,
      });
      renderComponent();
      expect(screen.queryByTestId('workflowListTable')).not.toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error message when there is an error', () => {
      mockUseWorkflows.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Server error'),
        refetch: mockRefetch,
      });
      renderComponent();
      expect(screen.getByText('Error loading workflows')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows the create empty state when there are no workflows and the user can create', () => {
      mockUseWorkflows.mockReturnValue({
        data: { results: [], total: 0, ...defaultSearch },
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });
      renderComponent({ search: { ...defaultSearch } });
      expect(screen.getByTestId('workflows-empty-state')).toBeInTheDocument();
    });

    it('shows the read-only empty state when there are no workflows and the user cannot create', () => {
      const { useWorkflowsCapabilities } = jest.requireMock('@kbn/workflows-ui') as {
        useWorkflowsCapabilities: jest.Mock;
      };
      useWorkflowsCapabilities.mockReturnValue({
        ...mockCreateMockWorkflowsCapabilities(),
        canCreateWorkflow: false,
      });

      mockUseWorkflows.mockReturnValue({
        data: { results: [], total: 0, ...defaultSearch },
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });
      renderComponent({ search: { ...defaultSearch } });

      expect(screen.getByTestId('workflows-empty-state-readonly')).toBeInTheDocument();
    });

    it('does not show empty state when filters are applied even with no results', () => {
      mockUseWorkflows.mockReturnValue({
        data: { results: [], total: 0, ...defaultSearch },
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });
      renderComponent({ search: { ...defaultSearch, query: 'test-filter' } });
      // Should not show the empty state because a query filter is applied
      expect(screen.queryByTestId('workflows-empty-state')).not.toBeInTheDocument();
    });
  });

  describe('with workflow data', () => {
    it('normalizes string enabled filters to booleans before querying workflows', () => {
      const searchWithStringEnabled = {
        ...defaultSearch,
        enabled: ['false'],
      } as unknown as WorkflowsSearchParams;

      renderComponent({
        search: searchWithStringEnabled,
      });

      expect(mockUseWorkflows).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: [false],
        })
      );
    });

    it('renders the workflows table', () => {
      renderComponent();
      expect(screen.getByTestId('workflowListTable')).toBeInTheDocument();
    });

    it('renders the utility bar', () => {
      renderComponent();
      expect(screen.getByTestId('workflows-utility-bar')).toBeInTheDocument();
    });

    it('renders workflow names as links', () => {
      renderComponent();
      const nameLink = screen.getByTestId('workflowNameLink');
      expect(nameLink).toBeInTheDocument();
      expect(nameLink).toHaveTextContent('My Test Workflow');
    });

    it('keeps workflow name links clean while preserving list search params in route state', async () => {
      const user = userEvent.setup();
      const RouteStateProbe = () => {
        const location = useLocation<{ workflowsListSearch?: string } | undefined>();
        return (
          <span data-test-subj="workflowListSearchRouteState">
            {location.state?.workflowsListSearch ?? ''}
          </span>
        );
      };

      render(
        <TestProvider initialEntries={['/?tags=prod&enabled=true']}>
          <WorkflowList {...defaultProps} />
          <RouteStateProbe />
        </TestProvider>
      );

      const nameLink = screen.getByTestId('workflowNameLink');

      expect(nameLink).toHaveAttribute('href', '/wf-1');

      await user.click(nameLink);

      expect(screen.getByTestId('workflowListSearchRouteState')).toHaveTextContent(
        '?tags=prod&enabled=true'
      );
    });

    it('preserves list search params in route state when editing from the row action', async () => {
      const user = userEvent.setup();

      renderComponent({}, ['/?tags=prod&enabled=true']);

      await user.click(screen.getByTestId('editWorkflowAction'));

      expect(mockApplication.navigateToApp).toHaveBeenCalledWith(PLUGIN_ID, {
        path: '/wf-1',
        state: { workflowsListSearch: '?tags=prod&enabled=true' },
      });
    });

    it('preserves list search params in route state when running a workflow opens executions', async () => {
      const user = userEvent.setup();
      mockRunWorkflow.mutate.mockImplementationOnce(
        (
          _params: unknown,
          options: { onSuccess: (response: { workflowExecutionId: string }) => void }
        ) => {
          options.onSuccess({ workflowExecutionId: 'exec-1' });
        }
      );

      renderComponent({}, ['/?tags=prod&enabled=true']);

      await user.click(screen.getByTestId('runWorkflowAction'));
      await user.click(await screen.findByTestId('workflow-execute-modal'));

      expect(mockApplication.navigateToApp).toHaveBeenCalledWith(PLUGIN_ID, {
        path: '/wf-1?tab=executions&executionId=exec-1',
        state: { workflowsListSearch: '?tags=prod&enabled=true' },
      });
    });

    it('renders workflow description', () => {
      renderComponent();
      expect(screen.getByText('A workflow for testing')).toBeInTheDocument();
    });

    it('renders the managed badge as the first tag for managed workflows', () => {
      const workflow = createMockWorkflow({
        managed: true,
        definition: {
          version: '1',
          name: 'My Test Workflow',
          enabled: true,
          triggers: [],
          steps: [],
          tags: ['custom', 'second'],
        },
      });

      mockUseWorkflows.mockReturnValue({
        data: createMockWorkflowListDto([workflow]),
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderComponent();

      const tagsCell = screen.getByTestId('workflowTags');
      const managedBadge = within(tagsCell).getByTestId('managedWorkflowBadge');
      const firstWorkflowTag = within(tagsCell).getByText('custom');

      expect(managedBadge).toHaveTextContent('Managed');
      expect(managedBadge.compareDocumentPosition(firstWorkflowTag)).toEqual(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
    });

    it('shows "No description" for workflows without description', () => {
      mockUseWorkflows.mockReturnValue({
        data: createMockWorkflowListDto([createMockWorkflow({ description: '' })]),
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });
      renderComponent();
      expect(screen.getByText('No description')).toBeInTheDocument();
    });

    it('renders the enabled toggle switch', () => {
      renderComponent();
      const toggle = screen.getByTestId('workflowToggleSwitch-wf-1');
      expect(toggle).toBeInTheDocument();
    });

    it('passes workflow definition when toggling enabled from the list', async () => {
      const workflow = createMockWorkflow({
        id: 'wf-toggle',
        enabled: true,
      });

      mockUseWorkflows.mockReturnValue({
        data: createMockWorkflowListDto([workflow]),
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderComponent();

      await userEvent.click(screen.getByTestId('workflowToggleSwitch-wf-toggle'));

      expect(mockUpdateWorkflow.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'wf-toggle',
          workflow: { enabled: false },
          workflowDefinition: workflow.definition,
          skipRefetch: true,
        }),
        expect.any(Object)
      );
    });

    it('renders multiple workflows', () => {
      const workflows = [
        createMockWorkflow({ id: 'wf-1', name: 'Workflow One' }),
        createMockWorkflow({ id: 'wf-2', name: 'Workflow Two' }),
        createMockWorkflow({ id: 'wf-3', name: 'Workflow Three' }),
      ];
      mockUseWorkflows.mockReturnValue({
        data: createMockWorkflowListDto(workflows),
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });
      renderComponent();
      expect(screen.getByText('Workflow One')).toBeInTheDocument();
      expect(screen.getByText('Workflow Two')).toBeInTheDocument();
      expect(screen.getByText('Workflow Three')).toBeInTheDocument();
    });

    it('renders the WorkflowStatus indicator for invalid workflows', () => {
      mockUseWorkflows.mockReturnValue({
        data: createMockWorkflowListDto([createMockWorkflow({ valid: false, enabled: false })]),
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });
      renderComponent();
      expect(screen.getByText('Invalid')).toBeInTheDocument();
    });
  });

  describe('delete modal', () => {
    it('does not render the delete modal by default', () => {
      renderComponent();
      expect(screen.queryByTestId('workflows-delete-confirmation-modal')).not.toBeInTheDocument();
    });
  });

  describe('event-driven disabled banner', () => {
    it('does not show event-driven disabled banner when event-driven execution is enabled', () => {
      renderComponent();
      expect(
        screen.queryByTestId('workflows-event-driven-disabled-banner')
      ).not.toBeInTheDocument();
    });
  });
});
