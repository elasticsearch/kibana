/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { rangeQuery, kqlQuery, termQuery } from '@kbn/observability-plugin/server';
import { accessKnownApmEventFields } from '@kbn/apm-data-access-plugin/server/utils';
import type { Transaction } from '@kbn/apm-types';
import type { ErrorSampleDetailsResponse } from '@kbn/apm-api-shared';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import { asMutableArray } from '../../../../common/utils/as_mutable_array';
import { maybe } from '../../../../common/utils/maybe';
import {
  AGENT_NAME,
  AGENT_VERSION,
  AT_TIMESTAMP,
  ERROR_CULPRIT,
  ERROR_EXCEPTION,
  ERROR_GROUP_ID,
  ERROR_ID,
  ERROR_EXC_MESSAGE,
  ERROR_EXC_HANDLED,
  ERROR_EXC_TYPE,
  PROCESSOR_EVENT,
  PROCESSOR_NAME,
  SERVICE_NAME,
  TIMESTAMP_US,
  ID,
  TRACE_ID,
  TRANSACTION_ID,
  ERROR_STACK_TRACE,
  SPAN_ID,
  SERVICE_LANGUAGE_NAME,
  URL_FULL,
  HTTP_REQUEST_METHOD,
  HTTP_RESPONSE_STATUS_CODE,
  TRANSACTION_PAGE_URL,
  USER_AGENT_NAME,
  USER_AGENT_VERSION,
  ERROR_MESSAGE,
  ERROR_TYPE,
} from '../../../../common/es_fields/apm';
import { environmentQuery } from '../../../../common/utils/environment_query';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import { getTransaction } from '../../transactions/get_transaction';

export async function getErrorSampleDetails({
  environment,
  kuery,
  serviceName,
  errorId,
  apmEventClient,
  start,
  end,
}: {
  environment: string;
  kuery: string;
  serviceName: string;
  errorId: string;
  apmEventClient: APMEventClient;
  start: number;
  end: number;
}): Promise<Partial<ErrorSampleDetailsResponse>> {
  const requiredFields = asMutableArray([
    ID,
    AGENT_NAME,
    PROCESSOR_EVENT,
    TIMESTAMP_US,
    AT_TIMESTAMP,
    SERVICE_NAME,
    ERROR_GROUP_ID,
  ] as const);

  const optionalFields = asMutableArray([
    TRACE_ID,
    TRANSACTION_ID,
    SPAN_ID,
    AGENT_VERSION,
    PROCESSOR_NAME,
    SERVICE_LANGUAGE_NAME,
    ERROR_CULPRIT,
    ERROR_STACK_TRACE,
    ERROR_EXC_MESSAGE,
    ERROR_EXC_HANDLED,
    ERROR_EXC_TYPE,
    ERROR_ID,
    ERROR_MESSAGE,
    ERROR_TYPE,
    URL_FULL,
    HTTP_REQUEST_METHOD,
    HTTP_RESPONSE_STATUS_CODE,
    TRANSACTION_PAGE_URL,
    USER_AGENT_NAME,
    USER_AGENT_VERSION,
  ] as const);

  const params = {
    apm: {
      sources: [
        {
          documentType: ApmDocumentType.ErrorEvent as const,
          rollupInterval: RollupInterval.None,
        },
      ],
    },
    track_total_hits: false,
    size: 1,
    query: {
      bool: {
        filter: [
          { term: { [SERVICE_NAME]: serviceName } },
          ...rangeQuery(start, end),
          ...environmentQuery(environment),
          ...kqlQuery(kuery),
          {
            bool: {
              should: [...termQuery(ERROR_ID, errorId), ...termQuery(ID, errorId)],
              minimum_should_match: 1,
            },
          },
        ],
      },
    },
    fields: [...requiredFields, ...optionalFields],
    _source: [ERROR_EXCEPTION, 'error.log'],
  };

  const resp = await apmEventClient.search('get_error_sample_details', params);
  const hit = maybe(resp.hits.hits[0]);

  if (!hit) {
    return {
      transaction: undefined,
      error: undefined,
    };
  }

  const source = 'error' in hit._source ? hit._source : undefined;

  const errorFromFields = accessKnownApmEventFields(hit.fields)
    .requireFields(requiredFields)
    .unflatten();

  const transactionId = errorFromFields.transaction?.id ?? errorFromFields.span?.id;
  const traceId = errorFromFields.trace?.id;

  let transaction: Transaction | undefined;
  if (transactionId && traceId) {
    try {
      transaction = await getTransaction({
        transactionId,
        traceId,
        apmEventClient,
        start,
        end,
      });
    } catch {
      transaction = undefined;
    }
  }

  return {
    transaction,
    error: {
      ...errorFromFields,
      processor: {
        name: errorFromFields.processor.name as 'error',
        event: errorFromFields.processor.event as 'error',
      },
      error: {
        ...errorFromFields.error,
        id: errorFromFields.error?.id ?? errorFromFields[ID],
        exception:
          (source?.error.exception?.length ?? 0) > 0
            ? source?.error.exception
            : errorFromFields?.error.exception && [errorFromFields.error.exception],
        log: source?.error?.log,
      },
    },
  };
}
