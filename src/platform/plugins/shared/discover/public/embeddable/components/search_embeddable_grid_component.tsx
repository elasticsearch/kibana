/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo, useState } from 'react';
import { BehaviorSubject } from 'rxjs';

import type { DataView } from '@kbn/data-views-plugin/common';
import { SORT_DEFAULT_ORDER_SETTING, getSortArray } from '@kbn/discover-utils';
import { useBatchedPublishingSubjects, type FetchContext } from '@kbn/presentation-publishing';
import { apiPublishesESQLVariables } from '@kbn/esql-types';
import type { SortOrder } from '@kbn/saved-search-plugin/public';
import type { SearchResponseIncompleteWarning } from '@kbn/search-response-warnings/src/types';
import type {
  DataGridDensity,
  JsonModeSettings,
  DocumentsDisplayMode,
} from '@kbn/unified-data-table';
import { DataLoadingState, useColumns } from '@kbn/unified-data-table';
import type { DocViewFilterFn } from '@kbn/unified-doc-viewer/types';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import type { DocViewerApi } from '@kbn/unified-doc-viewer';
import type { DiscoverGridSettings } from '@kbn/saved-search-plugin/common';
import useObservable from 'react-use/lib/useObservable';
import {
  DISCOVER_CELL_ACTIONS_TRIGGER_ID,
  SEARCH_EMBEDDABLE_CELL_ACTIONS_TRIGGER_ID,
} from '@kbn/ui-actions-plugin/common/trigger_ids';
import { useDiscoverServices } from '../../hooks/use_discover_services';
import { getAllowedSampleSize, getMaxAllowedSampleSize } from '../../utils/get_allowed_sample_size';
import { isEsqlMode } from '../initialize_fetch';
import type { SearchEmbeddableApi, SearchEmbeddableStateManager } from '../types';
import { DiscoverGridEmbeddable, type InlineEditing } from './saved_search_grid';
import { getSearchEmbeddableDefaults } from '../get_search_embeddable_defaults';
import { onResizeGridColumn } from '../../utils/on_resize_grid_column';
import { showTimeFieldColumn } from '../../utils/show_time_field_column';
import { useAdditionalCellActions } from '../../context_awareness';
import { getTimeRangeFromFetchContext } from '../utils/update_search_source';
import { createDataSource } from '../../../common/data_sources';
import { replaceColumnsWithVariableDriven } from '../utils/replace_columns_with_variable_driven';
import type { DiscoverAppLocatorParams } from '../../../common';
import { getExpandedDocLinkability } from '../../application/main/utils/expanded_doc';
import { getExpandedDocLocatorParams } from '../utils/get_discover_locator_params';
import {
  useCopyLocatorLink,
  useShareDirectLinkAction,
} from '../../components/discover_grid_flyout';

interface SavedSearchEmbeddableComponentProps {
  api: SearchEmbeddableApi & {
    fetchWarnings$: BehaviorSubject<SearchResponseIncompleteWarning[]>;
    fetchContext$: BehaviorSubject<FetchContext | undefined>;
  };
  dataView: DataView;
  onAddFilter?: DocViewFilterFn;
  enableDocumentViewer: boolean;
  inlineEditing: InlineEditing;
  docViewerRef: React.RefObject<DocViewerApi>;
  expandedDoc: DataTableRecord | undefined;
  initialDocViewerTabId: string | undefined;
  setExpandedDoc?: (doc: DataTableRecord | undefined, options?: { initialTabId?: string }) => void;
  stateManager: SearchEmbeddableStateManager;
}

const DiscoverGridEmbeddableMemoized = React.memo(DiscoverGridEmbeddable);

