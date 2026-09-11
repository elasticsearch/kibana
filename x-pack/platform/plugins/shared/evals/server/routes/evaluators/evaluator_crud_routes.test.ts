/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { kibanaResponseFactory } from '@kbn/core/server';
import { coreMock, httpServerMock, httpServiceMock } from '@kbn/core/server/mocks';
import type { MockedVersionedRouter } from '@kbn/core-http-router-server-mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import {
  API_VERSIONS,
  CreateEvaluatorRequestBody,
  EVALS_EVALUATORS_URL,
  EVALS_EVALUATOR_URL,
  type LlmJudgeConfig,
} from '@kbn/evals-common';
import { EVALS_API_PRIVILEGES } from '../../../common';
import { createEvaluatorRegistryMock } from '../../evaluators/registry.mock';
import type { EvaluatorDefinitionDocument } from '../../evaluators/user_defined/types';
import { InvalidJudgeConfigError } from '../../evaluators/user_defined/validate_config';
import { BuiltInEvaluatorNameError } from '../../storage/evaluators/built_in_evaluator_name_error';
import { EvaluatorAlreadyExistsError } from '../../storage/evaluators/evaluator_already_exists_error';
import { EvaluatorNotFoundError } from '../../storage/evaluators/evaluator_not_found_error';
import type { RouteDependencies } from '../register_routes';
import { registerCreateEvaluatorRoute } from './create_evaluator';
import { registerDeleteEvaluatorRoute } from './delete_evaluator';
import { registerGetEvaluatorRoute } from './get_evaluator';
import { registerUpdateEvaluatorRoute } from './update_evaluator';

const JUDGE: LlmJudgeConfig = {
  prompt: 'Rate {{{agent_response}}}',
  system_prompt: 'Judge the response according to the supplied criteria.',
  evidence: ['response'],
  output: { scores: [{ name: 'tone', type: 'number' }] },
};

const persistedEvaluator = (
  overrides: Partial<EvaluatorDefinitionDocument> = {}
): EvaluatorDefinitionDocument => ({
  id: 'definition-id',
  name: 'tone',
  version: '1.0.0',
  kind: 'llm',
  description: 'Rates response tone',
  judge: JUDGE,
  created_at: '2026-08-19T12:00:00.000Z',
  updated_at: '2026-08-19T12:00:00.000Z',
  ...overrides,
});

const evaluatorRegistry = createEvaluatorRegistryMock([
  {
    name: 'correctness',
    version: '1.0.0',
    kind: 'llm',
    origin: 'built_in',
    description: 'Built-in correctness evaluator',
    direction: 'maximize',
    evaluate: jest.fn(),
  },
]);

type RegisterRoute = (dependencies: RouteDependencies) => void;
type RouteMethod = 'get' | 'post' | 'put' | 'delete';

