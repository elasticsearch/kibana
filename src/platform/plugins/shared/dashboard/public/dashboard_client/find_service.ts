/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { asyncMap } from '@kbn/std';
import { SavedObjectNotFound } from '@kbn/kibana-utils-plugin/common';
import { dashboardClient } from './dashboard_client';
import type { FindDashboardsByIdResponse } from './types';

export const findService = {
  findById: async (id: string): Promise<FindDashboardsByIdResponse> => {
    try {
      const result = await dashboardClient.get(id);
      return {
        id,
        status: 'success',
        attributes: result.data,
      };
    } catch (error) {
      return { id, status: 'error', notFound: error instanceof SavedObjectNotFound, error };
    }
  },
  findByIds: async (ids: string[]) => {
    return asyncMap(ids, async (id) => {
      return findService.findById(id);
    });
  },
  findByTitle: async (title: string) => {
    const { data: dashboards } = await dashboardClient.search({
      query: title,
      per_page: 10,
    });

    // The search isn't an exact match, lets see if we can find a single exact match to use
    const matchingDashboards = dashboards.filter(
      (dashboard) => dashboard.data.title.toLowerCase() === title.toLowerCase()
    );
    if (matchingDashboards.length === 1) {
      return { id: matchingDashboards[0].id };
    }
  },
  search: dashboardClient.search,
};
