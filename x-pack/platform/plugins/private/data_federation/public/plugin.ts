/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, Plugin, PluginInitializerContext } from '@kbn/core/public';
import type { ManagementAppMountParams } from '@kbn/management-plugin/public';
import type { SetupDependencies, StartDependencies, DataFederationPluginStart } from './types';
import { PLUGIN_ID, PLUGIN_NAME } from '../common';
import { buildFederatedIdentityClusterInfo } from './create_data_source_flyout/federated_identity_cluster_info';

const LIST_BREADCRUMB = [
  {
    text: PLUGIN_NAME,
    href: '#/management/kibana/data_federation',
  },
];

export class DataFederationPlugin
  implements Plugin<void, DataFederationPluginStart, SetupDependencies, StartDependencies>
{
  private readonly enableFederatedIdentityAuth: boolean;
  private readonly enableGoogleCloudStorageDataSourceType: boolean;
  private readonly enableAzureDataSourceType: boolean;

  private readonly workloadIdentityIssuerUrl: string | undefined;

  constructor(initializerContext: PluginInitializerContext) {
    const {
      enableFederatedIdentityAuth,
      enableGoogleCloudStorageDataSourceType,
      enableAzureDataSourceType,
      workloadIdentityIssuerUrl,
    } = initializerContext.config.get<{
      enableFederatedIdentityAuth: boolean;
      enableGoogleCloudStorageDataSourceType: boolean;
      enableAzureDataSourceType: boolean;
      workloadIdentityIssuerUrl?: string;
    }>();
    this.enableFederatedIdentityAuth = enableFederatedIdentityAuth;
    this.enableGoogleCloudStorageDataSourceType = enableGoogleCloudStorageDataSourceType;
    this.enableAzureDataSourceType = enableAzureDataSourceType;
    this.workloadIdentityIssuerUrl = workloadIdentityIssuerUrl;
  }

  public setup(core: CoreSetup<StartDependencies>, { management, cloud }: SetupDependencies): void {
    const enableFederatedIdentityAuth = this.enableFederatedIdentityAuth;
    const enableGoogleCloudStorageDataSourceType = this.enableGoogleCloudStorageDataSourceType;
    const enableAzureDataSourceType = this.enableAzureDataSourceType;
    const cloudInfo = buildFederatedIdentityClusterInfo(cloud, this.workloadIdentityIssuerUrl);
    const isCloudEnabled = Boolean(cloud?.isCloudEnabled);
    void core.getStartServices().then(([coreStart]) => {
      const canManageFederatedData =
        coreStart.application.capabilities?.[PLUGIN_ID]?.manageFederatedData === true;

      if (!canManageFederatedData) {
        return;
      }

      management.sections.section.data.registerApp({
        id: PLUGIN_ID,
        title: PLUGIN_NAME,
        order: 2,
        visibleIn: ['globalSearch', 'projectSideNav'],
        async mount(params: ManagementAppMountParams) {
          const { mountManagementSection } = await import('./mount_management_section');
          const [nextCoreStart] = await core.getStartServices();

          const { docTitle } = nextCoreStart.chrome;
          docTitle.change(PLUGIN_NAME);

          const { setBreadcrumbs } = params;
          setBreadcrumbs(LIST_BREADCRUMB);

          const unmountAppCallback = mountManagementSection(nextCoreStart, params, {
            cloudInfo,
            isCloudEnabled,
            featureFlags: {
              enableFederatedIdentityAuth,
              enableGoogleCloudStorageDataSourceType,
              enableAzureDataSourceType,
            },
          });
          return () => {
            docTitle.reset();
            unmountAppCallback();
          };
        },
      });
    });
  }

  public start(): DataFederationPluginStart {
    return {};
  }
}
