/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
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
import type { AttackDiscoveryAlert } from '@kbn/elastic-assistant-common';
import { SectionPanel } from './section_panel';
import { useAttackEntitiesCounts } from '../hooks/use_attack_entities_counts';
import { INSIGHTS_ENTITIES_TEST_ID } from '../constants/test_ids';

export interface EntitiesOverviewProps {
  attack: AttackDiscoveryAlert;
}

/**
 * Prop-driven Entities section for the attack flyout v2.
 * Renders related users and related hosts counts. 'See all' is a no-op until v2 left panel is available.
 */
export const EntitiesOverview: React.FC<EntitiesOverviewProps> = memo(({ attack }) => {
  const { euiTheme } = useEuiTheme();
  const { relatedUsers, relatedHosts, loading } = useAttackEntitiesCounts(attack.alertIds);

  // TODO: open left panel when v2 left panel is available
  const link = undefined;

  return (
    <SectionPanel
      data-test-subj={INSIGHTS_ENTITIES_TEST_ID}
      title={
        <FormattedMessage
          id="xpack.securitySolution.flyoutV2.attack.overview.insights.entitiesTitle"
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
                  id="xpack.securitySolution.flyoutV2.attack.overview.insights.relatedUsers"
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
                  id="xpack.securitySolution.flyoutV2.attack.overview.insights.relatedHosts"
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
