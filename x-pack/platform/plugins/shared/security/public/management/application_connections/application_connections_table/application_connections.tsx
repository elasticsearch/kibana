/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UseEuiTheme } from '@elastic/eui';
import { EuiButton, EuiCallOut } from '@elastic/eui';
import { css } from '@emotion/react';
import React from 'react';

import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';

import { ApplicationConnectionsTable } from './application_connections_table';
import { labels } from '../constants/i18n';
import { useNavigation } from '../hooks/use_navigation';

const headerStyles = ({ euiTheme }: UseEuiTheme) => css`
  background-color: ${euiTheme.colors.backgroundBasePlain};
  border-style: none;
`;

const callOutStyles = ({ euiTheme }: UseEuiTheme) => css`
  margin-block: ${euiTheme.size.m};
`;

export const ApplicationConnections = () => {
  const { mcpClientsListUrl } = useNavigation();
  return (
    <>
      <KibanaPageTemplate.Header
        css={headerStyles}
        pageTitle={labels.page.title}
        rightSideItems={[
          <EuiButton
            color="text"
            iconType="gear"
            href={mcpClientsListUrl}
            data-test-subj="applicationConnectionsManageClientsLink"
          >
            {labels.page.manageClientsLink}
          </EuiButton>,
        ]}
      />
      <KibanaPageTemplate.Section paddingSize="none">
        <EuiCallOut size="s" title={labels.page.pageCallout} iconType="info" css={callOutStyles} />
        <ApplicationConnectionsTable />
      </KibanaPageTemplate.Section>
    </>
  );
};
