/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RollupInterval } from '@kbn/apm-types';
import type { ApmTransactionDocumentType } from '@kbn/apm-types';
import { useFetcher } from '../../hooks/use_fetcher';

const INITIAL_DATA = { transactionTypes: [] };

export function useServiceTransactionTypesFetcher({
  serviceName,
  start,
  end,
  documentType,
  rollupInterval,
}: {
  serviceName?: string;
  start?: string;
  end?: string;
  documentType?: ApmTransactionDocumentType;
  rollupInterval?: RollupInterval;
}) {
  const { data = INITIAL_DATA, status } = useFetcher(
    (callApmApi) => {
      if (serviceName && start && end && documentType && rollupInterval) {
        return callApmApi('GET /internal/apm/services/{serviceName}/transaction_types', {
          params: {
            path: { serviceName },
            query: { start, end, documentType, rollupInterval },
          },
        });
      }
    },
    [serviceName, start, end, documentType, rollupInterval]
  );

  return { transactionTypes: data.transactionTypes, status };
}
