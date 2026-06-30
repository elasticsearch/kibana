/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer, SearchRequest } from '@elastic/elasticsearch/lib/api/types';
import {
  ACTION_POLICY_EVENT_ACTIONS,
  ACTION_POLICY_EVENT_PROVIDER,
} from '../../../dispatcher/steps/constants';
import {
  buildCountActionPolicyEventsQuery,
  buildFindActionPolicyEventsQuery,
} from './action_policy_events_query';

const SINCE = '2026-05-04T00:00:00Z';

const filtersOf = (body: SearchRequest) =>
  ((body.query as { bool: { filter: QueryDslQueryContainer[] } }).bool.filter ??
    []) as QueryDslQueryContainer[];

const hasTermsOn = (field: string) => (filter: QueryDslQueryContainer | undefined) =>
  Boolean(filter?.terms && field in (filter.terms as object));

const hasBoolShould = (filter: QueryDslQueryContainer | undefined) =>
  Boolean(filter?.bool && Array.isArray(filter.bool.should));

const baseParams = { spaceId: 'default', startDate: SINCE } as const;

/**
 * The find and count queries share their filter and sort logic (see
 * `buildBaseActionPolicyEventsQuery`). We exercise the shared logic via
 * the count helper because it has fewer required params, then verify the
 * find/count-specific bits in dedicated blocks below.
 */
