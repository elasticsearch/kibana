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
import { EVALS_EXAMPLE_SCORES_URL, API_VERSIONS } from '@kbn/evals-common';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { registerGetExampleScoresRoute } from './get_example_scores';

describe('GET /internal/evals/examples/{exampleId}/scores', () => {
  const setup = () => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();
    registerGetExampleScoresRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: { list: () => [], get: () => undefined },
      getInferenceStart: async () => ({ getClient: jest.fn() } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    });

    const versionedRouter = router.versioned as MockedVersionedRouter;
    const { handler } = versionedRouter.getRoute('get', EVALS_EXAMPLE_SCORES_URL).versions[
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

  const makeRequest = (exampleId = 'example-123') =>
    httpServerMock.createKibanaRequest({
      method: 'get',
      path: EVALS_EXAMPLE_SCORES_URL.replace('{exampleId}', exampleId),
      params: { exampleId },
      query: {},
    });

  it('uses the correct query parameters', async () => {
    const { handler, context, evaluationScoreService } = setup();
    evaluationScoreService.search.mockResolvedValueOnce({ hits: { hits: [] } } as any);

    await handler(context, makeRequest(), kibanaResponseFactory);

    expect(evaluationScoreService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          bool: {
            must: [{ term: { 'example.id': 'example-123' } }],
          },
        },
        size: 10000,
      })
    );
  });

  it('returns scores sorted by timestamp desc and total count on success', async () => {
    const { handler, context, evaluationScoreService } = setup();
    const scoreDoc = {
      example: { id: 'example-123' },
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
        hits: [{ _source: { example: { id: 'example-123' } } }, { _source: undefined }],
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
    expect(response.payload).toEqual({
      message: 'Failed to get example scores',
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
