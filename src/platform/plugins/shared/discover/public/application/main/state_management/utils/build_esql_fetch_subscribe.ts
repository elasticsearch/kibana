/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isOfAggregateQueryType } from '@kbn/es-query';
import { getIndexPatternFromESQLQuery, hasTransformationalCommand } from '@kbn/esql-utils';
import { SOURCE_COLUMN } from '@kbn/unified-data-table';
import { isEqual } from 'lodash';
import type { DataSourceService } from '@kbn/data-source';
import { registerEsqlSourceInDataViewsCache, unregisterFromDataViewsCache } from '@kbn/data-source';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { DataDocumentsMsg, SavedSearchData } from '../discover_data_state_container';
import { FetchStatus } from '../../../types';
import type { InternalStateStore, TabActionInjector, TabState } from '../redux';
import { internalStateActions } from '../redux';
import { getValidViewMode } from '../../utils/get_valid_view_mode';
import { shouldResetProfileAppStateDefaultField } from './profile_app_state_defaults';

const ESQL_MAX_NUM_OF_COLUMNS = 50;
const ESQL_TABLE_VIEW_COLUMN_THRESHOLD = 5;

/*
 * Takes care of ES|QL state transformations when a new result is returned
 * If necessary this is setting displayed columns and selected data view
 */
