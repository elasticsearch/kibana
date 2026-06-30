/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
// NOTE: Do not import from '../types/domain' here to avoid circular dependencies
// (types/domain -> constants/index -> constants/attachments -> types/domain).
// Use string literals for legacy type names instead.

import { SECURITY_SOLUTION_OWNER, OBSERVABILITY_OWNER, GENERAL_CASES_OWNER } from './owners';

// ----------------Unified attachment types-------------------------
export const COMMENT_ATTACHMENT_TYPE = 'comment';
export const SECURITY_EVENT_ATTACHMENT_TYPE = 'security.event';
export const SECURITY_ALERT_ATTACHMENT_TYPE = 'security.alert';
export const OBSERVABILITY_ALERT_ATTACHMENT_TYPE = 'observability.alert';
export const STACK_ALERT_ATTACHMENT_TYPE = 'stack.alert';
export const SECURITY_ENDPOINT_ATTACHMENT_TYPE = 'security.endpoint';
export const FILE_ATTACHMENT_TYPE = 'file';
export const LENS_ATTACHMENT_TYPE = 'lens';
export const OSQUERY_ATTACHMENT_TYPE = 'osquery';
export const INDICATOR_ATTACHMENT_TYPE = 'security.indicator';
// type with no legacy v1 equivalent, so it is intentionally absent from the legacy maps.
export const SECURITY_ENTITY_ATTACHMENT_TYPE = 'security.entity';
export const SECURITY_TIMELINE_ATTACHMENT_TYPE = 'security.timeline';

export const ML_ANOMALY_SWIMLANE_ATTACHMENT_TYPE = 'ml.anomaly_swimlane';
export const ML_ANOMALY_CHARTS_ATTACHMENT_TYPE = 'ml.anomaly_charts';
export const ML_SINGLE_METRIC_VIEWER_ATTACHMENT_TYPE = 'ml.single_metric_viewer';
export const AIOPS_CHANGE_POINT_CHART_ATTACHMENT_TYPE = 'aiops.change_point_chart';
export const AIOPS_PATTERN_ANALYSIS_ATTACHMENT_TYPE = 'aiops.pattern_analysis';
export const AIOPS_LOG_RATE_ANALYSIS_ATTACHMENT_TYPE = 'aiops.log_rate_analysis';

export const DASHBOARD_ATTACHMENT_TYPE = 'dashboard';
export const DISCOVER_SESSION_ATTACHMENT_TYPE = 'discoverSession';
export const MAP_ATTACHMENT_TYPE = 'map';

/**
 * Saved-object type identifiers as understood by core saved-objects and the
 * management `_find` API.
 */
export const DASHBOARD_SO_TYPE = 'dashboard';
export const MAP_SO_TYPE = 'map';
export const DISCOVER_SESSION_SO_TYPE = 'search';

// ----------------Legacy attachment types-------------------------
export const LEGACY_ACTIONS_TYPE = 'actions';
export const LEGACY_ALERT_TYPE = 'alert';
export const LEGACY_EVENT_TYPE = 'event';
export const LEGACY_EXTERNAL_REFERENCE_TYPE = 'externalReference';
export const LEGACY_PERSISTABLE_STATE_TYPE = 'persistableState';
export const LEGACY_USER_TYPE = 'user';

export const LEGACY_FILE_ATTACHMENT_TYPE = '.files';
export const LEGACY_INDICATOR_ATTACHMENT_TYPE = 'indicator';

export const LEGACY_LENS_ATTACHMENT_TYPE = '.lens';
export const LEGACY_ML_ANOMALY_SWIMLANE_ATTACHMENT_TYPE = 'ml_anomaly_swimlane';
export const LEGACY_ML_ANOMALY_CHARTS_ATTACHMENT_TYPE = 'ml_anomaly_charts';
export const LEGACY_ML_SINGLE_METRIC_VIEWER_ATTACHMENT_TYPE = 'ml_single_metric_viewer';
export const LEGACY_AIOPS_CHANGE_POINT_CHART_ATTACHMENT_TYPE = 'aiopsChangePointChart';
export const LEGACY_AIOPS_PATTERN_ANALYSIS_ATTACHMENT_TYPE = 'aiopsPatternAnalysisEmbeddable';
export const LEGACY_AIOPS_LOG_RATE_ANALYSIS_ATTACHMENT_TYPE = 'aiopsLogRateAnalysisEmbeddable';

/**
 * Mapping from legacy externalReferenceAttachmentTypeId to unified type name.
 * Used by the generic externalReference transformer to resolve the unified type.
 */
