/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { rangeQuery } from '@kbn/observability-plugin/server';
import { accessKnownApmEventFields } from '@kbn/apm-data-access-plugin/server/utils';
import type { TransactionDetailRedirectInfo } from '@kbn/apm-types';
import { ApmDocumentType } from '@kbn/apm-types';
import { RollupInterval } from '@kbn/apm-types';
import { maybe } from '../../../../common/utils/maybe';
import {
  AT_TIMESTAMP,
  SERVICE_NAME,
  TRACE_ID,
  TRANSACTION_DURATION,
  TRANSACTION_ID,
  TRANSACTION_NAME,
  TRANSACTION_TYPE,
} from '../../../../common/es_fields/apm';
import { asMutableArray } from '../../../../common/utils/as_mutable_array';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import { environmentQuery } from '../../../../common/utils/environment_query';

export async function getTransactionByName({
  transactionName,
  serviceName,
  environment,
  apmEventClient,
  start,
  end,
}: {
  transactionName: string;
  serviceName: string;
  environment?: string;
  apmEventClient: APMEventClient;
  start: number;
  end: number;
}): Promise<TransactionDetailRedirectInfo | undefined> {
  const requiredFields = asMutableArray([
    AT_TIMESTAMP,
    TRACE_ID,
    TRANSACTION_ID,
    TRANSACTION_TYPE,
    TRANSACTION_NAME,
    TRANSACTION_DURATION,
    SERVICE_NAME,
  ] as const);

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
          { term: { [TRANSACTION_NAME]: transactionName } },
          { term: { [SERVICE_NAME]: serviceName } },
          ...rangeQuery(start, end),
          ...(environment ? environmentQuery(environment) : []),
        ]),
      },
    },
    fields: requiredFields,
  });

  const fields = maybe(resp.hits.hits[0])?.fields;

  return fields && accessKnownApmEventFields(fields).requireFields(requiredFields).unflatten();
}
