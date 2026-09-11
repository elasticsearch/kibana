/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScheduleBackfillResults } from '@kbn/alerting-plugin/server/application/backfill/methods/schedule/types';
import type { BulkOperationError } from '@kbn/alerting-plugin/server';
import type { PromisePoolError } from '../../../../../../utils/promise_pool';
import type { RuleAlertType } from '../../../../rule_schema';

interface HandleScheduleBackfillResultsParams {
  rules: RuleAlertType[];
  results: ScheduleBackfillResults;
}

interface HandleScheduleBackfillResultsOutcome {
  backfilled: RuleAlertType[];
  errors: Array<PromisePoolError<RuleAlertType, Error> | BulkOperationError>;
}

interface SplitAlreadyDeletedRulesParams {
  errors: BulkOperationError[];
  rules: RuleAlertType[];
}

interface SplitAlreadyDeletedRulesOutcome {
  alreadyDeletedRules: RuleAlertType[];
  remainingErrors: BulkOperationError[];
}

/**
 * Splits bulk delete errors into rules that were already deleted and genuine errors.
 *
 * A 404 on delete means the rule is already gone, e.g. deleted by a concurrent
 * bulk delete targeting an overlapping set of rules. The desired end state is
 * reached, so such rules count as successfully deleted instead of failing the
 * whole operation.
 */
export const splitAlreadyDeletedRules = ({
  errors,
  rules,
}: SplitAlreadyDeletedRulesParams): SplitAlreadyDeletedRulesOutcome => {
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const alreadyDeletedRules: RuleAlertType[] = [];
  const remainingErrors: BulkOperationError[] = [];
  for (const error of errors) {
    const alreadyDeletedRule = error.status === 404 ? rulesById.get(error.rule.id) : undefined;
    if (alreadyDeletedRule) {
      alreadyDeletedRules.push(alreadyDeletedRule);
    } else {
      remainingErrors.push(error);
    }
  }
  return { alreadyDeletedRules, remainingErrors };
};

export const handleScheduleBackfillResults = ({
  results,
  rules,
}: HandleScheduleBackfillResultsParams): HandleScheduleBackfillResultsOutcome => {
  const errors: Array<PromisePoolError<RuleAlertType, Error> | BulkOperationError> = [];
  return results.reduce(
    (acc, backfillResult) => {
      if ('error' in backfillResult) {
        const ruleName = rules.find((rule) => rule.id === backfillResult.error.rule.id)?.name;
        const backfillError = backfillResult.error;
        const backfillRule = backfillError.rule;
        const error = {
          message: backfillError.message,
          status: backfillError.status,
          rule: { id: backfillRule.id, name: backfillRule.name ?? ruleName ?? '' },
        };
        acc.errors.push(error);
      } else {
        const backfillRule = rules.find((rule) => rule.id === backfillResult.rule.id);
        if (backfillRule) {
          acc.backfilled.push(backfillRule);
        }
      }
      return acc;
    },
    { backfilled: [], errors } as HandleScheduleBackfillResultsOutcome
  );
};
