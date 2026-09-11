/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createSelector } from 'redux-toolkit-v1';
import type { FilterManager } from '@kbn/data-plugin/public';
import { isOfAggregateQueryType } from '@kbn/es-query';
import type { LensState, DatasourceMap, VisualizationMap } from '@kbn/lens-common';
import { getDatasourceLayers } from './utils';
import { mergeToNewDoc } from './shared_logic';

export const selectPersistedDoc = (state: LensState) => state.lens.persistedDoc;
export const selectQuery = (state: LensState) => state.lens.query;
export const selectSearchSessionId = (state: LensState) => state.lens.searchSessionId;
export const selectFilters = (state: LensState) => state.lens.filters;
export const selectResolvedDateRange = (state: LensState) => state.lens.resolvedDateRange;
export const selectProjectRouting = (state: LensState) => state.lens.projectRouting;
export const selectAdHocDataViews = (state: LensState) =>
  Object.fromEntries(
    Object.values(state.lens.dataViews.indexPatterns)
      .filter((indexPattern) => !indexPattern.isPersisted)
      .map((indexPattern) => [indexPattern.id, indexPattern.spec!])
  );
export const selectVisualization = (state: LensState) => state.lens.visualization;
export const selectStagedPreview = (state: LensState) => state.lens.stagedPreview;
export const selectStagedActiveData = (state: LensState) =>
  state.lens.stagedPreview?.activeData || state.lens.activeData;
export const selectAutoApplyEnabled = (state: LensState) => !state.lens.autoApplyDisabled;
export const selectChangesApplied = (state: LensState) =>
  !state.lens.autoApplyDisabled || Boolean(state.lens.changesApplied);
export const selectDatasourceStates = (state: LensState) => state.lens.datasourceStates;
export const selectVisualizationState = (state: LensState) => state.lens.visualization;
export const selectActiveDatasourceId = (state: LensState) => state.lens.activeDatasourceId;
export const selectActiveData = (state: LensState) => state.lens.activeData;
export const selectDataViews = (state: LensState) => state.lens.dataViews;
export const selectIsManaged = (state: LensState) => state.lens.managed;
export const selectIsFullscreenDatasource = (state: LensState) =>
  Boolean(state.lens.isFullscreenDatasource);
export const selectSelectedLayerId = (state: LensState) => state.lens.visualization.selectedLayerId;

/**
 * Selector to check if the text-based (ES|QL) editor should be hidden.
 * This is set to true when the parent application (e.g., Discover) explicitly
 * requests hiding the editor. Used primarily for flyout structure decisions.
 */
export const selectHideTextBasedEditor = (state: LensState) => state.lens.hideTextBasedEditor;

/**
 * Selector to determine if the user can edit a text-based (ES|QL) query.
 * Returns true only when:
 * 1. The editor is not explicitly hidden (hideTextBasedEditor is false)
 * 2. The current query is an aggregate/ES|QL query type
 *
 * Used by ESQLEditor and ConfigPanel to decide whether to render the ES|QL editor.
 */
export const selectCanEditTextBasedQuery = (state: LensState) =>
  !state.lens.hideTextBasedEditor && isOfAggregateQueryType(state.lens.query);

let applyChangesCounter: number | undefined;
export const selectTriggerApplyChanges = (state: LensState) => {
  const shouldApply = state.lens.applyChangesCounter !== applyChangesCounter;
  applyChangesCounter = state.lens.applyChangesCounter;
  return shouldApply;
};

// TODO - is there any point to keeping this around since we have selectExecutionSearchContext?
export const selectExecutionContext = createSelector(
  [selectQuery, selectFilters, selectResolvedDateRange, selectProjectRouting],
  (query, filters, dateRange, projectRouting) => ({
    now: Date.now(),
    dateRange,
    query,
    filters,
    projectRouting,
  })
);

export const selectExecutionContextSearch = createSelector(selectExecutionContext, (res) => ({
  now: res.now,
  query: isOfAggregateQueryType(res.query) ? undefined : res.query,
  timeRange: {
    from: res.dateRange.fromDate,
    to: res.dateRange.toDate,
  },
  filters: res.filters,
  disableWarningToasts: true,
  projectRouting: res.projectRouting,
}));

const selectInjectedDependencies = (_state: LensState, dependencies: unknown) => dependencies;

// use this type to cast selectInjectedDependencies to require whatever outside dependencies the selector needs
type SelectInjectedDependenciesFunction<T> = (state: LensState, dependencies: T) => T;

export const selectSavedObjectFormat = createSelector(
  [
    selectPersistedDoc,
    selectVisualization,
    selectDatasourceStates,
    selectQuery,
    selectFilters,
    selectActiveDatasourceId,
    selectAdHocDataViews,
    selectInjectedDependencies as SelectInjectedDependenciesFunction<{
      datasourceMap: DatasourceMap;
      visualizationMap: VisualizationMap;
      extractFilterReferences: FilterManager['extract'];
    }>,
  ],
  mergeToNewDoc
);

export const selectCurrentVisualization = createSelector(
  [selectVisualization, selectStagedPreview],
  (visualization, stagedPreview) => (stagedPreview ? stagedPreview.visualization : visualization)
);

export const selectCurrentDatasourceStates = createSelector(
  [selectDatasourceStates, selectStagedPreview],
  (datasourceStates, stagedPreview) =>
    stagedPreview ? stagedPreview.datasourceStates : datasourceStates
);

export const selectAreDatasourcesLoaded = createSelector(
  selectDatasourceStates,
  (datasourceStates) =>
    Object.values(datasourceStates).every(({ isLoading }) => isLoading === false)
);

export const selectDatasourceLayers = createSelector(
  [
    selectDatasourceStates,
    selectInjectedDependencies as SelectInjectedDependenciesFunction<DatasourceMap>,
    selectDataViews,
    selectActiveData,
  ],
  (datasourceStates, datasourceMap, dataViews, activeData) =>
    getDatasourceLayers(datasourceStates, datasourceMap, dataViews.indexPatterns, activeData)
);

export const selectFramePublicAPI = createSelector(
  [
    selectCurrentDatasourceStates,
    selectActiveData,
    selectInjectedDependencies as SelectInjectedDependenciesFunction<DatasourceMap>,
    selectDataViews,
    selectExecutionContext,
  ],
  (datasourceStates, activeData, datasourceMap, dataViews, context) => {
    return {
      datasourceLayers: getDatasourceLayers(
        datasourceStates,
        datasourceMap,
        dataViews.indexPatterns,
        activeData
      ),
      activeData,
      dataViews,
      ...context,
      absDateRange: context.dateRange,
    };
  }
);
