/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SharePluginStart } from '@kbn/share-plugin/public';
import { dashboardServiceProvider } from './dashboard_service';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';

describe('DashboardService', () => {
  const getUrlMock = jest.fn();
  const dashboard: DashboardStart = {
    // @ts-expect-error Only partial mock of full plugin
    locator: {
      getUrl: jest.fn(),
    },
    findDashboardsService: jest.fn().mockResolvedValue({
      search: jest.fn().mockResolvedValue({
        meta: { total: 0 },
        data: [],
      }),
    }),
  };

  const shareMock = {
    url: {
      locators: {
        get: () => ({
          getUrl: getUrlMock,
        }),
      },
    },
  } as unknown as SharePluginStart;

  const dashboardService = dashboardServiceProvider(dashboard, shareMock);

  test('should fetch dashboard', async () => {
    // act
    const resp = await dashboardService.fetchDashboards('test');
    // assert
    const searchDashboard = (await dashboard.findDashboardsService()).search;
    expect(searchDashboard).toHaveBeenCalledWith({
      query: 'test',
      per_page: 1000,
    });
    expect(resp).toEqual([]);
  });
  test('should generate url to the dashboard', () => {
    dashboardService.getDashboardUrl('test-id');
    expect(getUrlMock).toHaveBeenCalledWith({
      dashboardId: 'test-id',
      useHash: false,
      viewMode: 'edit',
    });
  });
});