export function SearchEmbeddableGridComponent({
  api,
  dataView,
  onAddFilter,
  enableDocumentViewer,
  inlineEditing,
  docViewerRef,
  expandedDoc,
  initialDocViewerTabId,
  setExpandedDoc,
  stateManager,
}: SavedSearchEmbeddableComponentProps) {
  const discoverServices = useDiscoverServices();
  const parentApi = api.parentApi;

  const esqlVariables$ = apiPublishesESQLVariables(parentApi)
    ? parentApi.esqlVariables$
    : undefined;

  const [emptyEsqlVariables$] = useState(() => new BehaviorSubject(undefined));

  const [
    loading,
    savedSearch,
    savedSearchId,
    interceptedWarnings,
    apiQuery,
    apiFilters,
    fetchContext,
    rows,
    totalHitCount,
    columnsMeta,
    grid,
    panelTitle,
    panelDescription,
    savedSearchTitle,
    savedSearchDescription,
    esqlVariables,
  ] = useBatchedPublishingSubjects(
    api.dataLoading$,
    api.savedSearch$,
    api.savedObjectId$,
    api.fetchWarnings$,
    api.query$,
    api.filters$,
    api.fetchContext$,
    stateManager.rows,
    stateManager.totalHitCount,
    stateManager.columnsMeta,
    stateManager.grid,
    api.title$,
    api.description$,
    api.defaultTitle$,
    api.defaultDescription$,
    esqlVariables$ ?? emptyEsqlVariables$
  );

  // `api.query$` and `api.filters$` are the initial values from the saved search SO (as of now)
  // `fetchContext.query` and `fetchContext.filters` are Dashboard's query and filters
  const savedSearchQuery = apiQuery;
  const savedSearchFilters = apiFilters;

  const isEsql = useMemo(() => isEsqlMode(savedSearch), [savedSearch]);

  const sort = useMemo(
    () => getSortArray(savedSearch.sort ?? [], dataView, isEsql),
    [dataView, isEsql, savedSearch.sort]
  );

  const originalColumns = useMemo(() => {
    return replaceColumnsWithVariableDriven(
      savedSearch.columns,
      columnsMeta,
      esqlVariables,
      isEsql
    );
  }, [columnsMeta, isEsql, esqlVariables, savedSearch.columns]);

  const { columns, onAddColumn, onRemoveColumn, onMoveColumn, onSetColumns } = useColumns({
    capabilities: discoverServices.capabilities,
    defaultOrder: discoverServices.uiSettings.get(SORT_DEFAULT_ORDER_SETTING),
    dataView,
    dataViews: discoverServices.dataViews,
    setAppState: (params) => {
      if (params.columns) {
        stateManager.columns.next(params.columns);
      }
      if (params.sort) {
        stateManager.sort.next(params.sort as SortOrder[]);
      }
      if (params.settings) {
        stateManager.grid.next(params.settings as DiscoverGridSettings);
      }
    },
    columns: originalColumns,
    sort,
    settings: grid,
  });

  const dataSource = useMemo(
    () => createDataSource({ dataView, query: savedSearchQuery }),
    [dataView, savedSearchQuery]
  );
  const timeRange = useMemo(
    () => (fetchContext ? getTimeRangeFromFetchContext(fetchContext) : undefined),
    [fetchContext]
  );

  const expandedDocLinkability = useMemo(
    () => getExpandedDocLinkability(savedSearchQuery, expandedDoc),
    [savedSearchQuery, expandedDoc]
  );

  const buildExpandedDocLocatorParams = useCallback(
    (): DiscoverAppLocatorParams =>
      getExpandedDocLocatorParams({
        api,
        savedSearch,
        dataView,
        query: savedSearchQuery,
        panelFilters: savedSearchFilters,
        dashboardFilters: fetchContext?.filters,
        columns,
        sort,
        grid,
        isEsql,
        esqlVariables,
        expandedDoc,
        timeRange,
        timefilter: discoverServices.timefilter,
      }),
    [
      api,
      dataView,
      savedSearchQuery,
      savedSearchFilters,
      fetchContext,
      columns,
      sort,
      grid,
      savedSearch,
      isEsql,
      esqlVariables,
      expandedDoc,
      timeRange,
      discoverServices.timefilter,
    ]
  );

  const copyExpandedDocLink = useCopyLocatorLink(buildExpandedDocLocatorParams);
  const shareDirectLinkActions = useShareDirectLinkAction({
    copyLink: copyExpandedDocLink,
    linkability: expandedDocLinkability,
  });
  const canShareExpandedDocLink =
    Boolean(discoverServices.capabilities.discover_v2.show) ||
    Boolean(discoverServices.capabilities.discover_v2.save);
  const flyoutMenuTrailingActions = useMemo(
    () => (canShareExpandedDocLink && expandedDoc ? shareDirectLinkActions : undefined),
    [canShareExpandedDocLink, expandedDoc, shareDirectLinkActions]
  );

  const cellActionsMetadata = useAdditionalCellActions({
    dataSource,
    dataView,
    query: savedSearchQuery,
    filters: savedSearchFilters,
    timeRange,
  });

  // Security Solution overrides our cell actions -- this is a temporary workaroud to keep
  // things working as they do currently until we can migrate their actions to One Discover
  const isInSecuritySolution =
    useObservable(discoverServices.application.currentAppId$) === 'securitySolutionUI';

  const onStateEditedProps = useMemo(
    () => ({
      onAddColumn,
      onSetColumns,
      onMoveColumn,
      onRemoveColumn,
      onUpdateRowsPerPage: (newRowsPerPage: number | undefined) => {
        stateManager.rowsPerPage.next(newRowsPerPage);
      },
      onUpdateRowHeight: (newRowHeight: number | undefined) => {
        stateManager.rowHeight.next(newRowHeight);
      },
      onUpdateHeaderRowHeight: (newHeaderRowHeight: number | undefined) => {
        stateManager.headerRowHeight.next(newHeaderRowHeight);
      },
      onSort: (nextSort: string[][]) => {
        const sortOrderArr: SortOrder[] = [];
        nextSort.forEach((arr) => {
          sortOrderArr.push(arr as SortOrder);
        });
        stateManager.sort.next(sortOrderArr);
      },
      onUpdateSampleSize: (newSampleSize: number | undefined) => {
        stateManager.sampleSize.next(newSampleSize);
      },
      onUpdateDataGridDensity: (newDensity: DataGridDensity | undefined) => {
        stateManager.density.next(newDensity);
      },
      onUpdateDocumentsDisplayMode: (newDocumentsDisplayMode: DocumentsDisplayMode) => {
        stateManager.documentsDisplayMode.next(newDocumentsDisplayMode);
      },
      onUpdateJsonModeSettings: (newJsonModeSettings: JsonModeSettings) => {
        stateManager.jsonModeSettings.next(newJsonModeSettings);
      },
      onResize: (newGridSettings: { columnId: string; width: number | undefined }) => {
        stateManager.grid.next(onResizeGridColumn(newGridSettings, grid));
      },
    }),
    [
      onAddColumn,
      onSetColumns,
      onMoveColumn,
      onRemoveColumn,
      stateManager.rowsPerPage,
      stateManager.rowHeight,
      stateManager.headerRowHeight,
      stateManager.sort,
      stateManager.sampleSize,
      stateManager.density,
      stateManager.documentsDisplayMode,
      stateManager.jsonModeSettings,
      stateManager.grid,
      grid,
    ]
  );

  const fetchedSampleSize = useMemo(() => {
    return getAllowedSampleSize(savedSearch.sampleSize, discoverServices.uiSettings);
  }, [savedSearch.sampleSize, discoverServices]);

  const defaults = getSearchEmbeddableDefaults(discoverServices.uiSettings);

  // should be aligned with discover documents `showTimeCol` prop
  const showTimeCol = useMemo(
    () => showTimeFieldColumn({ uiSettings: discoverServices.uiSettings, query: savedSearchQuery }),
    [discoverServices.uiSettings, savedSearchQuery]
  );

  const isDataTableJsonViewEnabled = useMemo(
    () => discoverServices.discoverFeatureFlags.getDataTableJsonViewEnabled(),
    [discoverServices.discoverFeatureFlags]
  );

  return (
    <DiscoverGridEmbeddableMemoized
      {...onStateEditedProps}
      onUpdateSampleSize={isEsql ? undefined : onStateEditedProps.onUpdateSampleSize}
      columns={columns}
      dataView={dataView}
      interceptedWarnings={interceptedWarnings}
      onFilter={onAddFilter}
      rows={rows}
      rowsPerPageState={savedSearch.rowsPerPage ?? defaults.rowsPerPage}
      sampleSizeState={fetchedSampleSize}
      searchDescription={panelDescription || savedSearchDescription}
      sort={sort}
      totalHitCount={totalHitCount}
      settings={savedSearch.grid}
      ariaLabelledBy={'documentsAriaLabel'}
      cellActionsTriggerId={
        isInSecuritySolution
          ? SEARCH_EMBEDDABLE_CELL_ACTIONS_TRIGGER_ID
          : DISCOVER_CELL_ACTIONS_TRIGGER_ID
      }
      cellActionsMetadata={isInSecuritySolution ? undefined : cellActionsMetadata}
      cellActionsHandling={isInSecuritySolution ? 'replace' : 'append'}
      columnsMeta={columnsMeta}
      configHeaderRowHeight={defaults.headerRowHeight}
      configRowHeight={defaults.rowHeight}
      headerRowHeightState={savedSearch.headerRowHeight}
      rowHeightState={savedSearch.rowHeight}
      isPlainRecord={isEsql}
      loadingState={Boolean(loading) ? DataLoadingState.loading : DataLoadingState.loaded}
      maxAllowedSampleSize={getMaxAllowedSampleSize(discoverServices.uiSettings)}
      query={savedSearchQuery}
      filters={savedSearchFilters}
      savedSearchId={savedSearchId}
      searchTitle={panelTitle || savedSearchTitle}
      services={discoverServices}
      showTimeCol={showTimeCol}
      dataGridDensityState={savedSearch.density}
      documentsDisplayModeState={
        isDataTableJsonViewEnabled ? savedSearch.documentsDisplayMode : undefined
      }
      onUpdateDocumentsDisplayMode={
        isDataTableJsonViewEnabled ? onStateEditedProps.onUpdateDocumentsDisplayMode : undefined
      }
      jsonModeSettingsState={isDataTableJsonViewEnabled ? savedSearch.jsonModeSettings : undefined}
      onUpdateJsonModeSettings={
        isDataTableJsonViewEnabled ? onStateEditedProps.onUpdateJsonModeSettings : undefined
      }
      enableDocumentViewer={enableDocumentViewer}
      inlineEditing={inlineEditing}
      expandedDoc={expandedDoc}
      initialDocViewerTabId={initialDocViewerTabId}
      docViewerRef={docViewerRef}
      setExpandedDoc={setExpandedDoc}
      flyoutMenuTrailingActions={flyoutMenuTrailingActions}
    />
  );
}
