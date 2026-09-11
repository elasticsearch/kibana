/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { kqlQuery, rangeQuery, termQuery } from '@kbn/observability-plugin/server';
import type { Coordinate } from '@kbn/apm-types';
import type { Maybe } from '@kbn/apm-types-shared';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import { offsetPreviousPeriodCoordinates } from '../../../common/utils/offset_previous_period_coordinate';
import { SERVICE_NAME, SESSION_ID, TRANSACTION_NAME } from '../../../common/es_fields/apm';
import { environmentQuery } from '../../../common/utils/environment_query';
import { getOffsetInMs } from '../../../common/utils/get_offset_in_ms';
import type { APMEventClient } from '../../lib/helpers/create_es_client/create_apm_event_client';
import { getBucketSize } from '../../../common/utils/get_bucket_size';

export interface SessionsTimeseries {
  currentPeriod: { timeseries: Coordinate[]; value: Maybe<number> };
  previousPeriod: { timeseries: Coordinate[]; value: Maybe<number> };
}

interface Props {
  apmEventClient: APMEventClient;
  serviceName: string;
  transactionName?: string;
  environment: string;
  start: number;
  end: number;
  kuery: string;
  offset?: string;
}

async function getSessionTimeseries({
  apmEventClient,
  serviceName,
  transactionName,
  environment,
  start,
  end,
  kuery,
  offset,
}: Props) {
  const { startWithOffset, endWithOffset } = getOffsetInMs({
    start,
    end,
    offset,
  });

  const { intervalString } = getBucketSize({
    start: startWithOffset,
    end: endWithOffset,
    minBucketSize: 60,
  });

  const aggs = {
    sessions: {
      cardinality: { field: SESSION_ID },
    },
  };

  const response = await apmEventClient.search('get_mobile_sessions', {
    apm: {
      sources: [
        {
          documentType: ApmDocumentType.TransactionEvent,
          rollupInterval: RollupInterval.None,
        },
      ],
    },
    track_total_hits: false,
    size: 0,
    query: {
      bool: {
        filter: [
          { exists: { field: SESSION_ID } },
          ...termQuery(SERVICE_NAME, serviceName),
          ...termQuery(TRANSACTION_NAME, transactionName),
          ...rangeQuery(startWithOffset, endWithOffset),
          ...environmentQuery(environment),
          ...kqlQuery(kuery),
        ],
      },
    },
    aggs: {
      timeseries: {
        date_histogram: {
          field: '@timestamp',
          fixed_interval: intervalString,
          min_doc_count: 0,
          extended_bounds: { min: startWithOffset, max: endWithOffset },
        },
        aggs,
      },
      ...aggs,
    },
  });

  const timeseries =
    response?.aggregations?.timeseries.buckets.map((bucket) => {
      return {
        x: bucket.key,
        y: bucket.sessions.value,
      };
    }) ?? [];

  return {
    timeseries,
    value: response.aggregations?.sessions?.value,
  };
}

export async function getMobileSessions({
  kuery,
  apmEventClient,
  serviceName,
  transactionName,
  environment,
  start,
  end,
  offset,
}: Props): Promise<SessionsTimeseries> {
  const options = {
    serviceName,
    transactionName,
    apmEventClient,
    kuery,
    environment,
  };

  const currentPeriodPromise = getSessionTimeseries({
    ...options,
    start,
    end,
  });

  const previousPeriodPromise = offset
    ? getSessionTimeseries({
        ...options,
        start,
        end,
        offset,
      })
    : { timeseries: [], value: null };

  const [currentPeriod, previousPeriod] = await Promise.all([
    currentPeriodPromise,
    previousPeriodPromise,
  ]);

  return {
    currentPeriod,
    previousPeriod: {
      timeseries: offsetPreviousPeriodCoordinates({
        currentPeriodTimeseries: currentPeriod.timeseries,
        previousPeriodTimeseries: previousPeriod.timeseries,
      }),
      value: previousPeriod?.value,
    },
  };
}
