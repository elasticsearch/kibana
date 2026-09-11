/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { termQuery } from '@kbn/observability-plugin/server';
import { isEmpty } from 'lodash';
import type { GenericMetricsChart } from '@kbn/apm-api-shared';
import type { ApmTransactionDocumentType } from '@kbn/apm-types';
import type { RollupInterval } from '@kbn/apm-types';
import type { APMConfig } from '../../..';
import { FAAS_BILLED_DURATION, FAAS_ID, METRICSET_NAME } from '../../../../common/es_fields/apm';
import { LatencyAggregationType } from '../../../../common/latency_aggregation_types';
import { isFiniteNumber } from '../../../../common/utils/is_finite_number';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import { getLatencyTimeseries } from '../../transactions/get_latency_charts';
import { fetchAndTransformMetrics } from '../fetch_and_transform_metrics';
import type { ChartBase } from '../types';

const billedDurationAvg = {
  title: i18n.translate('xpack.apm.agentMetrics.serverless.billedDurationAvg', {
    defaultMessage: 'Billed Duration',
  }),
};

const chartBase: ChartBase = {
  title: i18n.translate('xpack.apm.agentMetrics.serverless.avgDuration', {
    defaultMessage: 'Lambda Duration',
  }),
  key: 'avg_duration',
  type: 'linemark',
  yUnit: 'time',
  series: {},
  description: i18n.translate('xpack.apm.agentMetrics.serverless.avgDuration.description', {
    defaultMessage:
      'Transaction duration is the time spent processing and responding to a request. If the request is queued it will not be contribute to the transaction duration but will contribute the overall billed duration',
  }),
};

async function getServerlessLatencySeries({
  environment,
  kuery,
  apmEventClient,
  serviceName,
  start,
  end,
  serverlessId,
  documentType,
  rollupInterval,
  bucketSizeInSeconds,
}: {
  environment: string;
  kuery: string;
  apmEventClient: APMEventClient;
  serviceName: string;
  start: number;
  end: number;
  serverlessId?: string;
  documentType: ApmTransactionDocumentType;
  rollupInterval: RollupInterval;
  bucketSizeInSeconds: number;
}): Promise<GenericMetricsChart['series']> {
  const transactionLatency = await getLatencyTimeseries({
    environment,
    kuery,
    serviceName,
    apmEventClient,
    latencyAggregationType: LatencyAggregationType.avg,
    start,
    end,
    serverlessId,
    documentType,
    rollupInterval,
    bucketSizeInSeconds,
  });

  return [
    {
      title: i18n.translate('xpack.apm.agentMetrics.serverless.transactionDuration', {
        defaultMessage: 'Transaction Duration',
      }),
      key: 'transaction_duration',
      type: 'linemark',
      overallValue: transactionLatency.overallAvgDuration ?? 0,
      data: transactionLatency.latencyTimeseries,
    },
  ];
}

export async function getServerlessFunctionLatencyChart({
  environment,
  kuery,
  config,
  apmEventClient,
  serviceName,
  start,
  end,
  serverlessId,
  documentType,
  rollupInterval,
  bucketSizeInSeconds,
}: {
  environment: string;
  kuery: string;
  config: APMConfig;
  apmEventClient: APMEventClient;
  serviceName: string;
  start: number;
  end: number;
  serverlessId?: string;
  documentType: ApmTransactionDocumentType;
  rollupInterval: RollupInterval;
  bucketSizeInSeconds: number;
}): Promise<GenericMetricsChart> {
  const options = {
    environment,
    kuery,
    config,
    apmEventClient,
    serviceName,
    start,
    end,
  };

  const [billedDurationMetrics, serverlessDurationSeries] = await Promise.all([
    fetchAndTransformMetrics({
      ...options,
      chartBase: { ...chartBase, series: { billedDurationAvg } },
      aggs: {
        billedDurationAvg: { avg: { field: FAAS_BILLED_DURATION } },
      },
      additionalFilters: [
        { exists: { field: FAAS_BILLED_DURATION } },
        ...termQuery(FAAS_ID, serverlessId),
        ...termQuery(METRICSET_NAME, 'app'),
      ],
      operationName: 'get_billed_duration',
    }),
    getServerlessLatencySeries({
      ...options,
      serverlessId,
      documentType,
      rollupInterval,
      bucketSizeInSeconds,
    }),
  ]);

  const series = [];

  const [billedDurationSeries] = billedDurationMetrics.series;
  if (billedDurationSeries) {
    const data = billedDurationSeries.data?.map(({ x, y }) => ({
      x,
      // Billed duration is stored in ms, convert it to microseconds so it uses the same unit as the other chart
      y: isFiniteNumber(y) ? y * 1000 : y,
    }));
    series.push({
      ...billedDurationSeries,
      // Billed duration is stored in ms, convert it to microseconds
      overallValue: billedDurationSeries.overallValue * 1000,
      data: data || [],
    });
  }

  if (!isEmpty(serverlessDurationSeries[0].data)) {
    series.push(...serverlessDurationSeries);
  }

  return {
    ...billedDurationMetrics,
    series,
  };
}
