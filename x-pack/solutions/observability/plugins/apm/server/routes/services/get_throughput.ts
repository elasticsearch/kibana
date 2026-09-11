/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { BoolQuery } from '@kbn/es-query';
import { kqlQuery, rangeQuery, termQuery } from '@kbn/observability-plugin/server';
import type { ServiceThroughputResponse } from '@kbn/apm-api-shared';
import type { ApmServiceTransactionDocumentType } from '@kbn/apm-types';
import type { RollupInterval } from '@kbn/apm-types';
import { SERVICE_NAME, TRANSACTION_NAME, TRANSACTION_TYPE } from '../../../common/es_fields/apm';
import { environmentQuery } from '../../../common/utils/environment_query';
import { getOffsetInMs } from '../../../common/utils/get_offset_in_ms';
import type { APMEventClient } from '../../lib/helpers/create_es_client/create_apm_event_client';
import { nullifyEmptyRedMetricPoints } from '../../../common/utils/red_metric_value_for_histogram_bucket';

interface Options {
  environment: string;
  kuery: string;
  filters?: BoolQuery;
  serviceName: string;
  apmEventClient: APMEventClient;
  transactionType?: string;
  transactionName?: string;
  start: number;
  end: number;
  offset?: string;
  documentType: ApmServiceTransactionDocumentType;
  rollupInterval: RollupInterval;
  bucketSizeInSeconds: number;
}

export async function getThroughput({
  environment,
  kuery,
  filters,
  serviceName,
  apmEventClient,
  transactionType,
  transactionName,
  start,
  end,
  offset,
  documentType,
  rollupInterval,
  bucketSizeInSeconds,
}: Options): Promise<ServiceThroughputResponse> {
  const { startWithOffset, endWithOffset } = getOffsetInMs({
    start,
    end,
    offset,
  });

  const params = {
    apm: {
      sources: [{ documentType, rollupInterval }],
    },
    track_total_hits: false,
    size: 0,
    query: {
      bool: {
        filter: [
          { term: { [SERVICE_NAME]: serviceName } },
          ...termQuery(TRANSACTION_TYPE, transactionType),
          ...rangeQuery(startWithOffset, endWithOffset),
          ...environmentQuery(environment),
          ...kqlQuery(kuery),
          ...termQuery(TRANSACTION_NAME, transactionName),
          ...(filters?.filter ?? []),
        ],
        must_not: [...(filters?.must_not ?? [])],
      },
    },
    aggs: {
      timeseries: {
        date_histogram: {
          field: '@timestamp',
          fixed_interval: `${bucketSizeInSeconds}s`,
          min_doc_count: 0,
          extended_bounds: { min: startWithOffset, max: endWithOffset },
        },
        aggs: {
          throughput: {
            rate: { unit: 'minute' as const },
          },
        },
      },
    },
  };

  const response = await apmEventClient.search('get_throughput_for_service', params);

  return nullifyEmptyRedMetricPoints(
    response.aggregations?.timeseries.buckets.map((bucket) => ({
      x: bucket.key,
      docCount: bucket.doc_count,
      y: bucket.throughput.value,
    })) ?? []
  );
}
