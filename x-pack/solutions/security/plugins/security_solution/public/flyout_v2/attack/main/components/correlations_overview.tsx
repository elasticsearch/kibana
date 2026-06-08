/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { css } from '@emotion/react';
import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiText, useEuiTheme } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { AttackDiscoveryAlert } from '@kbn/elastic-assistant-common';
import { SectionPanel } from './section_panel';
import { INSIGHTS_CORRELATIONS_TEST_ID } from '../constants/test_ids';

export interface CorrelationsOverviewProps {
  attack: AttackDiscoveryAlert;
}

/**
 * Prop-driven Correlation section for the attack flyout v2.
 * Renders related alerts count. 'See all' is a no-op until v2 left panel is available.
 */
export const CorrelationsOverview: React.FC<CorrelationsOverviewProps> = memo(({ attack }) => {
  const { euiTheme } = useEuiTheme();
  const relatedAlertsCount = attack.alertIds.length;

  // TODO: open left panel when v2 left panel is available
  const link = undefined;

  return (
    <SectionPanel
      data-test-subj={INSIGHTS_CORRELATIONS_TEST_ID}
      title={
        <FormattedMessage
          id="xpack.securitySolution.flyoutV2.attack.overview.insights.correlationTitle"
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
                  id="xpack.securitySolution.flyoutV2.attack.overview.insights.relatedAlerts"
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
