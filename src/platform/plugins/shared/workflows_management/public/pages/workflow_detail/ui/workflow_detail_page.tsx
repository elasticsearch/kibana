/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiEmptyPrompt, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { isHttpFetchError } from '@kbn/core-http-browser';
import { kbnFullBodyHeightCss } from '@kbn/css-utils/public/full_body_height_css';
import { FormattedMessage } from '@kbn/i18n-react';
import { useWorkflowsCapabilities } from '@kbn/workflows-ui';
import { workflowDefaultYaml } from './workflow_default_yml';
import { WorkflowDetailEditor } from './workflow_detail_editor';
import { WorkflowDetailHeader } from './workflow_detail_header';
import { WorkflowEditorLayout } from './workflow_detail_layout';
import { WorkflowDetailLoadingState } from './workflow_detail_loading_state';
import { WorkflowDetailTestModal } from './workflow_detail_test_modal';
import { WorkflowDetailTestStepModal } from './workflow_detail_test_step_modal';
import { WorkflowNotFoundPage } from './workflow_not_found_page';
import { PLUGIN_ID } from '../../../../common';
import type { WorkflowDetailTab } from '../../../common/lib/telemetry/events/workflows/ui/types';
import { setActiveTab, setExecution, setYamlString } from '../../../entities/workflows/store';
import {
  selectActiveTab,
  selectWorkflowId,
  selectWorkflowName,
} from '../../../entities/workflows/store/workflow_detail/selectors';
import { loadConnectorsThunk } from '../../../entities/workflows/store/workflow_detail/thunks/load_connectors_thunk';
import { loadWorkflowThunk } from '../../../entities/workflows/store/workflow_detail/thunks/load_workflow_thunk';
import { loadWorkflowsThunk } from '../../../entities/workflows/store/workflow_detail/thunks/load_workflows_thunk';
import { WorkflowChangeHistoryProvider } from '../../../features/change_history';
import { WorkflowExecutionDetail } from '../../../features/workflow_execution_detail';
import { WorkflowExecutionList } from '../../../features/workflow_execution_list/ui/workflow_execution_list_stateful';
import { useAsyncThunkState } from '../../../hooks/use_async_thunk';
import { useKibana } from '../../../hooks/use_kibana';
import { useTelemetry } from '../../../hooks/use_telemetry';
import { useWorkflowsBreadcrumbs } from '../../../hooks/use_workflow_breadcrumbs/use_workflow_breadcrumbs';
import { useWorkflowUrlState } from '../../../hooks/use_workflow_url_state';

const isLoadWorkflowNotFoundError = (error: unknown) =>
  isHttpFetchError(error) && error.response?.status === 404;

const getLoadWorkflowErrorMessage = (error: unknown) =>
  (isHttpFetchError(error) ? (error.body as { message?: string })?.message : undefined) ||
  (error instanceof Error ? error.message : String(error));

