/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  BulkActionsConfig,
  BulkActionsPanelConfig,
} from '@kbn/response-ops-alerts-table/types';
import React, { useCallback, useMemo } from 'react';
import type { Filter } from '@kbn/es-query';
import { buildEsQuery } from '@kbn/es-query';
import { EuiIcon } from '@elastic/eui';
import type { MappingRuntimeFields } from '@elastic/elasticsearch/lib/api/types';
import type { TableId } from '@kbn/securitysolution-data-table';
import { useBulkClosingReasonItems } from '@kbn/response-ops-detections-close-reason';
import type { AlertClosingReason } from '../../../../common/types';
import {
  RuntimeFieldTypeEnum,
  type RuntimeFieldType,
} from '../../../../common/api/detection_engine/signals/set_signal_status/set_signals_status_route.gen';
import { APM_USER_INTERACTIONS } from '../../../common/lib/apm/constants';

// Derived from the server's Zod enum so this stays in sync if new types are added.
// Filters out ES-only types ('composite', 'lookup') that the server schema does not accept,
// preventing a Zod validation 400 from failing the entire bulk-close request.
const SUPPORTED_RUNTIME_FIELD_TYPES = new Set<string>(Object.values(RuntimeFieldTypeEnum));
import { updateAlertStatus } from '../../../common/components/toolbar/bulk_actions/update_alerts';
import { useAppToasts } from '../../../common/hooks/use_app_toasts';
import { useStartTransaction } from '../../../common/lib/apm/use_start_transaction';
import type { AlertWorkflowStatus } from '../../../common/types';
import { FILTER_CLOSED, FILTER_OPEN, FILTER_ACKNOWLEDGED } from '../../../../common/types';
import * as i18n from '../translations';
import { buildTimeRangeFilter } from '../../components/alerts_table/helpers';
import { useAlertsPrivileges } from '../../containers/detection_engine/alerts/use_alerts_privileges';
import { useAlertCloseInfoModal } from '../use_alert_close_info_modal';

export const BULK_ALERT_STATUS_ACTION_IDS = {
  markAsAcknowledged: 'acknowledged-alert-status',
  markAsOpen: 'open-alert-status',
} as const;

export interface UseBulkAlertActionItemsArgs {
  /* Table ID for which this hook is being used */
  tableId: TableId;
  /* start time being passed to the Events Table */
  from: string;
  /* End Time of the table being passed to the Events Table */
  to: string;
  /* filter of the Alerts Query*/
  filters: Filter[];
  refetch?: () => void;
  /* Runtime mappings from the active data view, forwarded to bulk-close so unmapped fields can be resolved */
  runtimeMappings?: MappingRuntimeFields;
}

