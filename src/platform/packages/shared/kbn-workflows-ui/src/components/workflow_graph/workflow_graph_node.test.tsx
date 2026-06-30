/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { ExecutionStatus } from '@kbn/workflows';
import {
  type WorkflowGraphActions,
  WorkflowGraphActionsContext,
} from './workflow_graph_actions_context';
import { WorkflowGraphNode, type WorkflowGraphNodeData } from './workflow_graph_node';

// Stub @xyflow/react's Handle — it requires an internal React Flow context that
// isn't available in unit tests, and we're not testing connection logic here.
jest.mock('@xyflow/react', () => ({
  ...jest.requireActual('@xyflow/react'),
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
}));

// Minimal NodeProps-shaped object for `WorkflowGraphNode`.
const makeNodeProps = (
  data: Partial<WorkflowGraphNodeData> = {},
  selected = false
): Parameters<typeof WorkflowGraphNode>[0] =>
  ({
    id: 'node-1',
    type: 'step',
    data: {
      label: 'Test Step',
      stepType: 'http',
      ...data,
    },
    selected,
    dragging: false,
    isConnectable: false,
    zIndex: 0,
    xPos: 0,
    yPos: 0,
    targetPosition: 'top' as any,
    sourcePosition: 'bottom' as any,
  } as any);

const renderNode = (
  data: Partial<WorkflowGraphNodeData> = {},
  selected = false,
  actions: WorkflowGraphActions = {}
) =>
  render(
    <WorkflowGraphActionsContext.Provider value={actions}>
      <WorkflowGraphNode {...makeNodeProps(data, selected)} />
    </WorkflowGraphActionsContext.Provider>
  );

describe('WorkflowGraphNode', () => {
  it('renders the step label in the accessible name', () => {
    renderNode({ label: 'my-step', stepType: 'http' });
    expect(screen.getByRole('button', { name: /my-step/ })).toBeInTheDocument();
  });

  it('includes the stepType in the accessible name', () => {
    renderNode({ label: 'fetch-data', stepType: 'elasticsearch' });
    expect(screen.getByRole('button', { name: /fetch-data/ })).toBeInTheDocument();
  });

  it('shows "Completed successfully" status label on success', () => {
    renderNode({
      stepExecution: {
        id: 'e1',
        stepId: 'node-1',
        status: ExecutionStatus.COMPLETED,
      } as any,
    });
    expect(screen.getByLabelText('Completed successfully')).toBeInTheDocument();
  });

  it('shows "Failed" status label on failure', () => {
    renderNode({
      stepExecution: {
        id: 'e1',
        stepId: 'node-1',
        status: ExecutionStatus.FAILED,
      } as any,
    });
    expect(screen.getByLabelText('Failed')).toBeInTheDocument();
  });

  it('shows "Failed" status label on TIMED_OUT', () => {
    renderNode({
      stepExecution: {
        id: 'e1',
        stepId: 'node-1',
        status: ExecutionStatus.TIMED_OUT,
      } as any,
    });
    expect(screen.getByLabelText('Failed')).toBeInTheDocument();
  });

  it('shows "Running" status label for RUNNING', () => {
    renderNode({
      stepExecution: {
        id: 'e1',
        stepId: 'node-1',
        status: ExecutionStatus.RUNNING,
      } as any,
    });
    expect(screen.getByLabelText('Running')).toBeInTheDocument();
  });

  it('renders the retry badge when step has retry max-attempts', () => {
    renderNode({
      step: { retry: { 'max-attempts': 3 } },
    });
    expect(screen.getByTestId('workflowGraphNodeRetryBadge')).toBeInTheDocument();
  });

  it('renders the retry badge from on-failure.retry', () => {
    renderNode({
      step: { 'on-failure': { retry: { 'max-attempts': 2 } } },
    });
    expect(screen.getByTestId('workflowGraphNodeRetryBadge')).toBeInTheDocument();
  });

  it('does NOT render the retry badge when max-attempts is absent', () => {
    renderNode({ step: {} });
    expect(screen.queryByTestId('workflowGraphNodeRetryBadge')).toBeNull();
  });

  it('calls onStepSelect with the node id when Enter is pressed', () => {
    const onStepSelect = jest.fn();
    renderNode({}, false, { onStepSelect });

    const node = screen.getByRole('button', { name: /Test Step/ });
    fireEvent.keyDown(node, { key: 'Enter' });
    expect(onStepSelect).toHaveBeenCalledWith('node-1');
  });

  it('calls onStepSelect with the node id when Space is pressed', () => {
    const onStepSelect = jest.fn();
    renderNode({}, false, { onStepSelect });

    const node = screen.getByRole('button', { name: /Test Step/ });
    fireEvent.keyDown(node, { key: ' ' });
    expect(onStepSelect).toHaveBeenCalledWith('node-1');
  });

  it('does not call onStepSelect on other key presses', () => {
    const onStepSelect = jest.fn();
    renderNode({}, false, { onStepSelect });

    const node = screen.getByRole('button', { name: /Test Step/ });
    fireEvent.keyDown(node, { key: 'Escape' });
    expect(onStepSelect).not.toHaveBeenCalled();
  });

  it('includes execution status in the accessible name when an execution exists', () => {
    renderNode({
      label: 'step-x',
      stepExecution: {
        id: 'e2',
        stepId: 'node-1',
        status: ExecutionStatus.FAILED,
      } as any,
    });
    const node = screen.getByRole('button');
    expect(node.getAttribute('aria-label')).toContain(ExecutionStatus.FAILED);
  });

  it('renders a compact preview without the step label text', () => {
    const { queryByTitle } = renderNode({ label: 'hidden-label', preview: true });
    // In preview mode the outer div is an aria-label'd div, not a role=button,
    // and there is no label text rendered as a <span>.
    expect(queryByTitle('hidden-label')).toBeNull();
  });
});
