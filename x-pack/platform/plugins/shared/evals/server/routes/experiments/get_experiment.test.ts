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
import { EVALS_EXPERIMENT_URL, API_VERSIONS, type EvaluatorStats } from '@kbn/evals-common';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import { createEvaluatorRegistryMock } from '../../evaluators/registry.mock';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { registerGetExperimentRoute } from './get_experiment';

describe('GET /internal/evals/experiments/{experimentId}', () => {
  const setup = () => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();
    registerGetExperimentRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: createEvaluatorRegistryMock(),
      getInferenceStart: async () => ({ getClient: jest.fn() } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    });

    const versionedRouter = router.versioned as MockedVersionedRouter;
    const { handler } = versionedRouter.getRoute('get', EVALS_EXPERIMENT_URL).versions[
      API_VERSIONS.internal.v1
    ];

    const evaluationScoreService = {
      search: jest.fn().mockResolvedValue({ hits: { hits: [] } }),
    };
    const context = coreMock.createCustomRequestHandlerContext({
      evals: {
        evaluationScoreService,
      } as any,
    });

    return { handler, context, evaluationScoreService, logger };
  };

  const makeRequest = (experimentId = 'experiment-abc') =>
    httpServerMock.createKibanaRequest({
      method: 'get',
      path: EVALS_EXPERIMENT_URL.replace('{experimentId}', experimentId),
      params: { experimentId },
      query: {},
    });

  it('returns 404 when no documents match the experiment', async () => {
    const { handler, context, evaluationScoreService } = setup();
    evaluationScoreService.search.mockResolvedValueOnce({ hits: { hits: [] } } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(404);
    expect(response.payload).toEqual({ message: 'Experiment not found: experiment-abc' });
  });

  it('returns experiment detail with stats on success', async () => {
    const { handler, context, evaluationScoreService } = setup();

    evaluationScoreService.search.mockResolvedValueOnce({
      hits: {
        hits: [
          {
            _source: {
              task: { model: { id: 'gpt-4', family: 'gpt-4', provider: 'openai' } },
              evaluator: { model: { id: 'claude-3', family: 'claude-3', provider: 'anthropic' } },
              metadata: { total_repetitions: 3 },
            },
          },
        ],
      },
    } as any);

    evaluationScoreService.search.mockResolvedValueOnce({
      aggregations: {
        by_dataset: {
          buckets: [
            {
              key: 'dataset-1',
              dataset_name: { buckets: [{ key: 'My Dataset' }] },
              example_count: { value: 5 },
              by_evaluator: {
                buckets: [
                  {
                    key: 'correctness',
                    score_stats: { avg: 0.85, std_deviation: 0.1, min: 0.5, max: 1.0, count: 10 },
                    score_median: { values: { '50.0': 0.9 } },
                    evaluator_model_id: {
                      buckets: [
                        {
                          key: 'claude-3',
                          family: { buckets: [{ key: 'claude-3' }] },
                          provider: { buckets: [{ key: 'anthropic' }] },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
        evaluator_models: {
          buckets: [
            {
              key: 'claude-3',
              family: { buckets: [{ key: 'claude-3' }] },
              provider: { buckets: [{ key: 'anthropic' }] },
            },
          ],
        },
      },
    } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload.experiment_id).toBe('experiment-abc');
    expect(response.payload.task_model.id).toBe('gpt-4');
    expect(response.payload.evaluator_model.id).toBe('claude-3');
    expect(response.payload.total_repetitions).toBe(3);
    expect(response.payload.stats).toHaveLength(1);
    expect(response.payload.stats[0]).toEqual({
      dataset_id: 'dataset-1',
      dataset_name: 'My Dataset',
      evaluator_name: 'correctness',
      example_count: 5,
      evaluator_model: { id: 'claude-3', family: 'claude-3', provider: 'anthropic' },
      stats: {
        mean: 0.85,
        median: 0.9,
        std_dev: 0.1,
        min: 0.5,
        max: 1.0,
        count: 10,
      },
    });
  });

  it('reports the judge model per evaluator so mixed-judge experiments read correctly', async () => {
    const { handler, context, evaluationScoreService } = setup();

    evaluationScoreService.search.mockResolvedValueOnce({
      hits: {
        hits: [
          {
            _source: {
              task: { model: { id: 'gpt-4', family: 'gpt-4', provider: 'openai' } },
              evaluator: { model: { id: 'claude-3', family: 'Claude', provider: 'Anthropic' } },
              metadata: { total_repetitions: 1 },
            },
          },
        ],
      },
    } as any);

    evaluationScoreService.search.mockResolvedValueOnce({
      aggregations: {
        by_dataset: {
          buckets: [
            {
              key: 'dataset-1',
              dataset_name: { buckets: [{ key: 'My Dataset' }] },
              example_count: { value: 5 },
              by_evaluator: {
                buckets: [
                  {
                    key: 'correctness',
                    score_stats: {},
                    score_median: { values: {} },
                    evaluator_model_id: {
                      buckets: [
                        {
                          key: 'claude-3',
                          family: { buckets: [{ key: 'Claude' }] },
                          provider: { buckets: [{ key: 'Anthropic' }] },
                        },
                      ],
                    },
                  },
                  {
                    key: 'groundedness',
                    score_stats: {},
                    score_median: { values: {} },
                    evaluator_model_id: {
                      buckets: [
                        {
                          key: 'gpt-4o',
                          family: { buckets: [{ key: 'GPT' }] },
                          provider: { buckets: [{ key: 'OpenAI' }] },
                        },
                      ],
                    },
                  },
                  {
                    key: 'relevance',
                    score_stats: {},
                    score_median: { values: {} },
                    evaluator_model_id: {
                      buckets: [
                        {
                          key: 'gpt-4o',
                          family: { buckets: [{ key: 'GPT' }] },
                          provider: { buckets: [{ key: 'OpenAI' }] },
                        },
                      ],
                    },
                  },
                  {
                    key: 'latency',
                    score_stats: {},
                    score_median: { values: {} },
                    evaluator_model_id: { buckets: [] },
                  },
                ],
              },
            },
          ],
        },
        evaluator_models: {
          buckets: [
            {
              key: 'gpt-4o',
              family: { buckets: [{ key: 'GPT' }] },
              provider: { buckets: [{ key: 'OpenAI' }] },
            },
            {
              key: 'claude-3',
              family: { buckets: [{ key: 'Claude' }] },
              provider: { buckets: [{ key: 'Anthropic' }] },
            },
          ],
        },
      },
    } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(
      response.payload.stats.map(
        ({ evaluator_name: name, evaluator_model: model }: EvaluatorStats) => [name, model]
      )
    ).toEqual([
      ['correctness', { id: 'claude-3', family: 'Claude', provider: 'Anthropic' }],
      ['groundedness', { id: 'gpt-4o', family: 'GPT', provider: 'OpenAI' }],
      ['relevance', { id: 'gpt-4o', family: 'GPT', provider: 'OpenAI' }],
      ['latency', undefined],
    ]);
    // The judge that produced the most scores, not the one on whichever document the search
    // returned.
    expect(response.payload.evaluator_model).toEqual({
      id: 'gpt-4o',
      family: 'GPT',
      provider: 'OpenAI',
    });
    // And every judge, that same one first, so consumers can tell that the evaluators differ.
    expect(response.payload.evaluator_models).toEqual([
      { id: 'gpt-4o', family: 'GPT', provider: 'OpenAI' },
      { id: 'claude-3', family: 'Claude', provider: 'Anthropic' },
    ]);
  });

  it('ranks judges by the scores they produced, the way the experiments listing does', async () => {
    const { handler, context, evaluationScoreService } = setup();

    evaluationScoreService.search.mockResolvedValueOnce({
      hits: {
        hits: [
          {
            _source: {
              task: { model: { id: 'gpt-4', family: 'gpt-4', provider: 'openai' } },
              metadata: { total_repetitions: 1 },
            },
          },
        ],
      },
    } as any);

    const claudeBucket = (key: string) => ({
      key,
      score_stats: {},
      score_median: { values: {} },
      evaluator_model_id: {
        buckets: [
          {
            key: 'claude-3',
            family: { buckets: [{ key: 'Claude' }] },
            provider: { buckets: [{ key: 'Anthropic' }] },
          },
        ],
      },
    });
    const gptBucket = (key: string) => ({
      key,
      score_stats: {},
      score_median: { values: {} },
      evaluator_model_id: {
        buckets: [
          {
            key: 'gpt-4o',
            family: { buckets: [{ key: 'GPT' }] },
            provider: { buckets: [{ key: 'OpenAI' }] },
          },
        ],
      },
    });

    // Two evaluators judged by gpt-4o against one judged by claude, but claude produced more
    // scores. The judge aggregation decides, since re-ranking here would name a predominant judge
    // the listing disagrees with.
    evaluationScoreService.search.mockResolvedValueOnce({
      aggregations: {
        by_dataset: {
          buckets: [
            {
              key: 'dataset-1',
              dataset_name: { buckets: [{ key: 'Dataset One' }] },
              example_count: { value: 5 },
              by_evaluator: {
                buckets: [
                  claudeBucket('correctness'),
                  gptBucket('groundedness'),
                  gptBucket('relevance'),
                ],
              },
            },
          ],
        },
        evaluator_models: {
          buckets: [
            {
              key: 'claude-3',
              doc_count: 300,
              family: { buckets: [{ key: 'Claude' }] },
              provider: { buckets: [{ key: 'Anthropic' }] },
            },
            {
              key: 'gpt-4o',
              doc_count: 200,
              family: { buckets: [{ key: 'GPT' }] },
              provider: { buckets: [{ key: 'OpenAI' }] },
            },
          ],
        },
      },
    } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload.evaluator_model).toEqual({
      id: 'claude-3',
      family: 'Claude',
      provider: 'Anthropic',
    });
  });

  it('reports no judge model for an experiment run by code evaluators alone', async () => {
    const { handler, context, evaluationScoreService } = setup();

    evaluationScoreService.search.mockResolvedValueOnce({
      hits: {
        hits: [
          {
            _source: {
              task: { model: { id: 'gpt-4', family: 'gpt-4', provider: 'openai' } },
              metadata: { total_repetitions: 1 },
            },
          },
        ],
      },
    } as any);

    evaluationScoreService.search.mockResolvedValueOnce({
      aggregations: {
        by_dataset: {
          buckets: [
            {
              key: 'dataset-1',
              dataset_name: { buckets: [{ key: 'My Dataset' }] },
              example_count: { value: 5 },
              by_evaluator: {
                buckets: [
                  {
                    key: 'latency',
                    score_stats: {},
                    score_median: { values: {} },
                    evaluator_model_id: { buckets: [] },
                  },
                ],
              },
            },
          ],
        },
        evaluator_models: { buckets: [] },
      },
    } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload.evaluator_model).toBeUndefined();
    expect(response.payload.evaluator_models).toEqual([]);
    expect(response.payload.task_model.id).toBe('gpt-4');
  });

  it('reports every evaluator, the host, and the score time span alongside the stats', async () => {
    const { handler, context, evaluationScoreService } = setup();

    evaluationScoreService.search.mockResolvedValueOnce({
      hits: {
        hits: [
          {
            _source: {
              task: { model: { id: 'gpt-4', family: 'gpt-4', provider: 'openai' } },
              metadata: { total_repetitions: 1, hostname: 'worker-01' },
            },
          },
        ],
      },
    } as any);

    evaluationScoreService.search.mockResolvedValueOnce({
      aggregations: {
        by_dataset: { buckets: [] },
        evaluator_models: { buckets: [] },
        first_score: { value_as_string: '2026-08-01T00:00:00.000Z' },
        last_score: { value_as_string: '2026-08-01T00:10:00.000Z' },
        evaluators: {
          buckets: [
            {
              key: 'correctness',
              doc_count: 6,
              version: { buckets: [{ key: '2' }] },
              kind: { buckets: [{ key: 'llm' }] },
              model_id: {
                buckets: [
                  {
                    key: 'claude-3',
                    family: { buckets: [{ key: 'Claude' }] },
                    provider: { buckets: [{ key: 'Anthropic' }] },
                  },
                ],
              },
            },
            {
              key: 'latency',
              doc_count: 6,
              version: { buckets: [] },
              kind: { buckets: [{ key: 'code' }] },
              // A stray model (e.g. from legacy documents) must not be attributed.
              model_id: { buckets: [{ key: 'claude-3' }] },
            },
          ],
        },
      },
    } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    const { aggs } = evaluationScoreService.search.mock.calls[1][0];
    expect(aggs.first_score).toEqual({ min: { field: '@timestamp' } });
    expect(aggs.last_score).toEqual({ max: { field: '@timestamp' } });
    expect(response.payload).toEqual(
      expect.objectContaining({
        hostname: 'worker-01',
        first_score_at: '2026-08-01T00:00:00.000Z',
        last_score_at: '2026-08-01T00:10:00.000Z',
        evaluators: [
          {
            name: 'correctness',
            version: '2',
            kind: 'llm',
            model: { id: 'claude-3', family: 'Claude', provider: 'Anthropic' },
            score_count: 6,
          },
          { name: 'latency', kind: 'code', score_count: 6 },
        ],
      })
    );
  });

  it('returns 500 when ES throws', async () => {
    const { handler, context, evaluationScoreService, logger } = setup();
    evaluationScoreService.search.mockRejectedValueOnce(new Error('ES error'));

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });
});
