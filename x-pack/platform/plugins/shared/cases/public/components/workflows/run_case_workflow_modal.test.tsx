/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RunWorkflowExecutor } from '@kbn/workflows-ui';
import { RunCaseWorkflowModal } from './run_case_workflow_modal';

// Mock the RunWorkflowPanel from the workflows-ui package.
jest.mock('@kbn/workflows-ui', () => ({
  RunWorkflowPanel: ({
    onClose,
    onExecutionSettled,
    inputs,
    runWorkflow,
  }: {
    onClose: () => void;
    onExecutionSettled?: () => void;
    inputs: unknown;
    runWorkflow?: RunWorkflowExecutor;
  }) => (
    <div data-test-subj="run-workflow-panel-mock">
      <span data-test-subj="panel-inputs">{JSON.stringify(inputs)}</span>
      <button data-test-subj="panel-close" type="button" onClick={onClose}>
        {'Close'}
      </button>
      <button
        data-test-subj="panel-settled"
        type="button"
        onClick={onExecutionSettled}
        disabled={!onExecutionSettled}
      >
        {'Settled'}
      </button>
      <span data-test-subj="panel-has-executor">{runWorkflow ? 'yes' : 'no'}</span>
    </div>
  ),
}));

describe('RunCaseWorkflowModal', () => {
  const onClose = jest.fn();
  const mockExecutor: RunWorkflowExecutor = jest
    .fn()
    .mockResolvedValue({ workflowExecutionId: 'exec-1' });
  const inputs = { event: { caseId: 'case-1', owner: 'securitySolution' } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the modal with the expected title', () => {
    render(<RunCaseWorkflowModal inputs={inputs} runWorkflow={mockExecutor} onClose={onClose} />);

    expect(screen.getByText('Select workflow')).toBeInTheDocument();
  });

  it('renders the RunWorkflowPanel inside the modal', () => {
    render(<RunCaseWorkflowModal inputs={inputs} runWorkflow={mockExecutor} onClose={onClose} />);

    expect(screen.getByTestId('run-workflow-panel-mock')).toBeInTheDocument();
  });

  it('forwards the inputs prop to RunWorkflowPanel', () => {
    render(<RunCaseWorkflowModal inputs={inputs} runWorkflow={mockExecutor} onClose={onClose} />);

    expect(screen.getByTestId('panel-inputs').textContent).toBe(JSON.stringify(inputs));
  });

  it('forwards the runWorkflow executor to RunWorkflowPanel', () => {
    render(<RunCaseWorkflowModal inputs={inputs} runWorkflow={mockExecutor} onClose={onClose} />);

    expect(screen.getByTestId('panel-has-executor').textContent).toBe('yes');
  });

  it('calls onClose when the panel requests a close', () => {
    render(<RunCaseWorkflowModal inputs={inputs} runWorkflow={mockExecutor} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('panel-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('forwards the execution-settled callback to RunWorkflowPanel', () => {
    const onExecutionSettled = jest.fn();
    render(
      <RunCaseWorkflowModal
        inputs={inputs}
        runWorkflow={mockExecutor}
        onClose={onClose}
        onExecutionSettled={onExecutionSettled}
      />
    );

    fireEvent.click(screen.getByTestId('panel-settled'));

    expect(onExecutionSettled).toHaveBeenCalledTimes(1);
  });

  it('uses the cases-run-workflow-modal test id', () => {
    render(<RunCaseWorkflowModal inputs={inputs} runWorkflow={mockExecutor} onClose={onClose} />);

    // The EuiModal renders the aria-label on the role="dialog" element.
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Select workflow');
  });
});
