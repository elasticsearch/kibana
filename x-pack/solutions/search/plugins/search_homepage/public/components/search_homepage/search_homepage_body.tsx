/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { EuiFlexGroup, EuiFlexItem, EuiHorizontalRule, EuiSpacer, useEuiTheme } from '@elastic/eui';

import { css } from '@emotion/react';
import { MetricPanels } from './metric_panels';
import { CloudResources } from './cloud_resources';
import { BodyLinks } from './body_links';
import { useAuthenticatedUser } from '../../hooks/use_authenticated_user';
import { useKibana } from '../../hooks/use_kibana';
import { GettingStartedBanner } from './getting_started_banner';

export const SearchHomepageBody = () => {
  const { euiTheme } = useEuiTheme();
  const {
    services: { cloud },
  } = useKibana();
  const { isAdmin, isBillingAdmin } = useAuthenticatedUser();
  return (
    <KibanaPageTemplate.Section
      alignment="top"
      restrictWidth={true}
      grow
      paddingSize="none"
      css={css({ padding: `0 ${euiTheme.size.l}` })}
    >
      <EuiFlexGroup gutterSize="l" direction="column">
        <MetricPanels />
        {cloud?.isCloudEnabled && (!isAdmin || !isBillingAdmin) ? null : (
          <EuiFlexItem>
            <EuiSpacer size="l" />
            <CloudResources />
          </EuiFlexItem>
        )}
        <EuiFlexItem>
          <EuiSpacer size="l" />
          <GettingStartedBanner />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiHorizontalRule margin="xxl" />
        </EuiFlexItem>
        <EuiFlexItem>
          <BodyLinks />
          <EuiSpacer size="xl" />
        </EuiFlexItem>
      </EuiFlexGroup>
    </KibanaPageTemplate.Section>
  );
};
