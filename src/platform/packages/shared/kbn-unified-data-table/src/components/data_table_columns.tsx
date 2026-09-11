/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MutableRefObject } from 'react';
import React from 'react';
import { i18n } from '@kbn/i18n';
import type { EuiDataGridRefProps, EuiListGroupItemProps, RenderCellValue } from '@elastic/eui';
import {
  type EuiDataGridColumn,
  type EuiDataGridColumnCellAction,
  type EuiDataGridControlColumn,
  type EuiDataGridColumnSortingConfig,
} from '@elastic/eui';
import type { DataView } from '@kbn/data-views-plugin/public';
import { getDataViewFieldOrCreateFromColumnMeta } from '@kbn/data-view-utils';
import type { ToastsStart, IUiSettingsClient } from '@kbn/core/public';
import type { DocViewFilterFn } from '@kbn/unified-doc-viewer/types';
import type { DataTableRecord } from '@kbn/discover-utils';
import { SOURCE_COLUMN } from '../utils/columns';
import { ExpandButton } from './data_table_expand_button';
import type {
  CustomGridColumnsConfiguration,
  DocumentsDisplayMode,
  UnifiedDataTableSettings,
} from '../types';
import type { ValueToStringConverter, DataTableColumnsMeta } from '../types';
import { buildCellActions } from './default_cell_actions';
import { getSchemaByKbnType } from './data_table_schema';
import { SelectButton, getSelectAllButton } from './data_table_document_selection';
import {
  defaultTimeColumnWidth,
  ROWS_HEIGHT_OPTIONS,
  DEFAULT_CONTROL_COLUMN_WIDTH,
  SCORE_COLUMN_NAME,
} from '../constants';
import { buildCopyColumnNameButton, buildCopyColumnValuesButton } from './build_copy_column_button';
import { buildEditFieldButton } from './build_edit_field_button';
import {
  DataTableColumnHeader,
  DataTableScoreColumnHeader,
  DataTableTimeColumnHeader,
} from './data_table_column_header';
import type { UnifiedDataTableProps } from './data_table';
import { UnifiedDataTableSourceColumnHeader } from './data_table_source_column_header';
import { isSortable } from '../hooks/use_sorting';

export const getColumnDisplayName = (
  columnName: string,
  dataViewFieldDisplayName: string | undefined,
  columnDisplay: string | undefined,
  documentsDisplayMode: DocumentsDisplayMode
) => {
  if (columnDisplay) {
    return columnDisplay;
  }

  if (columnName === SOURCE_COLUMN) {
    return documentsDisplayMode === 'table'
      ? i18n.translate('unifiedDataTable.grid.documentHeader', {
          defaultMessage: 'Summary',
        })
      : i18n.translate('unifiedDataTable.grid.documentHeader.json', {
          defaultMessage: 'JSON',
        });
  }

  return dataViewFieldDisplayName || columnName;
};

const DataTableColumnHeaderMemoized = React.memo(DataTableColumnHeader);
const DataTableTimeColumnHeaderMemoized = React.memo(DataTableTimeColumnHeader);
const DataTableScoreColumnHeaderMemoized = React.memo(DataTableScoreColumnHeader);
const DataTableSourceColumnHeaderMemoized = React.memo(UnifiedDataTableSourceColumnHeader);

const EMPTY_CELL_ACTIONS: EuiDataGridColumnCellAction[] = [];

export const OPEN_DETAILS = 'openDetails';
export const SELECT_ROW = 'select';

const getSelect = (rows: DataTableRecord[]) => ({
  id: SELECT_ROW,
  width: DEFAULT_CONTROL_COLUMN_WIDTH,
  headerCellProps: { className: 'unifiedDataTable__headerCell' },
  rowCellRender: SelectButton,
  headerCellRender: getSelectAllButton(rows),
});

export function getLeadControlColumns({
  rows,
  canSetExpandedDoc,
}: {
  rows: DataTableRecord[];
  canSetExpandedDoc: boolean;
}): {
  leadColumns: EuiDataGridControlColumn[];
  leadColumnsExtraContent: RenderCellValue[];
} {
  return {
    leadColumns: [getSelect(rows)],
    leadColumnsExtraContent: canSetExpandedDoc ? [ExpandButton] : [],
  };
}