export const useBulkAlertActionItems = ({
  filters,
  from,
  to,
  refetch: refetchProp,
  runtimeMappings,
}: UseBulkAlertActionItemsArgs) => {
  const { hasAlertsUpdate } = useAlertsPrivileges();
  const { startTransaction } = useStartTransaction();

  const runtimeFields = useMemo(() => {
    if (!runtimeMappings) return undefined;
    const entries = Object.entries(runtimeMappings)
      .filter(([, field]) => SUPPORTED_RUNTIME_FIELD_TYPES.has(field.type))
      .map(([name, field]) => [name, field.type] as [string, RuntimeFieldType]);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }, [runtimeMappings]);

  const { addSuccess, addError, addWarning } = useAppToasts();

  const { promptAlertCloseConfirmation } = useAlertCloseInfoModal();

  const onAlertStatusUpdateSuccess = useCallback(
    (updated: number, conflicts: number, newStatus: AlertWorkflowStatus) => {
      if (conflicts > 0) {
        // Partial failure
        addWarning({
          title: i18n.UPDATE_ALERT_STATUS_FAILED(conflicts),
          text: i18n.UPDATE_ALERT_STATUS_FAILED_DETAILED(updated, conflicts),
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
    },
    [addSuccess, addWarning]
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
    },
    [addError]
  );

  const getOnAction = useCallback(
    (status: AlertWorkflowStatus, reason?: AlertClosingReason) => {
      const onActionClick: BulkActionsConfig['onClick'] = async (
        items,
        isSelectAllChecked,
        setAlertLoading,
        clearSelection,
        refresh
      ) => {
        try {
          let ids: string[] | undefined = items.map((item) => item._id);
          let query: Record<string, unknown> | undefined;

          if (isSelectAllChecked) {
            const timeFilter = buildTimeRangeFilter(from, to);
            query = buildEsQuery(undefined, [], [...timeFilter, ...filters], undefined);
            ids = undefined;
          }

          if (
            status === 'closed' &&
            !(await promptAlertCloseConfirmation(ids ? { ids } : { query: JSON.stringify(query) }))
          ) {
            return;
          }

          if (isSelectAllChecked) {
            startTransaction({ name: APM_USER_INTERACTIONS.BULK_QUERY_STATUS_UPDATE });
          } else if (items.length > 1) {
            startTransaction({ name: APM_USER_INTERACTIONS.BULK_STATUS_UPDATE });
          } else {
            startTransaction({ name: APM_USER_INTERACTIONS.STATUS_UPDATE });
          }

          setAlertLoading(true);
          const response = await updateAlertStatus({
            status,
            query,
            signalIds: ids,
            reason,
            runtimeFields,
          });

          setAlertLoading(false);
          if (refetchProp) refetchProp();
          refresh();
          clearSelection();

          if (response.version_conflicts && items.length === 1) {
            throw new Error(i18n.BULK_ACTION_FAILED_SINGLE_ALERT);
          }

          onAlertStatusUpdateSuccess(
            response.updated ?? 0,
            response.version_conflicts ?? 0,
            status
          );
        } catch (error) {
          onAlertStatusUpdateFailure(status, error);
        }
      };

      return onActionClick;
    },
    [
      onAlertStatusUpdateFailure,
      onAlertStatusUpdateSuccess,
      startTransaction,
      filters,
      from,
      to,
      refetchProp,
      promptAlertCloseConfirmation,
      runtimeFields,
    ]
  );

  const { item: alertClosingReasonItem, panels: alertClosingReasonPanels } =
    useBulkClosingReasonItems({
      isEnabled: hasAlertsUpdate ?? false,
      onSubmitCloseReason({
        reason,
        alertItems,
        setIsBulkActionsLoading,
        clearSelection,
        isAllSelected,
        refresh,
      }) {
        getOnAction(FILTER_CLOSED as AlertWorkflowStatus, reason)(
          alertItems,
          !!isAllSelected,
          setIsBulkActionsLoading,
          () => clearSelection?.(),
          () => refresh?.()
        );
      },
    });

  const getUpdateAlertStatusAction = useCallback(
    (status: AlertWorkflowStatus) => {
      const label =
        status === FILTER_OPEN
          ? i18n.BULK_ACTION_OPEN_SELECTED
          : status === FILTER_CLOSED
          ? i18n.BULK_ACTION_CLOSE_SELECTED
          : i18n.BULK_ACTION_ACKNOWLEDGED_SELECTED;
      const icon = (
        <EuiIcon
          type="dot"
          color={
            status === FILTER_OPEN
              ? 'danger'
              : status === FILTER_ACKNOWLEDGED
              ? 'primary'
              : 'subdued'
          }
          aria-hidden
        />
      );

      if (status === FILTER_CLOSED) {
        return alertClosingReasonItem
          ? { ...alertClosingReasonItem, icon, groupId: 'status' as const }
          : undefined;
      }

      return {
        label,
        key:
          status === FILTER_OPEN
            ? BULK_ALERT_STATUS_ACTION_IDS.markAsOpen
            : BULK_ALERT_STATUS_ACTION_IDS.markAsAcknowledged,
        'data-test-subj': `${status}-alert-status`,
        disableOnQuery: false,
        onClick: getOnAction(status),
        icon,
        groupId: 'status' as const,
      };
    },
    [alertClosingReasonItem, getOnAction]
  );

  const items = useMemo(() => {
    return hasAlertsUpdate
      ? ([FILTER_OPEN, FILTER_CLOSED, FILTER_ACKNOWLEDGED]
          .map((status) => {
            return getUpdateAlertStatusAction(status as AlertWorkflowStatus);
          })
          //  Filter out undefined items
          .filter((item) => !!item) as BulkActionsConfig[])
      : [];
  }, [getUpdateAlertStatusAction, hasAlertsUpdate]);

  const panels = useMemo(
    () => [...alertClosingReasonPanels] as BulkActionsPanelConfig[],
    [alertClosingReasonPanels]
  );

  return useMemo(() => ({ items, panels }), [items, panels]);
};
