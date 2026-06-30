/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Public surface for the threat-intelligence "Intelligence Hub" common
 * shared types. Originated in the standalone threat-intelligence plugin's
 * `common/index.ts` and moved here when that plugin was folded into
 * `security_solution`. Experimental-feature flags previously re-exported
 * from this barrel live in
 * `x-pack/solutions/security/plugins/security_solution/common/experimental_features.ts`
 * — consume them from there.
 */
export type {
  SourceType,
  SeverityLevel,
  IocType,
  ThreatCategory,
  ThreatRegion,
  DetectionActionability,
  ReportSortBy,
  TelemetryProbeTier,
  HuntTier2When,
} from './constants';
export {
  PLUGIN_ID,
  PLUGIN_NAME,
  THREAT_INTELLIGENCE_FEATURE_ID,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
  GLOBAL_SPACE_ID,
  THREAT_REPORTS_DATA_STREAM,
  THREAT_REPORTS_INDEX_PATTERN,
  THREAT_INTEL_SOURCES_INDEX,
  THREAT_INTEL_SUBSCRIPTIONS_INDEX,
  THREAT_INTEL_DIGESTS_INDEX,
  THREAT_INTEL_INDICATORS_INDEX,
  THREAT_INTEL_ADVISORIES_INDEX,
  INDICATOR_REFERENCE_PREFIX,
  THREAT_INTEL_TOOL_IDS,
  THREAT_INTELLIGENCE_SKILL_ID,
  SOURCE_TYPES,
  SEVERITY_LEVELS,
  IOC_TYPES,
  THREAT_CATEGORIES,
  THREAT_REGIONS,
  DETECTION_ACTIONABILITY_LEVELS,
  REPORT_SORT_OPTIONS,
  TELEMETRY_PROBE_TIERS,
  HUNT_TIER2_WHEN_OPTIONS,
  HUNT_FOR_THREAT_INDEX_PATTERNS,
  THREAT_INTELLIGENCE_API_BASE,
  SEARCH_REPORTS_API_PATH,
  INGEST_REPORT_API_PATH,
  HUNT_BEHAVIOR_API_PATH,
  HUNT_FOR_THREAT_API_PATH,
  HUNT_ORCHESTRATED_API_PATH,
  SYNTHESIZE_ADVISORY_API_PATH,
  COVERAGE_GAP_API_PATH,
  GENERALIZE_FROM_TELEMETRY_API_PATH,
  EXTRACT_IOCS_API_PATH,
  ANALYSE_ENVIRONMENT_API_PATH,
  EXTRACT_DIAMOND_API_PATH,
  ENRICH_TAXONOMY_API_PATH,
  BACKFILL_DIAMOND_API_PATH,
  DIAMOND_INFERENCE_ENDPOINT_ID,
  SUBMIT_SUBSCRIPTION_API_PATH,
  LIST_SUBSCRIPTIONS_API_PATH,
  DELETE_SUBSCRIPTION_API_PATH,
  DASHBOARD_OVERVIEW_API_PATH,
  SAVED_VIEWS_API_PATH,
  FLYOUT_INSIGHTS_API_PATH,
  SEARCH_BY_ANCHORS_API_PATH,
  SEARCH_BY_DIAMOND_API_PATH,
  CORRELATE_THREAT_API_PATH,
  CORRELATION_RUNS_API_PATH,
  CORRELATION_RUN_BY_ID_API_PATH,
  getCorrelationRunsIndexName,
  CORRELATION_RUN_STALE_MS,
  CORRELATION_RUNS_MAX_CONCURRENT,
  SAVED_VIEW_SO_TYPE,
  DEFAULT_REGIONS_SETTING_KEY,
  DIAMOND_GATE_CONNECTOR_SETTING_KEY,
  DIAMOND_CONNECTOR_SETTING_KEY,
  TRIAGE_CONNECTOR_SETTING_KEY,
  SYNTHESIS_CONNECTOR_SETTING_KEY,
  TRIAGE_CONFIDENCE_FLOOR_SETTING_KEY,
  TRIAGE_TOP_N_SETTING_KEY,
  KNN_STRONG_FLOOR,
  KNN_MID_FLOOR,
  KNN_BASE_FLOOR,
} from './constants';
export {
  THREAT_CATEGORY_LABELS,
  THREAT_CATEGORY_BADGE_STYLES,
  getThreatCategoryLabel,
  getThreatCategoryBadgeStyle,
} from './threat_category_labels';
export type {
  FlyoutInsightsRequest,
  FlyoutInsightsResponse,
  FlyoutInsightsRelatedReport,
  RelatedReportJoinReason,
} from './flyout_insights_types';
export type { SubscriptionTemplate, SubscriptionTemplateId } from './subscription_templates';
export {
  SUBSCRIPTION_TEMPLATES,
  SUBSCRIPTION_TEMPLATE_IDS,
  getSubscriptionTemplate,
} from './subscription_templates';
export type { BehaviorExport, AtomicIocExport, AtomicEsqlProposal } from './rule_export';
export type {
  TelemetryProbe,
  TelemetryProbeContext,
  TelemetryProbeInput,
  TelemetryProbeMatch,
  TelemetryProbeProposedRule,
  TelemetryProbeRegistry,
  TelemetryProbeResult,
  TelemetryProbeStatus,
} from './telemetry_probe';
export {
  proposedEsqlRule,
  proposedAtomicEsqlRule,
  proposeAtomicEsqlFromIocs,
  sanitizeRuleName,
  severityToRiskScore,
  severityFromConfidence,
} from './rule_export';
export type { DashboardLatestAdvisory, DashboardOverviewResponse } from './dashboard_types';
export type { ResolvedTimeRange, TimeRangePresetId } from './time_range';
export {
  DEFAULT_TIME_RANGE_PRESET,
  TIME_RANGE_PRESET_IDS,
  isTimeRangePresetId,
  resolveTimeRangeFromPreset,
} from './time_range';
export type { SavedViewAttributes, SavedViewSummary } from './saved_views';
export type { ReportTableScope } from './attachment_payloads';
export { resolveOverviewQueryFromScope } from './resolve_scope_overview';
export type { CoverageRecommendation } from './attachment_payloads';
export type {
  MitreHeatmapPayload,
  ReportTablePayload,
  SeverityTimelinePayload,
  SubscriptionConfirmationPayload,
  FindingCardPayload,
} from './attachment_payloads';
export { THREAT_INTEL_ATTACHMENT_TYPES } from './attachment_type_ids';
export type { ThreatIntelAttachmentType } from './attachment_type_ids';
export type { ThreatIntelUiHint, ThreatIntelUiHintsEnvelope } from './ui_hints';
export {
  buildSearchReportsUiHints,
  buildCoverageGapUiHints,
  buildFindingCardUiHints,
  withUiHints,
} from './ui_hints_builders';
export {
  formatTimeRangeLabel,
  mapSearchReportHitToTableRow,
  buildReportTablePayloadFromSearch,
  type SearchReportHit,
} from './report_table_rows';
