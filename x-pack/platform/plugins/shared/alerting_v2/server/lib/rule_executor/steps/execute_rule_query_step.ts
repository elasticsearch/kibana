/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { inject, injectable } from 'inversify';
import { getBreachEsqlQuery } from '@kbn/alerting-v2-schemas';
import { createTaskRunError, TaskErrorSource } from '@kbn/task-manager-plugin/server';
import { isEsqlUserError } from '../../errors/esql_user_error';
import type { PipelineStateStream, RuleExecutionStep } from '../types';
import { getQueryPayload } from '../get_query_payload';
import {
  LoggerServiceToken,
  type LoggerServiceContract,
} from '../../services/logger_service/logger_service';
import type { QueryServiceContract } from '../../services/query_service/query_service';
import { QueryServiceScopedSpaceRoutingToken } from '../../services/query_service/tokens';
import { guardedExpandStep } from '../stream_utils';

@injectable()
export class ExecuteRuleQueryStep implements RuleExecutionStep {
  public readonly name = 'execute_rule_query';

  constructor(
    @inject(LoggerServiceToken) private readonly logger: LoggerServiceContract,
    @inject(QueryServiceScopedSpaceRoutingToken) private readonly queryService: QueryServiceContract
  ) {}

  public executeStream(streamState: PipelineStateStream): PipelineStateStream {
    const step = this;

    return guardedExpandStep(streamState, ['rule'], async function* (state) {
      const { input, rule } = state;

      const effectiveQuery = getBreachEsqlQuery(rule.query);
      const lookbackWindow = rule.schedule.lookback ?? rule.schedule.every;
      const timeField = rule.time_field;

      const queryPayload = getQueryPayload({
        query: effectiveQuery,
        timeField,
        lookbackWindow,
      });

      step.logger.debug({
        message: () =>
          `[${step.name}] Executing ES|QL query for rule ${input.ruleId} - ${JSON.stringify({
            query: effectiveQuery,
            filter: queryPayload.filter,
            params: queryPayload.params,
          })}`,
      });

      try {
        const esqlRowBatchStream = step.queryService.executeQueryStream({
          query: effectiveQuery,
          filter: queryPayload.filter,
          params: queryPayload.params,
          abortSignal: input.executionContext.signal,
        });

        let yielded = false;

        for await (const batch of esqlRowBatchStream) {
          yielded = true;
          yield {
            type: 'continue',
            state: { ...state, queryPayload, esqlRowBatch: batch },
          };
        }

        if (!yielded) {
          yield {
            type: 'continue',
            state: { ...state, queryPayload, esqlRowBatch: [] },
          };
        }
      } catch (error) {
        if (isEsqlUserError(error)) {
          throw createTaskRunError(error as Error, TaskErrorSource.USER);
        }
        throw error;
      }
    });
  }
}
