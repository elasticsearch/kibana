/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DashboardApiDataInput } from '@kbn/as-code-dashboard-schema';
import type { KbnClient, ScoutLogger } from '../../../../../../common';
import { measurePerformanceAsync } from '../../../../../../common';
import { DASHBOARD_API_PATH, DASHBOARD_API_VERSION } from './constants';
import type { CreatedDashboardPanel } from './types';

export { DASHBOARD_API_PATH, DASHBOARD_API_VERSION } from './constants';
export type { CreatedDashboardPanel } from './types';

/**
 * Dashboards API Service
 * Provides methods to interact with Kibana's Dashboards API
 */
export interface DashboardApiService {
  /**
   * Create a dashboard via the API and return its id.
   * @param body - Dashboard create request body
   * @param spaceId - Optional space id to create the dashboard in
   */
  create: (body: DashboardApiDataInput, spaceId?: string) => Promise<string>;

  /**
   * Create a dashboard and fetch the auto-generated panel id of its first panel.
   * @param body - Dashboard create request body
   * @param spaceId - Optional space id to create the dashboard in
   */
  createWithPanelId: (
    body: DashboardApiDataInput,
    spaceId?: string
  ) => Promise<CreatedDashboardPanel>;
}

/**
 * Factory function to create a Dashboards API service helper
 * @param log - Scout logger instance
 * @param kbnClient - Kibana client for making API requests
 * @returns DashboardApiService instance
 */
export const getDashboardApiHelper = (
  log: ScoutLogger,
  kbnClient: KbnClient
): DashboardApiService => {
  const withSpace = (path: string, spaceId?: string) =>
    spaceId ? `/s/${spaceId}/${path}` : `/${path}`;

  const create: DashboardApiService['create'] = async (body, spaceId) => {
    return await measurePerformanceAsync(log, 'dashboardApi.create', async (): Promise<string> => {
      const response = await kbnClient.request<unknown>({
        method: 'POST',
        path: withSpace(DASHBOARD_API_PATH, spaceId),
        body,
        headers: { 'elastic-api-version': DASHBOARD_API_VERSION },
      });

      if (response.status !== 201) {
        throw new Error(
          `Expected dashboard create status 201, got ${response.status}: ${JSON.stringify(
            response.data
          )}`
        );
      }

      const { id } = response.data as Record<string, unknown>;
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error('Dashboard create response: expected a non-empty string id');
      }
      return id;
    });
  };

  return {
    create,

    createWithPanelId: async (body, spaceId) => {
      return await measurePerformanceAsync(
        log,
        'dashboardApi.createWithPanelId',
        async (): Promise<CreatedDashboardPanel> => {
          const dashboardId = await create(body, spaceId);

          const getResponse = await kbnClient.request<unknown>({
            method: 'GET',
            path: withSpace(`${DASHBOARD_API_PATH}/${dashboardId}`, spaceId),
            headers: { 'elastic-api-version': DASHBOARD_API_VERSION },
          });

          const data = (getResponse.data as Record<string, unknown>).data as Record<
            string,
            unknown
          >;
          const panels = data.panels as Array<Record<string, unknown>>;
          if (!Array.isArray(panels) || panels.length === 0) {
            throw new Error(
              `Dashboard get response for '${dashboardId}': expected at least one panel, got ${JSON.stringify(
                data.panels
              )}`
            );
          }

          const { id: panelId } = panels[0];
          if (typeof panelId !== 'string' || panelId.length === 0) {
            throw new Error(
              `Dashboard get response for '${dashboardId}': expected a non-empty string panel id, got ${JSON.stringify(
                panels[0].id
              )}`
            );
          }

          return { dashboardId, panelId };
        }
      );
    },
  };
};
