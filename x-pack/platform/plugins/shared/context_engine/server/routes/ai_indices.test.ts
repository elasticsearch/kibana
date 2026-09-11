/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import type { DiagnosticResult } from '@elastic/elasticsearch';
import { actionsClientMock, actionsMock } from '@kbn/actions-plugin/server/mocks';
import type { ActionResult, ConnectorType } from '@kbn/actions-plugin/server';
import type { Type } from '@kbn/config-schema';
import type { IRouter, RequestHandler } from '@kbn/core/server';
import { httpServerMock } from '@kbn/core/server/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { registerAiIndexRoutes } from './ai_indices';
import {
  MAX_AI_INDEX_QUERY_LENGTH,
  MAX_AI_INDEX_QUERY_LIMIT,
  MAX_AI_INDEX_QUERY_PARAM_KEY_LENGTH,
  MAX_AI_INDEX_QUERY_PARAM_VALUE_LENGTH,
  MAX_AI_INDEX_QUERY_PARAMS,
  MAX_AI_INDEX_SOURCES,
  MAX_AI_INDEX_SOURCE_VALUE_LENGTH,
  aiIndexByIdPath,
  aiIndexDescribePath,
  aiIndexFeedbackAnalysisPath,
  aiIndexKiByIdPath,
  aiIndexKiListPath,
  aiIndexPath,
  aiIndexQueryPath,
} from '../../common/constants';
import { apiPrivileges } from '../../common/features';
import type { AiIndexHttpItem, DescribeAiIndexResponse } from '../../common/http_api/ai_indices';
import { IMPROVEMENT_ACTIONS } from '../../common/http_api/improvement_actions';
import {
  InvalidAiIndexDestError,
  AiIndexConflictError,
  AiIndexDescribeResponseTooLargeError,
  AiIndexNotFoundError,
  AiIndexAlreadyExistsError,
  AiIndexQueryResponseTooLargeError,
  InvalidAiIndexQueryError,
  KiNotFoundError,
} from '../ai_indices/errors';
import type { AiIndexDataReadServiceApi } from '../ai_indices/data_read_service';
import type { AiIndexService } from '../ai_indices/service';
import type { ImprovementsServiceApi } from '../improvements/service';
import type { GetAiIndexDataReadServiceParams } from '../types';

interface RegisteredRoute {
  config: {
    path: string;
    access: string;
    security: { authz: { requiredPrivileges: string[] } };
  };
  handler: RequestHandler;
  validate:
    | false
    | { request?: { params?: Type<unknown>; query?: Type<unknown>; body?: Type<unknown> } };
}

const SUPPORTED_TYPE_IDS = [
  '.google_drive',
  '.one_drive',
  '.notion',
  '.amazon_s3',
  '.github',
  '.box',
  '.dropbox',
  '.google_cloud_storage',
  '.salesforce',
  '.zendesk',
];

const buildConnector = (id: string, actionTypeId: string): ActionResult => ({
  id,
  actionTypeId,
  name: `Connector ${id}`,
  isPreconfigured: false,
  isDeprecated: false,
  isSystemAction: false,
  isConnectorTypeDeprecated: false,
});

const buildConnectorType = (id: string): ConnectorType =>
  ({
    id,
    name: `Type ${id}`,
    supportedFeatureIds: ['contextEngine'],
  } as unknown as ConnectorType);

const aiIndexItem: AiIndexHttpItem = {
  id: 'customer_support',
  description: 'Customer support context',
  managed: false,
  dest: { type: 'data_stream', value: 'ai-index-ds-customer_support*' },
  automations: [{ type: 'workflow', value: 'nightly-refresh' }],
  sources: [{ type: 'esql', value: 'FROM ai-index-ds-customer_support | LIMIT 10' }],
  date_created: '2026-07-08T12:10:30.000Z',
  date_modified: '2026-07-08T12:10:30.000Z',
};

const kiBackingIndex = '.ds-ai-index-ds-customer_support-2026.01.01-000001';

