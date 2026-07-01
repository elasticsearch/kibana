/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  platformCoreTools,
  platformCoreCasesTools,
  platformStreamsSigEventsTools,
} from '@kbn/agent-builder-common/tools';
import { internalNamespaces } from '@kbn/agent-builder-common/base/namespaces';

/**
 * This is a manually maintained list of all built-in tools registered in Agent Builder.
 * The intention is to force a code review from the Agent Builder team when any team adds a new tool.
 */
export const AGENT_BUILDER_BUILTIN_TOOLS = [
  // platform core tools are registered from the agent builder plugin so will trigger a review anyway
  ...Object.values(platformCoreTools),
  // Cases CRUD tools, registered by the Cases plugin
  ...Object.values(platformCoreCasesTools),
  // Streams / Significant Events
  ...Object.values(platformStreamsSigEventsTools),

  // Alerting
  `${internalNamespaces.platformAlerting}.manage_rule`,

  // Observability
  `${internalNamespaces.observability}.get_anomaly_detection_jobs`,
  `${internalNamespaces.observability}.run_log_rate_analysis`,
  `${internalNamespaces.observability}.get_log_groups`,
  `${internalNamespaces.observability}.get_alerts`,
  `${internalNamespaces.observability}.get_services`,
  `${internalNamespaces.observability}.get_hosts`,
  `${internalNamespaces.observability}.get_trace_metrics`,
  `${internalNamespaces.observability}.get_log_change_points`,
  `${internalNamespaces.observability}.get_metric_change_points`,
  `${internalNamespaces.observability}.get_index_info`,
  `${internalNamespaces.observability}.get_trace_change_points`,
  `${internalNamespaces.observability}.get_service_topology`,
  `${internalNamespaces.observability}.get_traces`,
  `${internalNamespaces.observability}.get_runtime_metrics`,
  `${internalNamespaces.observability}.get_logs`,
  `${internalNamespaces.observability}.get_apm_correlations`,

  // Security Solution
  `${internalNamespaces.security}.entity_risk_score`,
  `${internalNamespaces.security}.create_detection_rule`,
  `${internalNamespaces.security}.run_rule_preview`,
  `${internalNamespaces.security}.attack_discovery_search`,
  `${internalNamespaces.security}.security_labs_search`,
  `${internalNamespaces.security}.alerts`,
  `${internalNamespaces.security}.get_entity`,
  `${internalNamespaces.security}.search_entities`,
  `${internalNamespaces.security}.pci_scope_discovery`,
  `${internalNamespaces.security}.pci_compliance`,
  `${internalNamespaces.security}.pci_field_mapper`,
  `${internalNamespaces.security}.siem_readiness.get_coverage`,
  `${internalNamespaces.security}.siem_readiness.get_quality`,
  `${internalNamespaces.security}.siem_readiness.get_continuity`,
  `${internalNamespaces.security}.siem_readiness.get_retention`,

  // Streams
  `${internalNamespaces.streams}.inspect_streams`,
  `${internalNamespaces.streams}.diagnose_stream`,
  `${internalNamespaces.streams}.query_documents`,
  `${internalNamespaces.streams}.design_pipeline`,
  `${internalNamespaces.streams}.list_ilm_policies`,
  `${internalNamespaces.streams}.update_stream`,
  `${internalNamespaces.streams}.create_partition`,
  `${internalNamespaces.streams}.delete_stream`,

  // Workflows
  `${internalNamespaces.workflows}.validate_workflow`,
  `${internalNamespaces.workflows}.get_step_definitions`,
  `${internalNamespaces.workflows}.get_trigger_definitions`,
  `${internalNamespaces.workflows}.get_connectors`,
  `${internalNamespaces.workflows}.list_workflows`,
  `${internalNamespaces.workflows}.get_workflow`,
  `${internalNamespaces.workflows}.get_examples`,
  `${internalNamespaces.workflows}.workflow_execute_step`,
] as const;

