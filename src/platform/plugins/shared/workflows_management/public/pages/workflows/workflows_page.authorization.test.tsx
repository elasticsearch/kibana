/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiProvider } from '@elastic/eui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@kbn/i18n-react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { useShowManagedWorkflowsSetting, useWorkflows } from '@kbn/workflows-ui';
import { WorkflowsPage } from '.';
import { PLUGIN_ID } from '../../../common';
import { useWorkflowFiltersOptions } from '../../entities/workflows/model/use_workflow_stats';
import { TestWrapper } from '../../shared/test_utils/test_wrapper';

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: jest.fn(),
}));

const mockUseKibana = useKibana as jest.MockedFunction<typeof useKibana>;

jest.mock('@kbn/workflows-ui', () => {
  const actual = jest.requireActual('@kbn/workflows-ui');
  return {
    ...actual,
    useShowManagedWorkflowsSetting: jest.fn(),
    useWorkflows: jest.fn(),
  };
});

jest.mock('../../hooks/use_workflow_breadcrumbs/use_workflow_breadcrumbs', () => ({
  useWorkflowsBreadcrumbs: jest.fn(),
}));

jest.mock('../../entities/workflows/model/use_workflow_stats', () => ({
  useWorkflowFiltersOptions: jest.fn(),
}));

jest.mock('../../features/workflow_list', () => ({
  WorkflowList: () => <div data-test-subj="mockWorkflowListForAuthzTest" />,
}));

jest.mock('../../widgets/workflow_search_field/ui/workflow_search_field', () => ({
  WorkflowSearchField: ({ onSearch }: { onSearch: (query: string) => void }) => (
    <button type="button" data-test-subj="workflowSearchField" onClick={() => onSearch('security')}>
      {'Search workflows'}
    </button>
  ),
}));

const mockUseWorkflows = useWorkflows as jest.MockedFunction<typeof useWorkflows>;
const mockUseShowManagedWorkflowsSetting = useShowManagedWorkflowsSetting as jest.MockedFunction<
  typeof useShowManagedWorkflowsSetting
>;
const mockUseWorkflowFiltersOptions = useWorkflowFiltersOptions as jest.MockedFunction<
  typeof useWorkflowFiltersOptions
>;
let mockNavigateToApp: jest.Mock;

const emptyWorkflowsResult = {
  data: { results: [], total: 0 },
  isLoading: false,
  error: undefined,
  refetch: jest.fn(),
};

const filtersData = {
  enabled: [{ label: 'false', key: 'false' }],
  createdBy: [{ label: 'alice', key: 'alice' }],
  tags: [{ label: 'prod', key: 'prod' }],
};

const renderPage = (routerHistory?: React.ComponentProps<typeof TestWrapper>['routerHistory']) =>
  render(
    <TestWrapper routerHistory={routerHistory}>
      <I18nProvider>
        <EuiProvider colorMode="light">
          <WorkflowsPage />
        </EuiProvider>
      </I18nProvider>
    </TestWrapper>
  );

function mockCapabilities(
  createWorkflow: boolean,
  updateWorkflow: boolean,
  {
    readWorkflow = true,
    readManagedWorkflow = true,
  }: {
    readWorkflow?: boolean;
    readManagedWorkflow?: boolean;
  } = {}
): void {
  mockNavigateToApp = jest.fn();
  mockUseKibana.mockReturnValue({
    services: {
      application: {
        capabilities: {
          workflowsManagement: {
            createWorkflow,
            readWorkflow,
            readManagedWorkflow,
            updateWorkflow,
          },
        },
        navigateToApp: mockNavigateToApp,
      },
      featureFlags: {
        getBooleanValue: () => false,
      },
    },
  } as ReturnType<typeof useKibana>);
}

