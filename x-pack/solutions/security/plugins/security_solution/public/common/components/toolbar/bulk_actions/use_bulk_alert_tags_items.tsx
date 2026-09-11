/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiIconTip, EuiFlexItem } from '@elastic/eui';
import React, { useCallback, useMemo } from 'react';
import type { RenderContentPanelProps } from '@kbn/response-ops-alerts-table/types';
import { useAlertsPrivileges } from '../../../../detections/containers/detection_engine/alerts/use_alerts_privileges';
import type { BulkAlertTagsPanelComponentProps } from './alert_bulk_tags';
import { BulkAlertTagsPanel } from './alert_bulk_tags';
import * as i18n from './translations';
import { useSetAlertTags } from './use_set_alert_tags';

export const ALERT_TAG_ACTION_ID = 'manage-alert-tags';

export interface UseBulkAlertTagsItemsProps {
  refetch?: () => void;
}

export interface UseBulkAlertTagsPanel {
  id: number;
  title: JSX.Element;
  'data-test-subj': string;
  renderContent: (props: RenderContentPanelProps) => JSX.Element;
}

export const useBulkAlertTagsItems = ({ refetch }: UseBulkAlertTagsItemsProps) => {
  const { hasAlertsUpdate } = useAlertsPrivileges();
  const setAlertTags = useSetAlertTags();
  const handleOnAlertTagsSubmit = useCallback<BulkAlertTagsPanelComponentProps['onSubmit']>(
    async (tags, ids, onSuccess, setIsLoading) => {
      if (setAlertTags) {
        await setAlertTags(tags, ids, onSuccess, setIsLoading);
      }
    },
    [setAlertTags]
  );

  const alertTagsItems = useMemo(
    () =>
      hasAlertsUpdate
        ? [
            {
              key: ALERT_TAG_ACTION_ID,
              'data-test-subj': 'alert-tags-context-menu-item',
              name: i18n.ALERT_TAGS_CONTEXT_MENU_ITEM_TITLE,
              panel: 1,
              label: i18n.ALERT_TAGS_CONTEXT_MENU_ITEM_TITLE,
              disableOnQuery: true,
              icon: 'tag' as const,
              groupId: 'tags' as const,
            },
          ]
        : [],
    [hasAlertsUpdate]
  );

  const TitleContent = useMemo(
    () => (
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>{i18n.ALERT_TAGS_CONTEXT_MENU_ITEM_TITLE}</EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiIconTip content={i18n.ALERT_TAGS_CONTEXT_MENU_ITEM_TOOLTIP_INFO} position="right" />
        </EuiFlexItem>
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
      <BulkAlertTagsPanel
        alertItems={alertItems}
        refresh={refresh}
        refetchQuery={refetch}
        setIsLoading={setIsBulkActionsLoading}
        clearSelection={clearSelection}
        closePopoverMenu={closePopoverMenu}
        onSubmit={handleOnAlertTagsSubmit}
      />
    ),
    [handleOnAlertTagsSubmit, refetch]
  );

  const alertTagsPanels: UseBulkAlertTagsPanel[] = useMemo(
    () =>
      hasAlertsUpdate
        ? [
            {
              id: 1,
              title: TitleContent,
              'data-test-subj': 'alert-tags-context-menu-panel',
              renderContent,
            },
          ]
        : [],
    [TitleContent, hasAlertsUpdate, renderContent]
  );

  return useMemo(() => {
    return {
      alertTagsItems,
      alertTagsPanels,
    };
  }, [alertTagsItems, alertTagsPanels]);
};
