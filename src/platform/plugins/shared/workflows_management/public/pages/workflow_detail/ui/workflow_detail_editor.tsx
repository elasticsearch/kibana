/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UseEuiTheme } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiToolTip,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { Viewport } from '@xyflow/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import useLocalStorage from 'react-use/lib/useLocalStorage';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { i18n } from '@kbn/i18n';
import type { monaco } from '@kbn/monaco';
import { isMac } from '@kbn/shared-ux-utility';
import {
  WORKFLOWS_UI_EXECUTION_GRAPH_SETTING_ID,
  WORKFLOWS_UI_VISUAL_EDITOR_SETTING_ID,
} from '@kbn/workflows';
import {
  ReactFlowProvider,
  useWorkflowsCapabilities,
  WorkflowDetailBottomBar,
} from '@kbn/workflows-ui';
import { useContextOverrideData } from './use_context_override_data';
import { useRunWorkflowWithConfirmation } from './use_run_workflow_with_confirmation';
import { WorkflowDetailConnectorFlyout } from './workflow_detail_connector_flyout';
import { WORKFLOWS_DOCUMENTATION_URL } from '../../../../common';
import { useWorkflowActions } from '../../../entities/workflows/model/use_workflow_actions';
import {
  selectEditorWorkflowLookup,
  selectFocusedStepId,
  selectIsExecutionsTab,
  selectIsSavingYaml,
  selectIsYamlSyntaxValid,
  selectWorkflowId,
  selectYamlString,
} from '../../../entities/workflows/store/workflow_detail/selectors';
import {
  HIGHLIGHTED_STEP_TRIGGER,
  setHighlightedStepId,
  setIsTestModalOpen,
  setTestStepModalOpenStepId,
} from '../../../entities/workflows/store/workflow_detail/slice';
import { ExecutionGraph } from '../../../features/debug_graph/execution_graph';
import { useKibana } from '../../../hooks/use_kibana';
import { useWorkflowUrlState } from '../../../hooks/use_workflow_url_state';
import { useWorkflowsExperimentalUiSetting } from '../../../hooks/use_workflows_experimental_ui_setting';
import { getTestRunTooltipContent } from '../../../shared/ui';
import { EditorSettingsPopover } from '../../../widgets/workflow_yaml_editor/ui/editor_settings_popover';
import { KeyboardShortcutsPopover } from '../../../widgets/workflow_yaml_editor/ui/keyboard_shortcuts_popover';

const WorkflowYAMLEditor = React.lazy(() =>
  import('../../../widgets/workflow_yaml_editor').then((module) => ({
    default: module.WorkflowYAMLEditor,
  }))
);

const WorkflowVisualEditor = React.lazy(() =>
  import('../../../features/workflow_visual_editor').then((module) => ({
    default: module.WorkflowVisualEditor,
  }))
);

interface WorkflowDetailEditorProps {
  highlightDiff?: boolean;
}

