/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { inject, injectable } from 'inversify';
import { PluginStart } from '@kbn/core-di';
import type { KibanaRequest } from '@kbn/core/server';
import { escapeQuotes, fromKueryExpression } from '@kbn/es-query';
import type {
  IEvent,
  IEventLogClientService,
  IEventLogger,
  IValidatedEvent,
} from '@kbn/event-log-plugin/server';
import type { PolicyExecutionOutcome } from '@kbn/alerting-v2-schemas';
import { ACTION_POLICY_SAVED_OBJECT_TYPE } from '../../../saved_objects';
import {
  ACTION_POLICY_EVENT_ACTIONS,
  ACTION_POLICY_EVENT_PROVIDER,
} from '../../dispatcher/steps/constants';
import type { AlertingServerStartDependencies } from '../../../types';
import { EventLoggerToken } from './tokens';

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_PAGE = 1;

interface ExecutionHistoryFilterParams {
  outcome?: PolicyExecutionOutcome;
  policyIds?: string[];
  ruleIds?: string[];
}

export const buildExecutionHistoryAuthFilter = ({
  outcome,
  policyIds,
  ruleIds,
}: ExecutionHistoryFilterParams = {}) => {
  const outcomeExpr =
    outcome === undefined
      ? `(event.action: ${ACTION_POLICY_EVENT_ACTIONS.DISPATCHED} OR event.action: ${ACTION_POLICY_EVENT_ACTIONS.THROTTLED})`
      : `event.action: ${outcome}`;

  const parts: string[] = [`event.provider: ${ACTION_POLICY_EVENT_PROVIDER}`, outcomeExpr];

  const idTerms = [...(policyIds ?? []), ...(ruleIds ?? [])];
  if (idTerms.length > 0) {
    // `kibana.saved_objects` is mapped as a nested field, so the id clause must use KQL nested
    // syntax (`parent: { child: ... }`). The spillover field `dispatcher.rule_ids` is a flat
    // keyword and is queried directly.
    const quoted = idTerms.map(quoteKqlValue).join(' OR ');
    const ruleIdQuoted = (ruleIds ?? []).map(quoteKqlValue).join(' OR ');
    const ruleSpilloverClause =
      ruleIdQuoted.length > 0
        ? ` OR kibana.alerting_v2.dispatcher.rule_ids: (${ruleIdQuoted})`
        : '';
    parts.push(`(kibana.saved_objects: { id: (${quoted}) }${ruleSpilloverClause})`);
  }

  return fromKueryExpression(parts.join(' AND '));
};

const quoteKqlValue = (value: string): string => `"${escapeQuotes(value)}"`;

export interface FindActionPolicyExecutionEventsParams {
  request: KibanaRequest;
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
  request: KibanaRequest;
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
}

@injectable()
export class EventLogService implements EventLogServiceContract {
  constructor(
    @inject(EventLoggerToken) private readonly eventLogger: IEventLogger,
    @inject(PluginStart<AlertingServerStartDependencies['eventLog']>('eventLog'))
    private readonly clientService: IEventLogClientService
  ) {}

  public logEvent(event: IEvent, id?: string): void {
    this.eventLogger.logEvent(event, id);
  }

  public async findActionPolicyExecutionEvents({
    request,
    spaceId,
    startDate,
    page = DEFAULT_PAGE,
    perPage = DEFAULT_PAGE_SIZE,
    outcome,
    policyIds,
    ruleIds,
  }: FindActionPolicyExecutionEventsParams): Promise<FindActionPolicyExecutionEventsResult> {
    const client = this.clientService.getClient(request);

    const result = await client.findEventsWithAuthFilter(
      ACTION_POLICY_SAVED_OBJECT_TYPE,
      [],
      buildExecutionHistoryAuthFilter({ outcome, policyIds, ruleIds }),
      spaceId,
      {
        page,
        per_page: perPage,
        sort: [{ sort_field: '@timestamp', sort_order: 'desc' }],
        start: startDate,
      }
    );

    return {
      events: result.data,
      page: result.page,
      perPage: result.per_page,
      total: result.total,
    };
  }

  public async countActionPolicyExecutionEventsSince({
    request,
    spaceId,
    since,
    outcome,
    policyIds,
    ruleIds,
  }: CountActionPolicyExecutionEventsSinceParams): Promise<CountActionPolicyExecutionEventsSinceResult> {
    const client = this.clientService.getClient(request);

    const result = await client.findEventsWithAuthFilter(
      ACTION_POLICY_SAVED_OBJECT_TYPE,
      [],
      buildExecutionHistoryAuthFilter({ outcome, policyIds, ruleIds }),
      spaceId,
      {
        page: 1,
        per_page: 0,
        sort: [{ sort_field: '@timestamp', sort_order: 'desc' }],
        start: since,
      }
    );

    return { count: result.total };
  }
}
