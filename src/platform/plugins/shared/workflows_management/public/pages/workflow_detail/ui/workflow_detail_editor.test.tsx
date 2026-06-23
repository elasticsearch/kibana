/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import { useWorkflowsCapabilities } from '@kbn/workflows-ui';
import { WorkflowDetailEditor } from './workflow_detail_editor';
import { createMockStore } from '../../../entities/workflows/store/__mocks__/store.mock';
import {
  _setComputedDataInternal,
  setYamlString,
} from '../../../entities/workflows/store/workflow_detail/slice';
import { mockWorkflowsManagementCapabilities } from '../../../hooks/__mocks__/use_workflows_capabilities';
import { TestWrapper } from '../../../shared/test_utils';

// Mock hooks
const mockUseKibana = jest.fn();
const mockUseWorkflowUrlState = jest.fn();
const mockUseWorkflowActions = jest.fn();
const mockUseSelector = jest.fn();

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: () => mockUseKibana(),
}));
jest.mock('../../../hooks/use_workflow_url_state', () => ({
  useWorkflowUrlState: () => mockUseWorkflowUrlState(),
}));
jest.mock('../../../entities/workflows/model/use_workflow_actions', () => ({
  useWorkflowActions: () => mockUseWorkflowActions(),
}));
jest.mock('../../../entities/connectors/model/use_available_connectors', () => ({
  useFetchConnector: () => jest.fn(() => ({ data: undefined, isLoading: false })),
}));
jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useSelector: (selector: any) => mockUseSelector(selector),
}));

// Mock lazy loaded components
const WorkflowYAMLEditorMock = ({ highlightDiff, onStepRun }: any) => (
  <div data-test-subj="workflow-yaml-editor">
    {highlightDiff && <span data-test-subj="highlight-diff-indicator">{'Highlight Diff'}</span>}
    <button
      type="button"
      data-test-subj="test-step-run"
      onClick={() => onStepRun?.({ stepId: 'test-step', actionType: 'run' })}
    >
      {'Run Step'}
    </button>
  </div>
);

jest.mock('../../../widgets/workflow_yaml_editor/ui/workflow_yaml_editor', () => ({
  WorkflowYAMLEditor: WorkflowYAMLEditorMock,
}));

jest.mock('../../../widgets/workflow_yaml_editor', () => ({
  WorkflowYAMLEditor: WorkflowYAMLEditorMock,
}));

jest.mock('../../../features/workflow_visual_editor', () => ({
  WorkflowVisualEditor: () => (
    <div data-test-subj="workflow-visual-editor">
      <div data-test-subj="visual-editor-content">{'Visual Editor'}</div>
    </div>
  ),
}));

jest.mock('../../../features/debug_graph/execution_graph', () => ({
  ExecutionGraph: () => (
    <div data-test-subj="execution-graph">
      <div data-test-subj="execution-graph-content">{'Execution Graph'}</div>
    </div>
  ),
}));

const mockUseContextOverrideData = jest.fn((stepId: string) => ({
  stepContext: { mockKey: 'mockValue' },
  schema: {},
}));
jest.mock('./use_context_override_data', () => ({
  useContextOverrideData: () => mockUseContextOverrideData,
}));

jest.mock('../../../hooks/use_workflows_experimental_ui_setting', () => ({
  useWorkflowsExperimentalUiSetting: jest.fn().mockReturnValue(false),
}));

jest.mock('@kbn/workflows-ui', () => ({
  ...jest.requireActual('@kbn/workflows-ui'),
  useWorkflowsCapabilities: jest.fn(),
}));

const mockUseWorkflowsCapabilities = useWorkflowsCapabilities as jest.MockedFunction<
  typeof useWorkflowsCapabilities
>;

