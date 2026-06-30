/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isEmpty, filter } from 'lodash';

import type { DashboardState } from '@kbn/dashboard-plugin/server';
import { PAGINATION_DEFAULT_PER_PAGE } from '@kbn/as-code-shared-schemas';
import type { DashboardItem } from '../../types';
import { dashboardServices } from '../../services/kibana_services';

function getDashboardItem(
  id: string,
  dashboardState: Pick<DashboardState, 'title' | 'description'>
) {
  return {
    id,
    title: dashboardState.title,
    ...(dashboardState.description && { description: dashboardState.description }),
  };
}

/**
 * ----------------------------------
 * Fetch a single dashboard
 * ----------------------------------
 */

export const fetchDashboard = async (dashboardId: string): Promise<DashboardItem> => {
  const findDashboardsService = await dashboardServices.findDashboardsService();
  const response = await findDashboardsService.findById(dashboardId);
  if (response.status === 'error') {
    throw new Error(response.error.message);
  }
  return getDashboardItem(response.id, response.attributes);
};

/**
 * ----------------------------------
 * Fetch lists of dashboards
 * ----------------------------------
 */

export const fetchDashboards = async ({
  search = '',
  size = PAGINATION_DEFAULT_PER_PAGE,
  page = 1,
  parentDashboardId,
  selectedDashboardId,
}: {
  page?: number;
  size?: number;
  search?: string;
  parentDashboardId?: string;
  selectedDashboardId?: string;
}): Promise<DashboardItem[]> => {
  const findDashboardsService = await dashboardServices.findDashboardsService();
  const responses = await findDashboardsService.search({
    query: search,
    per_page: size,
    page,
  });

  let dashboardList: DashboardItem[] = responses.data.map(({ id, data }) => {
    return getDashboardItem(id, data);
  });

  /** If there is no search string... */
  if (isEmpty(search)) {
    /** ... filter out both the parent and selected dashboard from the list ... */
    dashboardList = filter(dashboardList, (dash) => {
      return dash.id !== parentDashboardId && dash.id !== selectedDashboardId;
    });

    /** ... so that we can force them to the top of the list as necessary. */
    if (parentDashboardId) {
      dashboardList.unshift(await fetchDashboard(parentDashboardId));
    }

    if (selectedDashboardId && selectedDashboardId !== parentDashboardId) {
      const selectedDashboard = await fetchDashboard(selectedDashboardId).catch(() => {
        /**
         * Swallow the error thrown, since this just means the selected dashboard was deleted and therefore
         * it should not be added to the top of the dashboard list
         */
      });
      if (selectedDashboard) dashboardList.unshift(await fetchDashboard(selectedDashboardId));
    }
  }

  return dashboardList;
};
