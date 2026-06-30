/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { css } from '@emotion/react';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiText, EuiTitle, useEuiTheme } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { DistributionBar } from '@kbn/security-solution-distribution-bar';
import { i18n } from '@kbn/i18n';
import { useGetMisconfigurationStatusColor } from '@kbn/cloud-security-posture';
import { MISCONFIGURATION_STATUS } from '@kbn/cloud-security-posture-common';
import { METRIC_TYPE } from '@kbn/analytics';
import {
  ENTITY_FLYOUT_WITH_MISCONFIGURATION_VISIT,
  uiMetricService,
} from '@kbn/cloud-security-posture-common/utils/ui_metrics';
import { ExpandablePanel } from '../../../flyout_v2/shared/components/expandable_panel';
import type { EntityDetailsPath } from '../../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import {
  CspInsightLeftPanelSubTab,
  EntityDetailsLeftPanelTab,
} from '../../../flyout/entity_details/shared/components/left_panel/left_panel_header';

interface MisconfigurationPreviewDistributionBarProps {
  key: string;
  count: number;
  color: string;
}

export const useGetFindingsStats = (passedFindingsStats: number, failedFindingsStats: number) => {
  const { getMisconfigurationStatusColor } = useGetMisconfigurationStatusColor();

  return useMemo(() => {
    const misconfigurationStats: MisconfigurationPreviewDistributionBarProps[] = [];
    if (passedFindingsStats === 0 && failedFindingsStats === 0) return [];
    if (passedFindingsStats > 0) {
      misconfigurationStats.push({
        key: i18n.translate(
          'xpack.securitySolution.flyout.right.insights.misconfigurations.passedFindingsText',
          {
            defaultMessage: '{count, plural, one {Passed finding} other {Passed findings}}',
            values: { count: passedFindingsStats },
          }
        ),
        count: passedFindingsStats,
        color: getMisconfigurationStatusColor(MISCONFIGURATION_STATUS.PASSED),
      });
    }
    if (failedFindingsStats > 0) {
      misconfigurationStats.push({
        key: i18n.translate(
          'xpack.securitySolution.flyout.right.insights.misconfigurations.failedFindingsText',
          {
            defaultMessage: '{count, plural, one {Failed finding} other {Failed findings}}',
            values: { count: failedFindingsStats },
          }
        ),
        count: failedFindingsStats,
        color: getMisconfigurationStatusColor(MISCONFIGURATION_STATUS.FAILED),
      });
    }
    return misconfigurationStats;
  }, [passedFindingsStats, failedFindingsStats, getMisconfigurationStatusColor]);
};

const MisconfigurationPreviewScore = ({
  passedFindings,
  failedFindings,
}: {
  passedFindings: number;
  failedFindings: number;
}) => {
  const { euiTheme } = useEuiTheme();

  return (
    <EuiFlexItem>
      <EuiFlexGroup direction="column" gutterSize="none">
        <EuiFlexItem>
          <EuiTitle size="s">
            <h3>{`${Math.round((passedFindings / (passedFindings + failedFindings)) * 100)}%`}</h3>
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
              id="xpack.securitySolution.flyout.right.insights.misconfigurations.postureScoreDescription"
              defaultMessage="Posture score"
            />
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
  );
};

export const MisconfigurationsPreview = ({
  isPreviewMode,
  openDetailsPanel,
  passedFindings,
  failedFindings,
  hideHeaderIcons,
}: {
  isPreviewMode: boolean;
  passedFindings: number;
  failedFindings: number;
  openDetailsPanel: (path: EntityDetailsPath) => void;
  hideHeaderIcons?: boolean;
}) => {
  const findingsStats = useGetFindingsStats(passedFindings, failedFindings);

  useEffect(() => {
    uiMetricService.trackUiMetric(METRIC_TYPE.CLICK, ENTITY_FLYOUT_WITH_MISCONFIGURATION_VISIT);
  }, []);
  const { euiTheme } = useEuiTheme();

  const goToEntityInsightTab = useCallback(
    () =>
      openDetailsPanel({
        tab: EntityDetailsLeftPanelTab.CSP_INSIGHTS,
        subTab: CspInsightLeftPanelSubTab.MISCONFIGURATIONS,
      }),
    [openDetailsPanel]
  );

  const link = useMemo(
    () => ({
      callback: goToEntityInsightTab,
      tooltip: (
        <FormattedMessage
          id="xpack.securitySolution.flyout.right.insights.misconfiguration.misconfigurationTooltip"
          defaultMessage="Show all misconfiguration findings"
        />
      ),
    }),
    [goToEntityInsightTab]
  );
  return (
    <ExpandablePanel
      header={{
        iconType: !isPreviewMode && !hideHeaderIcons ? 'chevronLimitLeft' : '',
        title: (
          <EuiTitle
            css={css`
              font-weight: ${euiTheme.font.weight.semiBold};
            `}
            data-test-subj={'securitySolutionFlyoutInsightsMisconfigurationsTitleText'}
          >
            <FormattedMessage
              id="xpack.securitySolution.flyout.right.insights.misconfigurations.misconfigurationsTitle"
              defaultMessage="Misconfigurations"
            />
          </EuiTitle>
        ),
        link,
      }}
      data-test-subj={'securitySolutionFlyoutInsightsMisconfigurations'}
    >
      <EuiFlexGroup gutterSize="none">
        <MisconfigurationPreviewScore
          passedFindings={passedFindings}
          failedFindings={failedFindings}
        />

        <EuiFlexItem grow={2}>
          <EuiFlexGroup direction="column" gutterSize="none">
            <EuiFlexItem />
            <EuiFlexItem>
              <EuiSpacer />
              <DistributionBar stats={findingsStats} />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </ExpandablePanel>
  );
};