describe('ai indices routes', () => {
  let routes: Record<string, RegisteredRoute>;
  let aiIndexService: jest.Mocked<
    Pick<AiIndexService, 'create' | 'put' | 'get' | 'list' | 'delete' | 'setFeedbackAnalysis'>
  >;
  let improvementsService: jest.Mocked<Pick<ImprovementsServiceApi, 'deleteByAiIndex'>>;
  let readService: jest.Mocked<AiIndexDataReadServiceApi>;
  let readServiceParams: GetAiIndexDataReadServiceParams[];
  let response: ReturnType<typeof httpServerMock.createResponseFactory>;
  let featureFlagEnabled: boolean;
  let actionsClient: ReturnType<typeof actionsClientMock.create>;
  let actions: ReturnType<typeof actionsMock.createStart>;
  let auditLogger: { log: jest.Mock };
  let esSearch: jest.Mock;
  let esGet: jest.Mock;
  let improvementsClients: unknown[];
  const logger = loggerMock.create();

  const createContext = () =>
    ({
      core: Promise.resolve({
        uiSettings: {
          client: { get: jest.fn().mockImplementation(async () => featureFlagEnabled) },
        },
        security: { audit: { logger: auditLogger } },
        elasticsearch: {
          client: {
            asCurrentUser: {
              search: esSearch,
              get: esGet,
            },
          },
        },
      }),
    } as unknown as Parameters<RequestHandler>[0]);

  const getRoute = (method: string, path: string): RegisteredRoute => {
    const route = routes[`${method}:${path}`];
    expect(route).toBeDefined();
    return route;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    routes = {};
    featureFlagEnabled = true;
    response = httpServerMock.createResponseFactory();
    actionsClient = actionsClientMock.create();
    actions = actionsMock.createStart();
    actions.getActionsClientWithRequest.mockResolvedValue(actionsClient);
    actionsClient.listTypes.mockResolvedValue(SUPPORTED_TYPE_IDS.map(buildConnectorType));
    auditLogger = { log: jest.fn() };
    esSearch = jest.fn();
    esGet = jest.fn();
    aiIndexService = {
      create: jest.fn(),
      put: jest.fn(),
      get: jest.fn(),
      list: jest.fn(),
      delete: jest.fn(),
      setFeedbackAnalysis: jest.fn(),
    };
    improvementsService = { deleteByAiIndex: jest.fn().mockResolvedValue(undefined) };
    improvementsClients = [];
    readService = { query: jest.fn(), describe: jest.fn() };
    readServiceParams = [];

    const createVersionedRoute = (method: string) => (config: RegisteredRoute['config']) => ({
      addVersion: (
        versionConfig: { validate: RegisteredRoute['validate'] },
        handler: RequestHandler
      ) => {
        routes[`${method}:${config.path}`] = {
          config,
          handler,
          validate: versionConfig.validate,
        };
      },
    });

    const router = {
      versioned: {
        get: jest.fn(createVersionedRoute('GET')),
        post: jest.fn(createVersionedRoute('POST')),
        put: jest.fn(createVersionedRoute('PUT')),
        delete: jest.fn(createVersionedRoute('DELETE')),
      },
    } as unknown as IRouter;

    registerAiIndexRoutes({
      router,
      logger,
      getAiIndexService: () => aiIndexService as unknown as AiIndexService,
      getAiIndexDataReadService: (params) => {
        readServiceParams.push(params);
        return readService;
      },
      getImprovementsService: (esClient) => {
        improvementsClients.push(esClient);
        return improvementsService as unknown as ImprovementsServiceApi;
      },
      getActions: async () => actions,
    });
  });

  const callRoute = async (method: string, path: string, request: Record<string, unknown>) => {
    const { handler } = getRoute(method, path);
    return handler(createContext(), httpServerMock.createKibanaRequest(request), response);
  };

  it('returns 404 on every route when the context engine is disabled', async () => {
    featureFlagEnabled = false;

    await callRoute('POST', aiIndexPath, { body: { id: 'a' } });
    await callRoute('PUT', aiIndexByIdPath, { params: { aiIndexId: 'a' }, body: {} });
    await callRoute('GET', aiIndexByIdPath, { params: { aiIndexId: 'a' } });
    await callRoute('GET', aiIndexKiListPath, { params: { aiIndexId: 'a' } });
    await callRoute('GET', aiIndexKiByIdPath, {
      params: { aiIndexId: 'a', kiId: 'ki-1' },
      query: { index: kiBackingIndex },
    });
    await callRoute('GET', aiIndexPath, {});
    await callRoute('POST', aiIndexQueryPath, { body: { query: 'FROM ai-index-idx-a' } });
    await callRoute('GET', aiIndexDescribePath, { params: { aiIndexId: 'a' } });
    await callRoute('DELETE', aiIndexByIdPath, { params: { aiIndexId: 'a' } });
    await callRoute('PUT', aiIndexFeedbackAnalysisPath, {
      params: { aiIndexId: 'a' },
      body: { enabled: true },
    });

    expect(response.notFound).toHaveBeenCalledTimes(10);
    expect(aiIndexService.create).not.toHaveBeenCalled();
    expect(aiIndexService.put).not.toHaveBeenCalled();
    expect(aiIndexService.get).not.toHaveBeenCalled();
    expect(aiIndexService.list).not.toHaveBeenCalled();
    expect(aiIndexService.delete).not.toHaveBeenCalled();
    expect(aiIndexService.setFeedbackAnalysis).not.toHaveBeenCalled();
    expect(readService.query).not.toHaveBeenCalled();
    expect(readService.describe).not.toHaveBeenCalled();
  });

  it('registers routes with the expected access and privileges', () => {
    expect(getRoute('POST', aiIndexPath).config).toMatchObject({
      access: 'public',
      security: { authz: { requiredPrivileges: [apiPrivileges.writeContextEngine] } },
    });
    expect(getRoute('PUT', aiIndexByIdPath).config).toMatchObject({
      access: 'public',
      security: { authz: { requiredPrivileges: [apiPrivileges.writeContextEngine] } },
    });
    expect(getRoute('GET', aiIndexByIdPath).config).toMatchObject({
      access: 'public',
      security: { authz: { requiredPrivileges: [apiPrivileges.readContextEngine] } },
    });
    expect(getRoute('GET', aiIndexKiListPath).config).toMatchObject({
      access: 'internal',
      security: { authz: { requiredPrivileges: [apiPrivileges.readContextEngine] } },
    });
    expect(getRoute('GET', aiIndexKiByIdPath).config).toMatchObject({
      access: 'internal',
      security: { authz: { requiredPrivileges: [apiPrivileges.readContextEngine] } },
    });
    expect(getRoute('GET', aiIndexPath).config).toMatchObject({
      access: 'public',
      security: { authz: { requiredPrivileges: [apiPrivileges.readContextEngine] } },
    });
    expect(getRoute('POST', aiIndexQueryPath).config).toMatchObject({
      access: 'public',
      security: { authz: { requiredPrivileges: [apiPrivileges.readContextEngine] } },
    });
    expect(getRoute('GET', aiIndexDescribePath).config).toMatchObject({
      access: 'public',
      security: { authz: { requiredPrivileges: [apiPrivileges.readContextEngine] } },
    });
    expect(getRoute('DELETE', aiIndexByIdPath).config).toMatchObject({
      access: 'public',
      security: { authz: { requiredPrivileges: [apiPrivileges.writeContextEngine] } },
    });
    expect(getRoute('PUT', aiIndexFeedbackAnalysisPath).config).toMatchObject({
      access: 'internal',
      security: { authz: { requiredPrivileges: [apiPrivileges.writeContextEngine] } },
    });
  });

  describe('POST /api/context_engine/ai_index', () => {
    const postBody = {
      id: 'customer_support',
      dest: { type: 'data_stream', value: 'ai-index-ds-customer_support*' },
      automations: [{ type: 'workflow', value: 'nightly-refresh' }],
      sources: [{ type: 'esql', value: 'FROM ai-index-ds-customer_support | LIMIT 10' }],
    };

    it('returns 201 when the AI index is created', async () => {
      aiIndexService.create.mockResolvedValue(undefined);

      await callRoute('POST', aiIndexPath, { body: postBody });

      const { id, ...properties } = postBody;
      expect(aiIndexService.create).toHaveBeenCalledWith('customer_support', properties);
      expect(response.created).toHaveBeenCalledWith({ body: { status: 'created' } });
    });

    it('returns 409 when the id already exists', async () => {
      aiIndexService.create.mockRejectedValue(new AiIndexAlreadyExistsError('customer_support'));

      await callRoute('POST', aiIndexPath, { body: postBody });

      expect(response.conflict).toHaveBeenCalledWith({
        body: { message: "AI index 'customer_support' already exists" },
      });
    });

    it('returns 400 when the dest is invalid', async () => {
      aiIndexService.create.mockRejectedValue(
        new InvalidAiIndexDestError("dest.value 'customer_support*' is not allowed")
      );

      await callRoute('POST', aiIndexPath, { body: postBody });

      expect(response.badRequest).toHaveBeenCalledWith({
        body: { message: "dest.value 'customer_support*' is not allowed" },
      });
    });

    it('passes connector sources through to create once validated', async () => {
      aiIndexService.create.mockResolvedValue(undefined);
      actionsClient.getBulk.mockResolvedValue([buildConnector('connector-1', '.google_drive')]);
      const body = {
        ...postBody,
        sources: [{ type: 'connector', value: 'connector-1' }],
      };

      await callRoute('POST', aiIndexPath, { body });

      const { id, ...properties } = body;
      expect(aiIndexService.create).toHaveBeenCalledWith('customer_support', properties);
      expect(response.created).toHaveBeenCalledWith({ body: { status: 'created' } });
    });

    it('returns 400 without creating when a connector source is not a data connector', async () => {
      actionsClient.getBulk.mockResolvedValue([buildConnector('slack-1', '.slack')]);

      await callRoute('POST', aiIndexPath, {
        body: { ...postBody, sources: [{ type: 'connector', value: 'slack-1' }] },
      });

      expect(aiIndexService.create).not.toHaveBeenCalled();
      expect(response.badRequest).toHaveBeenCalledWith({
        body: {
          message: 'Connector [slack-1] of type [.slack] cannot be used as an AI index source',
        },
      });
    });

    it('returns 400 without creating when a connector source cannot be resolved', async () => {
      actionsClient.getBulk.mockRejectedValue(new Error('Failed to load action missing-1 (404)'));

      await callRoute('POST', aiIndexPath, {
        body: { ...postBody, sources: [{ type: 'connector', value: 'missing-1' }] },
      });

      expect(aiIndexService.create).not.toHaveBeenCalled();
      expect(response.badRequest).toHaveBeenCalledWith({
        body: { message: 'Unable to resolve connector sources: missing-1' },
      });
    });

    it('does not consult the actions client when there are no connector sources', async () => {
      aiIndexService.create.mockResolvedValue(undefined);

      await callRoute('POST', aiIndexPath, { body: postBody });

      expect(actions.getActionsClientWithRequest).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/context_engine/ai_index/{aiIndexId}', () => {
    const putRequest = {
      params: { aiIndexId: 'customer_support' },
      body: {
        dest: { type: 'data_stream', value: 'ai-index-ds-customer_support*' },
        automations: [{ type: 'workflow', value: 'nightly-refresh' }],
        sources: [{ type: 'esql', value: 'FROM ai-index-ds-customer_support | LIMIT 10' }],
      },
    };

    it('returns 201 when the AI index is created', async () => {
      aiIndexService.put.mockResolvedValue('created');

      await callRoute('PUT', aiIndexByIdPath, putRequest);

      expect(aiIndexService.put).toHaveBeenCalledWith('customer_support', putRequest.body);
      expect(response.created).toHaveBeenCalledWith({ body: { status: 'created' } });
    });

    it('returns 200 when the AI index is updated', async () => {
      aiIndexService.put.mockResolvedValue('updated');

      await callRoute('PUT', aiIndexByIdPath, putRequest);

      expect(response.ok).toHaveBeenCalledWith({ body: { status: 'updated' } });
    });

    it('returns 400 when the dest is invalid', async () => {
      aiIndexService.put.mockRejectedValue(
        new InvalidAiIndexDestError(
          "dest.value 'customer_support*' does not match any existing index, index pattern, or data stream"
        )
      );

      await callRoute('PUT', aiIndexByIdPath, putRequest);

      expect(response.badRequest).toHaveBeenCalledWith({
        body: {
          message:
            "dest.value 'customer_support*' does not match any existing index, index pattern, or data stream",
        },
      });
    });

    it('returns 409 when the AI index is modified concurrently', async () => {
      aiIndexService.put.mockRejectedValue(new AiIndexConflictError('customer_support'));

      await callRoute('PUT', aiIndexByIdPath, putRequest);

      expect(response.conflict).toHaveBeenCalledWith({
        body: { message: "AI index 'customer_support' was modified concurrently; please retry" },
      });
    });

    it('passes connector sources through to put once validated', async () => {
      aiIndexService.put.mockResolvedValue('updated');
      actionsClient.getBulk.mockResolvedValue([buildConnector('connector-1', '.notion')]);
      const body = { ...putRequest.body, sources: [{ type: 'connector', value: 'connector-1' }] };

      await callRoute('PUT', aiIndexByIdPath, { ...putRequest, body });

      expect(aiIndexService.put).toHaveBeenCalledWith('customer_support', body);
      expect(response.ok).toHaveBeenCalledWith({ body: { status: 'updated' } });
    });

    it('returns 400 without updating when a connector source is not a data connector', async () => {
      actionsClient.getBulk.mockResolvedValue([buildConnector('slack-1', '.slack')]);

      await callRoute('PUT', aiIndexByIdPath, {
        ...putRequest,
        body: { ...putRequest.body, sources: [{ type: 'connector', value: 'slack-1' }] },
      });

      expect(aiIndexService.put).not.toHaveBeenCalled();
      expect(response.badRequest).toHaveBeenCalledWith({
        body: {
          message: 'Connector [slack-1] of type [.slack] cannot be used as an AI index source',
        },
      });
    });
  });

  describe('GET /api/context_engine/ai_index/{aiIndexId}', () => {
    it('returns the AI index', async () => {
      aiIndexService.get.mockResolvedValue(aiIndexItem);

      await callRoute('GET', aiIndexByIdPath, { params: { aiIndexId: 'customer_support' } });

      expect(response.ok).toHaveBeenCalledWith({ body: aiIndexItem });
    });

    it('returns 404 when the AI index does not exist', async () => {
      aiIndexService.get.mockRejectedValue(new AiIndexNotFoundError('missing'));

      await callRoute('GET', aiIndexByIdPath, { params: { aiIndexId: 'missing' } });

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: "AI index 'missing' not found" },
      });
    });

    it('rethrows unexpected errors after logging the audit event', async () => {
      aiIndexService.get.mockRejectedValue(new Error('boom'));

      await expect(
        callRoute('GET', aiIndexByIdPath, { params: { aiIndexId: 'customer_support' } })
      ).rejects.toThrow('boom');

      expect(auditLogger.log).toHaveBeenCalledTimes(1);
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({ action: 'ai_index_get', outcome: 'failure' }),
          kibana: { saved_object: { type: 'ai_index', id: 'customer_support' } },
        })
      );
    });
  });

  const createEsError = (statusCode: number, message: string) =>
    new errors.ResponseError({
      meta: {
        aborted: false,
        attempts: 1,
        connection: null,
        context: null,
        name: message,
        request: {} as unknown as DiagnosticResult['meta']['request'],
      },
      warnings: [],
      body: { error: { type: message, reason: message } },
      statusCode,
    });

  describe('POST /api/context_engine/ai_index/_query', () => {
    const queryBody = { query: 'FROM ai-index-idx-a | LIMIT 10', params: { type: 'faq' } };
    const esqlResponse = { columns: [{ name: 'title', type: 'keyword' }], values: [['Refunds']] };

    it('builds the read service from the current user client and request, then queries', async () => {
      readService.query.mockResolvedValue(esqlResponse);

      const request = httpServerMock.createKibanaRequest({ body: queryBody });
      await getRoute('POST', aiIndexQueryPath).handler(createContext(), request, response);

      expect(readServiceParams).toHaveLength(1);
      expect(readServiceParams[0].request).toBe(request);
      expect(readServiceParams[0].esClient).toMatchObject({ search: esSearch, get: esGet });
      expect(readService.query).toHaveBeenCalledWith(queryBody);
      expect(response.ok).toHaveBeenCalledWith({ body: esqlResponse });
    });

    it('returns 400 when the service rejects the input', async () => {
      readService.query.mockRejectedValue(new InvalidAiIndexQueryError('limit: bad'));

      await callRoute('POST', aiIndexQueryPath, { body: queryBody });

      expect(response.badRequest).toHaveBeenCalledWith({ body: { message: 'limit: bad' } });
    });

    it('returns 400 when the response exceeds the size cap', async () => {
      readService.query.mockRejectedValue(new AiIndexQueryResponseTooLargeError(20 * 1024 * 1024));

      await callRoute('POST', aiIndexQueryPath, { body: queryBody });

      expect(response.badRequest).toHaveBeenCalledWith({
        body: { message: expect.stringContaining('20MB') },
      });
    });

    it('passes Elasticsearch 4xx errors through with their status', async () => {
      readService.query.mockRejectedValue(createEsError(403, 'security_exception'));

      await callRoute('POST', aiIndexQueryPath, { body: queryBody });

      expect(response.customError).toHaveBeenCalledWith({
        statusCode: 403,
        body: { message: expect.stringContaining('security_exception') },
      });
    });

    it('rethrows Elasticsearch 5xx errors', async () => {
      readService.query.mockRejectedValue(createEsError(503, 'unavailable'));

      await expect(callRoute('POST', aiIndexQueryPath, { body: queryBody })).rejects.toThrow(
        'unavailable'
      );
    });

    describe('body validation', () => {
      const validateBody = (body: unknown) => {
        const { validate } = getRoute('POST', aiIndexQueryPath);
        if (validate === false || !validate.request?.body) {
          throw new Error('expected a body schema');
        }
        return validate.request.body.validate(body);
      };

      it('accepts a full body', () => {
        expect(() =>
          validateBody({ query: 'FROM a', params: { s: 'x', n: 1, b: true }, limit: 5 })
        ).not.toThrow();
      });

      it('requires a non-empty query', () => {
        expect(() => validateBody({})).toThrow(/query/);
        expect(() => validateBody({ query: '' })).toThrow();
      });

      it('bounds the query length', () => {
        expect(() => validateBody({ query: 'a'.repeat(MAX_AI_INDEX_QUERY_LENGTH) })).not.toThrow();
        expect(() => validateBody({ query: 'a'.repeat(MAX_AI_INDEX_QUERY_LENGTH + 1) })).toThrow();
      });

      it('requires an integer limit within bounds', () => {
        expect(() => validateBody({ query: 'FROM a', limit: 1 })).not.toThrow();
        expect(() =>
          validateBody({ query: 'FROM a', limit: MAX_AI_INDEX_QUERY_LIMIT })
        ).not.toThrow();
        expect(() => validateBody({ query: 'FROM a', limit: 0 })).toThrow();
        expect(() => validateBody({ query: 'FROM a', limit: -5 })).toThrow();
        expect(() => validateBody({ query: 'FROM a', limit: 1.5 })).toThrow(/integer/);
        expect(() =>
          validateBody({ query: 'FROM a', limit: MAX_AI_INDEX_QUERY_LIMIT + 1 })
        ).toThrow();
      });

      it('bounds param count, key length, and value length', () => {
        const tooMany = Object.fromEntries(
          Array.from({ length: MAX_AI_INDEX_QUERY_PARAMS + 1 }, (_, i) => [`p${i}`, i])
        );
        expect(() => validateBody({ query: 'FROM a', params: tooMany })).toThrow(/entries/);
        expect(() =>
          validateBody({
            query: 'FROM a',
            params: { ['k'.repeat(MAX_AI_INDEX_QUERY_PARAM_KEY_LENGTH + 1)]: 1 },
          })
        ).toThrow();
        expect(() =>
          validateBody({
            query: 'FROM a',
            params: { v: 'x'.repeat(MAX_AI_INDEX_QUERY_PARAM_VALUE_LENGTH + 1) },
          })
        ).toThrow();
      });

      it('rejects non-scalar param values', () => {
        expect(() => validateBody({ query: 'FROM a', params: { v: null } })).toThrow();
        expect(() => validateBody({ query: 'FROM a', params: { v: [1] } })).toThrow();
        expect(() => validateBody({ query: 'FROM a', params: { v: { a: 1 } } })).toThrow();
      });
    });
  });

  describe('GET /api/context_engine/ai_index/{aiIndexId}/_describe', () => {
    const contextBlock = 'AI index: a\nQuery with ES|QL against: ai-index-idx-a\n\nFields\n(none)';
    const description = { response: contextBlock } satisfies DescribeAiIndexResponse;

    it('builds the read service from the current user client and request, then describes', async () => {
      readService.describe.mockResolvedValue(description);

      const request = httpServerMock.createKibanaRequest({ params: { aiIndexId: 'a' } });
      await getRoute('GET', aiIndexDescribePath).handler(createContext(), request, response);

      expect(readServiceParams).toHaveLength(1);
      expect(readServiceParams[0].request).toBe(request);
      expect(readServiceParams[0].esClient).toMatchObject({ search: esSearch, get: esGet });
      expect(readService.describe).toHaveBeenCalledWith('a');
      expect(response.ok).toHaveBeenCalledWith({ body: description });
    });

    it('returns 404 when the AI index does not exist', async () => {
      readService.describe.mockRejectedValue(new AiIndexNotFoundError('missing'));

      await callRoute('GET', aiIndexDescribePath, { params: { aiIndexId: 'missing' } });

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: "AI index 'missing' not found" },
      });
    });

    it('returns 400 when the field metadata exceeds the size cap', async () => {
      readService.describe.mockRejectedValue(
        new AiIndexDescribeResponseTooLargeError(20 * 1024 * 1024)
      );

      await callRoute('GET', aiIndexDescribePath, { params: { aiIndexId: 'a' } });

      expect(response.badRequest).toHaveBeenCalledWith({
        body: { message: expect.stringContaining('20MB') },
      });
    });

    it('passes Elasticsearch 4xx errors through with their status', async () => {
      readService.describe.mockRejectedValue(createEsError(403, 'security_exception'));

      await callRoute('GET', aiIndexDescribePath, { params: { aiIndexId: 'a' } });

      expect(response.customError).toHaveBeenCalledWith({
        statusCode: 403,
        body: { message: expect.stringContaining('security_exception') },
      });
    });

    it('rethrows Elasticsearch 5xx errors', async () => {
      readService.describe.mockRejectedValue(createEsError(503, 'unavailable'));

      await expect(
        callRoute('GET', aiIndexDescribePath, { params: { aiIndexId: 'a' } })
      ).rejects.toThrow('unavailable');
    });
  });

  describe('GET /internal/context_engine/ai_index/{aiIndexId}/kis', () => {
    it('returns paginated Knowledge Indicators from the destination', async () => {
      aiIndexService.get.mockResolvedValue(aiIndexItem);
      esSearch.mockResolvedValue({
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: 'ki-1',
              _index: kiBackingIndex,
              _source: {
                type: 'playbook',
                title: 'Refund playbook',
              },
            },
          ],
        },
        aggregations: {
          all_kis: {
            doc_count: 12,
            counts_by_type: {
              buckets: [{ key: 'playbook', doc_count: 12 }],
            },
          },
        },
      });

      await callRoute('GET', aiIndexKiListPath, {
        params: { aiIndexId: 'customer_support' },
        query: { size: 25 },
      });

      expect(esSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          index: aiIndexItem.dest.value,
          from: 0,
          size: 25,
          aggs: {
            all_kis: {
              global: {},
              aggs: {
                counts_by_type: {
                  terms: {
                    field: 'type',
                    size: 5,
                    order: { _count: 'desc' },
                  },
                },
              },
            },
          },
        })
      );
      expect(response.ok).toHaveBeenCalledWith({
        body: {
          total: 1,
          summary: {
            total: 12,
            counts_by_type: [{ type: 'playbook', count: 12 }],
          },
          kis: [
            {
              id: 'ki-1',
              index: kiBackingIndex,
              type: 'playbook',
              title: 'Refund playbook',
            },
          ],
        },
      });
    });

    it('passes type filter to Elasticsearch', async () => {
      aiIndexService.get.mockResolvedValue(aiIndexItem);
      esSearch.mockResolvedValue({
        hits: { total: { value: 0 }, hits: [] },
        aggregations: {
          all_kis: { doc_count: 0, counts_by_type: { buckets: [] } },
        },
      });

      await callRoute('GET', aiIndexKiListPath, {
        params: { aiIndexId: 'customer_support' },
        query: {
          size: 10,
          type: 'fact',
        },
      });

      expect(esSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          query: {
            bool: {
              filter: [{ term: { type: 'fact' } }],
            },
          },
        })
      );
    });

    it('returns 404 when the AI index does not exist', async () => {
      aiIndexService.get.mockRejectedValue(new AiIndexNotFoundError('missing'));

      await callRoute('GET', aiIndexKiListPath, {
        params: { aiIndexId: 'missing' },
      });

      expect(response.notFound).toHaveBeenCalled();
    });

    it('returns an empty list when the backing store has no documents yet', async () => {
      aiIndexService.get.mockResolvedValue(aiIndexItem);
      esSearch.mockResolvedValue({
        hits: { total: { value: 0 }, hits: [] },
        aggregations: {
          all_kis: { doc_count: 0, counts_by_type: { buckets: [] } },
        },
      });

      await callRoute('GET', aiIndexKiListPath, {
        params: { aiIndexId: 'customer_support' },
        query: { size: 25 },
      });

      expect(esSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          index: aiIndexItem.dest.value,
          ignore_unavailable: true,
          allow_no_indices: true,
        })
      );
      expect(response.ok).toHaveBeenCalledWith({
        body: {
          total: 0,
          summary: {
            total: 0,
            counts_by_type: [],
          },
          kis: [],
        },
      });
    });
  });

  describe('GET /internal/context_engine/ai_index/{aiIndexId}/kis/{kiId}', () => {
    it('returns the stored Knowledge Indicator document', async () => {
      aiIndexService.get.mockResolvedValue(aiIndexItem);
      esSearch.mockResolvedValue({
        hits: {
          hits: [
            {
              _id: 'ki-1',
              _index: kiBackingIndex,
              _source: {
                type: 'playbook',
                title: 'Refund playbook',
                content: 'Verify the order first.',
              },
            },
          ],
        },
      });

      await callRoute('GET', aiIndexKiByIdPath, {
        params: { aiIndexId: 'customer_support', kiId: 'ki-1' },
        query: { index: kiBackingIndex },
      });

      expect(esSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          index: aiIndexItem.dest.value,
          query: {
            bool: {
              filter: [{ ids: { values: ['ki-1'] } }, { term: { _index: kiBackingIndex } }],
            },
          },
          size: 1,
        })
      );
      expect(response.ok).toHaveBeenCalledWith({
        body: {
          id: 'ki-1',
          document: {
            type: 'playbook',
            title: 'Refund playbook',
            content: 'Verify the order first.',
          },
        },
      });
    });

    it('returns 404 when the KI does not exist', async () => {
      aiIndexService.get.mockResolvedValue(aiIndexItem);
      esSearch.mockResolvedValue({
        hits: {
          hits: [],
        },
      });

      await callRoute('GET', aiIndexKiByIdPath, {
        params: { aiIndexId: 'customer_support', kiId: 'missing' },
        query: { index: kiBackingIndex },
      });

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: new KiNotFoundError('customer_support', 'missing').message },
      });
    });

    it('returns 404 when the index is outside the AI index dest', async () => {
      aiIndexService.get.mockResolvedValue(aiIndexItem);
      esSearch.mockResolvedValue({
        hits: {
          hits: [],
        },
      });

      await callRoute('GET', aiIndexKiByIdPath, {
        params: { aiIndexId: 'customer_support', kiId: 'ki-1' },
        query: { index: 'logs-*' },
      });

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: new KiNotFoundError('customer_support', 'ki-1').message },
      });
    });

    it('returns 404 when the AI index does not exist', async () => {
      aiIndexService.get.mockRejectedValue(new AiIndexNotFoundError('missing'));

      await callRoute('GET', aiIndexKiByIdPath, {
        params: { aiIndexId: 'missing', kiId: 'ki-1' },
        query: { index: kiBackingIndex },
      });

      expect(response.notFound).toHaveBeenCalled();
    });
  });

  describe('GET /api/context_engine/ai_index', () => {
    it('returns the list of AI indices', async () => {
      aiIndexService.list.mockResolvedValue([]);

      await callRoute('GET', aiIndexPath, {});

      expect(response.ok).toHaveBeenCalledWith({ body: { ai_indices: [] } });
    });
  });

  describe('DELETE /api/context_engine/ai_index/{aiIndexId}', () => {
    it('returns acknowledged when the AI index is deleted', async () => {
      aiIndexService.delete.mockResolvedValue(undefined);

      await callRoute('DELETE', aiIndexByIdPath, {
        params: { aiIndexId: 'customer_support' },
      });

      expect(aiIndexService.delete).toHaveBeenCalledWith('customer_support');
      expect(response.ok).toHaveBeenCalledWith({ body: { acknowledged: true } });
    });

    it('clears the improvements for the AI index, so they cannot resurface under a reused id', async () => {
      aiIndexService.delete.mockResolvedValue(undefined);

      await callRoute('DELETE', aiIndexByIdPath, {
        params: { aiIndexId: 'customer_support' },
      });

      expect(improvementsService.deleteByAiIndex).toHaveBeenCalledWith('customer_support');
    });

    it('audits the deletion even when the improvements cleanup fails afterwards', async () => {
      aiIndexService.delete.mockResolvedValue(undefined);
      improvementsService.deleteByAiIndex.mockRejectedValue(new Error('security_exception'));

      await callRoute('DELETE', aiIndexByIdPath, {
        params: { aiIndexId: 'customer_support' },
      });

      // The index is gone either way, so the audit record is owed and the caller is not sent to
      // retry a delete that would now 404.
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ event: expect.objectContaining({ outcome: 'success' }) })
      );
      expect(response.ok).toHaveBeenCalledWith({ body: { acknowledged: true } });
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('security_exception'));
    });

    it("deletes the improvements as the request's user, since the store is a user index", async () => {
      aiIndexService.delete.mockResolvedValue(undefined);

      await callRoute('DELETE', aiIndexByIdPath, {
        params: { aiIndexId: 'customer_support' },
      });

      expect(improvementsClients).toEqual([expect.objectContaining({ search: esSearch })]);
    });

    it('leaves the improvements alone when the AI index cannot be deleted', async () => {
      aiIndexService.delete.mockRejectedValue(new AiIndexNotFoundError('missing'));

      await callRoute('DELETE', aiIndexByIdPath, { params: { aiIndexId: 'missing' } });

      expect(improvementsService.deleteByAiIndex).not.toHaveBeenCalled();
    });

    it('returns 404 when the AI index does not exist', async () => {
      aiIndexService.delete.mockRejectedValue(new AiIndexNotFoundError('missing'));

      await callRoute('DELETE', aiIndexByIdPath, { params: { aiIndexId: 'missing' } });

      expect(response.notFound).toHaveBeenCalledWith({
        body: { message: "AI index 'missing' not found" },
      });
    });
  });

  describe('PUT /internal/context_engine/ai_index/{aiIndexId}/feedback_analysis', () => {
    const feedbackAnalysis = {
      enabled: true,
      agent_id: 'my-analysis-agent',
      schedule: { interval: '24h' },
      signal_time_range: { type: 'relative' as const, from: 'now-30d' },
    };

    it('stores the configuration and returns what was stored', async () => {
      aiIndexService.setFeedbackAnalysis.mockResolvedValue(feedbackAnalysis);

      await callRoute('PUT', aiIndexFeedbackAnalysisPath, {
        params: { aiIndexId: 'customer_support' },
        body: feedbackAnalysis,
      });

      expect(aiIndexService.setFeedbackAnalysis).toHaveBeenCalledWith(
        'customer_support',
        feedbackAnalysis
      );
      expect(response.ok).toHaveBeenCalledWith({
        body: { feedback_analysis: feedbackAnalysis },
      });
    });

    it('returns 404 when the AI index does not exist', async () => {
      aiIndexService.setFeedbackAnalysis.mockRejectedValue(new AiIndexNotFoundError('missing'));

      await callRoute('PUT', aiIndexFeedbackAnalysisPath, {
        params: { aiIndexId: 'missing' },
        body: feedbackAnalysis,
      });

      expect(response.notFound).toHaveBeenCalled();
    });

    it('returns 409 when a concurrent write wins', async () => {
      aiIndexService.setFeedbackAnalysis.mockRejectedValue(
        new AiIndexConflictError('customer_support')
      );

      await callRoute('PUT', aiIndexFeedbackAnalysisPath, {
        params: { aiIndexId: 'customer_support' },
        body: feedbackAnalysis,
      });

      expect(response.conflict).toHaveBeenCalled();
    });
  });

  describe('feedback analysis body validation', () => {
    const validateBody = (body: unknown) => {
      const { validate } = getRoute('PUT', aiIndexFeedbackAnalysisPath);
      if (validate === false || !validate.request?.body) {
        throw new Error('Expected a body schema');
      }
      return validate.request.body.validate(body);
    };

    it('defaults the schedule, the signal time range, and the allowed actions', () => {
      expect(validateBody({ enabled: true })).toEqual({
        enabled: true,
        schedule: { interval: '24h' },
        signal_time_range: { type: 'relative', from: 'now-30d' },
        allowed_actions: [...IMPROVEMENT_ACTIONS],
      });
    });

    it('requires enabled', () => {
      expect(() => validateBody({})).toThrow(/enabled/);
    });

    it('rejects an interval below the floor', () => {
      expect(() => validateBody({ enabled: true, schedule: { interval: '5m' } })).toThrow(
        /at least 15 minutes/
      );
    });

    it('rejects a malformed interval', () => {
      expect(() => validateBody({ enabled: true, schedule: { interval: 'hourly' } })).toThrow(
        /positive number followed by/
      );
    });

    it('accepts an interval at the floor', () => {
      expect(
        validateBody({
          enabled: true,
          schedule: { interval: '15m' },
          signal_time_range: { type: 'relative', from: 'now-1d' },
        })
      ).toMatchObject({ schedule: { interval: '15m' } });
    });

    it('rejects a relative window shorter than the schedule interval', () => {
      expect(() =>
        validateBody({
          enabled: true,
          schedule: { interval: '24h' },
          signal_time_range: { type: 'relative', from: 'now-1h' },
        })
      ).toThrow(/must cover at least one schedule interval/);
    });

    it('accepts an absolute window regardless of the interval, being open-ended', () => {
      expect(
        validateBody({
          enabled: true,
          schedule: { interval: '24h' },
          signal_time_range: { type: 'absolute', from: '2026-01-31T00:00:00.000Z' },
        })
      ).toMatchObject({ signal_time_range: { type: 'absolute' } });
    });

    it('rejects a malformed absolute window', () => {
      expect(() =>
        validateBody({
          enabled: true,
          signal_time_range: { type: 'absolute', from: 'last tuesday' },
        })
      ).toThrow();
    });

    it('rejects a malformed relative window', () => {
      expect(() =>
        validateBody({ enabled: true, signal_time_range: { type: 'relative', from: '30d' } })
      ).toThrow();
    });

    it('accepts a KQL signal filter', () => {
      expect(
        validateBody({ enabled: true, signal_filter: 'tags: query_error and data.tool: "search"' })
      ).toMatchObject({ signal_filter: 'tags: query_error and data.tool: "search"' });
    });

    it('rejects a signal filter that is not valid KQL', () => {
      expect(() => validateBody({ enabled: true, signal_filter: 'tags: (query_error' })).toThrow(
        /valid KQL query/
      );
    });

    it('accepts a subset of the improvement actions', () => {
      expect(validateBody({ enabled: true, allowed_actions: ['add_ki', 'edit_ki'] })).toMatchObject(
        { allowed_actions: ['add_ki', 'edit_ki'] }
      );
    });

    it('accepts an empty allowed action list as observe-only', () => {
      expect(validateBody({ enabled: true, allowed_actions: [] })).toMatchObject({
        allowed_actions: [],
      });
    });

    it('rejects an action outside the taxonomy', () => {
      expect(() => validateBody({ enabled: true, allowed_actions: ['delete_index'] })).toThrow();
    });
  });

  describe('POST body validation', () => {
    const validBody = {
      id: 'customer_support',
      dest: { type: 'data_stream', value: 'ai-index-ds-customer_support' },
      automations: [{ type: 'workflow', value: 'nightly-refresh' }],
      sources: [{ type: 'esql', value: 'FROM ai-index-ds-customer_support | LIMIT 10' }],
    };

    const validateBody = (body: Record<string, unknown>) => {
      const { validate } = getRoute('POST', aiIndexPath);
      if (!validate || !validate.request?.body) {
        throw new Error('expected a POST body schema');
      }
      return validate.request.body.validate(body);
    };

    it('accepts a valid body', () => {
      expect(() => validateBody(validBody)).not.toThrow();
    });

    it('rejects a missing id', () => {
      const { id, ...bodyWithoutId } = validBody;
      expect(() => validateBody(bodyWithoutId)).toThrow();
    });

    it('rejects an id with disallowed characters', () => {
      expect(() => validateBody({ ...validBody, id: 'Customer_Support' })).toThrow(
        /lowercase letters, numbers, hyphens/
      );
    });

    it('rejects a disallowed dest type', () => {
      expect(() =>
        validateBody({ ...validBody, dest: { type: 'view', value: 'ai-index-idx-foo' } })
      ).toThrow();
    });

    it('accepts a connector source', () => {
      expect(() =>
        validateBody({ ...validBody, sources: [{ type: 'connector', value: 'connector-1' }] })
      ).not.toThrow();
    });

    it('accepts a mix of ES|QL and connector sources', () => {
      expect(() =>
        validateBody({
          ...validBody,
          sources: [
            { type: 'esql', value: 'FROM ai-index-ds-customer_support | LIMIT 10' },
            { type: 'connector', value: 'connector-1' },
          ],
        })
      ).not.toThrow();
    });

    it('rejects a connector source with an empty value', () => {
      expect(() =>
        validateBody({ ...validBody, sources: [{ type: 'connector', value: '' }] })
      ).toThrow();
    });

    it('rejects a source with a disallowed type', () => {
      expect(() =>
        validateBody({ ...validBody, sources: [{ type: 'sql', value: 'SELECT 1' }] })
      ).toThrow();
    });

    it('rejects a connector source exceeding the max value length', () => {
      const value = 'x'.repeat(MAX_AI_INDEX_SOURCE_VALUE_LENGTH + 1);
      expect(() =>
        validateBody({ ...validBody, sources: [{ type: 'connector', value }] })
      ).toThrow();
    });

    it('accepts an ES|QL source with an empty value', () => {
      expect(() =>
        validateBody({ ...validBody, sources: [{ type: 'esql', value: '' }] })
      ).not.toThrow();
    });

    it('rejects sources exceeding the max size', () => {
      const sources = Array.from({ length: MAX_AI_INDEX_SOURCES + 1 }, (_, i) => ({
        type: 'connector',
        value: `connector-${i}`,
      }));
      expect(() => validateBody({ ...validBody, sources })).toThrow();
    });
  });

  describe('PUT body validation', () => {
    const validBody = {
      dest: { type: 'data_stream', value: 'ai-index-ds-customer_support' },
      automations: [{ type: 'workflow', value: 'nightly-refresh' }],
      sources: [{ type: 'esql', value: 'FROM ai-index-ds-customer_support | LIMIT 10' }],
    };

    const validateBody = (body: Record<string, unknown>) => {
      const { validate } = getRoute('PUT', aiIndexByIdPath);
      if (!validate || !validate.request?.body) {
        throw new Error('expected a PUT body schema');
      }
      return validate.request.body.validate(body);
    };

    it('accepts a valid body', () => {
      expect(() => validateBody(validBody)).not.toThrow();
    });

    it('accepts empty automations and sources arrays', () => {
      expect(() => validateBody({ ...validBody, automations: [], sources: [] })).not.toThrow();
    });

    it('accepts automations and sources with empty values', () => {
      expect(() =>
        validateBody({
          ...validBody,
          automations: [{ type: 'workflow', value: '' }],
          sources: [{ type: 'esql', value: '' }],
        })
      ).not.toThrow();
    });

    it('rejects an id in the update body', () => {
      expect(() => validateBody({ ...validBody, id: 'customer_support' })).toThrow();
    });

    it('rejects a disallowed dest type', () => {
      expect(() =>
        validateBody({ ...validBody, dest: { type: 'view', value: 'ai-index-idx-foo' } })
      ).toThrow();
    });

    it('rejects a source with a disallowed type', () => {
      expect(() =>
        validateBody({ ...validBody, sources: [{ type: 'sql', value: 'SELECT 1' }] })
      ).toThrow();
    });

    it('accepts a connector source', () => {
      expect(() =>
        validateBody({ ...validBody, sources: [{ type: 'connector', value: 'connector-1' }] })
      ).not.toThrow();
    });

    it('accepts a mix of ES|QL and connector sources', () => {
      expect(() =>
        validateBody({
          ...validBody,
          sources: [
            { type: 'esql', value: 'FROM ai-index-ds-customer_support | LIMIT 10' },
            { type: 'connector', value: 'connector-1' },
          ],
        })
      ).not.toThrow();
    });

    it('rejects a connector source with an empty value', () => {
      expect(() =>
        validateBody({ ...validBody, sources: [{ type: 'connector', value: '' }] })
      ).toThrow();
    });

    it('rejects an automation with a disallowed type', () => {
      expect(() =>
        validateBody({ ...validBody, automations: [{ type: 'cron', value: 'nightly-refresh' }] })
      ).toThrow();
    });

    it('rejects a missing automations array', () => {
      const { automations, ...bodyWithoutAutomations } = validBody;
      expect(() => validateBody(bodyWithoutAutomations)).toThrow();
    });

    it('rejects automations exceeding the max size', () => {
      const automations = Array.from({ length: 101 }, (_, i) => ({
        type: 'workflow',
        value: `workflow-${i}`,
      }));
      expect(() => validateBody({ ...validBody, automations })).toThrow();
    });

    it('rejects sources exceeding the max size', () => {
      const sources = Array.from({ length: 101 }, (_, i) => ({
        type: 'esql',
        value: `FROM index-${i}`,
      }));
      expect(() => validateBody({ ...validBody, sources })).toThrow();
    });
  });

  describe('audit logging', () => {
    const postRequest = {
      body: {
        id: 'customer_support',
        dest: { type: 'data_stream', value: 'ai-index-ds-customer_support*' },
        automations: [],
        sources: [],
      },
    };

    const putRequest = {
      params: { aiIndexId: 'customer_support' },
      body: {
        dest: { type: 'data_stream', value: 'ai-index-ds-customer_support*' },
        automations: [],
        sources: [],
      },
    };

    describe('POST /api/context_engine/ai_index', () => {
      it('logs outcome:success after the create succeeds', async () => {
        aiIndexService.create.mockResolvedValue(undefined);

        await callRoute('POST', aiIndexPath, postRequest);

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        expect(auditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({
              action: 'ai_index_create',
              type: ['creation'],
              outcome: 'success',
            }),
            kibana: { saved_object: { type: 'ai_index', id: 'customer_support' } },
          })
        );
      });

      it('logs outcome:failure on error', async () => {
        aiIndexService.create.mockRejectedValue(new AiIndexAlreadyExistsError('customer_support'));

        await callRoute('POST', aiIndexPath, postRequest);

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        expect(auditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({
              action: 'ai_index_create',
              type: ['creation'],
              outcome: 'failure',
            }),
            kibana: { saved_object: { type: 'ai_index', id: 'customer_support' } },
          })
        );
      });

      it('logs outcome:failure when connector validation fails', async () => {
        actionsClient.getBulk.mockResolvedValue([buildConnector('slack-1', '.slack')]);

        await callRoute('POST', aiIndexPath, {
          ...postRequest,
          body: { ...postRequest.body, sources: [{ type: 'connector', value: 'slack-1' }] },
        });

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        expect(auditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({
              action: 'ai_index_create',
              outcome: 'failure',
            }),
            kibana: { saved_object: { type: 'ai_index', id: 'customer_support' } },
          })
        );
      });
    });

    describe('PUT /api/context_engine/ai_index/{aiIndexId}', () => {
      it('logs action:ai_index_create when the index is created', async () => {
        aiIndexService.put.mockResolvedValue('created');

        await callRoute('PUT', aiIndexByIdPath, putRequest);

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        expect(auditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({
              action: 'ai_index_create',
              type: ['creation'],
              outcome: 'success',
            }),
            kibana: { saved_object: { type: 'ai_index', id: 'customer_support' } },
          })
        );
      });

      it('logs action:ai_index_update when the index is updated', async () => {
        aiIndexService.put.mockResolvedValue('updated');

        await callRoute('PUT', aiIndexByIdPath, putRequest);

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        expect(auditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({
              action: 'ai_index_update',
              type: ['change'],
              outcome: 'success',
            }),
            kibana: { saved_object: { type: 'ai_index', id: 'customer_support' } },
          })
        );
      });

      it('logs outcome:failure on error', async () => {
        aiIndexService.put.mockRejectedValue(new InvalidAiIndexDestError('bad dest'));

        await callRoute('PUT', aiIndexByIdPath, putRequest);

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        expect(auditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({
              action: 'ai_index_create_or_update',
              outcome: 'failure',
            }),
          })
        );
      });

      it('logs outcome:failure when connector validation fails', async () => {
        actionsClient.getBulk.mockResolvedValue([buildConnector('slack-1', '.slack')]);

        await callRoute('PUT', aiIndexByIdPath, {
          ...putRequest,
          body: { ...putRequest.body, sources: [{ type: 'connector', value: 'slack-1' }] },
        });

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        expect(auditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({
              action: 'ai_index_create_or_update',
              outcome: 'failure',
            }),
            kibana: { saved_object: { type: 'ai_index', id: 'customer_support' } },
          })
        );
      });
    });

    describe('GET /api/context_engine/ai_index/{aiIndexId}', () => {
      it('logs outcome:success after successful retrieval', async () => {
        aiIndexService.get.mockResolvedValue({
          id: 'customer_support',
          managed: false,
          dest: { type: 'data_stream' as const, value: 'ai-index-ds-customer_support*' },
          automations: [],
          sources: [],
          date_created: '2026-07-01T00:00:00.000Z',
          date_modified: '2026-07-01T00:00:00.000Z',
        });

        await callRoute('GET', aiIndexByIdPath, { params: { aiIndexId: 'customer_support' } });

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        expect(auditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({
              action: 'ai_index_get',
              type: ['access'],
              outcome: 'success',
            }),
            kibana: { saved_object: { type: 'ai_index', id: 'customer_support' } },
          })
        );
      });

      it('logs outcome:failure on error', async () => {
        aiIndexService.get.mockRejectedValue(new AiIndexNotFoundError('missing'));

        await callRoute('GET', aiIndexByIdPath, { params: { aiIndexId: 'missing' } });

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        expect(auditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({ action: 'ai_index_get', outcome: 'failure' }),
            kibana: { saved_object: { type: 'ai_index', id: 'missing' } },
          })
        );
      });
    });

    describe('GET /api/context_engine/ai_index', () => {
      it('logs outcome:success with no saved_object after successful list', async () => {
        aiIndexService.list.mockResolvedValue([]);

        await callRoute('GET', aiIndexPath, {});

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        expect(auditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({
              action: 'ai_index_list',
              type: ['access'],
              outcome: 'success',
            }),
            kibana: { saved_object: undefined },
          })
        );
      });

      it('logs outcome:failure on error', async () => {
        aiIndexService.list.mockRejectedValue(new Error('boom'));

        await expect(callRoute('GET', aiIndexPath, {})).rejects.toThrow('boom');

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        expect(auditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({ action: 'ai_index_list', outcome: 'failure' }),
            kibana: { saved_object: undefined },
          })
        );
      });
    });

    describe('DELETE /api/context_engine/ai_index/{aiIndexId}', () => {
      it('logs outcome:success after the delete succeeds', async () => {
        aiIndexService.delete.mockResolvedValue(undefined);

        await callRoute('DELETE', aiIndexByIdPath, { params: { aiIndexId: 'customer_support' } });

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        expect(auditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({
              action: 'ai_index_delete',
              type: ['deletion'],
              outcome: 'success',
            }),
            kibana: { saved_object: { type: 'ai_index', id: 'customer_support' } },
          })
        );
      });

      it('logs outcome:failure on error', async () => {
        aiIndexService.delete.mockRejectedValue(new AiIndexNotFoundError('missing'));

        await callRoute('DELETE', aiIndexByIdPath, { params: { aiIndexId: 'missing' } });

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        expect(auditLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({
            event: expect.objectContaining({ action: 'ai_index_delete', outcome: 'failure' }),
          })
        );
      });
    });
  });

  describe('aiIndexId param validation', () => {
    const validateParams = (params: Record<string, unknown>) => {
      const { validate } = getRoute('PUT', aiIndexByIdPath);
      if (!validate || !validate.request?.params) {
        throw new Error('expected a PUT params schema');
      }
      return validate.request.params.validate(params);
    };

    const validIds = ['customer_support', 'logs-app', 'index-123', 'a', '1', 'a_b-c'] as const;
    validIds.forEach((aiIndexId) => {
      it(`accepts a valid id ${aiIndexId}`, () => {
        expect(() => validateParams({ aiIndexId })).not.toThrow();
      });
    });

    const invalidIds = [
      'Customer_Support',
      'has space',
      'has.dot',
      'emoji😀',
      'slash/id',
      'tilde~',
      '_leading_underscore',
      '-leading-hyphen',
    ] as const;
    invalidIds.forEach((aiIndexId) => {
      it(`rejects an id with disallowed characters ${aiIndexId}`, () => {
        expect(() => validateParams({ aiIndexId })).toThrow(/lowercase letters, numbers, hyphens/);
      });
    });

    it('rejects an empty id', () => {
      expect(() => validateParams({ aiIndexId: '' })).toThrow();
    });
  });
});
