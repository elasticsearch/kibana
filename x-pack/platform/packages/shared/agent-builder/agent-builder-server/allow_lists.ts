/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  platformCoreTools,
  platformCoreCasesTools,
  platformSignificantEventsTools,
} from '@kbn/agent-builder-common/tools';
import { internalNamespaces } from '@kbn/agent-builder-common/base/namespaces';
import { chatAgentTypeId } from '@kbn/agent-builder-common';
import type { SkillDefinition } from './skills/type_definition';
import { ELASTIC_SKILLS_BASE_PATH } from './skills/type_definition';

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
  ...Object.values(platformSignificantEventsTools),

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

  // ML anomaly detection (Agent Builder skill tools)
  `${internalNamespaces.ml}.ad_get_job_info`,
  `${internalNamespaces.ml}.ad_create_job`,
  `${internalNamespaces.ml}.ad_manage_job_state`,
  `${internalNamespaces.ml}.ad_update_job_config`,
  `${internalNamespaces.ml}.query_anomalies`,

  // Security Solution
  `${internalNamespaces.security}.entity_risk_score`,
  `${internalNamespaces.security}.create_detection_rule`,
  `${internalNamespaces.security}.run_rule_preview`,
  `${internalNamespaces.security}.attack_discovery_search`,
  `${internalNamespaces.security}.security_labs_search`,
  `${internalNamespaces.security}.alerts`,
  `${internalNamespaces.security}.build_redirect_url`,
  `${internalNamespaces.security}.add_entities_to_watchlist`,
  `${internalNamespaces.security}.create_watchlist`,
  `${internalNamespaces.security}.delete_watchlist`,
  `${internalNamespaces.security}.get_entity`,
  `${internalNamespaces.security}.get_entity_graph`,
  `${internalNamespaces.security}.get_entity_risk_score_history`,
  `${internalNamespaces.security}.entity_relationship_history`,
  `${internalNamespaces.security}.list_watchlists`,
  `${internalNamespaces.security}.get_watchlist_id`,
  `${internalNamespaces.security}.remove_entities_from_watchlist`,
  `${internalNamespaces.security}.search_entities`,
  `${internalNamespaces.security}.update_watchlist`,
  `${internalNamespaces.security}.list_leads`,
  `${internalNamespaces.security}.generate_leads`,
  `${internalNamespaces.security}.dismiss_lead`,
  `${internalNamespaces.security}.set_asset_criticality`,
  `${internalNamespaces.security}.pci_scope_discovery`,
  `${internalNamespaces.security}.pci_compliance`,
  `${internalNamespaces.security}.pci_field_mapper`,
  `${internalNamespaces.security}.siem_readiness.get_coverage`,
  `${internalNamespaces.security}.siem_readiness.get_quality`,
  `${internalNamespaces.security}.siem_readiness.get_continuity`,
  `${internalNamespaces.security}.siem_readiness.get_retention`,
  `${internalNamespaces.security}.siem_migration.get_rule_migration`,
  `${internalNamespaces.security}.siem_migration.start_rule_migration`,
  `${internalNamespaces.security}.siem_migration.get_all_rule_migration_stats`,
  `${internalNamespaces.security}.siem_migration.get_migration_rules`,
  `${internalNamespaces.security}.siem_migration.get_rule_migration_stats`,
  `${internalNamespaces.security}.siem_migration.get_rule_migration_translation_stats`,
  `${internalNamespaces.security}.siem_migration.get_missing_rule_migration_resources`,
  `${internalNamespaces.security}.siem_migration.stop_rule_migration`,
  `${internalNamespaces.security}.siem_migration.update_rule_migration`,
  `${internalNamespaces.security}.siem_migration.delete_rule_migration`,
  `${internalNamespaces.security}.alert-triage`,

  // Streams
  `${internalNamespaces.streams}.inspect_streams`,
  `${internalNamespaces.streams}.diagnose_stream`,
  `${internalNamespaces.streams}.query_documents`,
  `${internalNamespaces.streams}.design_pipeline`,
  `${internalNamespaces.streams}.list_ilm_policies`,
  `${internalNamespaces.streams}.update_stream`,
  `${internalNamespaces.streams}.create_partition`,
  `${internalNamespaces.streams}.delete_stream`,

  // Custom content panels
  'custom_content_update_panel',

  // Platform – Context Engine
  `${internalNamespaces.platformContextEngine}.save_automation`,

  // Nightshift – Sandbox
  'nightshift_sandbox_bash',
  'nightshift_sandbox_view_file',
  'nightshift_sandbox_str_replace',
  'nightshift_sandbox_write_file',

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
] as const;

