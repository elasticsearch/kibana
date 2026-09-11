/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const COMMON_HEADERS = {
  'kbn-xsrf': 'some-xsrf-token',
  'x-elastic-internal-origin': 'kibana',
};

// The telemetry opt-in route is a versioned internal route.
export const TELEMETRY_HEADERS = {
  ...COMMON_HEADERS,
  'elastic-api-version': '2',
};

export const SETTINGS_API_PATH = '/internal/kibana/settings';
export const TELEMETRY_OPTIN_API_PATH = '/internal/telemetry/optIn';

// Any registered core advanced setting works for the authorization checks. Posting `null` unsets
// any existing default-space user value, so the suite captures and restores it in teardown.
export const ADVANCED_SETTING_KEY = 'dateFormat:tz';

// Telemetry opt-in writes this namespace-agnostic saved object even when the request is
// space-prefixed, so the suite restores it independently of space cleanup.
export const TELEMETRY_SAVED_OBJECT = { type: 'telemetry', id: 'telemetry' } as const;
