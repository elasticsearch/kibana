/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const MONITOR_ROUTE = '/monitor/:monitorId?';

export const MONITOR_NOT_FOUND_ROUTE = '/monitor-not-found/:monitorId';

export const MONITOR_HISTORY_ROUTE = '/monitor/:monitorId/history';

export const MONITOR_ERRORS_ROUTE = '/monitor/:monitorId/errors';
export const MONITOR_ALERTS_ROUTE = '/monitor/:monitorId/alerts';

export const MONITOR_ADD_ROUTE = '/add-monitor';

export const MONITOR_EDIT_ROUTE = '/edit-monitor/:monitorId';

export const MONITOR_MANAGEMENT_ROUTE = '/manage-monitors';

export const OVERVIEW_ROUTE = '/';

export const MONITORS_ROUTE = '/monitors';
export const ERRORS_ROUTE = '/errors';

export const GETTING_STARTED_ROUTE = '/monitors/getting-started';

export const SETTINGS_ROUTE = '/settings';

export const PRIVATE_LOCATIONS_ROUTE = '/settings/private-locations';

export const SYNTHETICS_SETTINGS_ROUTE = '/settings/:tabId';

export const CERTIFICATES_ROUTE = '/certificates';

export const SYNTHETICS_STEP_DETAIL_ROUTE =
  '/monitor/:monitorId/test-run/:checkGroupId/step/:stepIndex';

export const STEP_DETAIL_ROUTE = '/journey/:checkGroupId/step/:stepIndex';

export const SYNTHETIC_CHECK_STEPS_ROUTE = '/journey/:checkGroupId/steps';

export const TEST_RUN_DETAILS_ROUTE = '/monitor/:monitorId/test-run/:checkGroupId';

export const ERROR_DETAILS_ROUTE = '/monitor/:monitorId/errors/:errorStateId';

export const SYNTHETICS_APP_BASE_PATH = '/app/synthetics';

// Path helpers prefixed with SYNTHETICS_APP_BASE_PATH
// suitable for deep-linking when building remote-cluster URLs.
export const paths = {
  monitorDetail: (configId: string) =>
    `${SYNTHETICS_APP_BASE_PATH}${MONITOR_ROUTE.replace(
      ':monitorId?',
      encodeURIComponent(configId)
    )}`,
  monitorEdit: (configId: string) =>
    `${SYNTHETICS_APP_BASE_PATH}${MONITOR_EDIT_ROUTE.replace(
      ':monitorId',
      encodeURIComponent(configId)
    )}`,
  monitorAdd: `${SYNTHETICS_APP_BASE_PATH}${MONITOR_ADD_ROUTE}`,
};

export enum STATUS {
  UP = 'up',
  DOWN = 'down',
  COMPLETE = 'complete',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum MONITOR_TYPES {
  HTTP = 'http',
  TCP = 'tcp',
  ICMP = 'icmp',
  BROWSER = 'browser',
}

export const UNNAMED_LOCATION = 'Unnamed-location';

export enum CERT_STATUS {
  OK = 'OK',
  EXPIRING_SOON = 'EXPIRING_SOON',
  EXPIRED = 'EXPIRED',
  TOO_OLD = 'TOO_OLD',
}

export const SYNTHETICS_INDEX_PATTERN = 'synthetics-*';

export const LICENSE_NOT_ACTIVE_ERROR = 'License not active';
export const LICENSE_MISSING_ERROR = 'Missing license information';
export const LICENSE_NOT_SUPPORTED_ERROR = 'License not supported';

export const INITIAL_REST_VERSION = '2023-10-31';
