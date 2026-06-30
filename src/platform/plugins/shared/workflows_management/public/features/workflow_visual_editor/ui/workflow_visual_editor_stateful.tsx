/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiEmptyPrompt, EuiFocusTrap, EuiLoadingSpinner, useEuiTheme } from '@elastic/eui';
import type { ColorMode, Viewport } from '@xyflow/react';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { stringify as stringifyYaml } from 'yaml';
import { FormattedMessage } from '@kbn/i18n-react';
import { type LayoutDirection, transformWorkflowToGraph, type WorkflowYaml } from '@kbn/workflows';
import {
  type RenderStepIcon,
  useWorkflowsCapabilities,
  WorkflowGraphCanvasWithoutProvider,
} from '@kbn/workflows-ui';
import { type FlyoutTarget, WorkflowVisualEditorFlyout } from './workflow_visual_editor_flyout';
import {
  selectEditorWorkflowDefinition,
  selectEditorWorkflowLookup,
  selectEditorYaml,
  selectHighlightedStepId,
  selectIsExecutionsTab,
  selectIsYamlSyntaxValid,
  selectStepExecutions,
} from '../../../entities/workflows/store/workflow_detail/selectors';
import {
  HIGHLIGHTED_STEP_TRIGGER,
  setHighlightedStepId,
} from '../../../entities/workflows/store/workflow_detail/slice';
import { useWorkflowUrlState } from '../../../hooks/use_workflow_url_state';
import { StepIcon } from '../../../shared/ui/step_icons/step_icon';

function toColorMode(euiColorMode: string): ColorMode {
  switch (euiColorMode) {
    case 'DARK':
      return 'dark';
    default:
      return 'light';
  }
}

interface WorkflowVisualEditorStatefulProps {
  onStepRun?: (params: { stepId: string; actionType: string }) => void;
  /** Dagre rank direction for the graph layout. Defaults to `'TB'`. */
  direction?: LayoutDirection;
  /**
   * Viewport to restore when the canvas mounts. The parent owns this value
   * so it survives the unmount/remount that happens on YAML↔graph toggle.
   */
  defaultViewport?: Viewport;
  /** Fired when the user pans or zooms; persist to restore on next mount. */
  onViewportChange?: (viewport: Viewport) => void;
}

const TRIGGER_LABEL: Record<string, string> = {
  manual: 'Manual',
  alert: 'Alert',
  scheduled: 'Scheduled',
};

/**
 * Glue layer between Redux + plugin services and the read-only graph canvas.
 *
 * - Selects the parsed workflow definition (cached when last valid).
 * - Holds the last-valid `WorkflowYaml` ref so the canvas keeps rendering
 *   when the user introduces a YAML syntax error.
 * - Wires `onStepRun` (received from the parent editor) to the flyout's
 *   "Run step" button so the existing context-override flow works as-is.
 */
