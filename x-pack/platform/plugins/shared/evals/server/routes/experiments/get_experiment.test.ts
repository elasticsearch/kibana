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
import { EVALS_EXPERIMENT_URL, API_VERSIONS } from '@kbn/evals-common';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
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
      evaluatorRegistry: { list: () => [], get: () => undefined },
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
                  },
                ],
              },
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

  it('returns 500 when ES throws', async () => {
    const { handler, context, evaluationScoreService, logger } = setup();
    evaluationScoreService.search.mockRejectedValueOnce(new Error('ES error'));

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });
});
