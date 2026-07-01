/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import { esql, type ComposerQuery } from '@elastic/esql';
import { i18n } from '@kbn/i18n';
import type { LensConfig, LensSeriesLayer } from '@kbn/lens-embeddable-utils';
import {
  EVENT_OUTCOME,
  METRIC_CGROUP_MEMORY_LIMIT_BYTES,
  METRIC_CGROUP_MEMORY_USAGE_BYTES,
  METRIC_SYSTEM_CPU_PERCENT,
  METRIC_SYSTEM_FREE_MEMORY,
  METRIC_SYSTEM_TOTAL_MEMORY,
  PROCESSOR_EVENT,
  SERVICE_ENVIRONMENT,
  SERVICE_NAME,
  TRANSACTION_DURATION,
  TRANSACTION_TYPE,
} from '../../../../../common/es_fields/apm';
import {
  ENVIRONMENT_ALL,
  ENVIRONMENT_NOT_DEFINED,
} from '../../../../../common/environment_filter_values';
import { LatencyAggregationType } from '../../../../../common/latency_aggregation_types';
import { ChartType, getTimeSeriesColor } from '../../charts/helper/get_timeseries_color';

type FlyoutLensChartProcessorEvent = 'transaction' | 'metric';

interface FlyoutLensChartConfigDefinition {
  id: string;
  title: string;
  titleAction?: ReactNode;
  config?: LensConfig;
}

type LensYAxis = LensSeriesLayer['yAxis'][number];

const TIME_BUCKET_FIELD = 'timestamp';
const TIME_BUCKET_BY = `${TIME_BUCKET_FIELD} = TBUCKET(100)`;

// When no limit is specified in the container, docker allows the app as much memory / swap memory
// as it wants. This number represents the max possible value for the limit field. Stored as a
// string to avoid JS floating-point precision loss. The equivalent Painless constant lives at:
// https://github.com/elastic/kibana/blob/main/x-pack/solutions/observability/plugins/apm/server/routes/metrics/by_agent/shared/memory/index.ts#L87
const CGROUP_LIMIT_MAX_VALUE = '9223372036854771712';

interface ServiceScope {
  serviceName: string;
  environment: string;
  transactionType?: string;
  kuery?: string;
}

function createBaseServiceQuery({
  indexes,
  processorEvent,
  scope,
}: {
  indexes: string;
  processorEvent: FlyoutLensChartProcessorEvent;
  scope: ServiceScope;
}): ComposerQuery {
  const { serviceName, environment, kuery, transactionType } = scope;

  const query = esql.from(indexes).where`${esql.col(PROCESSOR_EVENT)} == ${processorEvent}`
    .where`${esql.col(SERVICE_NAME)} == ${serviceName}`;

  if (transactionType) {
    query.where`${esql.col(TRANSACTION_TYPE)} == ${transactionType}`;
  }

  // ENVIRONMENT_NOT_DEFINED is a sentinel pushed into the environments list when documents with no
  // service.environment field exist: https://github.com/elastic/kibana/blob/main/x-pack/solutions/observability/plugins/apm/server/routes/environments/get_environments.ts
  // This ES|QL clause mirrors the DSL equivalent in: https://github.com/elastic/kibana/blob/main/x-pack/solutions/observability/plugins/apm/common/utils/environment_query.ts
  if (environment === ENVIRONMENT_NOT_DEFINED.value) {
    query.where`${esql.col(SERVICE_ENVIRONMENT)} == ${ENVIRONMENT_NOT_DEFINED.value} OR ${esql.col(
      SERVICE_ENVIRONMENT
    )} IS NULL`;
  } else if (environment !== ENVIRONMENT_ALL.value) {
    query.where`${esql.col(SERVICE_ENVIRONMENT)} == ${environment}`;
  }

  if (kuery) {
    query.where`KQL(${kuery})`;
  }

  return query;
}

function printQuery(query: ComposerQuery): string {
  return `${query.print('basic')}`;
}

const seriesColor = (chartType: ChartType) => getTimeSeriesColor(chartType).currentPeriodColor;

type LensYBounds = Extract<LensConfig, { chartType: 'xy' }>['yBounds'];

function buildChartDefinition({
  id,
  title,
  titleAction,
  indexes,
  buildQuery,
  yAxis,
  yBounds,
}: {
  id: string;
  title: string;
  titleAction?: ReactNode;
  indexes: string | undefined;
  buildQuery: (indexes: string) => ComposerQuery;
  yAxis: LensYAxis[];
  yBounds?: LensYBounds;
}): FlyoutLensChartConfigDefinition {
  if (!indexes) {
    return { id, title, titleAction };
  }

  const config: LensConfig = {
    chartType: 'xy',
    title,
    dataset: { esql: printQuery(buildQuery(indexes)) },
    layers: [
      {
        type: 'series',
        seriesType: 'line',
        xAxis: { field: TIME_BUCKET_FIELD, type: 'dateHistogram' },
        yAxis,
      },
    ],
    legend: { show: false },
    fittingFunction: 'Linear',
    axisTitleVisibility: {
      showXAxisTitle: false,
      showYAxisTitle: false,
      showYRightAxisTitle: false,
    },
    ...(yBounds ? { yBounds } : {}),
  };

  return { id, title, titleAction, config };
}

