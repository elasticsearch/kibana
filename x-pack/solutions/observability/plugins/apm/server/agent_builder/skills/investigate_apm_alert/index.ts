/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import {
  OBSERVABILITY_GET_ALERTS_TOOL_ID,
  OBSERVABILITY_GET_APM_CORRELATIONS_TOOL_ID,
  OBSERVABILITY_GET_APM_METRICS_TOOL_ID,
  OBSERVABILITY_GET_APM_TIMESERIES_TOOL_ID,
  OBSERVABILITY_GET_HOSTS_TOOL_ID,
  OBSERVABILITY_GET_LOG_GROUPS_TOOL_ID,
  OBSERVABILITY_GET_LOGS_TOOL_ID,
  OBSERVABILITY_GET_RUNTIME_METRICS_TOOL_ID,
  OBSERVABILITY_GET_SERVICE_TOPOLOGY_TOOL_ID,
  OBSERVABILITY_GET_SERVICES_TOOL_ID,
  OBSERVABILITY_GET_TRACE_METRICS_TOOL_ID,
  OBSERVABILITY_GET_TRACES_TOOL_ID,
} from '@kbn/observability-agent-builder-plugin/server/tools';
import investigateApmAlertDescription from './description.text';
import investigateApmAlertContent from './skill.md.text';

const INVESTIGATE_APM_ALERT_TOOL_IDS = [
  OBSERVABILITY_GET_ALERTS_TOOL_ID,
  OBSERVABILITY_GET_SERVICES_TOOL_ID,
  OBSERVABILITY_GET_SERVICE_TOPOLOGY_TOOL_ID,
  OBSERVABILITY_GET_TRACE_METRICS_TOOL_ID,
  OBSERVABILITY_GET_TRACES_TOOL_ID,
  OBSERVABILITY_GET_LOG_GROUPS_TOOL_ID,
  OBSERVABILITY_GET_LOGS_TOOL_ID,
  OBSERVABILITY_GET_APM_CORRELATIONS_TOOL_ID,
  OBSERVABILITY_GET_RUNTIME_METRICS_TOOL_ID,
  OBSERVABILITY_GET_HOSTS_TOOL_ID,
  OBSERVABILITY_GET_APM_TIMESERIES_TOOL_ID,
  OBSERVABILITY_GET_APM_METRICS_TOOL_ID,
];

export const createInvestigateApmAlertSkill = () =>
  defineSkillType({
    id: 'observability.investigate-apm-alert',
    name: 'investigate-apm-alert',
    basePath: 'skills/observability',
    description: investigateApmAlertDescription,
    content: investigateApmAlertContent,
    getRegistryTools: () => INVESTIGATE_APM_ALERT_TOOL_IDS,
  });
