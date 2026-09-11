/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, renderHook, waitFor } from '@testing-library/react';
import { EuiContextMenu, EuiPopover } from '@elastic/eui';
import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import type { WorkflowListItemDto } from '@kbn/workflows';
import type { RunWorkflowPanelProps } from '@kbn/workflows-ui';
import {
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
const mockRunWorkflowPanelProps: RunWorkflowPanelProps[] = [];
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
  // RunWorkflowPanel now lives in @kbn/workflows-ui.
  // Its full behavior is tested in src/platform/packages/shared/kbn-workflows-ui.
  // This stub captures caller-owned inputs and sorting.
  RunWorkflowPanel: (props: RunWorkflowPanelProps) => {
    mockRunWorkflowPanelProps.push(props);
    return (
      <div>
        <div data-test-subj="workflow-selector-mock">{'Workflow selector stub'}</div>
        <button data-test-subj="run-workflow-execute-button" type="button">
          {'Run workflow'}
        </button>
      </div>
    );
  },
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

const createMockWorkflow = (id: string, triggerType: 'alert' | 'manual'): WorkflowListItemDto => ({
  id,
  name: id,
  description: '',
  enabled: true,
  valid: true,
  createdAt: '',
  definition: {
    triggers: [{ type: triggerType }],
  } as WorkflowListItemDto['definition'],
});

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
    mockRunWorkflowPanelProps.length = 0;
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
      expect(result.current.runWorkflowMenuItem[0].icon).toBe('workflow');
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
    it('renders the workflow panel with the document caller configuration', async () => {
      const { result } = renderHook(() => useRunDocumentWorkflowPanel(defaultProps), {
        wrapper: TestProviders,
      });
      const items = result.current.runWorkflowMenuItem;
      const panels = result.current.runDocumentWorkflowPanel;
      const { getByTestId } = renderContextMenu(items, panels);

      await waitFor(() => {
        expect(getByTestId('workflow-selector-mock')).toBeInTheDocument();
      });
      expect(getByTestId('run-workflow-execute-button')).toBeInTheDocument();

      const panelProps = mockRunWorkflowPanelProps[mockRunWorkflowPanelProps.length - 1];
      if (!panelProps) {
        throw new Error('Expected RunWorkflowPanel to render');
      }
      expect(panelProps.inputs).toEqual({
        event: {
          triggerType: 'document',
          documents: defaultProps.documents,
        },
      });
      expect(panelProps.visibility).toBeUndefined();
      expect(panelProps.filterWorkflow).toBeUndefined();
      expect(panelProps.onClose).toBe(defaultProps.closePopover);

      const { sortWorkflow } = panelProps;
      if (!sortWorkflow) {
        throw new Error('Expected document workflow sorting');
      }

      const alertWorkflow = createMockWorkflow('alert-workflow', 'alert');
      const manualWorkflow = createMockWorkflow('manual-workflow', 'manual');
      expect([alertWorkflow, manualWorkflow].sort(sortWorkflow)).toEqual([
        manualWorkflow,
        alertWorkflow,
      ]);
    });
  });
});
// Full RunWorkflowPanel behavior (mutate, toasts, manual inputs) is covered by:
//   src/platform/packages/shared/kbn-workflows-ui/src/components/run_workflow_panel/run_workflow_panel.test.tsx
