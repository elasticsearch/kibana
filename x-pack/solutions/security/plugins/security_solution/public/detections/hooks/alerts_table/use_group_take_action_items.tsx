/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import type {
  EuiContextMenuPanelDescriptor,
  EuiContextMenuPanelItemDescriptor,
} from '@elastic/eui';
import { EuiContextMenu, EuiContextMenuItem } from '@elastic/eui';
import type { MappingRuntimeFields } from '@elastic/elasticsearch/lib/api/types';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { useBulkClosingReasonItems } from '@kbn/response-ops-detections-close-reason';
import { toBulkCloseRuntimeMappings } from '../../../common/components/toolbar/bulk_actions/runtime_mappings_for_bulk_close';
import type { GroupTakeActionItems } from '../../components/alerts_table/types';
import type { Status } from '../../../../common/api/detection_engine';
import type { inputsModel } from '../../../common/store';
import { inputsSelectors } from '../../../common/store';
import { useStartTransaction } from '../../../common/lib/apm/use_start_transaction';
import { useAppToasts } from '../../../common/hooks/use_app_toasts';
import type { AlertWorkflowStatus } from '../../../common/types';
import { APM_USER_INTERACTIONS } from '../../../common/lib/apm/constants';
import { updateAlertStatus } from '../../../common/components/toolbar/bulk_actions/update_alerts';
import {
  BULK_ACTION_ACKNOWLEDGED_SELECTED,
  BULK_ACTION_CLOSE_SELECTED,
  BULK_ACTION_OPEN_SELECTED,
} from '../../../common/components/toolbar/bulk_actions/translations';
import {
  UPDATE_ALERT_STATUS_FAILED,
  UPDATE_ALERT_STATUS_FAILED_DETAILED,
} from '../../../common/translations';
import type { AlertClosingReason } from '../../../../common/types';
import { FILTER_ACKNOWLEDGED, FILTER_CLOSED, FILTER_OPEN } from '../../../../common/types';
import { useDeepEqualSelector } from '../../../common/hooks/use_selector';
import * as i18n from '../translations';
import { AlertsEventTypes, METRIC_TYPE, track } from '../../../common/lib/telemetry';
import type { StartServices } from '../../../types';
import { useAlertCloseInfoModal } from '../use_alert_close_info_modal';
import { useAlertsPrivileges } from '../../containers/detection_engine/alerts/use_alerts_privileges';

const getTelemetryEvent = {
  groupedAlertsTakeAction: ({
    tableId,
    groupNumber,
    status,
  }: {
    tableId: string;
    groupNumber: number;
    status: AlertWorkflowStatus;
  }) => `alerts_table_${tableId}_group-${groupNumber}_mark-${status}`,
};

export interface UseGroupTakeActionsItemsParams {
  /**
   * Optional property to allow filtering the options in the dropdown depending on the current alert statuses
   */
  currentStatus?: Status[];
  /**
   * If true, will show all the action items
   */
  showAlertStatusActions?: boolean;
}

/**
 * Hook returning a set of action items to be accessed when users click on the Take actions button displayed at the grouping alerts table group level.
 * Currently the action returned are: mark as opened, mark as acknowledged or mark as closed.
 * The hook is used in the alerts page, the rule details page and the entity analytics top risk score section.
 */
