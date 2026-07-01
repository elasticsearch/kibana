/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import ReactDOM from 'react-dom';
import type { CoreStart } from '@kbn/core/public';
import type { ManagementAppMountParams } from '@kbn/management-plugin/public';
import { Router } from '@kbn/shared-ux-router';

import { Main } from './main';
import type { FederatedIdentityClusterInfo } from './create_data_source_flyout/federated_identity_cluster_info';

export interface FederatedDataFeatureFlags {
  enableFederatedIdentityAuth?: boolean;
  enableGoogleCloudStorageDataSourceType?: boolean;
  enableAzureDataSourceType?: boolean;
}

export const mountManagementSection = (
  coreStart: CoreStart,
  { element, history }: ManagementAppMountParams,
  {
    cloudInfo,
    isCloudEnabled = false,
    featureFlags: {
      enableFederatedIdentityAuth: enableFederatedIdentityAuthConfig = false,
      enableGoogleCloudStorageDataSourceType = false,
      enableAzureDataSourceType = false,
    } = {},
  }: {
    cloudInfo?: FederatedIdentityClusterInfo;
    isCloudEnabled?: boolean;
    featureFlags?: FederatedDataFeatureFlags;
  }
) => {
  const enableFederatedIdentityAuth = isCloudEnabled && enableFederatedIdentityAuthConfig;

  ReactDOM.render(
    coreStart.rendering.addContext(
      <Router history={history}>
        <Main
          httpClient={coreStart.http}
          toasts={coreStart.notifications.toasts}
          cloudInfo={cloudInfo}
          featureFlags={{
            enableFederatedIdentityAuth,
            enableGoogleCloudStorageDataSourceType,
            enableAzureDataSourceType,
          }}
        />
      </Router>
    ),
    element
  );

  return () => {
    ReactDOM.unmountComponentAtNode(element);
  };
};