export type AgentBuilderBuiltinAgent = (typeof AGENT_BUILDER_BUILTIN_AGENTS)[number];

export const isAllowedBuiltinTool = (toolName: string): toolName is AgentBuilderBuiltinTool => {
  return (AGENT_BUILDER_BUILTIN_TOOLS as readonly string[]).includes(toolName);
};

export const isAllowedBuiltinAgent = (agentName: string): agentName is AgentBuilderBuiltinAgent => {
  return (AGENT_BUILDER_BUILTIN_AGENTS as readonly string[]).includes(agentName);
};

/**
 * This is a manually maintained list of all agent types registered in Agent Builder.
 * The intention is to force a code review from the Agent Builder team when any team adds a new agent type.
 */
export const AGENT_BUILDER_AGENT_TYPES = [
  chatAgentTypeId,
  `${internalNamespaces.platformSignificantEvents}.investigation-type`,
  `${internalNamespaces.platformSignificantEvents}.discovery-type`,
  `${internalNamespaces.security}.alertzero-type`,
  `${internalNamespaces.platformSignificantEvents}.feature-identification-type`,
] as const;

export type AgentBuilderAgentType = (typeof AGENT_BUILDER_AGENT_TYPES)[number];

export const isAllowedAgentType = (typeId: string): typeId is AgentBuilderAgentType => {
  return (AGENT_BUILDER_AGENT_TYPES as readonly string[]).includes(typeId);
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
  'cases-analytics',

  // Platform – Alerting
  'rule-management',
  'action-policy-management',

  // Platform – Dashboard
  'dashboard-management',

  // Platform – Discover
  'discover-data-analysis',
  'discover-session',

  // Platform – Streams
  'streams-management',
  'significant-events-memory',
  'significant-events-management',
  'significant-events-changepoint-analysis',
  'significant-events-ki-grounding',
  'significant-events-assessment',
  'streams-investigation-management',
  'knowledge-indicators-management',
  'ki-identification-management',
  'feature-identification',
  'streams-memory-synthesis',
  'streams-memory-consolidation',
  'streams-conversation-scraper',
  'significant-events-onboarding',
  'streams-gap-detection',

  // Platform – Context Engine
  'ki-retrieval',
  'analyze-and-improve',
  'context-engine-signals',
  'ai-index-sources',
  'ai-index-automations',

  // Platform – Workflows
  'workflow-authoring',

  // Evals
  'eval-experiment-authoring',

  // Security Solution
  'entity-analytics-leads',
  'find-security-ml-jobs',
  'automatic_troubleshooting',
  'entity-analytics',
  'manage-watchlists',
  'alert-analysis',
  'alert-triage',
  'detection-rule-edit',
  'recommend-prebuilt-rules',
  'threat-hunting',
  'find-security-rules',
  'detection-coverage',
  'pci-compliance',
  'endpoint-forensic-analysis',
  'investigate-rule',
  'siem-readiness',
  'automatic-migration-rules-start-migration',
  'automatic-migration-rules-summarize',
  'automatic-migration-rules-stop-migration',
  'automatic-migration-rules-update-migration',
  'automatic-migration-rules-delete-migration',
  'attack-discovery-alert-retrieval-builder',
  'attack-discovery-generator',
  'attack-discovery-workflow-troubleshooting',

  // O11Y
  'observability.rca',
  'observability.investigation',
  'observability.service-map',

  // ML
  `${internalNamespaces.ml}.anomaly-detection`,

  // Search
  `${internalNamespaces.search}.keyword-search`,
  `${internalNamespaces.search}.catalog-ecommerce`,
  `${internalNamespaces.search}.elasticsearch-onboarding`,
  `${internalNamespaces.search}.vector-hybrid-search`,
  `${internalNamespaces.search}.rag-chatbot`,
  `${internalNamespaces.search}.use-case-library`,
  `${internalNamespaces.search}.elasticsearch-tutorial`,
  'skill-management',
  'connector-authoring',
] as const;

