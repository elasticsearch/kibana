/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { rangeQuery, kqlQuery, termQuery } from '@kbn/observability-plugin/server';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import { ERROR_GROUP_ID, SERVICE_NAME, TRANSACTION_NAME } from '../../../../common/es_fields/apm';
import { environmentQuery } from '../../../../common/utils/environment_query';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';

export async function getBuckets({
  environment,
  kuery,
  serviceName,
  groupId,
  transactionName,
  bucketSize,
  apmEventClient,
  start,
  end,
}: {
  environment: string;
  kuery: string;
  serviceName: string;
  groupId?: string;
  transactionName?: string;
  bucketSize: number;
  apmEventClient: APMEventClient;
  start: number;
  end: number;
}) {
  const params = {
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
        must_not: {
          term: { 'error.type': 'crash' },
        },
        filter: [
          { term: { [SERVICE_NAME]: serviceName } },
          ...rangeQuery(start, end),
          ...environmentQuery(environment),
          ...kqlQuery(kuery),
          ...termQuery(ERROR_GROUP_ID, groupId),
          ...termQuery(TRANSACTION_NAME, transactionName),
        ],
      },
    },
    aggs: {
      distribution: {
        histogram: {
          field: '@timestamp',
          min_doc_count: 0,
          interval: bucketSize,
          extended_bounds: {
            min: start,
            max: end,
          },
        },
      },
    },
  };

  const resp = await apmEventClient.search('get_error_distribution_buckets', params);

  const buckets = (resp.aggregations?.distribution.buckets || []).map((bucket) => ({
    x: bucket.key,
    y: bucket.doc_count,
  }));
  return { buckets };
}
