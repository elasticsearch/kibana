/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { kibanaResponseFactory } from '@kbn/core/server';
import { coreMock, httpServerMock, httpServiceMock } from '@kbn/core/server/mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import type { MockedVersionedRouter } from '@kbn/core-http-router-server-mocks';
import { EVALS_EXPERIMENT_TRACES_URL, API_VERSIONS, TRACES_INDEX_PATTERN } from '@kbn/evals-common';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { createEvaluatorRegistryMock } from '../../evaluators/registry.mock';
import { registerGetExperimentTracesRoute } from './get_experiment_traces';

describe('GET /internal/evals/experiments/{experimentId}/traces', () => {
  const setup = () => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();
    registerGetExperimentTracesRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: createEvaluatorRegistryMock(),
      getInferenceStart: async () => ({ getClient: jest.fn() } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    });

    const versionedRouter = router.versioned as MockedVersionedRouter;
    const { handler } = versionedRouter.getRoute('get', EVALS_EXPERIMENT_TRACES_URL).versions[
      API_VERSIONS.internal.v1
    ];

    const evaluationScoreService = {
      search: jest.fn().mockResolvedValue({ hits: { total: { value: 0 }, hits: [] } }),
    };
    const mockCoreContext = coreMock.createRequestHandlerContext();
    const context = coreMock.createCustomRequestHandlerContext({
      core: mockCoreContext,
      evals: { evaluationScoreService } as any,
    });
    const esClient = mockCoreContext.elasticsearch.client.asCurrentUser;

    return { handler, context, evaluationScoreService, esClient, logger };
  };

  const makeRequest = (
    query: Record<string, string | number> = {},
    experimentId = 'experiment-abc'
  ) =>
    httpServerMock.createKibanaRequest({
      method: 'get',
      path: EVALS_EXPERIMENT_TRACES_URL.replace('{experimentId}', experimentId),
      params: { experimentId },
      query: { page: 1, per_page: 10, ...query },
    });

  const scoreAggregationResponse = ({
    taskTraceIds = [] as string[],
    evaluatorTraces = [] as Array<{ evaluator_name: string; trace_id: string }>,
    totalScores = 10,
  } = {}) =>
    ({
      hits: { total: { value: totalScores }, hits: [] },
      aggregations: {
        task_traces: { buckets: taskTraceIds.map((traceId) => ({ key: { trace_id: traceId } })) },
        evaluator_traces: { buckets: evaluatorTraces.map((key) => ({ key })) },
      },
    } as any);

  const spanHit = (traceId: string, spanId: string, timestamp: string, durationNs: number) => ({
    _id: spanId,
    _source: {
      span_id: spanId,
      trace_id: traceId,
      name: `span-${spanId}`,
      '@timestamp': timestamp,
      duration: durationNs,
    },
  });

  it('returns 400 when the evaluator filter is given without role=evaluator', async () => {
    const { handler, context, evaluationScoreService } = setup();

    const response = await handler(
      context,
      makeRequest({ evaluator: 'correctness' }),
      kibanaResponseFactory
    );

    expect(response.status).toBe(400);
    expect(response.payload).toEqual({
      message: 'The evaluator filter is only valid together with role=evaluator',
    });
    expect(evaluationScoreService.search).not.toHaveBeenCalled();
  });

  it('returns 404 when no score documents match the experiment', async () => {
    const { handler, context, esClient } = setup();

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(404);
    expect(response.payload).toEqual({
      message: 'Experiment not found for experiment: experiment-abc',
    });
    expect(esClient.msearch).not.toHaveBeenCalled();
  });

  it('names the evaluator in the 404 message when its filter matches nothing', async () => {
    const { handler, context } = setup();

    const response = await handler(
      context,
      makeRequest({ role: 'evaluator', evaluator: 'missing-evaluator' }),
      kibanaResponseFactory
    );

    expect(response.status).toBe(404);
    expect(response.payload).toEqual({
      message: 'Experiment not found for evaluator missing-evaluator: experiment-abc',
    });
  });

  it('resolves trace ids through score docs and fetches spans with one msearch, one sub-search per trace', async () => {
    const { handler, context, evaluationScoreService, esClient } = setup();
    evaluationScoreService.search.mockResolvedValueOnce(
      scoreAggregationResponse({
        taskTraceIds: ['trace-task-1'],
        evaluatorTraces: [{ evaluator_name: 'correctness', trace_id: 'trace-eval-1' }],
      })
    );
    esClient.msearch.mockResolvedValueOnce({
      responses: [
        {
          hits: {
            hits: [
              spanHit('trace-task-1', 's1', '2025-06-01T00:00:00.000Z', 2_000_000),
              spanHit('trace-task-1', 's2', '2025-06-01T00:00:05.000Z', 3_000_000),
            ],
          },
        },
        {
          hits: {
            hits: [spanHit('trace-eval-1', 's3', '2025-06-01T00:01:00.000Z', 1_000_000)],
          },
        },
      ],
    } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(esClient.msearch).toHaveBeenCalledTimes(1);
    expect(esClient.msearch).toHaveBeenCalledWith(
      expect.objectContaining({
        index: TRACES_INDEX_PATTERN,
        searches: [
          {},
          {
            query: { term: { trace_id: 'trace-task-1' } },
            sort: [{ '@timestamp': { order: 'asc' } }],
            size: 10000,
          },
          {},
          {
            query: { term: { trace_id: 'trace-eval-1' } },
            sort: [{ '@timestamp': { order: 'asc' } }],
            size: 10000,
          },
        ],
      })
    );
    expect(response.payload).toEqual({
      experiment_id: 'experiment-abc',
      total: 2,
      page: 1,
      per_page: 10,
      traces: [
        {
          trace_id: 'trace-task-1',
          role: 'task',
          spans: [
            {
              span_id: 's1',
              trace_id: 'trace-task-1',
              name: 'span-s1',
              start_time: '2025-06-01T00:00:00.000Z',
              duration_ms: 2,
              attributes: {},
            },
            {
              span_id: 's2',
              trace_id: 'trace-task-1',
              name: 'span-s2',
              start_time: '2025-06-01T00:00:05.000Z',
              duration_ms: 3,
              attributes: {},
            },
          ],
          total_spans: 2,
          // span s2 starts at T+5s and lasts 3ms: latestEnd 5003ms - earliestStart 0ms.
          duration_ms: 5003,
        },
        {
          trace_id: 'trace-eval-1',
          role: 'evaluator',
          evaluator_name: 'correctness',
          spans: [
            {
              span_id: 's3',
              trace_id: 'trace-eval-1',
              name: 'span-s3',
              start_time: '2025-06-01T00:01:00.000Z',
              duration_ms: 1,
              attributes: {},
            },
          ],
          total_spans: 1,
          duration_ms: 1,
        },
      ],
    });
  });

  it('returns an expired trace as a reference with empty spans', async () => {
    const { handler, context, evaluationScoreService, esClient } = setup();
    evaluationScoreService.search.mockResolvedValueOnce(
      scoreAggregationResponse({ taskTraceIds: ['trace-aged-out'] })
    );
    esClient.msearch.mockResolvedValueOnce({ responses: [{ hits: { hits: [] } }] } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload.traces).toEqual([
      {
        trace_id: 'trace-aged-out',
        role: 'task',
        spans: [],
        total_spans: 0,
        duration_ms: 0,
      },
    ]);
  });

  it('restricts the aggregation to the requested role', async () => {
    const { handler, context, evaluationScoreService, esClient } = setup();
    evaluationScoreService.search.mockResolvedValueOnce({
      hits: { total: { value: 4 }, hits: [] },
      aggregations: { task_traces: { buckets: [{ key: { trace_id: 'trace-task-1' } }] } },
    } as any);
    esClient.msearch.mockResolvedValueOnce({ responses: [{ hits: { hits: [] } }] } as any);

    const response = await handler(context, makeRequest({ role: 'task' }), kibanaResponseFactory);

    expect(response.status).toBe(200);
    const { aggs } = evaluationScoreService.search.mock.calls[0][0];
    expect(Object.keys(aggs)).toEqual(['task_traces']);
    expect(response.payload.traces).toEqual([
      { trace_id: 'trace-task-1', role: 'task', spans: [], total_spans: 0, duration_ms: 0 },
    ]);
  });

  it('filters the score query by evaluator name for role=evaluator', async () => {
    const { handler, context, evaluationScoreService, esClient } = setup();
    evaluationScoreService.search.mockResolvedValueOnce({
      hits: { total: { value: 2 }, hits: [] },
      aggregations: {
        evaluator_traces: {
          buckets: [{ key: { evaluator_name: 'correctness', trace_id: 'trace-eval-1' } }],
        },
      },
    } as any);
    esClient.msearch.mockResolvedValueOnce({ responses: [{ hits: { hits: [] } }] } as any);

    const response = await handler(
      context,
      makeRequest({ role: 'evaluator', evaluator: 'correctness' }),
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    const { query, aggs } = evaluationScoreService.search.mock.calls[0][0];
    expect(query.bool.must).toContainEqual({ term: { 'evaluator.name': 'correctness' } });
    expect(Object.keys(aggs)).toEqual(['evaluator_traces']);
    expect(response.payload.traces).toEqual([
      {
        trace_id: 'trace-eval-1',
        role: 'evaluator',
        evaluator_name: 'correctness',
        spans: [],
        total_spans: 0,
        duration_ms: 0,
      },
    ]);
  });

  it('paginates by trace and skips the span fetch on an empty page past the last trace', async () => {
    const { handler, context, evaluationScoreService, esClient } = setup();
    evaluationScoreService.search.mockResolvedValueOnce(
      scoreAggregationResponse({ taskTraceIds: ['trace-1', 'trace-2', 'trace-3'] })
    );

    const response = await handler(
      context,
      makeRequest({ page: 5, per_page: 2 }),
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    expect(response.payload).toEqual({
      experiment_id: 'experiment-abc',
      total: 3,
      page: 5,
      per_page: 2,
      traces: [],
    });
    expect(esClient.msearch).not.toHaveBeenCalled();
  });

  it('only fetches spans of the traces in the requested page', async () => {
    const { handler, context, evaluationScoreService, esClient } = setup();
    evaluationScoreService.search.mockResolvedValueOnce(
      scoreAggregationResponse({ taskTraceIds: ['trace-1', 'trace-2', 'trace-3', 'trace-4'] })
    );
    esClient.msearch.mockResolvedValueOnce({
      responses: [{ hits: { hits: [] } }, { hits: { hits: [] } }],
    } as any);

    const response = await handler(
      context,
      makeRequest({ page: 2, per_page: 2 }),
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    expect(response.payload.total).toBe(4);
    const { searches } = esClient.msearch.mock.calls[0][0] as any;
    expect(searches.filter((s: any) => s.query).map((s: any) => s.query.term.trace_id)).toEqual([
      'trace-3',
      'trace-4',
    ]);
  });

  it('returns 500 when an msearch item fails for one trace', async () => {
    const { handler, context, evaluationScoreService, esClient, logger } = setup();
    evaluationScoreService.search.mockResolvedValueOnce(
      scoreAggregationResponse({ taskTraceIds: ['trace-ok', 'trace-broken'] })
    );
    esClient.msearch.mockResolvedValueOnce({
      responses: [
        { hits: { hits: [] } },
        { error: { type: 'search_phase_execution_exception', reason: 'shard failure' } },
      ],
    } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('shard failure'));
  });

  it('returns 500 when ES throws', async () => {
    const { handler, context, evaluationScoreService, logger } = setup();
    evaluationScoreService.search.mockRejectedValueOnce(new Error('ES error'));

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });
});
