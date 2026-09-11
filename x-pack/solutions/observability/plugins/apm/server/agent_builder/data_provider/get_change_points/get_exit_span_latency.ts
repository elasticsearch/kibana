/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { termQuery } from '@kbn/observability-plugin/server';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import {
  SPAN_DESTINATION_SERVICE_RESOURCE,
  SPAN_DESTINATION_SERVICE_RESPONSE_TIME_COUNT,
  SPAN_DESTINATION_SERVICE_RESPONSE_TIME_SUM,
} from '../../../../common/es_fields/apm';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import { fetchSeries } from './fetch_timeseries';

export async function getExitSpanLatency({
  apmEventClient,
  start,
  end,
  intervalString,
  filter,
  spanDestinationServiceResource,
}: {
  apmEventClient: APMEventClient;
  start: number;
  end: number;
  intervalString: string;
  bucketSize: number;
  filter: QueryDslQueryContainer[];
  spanDestinationServiceResource?: string;
}) {
  return (
    await fetchSeries({
      apmEventClient,
      start,
      end,
      operationName: 'assistant_get_exit_span_latency',
      unit: 'ms',
      documentType: ApmDocumentType.ServiceDestinationMetric,
      rollupInterval: RollupInterval.OneMinute,
      intervalString,
      filter: filter.concat(
        ...termQuery(SPAN_DESTINATION_SERVICE_RESOURCE, spanDestinationServiceResource)
      ),
      groupByFields: [SPAN_DESTINATION_SERVICE_RESOURCE],
      aggs: {
        count: {
          sum: {
            field: SPAN_DESTINATION_SERVICE_RESPONSE_TIME_COUNT,
          },
        },
        latency: {
          sum: {
            field: SPAN_DESTINATION_SERVICE_RESPONSE_TIME_SUM,
          },
        },
        value: {
          bucket_script: {
            buckets_path: {
              latency: 'latency',
              count: 'count',
            },
            script: '(params.latency / params.count) / 1000',
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
