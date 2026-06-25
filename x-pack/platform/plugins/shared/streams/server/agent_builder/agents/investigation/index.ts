/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import type { BuiltInAgentDefinition } from '@kbn/agent-builder-server/agents';
import { platformCoreTools, platformStreamsSigEventsTools } from '@kbn/agent-builder-common/tools';
import instructions from './instructions/investigator.md.text';
import {
  OBSERVABILITY_GET_LOGS_TOOL_ID,
  OBSERVABILITY_GET_INDEX_INFO_TOOL_ID,
  OBSERVABILITY_GET_SERVICE_TOPOLOGY_TOOL_ID,
  OBSERVABILITY_GET_TRACE_METRICS_TOOL_ID,
  OBSERVABILITY_GET_LOG_CHANGE_POINTS_TOOL_ID,
  OBSERVABILITY_GET_METRIC_CHANGE_POINTS_TOOL_ID,
  OBSERVABILITY_GET_SERVICES_TOOL_ID,
  OBSERVABILITY_GET_TRACES_TOOL_ID,
} from '../discovery/constants';

export const STREAMS_INVESTIGATION_AGENT_ID = 'platform.streams.investigation';

const investigationAgent = {
  id: STREAMS_INVESTIGATION_AGENT_ID,
  name: 'Streams Investigator',
  description:
    'Investigates an observability issue by querying available signals (logs, traces, metrics), ' +
    'reasoning about causality direction, and producing a contributing-factors conclusion with supporting evidence.',
  labels: ['observability', 'streams', 'investigation', 'root-cause'],
  avatar_icon: 'logoElastic',
  configuration: {
    instructions,
    skill_ids: ['significant-events-memory', 'observability.investigation'],
    tools: [
      {
        tool_ids: [
          platformStreamsSigEventsTools.searchKnowledgeIndicators,
          platformCoreTools.executeEsql,
          platformCoreTools.generateEsql,
          OBSERVABILITY_GET_LOGS_TOOL_ID,
          OBSERVABILITY_GET_INDEX_INFO_TOOL_ID,
          OBSERVABILITY_GET_SERVICE_TOPOLOGY_TOOL_ID,
          OBSERVABILITY_GET_TRACE_METRICS_TOOL_ID,
          OBSERVABILITY_GET_LOG_CHANGE_POINTS_TOOL_ID,
          OBSERVABILITY_GET_METRIC_CHANGE_POINTS_TOOL_ID,
          OBSERVABILITY_GET_SERVICES_TOOL_ID,
          OBSERVABILITY_GET_TRACES_TOOL_ID,
        ],
      },
    ],
    // Explicit: smlSearch + executeConnectorSubAction let the agent discover and
    // invoke system connectors (e.g. source repositories) without hard-coding IDs.
    enable_elastic_capabilities: true,
  },
} as const satisfies BuiltInAgentDefinition;

export const registerInvestigationAgents = (agentBuilder: AgentBuilderPluginSetup): void => {
  agentBuilder.agents.register(investigationAgent);
};
