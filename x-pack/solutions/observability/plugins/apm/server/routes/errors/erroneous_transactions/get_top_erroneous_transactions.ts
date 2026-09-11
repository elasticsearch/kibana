/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { rangeQuery, kqlQuery, termQuery } from '@kbn/observability-plugin/server';
import { keyBy } from 'lodash';
import type { TopErroneousTransactionsResponse } from '@kbn/apm-api-shared';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import {
  ERROR_GROUP_ID,
  SERVICE_NAME,
  TRANSACTION_NAME,
  TRANSACTION_TYPE,
} from '../../../../common/es_fields/apm';
import { environmentQuery } from '../../../../common/utils/environment_query';
import { getBucketSize } from '../../../../common/utils/get_bucket_size';
import { getOffsetInMs } from '../../../../common/utils/get_offset_in_ms';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';

async function getTopErroneousTransactions({
  environment,
  kuery,
  serviceName,
  groupId,
  apmEventClient,
  start,
  end,
  numBuckets,
  offset,
}: {
  environment: string;
  kuery: string;
  serviceName: string;
  groupId: string;
  apmEventClient: APMEventClient;
  start: number;
  end: number;
  numBuckets: number;
  offset?: string;
}) {
  const { startWithOffset, endWithOffset, offsetInMs } = getOffsetInMs({
    start,
    end,
    offset,
  });

  const { intervalString } = getBucketSize({
    start: startWithOffset,
    end: endWithOffset,
    numBuckets,
  });

  const res = await apmEventClient.search('get_top_erroneous_transactions', {
    apm: {
      sources: [
        {
          documentType: ApmDocumentType.ErrorEvent,
          rollupInterval: RollupInterval.None,
        },
      ],
    },
    track_total_hits: false,
    size: 0,
    query: {
      bool: {
        filter: [
          ...termQuery(SERVICE_NAME, serviceName),
          ...termQuery(ERROR_GROUP_ID, groupId),
          ...rangeQuery(startWithOffset, endWithOffset),
          ...environmentQuery(environment),
          ...kqlQuery(kuery),
        ],
      },
    },
    aggs: {
      top_five_transactions: {
        terms: {
          field: TRANSACTION_NAME,
          size: 5,
        },
        aggs: {
          sample: {
            top_hits: {
              size: 1,
              _source: [TRANSACTION_TYPE],
            },
          },
          timeseries: {
            date_histogram: {
              field: '@timestamp',
              fixed_interval: intervalString,
              extended_bounds: {
                min: startWithOffset,
                max: endWithOffset,
              },
            },
          },
        },
      },
    },
  });

  return (
    res.aggregations?.top_five_transactions.buckets.map(
      ({ key, doc_count: docCount, sample, timeseries }) => {
        return {
          transactionName: key as string,
          transactionType: sample.hits.hits[0]._source.transaction?.type,
          occurrences: docCount,
          timeseries: timeseries.buckets.map((timeseriesBucket) => {
            return {
              x: timeseriesBucket.key + offsetInMs,
              y: timeseriesBucket.doc_count,
            };
          }),
        };
      }
    ) ?? []
  );
}

export async function getTopErroneousTransactionsPeriods({
  kuery,
  serviceName,
  apmEventClient,
  numBuckets,
  groupId,
  environment,
  start,
  end,
  offset,
}: {
  kuery: string;
  serviceName: string;
  apmEventClient: APMEventClient;
  numBuckets: number;
  groupId: string;
  environment: string;
  start: number;
  end: number;
  offset?: string;
}): Promise<TopErroneousTransactionsResponse> {
  const [currentPeriod, previousPeriod] = await Promise.all([
    getTopErroneousTransactions({
      environment,
      kuery,
      serviceName,
      apmEventClient,
      numBuckets,
      groupId,
      start,
      end,
    }),
    offset
      ? getTopErroneousTransactions({
          environment,
          kuery,
          serviceName,
          apmEventClient,
          numBuckets,
          groupId,
          start,
          end,
          offset,
        })
      : [],
  ]);

  const previousPeriodByTransactionName = keyBy(previousPeriod, 'transactionName');

  return {
    topErroneousTransactions: currentPeriod.map(
      ({ transactionName, timeseries: currentPeriodTimeseries, ...rest }) => {
        return {
          ...rest,
          transactionName,
          currentPeriodTimeseries,
          previousPeriodTimeseries:
            previousPeriodByTransactionName[transactionName]?.timeseries ?? [],
        };
      }
    ),
  };
}
