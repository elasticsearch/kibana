/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Builds the Elasticsearch application privilege actions (prefixed with `alerts:`) that gate access
 * to the Alerting v2 alerts data, i.e. the data streams that persist the rule events and alert
 * actions (see `x-pack/platform/plugins/shared/alerting_v2/server/resources/README.md`).
 *
 * These actions are granted to a role whenever a feature privilege opts into alerts access via
 * `alerts: { read: true }` (see `FeaturePrivilegeAlertsBuilder`).
 *
 * Scope: this only covers access to the shared alerts data. It does NOT grant access to rules,
 * connectors, or any other Alerting v2 resource, which are gated by their own actions/privileges.
 */
export interface AlertsActions {
  /**
   * The `alerts:read` action, granting read-only access to the Alerting v2 alerts data (the
   * persisted rule events and alert actions). This is currently the only operation supported for
   * alerts access.
   */
  read: string;
}
