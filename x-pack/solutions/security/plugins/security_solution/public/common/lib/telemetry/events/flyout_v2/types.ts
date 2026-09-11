/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RootSchema } from '@kbn/core/public';

/** Whether the opened flyout was a top-level flyout or one of its child tools. */
export const FLYOUT_SURFACE = {
  FLYOUT: 'flyout',
  TOOL: 'tool',
} as const;
export type FlyoutSurface = (typeof FLYOUT_SURFACE)[keyof typeof FLYOUT_SURFACE];

/** Which top-level v2 (EUI-based, `overlays.openSystemFlyout`) flyout was opened or closed. */
export const FLYOUT_TYPE = {
  DOCUMENT: 'document',
  ATTACK: 'attack',
  IOC: 'ioc',
  NETWORK: 'network',
  RULE: 'rule',
  HOST: 'host',
  USER: 'user',
  SERVICE: 'service',
  GENERIC: 'generic',
  MISCONFIGURATION: 'misconfiguration',
  VULNERABILITY: 'vulnerability',
} as const;
export type FlyoutType = (typeof FLYOUT_TYPE)[keyof typeof FLYOUT_TYPE];

/** Which "tool" (child) flyout was opened or closed. */
export const FLYOUT_TOOL = {
  ANALYZER: 'analyzer',
  SESSION_VIEW: 'session_view',
  CORRELATIONS: 'correlations',
  ENTITIES: 'entities',
  RESPONSE: 'response',
  PREVALENCE: 'prevalence',
  THREAT_INTELLIGENCE: 'threat_intelligence',
  INVESTIGATION_GUIDE: 'investigation_guide',
  GRAPH: 'graph',
  NOTES: 'notes',
  RISK_INPUTS: 'risk_inputs',
  ANOMALY_INSIGHTS: 'anomaly_insights',
  ALERTS_INSIGHTS: 'alerts_insights',
  MISCONFIGURATION_INSIGHTS: 'misconfiguration_insights',
  VULNERABILITY_INSIGHTS: 'vulnerability_insights',
  ENTRA_INSIGHTS: 'entra_insights',
  OKTA_INSIGHTS: 'okta_insights',
  RESOLUTION: 'resolution',
  FIELDS_TABLE: 'fields_table',
  GRAPH_VIEW: 'graph_view',
} as const;
export type FlyoutTool = (typeof FLYOUT_TOOL)[keyof typeof FLYOUT_TOOL];

/**
 * Specific UI trigger the open action originated from, when known. Describes *where* the click
 * happened (a header badge, a footer menu item, a specific preview panel link, a graph node, ...)
 * rather than *which* tool/flyout it opened — that's already carried by `tool`/`flyoutType`.
 * Combine the two, e.g. `{ tool: FLYOUT_TOOL.NOTES, origin: FLYOUT_ORIGIN.FOOTER_TAKE_ACTION }`,
 * to distinguish otherwise-identical opens of the same tool from different buttons.
 */
