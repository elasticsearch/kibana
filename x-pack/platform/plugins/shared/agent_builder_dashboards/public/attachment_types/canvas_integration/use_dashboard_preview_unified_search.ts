/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { distinctUntilChanged, map } from 'rxjs';
import { toStoredFilters } from '@kbn/as-code-filters-transforms';
import { toStoredQuery } from '@kbn/as-code-shared-transforms';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { DashboardApi } from '@kbn/dashboard-plugin/public';
import { isOfQueryType, type Filter, type Query, type TimeRange } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';
import {
  apiPublishesEsqlUsage,
  combineCompatibleChildrenApis,
  type PublishesEsqlUsage,
} from '@kbn/presentation-publishing';
import { isEqual } from 'lodash';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { DEFAULT_TIME_RANGE } from '@kbn/agent-builder-dashboards-common';

interface UseDashboardPreviewUnifiedSearchParams {
  dashboardApi: DashboardApi | undefined;
  dashboardState: DashboardState;
  data: DataPublicPluginStart;
}

const DEFAULT_EMPTY_QUERY: Query = { query: '', language: 'kuery' };

const normalizeQuery = (nextQuery: Query | undefined): Query => {
  if (!nextQuery) {
    return DEFAULT_EMPTY_QUERY;
  }

  if (typeof nextQuery.query !== 'string') {
    return nextQuery;
  }

  return nextQuery.query.trim() === '' ? DEFAULT_EMPTY_QUERY : nextQuery;
};