export type AgentBuilderBuiltinTool = (typeof AGENT_BUILDER_BUILTIN_TOOLS)[number];

/**
 * This is a manually maintained list of all built-in agents registered in Agent Builder.
 * The intention is to force a code review from the Agent Builder team when any team adds a new agent.
 */
export const AGENT_BUILDER_BUILTIN_AGENTS = [
  `${internalNamespaces.search}.agent`,
  `${internalNamespaces.security}.agent`,
  `${internalNamespaces.streams}.significant-events.discovery.investigator`,
  `${internalNamespaces.streams}.significant-events.discovery.judge`,
  `${internalNamespaces.streams}.investigation`,
] as const;

export type AgentBuilderBuiltinAgent = (typeof AGENT_BUILDER_BUILTIN_AGENTS)[number];

export const isAllowedBuiltinTool = (toolName: string) => {
  return (AGENT_BUILDER_BUILTIN_TOOLS as readonly string[]).includes(toolName);
};

export const isAllowedBuiltinAgent = (agentName: string) => {
  return (AGENT_BUILDER_BUILTIN_AGENTS as readonly string[]).includes(agentName);
};

/**
 * This is a manually maintained list of all built-in skills registered in Agent Builder.
 * The intention is to force a code review from the Agent Builder team when any team adds a new skill.
 */
export const AGENT_BUILDER_BUILTIN_SKILLS = [
  // Platform
  'data-exploration',
  'visualization-creation',
  'graph-creation',
  'agent-builder-traces',

  // Platform – Cases
  'cases-management',

  // Platform – Alerting
  'rule-management',

  // Platform – Dashboard
  'dashboard-management',

  // Platform – Discover
  'discover-data-analysis',

  // Platform – Streams
  'streams-management',
  'significant-events-memory',
  'significant-events-management',
  'streams-investigation-management',
  'knowledge-indicators-management',
  'ki-identification-management',
  'streams-memory-synthesis',
  'streams-memory-consolidation',
  'streams-conversation-scraper',
  'significant-events-onboarding',
  'streams-gap-detection',

  // Platform – Workflows
  'workflow-authoring',

  // Security Solution
  'find-security-ml-jobs',
  'automatic_troubleshooting',
  'entity-analytics',
  'alert-analysis',
  'detection-rule-edit',
  'recommend-prebuilt-rules',
  'threat-hunting',
  'find-security-rules',
  'pci-compliance',
  'siem-readiness',

  // O11Y
  'observability.rca',
  'observability.investigation',
  'observability.service-map',

  // Search
  `${internalNamespaces.search}.keyword-search`,
  `${internalNamespaces.search}.catalog-ecommerce`,
  `${internalNamespaces.search}.elasticsearch-onboarding`,
  `${internalNamespaces.search}.vector-hybrid-search`,
  `${internalNamespaces.search}.rag-chatbot`,
  `${internalNamespaces.search}.use-case-library`,
  `${internalNamespaces.search}.elasticsearch-tutorial`,
  'skill-authoring',
  'connector-authoring',
] as const;

export type AgentBuilderBuiltinSkill = (typeof AGENT_BUILDER_BUILTIN_SKILLS)[number];

export const isAllowedBuiltinSkill = (skillId: string) => {
  return (AGENT_BUILDER_BUILTIN_SKILLS as readonly string[]).includes(skillId);
};

/**
 * This is a manually maintained list of all built-in plugins registered in Agent Builder.
 * The intention is to force a code review from the Agent Builder team when any team adds a new plugin.
 */
export const AGENT_BUILDER_BUILTIN_PLUGINS = [] as const;

export type AgentBuilderBuiltinPlugin = (typeof AGENT_BUILDER_BUILTIN_PLUGINS)[number];

export const isAllowedBuiltinPlugin = (pluginId: string) => {
  return (AGENT_BUILDER_BUILTIN_PLUGINS as readonly string[]).includes(pluginId);
};