function buildEuiGridColumn({
  numberOfColumns,
  columnName,
  columnWidth = 0,
  dataView,
  isSummaryOnlyColumn,
  isSortEnabled,
  isResizable,
  isPlainRecord,
  toastNotifications,
  hasEditDataViewPermission,
  valueToStringConverter,
  rowsCount,
  onFilter,
  editField,
  columnCellActions,
  cellActionsHandling,
  visibleCellActions,
  columnsMeta,
  showColumnTokens,
  headerRowHeight,
  customGridColumnsConfiguration,
  columnDisplay,
  onResize,
  sortedColumns,
  disableCellActions = false,
  disableColumnActions = false,
  dataGridRef,
  hideFilteringOnComputedColumns,
  documentsDisplayMode,
}: {
  numberOfColumns: number;
  columnName: string;
  columnWidth: number | undefined;
  dataView: DataView;
  isSummaryOnlyColumn: boolean;
  isSortEnabled: boolean;
  isResizable: boolean;
  isPlainRecord?: boolean;
  toastNotifications: ToastsStart;
  hasEditDataViewPermission: () => boolean;
  valueToStringConverter: ValueToStringConverter;
  rowsCount: number;
  onFilter?: DocViewFilterFn;
  editField?: (fieldName: string) => void;
  columnCellActions?: EuiDataGridColumnCellAction[];
  cellActionsHandling: 'replace' | 'append';
  visibleCellActions?: number;
  columnsMeta?: DataTableColumnsMeta;
  showColumnTokens?: boolean;
  headerRowHeight?: number;
  customGridColumnsConfiguration?: CustomGridColumnsConfiguration;
  columnDisplay?: string;
  onResize: UnifiedDataTableProps['onResize'];
  sortedColumns?: EuiDataGridColumnSortingConfig[];
  disableCellActions?: boolean;
  disableColumnActions?: boolean;
  dataGridRef?: MutableRefObject<EuiDataGridRefProps | null>;
  hideFilteringOnComputedColumns?: boolean;
  documentsDisplayMode: DocumentsDisplayMode;
}) {
  const dataViewField = getDataViewFieldOrCreateFromColumnMeta({
    dataView,
    fieldName: columnName,
    columnMeta: columnsMeta?.[columnName],
  });
  const editFieldButton =
    editField &&
    dataViewField &&
    buildEditFieldButton({ hasEditDataViewPermission, dataView, field: dataViewField, editField });
  const resetWidthButton: EuiListGroupItemProps | undefined =
    onResize && columnWidth > 0
      ? {
          // @ts-expect-error
          // We need to force a key here because EuiListGroup uses the array index as a key by default,
          // which causes re-render issues with conditional items like this one, and can result in
          // incorrect attributes (e.g. title) on the HTML element as well as test failures
          key: 'reset-width',
          label: i18n.translate('unifiedDataTable.grid.resetColumnWidthButton', {
            defaultMessage: 'Reset width',
          }),
          iconType: 'refresh',
          iconProps: { size: 'm' },
          onClick: () => {
            onResize({ columnId: columnName, width: undefined });
          },
          'data-test-subj': 'unifiedDataTableResetColumnWidth',
        }
      : undefined;

  const columnDisplayName = getColumnDisplayName(
    columnName,
    dataViewField?.displayName,
    columnDisplay,
    documentsDisplayMode
  );

  const isSorted = sortedColumns?.some((column) => column.id === columnName);

  let cellActions: EuiDataGridColumnCellAction[];

  if (disableCellActions) {
    cellActions = EMPTY_CELL_ACTIONS;
  } else {
    if (columnCellActions?.length && cellActionsHandling === 'replace') {
      cellActions = columnCellActions;
    } else {
      cellActions = dataViewField
        ? buildCellActions(
            dataViewField,
            toastNotifications,
            valueToStringConverter,
            documentsDisplayMode,
            onFilter,
            dataGridRef,
            hideFilteringOnComputedColumns
          )
        : EMPTY_CELL_ACTIONS;

      if (columnCellActions?.length && cellActionsHandling === 'append') {
        cellActions.push(...columnCellActions);
      }
    }
  }

  const columnType = dataViewField?.type;
  const columnSchema = getSchemaByKbnType(columnType);

  // EUI columns
  const column: EuiDataGridColumn = {
    id: columnName,
    schema: columnSchema,
    isResizable,
    isSortable:
      isSortEnabled && isSortable({ isPlainRecord, columnName, columnSchema, dataViewField }),
    display:
      showColumnTokens || headerRowHeight !== 1 ? (
        <DataTableColumnHeaderMemoized
          dataView={dataView}
          columnName={columnName}
          columnDisplayName={columnDisplayName}
          columnsMeta={columnsMeta}
          showColumnTokens={showColumnTokens}
          headerRowHeight={headerRowHeight}
        />
      ) : undefined,
    displayAsText: columnDisplayName,
    actions: disableColumnActions
      ? false
      : {
          showHide:
            isSummaryOnlyColumn || columnName === dataView.timeFieldName
              ? false
              : {
                  label: i18n.translate('unifiedDataTable.removeColumnLabel', {
                    defaultMessage: 'Remove column',
                  }),
                  iconType: 'cross',
                  'data-test-subj': 'unifiedDataTableRemoveColumn',
                },
          showMoveLeft: !isSummaryOnlyColumn,
          showMoveRight: !isSummaryOnlyColumn,
          additional: [
            ...(resetWidthButton ? [resetWidthButton] : []),
            ...(columnName === SOURCE_COLUMN
              ? []
              : [
                  buildCopyColumnNameButton({
                    columnDisplayName,
                    toastNotifications,
                  }),
                ]),
            buildCopyColumnValuesButton({
              columnId: columnName,
              columnDisplayName,
              toastNotifications,
              rowsCount,
              valueToStringConverter,
            }),
            ...(editFieldButton ? [editFieldButton] : []),
          ],
        },
    cellActions,
    visibleCellActions,
    displayHeaderCellProps: { className: 'unifiedDataTable__headerCell' },
  };

  if (column.id === SOURCE_COLUMN) {
    column.display = (
      <DataTableSourceColumnHeaderMemoized
        columnDisplayName={columnDisplayName}
        headerRowHeight={headerRowHeight}
        // JSON mode do not display a tooltip, Summary mode sets undefined so the default one is displayed.
        tooltipContent={documentsDisplayMode === 'json' ? null : undefined}
      />
    );
    if (documentsDisplayMode === 'json') {
      column.isExpandable = false;
      column.cellActions = EMPTY_CELL_ACTIONS;
    }
  }

  if (column.id === dataView.timeFieldName) {
    column.display = (
      <DataTableTimeColumnHeaderMemoized
        dataView={dataView}
        dataViewField={dataViewField}
        headerRowHeight={headerRowHeight}
        columnLabel={columnDisplay}
      />
    );
    if (numberOfColumns > 1) {
      column.initialWidth = defaultTimeColumnWidth;
    }
  }

  if (column.id === SCORE_COLUMN_NAME) {
    column.display = (
      <DataTableScoreColumnHeaderMemoized
        columnDisplayName={columnDisplayName}
        isSorted={isSorted}
        showColumnTokens={showColumnTokens}
        dataView={dataView}
        headerRowHeight={headerRowHeight}
        columnName={columnName}
        columnsMeta={columnsMeta}
      />
    );
  }

  if (columnWidth > 0) {
    column.initialWidth = Number(columnWidth);
  }

  if (customGridColumnsConfiguration && customGridColumnsConfiguration[column.id]) {
    // Do not allow overwrites to the JSON column.
    if (column.id === SOURCE_COLUMN && documentsDisplayMode === 'json') {
      return column;
    }
    return customGridColumnsConfiguration[column.id]({ column, headerRowHeight });
  }

  if (disableCellActions) {
    column.isExpandable = false;
  }

  return column;
}