interface LatencyAggregationConfig {
  label: string;
  aggregation: string;
}

function getLatencyAggregationConfig(
  latencyAggregationType: LatencyAggregationType
): LatencyAggregationConfig {
  switch (latencyAggregationType) {
    case LatencyAggregationType.p95:
      return {
        label: i18n.translate('xpack.apm.serviceFlyout.latency95thSeriesLabel', {
          defaultMessage: '95th percentile',
        }),
        aggregation: 'PERCENTILE(duration_ms, 95)',
      };
    case LatencyAggregationType.p99:
      return {
        label: i18n.translate('xpack.apm.serviceFlyout.latency99thSeriesLabel', {
          defaultMessage: '99th percentile',
        }),
        aggregation: 'PERCENTILE(duration_ms, 99)',
      };
    case LatencyAggregationType.avg:
    default:
      return {
        label: i18n.translate('xpack.apm.serviceFlyout.latencyAverageSeriesLabel', {
          defaultMessage: 'Average latency',
        }),
        aggregation: 'AVG(duration_ms)',
      };
  }
}

export function getLatencyChartType(latencyAggregationType: LatencyAggregationType): ChartType {
  switch (latencyAggregationType) {
    case LatencyAggregationType.p95:
      return ChartType.LATENCY_P95;
    case LatencyAggregationType.p99:
      return ChartType.LATENCY_P99;
    case LatencyAggregationType.avg:
    default:
      return ChartType.LATENCY_AVG;
  }
}

function getLatencyChart(
  indexes: string | undefined,
  scope: ServiceScope,
  latencyAggregationType: LatencyAggregationType,
  titleAction?: ReactNode
): FlyoutLensChartConfigDefinition {
  const { label, aggregation } = getLatencyAggregationConfig(latencyAggregationType);

  return buildChartDefinition({
    id: 'latency',
    title: i18n.translate('xpack.apm.serviceFlyout.latencyChartTitle', {
      defaultMessage: 'Latency',
    }),
    titleAction,
    indexes,
    buildQuery: (idx) => {
      const query = createBaseServiceQuery({ indexes: idx, processorEvent: 'transaction', scope });
      query.pipe(`EVAL duration_ms = TO_DOUBLE(${TRANSACTION_DURATION}) / 1000`);
      query.pipe(`STATS ${aggregation} BY ${TIME_BUCKET_BY}`);
      return query;
    },
    yAxis: [
      {
        label,
        value: aggregation,
        format: 'number',
        decimals: 0,
        suffix: ' ms',
        seriesColor: seriesColor(getLatencyChartType(latencyAggregationType)),
      },
    ],
  });
}

function getThroughputChart(
  indexes: string | undefined,
  scope: ServiceScope
): FlyoutLensChartConfigDefinition {
  return buildChartDefinition({
    id: 'throughput',
    title: i18n.translate('xpack.apm.serviceFlyout.throughputChartTitle', {
      defaultMessage: 'Throughput',
    }),
    indexes,
    buildQuery: (idx) => {
      const query = createBaseServiceQuery({ indexes: idx, processorEvent: 'transaction', scope });
      query.pipe(`STATS COUNT(*) BY ${TIME_BUCKET_BY}`);
      return query;
    },
    yAxis: [
      {
        label: i18n.translate('xpack.apm.serviceFlyout.throughputSeriesLabel', {
          defaultMessage: 'Throughput',
        }),
        value: 'COUNT(*)',
        format: 'number',
        decimals: 0,
        seriesColor: seriesColor(ChartType.THROUGHPUT),
      },
    ],
  });
}

function getFailedTransactionRateChart(
  indexes: string | undefined,
  scope: ServiceScope
): FlyoutLensChartConfigDefinition {
  const title = i18n.translate('xpack.apm.serviceFlyout.failedTransactionRateChartTitle', {
    defaultMessage: 'Failed transaction rate',
  });

  return buildChartDefinition({
    id: 'failedTransactionRate',
    title,
    indexes,
    buildQuery: (idx) => {
      const query = createBaseServiceQuery({ indexes: idx, processorEvent: 'transaction', scope });
      query.pipe(
        `STATS failure = COUNT(*) WHERE TO_STRING(${EVENT_OUTCOME}) == "failure", all = COUNT(*) WHERE TO_STRING(${EVENT_OUTCOME}) IN ("failure", "success") BY ${TIME_BUCKET_BY}`
      );
      query.pipe('EVAL failed_transaction_rate = CASE(all > 0, TO_DOUBLE(failure) / all, null)');
      query.pipe('KEEP timestamp, failed_transaction_rate');
      query.pipe('SORT timestamp');
      return query;
    },
    yBounds: { mode: 'custom', lowerBound: 0, upperBound: 1 },
    yAxis: [
      {
        label: title,
        value: 'failed_transaction_rate',
        format: 'percent',
        decimals: 1,
        seriesColor: seriesColor(ChartType.FAILED_TRANSACTION_RATE),
      },
    ],
  });
}

