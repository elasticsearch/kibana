/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  EuiDataGridCellPopoverElementProps,
  euiFontSize,
  EuiThemeComputed,
} from '@elastic/eui';
import { EuiCallOut, EuiFlexItem, EuiProgress } from '@elastic/eui';
import { css } from '@emotion/react';
import React, { memo } from 'react';
import { CellActionsProvider } from '@kbn/cell-actions';
import type { DataView } from '@kbn/data-views-plugin/public';
import { DataGridDensity } from '@kbn/discover-session-constants';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import {
  type CustomCellRenderer,
  type CustomGridColumnsConfiguration,
  DataLoadingState,
  type DataTableColumnsMeta,
  SELECT_ROW,
  type SortOrder,
  UnifiedDataTable,
  type UnifiedDataTableRenderCustomToolbar,
} from '@kbn/unified-data-table';
import { wrapRenderCustomToolbarWithModalTableFullscreen } from './workflow_execute_modal_table_fullscreen_toolbar';

export interface WorkflowExecuteUnifiedDataTableProps {
  dataTestSubj: string;
  ariaLabelledBy?: string;
  isError?: boolean;
  errorCalloutTitle?: string;
  errorCalloutBody?: React.ReactNode;
  validationError?: string | null;
  validationErrorTitle?: string;
  surfaceRef?: React.Ref<HTMLDivElement>;
  euiTheme: EuiThemeComputed;
  tableSurfaceColor: string;
  timestampCellTypography: ReturnType<typeof euiFontSize>;
  tableLoadingState: DataLoadingState;
  dataView: DataView | null;
  getNoCellActions: UiActionsStart['getTriggerCompatibleActions'];
  visibleTableColumns: string[];
  columnsMeta: DataTableColumnsMeta;
  dataTableRows: DataTableRecord[];
  rowsLength: number;
  unifiedDataTableServices: React.ComponentProps<typeof UnifiedDataTable>['services'];
  handleUnifiedDataTableSetColumns: (columns: string[], hideTimeColumn: boolean) => void;
  showTimeColumn: boolean;
  sort: SortOrder[];
  handleSortChange: (nextSort: string[][]) => void;
  customGridColumnsConfiguration?: CustomGridColumnsConfiguration;
  renderCustomToolbar?: UnifiedDataTableRenderCustomToolbar;
  renderCellPopover?: (popoverProps: EuiDataGridCellPopoverElementProps) => React.JSX.Element;
  externalCustomRenderers?: CustomCellRenderer;
  totalHits?: number;
  onFetchMoreRecords?: () => void;
  onDataGridFullScreenChange?: (isFullScreen: boolean) => void;
  /** Mirrors modal table-grid fullscreen; drives the custom toolbar fullscreen control. */
  isTableGridFullScreen?: boolean;
  /** When set, renders instead of the data grid (e.g. trigger-events empty state). */
  emptyStateContent?: React.ReactNode;
  fillHeight?: boolean;
  minTableHeight?: number;
}

