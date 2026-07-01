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
import {
  EVALS_EXPERIMENT_DATASET_EXAMPLES_URL,
  API_VERSIONS,
  SCORES_SORT_ORDER,
} from '@kbn/evals-common';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { registerGetExperimentDatasetExamplesRoute } from './get_experiment_dataset_examples';

describe('GET /internal/evals/experiments/{experimentId}/datasets/{datasetId}/examples', () => {
  const setup = () => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();
    registerGetExperimentDatasetExamplesRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: { list: () => [], get: () => undefined },
      getInferenceStart: async () => ({ getClient: jest.fn() } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    });

    const versionedRouter = router.versioned as MockedVersionedRouter;
    const { handler } = versionedRouter.getRoute('get', EVALS_EXPERIMENT_DATASET_EXAMPLES_URL)
      .versions[API_VERSIONS.internal.v1];

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

  const makeRequest = (experimentId = 'experiment-123', datasetId = 'dataset-123') =>
    httpServerMock.createKibanaRequest({
      method: 'get',
      path: EVALS_EXPERIMENT_DATASET_EXAMPLES_URL.replace('{experimentId}', experimentId).replace(
        '{datasetId}',
        datasetId
      ),
      params: { experimentId, datasetId },
      query: {},
    });

  it('uses the correct query parameters', async () => {
    const { handler, context, evaluationScoreService } = setup();
    evaluationScoreService.search.mockResolvedValueOnce({ hits: { hits: [] } } as any);

    await handler(context, makeRequest(), kibanaResponseFactory);

    expect(evaluationScoreService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: SCORES_SORT_ORDER,
        size: 10000,
        query: {
          bool: {
            must: [
              { term: { 'example.dataset.id': 'dataset-123' } },
              { term: { experiment_id: 'experiment-123' } },
            ],
          },
        },
      })
    );
  });

  it('groups scores by example id and sorts by example index', async () => {
    const { handler, context, evaluationScoreService } = setup();
    evaluationScoreService.search.mockResolvedValueOnce({
      hits: {
        hits: [
          { _source: { example: { id: 'example-b', index: 2 }, evaluator: { name: 'eval-1' } } },
          { _source: { example: { id: 'example-a', index: 1 }, evaluator: { name: 'eval-1' } } },
          { _source: { example: { id: 'example-b', index: 2 }, evaluator: { name: 'eval-2' } } },
          { _source: { evaluator: { name: 'no-example' } } },
          { _source: undefined },
        ],
      },
    } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload.examples).toEqual([
      {
        example_id: 'example-a',
        example_index: 1,
        scores: [{ example: { id: 'example-a', index: 1 }, evaluator: { name: 'eval-1' } }],
      },
      {
        example_id: 'example-b',
        example_index: 2,
        scores: [
          { example: { id: 'example-b', index: 2 }, evaluator: { name: 'eval-1' } },
          { example: { id: 'example-b', index: 2 }, evaluator: { name: 'eval-2' } },
        ],
      },
    ]);
  });

  it('returns 500 when ES throws', async () => {
    const { handler, context, evaluationScoreService, logger } = setup();
    evaluationScoreService.search.mockRejectedValueOnce(new Error('ES error'));

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(500);
    expect(response.payload).toEqual({
      message: 'Failed to get experiment dataset examples',
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
