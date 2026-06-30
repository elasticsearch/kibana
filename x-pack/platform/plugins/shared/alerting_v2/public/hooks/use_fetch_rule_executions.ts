/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import { useService } from '@kbn/core-di-browser';
import type { GetRuleExecutionsQuery, GetRuleExecutionsResponse } from '@kbn/alerting-v2-schemas';
import { ExecutionHistoryApi } from '../services/execution_history_api';
import { ruleExecutionKeys } from './query_key_factory';

export const useFetchRuleExecutions = (params: Partial<GetRuleExecutionsQuery>) => {
  const api = useService(ExecutionHistoryApi);

  return useQuery<GetRuleExecutionsResponse, Error>({
    queryKey: ruleExecutionKeys.list(params),
    queryFn: () => api.getRuleExecutions(params),
    refetchOnWindowFocus: false,
    keepPreviousData: true,
  });
};
