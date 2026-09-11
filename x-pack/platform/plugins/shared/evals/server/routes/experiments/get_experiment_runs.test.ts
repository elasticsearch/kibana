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
import { EVALS_EXPERIMENT_RUNS_URL, API_VERSIONS } from '@kbn/evals-common';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { createEvaluatorRegistryMock } from '../../evaluators/registry.mock';
import { registerGetExperimentRunsRoute } from './get_experiment_runs';

describe('GET /internal/evals/experiments/{experimentId}/runs', () => {
  const setup = () => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();
    registerGetExperimentRunsRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: createEvaluatorRegistryMock(),
      getInferenceStart: async () => ({ getClient: jest.fn() } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    });

    const versionedRouter = router.versioned as MockedVersionedRouter;
    const { handler } = versionedRouter.getRoute('get', EVALS_EXPERIMENT_RUNS_URL).versions[
      API_VERSIONS.internal.v1
    ];

    const evaluationScoreService = {
      search: jest.fn().mockResolvedValue({ hits: { hits: [] } }),
    };
    const context = coreMock.createCustomRequestHandlerContext({
      evals: { evaluationScoreService } as any,
    });

    return { handler, context, evaluationScoreService, logger };
  };

  const makeRequest = (
    query: Record<string, string | number> = {},
    experimentId = 'experiment-abc'
  ) =>
    httpServerMock.createKibanaRequest({
      method: 'get',
      path: EVALS_EXPERIMENT_RUNS_URL.replace('{experimentId}', experimentId),
      params: { experimentId },
      query: { page: 1, per_page: 20, ...query },
    });

  const runBucket = (exampleIndex: number, repetition: number, docCount = 2) => ({
    key: {
      dataset_name: 'Dataset One',
      dataset_id: 'ds-1',
      example_index: exampleIndex,
      example_id: `ex-${exampleIndex}`,
      repetition_index: repetition,
    },
    doc_count: docCount,
  });

  const scoreDocument = ({
    exampleIndex,
    repetition,
    evaluator,
  }: {
    exampleIndex: number;
    repetition: number;
    evaluator: Record<string, unknown>;
  }) => ({
    _source: {
      experiment_id: 'experiment-abc',
      example: {
        id: `ex-${exampleIndex}`,
        index: exampleIndex,
        input: { question: `What is ${exampleIndex}?` },
        dataset: { id: 'ds-1', name: 'Dataset One' },
      },
      task: {
        trace_id: `trace-task-${exampleIndex}-${repetition}`,
        repetition_index: repetition,
        output: { answer: `Answer ${exampleIndex}, take ${repetition}` },
        model: { id: 'gpt-4', family: 'gpt-4', provider: 'openai' },
      },
      evaluator,
    },
  });

  it('returns 404 when the experiment has no runs at all', async () => {
    const { handler, context, evaluationScoreService } = setup();
    evaluationScoreService.search.mockResolvedValueOnce({
      hits: { hits: [] },
      aggregations: { runs: { buckets: [] } },
    } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(404);
    expect(response.payload).toEqual({
      message: 'Experiment not found for experiment: experiment-abc',
    });
    expect(evaluationScoreService.search).toHaveBeenCalledTimes(1);
  });

  it('returns runs grouping every evaluator result under its example x repetition', async () => {
    const { handler, context, evaluationScoreService } = setup();
    evaluationScoreService.search
      .mockResolvedValueOnce({
        hits: { hits: [] },
        aggregations: { runs: { buckets: [runBucket(0, 0), runBucket(0, 1)] } },
      } as any)
      .mockResolvedValueOnce({
        hits: {
          hits: [
            scoreDocument({
              exampleIndex: 0,
              repetition: 0,
              evaluator: {
                name: 'correctness',
                kind: 'llm',
                score: 0.9,
                label: 'good',
                explanation: 'Accurate.',
                trace_id: 'trace-eval-1',
                model: { id: 'claude-3', family: 'Claude', provider: 'Anthropic' },
              },
            }),
            scoreDocument({
              exampleIndex: 0,
              repetition: 0,
              evaluator: { name: 'latency', kind: 'code', score: 0.5 },
            }),
            scoreDocument({
              exampleIndex: 0,
              repetition: 1,
              evaluator: { name: 'correctness', kind: 'llm', score: 0.7 },
            }),
            scoreDocument({
              exampleIndex: 0,
              repetition: 1,
              evaluator: { name: 'latency', kind: 'code', score: 0.8 },
            }),
          ],
        },
      } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload).toEqual({
      experiment_id: 'experiment-abc',
      total: 2,
      page: 1,
      per_page: 20,
      runs: [
        {
          example: {
            id: 'ex-0',
            index: 0,
            input: { question: 'What is 0?' },
            dataset: { id: 'ds-1', name: 'Dataset One' },
          },
          task: {
            trace_id: 'trace-task-0-0',
            repetition_index: 0,
            output: { answer: 'Answer 0, take 0' },
            model: { id: 'gpt-4', family: 'gpt-4', provider: 'openai' },
          },
          evaluators: [
            {
              name: 'correctness',
              kind: 'llm',
              score: 0.9,
              label: 'good',
              explanation: 'Accurate.',
              trace_id: 'trace-eval-1',
              model: { id: 'claude-3', family: 'Claude', provider: 'Anthropic' },
            },
            { name: 'latency', kind: 'code', score: 0.5 },
          ],
        },
        {
          example: {
            id: 'ex-0',
            index: 0,
            input: { question: 'What is 0?' },
            dataset: { id: 'ds-1', name: 'Dataset One' },
          },
          task: {
            trace_id: 'trace-task-0-1',
            repetition_index: 1,
            output: { answer: 'Answer 0, take 1' },
            model: { id: 'gpt-4', family: 'gpt-4', provider: 'openai' },
          },
          evaluators: [
            { name: 'correctness', kind: 'llm', score: 0.7 },
            { name: 'latency', kind: 'code', score: 0.8 },
          ],
        },
      ],
    });
  });

  it('drops a run whose documents were truncated by the MAX_SCORES_PER_QUERY cap', async () => {
    // Simulates the cap: aggregation says run (0,1) has 2 scores but the ES
    // fetch only returned 1 of them (the page hit the 10K document limit).
    const { handler, context, evaluationScoreService } = setup();
    evaluationScoreService.search
      .mockResolvedValueOnce({
        hits: { hits: [] },
        aggregations: { runs: { buckets: [runBucket(0, 0), runBucket(0, 1)] } },
      } as any)
      .mockResolvedValueOnce({
        hits: {
          hits: [
            scoreDocument({
              exampleIndex: 0,
              repetition: 0,
              evaluator: { name: 'correctness', kind: 'llm', score: 0.9 },
            }),
            scoreDocument({
              exampleIndex: 0,
              repetition: 0,
              evaluator: { name: 'latency', kind: 'code', score: 0.5 },
            }),
            // Only 1 of 2 expected docs for run (0, 1) came back — truncated.
            scoreDocument({
              exampleIndex: 0,
              repetition: 1,
              evaluator: { name: 'correctness', kind: 'llm', score: 0.7 },
            }),
          ],
        },
      } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    // Run (0, 1) is dropped rather than returned with a partial evaluator list.
    expect(response.payload.runs).toHaveLength(1);
    expect(response.payload.runs[0].task.repetition_index).toBe(0);
  });

  it('fetches full documents without excluding the unbounded source fields', async () => {
    const { handler, context, evaluationScoreService } = setup();
    evaluationScoreService.search
      .mockResolvedValueOnce({
        hits: { hits: [] },
        aggregations: { runs: { buckets: [runBucket(0, 0, 3)] } },
      } as any)
      .mockResolvedValueOnce({ hits: { hits: [] } } as any);

    await handler(context, makeRequest(), kibanaResponseFactory);

    const fetchRequest = evaluationScoreService.search.mock.calls[1][0];
    expect(fetchRequest._source_excludes).toBeUndefined();
    expect(fetchRequest.size).toBe(3);
    expect(fetchRequest.query.bool.should).toEqual([
      {
        bool: {
          filter: [
            { term: { 'example.dataset.id': 'ds-1' } },
            { term: { 'example.id': 'ex-0' } },
            { term: { 'task.repetition_index': 0 } },
          ],
        },
      },
    ]);
  });

  it('never attributes a model to a code evaluator, even when its document carries one', async () => {
    const { handler, context, evaluationScoreService } = setup();
    evaluationScoreService.search
      .mockResolvedValueOnce({
        hits: { hits: [] },
        aggregations: { runs: { buckets: [runBucket(0, 0, 1)] } },
      } as any)
      .mockResolvedValueOnce({
        hits: {
          hits: [
            scoreDocument({
              exampleIndex: 0,
              repetition: 0,
              // A stray model (e.g. from legacy documents) must not be attributed.
              evaluator: { name: 'latency', kind: 'code', score: 0.5, model: { id: 'claude-3' } },
            }),
          ],
        },
      } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload.runs[0].evaluators).toEqual([
      { name: 'latency', kind: 'code', score: 0.5 },
    ]);
  });

  it('returns an empty page with the total when the page is past the last run', async () => {
    const { handler, context, evaluationScoreService } = setup();
    evaluationScoreService.search.mockResolvedValueOnce({
      hits: { hits: [] },
      aggregations: { runs: { buckets: [runBucket(0, 0), runBucket(0, 1), runBucket(1, 0)] } },
    } as any);

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
      runs: [],
    });
    expect(evaluationScoreService.search).toHaveBeenCalledTimes(1);
  });

  it('paginates by slicing the run window before fetching documents', async () => {
    const { handler, context, evaluationScoreService } = setup();
    evaluationScoreService.search
      .mockResolvedValueOnce({
        hits: { hits: [] },
        aggregations: {
          runs: { buckets: [runBucket(0, 0), runBucket(0, 1), runBucket(1, 0), runBucket(1, 1)] },
        },
      } as any)
      .mockResolvedValueOnce({ hits: { hits: [] } } as any);

    const response = await handler(
      context,
      makeRequest({ page: 2, per_page: 2 }),
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    expect(response.payload.total).toBe(4);
    const fetchRequest = evaluationScoreService.search.mock.calls[1][0];
    expect(fetchRequest.query.bool.should).toEqual([
      {
        bool: {
          filter: [
            { term: { 'example.dataset.id': 'ds-1' } },
            { term: { 'example.id': 'ex-1' } },
            { term: { 'task.repetition_index': 0 } },
          ],
        },
      },
      {
        bool: {
          filter: [
            { term: { 'example.dataset.id': 'ds-1' } },
            { term: { 'example.id': 'ex-1' } },
            { term: { 'task.repetition_index': 1 } },
          ],
        },
      },
    ]);
  });

  it('returns 500 when ES throws', async () => {
    const { handler, context, evaluationScoreService, logger } = setup();
    evaluationScoreService.search.mockRejectedValueOnce(new Error('ES error'));

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });
});
