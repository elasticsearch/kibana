/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApmTransactionDocumentType } from '@kbn/apm-types';
import type { RollupInterval } from '@kbn/apm-types';
import type { APMConfig } from '../../..';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import { withApmSpan } from '../../../utils/with_apm_span';
import { getMemoryChartData } from '../by_agent/shared/memory';
import { getColdStartCountChart } from './get_cold_start_count_chart';
import { getColdStartDurationChart } from './get_cold_start_duration_chart';
import { getComputeUsageChart } from './get_compute_usage_chart';
import { getServerlessFunctionLatencyChart } from './get_serverless_function_latency_chart';

export function getServerlessAgentMetricsCharts({
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
}) {
  return withApmSpan('get_serverless_agent_metric_charts', async () => {
    const options = {
      environment,
      kuery,
      apmEventClient,
      config,
      serviceName,
      start,
      end,
      serverlessId,
    };
    return await Promise.all([
      getServerlessFunctionLatencyChart({
        ...options,
        documentType,
        rollupInterval,
        bucketSizeInSeconds,
      }),
      getMemoryChartData(options),
      getColdStartDurationChart(options),
      getColdStartCountChart(options),
      getComputeUsageChart(options),
    ]);
  });
}
