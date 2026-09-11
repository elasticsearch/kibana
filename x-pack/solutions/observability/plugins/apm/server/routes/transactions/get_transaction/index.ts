/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { rangeQuery, termQuery } from '@kbn/observability-plugin/server';
import { accessKnownApmEventFields } from '@kbn/apm-data-access-plugin/server/utils';
import type { Transaction } from '@kbn/apm-types';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import { maybe } from '../../../../common/utils/maybe';
import {
  TRACE_ID,
  AGENT_NAME,
  PROCESSOR_EVENT,
  AT_TIMESTAMP,
  TIMESTAMP_US,
  SERVICE_NAME,
  TRANSACTION_ID,
  TRANSACTION_DURATION,
  TRANSACTION_NAME,
  TRANSACTION_TYPE,
  SPAN_LINKS,
  TRANSACTION_MARKS_AGENT,
} from '../../../../common/es_fields/apm';
import { asMutableArray } from '../../../../common/utils/as_mutable_array';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';

const requiredFields = asMutableArray([
  TRACE_ID,
  AGENT_NAME,
  PROCESSOR_EVENT,
  AT_TIMESTAMP,
  TIMESTAMP_US,
  SERVICE_NAME,
  TRANSACTION_ID,
  TRANSACTION_DURATION,
  TRANSACTION_NAME,
  TRANSACTION_TYPE,
] as const);

export async function getTransaction({
  transactionId,
  traceId,
  apmEventClient,
  start,
  end,
}: {
  transactionId: string;
  traceId?: string;
  apmEventClient: APMEventClient;
  start: number;
  end: number;
}): Promise<Transaction | undefined> {
  const resp = await apmEventClient.search('get_transaction', {
    apm: {
      sources: [
        {
          documentType: ApmDocumentType.TransactionEvent,
          rollupInterval: RollupInterval.None,
        },
      ],
    },
    track_total_hits: false,
    size: 1,
    terminate_after: 1,
    query: {
      bool: {
        filter: asMutableArray([
          { term: { [TRANSACTION_ID]: transactionId } },
          ...termQuery(TRACE_ID, traceId),
          ...rangeQuery(start, end),
        ]),
      },
    },
    // Custom links should allow users to use any transaction field as a placeholder.
    fields: [{ field: '*', include_unmapped: true }],
    _source: [SPAN_LINKS, TRANSACTION_MARKS_AGENT],
  });

  const hit = maybe(resp.hits.hits[0]);

  if (!hit) {
    return undefined;
  }

  const { server, transaction, processor, ...event } = accessKnownApmEventFields(hit.fields)
    .requireFields(requiredFields)
    .unflatten();

  const source =
    'span' in hit._source || 'transaction' in hit._source
      ? (hit._source as {
          transaction?: Pick<Required<Transaction>['transaction'], 'marks'>;
          span?: Pick<Required<Transaction>['span'], 'links'>;
        })
      : undefined;

  const serverTransaction = server as Transaction['server'];

  return {
    ...event,
    server: {
      ...serverTransaction,
      port: serverTransaction?.port ? Number(serverTransaction.port) : undefined,
    },
    transaction: {
      ...transaction,
      marks: source?.transaction?.marks,
    },
    processor: {
      name: 'transaction',
      event: 'transaction',
    },
    span: source?.span,
  } as Transaction;
}