export const WorkflowVisualEditorStateful: React.FC<WorkflowVisualEditorStatefulProps> = ({
  onStepRun,
  direction = 'TB',
  defaultViewport,
  onViewportChange,
}) => {
  const { colorMode, euiTheme } = useEuiTheme();

  const definition = useSelector(selectEditorWorkflowDefinition);
  const stepExecutions = useSelector(selectStepExecutions);
  const isExecutionsTab = useSelector(selectIsExecutionsTab);
  const isYamlValid = useSelector(selectIsYamlSyntaxValid) ?? true;
  const editorYaml = useSelector(selectEditorYaml) ?? '';
  const workflowLookup = useSelector(selectEditorWorkflowLookup);
  const highlightedStepId = useSelector(selectHighlightedStepId);
  const { canExecuteWorkflow } = useWorkflowsCapabilities();
  const { selectedStepId, setSelectedStep, setEditorView } = useWorkflowUrlState();
  const dispatch = useDispatch();
  const flyoutPanelRef = useRef<HTMLDivElement | null>(null);

  // POC pattern: cache the last valid WorkflowYaml so the canvas can stay
  // up while the user fixes a YAML syntax error.
  const lastValidRef = useRef<WorkflowYaml | undefined>(undefined);
  useEffect(() => {
    if (definition) {
      lastValidRef.current = definition;
    }
  }, [definition]);

  // Focus the flyout panel when a step becomes selected so keyboard users
  // land inside the panel rather than remaining on the canvas node.
  useEffect(() => {
    if (selectedStepId) {
      flyoutPanelRef.current?.focus();
    }
  }, [selectedStepId]);

  const workflow = definition ?? lastValidRef.current;

  const transformed = useMemo(() => transformWorkflowToGraph(workflow), [workflow]);

  const flyoutTarget = useMemo<FlyoutTarget | null>(() => {
    if (!selectedStepId) return null;
    const ref = transformed.nodeRefs[selectedStepId];
    if (!ref) return null;
    if (ref.kind === 'step') {
      return {
        kind: 'step',
        stepName: ref.stepName,
        stepInfo: workflowLookup?.steps[ref.stepName],
      };
    }
    // kind === 'trigger' — use the exact declaration-order index so two
    // triggers of the same type are distinguished correctly.
    const trigger = workflow?.triggers?.[ref.triggerIndex];
    if (trigger) {
      const yamlSnippet = stringifyYaml({ triggers: [trigger] });
      return {
        kind: 'trigger',
        triggerType: trigger.type,
        triggerLabel: TRIGGER_LABEL[trigger.type] ?? trigger.type,
        yamlSnippet,
      };
    }
    return null;
  }, [selectedStepId, transformed.nodeRefs, workflowLookup, workflow]);

  const renderStepIcon = useCallback<RenderStepIcon>(
    ({ stepType, isTrigger: _isTrigger }) => (
      <StepIcon stepType={stepType} executionStatus={undefined} />
    ),
    []
  );

  const handleRunStep = useCallback(() => {
    if (!flyoutTarget || flyoutTarget.kind !== 'step') return;
    onStepRun?.({ stepId: flyoutTarget.stepName, actionType: 'run' });
  }, [onStepRun, flyoutTarget]);

  const handleOpenInYaml = useCallback(() => {
    // Tell the YAML editor which step to reveal — it watches the
    // `highlightedStepId` slice and calls `revealLineInCenter` on the
    // matching line when it changes.
    if (flyoutTarget?.kind === 'step') {
      dispatch(setHighlightedStepId({ stepId: flyoutTarget.stepName }));
    } else if (flyoutTarget?.kind === 'trigger') {
      dispatch(setHighlightedStepId({ stepId: HIGHLIGHTED_STEP_TRIGGER }));
    }
    setEditorView('yaml');
  }, [dispatch, flyoutTarget, setEditorView]);

  const handleStepSelect = useCallback(
    (id: string | undefined) => setSelectedStep(id ?? null),
    [setSelectedStep]
  );

  const handleStepRun = useCallback(
    (stepName: string) => onStepRun?.({ stepId: stepName, actionType: 'run' }),
    [onStepRun]
  );

  const handleFlyoutKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setSelectedStep(null);
      }
    },
    [setSelectedStep]
  );

  const handleFlyoutClose = useCallback(() => setSelectedStep(null), [setSelectedStep]);

  if (!workflow) {
    return (
      <EuiEmptyPrompt
        icon={<EuiLoadingSpinner size="l" />}
        title={
          <h2>
            <FormattedMessage
              id="workflows.visualEditor.loadingWorkflowGraph"
              defaultMessage="Loading workflow graph…"
            />
          </h2>
        }
      />
    );
  }

  return (
    <div css={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}>
      <WorkflowGraphCanvasWithoutProvider
        workflow={workflow}
        transformed={transformed}
        stepExecutions={stepExecutions}
        isYamlValid={isYamlValid}
        selectedStepId={selectedStepId}
        onStepSelect={handleStepSelect}
        colorMode={toColorMode(colorMode)}
        focusStepId={highlightedStepId}
        direction={direction}
        renderStepIcon={renderStepIcon}
        onStepRun={handleStepRun}
        canRunSteps={Boolean(canExecuteWorkflow) && isYamlValid && !isExecutionsTab}
        defaultViewport={defaultViewport}
        onViewportChange={onViewportChange}
        showZoomControls
      />
      {flyoutTarget && (
        <EuiFocusTrap returnFocus>
          <div
            ref={flyoutPanelRef}
            // tabIndex={-1} makes the panel div programmatically focusable
            // (so the useEffect above can call .focus()) without adding it to
            // the natural tab order — EuiFocusTrap handles tab cycling inside.
            tabIndex={-1}
            onKeyDown={handleFlyoutKeyDown}
            css={{
              position: 'absolute',
              top: 8,
              right: 8,
              bottom: 8,
              width: 420,
              zIndex: euiTheme.levels.flyout,
              boxShadow:
                '0 0 2px 0 rgba(43, 57, 79, 0.16), 0 4px 13px 0 rgba(43, 57, 79, 0.12), 0 8px 17px 0 rgba(43, 57, 79, 0.07)',
              borderRadius: 8,
              overflow: 'hidden',
              outline: 'none',
            }}
          >
            <WorkflowVisualEditorFlyout
              target={flyoutTarget}
              editorYaml={editorYaml}
              canExecuteWorkflow={Boolean(canExecuteWorkflow) && !isExecutionsTab}
              isYamlValid={isYamlValid}
              onClose={handleFlyoutClose}
              onOpenInYaml={handleOpenInYaml}
              onRunStep={handleRunStep}
            />
          </div>
        </EuiFocusTrap>
      )}
    </div>
  );
};
