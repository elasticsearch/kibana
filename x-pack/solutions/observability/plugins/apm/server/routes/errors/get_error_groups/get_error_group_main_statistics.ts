/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AggregationsAggregateOrder } from '@elastic/elasticsearch/lib/api/types';
import { kqlQuery, rangeQuery, termQuery, wildcardQuery } from '@kbn/observability-plugin/server';
import { accessKnownApmEventFields } from '@kbn/apm-data-access-plugin/server/utils';
import type { ErrorGroupMainStatisticsResponse } from '@kbn/apm-api-shared';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import { asMutableArray } from '../../../../common/utils/as_mutable_array';
import {
  AT_TIMESTAMP,
  ERROR_CULPRIT,
  ERROR_EXC_HANDLED,
  ERROR_EXC_MESSAGE,
  ERROR_EXC_TYPE,
  ERROR_GROUP_ID,
  ERROR_GROUP_NAME,
  ERROR_LOG_MESSAGE,
  ERROR_MESSAGE,
  ERROR_TYPE,
  SERVICE_NAME,
  TRACE_ID,
  TRANSACTION_NAME,
  TRANSACTION_TYPE,
} from '../../../../common/es_fields/apm';
import { environmentQuery } from '../../../../common/utils/environment_query';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import { getErrorName } from '../../../lib/helpers/get_error_name';

export async function getErrorGroupMainStatistics({
  kuery,
  serviceName,
  apmEventClient,
  environment,
  sortField,
  sortDirection = 'desc',
  start,
  end,
  maxNumberOfErrorGroups = 500,
  transactionName,
  transactionType,
  searchQuery,
}: {
  kuery?: string;
  serviceName: string;
  apmEventClient: APMEventClient;
  environment?: string;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  start: number;
  end: number;
  maxNumberOfErrorGroups?: number;
  transactionName?: string;
  transactionType?: string;
  searchQuery?: string;
}): Promise<ErrorGroupMainStatisticsResponse> {
  // sort buckets by last occurrence of error
  const sortByLatestOccurrence = sortField === 'lastSeen';

  const maxTimestampAggKey = 'max_timestamp';

  const order: AggregationsAggregateOrder = sortByLatestOccurrence
    ? { [maxTimestampAggKey]: sortDirection }
    : { _count: sortDirection };

  const shouldMatchSearchQuery = searchQuery
    ? [
        {
          bool: {
            should: [
              ERROR_LOG_MESSAGE,
              ERROR_EXC_MESSAGE,
              ERROR_GROUP_NAME,
              ERROR_EXC_TYPE,
              ERROR_CULPRIT,
            ].flatMap((field) => wildcardQuery(field, searchQuery)),
            minimum_should_match: 1,
          },
        },
      ]
    : [];

  const requiredFields = asMutableArray([AT_TIMESTAMP, ERROR_GROUP_ID] as const);

  const optionalFields = asMutableArray([
    TRACE_ID,
    ERROR_CULPRIT,
    ERROR_LOG_MESSAGE,
    ERROR_EXC_MESSAGE,
    ERROR_EXC_HANDLED,
    ERROR_EXC_TYPE,
    ERROR_MESSAGE,
    ERROR_TYPE,
  ] as const);

  const response = await apmEventClient.search('get_error_group_main_statistics', {
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
          ...termQuery(TRANSACTION_NAME, transactionName),
          ...termQuery(TRANSACTION_TYPE, transactionType),
          ...rangeQuery(start, end),
          ...environmentQuery(environment),
          ...kqlQuery(kuery),
          ...shouldMatchSearchQuery,
        ],
      },
    },
    aggs: {
      error_groups: {
        terms: {
          field: ERROR_GROUP_ID,
          size: maxNumberOfErrorGroups,
          order,
        },
        aggs: {
          sample: {
            top_hits: {
              size: 1,
              fields: [...requiredFields, ...optionalFields],
              _source: [ERROR_LOG_MESSAGE, ERROR_EXC_MESSAGE, ERROR_EXC_HANDLED, ERROR_EXC_TYPE],
              sort: {
                '@timestamp': 'desc',
              },
            },
          },
          ...(sortByLatestOccurrence
            ? { [maxTimestampAggKey]: { max: { field: '@timestamp' } } }
            : {}),
        },
      },
    },
  });

  const maxCountExceeded = (response.aggregations?.error_groups.sum_other_doc_count ?? 0) > 0;

  const errorGroups =
    response.aggregations?.error_groups.buckets.map((bucket) => {
      const errorSource =
        'error' in bucket.sample.hits.hits[0]._source
          ? bucket.sample.hits.hits[0]._source
          : undefined;

      const event = accessKnownApmEventFields(bucket.sample.hits.hits[0].fields).requireFields(
        requiredFields
      );

      const exception = errorSource?.error.exception?.[0] ?? {
        message: event[ERROR_EXC_MESSAGE],
        handled: event[ERROR_EXC_HANDLED],
        type: event[ERROR_EXC_TYPE],
      };

      const errorName = getErrorName(event, exception);

      return {
        groupId: bucket.key as string,
        name: errorName,
        lastSeen: new Date(event[AT_TIMESTAMP]).getTime(),
        occurrences: bucket.doc_count,
        culprit: event[ERROR_CULPRIT],
        handled: exception.handled,
        type: exception.type || event[ERROR_TYPE],
        traceId: event[TRACE_ID],
      };
    }) ?? [];

  return {
    errorGroups,
    maxCountExceeded,
  };
}
