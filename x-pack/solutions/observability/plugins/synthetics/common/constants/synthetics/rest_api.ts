/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface IndexSizeEntry {
  index: string;
  sizeInBytes: number;
}

export enum SYNTHETICS_API_URLS {
  // public apis
  SYNTHETICS_MONITORS = '/api/synthetics/monitors',
  GET_SYNTHETICS_MONITOR = '/api/synthetics/monitors/{monitorId}',
  PRIVATE_LOCATIONS = `/api/synthetics/private_locations`,
  PARAMS = `/api/synthetics/params`,
  LATEST_TEST_RUN = '/api/synthetics/latest_test_run',
  TEST_NOW_MONITOR = '/api/synthetics/monitor/test',

  // Service end points
  SYNTHETICS_MONITOR_RESET = '/internal/synthetics/monitors/{monitorId}/_reset',
  SYNTHETICS_MONITORS_BULK_RESET = '/internal/synthetics/monitors/_bulk_reset',
  INDEX_TEMPLATES = '/internal/synthetics/service/index_templates',
  SERVICE_LOCATIONS = '/internal/uptime/service/locations',
  SYNTHETICS_MONITOR_INSPECT = '/internal/synthetics/service/monitor/inspect',
  SYNTHETICS_ENABLEMENT = '/internal/synthetics/service/enablement',
  RUN_ONCE_MONITOR = '/internal/synthetics/service/monitors/run_once',
  SERVICE_ALLOWED = '/internal/synthetics/service/allowed',
  SYNTHETICS_PROJECT_APIKEY = '/internal/synthetics/service/api_key',
  SYNTHETICS_HAS_INTEGRATION_MONITORS = '/internal/synthetics/fleet/has_integration_monitors',
  SYNTHETICS_MONITORS_HEALTH = '/internal/synthetics/monitors/_health',
  SYNTHETICS_MONITOR_HEALTH = '/internal/synthetics/monitors/{monitorId}/_health',
  PRIVATE_LOCATIONS_CLEANUP = `/internal/synthetics/private_locations/_cleanup`,
  SYNC_GLOBAL_PARAMS = `/internal/synthetics/sync_global_params`,
  SYNC_GLOBAL_PARAMS_SETTINGS = `/internal/synthetics/sync_global_params/_settings`,

  PINGS = '/internal/synthetics/pings',
  MONITOR_STATUS_HEATMAP = '/internal/synthetics/ping_heatmap',
  OVERVIEW_TRENDS = '/internal/synthetics/overview_trends',
  OVERVIEW_STATUS = `/internal/synthetics/overview_status`,
  OVERVIEW_STATUS_STALE = `/internal/synthetics/overview_status/stale`,
  INDEX_SIZE = `/internal/synthetics/index_size`,
  AGENT_POLICIES = `/internal/synthetics/agent_policies`,
  PRIVATE_LOCATIONS_MONITORS = `/internal/synthetics/private_locations/monitors`,
  ENABLE_DEFAULT_ALERTING = `/internal/synthetics/enable_default_alerting`,
  GET_ACTIONS_CONNECTORS = `/internal/synthetics/get_actions_connectors`,
  GET_CONNECTOR_TYPES = `/internal/synthetics/get_connector_types`,
  JOURNEY = `/internal/synthetics/journey/{checkGroup}`,
  SYNTHETICS_SUCCESSFUL_CHECK = `/internal/synthetics/synthetics/check/success`,
  JOURNEY_SCREENSHOT_BLOCKS = `/internal/synthetics/journey/screenshot/block`,
  NETWORK_EVENTS = `/internal/synthetics/network_events`,
  JOURNEY_SCREENSHOT = `/internal/synthetics/journey/screenshot/{checkGroup}/{stepIndex}`,
  DELETE_PACKAGE_POLICY = `/internal/synthetics/monitor/policy/{packagePolicyId}`,
  FILTERS = '/internal/synthetics/monitor/filters',
  TRIGGER_TASK_RUN = '/internal/synthetics/trigger_task_run/{taskType}',

  CERTS = '/internal/synthetics/certs',
  CERTS_FACETS = '/internal/synthetics/certs/facets',

  ERROR_GROUPS = '/internal/synthetics/error_groups',
  ERROR_STATS = '/internal/synthetics/error_stats',

  SUGGESTIONS = `/internal/synthetics/suggestions`,
  MAINTENANCE_WINDOWS = `/internal/synthetics/monitors/maintenance_windows`,

  // Project monitor public endpoint
  SYNTHETICS_MONITORS_PROJECT = '/api/synthetics/project/{projectName}/monitors',
  SYNTHETICS_MONITORS_PROJECT_UPDATE = '/api/synthetics/project/{projectName}/monitors/_bulk_update',
  SYNTHETICS_MONITORS_PROJECT_DELETE = '/api/synthetics/project/{projectName}/monitors/_bulk_delete',

  DYNAMIC_SETTINGS = `/api/synthetics/settings`,
  MULTI_SPACE_SETTINGS = `/internal/synthetics/settings_multi_space`,

  INSPECT_STATUS_RULE = '/internal/synthetics/inspect_status_rule',
  INSPECT_TLS_RULE = '/internal/synthetics/inspect_tls_rule',

  MONITOR_SUMMARY_STATS = '/internal/synthetics/monitor/summary_stats',

  /** Internal support bundle: monitors (redacted), indices, Fleet policies, locations, param keys. */
  SYNTHETICS_DIAGNOSTICS = '/internal/synthetics/diagnostics',
}
