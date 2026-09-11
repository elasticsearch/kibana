/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { kqlQuery, rangeQuery } from '@kbn/observability-plugin/server';
import { keyBy } from 'lodash';
import {
  calculateFailedTransactionRate,
  getOutcomeAggregation,
  getDurationFieldForTransactions,
} from '@kbn/apm-data-access-plugin/server/utils';
import type { ServiceTransactionDetailedStatPeriodsResponse } from '@kbn/apm-api-shared';
import type { ApmServiceTransactionDocumentType } from '@kbn/apm-types';
import type { RollupInterval } from '@kbn/apm-types';
import { calculateThroughputWithInterval } from '../../../lib/helpers/calculate_throughput';
import { SERVICE_NAME, TRANSACTION_TYPE } from '../../../../common/es_fields/apm';
import { isDefaultTransactionType } from '../../../../common/transaction_types';
import { nullifyEmptyRedMetricPoints } from '../../../../common/utils/red_metric_value_for_histogram_bucket';
import { environmentQuery } from '../../../../common/utils/environment_query';
import { getOffsetInMs } from '../../../../common/utils/get_offset_in_ms';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import type { RandomSampler } from '../../../lib/helpers/get_random_sampler';
import { withApmSpan } from '../../../utils/with_apm_span';
import { maybe } from '../../../../common/utils/maybe';

export async function getServiceTransactionDetailedStats({
  serviceNames,
  environment,
  kuery,
  apmEventClient,
  documentType,
  rollupInterval,
  bucketSizeInSeconds,
  offset,
  start,
  end,
  randomSampler,
}: {
  serviceNames: string[];
  environment: string;
  kuery: string;
  apmEventClient: APMEventClient;
  documentType: ApmServiceTransactionDocumentType;
  rollupInterval: RollupInterval;
  bucketSizeInSeconds: number;
  offset?: string;
  start: number;
  end: number;
  randomSampler: RandomSampler;
}) {
  const { offsetInMs, startWithOffset, endWithOffset } = getOffsetInMs({
    start,
    end,
    offset,
  });

  const outcomes = getOutcomeAggregation(documentType);

  const metrics = {
    avg_duration: {
      avg: {
        field: getDurationFieldForTransactions(documentType),
      },
    },
    ...outcomes,
  };

  const response = await apmEventClient.search('get_service_transaction_detail_stats', {
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
          { terms: { [SERVICE_NAME]: serviceNames } },
          ...rangeQuery(startWithOffset, endWithOffset),
          ...environmentQuery(environment),
          ...kqlQuery(kuery),
        ],
      },
    },
    aggs: {
      sample: {
        random_sampler: randomSampler,
        aggs: {
          services: {
            terms: {
              field: SERVICE_NAME,
              size: serviceNames.length,
            },
            aggs: {
              transactionType: {
                terms: {
                  field: TRANSACTION_TYPE,
                },
                aggs: {
                  ...metrics,
                  timeseries: {
                    date_histogram: {
                      field: '@timestamp',
                      fixed_interval: `${bucketSizeInSeconds}s`,
                      min_doc_count: 0,
                      extended_bounds: {
                        min: startWithOffset,
                        max: endWithOffset,
                      },
                    },
                    aggs: metrics,
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return keyBy(
    response.aggregations?.sample.services.buckets.map((bucket) => {
      const topTransactionTypeBucket = maybe(
        bucket.transactionType.buckets.find(({ key }) => isDefaultTransactionType(key as string)) ??
          bucket.transactionType.buckets[0]
      );

      return {
        serviceName: bucket.key as string,
        latency: nullifyEmptyRedMetricPoints(
          topTransactionTypeBucket?.timeseries.buckets.map((dateBucket) => ({
            x: dateBucket.key + offsetInMs,
            docCount: dateBucket.doc_count,
            y: dateBucket.avg_duration.value,
          })) ?? []
        ),
        transactionErrorRate: topTransactionTypeBucket
          ? nullifyEmptyRedMetricPoints(
              topTransactionTypeBucket.timeseries.buckets.map((dateBucket) => ({
                x: dateBucket.key + offsetInMs,
                docCount: dateBucket.doc_count,
                y: calculateFailedTransactionRate(dateBucket),
              }))
            )
          : undefined,
        throughput: nullifyEmptyRedMetricPoints(
          topTransactionTypeBucket?.timeseries.buckets.map((dateBucket) => ({
            x: dateBucket.key + offsetInMs,
            docCount: dateBucket.doc_count,
            y: calculateThroughputWithInterval({
              bucketSize: bucketSizeInSeconds,
              value: dateBucket.doc_count,
            }),
          })) ?? []
        ),
      };
    }) ?? [],
    'serviceName'
  );
}

export async function getServiceTransactionDetailedStatsPeriods({
  serviceNames,
  environment,
  kuery,
  apmEventClient,
  documentType,
  rollupInterval,
  bucketSizeInSeconds,
  offset,
  start,
  end,
  randomSampler,
}: {
  serviceNames: string[];
  environment: string;
  kuery: string;
  apmEventClient: APMEventClient;
  documentType: ApmServiceTransactionDocumentType;
  rollupInterval: RollupInterval;
  bucketSizeInSeconds: number;
  offset?: string;
  start: number;
  end: number;
  randomSampler: RandomSampler;
}): Promise<ServiceTransactionDetailedStatPeriodsResponse> {
  return withApmSpan('get_service_detailed_statistics', async () => {
    const commonProps = {
      serviceNames,
      environment,
      kuery,
      apmEventClient,
      documentType,
      rollupInterval,
      bucketSizeInSeconds,
      start,
      end,
      randomSampler,
    };

    const [currentPeriod, previousPeriod] = await Promise.all([
      getServiceTransactionDetailedStats(commonProps),
      offset
        ? getServiceTransactionDetailedStats({
            ...commonProps,
            offset,
          })
        : Promise.resolve({}),
    ]);

    return { currentPeriod, previousPeriod };
  });
}
