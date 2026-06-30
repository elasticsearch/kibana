/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { css } from '@emotion/react';
import { capitalize } from 'lodash';
import type { EuiThemeComputed } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiText, EuiTitle, useEuiTheme } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { DistributionBar } from '@kbn/security-solution-distribution-bar';
import { getAbbreviatedNumber } from '@kbn/cloud-security-posture-common';
import type {
  AlertsByStatus,
  ParsedAlertsData,
} from '../../../overview/components/detection_response/alerts_by_status/types';
import { ExpandablePanel } from '../../../flyout_v2/shared/components/expandable_panel';
import { getSeverityColor } from '../../../detections/components/alerts_kpis/severity_level_panel/helpers';
import type { EntityDetailsPath } from '../../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import {
  CspInsightLeftPanelSubTab,
  EntityDetailsLeftPanelTab,
} from '../../../flyout/entity_details/shared/components/left_panel/left_panel_header';

const AlertsCount = ({
  alertsTotal,
  euiTheme,
}: {
  alertsTotal: number;
  euiTheme: EuiThemeComputed<{}>;
}) => {
  return (
    <EuiFlexItem>
      <EuiFlexGroup direction="column" gutterSize="none">
        <EuiFlexItem>
          <EuiTitle size="s">
            <h3 data-test-subj={'securitySolutionFlyoutInsightsAlertsCount'}>
              {getAbbreviatedNumber(alertsTotal)}
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText
            size="xs"
            css={css`
              font-weight: ${euiTheme.font.weight.semiBold};
            `}
          >
            <FormattedMessage
              id="xpack.securitySolution.flyout.right.insights.alerts.alertsCountDescription"
              defaultMessage="Alerts"
            />
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
  );
};

export const AlertsPreview = ({
  alertsData,
  isPreviewMode,
  openDetailsPanel,
  hideHeaderIcons,
}: {
  alertsData: ParsedAlertsData;
  isPreviewMode: boolean;
  openDetailsPanel: (path: EntityDetailsPath) => void;
  hideHeaderIcons?: boolean;
}) => {
  const { euiTheme } = useEuiTheme();

  const severityMap = new Map<string, number>();
  const severityRank: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  (Object.keys(alertsData || {}) as AlertsByStatus[]).forEach((status) => {
    if (alertsData?.[status]?.severities) {
      alertsData?.[status]?.severities.forEach((severity) => {
        const currentSeverity = severityMap.get(severity.key) || 0;
        severityMap.set(severity.key, currentSeverity + severity.value);
      });
    }
  });

  const alertStats = Array.from(severityMap, ([key, count]: [string, number]) => ({
    key: capitalize(key),
    count,
    color: getSeverityColor(key, euiTheme),
    sort: severityRank[key.toLowerCase()] || 0,
  })).sort((a, b) => b.sort - a.sort);

  const totalAlertsCount = alertStats.reduce((total, item) => total + item.count, 0);

  const hasNonClosedAlerts = totalAlertsCount > 0;

  const goToEntityInsightTab = useCallback(
    () =>
      openDetailsPanel({
        tab: EntityDetailsLeftPanelTab.CSP_INSIGHTS,
        subTab: CspInsightLeftPanelSubTab.ALERTS,
      }),
    [openDetailsPanel]
  );

  const link = useMemo(
    () => ({
      callback: goToEntityInsightTab,
      tooltip: (
        <FormattedMessage
          id="xpack.securitySolution.flyout.right.insights.alerts.alertsTooltip"
          defaultMessage="Show all alerts"
        />
      ),
    }),
    [goToEntityInsightTab]
  );
  return (
    <ExpandablePanel
      header={{
        iconType:
          !isPreviewMode && !hideHeaderIcons && hasNonClosedAlerts ? 'chevronLimitLeft' : '',
        title: (
          <EuiText
            size="xs"
            css={{
              fontWeight: euiTheme.font.weight.bold,
            }}
          >
            <FormattedMessage
              id="xpack.securitySolution.flyout.right.insights.alerts.alertsTitle"
              defaultMessage="Alerts"
            />
          </EuiText>
        ),
        link: totalAlertsCount > 0 ? link : undefined,
      }}
      data-test-subj={'securitySolutionFlyoutInsightsAlerts'}
    >
      <EuiFlexGroup gutterSize="none">
        <AlertsCount alertsTotal={totalAlertsCount} euiTheme={euiTheme} />
        <EuiFlexItem grow={2}>
          <EuiFlexGroup direction="column" gutterSize="none">
            <EuiFlexItem />
            <EuiFlexItem>
              <EuiSpacer />
              <DistributionBar
                stats={alertStats}
                data-test-subj="AlertsPreviewDistributionBarTestId"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </ExpandablePanel>
  );
};
