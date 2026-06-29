/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { errors } from '@elastic/elasticsearch';
import type { ElasticsearchClient } from '@kbn/core/server';
import { loggerMock } from '@kbn/logging-mocks';
import { ExecutionType } from '@kbn/workflows';
import type { IWorkflowEventLoggerService } from '@kbn/workflows-execution-engine/server';

import { WorkflowExecutionQueryService } from './workflow_execution_query_service';
import { WORKFLOWS_INDEX, WORKFLOWS_STEP_EXECUTIONS_INDEX } from '../../common';

describe('WorkflowExecutionQueryService', () => {
  let mockEsClient: jest.Mocked<ElasticsearchClient>;
  let mockLogger: ReturnType<typeof loggerMock.create>;
  let mockEventLoggerService: jest.Mocked<IWorkflowEventLoggerService>;
  let service: WorkflowExecutionQueryService;

  beforeEach(() => {
    mockEsClient = {
      search: jest.fn(),
      get: jest.fn(),
      mget: jest.fn(),
      update: jest.fn(),
    } as any;
    mockLogger = loggerMock.create();
    mockEventLoggerService = {
      getExecutionLogs: jest.fn().mockResolvedValue({ results: [], total: 0 }),
      getStepLogs: jest.fn().mockResolvedValue({ results: [], total: 0 }),
    } as any;

    service = new WorkflowExecutionQueryService({
      logger: mockLogger,
      esClient: mockEsClient,
      workflowEventLoggerService: mockEventLoggerService,
    });
  });

  describe('getWorkflowExecutions', () => {
    const emptyResponse = { hits: { hits: [], total: { value: 0 } } };

    it('builds query with workflowId and spaceId filter', async () => {
      mockEsClient.search.mockResolvedValue(emptyResponse as any);

      await service.getWorkflowExecutions({ workflowId: 'wf-1' }, 'my-space');

      const call = mockEsClient.search.mock.calls[0][0] as any;
      const must = call.query.bool.must;
      expect(must[0]).toEqual({ term: { workflowId: 'wf-1' } });
      // spaceId with backward compat should clause
      expect(must[1].bool.should).toHaveLength(2);
      expect(must[1].bool.should[0]).toEqual({ term: { spaceId: 'my-space' } });
    });

    it('adds status filter when statuses provided', async () => {
      mockEsClient.search.mockResolvedValue(emptyResponse as any);

      await service.getWorkflowExecutions(
        { workflowId: 'wf-1', statuses: ['completed', 'failed'] as any },
        'default'
      );

      const call = mockEsClient.search.mock.calls[0][0] as any;
      const must = call.query.bool.must;
      expect(must).toContainEqual({ terms: { status: ['completed', 'failed'] } });
    });

    it('adds isTestRun filter for test execution type', async () => {
      mockEsClient.search.mockResolvedValue(emptyResponse as any);

      await service.getWorkflowExecutions(
        { workflowId: 'wf-1', executionTypes: [ExecutionType.TEST] },
        'default'
      );

      const call = mockEsClient.search.mock.calls[0][0] as any;
      const must = call.query.bool.must;
      expect(must).toContainEqual({ term: { isTestRun: true } });
    });

    it('adds non-test-run filter for production execution type', async () => {
      mockEsClient.search.mockResolvedValue(emptyResponse as any);

      await service.getWorkflowExecutions(
        { workflowId: 'wf-1', executionTypes: [ExecutionType.PRODUCTION] },
        'default'
      );

      const call = mockEsClient.search.mock.calls[0][0] as any;
      const must = call.query.bool.must;
      // Should include both false and not-exists for backward compat
      const isTestRunFilter = must.find(
        (clause: any) => clause.bool?.should?.[0]?.term?.isTestRun === false
      );
      expect(isTestRunFilter).toBeDefined();
      expect(isTestRunFilter.bool.should).toHaveLength(2);
    });

    it('adds executedBy filter', async () => {
      mockEsClient.search.mockResolvedValue(emptyResponse as any);

      await service.getWorkflowExecutions(
        { workflowId: 'wf-1', executedBy: ['user1', 'user2'] },
        'default'
      );

      const call = mockEsClient.search.mock.calls[0][0] as any;
      const must = call.query.bool.must;
      expect(must).toContainEqual({ terms: { executedBy: ['user1', 'user2'] } });
    });

    it('adds concurrencyGroupKey filter', async () => {
      mockEsClient.search.mockResolvedValue(emptyResponse as any);

      await service.getWorkflowExecutions(
        { workflowId: 'wf-1', concurrencyGroupKey: 'streams-ki-onboarding-my-stream' },
        'default'
      );

      const call = mockEsClient.search.mock.calls[0][0] as any;
      const must = call.query.bool.must;
      expect(must).toContainEqual({
        term: { concurrencyGroupKey: 'streams-ki-onboarding-my-stream' },
      });
    });

    it('adds collapse while preserving other filters', async () => {
      mockEsClient.search.mockResolvedValue(emptyResponse as any);

      await service.getWorkflowExecutions(
        { workflowId: 'wf-1', statuses: ['running'] as any, collapse: 'concurrencyGroupKey' },
        'default'
      );

      const call = mockEsClient.search.mock.calls[0][0] as any;
      expect(call.collapse).toEqual({ field: 'concurrencyGroupKey' });
      expect(call.query.bool.must).toContainEqual({ terms: { status: ['running'] } });
    });

    it('adds omitStepRuns filter', async () => {
      mockEsClient.search.mockResolvedValue(emptyResponse as any);

      await service.getWorkflowExecutions({ workflowId: 'wf-1', omitStepRuns: true }, 'default');

      const call = mockEsClient.search.mock.calls[0][0] as any;
      const must = call.query.bool.must;
      const stepIdFilter = must.find(
        (clause: any) => clause.bool?.must_not?.exists?.field === 'stepId'
      );
      expect(stepIdFilter).toBeDefined();
    });

    it('adds startedAt range filter when startedAfter and startedBefore are provided', async () => {
      mockEsClient.search.mockResolvedValue(emptyResponse as any);

      await service.getWorkflowExecutions(
        { workflowId: 'wf-1', startedAfter: 'now-1w', startedBefore: 'now' },
        'default'
      );

      const call = mockEsClient.search.mock.calls[0][0] as any;
      const must = call.query.bool.must;
      const rangeClause = must.find((clause: any) => clause.range?.startedAt);
      expect(rangeClause).toBeDefined();
      expect(rangeClause.range.startedAt.gte).toMatch(/^\d{4}-/);
      expect(rangeClause.range.startedAt.lte).toMatch(/^\d{4}-/);
    });

    it('adds finishedAt range filter (datemath) when finishedAfter and finishedBefore are provided', async () => {
      mockEsClient.search.mockResolvedValue(emptyResponse as any);

      await service.getWorkflowExecutions(
        { workflowId: 'wf-1', finishedAfter: 'now-1w', finishedBefore: 'now' },
        'default'
      );

      const call = mockEsClient.search.mock.calls[0][0] as any;
      const must = call.query.bool.must;
      const rangeClause = must.find((clause: any) => clause.range?.finishedAt);
      expect(rangeClause).toBeDefined();
      expect(rangeClause.range.finishedAt.gte).toMatch(/^\d{4}-/);
      expect(rangeClause.range.finishedAt.lte).toMatch(/^\d{4}-/);
    });

    it('adds finishedAt range filter when finish bounds are absolute ISO timestamps', async () => {
      mockEsClient.search.mockResolvedValue(emptyResponse as any);

      await service.getWorkflowExecutions(
        {
          workflowId: 'wf-1',
          finishedAfter: '2026-05-01T00:00:00.000Z',
          finishedBefore: '2026-05-14T00:00:00.000Z',
        },
        'default'
      );

      const call = mockEsClient.search.mock.calls[0][0] as any;
      const must = call.query.bool.must;
      expect(must).toContainEqual({
        range: {
          finishedAt: {
            gte: '2026-05-01T00:00:00.000Z',
            lte: '2026-05-14T00:00:00.000Z',
          },
        },
      });
    });

    it('does not add startedAt or finishedAt range when time bounds are omitted', async () => {
      mockEsClient.search.mockResolvedValue(emptyResponse as any);

      await service.getWorkflowExecutions({ workflowId: 'wf-1' }, 'default');

      const call = mockEsClient.search.mock.calls[0][0] as any;
      const must = call.query.bool.must;
      expect(must.some((clause: any) => clause.range?.startedAt)).toBe(false);
      expect(must.some((clause: any) => clause.range?.finishedAt)).toBe(false);
    });

    it('uses createdAt desc as the default sort', async () => {
      mockEsClient.search.mockResolvedValue(emptyResponse as any);

      await service.getWorkflowExecutions({ workflowId: 'wf-1' }, 'default');

      const call = mockEsClient.search.mock.calls[0][0] as any;
      expect(call.sort).toEqual([{ createdAt: 'desc' }]);
    });

    it('uses explicit execution sort when provided', async () => {
      mockEsClient.search.mockResolvedValue(emptyResponse as any);

      await service.getWorkflowExecutions(
        { workflowId: 'wf-1', sortField: 'finishedAt', sortOrder: 'desc' },
        'default'
      );

      const call = mockEsClient.search.mock.calls[0][0] as any;
      expect(call.sort).toEqual([{ finishedAt: { order: 'desc' } }]);
    });

    it('uses default page size and page 1 when not specified', async () => {
      mockEsClient.search.mockResolvedValue(emptyResponse as any);

      await service.getWorkflowExecutions({ workflowId: 'wf-1' }, 'default');

      const call = mockEsClient.search.mock.calls[0][0] as any;
      expect(call.size).toBe(100);
      expect(call.from).toBe(0);
    });

    it('calculates correct offset for page 3 with size 20', async () => {
      mockEsClient.search.mockResolvedValue(emptyResponse as any);

      await service.getWorkflowExecutions({ workflowId: 'wf-1', page: 3, size: 20 }, 'default');

      const call = mockEsClient.search.mock.calls[0][0] as any;
      expect(call.size).toBe(20);
      expect(call.from).toBe(40);
    });
  });

  describe('getWorkflowExecutionHistory', () => {
    it('queries step executions by executionId and spaceId', async () => {
      mockEsClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      await service.getWorkflowExecutionHistory('exec-1', 'default');

      const call = mockEsClient.search.mock.calls[0][0] as any;
      expect(call.index).toBe('.workflows-step-executions');
      expect(call.query.bool.must).toContainEqual({ term: { executionId: 'exec-1' } });
      expect(call.query.bool.must).toContainEqual({ term: { spaceId: 'default' } });
      expect(call.sort).toEqual([{ timestamp: { order: 'asc' } }]);
    });

    it('calculates duration from startedAt and finishedAt', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _source: {
                stepId: 'step-1',
                status: 'completed',
                startedAt: '2024-01-01T10:00:00.000Z',
                finishedAt: '2024-01-01T10:00:05.000Z',
              },
            },
          ],
        },
      } as any);

      const result = await service.getWorkflowExecutionHistory('exec-1', 'default');

      expect(result).toHaveLength(1);
      expect(result[0].duration).toBe(5000);
      expect(result[0].finishedAt).toBe('2024-01-01T10:00:05.000Z');
    });

    it('handles endedAt as alias for finishedAt (backward compat)', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _source: {
                stepId: 'step-1',
                status: 'completed',
                startedAt: '2024-01-01T10:00:00.000Z',
                endedAt: '2024-01-01T10:00:03.000Z',
              },
            },
          ],
        },
      } as any);

      const result = await service.getWorkflowExecutionHistory('exec-1', 'default');

      expect(result[0].duration).toBe(3000);
      expect(result[0].finishedAt).toBe('2024-01-01T10:00:03.000Z');
    });

    it('sets duration to 0 when no finish timestamp', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          hits: [
            {
              _source: {
                stepId: 'step-1',
                status: 'running',
                startedAt: '2024-01-01T10:00:00.000Z',
              },
            },
          ],
        },
      } as any);

      const result = await service.getWorkflowExecutionHistory('exec-1', 'default');

      expect(result[0].duration).toBe(0);
      expect(result[0].finishedAt).toBe('');
    });

    it('throws when hit has no _source', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [{ _id: 'bad' }] },
      } as any);

      await expect(service.getWorkflowExecutionHistory('exec-1', 'default')).rejects.toThrow(
        'Missing _source in search result'
      );
    });
  });

  describe('searchStepExecutions', () => {
    it('excludes input and output when not requested', async () => {
      mockEsClient.search.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } } as any);

      await service.searchStepExecutions(
        { workflowId: 'wf-1', includeInput: false, includeOutput: false },
        'default'
      );

      const call = mockEsClient.search.mock.calls[0][0] as any;
      expect(call._source?.excludes ?? call.source_excludes).toEqual(
        expect.arrayContaining(['input', 'output'])
      );
    });

    it('does not exclude when includeInput and includeOutput are true', async () => {
      mockEsClient.search.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } } as any);

      await service.searchStepExecutions(
        { workflowId: 'wf-1', includeInput: true, includeOutput: true },
        'default'
      );

      const call = mockEsClient.search.mock.calls[0][0] as any;
      // No source excludes should be passed
      expect(call._source?.excludes).toBeUndefined();
    });

    it('adds startedAt range when startedAfter and startedBefore are provided', async () => {
      mockEsClient.search.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } } as any);

      await service.searchStepExecutions(
        {
          workflowId: 'wf-1',
          includeInput: true,
          includeOutput: true,
          startedAfter: 'now-1w',
          startedBefore: 'now',
        },
        'default'
      );

      const call = mockEsClient.search.mock.calls[0][0] as any;
      expect(call.query.bool.must.some((clause: any) => clause.range?.startedAt)).toBe(true);
    });
  });

  describe('getStepExecution', () => {
    it('returns null when no step found', async () => {
      mockEsClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      const result = await service.getStepExecution(
        { executionId: 'exec-1', id: 'step-1' },
        'default'
      );

      expect(result).toBeNull();
    });

    it('returns the step execution when found', async () => {
      const stepSource = {
        id: 'step-1',
        workflowRunId: 'exec-1',
        status: 'completed',
        spaceId: 'default',
      };
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [{ _source: stepSource }] },
      } as any);

      const result = await service.getStepExecution(
        { executionId: 'exec-1', id: 'step-1' },
        'default'
      );

      expect(result).toEqual(stepSource);
    });

    it('returns null when hit has undefined _source', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: { hits: [{ _id: 'some-id' }] },
      } as any);

      const result = await service.getStepExecution(
        { executionId: 'exec-1', id: 'step-1' },
        'default'
      );

      expect(result).toBeNull();
    });

    it('queries by workflowRunId, id, and spaceId', async () => {
      mockEsClient.search.mockResolvedValue({ hits: { hits: [] } } as any);

      await service.getStepExecution({ executionId: 'exec-1', id: 'step-1' }, 'my-space');

      const call = mockEsClient.search.mock.calls[0][0] as any;
      expect(call.query.bool.must).toContainEqual({ term: { workflowRunId: 'exec-1' } });
      expect(call.query.bool.must).toContainEqual({ term: { id: 'step-1' } });
      expect(call.query.bool.must).toContainEqual({ term: { spaceId: 'my-space' } });
    });
  });

  describe('getExecutionLogs', () => {
    it('delegates to workflowEventLoggerService', async () => {
      const params = { executionId: 'exec-1', spaceId: 'default' } as any;

      await service.getExecutionLogs(params);

      expect(mockEventLoggerService.getExecutionLogs).toHaveBeenCalledWith(params);
    });
  });

  describe('getStepLogs', () => {
    it('delegates to workflowEventLoggerService', async () => {
      const params = { executionId: 'exec-1', stepId: 'step-1', spaceId: 'default' } as any;

      await service.getStepLogs(params);

      expect(mockEventLoggerService.getStepLogs).toHaveBeenCalledWith(params);
    });
  });

  describe('listWaitingForInputSteps', () => {
    // Regression coverage for the Inbox <-> Workflows integration.
    //
    // The .workflows-step-executions index only indexes `spaceId` and
    // `status` as keyword fields; `stepType` lives in `_source` only. An
    // earlier draft included a `term: { stepType: 'waitForInput' }` filter
    // here, which silently matched zero docs and caused the Inbox UI to
    // appear empty even when workflows were paused on `waitForInput`. These
    // tests pin the wire-level query so a future refactor can't reintroduce
    // an unindexed filter without going red.
    const buildHit = (overrides: Record<string, unknown> = {}) => ({
      _id: 'doc-1',
      _source: {
        id: 'doc-1',
        stepId: 'ask',
        stepType: 'waitForInput',
        status: 'waiting_for_input',
        spaceId: 'default',
        workflowId: 'wf-1',
        workflowRunId: 'run-1',
        startedAt: '2026-04-28T15:00:00.000Z',
        globalExecutionIndex: 0,
        stepExecutionIndex: 0,
        topologicalIndex: 0,
        scopeStack: [],
        isTestRun: false,
        ...overrides,
      },
    });

    /**
     * Helper that mocks the parent-workflow alive-check lookup. The service
     * issues a second `.workflows-workflows` search after the step executions
     * search to filter out orphaned docs whose parent has been soft-deleted.
     */
    const mockAliveWorkflowsLookup = (aliveIds: string[]) => {
      mockEsClient.search.mockResolvedValueOnce({
        hits: {
          hits: aliveIds.map((id) => ({ _id: id })),
          total: { value: aliveIds.length },
        },
      } as any);
    };

    it('issues a term-only query against keyword-indexed fields and omits stepType', async () => {
      mockEsClient.search.mockResolvedValueOnce({
        hits: { hits: [buildHit()], total: { value: 1 } },
      } as any);
      mockAliveWorkflowsLookup(['wf-1']);

      const result = await service.listWaitingForInputSteps('default');

      expect(mockEsClient.search).toHaveBeenCalledTimes(2);
      const searchArgs = mockEsClient.search.mock.calls[0][0] as {
        index: string;
        query: {
          bool: {
            must: Array<Record<string, unknown>>;
            must_not?: Array<Record<string, unknown>>;
          };
        };
      };
      expect(searchArgs.index).toBe(WORKFLOWS_STEP_EXECUTIONS_INDEX);

      const must = searchArgs.query.bool.must;
      expect(must).toEqual(
        expect.arrayContaining([
          { term: { spaceId: 'default' } },
          { term: { status: 'waiting_for_input' } },
        ])
      );
      expect(must).toHaveLength(2);
      const filterFields = must.flatMap((clause) =>
        Object.keys(clause.term as Record<string, unknown>)
      );
      expect(filterFields).not.toContain('stepType');

      expect(result.total).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].stepType).toBe('waitForInput');
    });

    it('excludes step executions that already have finishedAt or hitl.respondedAt set', async () => {
      mockEsClient.search.mockResolvedValueOnce({
        hits: { hits: [], total: { value: 0 } },
      } as any);

      await service.listWaitingForInputSteps('default');

      const searchArgs = mockEsClient.search.mock.calls[0][0] as {
        query: { bool: { must_not?: Array<Record<string, unknown>> } };
      };
      expect(searchArgs.query.bool.must_not).toEqual([
        { exists: { field: 'finishedAt' } },
        { exists: { field: 'hitl.respondedAt' } },
      ]);
    });

    it('paginates via from/size derived from page/perPage', async () => {
      mockEsClient.search.mockResolvedValueOnce({
        hits: { hits: [], total: { value: 0 } },
      } as any);

      await service.listWaitingForInputSteps('default', { page: 3, perPage: 25 });

      const searchArgs = mockEsClient.search.mock.calls[0][0] as { from: number; size: number };
      expect(searchArgs.size).toBe(25);
      expect(searchArgs.from).toBe(50);
    });

    it('swallows index_not_found_exception with an empty result (cold install case)', async () => {
      mockEsClient.search.mockRejectedValueOnce(
        new errors.ResponseError({
          statusCode: 404,
          body: { error: { type: 'index_not_found_exception' } },
          headers: {},
          meta: {} as any,
          warnings: [],
        })
      );

      const result = await service.listWaitingForInputSteps('default');

      expect(result).toEqual({
        results: [],
        total: 0,
        reasoningByStepId: new Map(),
        deletedWorkflowIds: new Set(),
      });
    });

    it('logs and rethrows for any other ES failure', async () => {
      mockEsClient.search.mockRejectedValueOnce(new Error('boom'));

      await expect(service.listWaitingForInputSteps('default')).rejects.toThrow('boom');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to list waiting-for-input step executions')
      );
    });

    describe('orphan filtering (soft-deleted parent workflows)', () => {
      it('drops step executions whose parent workflow is soft-deleted and adjusts total', async () => {
        mockEsClient.search.mockResolvedValueOnce({
          hits: {
            hits: [
              buildHit({ id: 'doc-1', workflowId: 'wf-alive' }),
              buildHit({ id: 'doc-2', workflowId: 'wf-deleted' }),
              buildHit({ id: 'doc-3', workflowId: 'wf-alive-2' }),
            ],
            total: { value: 3 },
          },
        } as any);
        // Only two of the three parent workflows survive the must_not on
        // `deleted_at`, so `wf-deleted` is omitted from the lookup hits.
        mockAliveWorkflowsLookup(['wf-alive', 'wf-alive-2']);

        const result = await service.listWaitingForInputSteps('default');

        expect(result.results).toHaveLength(2);
        expect(result.results.map((r) => r.id)).toEqual(['doc-1', 'doc-3']);
        expect(result.total).toBe(2);
      });

      it('drops step executions whose parent workflow no longer exists at all', async () => {
        mockEsClient.search.mockResolvedValueOnce({
          hits: {
            hits: [buildHit({ id: 'doc-1', workflowId: 'wf-gone' })],
            total: { value: 1 },
          },
        } as any);
        mockAliveWorkflowsLookup([]);

        const result = await service.listWaitingForInputSteps('default');

        expect(result.results).toEqual([]);
        expect(result.total).toBe(0);
      });

      it('issues the alive-workflow lookup against .workflows-workflows with the right filters', async () => {
        mockEsClient.search.mockResolvedValueOnce({
          hits: {
            hits: [
              buildHit({ workflowId: 'wf-1' }),
              // duplicate workflowId should be deduplicated in the lookup
              buildHit({ id: 'doc-2', workflowId: 'wf-1' }),
              buildHit({ id: 'doc-3', workflowId: 'wf-2' }),
            ],
            total: { value: 3 },
          },
        } as any);
        mockAliveWorkflowsLookup(['wf-1', 'wf-2']);

        await service.listWaitingForInputSteps('default');

        expect(mockEsClient.search).toHaveBeenCalledTimes(2);
        const lookupArgs = mockEsClient.search.mock.calls[1][0] as {
          index: string;
          _source: boolean;
          query: {
            bool: {
              must: Array<Record<string, unknown>>;
              must_not: Array<Record<string, unknown>>;
            };
          };
          size: number;
        };
        expect(lookupArgs.index).toBe(WORKFLOWS_INDEX);
        expect(lookupArgs._source).toBe(false);
        const idsClause = lookupArgs.query.bool.must.find(
          (c): c is { ids: { values: string[] } } => 'ids' in c
        );
        expect(idsClause?.ids.values.sort()).toEqual(['wf-1', 'wf-2']);
        expect(lookupArgs.query.bool.must).toContainEqual({ term: { spaceId: 'default' } });
        expect(lookupArgs.query.bool.must_not).toEqual([{ exists: { field: 'deleted_at' } }]);
      });

      it('skips the parent-workflow lookup when no step executions match', async () => {
        mockEsClient.search.mockResolvedValueOnce({
          hits: { hits: [], total: { value: 0 } },
        } as any);

        const result = await service.listWaitingForInputSteps('default');

        expect(mockEsClient.search).toHaveBeenCalledTimes(1);
        expect(result).toEqual({
          results: [],
          total: 0,
          reasoningByStepId: new Map(),
          deletedWorkflowIds: new Set(),
        });
      });

      it('falls back to unfiltered results and warns when the workflow lookup errors', async () => {
        mockEsClient.search
          .mockResolvedValueOnce({
            hits: { hits: [buildHit()], total: { value: 1 } },
          } as any)
          .mockRejectedValueOnce(new Error('lookup boom'));

        const result = await service.listWaitingForInputSteps('default');

        // Transient lookup failure must not empty the Inbox.
        expect(result.results).toHaveLength(1);
        expect(result.total).toBe(1);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Failed to validate parent workflows for wait-for-input listing')
        );
      });

      it('treats index_not_found on the workflow lookup as "no alive workflows"', async () => {
        mockEsClient.search
          .mockResolvedValueOnce({
            hits: { hits: [buildHit()], total: { value: 1 } },
          } as any)
          .mockRejectedValueOnce(
            new errors.ResponseError({
              statusCode: 404,
              body: { error: { type: 'index_not_found_exception' } },
              headers: {},
              meta: {} as any,
              warnings: [],
            })
          );

        const result = await service.listWaitingForInputSteps('default');

        expect(result.results).toEqual([]);
        expect(result.total).toBe(0);
      });
    });
  });

  describe('listProcessedWaitForInputSteps', () => {
    const buildProcessedHit = (overrides: Record<string, unknown> = {}) => ({
      _id: 'doc-1',
      _source: {
        id: 'doc-1',
        stepId: 'ask',
        stepType: 'waitForInput',
        status: 'completed',
        spaceId: 'default',
        workflowId: 'wf-1',
        workflowRunId: 'run-1',
        startedAt: '2026-04-28T15:00:00.000Z',
        finishedAt: '2026-04-28T15:30:00.000Z',
        output: { approved: true },
        globalExecutionIndex: 0,
        stepExecutionIndex: 0,
        topologicalIndex: 0,
        scopeStack: [],
        isTestRun: false,
        ...overrides,
      },
    });

    const mockAliveWorkflowsLookup = (aliveIds: string[]) => {
      mockEsClient.search.mockResolvedValueOnce({
        hits: {
          hits: aliveIds.map((id) => ({ _id: id })),
          total: { value: aliveIds.length },
        },
      } as any);
    };

    it('matches either terminated steps or audit-stamped (responded but not yet resumed) steps', async () => {
      mockEsClient.search.mockResolvedValueOnce({
        hits: { hits: [buildProcessedHit()], total: { value: 1 } },
      } as any);
      mockAliveWorkflowsLookup(['wf-1']);

      const result = await service.listProcessedWaitForInputSteps('default');

      expect(mockEsClient.search).toHaveBeenCalledTimes(2);
      const searchArgs = mockEsClient.search.mock.calls[0][0] as {
        index: string;
        query: {
          bool: {
            must: Array<Record<string, unknown>>;
            should?: Array<Record<string, unknown>>;
            minimum_should_match?: number;
          };
        };
        sort: unknown;
      };
      expect(searchArgs.index).toBe(WORKFLOWS_STEP_EXECUTIONS_INDEX);
      expect(searchArgs.query.bool.must).toEqual(
        expect.arrayContaining([
          { term: { spaceId: 'default' } },
          { term: { stepType: 'waitForInput' } },
        ])
      );
      expect(searchArgs.query.bool.should).toEqual([
        { exists: { field: 'finishedAt' } },
        { exists: { field: 'hitl.respondedAt' } },
      ]);
      expect(searchArgs.query.bool.minimum_should_match).toBe(1);
      expect(searchArgs.sort).toEqual([
        { 'hitl.respondedAt': { order: 'desc', missing: '_last' } },
        { finishedAt: { order: 'desc', missing: '_last' } },
      ]);
      expect(result.total).toBe(1);
      expect(result.results).toHaveLength(1);
    });

    it('keeps settled waiting_for_input rows with finishedAt in processed history', async () => {
      mockEsClient.search.mockResolvedValueOnce({
        hits: {
          hits: [
            buildProcessedHit({
              id: 'settled-wait',
              status: 'waiting_for_input',
              hitl: undefined,
              output: undefined,
            }),
          ],
          total: { value: 1 },
        },
      } as any);
      mockAliveWorkflowsLookup(['wf-1']);

      const result = await service.listProcessedWaitForInputSteps('default');

      expect(result.results.map((r) => r.id)).toEqual(['settled-wait']);
      expect(result.total).toBe(1);
    });

    it('paginates via from/size derived from page/perPage', async () => {
      mockEsClient.search.mockResolvedValueOnce({
        hits: { hits: [], total: { value: 0 } },
      } as any);

      await service.listProcessedWaitForInputSteps('default', { page: 4, perPage: 10 });

      const searchArgs = mockEsClient.search.mock.calls[0][0] as { from: number; size: number };
      expect(searchArgs.size).toBe(10);
      expect(searchArgs.from).toBe(30);
    });

    it('swallows index_not_found_exception with an empty result (cold install case)', async () => {
      mockEsClient.search.mockRejectedValueOnce(
        new errors.ResponseError({
          statusCode: 404,
          body: { error: { type: 'index_not_found_exception' } },
          headers: {},
          meta: {} as any,
          warnings: [],
        })
      );

      const result = await service.listProcessedWaitForInputSteps('default');

      expect(result).toEqual({
        results: [],
        total: 0,
        reasoningByStepId: new Map(),
        deletedWorkflowIds: new Set(),
      });
    });

    it('logs and rethrows for any other ES failure', async () => {
      mockEsClient.search.mockRejectedValueOnce(new Error('boom'));

      await expect(service.listProcessedWaitForInputSteps('default')).rejects.toThrow('boom');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to list processed wait-for-input step executions')
      );
    });

    it('retains history rows for deleted parent workflows and flags them via deletedWorkflowIds', async () => {
      mockEsClient.search.mockResolvedValueOnce({
        hits: {
          hits: [
            buildProcessedHit({ id: 'doc-1', workflowId: 'wf-alive' }),
            buildProcessedHit({ id: 'doc-2', workflowId: 'wf-deleted' }),
          ],
          total: { value: 2 },
        },
      } as any);
      mockAliveWorkflowsLookup(['wf-alive']);

      const result = await service.listProcessedWaitForInputSteps('default');

      expect(result.results.map((r) => r.id)).toEqual(['doc-1', 'doc-2']);
      expect(result.total).toBe(2);
      expect(result.deletedWorkflowIds).toEqual(new Set(['wf-deleted']));
    });

    it('reports an empty deletedWorkflowIds set when every parent workflow is alive', async () => {
      mockEsClient.search.mockResolvedValueOnce({
        hits: {
          hits: [
            buildProcessedHit({ id: 'doc-1', workflowId: 'wf-alive' }),
            buildProcessedHit({ id: 'doc-2', workflowId: 'wf-alive-2' }),
          ],
          total: { value: 2 },
        },
      } as any);
      mockAliveWorkflowsLookup(['wf-alive', 'wf-alive-2']);

      const result = await service.listProcessedWaitForInputSteps('default');

      expect(result.results.map((r) => r.id)).toEqual(['doc-1', 'doc-2']);
      expect(result.total).toBe(2);
      expect(result.deletedWorkflowIds.size).toBe(0);
    });

    describe('history filters & sort', () => {
      const mockEmptyListing = () => {
        mockEsClient.search.mockResolvedValueOnce({
          hits: { hits: [], total: { value: 0 } },
        } as any);
      };

      it('omits all filter clauses when no filters are supplied', async () => {
        mockEmptyListing();

        await service.listProcessedWaitForInputSteps('default');

        const must = (mockEsClient.search.mock.calls[0][0] as any).query.bool.must;
        expect(must).toEqual([
          { term: { spaceId: 'default' } },
          { term: { stepType: 'waitForInput' } },
        ]);
      });

      it('pushes channel/workflowId/respondedBy as terms clauses (OR within field)', async () => {
        mockEmptyListing();

        await service.listProcessedWaitForInputSteps('default', {
          channel: ['inbox', 'slack'],
          workflowId: ['wf-1'],
          respondedBy: ['alice'],
        });

        const must = (mockEsClient.search.mock.calls[0][0] as any).query.bool.must;
        expect(must).toContainEqual({ terms: { 'hitl.channel': ['inbox', 'slack'] } });
        expect(must).toContainEqual({ terms: { workflowId: ['wf-1'] } });
        expect(must).toContainEqual({ terms: { 'hitl.respondedBy': ['alice'] } });
      });

      it('translates free-text `q` into a case-insensitive prefix OR across the keyword fields', async () => {
        mockEmptyListing();

        await service.listProcessedWaitForInputSteps('default', { q: 'ali*ce' });

        const must = (mockEsClient.search.mock.calls[0][0] as any).query.bool.must;
        const qClause = must.find((clause: any) => clause.bool?.should?.[0]?.prefix);
        expect(qClause.bool.minimum_should_match).toBe(1);
        expect(qClause.bool.should).toEqual([
          { prefix: { 'hitl.respondedBy': { value: 'ali*ce', case_insensitive: true } } },
          { prefix: { workflowId: { value: 'ali*ce', case_insensitive: true } } },
          { prefix: { stepId: { value: 'ali*ce', case_insensitive: true } } },
        ]);
      });

      it('threads sortOrder through both the respondedAt and finishedAt sort keys', async () => {
        mockEmptyListing();

        await service.listProcessedWaitForInputSteps('default', { sortOrder: 'asc' });

        const sort = (mockEsClient.search.mock.calls[0][0] as any).sort;
        expect(sort).toEqual([
          { 'hitl.respondedAt': { order: 'asc', missing: '_last' } },
          { finishedAt: { order: 'asc', missing: '_last' } },
        ]);
      });
    });

    describe('predecessor reasoning resolution', () => {
      const mockListingWithWaitStep = (overrides: Record<string, unknown> = {}) => {
        mockEsClient.search.mockResolvedValueOnce({
          hits: {
            hits: [
              buildProcessedHit({
                id: 'wait-1',
                workflowId: 'wf-1',
                workflowRunId: 'run-1',
                startedAt: '2026-04-28T15:00:00.000Z',
                ...overrides,
              }),
            ],
            total: { value: 1 },
          },
        } as any);
        mockAliveWorkflowsLookup(['wf-1']);
      };

      it('skips predecessor reasoning unless explicitly requested', async () => {
        mockListingWithWaitStep();

        const result = await service.listProcessedWaitForInputSteps('default');

        expect(mockEsClient.search).toHaveBeenCalledTimes(2);
        expect(result.reasoningByStepId.size).toBe(0);
      });

      it('surfaces the reasoning blob from the immediate predecessor step when requested', async () => {
        mockListingWithWaitStep();
        mockEsClient.search.mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _source: {
                  workflowRunId: 'run-1',
                  finishedAt: '2026-04-28T14:59:00.000Z',
                  output: { reasoning: { summary: 'did the thing' } },
                },
              },
              {
                _source: {
                  workflowRunId: 'run-1',
                  finishedAt: '2026-04-28T14:00:00.000Z',
                  output: { reasoning: { summary: 'older, ignored' } },
                },
              },
            ],
          },
        } as any);

        const result = await service.listProcessedWaitForInputSteps('default', {
          includeReasoning: true,
        });

        const reasoningArgs = mockEsClient.search.mock.calls[2][0] as any;
        expect(reasoningArgs).toMatchObject({
          index: WORKFLOWS_STEP_EXECUTIONS_INDEX,
          _source: { includes: ['workflowRunId', 'finishedAt', 'output.reasoning'] },
          size: 1000,
          track_total_hits: false,
        });
        expect(reasoningArgs.query.bool.must).toEqual(
          expect.arrayContaining([
            { term: { spaceId: 'default' } },
            { terms: { workflowRunId: ['run-1'] } },
            { term: { status: 'completed' } },
            { range: { finishedAt: { lte: '2026-04-28T15:00:00.000Z' } } },
          ])
        );
        expect(result.reasoningByStepId.get('wait-1')).toEqual({ summary: 'did the thing' });
      });

      it('skips reasoning when every completed step finished after the wait step started', async () => {
        mockListingWithWaitStep();
        mockEsClient.search.mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _source: {
                  workflowRunId: 'run-1',
                  finishedAt: '2026-04-28T15:30:00.000Z',
                  output: { reasoning: { summary: 'after the pause' } },
                },
              },
            ],
          },
        } as any);

        const result = await service.listProcessedWaitForInputSteps('default', {
          includeReasoning: true,
        });

        expect(result.reasoningByStepId.has('wait-1')).toBe(false);
      });

      it('ignores predecessors whose output carries no reasoning object', async () => {
        mockListingWithWaitStep();
        mockEsClient.search.mockResolvedValueOnce({
          hits: {
            hits: [
              {
                _source: {
                  workflowRunId: 'run-1',
                  finishedAt: '2026-04-28T14:59:00.000Z',
                  output: { approved: true },
                },
              },
            ],
          },
        } as any);

        const result = await service.listProcessedWaitForInputSteps('default', {
          includeReasoning: true,
        });

        expect(result.reasoningByStepId.size).toBe(0);
      });

      it('never fails the listing when the predecessor lookup errors', async () => {
        mockListingWithWaitStep();
        mockEsClient.search.mockRejectedValueOnce(new Error('predecessor boom'));

        const result = await service.listProcessedWaitForInputSteps('default', {
          includeReasoning: true,
        });

        expect(result.results.map((r) => r.id)).toEqual(['wait-1']);
        expect(result.reasoningByStepId.size).toBe(0);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Failed to resolve predecessor reasoning')
        );
      });
    });
  });

  describe('listProcessedWaitForInputFacets', () => {
    const aggResponse = (
      channelBuckets: Array<{ key: string; doc_count: number }>,
      respondedByBuckets: Array<{ key: string; doc_count: number }>
    ) =>
      ({
        aggregations: {
          channel: { buckets: channelBuckets },
          respondedBy: { buckets: respondedByBuckets },
        },
      } as any);

    it('issues a size:0 aggregation with the listing baseline scope and NO user filters', async () => {
      mockEsClient.search.mockResolvedValueOnce(aggResponse([], []));

      await service.listProcessedWaitForInputFacets('default');

      const args = mockEsClient.search.mock.calls[0][0] as any;
      expect(args.index).toBe(WORKFLOWS_STEP_EXECUTIONS_INDEX);
      expect(args.size).toBe(0);
      expect(args.query.bool.must).toEqual([
        { term: { spaceId: 'default' } },
        { term: { stepType: 'waitForInput' } },
      ]);
      expect(args.query.bool.should).toEqual([
        { exists: { field: 'finishedAt' } },
        { exists: { field: 'hitl.respondedAt' } },
      ]);
      expect(args.query.bool.minimum_should_match).toBe(1);
      expect(args.aggs.channel.terms).toEqual({ field: 'hitl.channel', size: 50 });
      expect(args.aggs.respondedBy.terms).toEqual({ field: 'hitl.respondedBy', size: 50 });
    });

    it('honours a custom maxBuckets cap on both terms aggs', async () => {
      mockEsClient.search.mockResolvedValueOnce(aggResponse([], []));

      await service.listProcessedWaitForInputFacets('default', { maxBuckets: 5 });

      const args = mockEsClient.search.mock.calls[0][0] as any;
      expect(args.aggs.channel.terms.size).toBe(5);
      expect(args.aggs.respondedBy.terms.size).toBe(5);
    });

    it('maps agg buckets into { value, count } arrays preserving the agg count order', async () => {
      mockEsClient.search.mockResolvedValueOnce(
        aggResponse(
          [
            { key: 'inbox', doc_count: 7 },
            { key: 'slack', doc_count: 3 },
          ],
          [{ key: 'alice', doc_count: 6 }]
        )
      );

      const result = await service.listProcessedWaitForInputFacets('default');

      expect(result).toEqual({
        channel: [
          { value: 'inbox', count: 7 },
          { value: 'slack', count: 3 },
        ],
        respondedBy: [{ value: 'alice', count: 6 }],
      });
    });

    it('drops empty-string bucket values defensively', async () => {
      mockEsClient.search.mockResolvedValueOnce(
        aggResponse(
          [
            { key: '', doc_count: 4 },
            { key: 'inbox', doc_count: 2 },
          ],
          []
        )
      );

      const result = await service.listProcessedWaitForInputFacets('default');

      expect(result.channel).toEqual([{ value: 'inbox', count: 2 }]);
    });

    it('returns empty buckets when aggregations are absent from the response', async () => {
      mockEsClient.search.mockResolvedValueOnce({} as any);

      const result = await service.listProcessedWaitForInputFacets('default');

      expect(result).toEqual({ channel: [], respondedBy: [] });
    });

    it('swallows index_not_found_exception with empty buckets (cold install case)', async () => {
      mockEsClient.search.mockRejectedValueOnce(
        new errors.ResponseError({
          statusCode: 404,
          body: { error: { type: 'index_not_found_exception' } },
          headers: {},
          meta: {} as any,
          warnings: [],
        })
      );

      const result = await service.listProcessedWaitForInputFacets('default');

      expect(result).toEqual({ channel: [], respondedBy: [] });
    });

    it('logs and rethrows on any other ES failure', async () => {
      mockEsClient.search.mockRejectedValueOnce(new Error('boom'));

      await expect(service.listProcessedWaitForInputFacets('default')).rejects.toThrow('boom');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to compute processed wait-for-input facets')
      );
    });
  });

  describe('getWaitingStepExecutionId', () => {
    it('resolves the only claimable waitForInput step for the run', async () => {
      mockEsClient.search.mockResolvedValueOnce({
        hits: { hits: [{ _id: 'step-exec-7', _source: { id: 'step-exec-7' } }] },
      } as any);

      const id = await service.getWaitingStepExecutionId('run-1', 'default');

      expect(id).toBe('step-exec-7');
      const args = mockEsClient.search.mock.calls[0][0] as {
        index: string;
        size: number;
        query: {
          bool: {
            must: Array<Record<string, unknown>>;
            must_not: Array<Record<string, unknown>>;
          };
        };
      };
      expect(args.index).toBe(WORKFLOWS_STEP_EXECUTIONS_INDEX);
      expect(args.size).toBe(1);
      expect(args.query.bool.must).toEqual(
        expect.arrayContaining([
          { term: { workflowRunId: 'run-1' } },
          { term: { spaceId: 'default' } },
          { term: { stepType: 'waitForInput' } },
          { term: { status: 'waiting_for_input' } },
        ])
      );
      expect(args.query.bool.must_not).toEqual(
        expect.arrayContaining([
          { exists: { field: 'finishedAt' } },
          { exists: { field: 'hitl.respondedAt' } },
        ])
      );
    });

    it('returns null when no claimable step is found', async () => {
      mockEsClient.search.mockResolvedValueOnce({ hits: { hits: [] } } as any);

      expect(await service.getWaitingStepExecutionId('run-1', 'default')).toBeNull();
    });

    it('returns null (not throws) when the step-executions index does not exist yet', async () => {
      mockEsClient.search.mockRejectedValueOnce(
        new errors.ResponseError({
          statusCode: 404,
          body: { error: { type: 'index_not_found_exception' } },
          headers: {},
          meta: {} as any,
          warnings: [],
        })
      );

      expect(await service.getWaitingStepExecutionId('run-1', 'default')).toBeNull();
    });
  });

  describe('markStepAsResponded', () => {
    const audit = {
      respondedBy: 'alice',
      respondedAt: '2026-04-29T10:00:00.000Z',
      channel: 'inbox',
    };

    it('issues a scripted partial update guarded on spaceId with refresh: wait_for', async () => {
      (mockEsClient.update as jest.Mock).mockResolvedValueOnce({ result: 'updated' });

      const ok = await service.markStepAsResponded('step-exec-1', audit, 'default');

      expect(ok).toBe(true);
      const args = (mockEsClient.update as jest.Mock).mock.calls[0][0] as {
        index: string;
        id: string;
        refresh: string;
        retry_on_conflict: number;
        script: { source: string; lang: string; params: Record<string, unknown> };
      };
      expect(args.index).toBe(WORKFLOWS_STEP_EXECUTIONS_INDEX);
      expect(args.id).toBe('step-exec-1');
      expect(args.refresh).toBe('wait_for');
      expect(args.retry_on_conflict).toBeGreaterThan(0);
      expect(args.script.lang).toBe('painless');
      expect(args.script.source).toContain('ctx._source.spaceId != params.spaceId');
      expect(args.script.source).toContain('ctx._source.finishedAt != null');
      expect(args.script.source).toContain('params.settledStatuses.contains(ctx._source.status)');
      expect(args.script.source).toContain('ctx._source.hitl.respondedAt != null');
      expect(args.script.source).toContain('ctx._source.hitl.respondedBy = params.respondedBy');
      expect(args.script.source).toContain('ctx._source.hitl.respondedAt = params.respondedAt');
      expect(args.script.source).toContain('ctx._source.hitl.channel = params.channel');
      expect(args.script.params).toEqual({
        spaceId: 'default',
        ...audit,
        settledStatuses: expect.arrayContaining([
          'completed',
          'failed',
          'cancelled',
          'timed_out',
          'skipped',
        ]),
      });
    });

    it('returns false when the scripted update no-ops', async () => {
      // A noop means either the space guard failed or another responder
      // already set hitl.respondedAt. The provider treats both as a conflict
      // and does not schedule a second resume.
      (mockEsClient.update as jest.Mock).mockResolvedValueOnce({ result: 'noop' });

      const ok = await service.markStepAsResponded('step-exec-1', audit, 'default');

      expect(ok).toBe(false);
    });

    it('returns false (not throws) when the step doc is gone', async () => {
      (mockEsClient.update as jest.Mock).mockRejectedValueOnce(
        new errors.ResponseError({
          statusCode: 404,
          body: { error: { type: 'document_missing_exception' } },
          headers: {},
          meta: {} as any,
          warnings: [],
        })
      );

      const ok = await service.markStepAsResponded('step-exec-gone', audit, 'default');

      expect(ok).toBe(false);
    });

    it('logs and rethrows on any other ES failure so the caller can decide', async () => {
      (mockEsClient.update as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      await expect(service.markStepAsResponded('step-exec-1', audit, 'default')).rejects.toThrow(
        'boom'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to mark step execution step-exec-1 as responded')
      );
    });
  });
});
