/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import { buildActionResultsQuery } from './query.action_results.dsl';
import {
  Direction,
  type ActionResultsRequestOptions,
} from '../../../../../../common/search_strategy';

jest.mock('../../../../../utils/build_query', () => ({
  getQueryFilter: jest.fn(({ filter }: { filter: string }) => ({
    query_string: {
      query: filter,
    },
  })),
}));

describe('buildActionResultsQuery', () => {
  describe('basic functionality', () => {
    it('should build query with minimal required parameters using agent actions results index', () => {
      const options: ActionResultsRequestOptions = {
        actionId: 'action-123',
        spaceId: 'default',
        pagination: {
          activePage: 0,
          querySize: 50,
          cursorStart: 0,
        },
        sort: {
          field: 'started_at',
          direction: Direction.desc,
        },
        componentTemplateExists: false,
        useNewDataStream: false,
      };

      const result = buildActionResultsQuery(options);

      expect(result).toEqual({
        allow_no_indices: true,
        index: '.fleet-actions-results*',
        ignore_unavailable: true,
        aggs: {
          aggs: {
            global: {},
            aggs: {
              responses_by_action_id: {
                filter: {
                  bool: {
                    must: [
                      {
                        match: {
                          action_id: 'action-123',
                        },
                      },
                      {
                        bool: {
                          should: [
                            { term: { space_id: 'default' } },
                            { bool: { must_not: { exists: { field: 'space_id' } } } },
                          ],
                        },
                      },
                    ],
                  },
                },
                aggs: {
                  rows_count: {
                    sum: {
                      field: 'action_response.osquery.count',
                    },
                  },
                  responses: {
                    terms: {
                      script: {
                        lang: 'painless',
                        source:
                          "if (doc['error.keyword'].size()==0) { return 'success' } else { return 'error' }",
                      },
                    },
                  },
                },
              },
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
        size: 50,
        track_total_hits: true,
        fields: ['*'],
        sort: [
          {
            started_at: {
              order: 'desc',
            },
          },
        ],
      });
    });

    it('should build query using component template index when componentTemplateExists is true', () => {
      const options: ActionResultsRequestOptions = {
        actionId: 'action-456',
        spaceId: 'default',
        pagination: {
          activePage: 0,
          querySize: 100,
          cursorStart: 0,
        },
        sort: {
          field: '@timestamp',
          direction: Direction.asc,
        },
        componentTemplateExists: true,
        useNewDataStream: false,
      };

      const result = buildActionResultsQuery(options);

      expect(result.index).toBe('.logs-osquery_manager.action.responses*');
    });

    it('should build query using new data stream when useNewDataStream is true', () => {
      const options: ActionResultsRequestOptions = {
        actionId: 'action-789',
        spaceId: 'default',
        pagination: {
          activePage: 0,
          querySize: 200,
          cursorStart: 0,
        },
        sort: {
          field: 'agent.id',
          direction: Direction.desc,
        },
        componentTemplateExists: false,
        useNewDataStream: true,
      };

      const result = buildActionResultsQuery(options);

      expect(result.index).toBe('logs-osquery_manager.action.responses*');
    });

    it('should build query with kuery filter', () => {
      const options: ActionResultsRequestOptions = {
        actionId: 'action-kuery',
        spaceId: 'default',
        kuery: 'agent.name: "test-agent" AND error.message: *timeout*',
        pagination: {
          activePage: 0,
          querySize: 25,
          cursorStart: 0,
        },
        sort: {
          field: 'started_at',
          direction: Direction.desc,
        },
        componentTemplateExists: true,
        useNewDataStream: false,
      };

      const result = buildActionResultsQuery(options);

      expect(result.query).toEqual({
        bool: {
          filter: [
            {
              query_string: {
                query:
                  'action_id: action-kuery AND agent.name: "test-agent" AND error.message: *timeout*',
              },
            },
          ],
        },
      });
    });

    it('should build query with time range filter using event.ingested', () => {
      const startDate = '2024-03-15T14:20:00.000Z';
      const expectedEndDate = moment(startDate).clone().add(30, 'minutes').toISOString();

      const options: ActionResultsRequestOptions = {
        actionId: 'action-time-range',
        spaceId: 'default',
        startDate,
        pagination: {
          activePage: 0,
          querySize: 75,
          cursorStart: 0,
        },
        sort: {
          field: 'completed_at',
          direction: Direction.asc,
        },
        componentTemplateExists: false,
        useNewDataStream: true,
      };

      const result = buildActionResultsQuery(options);

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
                query: 'action_id: action-time-range',
              },
            },
          ],
        },
      });
    });

    it('should build query with integration namespaces', () => {
      const options: ActionResultsRequestOptions = {
        actionId: 'action-namespaced',
        spaceId: 'default',
        pagination: {
          activePage: 0,
          querySize: 15,
          cursorStart: 0,
        },
        sort: {
          field: 'agent.hostname',
          direction: Direction.asc,
        },
        componentTemplateExists: true,
        useNewDataStream: false,
        integrationNamespaces: ['production', 'development'],
      };

      const result = buildActionResultsQuery(options);

      expect(result.index).toBe(
        '.logs-osquery_manager.action.responses-production,.logs-osquery_manager.action.responses-development'
      );
    });

    it('should build query with all options combined', () => {
      const startDate = '2024-07-01T08:45:00.000Z';
      const expectedEndDate = moment(startDate).clone().add(30, 'minutes').toISOString();

      const options: ActionResultsRequestOptions = {
        actionId: 'action-comprehensive',
        spaceId: 'default',
        kuery: 'error.type: "timeout" OR status: "failed"',
        startDate,
        pagination: {
          activePage: 1,
          querySize: 500,
          cursorStart: 0,
        },
        sort: {
          field: 'error.message',
          direction: Direction.desc,
        },
        componentTemplateExists: false,
        useNewDataStream: true,
        integrationNamespaces: ['staging', 'qa'],
      };

      const result = buildActionResultsQuery(options);

      expect(result).toEqual({
        allow_no_indices: true,
        index:
          'logs-osquery_manager.action.responses-staging,logs-osquery_manager.action.responses-qa',
        ignore_unavailable: true,
        aggs: {
          aggs: {
            global: {},
            aggs: {
              responses_by_action_id: {
                filter: {
                  bool: {
                    must: [
                      {
                        match: {
                          action_id: 'action-comprehensive',
                        },
                      },
                      {
                        bool: {
                          should: [
                            { term: { space_id: 'default' } },
                            { bool: { must_not: { exists: { field: 'space_id' } } } },
                          ],
                        },
                      },
                    ],
                  },
                },
                aggs: {
                  rows_count: {
                    sum: {
                      field: 'action_response.osquery.count',
                    },
                  },
                  responses: {
                    terms: {
                      script: {
                        lang: 'painless',
                        source:
                          "if (doc['error.keyword'].size()==0) { return 'success' } else { return 'error' }",
                      },
                    },
                  },
                },
              },
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
                    'action_id: action-comprehensive AND error.type: "timeout" OR status: "failed"',
                },
              },
            ],
          },
        },
        from: 500,
        size: 500,
        track_total_hits: true,
        fields: ['*'],
        sort: [
          {
            'error.message': {
              order: 'desc',
            },
          },
        ],
      });
    });
  });

  describe('pagination behavior', () => {
    it.each([
      {
        activePage: 5,
        querySize: 50,
        expectedFrom: 250,
        expectedSize: 50,
        description: 'custom pagination',
      },
      {
        activePage: 0,
        querySize: 100,
        expectedFrom: 0,
        expectedSize: 100,
        description: 'default pagination',
      },
      {
        activePage: 0,
        querySize: 10,
        expectedFrom: 0,
        expectedSize: 10,
        description: 'small page size',
      },
      {
        activePage: 0,
        querySize: 50,
        expectedFrom: 0,
        expectedSize: 50,
        description: 'medium page size',
      },
      {
        activePage: 0,
        querySize: 500,
        expectedFrom: 0,
        expectedSize: 500,
        description: 'large page size',
      },
      {
        activePage: 99,
        querySize: 100,
        expectedFrom: 9900,
        expectedSize: 100,
        description: 'large page numbers for 10k+ agents',
      },
    ])(
      'should handle $description (page $activePage, size $querySize)',
      ({ activePage, querySize, expectedFrom, expectedSize }) => {
        const options: ActionResultsRequestOptions = {
          actionId: 'test-pagination',
          spaceId: 'default',
          pagination: { activePage, querySize, cursorStart: 0 },
          sort: {
            field: '@timestamp',
            direction: Direction.desc,
          },
          componentTemplateExists: false,
          useNewDataStream: false,
        };

        const result = buildActionResultsQuery(options);

        expect(result.from).toBe(expectedFrom);
        expect(result.size).toBe(expectedSize);
      }
    );

    it('should maintain aggregations regardless of pagination', () => {
      const optionsPage1: ActionResultsRequestOptions = {
        actionId: 'test-aggs',
        spaceId: 'default',
        pagination: { activePage: 0, querySize: 50, cursorStart: 0 },
        sort: {
          field: '@timestamp',
          direction: Direction.desc,
        },
        componentTemplateExists: false,
        useNewDataStream: false,
      };

      const optionsPage10: ActionResultsRequestOptions = {
        ...optionsPage1,
        pagination: { activePage: 10, querySize: 50, cursorStart: 0 },
      };

      const resultPage1 = buildActionResultsQuery(optionsPage1);
      const resultPage10 = buildActionResultsQuery(optionsPage10);

      expect(resultPage1.aggs).toEqual(resultPage10.aggs);
      expect(resultPage1.from).toBe(0);
      expect(resultPage10.from).toBe(500);
    });
  });

  describe('CCS support', () => {
    const basePagination = { activePage: 0, querySize: 10, cursorStart: 0 };
    const baseSort = { field: 'started_at' as const, direction: Direction.desc };

    it('should include remote cluster patterns when ccsEnabled is true and using legacy index', () => {
      const options: ActionResultsRequestOptions = {
        actionId: 'action-ccs',
        spaceId: 'default',
        pagination: basePagination,
        sort: baseSort,
        componentTemplateExists: false,
        useNewDataStream: false,
        ccsEnabled: true,
      };

      const result = buildActionResultsQuery(options);

      expect(result.index).toBe('.fleet-actions-results*,*:.fleet-actions-results*');
    });

    it('should include remote cluster patterns when ccsEnabled is true and using component template index', () => {
      const options: ActionResultsRequestOptions = {
        actionId: 'action-ccs',
        spaceId: 'default',
        pagination: basePagination,
        sort: baseSort,
        componentTemplateExists: true,
        useNewDataStream: false,
        ccsEnabled: true,
      };

      const result = buildActionResultsQuery(options);

      expect(result.index).toBe(
        '.logs-osquery_manager.action.responses*,*:.logs-osquery_manager.action.responses*'
      );
    });

    it('should include remote cluster patterns when ccsEnabled is true and using new data stream', () => {
      const options: ActionResultsRequestOptions = {
        actionId: 'action-ccs',
        spaceId: 'default',
        pagination: basePagination,
        sort: baseSort,
        componentTemplateExists: false,
        useNewDataStream: true,
        ccsEnabled: true,
      };

      const result = buildActionResultsQuery(options);

      expect(result.index).toBe(
        'logs-osquery_manager.action.responses*,*:logs-osquery_manager.action.responses*'
      );
    });

    it('should include remote cluster patterns for each namespace when ccsEnabled is true', () => {
      const options: ActionResultsRequestOptions = {
        actionId: 'action-ccs',
        spaceId: 'default',
        pagination: basePagination,
        sort: baseSort,
        componentTemplateExists: true,
        useNewDataStream: false,
        integrationNamespaces: ['default', 'ns1'],
        ccsEnabled: true,
      };

      const result = buildActionResultsQuery(options);

      expect(result.index).toBe(
        '.logs-osquery_manager.action.responses-default,.logs-osquery_manager.action.responses-ns1,*:.logs-osquery_manager.action.responses-default,*:.logs-osquery_manager.action.responses-ns1'
      );
    });

    it('should not modify index when ccsEnabled is false', () => {
      const options: ActionResultsRequestOptions = {
        actionId: 'action-no-ccs',
        spaceId: 'default',
        pagination: basePagination,
        sort: baseSort,
        componentTemplateExists: false,
        useNewDataStream: true,
        ccsEnabled: false,
      };

      const result = buildActionResultsQuery(options);

      expect(result.index).toBe('logs-osquery_manager.action.responses*');
    });
  });

  describe('index selection logic', () => {
    it.each([
      {
        componentTemplateExists: true,
        useNewDataStream: true,
        expectedIndex: 'logs-osquery_manager.action.responses*',
        description: 'prioritize useNewDataStream over componentTemplateExists',
      },
      {
        componentTemplateExists: false,
        useNewDataStream: false,
        expectedIndex: '.fleet-actions-results*',
        description: 'fall back to agent actions results index when both flags are false',
      },
    ])('should $description', ({ componentTemplateExists, useNewDataStream, expectedIndex }) => {
      const options: ActionResultsRequestOptions = {
        actionId: 'action-index-test',
        spaceId: 'default',
        pagination: {
          activePage: 0,
          querySize: 10,
          cursorStart: 0,
        },
        sort: {
          field: 'started_at',
          direction: Direction.desc,
        },
        componentTemplateExists,
        useNewDataStream,
      };

      const result = buildActionResultsQuery(options);

      expect(result.index).toBe(expectedIndex);
    });
  });

  describe('space_id scoping', () => {
    const baseOptions: ActionResultsRequestOptions = {
      actionId: 'action-123',
      spaceId: 'default',
      pagination: { activePage: 0, querySize: 50, cursorStart: 0 },
      sort: { field: 'started_at', direction: Direction.desc },
      componentTemplateExists: false,
      useNewDataStream: false,
    };

    const getAggFilterMust = (result: any) =>
      result.aggs.aggs.aggs.responses_by_action_id.filter.bool.must;

    it('scopes the aggregation by space_id', () => {
      const result = buildActionResultsQuery({ ...baseOptions, spaceId: 'my-space' });
      expect(JSON.stringify(getAggFilterMust(result))).toContain('space_id');
    });

    it('scopes the aggregation to default space OR missing space_id when spaceId is "default"', () => {
      const result = buildActionResultsQuery({ ...baseOptions, spaceId: 'default' });
      const defaultClause = {
        bool: {
          should: [
            { term: { space_id: 'default' } },
            { bool: { must_not: { exists: { field: 'space_id' } } } },
          ],
        },
      };
      // The aggregation filter is space-scoped so counts match the hits.
      expect(getAggFilterMust(result)).toContainEqual(defaultClause);
    });

    it('scopes the aggregation to the space exactly in a named space', () => {
      const result = buildActionResultsQuery({ ...baseOptions, spaceId: 'my-space' });
      expect(getAggFilterMust(result)).toContainEqual({ term: { space_id: 'my-space' } });
    });
  });
});
