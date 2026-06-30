/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useQuery } from '@kbn/react-query';
import dateMath from '@kbn/datemath';
import type { ReadRuleExecutionResultsResponse } from '../../../common/api/detection_engine/rule_monitoring';
import { readV2RuleExecutionResultsUrl } from '../../../common/api/detection_engine/rule_monitoring';
import { useKibana } from '../../common/lib/kibana';

interface UseV2ExecutionResultsArgs {
  ruleId: string;
  from: string;
  to: string;
  outcome?: string[];
  sortField?: 'execution_start' | 'execution_duration_ms';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
}

export const useV2ExecutionResults = (args: UseV2ExecutionResultsArgs) => {
  const { http } = useKibana().services;
  const { ruleId, from, to, outcome, sortField, sortOrder, page, perPage } = args;

  return useQuery<ReadRuleExecutionResultsResponse>(
    ['v2ExecutionResults', ruleId, from, to, outcome, sortField, sortOrder, page, perPage],
    ({ signal }) => {
      const url = readV2RuleExecutionResultsUrl(ruleId);

      return http.fetch<ReadRuleExecutionResultsResponse>(url, {
        method: 'POST',
        version: '1',
        body: JSON.stringify({
          filter: {
            from: dateMath.parse(from)?.toISOString(),
            to: dateMath.parse(to, { roundUp: true })?.toISOString(),
            outcome: outcome?.length ? outcome : undefined,
          },
          sort: sortField ? { field: sortField, order: sortOrder ?? 'desc' } : undefined,
          page,
          per_page: perPage,
        }),
        signal,
      });
    },
    {
      keepPreviousData: true,
      refetchOnMount: 'always',
      refetchOnWindowFocus: false,
    }
  );
};
