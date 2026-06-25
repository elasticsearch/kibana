/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildScheduledActionResultsQuery } from './query.scheduled_action_results.dsl';
import type { ScheduledActionResultsRequestOptions } from '../../../../../common/search_strategy';
import { Direction, OsqueryQueries } from '../../../../../common/search_strategy';

interface TermFilter {
  term?: Record<string, unknown>;
}

describe('buildScheduledActionResultsQuery', () => {
  const defaultOptions: ScheduledActionResultsRequestOptions = {
    scheduleId: 'test-schedule-id',
    executionCount: 42,
    sort: { field: '@timestamp', direction: Direction.desc },
    pagination: { activePage: 0, cursorStart: 0, querySize: 20 },
    factoryQueryType: OsqueryQueries.scheduledActionResults,
    spaceId: 'default',
  };

  it('filters by schedule_id and schedule_execution_count', () => {
    const result = buildScheduledActionResultsQuery(defaultOptions);

    expect(result.query).toEqual({
      bool: {
        filter: [
          { term: { schedule_id: 'test-schedule-id' } },
          { term: { schedule_execution_count: 42 } },
        ],
      },
    });
  });

  it('queries the action responses data stream index', () => {
    const result = buildScheduledActionResultsQuery(defaultOptions);

    expect(result.index).toContain('logs-osquery_manager.action.responses');
  });

  it('includes aggregations for success/error counts and rows', () => {
    const result = buildScheduledActionResultsQuery(defaultOptions);
    const aggs = result.aggs as Record<string, Record<string, unknown>>;
    const globalAggs = aggs.aggs as Record<string, Record<string, unknown>>;
    const innerAggs = globalAggs.aggs as Record<string, Record<string, unknown>>;
    const responsesBySchedule = innerAggs.responses_by_schedule as Record<string, unknown>;

    expect(responsesBySchedule).toBeDefined();
    expect((responsesBySchedule.aggs as Record<string, unknown>).rows_count).toEqual({
      sum: { field: 'action_response.osquery.count' },
    });
    expect((responsesBySchedule.aggs as Record<string, unknown>).responses).toBeDefined();
  });

  it('applies pagination correctly', () => {
    const options: ScheduledActionResultsRequestOptions = {
      ...defaultOptions,
      pagination: { activePage: 2, cursorStart: 0, querySize: 10 },
    };

    const result = buildScheduledActionResultsQuery(options);

    expect(result.from).toBe(20);
    expect(result.size).toBe(10);
  });

  it('sorts by specified field and direction', () => {
    const options: ScheduledActionResultsRequestOptions = {
      ...defaultOptions,
      sort: { field: 'agent.id', direction: Direction.asc },
    };

    const result = buildScheduledActionResultsQuery(options);

    expect(result.sort).toEqual([{ 'agent.id': { order: 'asc' } }]);
  });

  it('scopes the aggregation by space_id when spaceId is provided', () => {
    const options: ScheduledActionResultsRequestOptions = {
      ...defaultOptions,
      spaceId: 'my-space',
    };

    const result = buildScheduledActionResultsQuery(options);

    expect(result.query).toEqual({
      bool: {
        filter: [
          { term: { schedule_id: 'test-schedule-id' } },
          { term: { schedule_execution_count: 42 } },
        ],
      },
    });

    const aggs = result.aggs as Record<string, Record<string, unknown>>;
    const globalAggs = aggs.aggs as Record<string, Record<string, unknown>>;
    const innerAggs = globalAggs.aggs as Record<string, Record<string, unknown>>;
    const responsesBySchedule = innerAggs.responses_by_schedule as Record<string, unknown>;
    const filter = responsesBySchedule.filter as Record<string, Record<string, TermFilter[]>>;
    const mustFilters = filter.bool.must;
    expect(mustFilters).toContainEqual({ term: { space_id: 'my-space' } });
  });

  it('matches default space OR missing space_id when spaceId is "default"', () => {
    // osquerybeat-written scheduled responses may not carry a space_id field;
    // in the default space we must match those legacy docs too (mirrors the
    // history aggregation in buildScheduledResponsesQuery).
    const options: ScheduledActionResultsRequestOptions = {
      ...defaultOptions,
      spaceId: 'default',
    };

    const result = buildScheduledActionResultsQuery(options);

    const defaultSpaceClause = {
      bool: {
        should: [
          { term: { space_id: 'default' } },
          { bool: { must_not: { exists: { field: 'space_id' } } } },
        ],
      },
    };

    expect(result.query).toEqual({
      bool: {
        filter: [
          { term: { schedule_id: 'test-schedule-id' } },
          { term: { schedule_execution_count: 42 } },
        ],
      },
    });

    const aggs = result.aggs as Record<string, Record<string, unknown>>;
    const globalAggs = aggs.aggs as Record<string, Record<string, unknown>>;
    const innerAggs = globalAggs.aggs as Record<string, Record<string, unknown>>;
    const responsesBySchedule = innerAggs.responses_by_schedule as Record<string, unknown>;
    const mustFilters = (responsesBySchedule.filter as { bool: { must: unknown[] } }).bool.must;
    expect(mustFilters).toContainEqual(defaultSpaceClause);
  });

  it('does not scope the top-level query (centralized in the search strategy)', () => {
    const result = buildScheduledActionResultsQuery(defaultOptions);
    const filterQuery = result.query as Record<string, Record<string, TermFilter[]>>;
    const filters = filterQuery.bool.filter;
    const hasSpaceFilter = filters.some((f) => f.term && 'space_id' in f.term);

    expect(hasSpaceFilter).toBe(false);
  });

  it('scopes the aggregation by space_id', () => {
    // The aggregation runs in its own (global) filter context that the central
    // enforceSpaceScope does not reach, so it carries a space_id clause itself.
    const result = buildScheduledActionResultsQuery({ ...defaultOptions, spaceId: 'my-space' });
    const aggs = result.aggs as Record<string, Record<string, unknown>>;
    const globalAggs = aggs.aggs as Record<string, Record<string, unknown>>;
    const innerAggs = globalAggs.aggs as Record<string, Record<string, unknown>>;
    const responsesBySchedule = innerAggs.responses_by_schedule as Record<string, unknown>;
    const mustFilters = (responsesBySchedule.filter as { bool: { must: unknown[] } }).bool.must;

    expect(mustFilters).toContainEqual({ term: { space_id: 'my-space' } });
  });

  it('prefixes index with *: when ccsEnabled is true', () => {
    const result = buildScheduledActionResultsQuery({ ...defaultOptions, ccsEnabled: true });

    expect(result.index).toBe(
      'logs-osquery_manager.action.responses*,*:logs-osquery_manager.action.responses*'
    );
  });

  it('does not prefix index when ccsEnabled is false', () => {
    const result = buildScheduledActionResultsQuery({ ...defaultOptions, ccsEnabled: false });

    expect(result.index).toBe('logs-osquery_manager.action.responses*');
  });
});
