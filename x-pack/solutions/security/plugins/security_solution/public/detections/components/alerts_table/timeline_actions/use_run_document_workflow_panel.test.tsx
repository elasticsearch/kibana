/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, renderHook, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EuiContextMenu, EuiPopover } from '@elastic/eui';
import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import {
  DocumentWorkflowsPanel,
  useRunDocumentWorkflowPanel,
  RUN_DOCUMENT_WORKFLOW_PANEL_ID,
  type DocumentTableContextMenuItem,
  type UseRunDocumentWorkflowPanelProps,
} from './use_run_document_workflow_panel';
import { TestProviders } from '../../../../common/mock';
import { createStartServicesMock } from '../../../../common/lib/kibana/kibana_react.mock';
import * as i18n from '../translations';

const mockMutate = jest.fn();
const mockUseRunWorkflow = jest.fn(() => ({ mutate: mockMutate }));
const mockUseWorkflowsCapabilities = jest.fn(() => ({
  canCreateWorkflow: true,
  canReadWorkflow: true,
  canUpdateWorkflow: true,
  canDeleteWorkflow: true,
  canExecuteWorkflow: true,
  canReadWorkflowExecution: true,
  canCancelWorkflowExecution: true,
}));
const mockUseWorkflowsUIEnabledSetting = jest.fn(() => true);
jest.mock('@kbn/kibana-react-plugin/public', () => {
  const actual = jest.requireActual('@kbn/kibana-react-plugin/public');
  return {
    ...actual,
    useKibana: jest.fn(),
  };
});
jest.mock('@kbn/workflows-ui', () => ({
  useRunWorkflow: () => mockUseRunWorkflow(),
  useWorkflows: () => ({ data: { results: [] } }),
  useWorkflowsCapabilities: () => mockUseWorkflowsCapabilities(),
  useWorkflowsUIEnabledSetting: () => mockUseWorkflowsUIEnabledSetting(),
  WorkflowSelector: ({ onWorkflowChange }: { onWorkflowChange: (id: string) => void }) => (
    <div data-test-subj="workflow-selector-mock">
      {'Workflow selector'}
      <button
        data-test-subj="select-workflow-option"
        type="button"
        onClick={() => onWorkflowChange('test-workflow-id')}
      >
        {'Select workflow'}
      </button>
    </div>
  ),
}));

const useKibanaMock = jest.requireMock('@kbn/kibana-react-plugin/public').useKibana as jest.Mock;

const defaultProps: UseRunDocumentWorkflowPanelProps = {
  closePopover: jest.fn(),
  documents: [
    {
      _id: 'doc-123',
      _index: 'documents-index',
      'host.name': 'test-host',
    },
  ],
};

const createMockKibana = (
  overrides: {
    application?: { navigateToApp: jest.Mock };
    rendering?: object;
  } = {}
) => {
  const { application, rendering = {} } = overrides;
  const baseServices = createStartServicesMock();
  return {
    services: {
      ...baseServices,
      application: {
        ...baseServices.application,
        ...application,
      },
      rendering: rendering || undefined,
    },
  };
};

const renderContextMenu = (
  items: DocumentTableContextMenuItem[],
  panels: EuiContextMenuPanelDescriptor[]
) => {
  const panelsToRender = [{ id: 0, items }, ...panels];
  return render(
    <EuiPopover
      aria-label="Context menu"
      isOpen={true}
      panelPaddingSize="none"
      anchorPosition="downLeft"
      closePopover={() => {}}
      button={<></>}
    >
      <EuiContextMenu initialPanelId={panels[0]?.id ?? 1} panels={panelsToRender} />
    </EuiPopover>
  );
};

