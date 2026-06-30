/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SearchRequest, QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { PolicyExecutionOutcome } from '@kbn/alerting-v2-schemas';
import {
  ACTION_POLICY_SAVED_OBJECT_TYPE,
  RULE_SAVED_OBJECT_TYPE,
} from '../../../../../common/saved_object_types';
import {
  ACTION_POLICY_EVENT_ACTIONS,
  ACTION_POLICY_EVENT_PROVIDER,
} from '../../../dispatcher/steps/constants';

/**
 * Filter inputs shared by the find and count action-policy event queries.
 *
 * `outcome` narrows `event.action` to a single action (`dispatched` |
 * `throttled`). When omitted, both are matched. `policyIds` / `ruleIds`,
 * when provided, must match an entry in the nested `kibana.saved_objects`
 * array — or, for rules only, in the top-level
 * `kibana.alerting_v2.dispatcher.rule_ids` spillover field that the
 * dispatcher writes when a single event exceeds the nested ref cap (see
 * `store_execution_history_step.ts:157`).
 */
export interface BuildActionPolicyEventsQueryParams {
  spaceId: string;
  /** Inclusive lower bound applied to `@timestamp`. */
  startDate: string;
  outcome?: PolicyExecutionOutcome;
  policyIds?: string[];
  ruleIds?: string[];
}

/**
 * Extra inputs the find query needs on top of the shared filters.
 */
export interface BuildFindActionPolicyEventsQueryParams extends BuildActionPolicyEventsQueryParams {
  /** 1-based page number. */
  page: number;
  perPage: number;
}

/**
 * Builds the Elasticsearch search request body for a *find* read of the
 * action-policy execution history. Returns a hit window sized by `page`
 * and `perPage`.
 *
 * See {@link buildBaseActionPolicyEventsQuery} for the shared filter and
 * sort logic.
 */
export const buildFindActionPolicyEventsQuery = (
  params: BuildFindActionPolicyEventsQueryParams
): SearchRequest => ({
  ...buildBaseActionPolicyEventsQuery(params),
  from: (params.page - 1) * params.perPage,
  size: params.perPage,
});

/**
 * Builds the Elasticsearch search request body for a *count* read of the
 * action-policy execution history. `size: 0` keeps the response small;
 * the caller reads `hits.total.value`.
 *
 * See {@link buildBaseActionPolicyEventsQuery} for the shared filter and
 * sort logic.
 */
export const buildCountActionPolicyEventsQuery = (
  params: BuildActionPolicyEventsQueryParams
): SearchRequest => ({
  ...buildBaseActionPolicyEventsQuery(params),
  size: 0,
});

/**
 * Composes the filters, sort, and `track_total_hits` setting that both
 * the find and count queries share. Kept private to this module so the
 * two public entry points stay the only call sites — adding a third
 * query should go through this helper as well.
 *
 * The query reads documents emitted by `store_execution_history_step.ts`:
 *
 *  - `event.provider` is always `alerting_v2`.
 *  - `event.action` is one of `dispatched` / `throttled`.
 *  - `kibana.space_ids: [spaceId]` for cross-space isolation.
 *  - `kibana.saved_objects` (nested) holds policy + rule refs.
 *  - `kibana.alerting_v2.dispatcher.rule_ids` (top-level keyword) holds the
 *    rule-id spillover when the nested ref count would exceed the cap.
 *
 * Authorization is intentionally *not* enforced at this layer. The route
 * privilege (`executionHistory.read`) is the sole gate; see spec §6.4.
 *
 * `track_total_hits: true` is set so callers see precise counts (the count
 * query and the "new events since" badge depend on exact totals).
 */
const buildBaseActionPolicyEventsQuery = (
  params: BuildActionPolicyEventsQueryParams
): SearchRequest => {
  const filters: QueryDslQueryContainer[] = [
    { term: { 'event.provider': ACTION_POLICY_EVENT_PROVIDER } },
    { term: { 'kibana.space_ids': params.spaceId } },
    { range: { '@timestamp': { gte: params.startDate } } },
    actionFilter(params.outcome),
  ];

  const idFilter = buildIdFilter(params.policyIds, params.ruleIds);
  if (idFilter) {
    filters.push(idFilter);
  }

  return {
    query: { bool: { filter: filters } },
    sort: [{ '@timestamp': { order: 'desc' } }],
    track_total_hits: true,
  };
};

const actionFilter = (outcome: PolicyExecutionOutcome | undefined): QueryDslQueryContainer => {
  if (outcome === undefined) {
    return {
      terms: {
        'event.action': [
          ACTION_POLICY_EVENT_ACTIONS.DISPATCHED,
          ACTION_POLICY_EVENT_ACTIONS.THROTTLED,
        ],
      },
    };
  }

  return { term: { 'event.action': outcome } };
};

/**
 * Composes a single `bool.should` clause that matches when an event
 * references *any* of the provided ids — checking the nested
 * `kibana.saved_objects` array and the top-level rule-id spillover
 * (`kibana.alerting_v2.dispatcher.rule_ids`).
 *
 * Each event stores both policy *and* rule refs in the same nested array,
 * so the nested clauses must pin both `kibana.saved_objects.type` *and*
 * `kibana.saved_objects.id` — otherwise an id that happens to be shared
 * between a policy and a rule would match the wrong saved-object type.
 *
 * Returns `undefined` when there is nothing to filter on so callers can
 * skip pushing an empty clause.
 */
const buildIdFilter = (
  policyIds: string[] | undefined,
  ruleIds: string[] | undefined
): QueryDslQueryContainer | undefined => {
  const should: QueryDslQueryContainer[] = [];

  if (policyIds && policyIds.length > 0) {
    should.push(buildNestedSavedObjectClause(ACTION_POLICY_SAVED_OBJECT_TYPE, policyIds));
  }

  if (ruleIds && ruleIds.length > 0) {
    should.push(buildNestedSavedObjectClause(RULE_SAVED_OBJECT_TYPE, ruleIds));
    should.push({ terms: { 'kibana.alerting_v2.dispatcher.rule_ids': ruleIds } });
  }

  if (should.length === 0) return undefined;

  return { bool: { should, minimum_should_match: 1 } };
};

const buildNestedSavedObjectClause = (type: string, ids: string[]): QueryDslQueryContainer => ({
  nested: {
    path: 'kibana.saved_objects',
    query: {
      bool: {
        filter: [
          { term: { 'kibana.saved_objects.type': type } },
          { terms: { 'kibana.saved_objects.id': ids } },
        ],
      },
    },
  },
});
