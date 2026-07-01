/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiLoadingChart, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { isNumber } from 'lodash';
import React, { useMemo } from 'react';
import { asDuration, asPercent, asTransactionRate } from '../../../../../common/utils/formatters';
import type { Coordinate } from '../../../../../typings/timeseries';
import { SparkPlot } from '../../../shared/charts/spark_plot';
import { ChartType, getTimeSeriesColor } from '../../../shared/charts/helper/get_timeseries_color';
import type { APIReturnType } from '../../../../services/rest/create_call_apm_api';

type DependencyNodeReturn = APIReturnType<'GET /internal/apm/service-map/dependency'>;

function LoadingSpinner() {
  return (
    <EuiFlexGroup alignItems="center" justifyContent="spaceAround" style={{ height: 170 }}>
      <EuiLoadingChart size="xl" />
    </EuiFlexGroup>
  );
}

function NoDataMessage() {
  return (
    <EuiText color="subdued">
      {i18n.translate('xpack.apm.serviceMap.popover.noDataText', {
        defaultMessage: `No data for selected environment. Try switching to another environment.`,
      })}
    </EuiText>
  );
}

interface StatsListProps {
  isLoading: boolean;
  data: Partial<DependencyNodeReturn>;
}

interface Item {
  title: string;
  valueLabel: string | null;
  timeseries?: Coordinate[];
  previousPeriodTimeseries?: Coordinate[];
  color: string;
  comparisonSeriesColor: string;
}

export function StatsList({ data, isLoading }: StatsListProps) {
  const { currentPeriod = {}, previousPeriod } = data;
  const { cpuUsage, failedTransactionsRate, memoryUsage, transactionStats } = currentPeriod;

  const hasData = [
    cpuUsage?.value,
    failedTransactionsRate?.value,
    memoryUsage?.value,
    transactionStats?.throughput?.value,
    transactionStats?.latency?.value,
  ].some((stat) => isNumber(stat));

  const items: Item[] = useMemo(
    () => [
      {
        title: i18n.translate('xpack.apm.serviceMap.avgTransDurationPopoverStat', {
          defaultMessage: 'Latency (avg.)',
        }),
        valueLabel: asDuration(currentPeriod?.transactionStats?.latency?.value),
        timeseries: currentPeriod?.transactionStats?.latency?.timeseries,
        previousPeriodTimeseries: previousPeriod?.transactionStats?.latency?.timeseries,
        color: getTimeSeriesColor(ChartType.LATENCY_AVG).currentPeriodColor,
        comparisonSeriesColor: getTimeSeriesColor(ChartType.LATENCY_AVG).previousPeriodColor,
      },
      {
        title: i18n.translate('xpack.apm.serviceMap.avgReqPerMinutePopoverMetric', {
          defaultMessage: 'Throughput (avg.)',
        }),
        valueLabel: asTransactionRate(currentPeriod?.transactionStats?.throughput?.value),
        timeseries: currentPeriod?.transactionStats?.throughput?.timeseries,
        previousPeriodTimeseries: previousPeriod?.transactionStats?.throughput?.timeseries,
        color: getTimeSeriesColor(ChartType.THROUGHPUT).currentPeriodColor,
        comparisonSeriesColor: getTimeSeriesColor(ChartType.THROUGHPUT).previousPeriodColor,
      },
      {
        title: i18n.translate('xpack.apm.serviceMap.errorRatePopoverStat', {
          defaultMessage: 'Failed transaction rate (avg.)',
        }),
        valueLabel: asPercent(currentPeriod?.failedTransactionsRate?.value, 1, ''),
        timeseries: currentPeriod?.failedTransactionsRate?.timeseries,
        previousPeriodTimeseries: previousPeriod?.failedTransactionsRate?.timeseries,
        color: getTimeSeriesColor(ChartType.FAILED_TRANSACTION_RATE).currentPeriodColor,
        comparisonSeriesColor: getTimeSeriesColor(ChartType.FAILED_TRANSACTION_RATE)
          .previousPeriodColor,
      },
      {
        title: i18n.translate('xpack.apm.serviceMap.avgCpuUsagePopoverStat', {
          defaultMessage: 'CPU usage (avg.)',
        }),
        valueLabel: asPercent(currentPeriod?.cpuUsage?.value, 1, ''),
        timeseries: currentPeriod?.cpuUsage?.timeseries,
        previousPeriodTimeseries: previousPeriod?.cpuUsage?.timeseries,
        color: getTimeSeriesColor(ChartType.CPU_USAGE).currentPeriodColor,
        comparisonSeriesColor: getTimeSeriesColor(ChartType.CPU_USAGE).previousPeriodColor,
      },
      {
        title: i18n.translate('xpack.apm.serviceMap.avgMemoryUsagePopoverStat', {
          defaultMessage: 'Memory usage (avg.)',
        }),
        valueLabel: asPercent(currentPeriod?.memoryUsage?.value, 1, ''),
        timeseries: currentPeriod?.memoryUsage?.timeseries,
        previousPeriodTimeseries: previousPeriod?.memoryUsage?.timeseries,
        color: getTimeSeriesColor(ChartType.MEMORY_USAGE).currentPeriodColor,
        comparisonSeriesColor: getTimeSeriesColor(ChartType.MEMORY_USAGE).previousPeriodColor,
      },
    ],
    [currentPeriod, previousPeriod]
  );

  if (isLoading && !hasData) {
    return <LoadingSpinner />;
  }

  if (!hasData) {
    return <NoDataMessage />;
  }

  return (
    <EuiFlexGroup direction="column" responsive={false} gutterSize="m">
      {items.map(
        ({
          title,
          valueLabel,
          timeseries,
          color,
          previousPeriodTimeseries,
          comparisonSeriesColor,
        }) => {
          if (!valueLabel) {
            return null;
          }
          return (
            <EuiFlexItem key={title}>
              <EuiFlexGroup gutterSize="none" responsive={false}>
                <EuiFlexItem
                  style={{
                    display: 'flex',
                    justifyContent: 'end',
                  }}
                >
                  <EuiText color="subdued" size="s">
                    {title}
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  {timeseries ? (
                    <SparkPlot
                      isLoading={isLoading}
                      series={timeseries}
                      color={color}
                      valueLabel={valueLabel}
                      comparisonSeries={previousPeriodTimeseries}
                      comparisonSeriesColor={comparisonSeriesColor}
                    />
                  ) : (
                    <div>{valueLabel}</div>
                  )}
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          );
        }
      )}
    </EuiFlexGroup>
  );
}
