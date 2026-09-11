/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AggregationsAggregationContainer,
  QueryDslQueryContainer,
} from '@elastic/elasticsearch/lib/api/types';
import type { AggregationResultOf, AggregationResultOfMap } from '@kbn/es-types';
import type { Unionize } from 'utility-types';
import type { ApmDocumentType } from '@kbn/apm-types';
import type { RollupInterval } from '@kbn/apm-types';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';

type ChangePointResult = AggregationResultOf<{ change_point: any }, unknown>;

type ValueAggregationMap = Record<
  'value',
  Unionize<
    Pick<
      Required<AggregationsAggregationContainer>,
      'min' | 'max' | 'sum' | 'bucket_script' | 'avg'
    >
  >
>;

interface ApmFetchedTimeseries<T extends ValueAggregationMap> {
  groupBy: string;
  data: Array<
    {
      key: number;
      key_as_string: string;
      doc_count: number;
    } & AggregationResultOfMap<T, unknown>
  >;
  change_point: ChangePointResult;
  value: number | null;
  unit: string;
}

export interface FetchSeriesProps<T extends ValueAggregationMap> {
  apmEventClient: APMEventClient;
  operationName: string;
  documentType: ApmDocumentType;
  rollupInterval: RollupInterval;
  intervalString: string;
  start: number;
  end: number;
  filter?: QueryDslQueryContainer[];
  groupByFields: string[];
  aggs: T;
  unit: 'ms' | 'rpm' | '%';
}

export async function fetchSeries<T extends ValueAggregationMap>({
  apmEventClient,
  operationName,
  documentType,
  rollupInterval,
  intervalString,
  start,
  end,
  filter,
  groupByFields,
  aggs,
  unit,
}: FetchSeriesProps<T>): Promise<Array<ApmFetchedTimeseries<T>>> {
  const response = await apmEventClient.search(operationName, {
    apm: {
      sources: [{ documentType, rollupInterval }],
    },
    size: 0,
    track_total_hits: false,
    query: {
      bool: {
        filter,
      },
    },
    aggs: {
      groups: {
        ...(groupByFields.length === 1
          ? {
              terms: {
                size: 20,
                field: groupByFields[0],
              },
            }
          : {
              multi_terms: {
                size: 20,
                terms: groupByFields.map((field) => ({ field })),
              },
            }),
        aggs: {
          ...aggs,
          timeseries: {
            date_histogram: {
              field: '@timestamp',
              fixed_interval: intervalString,
              min_doc_count: 0,
              extended_bounds: { min: start, max: end },
            },
            aggs,
          },
          change_point: {
            change_point: {
              buckets_path: 'timeseries>value',
            },
          },
        },
      },
    },
  });

  if (!response.aggregations?.groups) {
    return [];
  }

  return response.aggregations.groups.buckets.map((bucket) => {
    const bucketValue = bucket.value as ValueAggregationMap | undefined;
    let value =
      bucketValue?.value === undefined || bucketValue?.value === null
        ? null
        : Number(bucketValue.value);

    if (value !== null) {
      value = Math.abs(value) < 100 ? Number(value.toPrecision(3)) : Math.round(value);
    }

    return {
      groupBy: bucket.key_as_string || String(bucket.key),
      data: bucket.timeseries.buckets,
      value,
      change_point: bucket.change_point,
      unit,
    };
  });
}
