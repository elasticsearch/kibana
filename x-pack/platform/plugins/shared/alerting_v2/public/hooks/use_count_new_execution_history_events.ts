/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import { useService } from '@kbn/core-di-browser';
import type {
  CountPolicyExecutionEventsResponse,
  PolicyExecutionOutcomeFilter,
} from '@kbn/alerting-v2-schemas';
import { ExecutionHistoryApi } from '../services/execution_history_api';
import { executionHistoryKeys } from './query_key_factory';

const POLL_INTERVAL_MS = 10_000;

interface UseCountNewExecutionHistoryEventsParams {
  since: string;
  search?: string;
  outcome?: PolicyExecutionOutcomeFilter;
  enabled?: boolean;
}

export const useCountNewExecutionHistoryEvents = ({
  since,
  search,
  outcome,
  enabled = true,
}: UseCountNewExecutionHistoryEventsParams) => {
  const executionHistoryApi = useService(ExecutionHistoryApi);

  return useQuery<CountPolicyExecutionEventsResponse, Error>({
    queryKey: executionHistoryKeys.countSince(since, { search, outcome }),
    queryFn: () => executionHistoryApi.countNewSince(since, { search, outcome }),
    refetchOnWindowFocus: true,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    enabled,
  });
};
