/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import { css } from '@emotion/react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSkeletonText,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { SectionPanel } from '../../../flyout_v2/attack/main/components/section_panel';
import { useNavigateToAttackDetailsLeftPanel } from '../hooks/use_navigate_to_attack_details_left_panel';
import { useAttackEntitiesCounts } from '../hooks/use_attack_entities_counts';
import { INSIGHTS_ENTITIES_TEST_ID } from '../constants/test_ids';

/**
 * Entities section under Insights section in the Attack Details overview tab.
 * Renders related users and related hosts counts with a link to open the left panel for full insights.
 */
export const EntitiesOverview: React.FC = memo(() => {
  const { euiTheme } = useEuiTheme();
  const navigateToLeftPanel = useNavigateToAttackDetailsLeftPanel();
  const { relatedUsers, relatedHosts, loading } = useAttackEntitiesCounts();

  const link = useMemo(
    () => ({
      callback: navigateToLeftPanel,
      tooltip: (
        <FormattedMessage
          id="xpack.securitySolution.attackDetailsFlyout.overview.insights.entitiesTooltip"
          defaultMessage="Show all entities"
        />
      ),
    }),
    [navigateToLeftPanel]
  );

  return (
    <SectionPanel
      data-test-subj={INSIGHTS_ENTITIES_TEST_ID}
      title={
        <FormattedMessage
          id="xpack.securitySolution.attackDetailsFlyout.overview.insights.entitiesTitle"
          defaultMessage="Entities"
        />
      }
      highlightTitle
      link={link}
      linkIconType="chevronLimitLeft"
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
                  id="xpack.securitySolution.attackDetailsFlyout.overview.insights.relatedUsers"
                  defaultMessage="Related users"
                />
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              {loading ? (
                <EuiSkeletonText lines={1} size="xs" />
              ) : (
                <EuiBadge color="hollow">{relatedUsers}</EuiBadge>
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
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
                  id="xpack.securitySolution.attackDetailsFlyout.overview.insights.relatedHosts"
                  defaultMessage="Related hosts"
                />
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              {loading ? (
                <EuiSkeletonText lines={1} size="xs" />
              ) : (
                <EuiBadge color="hollow">{relatedHosts}</EuiBadge>
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </SectionPanel>
  );
});

EntitiesOverview.displayName = 'EntitiesOverview';