describe('WorkflowsPage authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWorkflows.mockReturnValue(emptyWorkflowsResult as any);
    mockUseShowManagedWorkflowsSetting.mockReturnValue(false);
    mockUseWorkflowFiltersOptions.mockReturnValue({
      data: filtersData,
    } as unknown as ReturnType<typeof useWorkflowFiltersOptions>);
  });

  it.each([
    {
      label: 'editor (create + update)',
      createWorkflow: true,
      updateWorkflow: true,
      expectCreate: true,
      expectImport: true,
    },
    {
      label: 'create only (import hidden — needs update too)',
      createWorkflow: true,
      updateWorkflow: false,
      expectCreate: true,
      expectImport: false,
    },
    {
      label: 'update only',
      createWorkflow: false,
      updateWorkflow: true,
      expectCreate: false,
      expectImport: false,
    },
    {
      label: 'read-only',
      createWorkflow: false,
      updateWorkflow: false,
      expectCreate: false,
      expectImport: false,
    },
  ])(
    'header: $label — Create=$expectCreate, Import=$expectImport',
    ({ createWorkflow, updateWorkflow, expectCreate, expectImport }) => {
      mockCapabilities(createWorkflow, updateWorkflow);

      renderPage();

      if (expectCreate) {
        expect(screen.getByTestId('createWorkflowButton')).toBeInTheDocument();
      } else {
        expect(screen.queryByTestId('createWorkflowButton')).not.toBeInTheDocument();
      }

      if (expectImport) {
        expect(screen.getByTestId('importWorkflowsButton')).toBeInTheDocument();
      } else {
        expect(screen.queryByTestId('importWorkflowsButton')).not.toBeInTheDocument();
      }
    }
  );

  it('resets page to 1 when the query changes', () => {
    mockCapabilities(true, true);
    mockUseWorkflows.mockReturnValue({
      ...emptyWorkflowsResult,
      data: { results: [{}], total: 1 },
    } as any);

    renderPage(['/?page=3']);

    fireEvent.click(screen.getByTestId('workflowSearchField'));

    expect(mockNavigateToApp).toHaveBeenCalledWith(PLUGIN_ID, {
      path: '?query=security',
      replace: true,
    });
  });

  it('hides the managed filter when the setting is disabled', () => {
    mockCapabilities(true, true);
    mockUseWorkflows.mockReturnValue({
      ...emptyWorkflowsResult,
      data: { results: [{}], total: 1 },
    } as any);

    renderPage();

    expect(screen.queryByTestId('managed-filter-popover-button')).not.toBeInTheDocument();
  });

  it('shows the workflow type filter when the managed workflow setting is enabled', () => {
    mockCapabilities(true, true);
    mockUseShowManagedWorkflowsSetting.mockReturnValue(true);
    mockUseWorkflows.mockReturnValue({
      ...emptyWorkflowsResult,
      data: { results: [{}], total: 1 },
    } as any);

    renderPage();

    expect(screen.getByTestId('managed-filter-popover-button')).toBeInTheDocument();
    expect(mockUseWorkflows).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ managed: expect.anything() })
    );
  });

  it.each([
    {
      label: 'base workflow read is missing',
      readWorkflow: false,
      readManagedWorkflow: true,
    },
    {
      label: 'managed workflow read is missing',
      readWorkflow: true,
      readManagedWorkflow: false,
    },
  ])('hides the workflow type filter when $label', ({ readWorkflow, readManagedWorkflow }) => {
    mockCapabilities(true, true, { readWorkflow, readManagedWorkflow });
    mockUseShowManagedWorkflowsSetting.mockReturnValue(true);
    mockUseWorkflows.mockReturnValue({
      ...emptyWorkflowsResult,
      data: { results: [{}], total: 1 },
    } as any);

    renderPage();

    expect(screen.queryByTestId('managed-filter-popover-button')).not.toBeInTheDocument();
    expect(mockUseWorkflowFiltersOptions).toHaveBeenLastCalledWith(
      ['enabled', 'createdBy', 'tags'],
      undefined
    );
  });

  it('shows the workflow type filter when managed workflows are visible and the custom workflow list is empty', () => {
    mockCapabilities(true, true);
    mockUseShowManagedWorkflowsSetting.mockReturnValue(true);

    renderPage();

    expect(screen.getByTestId('managed-filter-popover-button')).toBeInTheDocument();
  });

  it('updates the URL to request all workflows when custom and managed workflow types are selected', () => {
    mockCapabilities(true, true);
    mockUseShowManagedWorkflowsSetting.mockReturnValue(true);
    mockUseWorkflows.mockReturnValue({
      ...emptyWorkflowsResult,
      data: { results: [{}], total: 1 },
    } as any);

    renderPage();

    fireEvent.click(screen.getByTestId('managed-filter-popover-button'));
    fireEvent.click(screen.getByText('Managed'));

    expect(mockNavigateToApp).toHaveBeenCalledWith(PLUGIN_ID, {
      path: '?managed=all',
      replace: true,
    });
  });

  it('loads workflow filter options for all visible workflow types when managed workflows are visible', async () => {
    mockCapabilities(true, true);
    mockUseShowManagedWorkflowsSetting.mockReturnValue(true);
    mockUseWorkflows.mockReturnValue({
      ...emptyWorkflowsResult,
      data: { results: [{}], total: 1 },
    } as any);

    renderPage();

    expect(mockUseWorkflowFiltersOptions).toHaveBeenLastCalledWith(
      ['enabled', 'createdBy', 'tags'],
      'all'
    );

    fireEvent.click(screen.getByTestId('managed-filter-popover-button'));
    fireEvent.click(screen.getByText('Managed'));

    await waitFor(() => {
      expect(mockUseWorkflowFiltersOptions).toHaveBeenLastCalledWith(
        ['enabled', 'createdBy', 'tags'],
        'all'
      );
    });
  });
});
