/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { termQuery, kqlQuery, rangeQuery } from '@kbn/observability-plugin/server';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import { SERVICE_NAME, SESSION_ID } from '../../../common/es_fields/apm';
import { environmentQuery } from '../../../common/utils/environment_query';
import type { APMEventClient } from '../../lib/helpers/create_es_client/create_apm_event_client';
import { getOffsetInMs } from '../../../common/utils/get_offset_in_ms';
import { getBucketSize } from '../../../common/utils/get_bucket_size';

interface Props {
  kuery: string;
  apmEventClient: APMEventClient;
  serviceName: string;
  environment: string;
  start: number;
  end: number;
  locationField?: string;
  offset?: string;
}

export async function getSessionsByLocation({
  kuery,
  apmEventClient,
  serviceName,
  environment,
  start,
  end,
  locationField,
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
      terms: {
        field: locationField,
      },
      aggs: {
        sessions: {
          cardinality: { field: SESSION_ID },
        },
      },
    },
  };

  const response = await apmEventClient.search('get_mobile_location_sessions', {
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
          ...termQuery(SERVICE_NAME, serviceName),
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
        },
        aggs,
      },
      ...aggs,
    },
  });

  return {
    location: response.aggregations?.sessions?.buckets[0]?.key as string,
    value: response.aggregations?.sessions?.buckets[0]?.sessions.value ?? 0,
    timeseries:
      response.aggregations?.timeseries?.buckets.map((bucket) => ({
        x: bucket.key,
        y: bucket.sessions.buckets[0]?.sessions.value ?? 0,
      })) ?? [],
  };
}
