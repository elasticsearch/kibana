/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export { getESQLAdHocDataview, getIndexForESQLQuery } from './utils/get_esql_adhoc_dataview';
export { getESQLTimeFieldFromQuery } from './utils/get_esql_time_field_from_query';
export { getInitialESQLQuery } from './utils/get_initial_esql_query';
export { getESQLWithSafeLimit } from './utils/get_esql_with_safe_limit';
export {
  getLimitFromESQLQuery,
  removeDropCommandsFromESQLQuery,
  hasTransformationalCommand,
  getTimeFieldFromESQLQuery,
  prettifyQuery,
  retrieveMetadataColumns,
  getQueryColumnsFromESQLQuery,
  mapVariableToColumn,
  getValuesFromQueryField,
  getESQLQueryVariables,
  fixESQLQueryWithVariables,
  getCategorizeColumns,
  getSparklineColumns,
  getArgsFromRenameFunction,
  getCategorizeField,
  getKqlSearchQueries,
  getRemoteClustersFromESQLQuery,
  convertTimeseriesCommandToFrom,
  hasOnlySourceCommand,
  hasTimeseriesInfoCommand,
} from './utils/query_parsing_helpers';
export {
  hasChangePointCommand,
  getChangePointOutputColumnNames,
  getChangePointSeriesColumns,
  buildChangePointLineDataQuery,
  appendEntityFiltersToChangePointLineEsql,
  formatEsqlIdentifier,
  formatEsqlLiteral,
} from './utils/change_point_helpers';
export {
  getIndexPatternFromESQLQuery,
  getIndexPatternsFromESQLQuery,
  getSourceCommandFromESQLQuery,
} from './utils/get_index_pattern_from_query';
export type { ESQLIndexPatterns } from './utils/get_index_pattern_from_query';
export { classifyESQLSource, isSingleSource } from './utils/classify_esql_source';
export type { ESQLSourceKind } from './utils/classify_esql_source';
export { queryCannotBeSampled } from './utils/query_cannot_be_sampled';
export { appendToESQLQuery } from './utils/append_to_query/utils';
export { appendStatsByToQuery } from './utils/append_to_query/append_stats_by';
export { appendWhereClauseToESQLQuery } from './utils/append_to_query/append_where';
export { appendLimitToQuery } from './utils/append_to_query/append_limit';
export { buildMetricsInfoQuery } from './utils/append_to_query/append_metrics_info';

export {
  getESQLQueryColumns,
  getESQLQueryColumnsRaw,
  getESQLResults,
  formatESQLColumns,
  getStartEndParams,
  hasStartEndParams,
  getNamedParams,
} from './utils/run_query';
export {
  isESQLColumnSortable,
  isESQLColumnGroupable,
  isESQLFieldGroupable,
} from './utils/esql_fields_utils';
export { sanitazeESQLInput } from './utils/sanitaze_input';
export { replaceESQLQueryIndexPattern } from './utils/replace_index_pattern';
export { extractCategorizeTokens } from './utils/extract_categorize_tokens';
export { getLookupIndicesFromQuery } from './utils/get_lookup_indices';
export {
  type ESQLStatsQueryMeta,
  getESQLStatsQueryMeta,
  constructCascadeQuery,
  appendFilteringWhereClauseForCascadeLayout,
} from './utils/cascaded_documents_helpers';
export {
  getStatsGroupFieldType,
  getFieldParamDefinition,
} from './utils/cascaded_documents_helpers/utils';
export { getProjectRoutingFromEsqlQuery } from './utils/set_instructions_helpers';
export { isComputedColumn, getQuerySummary } from './utils/get_query_summary';
export { getEsqlControls, getAllEsqlControls, getVariableNamePrefix } from './utils/controls';
export {
  getColumnsWithHighlights,
  type ESQLColumnsWithHighlights,
  type ESQLHighlightTags,
} from './utils/get_columns_with_highlights';
export { buildRenameSourceFieldMap } from './utils/build_rename_source_field_map';
export { convertFiltersToESQLExpression } from './utils/convert_filters_to_esql';
export { convertQueryToESQLExpression } from './utils/convert_query_to_esql';
export { injectWhereClauseAfterSourceCommand } from './utils/inject_where_after_source';

// Callback functions
export * from './utils/callbacks';
