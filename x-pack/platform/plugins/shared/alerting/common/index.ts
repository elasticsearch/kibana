/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// TODO: https://github.com/elastic/kibana/issues/110895

export type {
  ActionVariable,
  Rule,
  SanitizedRule,
  RuleTypeParams,
  RuleActionParams,
  RuleActionParam,
  IntervalSchedule,
  RuleActionFrequency,
  AlertsFilterTimeframe,
  AlertsFilter,
  RuleAction,
  RuleSystemAction,
  MappedParamsProperties,
  MappedParams,
  RuleExecutionStatuses,
  RuleLastRunOutcomes,
  RuleExecutionStatus,
  RuleMonitoringHistory,
  RuleMonitoringCalculatedMetrics,
  RuleMonitoringLastRun,
  RuleMonitoring,
  RuleLastRun,
  AlertDelay,
  SanitizedAlertsFilter,
  SanitizedRuleAction,
  AlertsHealth,
  AlertingFrameworkHealth,
  ResolvedSanitizedRule,
  RuleTypeState,
  RuleTypeMetaData,
  RuleAlertData,
  RuleAlertingOutcome,
  RuleActionAlertsFilterProperty,
  RuleActionKey,
  RuleSystemActionKey,
  SanitizedRuleConfig,
  RuleMonitoringLastRunMetrics,
  Artifacts,
} from './rule';
export {
  RuleExecutionStatusValues,
  RuleLastRunOutcomeValues,
  RuleExecutionStatusErrorReasons,
  RuleExecutionStatusWarningReasons,
  HealthStatus,
  RuleLastRunOutcomeOrderMap,
} from './rule';
export type {
  RulesSettingsModificationMetadata,
  RulesSettingsFlappingProperties,
  RulesSettingsQueryDelayProperties,
  RuleSpecificFlappingProperties,
  RulesSettingsFlapping,
  RulesSettingsQueryDelay,
  RulesSettingsProperties,
  RulesSettings,
} from './rules_settings';
export {
  MIN_LOOK_BACK_WINDOW,
  MAX_LOOK_BACK_WINDOW,
  MIN_STATUS_CHANGE_THRESHOLD,
  MAX_STATUS_CHANGE_THRESHOLD,
  MIN_QUERY_DELAY,
  MAX_QUERY_DELAY,
  RULES_SETTINGS_FEATURE_ID,
  ALL_FLAPPING_SETTINGS_SUB_FEATURE_ID,
  READ_FLAPPING_SETTINGS_SUB_FEATURE_ID,
  ALL_QUERY_DELAY_SETTINGS_SUB_FEATURE_ID,
  READ_QUERY_DELAY_SETTINGS_SUB_FEATURE_ID,
  ALL_ALERT_DELETE_SETTINGS_SUB_FEATURE_ID,
  READ_ALERT_DELETE_SETTINGS_SUB_FEATURE_ID,
  API_PRIVILEGES,
  RULES_SETTINGS_SAVED_OBJECT_TYPE,
  RULES_SETTINGS_FLAPPING_SAVED_OBJECT_ID,
  RULES_SETTINGS_QUERY_DELAY_SAVED_OBJECT_ID,
  DEFAULT_LOOK_BACK_WINDOW,
  DEFAULT_STATUS_CHANGE_THRESHOLD,
  DEFAULT_QUERY_DELAY,
  DEFAULT_SERVERLESS_QUERY_DELAY,
  DEFAULT_FLAPPING_SETTINGS,
  DISABLE_FLAPPING_SETTINGS,
  DEFAULT_QUERY_DELAY_SETTINGS,
  DEFAULT_SERVERLESS_QUERY_DELAY_SETTINGS,
} from './rules_settings';
export type { RuleType, ActionGroup, ActionGroupIdsOf } from './rule_type';
export { validateBackfillSchedule } from './lib';
export type {
  ThrottledActions,
  LastScheduledActions,
  AlertInstanceMeta,
  AlertInstanceState,
  AlertInstanceContext,
  RawAlertInstance,
  TrackedLifecycleAlertState,
  WrappedLifecycleRuleState,
  RuleTaskState,
  RuleTaskParams,
} from '@kbn/alerting-state-types';
export type {
  RuleStatusValues,
  AlertStatusValues,
  ExecutionDuration,
  AlertSummary,
  AlertStatus,
} from './alert_summary';
export type {
  ReservedActionGroups,
  WithoutReservedActionGroups,
  RecoveredActionGroupId,
  DefaultActionGroupId,
} from './builtin_action_groups';
export { getBuiltinActionGroups, RecoveredActionGroup } from './builtin_action_groups';
export type {
  BulkEditSkipReason,
  BulkGapsFillingSkipReason,
  BulkEditActionSkipResult,
  BulkGapsFillingSkipResult,
  BulkActionSkipResult,
} from './bulk_action';
export {
  DisabledActionTypeIdsForActionGroup,
  isActionGroupDisabledForActionTypeId,
} from './disabled_action_groups';
export type { RuleNotifyWhenType } from './rule_notify_when_type';
export {
  validateNotifyWhenType,
  RuleNotifyWhenTypeValues,
  RuleNotifyWhen,
} from './rule_notify_when_type';
export {
  parseDuration,
  formatDuration,
  convertDurationToFrequency,
  getDurationNumberInItsUnit,
  getDurationUnitValue,
  validateDurationSchema,
} from './parse_duration';
export type {
  ExecutionLogSortFields,
  ActionErrorLogSortFields,
  IExecutionLog,
  IExecutionErrors,
  IExecutionErrorsResult,
  IExecutionLogResult,
  IExecutionKPIResult,
} from './execution_log_types';
export {
  executionLogSortableColumns,
  actionErrorLogSortableColumns,
  EMPTY_EXECUTION_KPI_RESULT,
  EMPTY_EXECUTION_SUMMARY_RESULT,
} from './execution_log_types';
export type { RuleSnoozeSchedule, RuleSnooze } from './rule_snooze_type';
export type { RRuleParams, RRuleRecord } from './rrule_type';
export type {
  RuleTagsAggregationOptions,
  RuleTagsAggregationFormattedResult,
  RuleTagsAggregationResult,
} from './rule_tags_aggregation';
export { getRuleTagsAggregation, formatRuleTagsAggregationResult } from './rule_tags_aggregation';
export type { IsoWeekday } from './iso_weekdays';
export { ISO_WEEKDAYS } from './iso_weekdays';
export { alertMappings } from './saved_objects/rules/mappings';
export {
  getRuleCircuitBreakerErrorMessage,
  parseRuleCircuitBreakerErrorMessage,
} from './rule_circuit_breaker_error_message';
export {
  preconfiguredConnectorActionRefPrefix,
  systemConnectorActionRefPrefix,
} from './action_ref_prefix';
export { gapStatus, gapFillStatus, gapReasonType, DEFAULT_EXCLUDED_GAP_REASONS } from './constants';
export type { GapStatus, GapFillStatus, GapReason, GapReasonType } from './constants';
export { GAP_AUTO_FILL_STATUS } from './constants';
export type { GapAutoFillStatus } from './constants';
export { backfillInitiator } from './constants';
export type { BackfillInitiator } from './constants';
export { PROVISION_UIAM_API_KEYS_FEATURE_FLAG } from './constants';
export {
  mappingFromFieldMap,
  getComponentTemplateFromFieldMap,
  contextToSchemaName,
} from './alert_schema';