describe('WorkflowDetailEditor', () => {
  const mockYaml =
    'version: "1"\nname: Test Workflow\ntriggers:\n  - type: manual\nsteps:\n  - type: log\n    with:\n      message: hello';

  const mockStore = () => {
    const store = createMockStore();
    store.dispatch(setYamlString(mockYaml));
    store.dispatch(
      _setComputedDataInternal({
        workflowDefinition: {
          version: '1',
          name: 'Test Workflow',
          enabled: true,
          triggers: [],
          steps: [
            {
              name: 'test-step',
              type: 'test',
              with: {},
            },
          ],
        },
      })
    );
    return store;
  };

  const renderEditor = (props = {}) => {
    const store = mockStore();
    const wrapper = ({ children }: { children: React.ReactNode }) => {
      return <TestWrapper store={store}>{children}</TestWrapper>;
    };
    const result = render(<WorkflowDetailEditor {...props} />, { wrapper });
    return { ...result, store };
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseWorkflowsCapabilities.mockReturnValue(mockWorkflowsManagementCapabilities);

    mockUseKibana.mockReturnValue({
      services: {
        notifications: { toasts: { addError: jest.fn() } },
      },
    });

    mockUseWorkflowUrlState.mockReturnValue({
      activeTab: 'workflow',
      selectedExecutionId: null,
      setSelectedExecution: jest.fn(),
    });

    mockUseWorkflowActions.mockReturnValue({
      runIndividualStep: {
        mutateAsync: jest.fn().mockResolvedValue({ workflowExecutionId: 'exec-123' }),
      },
    });

    mockUseSelector.mockImplementation((selector: any) => {
      // Mock selectYamlString
      if (selector.toString().includes('selectYamlString')) {
        return mockYaml;
      }
      // Mock selectWorkflowId
      if (selector.toString().includes('selectWorkflowId')) {
        return 'workflow-1';
      }
      // Mock selectWorkflowDefinition
      if (selector.toString().includes('selectWorkflowDefinition')) {
        return {
          version: '1',
          name: 'Test Workflow',
          enabled: true,
          triggers: [],
          steps: [
            {
              name: 'test-step',
              type: 'test',
              with: {},
            },
          ],
        };
      }
      return null;
    });
  });

  describe('rendering', () => {
    it('should render the YAML editor', async () => {
      const { findByTestId } = renderEditor();
      expect(await findByTestId('workflow-yaml-editor')).toBeInTheDocument();
    });

    it('should pass highlightDiff prop to YAML editor', () => {
      const { getByTestId } = renderEditor({ highlightDiff: true });
      expect(getByTestId('highlight-diff-indicator')).toBeInTheDocument();
    });
  });

  describe('configuration options', () => {
    it('should check visual editor configuration', () => {
      const { container } = renderEditor();
      expect(container).toBeTruthy();
    });

    it('should check execution graph configuration', () => {
      const { container } = renderEditor();
      expect(container).toBeTruthy();
    });
  });

  describe('step run functionality', () => {
    it('should dispatch setTestStepModalOpenStepId when step run needs modal', async () => {
      const { getByTestId, store } = renderEditor();
      const runButton = getByTestId('test-step-run');

      await act(async () => {
        runButton.click();
      });

      expect(store?.getState().detail.testStepModalOpenStepId).toBe('test-step');
    });

    it('should show toast error when immediate step run (no modal) fails', async () => {
      mockUseContextOverrideData.mockReturnValue({ stepContext: {}, schema: {} } as any);

      const mockMutateAsync = jest.fn().mockRejectedValue(new Error('Failed to run step'));
      mockUseWorkflowActions.mockReturnValue({
        runIndividualStep: { mutateAsync: mockMutateAsync },
      });

      const { getByTestId } = renderEditor();
      const runButton = getByTestId('test-step-run');

      await act(async () => {
        runButton.click();
      });

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled();
      });

      expect(mockUseKibana().services.notifications.toasts.addError).toHaveBeenCalledWith(
        new Error('Failed to run step'),
        { title: 'Failed to run step' }
      );
    });

    it('does not run step or open modal when executeWorkflow is not granted', async () => {
      mockUseWorkflowsCapabilities.mockReturnValue({
        ...mockWorkflowsManagementCapabilities,
        canExecuteWorkflow: false,
      });
      mockUseContextOverrideData.mockReturnValue({
        stepContext: { inputs: {} },
        schema: {},
      } as any);

      const mockMutateAsync = jest.fn();
      mockUseWorkflowActions.mockReturnValue({
        runIndividualStep: { mutateAsync: mockMutateAsync },
      });

      const { getByTestId, store } = renderEditor();
      await act(async () => {
        getByTestId('test-step-run').click();
      });

      expect(mockMutateAsync).not.toHaveBeenCalled();
      expect(store?.getState().detail.testStepModalOpenStepId).toBeUndefined();
    });
  });
});
