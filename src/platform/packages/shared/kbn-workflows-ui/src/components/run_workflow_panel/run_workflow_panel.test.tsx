/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { WorkflowListItemDto } from '@kbn/workflows';
import { RunWorkflowPanel } from './run_workflow_panel';
import type { RunWorkflowExecutor, RunWorkflowPanelProps } from './run_workflow_panel';
import * as i18n from './translations';
import type { WorkflowSelectorConfig } from '../workflow_selector/workflow_utils';

const mockMutate = jest.fn();
const mockUseWorkflows = jest.fn((_params: unknown) => ({ data: { results: mockWorkflowsData } }));
const mockUseWorkflowsCapabilities = jest.fn(() => ({ canReadManagedWorkflow: true }));
const mockNavigateToApp = jest.fn();
const mockAddSuccess = jest.fn();
const mockAddError = jest.fn();

interface MockWorkflowSelectorProps {
  config: WorkflowSelectorConfig;
  onWorkflowChange: (id: string) => void;
}

const mockWorkflowSelector = jest.fn(({ onWorkflowChange }: MockWorkflowSelectorProps) => (
  <div data-test-subj="workflow-selector-mock">
    <button
      data-test-subj="select-workflow-option"
      type="button"
      onClick={() => onWorkflowChange('test-workflow-id')}
    >
      {'Select workflow'}
    </button>
  </div>
));

const noInputsWorkflow: WorkflowListItemDto = {
  id: 'test-workflow-id',
  name: 'Test Workflow',
  description: '',
  enabled: true,
  valid: true,
  createdAt: '',
  definition: {
    triggers: [{ type: 'alert' }],
  } as unknown as WorkflowListItemDto['definition'],
};

const requiredInputsWorkflow: WorkflowListItemDto = {
  id: 'test-workflow-id',
  name: 'My Workflow',
  description: '',
  enabled: true,
  valid: true,
  createdAt: '',
  definition: {
    triggers: [
      {
        type: 'manual',
        inputs: {
          type: 'object',
          properties: { ticketId: { type: 'string' } },
          required: ['ticketId'],
        },
      },
    ],
  } as unknown as WorkflowListItemDto['definition'],
};

let mockWorkflowsData: WorkflowListItemDto[] = [noInputsWorkflow];

jest.mock('../../hooks/use_run_workflow', () => ({
  useRunWorkflow: () => ({ mutate: mockMutate }),
}));

jest.mock('../../hooks/use_workflows', () => ({
  useWorkflows: (params: unknown) => mockUseWorkflows(params),
}));

jest.mock('../../hooks/use_workflows_capabilities', () => ({
  useWorkflowsCapabilities: () => mockUseWorkflowsCapabilities(),
}));

jest.mock('../workflow_selector/workflow_selector', () => ({
  WorkflowSelector: (props: MockWorkflowSelectorProps) => mockWorkflowSelector(props),
}));

jest.mock('./run_workflow_inputs_modal', () => ({
  RunWorkflowInputsModal: ({
    onSubmit,
    onCancel,
  }: {
    onSubmit: (v: Record<string, unknown>) => void;
    onCancel: () => void;
  }) => (
    <div data-test-subj="run-workflow-inputs-modal">
      <button
        data-test-subj="inputs-modal-submit"
        type="button"
        onClick={() => onSubmit({ ticketId: 'ABC' })}
      >
        {'Run'}
      </button>
      <button data-test-subj="inputs-modal-cancel" type="button" onClick={onCancel}>
        {'Cancel'}
      </button>
    </div>
  ),
}));

jest.mock('@kbn/react-kibana-mount', () => ({
  toMountPoint: (node: unknown) => node,
}));

jest.mock('@kbn/kibana-react-plugin/public', () => {
  const actual = jest.requireActual('@kbn/kibana-react-plugin/public');
  return {
    ...actual,
    useKibana: () => ({
      services: {
        application: { navigateToApp: mockNavigateToApp },
        rendering: {},
        notifications: {
          toasts: {
            addSuccess: mockAddSuccess,
            addError: mockAddError,
          },
        },
      },
    }),
  };
});