export { getMaxAlertLimit, ALLOWED_MAX_ALERTS } from './max_alert_limit';
export interface DateRange {
  gte: string;
  lte: string;
}

export const LEGACY_BASE_ALERT_API_PATH = '/api/alerts';
export const BASE_ALERTING_API_PATH = '/api/alerting';

// Internal
export const INTERNAL_BASE_ALERTING_API_PATH = '/internal/alerting' as const;
export const INTERNAL_ALERTING_SNOOZE_RULE =
  `${INTERNAL_BASE_ALERTING_API_PATH}/rule/{id}/_snooze` as const;
export const INTERNAL_ALERTING_API_FIND_RULES_PATH =
  `${INTERNAL_BASE_ALERTING_API_PATH}/rules/_find` as const;
export const INTERNAL_ALERTING_API_FIND_MUTED_ALERT_INSTANCES_PATH =
  `${INTERNAL_BASE_ALERTING_API_PATH}/rules/_find_muted_alerts` as const;

export const INTERNAL_ALERTING_BACKFILL_API_PATH =
  `${INTERNAL_BASE_ALERTING_API_PATH}/rules/backfill` as const;
export const INTERNAL_ALERTING_BACKFILL_FIND_API_PATH =
  `${INTERNAL_ALERTING_BACKFILL_API_PATH}/_find` as const;
export const INTERNAL_ALERTING_BACKFILL_SCHEDULE_API_PATH =
  `${INTERNAL_ALERTING_BACKFILL_API_PATH}/_schedule` as const;

// Public backfill API paths
export const ALERTING_BACKFILL_API_PATH = `${BASE_ALERTING_API_PATH}/rules/backfill` as const;
export const ALERTING_BACKFILL_FIND_API_PATH = `${ALERTING_BACKFILL_API_PATH}/_find` as const;
export const ALERTING_BACKFILL_SCHEDULE_API_PATH =
  `${ALERTING_BACKFILL_API_PATH}/_schedule` as const;

export const INTERNAL_ALERTING_GAPS_API_PATH =
  `${INTERNAL_BASE_ALERTING_API_PATH}/rules/gaps` as const;

export const INTERNAL_ALERTING_GAPS_FIND_API_PATH =
  `${INTERNAL_ALERTING_GAPS_API_PATH}/_find` as const;

export const INTERNAL_ALERTING_GAPS_GET_RULES_API_PATH =
  `${INTERNAL_ALERTING_GAPS_API_PATH}/_get_rules` as const;

export const INTERNAL_ALERTING_GAPS_GET_SUMMARY_BY_RULE_IDS_API_PATH =
  `${INTERNAL_ALERTING_GAPS_API_PATH}/_get_gaps_summary_by_rule_ids` as const;

export const INTERNAL_ALERTING_GAPS_FILL_BY_ID_API_PATH =
  `${INTERNAL_ALERTING_GAPS_API_PATH}/_fill_by_id` as const;

export const INTERNAL_ALERTING_GAPS_AUTO_FILL_SCHEDULER_API_PATH =
  `${INTERNAL_ALERTING_GAPS_API_PATH}/auto_fill_scheduler` as const;

export const INTERNAL_ALERTING_GET_GLOBAL_RULE_EXECUTION_SUMMARY_API_PATH =
  `${INTERNAL_BASE_ALERTING_API_PATH}/_global_execution_summary` as const;

export const ALERTING_FEATURE_ID = 'alerts';
export const MONITORING_HISTORY_LIMIT = 200;