export type AgentBuilderBuiltinSkill = (typeof AGENT_BUILDER_BUILTIN_SKILLS)[number];

export const isAllowedBuiltinSkill = (skillId: string): skillId is AgentBuilderBuiltinSkill => {
  return (AGENT_BUILDER_BUILTIN_SKILLS as readonly string[]).includes(skillId);
};

export const isAllowedSkillRegistration = (
  skill: Pick<SkillDefinition, 'id' | 'basePath'>
): boolean => {
  return isAllowedBuiltinSkill(skill.id) || skill.basePath === ELASTIC_SKILLS_BASE_PATH;
};

/**
 * This is a manually maintained list of all built-in plugins registered in Agent Builder.
 * The intention is to force a code review from the Agent Builder team when any team adds a new plugin.
 */
export const AGENT_BUILDER_BUILTIN_PLUGINS = [] as const;

export type AgentBuilderBuiltinPlugin = (typeof AGENT_BUILDER_BUILTIN_PLUGINS)[number];

export const isAllowedBuiltinPlugin = (pluginId: string): pluginId is AgentBuilderBuiltinPlugin => {
  return (AGENT_BUILDER_BUILTIN_PLUGINS as readonly string[]).includes(pluginId);
};

/**
 * This is a manually maintained list of all built-in attachment types registered in Agent Builder.
 * The intention is to force a code review from the Agent Builder team when any team adds a new attachment type.
 */
export const AGENT_BUILDER_BUILTIN_ATTACHMENTS = [
  // Platform (agent_builder_platform)
  'text',
  'screen_context',
  'esql',
  'graph',
  'connector',
  'connector_setup',
  'skill',
  'image',

  // Platform – Visualizations
  'visualization',

  // Platform – Dashboards
  'platform.dashboard.dashboard_state',

  // Platform – Streams (significant events)
  'platform.sig_event',
  'platform.ki_feature',
  'platform.sig_event_detection',

  // Platform – Discover
  'esql.query_results',
  'discover.session',

  // Platform – Workflows
  'workflow.yaml',
  'workflow.yaml.diff',

  // Platform – Context Engine
  'platform.context_engine.ai_index',

  // Platform – Cases
  'case',
  'cases',

  // Platform – Alerting v2
  'platform.alerting.rule',
  'platform.alerting.action_policy',
  'platform.alerting.episode',

  // Security Solution
  'security.alert',
  'security.alerts',
  'security.entity',
  'security.entity_analytics_dashboard',
  'security.entity_graph',
  'security.entity_risk_score_history',
  'security.rule',
  'security.siem_readiness',
  // gated behind experimentalFeatures.rulePreviewAttachmentEnabled
  'security.rule.preview',

  // Security Solution – Attack Discovery (discoveries plugin)
  // gated behind the workflows feature flag
  'diagnostic_report',

  // Observability
  'observability.ai_insight',
  'observability.error',
  'observability.alert',
  'observability.log',
  'observability.service',
  'observability.slo',
  'observability.host',
  'observability.transaction',
  'observability.synthetics_monitor',

  // Observability – APM
  'observability.service-map',

  // Platform – Custom Content
  'platform.custom_content.panel_context',
] as const;

export type AgentBuilderBuiltinAttachment = (typeof AGENT_BUILDER_BUILTIN_ATTACHMENTS)[number];

export const isAllowedBuiltinAttachment = (
  attachmentTypeId: string
): attachmentTypeId is AgentBuilderBuiltinAttachment => {
  return (AGENT_BUILDER_BUILTIN_ATTACHMENTS as readonly string[]).includes(attachmentTypeId);
};
