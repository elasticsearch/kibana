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
import { useWorkflowsCapabilities } from '@kbn/workflows-ui';
import { createMockWorkflowsCapabilities } from '@kbn/workflows-ui/mocks';
import { ResumeExecutionButton } from './resume_execution_button';
import { createTestQueryClient, TestWrapper } from '../../../shared/test_utils';
import type { ContextOverrideData } from '../../../shared/utils/build_step_context_override/build_step_context_override';

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: jest.fn(),
}));

jest.mock('@kbn/workflows/spec/lib/build_fields_zod_validator', () => ({
  convertJsonSchemaToZod: jest.fn(),
}));

const { convertJsonSchemaToZod } = jest.requireMock(
  '@kbn/workflows/spec/lib/build_fields_zod_validator'
);

// Capture callbacks and props exposed by ResumeExecutionModal so tests can inspect them.
let capturedOnSubmit: ((params: { stepInputs: Record<string, unknown> }) => void) | undefined;
let capturedContextOverride: ContextOverrideData | undefined;

jest.mock('@kbn/workflows-ui', () => ({
  ...jest.requireActual('@kbn/workflows-ui'),
  useWorkflowsCapabilities: jest.fn(),
  generateSampleFromJsonSchema: jest.fn(),
  ResumeExecutionModal: ({
    onSubmit,
    onClose,
    resumeMessage,
    initialcontextOverride,
  }: {
    onSubmit?: (params: { stepInputs: Record<string, unknown> }) => void;
    onClose: () => void;
    resumeMessage?: string;
    initialcontextOverride?: ContextOverrideData;
  }) => {
    capturedOnSubmit = onSubmit;
    capturedContextOverride = initialcontextOverride;
    return (
      <div data-test-subj="resume-execution-modal">
        <span data-test-subj="modal-resume-message">{resumeMessage ?? ''}</span>
        <button type="button" data-test-subj="modal-close" onClick={onClose}>
          {'Close'}
        </button>
      </div>
    );
  },
}));

const { useKibana } = jest.requireMock('@kbn/kibana-react-plugin/public');