export const FLYOUT_ORIGIN = {
  // Document/attack flyout header badge or footer "Take action" menu.
  // Header badge/button in the document or attack flyout.
  FLYOUT_HEADER: 'flyout_header',
  // "Take action" dropdown in the document flyout footer.
  FOOTER_TAKE_ACTION: 'footer_take_action',
  // Document flyout overview tab — preview section buttons.
  // Insights > Entities preview button.
  INSIGHTS_ENTITIES: 'insights_entities',
  // Insights > Threat Intelligence preview button.
  INSIGHTS_THREAT_INTEL: 'insights_threat_intel',
  // Insights > Correlations preview button.
  INSIGHTS_CORRELATIONS: 'insights_correlations',
  // Insights > Prevalence preview button.
  INSIGHTS_PREVALENCE: 'insights_prevalence',
  // Visualizations > Analyzer preview button.
  VISUALIZATIONS_ANALYZER: 'visualizations_analyzer',
  // Visualizations > Session View preview button.
  VISUALIZATIONS_SESSION_VIEW: 'visualizations_session_view',
  // Visualizations > Graph preview button.
  VISUALIZATIONS_GRAPH: 'visualizations_graph',
  // Investigation Guide preview button.
  INVESTIGATION_GUIDE: 'investigation_guide',
  // Response preview button.
  RESPONSE_SECTION: 'response_section',
  // About preview button.
  ABOUT_SECTION: 'about_section',
  // Entity flyout left panel — tool-open buttons in each detail section.
  // Risk Summary > entity name link.
  RISK_SUMMARY_ENTITY: 'risk_summary_entity',
  // Risk Summary > resolution link.
  RISK_SUMMARY_RESOLUTION: 'risk_summary_resolution',
  // Anomalies section open button.
  ANOMALIES_SECTION: 'anomalies_section',
  // Insights > Alerts open button.
  INSIGHTS_ALERTS: 'insights_alerts',
  // Insights > Misconfigurations open button.
  INSIGHTS_MISCONFIGURATION: 'insights_misconfiguration',
  // Insights > Vulnerabilities open button.
  INSIGHTS_VULNERABILITY: 'insights_vulnerability',
  // Resolution section open button.
  RESOLUTION_SECTION: 'resolution_section',
  // Fields section open button.
  FIELDS_SECTION: 'fields_section',
  // Inside an open tool flyout — clicks that open another flyout.
  // Graph tool: entity node.
  GRAPH_NODE: 'graph_node',
  // Graph tool: grouped entity node.
  GRAPH_GROUPED_NODE: 'graph_grouped_node',
  // Graph tool: document/alert node.
  GRAPH_DOCUMENT_NODE: 'graph_document_node',
  // Graph tool: network/IP node.
  GRAPH_NETWORK_NODE: 'graph_network_node',
  // Resolution tool: entity link.
  RESOLUTION_ENTITY_LINK: 'resolution_entity_link',
  // Tool header title button; reopens the parent document/entity flyout.
  TOOL_HEADER_TITLE: 'tool_header_title',
  // Entities tool: entity row.
  ENTITIES_LIST: 'entities_list',
  // Session view tool: process node.
  SESSION_VIEW_PROCESS: 'session_view_process',
  // Session view tool: alert badge.
  SESSION_VIEW_ALERT: 'session_view_alert',
  // Vulnerability insights tool: finding row.
  VULNERABILITY_FINDING: 'vulnerability_finding',
  // Misconfiguration insights tool: finding row.
  MISCONFIGURATION_FINDING: 'misconfiguration_finding',
  // Correlations tool: alert row.
  CORRELATIONS_ALERT: 'correlations_alert',
  // Alerts insights tool: alert row.
  ALERTS_INSIGHTS_ALERT: 'alerts_insights_alert',
  // Risk inputs tool: alert row.
  RISK_INPUTS_ALERT: 'risk_inputs_alert',
  // Clickable field value (host/user/IP/rule name) — three surfaces share the same renderer so
  // this is the only signal distinguishing them: overview/section panels, flyout table tab, or
  // a top-level table (alerts table, timeline, …).
  // Field value link in a flyout's overview/section panels.
  FLYOUT_FIELD_LINK: 'flyout_field_link',
  // Field value link in a flyout's own table tab.
  FLYOUT_TABLE_FIELD_LINK: 'flyout_table_field_link',
  // Field value link in a top-level table (alerts table, timeline, …).
  TABLE_FIELD_LINK: 'table_field_link',
  // Top-level entry points outside any open flyout.
  // Alerts table row.
  ALERTS_TABLE: 'alerts_table',
  // Discover document table row.
  DISCOVER_TABLE: 'discover_table',
  // Attacks table row.
  ATTACKS_TABLE: 'attacks_table',
  // Attacks KPI widget.
  ATTACKS_KPI: 'attacks_kpi',
  // Timeline event row.
  TIMELINE: 'timeline',
  // Case detail attachment.
  CASE_ATTACHMENT: 'case_attachment',
  // Legacy Analyzer (Resolver) graph node.
  RESOLVER_NODE: 'resolver_node',
  // Note preview document link.
  NOTE_PREVIEW: 'note_preview',
  // Threat intelligence table row.
  THREAT_INTEL_TABLE: 'threat_intel_table',
  // Asset Inventory grid row.
  ASSET_INVENTORY: 'asset_inventory',
  // Explore > Hosts table host link.
  HOSTS_TABLE: 'hosts_table',
  // Explore > Hosts > Uncommon processes table host link.
  UNCOMMON_PROCESSES_TABLE: 'uncommon_processes_table',
  // Explore > Hosts/Users > Authentications table entity link.
  AUTHENTICATIONS_TABLE: 'authentications_table',
  // Explore > Hosts > Host risk table host link.
  HOST_RISK_TABLE: 'host_risk_table',
  // Explore > Users table user link.
  USERS_TABLE: 'users_table',
  // Explore > Users > User risk table user link.
  USER_RISK_TABLE: 'user_risk_table',
  // Entity Analytics entities table row or grouped-row preview.
  ENTITIES_TABLE: 'entities_table',
  // Entity Analytics Entity Store list preview button.
  ENTITY_STORE_LIST: 'entity_store_list',
  // Entity Analytics dashboard risk score table entity link.
  ENTITY_ANALYTICS_RISK_SCORE: 'entity_analytics_risk_score',
  // Risk score management preview table entity link.
  RISK_SCORE_PREVIEW: 'risk_score_preview',
  // Entity attachment action in AI chat.
  AI_CHAT_ENTITY_ATTACHMENT: 'ai_chat_entity_attachment',
  // Privileged user monitoring users table.
  PRIVILEGED_USERS_TABLE: 'privileged_users_table',
  // Privileged access detection chart entity link.
  PRIVILEGED_ACCESS_DETECTION: 'privileged_access_detection',
  // Recent anomalies chart entity link.
  RECENT_ANOMALIES: 'recent_anomalies',
  // Threat hunting lead entity badge.
  THREAT_HUNTING_LEADS: 'threat_hunting_leads',
  // Flyout reconstructed from URL state during application mount.
  URL_RESTORE: 'url_restore',
  // "Analyze event" row-action button, shared across alerts table, timeline, and rule preview.
  ROW_ACTION: 'row_action',
  // Clickable alert-id chip in the Attack Summary / Background markdown section.
  ATTACK_SUMMARY_ALERT: 'attack_summary_alert',
} as const;
export type FlyoutOrigin = (typeof FLYOUT_ORIGIN)[keyof typeof FLYOUT_ORIGIN];

