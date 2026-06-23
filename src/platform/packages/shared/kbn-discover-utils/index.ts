/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export {
  CONTEXT_DEFAULT_SIZE_SETTING,
  CONTEXT_STEP_SETTING,
  CONTEXT_TIE_BREAKER_FIELDS_SETTING,
  DEFAULT_ALLOWED_LOGS_BASE_PATTERNS,
  DEFAULT_COLUMNS_SETTING,
  DOC_HIDE_TIME_COLUMN_SETTING,
  FIELDS_LIMIT_SETTING,
  HIDE_ANNOUNCEMENTS,
  IS_ESQL_DEFAULT_FEATURE_FLAG_KEY,
  MAX_DOC_FIELDS_DISPLAYED,
  MODIFY_COLUMNS_ON_SWITCH,
  OPEN_IN_DISCOVER_TAB_LABEL,
  ROW_HEIGHT_OPTION,
  SAMPLE_ROWS_PER_PAGE_SETTING,
  SAMPLE_SIZE_SETTING,
  SEARCH_EMBEDDABLE_TYPE,
  SEARCH_ON_PAGE_LOAD_SETTING,
  SHOW_FIELD_STATISTICS,
  SHOW_MULTIFIELDS,
  SORT_DEFAULT_ORDER_SETTING,
  DataGridDensity,
  UnifiedHistogramSuggestionType,
  IgnoredReason,
  buildDataTableRecord,
  buildDataTableRecordList,
  convertValueToString,
  createLogsContextService,
  createApmContextService,
  createDegradedDocsControl,
  createStacktraceControl,
  fieldConstants,
  formatFieldValueReact,
  formatFieldValueText,
  formatFieldStringValueWithHighlights,
  formatHitReact,
  getDocId,
  getLogDocumentOverview,
  getFlattenedTraceDocumentOverview,
  getIgnoredReason,
  getMessageFieldWithFallbacks,
  getChartHidden,
  getTableHidden,
  getTopPanelHeight,
  getBreakdownField,
  getAvailableResourceFields,
  getAvailableTraceFields,
  getLogLevelFieldWithFallback,
  getLogEventTypeFieldWithFallback,
  getLogExceptionTypeFieldWithFallback,
  getShouldShowFieldHandler,
  isEsqlSavedSearch,
  isNestedFieldParent,
  usePager,
  calcFieldCounts,
  getLogLevelColor,
  getLogLevelCoalescedValue,
  getLogLevelCoalescedValueLabel,
  LogLevelCoalescedValue,
  getFieldValue,
  getVisibleColumns,
  canPrependTimeFieldColumn,
  DiscoverFlyouts,
  AppMenuRegistry,
  dismissAllFlyoutsExceptFor,
  dismissFlyouts,
  ErrorCallout,
  prepareDataViewForEditing,
  getEsqlDataView,
  setChartHidden,
  setTableHidden,
  setTopPanelHeight,
  setBreakdownField,
  LogLevelBadge,
  getDefaultSort,
  getSort,
  getSortArray,
  getSortForSearchSource,
  getEsQuerySort,
  getTieBreakerFieldName,
  severityOrder,
  CHART_HIDDEN_KEY,
  TABLE_HIDDEN_KEY,
  HISTOGRAM_HEIGHT_KEY,
  HISTOGRAM_BREAKDOWN_FIELD_KEY,
} from './src';

export type {
  LogsContextService,
  ApmContextService,
  SortOrder,
  SortInput,
  SortPair,
  ErrorCalloutProps,
  DiscoverSessionFinderAttributes,
} from './src';

export * from './src/types';

export * from './src/data_types/logs/constants';

export {
  ALL_RECOMMENDED_FIELDS_FOR_ESQL,
  APACHE_ERROR_LOGS_PROFILE,
  DEFAULT_LOGS_PROFILE,
  KUBERNETES_CONTAINER_LOGS_PROFILE,
} from './src/data_types/logs';

export type {
  ApacheErrorLogsProfile,
  DefaultLogsProfile,
  KubernetesContainerLogsProfile,
} from './src/data_types/logs';