const defaultProps: RunWorkflowPanelProps = {
  inputs: { alert_ids: ['alert-1'] },
  sortWorkflow: (a: WorkflowListItemDto, b: WorkflowListItemDto) =>
    Number((b.definition?.triggers ?? []).some((t) => t.type === 'alert')) -
    Number((a.definition?.triggers ?? []).some((t) => t.type === 'alert')),
  onClose: jest.fn(),
};

const renderComponent = (props: Partial<RunWorkflowPanelProps> = {}) =>
  render(<RunWorkflowPanel {...defaultProps} {...props} />);

describe('RunWorkflowPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkflowsData = [noInputsWorkflow];
    mockUseWorkflowsCapabilities.mockReturnValue({ canReadManagedWorkflow: true });
  });

  it('should render the workflow selector', () => {
    renderComponent();

    expect(screen.getByTestId('workflow-selector-mock')).toBeInTheDocument();
  });

  it('should render the execute button', () => {
    renderComponent();

    expect(screen.getByTestId('run-workflow-execute-button')).toBeInTheDocument();
    expect(screen.getByTestId('run-workflow-execute-button')).toHaveTextContent(
      i18n.RUN_WORKFLOW_BUTTON
    );
  });

  it('should disable the execute button when no workflow is selected', () => {
    renderComponent();

    expect(screen.getByTestId('run-workflow-execute-button')).toBeDisabled();
  });

  it('should enable the execute button after selecting a workflow', () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('select-workflow-option'));

    expect(screen.getByTestId('run-workflow-execute-button')).not.toBeDisabled();
  });

  it('should call runWorkflow.mutate with the selected workflow id and inputs on execute', () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('select-workflow-option'));
    fireEvent.click(screen.getByTestId('run-workflow-execute-button'));

    expect(mockMutate).toHaveBeenCalledWith(
      { id: 'test-workflow-id', inputs: { alert_ids: ['alert-1'] } },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
        onSettled: expect.any(Function),
      })
    );
  });

  it('should not call mutate when clicking execute without a selection', () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('run-workflow-execute-button'));

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('should call onClose on settled', () => {
    const onClose = jest.fn();
    renderComponent({ onClose });

    fireEvent.click(screen.getByTestId('select-workflow-option'));
    fireEvent.click(screen.getByTestId('run-workflow-execute-button'));

    const { onSettled } = mockMutate.mock.calls[0][1];
    onSettled();

    expect(onClose).toHaveBeenCalled();
  });

  it('should call onExecute when provided', () => {
    const onExecute = jest.fn();
    renderComponent({ onExecute });

    fireEvent.click(screen.getByTestId('select-workflow-option'));
    fireEvent.click(screen.getByTestId('run-workflow-execute-button'));

    expect(onExecute).toHaveBeenCalledTimes(1);
  });

  it('should show a loading spinner while executing', () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('select-workflow-option'));
    fireEvent.click(screen.getByTestId('run-workflow-execute-button'));

    expect(screen.getByTestId('run-workflow-execute-button')).toBeDisabled();
  });

  it('should re-enable the button after settled', async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('select-workflow-option'));
    fireEvent.click(screen.getByTestId('run-workflow-execute-button'));

    const { onSettled } = mockMutate.mock.calls[0][1];
    onSettled();

    await waitFor(() => {
      expect(screen.getByTestId('run-workflow-execute-button')).not.toBeDisabled();
    });
  });

  it('should show a success toast on successful execution', () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('select-workflow-option'));
    fireEvent.click(screen.getByTestId('run-workflow-execute-button'));

    const { onSuccess } = mockMutate.mock.calls[0][1];
    onSuccess({ workflowExecutionId: 'exec-123' });

    expect(mockAddSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ title: i18n.WORKFLOW_START_SUCCESS_TOAST })
    );
  });

  it('should show an error toast on failed execution', () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('select-workflow-option'));
    fireEvent.click(screen.getByTestId('run-workflow-execute-button'));

    const error = new Error('something went wrong');
    const { onError } = mockMutate.mock.calls[0][1];
    onError(error);

    expect(mockAddError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'something went wrong' }),
      {
        title: i18n.WORKFLOW_START_FAILED_TOAST,
      }
    );
  });

  it('should prefer the API error message in the error toast', () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('select-workflow-option'));
    fireEvent.click(screen.getByTestId('run-workflow-execute-button'));

    const error = Object.assign(new Error('Forbidden'), {
      body: { message: 'You do not have permission to run this workflow', statusCode: 403 },
    });
    const { onError } = mockMutate.mock.calls[0][1];
    onError(error);

    expect(mockAddError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'You do not have permission to run this workflow' }),
      {
        title: i18n.WORKFLOW_START_FAILED_TOAST,
      }
    );
  });

  describe('managed workflow fetching', () => {
    it('does not fetch managed workflows when no visibility is provided', () => {
      // Without a visibility prop the server would return all managed workflows regardless of
      // context — gate it server-side so only the caller's relevant slice is fetched.
      renderComponent();

      expect(mockUseWorkflows).toHaveBeenCalledWith(
        expect.not.objectContaining({ managed: expect.anything() })
      );
    });

    it('fetches managed workflows when visibility is provided and canReadManagedWorkflow is true', () => {
      renderComponent({ visibility: { selectors: ['rule_action'] } });

      expect(mockUseWorkflows).toHaveBeenCalledWith(
        expect.objectContaining({
          managed: 'all',
          visibilityContext: ['selector:rule_action'],
        })
      );
    });

    it('does not fetch managed workflows when canReadManagedWorkflow is false, even with visibility', () => {
      mockUseWorkflowsCapabilities.mockReturnValue({ canReadManagedWorkflow: false });

      renderComponent({ visibility: { selectors: ['rule_action'] } });

      expect(mockUseWorkflows).toHaveBeenCalledWith(
        expect.not.objectContaining({ managed: expect.anything() })
      );
    });

    it('applies filterWorkflow as a client-side post-filter after server results are returned', () => {
      const managedWorkflow = {
        ...noInputsWorkflow,
        id: 'managed-wf',
        name: 'Managed workflow',
        managed: true,
      };
      mockWorkflowsData = [noInputsWorkflow, managedWorkflow];

      renderComponent({
        visibility: { selectors: ['rule_action'] },
        filterWorkflow: (w) => !w.managed,
      });

      const [{ config }] = mockWorkflowSelector.mock.calls[0];

      expect(config.filterFunction?.(mockWorkflowsData)).toEqual([noInputsWorkflow]);
    });
  });

  describe('with required manual inputs', () => {
    beforeEach(() => {
      mockWorkflowsData = [requiredInputsWorkflow];
    });

    it('should open the inputs modal instead of running immediately', () => {
      renderComponent();

      fireEvent.click(screen.getByTestId('select-workflow-option'));
      fireEvent.click(screen.getByTestId('run-workflow-execute-button'));

      expect(screen.getByTestId('run-workflow-inputs-modal')).toBeInTheDocument();
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('should close the modal without running when cancel is clicked', () => {
      renderComponent();

      fireEvent.click(screen.getByTestId('select-workflow-option'));
      fireEvent.click(screen.getByTestId('run-workflow-execute-button'));
      fireEvent.click(screen.getByTestId('inputs-modal-cancel'));

      expect(screen.queryByTestId('run-workflow-inputs-modal')).not.toBeInTheDocument();
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('should run with merged inputs when the modal is submitted', () => {
      renderComponent();

      fireEvent.click(screen.getByTestId('select-workflow-option'));
      fireEvent.click(screen.getByTestId('run-workflow-execute-button'));
      fireEvent.click(screen.getByTestId('inputs-modal-submit'));

      expect(mockMutate).toHaveBeenCalledWith(
        {
          id: 'test-workflow-id',
          inputs: { ticketId: 'ABC', alert_ids: ['alert-1'] },
        },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
          onSettled: expect.any(Function),
        })
      );
    });

    it('should close the modal before starting execution', () => {
      renderComponent();

      fireEvent.click(screen.getByTestId('select-workflow-option'));
      fireEvent.click(screen.getByTestId('run-workflow-execute-button'));

      expect(screen.getByTestId('run-workflow-inputs-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('inputs-modal-submit'));

      expect(screen.queryByTestId('run-workflow-inputs-modal')).not.toBeInTheDocument();
    });
  });

  describe('with injected runWorkflow executor', () => {
    it('calls the injected executor instead of the default mutation', async () => {
      const runWorkflow: RunWorkflowExecutor = jest
        .fn()
        .mockResolvedValue({ workflowExecutionId: 'injected-exec-1' });

      renderComponent({ runWorkflow });

      fireEvent.click(screen.getByTestId('select-workflow-option'));
      fireEvent.click(screen.getByTestId('run-workflow-execute-button'));

      expect(runWorkflow).toHaveBeenCalledWith({
        workflowId: 'test-workflow-id',
        inputs: { alert_ids: ['alert-1'] },
      });
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('shows a success toast and closes the modal on success', async () => {
      const runWorkflow: RunWorkflowExecutor = jest
        .fn()
        .mockResolvedValue({ workflowExecutionId: 'exec-ok' });
      const onClose = jest.fn();
      const onExecutionSettled = jest.fn();

      renderComponent({ runWorkflow, onClose, onExecutionSettled });

      fireEvent.click(screen.getByTestId('select-workflow-option'));
      fireEvent.click(screen.getByTestId('run-workflow-execute-button'));

      await waitFor(() => expect(mockAddSuccess).toHaveBeenCalled());
      expect(mockAddSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ title: i18n.WORKFLOW_START_SUCCESS_TOAST })
      );
      expect(onExecutionSettled).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('shows an error toast and closes the modal on rejection', async () => {
      const runWorkflow: RunWorkflowExecutor = jest
        .fn()
        .mockRejectedValue(new Error('executor failed'));
      const onClose = jest.fn();

      renderComponent({ runWorkflow, onClose });

      fireEvent.click(screen.getByTestId('select-workflow-option'));
      fireEvent.click(screen.getByTestId('run-workflow-execute-button'));

      await waitFor(() => expect(mockAddError).toHaveBeenCalled());
      expect(mockAddError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'executor failed' }),
        { title: i18n.WORKFLOW_START_FAILED_TOAST }
      );
      expect(onClose).toHaveBeenCalled();
    });

    it('prefers the API error message in the error toast', async () => {
      const runWorkflow: RunWorkflowExecutor = jest.fn().mockRejectedValue(
        Object.assign(new Error('Bad Request'), {
          body: { message: 'Select 10 or fewer cases', statusCode: 400 },
        })
      );

      renderComponent({ runWorkflow });

      fireEvent.click(screen.getByTestId('select-workflow-option'));
      fireEvent.click(screen.getByTestId('run-workflow-execute-button'));

      await waitFor(() =>
        expect(mockAddError).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Select 10 or fewer cases' }),
          { title: i18n.WORKFLOW_START_FAILED_TOAST }
        )
      );
    });

    it('does not close a newly mounted panel when a dismissed execution settles', async () => {
      let resolveExecution: (value: { workflowExecutionId: string }) => void = () => {};
      const runWorkflow: RunWorkflowExecutor = jest.fn(
        () =>
          new Promise((resolve) => {
            resolveExecution = resolve;
          })
      );
      const onClose = jest.fn();
      const onExecutionSettled = jest.fn();

      const { unmount } = renderComponent({ runWorkflow, onClose, onExecutionSettled });
      fireEvent.click(screen.getByTestId('select-workflow-option'));
      fireEvent.click(screen.getByTestId('run-workflow-execute-button'));
      unmount();

      renderComponent({ onClose });
      await act(async () => {
        resolveExecution({ workflowExecutionId: 'exec-after-dismiss' });
      });

      expect(onClose).not.toHaveBeenCalled();
      expect(onExecutionSettled).not.toHaveBeenCalled();
    });

    it('merges extra inputs from the inputs modal with the base inputs when using injected executor', async () => {
      mockWorkflowsData = [requiredInputsWorkflow];
      const runWorkflow: RunWorkflowExecutor = jest
        .fn()
        .mockResolvedValue({ workflowExecutionId: 'exec-merged' });

      renderComponent({ runWorkflow });

      fireEvent.click(screen.getByTestId('select-workflow-option'));
      fireEvent.click(screen.getByTestId('run-workflow-execute-button'));
      // The inputs modal is shown for a workflow with required inputs.
      fireEvent.click(screen.getByTestId('inputs-modal-submit'));

      await waitFor(() => expect(runWorkflow).toHaveBeenCalled());
      expect(runWorkflow).toHaveBeenCalledWith({
        workflowId: 'test-workflow-id',
        inputs: { ticketId: 'ABC', alert_ids: ['alert-1'] },
      });
    });
  });
});