describe('ResumeExecutionButton', () => {
  const mockHttpPost = jest.fn();
  const mockAddSuccess = jest.fn();
  const mockAddError = jest.fn();
  const queryClient = createTestQueryClient();

  const defaultProps = {
    executionId: 'exec-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnSubmit = undefined;
    capturedContextOverride = undefined;
    // Default: schema conversion succeeds and returns a minimal Zod-like object.
    convertJsonSchemaToZod.mockReturnValue({ safeParse: jest.fn(() => ({ success: true })) });
    mockHttpPost.mockResolvedValue({});
    useKibana.mockReturnValue({
      services: {
        http: { post: mockHttpPost },
        notifications: {
          toasts: { addSuccess: mockAddSuccess, addError: mockAddError },
        },
      },
    });
    jest.mocked(useWorkflowsCapabilities).mockReturnValue(createMockWorkflowsCapabilities());
  });

  const renderComponent = (props = {}) =>
    render(
      <TestWrapper queryClient={queryClient}>
        <ResumeExecutionButton {...defaultProps} {...props} />
      </TestWrapper>
    );

  describe('callout', () => {
    it('renders the warning callout', () => {
      renderComponent();
      expect(screen.getByTestId('waitForInputCallout')).toBeInTheDocument();
    });

    it('renders the "Provide action" button', () => {
      renderComponent();
      expect(screen.getByTestId('provideActionButton')).toBeInTheDocument();
    });

    it('disables the button when user lacks executeWorkflow capability', () => {
      jest.mocked(useWorkflowsCapabilities).mockReturnValue({
        ...createMockWorkflowsCapabilities(),
        canExecuteWorkflow: false,
      });
      renderComponent();
      expect(screen.getByTestId('provideActionButton')).toBeDisabled();
    });

    it('enables the button when user has executeWorkflow capability', () => {
      renderComponent();
      expect(screen.getByTestId('provideActionButton')).not.toBeDisabled();
    });
  });

  describe('modal', () => {
    it('modal is closed by default', () => {
      renderComponent();
      expect(screen.queryByTestId('resume-execution-modal')).not.toBeInTheDocument();
    });

    it('opens modal on "Provide action" click', () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('provideActionButton'));
      expect(screen.getByTestId('resume-execution-modal')).toBeInTheDocument();
    });

    it('opens modal immediately when autoOpen=true', () => {
      renderComponent({ autoOpen: true });
      expect(screen.getByTestId('resume-execution-modal')).toBeInTheDocument();
    });

    it('closes modal when onClose is called', () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('provideActionButton'));
      expect(screen.getByTestId('resume-execution-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('modal-close'));
      expect(screen.queryByTestId('resume-execution-modal')).not.toBeInTheDocument();
    });

    it('passes resumeMessage to modal', () => {
      renderComponent({ resumeMessage: 'Please approve this action' });
      fireEvent.click(screen.getByTestId('provideActionButton'));
      expect(screen.getByTestId('modal-resume-message')).toHaveTextContent(
        'Please approve this action'
      );
    });

    it('renders without crashing and passes no contextOverride when schema conversion throws', () => {
      convertJsonSchemaToZod.mockImplementationOnce(() => {
        throw new Error('Unsupported $ref in JSON Schema');
      });
      // The component must not throw even when the schema is malformed.
      expect(() =>
        renderComponent({ resumeSchema: { $ref: '#/definitions/Unsupported' } })
      ).not.toThrow();
      fireEvent.click(screen.getByTestId('provideActionButton'));
      expect(screen.getByTestId('resume-execution-modal')).toBeInTheDocument();
      // Modal receives no context override — falls back to free-form JSON editor.
      expect(capturedContextOverride).toBeUndefined();
    });
  });

  describe('submit', () => {
    it('calls POST /api/workflows/executions/{id}/resume with the submitted input', async () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('provideActionButton'));
      await waitFor(() => expect(capturedOnSubmit).toBeDefined());
      act(() => {
        capturedOnSubmit!({ stepInputs: { approved: true } });
      });
      await waitFor(() => {
        expect(mockHttpPost).toHaveBeenCalledWith('/api/workflows/executions/exec-123/resume', {
          body: JSON.stringify({ input: { approved: true } }),
          version: '2023-10-31',
        });
      });
    });

    it('shows success toast and closes modal on successful submit', async () => {
      renderComponent();
      fireEvent.click(screen.getByTestId('provideActionButton'));
      await waitFor(() => expect(capturedOnSubmit).toBeDefined());
      act(() => {
        capturedOnSubmit!({ stepInputs: {} });
      });
      await waitFor(() => {
        expect(mockAddSuccess).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('resume-execution-modal')).not.toBeInTheDocument();
      });
    });

    it('shows error toast and keeps modal open on failed submit', async () => {
      const apiError = new Error('Network error');
      mockHttpPost.mockRejectedValueOnce(apiError);
      renderComponent();
      fireEvent.click(screen.getByTestId('provideActionButton'));
      await waitFor(() => expect(capturedOnSubmit).toBeDefined());
      act(() => {
        capturedOnSubmit!({ stepInputs: {} });
      });
      await waitFor(() => {
        expect(mockAddError).toHaveBeenCalledWith(
          apiError,
          expect.objectContaining({ title: expect.any(String) })
        );
        expect(screen.getByTestId('resume-execution-modal')).toBeInTheDocument();
      });
    });

    it('disables the button and shows loading while the request is in-flight', async () => {
      let resolvePost!: () => void;
      mockHttpPost.mockImplementationOnce(
        () => new Promise<void>((resolve) => (resolvePost = resolve))
      );

      renderComponent();
      fireEvent.click(screen.getByTestId('provideActionButton'));
      await waitFor(() => expect(capturedOnSubmit).toBeDefined());
      act(() => {
        capturedOnSubmit!({ stepInputs: {} });
      });

      // Button should be disabled + loading while the POST is in flight
      await waitFor(() => {
        expect(screen.getByTestId('provideActionButton')).toBeDisabled();
      });

      // Resolve the POST — button stays disabled (isSubmitted) but stops loading
      resolvePost();
      await waitFor(() => {
        expect(screen.getByTestId('provideActionButton')).toBeDisabled();
      });
    });

    it('does not disable the button when submit fails', async () => {
      mockHttpPost.mockRejectedValueOnce(new Error('fail'));
      renderComponent();
      fireEvent.click(screen.getByTestId('provideActionButton'));
      await waitFor(() => expect(capturedOnSubmit).toBeDefined());
      act(() => {
        capturedOnSubmit!({ stepInputs: {} });
      });
      await waitFor(() => {
        expect(mockAddError).toHaveBeenCalledTimes(1);
        // Button must remain enabled so the user can retry
        expect(screen.getByTestId('provideActionButton')).not.toBeDisabled();
      });
    });

    it('re-enables the button when waitingStepExecutionId changes after a successful submit', async () => {
      const { rerender } = render(
        <TestWrapper queryClient={queryClient}>
          <ResumeExecutionButton {...defaultProps} waitingStepExecutionId="wait-step-exec-1" />
        </TestWrapper>
      );
      fireEvent.click(screen.getByTestId('provideActionButton'));
      await waitFor(() => expect(capturedOnSubmit).toBeDefined());
      act(() => {
        capturedOnSubmit!({ stepInputs: { approved: true } });
      });
      await waitFor(() => {
        expect(screen.getByTestId('provideActionButton')).toBeDisabled();
      });

      rerender(
        <TestWrapper queryClient={queryClient}>
          <ResumeExecutionButton {...defaultProps} waitingStepExecutionId="wait-step-exec-2" />
        </TestWrapper>
      );
      expect(screen.getByTestId('provideActionButton')).not.toBeDisabled();
    });
  });

  describe('approval mode', () => {
    const approvalProps = {
      approvalLabels: { approveLabel: 'Approve', rejectLabel: 'Decline' },
      resumeMessage: 'Approve deployment?',
    };

    it('renders approve and reject buttons instead of the JSON modal flow', () => {
      renderComponent(approvalProps);
      expect(screen.getByTestId('waitForApprovalCallout')).toBeInTheDocument();
      expect(screen.getByTestId('approveActionButton')).toHaveTextContent('Approve');
      expect(screen.getByTestId('rejectActionButton')).toHaveTextContent('Decline');
      expect(screen.queryByTestId('provideActionButton')).not.toBeInTheDocument();
    });

    it('submits approved=true when Approve is clicked', async () => {
      renderComponent(approvalProps);
      fireEvent.click(screen.getByTestId('approveActionButton'));
      await waitFor(() => {
        expect(mockHttpPost).toHaveBeenCalledWith('/api/workflows/executions/exec-123/resume', {
          body: JSON.stringify({ input: { approved: true } }),
          version: '2023-10-31',
        });
      });
    });

    it('submits approved=false when Decline is clicked', async () => {
      renderComponent(approvalProps);
      fireEvent.click(screen.getByTestId('rejectActionButton'));
      await waitFor(() => {
        expect(mockHttpPost).toHaveBeenCalledWith('/api/workflows/executions/exec-123/resume', {
          body: JSON.stringify({ input: { approved: false } }),
          version: '2023-10-31',
        });
      });
    });
  });
});
