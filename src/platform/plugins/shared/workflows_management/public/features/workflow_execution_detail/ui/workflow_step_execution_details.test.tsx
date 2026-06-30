/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import type { WorkflowStepExecutionDto } from '@kbn/workflows';
import { ExecutionStatus } from '@kbn/workflows';
import { WorkflowStepExecutionDetails } from './workflow_step_execution_details';
import { TestWrapper } from '../../../shared/test_utils';

jest.mock('./step_execution_data_view', () => ({
  StepExecutionDataView: () => <div data-test-subj="step-execution-data-view" />,
}));

jest.mock('./workflow_execution_overview', () => ({
  WorkflowExecutionOverview: () => <div data-test-subj="workflow-execution-overview" />,
}));

jest.mock('../../../hooks/navigation/use_navigate_to_execution', () => ({
  useNavigateToExecution: () => ({ navigate: jest.fn(), href: '' }),
}));

const createTriggerStep = (
  overrides: Partial<WorkflowStepExecutionDto> = {}
): WorkflowStepExecutionDto => ({
  id: 'trigger',
  stepId: 'manual',
  stepType: 'trigger_manual',
  status: ExecutionStatus.COMPLETED,
  scopeStack: [],
  workflowRunId: 'exec-1',
  workflowId: 'wf-1',
  startedAt: '',
  globalExecutionIndex: -1,
  stepExecutionIndex: 0,
  topologicalIndex: -1,
  ...overrides,
});

const createRegularStep = (
  overrides: Partial<WorkflowStepExecutionDto> = {}
): WorkflowStepExecutionDto => ({
  id: 'step-1',
  stepId: 'emit',
  stepType: 'workflow.output',
  status: ExecutionStatus.COMPLETED,
  scopeStack: [],
  workflowRunId: 'exec-1',
  workflowId: 'wf-1',
  startedAt: '2024-01-01T00:00:00Z',
  globalExecutionIndex: 0,
  stepExecutionIndex: 0,
  topologicalIndex: 0,
  input: {},
  output: {},
  ...overrides,
});

describe('WorkflowStepExecutionDetails', () => {
  it('shows Input and Output tabs for trigger when both input and output exist, Input first and selected by default', () => {
    const stepExecution = createTriggerStep({
      input: { foo: 'bar' },
      output: { greeting: 'hello world' },
    });
    render(
      <TestWrapper>
        <WorkflowStepExecutionDetails workflowExecutionId="exec-1" stepExecution={stepExecution} />
      </TestWrapper>
    );

    const inputTab = screen.getByRole('tab', { name: 'Input' });
    const outputTab = screen.getByRole('tab', { name: 'Output' });
    expect(inputTab).toBeInTheDocument();
    expect(outputTab).toBeInTheDocument();

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveTextContent('Input');
    expect(tabs[1]).toHaveTextContent('Output');
    expect(inputTab).toHaveAttribute('aria-selected', 'true');
  });

  it('shows Event and Inputs tabs for non-manual trigger when both input and output exist', () => {
    const stepExecution = createTriggerStep({
      stepType: 'trigger_alert',
      stepId: 'alert',
      input: { alerts: [{ id: 'a1' }] },
      output: { ticketId: 'ABC-123' },
    });
    render(
      <TestWrapper>
        <WorkflowStepExecutionDetails workflowExecutionId="exec-1" stepExecution={stepExecution} />
      </TestWrapper>
    );

    const eventTab = screen.getByRole('tab', { name: 'Event' });
    const inputsTab = screen.getByRole('tab', { name: 'Input' });
    expect(eventTab).toBeInTheDocument();
    expect(inputsTab).toBeInTheDocument();

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveTextContent('Event');
    expect(tabs[1]).toHaveTextContent('Input');
    expect(eventTab).toHaveAttribute('aria-selected', 'true');
  });

  it('shows only Input tab for trigger when output is missing', () => {
    const stepExecution = createTriggerStep({ input: { foo: 'bar' } });
    render(
      <TestWrapper>
        <WorkflowStepExecutionDetails workflowExecutionId="exec-1" stepExecution={stepExecution} />
      </TestWrapper>
    );

    expect(screen.getByRole('tab', { name: 'Input' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Output' })).not.toBeInTheDocument();
  });

  it('shows only Output tab for trigger when input is missing but output exists', () => {
    const stepExecution = createTriggerStep({ output: { result: 'ok' } });
    render(
      <TestWrapper>
        <WorkflowStepExecutionDetails workflowExecutionId="exec-1" stepExecution={stepExecution} />
      </TestWrapper>
    );

    expect(screen.getByRole('tab', { name: 'Output' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Input' })).not.toBeInTheDocument();
  });

  it('shows Output then Input tabs for regular steps', () => {
    const stepExecution = createRegularStep({
      input: { url: 'https://example.com' },
      output: { status: 200 },
    });
    render(
      <TestWrapper>
        <WorkflowStepExecutionDetails workflowExecutionId="exec-1" stepExecution={stepExecution} />
      </TestWrapper>
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveTextContent('Output');
    expect(tabs[1]).toHaveTextContent('Input');
  });

  it('renders with workflowExecutionTrigger data-test-subj for trigger pseudo-step', () => {
    const stepExecution = createTriggerStep({ input: {} });
    const { container } = render(
      <TestWrapper>
        <WorkflowStepExecutionDetails workflowExecutionId="exec-1" stepExecution={stepExecution} />
      </TestWrapper>
    );
    expect(
      container.querySelector('[data-test-subj="workflowExecutionTrigger"]')
    ).toBeInTheDocument();
  });

  it('renders with workflowStepExecutionDetails data-test-subj for regular step', () => {
    const stepExecution = createRegularStep();
    const { container } = render(
      <TestWrapper>
        <WorkflowStepExecutionDetails workflowExecutionId="exec-1" stepExecution={stepExecution} />
      </TestWrapper>
    );
    expect(
      container.querySelector('[data-test-subj="workflowStepExecutionDetails"]')
    ).toBeInTheDocument();
  });
});
