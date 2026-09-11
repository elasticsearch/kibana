/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { rangeQuery } from '@kbn/observability-plugin/server';
import type { ServiceTransactionTypesResponse } from '@kbn/apm-api-shared';
import type { ApmServiceTransactionDocumentType } from '@kbn/apm-types';
import type { RollupInterval } from '@kbn/apm-types';
import { SERVICE_NAME, TRANSACTION_TYPE } from '../../../common/es_fields/apm';
import type { APMEventClient } from '../../lib/helpers/create_es_client/create_apm_event_client';

export async function getServiceTransactionTypes({
  apmEventClient,
  serviceName,
  start,
  end,
  documentType,
  rollupInterval,
}: {
  serviceName: string;
  apmEventClient: APMEventClient;
  start: number;
  end: number;
  documentType: ApmServiceTransactionDocumentType;
  rollupInterval: RollupInterval;
}): Promise<ServiceTransactionTypesResponse> {
  const params = {
    apm: {
      sources: [
        {
          documentType,
          rollupInterval,
        },
      ],
    },
    track_total_hits: false,
    size: 0,
    query: {
      bool: {
        filter: [{ term: { [SERVICE_NAME]: serviceName } }, ...rangeQuery(start, end)],
      },
    },
    aggs: {
      types: {
        terms: { field: TRANSACTION_TYPE, size: 100 },
      },
    },
  };

  const { aggregations } = await apmEventClient.search('get_service_transaction_types', params);
  const transactionTypes =
    aggregations?.types.buckets
      .map((bucket) => bucket.key as string)
      // we exclude page-exit transactions because they are not relevant for the apm app
      // and are only used for the INP values
      .filter((value) => value !== 'page-exit') || [];
  return { transactionTypes };
}
