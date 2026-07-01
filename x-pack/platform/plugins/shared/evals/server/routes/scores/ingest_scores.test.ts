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
  API_VERSIONS,
  EVALS_SCORES_URL,
  IngestScoresRequestBody,
  type IngestScoresRequestBodyInput,
} from '@kbn/evals-common';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { WriteResult } from '../../storage/evaluation_score_service';
import { registerIngestScoresRoute } from './ingest_scores';

const getBasePayload = (): IngestScoresRequestBodyInput => ({
  experiment_id: 'experiment-1',
  task_model: {
    id: 'task-model-1',
    family: 'family-a',
    provider: 'provider-a',
  },
  evaluator_model: {
    id: 'evaluator-model-1',
    family: 'family-b',
    provider: 'provider-b',
  },
  metadata: {
    execution_id: 'experiment-1',
    suite_id: 'suite-1',
    total_repetitions: 1,
    hostname: 'localhost',
    git: {
      branch: 'main',
      commit_sha: 'abc123',
    },
  },
  scores: [
    {
      example: {
        id: 'example-1',
        index: 0,
        input: { prompt: 'hello' },
        dataset: {
          id: 'dataset-1',
          name: 'Dataset 1',
        },
      },
      task: {
        trace_id: 'trace-1',
        repetition_index: 0,
        output: { answer: 'world' },
      },
      evaluator: {
        name: 'quality',
        score: 1,
        label: 'pass',
        explanation: 'looks good',
        metadata: { source: 'unit-test' },
        trace_id: 'eval-trace-1',
      },
    },
  ],
});

