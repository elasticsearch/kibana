/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import { platformCoreTools, platformStreamsSigEventsTools } from '@kbn/agent-builder-common';
import type { StaticToolRegistration } from '@kbn/agent-builder-server';
import type {
  ObservabilityAgentBuilderCoreSetup,
  ObservabilityAgentBuilderPluginSetupDependencies,
} from '../types';
import type { ObservabilityAgentBuilderDataRegistry } from '../data_registry/data_registry';
import {
  OBSERVABILITY_RUN_LOG_RATE_ANALYSIS_TOOL_ID,
  createRunLogRateAnalysisTool,
} from './run_log_rate_analysis/tool';
import {
  OBSERVABILITY_GET_ANOMALY_DETECTION_JOBS_TOOL_ID,
  createGetAnomalyDetectionJobsTool,
} from './get_anomaly_detection_jobs/tool';
import { OBSERVABILITY_GET_ALERTS_TOOL_ID, createGetAlertsTool } from './get_alerts/tool';
import {
  OBSERVABILITY_GET_LOG_GROUPS_TOOL_ID,
  createGetLogGroupsTool,
} from './get_log_groups/tool';
import { OBSERVABILITY_GET_HOSTS_TOOL_ID, createGetHostsTool } from './get_hosts/tool';
import { createGetServicesTool, OBSERVABILITY_GET_SERVICES_TOOL_ID } from './get_services/tool';
import {
  createGetTraceMetricsTool,
  OBSERVABILITY_GET_TRACE_METRICS_TOOL_ID,
} from './get_trace_metrics/tool';
import {
  createGetRuntimeMetricsTool,
  OBSERVABILITY_GET_RUNTIME_METRICS_TOOL_ID,
} from './get_runtime_metrics/tool';
import {
  OBSERVABILITY_GET_LOG_CHANGE_POINTS_TOOL_ID,
  createGetLogChangePointsTool,
} from './get_log_change_points/tool';
import {
  OBSERVABILITY_GET_METRIC_CHANGE_POINTS_TOOL_ID,
  createGetMetricChangePointsTool,
} from './get_metric_change_points/tool';
import {
  OBSERVABILITY_GET_TRACE_CHANGE_POINTS_TOOL_ID,
  createGetTraceChangePointsTool,
} from './get_trace_change_points/tool';
import { OBSERVABILITY_GET_INDEX_INFO_TOOL_ID, createGetIndexInfoTool } from './get_index_info';
import {
  OBSERVABILITY_GET_SERVICE_TOPOLOGY_TOOL_ID,
  createGetServiceTopologyTool,
} from './get_service_topology/tool';
import { OBSERVABILITY_GET_TRACES_TOOL_ID, createGetTracesTool } from './get_traces/tool';
import { OBSERVABILITY_GET_LOGS_TOOL_ID, createGetLogsTool } from './get_logs/tool';
import {
  OBSERVABILITY_GET_APM_CORRELATIONS_TOOL_ID,
  createGetApmCorrelationsTool,
} from './get_apm_correlations/tool';
import {
  OBSERVABILITY_GET_APM_TIMESERIES_TOOL_ID,
  createGetApmTimeseriesTool,
} from './get_apm_timeseries/tool';
import {
  OBSERVABILITY_GET_APM_METRICS_TOOL_ID,
  createGetApmMetricsTool,
} from './get_apm_metrics/tool';

export const PLATFORM_TOOL_IDS = [
  platformCoreTools.listIndices,
  platformCoreTools.getIndexMapping,
  platformCoreTools.getDocumentById,
  platformCoreTools.productDocumentation,
  platformStreamsSigEventsTools.searchKnowledgeIndicators,
];

export const OBSERVABILITY_TOOL_IDS = [
  OBSERVABILITY_RUN_LOG_RATE_ANALYSIS_TOOL_ID,
  OBSERVABILITY_GET_ANOMALY_DETECTION_JOBS_TOOL_ID,
  OBSERVABILITY_GET_ALERTS_TOOL_ID,
  OBSERVABILITY_GET_LOG_GROUPS_TOOL_ID,
  OBSERVABILITY_GET_SERVICES_TOOL_ID,
  OBSERVABILITY_GET_HOSTS_TOOL_ID,
  OBSERVABILITY_GET_TRACE_METRICS_TOOL_ID,
  OBSERVABILITY_GET_TRACES_TOOL_ID,
  OBSERVABILITY_GET_RUNTIME_METRICS_TOOL_ID,
  OBSERVABILITY_GET_LOG_CHANGE_POINTS_TOOL_ID,
  OBSERVABILITY_GET_METRIC_CHANGE_POINTS_TOOL_ID,
  OBSERVABILITY_GET_TRACE_CHANGE_POINTS_TOOL_ID,
  OBSERVABILITY_GET_INDEX_INFO_TOOL_ID,
  OBSERVABILITY_GET_SERVICE_TOPOLOGY_TOOL_ID,
  OBSERVABILITY_GET_LOGS_TOOL_ID,
  OBSERVABILITY_GET_APM_CORRELATIONS_TOOL_ID,
  OBSERVABILITY_GET_APM_TIMESERIES_TOOL_ID,
  OBSERVABILITY_GET_APM_METRICS_TOOL_ID,
];

export async function registerTools({
  core,
  plugins,
  dataRegistry,
  logger,
}: {
  core: ObservabilityAgentBuilderCoreSetup;
  plugins: ObservabilityAgentBuilderPluginSetupDependencies;
  dataRegistry: ObservabilityAgentBuilderDataRegistry;
  logger: Logger;
}) {
  const observabilityTools: StaticToolRegistration<any>[] = [
    createRunLogRateAnalysisTool({ core, logger }),
    createGetAnomalyDetectionJobsTool({ core, plugins, logger }),
    createGetAlertsTool({ core, logger }),
    createGetLogGroupsTool({ core, plugins, logger }),
    createGetServicesTool({ core, plugins, dataRegistry, logger }),
    createGetHostsTool({ core, logger, dataRegistry }),
    createGetTraceMetricsTool({ core, plugins, logger }),
    createGetTracesTool({ core, plugins, logger }),
    createGetRuntimeMetricsTool({ core, plugins, logger }),
    createGetLogChangePointsTool({ core, plugins, logger }),
    createGetMetricChangePointsTool({ core, plugins, logger }),
    createGetTraceChangePointsTool({ core, plugins, logger }),
    createGetIndexInfoTool({ core, plugins, logger }),
    createGetServiceTopologyTool({ core, plugins, dataRegistry, logger }),
    createGetLogsTool({ core, logger }),
    createGetApmCorrelationsTool({ core, plugins, logger }),
    createGetApmTimeseriesTool({ core, plugins, dataRegistry, logger }),
    createGetApmMetricsTool({ core, plugins, dataRegistry, logger }),
  ];

  for (const tool of observabilityTools) {
    plugins.agentBuilder.tools.register(tool);
  }
}
