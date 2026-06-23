/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import { css } from '@emotion/react';
import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiText, useEuiTheme } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { SectionPanel } from '../../../flyout_v2/attack/main/components/section_panel';
import { useOriginalAlertIds } from '../hooks/use_original_alert_ids';
import { useNavigateToAttackDetailsLeftPanel } from '../hooks/use_navigate_to_attack_details_left_panel';
import { CORRELATION_TAB_ID } from '../constants/left_panel_paths';
import { INSIGHTS_CORRELATIONS_TEST_ID } from '../constants/test_ids';

/**
 * Correlation section under Insights section in the Attack Details overview tab.
 * Renders related alerts count with a link to open the left panel Correlation tab.
 */
export const CorrelationsOverview: React.FC = memo(() => {
  const { euiTheme } = useEuiTheme();
  const originalAlertIds = useOriginalAlertIds();
  const relatedAlertsCount = originalAlertIds.length;
  const navigateToLeftPanel = useNavigateToAttackDetailsLeftPanel({
    subTab: CORRELATION_TAB_ID,
  });

  const link = useMemo(
    () => ({
      callback: navigateToLeftPanel,
      tooltip: (
        <FormattedMessage
          id="xpack.securitySolution.attackDetailsFlyout.overview.insights.correlationTooltip"
          defaultMessage="Show related alerts"
        />
      ),
    }),
    [navigateToLeftPanel]
  );

  return (
    <SectionPanel
      data-test-subj={INSIGHTS_CORRELATIONS_TEST_ID}
      title={
        <FormattedMessage
          id="xpack.securitySolution.attackDetailsFlyout.overview.insights.correlationTitle"
          defaultMessage="Correlation"
        />
      }
      highlightTitle
      link={link}
      linkIconType="arrowStart"
    >
      <EuiFlexGroup
        direction="column"
        gutterSize="m"
        responsive={false}
        css={css`
          padding: ${euiTheme.size.m} ${euiTheme.size.base};
        `}
      >
        <EuiFlexItem>
          <EuiFlexGroup
            alignItems="center"
            justifyContent="spaceBetween"
            gutterSize="s"
            responsive={false}
          >
            <EuiFlexItem grow={false}>
              <EuiText size="s">
                <FormattedMessage
                  id="xpack.securitySolution.attackDetailsFlyout.overview.insights.relatedAlerts"
                  defaultMessage="Related alerts"
                />
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{relatedAlertsCount}</EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </SectionPanel>
  );
});

CorrelationsOverview.displayName = 'CorrelationsOverview';
