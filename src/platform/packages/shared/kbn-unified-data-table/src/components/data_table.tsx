/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ComponentProps } from 'react';
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import classnames from 'classnames';
import { FormattedMessage } from '@kbn/i18n-react';
import { Global, css } from '@emotion/react';
import type { Storage } from '@kbn/kibana-utils-plugin/public';
import type {
  EuiDataGridSorting,
  EuiDataGridRefProps,
  EuiDataGridControlColumn,
  EuiDataGridCustomBodyProps,
  EuiDataGridStyle,
  EuiDataGridProps,
  EuiDataGridToolBarVisibilityDisplaySelectorOptions,
} from '@elastic/eui';
import {
  EuiDataGrid,
  EuiScreenReaderOnly,
  EuiSpacer,
  EuiText,
  htmlIdGenerator,
  EuiLoadingSpinner,
  EuiIcon,
  type UseEuiTheme,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import type { DataView } from '@kbn/data-views-plugin/public';
import {
  useDataGridColumnsCellActions,
  type UseDataGridColumnsCellActionsProps,
} from '@kbn/cell-actions';
import type { ToastsStart, IUiSettingsClient } from '@kbn/core/public';
import type { Serializable } from '@kbn/utility-types';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import type { RowControlColumn } from '@kbn/discover-utils';
import {
  getShouldShowFieldHandler,
  canPrependTimeFieldColumn,
  getVisibleColumns,
  prepareDataViewForEditing,
} from '@kbn/discover-utils';
import type { DataViewFieldEditorStart } from '@kbn/data-view-field-editor-plugin/public';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import type { ThemeServiceStart } from '@kbn/react-kibana-context-common';
import { type DataPublicPluginStart } from '@kbn/data-plugin/public';
import type { DocViewFilterFn } from '@kbn/unified-doc-viewer/types';
import {
  type InTableSearchRestorableState,
  useDataGridInTableSearch,
} from '@kbn/data-grid-in-table-search';
import { useThrottleFn } from '@kbn/react-hooks';
import { getDataViewFieldOrCreateFromColumnMeta } from '@kbn/data-view-utils';
import { DATA_GRID_DENSITY_STYLE_MAP, useDataGridDensity } from '../hooks/use_data_grid_density';
import type {
  UnifiedDataTableSettings,
  ValueToStringConverter,
  DataTableColumnsMeta,
  CustomCellRenderer,
  CustomGridColumnsConfiguration,
  DataGridPaginationMode,
  CustomBulkActions,
  DocMap,
} from '../types';
import { getDisplayedColumns } from '../utils/columns';
import { convertValueToString } from '../utils/convert_value_to_string';
import { getRowsPerPageOptions } from '../utils/rows_per_page';
import { getRenderCellValueFn } from '../utils/get_render_cell_value';
import {
  getEuiGridColumns,
  getLeadControlColumns,
  SELECT_ROW,
  OPEN_DETAILS,
} from './data_table_columns';
import type { DataTableContext } from '../table_context';
import { UnifiedDataTableContext } from '../table_context';
import { getSchemaDetectors } from './data_table_schema';
import { DataTableDocumentToolbarBtn } from './data_table_document_selection';
import { useRowHeightsOptions } from '../hooks/use_row_heights_options';
import {
  DATA_GRID_STYLE_DEFAULT,
  DEFAULT_ROWS_PER_PAGE,
  ROWS_HEIGHT_OPTIONS,
  toolbarVisibility as toolbarVisibilityDefaults,
  DataGridDensity,
  DEFAULT_PAGINATION_MODE,
} from '../constants';
import { UnifiedDataTableFooter } from './data_table_footer';
import { UnifiedDataTableAdditionalDisplaySettings } from './data_table_additional_display_settings';
import { RowHeightType, useRowHeight } from '../hooks/use_row_height';
import { CompareDocuments } from './compare_documents';
import { useFullScreenWatcher } from '../hooks/use_full_screen_watcher';
import type { UnifiedDataTableRenderCustomToolbar } from './custom_toolbar/render_custom_toolbar';
import { getCustomCellPopoverRenderer } from '../utils/get_render_cell_popover';
import { useSelectedDocs } from '../hooks/use_selected_docs';
import {
  getColorIndicatorControlColumn,
  getActionsColumn,
  type ColorIndicatorControlColumnParams,
} from './custom_control_columns';
import { useSorting } from '../hooks/use_sorting';
import { withRestorableState, useRestorableState, useRestorableRef } from '../restorable_state';

const CONTROL_COLUMN_IDS_DEFAULT = [SELECT_ROW, OPEN_DETAILS];
const VIRTUALIZATION_OPTIONS: EuiDataGridProps['virtualizationOptions'] = {
  // Allowing some additional rows to be rendered outside
  // the view minimizes pop-in when scrolling quickly
  overscanRowCount: 20,
};

export type SortOrder = [string, string];

export enum DataLoadingState {
  loading = 'loading',
  loadingMore = 'loadingMore',
  loaded = 'loaded',
}

export type RenderDocumentViewCallback = (
  hit: DataTableRecord,
  displayedRows: DataTableRecord[],
  displayedColumns: string[],
  columnsMeta?: DataTableColumnsMeta
) => JSX.Element | undefined;

export interface RenderDocumentViewMeta {
  displayedRows: DataTableRecord[];
  displayedColumns: string[];
}

/**
 * Unified Data Table props
 */
interface InternalUnifiedDataTableProps {
  /**
   * Determines which element labels the grid for ARIA
   */
  ariaLabelledBy: string;
  /**
   * Optional class name to apply
   */
  className?: string;
  /**
   * Determines ids of the columns which are displayed
   */
  columns: string[];
  /**
   * If not provided, types will be derived by default from the dataView field types.
   * For displaying text-based search results, pass columns meta (which are available separately in the fetch request) down here.
   * Check available utils in `utils/get_columns_meta.ts`
   */
  columnsMeta?: DataTableColumnsMeta;
  /**
   * Field tokens could be rendered in column header next to the field name.
   */
  showColumnTokens?: boolean;
  /**
   * Set to true to allow users to drag and drop columns for reordering
   */
  canDragAndDropColumns?: boolean;
  /**
   * Optional value for providing configuration setting for UnifiedDataTable header row height
   */
  configHeaderRowHeight?: number;
  /**
   * Determines number of rows of a column header
   */
  headerRowHeightState?: number;
  /**
   * Update header row height state
   */
  onUpdateHeaderRowHeight?: (headerRowHeight: number) => void;
  /**
   * If set, the given document is displayed in a flyout
   */
  expandedDoc?: DataTableRecord;
  /**
   * The used data view
   */
  dataView: DataView;
  /**
   * Determines if data is currently loaded
   */
  loadingState: DataLoadingState;
  /**
   * Function to add a filter in the grid cell or document flyout
   */
  onFilter?: DocViewFilterFn;
  /**
   * Function triggered when a column is resized by the user, passes `undefined` for auto-width
   */
  onResize?: (colSettings: { columnId: string; width: number | undefined }) => void;
  /**
   * Function to set all columns
   */
  onSetColumns: (columns: string[], hideTimeColumn: boolean) => void;
  /**
   * function to change sorting of the documents, skipped when isSortEnabled is set to false
   */
  onSort?: (sort: SortOrder[]) => void;
  /**
   * Array of documents provided by Elasticsearch
   */
  rows?: DataTableRecord[];
  /**
   * Function to set the expanded document, which is displayed in a flyout
   */
  setExpandedDoc?: (doc?: DataTableRecord, options?: { initialTabId?: string }) => void;
  /**
   * Grid display settings persisted in Elasticsearch (e.g. column width)
   */
  settings?: UnifiedDataTableSettings;
  /**
   * Search description
   */
  searchDescription?: string;
  /**
   * Search title
   */
  searchTitle?: string;
  /**
   * Determines whether the time columns should be displayed (legacy settings)
   */
  showTimeCol: boolean;
  /**
   * Determines whether the full screen button should be displayed
   */
  showFullScreenButton?: boolean;
  /**
   * Determines whether the keyboard shortcuts button should be displayed
   */
  showKeyboardShortcuts?: boolean;
  /**
   * Manage user sorting control
   */
  isSortEnabled?: boolean;
  /**
   * Only for ES|QL mode for now.
   * When false, disables in-memory (client-side) row sorting. Use this when sorting is performed
   * server-side (e.g. via a SORT clause in ES|QL) so the table displays the already-sorted rows
   * verbatim instead of reordering them again. Defaults to true.
   */
  isInMemorySortEnabled?: boolean;
  /**
   * Current sort setting
   */
  sort: SortOrder[];
  /**
   * Manage pagination control
   */
  isPaginationEnabled?: boolean;
  /**
   * Manage pagination mode
   * @default 'multiPage'
   * "multiPage" - Regular pagination with numbers and arrows to control the page
   * "singlePage" - Hides the general pagination bar and shows Load more button at the bottom of the grid
   * "infinite" - Hides the general pagination bar and loads more data as the user scrolls [Not yet implemented]
   */
  paginationMode?: DataGridPaginationMode;
  /**
   * List of used control columns (available: 'openDetails', 'select')
   */
  controlColumnIds?: string[];
  /**
   * Optional value for providing configuration setting for UnifiedDataTable row height
   */
  configRowHeight?: number;
  /**
   * Row height from state
   */
  rowHeightState?: number;
  /**
   * Update row height state
   */
  onUpdateRowHeight?: (rowHeight: number) => void;
  /**
   * Density from state
   */
  dataGridDensityState?: DataGridDensity;
  /**
   * Callback when the data grid density configuration is modified
   */
  onUpdateDataGridDensity?: (dataGridDensity: DataGridDensity) => void;
  /**
   * Is text base lang mode enabled
   */
  isPlainRecord?: boolean;
  /**
   * Current state value for rowsPerPage
   */
  rowsPerPageState?: number;
  /**
   * Update rows per page state
   */
  onUpdateRowsPerPage?: (rowsPerPage: number) => void;
  /**
   *
   * this callback is triggered when user navigates to a different page
   *
   */
  onUpdatePageIndex?: (pageIndex: number) => void;
  /**
   * Configuration option to limit sample size slider
   */
  maxAllowedSampleSize?: number;
  /**
   * The max size of the documents returned by Elasticsearch
   */
  sampleSizeState: number;
  /**
   * Update rows per page state
   */
  onUpdateSampleSize?: (sampleSize: number) => void;
  /**
   * Callback to execute on edit runtime field
   */
  onFieldEdited?: (options: { editedDataView: DataView }) => void;
  /**
   * Service dependencies
   */
  services: {
    theme: ThemeServiceStart;
    fieldFormats: FieldFormatsStart;
    uiSettings: IUiSettingsClient;
    dataViewFieldEditor?: DataViewFieldEditorStart;
    toastNotifications: ToastsStart;
    storage: Storage;
    data: DataPublicPluginStart;
  };
  /**
   * Accepts one of two types:
   * - Callback to render the document view when a document is expanded
   * - 'external' const to indicate the consumer will handle rendering
   *   the doc view themselves when a document is expanded
   */
  renderDocumentView?: RenderDocumentViewCallback | 'external';
  /**
   * Callback to set associated metadata when rendering the document view,
   * only used when {@link renderDocumentView} is set to `external`
   */
  setRenderDocumentViewMeta?: (meta: RenderDocumentViewMeta | undefined) => void;
  /**
   * Optional value for providing configuration setting for enabling to display the complex fields in the table. Default is true.
   */
  showMultiFields?: boolean;
  /**
   * Optional value for providing configuration setting for maximum number of document fields to display in the table. Default is 50.
   */
  maxDocFieldsDisplayed?: number;
  /**
   * @deprecated Use only `rowAdditionalLeadingControls` instead
   * Optional value for providing EuiDataGridControlColumn list of the additional leading control columns. UnifiedDataTable includes two control columns: Open Details and Select.
   */
  externalControlColumns?: EuiDataGridControlColumn[];
  /**
   * An optional list of the EuiDataGridControlColumn type for setting trailing control columns standard for EuiDataGrid.
   * We recommend to rather position all controls in the beginning of rows and use `rowAdditionalLeadingControls` for that
   * as number of columns can be dynamically changed and we don't want the controls to become hidden due to horizontal scroll.
   */
  trailingControlColumns?: EuiDataGridControlColumn[];
  /**
   * Optional value to extend the list of default row actions
   */
  rowAdditionalLeadingControls?: RowControlColumn[];
  /**
   * Number total hits from ES
   */
  totalHits?: number;
  /**
   * To fetch more
   */
  onFetchMoreRecords?: () => void;
  /**
   * Optional value for providing the additional controls available in the UnifiedDataTable toolbar to manage it's records or state. UnifiedDataTable includes Columns, Sorting and Bulk Actions.
   */
  externalAdditionalControls?: React.ReactNode;
  /**
   * Optional list of number type values to set custom UnifiedDataTable paging options to display the records per page.
   */
  rowsPerPageOptions?: number[];
  /**
   * An optional function called to completely customize and control the rendering of
   * EuiDataGrid's body and cell placement.  This can be used to, e.g. remove EuiDataGrid's
   * virtualization library, or roll your own.
   *
   * This component is **only** meant as an escape hatch for extremely custom use cases.
   *
   * Behind the scenes, this function is treated as a React component,
   * allowing hooks, context, and other React concepts to be used.
   * It receives #EuiDataGridCustomBodyProps as its only argument.
   */
  renderCustomGridBody?: (args: EuiDataGridCustomBodyProps) => React.ReactNode;
  /**
   * Optional render for the grid toolbar
   * @param toolbarProps
   * @param gridProps
   */
  renderCustomToolbar?: UnifiedDataTableRenderCustomToolbar;
  /**
   * Optional triggerId to retrieve the column cell actions that will override the default ones
   */
  cellActionsTriggerId?: string;
  /**
   * Custom set of properties used by some actions.
   * An action might require a specific set of metadata properties to render.
   * This data is sent directly to actions.
   */
  cellActionsMetadata?: Record<string, unknown>;
  /**
   * Controls whether the cell actions should replace the default cell actions or be appended to them
   */
  cellActionsHandling?: 'replace' | 'append';
  /**
   * An optional value for a custom number of the visible cell actions in the table. By default is up to 3.
   **/
  visibleCellActions?: number;
  /**
   * Total number of visible slots in the actions column, including the overflow
   * menu button when it appears. Defaults to 2 (one inline control + one overflow menu).
   *
   * When the total number of controls is `visibleRowLeadingControls` or fewer,
   * all render inline with no overflow menu.
   */
  visibleRowLeadingControls?: number;
  /**
   * Disable cell actions for the table.
   */
  disableCellActions?: boolean;
  /**
   * An optional settings for a specified fields rendering like links. Applied only for the listed fields rendering.
   */
  externalCustomRenderers?: CustomCellRenderer;
  /**
   * An optional settings for customising the column
   */
  customGridColumnsConfiguration?: CustomGridColumnsConfiguration;
  /**
   * Name of the UnifiedDataTable consumer component or application
   */
  consumer?: string;
  /**
   * Optional key/value pairs to set guided onboarding steps ids for a data table components included to guided tour.
   */
  componentsTourSteps?: Record<string, string>;
  /**
   * Optional gridStyle override.
   */
  gridStyleOverride?: EuiDataGridStyle;
  /**
   * Optional row line height override. Default is 1.6em.
   */
  rowLineHeightOverride?: string;
  /**
   * Set to true to allow users to compare selected documents
   */
  enableComparisonMode?: boolean;
  /**
   * Set to true to allow users to search in cell values
   */
  enableInTableSearch?: boolean;
  /**
   * Optional extra props passed to the renderCellValue function/component.
   */
  cellContext?: EuiDataGridProps['cellContext'];
  /**
   *
   * Custom cell Popover Render Component.
   *
   */
  renderCellPopover?: EuiDataGridProps['renderCellPopover'];

  /**
   * Disables the cell popover for the grid.
   */
  disableCellPopover?: boolean;
  /**
   * When specified, this function will be called to determine the color of the row indicator.
   * @param row
   */
  getRowIndicator?: ColorIndicatorControlColumnParams['getRowIndicator'];
  /**
   * Custom bulk action
   */
  customBulkActions?: CustomBulkActions;

  /**
   * When editing fields, it will create a new ad-hoc data view instead of modifying the existing one.
   */
  shouldKeepAdHocDataViewImmutable?: boolean;

  /**
   * Callback fired when full screen mode is toggled
   * @param isFullScreen - boolean indicating if the grid is in full screen mode
   */

  onFullScreenChange?: (isFullScreen: boolean) => void;

  /**
   * Set to true when the table is used in an embedded context (e.g., dashboards).
   * When true, filter actions on computed columns will be hidden.
   */
  hideFilteringOnComputedColumns?: boolean;
}

export const EuiDataGridMemoized = React.memo(EuiDataGrid);

const InternalUnifiedDataTable = React.forwardRef<
  EuiDataGridRefProps,
  InternalUnifiedDataTableProps
>(
  (
    {
      ariaLabelledBy,
      columns,
      columnsMeta,
      showColumnTokens,
      canDragAndDropColumns,
      configHeaderRowHeight,
      headerRowHeightState,
      onUpdateHeaderRowHeight,
      controlColumnIds = CONTROL_COLUMN_IDS_DEFAULT,
      rowAdditionalLeadingControls,
      visibleRowLeadingControls,
      dataView,
      loadingState,
      onFilter,
      onResize,
      onSetColumns,
      onSort,
      rows,
      searchDescription,
      searchTitle,
      settings,
      showTimeCol,
      showKeyboardShortcuts = true,
      showFullScreenButton = true,
      sort,
      isSortEnabled = true,
      isInMemorySortEnabled = true,
      isPaginationEnabled = true,
      paginationMode = DEFAULT_PAGINATION_MODE,
      cellActionsTriggerId,
      cellActionsMetadata,
      cellActionsHandling = 'replace',
      visibleCellActions,
      className,
      rowHeightState,
      onUpdateRowHeight,
      maxAllowedSampleSize,
      sampleSizeState,
      onUpdateSampleSize,
      isPlainRecord = false,
      rowsPerPageState,
      onUpdateRowsPerPage,
      onFieldEdited,
      services,
      renderCustomGridBody,
      renderCustomToolbar,
      externalControlColumns, // TODO: deprecate in favor of rowAdditionalLeadingControls
      trailingControlColumns, // TODO: deprecate in favor of rowAdditionalLeadingControls
      totalHits,
      onFetchMoreRecords,
      renderDocumentView,
      setRenderDocumentViewMeta,
      setExpandedDoc,
      expandedDoc,
      configRowHeight,
      showMultiFields = true,
      maxDocFieldsDisplayed = 50,
      externalAdditionalControls,
      rowsPerPageOptions,
      externalCustomRenderers,
      consumer = 'discover',
      componentsTourSteps,
      gridStyleOverride,
      rowLineHeightOverride,
      customGridColumnsConfiguration,
      enableComparisonMode,
      enableInTableSearch = false,
      cellContext,
      renderCellPopover,
      getRowIndicator,
      dataGridDensityState,
      onUpdateDataGridDensity,
      onUpdatePageIndex,
      disableCellActions = false,
      disableCellPopover = false,
      customBulkActions,
      shouldKeepAdHocDataViewImmutable,
      onFullScreenChange,
      hideFilteringOnComputedColumns,
    },
    ref
  ) => {
    const styles = useMemoCss(componentStyles);
    const { fieldFormats, toastNotifications, dataViewFieldEditor, uiSettings, storage, data } =
      services;
    const dataGridRef = useRef<EuiDataGridRefProps>(null);
    useImperativeHandle(ref, () => dataGridRef.current!);

    const [isFilterActive, setIsFilterActive] = useRestorableState('isFilterActive', false);
    const [isCompareActive, setIsCompareActive] = useRestorableState('isCompareActive', false);
    const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
    const displayedColumns = getDisplayedColumns(columns, dataView);
    const defaultColumns = displayedColumns.includes('_source');
    const docMap = useMemo<DocMap>(
      () => new Map(rows?.map((row, docIndex) => [row.id, { doc: row, docIndex }]) ?? []),
      [rows]
    );
    const selectedDocsState = useSelectedDocs(docMap);
    const {
      isDocSelected,
      hasSelectedDocs,
      selectedDocsCount,
      replaceSelectedDocs,
      docIdsInSelectionOrder,
    } = selectedDocsState;

    const [currentPageIndex, setCurrentPageIndex] = useRestorableState('pageIndex', 0);
    const currentPageIndexRef = useRef<number>(currentPageIndex);
    currentPageIndexRef.current = currentPageIndex;

    const changeCurrentPageIndex = useCallback(
      (value: number) => {
        setCurrentPageIndex(value);
        onUpdatePageIndex?.(value);
      },
      [setCurrentPageIndex, onUpdatePageIndex]
    );

    useEffect(() => {
      if (!hasSelectedDocs && isFilterActive) {
        setIsFilterActive(false);
      }
    }, [isFilterActive, hasSelectedDocs, setIsFilterActive]);

    const timeFieldName = dataView.timeFieldName;
    const shouldPrependTimeFieldColumn = useCallback(
      (activeColumns: string[]) =>
        canPrependTimeFieldColumn(
          activeColumns,
          timeFieldName,
          columnsMeta,
          showTimeCol,
          isPlainRecord
        ),
      [timeFieldName, isPlainRecord, showTimeCol, columnsMeta]
    );

    const visibleColumns = useMemo(() => {
      return getVisibleColumns(
        displayedColumns,
        dataView,
        shouldPrependTimeFieldColumn(displayedColumns)
      );
    }, [dataView, displayedColumns, shouldPrependTimeFieldColumn]);

    const { sortedRows, sorting } = useSorting({
      rows,
      visibleColumns,
      columnsMeta,
      sort,
      dataView,
      isPlainRecord,
      isSortEnabled,
      isInMemorySortEnabled,
      defaultColumns,
      onSort,
    });

    const { columns: sortedColumns } = sorting ?? {};

    const displayedRows = useMemo(() => {
      if (!sortedRows) {
        return [];
      }

      if (!isFilterActive || !hasSelectedDocs) {
        return sortedRows;
      }

      const rowsFiltered = sortedRows.filter((row) => isDocSelected(row.id));

      return rowsFiltered.length
        ? rowsFiltered
        : // in case the selected docs are no longer part of the sample of 500, show all docs
          sortedRows;
    }, [sortedRows, isFilterActive, hasSelectedDocs, isDocSelected]);

    const valueToStringConverter: ValueToStringConverter = useCallback(
      (rowIndex, columnId, options) => {
        return convertValueToString({
          rowIndex,
          rows: displayedRows,
          dataView,
          columnId,
          fieldFormats,
          columnsMeta,
          options,
        });
      },
      [displayedRows, dataView, fieldFormats, columnsMeta]
    );

    /**
     * Pagination
     */
    const currentPageSize =
      typeof rowsPerPageState === 'number' && rowsPerPageState > 0
        ? rowsPerPageState
        : DEFAULT_ROWS_PER_PAGE;

    const rowCount = useMemo(() => (displayedRows ? displayedRows.length : 0), [displayedRows]);
    const pageCount = useMemo(
      () => Math.ceil(rowCount / currentPageSize),
      [rowCount, currentPageSize]
    );

    useEffect(() => {
      /**
       * Syncs any changes in pageIndex because of changes in pageCount
       * to the consumer.
       *
       */
      const previousPageIndex = currentPageIndexRef.current;
      const calculatedPageIndex = previousPageIndex > pageCount - 1 ? 0 : previousPageIndex;
      if (calculatedPageIndex !== previousPageIndex) {
        changeCurrentPageIndex(calculatedPageIndex);
      }
    }, [pageCount, changeCurrentPageIndex]);

    const paginationObj = useMemo(() => {
      const onChangeItemsPerPage = (pageSize: number) => {
        onUpdateRowsPerPage?.(pageSize);
      };

      return isPaginationEnabled
        ? {
            onChangeItemsPerPage,
            onChangePage: changeCurrentPageIndex,
            pageIndex: currentPageIndex,
            pageSize: currentPageSize,
            pageSizeOptions: rowsPerPageOptions ?? getRowsPerPageOptions(currentPageSize),
          }
        : undefined;
    }, [
      isPaginationEnabled,
      rowsPerPageOptions,
      onUpdateRowsPerPage,
      currentPageSize,
      currentPageIndex,
      changeCurrentPageIndex,
    ]);

    // When the document view is rendered externally, we need to provide some metadata
    // to the consumer to allow them to properly render the doc viewer component
    const prevRenderDocumentViewMeta = useRef<RenderDocumentViewMeta>();

    useEffect(() => {
      if (renderDocumentView !== 'external' || !setRenderDocumentViewMeta) {
        prevRenderDocumentViewMeta.current = undefined;
        return;
      }

      if (!expandedDoc) {
        prevRenderDocumentViewMeta.current = undefined;
        setRenderDocumentViewMeta(undefined);
        return;
      }

      const prevMeta = prevRenderDocumentViewMeta.current;
      const metaChanged =
        prevMeta?.displayedColumns !== displayedColumns ||
        prevMeta?.displayedRows !== displayedRows;

      if (metaChanged) {
        const nextMeta: RenderDocumentViewMeta = { displayedColumns, displayedRows };
        setRenderDocumentViewMeta(nextMeta);
        prevRenderDocumentViewMeta.current = nextMeta;
      }
    }, [
      displayedColumns,
      displayedRows,
      expandedDoc,
      renderDocumentView,
      setRenderDocumentViewMeta,
    ]);

    const unifiedDataTableContextValue = useMemo<DataTableContext>(
      () => ({
        expanded: expandedDoc,
        setExpanded: setExpandedDoc,
        getRowByIndex: (index: number) => displayedRows[index],
        onFilter,
        dataView,
        selectedDocsState,
        valueToStringConverter,
        componentsTourSteps,
        isPlainRecord,
        pageIndex: isPaginationEnabled ? paginationObj?.pageIndex : 0,
        pageSize: isPaginationEnabled ? paginationObj?.pageSize : displayedRows.length,
      }),
      [
        componentsTourSteps,
        dataView,
        isPlainRecord,
        isPaginationEnabled,
        displayedRows,
        expandedDoc,
        onFilter,
        setExpandedDoc,
        selectedDocsState,
        paginationObj,
        valueToStringConverter,
      ]
    );

    const shouldShowFieldHandler = useMemo(() => {
      const dataViewFields = dataView.fields.getAll().map((fld) => fld.name);
      return getShouldShowFieldHandler(dataViewFields, dataView, showMultiFields);
    }, [dataView, showMultiFields]);

    const { dataGridDensity, onChangeDataGridDensity } = useDataGridDensity({
      storage,
      consumer,
      dataGridDensityState,
      onUpdateDataGridDensity,
    });

    const gridStyle = useMemo<EuiDataGridStyle>(
      () => ({
        ...DATA_GRID_STYLE_DEFAULT,
        ...DATA_GRID_DENSITY_STYLE_MAP[dataGridDensity],
        onChange: onChangeDataGridDensity,
        ...gridStyleOverride,
      }),
      [dataGridDensity, onChangeDataGridDensity, gridStyleOverride]
    );

    /**
     * Cell rendering
     */
    const renderCellValue = useMemo(
      () =>
        getRenderCellValueFn({
          dataView,
          rows: displayedRows,
          shouldShowFieldHandler,
          closePopover: () => dataGridRef.current?.closeCellPopover(),
          fieldFormats,
          maxEntries: maxDocFieldsDisplayed,
          externalCustomRenderers,
          isPlainRecord,
          isCompressed: dataGridDensity === DataGridDensity.COMPACT,
          columnsMeta,
        }),
      [
        dataView,
        displayedRows,
        shouldShowFieldHandler,
        maxDocFieldsDisplayed,
        fieldFormats,
        externalCustomRenderers,
        isPlainRecord,
        dataGridDensity,
        columnsMeta,
      ]
    );

    const { dataGridId, dataGridWrapper, setDataGridWrapper } = useFullScreenWatcher();

    const inTableSearchLatestStateRef = useRestorableRef('inTableSearch', undefined);
    const onInTableSearchInitialStateChange = useCallback(
      (newState: InTableSearchRestorableState) => {
        inTableSearchLatestStateRef.current = newState;
      },
      [inTableSearchLatestStateRef]
    );

    const {
      inTableSearchTermCss,
      inTableSearchControl,
      cellContextWithInTableSearchSupport,
      renderCellValueWithInTableSearchSupport,
    } = useDataGridInTableSearch({
      enableInTableSearch,
      dataGridWrapper,
      dataGridRef,
      visibleColumns,
      rows: displayedRows,
      renderCellValue,
      cellContext,
      pagination: paginationObj,
      initialState: inTableSearchLatestStateRef.current,
      onInitialStateChange: onInTableSearchInitialStateChange,
    });

    const renderCustomPopover = useMemo(() => {
      if (disableCellPopover) {
        return;
      }
      return renderCellPopover ?? getCustomCellPopoverRenderer();
    }, [renderCellPopover, disableCellPopover]);

    /**
     * Render variables
     */
    const randomId = useMemo(() => htmlIdGenerator()(), []);
    const closeFieldEditor = useRef<() => void | undefined>();

    useEffect(() => {
      return () => {
        if (closeFieldEditor?.current) {
          closeFieldEditor?.current();
        }
      };
    }, []);

    const editField = useMemo(
      () =>
        onFieldEdited
          ? async (fieldName: string) => {
              const editedDataView = shouldKeepAdHocDataViewImmutable
                ? await prepareDataViewForEditing(dataView, data.dataViews)
                : dataView;
              closeFieldEditor.current =
                onFieldEdited &&
                (await services?.dataViewFieldEditor?.openEditor({
                  ctx: {
                    dataView: editedDataView,
                  },
                  fieldName,
                  onSave: async () => {
                    await onFieldEdited({
                      editedDataView,
                    });
                  },
                }));
            }
          : undefined,
      [
        data.dataViews,
        dataView,
        onFieldEdited,
        services?.dataViewFieldEditor,
        shouldKeepAdHocDataViewImmutable,
      ]
    );

    const getCellValue = useCallback<UseDataGridColumnsCellActionsProps['getCellValue']>(
      (fieldName, rowIndex) =>
        displayedRows[rowIndex % displayedRows.length].flattened[fieldName] as Serializable,
      [displayedRows]
    );

    const cellActionsFields = useMemo<UseDataGridColumnsCellActionsProps['fields']>(() => {
      if (!cellActionsTriggerId) {
        return undefined;
      }

      return visibleColumns.map((columnName) => {
        const field = getDataViewFieldOrCreateFromColumnMeta({
          dataView,
          fieldName: columnName,
          columnMeta: columnsMeta?.[columnName],
        });
        return (
          field?.toSpec() ?? {
            name: '',
            type: '',
            aggregatable: false,
            searchable: false,
          }
        );
      });
    }, [cellActionsTriggerId, visibleColumns, dataView, columnsMeta]);

    const allCellActionsMetadata = useMemo(
      () => ({ dataViewId: dataView.id, ...(cellActionsMetadata ?? {}) }),
      [dataView, cellActionsMetadata]
    );

    const columnsCellActions = useDataGridColumnsCellActions({
      fields: cellActionsFields,
      getCellValue,
      triggerId: cellActionsTriggerId,
      dataGridRef,
      metadata: allCellActionsMetadata,
      disableCellActions,
    });

    const {
      rowHeight: headerRowHeight,
      rowHeightLines: headerRowHeightLines,
      lineCountInput: headerLineCountInput,
      onChangeRowHeight: onChangeHeaderRowHeight,
      onChangeRowHeightLines: onChangeHeaderRowHeightLines,
    } = useRowHeight({
      type: RowHeightType.header,
      storage,
      consumer,
      key: 'dataGridHeaderRowHeight',
      defaultRowHeight: 1,
      configRowHeight: configHeaderRowHeight,
      rowHeightState: headerRowHeightState,
      onUpdateRowHeight: onUpdateHeaderRowHeight,
    });

    const { rowHeight, rowHeightLines, lineCountInput, onChangeRowHeight, onChangeRowHeightLines } =
      useRowHeight({
        type: RowHeightType.row,
        storage,
        consumer,
        key: 'dataGridRowHeight',
        defaultRowHeight: ROWS_HEIGHT_OPTIONS.default,
        configRowHeight,
        rowHeightState,
        onUpdateRowHeight,
      });

    const euiGridColumns = useMemo(
      () =>
        getEuiGridColumns({
          columns: visibleColumns,
          columnsCellActions,
          cellActionsHandling,
          rowsCount: displayedRows.length,
          settings,
          dataView,
          defaultColumns,
          isSortEnabled,
          isPlainRecord,
          services: {
            uiSettings,
            toastNotifications,
          },
          hasEditDataViewPermission: () =>
            Boolean(dataViewFieldEditor?.userPermissions?.editIndexPattern()),
          valueToStringConverter,
          onFilter,
          editField,
          visibleCellActions,
          columnsMeta,
          showColumnTokens,
          headerRowHeightLines,
          customGridColumnsConfiguration,
          onResize,
          sortedColumns,
          disableCellActions,
          dataGridRef,
          hideFilteringOnComputedColumns,
        }),
      [
        cellActionsHandling,
        columnsMeta,
        columnsCellActions,
        customGridColumnsConfiguration,
        dataView,
        dataViewFieldEditor,
        defaultColumns,
        displayedRows.length,
        editField,
        headerRowHeightLines,
        isPlainRecord,
        isSortEnabled,
        onFilter,
        onResize,
        settings,
        showColumnTokens,
        toastNotifications,
        uiSettings,
        valueToStringConverter,
        visibleCellActions,
        visibleColumns,
        sortedColumns,
        disableCellActions,
        hideFilteringOnComputedColumns,
      ]
    );

    const schemaDetectors = useMemo(() => getSchemaDetectors(), []);
    const columnsVisibility = useMemo(
      () => ({
        canDragAndDropColumns: defaultColumns ? false : canDragAndDropColumns,
        visibleColumns,
        setVisibleColumns: (newColumns: string[]) => {
          const dontModifyColumns = !shouldPrependTimeFieldColumn(newColumns);
          onSetColumns(newColumns, dontModifyColumns);
        },
      }),
      [
        visibleColumns,
        onSetColumns,
        shouldPrependTimeFieldColumn,
        canDragAndDropColumns,
        defaultColumns,
      ]
    );

    const canSetExpandedDoc = Boolean(setExpandedDoc && !!renderDocumentView);

    const leadingControlColumns: EuiDataGridControlColumn[] = useMemo(() => {
      const { leadColumns, leadColumnsExtraContent } = getLeadControlColumns({
        rows: displayedRows,
        canSetExpandedDoc,
      });

      const filteredLeadColumns = leadColumns.filter((column) =>
        controlColumnIds.includes(column.id)
      );

      if (getRowIndicator) {
        const colorIndicatorControlColumn = getColorIndicatorControlColumn({
          getRowIndicator,
        });
        filteredLeadColumns.unshift(colorIndicatorControlColumn);
      }

      const actionsColumn = getActionsColumn({
        baseColumns: leadColumnsExtraContent,
        rowAdditionalLeadingControls,
        externalControlColumns,
        visibleRowLeadingControls,
      });
      if (actionsColumn) {
        filteredLeadColumns.push(actionsColumn);
      }

      return filteredLeadColumns;
    }, [
      canSetExpandedDoc,
      controlColumnIds,
      displayedRows,
      externalControlColumns,
      getRowIndicator,
      rowAdditionalLeadingControls,
      visibleRowLeadingControls,
    ]);

    const additionalControls = useMemo(() => {
      if (!externalAdditionalControls && !selectedDocsCount && !inTableSearchControl) {
        return null;
      }

      const leftControls = (
        <EuiFlexGroup gutterSize="s">
          {Boolean(selectedDocsCount) && (
            <EuiFlexItem grow={false}>
              <DataTableDocumentToolbarBtn
                isPlainRecord={isPlainRecord}
                isFilterActive={isFilterActive}
                rows={displayedRows}
                setIsFilterActive={setIsFilterActive}
                selectedDocsState={selectedDocsState}
                enableComparisonMode={enableComparisonMode}
                setIsCompareActive={setIsCompareActive}
                fieldFormats={fieldFormats}
                pageIndex={unifiedDataTableContextValue.pageIndex}
                pageSize={unifiedDataTableContextValue.pageSize}
                toastNotifications={toastNotifications}
                columns={visibleColumns}
                customBulkActions={customBulkActions}
              />
            </EuiFlexItem>
          )}
          <>
            {externalAdditionalControls && (
              <EuiFlexItem grow={false}>{externalAdditionalControls}</EuiFlexItem>
            )}
          </>
        </EuiFlexGroup>
      );

      if (!renderCustomToolbar && inTableSearchControl) {
        return {
          left: leftControls,
          right: inTableSearchControl,
        };
      }

      return leftControls;
    }, [
      externalAdditionalControls,
      selectedDocsCount,
      inTableSearchControl,
      isPlainRecord,
      isFilterActive,
      displayedRows,
      selectedDocsState,
      enableComparisonMode,
      setIsFilterActive,
      setIsCompareActive,
      fieldFormats,
      unifiedDataTableContextValue.pageIndex,
      unifiedDataTableContextValue.pageSize,
      toastNotifications,
      visibleColumns,
      renderCustomToolbar,
      customBulkActions,
    ]);

    const renderCustomToolbarFn: EuiDataGridProps['renderCustomToolbar'] | undefined = useMemo(
      () =>
        renderCustomToolbar
          ? (toolbarProps) =>
              renderCustomToolbar({
                toolbarProps,
                gridProps: {
                  additionalControls:
                    additionalControls && 'left' in additionalControls
                      ? additionalControls.left
                      : additionalControls,
                  inTableSearchControl,
                },
              })
          : undefined,
      [renderCustomToolbar, additionalControls, inTableSearchControl]
    );

    const showDisplaySelector = useMemo(():
      | EuiDataGridToolBarVisibilityDisplaySelectorOptions
      | undefined => {
      if (
        !onUpdateDataGridDensity &&
        !onUpdateRowHeight &&
        !onUpdateHeaderRowHeight &&
        !onUpdateSampleSize
      ) {
        return;
      }

      return {
        allowDensity: Boolean(onUpdateDataGridDensity),
        allowRowHeight: Boolean(onChangeRowHeight) || Boolean(onChangeHeaderRowHeight),
        allowResetButton: false,
        customRender: ({ densityControl }) => (
          <>
            <UnifiedDataTableAdditionalDisplaySettings
              rowHeight={rowHeight}
              onChangeRowHeight={onChangeRowHeight}
              onChangeRowHeightLines={onChangeRowHeightLines}
              headerRowHeight={headerRowHeight}
              onChangeHeaderRowHeight={onChangeHeaderRowHeight}
              onChangeHeaderRowHeightLines={onChangeHeaderRowHeightLines}
              maxAllowedSampleSize={maxAllowedSampleSize}
              sampleSize={sampleSizeState}
              onChangeSampleSize={onUpdateSampleSize}
              lineCountInput={lineCountInput}
              headerLineCountInput={headerLineCountInput}
              densityControl={densityControl}
            />
          </>
        ),
      };
    }, [
      headerRowHeight,
      maxAllowedSampleSize,
      onChangeHeaderRowHeight,
      onChangeHeaderRowHeightLines,
      onChangeRowHeight,
      onChangeRowHeightLines,
      onUpdateHeaderRowHeight,
      onUpdateRowHeight,
      onUpdateSampleSize,
      rowHeight,
      sampleSizeState,
      onUpdateDataGridDensity,
      lineCountInput,
      headerLineCountInput,
    ]);

    const toolbarVisibility = useMemo(
      () =>
        defaultColumns
          ? {
              ...toolbarVisibilityDefaults,
              showColumnSelector: false,
              showSortSelector: isSortEnabled,
              additionalControls,
              showDisplaySelector,
              showKeyboardShortcuts,
              showFullScreenSelector: showFullScreenButton,
            }
          : {
              ...toolbarVisibilityDefaults,
              showSortSelector: isSortEnabled,
              additionalControls,
              showDisplaySelector,
              showKeyboardShortcuts,
              showFullScreenSelector: showFullScreenButton,
            },
      [
        defaultColumns,
        isSortEnabled,
        additionalControls,
        showDisplaySelector,
        showKeyboardShortcuts,
        showFullScreenButton,
      ]
    );

    const rowHeightsOptions = useRowHeightsOptions({
      rowHeightLines,
      rowLineHeight: rowLineHeightOverride,
    });

    const handleOnScroll = useCallback(
      (event: { scrollTop: number }) => {
        setHasScrolledToBottom((prevHasScrolledToBottom) => {
          if (loadingState !== DataLoadingState.loaded) {
            return prevHasScrolledToBottom;
          }

          // We need to manually query the react-window wrapper since EUI doesn't
          // expose outerRef in virtualizationOptions, but we should request it
          const outerRef = dataGridWrapper?.querySelector<HTMLElement>('.euiDataGrid__virtualized');

          if (!outerRef) {
            return prevHasScrolledToBottom;
          }

          // Account for footer height when it's visible to avoid flickering
          const scrollBottomMargin = prevHasScrolledToBottom ? 140 : 100;
          const isScrollable = outerRef.scrollHeight > outerRef.offsetHeight;
          const isScrolledToBottom =
            event.scrollTop + outerRef.offsetHeight >= outerRef.scrollHeight - scrollBottomMargin;

          return isScrollable && isScrolledToBottom;
        });
      },
      [dataGridWrapper, loadingState]
    );

    const { run: throttledHandleOnScroll } = useThrottleFn(handleOnScroll, { wait: 200 });

    useEffect(() => {
      if (loadingState === DataLoadingState.loadingMore) {
        setHasScrolledToBottom(false);
      }
    }, [loadingState]);

    const virtualizationOptions = useMemo(() => {
      const options = {
        onScroll: paginationMode === 'multiPage' ? undefined : throttledHandleOnScroll,
      };

      // Don't use row "overscan" when showing Summary column since
      // rendering so much DOM content in each cell impacts performance
      if (defaultColumns) {
        return options;
      }

      return {
        ...VIRTUALIZATION_OPTIONS,
        ...options,
      };
    }, [defaultColumns, paginationMode, throttledHandleOnScroll]);

    const isRenderComplete = loadingState !== DataLoadingState.loading;

    if (!rowCount && loadingState === DataLoadingState.loading) {
      return (
        <div
          className="euiDataGrid__loading"
          css={styles.loadingAndEmpty}
          data-test-subj="unifiedDataTableLoading"
        >
          <EuiText size="xs" color="subdued" textAlign="center">
            <EuiLoadingSpinner />
            <EuiSpacer size="s" />
            <FormattedMessage
              id="unifiedDataTable.loadingResults"
              defaultMessage="Loading results"
            />
          </EuiText>
        </div>
      );
    }

    if (!rowCount) {
      return (
        <div
          className="euiDataGrid__noResults"
          css={styles.emptyRow}
          data-render-complete={isRenderComplete}
          data-shared-item=""
          data-title={searchTitle}
          data-description={searchDescription}
          data-document-number={0}
        >
          <EuiText size="xs" color="subdued" textAlign="center">
            <EuiIcon type="discoverApp" size="m" color="subdued" aria-hidden="true" />
            <EuiSpacer size="s" />
            <FormattedMessage
              id="unifiedDataTable.noResultsFound"
              defaultMessage="No results found"
            />
          </EuiText>
        </div>
      );
    }

    return (
      <UnifiedDataTableContext.Provider value={unifiedDataTableContextValue}>
        <span className="unifiedDataTable__inner" css={styles.dataTableInner}>
          <Global styles={styles.dataTableGlobal} />
          <div
            ref={setDataGridWrapper}
            key={isCompareActive ? 'comparisonTable' : 'docTable'}
            data-test-subj="discoverDocTable"
            data-render-complete={isRenderComplete}
            data-shared-item=""
            data-rendering-count={1} // TODO: Fix this as part of https://github.com/elastic/kibana/issues/179376
            data-title={searchTitle}
            data-description={searchDescription}
            data-document-number={displayedRows.length}
            className={classnames(className, 'unifiedDataTable__table')}
            css={[styles.dataTable, inTableSearchTermCss]}
          >
            {isCompareActive ? (
              <CompareDocuments
                id={dataGridId}
                wrapper={dataGridWrapper}
                consumer={consumer}
                ariaDescribedBy={randomId}
                ariaLabelledBy={ariaLabelledBy}
                dataView={dataView}
                columnsMeta={columnsMeta}
                isPlainRecord={isPlainRecord}
                selectedFieldNames={visibleColumns}
                selectedDocIds={docIdsInSelectionOrder}
                schemaDetectors={schemaDetectors}
                forceShowAllFields={defaultColumns}
                showFullScreenButton={showFullScreenButton}
                fieldFormats={fieldFormats}
                docMap={docMap}
                replaceSelectedDocs={replaceSelectedDocs}
                setIsCompareActive={setIsCompareActive}
              />
            ) : (
              <EuiDataGridMemoized
                id={dataGridId}
                aria-describedby={randomId}
                aria-labelledby={ariaLabelledBy}
                columns={euiGridColumns}
                columnVisibility={columnsVisibility}
                data-test-subj="docTable"
                leadingControlColumns={leadingControlColumns}
                onColumnResize={onResize}
                pagination={paginationMode === 'multiPage' ? paginationObj : undefined}
                renderCellValue={renderCellValueWithInTableSearchSupport}
                ref={dataGridRef}
                rowCount={rowCount}
                schemaDetectors={schemaDetectors}
                sorting={sorting as EuiDataGridSorting}
                toolbarVisibility={toolbarVisibility}
                rowHeightsOptions={rowHeightsOptions}
                gridStyle={gridStyle}
                renderCustomGridBody={renderCustomGridBody}
                renderCustomToolbar={renderCustomToolbarFn}
                trailingControlColumns={trailingControlColumns}
                cellContext={cellContextWithInTableSearchSupport}
                renderCellPopover={renderCustomPopover}
                virtualizationOptions={virtualizationOptions}
                onFullScreenChange={onFullScreenChange}
              />
            )}
          </div>
          {loadingState !== DataLoadingState.loading &&
            isPaginationEnabled && // we hide the footer for Surrounding Documents page
            !isFilterActive && // hide footer when showing selected documents
            !isCompareActive && (
              <UnifiedDataTableFooter
                isLoadingMore={loadingState === DataLoadingState.loadingMore}
                rowCount={rowCount}
                sampleSize={sampleSizeState}
                pageCount={pageCount}
                pageIndex={paginationObj?.pageIndex}
                totalHits={totalHits}
                onFetchMoreRecords={onFetchMoreRecords}
                data={data}
                fieldFormats={fieldFormats}
                paginationMode={paginationMode}
                hasScrolledToBottom={paginationMode !== 'multiPage' ? hasScrolledToBottom : true}
              />
            )}
          {searchTitle && (
            <EuiScreenReaderOnly>
              <p id={String(randomId)}>
                {searchDescription ? (
                  <FormattedMessage
                    id="unifiedDataTable.searchGenerationWithDescriptionGrid"
                    defaultMessage="Table generated by Discover session ''{searchTitle}'' ({searchDescription})"
                    values={{ searchTitle, searchDescription }}
                  />
                ) : (
                  <FormattedMessage
                    id="unifiedDataTable.searchGenerationWithDescription"
                    defaultMessage="Table generated by Discover session ''{searchTitle}''"
                    values={{ searchTitle }}
                  />
                )}
              </p>
            </EuiScreenReaderOnly>
          )}
          {canSetExpandedDoc &&
            expandedDoc &&
            typeof renderDocumentView === 'function' &&
            renderDocumentView(expandedDoc, displayedRows, displayedColumns, columnsMeta)}
        </span>
      </UnifiedDataTableContext.Provider>
    );
  }
);

export const UnifiedDataTable = withRestorableState(InternalUnifiedDataTable);

export type UnifiedDataTableProps = ComponentProps<typeof UnifiedDataTable>;

const componentStyles = {
  loadingAndEmpty: css({
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    flex: '1 0 100%',
    height: '100%',
    width: '100%',
  }),
  emptyRow: ({ euiTheme }: UseEuiTheme) => {
    return css([componentStyles.loadingAndEmpty, { padding: euiTheme.size.m }]);
  },
  dataTableGlobal: ({ euiTheme }: UseEuiTheme) =>
    css({
      // Custom styles for data grid header cell.
      // It can also be inside a portal (outside of `unifiedDataTable__inner`) when dragged.
      '.unifiedDataTable__headerCell': {
        alignItems: 'start !important',

        '.euiDataGridHeaderCell__draggableIcon': {
          paddingBlock: `calc(${euiTheme.size.xs} / 2) !important`, // to align with a token height
        },
        '.euiDataGridHeaderCell__button': {
          marginTop: `-${euiTheme.size.xs} !important`, // to override Eui value for Density "Expanded"
        },
      },
    }),
  dataTableInner: ({ euiTheme }: UseEuiTheme) =>
    css({
      display: 'flex',
      flexDirection: 'column',
      flexWrap: 'nowrap',
      height: '100%',
      '.unifiedDataTable__cell--highlight': {
        backgroundColor: euiTheme.colors.backgroundBaseWarning,
      },
      '.unifiedDataTable__cell--expanded': {
        backgroundColor: euiTheme.colors.backgroundBaseInteractiveSelect,
      },
      '.unifiedDataTable__cellValue': {
        fontFamily: euiTheme.font.familyCode,
      },
      '.unifiedDataTable__rowControl': {
        marginTop: -1, // fine-tuning the vertical alignment with the text for any row height setting
      },
      // Compact density - 'auto & custom' row height
      '.euiDataGrid--fontSizeSmall .euiDataGridRowCell__content:not(.euiDataGridRowCell__content--defaultHeight) .unifiedDataTable__rowControl':
        {
          marginTop: -2.5,
        },
      // Compact density - 'single' row height
      '.euiDataGrid--fontSizeSmall .euiDataGridRowCell__content--defaultHeight .unifiedDataTable__rowControl':
        {
          alignSelf: 'flex-start',
          marginTop: -3,
        },
      '.euiDataGrid__content': {
        background: 'transparent',
      },
      '.euiDataGrid--bordersHorizontal .euiDataGridHeader': {
        borderTop: 'none',
      },
      '.euiDataGrid--headerUnderline .euiDataGridHeader': {
        borderBottom: euiTheme.border.thin,
      },
      '.euiDataGridRowCell--controlColumn .euiDataGridRowCell__content, .euiDataGridRowCell.euiDataGridRowCell--controlColumn[data-gridcell-column-id="openDetails"], .euiDataGridRowCell.euiDataGridRowCell--controlColumn[data-gridcell-column-id="select"], .euiDataGridRowCell.euiDataGridRowCell--controlColumn[data-gridcell-column-id^="additionalRowControl_"], .euiDataGridHeaderCell.euiDataGridHeaderCell--controlColumn[data-gridcell-column-id^="additionalRowControl_"]':
        {
          paddingLeft: 0,
          paddingRight: 0,
          borderLeft: 0,
          borderRight: 0,
        },
      '.euiDataGridRowCell.euiDataGridRowCell--controlColumn[data-gridcell-column-id="additionalRowControl_menuControl"] .euiDataGridRowCell__content':
        {
          paddingBottom: 0,
        },
      '.euiDataGridHeaderCell.euiDataGridHeaderCell--controlColumn[data-gridcell-column-id="select"]':
        {
          paddingLeft: euiTheme.size.xs,
          paddingRight: 0,
        },
      '.euiDataGridHeaderCell.euiDataGridHeaderCell--controlColumn[data-gridcell-column-id="colorIndicator"], .euiDataGridRowCell.euiDataGridRowCell--controlColumn[data-gridcell-column-id="colorIndicator"]':
        {
          padding: 0,
          borderLeft: 0,
          borderRight: 0,
        },
      '.euiDataGridRowCell.euiDataGridRowCell--controlColumn[data-gridcell-column-id="colorIndicator"] .euiDataGridRowCell__content':
        {
          height: '100%',
          borderBottom: 0,
        },
      '.euiDataGrid__scrollOverlay .euiDataGrid__scrollBarOverlayRight': {
        backgroundColor: 'transparent', // otherwise the grid scrollbar border visually conflicts with the grid toolbar controls
      },
      '.euiDataGridRowCell__content--autoHeight, .euiDataGridRowCell__content--lineCountHeight, .euiDataGridHeaderCell__content':
        {
          whiteSpace: 'pre-wrap',
        },
      '.euiDataGrid__pagination': {
        paddingTop: 0,
      },
    }),
  dataTable: css({
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  }),
};
