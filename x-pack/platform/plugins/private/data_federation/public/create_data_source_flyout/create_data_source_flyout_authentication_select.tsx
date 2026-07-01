/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIcon,
  EuiLink,
  EuiSelect,
  EuiSpacer,
  EuiTitle,
} from '@elastic/eui';

import type { DataSourceType } from '../../common/datasource_types';
import {
  createDataSourceFlyoutAuthenticationHelpAriaLabel,
  createDataSourceFlyoutAuthenticationLabel,
  createDataSourceFlyoutAuthenticationTitle,
  DATA_SOURCE_TYPES_WITH_AUTHENTICATION,
  getCreateDataSourceAuthenticationOptions,
  type CreateDataSourceAuthenticationMode,
} from './create_data_source_flyout_authentication';

const CLOUD_SECURITY_DOCS_URL = 'https://www.elastic.co/docs/solutions/security/cloud';

export function CreateDataSourceFlyoutAuthenticationSelect({
  dataSourceType,
  authenticationMode,
  enableFederatedIdentity,
  onAuthenticationModeChange,
}: {
  dataSourceType: DataSourceType;
  authenticationMode: CreateDataSourceAuthenticationMode;
  enableFederatedIdentity?: boolean;
  onAuthenticationModeChange: (mode: CreateDataSourceAuthenticationMode) => void;
}) {
  const options = useMemo(
    () => getCreateDataSourceAuthenticationOptions(dataSourceType, { enableFederatedIdentity }),
    [dataSourceType, enableFederatedIdentity]
  );

  if (!DATA_SOURCE_TYPES_WITH_AUTHENTICATION.has(dataSourceType)) {
    return null;
  }

  return (
    <>
      <EuiSpacer size="m" />
      <EuiFlexGroup responsive={false} alignItems="center" justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{createDataSourceFlyoutAuthenticationTitle()}</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiLink
            href={CLOUD_SECURITY_DOCS_URL}
            target="_blank"
            external={false}
            rel="noopener noreferrer"
            aria-label={createDataSourceFlyoutAuthenticationHelpAriaLabel()}
            data-test-subj="createDataSourceFlyoutAuthenticationHelpLink"
          >
            <EuiIcon type="question" aria-hidden={true} />
          </EuiLink>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiFormRow label={createDataSourceFlyoutAuthenticationLabel()} fullWidth>
        <EuiSelect
          data-test-subj="createDataSourceFlyoutAuthentication"
          fullWidth
          options={options}
          value={authenticationMode}
          onChange={(e) =>
            onAuthenticationModeChange(e.target.value as CreateDataSourceAuthenticationMode)
          }
        />
      </EuiFormRow>
    </>
  );
}