function getCpuUsageChart(
  indexes: string | undefined,
  scope: ServiceScope
): FlyoutLensChartConfigDefinition {
  const cpuUsage = `AVG(TO_DOUBLE(${METRIC_SYSTEM_CPU_PERCENT}))`;
  const title = i18n.translate('xpack.apm.serviceFlyout.cpuUsageChartTitle', {
    defaultMessage: 'CPU usage',
  });

  return buildChartDefinition({
    id: 'cpuUsage',
    title,
    indexes,
    buildQuery: (idx) => {
      const query = createBaseServiceQuery({ indexes: idx, processorEvent: 'metric', scope });
      query.pipe(`WHERE TO_DOUBLE(${METRIC_SYSTEM_CPU_PERCENT}) IS NOT NULL`);
      query.pipe(`STATS ${cpuUsage} BY ${TIME_BUCKET_BY}`);
      return query;
    },
    yBounds: { mode: 'custom', lowerBound: 0, upperBound: 1 },
    yAxis: [
      {
        label: title,
        value: cpuUsage,
        format: 'percent',
        decimals: 1,
        seriesColor: seriesColor(ChartType.CPU_USAGE),
      },
    ],
  });
}

function getMemoryUsageChart(
  indexes: string | undefined,
  scope: ServiceScope
): FlyoutLensChartConfigDefinition {
  const title = i18n.translate('xpack.apm.serviceFlyout.memoryUsageChartTitle', {
    defaultMessage: 'Memory usage',
  });

  return buildChartDefinition({
    id: 'memoryUsage',
    title,
    indexes,
    buildQuery: (idx) => {
      const query = createBaseServiceQuery({ indexes: idx, processorEvent: 'metric', scope });
      query.pipe(`EVAL cgroup_usage = TO_DOUBLE(${METRIC_CGROUP_MEMORY_USAGE_BYTES})`);
      query.pipe(`EVAL cgroup_limit = TO_DOUBLE(${METRIC_CGROUP_MEMORY_LIMIT_BYTES})`);
      query.pipe(`EVAL sys_free = TO_DOUBLE(${METRIC_SYSTEM_FREE_MEMORY})`);
      query.pipe(`EVAL sys_total = TO_DOUBLE(${METRIC_SYSTEM_TOTAL_MEMORY})`);
      query.pipe(
        'WHERE cgroup_usage IS NOT NULL OR (sys_free IS NOT NULL AND sys_total IS NOT NULL)'
      );
      query.pipe(
        `EVAL effective_total = CASE(cgroup_limit > 0 AND cgroup_limit != ${CGROUP_LIMIT_MAX_VALUE}, cgroup_limit, sys_total)`
      );
      query.pipe(
        'EVAL memory_usage = CASE(cgroup_usage IS NOT NULL AND effective_total > 0, cgroup_usage / effective_total, sys_total > 0 AND sys_free IS NOT NULL, 1 - sys_free / sys_total, NULL)'
      );
      query.pipe(`STATS memory_usage = AVG(memory_usage) BY ${TIME_BUCKET_BY}`);
      query.pipe('KEEP timestamp, memory_usage');
      query.pipe('SORT timestamp');
      return query;
    },
    yBounds: { mode: 'custom', lowerBound: 0, upperBound: 1 },
    yAxis: [
      {
        label: title,
        value: 'memory_usage',
        format: 'percent',
        decimals: 1,
        seriesColor: seriesColor(ChartType.MEMORY_USAGE),
      },
    ],
  });
}

export function getChartDefinitions({
  indexes,
  serviceName,
  environment,
  kuery,
  transactionType,
  latencyAggregationType,
  latencyTitleAction,
}: {
  indexes: string | undefined;
  serviceName: string;
  environment: string;
  kuery: string;
  transactionType: string;
  latencyAggregationType: LatencyAggregationType;
  latencyTitleAction?: ReactNode;
}): {
  keyMetrics: FlyoutLensChartConfigDefinition[];
  infrastructureMetrics: FlyoutLensChartConfigDefinition[];
} {
  const scope: ServiceScope = { serviceName, environment, kuery, transactionType };
  const metricScope: ServiceScope = { serviceName, environment, kuery };

  return {
    keyMetrics: [
      getLatencyChart(indexes, scope, latencyAggregationType, latencyTitleAction),
      getThroughputChart(indexes, scope),
      getFailedTransactionRateChart(indexes, scope),
    ],
    infrastructureMetrics: [
      getCpuUsageChart(indexes, metricScope),
      getMemoryUsageChart(indexes, metricScope),
    ],
  };
}
