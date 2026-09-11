/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiNotificationBadge, EuiToolTip } from '@elastic/eui';
import type { AppHeaderTab } from '@kbn/app-header';
import type { SloTabId } from '@kbn/deeplinks-observability';
import {
  ALERTS_TAB_ID,
  DEFINITION_TAB_ID,
  HISTORY_TAB_ID,
  OVERVIEW_TAB_ID,
} from '@kbn/deeplinks-observability';
import { i18n } from '@kbn/i18n';
import type { SLOWithSummaryResponse } from '@kbn/slo-schema';
import { paths } from '@kbn/slo-shared-plugin/common/locators/paths';
import React from 'react';
import { useFetchActiveAlerts } from '../../../hooks/use_fetch_active_alerts';
import { useKibana } from '../../../hooks/use_kibana';

interface Props {
  slo?: SLOWithSummaryResponse | null;
  isAutoRefreshing: boolean;
  selectedTabId: SloTabId;
  setSelectedTabId?: (val: SloTabId) => void;
}

export const useSloDetailsTabs = ({
  slo,
  isAutoRefreshing,
  selectedTabId,
  setSelectedTabId,
}: Props) => {
  const { data: activeAlerts } = useFetchActiveAlerts({
    sloIdsAndInstanceIds: slo ? [[slo.id, slo.instanceId]] : [],
    shouldRefetch: isAutoRefreshing,
  });

  const { basePath } = useKibana().services.http;

  const isRemote = !!slo?.remote;

  const tabs = [
    {
      id: OVERVIEW_TAB_ID,
      label: i18n.translate('xpack.slo.sloDetails.tab.overviewLabel', {
        defaultMessage: 'Overview',
      }),
      'data-test-subj': 'overviewTab',
      isSelected: selectedTabId === OVERVIEW_TAB_ID,
      ...(setSelectedTabId
        ? {
            onClick: () => setSelectedTabId(OVERVIEW_TAB_ID),
          }
        : {
            href: slo
              ? `${basePath.get()}${paths.sloDetails(
                  slo.id,
                  slo.instanceId,
                  slo.remote?.remoteName,
                  OVERVIEW_TAB_ID
                )}`
              : undefined,
          }),
    },
    {
      id: DEFINITION_TAB_ID,
      label: i18n.translate('xpack.slo.sloDetails.tab.definitionLabel', {
        defaultMessage: 'Definition',
      }),
      'data-test-subj': 'definitionTab',
      isSelected: selectedTabId === DEFINITION_TAB_ID,
      ...(setSelectedTabId
        ? {
            onClick: () => setSelectedTabId(DEFINITION_TAB_ID),
          }
        : {
            href: slo
              ? `${basePath.get()}${paths.sloDetails(
                  slo.id,
                  slo.instanceId,
                  slo.remote?.remoteName,
                  DEFINITION_TAB_ID
                )}`
              : undefined,
          }),
    },
    {
      id: HISTORY_TAB_ID,
      label: i18n.translate('xpack.slo.sloDetails.tab.historyLabel', {
        defaultMessage: 'History',
      }),
      'data-test-subj': 'historyTab',
      isSelected: selectedTabId === HISTORY_TAB_ID,
      ...(setSelectedTabId
        ? {
            onClick: () => setSelectedTabId(HISTORY_TAB_ID),
          }
        : {
            href: slo
              ? `${basePath.get()}${paths.sloDetails(
                  slo.id,
                  slo.instanceId,
                  slo.remote?.remoteName,
                  HISTORY_TAB_ID
                )}`
              : undefined,
          }),
    },
    {
      id: ALERTS_TAB_ID,
      label: isRemote ? (
        <EuiToolTip
          content={i18n.translate('xpack.slo.sloDetails.tab.alertsDisabledTooltip', {
            defaultMessage: 'Alerts are not available for remote SLOs',
          })}
          position="right"
        >
          <span tabIndex={0}>{ALERTS_LABEL}</span>
        </EuiToolTip>
      ) : (
        ALERTS_LABEL
      ),
      'data-test-subj': 'alertsTab',
      disabled: Boolean(isRemote),
      isSelected: selectedTabId === ALERTS_TAB_ID,
      append:
        slo && !isRemote ? (
          <EuiNotificationBadge className="eui-alignCenter" size="m">
            {(activeAlerts && activeAlerts.get(slo)) ?? 0}
          </EuiNotificationBadge>
        ) : null,
      ...(setSelectedTabId
        ? {
            onClick: () => setSelectedTabId(ALERTS_TAB_ID),
          }
        : {
            href: slo
              ? `${basePath.get()}${paths.sloDetails(
                  slo.id,
                  slo.instanceId,
                  slo.remote?.remoteName,
                  ALERTS_TAB_ID
                )}`
              : undefined,
          }),
    },
  ];

  const alertsTooltip = i18n.translate('xpack.slo.sloDetails.tab.alertsDisabledTooltip', {
    defaultMessage: 'Alerts are not available for remote SLOs',
  });

  const tabNavigation = (tabId: SloTabId) =>
    setSelectedTabId
      ? { onClick: () => setSelectedTabId(tabId) }
      : {
          href: slo
            ? `${basePath.get()}${paths.sloDetails(
                slo.id,
                slo.instanceId,
                slo.remote?.remoteName,
                tabId
              )}`
            : undefined,
        };

  const appHeaderTabs: AppHeaderTab[] = [
    {
      id: OVERVIEW_TAB_ID,
      label: i18n.translate('xpack.slo.sloDetails.tab.overviewLabel', {
        defaultMessage: 'Overview',
      }),
      'data-test-subj': 'overviewTab',
      isSelected: selectedTabId === OVERVIEW_TAB_ID,
      ...tabNavigation(OVERVIEW_TAB_ID),
    },
    {
      id: DEFINITION_TAB_ID,
      label: i18n.translate('xpack.slo.sloDetails.tab.definitionLabel', {
        defaultMessage: 'Definition',
      }),
      'data-test-subj': 'definitionTab',
      isSelected: selectedTabId === DEFINITION_TAB_ID,
      ...tabNavigation(DEFINITION_TAB_ID),
    },
    {
      id: HISTORY_TAB_ID,
      label: i18n.translate('xpack.slo.sloDetails.tab.historyLabel', {
        defaultMessage: 'History',
      }),
      'data-test-subj': 'historyTab',
      isSelected: selectedTabId === HISTORY_TAB_ID,
      ...tabNavigation(HISTORY_TAB_ID),
    },
    {
      id: ALERTS_TAB_ID,
      label: ALERTS_LABEL,
      'data-test-subj': 'alertsTab',
      disabled: Boolean(isRemote),
      isSelected: selectedTabId === ALERTS_TAB_ID,
      toolTipContent: isRemote ? alertsTooltip : undefined,
      badge: slo && !isRemote ? activeAlerts?.get(slo) ?? 0 : undefined,
      ...tabNavigation(ALERTS_TAB_ID),
    },
  ];

  return { tabs, appHeaderTabs };
};

const ALERTS_LABEL = i18n.translate('xpack.slo.sloDetails.tab.alertsLabel', {
  defaultMessage: 'Alerts',
});