const setupRoute = ({
  registerRoute,
  method,
  path,
  spaceId = 'marketing',
}: {
  registerRoute: RegisterRoute;
  method: RouteMethod;
  path: string;
  spaceId?: string;
}) => {
  const router = httpServiceMock.createRouter();
  const logger = loggingSystemMock.createLogger();
  const getSpaceId = jest.fn().mockResolvedValue(spaceId);
  const getCurrentUsername = jest.fn().mockResolvedValue('alice');
  const client = {
    create: jest.fn(),
    getLatest: jest.fn(),
    getVersion: jest.fn(),
    listVersions: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const evaluatorDefinitionService = { getClient: jest.fn().mockReturnValue(client) };

  registerRoute({
    router,
    logger,
    canEncrypt: false,
    evaluatorRegistry,
    getInferenceStart: async () => ({ getClient: jest.fn() } as unknown as InferenceServerStart),
    getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
    getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
    getSpaceId,
    getCurrentUsername,
  });

  const versionedRouter = router.versioned as MockedVersionedRouter;
  const route = versionedRouter.getRoute(method, path);
  const { handler } = route.versions[API_VERSIONS.internal.v1];
  const registration = versionedRouter[method];
  const routeConfig = registration.mock.calls[0][0];
  const context = coreMock.createCustomRequestHandlerContext({
    core: coreMock.createRequestHandlerContext(),
    evals: { evaluatorDefinitionService } as never,
  });

  return {
    handler,
    routeConfig,
    context,
    client,
    evaluatorDefinitionService,
    getSpaceId,
    logger,
  };
};

describe('evaluator CRUD routes', () => {
  describe('POST /internal/evals/evaluators', () => {
    const setup = () =>
      setupRoute({
        registerRoute: registerCreateEvaluatorRoute,
        method: 'post',
        path: EVALS_EVALUATORS_URL,
      });

    it('registers manage_evals authorization', () => {
      expect(setup().routeConfig.security).toEqual({
        authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.manage] },
      });
    });

    it('rejects a definition without an explicit system prompt', () => {
      const { system_prompt: _, ...judgeWithoutSystemPrompt } = JUDGE;

      expect(
        CreateEvaluatorRequestBody.safeParse({
          name: 'tone',
          description: 'Rates response tone',
          judge: judgeWithoutSystemPrompt,
        }).success
      ).toBe(false);
    });

    it('rejects a definition without trace evidence', () => {
      expect(
        CreateEvaluatorRequestBody.safeParse({
          name: 'tone',
          description: 'Rates response tone',
          judge: { ...JUDGE, evidence: [] },
        }).success
      ).toBe(false);
    });

    it('rejects a score name that cannot fit its persisted composite name', () => {
      expect(
        CreateEvaluatorRequestBody.safeParse({
          name: 'tone',
          description: 'Rates response tone',
          judge: {
            ...JUDGE,
            output: { scores: [{ name: 'x'.repeat(128), type: 'number' }] },
          },
        }).success
      ).toBe(false);
    });

    it('creates a definition in the active space', async () => {
      const { handler, context, client, evaluatorDefinitionService, getSpaceId } = setup();
      client.create.mockResolvedValueOnce(persistedEvaluator());
      const request = httpServerMock.createKibanaRequest({
        method: 'post',
        path: EVALS_EVALUATORS_URL,
        body: { name: 'tone', description: 'Rates response tone', judge: JUDGE },
      });

      const response = await handler(context, request, kibanaResponseFactory);

      expect(getSpaceId).toHaveBeenCalledWith(request);
      expect(evaluatorDefinitionService.getClient).toHaveBeenCalledWith({ spaceId: 'marketing' });
      expect(client.create).toHaveBeenCalledWith({
        name: 'tone',
        description: 'Rates response tone',
        judge: JUDGE,
        createdBy: 'alice',
      });
      expect(response.status).toBe(200);
      expect(response.payload.evaluator).toEqual(
        expect.objectContaining({ name: 'tone', version: '1.0.0', origin: 'user_defined' })
      );
    });

    it('maps built-in names to a conflict', async () => {
      const { handler, context, client } = setup();
      client.create.mockRejectedValueOnce(new BuiltInEvaluatorNameError('correctness'));
      const response = await handler(
        context,
        httpServerMock.createKibanaRequest({
          method: 'post',
          path: EVALS_EVALUATORS_URL,
          body: { name: 'correctness', description: 'Replacement', judge: JUDGE },
        }),
        kibanaResponseFactory
      );

      expect(response.status).toBe(409);
      expect(client.create).toHaveBeenCalled();
    });

    it('maps duplicate definitions to a conflict', async () => {
      const { handler, context, client } = setup();
      client.create.mockRejectedValueOnce(new EvaluatorAlreadyExistsError('tone'));

      const response = await handler(
        context,
        httpServerMock.createKibanaRequest({
          method: 'post',
          path: EVALS_EVALUATORS_URL,
          body: { name: 'tone', description: 'Duplicate', judge: JUDGE },
        }),
        kibanaResponseFactory
      );

      expect(response.status).toBe(409);
    });

    it('does not expose an unexpected internal error', async () => {
      const { handler, context, client, logger } = setup();
      client.create.mockRejectedValueOnce(new Error('sensitive storage failure'));

      const response = await handler(
        context,
        httpServerMock.createKibanaRequest({
          method: 'post',
          path: EVALS_EVALUATORS_URL,
          body: { name: 'tone', description: 'Tone', judge: JUDGE },
        }),
        kibanaResponseFactory
      );

      expect(response.status).toBe(500);
      expect(response.payload).toEqual({ message: 'Failed to create evaluator' });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create evaluator: Error: sensitive storage failure')
      );
    });

    it('rejects judge templates that read undeclared inputs', async () => {
      const { handler, context, client } = setup();
      client.create.mockRejectedValueOnce(
        new InvalidJudgeConfigError(
          'The prompt references "missing_reference", which the evaluator is not given.'
        )
      );

      const response = await handler(
        context,
        httpServerMock.createKibanaRequest({
          method: 'post',
          path: EVALS_EVALUATORS_URL,
          body: {
            name: 'tone',
            description: 'Invalid judge',
            judge: { ...JUDGE, prompt: '{{{missing_reference}}}' },
          },
        }),
        kibanaResponseFactory
      );

      expect(response.status).toBe(400);
      expect(client.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /internal/evals/evaluators/{name}', () => {
    const setup = () =>
      setupRoute({
        registerRoute: registerGetEvaluatorRoute,
        method: 'get',
        path: EVALS_EVALUATOR_URL,
      });

    it('registers read_evals authorization', () => {
      expect(setup().routeConfig.security).toEqual({
        authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.read] },
      });
    });

    it('returns a pinned persisted version and its version history', async () => {
      const { handler, context, client } = setup();
      const latest = persistedEvaluator({ version: '1.1.0' });
      const pinned = persistedEvaluator();
      client.listVersions.mockResolvedValueOnce([latest, pinned]);
      client.getVersion.mockResolvedValueOnce(pinned);

      const response = await handler(
        context,
        httpServerMock.createKibanaRequest({
          method: 'get',
          path: EVALS_EVALUATOR_URL.replace('{name}', 'tone'),
          params: { name: 'tone' },
          query: { version: '1.0.0' },
        }),
        kibanaResponseFactory
      );

      expect(client.getVersion).toHaveBeenCalledWith('tone', '1.0.0');
      expect(response.status).toBe(200);
      expect(response.payload.evaluator).toEqual(
        expect.objectContaining({ version: '1.0.0', versions: ['1.1.0', '1.0.0'] })
      );
    });

    it('resolves built-ins without reading persisted storage', async () => {
      const { handler, context, client } = setup();
      const response = await handler(
        context,
        httpServerMock.createKibanaRequest({
          method: 'get',
          path: EVALS_EVALUATOR_URL.replace('{name}', 'correctness'),
          params: { name: 'correctness' },
          query: {},
        }),
        kibanaResponseFactory
      );

      expect(response.status).toBe(200);
      expect(response.payload.evaluator.origin).toBe('built_in');
      expect(client.listVersions).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown persisted evaluator', async () => {
      const { handler, context, client } = setup();
      client.listVersions.mockResolvedValueOnce([]);

      const response = await handler(
        context,
        httpServerMock.createKibanaRequest({
          method: 'get',
          path: EVALS_EVALUATOR_URL.replace('{name}', 'missing'),
          params: { name: 'missing' },
          query: {},
        }),
        kibanaResponseFactory
      );

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /internal/evals/evaluators/{name}', () => {
    const setup = () =>
      setupRoute({
        registerRoute: registerUpdateEvaluatorRoute,
        method: 'put',
        path: EVALS_EVALUATOR_URL,
      });

    it('registers manage_evals authorization', () => {
      expect(setup().routeConfig.security).toEqual({
        authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.manage] },
      });
    });

    it('writes and returns the next immutable version', async () => {
      const { handler, context, client } = setup();
      client.update.mockResolvedValueOnce(
        persistedEvaluator({ version: '1.1.0', description: 'Updated tone' })
      );

      const response = await handler(
        context,
        httpServerMock.createKibanaRequest({
          method: 'put',
          path: EVALS_EVALUATOR_URL.replace('{name}', 'tone'),
          params: { name: 'tone' },
          body: { description: 'Updated tone' },
        }),
        kibanaResponseFactory
      );

      expect(client.update).toHaveBeenCalledWith('tone', {
        description: 'Updated tone',
        judge: undefined,
        createdBy: 'alice',
      });
      expect(response.status).toBe(200);
      expect(response.payload.evaluator.version).toBe('1.1.0');
    });

    it('rejects an update with no changes', async () => {
      const { handler, context, client } = setup();

      const response = await handler(
        context,
        httpServerMock.createKibanaRequest({
          method: 'put',
          path: EVALS_EVALUATOR_URL.replace('{name}', 'tone'),
          params: { name: 'tone' },
          body: {},
        }),
        kibanaResponseFactory
      );

      expect(response.status).toBe(400);
      expect(client.update).not.toHaveBeenCalled();
    });

    it('rejects updates to built-in evaluators', async () => {
      const { handler, context, client } = setup();
      const response = await handler(
        context,
        httpServerMock.createKibanaRequest({
          method: 'put',
          path: EVALS_EVALUATOR_URL.replace('{name}', 'correctness'),
          params: { name: 'correctness' },
          body: { description: 'Changed' },
        }),
        kibanaResponseFactory
      );

      expect(response.status).toBe(409);
      expect(client.update).not.toHaveBeenCalled();
    });

    it('maps a missing update target to 404', async () => {
      const { handler, context, client } = setup();
      client.update.mockRejectedValueOnce(new EvaluatorNotFoundError('missing'));

      const response = await handler(
        context,
        httpServerMock.createKibanaRequest({
          method: 'put',
          path: EVALS_EVALUATOR_URL.replace('{name}', 'missing'),
          params: { name: 'missing' },
          body: { description: 'Changed' },
        }),
        kibanaResponseFactory
      );

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /internal/evals/evaluators/{name}', () => {
    const setup = () =>
      setupRoute({
        registerRoute: registerDeleteEvaluatorRoute,
        method: 'delete',
        path: EVALS_EVALUATOR_URL,
      });

    it('registers manage_evals authorization', () => {
      expect(setup().routeConfig.security).toEqual({
        authz: { requiredPrivileges: [EVALS_API_PRIVILEGES.manage] },
      });
    });

    it('deletes a pinned version in the active space', async () => {
      const { handler, context, client, evaluatorDefinitionService } = setup();
      client.delete.mockResolvedValueOnce({ deleted: 1 });

      const response = await handler(
        context,
        httpServerMock.createKibanaRequest({
          method: 'delete',
          path: EVALS_EVALUATOR_URL.replace('{name}', 'tone'),
          params: { name: 'tone' },
          query: { version: '1.0.0' },
        }),
        kibanaResponseFactory
      );

      expect(evaluatorDefinitionService.getClient).toHaveBeenCalledWith({ spaceId: 'marketing' });
      expect(client.delete).toHaveBeenCalledWith('tone', { version: '1.0.0' });
      expect(response.status).toBe(200);
      expect(response.payload).toEqual({ success: true, deleted: 1 });
    });

    it('rejects deletion of built-in evaluators', async () => {
      const { handler, context, client } = setup();
      const response = await handler(
        context,
        httpServerMock.createKibanaRequest({
          method: 'delete',
          path: EVALS_EVALUATOR_URL.replace('{name}', 'correctness'),
          params: { name: 'correctness' },
          query: {},
        }),
        kibanaResponseFactory
      );

      expect(response.status).toBe(409);
      expect(client.delete).not.toHaveBeenCalled();
    });

    it('returns 404 when no version was deleted', async () => {
      const { handler, context, client } = setup();
      client.delete.mockResolvedValueOnce({ deleted: 0 });

      const response = await handler(
        context,
        httpServerMock.createKibanaRequest({
          method: 'delete',
          path: EVALS_EVALUATOR_URL.replace('{name}', 'missing'),
          params: { name: 'missing' },
          query: {},
        }),
        kibanaResponseFactory
      );

      expect(response.status).toBe(404);
    });
  });
});
