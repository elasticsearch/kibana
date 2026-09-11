/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  METRICS_EXPLORER_PATH,
  METRICS_HOSTS_PATH,
  METRICS_INVENTORY_PATH,
  METRICS_SETTINGS_PATH,
} from './metrics_header_paths';

/**
 * Metrics parent paths that already render AppHeader and must not also mount HeaderMenuPortal.
 * Route PRs append their path here when they consume the shared menu helper.
 * `/` and `/snapshot` redirect to `/inventory` in `pages/metrics/index.tsx`;
 * `/metrics-explorer` redirects to `/explorer`. Exclude those aliases so the
 * portal does not flash on first paint.
 */
export const METRICS_HEADER_PORTAL_EXCLUDED_PATHS: readonly string[] = [
  METRICS_INVENTORY_PATH,
  METRICS_EXPLORER_PATH,
  METRICS_HOSTS_PATH,
  METRICS_SETTINGS_PATH,
  '/snapshot',
  '/metrics-explorer',
  '/',
];

export function isMetricsHeaderPortalExcluded(
  pathname: string,
  excludedPaths: readonly string[] = METRICS_HEADER_PORTAL_EXCLUDED_PATHS
): boolean {
  return excludedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
