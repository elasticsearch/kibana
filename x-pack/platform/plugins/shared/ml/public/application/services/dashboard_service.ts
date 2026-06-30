/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import type { ViewMode } from '@kbn/presentation-publishing';
import type { SharePluginStart } from '@kbn/share-plugin/public';
import { DASHBOARD_APP_LOCATOR } from '@kbn/deeplinks-analytics';
import { useMlKibana } from '../contexts/kibana';

export type DashboardService = ReturnType<typeof dashboardServiceProvider>;
export type DashboardItems = Awaited<ReturnType<DashboardService['fetchDashboards']>>;

export function dashboardServiceProvider(
  dashboardService: DashboardStart,
  share: SharePluginStart
) {
  return {
    /**
     * Fetches dashboards
     */
    async fetchDashboards(query?: string) {
      const findDashboardsService = await dashboardService.findDashboardsService();
      const responses = await findDashboardsService.search({
        query: query ?? '',
        per_page: 1000,
      });
      return responses.data;
    },
    /**
     * Fetch dashboards by id
     */
    async fetchDashboardsById(ids: string[]) {
      const findDashboardsService = await dashboardService.findDashboardsService();
      const responses = await findDashboardsService.findByIds(ids);
      const existingDashboards = responses.filter(({ status }) => status === 'success');
      return existingDashboards;
    },
    /**
     * Generates dashboard url
     */
    async getDashboardUrl(dashboardId: string, viewMode: ViewMode = 'edit') {
      return await share.url.locators.get(DASHBOARD_APP_LOCATOR)?.getUrl({
        dashboardId,
        viewMode: 'edit',
        useHash: false,
      });
    },
  };
}

/**
 * Hook to use {@link DashboardService} in react components
 */
export function useDashboardService(): DashboardService {
  const {
    services: { dashboard, share },
  } = useMlKibana();

  return useMemo(() => dashboardServiceProvider(dashboard, share), [dashboard, share]);
}
