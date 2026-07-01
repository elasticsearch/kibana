/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// TODO Consolidate with duplicate saved search utils file in
// `x-pack/platform/plugins/private/data_visualizer/public/application/index_data_visualizer/utils/saved_search_utils.ts`

import { cloneDeep } from 'lodash';
import type { IUiSettingsClient } from '@kbn/core/public';
import { getEsQueryConfig, SearchSource } from '@kbn/data-plugin/common';
import type { SavedSearch } from '@kbn/saved-search-plugin/public';
import type { FilterManager } from '@kbn/data-plugin/public';
import { mapAndFlattenFilters } from '@kbn/data-plugin/public';
import type { Query, Filter } from '@kbn/es-query';
import { buildEsQuery } from '@kbn/es-query';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { DataView } from '@kbn/data-views-plugin/public';
import { getDefaultDSLQuery, type SearchQueryLanguage } from '@kbn/ml-query-utils';

function getSavedSearchSource(savedSearch: Pick<SavedSearch, 'searchSource'>) {
  return savedSearch &&
    'searchSource' in savedSearch &&
    savedSearch?.searchSource instanceof SearchSource
    ? savedSearch.searchSource
    : undefined;
}

/**
 * Extract query data from the saved search object
 * with overrides from the provided query data and/or filters
 */
export function getEsQueryFromSavedSearch({
  dataView,
  uiSettings,
  savedSearch,
  query,
  filters,
  filterManager,
}: {
  dataView: DataView;
  uiSettings: IUiSettingsClient;
  savedSearch: Pick<SavedSearch, 'searchSource'> | null | undefined;
  query?: Query;
  filters?: Filter[];
  filterManager?: FilterManager;
}) {
  if (!dataView || !savedSearch) return;

  const userQuery = query;
  const userFilters = filters;

  const savedSearchSource = getSavedSearchSource(savedSearch);

  // If saved search has a search source with nested parent
  // e.g. a search coming from Dashboard saved search embeddable
  // which already combines both the saved search's original query/filters and the Dashboard's
  // then no need to process any further
  if (savedSearchSource && savedSearchSource.getParent() !== undefined && userQuery) {
    // Flattened query from search source may contain a clause that narrows the time range
    // which might interfere with global time pickers so we need to remove
    const savedQuery: QueryDslQueryContainer =
      cloneDeep(savedSearch.searchSource.getSearchRequestBody()?.query) ?? getDefaultDSLQuery();
    const timeField = savedSearch.searchSource.getField('index')?.timeFieldName;

    if (savedQuery?.bool && Array.isArray(savedQuery.bool.filter) && timeField !== undefined) {
      savedQuery.bool.filter = savedQuery.bool.filter.filter(
        (c: QueryDslQueryContainer) =>
          c != null && !(Object.hasOwn(c, 'range') && Object.hasOwn(c.range ?? {}, timeField))
      );
    }
    return {
      searchQuery: savedQuery,
      searchString: userQuery.query,
      queryLanguage: userQuery.language as SearchQueryLanguage,
    };
  }

  // If no saved search available, use user's query and filters
  if (!savedSearch && userQuery) {
    if (filterManager && userFilters) filterManager.addFilters(userFilters);

    try {
      // buildEsQuery throws an exception for a fallible operation (anti-pattern).
      // We MUST always wrap it in a try block to prevent a failed parse from being unhandled &
      // bubbling up to the error boundary.
      const combinedQuery = buildEsQuery(
        dataView,
        userQuery,
        Array.isArray(userFilters) ? userFilters : [],
        uiSettings ? getEsQueryConfig(uiSettings) : undefined
      );

      return {
        searchQuery: combinedQuery,
        searchString: userQuery.query,
        queryLanguage: userQuery.language as SearchQueryLanguage,
      };
    } catch (e) {
      return undefined;
    }
  }

  // If saved search available, merge saved search with the latest user query or filters
  // which might differ from extracted saved search data
  if (savedSearchSource) {
    const globalFilters = filterManager?.getGlobalFilters();
    // FIXME: Add support for AggregateQuery type #150091
    const currentQuery = userQuery ?? (savedSearchSource.getField('query') as Query);
    const currentFilters =
      userFilters ?? mapAndFlattenFilters(savedSearchSource.getField('filter') as Filter[]);
    if (filterManager) filterManager.setFilters(currentFilters);
    if (globalFilters) filterManager?.addFilters(globalFilters);

    try {
      // buildEsQuery throws an exception for a fallible operation (anti-pattern).
      // We MUST always wrap it in a try block to prevent a failed parse from being unhandled &
      // bubbling up to the error boundary.
      const combinedQuery = buildEsQuery(
        dataView,
        currentQuery,
        filterManager ? filterManager?.getFilters() : currentFilters,
        uiSettings ? getEsQueryConfig(uiSettings) : undefined
      );

      return {
        searchQuery: combinedQuery,
        searchString: currentQuery.query,
        queryLanguage: currentQuery.language as SearchQueryLanguage,
      };
    } catch (e) {
      return undefined;
    }
  }
}
