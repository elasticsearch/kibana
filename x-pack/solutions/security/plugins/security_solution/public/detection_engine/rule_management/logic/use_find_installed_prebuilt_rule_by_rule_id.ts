/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleResponse, RuleSignatureId } from '../../../../common/api/detection_engine';
import { prepareKQLStringParam } from '../../../../common/utils/kql';
import { useFindRulesQuery } from '../api/hooks/use_find_rules_query';

export const useFindInstalledPrebuiltRuleByRuleId = (
  ruleId: RuleSignatureId | undefined,
  options?: { enabled?: boolean }
): { rule: RuleResponse | undefined; isFetching: boolean; isFetched: boolean } => {
  const queryResult = useFindRulesQuery(
    {
      filter: ruleId
        ? { term: `alert.attributes.params.ruleId: ${prepareKQLStringParam(ruleId)}` }
        : undefined,
      pagination: { page: 1, perPage: 1 },
    },
    { enabled: Boolean(ruleId) && (options?.enabled ?? true) }
  );

  return {
    rule: queryResult.data?.rules[0],
    isFetching: queryResult.isFetching,
    isFetched: queryResult.isFetched,
  };
};