export const deserializeHeaderRowHeight = (headerRowHeightLines: number) => {
  if (headerRowHeightLines === ROWS_HEIGHT_OPTIONS.auto) {
    return undefined;
  }

  return headerRowHeightLines;
};

export function getEuiGridColumns({
  columns,
  columnsCellActions,
  cellActionsHandling,
  rowsCount,
  settings,
  dataView,
  isSummaryOnlyColumn,
  isSortEnabled,
  isResizable,
  disableCellActions = false,
  disableColumnActions = false,
  isPlainRecord,
  services,
  hasEditDataViewPermission,
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
  dataGridRef,
  hideFilteringOnComputedColumns,
  documentsDisplayMode,
}: {
  columns: string[];
  columnsCellActions?: EuiDataGridColumnCellAction[][];
  cellActionsHandling: 'replace' | 'append';
  rowsCount: number;
  settings: UnifiedDataTableSettings | undefined;
  dataView: DataView;
  isSummaryOnlyColumn: boolean;
  isSortEnabled: boolean;
  isResizable: boolean;
  isPlainRecord?: boolean;
  disableCellActions?: boolean;
  disableColumnActions?: boolean;
  services: {
    uiSettings: IUiSettingsClient;
    toastNotifications: ToastsStart;
  };
  hasEditDataViewPermission: () => boolean;
  valueToStringConverter: ValueToStringConverter;
  onFilter?: DocViewFilterFn;
  editField?: (fieldName: string) => void;
  visibleCellActions?: number;
  columnsMeta?: DataTableColumnsMeta;
  showColumnTokens?: boolean;
  headerRowHeightLines: number;
  customGridColumnsConfiguration?: CustomGridColumnsConfiguration;
  onResize: UnifiedDataTableProps['onResize'];
  sortedColumns?: EuiDataGridColumnSortingConfig[];
  dataGridRef?: MutableRefObject<EuiDataGridRefProps | null>;
  hideFilteringOnComputedColumns?: boolean;
  documentsDisplayMode: DocumentsDisplayMode;
}) {
  const getColWidth = (column: string) => settings?.columns?.[column]?.width ?? 0;
  const headerRowHeight = deserializeHeaderRowHeight(headerRowHeightLines);
  const numberOfColumns = columns.length;

  return columns.map((column, columnIndex) =>
    buildEuiGridColumn({
      numberOfColumns,
      columnName: column,
      columnCellActions: columnsCellActions?.[columnIndex],
      cellActionsHandling,
      columnWidth: getColWidth(column),
      dataView,
      isSummaryOnlyColumn,
      isSortEnabled,
      isResizable,
      isPlainRecord,
      toastNotifications: services.toastNotifications,
      hasEditDataViewPermission,
      valueToStringConverter,
      rowsCount,
      onFilter,
      editField,
      visibleCellActions,
      columnsMeta,
      showColumnTokens,
      headerRowHeight,
      customGridColumnsConfiguration,
      columnDisplay: settings?.columns?.[column]?.display,
      onResize,
      sortedColumns,
      disableCellActions,
      disableColumnActions,
      dataGridRef,
      hideFilteringOnComputedColumns,
      documentsDisplayMode,
    })
  );
}
