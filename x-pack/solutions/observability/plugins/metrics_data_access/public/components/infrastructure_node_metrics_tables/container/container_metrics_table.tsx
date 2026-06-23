/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  Criteria as EuiCriteria,
  EuiBasicTableColumn,
  EuiTableSortingType,
} from '@elastic/eui';
import { EuiBasicTable, EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React, { useCallback, useMemo } from 'react';
import type { SortState, NodeMetricsTableData } from '../shared';
import {
  AnalyzeMetricButton,
  MetricsNodeDetailsLink,
  MetricsTableEmptyIndicesContent,
  MetricsTableErrorContent,
  MetricsTableLoadingContent,
  MetricsTableNoIndicesContent,
  NumberCell,
  StepwisePagination,
} from '../shared';

import type { ContainerNodeMetricsRow } from './use_container_metrics_table';

export interface ContainerMetricsTableProps {
  data: NodeMetricsTableData<ContainerNodeMetricsRow>;
  isLoading: boolean;
  setCurrentPageIndex: (value: number) => void;
  setSortState: (state: SortState<ContainerNodeMetricsRow>) => void;
  sortState: SortState<ContainerNodeMetricsRow>;
  timerange: {
    from: string;
    to: string;
  };
  isOtel?: boolean;
  metricsIndices?: string;
  isK8sContainer?: boolean;
}

export const ContainerMetricsTable = (props: ContainerMetricsTableProps) => {
  const {
    data,
    isLoading,
    setCurrentPageIndex,
    setSortState,
    sortState,
    timerange,
    isOtel,
    metricsIndices,
    isK8sContainer,
  } = props;

  const columns = useMemo(
    () => containerNodeColumns({ timerange, isOtel, metricsIndices, isK8sContainer }),
    [timerange, isOtel, metricsIndices, isK8sContainer]
  );

  const sortSettings: EuiTableSortingType<ContainerNodeMetricsRow> = {
    enableAllColumns: true,
    sort: sortState,
  };

  const onTableSortChange = useCallback(
    ({ sort }: EuiCriteria<ContainerNodeMetricsRow>) => {
      if (!sort) {
        return;
      }

      setSortState(sort);
      setCurrentPageIndex(0);
    },
    [setSortState, setCurrentPageIndex]
  );

  const rows = data.state === 'data' ? data.rows : undefined;
  const containerIds = useMemo(() => rows?.map((row) => row.id), [rows]);

  if (data.state === 'error') {
    return (
      <>
        {data.errors.map((error) => (
          <MetricsTableErrorContent error={error} />
        ))}
      </>
    );
  } else if (isLoading && data.state !== 'data') {
    return <MetricsTableLoadingContent />;
  } else if (data.state === 'no-indices') {
    return <MetricsTableNoIndicesContent />;
  } else if (data.state === 'empty-indices') {
    return <MetricsTableEmptyIndicesContent />;
  } else if (data.state === 'data') {
    return (
      <>
        <EuiFlexGroup justifyContent="flexEnd">
          <AnalyzeMetricButton
            ids={containerIds ?? []}
            nodeType="container"
            timerange={timerange}
            metricsIndices={metricsIndices}
          />
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <EuiBasicTable
          tableCaption={i18n.translate('xpack.metricsData.metricsTable.container.tableCaption', {
            defaultMessage: 'Infrastructure metrics for containers',
          })}
          items={data.rows}
          columns={columns}
          sorting={sortSettings}
          onChange={onTableSortChange}
          loading={isLoading}
          noItemsMessage={<MetricsTableLoadingContent />}
          data-test-subj="containerMetricsTable"
        />
        <EuiSpacer size="s" />
        <EuiFlexGroup justifyContent="flexEnd" alignItems="center" responsive={false} wrap>
          <EuiFlexItem grow={false}>
            <StepwisePagination
              ariaLabel={i18n.translate(
                'xpack.metricsData.metricsTable.container.paginationAriaLabel',
                {
                  defaultMessage: 'Container metrics pagination',
                }
              )}
              pageCount={data.pageCount}
              currentPageIndex={data.currentPageIndex}
              setCurrentPageIndex={setCurrentPageIndex}
              data-test-subj="containerMetricsTablePagination"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </>
    );
  } else {
    return null;
  }
};

function containerNodeColumns({
  timerange,
  isOtel,
  metricsIndices,
  isK8sContainer,
}: Pick<
  ContainerMetricsTableProps,
  'timerange' | 'isOtel' | 'metricsIndices' | 'isK8sContainer'
>): Array<EuiBasicTableColumn<ContainerNodeMetricsRow>> {
  const memoryUnit = isOtel && !isK8sContainer ? '%' : ' MB';
  return [
    {
      name: i18n.translate('xpack.metricsData.metricsTable.container.idColumnHeader', {
        defaultMessage: 'Id',
      }),
      field: 'id',
      truncateText: true,
      textOnly: true,
      render: (id: string) => {
        return (
          <MetricsNodeDetailsLink
            id={id}
            label={id}
            nodeType={'container'}
            timerange={timerange}
            isOtel={isOtel}
            metricsIndices={metricsIndices}
          />
        );
      },
    },
    {
      name: (
        <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false} wrap={false}>
          <EuiFlexItem grow={false}>
            {i18n.translate(
              'xpack.metricsData.metricsTable.container.averageCpuUsagePercentColumnHeader',
              {
                defaultMessage: 'CPU usage (avg.)',
              }
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
      field: 'averageCpuUsage',
      align: 'right',
      render: (averageCpuUsage: number) => <NumberCell value={averageCpuUsage} unit="%" />,
    },
    {
      name: (
        <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false} wrap={false}>
          <EuiFlexItem grow={false}>
            {i18n.translate(
              'xpack.metricsData.metricsTable.container.averageMemoryUsageColumnHeader',
              {
                defaultMessage: 'Memory usage(avg.)',
              }
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
      field: 'averageMemoryUsage',
      align: 'right',
      render: (averageMemoryUsage: number) => (
        <NumberCell value={averageMemoryUsage} unit={memoryUnit} />
      ),
    },
  ];
}
