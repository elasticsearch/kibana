/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AsCodeFilter } from '@kbn/as-code-filters-schema';
import { fromStoredFilter, isAsCodeFilter } from '@kbn/as-code-filters-transforms';
import { toAsCodeQuery } from '@kbn/as-code-shared-transforms';
import { isQuery } from '@kbn/data-plugin/public';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { migrateLegacyQuery } from '../../../../common';

type DashboardSearchState = Pick<
  DashboardState,
  'filters' | 'query' | 'refresh_interval' | 'time_range' | 'esql_approximation'
>;

export function extractSearchState(state: {
  [key: string]: unknown;
}): Partial<DashboardSearchState> {
  const searchState: Partial<DashboardSearchState> = {};

  if (Array.isArray(state.filters)) {
    // Convert filters from legacy format to AsCodeFilter format if necessary.
    searchState.filters = state.filters
      .map((filter) => {
        if (isAsCodeFilter(filter)) {
          return filter;
        }
        return fromStoredFilter(filter);
      })
      .filter((filter): filter is AsCodeFilter => Boolean(filter));
  }

  if (state.query && typeof state.query === 'object') {
    const maybeQuery = state.query as Record<string, unknown>;

    // New as-code/API query format
    if (typeof maybeQuery.expression === 'string' && typeof maybeQuery.language === 'string') {
      const expression = maybeQuery.expression;
      const language = maybeQuery.language === 'lucene' ? 'lucene' : 'kql';
      searchState.query = { expression, language };
    }

    // Legacy query format
    if (isQuery(state.query)) {
      const storedQuery = migrateLegacyQuery(state.query);
      const asCodeQuery = toAsCodeQuery(storedQuery);
      if (asCodeQuery) {
        searchState.query = asCodeQuery;
      }
    }
  }

  // Refresh interval could be passed in with snake_case or camelCase
  if (state.refreshInterval && typeof state.refreshInterval === 'object') {
    searchState.refresh_interval = state.refreshInterval as DashboardState['refresh_interval'];
  }

  if (state.refresh_interval && typeof state.refresh_interval === 'object') {
    searchState.refresh_interval = state.refresh_interval as DashboardState['refresh_interval'];
  }

  // time range could be passed in with snake_case or camelCase
  if (state.timeRange && typeof state.timeRange === 'object') {
    searchState.time_range = state.timeRange as DashboardState['time_range'];
  }

  if (state.time_range && typeof state.time_range === 'object') {
    searchState.time_range = state.time_range as DashboardState['time_range'];
  }

  if (typeof state.esql_approximation === 'boolean') {
    searchState.esql_approximation = state.esql_approximation;
  }

  return searchState;
}
