/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButtonEmpty,
  EuiCallOut,
  EuiEmptyPrompt,
  EuiPanel,
  EuiSkeletonText,
  EuiTablePagination,
} from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CellActionsProvider } from '@kbn/cell-actions';
import type { DataView } from '@kbn/data-views-plugin/common';
import { buildDataTableRecordList } from '@kbn/discover-utils';
import type { DataTableRecord, EsHitRecord } from '@kbn/discover-utils/types';
import type { Filter, Query, TimeRange } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  DataLoadingState,
  type SortOrder,
  UnifiedDataTable,
  type UnifiedDataTableSettings,
} from '@kbn/unified-data-table';
import { useWorkflowExecutionsSearch } from './use_workflow_executions_search';
import { WorkflowExecutionDetailFlyout } from './workflow_execution_detail_flyout';
import { getWorkflowExecutionsFetchErrorMessage } from './workflow_executions_search_query';
import { useKibana } from '../../hooks/use_kibana';

const DEFAULT_COLUMNS = ['workflowId', 'status', 'id', 'triggeredBy', 'executedBy'] as const;
const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_SORT: SortOrder[] = [['startedAt', 'desc']];

const gridStyleOverride = {
  border: 'all' as const,
  header: 'shade' as const,
  stripes: false,
};

const tableContainerCss = css`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
`;

const gridWrapperCss = css`
  flex: 1 1 auto;
`;

export interface WorkflowExecutionsTableProps {
  dataView: DataView;
  query: Query;
  filters: Filter[];
  timeRange: TimeRange;
  spaceId: string;
}