/**
 * Which tab was selected inside a flyout's main panel. Today every `useTabs` consumer uses
 * `'overview' | 'table' | 'json'`, but the reported event accepts any string (see
 * `ReportFlyoutTabClickedParams`) so the generic `useTabs` hook isn't coupled to this union.
 */
export const FLYOUT_TAB_ID = {
  OVERVIEW: 'overview',
  TABLE: 'table',
  JSON: 'json',
} as const;
export type FlyoutTabId = (typeof FLYOUT_TAB_ID)[keyof typeof FLYOUT_TAB_ID];

/**
 * Whether the flyout replaced the top-level session (`start`) or was nested inside the
 * currently open flyout's history stack (`inherit`). Mirrors
 * `OverlaySystemFlyoutOpenOptions['session']`.
 */
export const FLYOUT_SESSION_KIND = {
  START: 'start',
  INHERIT: 'inherit',
} as const;
export type FlyoutSessionKind = (typeof FLYOUT_SESSION_KIND)[keyof typeof FLYOUT_SESSION_KIND];

/** Which interactive control in the flyout header was clicked to open its popover. */
export const FLYOUT_HEADER_ITEM = {
  ASSIGNEES: 'assignees',
  STATUS: 'status',
} as const;
export type FlyoutHeaderItem = (typeof FLYOUT_HEADER_ITEM)[keyof typeof FLYOUT_HEADER_ITEM];

/**
 * Which action was clicked, from the document flyout's header controls or its footer's
 * "Take action" menu.
 */
export const FLYOUT_ACTION = {
  ADD_TO_CASE: 'add_to_case',
  STATUS_OPEN: 'status_open',
  STATUS_ACKNOWLEDGED: 'status_acknowledged',
  STATUS_CLOSED: 'status_closed',
  ADD_TAGS: 'add_tags',
  ADD_ASSIGNEES: 'add_assignees',
  REMOVE_ASSIGNEES: 'remove_assignees',
  ADD_ENDPOINT_EXCEPTION: 'add_endpoint_exception',
  ADD_RULE_EXCEPTION: 'add_rule_exception',
  ISOLATE_HOST: 'isolate_host',
  RUN_WORKFLOW: 'run_workflow',
  RESPOND: 'respond',
  RUN_OSQUERY: 'run_osquery',
  ADD_NOTE: 'add_note',
  INVESTIGATE_IN_TIMELINE: 'investigate_in_timeline',
  EXPLORE: 'explore',
} as const;
export type FlyoutActionType = (typeof FLYOUT_ACTION)[keyof typeof FLYOUT_ACTION];

export enum FlyoutV2EventTypes {
  FlyoutOpened = 'Flyout V2 Opened',
  FlyoutClosed = 'Flyout V2 Closed',
  FlyoutTabClicked = 'Flyout V2 Tab Clicked',
  FlyoutActionClicked = 'Flyout V2 Action Clicked',
  FlyoutHeaderItemClicked = 'Flyout V2 Header Item Clicked',
}

interface ReportFlyoutOpenedParams {
  surface: FlyoutSurface;
  flyoutType?: FlyoutType;
  tool?: FlyoutTool;
  session: FlyoutSessionKind;
  origin?: FlyoutOrigin;
}

interface ReportFlyoutClosedParams {
  flyoutType?: FlyoutType;
  tool?: FlyoutTool;
  session: FlyoutSessionKind;
  durationMs: number;
}

interface ReportFlyoutTabClickedParams {
  flyoutType: FlyoutType;
  tabId: string;
}

interface ReportFlyoutActionClickedParams {
  flyoutType: FlyoutType;
  action: FlyoutActionType;
}

interface ReportFlyoutHeaderItemClickedParams {
  flyoutType: FlyoutType;
  item: FlyoutHeaderItem;
}

export interface FlyoutV2TelemetryEventsMap {
  [FlyoutV2EventTypes.FlyoutOpened]: ReportFlyoutOpenedParams;
  [FlyoutV2EventTypes.FlyoutClosed]: ReportFlyoutClosedParams;
  [FlyoutV2EventTypes.FlyoutTabClicked]: ReportFlyoutTabClickedParams;
  [FlyoutV2EventTypes.FlyoutActionClicked]: ReportFlyoutActionClickedParams;
  [FlyoutV2EventTypes.FlyoutHeaderItemClicked]: ReportFlyoutHeaderItemClickedParams;
}

export interface FlyoutV2TelemetryEvent {
  eventType: FlyoutV2EventTypes;
  schema: RootSchema<FlyoutV2TelemetryEventsMap[FlyoutV2EventTypes]>;
}
