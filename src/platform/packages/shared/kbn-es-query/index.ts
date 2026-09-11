/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type {
  BoolQuery,
  DataViewBase,
  DataViewBaseNoFields,
  DataViewFieldBase,
  EsQueryConfig,
  EsQueryFiltersConfig,
  IFieldSubType,
  IFieldSubTypeMulti,
  IFieldSubTypeNested,
} from './src/es_query';

export type {
  CustomFilter,
  ExistsFilter,
  FieldFilter,
  Filter,
  FilterCompareOptions,
  FilterMeta,
  LatLon,
  MatchAllFilter,
  PhraseFilter,
  PhrasesFilter,
  Query,
  AggregateQuery,
  QueryStringFilter,
  RangeFilter,
  RangeFilterMeta,
  RangeFilterParams,
  ScriptedPhraseFilter,
  ScriptedRangeFilter,
  TimeRange,
  TimeState,
  RelativeTimeRange,
  AbsoluteTimeRange,
  CombinedFilter,
} from './src/filters';

export type { DslQuery, KueryNode, KueryParseOptions, KueryQueryOptions } from './src/kuery';

export type { ProjectRouting } from './src/project_routing';

export {
  buildEsQuery,
  buildQueryFromFilters,
  filterToQueryDsl,
  decorateQuery,
  luceneStringToDsl,
  migrateFilter,
  fromCombinedFilter,
  isOfQueryType,
  isOfAggregateQueryType,
  isEmptyEsqlQuery,
  getAggregateQueryMode,
  getLanguageDisplayName,
} from './src/es_query';

export { kqlQuery, dateRangeQuery, termQuery, termsQuery } from './src/es_query/helpers';

export { FilterStateStore } from '@kbn/es-query-constants';

export {
  COMPARE_ALL_OPTIONS,
  FILTERS,
  buildCustomFilter,
  buildEmptyFilter,
  buildExistsFilter,
  buildFilter,
  buildCombinedFilter,
  buildPhraseFilter,
  buildPhrasesFilter,
  buildQueryFilter,
  buildRangeFilter,
  cleanFilter,
  compareFilters,
  dedupFilters,
  disableFilter,
  enableFilter,
  getConvertedValueForField,
  getFilterField,
  getFilterParams,
  getPhraseFilterField,
  getPhraseFilterValue,
  getPhraseScript,
  getRangeScript,
  isExistsFilter,
  isFilter,
  isFilterDisabled,
  isFilterPinned,
  isFilters,
  isMatchAllFilter,
  isCombinedFilter,
  isPhraseFilter,
  isPhrasesFilter,
  isQueryStringFilter,
  isRangeFilter,
  isScriptedPhraseFilter,
  isScriptedRangeFilter,
  onlyDisabledFiltersChanged,
  pinFilter,
  toggleFilterDisabled,
  toggleFilterNegated,
  toggleFilterPinned,
  uniqFilters,
  unpinFilter,
  updateFilter,
  updateFilterReferences,
  extractTimeFilter,
  extractTimeRange,
  convertRangeFilterToTimeRange,
  BooleanRelation,
} from './src/filters';

export { indexPatternToCcs } from './src/indices';

export {
  KQLSyntaxError,
  fromKueryExpression,
  toKqlExpression,
  nodeBuilder,
  nodeTypes,
  toElasticsearchQuery,
  escapeKuery,
  escapeQuotes,
  getKqlFieldNames,
  getKqlFieldNamesFromExpression,
  getIsKqlFreeText,
  getIsKqlFreeTextExpression,
} from './src/kuery';

export {
  getDataViewFieldSubtypeMulti,
  getDataViewFieldSubtypeNested,
  isDataViewFieldSubtypeMulti,
  isDataViewFieldSubtypeNested,
  isNonLocalIndexName,
  getTimeZoneFromSettings,
} from './src/utils';

export type { ExecutionContextSearch } from './src/expressions/types';
