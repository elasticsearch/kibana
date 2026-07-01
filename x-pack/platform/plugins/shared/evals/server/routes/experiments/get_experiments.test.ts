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
import { EVALS_EXPERIMENTS_URL, API_VERSIONS } from '@kbn/evals-common';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { registerGetExperimentsRoute } from './get_experiments';

describe('GET /internal/evals/experiments', () => {
  const setup = () => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();
    registerGetExperimentsRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: { list: () => [], get: () => undefined },
      getInferenceStart: async () => ({ getClient: jest.fn() } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    });

    const versionedRouter = router.versioned as MockedVersionedRouter;
    const { handler } = versionedRouter.getRoute('get', EVALS_EXPERIMENTS_URL).versions[
      API_VERSIONS.internal.v1
    ];

    const evaluationScoreService = {
      search: jest.fn().mockResolvedValue({
        aggregations: { total_experiments: { value: 0 }, experiments: { buckets: [] } },
      }),
    };
    const context = coreMock.createCustomRequestHandlerContext({
      evals: {
        evaluationScoreService,
      } as any,
    });

    return { handler, context, evaluationScoreService, logger };
  };

  it('calls evaluationScoreService.search with size 0', async () => {
    const { handler, context, evaluationScoreService } = setup();
    evaluationScoreService.search.mockResolvedValueOnce({
      aggregations: { total_experiments: { value: 0 }, experiments: { buckets: [] } },
    } as any);

    const request = httpServerMock.createKibanaRequest({
      method: 'get',
      path: EVALS_EXPERIMENTS_URL,
      query: { page: 1, per_page: 25 },
    });

    await handler(context, request, kibanaResponseFactory);

    expect(evaluationScoreService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        size: 0,
      })
    );
  });

  it('applies dataset_id filter when provided', async () => {
    const { handler, context, evaluationScoreService } = setup();
    evaluationScoreService.search.mockResolvedValueOnce({
      aggregations: { total_experiments: { value: 0 }, experiments: { buckets: [] } },
    } as any);

    const request = httpServerMock.createKibanaRequest({
      method: 'get',
      path: EVALS_EXPERIMENTS_URL,
      query: { page: 1, per_page: 25, dataset_id: 'dataset-123' },
    });

    await handler(context, request, kibanaResponseFactory);

    expect(evaluationScoreService.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          bool: {
            must_not: [{ term: { experiment_id: 'kbn-evals-preflight' } }],
            filter: [{ term: { 'example.dataset.id': 'dataset-123' } }],
          },
        },
      })
    );
  });

  it('returns parsed experiments listing on success', async () => {
    const { handler, context, evaluationScoreService } = setup();
    evaluationScoreService.search.mockResolvedValueOnce({
      aggregations: {
        total_experiments: { value: 1 },
        experiments: {
          buckets: [
            {
              key: 'experiment-abc',
              doc_count: 5,
              latest_timestamp: { value_as_string: '2025-06-01T00:00:00Z' },
              suite_id: { buckets: [{ key: 'suite-1' }] },
              task_model_id: { buckets: [{ key: 'gpt-4' }] },
              task_model_family: { buckets: [{ key: 'gpt-4' }] },
              task_model_provider: { buckets: [{ key: 'openai' }] },
              evaluator_model_id: { buckets: [{ key: 'claude-3' }] },
              evaluator_model_family: { buckets: [{ key: 'claude-3' }] },
              evaluator_model_provider: { buckets: [{ key: 'anthropic' }] },
              git_branch: { buckets: [{ key: 'main' }] },
              git_commit_sha: { buckets: [{ key: 'def456' }] },
              total_repetitions: { value: 2 },
              build_url: { buckets: [] },
            },
          ],
        },
      },
    } as any);

    const request = httpServerMock.createKibanaRequest({
      method: 'get',
      path: EVALS_EXPERIMENTS_URL,
      query: { page: 1, per_page: 25 },
    });

    const response = await handler(context, request, kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload.total).toBe(1);
    expect(response.payload.experiments).toHaveLength(1);
    expect(response.payload.experiments[0].experiment_id).toBe('experiment-abc');
    expect(response.payload.experiments[0].execution_id).toBe('experiment-abc');
    expect(response.payload.experiments[0].task_model.id).toBe('gpt-4');
  });

  it('returns 500 when evaluationScoreService.search throws', async () => {
    const { handler, context, evaluationScoreService, logger } = setup();
    evaluationScoreService.search.mockRejectedValueOnce(new Error('ES connection failed'));

    const request = httpServerMock.createKibanaRequest({
      method: 'get',
      path: EVALS_EXPERIMENTS_URL,
      query: { page: 1, per_page: 25 },
    });

    const response = await handler(context, request, kibanaResponseFactory);

    expect(response.status).toBe(500);
    expect(response.payload).toEqual({
      message: 'Failed to list evaluation experiments',
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
