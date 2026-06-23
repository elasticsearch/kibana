/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiHorizontalRule, EuiSpacer } from '@elastic/eui';
import React, { useCallback, useMemo, useState } from 'react';
import type { Filter, Query, TimeRange } from '@kbn/es-query';
import { createWorkflowExecutionsDataView } from './workflow_executions_data_view';
import { WorkflowExecutionsFilters } from './workflow_executions_filters';
import { useWorkflowExecutionsHttpInterceptor } from './workflow_executions_http_interceptor';
import { WorkflowExecutionsSearchBar } from './workflow_executions_search_bar';
import { WorkflowExecutionsTable } from './workflow_executions_table';
import { useKibana } from '../../hooks/use_kibana';
import { useSpaceId } from '../../hooks/use_space_id';

const DEFAULT_TIME_RANGE: TimeRange = {
  from: 'now-24h',
  to: 'now',
};

const DEFAULT_QUERY: Query = {
  query: '',
  language: 'kuery',
};

const EMPTY_FILTERS: Filter[] = [];

export const WorkflowExecutionsPageContent = React.memo(() => {
  const { fieldFormats } = useKibana().services;
  const spaceId = useSpaceId();
  useWorkflowExecutionsHttpInterceptor();
  const dataView = useMemo(() => createWorkflowExecutionsDataView(fieldFormats), [fieldFormats]);

  const [query, setQuery] = useState<Query>(DEFAULT_QUERY);
  const [submittedQuery, setSubmittedQuery] = useState<Query>(DEFAULT_QUERY);
  const [timeRange, setTimeRange] = useState<TimeRange>(DEFAULT_TIME_RANGE);
  const [controlFilters, setControlFilters] = useState<Filter[]>(EMPTY_FILTERS);
  const [searchBarFilters, setSearchBarFilters] = useState<Filter[]>(EMPTY_FILTERS);

  const combinedFilters = useMemo(
    () => [...controlFilters, ...searchBarFilters],
    [controlFilters, searchBarFilters]
  );

  const handleQueryChange = useCallback(
    ({ query: nextQuery, dateRange }: { query?: Query; dateRange: TimeRange }) => {
      if (nextQuery) {
        setQuery(nextQuery);
      }
      setTimeRange(dateRange);
    },
    []
  );

  const handleQuerySubmit = useCallback(
    ({ query: nextQuery, dateRange }: { query?: Query; dateRange: TimeRange }) => {
      if (nextQuery) {
        setQuery(nextQuery);
        setSubmittedQuery(nextQuery);
      }
      setTimeRange(dateRange);
    },
    []
  );

  return (
    <div data-test-subj="workflowExecutionsPageContent">
      <WorkflowExecutionsSearchBar
        dataView={dataView}
        filters={searchBarFilters}
        onFiltersUpdated={setSearchBarFilters}
        onQueryChange={handleQueryChange}
        onQuerySubmit={handleQuerySubmit}
        query={query}
        timeRange={timeRange}
      />
      <EuiSpacer size="l" />
      <WorkflowExecutionsFilters
        filters={controlFilters}
        onFiltersChange={setControlFilters}
        query={submittedQuery}
        timeRange={timeRange}
      />
      <EuiSpacer size="l" />
      <EuiHorizontalRule margin="none" />
      <EuiSpacer size="l" />
      {spaceId ? (
        <WorkflowExecutionsTable
          dataView={dataView}
          filters={combinedFilters}
          query={submittedQuery}
          spaceId={spaceId}
          timeRange={timeRange}
        />
      ) : null}
    </div>
  );
});
WorkflowExecutionsPageContent.displayName = 'WorkflowExecutionsPageContent';
