/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DataView } from '@kbn/data-views-plugin/common';
import type { AggregateQuery, Query } from '@kbn/es-query';
import { isOfAggregateQueryType } from '@kbn/es-query';
import type { DiscoverSessionTab } from '@kbn/saved-search-plugin/common';
import type { IUiSettingsClient } from '@kbn/core/public';
import {
  DEFAULT_COLUMNS_SETTING,
  DOC_HIDE_TIME_COLUMN_SETTING,
  getChartHidden,
  getTableHidden,
  getSidebarClosed,
  getDefaultSort,
  getSortArray,
  SORT_DEFAULT_ORDER_SETTING,
} from '@kbn/discover-utils';
import { cloneDeep } from 'lodash';
import { ENABLE_ESQL, getInitialESQLQuery } from '@kbn/esql-utils';
import { DISCOVER_QUERY_MODE_KEY } from '../../../../../common/constants';
import type { DiscoverServices } from '../../../../build_services';
import type { DiscoverAppState } from '../redux';
import {
  isEsqlSource,
  createEsqlDataSource,
  createDataSource,
} from '../../../../../common/data_sources';
import { handleSourceColumnState } from '../../../../utils/state_helpers';
import { getValidViewMode } from '../../utils/get_valid_view_mode';
import type { DefaultEsqlQueryConfig } from '../../../../context_awareness';

export function getInitialAppState({
  initialUrlState,
  hasGlobalState = false,
  persistedTab,
  dataView,
  services,
  defaultProfileEsqlQuery,
}: {
  initialUrlState: DiscoverAppState | undefined;
  hasGlobalState?: boolean;
  persistedTab: DiscoverSessionTab | undefined;
  dataView: DataView | Pick<DataView, 'id' | 'timeFieldName'> | undefined;
  services: DiscoverServices;
  defaultProfileEsqlQuery?: DefaultEsqlQueryConfig;
}) {
  const defaultAppState = getDefaultAppState({
    persistedTab,
    dataView,
    services,
    initialUrlState,
    hasGlobalState,
    defaultProfileEsqlQuery,
  });
  const mergedState = { ...defaultAppState, ...initialUrlState };

  // https://github.com/elastic/kibana/issues/122555
  if (typeof mergedState.hideChart !== 'boolean') {
    mergedState.hideChart = undefined;
  }

  if (typeof mergedState.hideTable !== 'boolean') {
    mergedState.hideTable = undefined;
  }

  if (typeof mergedState.hideSidebar !== 'boolean') {
    mergedState.hideSidebar = undefined;
  }

  if (mergedState.hideChart && mergedState.hideTable) {
    mergedState.hideTable = false;
  }

  // Don't allow URL state to overwrite the data source if there's an ES|QL query
  if (isOfAggregateQueryType(mergedState.query) && !isEsqlSource(mergedState.dataSource)) {
    mergedState.dataSource = createEsqlDataSource();
  }

  return handleSourceColumnState(mergedState, services.uiSettings);
}

function getDefaultColumns(
  persistedTab: DiscoverSessionTab | undefined,
  uiSettings: IUiSettingsClient
) {
  if (persistedTab?.columns && persistedTab.columns.length > 0) {
    return [...persistedTab.columns];
  }
  const defaultColumnsFromConfig = uiSettings.get(DEFAULT_COLUMNS_SETTING);
  const hasPersistedEmptyColumns = persistedTab?.columns && persistedTab.columns.length === 0;
  return defaultColumnsFromConfig?.length
    ? [...defaultColumnsFromConfig]
    : hasPersistedEmptyColumns
    ? []
    : undefined;
}

function getDefaultQuery({
  initialUrlState,
  hasGlobalState,
  persistedTab,
  services,
  dataView,
  defaultProfileEsqlQuery,
}: {
  persistedTab: DiscoverSessionTab | undefined;
  services: DiscoverServices;
  dataView: DataView | Pick<DataView, 'id' | 'timeFieldName'> | undefined;
  initialUrlState: DiscoverAppState | undefined;
  hasGlobalState: boolean;
  defaultProfileEsqlQuery?: DefaultEsqlQueryConfig;
}): Query | AggregateQuery | undefined {
  if (persistedTab?.serializedSearchSource.query) return persistedTab.serializedSearchSource.query;

  // If there is global or app state (_g or _a) in the URL we should respect it and assume it's a classic query
  // This is also useful to reuse the query mode if we are opening a new tab from an existing one
  const hasInitialUrlState = Object.keys(initialUrlState || {}).length > 0;
  if (hasGlobalState || hasInitialUrlState)
    return initialUrlState?.query || services.data.query.queryString.getDefaultQuery();

  // If the last query mode used by the user was classic, just return the default query
  const queryMode = services.storage.get(DISCOVER_QUERY_MODE_KEY);
  if (queryMode === 'classic') return services.data.query.queryString.getDefaultQuery();

  // If the last query mode used by the user was esql, or if esql is default, return the initial esql query
  const canUseEsql = services.uiSettings.get(ENABLE_ESQL) && dataView instanceof DataView;
  const isEsqlDefault = services.discoverFeatureFlags.getIsEsqlDefault();
  if (canUseEsql && (queryMode === 'esql' || isEsqlDefault))
    return { esql: defaultProfileEsqlQuery?.query ?? getInitialESQLQuery(dataView) };

  // Lastly, fall back to classic if we can't use anything else
  return services.data.query.queryString.getDefaultQuery();
}

