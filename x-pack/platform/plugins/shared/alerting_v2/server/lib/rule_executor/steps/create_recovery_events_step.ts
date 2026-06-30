/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { inject, injectable } from 'inversify';
import { createTaskRunError, TaskErrorSource } from '@kbn/task-manager-plugin/server';
import { stableStringify } from '@kbn/std';
import { getRecoverEsqlQuery } from '@kbn/alerting-v2-schemas';
import { isEsqlUserError } from '../../errors/esql_user_error';
import type { PipelineStateStream, RuleExecutionStep, RulePipelineState } from '../types';
import { buildRecoveryAlertEvents, buildQueryRecoveryAlertEvents } from '../build_alert_events';
import { getQueryPayload } from '../get_query_payload';
import { fetchActiveAlertGroupHashes } from '../fetch_active_alert_group_hashes';
import {
  LoggerServiceToken,
  type LoggerServiceContract,
} from '../../services/logger_service/logger_service';
import {
  QueryServiceInternalToken,
  QueryServiceScopedSpaceRoutingToken,
} from '../../services/query_service/tokens';
import type { QueryServiceContract } from '../../services/query_service/query_service';
import type { ActiveAlertGroupHash } from '../queries';
import { guardedExpandStep } from '../stream_utils';
import type { RuleResponse } from '../../rules_client';
import type { AlertEvent } from '../../../resources/datastreams/alert_events';

@injectable()
export class CreateRecoveryEventsStep implements RuleExecutionStep {
  public readonly name = 'create_recovery_events';

  constructor(
    @inject(LoggerServiceToken) private readonly logger: LoggerServiceContract,
    @inject(QueryServiceInternalToken) private readonly internalQueryService: QueryServiceContract,
    @inject(QueryServiceScopedSpaceRoutingToken)
    private readonly scopedQueryService: QueryServiceContract
  ) {}

  public executeStream(streamState: PipelineStateStream): PipelineStateStream {
    const step = this;

    return guardedExpandStep(streamState, ['rule', 'alertEventsBatch'], async function* (state) {
      const { input, rule, alertEventsBatch } = state;

      if (rule.kind !== 'alert') {
        step.logger.debug({
          message: `[${step.name}] Skipping recovery for non-alert rule ${input.ruleId}`,
        });
        yield { type: 'continue', state };
        return;
      }

      // recovery_strategy of 'none' (or null) disables recovery entirely.
      if (rule.recovery_strategy == null || rule.recovery_strategy === 'none') {
        step.logger.debug({
          message: `[${step.name}] Recovery disabled for rule ${input.ruleId}`,
        });
        yield { type: 'continue', state };
        return;
      }

      const activeGroupHashes = await fetchActiveAlertGroupHashes(
        step.internalQueryService,
        rule.id,
        input.executionContext
      );

      if (activeGroupHashes.length === 0) {
        step.logger.debug({
          message: `[${step.name}] No active alerts to recover for rule ${input.ruleId}`,
        });
        yield { type: 'continue', state };
        return;
      }

      const effectiveQuery = getRecoverEsqlQuery(rule.query, rule.recovery_strategy);
      const recoveryEvents = effectiveQuery
        ? await step.executeRecoveryQuery({ rule, effectiveQuery, input, activeGroupHashes })
        : buildRecoveryAlertEvents({
            ruleId: rule.id,
            ruleVersion: 1,
            spaceId: input.spaceId,
            activeGroupHashes,
            breachedGroupHashes: new Set(alertEventsBatch.map((e) => e.group_hash)),
            scheduledTimestamp: input.scheduledAt,
          });

      step.logger.debug({
        message: `[${step.name}] Created ${recoveryEvents.length} recovery events for rule ${input.ruleId}`,
      });

      yield {
        type: 'continue',
        state: {
          ...state,
          alertEventsBatch: [...alertEventsBatch, ...recoveryEvents],
        },
      };
    });
  }

  private async executeRecoveryQuery({
    rule,
    effectiveQuery,
    input,
    activeGroupHashes,
  }: {
    rule: RuleResponse;
    effectiveQuery: string;
    input: RulePipelineState['input'];
    activeGroupHashes: ActiveAlertGroupHash[];
  }): Promise<AlertEvent[]> {
    const lookbackWindow = rule.schedule.lookback ?? rule.schedule.every;

    const queryPayload = getQueryPayload({
      query: effectiveQuery,
      timeField: rule.time_field,
      lookbackWindow,
    });

    this.logger.debug({
      message: () =>
        `[${this.name}] Executing recovery query for rule ${input.ruleId} - ${stableStringify({
          query: effectiveQuery,
          filter: queryPayload.filter,
          params: queryPayload.params,
        })}`,
    });

    try {
      const esqlResponse = await this.scopedQueryService.executeQuery({
        query: effectiveQuery,
        filter: queryPayload.filter,
        params: queryPayload.params,
        abortSignal: input.executionContext.signal,
      });

      return buildQueryRecoveryAlertEvents({
        ruleId: rule.id,
        ruleVersion: 1,
        spaceId: input.spaceId,
        ruleAttributes: rule,
        activeGroupHashes,
        esqlResponse,
        scheduledTimestamp: input.scheduledAt,
      });
    } catch (error) {
      if (isEsqlUserError(error)) {
        throw createTaskRunError(error as Error, TaskErrorSource.USER);
      }
      throw error;
    }
  }
}
