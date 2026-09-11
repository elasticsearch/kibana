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
import {
  API_VERSIONS,
  EVALS_EVALUATE_URL,
  EVALS_TEST_EVALUATOR_URL,
  EvaluateRequestBody,
  ResolveInstrumentationRequestBody,
  TestEvaluatorRequestBody,
  ValidateRequestBody,
  type LlmJudgeConfig,
} from '@kbn/evals-common';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { AbortError } from 'p-retry';
import { EVALS_API_PRIVILEGES } from '../../../common';
import { createEvaluatorRegistryMock } from '../../evaluators/registry.mock';
import { compileUserDefinedEvaluator } from '../../evaluators/user_defined/compile';
import { awaitTraceReady } from '../../evaluators/trace_readiness';
import { registerEvaluateRoute } from './evaluate';
import { registerTestEvaluatorRoute } from './test_evaluator';

jest.mock('../../evaluators/trace_readiness', () => ({
  ...jest.requireActual('../../evaluators/trace_readiness'),
  awaitTraceReady: jest.fn(),
}));

const awaitTraceReadyMock = awaitTraceReady as jest.MockedFunction<typeof awaitTraceReady>;
const TRACE_ID = '0af7651916cd43dd8448eb211c80319c';
const JUDGE: LlmJudgeConfig = {
  prompt: 'Rate {{{agent_response}}}',
  system_prompt: 'Judge only the response quality.',
  evidence: ['response'],
  output: { scores: [{ name: 'quality', type: 'number' }] },
};

