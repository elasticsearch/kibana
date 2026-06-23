/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEqual, keys } from 'lodash/fp';
import {
  EuiCallOut,
  EuiPanel,
  EuiSkeletonText,
  EuiProgress,
  EuiTablePagination,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { toMountPoint } from '@kbn/react-kibana-mount';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { pagePathGetters } from '@kbn/fleet-plugin/public';
import { Storage } from '@kbn/kibana-utils-plugin/public';
import type {
  UnifiedDataTableSettings,
  UnifiedDataTableRestorableState,
} from '@kbn/unified-data-table';
import { UnifiedDataTable, DataLoadingState, DataGridDensity } from '@kbn/unified-data-table';
import { CellActionsProvider } from '@kbn/cell-actions';
import type { DataViewField } from '@kbn/data-views-plugin/common';
import type { DataTableRecord } from '@kbn/discover-utils';
import { useAllResults } from './use_all_results';
import { Direction } from '../../common/search_strategy';
import { useKibana } from '../common/lib/kibana';
import { DEFAULT_MAX_TABLE_QUERY_SIZE } from '../../common/constants';
import { useActionResults } from '../action_results/use_action_results';
import { generateEmptyDataMessage, PAGINATION_LIMIT_TITLE } from './translations';
import { PLUGIN_NAME as OSQUERY_PLUGIN_NAME } from '../../common';
import { transformEdgesToRecords } from './transform_results';
import { getOsqueryCellRenderers } from './cell_renderers';
import { OsqueryResultsFlyout } from './results_flyout';
import { useOsqueryDataView } from './use_osquery_data_view';
import { useResultsFiltering } from './use_results_filtering';
import {
  usePersistedPageSize,
  PAGE_SIZE_OPTIONS,
  RESULTS_PAGE_SIZE_STORAGE_KEY,
} from '../common/use_persisted_page_size';
import {
  type ResultsTableComponentProps,
  PaginationLimitToastContent,
  euiProgressCss,
} from './results_table_shared';
import { useExportFiltersContext } from './export_filters_context';

const ITEMS_PER_PAGE_OPTIONS = [...PAGE_SIZE_OPTIONS];

const CONTROL_COLUMN_IDS = ['openDetails', 'select'];

const storageInstance = new Storage(localStorage);

const resultsTableContainerCss = {
  width: '100%',
  display: 'flex' as const,
  flexDirection: 'column' as const,
  flex: '1 1 auto',
  minHeight: 0,
  height: '100%',
};

const unifiedTableWrapperCss = {
  flex: '1 1 auto',
  '.euiDataGrid__controls': {
    paddingLeft: '8px',
  },
};

const gridStyleOverride = {
  border: 'all' as const,
  header: 'shade' as const,
  stripes: false,
};

const UnifiedResultsTableComponent: React.FC<ResultsTableComponentProps> = ({
  actionId,
  agentIds,
  ecsMapping,
  startDate,
  endDate,
  liveQueryActionId,
  error,
  scheduleId,
  executionCount,
}) => {
  const { euiTheme } = useEuiTheme();
  const [isLive, setIsLive] = useState(true);

  const searchBarWrapperCss = useMemo(
    () => ({
      padding: `${euiTheme.size.m}`,
      backgroundColor: euiTheme.colors.body,
    }),
    [euiTheme.size.m, euiTheme.colors.body]
  );

  const {
    data: actionResultsData,
    isFetched: actionResultsFetched,
    isError: actionResultsErrored,
  } = useActionResults({
    actionId,
    startDate,
    activePage: 0,
    agentIds,
    limit: 0,
    direction: Direction.asc,
    sortField: '@timestamp',
    isLive,
    scheduleId,
    executionCount,
  });

  const expired = useMemo(() => (!endDate ? false : new Date(endDate) < new Date()), [endDate]);

  const {
    application: { getUrlForApp },
    appName,
    theme,
    uiSettings,
    notifications: { toasts },
    data: dataService,
    analytics,
    i18n: i18nStart,
    uiActions: uiActionsService,
    unifiedSearch: unifiedSearchService,
    chrome,
  } = useKibana().services;

  // These are guaranteed to exist — the parent ResultsTable switch component
  // only renders UnifiedResultsTable when both services are available.
  const uiActions = uiActionsService!;
  const unifiedSearch = unifiedSearchService!;

  const startServices = useMemo(
    () => ({ analytics, i18n: i18nStart, theme }),
    [analytics, i18nStart, theme]
  );

  const unifiedDataTableServices = useMemo(
    () => ({
      theme,
      fieldFormats: dataService.fieldFormats,
      uiSettings,
      toastNotifications: toasts,
      storage: storageInstance,
      data: dataService,
    }),
    [dataService, theme, toasts, uiSettings]
  );

  const getFleetAppUrl = useCallback(
    (agentId: string) =>
      getUrlForApp('fleet', {
        path: pagePathGetters.agent_details({ agentId })[1],
      }),
    [getUrlForApp]
  );

  const showPaginationLimitToast = useCallback(() => {
    toasts.addWarning({
      title: PAGINATION_LIMIT_TITLE,
      text: toMountPoint(<PaginationLimitToastContent />, startServices),
    });
  }, [toasts, startServices]);

  const { dataView, isLoading: isDataViewLoading } = useOsqueryDataView();

  const [filteredDataView, setFilteredDataView] = useState(dataView);
  const [persistedPageSize, setPersistedPageSize] = usePersistedPageSize(
    RESULTS_PAGE_SIZE_STORAGE_KEY
  );
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: persistedPageSize });

  const [sortingColumns, setSortingColumns] = useState<
    Array<{ id: string; direction: 'asc' | 'desc' }>
  >([{ id: 'agent.name', direction: Direction.asc }]);

  const ecsMappingColumns = useMemo(() => keys(ecsMapping || {}), [ecsMapping]);

  const resetFilterPagination = useCallback(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const {
    query,
    filters,
    userKuery,
    activeFilters,
    filtersForSuggestions,
    handleQuerySubmit,
    handleFiltersUpdated,
    handleFilter,
  } = useResultsFiltering(
    {
      enabled: true,
      dataView: filteredDataView,
      actionId,
      scheduleId,
      executionCount,
    },
    resetFilterPagination
  );

  const handleFilterForGrid = useCallback(
    (mapping: unknown, value: unknown, mode: '+' | '-') => {
      const fieldName =
        mapping && typeof mapping === 'object' && 'name' in mapping
          ? (mapping as { name: string }).name
          : typeof mapping === 'string'
          ? mapping
          : undefined;

      if (fieldName) {
        handleFilter({ name: fieldName } as DataViewField, value, mode);
      }
    },
    [handleFilter]
  );

  const { data: allResultsData, isLoading } = useAllResults({
    actionId,
    liveQueryActionId,
    startDate,
    activePage: pagination.pageIndex,
    limit: pagination.pageSize,
    userKuery,
    esFilters: activeFilters,
    isLive,
    sort: sortingColumns.map((col) => ({
      field: col.id,
      direction: col.direction as Direction,
    })),
    scheduleId,
    executionCount,
  });

  const exportFiltersStore = useExportFiltersContext();
  const unfilteredTotal =
    actionResultsFetched && !actionResultsErrored
      ? actionResultsData?.aggregations?.totalRowCount
      : undefined;
  useEffect(() => {
    exportFiltersStore?.setFilters(actionId, {
      kuery: userKuery,
      activeFilters,
      filteredTotal: allResultsData?.total,
      total: unfilteredTotal,
    });
  }, [
    exportFiltersStore,
    actionId,
    userKuery,
    activeFilters,
    allResultsData?.total,
    unfilteredTotal,
  ]);

  // Register missing columns as runtime fields on the data view so that
  // UnifiedDataTable can resolve their field type tokens (icons in column headers).
  // osquery.* fields may not exist in the data view if the index mapping hasn't
  // been refreshed, and ECS-mapped fields never exist in the index mapping.
  const resultColumns = allResultsData?.columns;
  useEffect(() => {
    if (!dataView) return;

    const columnsToRegister = [...ecsMappingColumns, ...(resultColumns ?? []), 'agent.name'];

    for (const col of columnsToRegister) {
      if (!dataView.getFieldByName(col)) {
        const isNumber = col.endsWith('.number');
        dataView.addRuntimeField(col, { type: isNumber ? 'long' : 'keyword' });
      }
    }
  }, [dataView, ecsMappingColumns, resultColumns]);

  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [hasUserSetColumns, setHasUserSetColumns] = useState(false);
  const [rowHeight, setRowHeight] = useState<number>(0);
  const [density, setDensity] = useState<DataGridDensity>(DataGridDensity.EXPANDED);
  const [gridSettings, setGridSettings] = useState<UnifiedDataTableSettings>({});

  const rows = useMemo(
    () =>
      transformEdgesToRecords({
        edges: allResultsData?.edges ?? [],
        ecsMapping,
      }),
    [allResultsData?.edges, ecsMapping]
  );

  const [isCompareActive, setIsCompareActive] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<DataTableRecord | undefined>();

  const externalCustomRenderers = useMemo(
    () =>
      getOsqueryCellRenderers({
        getFleetAppUrl,
        ecsMappingColumns,
      }),
    [ecsMappingColumns, getFleetAppUrl]
  );

  // --- Unified DataTable: handlers ---
  const handleSort = useCallback((newSort: string[][]) => {
    setSortingColumns((prevCols) => {
      const prevIds = new Set(prevCols.map((col) => col.id));
      const added = newSort.filter(([id]) => !prevIds.has(id));
      const existing = newSort.filter(([id]) => prevIds.has(id));
      const reordered = [...added, ...existing];

      return reordered.slice(0, 1).map(([id, direction]) => ({
        id,
        direction: direction as 'asc' | 'desc',
      }));
    });
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const handleSetColumns = useCallback((_newColumns: string[], _hideTimeColumn: boolean) => {
    setHasUserSetColumns(true);
    setVisibleColumns(_newColumns);
  }, []);

  const handleUpdateRowHeight = useCallback((newRowHeight: number) => {
    setRowHeight(newRowHeight);
  }, []);

  const handleUpdateDensity = useCallback((newDensity: DataGridDensity) => {
    setDensity(newDensity);
  }, []);

  const handleResize = useCallback(
    (colSettings: { columnId: string; width: number | undefined }) => {
      setGridSettings((prev: UnifiedDataTableSettings) => ({
        ...prev,
        columns: {
          ...prev.columns,
          [colSettings.columnId]: {
            ...prev.columns?.[colSettings.columnId],
            width: colSettings.width,
          },
        },
      }));
    },
    []
  );

  // Remount the grid on fullscreen exit to reset internal EuiDataGrid column widths that persist from the wider viewport.
  const [gridKey, setGridKey] = useState(0);
  const handleFullScreenChange = useCallback((isFullScreen: boolean) => {
    if (!isFullScreen) {
      setGridKey((k) => k + 1);
    }
  }, []);

  // Auto-compute visible columns from result data when user hasn't set them manually.
  // Deduplicates osquery.* fields by their short name (second segment) — e.g.
  // osquery.description and osquery.description.text both map to "description",
  // so only one column is shown (preferring .number variant when available).
  useEffect(() => {
    if (hasUserSetColumns || !allResultsData?.columns?.length) return;

    const seenShortNames = new Set<string>();
    const cols: string[] = [];

    const addCol = (col: string, dedupeKey?: string) => {
      const key = dedupeKey ?? col;
      if (!seenShortNames.has(key)) {
        seenShortNames.add(key);
        cols.push(col);
      }
    };

    addCol('agent.name');
    ecsMappingColumns.sort().forEach((col) => addCol(col));

    for (const fieldName of allResultsData.columns) {
      if (fieldName.startsWith('osquery.')) {
        const shortName = fieldName.split('.')[1];
        const hasNumber = allResultsData.columns.includes(`${fieldName}.number`);
        const id = hasNumber ? `${fieldName}.number` : fieldName;
        addCol(id, shortName);
      }
    }

    setVisibleColumns((prev) => (isEqual(prev, cols) ? prev : cols));
  }, [allResultsData?.columns, ecsMappingColumns, hasUserSetColumns]);

  // Strip "osquery." prefix from column headers via settings.columns[col].display.
  // UDT reads this before building the header element, so the field-type token is
  // still derived from the actual column name while the short name is displayed.
  const osqueryColumnDisplaySettings = useMemo(() => {
    const columns: Record<string, { display: string }> = {};
    for (const col of visibleColumns) {
      if (col.startsWith('osquery.')) {
        columns[col] = { display: col.split('.')[1] };
      }
    }

    return columns;
  }, [visibleColumns]);

  const mergedGridSettings = useMemo(() => {
    const mergedColumns: Record<string, { display?: string; width?: number }> = {};
    for (const [col, setting] of Object.entries(osqueryColumnDisplaySettings)) {
      mergedColumns[col] = { ...setting };
    }

    for (const [col, setting] of Object.entries(gridSettings.columns ?? {})) {
      mergedColumns[col] = { ...mergedColumns[col], ...setting };
    }

    return { ...gridSettings, columns: mergedColumns };
  }, [gridSettings, osqueryColumnDisplaySettings]);

  // Server-side pagination
  const totalResults = allResultsData?.total ?? 0;
  const totalPages = Math.ceil(totalResults / pagination.pageSize);

  const handleServerPageChange = useCallback(
    (pageIndex: number) => {
      if ((pageIndex + 1) * pagination.pageSize >= DEFAULT_MAX_TABLE_QUERY_SIZE) {
        showPaginationLimitToast();

        return;
      }

      setPagination((prev) => ({ ...prev, pageIndex }));
    },
    [pagination.pageSize, showPaginationLimitToast]
  );

  const handleServerPageSizeChange = useCallback(
    (pageSize: number) => {
      setPersistedPageSize(pageSize);
      setPagination({ pageIndex: 0, pageSize });
    },
    [setPersistedPageSize]
  );

  const SearchBar = unifiedSearch.ui.SearchBar;

  const sourceFieldNamesKey = useMemo(() => {
    if (!allResultsData?.edges.length) return null;
    const names = new Set<string>();
    const MAX_DEPTH = 5;
    const collectPaths = (obj: unknown, prefix = '', depth = 0) => {
      if (!obj || typeof obj !== 'object' || depth >= MAX_DEPTH) return;
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          collectPaths(value, path, depth + 1);
        } else {
          names.add(path);
        }
      }
    };

    allResultsData.edges.slice(0, 5).forEach((edge) => {
      collectPaths(edge._source);
      // Also include field names from `edge.fields` — the table displays data
      // from `fields` (via flattenOsqueryHit), so the SearchBar data view must
      // know about them for filter badges to resolve correctly.
      if (edge.fields) {
        for (const fieldName of Object.keys(edge.fields)) {
          names.add(fieldName);
        }
      }
    });

    return Array.from(names).sort().join(',');
  }, [allResultsData?.edges]);

  useEffect(() => {
    if (!dataView) return;
    if (!sourceFieldNamesKey) {
      setFilteredDataView(dataView);

      return;
    }

    let cancelled = false;
    const fieldSet = new Set(sourceFieldNamesKey.split(','));
    const spec = dataView.toSpec();
    // Strip id so dataViews.create() doesn't return the cached full DataView
    spec.id = undefined;
    spec.fields = Object.fromEntries(
      Object.entries(spec.fields ?? {}).filter(([name]) => fieldSet.has(name))
    );
    dataService.dataViews.create(spec, true).then((dv) => {
      if (!cancelled) setFilteredDataView(dv);
    });

    return () => {
      cancelled = true;
    };
  }, [dataView, sourceFieldNamesKey, dataService.dataViews]);

  const searchBarIndexPatterns = useMemo(
    () => (filteredDataView ? [filteredDataView] : []),
    [filteredDataView]
  );

  const handleInitialStateChange = useCallback(
    (state: Partial<UnifiedDataTableRestorableState>) => {
      if (state.isCompareActive !== undefined) {
        setIsCompareActive(state.isCompareActive);
      }
    },
    []
  );

  const handleCloseFlyout = useCallback(() => {
    setExpandedDoc(undefined);
  }, []);

  const renderDocumentView = useCallback(
    (hit: DataTableRecord, displayedRows: DataTableRecord[], displayedColumns: string[]) => {
      if (!dataView) return undefined;

      return (
        <OsqueryResultsFlyout
          hit={hit}
          hits={displayedRows}
          dataView={dataView}
          columns={displayedColumns}
          onClose={handleCloseFlyout}
          setExpandedDoc={setExpandedDoc}
          toastNotifications={toasts}
          chrome={chrome}
        />
      );
    },
    [dataView, handleCloseFlyout, toasts, chrome]
  );

  useEffect(
    () =>
      setIsLive(() => {
        if (!agentIds?.length || expired || error) return false;

        return !!(
          actionResultsData.aggregations.totalResponded !== agentIds?.length ||
          allResultsData?.total !== actionResultsData.aggregations?.totalRowCount ||
          (allResultsData?.total && !allResultsData?.edges.length)
        );
      }),
    [
      agentIds?.length,
      actionResultsData.aggregations,
      allResultsData?.edges.length,
      allResultsData?.total,
      error,
      expired,
    ]
  );

  if (isLoading || isDataViewLoading) {
    return <EuiSkeletonText lines={5} />;
  }

  if (!dataView) {
    return (
      <EuiPanel hasShadow={false} data-test-subj="osqueryResultsPanel">
        <EuiCallOut
          announceOnMount={false}
          title={i18n.translate('xpack.osquery.resultsTable.dataViewError', {
            defaultMessage: 'Unable to load data view for results',
          })}
          color="warning"
        />
      </EuiPanel>
    );
  }

  return (
    <>
      {isLive && <EuiProgress color="primary" size="xs" css={euiProgressCss} />}

      <div css={resultsTableContainerCss} data-test-subj="osqueryResultsPanel">
        {/* Search bar with KQL autocomplete and filter pills */}
        <div css={searchBarWrapperCss}>
          <SearchBar
            appName="osquery"
            indexPatterns={searchBarIndexPatterns}
            query={query}
            filters={filters}
            filtersForSuggestions={filtersForSuggestions}
            onQuerySubmit={handleQuerySubmit}
            onFiltersUpdated={handleFiltersUpdated}
            showDatePicker={false}
            showQueryInput
            showFilterBar
            showQueryMenu={false}
            displayStyle="inPage"
            placeholder={i18n.translate('xpack.osquery.resultsTable.searchPlaceholder', {
              defaultMessage: 'Search results (KQL)',
            })}
            dataTestSubj="osqueryResultsSearchBar"
          />
        </div>

        {rows.length > 0 ? (
          <>
            <div css={unifiedTableWrapperCss} data-test-subj="osqueryResultsTable">
              <CellActionsProvider
                getTriggerCompatibleActions={uiActions.getTriggerCompatibleActions}
              >
                <UnifiedDataTable
                  key={gridKey}
                  ariaLabelledBy="osquery-results"
                  dataView={dataView}
                  columns={visibleColumns}
                  rows={rows}
                  loadingState={isLoading ? DataLoadingState.loading : DataLoadingState.loaded}
                  expandedDoc={expandedDoc}
                  setExpandedDoc={setExpandedDoc}
                  renderDocumentView={renderDocumentView}
                  externalCustomRenderers={externalCustomRenderers}
                  sort={sortingColumns.map((col) => [col.id, col.direction])}
                  onSort={handleSort}
                  onSetColumns={handleSetColumns}
                  onResize={handleResize}
                  settings={mergedGridSettings}
                  showTimeCol={false}
                  showFullScreenButton={appName === OSQUERY_PLUGIN_NAME}
                  onFullScreenChange={handleFullScreenChange}
                  canDragAndDropColumns
                  isSortEnabled
                  isPaginationEnabled={false}
                  rowHeightState={rowHeight}
                  onUpdateRowHeight={handleUpdateRowHeight}
                  dataGridDensityState={density}
                  onUpdateDataGridDensity={handleUpdateDensity}
                  sampleSizeState={rows.length}
                  totalHits={allResultsData?.total}
                  services={unifiedDataTableServices}
                  consumer="osquery"
                  enableComparisonMode
                  onInitialStateChange={handleInitialStateChange}
                  showColumnTokens
                  controlColumnIds={CONTROL_COLUMN_IDS}
                  onFilter={handleFilterForGrid}
                  gridStyleOverride={gridStyleOverride}
                />
              </CellActionsProvider>
            </div>

            {!isCompareActive && (
              <EuiTablePagination
                pageCount={totalPages}
                activePage={pagination.pageIndex}
                onChangePage={handleServerPageChange}
                itemsPerPage={pagination.pageSize}
                onChangeItemsPerPage={handleServerPageSizeChange}
                itemsPerPageOptions={ITEMS_PER_PAGE_OPTIONS}
                showPerPageOptions
              />
            )}
          </>
        ) : (
          <EuiPanel hasShadow={false} data-test-subj="osqueryResultsPanel">
            <EuiCallOut
              announceOnMount
              title={
                userKuery || activeFilters.length > 0
                  ? i18n.translate('xpack.osquery.resultsTable.noFilterResults', {
                      defaultMessage: 'No results match your search criteria',
                    })
                  : generateEmptyDataMessage(actionResultsData?.aggregations.totalResponded ?? 0)
              }
            />
          </EuiPanel>
        )}
      </div>
    </>
  );
};

export const UnifiedResultsTable = React.memo(UnifiedResultsTableComponent);
