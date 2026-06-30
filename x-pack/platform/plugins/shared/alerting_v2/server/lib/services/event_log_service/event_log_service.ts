/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { inject, injectable } from 'inversify';
import { PluginSetup } from '@kbn/core-di';
import type { ElasticsearchClient } from '@kbn/core/server';
import type {
  IEvent,
  IEventLogger,
  IEventLogService,
  IValidatedEvent,
} from '@kbn/event-log-plugin/server';
import type { PolicyExecutionOutcome } from '@kbn/alerting-v2-schemas';
import type { AlertingServerSetupDependencies } from '../../../types';
import { EsServiceInternalToken } from '../es_service/tokens';
import { LoggerServiceToken, type LoggerServiceContract } from '../logger_service/logger_service';
import { ALERTING_V2_LOG_CODES } from '../../errors/error_codes';
import { EventLoggerToken } from './tokens';
import {
  buildCountActionPolicyEventsQuery,
  buildFindActionPolicyEventsQuery,
} from './queries/action_policy_events_query';
import { buildRuleExecutionsQuery } from './queries/rule_executions_query';
import { normalizeRuleExecution } from './normalizers/rule_execution_normalizer';
import type { FindRuleExecutionsQuery, PaginatedResult, RuleExecution } from './types';

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_PAGE = 1;

export interface FindActionPolicyExecutionEventsParams {
  spaceId: string;
  startDate: string;
  page?: number;
  perPage?: number;
  outcome?: PolicyExecutionOutcome;
  policyIds?: string[];
  ruleIds?: string[];
}

export interface FindActionPolicyExecutionEventsResult {
  events: IValidatedEvent[];
  page: number;
  perPage: number;
  total: number;
}

export interface CountActionPolicyExecutionEventsSinceParams {
  spaceId: string;
  since: string;
  outcome?: PolicyExecutionOutcome;
  policyIds?: string[];
  ruleIds?: string[];
}

export interface CountActionPolicyExecutionEventsSinceResult {
  count: number;
}

export interface EventLogServiceContract {
  logEvent(event: IEvent, id?: string): void;
  findActionPolicyExecutionEvents(
    params: FindActionPolicyExecutionEventsParams
  ): Promise<FindActionPolicyExecutionEventsResult>;
  countActionPolicyExecutionEventsSince(
    params: CountActionPolicyExecutionEventsSinceParams
  ): Promise<CountActionPolicyExecutionEventsSinceResult>;
  findRuleExecutions(query: FindRuleExecutionsQuery): Promise<PaginatedResult<RuleExecution>>;
}

@injectable()
export class EventLogService implements EventLogServiceContract {
  constructor(
    @inject(EventLoggerToken) private readonly eventLogger: IEventLogger,
    @inject(PluginSetup<AlertingServerSetupDependencies['eventLog']>('eventLog'))
    private readonly eventLogService: IEventLogService,
    @inject(EsServiceInternalToken) private readonly esClient: ElasticsearchClient,
    @inject(LoggerServiceToken) private readonly logger: LoggerServiceContract
  ) {}

  public logEvent(event: IEvent, id?: string): void {
    this.eventLogger.logEvent(event, id);
  }

  public async findActionPolicyExecutionEvents({
    spaceId,
    startDate,
    page = DEFAULT_PAGE,
    perPage = DEFAULT_PAGE_SIZE,
    outcome,
    policyIds,
    ruleIds,
  }: FindActionPolicyExecutionEventsParams): Promise<FindActionPolicyExecutionEventsResult> {
    const body = buildFindActionPolicyEventsQuery({
      spaceId,
      startDate,
      outcome,
      policyIds,
      ruleIds,
      page,
      perPage,
    });
    const index = this.eventLogService.getIndexPattern();

    const response = await this.esClient.search<IValidatedEvent>({ index, ...body });

    const events = response.hits.hits.map((hit) => hit._source as IValidatedEvent);

    return {
      events,
      page,
      perPage,
      total: extractTotal(response.hits.total),
    };
  }

  public async countActionPolicyExecutionEventsSince({
    spaceId,
    since,
    outcome,
    policyIds,
    ruleIds,
  }: CountActionPolicyExecutionEventsSinceParams): Promise<CountActionPolicyExecutionEventsSinceResult> {
    const body = buildCountActionPolicyEventsQuery({
      spaceId,
      startDate: since,
      outcome,
      policyIds,
      ruleIds,
    });
    const index = this.eventLogService.getIndexPattern();

    const response = await this.esClient.search<IValidatedEvent>({ index, ...body });

    return { count: extractTotal(response.hits.total) };
  }

  /**
   * Reads `task-run` events for alerting_v2 rule executor tasks from the
   * event log service.
   *
   * Implementation goes directly against ES with the index pattern resolved
   * from {@link IEventLogService.getIndexPattern} so we adapt to event-log
   * index versioning automatically.
   */
  public async findRuleExecutions(
    query: FindRuleExecutionsQuery
  ): Promise<PaginatedResult<RuleExecution>> {
    const index = this.eventLogService.getIndexPattern();
    const body = buildRuleExecutionsQuery(query);

    const response = await this.esClient.search<IValidatedEvent>({ index, ...body });

    const items: RuleExecution[] = [];

    for (const hit of response.hits.hits) {
      const normalized = normalizeRuleExecution(hit._id, hit._source as IValidatedEvent);
      if (normalized !== null) {
        items.push(normalized);
      }
    }

    const droppedCount = response.hits.hits.length - items.length;

    if (droppedCount > 0) {
      // Defense-in-depth signal — `buildRuleExecutionsQuery` filters out
      // every shape the normalizer would reject (missing `event.start` /
      // `event.end`, out-of-set `event.outcome`, wrong task-id prefix), so
      // this branch should never run in steady state. Emission of the log
      // code points at either upstream schema drift in Task Manager or a
      // filter in the query that has fallen out of sync with the
      // normalizer.
      this.logger.error({
        error: new Error(
          `Dropped ${droppedCount} of ${response.hits.hits.length} task-run hit(s) on the rule executions read path. The normalizer rejected rows the ES query is supposed to have excluded. Investigate Task Manager schema drift or rule_executions_query filter coverage.`
        ),
        code: ALERTING_V2_LOG_CODES.EXECUTION_HISTORY_NORMALIZER_REJECTED_EVENTS,
      });
    }

    return {
      items,
      total: extractTotal(response.hits.total),
      page: query.page,
      perPage: query.perPage,
    };
  }
}

/**
 * Reads either the plain number (legacy clients) or the `{ value, relation }`
 * object that ES returns under `hits.total`. When `track_total_hits` is left
 * to its default, the relation may be `gte` with a capped value; we surface
 * that capped number unchanged.
 */
const extractTotal = (
  total: number | { value: number; relation?: 'eq' | 'gte' } | undefined
): number => {
  if (typeof total === 'number') return total;
  return total?.value ?? 0;
};