export function WorkflowDetailPage({ id }: { id?: string }) {
  const dispatch = useDispatch();
  const [loadConnectors, { isLoading: isLoadingConnectors }] =
    useAsyncThunkState(loadConnectorsThunk);
  const [loadWorkflows] = useAsyncThunkState(loadWorkflowsThunk);
  const [loadWorkflow, { isLoading: isLoadingWorkflow, error }] =
    useAsyncThunkState(loadWorkflowThunk);
  const telemetry = useTelemetry();
  const { application } = useKibana().services;

  const isReady = !isLoadingWorkflow && !isLoadingConnectors;

  const activeTabInStore = useSelector(selectActiveTab);
  const workflowId = useSelector(selectWorkflowId);
  const workflowName = useSelector(selectWorkflowName);

  useWorkflowsBreadcrumbs(workflowName);

  const { canReadWorkflowExecution } = useWorkflowsCapabilities();
  const {
    activeTab,
    selectedExecutionId,
    setSelectedExecution,
    setActiveTab: setUrlTab,
  } = useWorkflowUrlState();

  useEffect(() => {
    if (!canReadWorkflowExecution) {
      if (activeTab === 'executions') {
        setUrlTab('workflow');
      }
      if (selectedExecutionId) {
        setSelectedExecution(null);
      }
    }
  }, [canReadWorkflowExecution, activeTab, selectedExecutionId, setUrlTab, setSelectedExecution]);

  // Report detail viewed telemetry when page is ready
  useEffect(() => {
    if (isReady && workflowId && activeTab) {
      const tab: WorkflowDetailTab = activeTab;
      telemetry.reportWorkflowDetailViewed({
        workflowId,
        tab,
        editorType: 'yaml',
      });
    }
  }, [isReady, workflowId, activeTab, telemetry]);

  useEffect(() => {
    loadConnectors(); // dispatch load connectors on mount
    loadWorkflows(); // dispatch load workflows on mount
  }, [loadConnectors, loadWorkflows]);

  // Load workflow when id changes
  useEffect(() => {
    if (id) {
      loadWorkflow({ id }); // sets loaded yaml string
    } else {
      dispatch(setYamlString(workflowDefaultYaml));
      telemetry.reportWorkflowCreateOpened({ editorType: 'yaml' });
    }
  }, [loadWorkflow, id, dispatch, telemetry]);

  // Sync activeTab from URL state to store
  useEffect(() => {
    if (activeTabInStore !== activeTab) {
      dispatch(setActiveTab(activeTab));
    }
  }, [activeTab, activeTabInStore, dispatch]);

  // Load execution when selectedExecutionId changes
  useEffect(() => {
    if (!selectedExecutionId) {
      dispatch(setExecution(undefined));
    }
  }, [selectedExecutionId, dispatch]);

  // TODO: manage it in a workflow state context
  const [highlightDiff, setHighlightDiff] = useState(false);

  const onCloseExecutionDetail = useCallback(() => {
    setSelectedExecution(null);
  }, [setSelectedExecution]);

  const onBackToWorkflows = useCallback(() => {
    application.navigateToApp(PLUGIN_ID);
  }, [application]);

  if (error) {
    if (isLoadWorkflowNotFoundError(error)) {
      return <WorkflowNotFoundPage onBackToWorkflows={onBackToWorkflows} />;
    }

    return (
      <EuiEmptyPrompt
        iconType="error"
        color="danger"
        title={
          <h2>
            <FormattedMessage
              id="workflows.workflowDetail.error.title"
              defaultMessage="Unable to load workflow"
            />
          </h2>
        }
        body={
          <p>
            <FormattedMessage
              id="workflows.workflowDetail.error.body"
              defaultMessage="There was an error loading the workflow. {error}"
              values={{ error: getLoadWorkflowErrorMessage(error) }}
            />
          </p>
        }
      />
    );
  }

  const pageContent = (
    <EuiFlexGroup direction="column" gutterSize="none" css={kbnFullBodyHeightCss()}>
      <EuiFlexItem grow={false}>
        <WorkflowDetailHeader
          isLoading={isLoadingWorkflow}
          highlightDiff={highlightDiff}
          setHighlightDiff={setHighlightDiff}
        />
      </EuiFlexItem>
      <EuiFlexItem css={css({ overflow: 'hidden', minHeight: 0 })}>
        {!isReady ? (
          <WorkflowDetailLoadingState />
        ) : (
          <WorkflowEditorLayout
            editor={<WorkflowDetailEditor highlightDiff={highlightDiff} />}
            executionList={
              id &&
              activeTab === 'executions' &&
              !selectedExecutionId &&
              canReadWorkflowExecution ? (
                <WorkflowExecutionList workflowId={id} />
              ) : null
            }
            executionDetail={
              selectedExecutionId && canReadWorkflowExecution ? (
                <WorkflowExecutionDetail
                  executionId={selectedExecutionId}
                  onClose={onCloseExecutionDetail}
                />
              ) : null
            }
          />
        )}
        <WorkflowDetailTestModal />
        <WorkflowDetailTestStepModal />
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  if (!id) {
    return pageContent;
  }

  return (
    <WorkflowChangeHistoryProvider workflowId={id} workflowName={workflowName ?? workflowId}>
      {pageContent}
    </WorkflowChangeHistoryProvider>
  );
}
