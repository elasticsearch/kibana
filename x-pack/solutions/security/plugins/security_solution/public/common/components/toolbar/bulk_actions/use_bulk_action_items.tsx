/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo, useCallback } from 'react';
import type { EuiContextMenuPanelDescriptor, EuiIconProps } from '@elastic/eui';
import { useBulkClosingReasonItems } from '@kbn/response-ops-detections-close-reason';
import { flattenObject } from '@kbn/object-utils';
import type { AlertTableContextMenuItem } from '../../../../detections/components/alerts_table/types';
import { FILTER_ACKNOWLEDGED, FILTER_CLOSED, FILTER_OPEN } from '../../../../../common/types';
import type {
  CustomBulkActionProp,
  SetEventsDeleted,
  SetEventsLoading,
  AlertClosingReason,
} from '../../../../../common/types';
import type { TimelineItem } from '../../../../../common/search_strategy';
import * as i18n from './translations';
import { updateAlertStatus } from './update_alerts';
import { useAppToasts } from '../../../hooks/use_app_toasts';
import { useStartTransaction } from '../../../lib/apm/use_start_transaction';
import { APM_USER_INTERACTIONS } from '../../../lib/apm/constants';
import type { AlertWorkflowStatus } from '../../../types';
import type { OnUpdateAlertStatusError, OnUpdateAlertStatusSuccess } from './types';
import { useAlertCloseInfoModal } from '../../../../detections/hooks/use_alert_close_info_modal';
import { useAlertsPrivileges } from '../../../../detections/containers/detection_engine/alerts/use_alerts_privileges';
import { useRunDocumentWorkflowPanel } from '../../../../detections/components/alerts_table/timeline_actions/use_run_document_workflow_panel';

export type BulkActionMenuItem = AlertTableContextMenuItem;

/**
 * Structured groups returned alongside the flat `items` array.
 * `casesItems` and `timelineItems` are sub-partitions of custom bulk actions
 * whose producers set `groupId: 'cases'` or `groupId: 'timeline'` respectively.
 * `customItems` holds any remaining custom actions with no recognised group.
 */
export interface BulkActionGroups {
  statusItems: BulkActionMenuItem[];
  casesItems: BulkActionMenuItem[];
  timelineItems: BulkActionMenuItem[];
  customItems: BulkActionMenuItem[];
  workflowItems: BulkActionMenuItem[];
}

export const ALERT_STATUS_ACTION_IDS = {
  markAsAcknowledged: 'acknowledge',
  markAsOpen: 'open',
} as const;

/** Shared status-dot colour map — keyed on the action item `key`, not `data-test-subj`. */
export const ALERT_STATUS_ICON_COLORS: Readonly<Record<string, EuiIconProps['color']>> = {
  [ALERT_STATUS_ACTION_IDS.markAsOpen]: 'danger',
  [ALERT_STATUS_ACTION_IDS.markAsAcknowledged]: 'primary',
  'close-alert-with-reason': 'subdued',
};

export interface BulkActionsProps {
  eventIds: string[];
  currentStatus?: AlertWorkflowStatus;
  query?: string;
  setEventsLoading: SetEventsLoading;
  setEventsDeleted: SetEventsDeleted;
  showAlertStatusActions?: boolean;
  onUpdateSuccess?: OnUpdateAlertStatusSuccess;
  onUpdateFailure?: OnUpdateAlertStatusError;
  customBulkActions?: CustomBulkActionProp[];
  data?: TimelineItem[];
  closePopover?: () => void;
  showRunWorkflowActions?: boolean;
}

/**
 * Fall-through group assignment for custom actions whose producer does not set `groupId`.
 * Keyed by the stable action `key`; values match the `BulkActionGroups` partition names.
 */
const CUSTOM_ACTION_GROUP_BY_KEY: Readonly<Record<string, 'casesItems' | 'timelineItems'>> = {
  'attach-case': 'casesItems',
};

