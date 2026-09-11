/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Shared synthetics API paths used by Scout specs and helpers.
 *
 * These mirror the constants in `@kbn/synthetics-plugin/common/constants`; we
 * duplicate them here so Scout API specs don't need to import across the
 * plugin public/server boundary.
 */
export const SYNTHETICS_API_URLS = {
  SYNTHETICS_ENABLEMENT: '/internal/synthetics/service/enablement',
  SYNTHETICS_MONITORS: '/api/synthetics/monitors',
  CERTS: '/internal/synthetics/certs',
  CERTS_FACETS: '/internal/synthetics/certs/facets',
  INSPECT_TLS_RULE: '/internal/synthetics/inspect_tls_rule',
  INSPECT_STATUS_RULE: '/internal/synthetics/inspect_status_rule',
  GET_SYNTHETICS_MONITOR: '/api/synthetics/monitors/{monitorId}',
  TEST_NOW_MONITOR: '/api/synthetics/monitor/test',
  FILTERS: '/internal/synthetics/monitor/filters',
  OVERVIEW_STATUS: '/internal/synthetics/overview_status',
  OVERVIEW_STATUS_STALE: '/internal/synthetics/overview_status/stale',
  SUGGESTIONS: '/internal/synthetics/suggestions',
  PRIVATE_LOCATIONS: '/api/synthetics/private_locations',
  PRIVATE_LOCATIONS_MONITORS: '/internal/synthetics/private_locations/monitors',
  SERVICE_LOCATIONS: '/internal/uptime/service/locations',
  DYNAMIC_SETTINGS: '/api/synthetics/settings',
  MULTI_SPACE_SETTINGS: '/internal/synthetics/settings_multi_space',
  PARAMS: '/api/synthetics/params',
  PRIVATE_LOCATIONS_CLEANUP: '/internal/synthetics/private_locations/_cleanup',
  SYNC_GLOBAL_PARAMS: '/internal/synthetics/sync_global_params',
  ENABLE_DEFAULT_ALERTING: '/internal/synthetics/enable_default_alerting',
  SYNTHETICS_MONITOR_INSPECT: '/internal/synthetics/service/monitor/inspect',
  SYNTHETICS_MONITOR_RESET: '/internal/synthetics/monitors/{monitorId}/_reset',
  SYNTHETICS_MONITORS_BULK_RESET: '/internal/synthetics/monitors/_bulk_reset',
  SYNTHETICS_MONITORS_PROJECT: '/api/synthetics/project/{projectName}/monitors',
  SYNTHETICS_MONITORS_PROJECT_UPDATE: '/api/synthetics/project/{projectName}/monitors/_bulk_update',
  SYNTHETICS_MONITORS_PROJECT_DELETE: '/api/synthetics/project/{projectName}/monitors/_bulk_delete',
} as const;

export const PUBLIC_API_VERSION = '2023-10-31';
export const INTERNAL_API_VERSION = '1';

/**
 * Synthetics monitor saved-object types created by the create/edit specs.
 * Cleaned in `beforeAll`/`afterAll` so the worker-shared Fleet package and
 * private location survive across specs (matching the FTR suite's design).
 */
export const SYNTHETICS_MONITOR_SO_TYPES = ['synthetics-monitor', 'synthetics-monitor-multi-space'];

/** Alerts-as-data index backing the Synthetics uptime rules (status + TLS). */
export const SYNTHETICS_ALERTS_INDEX = '.alerts-observability.uptime.alerts-default*';

export interface SyntheticsAlertDoc {
  'kibana.alert.status'?: string;
  'kibana.alert.reason'?: string;
  'kibana.alert.instance.id'?: string;
}

/**
 * Elastic-managed "local" public location available in the test environment.
 * Mirrors `LOCAL_PUBLIC_LOCATION` from the FTR `apis/synthetics/helpers/location.ts`.
 */
export const LOCAL_PUBLIC_LOCATION = {
  geo: { lat: 0, lon: 0 },
  id: 'dev',
  label: 'Dev Service',
  isServiceManaged: true,
} as const;

/** Default headers for Synthetics *public* API requests (versioned). */
export const PUBLIC_API_HEADERS = {
  'elastic-api-version': PUBLIC_API_VERSION,
} as const;

/** Default headers shared with Kibana for internal/public API requests from Scout API specs. */
export const KIBANA_HEADERS = {
  'kbn-xsrf': 'some-xsrf-token',
  'x-elastic-internal-origin': 'kibana',
} as const;

export function mergeSyntheticsApiHeaders(
  authHeader: Record<string, string>,
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    ...KIBANA_HEADERS,
    ...authHeader,
    ...extra,
  };
}
