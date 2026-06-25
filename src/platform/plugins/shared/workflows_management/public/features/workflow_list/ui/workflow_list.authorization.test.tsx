/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiProvider } from '@elastic/eui';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { TypeRegistry } from '@kbn/alerts-ui-shared/lib';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { ActionTypeModel } from '@kbn/triggers-actions-ui-plugin/public';
import type { WorkflowsSearchParams } from '@kbn/workflows';
import { useWorkflows } from '@kbn/workflows-ui';
import { WorkflowList } from './workflow_list';
import { createWorkflowListItem } from '../../../connectors/workflows/workflows_params.test_fixtures';
import { TestWrapper } from '../../../shared/test_utils/test_wrapper';
import { WORKFLOWS_TABLE_INITIAL_PAGE_SIZE } from '../constants';

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: jest.fn(),
}));

jest.mock('@kbn/workflows-ui', () => {
  const actual = jest.requireActual('@kbn/workflows-ui');
  return {
    ...actual,
    useWorkflows: jest.fn(),
  };
});

jest.mock('./use_event_driven_execution_status', () => ({
  useEventDrivenExecutionStatus: () => ({
    eventDrivenExecutionEnabled: true,
    isLoading: false,
    error: false,
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

jest.mock('../../../hooks/use_telemetry', () => ({
  useTelemetry: () => ({
    reportWorkflowListViewed: jest.fn(),
  }),
}));

jest.mock('../../../entities/workflows/model/use_workflow_actions', () => ({
  useWorkflowActions: () => ({
    deleteWorkflows: { mutate: jest.fn() },
    runWorkflow: { mutate: jest.fn() },
    cloneWorkflow: { mutate: jest.fn() },
    updateWorkflow: { mutate: jest.fn() },
  }),
}));

const mockUseKibana = useKibana as jest.MockedFunction<typeof useKibana>;
const mockUseWorkflows = useWorkflows as jest.MockedFunction<typeof useWorkflows>;

const defaultSearch: WorkflowsSearchParams = {
  page: 1,
  size: WORKFLOWS_TABLE_INITIAL_PAGE_SIZE,
};

const defaultWorkflow = createWorkflowListItem({ id: 'workflow-matrix-1' });

const workflowsQueryResult = {
  data: {
    page: 1,
    size: WORKFLOWS_TABLE_INITIAL_PAGE_SIZE,
    total: 1,
    results: [defaultWorkflow],
  },
  isLoading: false,
  error: undefined,
  refetch: jest.fn(),
} as unknown as ReturnType<typeof useWorkflows>;

function setKibanaCapabilities(workflowsManagement: {
  createWorkflow: boolean;
  updateWorkflow: boolean;
  deleteWorkflow: boolean;
  executeWorkflow: boolean;
}): void {
  mockUseKibana.mockReturnValue({
    services: {
      application: {
        capabilities: {
          workflowsManagement: {
            readWorkflow: true,
            readWorkflowExecution: true,
            cancelWorkflowExecution: false,
            ...workflowsManagement,
          },
        },
        getUrlForApp: jest.fn(
          (_app: string, opts?: { path?: string }) => `/app/workflows${opts?.path ?? ''}`
        ),
        navigateToUrl: jest.fn(),
      },
      notifications: {
        toasts: {
          addSuccess: jest.fn(),
          addError: jest.fn(),
          addWarning: jest.fn(),
          addDanger: jest.fn(),
        },
      },
      settings: {
        client: {
          get: (key: string) => {
            if (key === 'dateFormat') {
              return 'YYYY-MM-DD HH:mm:ss';
            }
            if (key === 'dateFormat:tz') {
              return 'Browser';
            }
            return '';
          },
        },
      },
      http: {},
      triggersActionsUi: {
        actionTypeRegistry: new TypeRegistry<ActionTypeModel>(),
      },
      workflowsExtensions: {
        getStepDefinition: () => undefined,
        getAllStepDefinitions: () => [],
        hasStepDefinition: () => false,
        getTriggerDefinition: () => undefined,
        getAllTriggerDefinitions: () => [],
        hasTriggerDefinition: () => false,
        isReady: () => true,
      },
    },
  } as unknown as ReturnType<typeof useKibana>);
}

function WorkflowListHarness({ item = defaultWorkflow }: { item?: typeof defaultWorkflow } = {}) {
  const [search, setSearch] = useState<WorkflowsSearchParams>(defaultSearch);
  mockUseWorkflows.mockReturnValue({
    ...workflowsQueryResult,
    data: {
      page: 1,
      size: WORKFLOWS_TABLE_INITIAL_PAGE_SIZE,
      total: 1,
      results: [item],
    },
  } as unknown as ReturnType<typeof useWorkflows>);
  return <WorkflowList search={search} setSearch={setSearch} />;
}

const renderList = (options?: { item?: typeof defaultWorkflow }) =>
  render(
    <TestWrapper>
      <EuiProvider colorMode="light">
        <WorkflowListHarness {...options} />
      </EuiProvider>
    </TestWrapper>
  );

function expectControlDisabled(testId: string, disabled: boolean): void {
  const el = screen.getByTestId(testId);
  const isDisabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';

  expect(isDisabled).toBe(disabled);
}

/** Clone / export / delete live in the collapsed “All actions” popover when there are >2 actions. */
async function openFirstRowCollapsedActions(): Promise<void> {
  await userEvent.click(screen.getByTestId('euiCollapsedItemActionsButton'));
}

describe('Authorization matrix', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWorkflows.mockReturnValue(workflowsQueryResult);
  });

  it.each<{
    label: string;
    createWorkflow: boolean;
    updateWorkflow: boolean;
    deleteWorkflow: boolean;
    executeWorkflow: boolean;
    expectRunDisabled: boolean;
    expectSwitchDisabled: boolean;
    expectEditDisabled: boolean;
    expectCloneDisabled: boolean;
    expectDeleteDisabled: boolean;
  }>([
    {
      label: 'read-only',
      createWorkflow: false,
      updateWorkflow: false,
      deleteWorkflow: false,
      executeWorkflow: false,
      expectRunDisabled: true,
      expectSwitchDisabled: true,
      expectEditDisabled: true,
      expectCloneDisabled: true,
      expectDeleteDisabled: true,
    },
    {
      label: 'operator (run only)',
      createWorkflow: false,
      updateWorkflow: false,
      deleteWorkflow: false,
      executeWorkflow: true,
      expectRunDisabled: false,
      expectSwitchDisabled: true,
      expectEditDisabled: true,
      expectCloneDisabled: true,
      expectDeleteDisabled: true,
    },
    {
      label: 'editor (no delete)',
      createWorkflow: true,
      updateWorkflow: true,
      deleteWorkflow: false,
      executeWorkflow: true,
      expectRunDisabled: false,
      expectSwitchDisabled: false,
      expectEditDisabled: false,
      expectCloneDisabled: false,
      expectDeleteDisabled: true,
    },
    {
      label: 'admin (destructive)',
      createWorkflow: true,
      updateWorkflow: true,
      deleteWorkflow: true,
      executeWorkflow: true,
      expectRunDisabled: false,
      expectSwitchDisabled: false,
      expectEditDisabled: false,
      expectCloneDisabled: false,
      expectDeleteDisabled: false,
    },
  ])(
    'row actions + enabled switch for $label',
    async ({
      createWorkflow,
      updateWorkflow,
      deleteWorkflow,
      executeWorkflow,
      expectRunDisabled,
      expectSwitchDisabled,
      expectEditDisabled,
      expectCloneDisabled,
      expectDeleteDisabled,
    }) => {
      setKibanaCapabilities({
        createWorkflow,
        updateWorkflow,
        deleteWorkflow,
        executeWorkflow,
      });
      renderList();

      expectControlDisabled('runWorkflowAction', expectRunDisabled);
      expectControlDisabled(`workflowToggleSwitch-${defaultWorkflow.id}`, expectSwitchDisabled);
      expectControlDisabled('editWorkflowAction', expectEditDisabled);

      await openFirstRowCollapsedActions();
      expectControlDisabled('cloneWorkflowAction', expectCloneDisabled);
      expect(screen.getByTestId('exportWorkflowAction')).not.toBeDisabled();
      expectControlDisabled('deleteWorkflowAction', expectDeleteDisabled);
    }
  );

  it('disables the delete row action for managed workflows', async () => {
    setKibanaCapabilities({
      createWorkflow: true,
      updateWorkflow: true,
      deleteWorkflow: true,
      executeWorkflow: true,
    });
    renderList({ item: createWorkflowListItem({ id: 'managed-wf', managed: true }) });

    await openFirstRowCollapsedActions();

    expect(screen.getByTestId('deleteWorkflowAction')).toBeDisabled();
  });

  it('explains why managed workflows cannot be deleted', async () => {
    setKibanaCapabilities({
      createWorkflow: true,
      updateWorkflow: true,
      deleteWorkflow: true,
      executeWorkflow: true,
    });
    renderList({ item: createWorkflowListItem({ id: 'managed-wf', managed: true }) });

    await openFirstRowCollapsedActions();
    const deleteAction = screen.getByTestId('deleteWorkflowAction');
    await userEvent.hover(deleteAction.parentElement ?? deleteAction);

    expect(await screen.findByText('Managed workflows cannot be deleted')).toBeInTheDocument();
  });

  it('disables the enabled switch when the workflow is invalid even if update is granted', () => {
    setKibanaCapabilities({
      createWorkflow: false,
      updateWorkflow: true,
      deleteWorkflow: false,
      executeWorkflow: false,
    });
    renderList({ item: createWorkflowListItem({ id: 'invalid-wf', valid: false }) });
    expect(screen.getByTestId('workflowToggleSwitch-invalid-wf')).toBeDisabled();
  });
});

describe('Bulk actions menu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function selectFirstDataRow(): Promise<void> {
    const table = screen.getByTestId('workflowListTable');
    const boxes = within(table).getAllByRole('checkbox');
    await userEvent.click(boxes[boxes.length - 1]);
  }

  it('shows disable + export but not enable when the selected workflow is enabled', async () => {
    setKibanaCapabilities({
      createWorkflow: false,
      updateWorkflow: true,
      deleteWorkflow: true,
      executeWorkflow: false,
    });
    renderList({
      item: createWorkflowListItem({ id: 'bulk-enabled', enabled: true, valid: true }),
    });
    await selectFirstDataRow();
    await userEvent.click(screen.getByTestId('workflows-table-bulk-actions-button'));

    expect(screen.queryByTestId('workflows-bulk-action-enable')).not.toBeInTheDocument();
    expect(screen.getByTestId('workflows-bulk-action-disable')).toBeInTheDocument();
    expect(screen.getByTestId('workflows-bulk-action-export')).toBeInTheDocument();
    expect(screen.getByTestId('workflows-bulk-action-delete')).toBeInTheDocument();
  });

  it('omits bulk enable/disable when update is not granted but still shows export', async () => {
    setKibanaCapabilities({
      createWorkflow: false,
      updateWorkflow: false,
      deleteWorkflow: false,
      executeWorkflow: false,
    });
    renderList({
      item: createWorkflowListItem({ id: 'bulk-readonly', enabled: true, valid: true }),
    });
    await selectFirstDataRow();
    await userEvent.click(screen.getByTestId('workflows-table-bulk-actions-button'));

    expect(screen.queryByTestId('workflows-bulk-action-enable')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workflows-bulk-action-disable')).not.toBeInTheDocument();
    expect(screen.getByTestId('workflows-bulk-action-export')).toBeInTheDocument();
    expect(screen.queryByTestId('workflows-bulk-action-delete')).not.toBeInTheDocument();
  });

  it('omits bulk delete when delete is not granted', async () => {
    setKibanaCapabilities({
      createWorkflow: false,
      updateWorkflow: true,
      deleteWorkflow: false,
      executeWorkflow: false,
    });
    renderList();
    await selectFirstDataRow();
    await userEvent.click(screen.getByTestId('workflows-table-bulk-actions-button'));

    expect(screen.getByTestId('workflows-bulk-action-disable')).toBeInTheDocument();
    expect(screen.queryByTestId('workflows-bulk-action-delete')).not.toBeInTheDocument();
  });
});
