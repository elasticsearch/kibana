/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import type { AppHeaderBadge } from '@kbn/app-header';
import { AgentIcon } from '@kbn/custom-icons';
import { i18n } from '@kbn/i18n';
import type { DataSchemaFormat } from '@kbn/metrics-data-access-plugin/common';
import { PageTitleWithPopover } from './page_title_with_popover';

export const HostHeaderTitle = ({
  title,
  schema,
  includeTitle = true,
}: {
  title?: string;
  schema?: DataSchemaFormat | null;
  includeTitle?: boolean;
}) => {
  return schema === 'semconv' ? (
    <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
      {includeTitle ? <EuiFlexItem grow={false}>{title}</EuiFlexItem> : null}
      <EuiFlexItem grow={false}>
        <AgentIcon agentName="opentelemetry" role="presentation" />
      </EuiFlexItem>
    </EuiFlexGroup>
  ) : (
    <PageTitleWithPopover name={title ?? ''} includeTitle={includeTitle} />
  );
};

/**
 * Host title extras (OTel icon, APM popover) as AppHeader badges next to the title.
 */
export const getHostHeaderBadges = ({
  title,
  schema,
}: {
  title?: string;
  schema?: DataSchemaFormat | null;
}): AppHeaderBadge[] => [
  {
    label: i18n.translate('xpack.infra.assetDetails.header.hostTitleExtrasBadgeLabel', {
      defaultMessage: 'Host details',
    }),
    renderCustomBadge: () => <HostHeaderTitle title={title} schema={schema} includeTitle={false} />,
  },
];
