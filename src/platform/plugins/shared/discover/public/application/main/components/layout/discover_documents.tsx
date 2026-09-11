/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiProgress,
  EuiScreenReaderOnly,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { css } from '@emotion/react';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import type { DataView } from '@kbn/data-views-plugin/public';
import type { SortOrder } from '@kbn/saved-search-plugin/public';
import { CellActionsProvider } from '@kbn/cell-actions';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import { SearchResponseWarningsCallout } from '@kbn/search-response-warnings';
import type {
  DataGridDensity,
  JsonModeSettings,
  DocumentsDisplayMode,
  UnifiedDataTableProps,
  UnifiedDataTableRestorableState,
  UseColumnsProps,
} from '@kbn/unified-data-table';
import {
  DataLoadingState,
  useColumns,
  type DataTableColumnsMeta,
  getTextBasedColumnsMeta,
  getRenderCustomToolbarWithElements,
  getDataGridDensity,
  getRowHeight,
} from '@kbn/unified-data-table';
import {
  MAX_DOC_FIELDS_DISPLAYED,
  ROW_HEIGHT_OPTION,
  SHOW_MULTIFIELDS,
  SORT_DEFAULT_ORDER_SETTING,
} from '@kbn/discover-utils';
import type { DocViewFilterFn } from '@kbn/unified-doc-viewer/types';
import type { DiscoverGridSettings } from '@kbn/saved-search-plugin/common';
import useLatest from 'react-use/lib/useLatest';
import { isOfAggregateQueryType } from '@kbn/es-query';
import { DISCOVER_CELL_ACTIONS_TRIGGER_ID } from '@kbn/ui-actions-plugin/common/trigger_ids';
import { BehaviorSubject } from 'rxjs';
import { DiscoverGrid } from '../../../../components/discover_grid';
import { getDefaultRowsPerPage } from '../../../../../common/constants';
import {
  selectTabCombinedFilters,
  useAppStateSelector,
  useCurrentTabRuntimeState,
  type ExpandedDocCascadePath,
} from '../../state_management/redux';
import { useDiscoverServices } from '../../../../hooks/use_discover_services';
import { FetchStatus } from '../../../types';
import { useDataState } from '../../hooks/use_data_state';
import {
  getMaxAllowedSampleSize,
  getAllowedSampleSize,
} from '../../../../utils/get_allowed_sample_size';
import { useFetchMoreRecords } from './use_fetch_more_records';
import { onResizeGridColumn } from '../../../../utils/on_resize_grid_column';
import { showTimeFieldColumn } from '../../../../utils/show_time_field_column';
import { useIsEsqlMode } from '../../hooks/use_is_esql_mode';
import type {
  CellRenderersExtensionParams,
  UpdateESQLQueryFn,
} from '../../../../context_awareness';
import { useAdditionalCellActions, useProfileAccessor } from '../../../../context_awareness';
import {
  DEFAULT_EXPANDED_DOC_OWNER,
  internalStateActions,
  useCurrentTabAction,
  useCurrentTabSelector,
  useCurrentTabDataStateContainer,
  useInternalStateDispatch,
  useInternalStateSelector,
} from '../../state_management/redux';
import type { CascadedDocumentsContext } from './cascaded_documents';
import { isCascadedDocumentsVisible } from './cascaded_documents';
import { SaveDiscoverTableButton } from './save_discover_table_button';
import type { RenderViewModeToggle } from '../../../../components/view_mode_toggle';

// export needs for testing
export const onResize = (
  colSettings: { columnId: string; width: number | undefined },
  currentGrid: DiscoverGridSettings | undefined,
  updateGrid: (grid: DiscoverGridSettings) => void
) => {
  updateGrid(onResizeGridColumn(colSettings, currentGrid));
};

