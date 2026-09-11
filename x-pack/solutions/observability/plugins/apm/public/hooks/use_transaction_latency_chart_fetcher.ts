/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { ApmDocumentType } from '@kbn/apm-types';
import type { LatencyAggregationType } from '../../common/latency_aggregation_types';
import { isTimeComparison } from '../components/shared/time_comparison/get_comparison_options';
import { useApmServiceContext } from '../context/apm_service/use_apm_service_context';
import { getLatencyChartSelector } from '../selectors/latency_chart_selectors';
import { useAnyOfApmParams } from './use_apm_params';
import { FETCH_STATUS, useFetcher } from './use_fetcher';
import { usePreferredDataSourceAndBucketSize } from './use_preferred_data_source_and_bucket_size';
import { usePreviousPeriodLabel } from './use_previous_period_text';
import { useTimeRange } from './use_time_range';

export function useTransactionLatencyChartsFetcher({
  kuery,
  environment,
  transactionName,
  latencyAggregationType,
}: {
  kuery: string;
  environment: string;
  transactionName: string | null;
  latencyAggregationType: LatencyAggregationType;
}) {
  const { transactionType, serviceName, transactionTypeStatus } = useApmServiceContext();

  const {
    query: { rangeFrom, rangeTo, offset, comparisonEnabled },
  } = useAnyOfApmParams('/services/{serviceName}', '/mobile-services/{serviceName}');
  const { start, end } = useTimeRange({ rangeFrom, rangeTo });

  const preferred = usePreferredDataSourceAndBucketSize({
    kuery,
    numBuckets: 100,
    start,
    end,
    type: transactionName
      ? ApmDocumentType.TransactionMetric
      : ApmDocumentType.ServiceTransactionMetric,
  });

  const shouldUseDurationSummary =
    latencyAggregationType === 'avg' && preferred?.source?.hasDurationSummaryField;

  const { data, error, status } = useFetcher(
    (callApmApi) => {
      if (!transactionType && transactionTypeStatus === FETCH_STATUS.SUCCESS) {
        return Promise.resolve(undefined);
      }

      if (serviceName && start && end && transactionType && latencyAggregationType && preferred) {
        return callApmApi('GET /internal/apm/services/{serviceName}/transactions/charts/latency', {
          params: {
            path: { serviceName },
            query: {
              environment,
              kuery,
              start,
              end,
              transactionType,
              useDurationSummary: !!shouldUseDurationSummary,
              transactionName: transactionName || undefined,
              latencyAggregationType,
              offset: comparisonEnabled && isTimeComparison(offset) ? offset : undefined,
              documentType: preferred.source.documentType,
              rollupInterval: preferred.source.rollupInterval,
              bucketSizeInSeconds: preferred.bucketSizeInSeconds,
            },
          },
        });
      }
    },
    [
      transactionType,
      transactionTypeStatus,
      serviceName,
      start,
      end,
      latencyAggregationType,
      preferred,
      environment,
      kuery,
      shouldUseDurationSummary,
      transactionName,
      comparisonEnabled,
      offset,
    ]
  );

  const previousPeriodLabel = usePreviousPeriodLabel();
  const memoizedData = useMemo(
    () =>
      getLatencyChartSelector({
        latencyChart: data,
        latencyAggregationType,
        previousPeriodLabel,
      }),
    // It should only update when the data has changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data]
  );

  return {
    bucketSizeInSeconds: preferred?.bucketSizeInSeconds,
    start,
    end,
    latencyChartsData: memoizedData,
    latencyChartsStatus: status,
    latencyChartsError: error,
  };
}
