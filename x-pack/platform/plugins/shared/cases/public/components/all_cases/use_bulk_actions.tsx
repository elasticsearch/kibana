/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  EuiContextMenuPanelDescriptor,
  EuiContextMenuPanelItemDescriptor,
} from '@elastic/eui';
import React, { useCallback, useMemo } from 'react';
import { CaseStatuses } from '@kbn/cases-components';

import type { CasesUI } from '../../containers/types';
import { useDeleteAction } from '../actions/delete/use_delete_action';
import { useSeverityAction } from '../actions/severity/use_severity_action';
import { useStatusAction } from '../actions/status/use_status_action';
import { EditTagsFlyout } from '../actions/tags/edit_tags_flyout';
import { useTagsAction } from '../actions/tags/use_tags_action';
import { ConfirmDeleteCaseModal } from '../confirm_delete_case';
import { useCasesContext } from '../cases_context/use_cases_context';
import { useAssigneesAction } from '../actions/assignees/use_assignees_action';
import { EditAssigneesFlyout } from '../actions/assignees/edit_assignees_flyout';
import { useCloseCaseModal } from './use_close_case_modal';
import { useCanSyncCloseReasonToAlerts } from './use_can_sync_close_reason_to_alerts';
import { useRunWorkflowAction } from '../actions/run_workflow/use_run_workflow_action';
import { RunCaseWorkflowModal } from '../workflows/run_case_workflow_modal';
import * as i18n from './translations';

interface UseBulkActionsProps {
  selectedCases: CasesUI;
  onAction: () => void;
  onActionSuccess: () => void;
}

interface UseBulkActionsReturnValue {
  panels: EuiContextMenuPanelDescriptor[];
  modals: JSX.Element;
  flyouts: JSX.Element;
}

export const useBulkActions = ({
  selectedCases,
  onAction,
  onActionSuccess,
}: UseBulkActionsProps): UseBulkActionsReturnValue => {
  const isDisabled = selectedCases.length === 0;
  const { permissions } = useCasesContext();

  const deleteAction = useDeleteAction({
    isDisabled,
    onAction,
    onActionSuccess,
  });

  const statusAction = useStatusAction({
    isDisabled,
    onAction,
    onActionSuccess,
  });

  const severityAction = useSeverityAction({
    isDisabled,
    onAction,
    onActionSuccess,
  });

  const tagsAction = useTagsAction({
    isDisabled,
    onAction,
    onActionSuccess,
  });

  const assigneesAction = useAssigneesAction({
    isDisabled: false,
    onAction,
    onActionSuccess,
  });

  const runWorkflowAction = useRunWorkflowAction({
    onAction,
    onActionSuccess,
  });

  const canDelete = deleteAction.canDelete;
  const canUpdate = statusAction.canUpdateStatus;
  const canAssign = permissions.assign;
  const canSyncCloseReasonToAlerts = useCanSyncCloseReasonToAlerts({
    selectedCases,
  });

  const onCloseCase = useCallback(
    (closeReason?: string) => {
      statusAction.handleUpdateCaseStatus(selectedCases, CaseStatuses.closed, closeReason);
    },
    [selectedCases, statusAction]
  );
  const { openCloseCaseModal, closeCaseModal } = useCloseCaseModal({
    canSyncCloseReasonToAlerts,
    onCloseCase,
  });

  const statusActions = useMemo((): EuiContextMenuPanelItemDescriptor[] => {
    return statusAction.getActions(selectedCases).map((statusActionMenuItem) => {
      if (statusActionMenuItem.key === 'cases-bulk-action-status-closed') {
        return {
          ...statusActionMenuItem,
          onClick: openCloseCaseModal,
        } as EuiContextMenuPanelItemDescriptor;
      }

      return statusActionMenuItem;
    });
  }, [openCloseCaseModal, selectedCases, statusAction]);

  const panels = useMemo((): EuiContextMenuPanelDescriptor[] => {
    const mainPanelItems: EuiContextMenuPanelItemDescriptor[] = [];

    if (canUpdate) {
      mainPanelItems.push({
        name: i18n.STATUS,
        panel: 1,
        disabled: isDisabled,
        'data-test-subj': 'case-bulk-action-status',
        key: 'case-bulk-action-status',
      });

      mainPanelItems.push({
        name: i18n.SEVERITY,
        panel: 2,
        disabled: isDisabled,
        'data-test-subj': 'case-bulk-action-severity',
        key: 'case-bulk-action-severity',
      });
    }

    /**
     * A separator is added if a) there is one item above
     * and b) there is an item below. For this to happen the
     * user has to have delete and update permissions
     */
    if (canUpdate && canDelete) {
      mainPanelItems.push({
        isSeparator: true as const,
        key: 'bulk-actions-separator',
        'data-test-subj': 'bulk-actions-separator',
      });
    }

    if (runWorkflowAction.canRunWorkflow) {
      mainPanelItems.push(runWorkflowAction.getAction(selectedCases));
    }

    if (canUpdate) {
      mainPanelItems.push(tagsAction.getAction(selectedCases));
    }

    if (canAssign) {
      mainPanelItems.push(assigneesAction.getAction(selectedCases));
    }

    if (canDelete) {
      mainPanelItems.push(deleteAction.getAction(selectedCases));
    }
    const panelsToBuild: EuiContextMenuPanelDescriptor[] = [
      {
        id: 0,
        items: [...mainPanelItems], // Create a new array instead of using reference
        title: i18n.ACTIONS,
      },
    ];
    if (canUpdate) {
      panelsToBuild.push({
        id: 1,
        title: i18n.STATUS,
        items: statusActions,
      });

      panelsToBuild.push({
        id: 2,
        title: i18n.SEVERITY,
        items: severityAction.getActions(selectedCases),
      });
    }

    return panelsToBuild;
  }, [
    canDelete,
    canUpdate,
    canAssign,
    deleteAction,
    isDisabled,
    runWorkflowAction,
    selectedCases,
    severityAction,
    statusActions,
    tagsAction,
    assigneesAction,
  ]);

  return {
    modals: (
      <>
        {deleteAction.isModalVisible ? (
          <ConfirmDeleteCaseModal
            totalCasesToBeDeleted={selectedCases.length}
            onCancel={deleteAction.onCloseModal}
            onConfirm={deleteAction.onConfirmDeletion}
          />
        ) : null}
        {runWorkflowAction.isModalVisible ? (
          <RunCaseWorkflowModal {...runWorkflowAction.modalProps} />
        ) : null}
        {closeCaseModal}
      </>
    ),
    flyouts: (
      <>
        {tagsAction.isFlyoutOpen ? (
          <EditTagsFlyout
            onClose={tagsAction.onFlyoutClosed}
            selectedCases={selectedCases}
            onSaveTags={tagsAction.onSaveTags}
          />
        ) : null}
        {assigneesAction.isFlyoutOpen ? (
          <EditAssigneesFlyout
            onClose={assigneesAction.onFlyoutClosed}
            selectedCases={selectedCases}
            onSaveAssignees={assigneesAction.onSaveAssignees}
          />
        ) : null}
      </>
    ),
    panels,
  };
};
