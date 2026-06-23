/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { inject, injectable } from 'inversify';
import type { HttpStart } from '@kbn/core/public';
import { CoreStart } from '@kbn/core-di-browser';
import type {
  CountPolicyExecutionEventsParams,
  CountPolicyExecutionEventsResponse,
  ListPolicyExecutionHistoryParams,
  ListPolicyExecutionHistoryResponse,
  PolicyExecutionHistoryItem,
  PolicyExecutionOutcomeFilter,
} from '@kbn/alerting-v2-schemas';
import {
  ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_API_PATH,
  ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_COUNT_API_PATH,
} from '../constants';

export type { PolicyExecutionHistoryItem, PolicyExecutionOutcomeFilter };

export type CountNewSinceParams = Omit<CountPolicyExecutionEventsParams, 'since'>;

@injectable()
export class ExecutionHistoryApi {
  constructor(@inject(CoreStart('http')) private readonly http: HttpStart) {}

  public async listExecutionHistory(params: ListPolicyExecutionHistoryParams = {}) {
    return this.http.get<ListPolicyExecutionHistoryResponse>(
      ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_API_PATH,
      {
        query: {
          page: params.page,
          perPage: params.perPage,
          search: params.search,
          outcome: params.outcome,
        },
      }
    );
  }

  public async countNewSince(since: string, params: CountNewSinceParams = {}) {
    return this.http.get<CountPolicyExecutionEventsResponse>(
      ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_COUNT_API_PATH,
      {
        query: { since, search: params.search, outcome: params.outcome },
      }
    );
  }
}