describe('POST /internal/evals/scores', () => {
  const setup = () => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();
    registerIngestScoresRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: { list: () => [], get: () => undefined },
      getInferenceStart: async () => ({ getClient: jest.fn() } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    });

    const versionedRouter = router.versioned as MockedVersionedRouter;
    const route = versionedRouter.getRoute('post', EVALS_SCORES_URL).versions[
      API_VERSIONS.internal.v1
    ];
    const { handler } = route;

    const evaluationScoreService = {
      write: jest.fn().mockResolvedValue({ ingested: 1, conflicted: 0, failed: [] }),
    };
    const context = coreMock.createCustomRequestHandlerContext({
      evals: {
        evaluationScoreService,
      } as any,
    });

    return { handler, context, evaluationScoreService, route };
  };

  const makeRequest = (body: IngestScoresRequestBodyInput) =>
    httpServerMock.createKibanaRequest({
      method: 'post',
      path: EVALS_SCORES_URL,
      body,
    });

  const mockWriteResult = (
    evaluationScoreService: { write: jest.Mock },
    result: WriteResult
  ): void => {
    evaluationScoreService.write.mockResolvedValueOnce(result);
  };

  it('returns 200 with ingest counts on successful ingest', async () => {
    const { handler, context, evaluationScoreService } = setup();
    const payload = getBasePayload();
    mockWriteResult(evaluationScoreService, { ingested: 1, conflicted: 0, failed: [] });

    const response = await handler(context as any, makeRequest(payload), kibanaResponseFactory);

    expect(evaluationScoreService.write).toHaveBeenCalledWith(payload);
    expect(response.status).toBe(200);
    expect(response.payload).toEqual({ ingested: 1, conflicted: 0, failed: [] });
  });

  it('returns 200 with conflicted count when payload is fully idempotent', async () => {
    const { handler, context, evaluationScoreService } = setup();
    const payload = getBasePayload();
    mockWriteResult(evaluationScoreService, { ingested: 0, conflicted: 1, failed: [] });

    const response = await handler(context as any, makeRequest(payload), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload).toEqual({ ingested: 0, conflicted: 1, failed: [] });
  });

  it('returns 207 for partial success with non-conflict failures', async () => {
    const { handler, context, evaluationScoreService } = setup();
    const payload = getBasePayload();
    mockWriteResult(evaluationScoreService, {
      ingested: 1,
      conflicted: 0,
      failed: [{ index: 0, status: 400, reason: 'mapper parsing failed' }],
    });

    const response = await handler(context as any, makeRequest(payload), kibanaResponseFactory);

    expect(response.status).toBe(207);
    expect(response.payload).toEqual({
      ingested: 1,
      conflicted: 0,
      failed: [{ index: 0, status: 400, reason: 'mapper parsing failed' }],
    });
  });

  it('returns 400 when nothing landed and all failures are mapping/validation', async () => {
    const { handler, context, evaluationScoreService } = setup();
    const payload = getBasePayload();
    mockWriteResult(evaluationScoreService, {
      ingested: 0,
      conflicted: 0,
      failed: [
        { index: 0, status: 400, reason: 'mapping rejected' },
        { index: 1, status: 400, reason: 'strict_dynamic_mapping_exception' },
      ],
    });

    const response = await handler(context as any, makeRequest(payload), kibanaResponseFactory);

    expect(response.status).toBe(400);
    expect(response.payload).toEqual({
      ingested: 0,
      conflicted: 0,
      failed: [
        { index: 0, status: 400, reason: 'mapping rejected' },
        { index: 1, status: 400, reason: 'strict_dynamic_mapping_exception' },
      ],
    });
  });

  it('returns 500 when nothing landed and failures include a 404', async () => {
    const { handler, context, evaluationScoreService } = setup();
    const payload = getBasePayload();
    mockWriteResult(evaluationScoreService, {
      ingested: 0,
      conflicted: 0,
      failed: [{ index: 0, status: 404, reason: 'index missing' }],
    });

    const response = await handler(context as any, makeRequest(payload), kibanaResponseFactory);

    expect(response.status).toBe(500);
    expect(response.payload).toEqual({
      ingested: 0,
      conflicted: 0,
      failed: [{ index: 0, status: 404, reason: 'index missing' }],
    });
  });

  it('returns 429 when nothing landed and any failure is rate-limited', async () => {
    const { handler, context, evaluationScoreService } = setup();
    const payload = getBasePayload();
    mockWriteResult(evaluationScoreService, {
      ingested: 0,
      conflicted: 0,
      failed: [{ index: 0, status: 429, reason: 'too many requests' }],
    });

    const response = await handler(context as any, makeRequest(payload), kibanaResponseFactory);

    expect(response.status).toBe(429);
    expect(response.payload).toEqual({
      ingested: 0,
      conflicted: 0,
      failed: [{ index: 0, status: 429, reason: 'too many requests' }],
    });
  });

  it('returns 500 when nothing landed and failures are transient/unknown', async () => {
    const { handler, context, evaluationScoreService } = setup();
    const payload = getBasePayload();
    mockWriteResult(evaluationScoreService, {
      ingested: 0,
      conflicted: 0,
      failed: [{ index: 0, status: 503, reason: 'es unavailable' }],
    });

    const response = await handler(context as any, makeRequest(payload), kibanaResponseFactory);

    expect(response.status).toBe(500);
    expect(response.payload).toEqual({
      ingested: 0,
      conflicted: 0,
      failed: [{ index: 0, status: 503, reason: 'es unavailable' }],
    });
  });

  it('fails validation when experiment_id is missing', () => {
    const payload = getBasePayload();
    const { experiment_id: _experimentId, ...invalidPayload } = payload;

    const result = IngestScoresRequestBody.safeParse(invalidPayload);

    expect(result.success).toBe(false);
  });

  it('fails validation when more than 1000 scores are provided', () => {
    const payload = getBasePayload();
    const score = payload.scores[0];
    const oversizedPayload = {
      ...payload,
      scores: Array.from({ length: 1001 }, () => score),
    };

    const result = IngestScoresRequestBody.safeParse(oversizedPayload);

    expect(result.success).toBe(false);
  });

  it('registers the route with a 5MB body cap', () => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();

    registerIngestScoresRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: { list: () => [], get: () => undefined },
      getInferenceStart: async () => ({ getClient: jest.fn() } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    });

    const versionedRouter = router.versioned as MockedVersionedRouter;
    const routeConfig = versionedRouter.post.mock.calls[0][0];

    expect(routeConfig.options?.body?.maxBytes).toBe(5 * 1024 * 1024);
  });

  it('returns 500 with error message when service throws', async () => {
    const { handler, context, evaluationScoreService } = setup();
    const payload = getBasePayload();
    evaluationScoreService.write.mockRejectedValueOnce(
      new Error('First error: 500 mapper_parsing_exception: bad field')
    );

    const response = await handler(context as any, makeRequest(payload), kibanaResponseFactory);

    expect(response.status).toBe(500);
    expect(response.payload).toEqual({
      message: 'First error: 500 mapper_parsing_exception: bad field',
    });
  });
});
