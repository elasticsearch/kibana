/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { FilterGroup } from '@kbn/alerts-ui-shared/src/alert_filter_controls/filter_group';
import { FilterGroupLoading } from '@kbn/alerts-ui-shared/src/alert_filter_controls/loading';
import type { FilterControlConfig } from '@kbn/alerts-ui-shared/src/alert_filter_controls/types';
import type { Filter, Query, TimeRange } from '@kbn/es-query';
import { createKbnUrlStateStorage, Storage } from '@kbn/kibana-utils-plugin/public';
import { convertCamelCasedKeysToSnakeCase } from '@kbn/presentation-publishing';
import {
  WORKFLOW_EXECUTIONS_DATA_VIEW_CREATE_SPEC,
  WORKFLOW_EXECUTIONS_DATA_VIEW_ID,
} from './workflow_executions_data_view';
import {
  DEFAULT_EXECUTION_PAGE_FILTERS,
  EXECUTION_FILTERS_STORAGE_KEY,
  EXECUTION_FILTERS_URL_PARAM_KEY,
} from './workflow_executions_page_constants';
import { useKibana } from '../../hooks/use_kibana';
import { useSpaceId } from '../../hooks/use_space_id';

export interface WorkflowExecutionsFiltersProps {
  filters: Filter[];
  query?: Query;
  timeRange: TimeRange;
  onFiltersChange: (filters: Filter[]) => void;
}

export const WorkflowExecutionsFilters = React.memo<WorkflowExecutionsFiltersProps>(
  ({ filters, query, timeRange, onFiltersChange }) => {
    const { dataViews } = useKibana().services;
    const spaceId = useSpaceId();
    const history = useHistory();
    const location = useLocation();
    const [isDataViewReady, setIsDataViewReady] = useState(false);

    const urlStorage = useMemo(
      () =>
        createKbnUrlStateStorage({
          history,
          useHash: false,
          useHashQuery: false,
        }),
      [history]
    );

    const persisted = urlStorage.get<FilterControlConfig[] | undefined>(
      EXECUTION_FILTERS_URL_PARAM_KEY
    );
    const controlsUrlState = persisted
      ? persisted.map(convertCamelCasedKeysToSnakeCase)
      : undefined;

    const setControlsUrlState = useCallback(
      (next: FilterControlConfig[]) => {
        urlStorage.set(EXECUTION_FILTERS_URL_PARAM_KEY, next);
      },
      [urlStorage]
    );

    const scopedDataViews = useMemo(
      () => ({
        ...dataViews,
        create: (
          spec: Parameters<typeof dataViews.create>[0],
          _skipFetchFields?: boolean,
          displayErrors?: boolean
        ) => dataViews.create(spec, true, displayErrors),
      }),
      [dataViews]
    );

    useEffect(() => {
      let cancelled = false;

      (async () => {
        await scopedDataViews.create(WORKFLOW_EXECUTIONS_DATA_VIEW_CREATE_SPEC);
        if (!cancelled) {
          setIsDataViewReady(true);
        }
      })();

      return () => {
        cancelled = true;
        dataViews.clearInstanceCache();
      };
    }, [dataViews, scopedDataViews]);

    const handleFilterChanges = useCallback(
      (newFilters: Filter[]) => {
        onFiltersChange(
          newFilters.map((filter) => ({
            ...filter,
            meta: {
              ...filter.meta,
              disabled: false,
            },
          }))
        );
      },
      [onFiltersChange]
    );

    if (!spaceId) {
      return null;
    }

    if (!isDataViewReady) {
      return (
        <div data-test-subj="workflowExecutionsFilters" key={location.search}>
          <FilterGroupLoading />
        </div>
      );
    }

    return (
      <div data-test-subj="workflowExecutionsFilters" key={location.search}>
        <FilterGroup
          controlsUrlState={controlsUrlState}
          dataViewId={WORKFLOW_EXECUTIONS_DATA_VIEW_ID}
          defaultControls={DEFAULT_EXECUTION_PAGE_FILTERS}
          filters={filters}
          maxControls={4}
          onFiltersChange={handleFilterChanges}
          query={query}
          ruleTypeIds={[]}
          setControlsUrlState={setControlsUrlState}
          spaceId={spaceId}
          storageKey={EXECUTION_FILTERS_STORAGE_KEY}
          Storage={Storage}
          timeRange={timeRange}
        />
      </div>
    );
  }
);
WorkflowExecutionsFilters.displayName = 'WorkflowExecutionsFilters';
