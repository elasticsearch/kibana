/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * EBT click action name constants.
 *
 * These values populate the `data-ebt-action` HTML attribute and map to the
 * `click.action` field in EBT click events.
 *
 * ## Naming convention: intent over implementation
 *
 * Action names must express what the user *intends* to do, not what the UI does
 * underneath. For example, a link that currently opens an error in Discover should
 * be named `viewError`, not `openInDiscover` — because if the destination changes
 * tomorrow (e.g. to APM or a flyout), the user intent is still "view the error"
 * and we should not need to update every call site.
 *
 * Use `openInDiscover` only when the user explicitly chooses to open something in
 * Discover (e.g. a button that says "Open in Discover").
 */

/**
 * Shared EBT click action constants.
 *
 * Use these when the user intent is generic enough to be shared across plugins.
 * For plugin-specific actions, define them locally in the plugin's own ebt_constants file.
 */
export const EBT_CLICK_ACTIONS = {
  /** Navigates to the Discover app. */
  OPEN_IN_DISCOVER: 'openInDiscover',
  /** User intends to view a span or transaction's details. */
  VIEW_SPAN: 'viewSpan',
  /** User intends to view a service's overview. */
  VIEW_SERVICE: 'viewService',
  /** User intends to view an error's details. */
  VIEW_ERROR: 'viewError',
  /** Navigates to the APM app. Use when the user explicitly chooses to open something in APM. */
  OPEN_IN_APM: 'openInApm',
  /** User sets a breakdown field on a chart. */
  SET_BREAKDOWN: 'setBreakdown',
  /** User intends to view active alerts for an entity. */
  VIEW_ALERTS: 'viewAlerts',
  /** User intends to view SLOs for a service or resource. */
  VIEW_SLOS: 'viewSlos',
} as const;

/**
 * Sentinel value for `data-ebt-detail` when a field is not found in the ECS fields
 * metadata registry. This covers truly custom fields but also legitimate standard fields
 * from other schemas (e.g. APM-specific `span.name`, OTel `k8s.pod.name`) that are not
 * ECS-registered. Analysts should read this as "field not in ECS registry" rather than
 * "unknown or custom field". ECS fields send their name directly as the detail value.
 *
 * @see https://github.com/elastic/kibana/blob/main/src/platform/plugins/shared/discover/public/ebt_manager/scoped_discover_ebt_manager.ts
 */
export const NON_ECS_FIELD_EBT_DETAIL = '<non-ecs>';

/**
 * Sentinel value for `data-ebt-detail` when the user deliberately selects "none" or clears
 * a selection. Distinguishes an intentional empty choice from a missing or unknown value.
 */
export const NONE_EBT_DETAIL = '<none>';
