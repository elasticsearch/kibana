/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import objectHash from 'object-hash';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { rangeQuery } from '@kbn/observability-plugin/server';
import { RollupInterval } from '@kbn/apm-data-access-plugin/common';
import { ApmDocumentType } from '@kbn/apm-types';
import type { AgentName } from '../../../../typings/es_schemas/ui/fields/agent';
import { getOffsetInMs } from '../../../../common/utils/get_offset_in_ms';
import { ENVIRONMENT_NOT_DEFINED } from '../../../../common/environment_filter_values';
import { asMutableArray } from '../../../../common/utils/as_mutable_array';
import {
  AGENT_NAME,
  EVENT_OUTCOME,
  SERVICE_ENVIRONMENT,
  SERVICE_NAME,
  SPAN_DESTINATION_SERVICE_RESOURCE,
  SPAN_DESTINATION_SERVICE_RESPONSE_TIME_COUNT,
  SPAN_DESTINATION_SERVICE_RESPONSE_TIME_SUM,
  SPAN_SUBTYPE,
  SPAN_TYPE,
} from '../../../../common/es_fields/apm';
import { getBucketSize } from '../../../../common/utils/get_bucket_size';
import { EventOutcome } from '../../../../common/event_outcome';
import { NodeType } from '../../../../common/connections';
import { excludeRumExitSpansQuery } from '../exclude_rum_exit_spans_query';
import type { APMEventClient } from '../../helpers/create_es_client/create_apm_event_client';
import { getDocumentTypeFilterForServiceDestinationStatistics } from '../../helpers/spans/get_is_using_service_destination_metrics';

const MAX_ITEMS = 1500;
export const getConnectionStatsItems = async ({
  apmEventClient,
  start,
  end,
  filter,
  numBuckets,
  offset,
  withTimeseries,
}: {
  apmEventClient: APMEventClient;
  start: number;
  end: number;
  filter: QueryDslQueryContainer[];
  numBuckets: number;
  offset?: string;
  withTimeseries: boolean;
}) => {
  const { offsetInMs, startWithOffset, endWithOffset } = getOffsetInMs({
    start,
    end,
    offset,
  });

  const response = await getConnectionStatsAggregations({
    apmEventClient,
    startWithOffset,
    endWithOffset,
    filter,
    numBuckets,
    withTimeseries,
  });

  return (
    response.aggregations?.connections.buckets.map((bucket) => {
      const sample = bucket.sample.top[0].metrics;
      const serviceName = bucket.key.serviceName as string;
      const dependencyName = bucket.key.dependencyName as string;

      return {
        from: {
          id: objectHash({ serviceName }),
          serviceName,
          environment: (sample[SERVICE_ENVIRONMENT] || ENVIRONMENT_NOT_DEFINED.value) as string,
          agentName: sample[AGENT_NAME] as AgentName,
          type: NodeType.service as const,
        },
        to: {
          id: objectHash({ dependencyName }),
          dependencyName,
          spanType: sample[SPAN_TYPE] as string,
          spanSubtype: (sample[SPAN_SUBTYPE] || '') as string,
          type: NodeType.dependency as const,
        },
        value: {
          latency_count: bucket.total_latency_count.value ?? 0,
          latency_sum: bucket.total_latency_sum.value ?? 0,
          error_count: bucket.error_count.doc_count ?? 0,
          success_count: bucket.success_count.doc_count ?? 0,
        },
        timeseries: bucket.timeseries?.buckets.map((dateBucket) => ({
          x: dateBucket.key + offsetInMs,
          latency_count: dateBucket.total_latency_count.value ?? 0,
          latency_sum: dateBucket.total_latency_sum.value ?? 0,
          error_count: dateBucket.error_count.doc_count ?? 0,
          success_count: dateBucket.success_count.doc_count ?? 0,
        })),
      };
    }) ?? []
  );
};

async function getConnectionStatsAggregations({
  apmEventClient,
  startWithOffset,
  endWithOffset,
  filter,
  numBuckets,
  withTimeseries,
}: {
  apmEventClient: APMEventClient;
  startWithOffset: number;
  endWithOffset: number;
  filter: QueryDslQueryContainer[];
  numBuckets: number;
  after?: { serviceName: string | number; dependencyName: string | number };
  withTimeseries: boolean;
  dependencyNames?: string[];
}) {
  const statsAggs = {
    total_latency_sum: {
      sum: {
        field: SPAN_DESTINATION_SERVICE_RESPONSE_TIME_SUM,
      },
    },
    total_latency_count: {
      sum: {
        field: SPAN_DESTINATION_SERVICE_RESPONSE_TIME_COUNT,
      },
    },
    error_count: {
      filter: {
        bool: { filter: [{ terms: { [EVENT_OUTCOME]: [EventOutcome.failure] } }] },
      },
    },
    success_count: {
      filter: {
        bool: {
          filter: [{ terms: { [EVENT_OUTCOME]: [EventOutcome.success] } }],
        },
      },
    },
  };

  return apmEventClient.search('get_connection_stats', {
    apm: {
      sources: [
        {
          documentType: ApmDocumentType.ServiceDestinationMetric,
          rollupInterval: RollupInterval.OneMinute, // TODO: use getRollupIntervalForTimeRange
        },
      ],
    },
    track_total_hits: true,
    size: 0,
    query: {
      bool: {
        filter: [
          ...filter,
          ...getDocumentTypeFilterForServiceDestinationStatistics(true),
          ...rangeQuery(startWithOffset, endWithOffset),
          ...excludeRumExitSpansQuery(),
        ],
      },
    },
    aggs: {
      connections: {
        composite: {
          size: MAX_ITEMS,
          sources: asMutableArray([
            { serviceName: { terms: { field: SERVICE_NAME } } },
            { dependencyName: { terms: { field: SPAN_DESTINATION_SERVICE_RESOURCE } } },
          ] as const),
        },
        aggs: {
          sample: {
            top_metrics: {
              size: 1,
              metrics: asMutableArray([
                { field: SERVICE_ENVIRONMENT },
                { field: AGENT_NAME },
                { field: SPAN_TYPE },
                { field: SPAN_SUBTYPE },
              ] as const),
              sort: {
                '@timestamp': 'desc',
              },
            },
          },
          ...statsAggs,
          ...(withTimeseries
            ? {
                timeseries: {
                  date_histogram: {
                    field: '@timestamp',
                    fixed_interval: getBucketSize({
                      start: startWithOffset,
                      end: endWithOffset,
                      numBuckets,
                      minBucketSize: 60,
                    }).intervalString,
                    extended_bounds: {
                      min: startWithOffset,
                      max: endWithOffset,
                    },
                  },
                  aggs: statsAggs,
                },
              }
            : undefined),
        },
      },
    },
  });
}
