/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { buildRuleExecutionsQuery } from './rule_executions_query';
import type { FindRuleExecutionsQuery } from '../types';

const baseQuery: FindRuleExecutionsQuery = {
  spaceId: 'default',
  page: 1,
  perPage: 20,
};

const filtersOf = (body: ReturnType<typeof buildRuleExecutionsQuery>): QueryDslQueryContainer[] => {
  return (body.query?.bool?.filter as QueryDslQueryContainer[]) ?? [];
};

const hasTermsOn = (field: string) => (filter: QueryDslQueryContainer | undefined) =>
  Boolean(filter?.terms && field in (filter.terms as object));

const hasPrefixOn = (field: string) => (filter: QueryDslQueryContainer | undefined) =>
  Boolean(filter?.prefix && field in (filter.prefix as object));

describe('buildRuleExecutionsQuery', () => {
  it('always filters on provider, task type and action', () => {
    const body = buildRuleExecutionsQuery(baseQuery);
    const filters = filtersOf(body);

    expect(filters).toEqual(
      expect.arrayContaining([
        { term: { 'event.provider': 'taskManager' } },
        { term: { 'kibana.task.type': 'alerting_v2:rule_executor' } },
        { term: { 'event.action': 'task-run' } },
      ])
    );
  });

  describe('space scoping', () => {
    it('always pushes a kibana.task.id prefix filter for the request space, even when ruleIds is omitted', () => {
      const filters = filtersOf(buildRuleExecutionsQuery({ ...baseQuery, spaceId: 'space-A' }));

      expect(filters).toEqual(
        expect.arrayContaining([
          { prefix: { 'kibana.task.id': 'alerting_v2:rule_executor:space-A:' } },
        ])
      );
    });

    it('still emits the space prefix when ruleIds is provided (terms narrows further within it)', () => {
      const filters = filtersOf(
        buildRuleExecutionsQuery({ ...baseQuery, spaceId: 'space-A', ruleIds: ['rule-x'] })
      );

      expect(filters.find(hasPrefixOn('kibana.task.id'))).toEqual({
        prefix: { 'kibana.task.id': 'alerting_v2:rule_executor:space-A:' },
      });
      expect(filters.find(hasTermsOn('kibana.task.id'))).toEqual({
        terms: { 'kibana.task.id': ['alerting_v2:rule_executor:space-A:rule-x'] },
      });
    });

    it('cross-space regression: a no-ruleIds query in space A cannot match task ids from space B', () => {
      const filters = filtersOf(buildRuleExecutionsQuery({ ...baseQuery, spaceId: 'space-A' }));
      const prefixFilter = filters.find(hasPrefixOn('kibana.task.id'));

      expect(prefixFilter).toBeDefined();
      const prefixValue = (prefixFilter?.prefix as Record<string, string>)['kibana.task.id'];

      // The space prefix is the only thing carrying the request space when
      // ruleIds is absent — Task Manager's task-run events have no
      // kibana.space_ids. Concretely: space-B task ids must NOT start with
      // the space-A prefix, and vice versa.
      expect('alerting_v2:rule_executor:space-B:rule-1'.startsWith(prefixValue)).toBe(false);
      expect('alerting_v2:rule_executor:space-A:rule-1'.startsWith(prefixValue)).toBe(true);
    });
  });

  it('does not include a kibana.task.id terms filter when ruleIds is omitted', () => {
    const filters = filtersOf(buildRuleExecutionsQuery(baseQuery));
    expect(filters.find(hasTermsOn('kibana.task.id'))).toBeUndefined();
  });

  it('encodes spaceId+ruleIds as a kibana.task.id terms filter', () => {
    const filters = filtersOf(
      buildRuleExecutionsQuery({ ...baseQuery, spaceId: 'space-1', ruleIds: ['rule-a', 'rule-b'] })
    );

    expect(filters).toEqual(
      expect.arrayContaining([
        {
          terms: {
            'kibana.task.id': [
              'alerting_v2:rule_executor:space-1:rule-a',
              'alerting_v2:rule_executor:space-1:rule-b',
            ],
          },
        },
      ])
    );
  });

  it('does not emit a task-id filter when ruleIds is an empty array', () => {
    const filters = filtersOf(buildRuleExecutionsQuery({ ...baseQuery, ruleIds: [] }));
    expect(filters.find(hasTermsOn('kibana.task.id'))).toBeUndefined();
  });

  describe('outcome filter', () => {
    it('pins event.outcome to the structurally-valid set when no caller filter is given', () => {
      const filters = filtersOf(buildRuleExecutionsQuery(baseQuery));
      expect(filters.find(hasTermsOn('event.outcome'))).toEqual({
        terms: { 'event.outcome': ['success', 'failure'] },
      });
    });

    it('pins event.outcome to the structurally-valid set when outcomes is an empty array', () => {
      const filters = filtersOf(buildRuleExecutionsQuery({ ...baseQuery, outcomes: [] }));
      expect(filters.find(hasTermsOn('event.outcome'))).toEqual({
        terms: { 'event.outcome': ['success', 'failure'] },
      });
    });

    it('forwards the caller outcomes verbatim when narrower than the structurally-valid set', () => {
      const filters = filtersOf(buildRuleExecutionsQuery({ ...baseQuery, outcomes: ['success'] }));
      expect(filters.find(hasTermsOn('event.outcome'))).toEqual({
        terms: { 'event.outcome': ['success'] },
      });
    });
  });

  it('adds a range filter on event.start when from/to are provided', () => {
    const filters = filtersOf(
      buildRuleExecutionsQuery({
        ...baseQuery,
        from: '2026-06-01T00:00:00Z',
        to: '2026-06-02T00:00:00Z',
      })
    );
    expect(filters).toEqual(
      expect.arrayContaining([
        {
          range: {
            'event.start': { gte: '2026-06-01T00:00:00Z', lte: '2026-06-02T00:00:00Z' },
          },
        },
      ])
    );
  });

  it('honors a single-sided range (only from)', () => {
    const filters = filtersOf(
      buildRuleExecutionsQuery({ ...baseQuery, from: '2026-06-01T00:00:00Z' })
    );
    expect(filters).toEqual(
      expect.arrayContaining([{ range: { 'event.start': { gte: '2026-06-01T00:00:00Z' } } }])
    );
  });

  it('honors a single-sided range (only to)', () => {
    const filters = filtersOf(
      buildRuleExecutionsQuery({ ...baseQuery, to: '2026-06-02T00:00:00Z' })
    );
    expect(filters).toEqual(
      expect.arrayContaining([{ range: { 'event.start': { lte: '2026-06-02T00:00:00Z' } } }])
    );
  });

  it('defaults sort to event.start desc', () => {
    const body = buildRuleExecutionsQuery(baseQuery);
    expect(body.sort).toEqual([{ 'event.start': { order: 'desc' } }]);
  });

  it('maps duration sort to event.duration', () => {
    const body = buildRuleExecutionsQuery({ ...baseQuery, sort: 'duration', sortOrder: 'asc' });
    expect(body.sort).toEqual([{ 'event.duration': { order: 'asc' } }]);
  });

  it('computes from/size from page+perPage', () => {
    const body = buildRuleExecutionsQuery({ ...baseQuery, page: 3, perPage: 25 });
    expect(body.from).toBe(50);
    expect(body.size).toBe(25);
  });

  it('uses from=0 on page 1', () => {
    const body = buildRuleExecutionsQuery({ ...baseQuery, page: 1, perPage: 50 });
    expect(body.from).toBe(0);
    expect(body.size).toBe(50);
  });
});
