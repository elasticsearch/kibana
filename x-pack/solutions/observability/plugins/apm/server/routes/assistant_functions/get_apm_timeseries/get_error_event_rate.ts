/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import { ERROR_GROUP_NAME } from '../../../../common/es_fields/apm';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import { fetchSeries } from './fetch_timeseries';

export async function getErrorEventRate({
  apmEventClient,
  start,
  end,
  intervalString,
  bucketSize,
  filter,
}: {
  apmEventClient: APMEventClient;
  start: number;
  end: number;
  intervalString: string;
  bucketSize: number;
  filter: QueryDslQueryContainer[];
}) {
  const bucketSizeInMinutes = bucketSize / 60;
  const rangeInMinutes = (end - start) / 1000 / 60;

  return (
    await fetchSeries({
      apmEventClient,
      start,
      end,
      operationName: 'assistant_get_error_event_rate',
      unit: 'rpm',
      documentType: ApmDocumentType.ErrorEvent,
      rollupInterval: RollupInterval.None,
      intervalString,
      filter,
      groupByFields: [ERROR_GROUP_NAME],
      aggs: {
        sample: {
          top_metrics: {
            metrics: { field: ERROR_GROUP_NAME },
            sort: '_score',
          },
        },
        value: {
          bucket_script: {
            buckets_path: {
              count: '_count',
            },
            script: {
              lang: 'painless',
              params: {
                bucketSizeInMinutes,
              },
              source: 'params.count / params.bucketSizeInMinutes',
            },
          },
        },
      },
    })
  ).map((fetchedSerie) => {
    return {
      ...fetchedSerie,
      value: fetchedSerie.value !== null ? fetchedSerie.value / rangeInMinutes : null,
      data: fetchedSerie.data.map((bucket) => {
        return {
          x: bucket.key,
          y: bucket.value?.value as number,
        };
      }),
    };
  });
}
