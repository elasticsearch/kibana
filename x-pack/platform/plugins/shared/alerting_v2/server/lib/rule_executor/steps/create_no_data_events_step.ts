/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { inject, injectable } from 'inversify';
import { createTaskRunError, TaskErrorSource } from '@kbn/task-manager-plugin/server';
import type { EsqlQueryResponse } from '@elastic/elasticsearch/lib/api/types';
import { stableStringify } from '@kbn/std';
import { getNoDataEsqlQuery } from '@kbn/alerting-v2-schemas';
import { isEsqlUserError } from '../../errors/esql_user_error';
import type { PipelineStateStream, RuleExecutionInput, RuleExecutionStep } from '../types';
import { buildGroupHash, buildNoDataAlertEvents, rowToDocument } from '../build_alert_events';
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
import { guardedExpandStep } from '../stream_utils';
import type { RuleResponse } from '../../rules_client';
import type { AlertEvent } from '../../../resources/datastreams/alert_events';

/**
 * Post-processes the alert events batch produced by {@link CreateAlertEventsStep}
 * and {@link CreateRecoveryEventsStep} to apply the rule's `no_data_strategy`.
 *
 * For each group that was previously active but is absent from the current
 * breach batch, this step decides whether the absence is because the group
 * has data but is not breaching, or because the group has no data at all.
 *
 * Recovery always takes priority, only groups without an upstream recovered event receive
 * a `no_data` event.
 *
 * The `no_data` ES|QL query defines the set of groups that have data.
 * Groups absent from that result are treated as "no data" and in the director, the rule's `no_data_strategy` decides the
 * outcome.
 */
