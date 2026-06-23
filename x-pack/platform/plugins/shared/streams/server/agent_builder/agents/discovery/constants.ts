/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools, platformStreamsSigEventsTools } from '@kbn/agent-builder-common/tools';

// Not available in platformCoreTools, but exported from @kbn/observability-agent-builder-plugin
export const OBSERVABILITY_GET_LOGS_TOOL_ID = 'observability.get_logs';
export const OBSERVABILITY_GET_INDEX_INFO_TOOL_ID = 'observability.get_index_info';
export const OBSERVABILITY_GET_SERVICE_TOPOLOGY_TOOL_ID = 'observability.get_service_topology';
export const OBSERVABILITY_GET_TRACE_METRICS_TOOL_ID = 'observability.get_trace_metrics';
export const OBSERVABILITY_GET_LOG_CHANGE_POINTS_TOOL_ID = 'observability.get_log_change_points';
export const OBSERVABILITY_GET_METRIC_CHANGE_POINTS_TOOL_ID =
  'observability.get_metric_change_points';
export const OBSERVABILITY_GET_SERVICES_TOOL_ID = 'observability.get_services';
export const OBSERVABILITY_GET_TRACES_TOOL_ID = 'observability.get_traces';

export const SIGNIFICANT_EVENTS_DISCOVERY_TOOL_IDS = [
  platformStreamsSigEventsTools.searchKnowledgeIndicators,
  platformCoreTools.executeEsql,
] as const;
