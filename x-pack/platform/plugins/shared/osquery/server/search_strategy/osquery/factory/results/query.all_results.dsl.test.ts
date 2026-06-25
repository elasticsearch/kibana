/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment/moment';
import { buildResultsQuery } from './query.all_results.dsl';
import { Direction, type ResultsRequestOptions } from '../../../../../common/search_strategy';

// Mock the utility functions

jest.mock('../../../../utils/build_query', () => ({
  getQueryFilter: jest.fn(({ filter }: { filter: string }) => ({
    query_string: {
      query: filter,
    },
  })),
}));

describe('buildResultsQuery', () => {
  describe('basic functionality', () => {
    it('should build query with minimal required parameters', () => {
      const options: ResultsRequestOptions = {
        actionId: 'action-123',
        pagination: {
          activePage: 0,
          querySize: 100,
          cursorStart: 0,
        },
        sort: [
          {
            field: '@timestamp',
            direction: Direction.desc,
          },
        ],
        kuery: '',
      };

      const result = buildResultsQuery(options);

      expect(result).toEqual({
        allow_no_indices: true,
        index: 'logs-osquery_manager.result*',
        ignore_unavailable: true,
        aggs: {
          count_by_agent_id: {
            terms: {
              field: 'elastic_agent.id',
              size: 10000,
            },
          },
          unique_agents: {
            cardinality: {
              field: 'elastic_agent.id',
            },
          },
        },
        query: {
          bool: {
            filter: [
              {
                query_string: {
                  query: 'action_id: action-123',
                },
              },
            ],
          },
        },
        from: 0,
        size: 100,
        track_total_hits: true,
        fields: ['elastic_agent.*', 'agent.*', 'osquery.*'],
        sort: [
          {
            '@timestamp': {
              order: 'desc',
            },
          },
        ],
      });
    });

    it('should build query with agentId filter', () => {
      const options: ResultsRequestOptions = {
        actionId: 'action-456',
        agentId: 'agent-789',
        pagination: {
          activePage: 1,
          querySize: 50,
          cursorStart: 0,
        },
        sort: [
          {
            field: 'agent.name',
            direction: Direction.asc,
          },
        ],
        kuery: '',
      };

      const result = buildResultsQuery(options);

      expect(result.query).toEqual({
        bool: {
          filter: [
            {
              query_string: {
                query: 'action_id: action-456 AND agent.id: agent-789',
              },
            },
          ],
        },
      });
      expect(result.from).toBe(50); // activePage * querySize
      expect(result.size).toBe(50);
    });

    it('should build query with kuery filter', () => {
      const options: ResultsRequestOptions = {
        actionId: 'action-abc',
        pagination: {
          activePage: 0,
          querySize: 25,
          cursorStart: 0,
        },
        sort: [],
        kuery: 'osquery.calendarTime: *',
      };

      const result = buildResultsQuery(options);

      expect(result.query).toEqual({
        bool: {
          filter: [
            {
              query_string: {
                query: 'action_id: action-abc AND osquery.calendarTime: *',
              },
            },
          ],
        },
      });
      expect(result.sort).toEqual([]);
    });

    it('should build query with time range filter using event.ingested', () => {
      const startDate = '2024-01-01T00:00:00.000Z';
      const expectedEndDate = moment(startDate).clone().add(30, 'minutes').toISOString();

      const options: ResultsRequestOptions = {
        actionId: 'action-time',
        startDate,
        pagination: {
          activePage: 0,
          querySize: 10,
          cursorStart: 0,
        },
        sort: [
          {
            field: '@timestamp',
            direction: Direction.desc,
          },
        ],
        kuery: '',
      };

      const result = buildResultsQuery(options);

      expect(result.query).toEqual({
        bool: {
          filter: [
            {
              range: {
                'event.ingested': {
                  gte: startDate,
                  lte: expectedEndDate,
                },
              },
            },
            {
              query_string: {
                query: 'action_id: action-time',
              },
            },
          ],
        },
      });
    });

    it('should build query with integration namespaces', () => {
      const options: ResultsRequestOptions = {
        actionId: 'action-namespaced',
        pagination: {
          activePage: 0,
          querySize: 20,
          cursorStart: 0,
        },
        sort: [
          {
            field: 'agent.id',
            direction: Direction.asc,
          },
        ],
        kuery: '',
        integrationNamespaces: ['namespace1', 'namespace2'],
      };

      const result = buildResultsQuery(options);

      expect(result.index).toBe(
        'logs-osquery_manager.result-namespace1,logs-osquery_manager.result-namespace2'
      );
    });

    it('should build query with all options combined', () => {
      const startDate = '2024-06-15T10:30:00.000Z';
      const expectedEndDate = moment(startDate).clone().add(30, 'minutes').toISOString();

      const options: ResultsRequestOptions = {
        actionId: 'action-full',
        agentId: 'agent-complete',
        startDate,
        pagination: {
          activePage: 2,
          querySize: 75,
          cursorStart: 0,
        },
        sort: [
          {
            field: 'osquery.counter',
            direction: Direction.desc,
          },
          {
            field: '@timestamp',
            direction: Direction.asc,
          },
        ],
        kuery: 'agent.name: "test-agent" AND osquery.action: "executed"',
        integrationNamespaces: ['prod', 'staging'],
      };

      const result = buildResultsQuery(options);

      expect(result).toEqual({
        allow_no_indices: true,
        index: 'logs-osquery_manager.result-prod,logs-osquery_manager.result-staging',
        ignore_unavailable: true,
        aggs: {
          count_by_agent_id: {
            terms: {
              field: 'elastic_agent.id',
              size: 10000,
            },
          },
          unique_agents: {
            cardinality: {
              field: 'elastic_agent.id',
            },
          },
        },
        query: {
          bool: {
            filter: [
              {
                range: {
                  'event.ingested': {
                    gte: startDate,
                    lte: expectedEndDate,
                  },
                },
              },
              {
                query_string: {
                  query:
                    'action_id: action-full AND agent.id: agent-complete AND agent.name: "test-agent" AND osquery.action: "executed"',
                },
              },
            ],
          },
        },
        from: 150, // activePage (2) * querySize (75)
        size: 75,
        track_total_hits: true,
        fields: ['elastic_agent.*', 'agent.*', 'osquery.*'],
        sort: [
          {
            'osquery.counter': {
              order: 'desc',
            },
          },
          {
            '@timestamp': {
              order: 'asc',
            },
          },
        ],
      });
    });
  });

  describe('CCS support', () => {
    const basePagination = { activePage: 0, querySize: 10, cursorStart: 0 };
    const baseSort = [{ field: '@timestamp' as const, direction: Direction.desc }];

    it('should include remote cluster patterns when ccsEnabled is true', () => {
      const options: ResultsRequestOptions = {
        actionId: 'action-ccs',
        pagination: basePagination,
        sort: baseSort,
        ccsEnabled: true,
      };

      const result = buildResultsQuery(options);

      expect(result.index).toBe('logs-osquery_manager.result*,*:logs-osquery_manager.result*');
    });

    it('should include remote cluster patterns for each namespace when ccsEnabled is true', () => {
      const options: ResultsRequestOptions = {
        actionId: 'action-ccs',
        pagination: basePagination,
        sort: baseSort,
        integrationNamespaces: ['default', 'ns1'],
        ccsEnabled: true,
      };

      const result = buildResultsQuery(options);

      expect(result.index).toBe(
        'logs-osquery_manager.result-default,logs-osquery_manager.result-ns1,*:logs-osquery_manager.result-default,*:logs-osquery_manager.result-ns1'
      );
    });

    it('should not modify index when ccsEnabled is false', () => {
      const options: ResultsRequestOptions = {
        actionId: 'action-no-ccs',
        pagination: basePagination,
        sort: baseSort,
        ccsEnabled: false,
      };

      const result = buildResultsQuery(options);

      expect(result.index).toBe('logs-osquery_manager.result*');
    });
  });

  describe('esFilters handling', () => {
    it('includes positive esFilters in the bool.filter clause', () => {
      const positiveFilter = JSON.stringify([
        {
          meta: { type: 'phrase', key: 'osquery.uid', params: { query: '0' } },
          query: { match_phrase: { 'osquery.uid': '0' } },
        },
      ]);

      const options: ResultsRequestOptions = {
        actionId: 'action-123',
        esFilters: positiveFilter,
        pagination: { activePage: 0, querySize: 10, cursorStart: 0 },
        sort: [{ field: '@timestamp', direction: Direction.desc }],
      };

      const result = buildResultsQuery(options);
      const query = result.query as { bool: { filter: unknown[]; must_not?: unknown[] } };

      expect(query.bool.filter).toHaveLength(2);
      expect(query.bool.filter[1]).toEqual({ match_phrase: { 'osquery.uid': '0' } });
      expect(query.bool.must_not).toBeUndefined();
    });

    it('includes negated esFilters in the bool.must_not clause', () => {
      const negatedFilter = JSON.stringify([
        {
          meta: { negate: true, type: 'phrase', key: 'osquery.uid', params: { query: '0' } },
          query: { match_phrase: { 'osquery.uid': '0' } },
        },
      ]);

      const options: ResultsRequestOptions = {
        actionId: 'action-123',
        esFilters: negatedFilter,
        pagination: { activePage: 0, querySize: 10, cursorStart: 0 },
        sort: [{ field: '@timestamp', direction: Direction.desc }],
      };

      const result = buildResultsQuery(options);
      const query = result.query as { bool: { filter: unknown[]; must_not?: unknown[] } };

      expect(query.bool.filter).toHaveLength(1);
      expect(query.bool.must_not).toEqual([{ match_phrase: { 'osquery.uid': '0' } }]);
    });

    it('omits must_not key when no esFilters are negated', () => {
      const options: ResultsRequestOptions = {
        actionId: 'action-123',
        pagination: { activePage: 0, querySize: 10, cursorStart: 0 },
        sort: [{ field: '@timestamp', direction: Direction.desc }],
      };

      const result = buildResultsQuery(options);
      const query = result.query as { bool: { filter: unknown[]; must_not?: unknown[] } };

      expect(query.bool.must_not).toBeUndefined();
    });
  });

  describe('schedule-based filtering', () => {
    it('should filter by schedule_id and execution count when scheduleId and executionCount are provided', () => {
      const options: ResultsRequestOptions = {
        actionId: 'not-used',
        scheduleId: 'sched-uuid-123',
        executionCount: 7,
        pagination: {
          activePage: 0,
          querySize: 100,
          cursorStart: 0,
        },
        sort: [{ field: '@timestamp', direction: Direction.desc }],
      };

      const result = buildResultsQuery(options);
      const filterQuery = result.query as any;
      const queryString = filterQuery.bool.filter.find((f: any) => f.query_string)?.query_string
        ?.query;

      expect(queryString).toContain('schedule_id: sched-uuid-123');
      expect(queryString).toContain('osquery_meta.schedule_execution_count: 7');
      expect(queryString).not.toContain('action_id');
    });

    it('should filter by action_id when scheduleId is not provided', () => {
      const options: ResultsRequestOptions = {
        actionId: 'action-456',
        pagination: {
          activePage: 0,
          querySize: 100,
          cursorStart: 0,
        },
        sort: [{ field: '@timestamp', direction: Direction.desc }],
      };

      const result = buildResultsQuery(options);
      const filterQuery = result.query as any;
      const queryString = filterQuery.bool.filter.find((f: any) => f.query_string)?.query_string
        ?.query;

      expect(queryString).toContain('action_id: action-456');
      expect(queryString).not.toContain('schedule_id');
    });
  });

  describe('space_id scoping', () => {
    const baseOptions: ResultsRequestOptions = {
      actionId: 'action-123',
      pagination: { activePage: 0, querySize: 100, cursorStart: 0 },
      sort: [{ field: '@timestamp', direction: Direction.desc }],
      kuery: '',
    };

    it('does not scope space_id in the builder (centralized in the search strategy)', () => {
      const result = buildResultsQuery({ ...baseOptions, spaceId: 'my-space' });
      const filter = (result.query as any).bool.filter;
      expect(JSON.stringify(filter)).not.toContain('space_id');
    });
  });
});