export const WorkflowExecuteUnifiedDataTable = memo(function WorkflowExecuteUnifiedDataTable({
  dataTestSubj,
  ariaLabelledBy,
  isError = false,
  errorCalloutTitle,
  errorCalloutBody,
  validationError = null,
  validationErrorTitle,
  surfaceRef,
  euiTheme,
  tableSurfaceColor,
  timestampCellTypography,
  tableLoadingState,
  dataView,
  getNoCellActions,
  visibleTableColumns,
  columnsMeta,
  dataTableRows,
  rowsLength,
  unifiedDataTableServices,
  handleUnifiedDataTableSetColumns,
  showTimeColumn,
  sort,
  handleSortChange,
  customGridColumnsConfiguration,
  renderCustomToolbar,
  renderCellPopover,
  externalCustomRenderers,
  totalHits,
  onFetchMoreRecords,
  onDataGridFullScreenChange,
  isTableGridFullScreen = false,
  emptyStateContent,
  fillHeight = true,
  minTableHeight = 280,
}: WorkflowExecuteUnifiedDataTableProps): React.JSX.Element {
  const resolvedRenderCustomToolbar =
    onDataGridFullScreenChange != null
      ? wrapRenderCustomToolbarWithModalTableFullscreen(
          renderCustomToolbar,
          isTableGridFullScreen,
          onDataGridFullScreenChange
        )
      : renderCustomToolbar;

  return (
    <>
      {isError && errorCalloutTitle ? (
        <EuiFlexItem grow={false}>
          <EuiCallOut
            announceOnMount
            title={errorCalloutTitle}
            color="danger"
            iconType="error"
            size="s"
          >
            {errorCalloutBody ? <p>{errorCalloutBody}</p> : null}
          </EuiCallOut>
        </EuiFlexItem>
      ) : null}
      {validationError !== null && validationErrorTitle ? (
        <EuiFlexItem grow={false}>
          <EuiCallOut
            announceOnMount
            title={validationErrorTitle}
            color="danger"
            iconType="error"
            size="s"
          >
            <p>{validationError}</p>
          </EuiCallOut>
        </EuiFlexItem>
      ) : null}

      <EuiFlexItem
        grow={fillHeight}
        css={css({
          minHeight: fillHeight ? 0 : minTableHeight,
          display: 'flex',
          flexDirection: 'column',
        })}
      >
        <div
          ref={surfaceRef}
          css={[
            css({
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              flex: fillHeight ? 1 : undefined,
              minHeight: fillHeight ? 0 : minTableHeight,
              width: '100%',
              minWidth: 0,
              border: euiTheme.border.thin,
              borderRadius: euiTheme.border.radius.medium,
              boxSizing: 'border-box',
              backgroundColor: tableSurfaceColor,
            }),
            css`
              padding-block-start: ${euiTheme.size.m};
              padding-inline: ${euiTheme.size.s};
              padding-block-end: ${euiTheme.size.xs};
              .unifiedDataTable__headerCell .euiDataGridHeaderCell__button {
                margin-top: 0 !important;
              }
              .euiDataGridHeaderCell .euiDataGridHeaderCell__button,
              .euiDataGridHeaderCell .euiDataGridHeaderCell__content {
                font-size: ${timestampCellTypography.fontSize} !important;
                line-height: ${timestampCellTypography.lineHeight};
              }
              .euiDataGridHeader,
              .euiDataGridHeaderCell {
                background-color: ${tableSurfaceColor} !important;
              }
              .euiDataGridRowCell[data-gridcell-column-id='@timestamp']
                .euiDataGridRowCell__content,
              .euiDataGridRowCell[data-gridcell-column-id='@timestamp']
                .unifiedDataTable__cellValue {
                white-space: nowrap;
                font-size: ${timestampCellTypography.fontSize} !important;
                line-height: ${timestampCellTypography.lineHeight};
              }
              .unifiedDataTable__inner {
                flex: 1;
                min-height: 0;
                height: 100%;
              }
              .unifiedDataTableToolbar {
                padding-top: ${euiTheme.size.xs};
                padding-bottom: ${euiTheme.size.xs};
              }
              .unifiedDataTableToolbarControlButton:has(
                  [data-test-subj='unifiedDataTableSelectionBtn']
                ),
              .unifiedDataTableToolbarControlButton:has([data-test-subj='dscGridSelectAllDocs']) {
                display: none !important;
              }
              .euiDataGrid__pagination {
                padding-bottom: 0 !important;
                margin-bottom: 0 !important;
              }
            `,
          ]}
          data-test-subj={dataTestSubj}
        >
          {tableLoadingState === DataLoadingState.loading && (
            <div
              css={css({
                position: 'absolute',
                insetInlineStart: 0,
                insetInlineEnd: 0,
                top: 0,
                zIndex: euiTheme.levels.toast,
              })}
            >
              <EuiProgress size="xs" color="accent" />
            </div>
          )}
          {dataView
            ? emptyStateContent ?? (
                <div
                  css={css({
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                  })}
                >
                  <CellActionsProvider getTriggerCompatibleActions={getNoCellActions}>
                    <UnifiedDataTable
                      ariaLabelledBy={ariaLabelledBy ?? dataTestSubj}
                      columns={visibleTableColumns}
                      columnsMeta={columnsMeta}
                      rows={dataTableRows}
                      dataView={dataView}
                      loadingState={tableLoadingState}
                      sampleSizeState={rowsLength}
                      services={unifiedDataTableServices}
                      onSetColumns={handleUnifiedDataTableSetColumns}
                      showTimeCol={showTimeColumn}
                      sort={sort}
                      onSort={handleSortChange}
                      isSortEnabled={true}
                      isPaginationEnabled={true}
                      paginationMode="infinite"
                      totalHits={totalHits}
                      onFetchMoreRecords={onFetchMoreRecords}
                      dataGridDensityState={DataGridDensity.NORMAL}
                      isPlainRecord={true}
                      showFullScreenButton={false}
                      showKeyboardShortcuts={false}
                      enableInTableSearch={true}
                      controlColumnIds={[SELECT_ROW]}
                      customGridColumnsConfiguration={customGridColumnsConfiguration}
                      renderCustomToolbar={resolvedRenderCustomToolbar}
                      renderCellPopover={renderCellPopover}
                      externalCustomRenderers={externalCustomRenderers}
                    />
                  </CellActionsProvider>
                </div>
              )
            : null}
        </div>
      </EuiFlexItem>
    </>
  );
});

WorkflowExecuteUnifiedDataTable.displayName = 'WorkflowExecuteUnifiedDataTable';
