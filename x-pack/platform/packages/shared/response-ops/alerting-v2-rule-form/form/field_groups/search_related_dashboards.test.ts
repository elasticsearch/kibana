/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import { resolveDashboardsByIds, searchRelatedDashboard } from './search_related_dashboards';

const DASHBOARD_ID = 'dashboard-1';
const DASHBOARD_TITLE = 'Dashboard 1';
const MISSING_DASHBOARD_ID = 'missing-dashboard';

const search = jest.fn(async () => ({
  data: [{ id: DASHBOARD_ID, data: { title: DASHBOARD_TITLE }, meta: {} }],
  meta: { page: 1, per_page: 100, total: 1 },
}));

const findByIds = jest.fn(async (ids: string[]) =>
  ids.map((id) =>
    id === DASHBOARD_ID
      ? { id, status: 'success', attributes: { title: DASHBOARD_TITLE } }
      : { id, status: 'error', notFound: true, error: new Error('not found') }
  )
);

const findDashboardsService = jest.fn(async () => ({
  search,
  findById: jest.fn(),
  findByIds,
  findByTitle: jest.fn(),
}));

const dashboard = { findDashboardsService } as unknown as DashboardStart;

describe('search related dashboards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('searches dashboards via findDashboardsService().search', async () => {
    const result = await searchRelatedDashboard(dashboard, { search: 'error rate', perPage: 25 });

    expect(result).toEqual([{ id: DASHBOARD_ID, title: DASHBOARD_TITLE }]);
    expect(search).toHaveBeenCalledWith({ query: 'error rate', per_page: 25 });
  });

  it('uses the default page size when searching dashboards', async () => {
    await searchRelatedDashboard(dashboard);

    expect(search).toHaveBeenCalledWith({ query: undefined, per_page: 100 });
  });

  it('partitions resolved and missing dashboards by id', async () => {
    const result = await resolveDashboardsByIds(dashboard, [DASHBOARD_ID, MISSING_DASHBOARD_ID]);

    expect(result).toEqual({
      resolved: [{ id: DASHBOARD_ID, title: DASHBOARD_TITLE }],
      missing: [{ id: MISSING_DASHBOARD_ID, notFound: true }],
    });
    expect(findByIds).toHaveBeenCalledWith([DASHBOARD_ID, MISSING_DASHBOARD_ID]);
  });

  it('does not fetch dashboards when there are no ids', async () => {
    const result = await resolveDashboardsByIds(dashboard, []);

    expect(result).toEqual({ resolved: [], missing: [] });
    expect(findDashboardsService).not.toHaveBeenCalled();
  });
});
