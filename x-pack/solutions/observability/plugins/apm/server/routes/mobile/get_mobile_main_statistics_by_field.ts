/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { termQuery, kqlQuery, rangeQuery } from '@kbn/observability-plugin/server';
import { merge } from 'lodash';
import { calculateThroughputWithRange } from '@kbn/apm-data-access-plugin/server/utils';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import {
  SERVICE_NAME,
  SESSION_ID,
  TRANSACTION_DURATION,
  ERROR_TYPE,
} from '../../../common/es_fields/apm';
import { environmentQuery } from '../../../common/utils/environment_query';
import type { APMEventClient } from '../../lib/helpers/create_es_client/create_apm_event_client';
import { getLatencyValue } from '../../lib/helpers/latency_aggregation_type';
import { LatencyAggregationType } from '../../../common/latency_aggregation_types';

interface Props {
  kuery: string;
  apmEventClient: APMEventClient;
  serviceName: string;
  environment: string;
  start: number;
  end: number;
  field: string;
}

export interface MobileMainStatisticsResponse {
  mainStatistics: Array<{
    name: string | number;
    latency: number | null;
    throughput: number;
    crashRate: number;
  }>;
}

type MergedQueriesResponse = Array<{
  name: string | number;
  latency: number | null;
  throughput: number;
  sessions: number;
  crashes?: number;
}>;

export async function getMobileMainStatisticsByField({
  kuery,
  apmEventClient,
  serviceName,
  environment,
  start,
  end,
  field,
}: Props) {
  async function getMobileTransactionEventStatistics() {
    const response = await apmEventClient.search(
      `get_mobile_transaction_events_main_statistics_by_field`,
      {
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
              ...rangeQuery(start, end),
              ...environmentQuery(environment),
              ...kqlQuery(kuery),
            ],
          },
        },
        aggs: {
          main_statistics: {
            terms: {
              field,
              size: 1000,
            },
            aggs: {
              latency: {
                avg: {
                  field: TRANSACTION_DURATION,
                },
              },
              sessions: {
                cardinality: {
                  field: SESSION_ID,
                },
              },
            },
          },
        },
      }
    );

    return (
      response.aggregations?.main_statistics.buckets.map((bucket) => {
        return {
          name: bucket.key,
          latency: getLatencyValue({
            latencyAggregationType: LatencyAggregationType.avg,
            aggregation: bucket.latency,
          }),
          throughput: calculateThroughputWithRange({
            start,
            end,
            value: bucket.doc_count,
          }),
          sessions: bucket.sessions.value,
        };
      }) ?? []
    );
  }

  async function getMobileErrorEventStatistics() {
    const response = await apmEventClient.search(`get_mobile_crashes`, {
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
            ...rangeQuery(start, end),
            ...environmentQuery(environment),
            ...kqlQuery(kuery),
          ],
        },
      },
      aggs: {
        main_statistics: {
          terms: {
            field,
            size: 1000,
          },
          aggs: {
            crashes: {
              filter: {
                term: {
                  [ERROR_TYPE]: 'crash',
                },
              },
            },
          },
        },
      },
    });
    return (
      response.aggregations?.main_statistics.buckets.map((bucket) => {
        return {
          name: bucket.key,
          crashes: bucket.crashes.doc_count ?? 0,
        };
      }) ?? []
    );
  }

  const [transactioEventStatistics, errorEventStatistics] = await Promise.all([
    getMobileTransactionEventStatistics(),
    getMobileErrorEventStatistics(),
  ]);

  const mainStatisticsMerged: MergedQueriesResponse = merge(
    transactioEventStatistics,
    errorEventStatistics
  );

  const mainStatistics = mainStatisticsMerged.map((item) => {
    return {
      name: item.name,
      latency: item.latency,
      throughput: item.throughput,
      crashRate: item.crashes ? item.crashes / item.sessions : 0,
    };
  });

  return { mainStatistics };
}