@injectable()
export class CreateNoDataEventsStep implements RuleExecutionStep {
  public readonly name = 'create_no_data_events';

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
          message: `[${step.name}] Skipping no-data handling for non-alert rule ${input.ruleId}`,
        });
        yield { type: 'continue', state };
        return;
      }

      const noDataDisabled = rule.no_data_strategy == null || rule.no_data_strategy === 'none';
      const recoveryDisabled = rule.recovery_strategy == null || rule.recovery_strategy === 'none';

      if (noDataDisabled && recoveryDisabled) {
        step.logger.debug({
          message: `[${step.name}] No-data and recovery both disabled for rule ${input.ruleId}`,
        });
        yield { type: 'continue', state };
        return;
      }

      if (noDataDisabled) {
        step.logger.debug({
          message: `[${step.name}] No-data disabled for rule ${input.ruleId}`,
        });
        yield { type: 'continue', state };
        return;
      }

      const activeGroups = await fetchActiveAlertGroupHashes(
        step.internalQueryService,
        rule.id,
        input.executionContext
      );

      if (activeGroups.length === 0) {
        step.logger.debug({
          message: `[${step.name}] No active alerts to evaluate for rule ${input.ruleId}`,
        });
        yield { type: 'continue', state };
        return;
      }

      const breachedGroupHashes = new Set<string>();
      const recoveredEventsByGroup = new Map<string, AlertEvent>();
      for (const event of alertEventsBatch) {
        if (event.status === 'breached') {
          breachedGroupHashes.add(event.group_hash);
        } else if (event.status === 'recovered') {
          recoveredEventsByGroup.set(event.group_hash, event);
        }
      }

      const activeButAbsentGroups = activeGroups.filter(
        ({ group_hash }) => !breachedGroupHashes.has(group_hash)
      );

      if (activeButAbsentGroups.length === 0) {
        step.logger.debug({
          message: `[${step.name}] No active-but-absent groups for rule ${input.ruleId}`,
        });
        yield { type: 'continue', state };
        return;
      }

      const noDataQuery = getNoDataEsqlQuery(rule.query, rule.no_data_strategy);

      if (!noDataQuery) {
        step.logger.debug({
          message: `[${step.name}] No data-presence query available for rule ${input.ruleId}; skipping no-data handling`,
        });
        yield { type: 'continue', state };
        return;
      }

      const noDataQueryResult = await step.executeNoDataQuery({ rule, noDataQuery, input });

      const noDataGroupHashes = activeButAbsentGroups
        .filter(({ group_hash }) => !noDataQueryResult.groupHashes.has(group_hash))
        .map(({ group_hash }) => group_hash);

      const eventsToAppend: AlertEvent[] = [];

      step.applyNoDataStrategy({
        rule,
        noDataGroupHashes,
        recoveredEventsByGroup,
        eventsToAppend,
        scheduledTimestamp: input.scheduledAt,
        spaceId: input.spaceId,
      });

      const nextBatch = [...alertEventsBatch, ...eventsToAppend];

      yield {
        type: 'continue',
        state: { ...state, alertEventsBatch: nextBatch },
      };
    });
  }

  /**
   * Applies the rule's `no_data_strategy` for groups in the no-data partition.
   *
   * Recovery takes priority: groups that already have an upstream `recovered`
   * event are left untouched regardless of the strategy. Only groups without
   * a recovered event receive a `no_data` event.
   *
   * - `emit` / `last_known_status`: append a `no_data` event. The director
   *   FSM decides the next episode status based on the strategy.
   * - `recover`: append a `no_data` event. The director FSM applies the same
   *   transitions as a `recovered` event would, driving the episode toward
   *   recovery.
   */
  private applyNoDataStrategy({
    rule,
    noDataGroupHashes,
    recoveredEventsByGroup,
    eventsToAppend,
    scheduledTimestamp,
    spaceId,
  }: {
    rule: RuleResponse;
    noDataGroupHashes: string[];
    recoveredEventsByGroup: Map<string, AlertEvent>;
    eventsToAppend: AlertEvent[];
    scheduledTimestamp: string;
    spaceId: string;
  }): void {
    if (noDataGroupHashes.length === 0) return;

    // Recovery takes priority: skip groups that already have a recovered event.
    const groupsWithoutRecovery = noDataGroupHashes.filter(
      (groupHash) => !recoveredEventsByGroup.has(groupHash)
    );

    if (groupsWithoutRecovery.length === 0) return;

    eventsToAppend.push(
      ...buildNoDataAlertEvents({
        ruleId: rule.id,
        ruleVersion: 1,
        spaceId,
        groupHashes: groupsWithoutRecovery,
        scheduledTimestamp,
      })
    );
  }

  private async executeNoDataQuery({
    rule,
    noDataQuery,
    input,
  }: {
    rule: RuleResponse;
    noDataQuery: string;
    input: RuleExecutionInput;
  }): Promise<NoDataQueryResult> {
    const lookbackWindow = rule.schedule.lookback ?? rule.schedule.every;

    const queryPayload = getQueryPayload({
      query: noDataQuery,
      timeField: rule.time_field,
      lookbackWindow,
    });

    this.logger.debug({
      message: () =>
        `[${this.name}] Executing no-data query for rule ${input.ruleId} - ${stableStringify({
          query: noDataQuery,
          filter: queryPayload.filter,
          params: queryPayload.params,
        })}`,
    });

    try {
      const esqlResponse = await this.scopedQueryService.executeQuery({
        query: noDataQuery,
        filter: queryPayload.filter,
        params: queryPayload.params,
        abortSignal: input.executionContext.signal,
      });

      return collectRowsFromNoDataQueryResponse({
        rule,
        esqlResponse,
      });
    } catch (error) {
      if (isEsqlUserError(error)) {
        throw createTaskRunError(error as Error, TaskErrorSource.USER);
      }
      throw error;
    }
  }
}

interface NoDataQueryResult {
  groupHashes: Set<string>;
}
function collectRowsFromNoDataQueryResponse({
  rule,
  esqlResponse,
}: {
  rule: RuleResponse;
  esqlResponse: EsqlQueryResponse;
}): NoDataQueryResult {
  const columns = esqlResponse.columns ?? [];
  const values = esqlResponse.values ?? [];

  if (columns.length === 0 || values.length === 0) {
    return { groupHashes: new Set() };
  }

  const groupingFields = rule.grouping?.fields ?? [];
  const groupHashes = new Set<string>();

  for (let i = 0; i < values.length; i++) {
    const rowDoc = rowToDocument(columns, values[i]);

    const hash = buildGroupHash({
      rowDoc,
      groupKeyFields: groupingFields,
      fallbackSeed: `no_data|row:${i}`,
    });

    groupHashes.add(hash);
  }

  return { groupHashes };
}
