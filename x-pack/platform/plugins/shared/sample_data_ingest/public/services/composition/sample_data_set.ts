/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { HttpStart } from '@kbn/core-http-browser';
import type { SampleDataSet, InstalledStatus, AppLink } from '@kbn/home-sample-data-types';
import {
  type StatusResponse,
  InstallationStatus,
  SAMPLE_DATA_INGEST_PLUGIN_ID,
} from '../../../common';

/**
 * Default IDs from the saved objects definition.
 * @see server/saved_objects/saved_objects.ts
 */
const DEFAULT_DASHBOARD_ID = 'c87c6b86-b289-455a-97de-dba5f25174aa';
const DEFAULT_INDEX_PATTERN_ID = '0e5a8704-b6fa-4320-9b73-65f692379500';

/**
 * Maps the sample_data_ingest InstallationStatus to the InstalledStatus type used by SampleDataSet.
 */
export const mapInstallationStatusToInstalledStatus = (
  status: InstallationStatus
): InstalledStatus => {
  switch (status) {
    case InstallationStatus.Installed:
      return 'installed';
    case InstallationStatus.Uninstalled:
      return 'not_installed';
    case InstallationStatus.Installing:
      return 'installing';
    case InstallationStatus.Error:
    default:
      return 'unknown';
  }
};

/**
 * Creates the app links for viewing the sample data in various Kibana apps.
 * Note: Dashboard link is already added by the ViewButton component, so we only include
 * additional links like Discover here.
 */
const createAppLinks = (indexPatternId: string): AppLink[] => [
  {
    path: `/app/discover#/?_a=(dataSource:(dataViewId:'${indexPatternId}',type:dataView))`,
    label: i18n.translate('xpack.sampleDataIngest.sampleDataSet.viewDiscoverLink', {
      defaultMessage: 'Discover',
    }),
    icon: 'discoverApp',
  },
  {
    path: '/app/agent_builder',
    label: i18n.translate('xpack.sampleDataIngest.sampleDataSet.viewAgentBuilderLink', {
      defaultMessage: 'Agent Builder',
    }),
    icon: 'productRobot',
  },
];

/**
 * Creates a SampleDataSet object for the Elasticsearch documentation dataset
 * from the sample_data_ingest status response.
 *
 * @param statusResponse - The status response from the sample_data_ingest API
 * @param http - The Kibana HTTP service for constructing asset paths
 * @param install - The install function from the installation service
 * @param uninstall - The uninstall function from the installation service
 * @param getStatus - Function to get the current installation status
 */
export const createSampleDataSet = (
  statusResponse: StatusResponse,
  http: HttpStart,
  install: () => Promise<unknown>,
  uninstall: () => Promise<void>,
  getStatus: () => Promise<InstalledStatus>
): SampleDataSet => {
  const assetBasePath = http.basePath.prepend(`/plugins/${SAMPLE_DATA_INGEST_PLUGIN_ID}/assets`);
  const dashboardId = statusResponse.dashboardId || DEFAULT_DASHBOARD_ID;

  return {
    id: 'elasticsearch_documentation',
    name: i18n.translate('xpack.sampleDataIngest.sampleDataSet.name', {
      defaultMessage: 'Elasticsearch Documentation',
    }),
    description: i18n.translate('xpack.sampleDataIngest.sampleDataSet.description', {
      defaultMessage:
        'Sample data from Elasticsearch documentation to help you explore search capabilities.',
    }),
    previewImagePath: `${assetBasePath}/search_results_illustration.svg`,
    darkPreviewImagePath: `${assetBasePath}/search_results_illustration.svg`,
    overviewDashboard: dashboardId,
    defaultIndex: DEFAULT_INDEX_PATTERN_ID,
    appLinks: createAppLinks(DEFAULT_INDEX_PATTERN_ID),
    status: mapInstallationStatusToInstalledStatus(statusResponse.status),
    statusMsg: statusResponse.error,
    // Custom install/remove handlers that use the sample_data_ingest API
    customInstall: async () => {
      await install();
    },
    customRemove: async () => {
      await uninstall();
    },
    customStatusCheck: getStatus,
  };
};