describe('POST /internal/evals/evaluators/_test', () => {
  const setup = ({ prompt = jest.fn() }: { prompt?: jest.Mock } = {}) => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();
    const getClient = jest.fn().mockReturnValue({ prompt });
    const inferenceStart = {
      getClient,
      getConnectorById: jest.fn().mockResolvedValue({ name: 'Test model', config: {} }),
    } as unknown as InferenceServerStart;

    registerTestEvaluatorRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: createEvaluatorRegistryMock([
        {
          name: 'correctness',
          version: '1.0.0',
          kind: 'llm',
          direction: 'maximize',
          origin: 'built_in',
          description: 'Built-in correctness evaluator',
          evaluate: jest.fn(),
        },
      ]),
      getInferenceStart: async () => inferenceStart,
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    });

    const versionedRouter = router.versioned as MockedVersionedRouter;
    const route = versionedRouter.getRoute('post', EVALS_TEST_EVALUATOR_URL);
    const { handler } = route.versions[API_VERSIONS.internal.v1];
    const routeConfig = versionedRouter.post.mock.calls[0][0];
    const context = {
      core: Promise.resolve({
        elasticsearch: { client: { asInternalUser: { search: jest.fn() } } },
      }),
    } as unknown as Parameters<typeof handler>[0];

    return { handler, routeConfig, context, prompt, getClient, logger };
  };

  const request = (overrides: Record<string, unknown> = {}) =>
    ({
      body: {
        definition: { name: 'quality', description: 'Rates response quality', judge: JUDGE },
        connector_id: 'connector-1',
        subject: { traces: [{ trace_id: TRACE_ID }] },
        ...overrides,
      },
    } as unknown as Parameters<ReturnType<typeof setup>['handler']>[1]);

  beforeEach(() => {
    awaitTraceReadyMock.mockResolvedValue({
      input: { message: 'Question' },
      response: { message: 'Answer' },
      steps: [],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('requires manage privileges', () => {
    expect(setup().routeConfig.security).toEqual({
      authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.manage] },
    });
  });

  it('executes a draft without assigning a persisted version', async () => {
    const prompt = jest.fn().mockResolvedValue({
      toolCalls: [
        { function: { arguments: { quality: { score: 0.8, explanation: 'Clear answer.' } } } },
      ],
    });
    const { handler, context, getClient } = setup({ prompt });

    const response = await handler(context, request(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload.result).toEqual(
      expect.objectContaining({
        status: 'ok',
        evaluator: expect.objectContaining({ name: 'quality', kind: 'llm' }),
        scores: [expect.objectContaining({ name: 'quality', score: 0.8 })],
      })
    );
    expect(response.payload.result.evaluator).not.toHaveProperty('version');
    expect(getClient).toHaveBeenCalledWith({
      request: expect.any(Object),
      bindTo: { connectorId: 'connector-1' },
    });
  });

  it('matches persisted evaluator execution for the same definition and trace', async () => {
    const prompt = jest.fn().mockResolvedValue({
      toolCalls: [
        { function: { arguments: { quality: { score: 0.8, explanation: 'Clear answer.' } } } },
      ],
    });
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();
    const inferenceStart = {
      getClient: jest.fn().mockReturnValue({ prompt }),
      getConnectorById: jest.fn().mockResolvedValue({ name: 'Test model', config: {} }),
    } as unknown as InferenceServerStart;
    const persisted = compileUserDefinedEvaluator({
      id: 'stored-id',
      name: 'quality',
      version: '1.0.0',
      kind: 'llm',
      description: 'Rates response quality',
      judge: JUDGE,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    const dependencies = {
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry: createEvaluatorRegistryMock([persisted]),
      getInferenceStart: async () => inferenceStart,
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    };
    registerTestEvaluatorRoute(dependencies);
    registerEvaluateRoute(dependencies);

    const versionedRouter = router.versioned as MockedVersionedRouter;
    const testHandler = versionedRouter.getRoute('post', EVALS_TEST_EVALUATOR_URL).versions[
      API_VERSIONS.internal.v1
    ].handler;
    const evaluateHandler = versionedRouter.getRoute('post', EVALS_EVALUATE_URL).versions[
      API_VERSIONS.internal.v1
    ].handler;
    const context = {
      core: Promise.resolve({
        elasticsearch: { client: { asInternalUser: { search: jest.fn() } } },
      }),
    } as unknown as Parameters<typeof testHandler>[0];
    const subject = { traces: [{ trace_id: TRACE_ID }] };

    const draftResponse = await testHandler(context, request({ subject }), kibanaResponseFactory);
    const persistedResponse = await evaluateHandler(
      context,
      {
        body: {
          subject,
          evaluators: [{ name: 'quality', connector_id: 'connector-1' }],
        },
      } as unknown as Parameters<typeof evaluateHandler>[1],
      kibanaResponseFactory
    );
    const { version: _version, ...persistedEvaluator } =
      persistedResponse.payload.results[0].evaluator;

    expect(draftResponse.payload.result).toEqual({
      ...persistedResponse.payload.results[0],
      evaluator: persistedEvaluator,
    });
  });

  it('rejects semantic judge errors before reading the trace', async () => {
    const { handler, context, prompt } = setup();
    const response = await handler(
      context,
      request({
        definition: {
          name: 'quality',
          description: 'Invalid draft',
          judge: { ...JUDGE, prompt: '{{{undeclared}}}' },
        },
      }),
      kibanaResponseFactory
    );

    expect(response.status).toBe(400);
    expect(response.payload.message).toContain('undeclared');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('rejects built-in names', async () => {
    const { handler, context } = setup();
    const response = await handler(
      context,
      request({
        definition: { name: 'correctness', description: 'Replacement', judge: JUDGE },
      }),
      kibanaResponseFactory
    );

    expect(response.status).toBe(409);
  });

  it('rejects the all-zero OpenTelemetry trace ID', async () => {
    const { handler, context } = setup();
    const response = await handler(
      context,
      request({ subject: { traces: [{ trace_id: '00000000000000000000000000000000' }] } }),
      kibanaResponseFactory
    );

    expect(response.status).toBe(400);
    expect(response.payload.message).toContain('Invalid trace_id');
  });

  it('returns inference failures as an evaluator result', async () => {
    const inferenceError = new Error('offline');
    inferenceError.stack = 'inference failure stack';
    const { handler, context, logger } = setup({
      prompt: jest.fn().mockRejectedValue(new AbortError(inferenceError)),
    });
    const response = await handler(context, request(), kibanaResponseFactory);

    expect(response.status).toBe(200);
    expect(response.payload.result).toEqual(
      expect.objectContaining({
        status: 'error',
        error: expect.objectContaining({ message: 'offline' }),
      })
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to execute evaluator "quality": inference failure stack'
    );
  });

  it('uses the same strict trace shape for evaluator request schemas', () => {
    const invalidSubject = { traces: [{ trace_id: 'not-a-trace' }] };

    expect(
      EvaluateRequestBody.safeParse({ subject: invalidSubject, evaluators: [{ name: 'latency' }] })
        .success
    ).toBe(false);
    expect(
      ValidateRequestBody.safeParse({ subject: invalidSubject, evaluators: [{ name: 'latency' }] })
        .success
    ).toBe(false);
    expect(ResolveInstrumentationRequestBody.safeParse({ trace_id: 'not-a-trace' }).success).toBe(
      false
    );
    expect(
      TestEvaluatorRequestBody.safeParse({
        definition: { name: 'quality', description: 'Rates quality', judge: JUDGE },
        connector_id: 'connector-1',
        subject: invalidSubject,
      }).success
    ).toBe(false);
  });
});