export const useDashboardPreviewUnifiedSearch = ({
  dashboardApi,
  dashboardState,
  data,
}: UseDashboardPreviewUnifiedSearchParams) => {
  const { filterManager } = data.query;
  const { timefilter } = data.query.timefilter;

  const [timeRange, setTimeRange] = useState<TimeRange>(
    dashboardState.time_range ?? DEFAULT_TIME_RANGE
  );
  const [query, setQuery] = useState<Query>(normalizeQuery(toStoredQuery(dashboardState.query)));
  const [filters, setFilters] = useState<Filter[]>(toStoredFilters(dashboardState.filters) ?? []);
  const [dataViews, setDataViews] = useState<DataView[]>([]);
  const [isApproximate, setIsApproximate] = useState(false);
  const [hasEsqlPanel, setHasEsqlPanel] = useState(false);

  useEffect(() => {
    if (!dashboardApi) {
      return;
    }

    dashboardApi.setQuery(query);
    dashboardApi.setFilters(filters);
    dashboardApi.setTimeRange(timeRange);
  }, [dashboardApi, query, filters, timeRange]);

  useEffect(() => {
    if (!dashboardApi) {
      setDataViews([]);
      return;
    }

    setDataViews(dashboardApi.dataViews$.value ?? []);

    const querySubscription = dashboardApi.query$.subscribe((nextQuery) => {
      const resolvedQuery = normalizeQuery(
        nextQuery && isOfQueryType(nextQuery) ? nextQuery : undefined
      );
      setQuery((currentQuery) =>
        isEqual(currentQuery, resolvedQuery) ? currentQuery : resolvedQuery
      );
    });
    const dataViewsSubscription = dashboardApi.dataViews$.subscribe((nextDataViews) => {
      const resolvedDataViews = nextDataViews ?? [];
      setDataViews((currentDataViews) =>
        isEqual(currentDataViews, resolvedDataViews) ? currentDataViews : resolvedDataViews
      );
    });
    const timeRangeSubscription = dashboardApi.timeRange$.subscribe((nextTimeRange) => {
      if (!nextTimeRange) {
        return;
      }

      setTimeRange((currentTimeRange) =>
        isEqual(currentTimeRange, nextTimeRange) ? currentTimeRange : nextTimeRange
      );
    });

    return () => {
      querySubscription.unsubscribe();
      dataViewsSubscription.unsubscribe();
      timeRangeSubscription.unsubscribe();
    };
  }, [dashboardApi]);

  useEffect(() => {
    if (!dashboardApi) {
      setIsApproximate(false);
      setHasEsqlPanel(false);
      return;
    }

    const approximationSubscription = dashboardApi.isApproximate$.subscribe(setIsApproximate);
    const esqlUsageSubscription = combineCompatibleChildrenApis<PublishesEsqlUsage, boolean[]>(
      dashboardApi,
      'usesEsql$',
      apiPublishesEsqlUsage,
      []
    )
      .pipe(
        map((usesEsqlValues) => usesEsqlValues.some(Boolean)),
        distinctUntilChanged()
      )
      .subscribe(setHasEsqlPanel);

    return () => {
      approximationSubscription.unsubscribe();
      esqlUsageSubscription.unsubscribe();
    };
  }, [dashboardApi]);

  useEffect(() => {
    const filterManagerSubscription = filterManager.getUpdates$().subscribe(() => {
      const nextFilters = filterManager.getFilters();
      setFilters((currentFilters) =>
        isEqual(currentFilters, nextFilters) ? currentFilters : nextFilters
      );
    });

    return () => {
      filterManagerSubscription.unsubscribe();
    };
  }, [filterManager]);

  useEffect(() => {
    const timefilterSubscription = timefilter.getTimeUpdate$().subscribe(() => {
      const nextTimeRange = timefilter.getTime();
      setTimeRange((currentTimeRange) =>
        isEqual(currentTimeRange, nextTimeRange) ? currentTimeRange : nextTimeRange
      );
    });

    return () => {
      timefilterSubscription.unsubscribe();
    };
  }, [timefilter]);

  const onRefresh = useCallback(() => {
    dashboardApi?.forceRefresh();
  }, [dashboardApi]);

  const onQuerySubmit = useCallback(
    ({ dateRange, query: nextQuery }: { dateRange: TimeRange; query?: Query }) => {
      const resolvedQuery = normalizeQuery(nextQuery);
      setTimeRange(dateRange);
      setQuery(resolvedQuery);
      dashboardApi?.forceRefresh();
    },
    [dashboardApi]
  );

  const onFiltersUpdated = useCallback(
    (nextFilters: Filter[]) => {
      filterManager.setFilters(nextFilters);
    },
    [filterManager]
  );

  const searchBarProps = useMemo(
    () => ({
      query,
      filters,
      indexPatterns: dataViews,
      dateRangeFrom: timeRange.from,
      dateRangeTo: timeRange.to,
      onQuerySubmit,
      onFiltersUpdated,
      onRefresh,
      useDefaultBehaviors: false,
      disableQueryLanguageSwitcher: true,
      isDisabled: !dashboardApi,
      dataTestSubj: 'dashboardCanvasSearchBar',
      appName: 'agentBuilderDashboards',
      isAutoRefreshDisabled: true,
      showQueryInput: true,
      showDatePicker: true,
      showFilterBar: true,
      showQueryMenu: false,
      screenTitle: dashboardState.title,
      displayStyle: 'inPage' as const,
      disableSubscribingToGlobalDataServices: true,
      enableDateRangePicker: true,
      esqlApproximation: {
        isApproximate,
        onChange: (nextIsApproximate: boolean) =>
          dashboardApi?.setEsqlApproximation(nextIsApproximate),
        disabled: !hasEsqlPanel,
        additionalText: i18n.translate(
          'agentBuilderDashboards.esqlApproximationToggle.additionalText',
          {
            defaultMessage:
              'Fast mode requires at least one ES|QL visualization that uses STATS in the dashboard.',
          }
        ),
      },
    }),
    [
      dashboardApi,
      dashboardState.title,
      dataViews,
      filters,
      hasEsqlPanel,
      isApproximate,
      onFiltersUpdated,
      onQuerySubmit,
      onRefresh,
      query,
      timeRange.from,
      timeRange.to,
    ]
  );

  return {
    dataViews,
    filters,
    query,
    searchBarProps,
    timeRange,
  };
};