describe('useRunDocumentWorkflowPanel', () => {
  beforeEach(() => {
    mockUseRunWorkflow.mockReturnValue({ mutate: mockMutate });
    mockUseWorkflowsCapabilities.mockReturnValue({
      canCreateWorkflow: true,
      canReadWorkflow: true,
      canUpdateWorkflow: true,
      canDeleteWorkflow: true,
      canExecuteWorkflow: true,
      canReadWorkflowExecution: true,
      canCancelWorkflowExecution: true,
    });
    mockUseWorkflowsUIEnabledSetting.mockReturnValue(true);
    useKibanaMock.mockReturnValue(createMockKibana());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hook return values', () => {
    it('returns run workflow menu item and panel when workflow UI is enabled and user has execute capability', () => {
      const { result } = renderHook(() => useRunDocumentWorkflowPanel(defaultProps), {
        wrapper: TestProviders,
      });

      expect(result.current.runWorkflowMenuItem).toHaveLength(1);
      expect(result.current.runWorkflowMenuItem[0]['data-test-subj']).toBe(
        'run-document-workflow-action'
      );
      expect(result.current.runWorkflowMenuItem[0].key).toBe('run-document-workflow-action');
      expect(result.current.runWorkflowMenuItem[0].name).toBe(i18n.CONTEXT_MENU_RUN_WORKFLOW);
      expect(result.current.runWorkflowMenuItem[0].panel).toBe(RUN_DOCUMENT_WORKFLOW_PANEL_ID);

      expect(result.current.runDocumentWorkflowPanel).toHaveLength(1);
      expect(result.current.runDocumentWorkflowPanel[0].id).toBe(RUN_DOCUMENT_WORKFLOW_PANEL_ID);
      expect(result.current.runDocumentWorkflowPanel[0].title).toBe(
        i18n.SELECT_WORKFLOW_PANEL_TITLE
      );
      expect(result.current.runDocumentWorkflowPanel[0]['data-test-subj']).toBe(
        'document-workflow-context-menu-panel'
      );
    });

    it('returns empty lists when workflow UI is disabled', () => {
      mockUseWorkflowsUIEnabledSetting.mockReturnValue(false);

      const { result } = renderHook(() => useRunDocumentWorkflowPanel(defaultProps), {
        wrapper: TestProviders,
      });

      expect(result.current.runWorkflowMenuItem).toEqual([]);
      expect(result.current.runDocumentWorkflowPanel).toEqual([]);
    });

    it('returns empty lists when user does not have executeWorkflow capability', () => {
      mockUseWorkflowsCapabilities.mockReturnValue({
        canCreateWorkflow: true,
        canReadWorkflow: true,
        canUpdateWorkflow: true,
        canDeleteWorkflow: true,
        canExecuteWorkflow: false,
        canReadWorkflowExecution: true,
        canCancelWorkflowExecution: true,
      });

      const { result } = renderHook(() => useRunDocumentWorkflowPanel(defaultProps), {
        wrapper: TestProviders,
      });

      expect(result.current.runWorkflowMenuItem).toEqual([]);
      expect(result.current.runDocumentWorkflowPanel).toEqual([]);
    });
  });

  describe('panel content', () => {
    it('renders the workflow panel with selector and execute button', async () => {
      const { result } = renderHook(() => useRunDocumentWorkflowPanel(defaultProps), {
        wrapper: TestProviders,
      });
      const items = result.current.runWorkflowMenuItem;
      const panels = result.current.runDocumentWorkflowPanel;
      const { getByTestId, getByRole } = renderContextMenu(items, panels);

      await waitFor(() => {
        expect(getByTestId('workflow-selector-mock')).toBeInTheDocument();
      });
      expect(getByTestId('execute-document-workflow-button')).toBeInTheDocument();
      expect(getByRole('button', { name: i18n.RUN_WORKFLOW_BUTTON })).toBeInTheDocument();
    });
  });
});

describe('DocumentWorkflowsPanel', () => {
  beforeEach(() => {
    useKibanaMock.mockReturnValue(
      createMockKibana({
        application: { navigateToApp: jest.fn() },
        rendering: {},
      })
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('execute button is disabled when no workflow is selected', () => {
    const { result } = renderHook(() => useRunDocumentWorkflowPanel(defaultProps), {
      wrapper: TestProviders,
    });
    const panels = result.current.runDocumentWorkflowPanel;
    render(<TestProviders>{panels[0].content}</TestProviders>);

    const executeButton = screen.getByTestId('execute-document-workflow-button');
    expect(executeButton).toBeDisabled();
  });

  it('calls runWorkflow.mutate with document payload when workflow is selected and execute is clicked', async () => {
    const user = userEvent.setup();
    const closePopoverFn = jest.fn();
    mockMutate.mockImplementation((_vars: unknown, { onSettled }: { onSettled?: () => void }) => {
      onSettled?.();
    });

    const { result } = renderHook(
      () =>
        useRunDocumentWorkflowPanel({
          ...defaultProps,
          closePopover: closePopoverFn,
        }),
      { wrapper: TestProviders }
    );
    const panels = result.current.runDocumentWorkflowPanel;

    render(<TestProviders>{panels[0].content}</TestProviders>);

    const selectButton = screen.getByTestId('select-workflow-option');
    await user.click(selectButton);

    const executeButton = screen.getByTestId('execute-document-workflow-button');
    expect(executeButton).not.toBeDisabled();
    await user.click(executeButton);

    expect(mockMutate).toHaveBeenCalledWith(
      {
        id: 'test-workflow-id',
        inputs: {
          event: {
            triggerType: 'document',
            documents: [
              {
                _id: 'doc-123',
                _index: 'documents-index',
                'host.name': 'test-host',
              },
            ],
          },
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
        onSettled: expect.any(Function),
      })
    );
    expect(closePopoverFn).toHaveBeenCalled();
  });

  it('calls onExecute callback when workflow execution is triggered', async () => {
    const user = userEvent.setup();
    const onExecuteFn = jest.fn();
    mockMutate.mockImplementation((_vars: unknown, { onSettled }: { onSettled?: () => void }) => {
      onSettled?.();
    });

    render(
      <TestProviders>
        <DocumentWorkflowsPanel
          documents={[{ _id: 'doc-123', _index: 'documents-index' }]}
          onClose={jest.fn()}
          onExecute={onExecuteFn}
        />
      </TestProviders>
    );

    await user.click(screen.getByTestId('select-workflow-option'));
    await user.click(screen.getByTestId('execute-document-workflow-button'));

    expect(onExecuteFn).toHaveBeenCalledTimes(1);
  });
});
