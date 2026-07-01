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
import { EVALS_EXPERIMENT_SCORES_URL, API_VERSIONS, SCORES_SORT_ORDER } from '@kbn/evals-common';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { registerGetExperimentScoresRoute } from './get_experiment_scores';

describe('GET /internal/evals/experiments/{experimentId}/scores', () => {
  const setup = () => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();
    registerGetExperimentScoresRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: { list: () => [], get: () => undefined },
      getInferenceStart: async () => ({ getClient: jest.fn() } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    });

    const versionedRouter = router.versioned as MockedVersionedRouter;
    const { handler } = versionedRouter.getRoute('get', EVALS_EXPERIMENT_SCORES_URL).versions[
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
      path: EVALS_EXPERIMENT_SCORES_URL.replace('{experimentId}', experimentId),
      params: { experimentId },
      query: {},
    });

  it('uses the correct sort order and size', async () => {
    const { handler, context, evaluationScoreService } = setup();
    evaluationScoreService.search.mockResolvedValueOnce({ hits: { hits: [] } } as any);

    await handler(context, makeRequest(), kibanaResponseFactory);

    expect(evaluationScoreService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: SCORES_SORT_ORDER,
        size: 10000,
      })
    );
  });

  it('returns scores and total count on success', async () => {
    const { handler, context, evaluationScoreService } = setup();
    const scoreDoc = {
      experiment_id: 'experiment-abc',
      evaluator: { name: 'correctness', score: 0.9 },
    };
    evaluationScoreService.search.mockResolvedValueOnce({
      hits: { hits: [{ _source: scoreDoc }, { _source: scoreDoc }] },
    } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload.scores).toHaveLength(2);
    expect(response.payload.total).toBe(2);
  });

  it('filters out hits with no _source', async () => {
    const { handler, context, evaluationScoreService } = setup();
    evaluationScoreService.search.mockResolvedValueOnce({
      hits: {
        hits: [{ _source: { experiment_id: 'experiment-abc' } }, { _source: undefined }],
      },
    } as any);

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload.scores).toHaveLength(1);
    expect(response.payload.total).toBe(1);
  });

  it('returns 500 when ES throws', async () => {
    const { handler, context, evaluationScoreService, logger } = setup();
    evaluationScoreService.search.mockRejectedValueOnce(new Error('ES error'));

    const response = await handler(context, makeRequest(), kibanaResponseFactory);

    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });
});
