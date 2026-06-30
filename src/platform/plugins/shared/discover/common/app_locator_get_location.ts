/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { GlobalQueryStateFromUrl } from '@kbn/data-plugin/public';
import { isFilterPinned, isOfAggregateQueryType } from '@kbn/es-query';
import type { setStateToKbnUrl as setStateToKbnUrlCommon } from '@kbn/kibana-utils-plugin/common';
import type {
  DiscoverAppLocatorGetLocation,
  DiscoverAppLocatorParams,
  MainHistoryLocationState,
} from './app_locator';
import type { DiscoverAppState } from '../public';
import { createDataViewDataSource, createEsqlDataSource } from './data_sources';
import { APP_STATE_URL_KEY, GLOBAL_STATE_URL_KEY, TAB_STATE_URL_KEY } from './constants';

export const appLocatorGetLocationCommon = async (
  {
    useHash: useHashOriginal,
    setStateToKbnUrl,
  }: {
    useHash: boolean;
    setStateToKbnUrl: typeof setStateToKbnUrlCommon;
  },
  ...[params]: Parameters<DiscoverAppLocatorGetLocation>
): ReturnType<DiscoverAppLocatorGetLocation> => {
  const { useHash = useHashOriginal, savedSearchId, searchSessionId, tab } = params;
  const savedSearchPath = savedSearchId ? `view/${encodeURIComponent(savedSearchId)}` : '';

  let path = `#/${savedSearchPath}`;

  if (searchSessionId) {
    path = `${path}?searchSessionId=${searchSessionId}`;
  }

  const { appState, globalState, state } = parseAppLocatorParams(params);

  if (Object.keys(globalState).length) {
    path = setStateToKbnUrl<GlobalQueryStateFromUrl>(
      GLOBAL_STATE_URL_KEY,
      globalState,
      { useHash },
      path
    );
  }

  if (Object.keys(appState).length) {
    path = setStateToKbnUrl(APP_STATE_URL_KEY, appState, { useHash }, path);
  }

  if (tab?.id) {
    path = setStateToKbnUrl(
      TAB_STATE_URL_KEY,
      { tabId: tab.id, tabLabel: 'label' in tab ? tab.label : undefined },
      { useHash },
      path
    );
  }

  return {
    app: 'discover',
    path,
    state,
  };
};

export const parseAppLocatorParams = (params: DiscoverAppLocatorParams) => {
  const {
    filters,
    dataViewId,
    indexPatternId,
    dataViewSpec,
    query,
    refreshInterval,
    timeRange,
    columns,
    grid,
    savedQuery,
    sort,
    interval,
    viewMode,
    hideAggregatedPreview,
    breakdownField,
    hideChart,
    hideTable,
    hideSidebar,
    sampleSize,
    isAlertResults,
    esqlControls,
  } = params;

  const appState: Partial<DiscoverAppState> = {};
  const globalState: GlobalQueryStateFromUrl = {};

  if (query) appState.query = query;
  if (filters && filters.length) appState.filters = filters?.filter((f) => !isFilterPinned(f));
  if (indexPatternId)
    appState.dataSource = createDataViewDataSource({ dataViewId: indexPatternId });
  if (dataViewId) appState.dataSource = createDataViewDataSource({ dataViewId });
  if (isOfAggregateQueryType(query)) appState.dataSource = createEsqlDataSource();
  if (columns) appState.columns = columns;
  if (grid) appState.grid = grid;
  if (savedQuery) appState.savedQuery = savedQuery;
  if (sort) appState.sort = sort;
  if (interval) appState.interval = interval;
  if (timeRange) globalState.time = timeRange;
  if (filters && filters.length) globalState.filters = filters?.filter((f) => isFilterPinned(f));
  if (refreshInterval) globalState.refreshInterval = refreshInterval;
  if (viewMode) appState.viewMode = viewMode;
  if (hideAggregatedPreview) appState.hideAggregatedPreview = hideAggregatedPreview;
  if (breakdownField) appState.breakdownField = breakdownField;
  if (typeof hideChart === 'boolean') appState.hideChart = hideChart;
  if (typeof hideTable === 'boolean') appState.hideTable = hideTable;
  if (typeof hideSidebar === 'boolean') appState.hideSidebar = hideSidebar;
  if (typeof sampleSize === 'number' && sampleSize > 0) appState.sampleSize = sampleSize;

  const state: MainHistoryLocationState = {};

  if (dataViewSpec) state.dataViewSpec = dataViewSpec;
  if (isAlertResults) state.isAlertResults = isAlertResults;
  if (esqlControls) state.esqlControls = esqlControls;

  return { appState, globalState, state };
};
