/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { lazy, Suspense, useCallback, useMemo } from 'react';
import type {
  EuiDataGridControlColumn,
  EuiDataGridProps,
  EuiDataGridStyle,
  RenderCellValue,
} from '@elastic/eui';
import { EuiDataGrid, tint, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { ActionsCellHost } from './actions_cell_host';
import { ControlColumnHeaderCell } from './control_column_header_cell';
import { CellValueHost } from './cell_value_host';
import { BulkActionsCell } from './bulk_actions_cell';
import { BulkActionsHeader } from './bulk_actions_header_cell';
import type { AdditionalContext, AlertsDataGridProps, CellActionsOptions } from '../types';
import { useGetToolbarVisibility } from '../hooks/use_toolbar_visibility';
import { InspectButtonContainer } from './alerts_query_inspector';
import { typedMemo } from '../utils/react';
import { useBulkActions } from '../hooks/use_bulk_actions';
import { useSorting } from '../hooks/use_sorting';
import { CellPopoverHost } from './cell_popover_host';
import { NonVirtualizedGridBody } from './non_virtualized_grid_body';
import type { AlertDetailFlyout as AlertDetailFlyoutType } from './alert_detail_flyout';
import { EditTagsFlyout } from './tags/edit_tags_flyout';
import { IndividualTagsActionContextProvider } from '../contexts/individual_tags_action_context';
import { useTagsAction } from './tags/use_tags_action';

const AlertDetailFlyout = lazy(
  () => import('./alert_detail_flyout')
) as typeof AlertDetailFlyoutType;

const defaultGridStyle: EuiDataGridStyle = {
  border: 'none',
  header: 'underline',
  fontSize: 's',
};
const defaultCellActionsOptions: CellActionsOptions = {
  getCellActionsForColumn: () => [],
  disabledCellActions: [],
};
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const DEFAULT_ACTIONS_COLUMN_WIDTH = 75;
const stableMappedRowClasses: EuiDataGridStyle['rowClasses'] = {};

export const AlertsDataGrid = typedMemo(
  <AC extends AdditionalContext>(props: AlertsDataGridProps<AC>) => {
    const {
      ruleTypeIds,
      query,
      columnVisibility,
      onToggleColumn,
      onResetColumns,
      onColumnResize,
      showInspectButton = false,
      showCsvExportButton = false,
      leadingControlColumns: additionalLeadingControlColumns,
      trailingControlColumns,
      onSortChange,
      sort: sortingFields,
      rowHeightsOptions,
      dynamicRowHeight,
      alertsQuerySnapshot,
      additionalToolbarControls,
      toolbarVisibility: toolbarVisibilityProp,
      shouldHighlightRow,
      renderContext,
      hideBulkActions,
      casesConfiguration,
      actionsColumnWidth = DEFAULT_ACTIONS_COLUMN_WIDTH,
      additionalBulkActions,
      fieldsBrowserOptions,
      cellActionsOptions,
      pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
      height,
      bulkAddToChatConfig,
      maxRowCount,
      ...euiDataGridProps
    } = props;
    const {
      isLoading,
      alerts,
      alertsCount,
      isLoadingAlerts,
      browserFields,
      renderActionsCell,
      expandedAlertIndex,
      renderExpandedAlertView,
      pageIndex,
      onPageIndexChange,
      pageSize,
      onPageSizeChange,
      refresh: refreshQueries,
      columns,
      dataGridRef,
      services: {
        http,
        notifications,
        application,
        cases: casesService,
        agentBuilder: agentBuilderService,
        settings,
      },
    } = renderContext;

    const { colorMode, euiTheme } = useEuiTheme();
    const { sortingColumns, onSort } = useSorting(
      onSortChange,
      columnVisibility.visibleColumns,
      sortingFields
    );
    const {
      isBulkActionsColumnActive,
      bulkActionsState,
      bulkActions,
      setIsBulkActionsLoading,
      clearSelection,
      bulkEditTagsFlyoutState,
    } = useBulkActions({
      ruleTypeIds,
      query,
      alertsCount: alerts.length,
      casesConfig: casesConfiguration,
      additionalBulkActions,
      refresh: refreshQueries,
      hideBulkActions,
      http,
      notifications,
      application,
      casesService,
      agentBuilderService,
      bulkAddToChatConfig,
    });

    const refresh = useCallback(() => {
      refreshQueries();
      clearSelection();
    }, [clearSelection, refreshQueries]);

    const columnIds = useMemo(() => columns.map((column) => column.id), [columns]);

    const toolbarVisibility = useGetToolbarVisibility({
      bulkActions,
      alertsCount,
      rowSelection: bulkActionsState.rowSelection,
      alerts,
      isLoading,
      columnIds,
      onToggleColumn,
      onResetColumns,
      browserFields,
      additionalToolbarControls,
      setIsBulkActionsLoading,
      clearSelection,
      refresh,
      fieldsBrowserOptions,
      alertsQuerySnapshot,
      showInspectButton,
      showCsvExportButton,
      toolbarVisibilityProp,
      settings,
    });

    const leadingControlColumns: EuiDataGridControlColumn[] | undefined = useMemo(() => {
      const controlColumns = [
        ...(additionalLeadingControlColumns ?? []),
        ...(isBulkActionsColumnActive
          ? [
              {
                id: 'bulkActions',
                width: 30,
                headerCellRender: BulkActionsHeader,
                rowCellRender: BulkActionsCell,
              },
            ]
          : []),
        // If the user provided an actions cell renderer, add the actions column
        ...(renderActionsCell
          ? [
              {
                id: 'expandColumn',
                width: actionsColumnWidth,
                headerCellRender: ControlColumnHeaderCell,
                // Though untyped, rowCellRender's CellPropsWithContext contains the correct context
                rowCellRender:
                  ActionsCellHost as unknown as EuiDataGridControlColumn['rowCellRender'],
              },
            ]
          : []),
      ];
      if (controlColumns.length) {
        return controlColumns;
      }
    }, [
      additionalLeadingControlColumns,
      isBulkActionsColumnActive,
      renderActionsCell,
      actionsColumnWidth,
    ]);

    const dataGridPagination = useMemo(
      () => ({
        pageIndex,
        pageSize,
        pageSizeOptions,
        onChangePage: onPageIndexChange,
        onChangeItemsPerPage: onPageSizeChange,
      }),
      [onPageIndexChange, onPageSizeChange, pageIndex, pageSize, pageSizeOptions]
    );

    const { getCellActionsForColumn, visibleCellActions, disabledCellActions } =
      cellActionsOptions ?? defaultCellActionsOptions;

    const columnsWithCellActions = useMemo(() => {
      if (getCellActionsForColumn) {
        return columns.map((col, idx) => ({
          ...col,
          ...(!(disabledCellActions ?? []).includes(col.id)
            ? {
                cellActions: getCellActionsForColumn(col.id, idx) ?? [],
                visibleCellActions,
              }
            : {}),
        }));
      }
      return columns;
    }, [getCellActionsForColumn, columns, disabledCellActions, visibleCellActions]);

    // Update highlighted rows when alerts or pagination changes
    const highlightedRowClasses = useMemo(() => {
      if (shouldHighlightRow) {
        const emptyShouldHighlightRow: EuiDataGridStyle['rowClasses'] = {};
        return alerts.reduce<NonNullable<EuiDataGridStyle['rowClasses']>>(
          (rowClasses, alert, index) => {
            if (shouldHighlightRow(alert)) {
              rowClasses[index + pageIndex * pageSize] = 'alertsTableHighlightedRow';
            }

            return rowClasses;
          },
          emptyShouldHighlightRow
        );
      } else {
        return stableMappedRowClasses;
      }
    }, [shouldHighlightRow, alerts, pageIndex, pageSize]);

    const mergedGridStyle = useMemo(() => {
      const propGridStyle: NonNullable<EuiDataGridStyle> = props.gridStyle ?? {};
      // Merges default row classes, custom ones and adds the active row class style
      return {
        ...defaultGridStyle,
        ...propGridStyle,
        rowClasses: {
          // We're spreading the highlighted row classes first, so that the active
          // row classed can override the highlighted row classes.
          ...highlightedRowClasses,
          ...(expandedAlertIndex != null ? { [expandedAlertIndex]: 'alertsTableActiveRow' } : {}),
        },
      };
    }, [expandedAlertIndex, highlightedRowClasses, props.gridStyle]);

    // Merges the default grid style with the grid style that comes in through props.
    const actualGridStyle = useMemo(() => {
      const propGridStyle: NonNullable<EuiDataGridStyle> = props.gridStyle ?? {};
      // If ANY additional rowClasses have been provided, we need to merge them with our internal ones
      if (propGridStyle.rowClasses) {
        // Get all row indices with a rowClass.
        const mergedKeys = [
          ...Object.keys(mergedGridStyle.rowClasses || {}),
          ...Object.keys(propGridStyle.rowClasses || {}),
        ];
        // Deduplicate keys to avoid extra iterations
        const dedupedKeys = Array.from(new Set(mergedKeys));

        // For each index, merge row classes
        mergedGridStyle.rowClasses = dedupedKeys.reduce<
          NonNullable<EuiDataGridStyle['rowClasses']>
        >((rowClasses, key) => {
          const intKey = parseInt(key, 10);
          // Use internal row classes over custom row classes.
          rowClasses[intKey] =
            mergedGridStyle.rowClasses?.[intKey] || propGridStyle.rowClasses?.[intKey] || '';
          return rowClasses;
        }, {});
      }
      return mergedGridStyle;
    }, [props.gridStyle, mergedGridStyle]);

    const renderCustomGridBody = useCallback<NonNullable<EuiDataGridProps['renderCustomGridBody']>>(
      ({ visibleColumns: _visibleColumns, Cell, headerRow, footerRow }) => (
        <>
          {headerRow}
          <NonVirtualizedGridBody
            alerts={alerts}
            visibleColumns={_visibleColumns}
            Cell={Cell}
            actualGridStyle={actualGridStyle}
            pageIndex={pageIndex}
            pageSize={pageSize}
            isLoading={isLoadingAlerts}
            stripes={props.gridStyle?.stripes}
          />
          {footerRow}
        </>
      ),
      [alerts, actualGridStyle, pageIndex, pageSize, isLoadingAlerts, props.gridStyle?.stripes]
    );

    const sortProps = useMemo(() => {
      return { columns: sortingColumns, onSort };
    }, [sortingColumns, onSort]);

    const rowStyles = useMemo(
      () => css`
        .alertsTableHighlightedRow {
          background-color: ${euiTheme.components.dataGridRowBackgroundMarked};
        }

        .alertsTableActiveRow {
          background-color: ${colorMode === 'LIGHT'
            ? tint(euiTheme.colors.lightShade, 0.5)
            : euiTheme.colors.lightShade};
        }
      `,
      [colorMode, euiTheme]
    );

    const ExpandedAlertView =
      // By checking undefined explicitly, we allow falsy values (null) to skip rendering the flyout
      renderExpandedAlertView !== undefined
        ? renderExpandedAlertView
        : // Overriding the simplified type here to avoid cyclic problems with generics
          (AlertDetailFlyout as NonNullable<typeof renderExpandedAlertView>);

    const selectedAlerts = useMemo(
      () =>
        Array.from(bulkActionsState.rowSelection.keys())
          .map((i) => alerts[i])
          .filter(Boolean),
      [alerts, bulkActionsState.rowSelection]
    );

    const individualTagsFlyout = useTagsAction({
      onActionSuccess: () => {
        refresh();
      },
      onActionError: () => {
        refresh();
      },
      isDisabled: false,
    });

    const { selectedAlerts: selectedAlertsFromRowAction } = individualTagsFlyout;

    /**
     * Elasticsearch has a hard-limit of 10k results, even with pagination.
     * Therefore, we need to cap the page count to a max of 10k results
     *
     * @see https://github.com/elastic/kibana/issues/151913s
     */
    const cappedAlertsCount = useMemo(
      () => (maxRowCount && alertsCount > maxRowCount ? maxRowCount : alertsCount),
      [alertsCount, maxRowCount]
    );

    return (
      <IndividualTagsActionContextProvider value={individualTagsFlyout}>
        <InspectButtonContainer>
          <section style={{ width: '100%' }} data-test-subj={props['data-test-subj']}>
            <Suspense fallback={null}>
              {expandedAlertIndex != null && ExpandedAlertView && (
                <ExpandedAlertView {...renderContext} expandedAlertIndex={expandedAlertIndex} />
              )}
            </Suspense>
            {bulkEditTagsFlyoutState.isFlyoutOpen && selectedAlerts.length > 0 && (
              <EditTagsFlyout
                selectedAlerts={selectedAlerts}
                onClose={bulkEditTagsFlyoutState.onClose}
                onSaveTags={bulkEditTagsFlyoutState.onSaveTags}
              />
            )}
            {individualTagsFlyout.isFlyoutOpen && selectedAlertsFromRowAction?.length > 0 && (
              <EditTagsFlyout
                selectedAlerts={selectedAlertsFromRowAction}
                onClose={individualTagsFlyout.onClose}
                onSaveTags={individualTagsFlyout.onSaveTags}
              />
            )}
            {alertsCount > 0 && (
              <EuiDataGrid
                {...euiDataGridProps}
                // As per EUI docs, it is not recommended to switch between undefined and defined height.
                // If user changes height, it is better to unmount and mount the component.
                // Ref: https://eui.elastic.co/#/tabular-content/data-grid#virtualization
                key={height ? 'fixedHeight' : 'autoHeight'}
                ref={dataGridRef}
                css={rowStyles}
                aria-label="Alerts table"
                data-test-subj={isLoading ? `alertsTableIsLoading` : `alertsTableIsLoaded`}
                height={height}
                columns={columnsWithCellActions}
                columnVisibility={columnVisibility}
                trailingControlColumns={trailingControlColumns}
                leadingControlColumns={leadingControlColumns}
                rowCount={cappedAlertsCount}
                renderCustomGridBody={dynamicRowHeight ? renderCustomGridBody : undefined}
                cellContext={renderContext}
                // Cast necessary because `cellContext` is untyped in EuiDataGrid
                renderCellValue={CellValueHost as RenderCellValue}
                renderCellPopover={CellPopoverHost}
                gridStyle={actualGridStyle}
                sorting={sortProps}
                toolbarVisibility={toolbarVisibility}
                pagination={dataGridPagination}
                rowHeightsOptions={rowHeightsOptions}
                onColumnResize={onColumnResize}
              />
            )}
          </section>
        </InspectButtonContainer>
      </IndividualTagsActionContextProvider>
    );
  }
);

(AlertsDataGrid as FC).displayName = 'AlertsDataGrid';
