/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const ALLOWED_MAX_ALERTS = 5000;

export const MAX_SNOOZED_INSTANCE_CONDITIONS = 10;
export const MAX_SNOOZED_ALERT_INSTANCES = 1000;

export const MAX_ID_LENGTH = 256;
export const MAX_SNOOZED_INSTANCE_ID_LENGTH = 1000;
export const MAX_SNOOZED_BY_LENGTH = 256;
export const MAX_SNOOZED_CONDITION_FIELD_LENGTH = 1000;
export const MAX_SNOOZE_EXPIRES_AT_LENGTH = 30;

export const MAX_KQL_FILTER_LENGTH = 8192;
// Matches Elasticsearch's default `index.max_result_window`, the ceiling for paginated results.
export const MAX_RESULT_WINDOW = 10000;
// Mirrors the maximum number of alerts shown on the alerts table.
export const MAX_ALERTS_PER_PAGE = 100;

export function getMaxAlertLimit(maxAlerts: number): number {
  return Math.min(maxAlerts, ALLOWED_MAX_ALERTS);
}
