/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { termQuery } from '@kbn/observability-plugin/server';
import { getOutcomeAggregation } from '@kbn/apm-data-access-plugin/server/utils';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import { TRANSACTION_NAME, TRANSACTION_TYPE } from '../../../../common/es_fields/apm';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import { fetchSeries } from './fetch_timeseries';

export async function getTransactionFailureRate({
  apmEventClient,
  start,
  end,
  intervalString,
  filter,
  transactionType,
  transactionName,
}: {
  apmEventClient: APMEventClient;
  start: number;
  end: number;
  intervalString: string;
  bucketSize: number;
  filter: QueryDslQueryContainer[];
  transactionType?: string;
  transactionName?: string;
}) {
  return (
    await fetchSeries({
      apmEventClient,
      start,
      end,
      operationName: 'assistant_get_transaction_failure_rate',
      unit: '%',
      documentType: ApmDocumentType.TransactionMetric,
      rollupInterval: RollupInterval.OneMinute,
      intervalString,
      filter: [
        ...filter,
        ...termQuery(TRANSACTION_TYPE, transactionType),
        ...termQuery(TRANSACTION_NAME, transactionName),
      ],
      groupByFields: [TRANSACTION_TYPE, TRANSACTION_NAME],
      aggs: {
        ...getOutcomeAggregation(ApmDocumentType.TransactionMetric),
        value: {
          bucket_script: {
            buckets_path: {
              successful_or_failed: 'successful_or_failed>_count',
              successful: 'successful>_count',
            },
            script: '100 * (1 - (params.successful / params.successful_or_failed))',
          },
        },
      },
    })
  ).map((fetchedSerie) => {
    return {
      ...fetchedSerie,
      data: fetchedSerie.data.map((bucket) => {
        return {
          x: bucket.key,
          y: bucket.value?.value as number | null,
        };
      }),
    };
  });
}