export const WorkflowExecutionsTable = React.memo<WorkflowExecutionsTableProps>(
  ({ dataView, query, filters, timeRange, spaceId }) => {
    const {
      data: dataService,
      fieldFormats,
      notifications: { toasts },
      storage,
      theme,
      uiActions,
      uiSettings,
    } = useKibana().services;

    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [sort, setSort] = useState<SortOrder[]>(DEFAULT_SORT);
    const [visibleColumns, setVisibleColumns] = useState<string[]>(Array.from(DEFAULT_COLUMNS));
    const [gridSettings, setGridSettings] = useState<UnifiedDataTableSettings>({});
    const [expandedDoc, setExpandedDoc] = useState<DataTableRecord | undefined>();

    const {
      data: rawResponse,
      error,
      isFetching,
      isLoading,
      refetch,
    } = useWorkflowExecutionsSearch({
      dataView,
      query,
      filters,
      timeRange,
      spaceId,
      pageIndex,
      pageSize,
      sort,
    });

    const { hits, total } = useMemo(() => {
      const responseHits = (rawResponse?.hits?.hits ?? []).filter(
        (hit) => hit._source != null
      ) as unknown as EsHitRecord[];
      const totalHits = rawResponse?.hits?.total;
      const totalCount =
        typeof totalHits === 'number' ? totalHits : totalHits?.value ?? responseHits.length;

      return { hits: responseHits, total: totalCount };
    }, [rawResponse]);

    const loadingState =
      isLoading || isFetching ? DataLoadingState.loading : DataLoadingState.loaded;
    const errorMessage = error ? getWorkflowExecutionsFetchErrorMessage() : null;

    useEffect(() => {
      setPageIndex(0);
      setExpandedDoc(undefined);
    }, [query, filters, spaceId, timeRange]);

    const rows = useMemo<DataTableRecord[]>(
      () => buildDataTableRecordList({ records: hits, dataView }),
      [hits, dataView]
    );

    const services = useMemo(
      () => ({
        theme,
        fieldFormats,
        uiSettings,
        toastNotifications: toasts,
        storage,
        data: dataService,
      }),
      [dataService, fieldFormats, storage, theme, toasts, uiSettings]
    );

    const handleSort = useCallback((nextSort: string[][]) => {
      setSort(nextSort.length === 0 ? DEFAULT_SORT : (nextSort as SortOrder[]));
      setPageIndex(0);
    }, []);

    const handleSetColumns = useCallback((nextColumns: string[]) => {
      setVisibleColumns(nextColumns);
    }, []);

    const handleResize = useCallback((resized: { columnId: string; width: number | undefined }) => {
      setGridSettings((prev) => ({
        ...prev,
        columns: {
          ...prev.columns,
          [resized.columnId]: {
            ...prev.columns?.[resized.columnId],
            width: resized.width,
          },
        },
      }));
    }, []);

    const handlePageChange = useCallback((nextPageIndex: number) => {
      setPageIndex(nextPageIndex);
    }, []);

    const handlePageSizeChange = useCallback((nextPageSize: number) => {
      setPageSize(nextPageSize);
      setPageIndex(0);
    }, []);

    const handleCloseFlyout = useCallback(() => {
      setExpandedDoc(undefined);
    }, []);

    const handleRetry = useCallback(() => {
      void refetch();
    }, [refetch]);

    const renderDocumentView = useCallback(
      (hit: DataTableRecord) => (
        <WorkflowExecutionDetailFlyout hit={hit} onClose={handleCloseFlyout} />
      ),
      [handleCloseFlyout]
    );

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    if (errorMessage) {
      return (
        <EuiEmptyPrompt
          color="danger"
          data-test-subj="workflowExecutionsTableError"
          iconType="error"
          title={
            <h3>
              <FormattedMessage
                id="workflowsManagement.executionsPage.errorTitle"
                defaultMessage="Unable to load executions"
              />
            </h3>
          }
          body={<p>{errorMessage}</p>}
          actions={
            <EuiButtonEmpty onClick={handleRetry} data-test-subj="workflowExecutionsTableRetry">
              <FormattedMessage
                id="workflowsManagement.executionsPage.retry"
                defaultMessage="Try again"
              />
            </EuiButtonEmpty>
          }
        />
      );
    }

    if (loadingState === DataLoadingState.loading && rows.length === 0) {
      return (
        <EuiPanel hasShadow={false} hasBorder data-test-subj="workflowExecutionsTableLoading">
          <EuiSkeletonText lines={5} />
        </EuiPanel>
      );
    }

    if (rows.length === 0) {
      return (
        <EuiPanel hasShadow={false} hasBorder data-test-subj="workflowExecutionsTableEmpty">
          <EuiCallOut
            announceOnMount
            color="primary"
            title={i18n.translate('workflowsManagement.executionsPage.emptyTitle', {
              defaultMessage: 'No executions match your search criteria.',
            })}
          />
        </EuiPanel>
      );
    }

    return (
      <div css={tableContainerCss} data-test-subj="workflowExecutionsTable">
        <div css={gridWrapperCss}>
          <CellActionsProvider getTriggerCompatibleActions={uiActions.getTriggerCompatibleActions}>
            <UnifiedDataTable
              ariaLabelledBy="workflowExecutionsTableLabel"
              canDragAndDropColumns
              columns={visibleColumns}
              consumer="workflows"
              dataView={dataView}
              expandedDoc={expandedDoc}
              gridStyleOverride={gridStyleOverride}
              isPaginationEnabled={false}
              isSortEnabled
              loadingState={loadingState}
              onResize={handleResize}
              onSetColumns={handleSetColumns}
              onSort={handleSort}
              renderDocumentView={renderDocumentView}
              rows={rows}
              sampleSizeState={rows.length}
              services={services}
              setExpandedDoc={setExpandedDoc}
              settings={gridSettings}
              showColumnTokens
              showTimeCol
              sort={sort}
              totalHits={total}
            />
          </CellActionsProvider>
        </div>
        <EuiTablePagination
          activePage={pageIndex}
          itemsPerPage={pageSize}
          itemsPerPageOptions={PAGE_SIZE_OPTIONS}
          onChangeItemsPerPage={handlePageSizeChange}
          onChangePage={handlePageChange}
          pageCount={totalPages}
          showPerPageOptions
        />
      </div>
    );
  }
);
WorkflowExecutionsTable.displayName = 'WorkflowExecutionsTable';
