/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DashboardStart } from '@kbn/dashboard-plugin/public';

export interface Dashboard {
  id: string;
  title: string;
}

/** A dashboard artifact whose saved object could not be resolved. */
export interface MissingDashboard {
  id: string;
  /** `true` when the saved object no longer exists (deleted); `false` for other access/load errors. */
  notFound: boolean;
}

export interface ResolveDashboardsResult {
  resolved: Dashboard[];
  missing: MissingDashboard[];
}

export const searchRelatedDashboard = async (
  dashboard: DashboardStart,
  options: { search?: string; perPage?: number } = {}
): Promise<Dashboard[]> => {
  const { search, perPage = 100 } = options;
  const findService = await dashboard.findDashboardsService();
  const { data: dashboards } = await findService.search({ query: search, per_page: perPage });
  return dashboards.map(({ id, data }) => ({ id, title: data.title }));
};

/**
 * Resolves attached dashboard ids to their titles, partitioning the results into
 * `resolved` (saved object found) and `missing` (deleted or otherwise unavailable).
 *
 * Uses `findDashboardsService().findByIds`, which reports per-id status — preserving
 * the not-found signal that the deleted-state treatment relies on.
 */
export const resolveDashboardsByIds = async (
  dashboard: DashboardStart,
  ids: string[]
): Promise<ResolveDashboardsResult> => {
  if (!ids.length) {
    return { resolved: [], missing: [] };
  }

  const findService = await dashboard.findDashboardsService();
  const results = await findService.findByIds(ids);

  const resolved: Dashboard[] = [];
  const missing: MissingDashboard[] = [];

  for (const result of results) {
    if (result.status === 'success') {
      resolved.push({ id: result.id, title: result.attributes.title });
    } else {
      missing.push({ id: result.id, notFound: result.notFound });
    }
  }

  return { resolved, missing };
};
