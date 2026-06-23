/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { UseEuiTheme } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner } from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { i18n } from '@kbn/i18n';
import type { monaco } from '@kbn/monaco';
import {
  WORKFLOWS_UI_EXECUTION_GRAPH_SETTING_ID,
  WORKFLOWS_UI_VISUAL_EDITOR_SETTING_ID,
} from '@kbn/workflows';
import { useWorkflowsCapabilities } from '@kbn/workflows-ui';
import { useContextOverrideData } from './use_context_override_data';
import { WorkflowDetailConnectorFlyout } from './workflow_detail_connector_flyout';
import { useWorkflowActions } from '../../../entities/workflows/model/use_workflow_actions';
import {
  selectWorkflowId,
  selectYamlString,
} from '../../../entities/workflows/store/workflow_detail/selectors';
import { setTestStepModalOpenStepId } from '../../../entities/workflows/store/workflow_detail/slice';
import { ExecutionGraph } from '../../../features/debug_graph/execution_graph';
import { useKibana } from '../../../hooks/use_kibana';
import { useWorkflowUrlState } from '../../../hooks/use_workflow_url_state';
import { useWorkflowsExperimentalUiSetting } from '../../../hooks/use_workflows_experimental_ui_setting';

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
  const dispatch = useDispatch();

  const workflowYaml = useSelector(selectYamlString) ?? '';
  const workflowId = useSelector(selectWorkflowId);
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

  return (
    <>
      <EuiFlexGroup gutterSize="none" style={{ height: '100%' }}>
        <EuiFlexItem css={styles.yamlEditor}>
          <React.Suspense fallback={<EuiLoadingSpinner />}>
            <WorkflowYAMLEditor
              highlightDiff={highlightDiff}
              onStepRun={handleStepRun}
              editorRef={editorRef}
            />
          </React.Suspense>
        </EuiFlexItem>
        {isVisualEditorEnabled && (
          <EuiFlexItem css={styles.visualEditor}>
            <React.Suspense fallback={<EuiLoadingSpinner />}>
              <WorkflowVisualEditor />
            </React.Suspense>
          </EuiFlexItem>
        )}
        {isExecutionGraphEnabled && (
          <EuiFlexItem css={styles.visualEditor}>
            <React.Suspense fallback={<EuiLoadingSpinner />}>
              <ExecutionGraph />
            </React.Suspense>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      <WorkflowDetailConnectorFlyout editorRef={editorRef} />
    </>
  );
});
WorkflowDetailEditor.displayName = 'WorkflowDetailEditor';

const componentStyles = {
  yamlEditor: css({
    flex: 1,
    overflow: 'hidden',
  }),
  visualEditor: ({ euiTheme }: UseEuiTheme) =>
    css({
      flex: 1,
      overflow: 'hidden',
      borderLeft: `1px solid ${euiTheme.colors.borderBasePlain}`,
    }),
};