export const EXTERNAL_REFERENCE_TYPE_MAP: Record<string, string> = {
  endpoint: SECURITY_ENDPOINT_ATTACHMENT_TYPE,
  [LEGACY_FILE_ATTACHMENT_TYPE]: FILE_ATTACHMENT_TYPE,
  [OSQUERY_ATTACHMENT_TYPE]: OSQUERY_ATTACHMENT_TYPE,
  [LEGACY_INDICATOR_ATTACHMENT_TYPE]: INDICATOR_ATTACHMENT_TYPE,
} as const;

export const LEGACY_ATTACHMENT_TYPES = new Set([
  LEGACY_ACTIONS_TYPE,
  LEGACY_ALERT_TYPE,
  LEGACY_EVENT_TYPE,
  LEGACY_EXTERNAL_REFERENCE_TYPE,
  LEGACY_PERSISTABLE_STATE_TYPE,
  LEGACY_USER_TYPE,
]);

export const UNIFIED_ATTACHMENT_TYPES = new Set([
  COMMENT_ATTACHMENT_TYPE,
  SECURITY_EVENT_ATTACHMENT_TYPE,
  SECURITY_ALERT_ATTACHMENT_TYPE,
  OBSERVABILITY_ALERT_ATTACHMENT_TYPE,
  STACK_ALERT_ATTACHMENT_TYPE,
  SECURITY_ENDPOINT_ATTACHMENT_TYPE,
  FILE_ATTACHMENT_TYPE,
  OSQUERY_ATTACHMENT_TYPE,
  INDICATOR_ATTACHMENT_TYPE,
  SECURITY_ENTITY_ATTACHMENT_TYPE,
  SECURITY_TIMELINE_ATTACHMENT_TYPE,
  DASHBOARD_ATTACHMENT_TYPE,
  DISCOVER_SESSION_ATTACHMENT_TYPE,
  MAP_ATTACHMENT_TYPE,
]);

export const PERSISTABLE_STATE_LEGACY_TO_UNIFIED_MAP: Record<string, string> = {
  [LEGACY_LENS_ATTACHMENT_TYPE]: LENS_ATTACHMENT_TYPE,
  [LEGACY_ML_ANOMALY_SWIMLANE_ATTACHMENT_TYPE]: ML_ANOMALY_SWIMLANE_ATTACHMENT_TYPE,
  [LEGACY_ML_ANOMALY_CHARTS_ATTACHMENT_TYPE]: ML_ANOMALY_CHARTS_ATTACHMENT_TYPE,
  [LEGACY_ML_SINGLE_METRIC_VIEWER_ATTACHMENT_TYPE]: ML_SINGLE_METRIC_VIEWER_ATTACHMENT_TYPE,
  [LEGACY_AIOPS_CHANGE_POINT_CHART_ATTACHMENT_TYPE]: AIOPS_CHANGE_POINT_CHART_ATTACHMENT_TYPE,
  [LEGACY_AIOPS_PATTERN_ANALYSIS_ATTACHMENT_TYPE]: AIOPS_PATTERN_ANALYSIS_ATTACHMENT_TYPE,
  [LEGACY_AIOPS_LOG_RATE_ANALYSIS_ATTACHMENT_TYPE]: AIOPS_LOG_RATE_ANALYSIS_ATTACHMENT_TYPE,
} as const;

export const PERSISTABLE_STATE_UNIFIED_TO_LEGACY_MAP: Record<string, string> = {
  [LENS_ATTACHMENT_TYPE]: LEGACY_LENS_ATTACHMENT_TYPE,
  [ML_ANOMALY_SWIMLANE_ATTACHMENT_TYPE]: LEGACY_ML_ANOMALY_SWIMLANE_ATTACHMENT_TYPE,
  [ML_ANOMALY_CHARTS_ATTACHMENT_TYPE]: LEGACY_ML_ANOMALY_CHARTS_ATTACHMENT_TYPE,
  [ML_SINGLE_METRIC_VIEWER_ATTACHMENT_TYPE]: LEGACY_ML_SINGLE_METRIC_VIEWER_ATTACHMENT_TYPE,
  [AIOPS_CHANGE_POINT_CHART_ATTACHMENT_TYPE]: LEGACY_AIOPS_CHANGE_POINT_CHART_ATTACHMENT_TYPE,
  [AIOPS_PATTERN_ANALYSIS_ATTACHMENT_TYPE]: LEGACY_AIOPS_PATTERN_ANALYSIS_ATTACHMENT_TYPE,
  [AIOPS_LOG_RATE_ANALYSIS_ATTACHMENT_TYPE]: LEGACY_AIOPS_LOG_RATE_ANALYSIS_ATTACHMENT_TYPE,
} as const;

