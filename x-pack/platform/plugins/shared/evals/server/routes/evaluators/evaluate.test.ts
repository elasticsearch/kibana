/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { kibanaResponseFactory } from '@kbn/core/server';
import type { MockedVersionedRouter } from '@kbn/core-http-router-server-mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { httpServiceMock } from '@kbn/core/server/mocks';
import { API_VERSIONS, EVALS_EVALUATE_URL } from '@kbn/evals-common';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { EVALS_API_PRIVILEGES } from '../../../common';
import type { EvaluatorDefinition, EvaluatorRegistry } from '../../evaluators/types';
import { registerEvaluateRoute } from './evaluate';

describe('POST /internal/evals/_evaluate', () => {
  const buildEvaluator = ({
    name = 'groundedness',
    version = '1.0.0',
    kind = 'llm',
    evaluate = jest.fn().mockResolvedValue({
      scores: [{ name: 'groundedness', score: 1, label: 'GROUNDED' }],
    }),
  }: Partial<EvaluatorDefinition> & Pick<EvaluatorDefinition, 'name'>): EvaluatorDefinition => ({
    name,
    version,
    kind,
    description: `${name} evaluator`,
    supportedInputs: ['trace'],
    evaluate,
  });

  const buildEvaluatorRegistry = (definitions: EvaluatorDefinition[] = []): EvaluatorRegistry => ({
    list: () => definitions,
    get: (name: string, version?: string) =>
      definitions.find(
        (definition) =>
          definition.name === name && (version === undefined || definition.version === version)
      ),
  });

  const buildContext = () =>
    ({
      core: Promise.resolve({
        elasticsearch: {
          client: {
            asInternalUser: {
              esql: { query: jest.fn() },
            },
          },
        },
      }),
    } as const);

  const setup = ({
    evaluatorRegistry,
    inferenceStart,
  }: {
    evaluatorRegistry?: EvaluatorRegistry;
    inferenceStart?: InferenceServerStart;
  } = {}) => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();
    const versionedRouter = router.versioned as MockedVersionedRouter;

    registerEvaluateRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: evaluatorRegistry ?? buildEvaluatorRegistry(),
      getInferenceStart: async () =>
        inferenceStart ??
        ({
          getClient: jest.fn(),
        } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    });

    const route = versionedRouter.getRoute('post', EVALS_EVALUATE_URL);
    const routeConfig = versionedRouter.post.mock.calls[0][0];
    const { handler } = route.versions[API_VERSIONS.internal.v1];

    return { handler, routeConfig, logger };
  };

  it('registers manage privilege authz requirement', () => {
    const { routeConfig } = setup();

    expect(routeConfig.security).toEqual({
      authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.manage] },
    });
  });

  it('returns two ok results, reuses one trace accessor, and caches inference client by connector', async () => {
    const firstEvaluate = jest.fn().mockResolvedValue({
      scores: [{ name: 'groundedness', score: 0.9, label: 'GROUNDED' }],
    });
    const secondEvaluate = jest.fn().mockResolvedValue({
      scores: [{ name: 'correctness', score: 0.8, label: 'FACTUAL' }],
    });
    const groundedness = buildEvaluator({
      name: 'groundedness',
      kind: 'llm',
      evaluate: firstEvaluate,
    });
    const correctness = buildEvaluator({
      name: 'correctness',
      kind: 'llm',
      evaluate: secondEvaluate,
    });
    const getClient = jest.fn().mockReturnValue({ prompt: jest.fn() });
    const { handler, logger } = setup({
      evaluatorRegistry: buildEvaluatorRegistry([groundedness, correctness]),
      inferenceStart: { getClient } as unknown as InferenceServerStart,
    });

    const response = await handler(
      buildContext() as unknown as Parameters<typeof handler>[0],
      {
        body: {
          subject: {
            mode: 'single-turn',
            traces: [{ trace_id: 'trace-123', reference_data: { expected: 'ok' } }],
          },
          evaluators: [
            { name: 'groundedness', connector_id: 'connector-123' },
            { name: 'correctness', connector_id: 'connector-123' },
          ],
        },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    expect(response.payload.results).toHaveLength(2);
    expect(response.payload.results).toEqual([
      expect.objectContaining({ name: 'groundedness', status: 'ok' }),
      expect.objectContaining({ name: 'correctness', status: 'ok' }),
    ]);
    expect(getClient).toHaveBeenCalledTimes(1);
    expect(getClient).toHaveBeenCalledWith({
      request: expect.any(Object),
      bindTo: { connectorId: 'connector-123' },
    });
    expect(firstEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        trace: expect.objectContaining({ traceId: 'trace-123' }),
        referenceData: { expected: 'ok' },
        inferenceClient: expect.any(Object),
        log: logger,
      })
    );
    expect(secondEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        trace: firstEvaluate.mock.calls[0][0].trace,
        referenceData: { expected: 'ok' },
        inferenceClient: expect.any(Object),
        log: logger,
      })
    );
  });

  it('returns 400 for unknown evaluator names', async () => {
    const { handler } = setup({
      evaluatorRegistry: buildEvaluatorRegistry(),
    });

    const response = await handler(
      buildContext() as unknown as Parameters<typeof handler>[0],
      {
        body: {
          subject: { traces: [{ trace_id: 'trace-1' }] },
          evaluators: [{ name: 'missing' }],
        },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(400);
    expect(response.payload).toEqual({ message: 'Evaluator not found: missing' });
  });

  it('returns 400 for pinned version misses', async () => {
    const { handler } = setup({
      evaluatorRegistry: buildEvaluatorRegistry([buildEvaluator({ name: 'groundedness' })]),
    });

    const response = await handler(
      buildContext() as unknown as Parameters<typeof handler>[0],
      {
        body: {
          subject: { traces: [{ trace_id: 'trace-1' }] },
          evaluators: [{ name: 'groundedness', version: '9.9.9' }],
        },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(400);
    expect(response.payload).toEqual({ message: 'Evaluator not found: groundedness@9.9.9' });
  });

  it('returns 400 when connector_id is missing for llm evaluators', async () => {
    const groundedness = buildEvaluator({ name: 'groundedness', kind: 'llm' });
    const { handler } = setup({
      evaluatorRegistry: buildEvaluatorRegistry([groundedness]),
    });

    const response = await handler(
      buildContext() as unknown as Parameters<typeof handler>[0],
      {
        body: {
          subject: { traces: [{ trace_id: 'trace-1' }] },
          evaluators: [{ name: 'groundedness' }],
        },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(400);
    expect(response.payload).toEqual({
      message: 'connector_id is required for llm evaluator "groundedness"',
    });
  });

  it('returns 400 for multi-turn mode', async () => {
    const { handler } = setup({
      evaluatorRegistry: buildEvaluatorRegistry([buildEvaluator({ name: 'groundedness' })]),
    });

    const response = await handler(
      buildContext() as unknown as Parameters<typeof handler>[0],
      {
        body: {
          subject: {
            mode: 'multi-turn',
            traces: [{ trace_id: 'trace-1' }, { trace_id: 'trace-2' }],
          },
          evaluators: [{ name: 'groundedness', connector_id: 'connector-1' }],
        },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(400);
    expect(response.payload).toEqual({ message: 'multi-turn evaluation is not yet supported' });
  });

  it('returns 400 when single-turn mode does not have exactly one trace', async () => {
    const { handler } = setup({
      evaluatorRegistry: buildEvaluatorRegistry([buildEvaluator({ name: 'groundedness' })]),
    });

    const response = await handler(
      buildContext() as unknown as Parameters<typeof handler>[0],
      {
        body: {
          subject: {
            mode: 'single-turn',
            traces: [{ trace_id: 'trace-1' }, { trace_id: 'trace-2' }],
          },
          evaluators: [{ name: 'groundedness', connector_id: 'connector-1' }],
        },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(400);
    expect(response.payload).toEqual({ message: 'single-turn mode requires exactly one trace' });
  });

  it('returns per-item runtime errors while keeping sibling evaluator results', async () => {
    const failingEvaluate = jest.fn().mockRejectedValue(new Error('failed badly'));
    const successfulEvaluate = jest.fn().mockResolvedValue({
      scores: [{ name: 'latency', score: 42 }],
    });
    const groundedness = buildEvaluator({
      name: 'groundedness',
      kind: 'llm',
      evaluate: failingEvaluate,
    });
    const latency = buildEvaluator({
      name: 'latency',
      kind: 'code',
      evaluate: successfulEvaluate,
    });

    const { handler } = setup({
      evaluatorRegistry: buildEvaluatorRegistry([groundedness, latency]),
      inferenceStart: {
        getClient: jest.fn().mockReturnValue({ prompt: jest.fn() }),
      } as unknown as InferenceServerStart,
    });

    const response = await handler(
      buildContext() as unknown as Parameters<typeof handler>[0],
      {
        body: {
          subject: { traces: [{ trace_id: 'trace-1' }] },
          evaluators: [{ name: 'groundedness', connector_id: 'connector-1' }, { name: 'latency' }],
        },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    expect(response.payload.results).toEqual([
      {
        name: 'groundedness',
        status: 'error',
        error: { message: 'Error: failed badly' },
      },
      expect.objectContaining({
        name: 'latency',
        status: 'ok',
        scores: [{ name: 'latency', score: 42 }],
      }),
    ]);
  });

  it('passes through multi-score results unchanged within a single result item', async () => {
    const evaluate = jest.fn().mockResolvedValue({
      scores: [
        { name: 'factuality', score: 0.7, label: 'HIGH' },
        { name: 'relevance', score: 0.5, label: 'MEDIUM' },
        { name: 'sequence_accuracy', score: 0.4, label: 'LOW' },
      ],
    });
    const correctness = buildEvaluator({
      name: 'correctness',
      kind: 'llm',
      evaluate,
    });
    const { handler } = setup({
      evaluatorRegistry: buildEvaluatorRegistry([correctness]),
      inferenceStart: {
        getClient: jest.fn().mockReturnValue({ prompt: jest.fn() }),
      } as unknown as InferenceServerStart,
    });

    const response = await handler(
      buildContext() as unknown as Parameters<typeof handler>[0],
      {
        body: {
          subject: { traces: [{ trace_id: 'trace-1', reference_data: { expected: 'answer' } }] },
          evaluators: [{ name: 'correctness', connector_id: 'connector-1' }],
        },
      } as unknown as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    expect(response.payload.results).toEqual([
      expect.objectContaining({
        name: 'correctness',
        status: 'ok',
        scores: [
          { name: 'factuality', score: 0.7, label: 'HIGH' },
          { name: 'relevance', score: 0.5, label: 'MEDIUM' },
          { name: 'sequence_accuracy', score: 0.4, label: 'LOW' },
        ],
      }),
    ]);
  });
});
