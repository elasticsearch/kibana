/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import type { HttpSetup } from '@kbn/core/public';

import { WorkflowExecutionDetailsFlyout } from '.';
import { TestProviders } from '../../../../common/mock';
import { WorkflowExecutionDetails } from './workflow_execution_details';

// The flyout is a thin wrapper around `WorkflowExecutionDetails` (whose behavior
// is covered by `workflow_execution_details.test.tsx`). These tests focus on the
// wrapper's own responsibilities: the flyout chrome and prop pass-through.
jest.mock('./workflow_execution_details', () => ({
  WorkflowExecutionDetails: jest.fn(() => (
    <div data-test-subj="workflowExecutionDetails">{'Mock WorkflowExecutionDetails'}</div>
  )),
}));

const MockWorkflowExecutionDetails = WorkflowExecutionDetails as jest.MockedFunction<
  typeof WorkflowExecutionDetails
>;

describe('WorkflowExecutionDetailsFlyout', () => {
  const mockOnClose = jest.fn();
  const mockHttp = {} as HttpSetup;

  const defaultProps = {
    executionUuid: 'exec-uuid-789',
    http: mockHttp,
    onClose: mockOnClose,
    workflowId: 'workflow-123',
    workflowRunId: 'run-456',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the flyout', () => {
    render(
      <TestProviders>
        <WorkflowExecutionDetailsFlyout {...defaultProps} />
      </TestProviders>
    );

    expect(screen.getByTestId('workflowExecutionDetailsFlyout')).toBeInTheDocument();
  });

  it('renders the flyout title', () => {
    render(
      <TestProviders>
        <WorkflowExecutionDetailsFlyout {...defaultProps} />
      </TestProviders>
    );

    expect(screen.getByText('Workflow execution details')).toBeInTheDocument();
  });

  it('renders the WorkflowExecutionDetails content inside the flyout body', () => {
    render(
      <TestProviders>
        <WorkflowExecutionDetailsFlyout {...defaultProps} />
      </TestProviders>
    );

    expect(screen.getByTestId('workflowExecutionDetails')).toBeInTheDocument();
  });

  it('forwards its props to WorkflowExecutionDetails', () => {
    render(
      <TestProviders>
        <WorkflowExecutionDetailsFlyout {...defaultProps} generationStatus="succeeded" />
      </TestProviders>
    );

    expect(MockWorkflowExecutionDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        executionUuid: 'exec-uuid-789',
        generationStatus: 'succeeded',
        http: mockHttp,
        onClose: mockOnClose,
        workflowId: 'workflow-123',
        workflowRunId: 'run-456',
      }),
      expect.anything()
    );
  });

  it('calls onClose when the flyout close button is clicked', () => {
    render(
      <TestProviders>
        <WorkflowExecutionDetailsFlyout {...defaultProps} />
      </TestProviders>
    );

    fireEvent.click(screen.getByTestId('euiFlyoutCloseButton'));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
