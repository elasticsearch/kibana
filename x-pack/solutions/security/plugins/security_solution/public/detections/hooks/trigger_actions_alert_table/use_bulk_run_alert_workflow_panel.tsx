/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  BulkActionsConfig,
  ContentPanelConfig,
  RenderContentPanelProps,
} from '@kbn/response-ops-alerts-table/types';
import { useWorkflowsCapabilities, useWorkflowsUIEnabledSetting } from '@kbn/workflows-ui';
import React, { useCallback, useMemo } from 'react';
import * as i18n from '../../components/alerts_table/translations';
import { useAlertsPrivileges } from '../../containers/detection_engine/alerts/use_alerts_privileges';
import {
  RUN_WORKFLOWS_PANEL_WIDTH,
  AlertWorkflowsPanel,
  RUN_WORKFLOW_BULK_PANEL_ID,
} from '../../components/alerts_table/timeline_actions/use_run_alert_workflow_panel';

export interface UseBulkRunAlertWorkflowPanelResult {
  runWorkflowItems: BulkActionsConfig[];
  runWorkflowPanels: ContentPanelConfig[];
}

export const BULK_RUN_ALERT_WORKFLOW_ACTION_ID = 'bulk-run-alert-workflow';

export const useBulkRunAlertWorkflowPanel = (): UseBulkRunAlertWorkflowPanelResult => {
  const { canExecuteWorkflow } = useWorkflowsCapabilities();
  const workflowUIEnabled = useWorkflowsUIEnabledSetting();
  const { hasIndexWrite } = useAlertsPrivileges();
  const canRunWorkflow = useMemo(
    () => hasIndexWrite && workflowUIEnabled && canExecuteWorkflow,
    [hasIndexWrite, workflowUIEnabled, canExecuteWorkflow]
  );

  const renderContent = useCallback((props: RenderContentPanelProps) => {
    const alertIds = props.alertItems.map((item) => ({
      _id: item._id,
      _index: item._index ?? '',
    }));
    return <AlertWorkflowsPanel alertIds={alertIds} onClose={props.closePopoverMenu} />;
  }, []);

  const runWorkflowItems = useMemo<BulkActionsConfig[]>(
    () =>
      canRunWorkflow
        ? [
            {
              key: BULK_RUN_ALERT_WORKFLOW_ACTION_ID,
              'data-test-subj': 'bulk-run-alert-workflow-action',
              label: i18n.CONTEXT_MENU_RUN_WORKFLOW,
              name: i18n.CONTEXT_MENU_RUN_WORKFLOW,
              panel: RUN_WORKFLOW_BULK_PANEL_ID,
              disableOnQuery: false,
              icon: 'workflow' as const,
              groupId: 'workflow' as const,
            },
          ]
        : [],
    [canRunWorkflow]
  );

  const runWorkflowPanels = useMemo(
    () =>
      canRunWorkflow
        ? [
            {
              id: RUN_WORKFLOW_BULK_PANEL_ID,
              title: i18n.SELECT_WORKFLOW_PANEL_TITLE,
              'data-test-subj': 'bulk-alert-workflow-context-menu-panel',
              width: RUN_WORKFLOWS_PANEL_WIDTH,
              renderContent,
            },
          ]
        : [],
    [canRunWorkflow, renderContent]
  );

  return useMemo(
    () => ({
      runWorkflowItems,
      runWorkflowPanels,
    }),
    [runWorkflowItems, runWorkflowPanels]
  );
};