export const buildEsqlFetchSubscribe = ({
  internalState,
  dataSubjects,
  getCurrentTab,
  injectCurrentTab,
  dataSourceService,
  dataViews,
}: {
  internalState: InternalStateStore;
  dataSubjects: SavedSearchData;
  getCurrentTab: () => TabState;
  injectCurrentTab: TabActionInjector;
  dataSourceService: DataSourceService;
  dataViews: DataViewsPublicPluginStart;
}) => {
  let prevEsqlData: {
    initialFetch: boolean;
    query: string;
    allColumns: string[];
    defaultColumns: string[];
  } = {
    initialFetch: true,
    query: '',
    allColumns: [],
    defaultColumns: [],
  };

  let registeredEsqlSourceId: string | undefined;

  const cleanupEsql = () => {
    if (!prevEsqlData.query) {
      return;
    }

    if (registeredEsqlSourceId) {
      dataSourceService.unregisterEsqlSource(registeredEsqlSourceId);
      unregisterFromDataViewsCache(dataViews, registeredEsqlSourceId);
      registeredEsqlSourceId = undefined;
    }

    // cleanup when it's not an ES|QL query
    prevEsqlData = {
      initialFetch: true,
      query: '',
      allColumns: [],
      defaultColumns: [],
    };
  };

  const esqlFetchSubscribe = async (next: DataDocumentsMsg) => {
    const { query: nextQuery } = next;

    if (!nextQuery) {
      return;
    }

    if (!isOfAggregateQueryType(nextQuery)) {
      // cleanup for a "regular" query
      cleanupEsql();
      return;
    }

    // We need to mark profile app state default fields to reset on index pattern
    // changes when loading starts to ensure the correct pre fetch state is
    // available before data fetching is triggered
    if (next.fetchStatus === FetchStatus.LOADING) {
      // We have to grab the current query from appState
      // here since nextQuery has not been updated yet
      const appStateQuery = getCurrentTab().appState.query;

      if (isOfAggregateQueryType(appStateQuery)) {
        if (prevEsqlData.initialFetch) {
          prevEsqlData.query = appStateQuery.esql;
        }

        const indexPatternChanged =
          getIndexPatternFromESQLQuery(appStateQuery.esql) !==
          getIndexPatternFromESQLQuery(prevEsqlData.query);

        // Mark all profile app state default fields to reset when the index pattern changes
        if (indexPatternChanged) {
          internalState.dispatch(
            injectCurrentTab(internalStateActions.setProfileAppStateDefaultFieldsToReset)({
              fieldsToReset: 'all',
            })
          );
        }
      }

      return;
    }

    if (next.fetchStatus === FetchStatus.ERROR) {
      // An error occurred, but it's still considered an initial fetch
      prevEsqlData.initialFetch = false;
      return;
    }

    if (next.fetchStatus !== FetchStatus.PARTIAL) {
      return;
    }

    let nextAllColumns = prevEsqlData.allColumns;
    let nextDefaultColumns = prevEsqlData.defaultColumns;

    const responseColumns =
      next.dataSource?.getColumns().map((c) => c.name) ??
      (next.result?.length ? Object.keys(next.result[0].raw) : undefined);

    if (responseColumns !== undefined) {
      nextAllColumns = responseColumns;

      if (
        hasTransformationalCommand(nextQuery.esql) ||
        nextAllColumns.length <= ESQL_TABLE_VIEW_COLUMN_THRESHOLD
      ) {
        nextDefaultColumns = nextAllColumns.slice(0, ESQL_MAX_NUM_OF_COLUMNS);
      } else {
        nextDefaultColumns = [];
      }
    }

    const isInitialFetch = prevEsqlData.initialFetch;

    if (isInitialFetch) {
      prevEsqlData.initialFetch = false;
      prevEsqlData.query = nextQuery.esql;
      prevEsqlData.allColumns = nextAllColumns;

      const appStateColumns = getCurrentTab().appState.columns;
      const hasNoKnownAppStateColumns = appStateColumns === undefined;
      const shouldTriggerColumnsUpdate = nextDefaultColumns.length > 0 && hasNoKnownAppStateColumns;

      prevEsqlData.defaultColumns = shouldTriggerColumnsUpdate ? [] : nextDefaultColumns;
    }

    const indexPatternChanged =
      getIndexPatternFromESQLQuery(nextQuery.esql) !==
      getIndexPatternFromESQLQuery(prevEsqlData.query);

    const changeDefaultColumns =
      indexPatternChanged || !isEqual(nextDefaultColumns, prevEsqlData.defaultColumns);

    const appStateColumns = getCurrentTab().appState.columns ?? [];
    const stickSource = !shouldResetProfileAppStateDefaultField(
      getCurrentTab().profileAppStateDefaults,
      'columns'
    );
    const columnsFromResponse = appStateColumns.filter(
      (column) => responseColumns?.includes(column) ?? true
    );
    const nextSelectedColumns = withStickySource(appStateColumns, columnsFromResponse, stickSource);
    const changeSelectedColumns = !isInitialFetch && !isEqual(nextSelectedColumns, appStateColumns);

    const { viewMode } = getCurrentTab().appState;
    const changeViewMode = viewMode !== getValidViewMode({ viewMode, isEsqlMode: true });

    prevEsqlData.allColumns = nextAllColumns;

    if (indexPatternChanged || changeDefaultColumns || changeSelectedColumns || changeViewMode) {
      prevEsqlData.query = nextQuery.esql;
      prevEsqlData.defaultColumns = nextDefaultColumns;

      // just change URL state if necessary
      if (changeDefaultColumns || changeSelectedColumns || changeViewMode) {
        let nextColumns: string[] | undefined;
        if (changeDefaultColumns) {
          nextColumns = withStickySource(appStateColumns, nextDefaultColumns, stickSource);
        } else if (changeSelectedColumns) {
          nextColumns = nextSelectedColumns;
        }

        const nextState = {
          ...(nextColumns && { columns: nextColumns }),
          ...(changeViewMode && { viewMode: undefined }),
        };

        await internalState.dispatch(
          injectCurrentTab(internalStateActions.updateAppStateAndReplaceUrl)({
            appState: nextState,
          })
        );
      }
    }

    if (next.dataSource?.kind === 'esql') {
      dataSourceService.registerEsqlSource(next.dataSource);
      // TODO: remove once DSL code no longer looks up DataViews for ES|QL sources
      const nextDataView = await registerEsqlSourceInDataViewsCache(dataViews, next.dataSource);
      registeredEsqlSourceId = next.dataSource.id;
      if (nextDataView) {
        await internalState.dispatch(
          injectCurrentTab(internalStateActions.assignNextDataView)({ dataView: nextDataView })
        );
      }
    }

    dataSubjects.documents$.next({
      ...next,
      fetchStatus: FetchStatus.COMPLETE,
    });
  };

  return { esqlFetchSubscribe, cleanupEsql };
};

/**
 * Inserts Summary (`_source`) into the new ES|QL column list at its previous index
 * when `stickSource` is true. Does not re-insert Summary if the user turned it off.
 */
const withStickySource = (
  previousColumns: string[],
  nextColumns: string[],
  stickSource: boolean
): string[] => {
  if (!stickSource) {
    return nextColumns;
  }

  const sourceIndex = previousColumns.indexOf(SOURCE_COLUMN);
  if (sourceIndex === -1) {
    return nextColumns;
  }

  const columnsWithoutSource = nextColumns.filter((column) => column !== SOURCE_COLUMN);
  const insertAt = Math.min(sourceIndex, columnsWithoutSource.length);
  return [
    ...columnsWithoutSource.slice(0, insertAt),
    SOURCE_COLUMN,
    ...columnsWithoutSource.slice(insertAt),
  ];
};
