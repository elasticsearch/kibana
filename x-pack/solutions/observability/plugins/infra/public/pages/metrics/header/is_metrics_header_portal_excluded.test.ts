/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isMetricsHeaderPortalExcluded } from './is_metrics_header_portal_excluded';
import { METRICS_INVENTORY_PATH, METRICS_DETAIL_PATH } from './metrics_header_paths';

describe('isMetricsHeaderPortalExcluded', () => {
  it('excludes Inventory, Explorer, Hosts, and Settings once those routes consume AppHeader', () => {
    expect(isMetricsHeaderPortalExcluded('/inventory')).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/inventory/extra')).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/explorer')).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/explorer/extra')).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/hosts')).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/hosts/extra')).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/settings')).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/settings/extra')).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/detail/host/web-01')).toBe(false);
  });

  it('excludes Inventory and Explorer redirect aliases so the portal does not flash', () => {
    expect(isMetricsHeaderPortalExcluded('/')).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/snapshot')).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/snapshot/x')).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/snapshot-other')).toBe(false);
    expect(isMetricsHeaderPortalExcluded('/metrics-explorer')).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/metrics-explorer/x')).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/metrics-explorer-other')).toBe(false);
  });

  it('matches a parent path and its nested segments', () => {
    expect(isMetricsHeaderPortalExcluded('/inventory', [METRICS_INVENTORY_PATH])).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/inventory/extra', [METRICS_INVENTORY_PATH])).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/hosts', [METRICS_INVENTORY_PATH])).toBe(false);
  });

  it('can exclude every detail page with the detail parent path', () => {
    expect(isMetricsHeaderPortalExcluded('/detail/host/web-01', [METRICS_DETAIL_PATH])).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/detail/pod/p1', [METRICS_DETAIL_PATH])).toBe(true);
    expect(isMetricsHeaderPortalExcluded('/hosts', [METRICS_DETAIL_PATH])).toBe(false);
  });
});