function getDefaultAppState({
  persistedTab,
  dataView,
  services,
  initialUrlState,
  hasGlobalState,
  defaultProfileEsqlQuery,
}: {
  persistedTab: DiscoverSessionTab | undefined;
  dataView: DataView | Pick<DataView, 'id' | 'timeFieldName'> | undefined;
  services: DiscoverServices;
  initialUrlState: DiscoverAppState | undefined;
  hasGlobalState: boolean;
  defaultProfileEsqlQuery?: DefaultEsqlQueryConfig;
}) {
  const { uiSettings, storage } = services;
  const query = getDefaultQuery({
    persistedTab,
    services,
    dataView,
    initialUrlState,
    hasGlobalState,
    defaultProfileEsqlQuery,
  });
  const isEsqlQuery = isOfAggregateQueryType(query);
  // If the data view doesn't have a getFieldByName method (e.g. if it's a spec or list item),
  // we assume the sort array is valid since we can't know for sure
  const sort =
    dataView && 'getFieldByName' in dataView
      ? getSortArray(persistedTab?.sort ?? [], dataView, isEsqlQuery)
      : persistedTab?.sort ?? [];
  const columns = getDefaultColumns(persistedTab, uiSettings);
  const chartHidden = getChartHidden(storage, 'discover');
  const tableHidden = getTableHidden(storage, 'discover');
  const sidebarHidden = getSidebarClosed(storage, 'discover');
  const dataSource = createDataSource({
    dataView: dataView ?? persistedTab?.serializedSearchSource.index,
    query,
  });

  const defaultState: DiscoverAppState = {
    query,
    sort: !sort.length
      ? getDefaultSort(
          dataView,
          uiSettings.get(SORT_DEFAULT_ORDER_SETTING, 'desc'),
          uiSettings.get(DOC_HIDE_TIME_COLUMN_SETTING, false),
          isEsqlQuery
        )
      : sort,
    columns,
    dataSource,
    interval: 'auto',
    filters: cloneDeep(persistedTab?.serializedSearchSource.filter),
    hideChart: chartHidden,
    hideTable: tableHidden,
    hideSidebar: sidebarHidden,
    viewMode: undefined,
    hideAggregatedPreview: undefined,
    savedQuery: undefined,
    rowHeight: undefined,
    headerRowHeight: undefined,
    rowsPerPage: undefined,
    sampleSize: undefined,
    grid: undefined,
    breakdownField: undefined,
    density: undefined,
  };

  if (persistedTab?.grid) {
    defaultState.grid = persistedTab.grid;
  }
  if (persistedTab?.hideChart !== undefined) {
    defaultState.hideChart = persistedTab.hideChart;
  }
  if (persistedTab?.hideTable !== undefined) {
    defaultState.hideTable = persistedTab.hideTable;
  }
  if (persistedTab?.rowHeight !== undefined) {
    defaultState.rowHeight = persistedTab.rowHeight;
  }
  if (persistedTab?.headerRowHeight !== undefined) {
    defaultState.headerRowHeight = persistedTab.headerRowHeight;
  }
  if (persistedTab?.viewMode) {
    defaultState.viewMode = getValidViewMode({
      viewMode: persistedTab.viewMode,
      isEsqlMode: isEsqlQuery,
    });
  }
  if (persistedTab?.hideAggregatedPreview) {
    defaultState.hideAggregatedPreview = persistedTab.hideAggregatedPreview;
  }
  if (persistedTab?.rowsPerPage) {
    defaultState.rowsPerPage = persistedTab.rowsPerPage;
  }
  if (persistedTab?.sampleSize) {
    defaultState.sampleSize = persistedTab.sampleSize;
  }
  if (persistedTab?.breakdownField) {
    defaultState.breakdownField = persistedTab.breakdownField;
  }
  if (persistedTab?.chartInterval) {
    defaultState.interval = persistedTab.chartInterval;
  }
  if (persistedTab?.density) {
    defaultState.density = persistedTab.density;
  }

  return defaultState;
}
