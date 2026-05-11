/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServiceMock } from '@kbn/core/public/mocks';
import { createSampleDataSet } from './sample_data_set';
import { InstallationStatus, type StatusResponse } from '../../../common';

describe('createSampleDataSet', () => {
  it('composes the sample data set from a status response', () => {
    const basePath = '/test-base-path';
    const http = httpServiceMock.createStartContract({ basePath });

    const statusResponse: StatusResponse = {
      status: InstallationStatus.Installed,
      indexName: 'elasticsearch-docs',
      dashboardId: 'custom-dashboard-id',
    };

    const mockInstall = jest.fn().mockResolvedValue({ status: 'installed' });
    const mockUninstall = jest.fn().mockResolvedValue(undefined);
    const mockGetStatus = jest.fn().mockResolvedValue('installed');

    const result = createSampleDataSet(
      statusResponse,
      http,
      mockInstall,
      mockUninstall,
      mockGetStatus
    );

    expect(result).toMatchObject({
      id: 'elasticsearch_documentation',
      name: 'Elasticsearch Documentation',
      description:
        'Sample data from Elasticsearch documentation to help you explore search capabilities.',
      previewImagePath: `${basePath}/plugins/sampleDataIngest/assets/search_results_illustration.svg`,
      darkPreviewImagePath: `${basePath}/plugins/sampleDataIngest/assets/search_results_illustration.svg`,
      overviewDashboard: 'custom-dashboard-id',
      defaultIndex: '0e5a8704-b6fa-4320-9b73-65f692379500',
      appLinks: [
        {
          path: `/app/discover#/?_a=(dataSource:(dataViewId:'0e5a8704-b6fa-4320-9b73-65f692379500',type:dataView))`,
          label: 'Discover',
          icon: 'discoverApp',
        },
        {
          path: '/app/agent_builder',
          label: 'Agent Builder',
          icon: 'productRobot',
        },
      ],
      status: 'installed',
      statusMsg: undefined,
    });

    // Verify custom handlers are functions
    expect(typeof result.customInstall).toBe('function');
    expect(typeof result.customRemove).toBe('function');
    expect(typeof result.customStatusCheck).toBe('function');
  });

  it('wires custom handlers to call the provided functions', async () => {
    const basePath = '/test-base-path';
    const http = httpServiceMock.createStartContract({ basePath });

    const statusResponse: StatusResponse = {
      status: InstallationStatus.Uninstalled,
    };

    const mockInstall = jest.fn().mockResolvedValue({ status: 'installing' });
    const mockUninstall = jest.fn().mockResolvedValue(undefined);
    const mockGetStatus = jest.fn().mockResolvedValue('not_installed');

    const result = createSampleDataSet(
      statusResponse,
      http,
      mockInstall,
      mockUninstall,
      mockGetStatus
    );

    // Test customInstall calls the install function
    await result.customInstall!();
    expect(mockInstall).toHaveBeenCalledTimes(1);

    // Test customRemove calls the uninstall function
    await result.customRemove!();
    expect(mockUninstall).toHaveBeenCalledTimes(1);

    // Test customStatusCheck calls the getStatus function
    const status = await result.customStatusCheck!();
    expect(mockGetStatus).toHaveBeenCalledTimes(1);
    expect(status).toBe('not_installed');
  });
});
