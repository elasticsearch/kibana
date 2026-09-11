/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { accessKnownApmEventFields } from '@kbn/apm-data-access-plugin/server/utils';
import { type Error } from '@kbn/apm-types';
import { rangeQuery, termQuery } from '@kbn/observability-plugin/server';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import type { APMEventClient } from '../../lib/helpers/create_es_client/create_apm_event_client';
import { compactMap } from '../../utils/compact_map';
import {
  ID,
  ERROR_CULPRIT,
  ERROR_EXC_HANDLED,
  ERROR_EXC_MESSAGE,
  ERROR_EXC_TYPE,
  ERROR_GROUP_ID,
  ERROR_ID,
  ERROR_LOG_LEVEL,
  ERROR_LOG_MESSAGE,
  PARENT_ID,
  PROCESSOR_EVENT,
  SERVICE_NAME,
  SPAN_DESTINATION_SERVICE_RESOURCE,
  SPAN_ID,
  TIMESTAMP_US,
  TRACE_ID,
  TRANSACTION_ID,
} from '../../../common/es_fields/apm';
import { asMutableArray } from '../../../common/utils/as_mutable_array';

export async function getApmTraceError(params: {
  apmEventClient: APMEventClient;
  traceId: string;
  docId?: string;
  start: number;
  end: number;
}) {
  const response = await getApmTraceErrorQuery(params);

  return compactMap(response.hits.hits, (hit): Error | undefined => {
    const errorSource = 'error' in hit._source ? hit._source : undefined;
    const event = hit.fields
      ? accessKnownApmEventFields(hit.fields).requireFields(requiredFields)
      : undefined;

    if (!event) {
      return undefined;
    }

    const { _id: id, parent, error, ...unflattened } = event.unflatten();

    return {
      id,
      parent: {
        id: parent?.id ?? unflattened.span?.id,
      },
      trace: unflattened.trace,
      span: unflattened.span,
      transaction: unflattened.transaction,
      timestamp: unflattened.timestamp,
      service: { name: unflattened.service.name },
      error: {
        exception:
          (errorSource?.error?.exception?.length ?? 0) > 0
            ? errorSource?.error?.exception?.[0]
            : error.exception,
        grouping_key: error?.grouping_key,
        culprit: error?.culprit,
        id: error?.id,
        log: errorSource?.error.log,
      },
      index: hit._index,
    };
  });
}

const requiredFields = asMutableArray([
  TIMESTAMP_US,
  TRACE_ID,
  SERVICE_NAME,
  ERROR_ID,
  ERROR_GROUP_ID,
  PROCESSOR_EVENT,
  ID,
] as const);

const optionalFields = asMutableArray([
  PARENT_ID,
  TRANSACTION_ID,
  SPAN_ID,
  SPAN_DESTINATION_SERVICE_RESOURCE,
  ERROR_CULPRIT,
  ERROR_LOG_MESSAGE,
  ERROR_EXC_MESSAGE,
  ERROR_EXC_HANDLED,
  ERROR_EXC_TYPE,
] as const);

const excludedLogLevels = ['debug', 'info', 'warning'];

function getApmTraceErrorQuery({
  apmEventClient,
  traceId,
  docId,
  start,
  end,
}: {
  apmEventClient: APMEventClient;
  traceId: string;
  docId?: string;
  start: number;
  end: number;
}) {
  return apmEventClient.search('get_errors_docs', {
    apm: {
      sources: [
        {
          documentType: ApmDocumentType.ErrorEvent,
          rollupInterval: RollupInterval.None,
        },
      ],
    },
    track_total_hits: false,
    size: 1000,
    query: {
      bool: {
        filter: [
          ...termQuery(TRACE_ID, traceId),
          ...termQuery(SPAN_ID, docId),
          ...rangeQuery(start, end),
        ],
        must_not: { terms: { [ERROR_LOG_LEVEL]: excludedLogLevels } },
      },
    },
    fields: [...requiredFields, ...optionalFields],
    _source: [ERROR_LOG_MESSAGE, ERROR_EXC_MESSAGE, ERROR_EXC_HANDLED, ERROR_EXC_TYPE],
  });
}
