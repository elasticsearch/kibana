/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { union } from 'lodash';

import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { ALERT_WORKFLOW_ASSIGNEE_IDS } from '@kbn/rule-data-utils';
import type {
  BulkActionsConfig,
  RenderContentPanelProps,
} from '@kbn/response-ops-alerts-table/types';

import { isEmpty } from 'lodash/fp';
import { useLicense } from '../../../hooks/use_license';
import { useAlertsPrivileges } from '../../../../detections/containers/detection_engine/alerts/use_alerts_privileges';
import { ASSIGNEES_PANEL_WIDTH } from '../../assignees/constants';
import type { BulkAlertAssigneesPanelComponentProps } from './alert_bulk_assignees';
import { BulkAlertAssigneesPanel } from './alert_bulk_assignees';
import * as i18n from './translations';
import { useSetAlertAssignees } from './use_set_alert_assignees';

export const ALERT_ASSIGNEE_ACTION_IDS = {
  assign: 'manage-alert-assignees',
  unassignAll: 'remove-all-alert-assignees',
} as const;

export interface UseBulkAlertAssigneesItemsProps {
  onAssigneesUpdate?: () => void;
  alertAssignments?: string[];
}

export interface UseBulkAlertAssigneesPanel {
  id: number;
  title: JSX.Element;
  'data-test-subj': string;
  renderContent: (props: RenderContentPanelProps) => JSX.Element;
  width?: number;
}

export const useBulkAlertAssigneesItems = ({
  onAssigneesUpdate,
  alertAssignments,
}: UseBulkAlertAssigneesItemsProps) => {
  const isPlatinumPlus = useLicense().isPlatinumPlus();

  const { hasAlertsUpdate } = useAlertsPrivileges();
  const setAlertAssignees = useSetAlertAssignees();

  const handleOnAlertAssigneesSubmit = useCallback<
    BulkAlertAssigneesPanelComponentProps['onSubmit']
  >(
    async (assignees, ids, onSuccess, setIsLoading) => {
      if (setAlertAssignees) {
        await setAlertAssignees(assignees, ids, onSuccess, setIsLoading);
      }
    },
    [setAlertAssignees]
  );

  const onSuccess = useCallback(() => {
    onAssigneesUpdate?.();
  }, [onAssigneesUpdate]);

  const onRemoveAllAssignees = useCallback<Required<BulkActionsConfig>['onClick']>(
    async (items, _, setAlertLoading) => {
      const ids: string[] = items.map((item) => item._id);
      const assignedUserIds = union(
        ...items.map(
          (item) =>
            item.data.find((data) => data.field === ALERT_WORKFLOW_ASSIGNEE_IDS)?.value ?? []
        )
      );
      if (!assignedUserIds.length) {
        return;
      }
      const assignees = {
        add: [],
        remove: assignedUserIds,
      };
      if (setAlertAssignees) {
        await setAlertAssignees(assignees, ids, onSuccess, setAlertLoading);
      }
    },
    [onSuccess, setAlertAssignees]
  );

  const alertAssigneesItems = useMemo(
    () =>
      hasAlertsUpdate && isPlatinumPlus
        ? [
            {
              key: ALERT_ASSIGNEE_ACTION_IDS.assign,
              'data-test-subj': 'alert-assignees-context-menu-item',
              name: i18n.ALERT_ASSIGNEES_CONTEXT_MENU_ITEM_TITLE,
              panel: 2,
              label: i18n.ALERT_ASSIGNEES_CONTEXT_MENU_ITEM_TITLE,
              disableOnQuery: true,
              disable: false,
              icon: 'users' as const,
              groupId: 'assignees' as const,
            },
            {
              key: ALERT_ASSIGNEE_ACTION_IDS.unassignAll,
              'data-test-subj': 'remove-alert-assignees-menu-item',
              name: i18n.REMOVE_ALERT_ASSIGNEES_CONTEXT_MENU_TITLE,
              label: i18n.REMOVE_ALERT_ASSIGNEES_CONTEXT_MENU_TITLE,
              disableOnQuery: true,
              onClick: onRemoveAllAssignees,
              disable: alertAssignments ? isEmpty(alertAssignments) : false,
              icon: 'users' as const,
              groupId: 'assignees' as const,
            },
          ]
        : [],
    [alertAssignments, hasAlertsUpdate, isPlatinumPlus, onRemoveAllAssignees]
  );

  const TitleContent = useMemo(
    () => (
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>{i18n.ALERT_ASSIGNEES_CONTEXT_MENU_ITEM_TITLE}</EuiFlexItem>
      </EuiFlexGroup>
    ),
    []
  );

  const renderContent = useCallback(
    ({
      alertItems,
      refresh,
      setIsBulkActionsLoading,
      clearSelection,
      closePopoverMenu,
    }: RenderContentPanelProps) => (
      <BulkAlertAssigneesPanel
        alertItems={alertItems}
        refresh={() => {
          onSuccess();
          refresh?.();
        }}
        setIsLoading={setIsBulkActionsLoading}
        clearSelection={clearSelection}
        closePopoverMenu={closePopoverMenu}
        onSubmit={handleOnAlertAssigneesSubmit}
      />
    ),
    [handleOnAlertAssigneesSubmit, onSuccess]
  );

  const alertAssigneesPanels: UseBulkAlertAssigneesPanel[] = useMemo(
    () =>
      hasAlertsUpdate && isPlatinumPlus
        ? [
            {
              id: 2,
              title: TitleContent,
              'data-test-subj': 'alert-assignees-context-menu-panel',
              renderContent,
              width: ASSIGNEES_PANEL_WIDTH,
            },
          ]
        : [],
    [TitleContent, hasAlertsUpdate, isPlatinumPlus, renderContent]
  );

  return useMemo(() => {
    return {
      alertAssigneesItems,
      alertAssigneesPanels,
    };
  }, [alertAssigneesItems, alertAssigneesPanels]);
};
