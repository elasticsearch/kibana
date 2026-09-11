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
import {
  resolveNodeColors,
  WorkflowGraphNode,
  type WorkflowGraphNodeData,
} from './workflow_graph_node';

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
  it('renders the deslugified step label in the accessible name', () => {
    renderNode({ label: 'my-step', stepType: 'http' });
    expect(screen.getByRole('button', { name: /My Step/ })).toBeInTheDocument();
  });

  it('includes the stepType in the accessible name', () => {
    renderNode({ label: 'fetch-data', stepType: 'elasticsearch' });
    expect(screen.getByRole('button', { name: /Fetch Data/ })).toBeInTheDocument();
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

  it('does not show run action in read-only mode', () => {
    renderNode({}, false, { onStepRun: jest.fn(), canRunSteps: false });

    fireEvent.mouseEnter(screen.getByRole('button', { name: /Test Step/ }));

    expect(screen.queryByTestId('workflowGraphNodeRunStep')).toBeNull();
  });

  it('shows run action when step runs are enabled', () => {
    renderNode({}, false, { onStepRun: jest.fn(), canRunSteps: true });

    fireEvent.mouseEnter(screen.getByRole('button', { name: /Test Step/ }));

    expect(screen.getByTestId('workflowGraphNodeRunStep')).toBeInTheDocument();
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

  it('renders a dense preview with the step name and step type', () => {
    const { getByTitle, getByText } = renderNode({
      label: 'my-step',
      stepType: 'http',
      preview: true,
    });
    // Preview mode shows both the humanized step name (with a title attribute
    // for truncation tooltips) and the raw step-type subtitle.
    expect(getByTitle('My Step')).not.toBeNull();
    expect(getByText('My Step')).not.toBeNull();
    expect(getByText('http')).not.toBeNull();
  });
});

describe('resolveNodeColors', () => {
  const theme = {
    colors: {
      backgroundLightPrimary: 'step-outer-bg',
      borderBaseSubdued: 'step-inner-border',
      primary: 'primary-color',
      backgroundLightAccent: 'trigger-outer-bg',
      backgroundBaseAccent: 'trigger-icon-bg',
      borderBaseAccent: 'trigger-inner-border',
      accent: 'accent-color',
      backgroundBaseSuccess: 'success-bg',
      success: 'success-color',
      danger: 'danger-color',
      backgroundBaseDanger: 'danger-bg',
      backgroundBaseWarning: 'warning-bg',
      textWarning: 'warning-text',
      textHeading: 'heading-color',
    },
  } as any;

  const idle = { isRunning: false, isSuccess: false, isFailed: false };
  const running = { isRunning: true, isSuccess: false, isFailed: false };
  const success = { isRunning: false, isSuccess: true, isFailed: false };
  const failed = { isRunning: false, isSuccess: false, isFailed: true };

  describe('borderColor', () => {
    it('uses family tint for idle unselected step', () => {
      const { borderColor } = resolveNodeColors(theme, false, idle, false);
      expect(borderColor).toBe('step-outer-bg');
    });

    it('uses running border regardless of selection state', () => {
      expect(resolveNodeColors(theme, false, running, false).borderColor).toBe('primary-color');
      expect(resolveNodeColors(theme, false, running, true).borderColor).toBe('primary-color');
    });

    it('uses selection border for selected idle node', () => {
      const { borderColor } = resolveNodeColors(theme, false, idle, true);
      expect(borderColor).toBe('primary-color'); // palette.selectedBorder
    });

    it('uses success color for selected completed node', () => {
      const { borderColor } = resolveNodeColors(theme, false, success, true);
      expect(borderColor).toBe('success-color');
    });

    it('uses fail color for selected failed node', () => {
      const { borderColor } = resolveNodeColors(theme, false, failed, true);
      expect(borderColor).toBe('danger-color');
    });

    it('uses family tint for unselected completed node', () => {
      // Status reads from icon area/border/color; outer border stays neutral.
      const { borderColor } = resolveNodeColors(theme, false, success, false);
      expect(borderColor).toBe('step-outer-bg');
    });
  });

  describe('iconAreaBg / innerBoxBorder / iconColor', () => {
    it('applies success tokens when completed', () => {
      const { iconAreaBg, innerBoxBorder, iconColor } = resolveNodeColors(
        theme,
        false,
        success,
        false
      );
      expect(iconAreaBg).toBe('success-bg');
      expect(innerBoxBorder).toBe('success-color');
      expect(iconColor).toBe('success-color');
    });

    it('applies danger tokens when failed', () => {
      const { iconAreaBg, innerBoxBorder, iconColor } = resolveNodeColors(
        theme,
        false,
        failed,
        false
      );
      expect(iconAreaBg).toBe('danger-bg');
      expect(innerBoxBorder).toBe('danger-color');
      expect(iconColor).toBe('danger-color');
    });

    it('uses palette defaults when idle, regardless of selection', () => {
      const { iconAreaBg, innerBoxBorder, iconColor } = resolveNodeColors(theme, false, idle, true);
      expect(iconAreaBg).toBe('step-outer-bg'); // palette.iconAreaBg
      expect(innerBoxBorder).toBe('step-inner-border'); // palette.innerBoxBorder
      expect(iconColor).toBe('primary-color'); // palette.iconColor
    });
  });

  describe('trigger node', () => {
    it('uses trigger palette colors', () => {
      const { palette } = resolveNodeColors(theme, true, idle, false);
      expect(palette.outerBorder).toBe('trigger-outer-bg');
      expect(palette.iconAreaBg).toBe('trigger-icon-bg');
      expect(palette.innerBoxBorder).toBe('trigger-inner-border');
      expect(palette.iconColor).toBe('accent-color');
    });

    it('sets forceTriggerPinkFill when idle', () => {
      const { forceTriggerPinkFill } = resolveNodeColors(theme, true, idle, false);
      expect(forceTriggerPinkFill).toBe(true);
    });

    it('clears forceTriggerPinkFill when completed', () => {
      const { forceTriggerPinkFill } = resolveNodeColors(theme, true, success, false);
      expect(forceTriggerPinkFill).toBe(false);
    });

    it('clears forceTriggerPinkFill when failed', () => {
      const { forceTriggerPinkFill } = resolveNodeColors(theme, true, failed, false);
      expect(forceTriggerPinkFill).toBe(false);
    });
  });

  describe('borderRadius and hasStatusIcon', () => {
    it('borderRadius is 8 and hasStatusIcon is true when running', () => {
      const { borderRadius, hasStatusIcon } = resolveNodeColors(theme, false, running, false);
      expect(borderRadius).toBe(8);
      expect(hasStatusIcon).toBe(true);
    });

    it('borderRadius is 10 and hasStatusIcon is false when idle', () => {
      const { borderRadius, hasStatusIcon } = resolveNodeColors(theme, false, idle, false);
      expect(borderRadius).toBe(10);
      expect(hasStatusIcon).toBe(false);
    });

    it('borderRadius is 10 and hasStatusIcon is true when completed', () => {
      const { borderRadius, hasStatusIcon } = resolveNodeColors(theme, false, success, false);
      expect(borderRadius).toBe(10);
      expect(hasStatusIcon).toBe(true);
    });
  });
});
