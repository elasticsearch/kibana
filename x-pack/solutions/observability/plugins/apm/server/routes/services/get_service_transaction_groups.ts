/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { kqlQuery, rangeQuery, wildcardQuery } from '@kbn/observability-plugin/server';
import {
  calculateThroughputWithRange,
  calculateFailedTransactionRate,
  getOutcomeAggregation,
  getDurationFieldForTransactions,
} from '@kbn/apm-data-access-plugin/server/utils';
import type { ApmTransactionDocumentType } from '@kbn/apm-types';
import type { RollupInterval } from '@kbn/apm-types';
import {
  SERVICE_NAME,
  TRANSACTION_NAME,
  TRANSACTION_OVERFLOW_COUNT,
  TRANSACTION_TYPE,
} from '../../../common/es_fields/apm';
import type { LatencyAggregationType } from '../../../common/latency_aggregation_types';
import { environmentQuery } from '../../../common/utils/environment_query';
import type { APMEventClient } from '../../lib/helpers/create_es_client/create_apm_event_client';
import { getLatencyAggregation, getLatencyValue } from '../../lib/helpers/latency_aggregation_type';

const txGroupsDroppedBucketName = '_other';
export const MAX_NUMBER_OF_TX_GROUPS = 1_000;

interface TransactionGroups {
  alertsCount: number;
  name: string;
  transactionType: string;
  latency: number | null;
  throughput: number;
  errorRate: number;
  impact: number;
}

export interface ServiceTransactionGroupsResponse {
  transactionGroups: TransactionGroups[];
  maxCountExceeded: boolean;
  transactionOverflowCount: number;
  hasActiveAlerts: boolean;
}

export async function getServiceTransactionGroups({
  environment,
  kuery,
  serviceName,
  apmEventClient,
  transactionType,
  latencyAggregationType,
  start,
  end,
  documentType,
  rollupInterval,
  useDurationSummary,
  searchQuery,
}: {
  environment: string;
  kuery: string;
  serviceName: string;
  apmEventClient: APMEventClient;
  transactionType: string;
  latencyAggregationType: LatencyAggregationType;
  start: number;
  end: number;
  documentType: ApmTransactionDocumentType;
  rollupInterval: RollupInterval;
  useDurationSummary: boolean;
  searchQuery?: string;
}): Promise<ServiceTransactionGroupsResponse> {
  const field = getDurationFieldForTransactions(documentType, useDurationSummary);

  const response = await apmEventClient.search('get_service_transaction_groups', {
    apm: {
      sources: [
        {
          documentType,
          rollupInterval,
        },
      ],
    },
    track_total_hits: false,
    size: 0,
    query: {
      bool: {
        filter: [
          { term: { [SERVICE_NAME]: serviceName } },
          {
            bool: {
              should: [
                { term: { [TRANSACTION_NAME]: txGroupsDroppedBucketName } },
                { term: { [TRANSACTION_TYPE]: transactionType } },
              ],
            },
          },
          ...rangeQuery(start, end),
          ...environmentQuery(environment),
          ...kqlQuery(kuery),
          ...wildcardQuery(TRANSACTION_NAME, searchQuery),
        ],
      },
    },
    aggs: {
      total_duration: { sum: { field } },
      transaction_overflow_count: {
        sum: {
          field: TRANSACTION_OVERFLOW_COUNT,
        },
      },
      transaction_groups: {
        terms: {
          field: TRANSACTION_NAME,
          size: MAX_NUMBER_OF_TX_GROUPS,
          order: { _count: 'desc' },
        },
        aggs: {
          transaction_group_total_duration: {
            sum: { field },
          },
          ...getLatencyAggregation(latencyAggregationType, field),
          ...getOutcomeAggregation(documentType),
        },
      },
    },
  });

  const totalDuration = response.aggregations?.total_duration.value;

  const transactionGroups =
    response.aggregations?.transaction_groups.buckets.map((bucket) => {
      const errorRate = calculateFailedTransactionRate(bucket);

      const transactionGroupTotalDuration = bucket.transaction_group_total_duration.value || 0;

      return {
        name: bucket.key as string,
        latency: getLatencyValue({
          latencyAggregationType,
          aggregation: bucket.latency,
        }),
        throughput: calculateThroughputWithRange({
          start,
          end,
          value: bucket.doc_count,
        }),
        errorRate,
        impact: totalDuration ? (transactionGroupTotalDuration * 100) / totalDuration : 0,
        alertsCount: 0,
      };
    }) ?? [];

  return {
    transactionGroups: transactionGroups.map((transactionGroup) => ({
      ...transactionGroup,
      transactionType,
    })),
    maxCountExceeded: (response.aggregations?.transaction_groups.sum_other_doc_count ?? 0) > 0,
    transactionOverflowCount: response.aggregations?.transaction_overflow_count.value ?? 0,
    hasActiveAlerts: false,
  };
}