describe('action policy events queries', () => {
  describe('shared filters (verified via the count helper)', () => {
    it('always filters on event.provider=alerting_v2 and the request space id', () => {
      const filters = filtersOf(buildCountActionPolicyEventsQuery(baseParams));
      expect(filters).toEqual(
        expect.arrayContaining([
          { term: { 'event.provider': ACTION_POLICY_EVENT_PROVIDER } },
          { term: { 'kibana.space_ids': 'default' } },
        ])
      );
    });

    it('forwards the provided space id into the kibana.space_ids term filter', () => {
      const filters = filtersOf(
        buildCountActionPolicyEventsQuery({ ...baseParams, spaceId: 'my-space' })
      );
      expect(filters).toEqual(
        expect.arrayContaining([{ term: { 'kibana.space_ids': 'my-space' } }])
      );
    });

    it('applies @timestamp >= startDate as a range filter', () => {
      const filters = filtersOf(buildCountActionPolicyEventsQuery(baseParams));
      expect(filters).toEqual(
        expect.arrayContaining([{ range: { '@timestamp': { gte: SINCE } } }])
      );
    });

    it('matches both dispatched and throttled when outcome is omitted', () => {
      const filters = filtersOf(buildCountActionPolicyEventsQuery(baseParams));
      expect(filters).toEqual(
        expect.arrayContaining([
          {
            terms: {
              'event.action': [
                ACTION_POLICY_EVENT_ACTIONS.DISPATCHED,
                ACTION_POLICY_EVENT_ACTIONS.THROTTLED,
              ],
            },
          },
        ])
      );
    });

    it('narrows to a single action when outcome is provided', () => {
      const filters = filtersOf(
        buildCountActionPolicyEventsQuery({ ...baseParams, outcome: 'throttled' })
      );
      expect(filters).toEqual(expect.arrayContaining([{ term: { 'event.action': 'throttled' } }]));
      expect(filters.find(hasTermsOn('event.action'))).toBeUndefined();
    });

    it('omits the id clause when no ids are provided', () => {
      const filters = filtersOf(buildCountActionPolicyEventsQuery(baseParams));
      expect(filters.find(hasBoolShould)).toBeUndefined();
    });

    it('omits the id clause when both id arrays are empty', () => {
      const filters = filtersOf(
        buildCountActionPolicyEventsQuery({ ...baseParams, policyIds: [], ruleIds: [] })
      );
      expect(filters.find(hasBoolShould)).toBeUndefined();
    });

    it('matches policy ids against the action_policy saved-object type only', () => {
      const filters = filtersOf(
        buildCountActionPolicyEventsQuery({ ...baseParams, policyIds: ['p1'] })
      );
      const boolFilter = filters.find(hasBoolShould);
      expect(boolFilter).toBeDefined();
      const should = (boolFilter?.bool?.should ?? []) as QueryDslQueryContainer[];
      expect(should).toEqual(
        expect.arrayContaining([
          {
            nested: {
              path: 'kibana.saved_objects',
              query: {
                bool: {
                  filter: [
                    { term: { 'kibana.saved_objects.type': 'alerting_action_policy' } },
                    { terms: { 'kibana.saved_objects.id': ['p1'] } },
                  ],
                },
              },
            },
          },
        ])
      );
    });

    it('matches rule ids against the alerting_rule saved-object type only', () => {
      const filters = filtersOf(
        buildCountActionPolicyEventsQuery({ ...baseParams, ruleIds: ['r1', 'r2'] })
      );
      const boolFilter = filters.find(hasBoolShould);
      const should = (boolFilter?.bool?.should ?? []) as QueryDslQueryContainer[];
      expect(should).toEqual(
        expect.arrayContaining([
          {
            nested: {
              path: 'kibana.saved_objects',
              query: {
                bool: {
                  filter: [
                    { term: { 'kibana.saved_objects.type': 'alerting_rule' } },
                    { terms: { 'kibana.saved_objects.id': ['r1', 'r2'] } },
                  ],
                },
              },
            },
          },
        ])
      );
    });

    it('keeps policy and rule nested clauses separate so a shared id never crosses types', () => {
      const filters = filtersOf(
        buildCountActionPolicyEventsQuery({
          ...baseParams,
          policyIds: ['shared-id'],
          ruleIds: ['shared-id'],
        })
      );
      const should = (filters.find(hasBoolShould)?.bool?.should ?? []) as QueryDslQueryContainer[];
      // Two type-keyed nested clauses — the shared id is projected onto
      // each SO type separately, never as a single clause that lets the
      // id match across types.
      expect(should).toEqual(
        expect.arrayContaining([
          {
            nested: {
              path: 'kibana.saved_objects',
              query: {
                bool: {
                  filter: [
                    { term: { 'kibana.saved_objects.type': 'alerting_action_policy' } },
                    { terms: { 'kibana.saved_objects.id': ['shared-id'] } },
                  ],
                },
              },
            },
          },
          {
            nested: {
              path: 'kibana.saved_objects',
              query: {
                bool: {
                  filter: [
                    { term: { 'kibana.saved_objects.type': 'alerting_rule' } },
                    { terms: { 'kibana.saved_objects.id': ['shared-id'] } },
                  ],
                },
              },
            },
          },
        ])
      );
    });

    it('adds a rule_ids spillover clause only when ruleIds are provided', () => {
      const filtersWithRules = filtersOf(
        buildCountActionPolicyEventsQuery({ ...baseParams, ruleIds: ['r1'] })
      );
      const filtersWithoutRules = filtersOf(
        buildCountActionPolicyEventsQuery({ ...baseParams, policyIds: ['p1'] })
      );

      const withShould = (filtersWithRules.find(hasBoolShould)?.bool?.should ??
        []) as QueryDslQueryContainer[];
      const withoutShould = (filtersWithoutRules.find(hasBoolShould)?.bool?.should ??
        []) as QueryDslQueryContainer[];

      expect(withShould).toEqual(
        expect.arrayContaining([{ terms: { 'kibana.alerting_v2.dispatcher.rule_ids': ['r1'] } }])
      );
      expect(
        withoutShould.find((clause) =>
          Boolean(
            clause?.terms && 'kibana.alerting_v2.dispatcher.rule_ids' in (clause.terms as object)
          )
        )
      ).toBeUndefined();
    });

    it('uses minimum_should_match=1 on the should clause', () => {
      const filters = filtersOf(
        buildCountActionPolicyEventsQuery({ ...baseParams, ruleIds: ['r1'] })
      );
      const boolFilter = filters.find(hasBoolShould);
      expect(boolFilter?.bool?.minimum_should_match).toBe(1);
    });

    it('sorts by @timestamp desc', () => {
      const body = buildCountActionPolicyEventsQuery(baseParams);
      expect(body.sort).toEqual([{ '@timestamp': { order: 'desc' } }]);
    });

    it('always sets track_total_hits=true on both helpers', () => {
      const find = buildFindActionPolicyEventsQuery({ ...baseParams, page: 1, perPage: 25 });
      const count = buildCountActionPolicyEventsQuery(baseParams);
      expect(find.track_total_hits).toBe(true);
      expect(count.track_total_hits).toBe(true);
    });
  });

  describe('buildFindActionPolicyEventsQuery', () => {
    it('translates page/perPage into from/size', () => {
      const body = buildFindActionPolicyEventsQuery({ ...baseParams, page: 3, perPage: 25 });
      expect(body.from).toBe(50);
      expect(body.size).toBe(25);
    });

    it('treats page=1 as from=0', () => {
      const body = buildFindActionPolicyEventsQuery({ ...baseParams, page: 1, perPage: 20 });
      expect(body.from).toBe(0);
      expect(body.size).toBe(20);
    });
  });

  describe('buildCountActionPolicyEventsQuery', () => {
    it('sets size=0 and omits from', () => {
      const body = buildCountActionPolicyEventsQuery(baseParams);
      expect(body.size).toBe(0);
      expect(body.from).toBeUndefined();
    });
  });
});
