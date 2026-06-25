/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { errors } from '@elastic/elasticsearch';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { buildWorkflowFilters } from '@kbn/workflows/server';

import type { WorkflowSearchDeps } from './types';
import { WorkflowSearchService } from './workflow_search_service';
import type { WorkflowProperties } from '../storage/workflow_storage';

const makeSource = (overrides?: Partial<WorkflowProperties>): WorkflowProperties => ({
  name: 'Test Workflow',
  description: 'A test workflow',
  enabled: true,
  tags: [],
  triggerTypes: [],
  yaml: 'name: Test Workflow',
  definition: null,
  createdBy: 'user-1',
  lastUpdatedBy: 'user-1',
  spaceId: 'default',
  valid: true,
  deleted_at: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const makeDeps = (): {
  deps: WorkflowSearchDeps;
  storageClient: { search: jest.Mock };
  esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;
  logger: ReturnType<typeof loggerMock.create>;
} => {
  const storageClient = { search: jest.fn() };
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  const logger = loggerMock.create();
  return {
    deps: {
      logger,
      workflowStorage: { getClient: () => storageClient } as any,
      esClient,
    },
    storageClient,
    esClient,
    logger,
  };
};

const hitWithSort = (id: string, sort: unknown[]) => ({
  _id: id,
  _source: makeSource({ name: id }),
  sort,
});

describe('WorkflowSearchService', () => {
  describe('getWorkflowsSubscribedToTrigger', () => {
    it('opens a PIT, returns mapped workflows, and closes the PIT', async () => {
      const { deps, esClient } = makeDeps();
      esClient.openPointInTime.mockResolvedValue({ id: 'pit-1' } as any);
      esClient.search.mockResolvedValue({
        hits: { hits: [hitWithSort('wf-1', ['ts', 1])] },
      } as any);

      const service = new WorkflowSearchService(deps);
      const result = await service.getWorkflowsSubscribedToTrigger('alert.trigger', 'default');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('wf-1');
      expect(esClient.openPointInTime).toHaveBeenCalledWith(
        expect.objectContaining({ keep_alive: '1m', ignore_unavailable: true })
      );
      expect(esClient.closePointInTime).toHaveBeenCalledWith({ id: 'pit-1' });
    });

    it('still closes the PIT and logs a warning when closePointInTime throws', async () => {
      const { deps, esClient, logger } = makeDeps();
      esClient.openPointInTime.mockResolvedValue({ id: 'pit-1' } as any);
      esClient.search.mockResolvedValue({ hits: { hits: [] } } as any);
      esClient.closePointInTime.mockRejectedValue(new Error('close failed'));

      const service = new WorkflowSearchService(deps);
      await service.getWorkflowsSubscribedToTrigger('trigger', 'default');

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to close PIT'));
    });

    it('filters the query on spaceId, enabled=true, and triggerTypes', async () => {
      const { deps, esClient } = makeDeps();
      esClient.openPointInTime.mockResolvedValue({ id: 'pit-1' } as any);
      esClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      const service = new WorkflowSearchService(deps);
      await service.getWorkflowsSubscribedToTrigger('alert.trigger', 'my-space');

      const searchArgs = esClient.search.mock.calls[0][0] as any;
      const must = searchArgs.query.bool.must;
      const expectedSpaceFilter = buildWorkflowFilters({
        space: { id: 'my-space', includeGlobal: true },
        deleted: 'not_deleted',
      });
      expect(must).toContainEqual(expectedSpaceFilter.must[0]);
      expect(must).toContainEqual({ term: { enabled: true } });
      expect(must).toContainEqual({ term: { triggerTypes: 'alert.trigger' } });
      expect(searchArgs.query.bool.must_not).toContainEqual({ exists: { field: 'deleted_at' } });
    });
  });

  describe('getWorkflows', () => {
    it('returns a page with total, page, size, and mapped results', async () => {
      const { deps, storageClient } = makeDeps();
      storageClient.search.mockResolvedValue({
        hits: {
          total: { value: 2 },
          hits: [
            { _id: 'a', _source: makeSource({ name: 'a' }) },
            { _id: 'b', _source: makeSource({ name: 'b' }) },
          ],
        },
      });

      const service = new WorkflowSearchService(deps);
      const result = await service.getWorkflows({ size: 10, page: 1 } as any, 'default');

      expect(result.page).toBe(1);
      expect(result.size).toBe(10);
      expect(result.total).toBe(2);
      expect(result.results.map((w) => w.id)).toEqual(['a', 'b']);
    });

    it('threads enabled, tags, and createdBy filters plus free-text query into the must clauses', async () => {
      const { deps, storageClient } = makeDeps();
      storageClient.search.mockResolvedValue({ hits: { total: { value: 0 }, hits: [] } });

      const service = new WorkflowSearchService(deps);
      await service.getWorkflows(
        {
          size: 20,
          page: 2,
          enabled: [true],
          tags: ['prod'],
          createdBy: ['alice'],
          query: 'orders',
        } as any,
        'default'
      );

      const call = storageClient.search.mock.calls[0][0];
      expect(call.size).toBe(20);
      expect(call.from).toBe(20);
      expect(call.query.bool.must).toContainEqual({ terms: { enabled: [true] } });
      expect(call.query.bool.must).toContainEqual({ terms: { tags: ['prod'] } });
      expect(call.query.bool.must).toContainEqual({ terms: { createdBy: ['alice'] } });
      // Text search clause injected under the `query` branch — assert one of the multi_match-style
      // clauses landed on `must` without pinning to a brittle shape.
      expect(call.query.bool.must.length).toBeGreaterThanOrEqual(4);
    });

    it('skips execution-history fetch when there are no workflows on the page', async () => {
      const { deps, storageClient, esClient } = makeDeps();
      storageClient.search.mockResolvedValue({ hits: { total: { value: 0 }, hits: [] } });

      const service = new WorkflowSearchService(deps);
      await service.getWorkflows({ size: 10, page: 1 } as any, 'default', {
        includeExecutionHistory: true,
      });

      expect(esClient.search).not.toHaveBeenCalled();
    });

    it('attaches recent-execution history when includeExecutionHistory is true', async () => {
      const { deps, storageClient, esClient } = makeDeps();
      storageClient.search.mockResolvedValue({
        hits: {
          total: { value: 1 },
          hits: [{ _id: 'wf-1', _source: makeSource({ name: 'wf-1' }) }],
        },
      });
      esClient.search.mockResolvedValue({
        aggregations: {
          workflows: {
            buckets: [
              {
                key: 'wf-1',
                recent_executions: {
                  hits: {
                    hits: [
                      {
                        _source: {
                          id: 'exec-1',
                          workflowId: 'wf-1',
                          status: 'completed',
                          startedAt: '2024-01-01T00:00:00.000Z',
                          finishedAt: '2024-01-01T00:00:05.000Z',
                          workflowDefinition: { name: 'wf-1' },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      } as any);

      const service = new WorkflowSearchService(deps);
      const result = await service.getWorkflows({ size: 10, page: 1 } as any, 'default', {
        includeExecutionHistory: true,
      });

      expect(result.results[0].history).toHaveLength(1);
      expect(result.results[0].history?.[0]).toMatchObject({
        id: 'exec-1',
        status: 'completed',
        duration: 5000,
      });
    });

    it('omits recent-execution history for managed workflows without managed execution access', async () => {
      const { deps, storageClient, esClient } = makeDeps();
      storageClient.search.mockResolvedValue({
        hits: {
          total: { value: 1 },
          hits: [{ _id: 'managed-wf', _source: makeSource({ name: 'managed-wf', managed: true }) }],
        },
      });

      const service = new WorkflowSearchService(deps);
      const result = await service.getWorkflows({ size: 10, page: 1 } as any, 'default', {
        includeExecutionHistory: true,
        includeManagedExecutionHistory: false,
      });

      expect(esClient.search).not.toHaveBeenCalled();
      expect(result.results[0].history).toEqual([]);
    });
  });

  describe('getWorkflowStats', () => {
    it('returns enabled/disabled counts from aggregation buckets', async () => {
      const { deps, storageClient } = makeDeps();
      storageClient.search.mockResolvedValue({
        aggregations: {
          enabled_count: { doc_count: 7 },
          disabled_count: { doc_count: 3 },
        },
      });

      const service = new WorkflowSearchService(deps);
      const stats = await service.getWorkflowStats('default');

      expect(stats.workflows).toEqual({ enabled: 7, disabled: 3 });
      expect(stats.executions).toBeUndefined();
    });

    it('includes execution history stats when includeExecutionStats=true', async () => {
      const { deps, storageClient, esClient } = makeDeps();
      storageClient.search.mockResolvedValue({
        aggregations: {
          enabled_count: { doc_count: 1 },
          disabled_count: { doc_count: 0 },
        },
      });
      esClient.search.mockResolvedValue({
        aggregations: {
          daily_stats: {
            buckets: [
              {
                key: 1_704_067_200_000,
                key_as_string: '2024-01-01',
                completed: { doc_count: 2 },
                failed: { doc_count: 1 },
                cancelled: { doc_count: 0 },
              },
            ],
          },
        },
      } as any);

      const service = new WorkflowSearchService(deps);
      const stats = await service.getWorkflowStats('default', { includeExecutionStats: true });

      expect(stats.executions).toEqual([
        {
          date: '2024-01-01',
          timestamp: 1_704_067_200_000,
          completed: 2,
          failed: 1,
          cancelled: 0,
        },
      ]);
      expect(esClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: {
            bool: {
              must: expect.any(Array),
              must_not: [{ term: { managed: true } }],
            },
          },
        })
      );
    });

    it('includes managed executions in history stats when includeManagedExecutionStats=true', async () => {
      const { deps, storageClient, esClient } = makeDeps();
      storageClient.search.mockResolvedValue({
        aggregations: {
          enabled_count: { doc_count: 1 },
          disabled_count: { doc_count: 0 },
        },
      });
      esClient.search.mockResolvedValue({
        aggregations: {
          daily_stats: {
            buckets: [],
          },
        },
      } as any);

      const service = new WorkflowSearchService(deps);
      await service.getWorkflowStats('default', {
        includeExecutionStats: true,
        includeManagedExecutionStats: true,
      });

      expect(esClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: {
            bool: {
              must: expect.any(Array),
            },
          },
        })
      );
      const executionStatsQuery = esClient.search.mock.calls[0]?.[0]?.query;
      expect(executionStatsQuery?.bool?.must_not).toBeUndefined();
    });

    it('returns an empty execution-history array when the executions index is missing', async () => {
      const { deps, storageClient, esClient, logger } = makeDeps();
      storageClient.search.mockResolvedValue({
        aggregations: {
          enabled_count: { doc_count: 0 },
          disabled_count: { doc_count: 0 },
        },
      });
      esClient.search.mockRejectedValue(
        new errors.ResponseError({
          statusCode: 404,
          body: { error: { type: 'index_not_found_exception', reason: 'missing index' } },
          headers: {},
          warnings: [],
          meta: {} as any,
        })
      );

      const service = new WorkflowSearchService(deps);
      const stats = await service.getWorkflowStats('default', { includeExecutionStats: true });

      expect(stats.executions).toEqual([]);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('getWorkflowAggs', () => {
    it('maps requested fields into terms aggs and converts buckets into label/key/doc_count items', async () => {
      const { deps, storageClient } = makeDeps();
      storageClient.search.mockResolvedValue({
        aggregations: {
          name: {
            buckets: [
              { key: 'First', key_as_string: 'First', doc_count: 2 },
              { key: 'Second', key_as_string: 'Second', doc_count: 1 },
            ],
          },
          enabled: {
            buckets: [{ key: 1, key_as_string: 'true', doc_count: 3 }],
          },
        },
      });

      const service = new WorkflowSearchService(deps);
      const result = await service.getWorkflowAggs(['name', 'enabled'], 'default');

      expect(result.name).toEqual([
        { label: 'First', key: 'First', doc_count: 2 },
        { label: 'Second', key: 'Second', doc_count: 1 },
      ]);
      expect(result.enabled).toEqual([{ label: 'true', key: 'true', doc_count: 3 }]);

      const requestedAggs = storageClient.search.mock.calls[0][0].aggs;
      // name → name.keyword, other fields pass through verbatim
      expect(requestedAggs.name.terms.field).toBe('name.keyword');
      expect(requestedAggs.enabled.terms.field).toBe('enabled');

      const expectedDefaultFilter = buildWorkflowFilters({
        space: { id: 'default', includeGlobal: true },
        deleted: 'not_deleted',
        managed: 'unmanaged',
      });
      expect(storageClient.search.mock.calls[0][0].query.bool).toEqual(expectedDefaultFilter);
    });

    it('passes managed filter into the aggregation query', async () => {
      const { deps, storageClient } = makeDeps();
      storageClient.search.mockResolvedValue({ aggregations: {} });

      const service = new WorkflowSearchService(deps);
      await service.getWorkflowAggs(['tags'], 'default', { managedFilter: 'all' });

      const expectedFilter = buildWorkflowFilters({
        space: { id: 'default', includeGlobal: true },
        deleted: 'not_deleted',
        managed: 'all',
      });
      expect(storageClient.search.mock.calls[0][0].query.bool).toEqual(expectedFilter);
    });

    it('returns an empty response when the workflow index is missing', async () => {
      const { deps, storageClient } = makeDeps();
      storageClient.search.mockRejectedValue(
        new errors.ResponseError({
          statusCode: 404,
          body: { error: { type: 'index_not_found_exception', reason: 'missing index' } },
          headers: {},
          warnings: [],
          meta: {} as any,
        })
      );

      const service = new WorkflowSearchService(deps);
      const result = await service.getWorkflowAggs(['tags'], 'default');

      expect(result).toEqual({});
    });

    it('returns an empty response when Elasticsearch omits aggregations', async () => {
      const { deps, storageClient } = makeDeps();
      storageClient.search.mockResolvedValue({});

      const service = new WorkflowSearchService(deps);
      const result = await service.getWorkflowAggs(['enabled'], 'default');

      expect(result).toEqual({});
    });
  });
});