export const WorkflowDetailEditor = React.memo<WorkflowDetailEditorProps>(({ highlightDiff }) => {
  const styles = useMemoCss(componentStyles);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const openActionsRef = useRef<(() => void) | null>(null);
  // Saved graph viewport — survives the YAML↔graph remount because this
  // component (which owns the workflow page) stays mounted. Cleared
  // implicitly when the user navigates to a different workflow because the
  // whole component unmounts then.
  const graphViewportRef = useRef<Viewport | undefined>(undefined);
  const handleGraphViewportChange = useCallback((viewport: Viewport) => {
    graphViewportRef.current = viewport;
  }, []);

  // "Hide controls menu" toggle (settings popover). When OFF the bottom bar
  // stays expanded indefinitely; when ON (default) it auto-collapses to the
  // small pill after 5s. Persisted in localStorage so the choice sticks
  // across reloads.
  const HIDE_CONTROLS_MENU_KEY = 'workflowsUi.bottomBar.hideControlsMenu';
  const [hideControlsMenu, handleHideControlsMenuChange] = useLocalStorage<boolean>(
    HIDE_CONTROLS_MENU_KEY,
    true
  );

  const dispatch = useDispatch();

  const workflowYaml = useSelector(selectYamlString) ?? '';
  const workflowId = useSelector(selectWorkflowId);
  const isExecutionsTab = useSelector(selectIsExecutionsTab);
  const isSyntaxValid = useSelector(selectIsYamlSyntaxValid);
  const isSaving = useSelector(selectIsSavingYaml);
  const getContextOverrideData = useContextOverrideData();
  const { runIndividualStep } = useWorkflowActions();
  const { notifications } = useKibana().services;
  const { setSelectedExecution } = useWorkflowUrlState();
  const { canExecuteWorkflow } = useWorkflowsCapabilities();

  const handleStepRun = useCallback(
    async (params: { stepId: string; actionType: string }) => {
      if (params.actionType !== 'run') {
        return;
      }

      // Guard: the run-step handler uses the draft workflow YAML and context, which
      // differ from the execution snapshot shown on the Executions tab. Bail out to
      // prevent running the wrong version.
      if (isExecutionsTab) {
        return;
      }

      if (!canExecuteWorkflow) {
        return;
      }

      const contextOverrideData = getContextOverrideData(params.stepId);
      if (!contextOverrideData) {
        return;
      }

      if (!Object.keys(contextOverrideData.stepContext).length) {
        try {
          const response = await runIndividualStep.mutateAsync({
            workflowId,
            stepId: params.stepId,
            workflowYaml,
            contextOverride: {},
          });
          setSelectedExecution(response.workflowExecutionId);
        } catch (error) {
          const errorMessage =
            (error as { body?: { message?: string }; message?: string })?.body?.message ||
            (error as Error)?.message ||
            'An unexpected error occurred while running the step';
          notifications.toasts.addError(new Error(errorMessage), {
            title: i18n.translate('workflows.detail.submitStepRun.error', {
              defaultMessage: 'Failed to run step',
            }),
          });
        }
        return;
      }

      dispatch(setTestStepModalOpenStepId(params.stepId));
    },
    [
      isExecutionsTab,
      workflowId,
      getContextOverrideData,
      runIndividualStep,
      workflowYaml,
      setSelectedExecution,
      dispatch,
      notifications.toasts,
      canExecuteWorkflow,
    ]
  );

  const isVisualEditorEnabled = useWorkflowsExperimentalUiSetting(
    WORKFLOWS_UI_VISUAL_EDITOR_SETTING_ID
  );
  const isExecutionGraphEnabled = useWorkflowsExperimentalUiSetting(
    WORKFLOWS_UI_EXECUTION_GRAPH_SETTING_ID
  );

  const { editorView, setEditorView, graphDirection, setGraphDirection } = useWorkflowUrlState();
  const showGraph = isVisualEditorEnabled && editorView === 'graph';

  const workflowLookup = useSelector(selectEditorWorkflowLookup);
  const focusedStepId = useSelector(selectFocusedStepId);

  const handleEditorViewChange = useCallback(
    (next: 'yaml' | 'graph') => {
      if (!isVisualEditorEnabled) {
        return;
      }
      // When switching from YAML to graph, focus the graph on whatever step
      // the user's cursor is currently on. Looks up the step by the editor's
      // current line in the workflow's lookup table.
      if (next === 'graph' && editorRef.current && workflowLookup) {
        const pos = editorRef.current.getPosition();
        const line = pos?.lineNumber;
        if (line != null) {
          const tStart = workflowLookup.triggersLineStart;
          // `triggersLineEnd` isn't tracked by WorkflowLookup; treat any line
          // that falls before the first step (or at/past the trigger start)
          // as being inside the triggers block.
          const firstStepLine = Object.values(workflowLookup.steps).reduce<number | undefined>(
            (min, info) => {
              const { lineStart } = info;
              return min == null || lineStart < min ? lineStart : min;
            },
            undefined
          );
          const tEnd = firstStepLine != null ? firstStepLine - 1 : undefined;
          if (tStart != null && tEnd != null && line >= tStart && line <= tEnd) {
            dispatch(setHighlightedStepId({ stepId: HIGHLIGHTED_STEP_TRIGGER }));
          } else if (focusedStepId) {
            // `focusedStepId` is already the canonical cursor→step derived by the
            // setCursorPosition reducer (via findStepByLine, which also handles
            // blank/continuation lines). No need to re-scan workflowLookup here.
            dispatch(setHighlightedStepId({ stepId: focusedStepId }));
          }
        }
      }
      setEditorView(next);
    },
    [dispatch, focusedStepId, isVisualEditorEnabled, setEditorView, workflowLookup]
  );

  const openTestModal = useCallback(() => {
    dispatch(setIsTestModalOpen(true));
  }, [dispatch]);

  const { handleRunClick: handleRunClickWithUnsavedCheck, runConfirmationModal } =
    useRunWorkflowWithConfirmation(openTestModal);

  const runWorkflowTooltipContent = useMemo(
    () =>
      getTestRunTooltipContent({
        isExecutionsTab,
        isValid: Boolean(isSyntaxValid),
        canRunWorkflow: canExecuteWorkflow,
        isSaving: Boolean(isSaving),
      }),
    [isExecutionsTab, isSyntaxValid, canExecuteWorkflow, isSaving]
  );

  const runDisabled = isExecutionsTab || !canExecuteWorkflow || !isSyntaxValid || isSaving;

  const testWorkflowButton = useMemo(
    () => (
      <EuiToolTip content={runWorkflowTooltipContent}>
        <EuiButton
          color="success"
          iconType="play"
          size="m"
          onClick={handleRunClickWithUnsavedCheck}
          isDisabled={runDisabled}
          data-test-subj="workflowBottomBarRunButton"
        >
          {i18n.translate('workflows.workflowDetailEditor.runWorkflow', {
            defaultMessage: 'Run workflow',
          })}
        </EuiButton>
      </EuiToolTip>
    ),
    [runWorkflowTooltipContent, handleRunClickWithUnsavedCheck, runDisabled]
  );

  const testWorkflowButtonCompact = useMemo(
    () => (
      <EuiToolTip content={runWorkflowTooltipContent} disableScreenReaderOutput>
        <EuiButtonIcon
          color="success"
          display="base"
          iconType="play"
          size="s"
          onClick={handleRunClickWithUnsavedCheck}
          disabled={runDisabled}
          aria-label={i18n.translate('workflows.workflowDetailEditor.runWorkflow', {
            defaultMessage: 'Run workflow',
          })}
          data-test-subj="workflowBottomBarRunButtonCompact"
        />
      </EuiToolTip>
    ),
    [runWorkflowTooltipContent, handleRunClickWithUnsavedCheck, runDisabled]
  );

  // Always built; the bar cross-fades visibility based on editorView so the
  // mount/unmount jump doesn't interrupt the opacity transition.
  const yamlActionsSlot = useMemo(() => {
    const documentationLabel = i18n.translate(
      'workflows.workflowDetailEditor.tools.documentation',
      {
        defaultMessage: 'Documentation',
      }
    );

    const commandKey = isMac ? '⌘' : 'Ctrl';
    const actionsMenuLabel = i18n.translate('workflows.workflowDetailEditor.tools.actionsMenu', {
      defaultMessage: 'Actions menu',
    });
    return (
      <EuiFlexGroup alignItems="center" gutterSize="none" responsive={false} wrap={false}>
        <EuiFlexItem grow={false}>
          <EuiToolTip content={`${actionsMenuLabel} (${commandKey}+K)`}>
            <EuiButtonIcon
              iconType="plus"
              color="text"
              size="s"
              onClick={() => openActionsRef.current?.()}
              aria-label={actionsMenuLabel}
              data-test-subj="workflowBottomBarActionsMenu"
            />
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content={documentationLabel} disableScreenReaderOutput>
            <EuiButtonIcon
              iconType="documentation"
              href={WORKFLOWS_DOCUMENTATION_URL}
              target="_blank"
              color="text"
              size="s"
              aria-label={documentationLabel}
              data-test-subj="workflowBottomBarDocumentation"
            />
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }, []);

  const toolsSlot = useMemo(
    () => (
      <EuiFlexGroup alignItems="center" gutterSize="none" responsive={false} wrap={false}>
        <EuiFlexItem grow={false}>
          <KeyboardShortcutsPopover />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EditorSettingsPopover
            editorRef={editorRef}
            graphDirection={graphDirection}
            onGraphDirectionChange={setGraphDirection}
            hideControlsMenu={hideControlsMenu}
            onHideControlsMenuChange={handleHideControlsMenuChange}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
    [graphDirection, handleHideControlsMenuChange, hideControlsMenu, setGraphDirection]
  );

  // Keep the graph mounted for a moment after switching to YAML so the
  // cross-fade animation can play out before unmounting it.
  const [renderGraph, setRenderGraph] = useState(showGraph);
  useEffect(() => {
    if (showGraph) {
      setRenderGraph(true);
      return;
    }
    const t = setTimeout(() => setRenderGraph(false), 260);
    return () => clearTimeout(t);
  }, [showGraph]);

  return (
    <ReactFlowProvider>
      <EuiFlexGroup gutterSize="none" style={{ height: '100%' }}>
        <EuiFlexItem css={styles.yamlEditor}>
          {/*
           * The YAML editor is always mounted so its validation pipeline keeps
           * running. When in graph view, the editor swaps Monaco out for the
           * visual editor in the same flex column. The validation accordion
           * is hidden in graph view.
           */}
          <React.Suspense fallback={<EuiLoadingSpinner />}>
            <WorkflowYAMLEditor
              highlightDiff={highlightDiff}
              onStepRun={handleStepRun}
              editorRef={editorRef}
              hideEditorBody={showGraph}
              hideEditorTools={isVisualEditorEnabled}
              openActionsRef={openActionsRef}
              onToggleEditorMode={() => handleEditorViewChange(showGraph ? 'yaml' : 'graph')}
              bodyOverride={
                isVisualEditorEnabled && renderGraph ? (
                  <React.Suspense fallback={<EuiLoadingSpinner />}>
                    <WorkflowVisualEditor
                      onStepRun={handleStepRun}
                      direction={graphDirection}
                      defaultViewport={graphViewportRef.current}
                      onViewportChange={handleGraphViewportChange}
                    />
                  </React.Suspense>
                ) : null
              }
            />
          </React.Suspense>
          {isVisualEditorEnabled && (
            <WorkflowDetailBottomBar
              editorView={editorView}
              onEditorViewChange={handleEditorViewChange}
              yamlActionsSlot={yamlActionsSlot}
              toolsSlot={toolsSlot}
              testWorkflowButton={testWorkflowButton}
              testWorkflowButtonCompact={testWorkflowButtonCompact}
              disableAutoCollapse={!hideControlsMenu}
            />
          )}
        </EuiFlexItem>
        {isExecutionGraphEnabled && (
          <EuiFlexItem css={styles.visualEditor}>
            <React.Suspense fallback={<EuiLoadingSpinner />}>
              <ExecutionGraph />
            </React.Suspense>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      <WorkflowDetailConnectorFlyout editorRef={editorRef} />
      {runConfirmationModal}
    </ReactFlowProvider>
  );
});
WorkflowDetailEditor.displayName = 'WorkflowDetailEditor';

const componentStyles = {
  yamlEditor: css({
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  }),
  visualEditor: ({ euiTheme }: UseEuiTheme) =>
    css({
      flex: 1,
      overflow: 'hidden',
      borderLeft: `1px solid ${euiTheme.colors.borderBasePlain}`,
    }),
};
