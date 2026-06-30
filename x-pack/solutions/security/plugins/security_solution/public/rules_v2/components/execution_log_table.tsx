/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useCallback, useMemo } from 'react';
import type { EuiBasicTableColumn, CriteriaWithPagination } from '@elastic/eui';
import {
  EuiBasicTable,
  EuiFilterButton,
  EuiFilterGroup,
  EuiFilterSelectItem,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiPopover,
  EuiSpacer,
  EuiSuperDatePicker,
  EuiText,
  EuiTextBlockTruncate,
  EuiTitle,
  EuiCallOut,
} from '@elastic/eui';
import type { UnifiedExecutionResult } from '../../../common/api/detection_engine/rule_monitoring';
import { useV2ExecutionResults } from '../hooks/use_v2_execution_results';
import { useBoolState } from '../../common/hooks/use_bool_state';

type V2ExecutionStatus = 'success' | 'warning' | 'failure';

const STATUS_COLOR: Record<string, string> = {
  success: 'success',
  warning: 'warning',
  failure: 'danger',
};

const STATUS_LABEL: Record<string, string> = {
  success: 'Succeeded',
  warning: 'Warning',
  failure: 'Failed',
};

const V2_STATUS_FILTERS: V2ExecutionStatus[] = ['success', 'warning', 'failure'];

const formatDuration = (ms: number | null): string => {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

const columns: Array<EuiBasicTableColumn<UnifiedExecutionResult>> = [
  {
    field: 'outcome.status',
    name: 'Status',
    width: '120px',
    render: (_: unknown, record: UnifiedExecutionResult) => (
      <EuiHealth color={STATUS_COLOR[record.outcome.status] ?? 'subdued'}>
        {STATUS_LABEL[record.outcome.status] ?? record.outcome.status}
      </EuiHealth>
    ),
  },
  {
    field: 'run_type',
    name: 'Run type',
    width: '110px',
    render: () => <EuiText size="s">Scheduled</EuiText>,
  },
  {
    field: 'execution_start',
    name: 'Timestamp',
    sortable: true,
    width: '220px',
    render: (value: string) => <EuiText size="s">{new Date(value).toLocaleString()}</EuiText>,
  },
  {
    field: 'execution_duration_ms',
    name: 'Execution duration',
    sortable: true,
    width: '150px',
    render: (value: number | null) => <EuiText size="s">{formatDuration(value)}</EuiText>,
  },
  {
    field: 'metrics.alert_counts.new',
    name: 'Alerts created',
    width: '120px',
    render: (_: unknown, record: UnifiedExecutionResult) => (
      <EuiText size="s">{record.metrics.alert_counts?.new ?? 0}</EuiText>
    ),
  },
  {
    field: 'outcome.message',
    name: 'Message',
    render: (_: unknown, record: UnifiedExecutionResult) => (
      <EuiTextBlockTruncate lines={2}>{record.outcome.message ?? '—'}</EuiTextBlockTruncate>
    ),
  },
];

interface ExecutionLogTableProps {
  ruleId: string;
}

export const ExecutionLogTable: React.FC<ExecutionLogTableProps> = ({ ruleId }) => {
  const [dateRange, setDateRange] = useState({ start: 'now-2h', end: 'now' });
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [sortField, setSortField] = useState<'execution_start' | 'execution_duration_ms'>(
    'execution_start'
  );
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [statusFilters, setStatusFilters] = useState<V2ExecutionStatus[]>([]);

  const { data, isLoading, isFetching, isError, error, refetch } = useV2ExecutionResults({
    ruleId,
    from: dateRange.start,
    to: dateRange.end,
    outcome: statusFilters.length > 0 ? statusFilters : undefined,
    sortField,
    sortOrder: sortDirection,
    page: pageIndex + 1,
    perPage: pageSize,
  });

  const onTableChange = useCallback(
    ({ page, sort }: CriteriaWithPagination<UnifiedExecutionResult>) => {
      if (page) {
        setPageIndex(page.index);
        setPageSize(page.size);
      }
      if (sort) {
        setSortField(sort.field as 'execution_start' | 'execution_duration_ms');
        setSortDirection(sort.direction);
      }
    },
    []
  );

  const onTimeChange = useCallback(({ start, end }: { start: string; end: string }) => {
    setDateRange({ start, end });
    setPageIndex(0);
  }, []);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
      totalItemCount: data?.total ?? 0,
      pageSizeOptions: [5, 10, 25],
    }),
    [pageIndex, pageSize, data?.total]
  );

  const sorting = useMemo(
    () => ({
      sort: {
        field: sortField,
        direction: sortDirection,
      },
    }),
    [sortField, sortDirection]
  );

  if (isError) {
    return (
      <EuiCallOut title="Failed to load execution results" color="danger" iconType="error">
        {error instanceof Error ? error.message : String(error)}
      </EuiCallOut>
    );
  }

  return (
    <>
      <EuiFlexGroup gutterSize="s" alignItems="center">
        <EuiFlexItem grow>
          <div>
            <EuiTitle size="xs">
              <h3>Execution log</h3>
            </EuiTitle>
            <EuiText size="xs" color="subdued">
              A log of rule execution results
            </EuiText>
          </div>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" alignItems="center">
            <EuiFlexItem grow={false}>
              <StatusFilter selectedItems={statusFilters} onChange={setStatusFilters} />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiSuperDatePicker
                start={dateRange.start}
                end={dateRange.end}
                onTimeChange={onTimeChange}
                onRefresh={onRefresh}
                isLoading={isFetching}
                width="auto"
                data-test-subj="v2ExecutionLogDatePicker"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="s" />

      <EuiBasicTable
        items={data?.data ?? []}
        columns={columns}
        loading={isLoading}
        pagination={pagination}
        sorting={sorting}
        onChange={onTableChange}
        tableCaption="A log of rule execution results"
        data-test-subj="v2ExecutionLogTable"
      />
    </>
  );
};

const StatusFilter: React.FC<{
  selectedItems: V2ExecutionStatus[];
  onChange: (items: V2ExecutionStatus[]) => void;
}> = ({ selectedItems, onChange }) => {
  const [isOpen, , closePopover, togglePopover] = useBoolState();

  const handleItemClick = useCallback(
    (item: V2ExecutionStatus) => {
      const next = selectedItems.includes(item)
        ? selectedItems.filter((i) => i !== item)
        : [...selectedItems, item];
      onChange(next);
    },
    [selectedItems, onChange]
  );

  return (
    <EuiFilterGroup data-test-subj="v2ExecutionStatusFilter">
      <EuiPopover
        button={
          <EuiFilterButton
            iconType="chevronSingleDown"
            grow={false}
            numFilters={V2_STATUS_FILTERS.length}
            numActiveFilters={selectedItems.length}
            hasActiveFilters={selectedItems.length > 0}
            isSelected={isOpen}
            onClick={togglePopover}
            data-test-subj="v2ExecutionStatusFilterButton"
          >
            Status
          </EuiFilterButton>
        }
        isOpen={isOpen}
        closePopover={closePopover}
        panelPaddingSize="none"
        repositionOnScroll
      >
        {V2_STATUS_FILTERS.map((status) => (
          <EuiFilterSelectItem
            key={status}
            checked={selectedItems.includes(status) ? 'on' : undefined}
            onClick={() => handleItemClick(status)}
            data-test-subj={`v2ExecutionStatusFilter-item-${status}`}
          >
            <EuiHealth color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</EuiHealth>
          </EuiFilterSelectItem>
        ))}
      </EuiPopover>
    </EuiFilterGroup>
  );
};