export const useBulkActionItems = ({
  eventIds,
  currentStatus,
  query,
  setEventsLoading,
  showAlertStatusActions = true,
  setEventsDeleted,
  onUpdateSuccess,
  onUpdateFailure,
  customBulkActions,
  data,
  closePopover,
  showRunWorkflowActions = true,
}: BulkActionsProps) => {
  const { addSuccess, addError, addWarning } = useAppToasts();
  const { startTransaction } = useStartTransaction();
  const { promptAlertCloseConfirmation } = useAlertCloseInfoModal();
  const { hasAlertsUpdate } = useAlertsPrivileges();

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
      if (onUpdateSuccess) {
        onUpdateSuccess(updated, conflicts, newStatus);
      }
    },
    [addSuccess, addWarning, onUpdateSuccess]
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
      if (onUpdateFailure) {
        onUpdateFailure(newStatus, error);
      }
    },
    [addError, onUpdateFailure]
  );

  const onClickUpdate = useCallback(
    async (status: AlertWorkflowStatus, reason?: AlertClosingReason) => {
      if (status === 'closed' && !(await promptAlertCloseConfirmation({ query, ids: eventIds }))) {
        return;
      }

      if (query) {
        startTransaction({ name: APM_USER_INTERACTIONS.BULK_QUERY_STATUS_UPDATE });
      } else if (eventIds.length > 1) {
        startTransaction({ name: APM_USER_INTERACTIONS.BULK_STATUS_UPDATE });
      } else {
        startTransaction({ name: APM_USER_INTERACTIONS.STATUS_UPDATE });
      }

      try {
        setEventsLoading({ eventIds, isLoading: true });
        const response = await updateAlertStatus({
          status,
          query: query && JSON.parse(query),
          signalIds: eventIds,
          reason,
        });

        // TODO: Only delete those that were successfully updated from updatedRules
        setEventsDeleted({ eventIds, isDeleted: true });

        if (response.version_conflicts && eventIds.length === 1) {
          throw new Error(i18n.BULK_ACTION_FAILED_SINGLE_ALERT);
        }

        onAlertStatusUpdateSuccess(response.updated ?? 0, response.version_conflicts ?? 0, status);
      } catch (error) {
        onAlertStatusUpdateFailure(status, error);
      } finally {
        setEventsLoading({ eventIds, isLoading: false });
      }
    },
    [
      setEventsLoading,
      eventIds,
      query,
      setEventsDeleted,
      onAlertStatusUpdateSuccess,
      onAlertStatusUpdateFailure,
      startTransaction,
      promptAlertCloseConfirmation,
    ]
  );

  const { item: alertClosingReasonItem, panels: alertClosingReasonPanels } =
    useBulkClosingReasonItems({
      isEnabled: hasAlertsUpdate ?? false,
      onSubmitCloseReason({ reason }) {
        onClickUpdate(FILTER_CLOSED as AlertWorkflowStatus, reason);
      },
    });

  const workflowDocuments = useMemo(() => {
    if (!data) return [];
    return data
      .filter((item) => eventIds.includes(item._id))
      .map((item) => {
        const flattened = flattenObject(item.ecs);
        const fields: Record<string, unknown> = {};
        for (const [field, value] of Object.entries(flattened)) {
          fields[field] = value;
        }
        return {
          _id: item._id,
          _index: item._index ?? '',
          ...fields,
        };
      });
  }, [data, eventIds]);

  const noop = useCallback(() => {}, []);
  const { runWorkflowMenuItem, runDocumentWorkflowPanel } = useRunDocumentWorkflowPanel({
    documents: workflowDocuments,
    closePopover: closePopover ?? noop,
  });

  const statusItems = useMemo<BulkActionMenuItem[]>(() => {
    const result: BulkActionMenuItem[] = [];
    if (!showAlertStatusActions || !hasAlertsUpdate) return result;
    if (currentStatus !== FILTER_OPEN) {
      result.push({
        key: ALERT_STATUS_ACTION_IDS.markAsOpen,
        'data-test-subj': 'open-alert-status',
        onClick: () => {
          closePopover?.();
          onClickUpdate(FILTER_OPEN as AlertWorkflowStatus);
        },
        name: i18n.BULK_ACTION_OPEN_SELECTED,
      });
    }
    if (currentStatus !== FILTER_ACKNOWLEDGED) {
      result.push({
        key: ALERT_STATUS_ACTION_IDS.markAsAcknowledged,
        'data-test-subj': 'acknowledged-alert-status',
        onClick: () => {
          closePopover?.();
          onClickUpdate(FILTER_ACKNOWLEDGED as AlertWorkflowStatus);
        },
        name: i18n.BULK_ACTION_ACKNOWLEDGED_SELECTED,
      });
    }
    if (currentStatus !== FILTER_CLOSED) {
      result.push({
        key: alertClosingReasonItem?.key,
        'data-test-subj': alertClosingReasonItem?.['data-test-subj'],
        name: alertClosingReasonItem?.label,
        panel: alertClosingReasonItem?.panel,
      });
    }
    return result;
  }, [
    showAlertStatusActions,
    hasAlertsUpdate,
    currentStatus,
    closePopover,
    onClickUpdate,
    alertClosingReasonItem,
  ]);

  const { casesItems, timelineItems, customItems } = useMemo(() => {
    const cases: BulkActionMenuItem[] = [];
    const timeline: BulkActionMenuItem[] = [];
    const rest: BulkActionMenuItem[] = [];
    if (customBulkActions) {
      for (const action of customBulkActions) {
        const isDisabled = !!(query && action.disableOnQuery);
        const onClick = () => {
          closePopover?.();
          action.onClick(eventIds);
        };
        const menuItem: BulkActionMenuItem = {
          key: action.key,
          disabled: isDisabled,
          'data-test-subj': action['data-test-subj'],
          icon: action.icon,
          toolTipContent: isDisabled ? action.disabledLabel : null,
          onClick,
          name: action.label,
        };
        const bucket =
          action.groupId === 'cases'
            ? cases
            : action.groupId === 'timeline'
            ? timeline
            : CUSTOM_ACTION_GROUP_BY_KEY[action.key] === 'casesItems'
            ? cases
            : CUSTOM_ACTION_GROUP_BY_KEY[action.key] === 'timelineItems'
            ? timeline
            : rest;
        bucket.push(menuItem);
      }
    }
    return { casesItems: cases, timelineItems: timeline, customItems: rest };
  }, [customBulkActions, query, closePopover, eventIds]);

  const workflowItems = useMemo<BulkActionMenuItem[]>(
    () => (showRunWorkflowActions ? runWorkflowMenuItem : []),
    [showRunWorkflowActions, runWorkflowMenuItem]
  );

  const items = useMemo<BulkActionMenuItem[]>(
    () => [...statusItems, ...casesItems, ...timelineItems, ...customItems, ...workflowItems],
    [statusItems, casesItems, timelineItems, customItems, workflowItems]
  );

  const groups = useMemo<BulkActionGroups>(
    () => ({ statusItems, casesItems, timelineItems, customItems, workflowItems }),
    [statusItems, casesItems, timelineItems, customItems, workflowItems]
  );

  const panels = useMemo(
    () =>
      [
        ...alertClosingReasonPanels.map((panel) => {
          return {
            ...panel,
            content: panel.renderContent({
              alertItems: [],
              closePopoverMenu: () => {},
              setIsBulkActionsLoading: () => {},
            }),
          };
        }),
        ...(showRunWorkflowActions ? runDocumentWorkflowPanel : []),
      ] as EuiContextMenuPanelDescriptor[],
    [alertClosingReasonPanels, runDocumentWorkflowPanel, showRunWorkflowActions]
  );

  return useMemo(() => ({ items, panels, groups }), [items, panels, groups]);
};
