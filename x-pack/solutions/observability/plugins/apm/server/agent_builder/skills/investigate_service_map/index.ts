/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import {
  OBSERVABILITY_GET_ALERTS_TOOL_ID,
  OBSERVABILITY_GET_LOG_GROUPS_TOOL_ID,
  OBSERVABILITY_GET_SERVICE_TOPOLOGY_TOOL_ID,
  OBSERVABILITY_GET_SERVICES_TOOL_ID,
  OBSERVABILITY_GET_TRACE_METRICS_TOOL_ID,
} from '@kbn/observability-agent-builder-plugin/server/tools';
import investigateServiceMapDescription from './description.text';
import investigateServiceMapContent from './skill.md.text';

const INVESTIGATE_SERVICE_MAP_TOOL_IDS = [
  OBSERVABILITY_GET_ALERTS_TOOL_ID,
  OBSERVABILITY_GET_SERVICES_TOOL_ID,
  OBSERVABILITY_GET_SERVICE_TOPOLOGY_TOOL_ID,
  OBSERVABILITY_GET_TRACE_METRICS_TOOL_ID,
  OBSERVABILITY_GET_LOG_GROUPS_TOOL_ID,
];

export const createInvestigateServiceMapSkill = () =>
  defineSkillType({
    id: 'observability.investigate-service-map',
    name: 'investigate-service-map',
    basePath: 'skills/observability',
    description: investigateServiceMapDescription,
    content: investigateServiceMapContent,
    getRegistryTools: () => INVESTIGATE_SERVICE_MAP_TOOL_IDS,
  });
