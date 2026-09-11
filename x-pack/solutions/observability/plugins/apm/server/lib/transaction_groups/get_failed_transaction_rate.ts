/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { BoolQuery } from '@kbn/es-query';
import { kqlQuery, rangeQuery, termQuery } from '@kbn/observability-plugin/server';
import {
  calculateFailedTransactionRate,
  getOutcomeAggregation,
} from '@kbn/apm-data-access-plugin/server/utils';
import type { ApmServiceTransactionDocumentType } from '@kbn/apm-types';
import type { RollupInterval } from '@kbn/apm-types';
import { getFailedTransactionRateTimeSeries } from '../helpers/transaction_error_rate';
import { SERVICE_NAME, TRANSACTION_NAME, TRANSACTION_TYPE } from '../../../common/es_fields/apm';
import { environmentQuery } from '../../../common/utils/environment_query';
import { getOffsetInMs } from '../../../common/utils/get_offset_in_ms';
import type { Coordinate } from '../../../typings/timeseries';
import type { APMEventClient } from '../helpers/create_es_client/create_apm_event_client';

export async function getFailedTransactionRate({
  environment,
  kuery,
  filters,
  serviceName,
  transactionTypes,
  transactionName,
  apmEventClient,
  start,
  end,
  offset,
  documentType,
  rollupInterval,
  bucketSizeInSeconds,
}: {
  environment: string;
  kuery: string;
  filters?: BoolQuery;
  serviceName: string;
  transactionTypes: string[];
  transactionName?: string;
  apmEventClient: APMEventClient;
  start: number;
  end: number;
  offset?: string;
  documentType: ApmServiceTransactionDocumentType;
  rollupInterval: RollupInterval;
  bucketSizeInSeconds: number;
}): Promise<{
  timeseries: Coordinate[];
  average: number | null;
}> {
  const { startWithOffset, endWithOffset } = getOffsetInMs({
    start,
    end,
    offset,
  });

  const filter = [
    { term: { [SERVICE_NAME]: serviceName } },
    { terms: { [TRANSACTION_TYPE]: transactionTypes } },
    ...termQuery(TRANSACTION_NAME, transactionName),
    ...rangeQuery(startWithOffset, endWithOffset),
    ...environmentQuery(environment),
    ...kqlQuery(kuery),
    ...(filters?.filter || []),
  ];
  const mustNot = filters?.must_not || [];

  const outcomes = getOutcomeAggregation(documentType);

  const params = {
    apm: {
      sources: [{ documentType, rollupInterval }],
    },
    track_total_hits: false,
    size: 0,
    query: { bool: { filter, must_not: mustNot } },
    aggs: {
      ...outcomes,
      timeseries: {
        date_histogram: {
          field: '@timestamp',
          fixed_interval: `${bucketSizeInSeconds}s`,
          min_doc_count: 0,
          extended_bounds: { min: startWithOffset, max: endWithOffset },
        },
        aggs: {
          ...outcomes,
        },
      },
    },
  };

  const resp = await apmEventClient.search('get_transaction_group_error_rate', params);
  if (!resp.aggregations) {
    return { timeseries: [], average: null };
  }

  const timeseries = getFailedTransactionRateTimeSeries(resp.aggregations.timeseries.buckets);
  const average = calculateFailedTransactionRate(resp.aggregations);

  return { timeseries, average };
}