export const useGroupTakeActionsItems = ({
  currentStatus,
  showAlertStatusActions = true,
}: UseGroupTakeActionsItemsParams): GroupTakeActionItems => {
  const { addSuccess, addError, addWarning } = useAppToasts();
  const { startTransaction } = useStartTransaction();
  const { hasAlertsUpdate } = useAlertsPrivileges();
  const getGlobalQuerySelector = useMemo(() => inputsSelectors.globalQuery(), []);
  const globalQueries = useDeepEqualSelector(getGlobalQuerySelector);
  const {
    services: { telemetry },
  } = useKibana<StartServices>();

  const { promptAlertCloseConfirmation } = useAlertCloseInfoModal();

  const refetchQuery = useCallback(() => {
    globalQueries.forEach((q) => q.refetch && (q.refetch as inputsModel.Refetch)());
  }, [globalQueries]);

  const reportAlertsGroupingTakeActionClick = useCallback(
    (params: {
      tableId: string;
      groupNumber: number;
      status: 'open' | 'closed' | 'acknowledged';
      groupByField: string;
    }) => {
      telemetry.reportEvent(AlertsEventTypes.AlertsGroupingTakeAction, params);
    },
    [telemetry]
  );

  const onAlertStatusUpdateSuccess = useCallback(
    (updated: number, conflicts: number, newStatus: AlertWorkflowStatus) => {
      if (conflicts > 0) {
        // Partial failure
        addWarning({
          title: UPDATE_ALERT_STATUS_FAILED(conflicts),
          text: UPDATE_ALERT_STATUS_FAILED_DETAILED(updated, conflicts),
        });
      } else {
        let title: string;
        switch (newStatus) {
          case 'closed':
            title = i18n.CLOSED_ALERT_SUCCESS_TOAST(updated);
            break;
          case 'open':
            title = i18n.OPENED_ALERT_SUCCESS_TOAST(updated);
            break;
          case 'acknowledged':
            title = i18n.ACKNOWLEDGED_ALERT_SUCCESS_TOAST(updated);
        }
        addSuccess({ title });
      }
      refetchQuery();
    },
    [addSuccess, addWarning, refetchQuery]
  );

  const onAlertStatusUpdateFailure = useCallback(
    (newStatus: AlertWorkflowStatus, error: Error) => {
      let title: string;
      switch (newStatus) {
        case 'closed':
          title = i18n.CLOSED_ALERT_FAILED_TOAST;
          break;
        case 'open':
          title = i18n.OPENED_ALERT_FAILED_TOAST;
          break;
        case 'acknowledged':
          title = i18n.ACKNOWLEDGED_ALERT_FAILED_TOAST;
      }
      addError(error, { title });
      refetchQuery();
    },
    [addError, refetchQuery]
  );

  const onClickUpdate = useCallback(
    async ({
      groupNumber,
      query,
      status,
      tableId,
      selectedGroup,
      reason,
      runtimeMappings,
    }: {
      groupNumber: number;
      query?: string;
      status: AlertWorkflowStatus;
      tableId: string;
      selectedGroup: string;
      reason?: AlertClosingReason;
      runtimeMappings?: MappingRuntimeFields;
    }) => {
      if (status === 'closed' && query && !(await promptAlertCloseConfirmation({ query }))) {
        return;
      }
      if (query) {
        startTransaction({ name: APM_USER_INTERACTIONS.BULK_QUERY_STATUS_UPDATE });
      } else {
        startTransaction({ name: APM_USER_INTERACTIONS.STATUS_UPDATE });
      }

      track(
        METRIC_TYPE.CLICK,
        getTelemetryEvent.groupedAlertsTakeAction({ tableId, groupNumber, status })
      );
      reportAlertsGroupingTakeActionClick({
        tableId,
        groupNumber,
        status,
        groupByField: selectedGroup,
      });

      try {
        const response = await updateAlertStatus({
          status,
          query: query ? JSON.parse(query) : {},
          reason,
          // Convert to the narrower shape the route accepts, preserving scripts.
          runtimeMappings: toBulkCloseRuntimeMappings(runtimeMappings),
        });

        onAlertStatusUpdateSuccess(response.updated ?? 0, response.version_conflicts ?? 0, status);
      } catch (error) {
        onAlertStatusUpdateFailure(status, error);
      }
    },
    [
      startTransaction,
      reportAlertsGroupingTakeActionClick,
      onAlertStatusUpdateSuccess,
      onAlertStatusUpdateFailure,
      promptAlertCloseConfirmation,
    ]
  );
  const { item: alertClosingReasonItem, getPanels: getAlertClosingReasonPanels } =
    useBulkClosingReasonItems({
      isEnabled: hasAlertsUpdate ?? false,
    });

  return useCallback(
    ({ query, tableId, groupNumber, selectedGroup, runtimeMappings }) => {
      const actionItems: EuiContextMenuPanelItemDescriptor[] = [];

      if (!hasAlertsUpdate || !showAlertStatusActions) {
        return;
      }

      if (currentStatus && currentStatus.length === 1) {
        const singleStatus = currentStatus[0];
        if (singleStatus !== FILTER_OPEN) {
          actionItems.push({
            key: 'open',
            renderItem: () => (
              <EuiContextMenuItem
                key="open"
                role="menuitem"
                data-test-subj="open-alert-status"
                onClick={() =>
                  onClickUpdate({
                    groupNumber,
                    query,
                    selectedGroup,
                    status: FILTER_OPEN as AlertWorkflowStatus,
                    tableId,
                    runtimeMappings,
                  })
                }
              >
                {BULK_ACTION_OPEN_SELECTED}
              </EuiContextMenuItem>
            ),
          });
        }
        if (singleStatus !== FILTER_ACKNOWLEDGED) {
          actionItems.push({
            key: 'acknowledge',
            renderItem: () => (
              <EuiContextMenuItem
                key="acknowledge"
                role="menuitem"
                data-test-subj="acknowledged-alert-status"
                onClick={() =>
                  onClickUpdate({
                    groupNumber,
                    query,
                    selectedGroup,
                    status: FILTER_ACKNOWLEDGED as AlertWorkflowStatus,
                    tableId,
                    runtimeMappings,
                  })
                }
              >
                {BULK_ACTION_ACKNOWLEDGED_SELECTED}
              </EuiContextMenuItem>
            ),
          });
        }
        if (singleStatus !== FILTER_CLOSED && alertClosingReasonItem) {
          actionItems.push({
            'data-test-subj': alertClosingReasonItem['data-test-subj'],
            name: alertClosingReasonItem.label,
            panel: alertClosingReasonItem?.panel,
            key: alertClosingReasonItem.key,
          });
        }
      } else {
        const statusArr = {
          [FILTER_OPEN]: BULK_ACTION_OPEN_SELECTED,
          [FILTER_ACKNOWLEDGED]: BULK_ACTION_ACKNOWLEDGED_SELECTED,
          [FILTER_CLOSED]: BULK_ACTION_CLOSE_SELECTED,
        };
        Object.keys(statusArr).forEach((workflowStatus) => {
          if (workflowStatus === FILTER_CLOSED && alertClosingReasonItem) {
            actionItems.push({
              'data-test-subj': alertClosingReasonItem['data-test-subj'],
              name: alertClosingReasonItem.label,
              panel: alertClosingReasonItem?.panel,
              key: alertClosingReasonItem.key,
            });
          } else {
            actionItems.push({
              renderItem: () => (
                <EuiContextMenuItem
                  key={workflowStatus}
                  role="menuitem"
                  data-test-subj={`${workflowStatus}-alert-status`}
                  onClick={() =>
                    onClickUpdate({
                      groupNumber,
                      query,
                      selectedGroup,
                      status: workflowStatus as AlertWorkflowStatus,
                      tableId,
                      runtimeMappings,
                    })
                  }
                >
                  {statusArr[workflowStatus]}
                </EuiContextMenuItem>
              ),
            });
          }
        });
      }

      const alertClosingReasonPanels = getAlertClosingReasonPanels({
        onSubmitCloseReason({ reason }) {
          onClickUpdate({
            groupNumber,
            query,
            selectedGroup,
            status: FILTER_CLOSED as AlertWorkflowStatus,
            tableId,
            reason,
            runtimeMappings,
          });
        },
      }).map((panel) => ({
        ...panel,
        content: panel.renderContent({
          alertItems: [],
          setIsBulkActionsLoading: () => {},
          closePopoverMenu: () => {},
        }),
      }));

      const panels: EuiContextMenuPanelDescriptor[] = [
        { id: 0, items: actionItems },
        ...alertClosingReasonPanels,
      ];

      return <EuiContextMenu panels={panels} initialPanelId={0} />;
    },
    [
      alertClosingReasonItem,
      currentStatus,
      getAlertClosingReasonPanels,
      onClickUpdate,
      showAlertStatusActions,
      hasAlertsUpdate,
    ]
  );
};
