/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useMemo } from 'react';
import { getEsQueryConfig } from '@kbn/data-plugin/public';
import type { DataView } from '@kbn/data-views-plugin/common';
import { buildEsQuery } from '@kbn/es-query';
import type { Filter, Query, TimeRange } from '@kbn/es-query';
import type { ESSearchResponse } from '@kbn/es-types';
import { useQuery } from '@kbn/react-query';
import type { SortOrder } from '@kbn/unified-data-table';
import type { EsWorkflowExecution } from '@kbn/workflows';
import {
  buildWorkflowExecutionsSearchFilters,
  getWorkflowExecutionsFetchErrorMessage,
} from './workflow_executions_search_query';
import { useKibana } from '../../hooks/use_kibana';

export interface UseWorkflowExecutionsSearchParams {
  dataView: DataView;
  query: Query;
  filters: Filter[];
  timeRange: TimeRange;
  spaceId: string;
  pageIndex: number;
  pageSize: number;
  sort: SortOrder[];
  enabled?: boolean;
}

export const useWorkflowExecutionsSearch = ({
  dataView,
  query,
  filters,
  timeRange,
  spaceId,
  pageIndex,
  pageSize,
  sort,
  enabled = true,
}: UseWorkflowExecutionsSearchParams) => {
  const { http, uiSettings } = useKibana().services;
  const timeField = dataView.timeFieldName ?? 'startedAt';

  const searchFilters = useMemo(
    () =>
      buildWorkflowExecutionsSearchFilters({
        spaceId,
        timeRange,
        timeField,
        userFilters: filters,
      }),
    [filters, spaceId, timeField, timeRange]
  );

  const esQuery = useMemo(
    () =>
      buildEsQuery(
        dataView,
        query?.query ? [query] : [],
        searchFilters,
        getEsQueryConfig(uiSettings)
      ),
    [dataView, query, searchFilters, uiSettings]
  );

  const sortParam = useMemo(
    () => sort.map(([field, direction]) => ({ [field]: { order: direction } })),
    [sort]
  );

  return useQuery<ESSearchResponse<EsWorkflowExecution>>({
    networkMode: 'always',
    queryKey: [
      'workflows',
      'executions',
      'search',
      spaceId,
      query,
      filters,
      timeRange,
      pageIndex,
      pageSize,
      sort,
      esQuery,
    ],
    queryFn: () =>
      http.get<ESSearchResponse<EsWorkflowExecution>>('/internal/workflows/executions', {
        version: '1',
        query: {
          query: JSON.stringify(esQuery),
          from: pageIndex * pageSize,
          size: pageSize,
          sort: JSON.stringify(sortParam),
          trackTotalHits: true,
        },
      }),
    enabled,
    retry: false,
    meta: {
      errorMessage: getWorkflowExecutionsFetchErrorMessage(),
    },
  });
};
