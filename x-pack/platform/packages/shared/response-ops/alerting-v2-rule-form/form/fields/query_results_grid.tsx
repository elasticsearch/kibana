/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiCallOut,
  EuiDataGrid,
  type EuiDataGridCellValueElementProps,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import type { PreviewColumn } from '../hooks/use_preview';
import { PreviewChart } from './rule_preview_chart';

const DEFAULT_PAGE_SIZE = 10;

const gridStyles = css`
  .euiDataGridHeaderCell__content {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

export interface QueryResultsGridProps {
  /** Panel title displayed above the grid */
  title: string;
  /** data-test-subj applied to the EuiDataGrid element */
  dataTestSubj: string;
  /** Body text for the empty state (no query configured) */
  emptyBody: string;
  /** Body text for the no-results state (query returned 0 rows) */
  noResultsBody: string;
  /** Columns derived from the ES|QL response */
  columns: PreviewColumn[];
  /** Row data mapped from the ES|QL response values */
  rows: Array<Record<string, string | null>>;
  /** Total row count (before truncation) */
  totalRowCount: number;
  /** Whether the query is currently loading */
  isLoading: boolean;
  /** Whether the query resulted in an error */
  isError: boolean;
  /** Error message, if any */
  error: string | null;
  /** Field names selected as the grouping key */
  groupingFields?: string[];
  /** Number of unique alert groups, or null if no grouping is configured */
  uniqueGroupCount?: number | null;
  /** Whether the current query is syntactically valid (distinguishes "no query" from "valid query with 0 results") */
  hasValidQuery?: boolean;
  /** The assembled ES|QL query string for the chart preview */
  query?: string;
  /** The time field name for the chart bucketing */
  timeField?: string;
  /** The schedule interval string (e.g. '5m', '1h') */
  interval?: string;
  /** The lookback duration string for the chart time range (e.g. '5m', '1h') */
  lookback?: string;
  /** Optional additional DSL filter for the chart (e.g. exception exclusions) */
  additionalFilter?: unknown;
  /** Callback to manually re-run the preview query */
  onRunQuery?: () => void;
}

/**
 * Shared query results grid panel.
 *
 * Renders a titled EuiPanel containing an EuiDataGrid with loading, empty,
 * error, and success states. Annotates grouping columns with a key icon
 * and displays a unique-group-count badge in the footer.
 *
 * Used by both the rule preview and recovery preview components.
 */
export const QueryResultsGrid = ({
  title,
  dataTestSubj,
  emptyBody,
  noResultsBody,
  columns,
  rows,
  totalRowCount,
  isLoading,
  isError,
  error,
  groupingFields = [],
  uniqueGroupCount,
  hasValidQuery = false,
  query,
  timeField,
  interval,
  lookback,
  additionalFilter,
  onRunQuery,
}: QueryResultsGridProps) => {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });

  const onChangeItemsPerPage = useCallback(
    (pageSize: number) => setPagination((prev) => ({ ...prev, pageSize, pageIndex: 0 })),
    []
  );

  const onChangePage = useCallback(
    (pageIndex: number) => setPagination((prev) => ({ ...prev, pageIndex })),
    []
  );

  const groupingFieldSet = useMemo(() => new Set(groupingFields), [groupingFields]);

  // Annotate grouping columns with a key icon in the header
  const annotatedColumns = useMemo(
    () =>
      columns.map((col) => {
        if (!groupingFieldSet.has(col.id)) {
          return col;
        }
        return {
          ...col,
          display: (
            <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiIconTip
                  content={i18n.translate(
                    'xpack.alertingV2.ruleForm.queryResultsGrid.groupKeyTooltip',
                    { defaultMessage: 'Group key field' }
                  )}
                  type="key"
                  size="s"
                  color="primary"
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>{col.displayAsText}</EuiFlexItem>
            </EuiFlexGroup>
          ),
        };
      }),
    [columns, groupingFieldSet]
  );

  // Pin group key columns to the left of the grid
  const visibleColumns = useMemo(() => {
    const groupKeyCols = columns.filter((c) => groupingFieldSet.has(c.id)).map((c) => c.id);
    const otherCols = columns.filter((c) => !groupingFieldSet.has(c.id)).map((c) => c.id);
    return [...groupKeyCols, ...otherCols];
  }, [columns, groupingFieldSet]);

  const renderCellValue = useCallback(
    ({ rowIndex, columnId }: EuiDataGridCellValueElementProps) => {
      const row = rows[rowIndex];
      if (!row) {
        return null;
      }
      const value = row[columnId];
      return value ?? '-';
    },
    [rows]
  );

  const hasQuery = hasValidQuery || columns.length > 0 || rows.length > 0 || isLoading || isError;

  return (
    <EuiPanel hasShadow={false} hasBorder paddingSize="m">
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{title}</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
            {interval && lookback && (
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  {i18n.translate('xpack.alertingV2.ruleForm.queryResultsGrid.timeRangeLabel', {
                    defaultMessage: 'Last {interval} + {lookback}',
                    values: { interval, lookback },
                  })}
                </EuiText>
              </EuiFlexItem>
            )}
            {onRunQuery && (
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  size="xs"
                  iconType="refresh"
                  onClick={onRunQuery}
                  isLoading={isLoading}
                  disabled={!hasValidQuery}
                  data-test-subj="queryResultsRunQueryButton"
                >
                  {i18n.translate('xpack.alertingV2.ruleForm.queryResultsGrid.runQueryButton', {
                    defaultMessage: 'Run query',
                  })}
                </EuiButtonEmpty>
              </EuiFlexItem>
            )}
            {isLoading && !onRunQuery && (
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="m" />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      {rows.length > 0 && query && timeField && interval && lookback && (
        <>
          <EuiSpacer size="s" />
          <PreviewChart
            query={query}
            timeField={timeField}
            interval={interval}
            lookback={lookback}
            esqlColumns={columns}
            additionalFilter={additionalFilter}
          />
        </>
      )}

      <EuiSpacer size="m" />

      {isError && error && (
        <>
          <EuiCallOut
            announceOnMount
            title={i18n.translate('xpack.alertingV2.ruleForm.queryResultsGrid.errorTitle', {
              defaultMessage: 'Preview failed',
            })}
            color="danger"
            iconType="error"
            size="s"
          >
            <EuiText size="s">{error}</EuiText>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      {!hasQuery && (
        <EuiEmptyPrompt
          iconType="visTable"
          titleSize="xs"
          title={
            <h4>
              {i18n.translate('xpack.alertingV2.ruleForm.queryResultsGrid.emptyTitle', {
                defaultMessage: 'No preview available',
              })}
            </h4>
          }
          body={
            <EuiText size="s" color="subdued">
              {emptyBody}
            </EuiText>
          }
        />
      )}

      {hasQuery && !isError && rows.length === 0 && !isLoading && (
        <EuiEmptyPrompt
          iconType="visTable"
          titleSize="xs"
          title={
            <h4>
              {i18n.translate('xpack.alertingV2.ruleForm.queryResultsGrid.noResultsTitle', {
                defaultMessage: 'No results',
              })}
            </h4>
          }
          body={
            <EuiText size="s" color="subdued">
              {noResultsBody}
            </EuiText>
          }
        />
      )}

      {rows.length > 0 && (
        <>
          <EuiPanel paddingSize="none" hasShadow={false} hasBorder css={{ overflow: 'hidden' }}>
            <EuiDataGrid
              css={gridStyles}
              aria-label={title}
              data-test-subj={dataTestSubj}
              columns={annotatedColumns}
              columnVisibility={{
                visibleColumns,
                setVisibleColumns: () => {},
              }}
              rowCount={rows.length}
              gridStyle={{
                border: 'horizontal',
                rowHover: 'none',
              }}
              renderCellValue={renderCellValue}
              pagination={{
                ...pagination,
                onChangeItemsPerPage,
                onChangePage,
              }}
              toolbarVisibility={false}
            />
          </EuiPanel>
          <EuiSpacer size="s" />
          <EuiFlexGroup
            gutterSize="s"
            alignItems="center"
            justifyContent="spaceBetween"
            responsive={false}
            wrap
          >
            <EuiFlexItem grow={false}>
              <EuiText color="subdued" size="xs">
                {totalRowCount > rows.length
                  ? i18n.translate('xpack.alertingV2.ruleForm.queryResultsGrid.truncatedNote', {
                      defaultMessage: 'Showing {displayed} of {total} rows returned by the query.',
                      values: { displayed: rows.length, total: totalRowCount },
                    })
                  : i18n.translate('xpack.alertingV2.ruleForm.queryResultsGrid.rowCountNote', {
                      defaultMessage:
                        'Query returned {count} {count, plural, one {row} other {rows}}.',
                      values: { count: totalRowCount },
                    })}
              </EuiText>
            </EuiFlexItem>
            {uniqueGroupCount != null && (
              <EuiFlexItem grow={false}>
                <EuiBadge color="hollow" iconType="key">
                  {i18n.translate('xpack.alertingV2.ruleForm.queryResultsGrid.uniqueGroupCount', {
                    defaultMessage: '{count} unique {count, plural, one {group} other {groups}}',
                    values: { count: uniqueGroupCount },
                  })}
                </EuiBadge>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </>
      )}
    </EuiPanel>
  );
};
