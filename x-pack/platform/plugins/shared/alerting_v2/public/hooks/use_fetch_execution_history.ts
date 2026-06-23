/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import { useService } from '@kbn/core-di-browser';
import type {
  ListPolicyExecutionHistoryResponse,
  PolicyExecutionOutcomeFilter,
} from '@kbn/alerting-v2-schemas';
import { ExecutionHistoryApi } from '../services/execution_history_api';
import { executionHistoryKeys } from './query_key_factory';

interface UseFetchExecutionHistoryParams {
  page: number;
  perPage: number;
  search?: string;
  outcome?: PolicyExecutionOutcomeFilter;
}

export const useFetchExecutionHistory = ({
  page,
  perPage,
  search,
  outcome,
}: UseFetchExecutionHistoryParams) => {
  const executionHistoryApi = useService(ExecutionHistoryApi);

  return useQuery<ListPolicyExecutionHistoryResponse, Error>({
    queryKey: executionHistoryKeys.list({ page, perPage, search, outcome }),
    queryFn: () => executionHistoryApi.listExecutionHistory({ page, perPage, search, outcome }),
    refetchOnWindowFocus: false,
    keepPreviousData: true,
  });
};