export const PERSISTABLE_ATTACHMENT_TYPES = new Set<string>(
  Object.keys(PERSISTABLE_STATE_UNIFIED_TO_LEGACY_MAP)
);
/**
 * Mapping from legacy attachment type names to unified names.
 */
export const LEGACY_TO_UNIFIED_MAP: Record<string, string> = {
  [LEGACY_USER_TYPE]: COMMENT_ATTACHMENT_TYPE,
  // Note: `actions` is folded into `security.endpoint`
  [LEGACY_ACTIONS_TYPE]: SECURITY_ENDPOINT_ATTACHMENT_TYPE,
} as const;

/**
 * Reverse mapping from unified names to legacy names.
 */
export const UNIFIED_TO_LEGACY_MAP: Record<string, string> = {
  [COMMENT_ATTACHMENT_TYPE]: LEGACY_USER_TYPE,
  [SECURITY_EVENT_ATTACHMENT_TYPE]: LEGACY_EVENT_TYPE,
  [SECURITY_ALERT_ATTACHMENT_TYPE]: LEGACY_ALERT_TYPE,
  [OBSERVABILITY_ALERT_ATTACHMENT_TYPE]: LEGACY_ALERT_TYPE,
  [STACK_ALERT_ATTACHMENT_TYPE]: LEGACY_ALERT_TYPE,
  [SECURITY_ENDPOINT_ATTACHMENT_TYPE]: LEGACY_EXTERNAL_REFERENCE_TYPE,
  [FILE_ATTACHMENT_TYPE]: LEGACY_EXTERNAL_REFERENCE_TYPE,
  [OSQUERY_ATTACHMENT_TYPE]: LEGACY_EXTERNAL_REFERENCE_TYPE,
  [INDICATOR_ATTACHMENT_TYPE]: LEGACY_EXTERNAL_REFERENCE_TYPE,
} as const;

/**
 * Reverse mapping from unified type name back to externalReferenceAttachmentTypeId.
 */
export const UNIFIED_TO_EXTERNAL_REFERENCE_TYPE_MAP: Record<string, string> = {
  [SECURITY_ENDPOINT_ATTACHMENT_TYPE]: 'endpoint',
  [FILE_ATTACHMENT_TYPE]: LEGACY_FILE_ATTACHMENT_TYPE,
  [OSQUERY_ATTACHMENT_TYPE]: OSQUERY_ATTACHMENT_TYPE,
  [INDICATOR_ATTACHMENT_TYPE]: LEGACY_INDICATOR_ATTACHMENT_TYPE,
} as const;

/**
 * Attachment type identifiers that are migrated to unified read/write behavior.
 */
export const MIGRATED_ATTACHMENT_TYPES = new Set<string>([
  COMMENT_ATTACHMENT_TYPE,
  SECURITY_EVENT_ATTACHMENT_TYPE,
  SECURITY_ALERT_ATTACHMENT_TYPE,
  OBSERVABILITY_ALERT_ATTACHMENT_TYPE,
  STACK_ALERT_ATTACHMENT_TYPE,
  SECURITY_ENDPOINT_ATTACHMENT_TYPE,
  FILE_ATTACHMENT_TYPE,
  OSQUERY_ATTACHMENT_TYPE,
  INDICATOR_ATTACHMENT_TYPE,
  SECURITY_ENTITY_ATTACHMENT_TYPE,
  SECURITY_TIMELINE_ATTACHMENT_TYPE,
  ...PERSISTABLE_ATTACHMENT_TYPES,
  DASHBOARD_ATTACHMENT_TYPE,
  DISCOVER_SESSION_ATTACHMENT_TYPE,
  MAP_ATTACHMENT_TYPE,
]);

export const OWNER_TO_PREFIX_MAP: Partial<Record<string, string>> = {
  [SECURITY_SOLUTION_OWNER]: 'security',
  [OBSERVABILITY_OWNER]: 'observability',
  [GENERAL_CASES_OWNER]: 'stack',
};

export const PREFIX_TO_OWNER_MAP: Partial<Record<string, string>> = {
  security: SECURITY_SOLUTION_OWNER,
  observability: OBSERVABILITY_OWNER,
  stack: GENERAL_CASES_OWNER,
};
