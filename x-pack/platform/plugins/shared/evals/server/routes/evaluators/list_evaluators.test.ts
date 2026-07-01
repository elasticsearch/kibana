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
import { API_VERSIONS, EVALS_EVALUATORS_URL } from '@kbn/evals-common';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import { EVALS_API_PRIVILEGES } from '../../../common';
import type { EvaluatorRegistry } from '../../evaluators/types';
import { registerListEvaluatorsRoute } from './list_evaluators';

describe('GET /internal/evals/evaluators', () => {
  const buildEvaluatorRegistry = (): EvaluatorRegistry => ({
    list: () => [
      {
        name: 'groundedness',
        version: '1.0.0',
        kind: 'llm',
        description: 'Groundedness evaluator',
        supportedInputs: ['trace', 'reference_data'],
        evaluate: jest.fn(),
      },
      {
        name: 'latency',
        version: '1.0.0',
        kind: 'code',
        description: 'Latency evaluator',
        supportedInputs: ['trace'],
        evaluate: jest.fn(),
      },
      {
        name: 'input_tokens',
        version: '1.0.0',
        kind: 'code',
        description: 'Input tokens evaluator',
        supportedInputs: ['trace'],
        evaluate: jest.fn(),
      },
      {
        name: 'output_tokens',
        version: '1.0.0',
        kind: 'code',
        description: 'Output tokens evaluator',
        supportedInputs: ['trace'],
        evaluate: jest.fn(),
      },
      {
        name: 'tool_calls',
        version: '1.0.0',
        kind: 'code',
        description: 'Tool calls evaluator',
        supportedInputs: ['trace'],
        evaluate: jest.fn(),
      },
      {
        name: 'correctness',
        version: '1.0.0',
        kind: 'llm',
        description: 'Correctness evaluator',
        supportedInputs: ['trace', 'reference_data'],
        evaluate: jest.fn(),
      },
    ],
    get: jest.fn((_name: string, _version?: string) => undefined),
  });

  const setup = ({ evaluatorRegistry }: { evaluatorRegistry?: EvaluatorRegistry | null } = {}) => {
    const router = httpServiceMock.createRouter();
    const logger = loggingSystemMock.createLogger();
    const versionedRouter = router.versioned as MockedVersionedRouter;
    registerListEvaluatorsRoute({
      router,
      logger,
      canEncrypt: false,
      evaluatorRegistry:
        evaluatorRegistry === undefined
          ? (buildEvaluatorRegistry() as EvaluatorRegistry)
          : (evaluatorRegistry as unknown as EvaluatorRegistry),
      getInferenceStart: async () => ({ getClient: jest.fn() } as unknown as InferenceServerStart),
      getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
      getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    });

    const route = versionedRouter.getRoute('get', EVALS_EVALUATORS_URL);
    const routeConfig = versionedRouter.get.mock.calls[0][0];
    const { handler } = route.versions[API_VERSIONS.internal.v1];

    return { route, routeConfig, handler, logger };
  };

  it('registers read privilege authz requirement', () => {
    const { routeConfig } = setup({ evaluatorRegistry: buildEvaluatorRegistry() });

    expect(routeConfig.security).toEqual({
      authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.read] },
    });
  });

  it('returns all evaluator definitions with API field names', async () => {
    const { handler } = setup({ evaluatorRegistry: buildEvaluatorRegistry() });

    const response = await handler(
      {} as Parameters<typeof handler>[0],
      {} as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(200);
    expect(response.payload.evaluators).toHaveLength(6);
    expect(response.payload.evaluators[0]).toEqual({
      name: 'groundedness',
      version: '1.0.0',
      kind: 'llm',
      description: 'Groundedness evaluator',
      supported_inputs: ['trace', 'reference_data'],
    });
  });

  it('returns 500 when evaluator registry is unavailable', async () => {
    const { handler, logger } = setup({
      evaluatorRegistry: null,
    });

    const response = await handler(
      {} as Parameters<typeof handler>[0],
      {} as Parameters<typeof handler>[1],
      kibanaResponseFactory
    );

    expect(response.status).toBe(500);
    expect(response.payload).toEqual({
      message: 'Evaluator registry is not configured',
    });
    expect(logger.error).toHaveBeenCalledWith('Evaluator registry is not configured');
  });
});
