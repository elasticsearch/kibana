/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SIEM_MIGRATIONS_PATH } from '../constants';

export const SIEM_DASHBOARD_MIGRATIONS_PATH = `${SIEM_MIGRATIONS_PATH}/dashboards` as const;

export const SIEM_DASHBOARD_MIGRATION_EVALUATE_PATH =
  `${SIEM_DASHBOARD_MIGRATIONS_PATH}/evaluate` as const;

export const SIEM_DASHBOARD_MIGRATION_INVOKE_PATH =
  `${SIEM_DASHBOARD_MIGRATIONS_PATH}/_invoke` as const;

export const SIEM_DASHBOARD_MIGRATIONS_ALL_STATS_PATH =
  `${SIEM_DASHBOARD_MIGRATIONS_PATH}/stats` as const;

// Migration ID specific routes
export const SIEM_DASHBOARD_MIGRATION_PATH =
  `${SIEM_DASHBOARD_MIGRATIONS_PATH}/{migration_id}` as const;

export const SIEM_DASHBOARD_MIGRATION_DASHBOARDS_PATH =
  `${SIEM_DASHBOARD_MIGRATION_PATH}/dashboards` as const;

export const SIEM_DASHBOARD_MIGRATION_STATS_PATH =
  `${SIEM_DASHBOARD_MIGRATION_PATH}/stats` as const;

export const SIEM_DASHBOARD_MIGRATION_TRANSLATION_STATS_PATH =
  `${SIEM_DASHBOARD_MIGRATION_PATH}/translation_stats` as const;

export const SIEM_DASHBOARD_MIGRATION_RESOURCES_PATH =
  `${SIEM_DASHBOARD_MIGRATION_PATH}/resources` as const;

export const SIEM_DASHBOARD_MIGRATION_RESOURCES_MISSING_PATH =
  `${SIEM_DASHBOARD_MIGRATION_RESOURCES_PATH}/missing` as const;

export const SIEM_DASHBOARD_MIGRATION_INSTALL_PATH =
  `${SIEM_DASHBOARD_MIGRATION_PATH}/install` as const;

export const SIEM_DASHBOARD_MIGRATION_START_PATH =
  `${SIEM_DASHBOARD_MIGRATION_PATH}/start` as const;

export const SIEM_DASHBOARD_MIGRATION_STOP_PATH = `${SIEM_DASHBOARD_MIGRATION_PATH}/stop` as const;