function DiscoverDocumentsComponent({
  renderViewModeToggle,
  dataView,
  onAddFilter,
  onFieldEdited,
}: {
  renderViewModeToggle: RenderViewModeToggle;
  dataView: DataView;
  onAddFilter?: DocViewFilterFn;
  onFieldEdited?: (options: { editedDataView: DataView }) => void;
}) {
  const [isDataGridFullScreen, setIsDataGridFullScreen] = useState(false);
  const styles = useMemoCss(componentStyles);
  const services = useDiscoverServices();
  const dispatch = useInternalStateDispatch();
  const updateAppState = useCurrentTabAction(internalStateActions.updateAppState);
  const persistedDiscoverSession = useInternalStateSelector(
    (state) => state.persistedDiscoverSession
  );
  const { dataViews, capabilities, uiSettings, uiActions, discoverFeatureFlags } = services;
  const requestParams = useCurrentTabSelector((state) => state.dataRequestParams);
  const [
    dataSource,
    query,
    sort,
    rowHeight,
    headerRowHeight,
    rowsPerPage,
    grid,
    columns,
    sampleSizeState,
    density,
    documentsDisplayMode,
    jsonModeSettings,
  ] = useAppStateSelector((state) => {
    return [
      state.dataSource,
      state.query,
      state.sort,
      state.rowHeight,
      state.headerRowHeight,
      state.rowsPerPage,
      state.grid,
      state.columns,
      state.sampleSize,
      state.density,
      state.documentsDisplayMode,
      state.jsonModeSettings,
    ];
  });
  const expandedDoc = useCurrentTabSelector((state) => state.expandedDoc);
  const expandedDocOwner = useCurrentTabSelector((state) => state.expandedDocOwner);
  const isEsqlMode = useIsEsqlMode();
  const dataStateContainer = useCurrentTabDataStateContainer();
  const documentState = useDataState(dataStateContainer.data$.documents$);
  const isWarningCalloutDismissed = useCurrentTabSelector(
    (state) => state.isWarningCalloutDismissed
  );
  const setIsWarningCalloutDismissed = useCurrentTabAction(
    internalStateActions.setIsWarningCalloutDismissed
  );
  const dismissWarningCallout = useCallback(() => {
    dispatch(setIsWarningCalloutDismissed({ isWarningCalloutDismissed: true }));
  }, [dispatch, setIsWarningCalloutDismissed]);
  const isDataLoading =
    documentState.fetchStatus === FetchStatus.LOADING ||
    documentState.fetchStatus === FetchStatus.PARTIAL;

  // This is needed to prevent EuiDataGrid pushing onSort because the data view has been switched.
  // It's just necessary for non ES|QL requests since they don't have a partial result state, that's
  // considered as loading state in the Component.
  // 1. When switching the data view, the sorting in the URL is reset to the default sorting of the selected data view.
  // 2. The new sort param is already available in this component and propagated to the EuiDataGrid.
  // 3. currentColumns are still referring to the old state
  // 4. since the new sort by field isn't available in currentColumns EuiDataGrid is emitting a 'onSort', which is unsorting the grid
  // 5. this is propagated to Discover's URL and causes an unwanted change of state to an unsorted state
  // This solution switches to the loading state in this component when the URL index doesn't match the dataView.id
  const isDataViewLoading =
    useCurrentTabSelector((state) => state.isDataViewLoading) && !isEsqlMode;
  const isEmptyDataResult = !documentState.result || documentState.result.length === 0;
  const rows = useMemo(() => documentState.result || [], [documentState.result]);

  const { isMoreDataLoading, totalHits, onFetchMoreRecords } = useFetchMoreRecords();

  const setAppState = useCallback<UseColumnsProps['setAppState']>(
    ({ settings, ...rest }) => {
      dispatch(updateAppState({ appState: { ...rest, grid: settings as DiscoverGridSettings } }));
    },
    [dispatch, updateAppState]
  );

  const { columns: currentColumns, onSetColumns } = useColumns({
    capabilities,
    defaultOrder: uiSettings.get(SORT_DEFAULT_ORDER_SETTING),
    dataView,
    dataViews,
    setAppState,
    columns,
    sort,
    settings: grid,
  });

  const setExpandedDoc = useCurrentTabAction(internalStateActions.setExpandedDoc);
  const getExpandedDocSetter = useCallback(
    (
        owner: string,
        expandedDocCascadePath?: ExpandedDocCascadePath
      ): NonNullable<UnifiedDataTableProps['setExpandedDoc']> =>
      (
        doc: DataTableRecord | undefined,
        options?: {
          initialTabId?: string;
          initialTabState?: object;
        }
      ) => {
        dispatch(
          setExpandedDoc({
            expandedDoc: doc,
            expandedDocOwner: doc ? owner : undefined,
            expandedDocCascadePath: doc ? expandedDocCascadePath : undefined,
            initialDocViewerTabId: options?.initialTabId,
            initialDocViewerTabState: options?.initialTabState,
          })
        );
      },
    [dispatch, setExpandedDoc]
  );

  const setExpandedDocForDefaultOwner = useMemo(
    () => getExpandedDocSetter(DEFAULT_EXPANDED_DOC_OWNER),
    [getExpandedDocSetter]
  );

  const latestExpandedDocOwner = useLatest(expandedDocOwner);
  const setRenderDocumentViewMeta = useCurrentTabAction(
    internalStateActions.setRenderDocumentViewMeta
  );
  const getRenderDocumentViewMetaSetter = useCallback(
    (owner: string): UnifiedDataTableProps['setRenderDocumentViewMeta'] | undefined => {
      return (meta) => {
        if (latestExpandedDocOwner.current === owner) {
          dispatch(setRenderDocumentViewMeta({ renderDocumentViewMeta: meta }));
        }
      };
    },
    [dispatch, latestExpandedDocOwner, setRenderDocumentViewMeta]
  );

  const setRenderDocumentViewMetaForDefaultOwner = useMemo(
    () => getRenderDocumentViewMetaSetter(DEFAULT_EXPANDED_DOC_OWNER),
    [getRenderDocumentViewMetaSetter]
  );

  const latestGrid = useLatest(grid);
  const onResizeDataGrid = useCallback<NonNullable<UnifiedDataTableProps['onResize']>>(
    (colSettings) => {
      onResize(colSettings, latestGrid.current, (nextGrid) => {
        dispatch(updateAppState({ appState: { grid: nextGrid } }));
      });
    },
    [dispatch, latestGrid, updateAppState]
  );

  const onUpdateRowsPerPage = useCallback(
    (nextRowsPerPage: number) => {
      dispatch(updateAppState({ appState: { rowsPerPage: nextRowsPerPage } }));
    },
    [dispatch, updateAppState]
  );

  const onUpdateSampleSize = useCallback(
    (newSampleSize: number) => {
      dispatch(updateAppState({ appState: { sampleSize: newSampleSize } }));
    },
    [dispatch, updateAppState]
  );

  const onSort = useCallback(
    (nextSort: string[][]) => {
      dispatch(updateAppState({ appState: { sort: nextSort } }));
    },
    [dispatch, updateAppState]
  );

  const onUpdateRowHeight = useCallback(
    (newRowHeight: number) => {
      dispatch(updateAppState({ appState: { rowHeight: newRowHeight } }));
    },
    [dispatch, updateAppState]
  );

  const onUpdateHeaderRowHeight = useCallback(
    (newHeaderRowHeight: number) => {
      dispatch(updateAppState({ appState: { headerRowHeight: newHeaderRowHeight } }));
    },
    [dispatch, updateAppState]
  );

  const onUpdateDensity = useCallback(
    (newDensity: DataGridDensity) => {
      dispatch(updateAppState({ appState: { density: newDensity } }));
    },
    [dispatch, updateAppState]
  );

  const onUpdateDocumentsDisplayMode = useCallback(
    (newDocumentsDisplayMode: DocumentsDisplayMode) => {
      dispatch(updateAppState({ appState: { documentsDisplayMode: newDocumentsDisplayMode } }));
    },
    [dispatch, updateAppState]
  );

  const onUpdateJsonModeSettings = useCallback(
    (newJsonModeSettings: JsonModeSettings) => {
      dispatch(updateAppState({ appState: { jsonModeSettings: newJsonModeSettings } }));
    },
    [dispatch, updateAppState]
  );

  // should be aligned with embeddable `showTimeCol` prop
  const showTimeCol = useMemo(
    () => showTimeFieldColumn({ uiSettings, query }),
    [uiSettings, query]
  );

  const columnsMeta: DataTableColumnsMeta | undefined = useMemo(
    () =>
      documentState.esqlQueryColumns
        ? getTextBasedColumnsMeta(documentState.esqlQueryColumns)
        : undefined,
    [documentState.esqlQueryColumns]
  );
  const filters = useCurrentTabSelector(selectTabCombinedFilters);

  const cellActionsMetadata = useAdditionalCellActions({
    dataSource,
    dataView,
    query,
    filters,
    timeRange: requestParams.timeRangeAbsolute,
  });

  const updateESQLQuery = useCurrentTabAction(internalStateActions.updateESQLQuery);
  const onUpdateESQLQuery: UpdateESQLQueryFn = useCallback(
    (queryOrUpdater) => {
      dispatch(updateESQLQuery({ queryOrUpdater }));
    },
    [dispatch, updateESQLQuery]
  );

  const dataGridUiState = useCurrentTabSelector((state) => state.uiState.dataGrid);
  const setDataGridUiState = useCurrentTabAction(internalStateActions.setDataGridUiState);
  const onInitialStateChange = useCallback(
    (newDataGridUiState: Partial<UnifiedDataTableRestorableState>) => {
      dispatch(setDataGridUiState({ dataGridUiState: newDataGridUiState }));
    },
    [dispatch, setDataGridUiState]
  );

  const configRowHeight = uiSettings.get(ROW_HEIGHT_OPTION);
  const cellRendererDensity = useMemo(
    () => density ?? dataGridUiState?.density ?? getDataGridDensity(services.storage, 'discover'),
    [density, dataGridUiState, services.storage]
  );
  const cellRendererRowHeight = useMemo(
    () =>
      getRowHeight({
        storage: services.storage,
        consumer: 'discover',
        rowHeightState: rowHeight ?? dataGridUiState?.rowHeight,
        configRowHeight,
      }),
    [rowHeight, dataGridUiState, services.storage, configRowHeight]
  );
  const cellRendererParams: CellRenderersExtensionParams = useMemo(
    () => ({
      dataView,
      density: cellRendererDensity,
      rowHeight: cellRendererRowHeight,
    }),
    [dataView, cellRendererDensity, cellRendererRowHeight]
  );

  const getCellRenderersAccessor = useProfileAccessor('getCellRenderers');
  const cellRenderers = useMemo(() => {
    return getCellRenderersAccessor(() => ({}))(cellRendererParams);
  }, [cellRendererParams, getCellRenderersAccessor]);

  const callouts = useMemo(
    () => (
      <SearchResponseWarningsCallout
        warnings={documentState.interceptedWarnings ?? []}
        isDismissed={isWarningCalloutDismissed}
        onDismiss={dismissWarningCallout}
      />
    ),
    [dismissWarningCallout, documentState.interceptedWarnings, isWarningCalloutDismissed]
  );

  const loadingIndicator = useMemo(
    () =>
      isDataLoading ? (
        <EuiProgress
          data-test-subj="discoverDataGridUpdating"
          size="xs"
          color="accent"
          position="absolute"
          css={styles.progress}
        />
      ) : null,
    [isDataLoading, styles.progress]
  );

  const canSaveDiscoverTable = services.embeddableEditor.canSaveToDashboard();

  const saveToDashboardButton = useMemo(
    () => (canSaveDiscoverTable ? <SaveDiscoverTableButton /> : undefined),
    [canSaveDiscoverTable]
  );

  const renderCustomToolbarWithElements = useMemo(
    () =>
      getRenderCustomToolbarWithElements({
        saveToDashboardButton,
        leftSide: isDataGridFullScreen ? undefined : renderViewModeToggle(),
        bottomSection: (
          <>
            {callouts}
            {loadingIndicator}
          </>
        ),
      }),
    [renderViewModeToggle, callouts, loadingIndicator, isDataGridFullScreen, saveToDashboardButton]
  );

  const [expandedDoc$] = useState(() => new BehaviorSubject(expandedDoc));
  const [expandedDocOwner$] = useState(() => new BehaviorSubject(expandedDocOwner));

  useEffect(() => {
    expandedDoc$.next(expandedDoc);
    expandedDocOwner$.next(expandedDocOwner);
  }, [expandedDoc, expandedDoc$, expandedDocOwner, expandedDocOwner$]);

  const cascadedDocumentsFetcher = useCurrentTabRuntimeState(
    (runtimeState) => runtimeState.cascadedDocumentsFetcher$
  );
  const latestDataCascadeUiState = useLatest(
    useCurrentTabSelector((tab) => tab.uiState.dataCascade)
  );
  const latestCascadedDocumentsDataGridsUiState = useLatest(
    useCurrentTabSelector((tab) => tab.uiState.cascadedDocumentsDataGridMap)
  );
  const {
    availableCascadeGroups,
    selectedCascadeGroups,
    columnsMeta: cascadedColumnsMeta,
  } = useCurrentTabSelector((tab) => tab.cascadedDocumentsState);
  const setSelectedCascadeGroups = useCurrentTabAction(
    internalStateActions.setSelectedCascadeGroups
  );
  const setDataCascadeUiState = useCurrentTabAction(internalStateActions.setDataCascadeUiState);
  const setCascadedDocumentsDataGridUiState = useCurrentTabAction(
    internalStateActions.setCascadedDocumentsDataGridUiState
  );
  const esqlVariables = useCurrentTabSelector((tab) => tab.esqlVariables);
  const esqlApproximation = useAppStateSelector((state) => state.esqlApproximation ?? false);
  const cascadedDocumentsContext = useMemo<CascadedDocumentsContext | undefined>(() => {
    if (
      !isCascadedDocumentsVisible(availableCascadeGroups, query) ||
      !isOfAggregateQueryType(query)
    ) {
      return undefined;
    }

    return {
      cascadedDocumentsFetcher,
      availableCascadeGroups,
      selectedCascadeGroups,
      cascadedColumnsMeta,
      esqlQuery: query,
      esqlVariables,
      timeRange: requestParams.timeRangeAbsolute,
      esqlApproximation,
      renderViewModeToggle,
      expandedDoc$,
      expandedDocOwner$,
      getExpandedDocSetter,
      getRenderDocumentViewMetaSetter,
      getDataCascadeUiState: () => latestDataCascadeUiState.current,
      getDataGridUiStateMap: () => latestCascadedDocumentsDataGridsUiState.current,
      setDataCascadeUiState: (nextUiState) =>
        dispatch(setDataCascadeUiState({ dataCascadeUiState: nextUiState })),
      setDataGridUiState: (nodeId, uiState) =>
        dispatch(setCascadedDocumentsDataGridUiState({ nodeId, dataGridUiState: uiState })),
      cascadeGroupingChangeHandler: (newSelectedCascadeGroups) => {
        dispatch(setSelectedCascadeGroups({ selectedCascadeGroups: newSelectedCascadeGroups }));
      },
      onUpdateESQLQuery,
      openInNewTab: (params) => dispatch(internalStateActions.openInNewTab(params)),
    };
  }, [
    availableCascadeGroups,
    cascadedDocumentsFetcher,
    cascadedColumnsMeta,
    dispatch,
    esqlVariables,
    expandedDoc$,
    expandedDocOwner$,
    getExpandedDocSetter,
    getRenderDocumentViewMetaSetter,
    esqlApproximation,
    latestCascadedDocumentsDataGridsUiState,
    latestDataCascadeUiState,
    onUpdateESQLQuery,
    query,
    requestParams.timeRangeAbsolute,
    selectedCascadeGroups,
    setCascadedDocumentsDataGridUiState,
    setDataCascadeUiState,
    setSelectedCascadeGroups,
    renderViewModeToggle,
  ]);

  const isDataTableJsonViewEnabled = useMemo(
    () => discoverFeatureFlags.getDataTableJsonViewEnabled(),
    [discoverFeatureFlags]
  );

  if (isDataViewLoading || (isEmptyDataResult && isDataLoading)) {
    return (
      // class is used in tests
      <div className="dscDocuments__loading" css={styles.dscDocumentsLoading}>
        <EuiText size="xs" color="subdued">
          <EuiLoadingSpinner />
          <EuiSpacer size="s" />
          <FormattedMessage id="discover.loadingDocuments" defaultMessage="Loading documents" />
        </EuiText>
      </div>
    );
  }

  return (
    <EuiFlexItem
      data-test-subj="discoverDocumentsTable"
      aria-labelledby="documentsAriaLabel"
      css={styles.container}
    >
      <EuiScreenReaderOnly>
        <h2 id="documentsAriaLabel">
          <FormattedMessage id="discover.documentsAriaLabel" defaultMessage="Documents" />
        </h2>
      </EuiScreenReaderOnly>
      <div className="unifiedDataTable" css={styles.dataTable}>
        <CellActionsProvider getTriggerCompatibleActions={uiActions.getTriggerCompatibleActions}>
          <DiscoverGrid
            ariaLabelledBy="documentsAriaLabel"
            cascadedDocumentsContext={cascadedDocumentsContext}
            columns={currentColumns}
            columnsMeta={columnsMeta}
            expandedDoc={expandedDocOwner === DEFAULT_EXPANDED_DOC_OWNER ? expandedDoc : undefined}
            dataView={dataView}
            loadingState={
              isDataLoading
                ? DataLoadingState.loading
                : isMoreDataLoading
                ? DataLoadingState.loadingMore
                : DataLoadingState.loaded
            }
            rows={rows}
            sort={(sort as SortOrder[]) || []}
            searchDescription={persistedDiscoverSession?.description}
            searchTitle={persistedDiscoverSession?.title} // TODO: should it be rather a tab label?
            setExpandedDoc={setExpandedDocForDefaultOwner}
            showTimeCol={showTimeCol}
            settings={grid}
            onFilter={onAddFilter as DocViewFilterFn}
            onSetColumns={onSetColumns}
            onSort={onSort}
            onResize={onResizeDataGrid}
            configHeaderRowHeight={3}
            headerRowHeightState={headerRowHeight}
            onUpdateHeaderRowHeight={onUpdateHeaderRowHeight}
            rowHeightState={rowHeight}
            onUpdateRowHeight={onUpdateRowHeight}
            isSortEnabled={true}
            isPlainRecord={isEsqlMode}
            isPaginationEnabled={!isEsqlMode}
            rowsPerPageState={rowsPerPage ?? getDefaultRowsPerPage(services.uiSettings)}
            onUpdateRowsPerPage={onUpdateRowsPerPage}
            maxAllowedSampleSize={getMaxAllowedSampleSize(services.uiSettings)}
            sampleSizeState={getAllowedSampleSize(sampleSizeState, services.uiSettings)}
            onUpdateSampleSize={!isEsqlMode ? onUpdateSampleSize : undefined}
            onFieldEdited={onFieldEdited}
            configRowHeight={configRowHeight}
            showMultiFields={uiSettings.get(SHOW_MULTIFIELDS)}
            maxDocFieldsDisplayed={uiSettings.get(MAX_DOC_FIELDS_DISPLAYED)}
            renderDocumentView="external"
            setRenderDocumentViewMeta={setRenderDocumentViewMetaForDefaultOwner}
            renderCustomToolbar={renderCustomToolbarWithElements}
            services={services}
            totalHits={totalHits}
            onFetchMoreRecords={onFetchMoreRecords}
            externalCustomRenderers={cellRenderers}
            dataGridDensityState={density}
            onUpdateDataGridDensity={onUpdateDensity}
            query={query}
            cellActionsTriggerId={DISCOVER_CELL_ACTIONS_TRIGGER_ID}
            cellActionsMetadata={cellActionsMetadata}
            cellActionsHandling="append"
            initialState={dataGridUiState}
            onInitialStateChange={onInitialStateChange}
            onFullScreenChange={setIsDataGridFullScreen}
            documentsDisplayModeState={
              isDataTableJsonViewEnabled ? documentsDisplayMode : undefined
            }
            onUpdateDocumentsDisplayMode={
              isDataTableJsonViewEnabled ? onUpdateDocumentsDisplayMode : undefined
            }
            jsonModeSettingsState={isDataTableJsonViewEnabled ? jsonModeSettings : undefined}
            onUpdateJsonModeSettings={
              isDataTableJsonViewEnabled ? onUpdateJsonModeSettings : undefined
            }
          />
        </CellActionsProvider>
      </div>
    </EuiFlexItem>
  );
}

export const DiscoverDocuments = memo(DiscoverDocumentsComponent);

const componentStyles = {
  container: css({
    position: 'relative',
    minHeight: 0,
  }),
  progress: css({
    zIndex: 2,
  }),
  dscDocumentsLoading: css({
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    textAlign: 'center',
    height: '100%',
    width: '100%',
  }),
  dataTable: css({
    width: '100%',
    maxWidth: '100%',
    height: '100%',
    overflow: 'hidden',
  }),
};
