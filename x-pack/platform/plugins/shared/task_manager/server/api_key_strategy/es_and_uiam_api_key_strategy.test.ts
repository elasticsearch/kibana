/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock, loggingSystemMock, savedObjectsClientMock } from '@kbn/core/server/mocks';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { ApiKeyType } from '../config';
import type { ConcreteTaskInstance } from '../task';
import { TaskStatus } from '../task';
import { EsAndUiamApiKeyStrategy } from './es_and_uiam_api_key_strategy';

import { createApiKey, hasApiKey, getApiKeyFromRequest } from '../lib/api_key_utils';

jest.mock('../lib/api_key_utils');
const createApiKeyMock = createApiKey as jest.MockedFunction<typeof createApiKey>;
const hasApiKeyMock = hasApiKey as jest.MockedFunction<typeof hasApiKey>;
const getApiKeyFromRequestMock = getApiKeyFromRequest as jest.MockedFunction<
  typeof getApiKeyFromRequest
>;

const mockTaskInstance = (overrides: Partial<ConcreteTaskInstance> = {}): ConcreteTaskInstance => ({
  id: 'task-1',
  taskType: 'report',
  params: {},
  state: {},
  scheduledAt: new Date(),
  attempts: 0,
  status: TaskStatus.Running,
  runAt: new Date(),
  startedAt: new Date(),
  retryAt: null,
  ownerId: null,
  ...overrides,
});

describe('EsAndUiamApiKeyStrategy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createStrategy = (typeToUse: ApiKeyType = ApiKeyType.UIAM) => {
    const coreStart = coreMock.createStart();
    const logger = loggingSystemMock.createLogger();
    const mockUiam = {
      grant: jest.fn(),
      invalidate: jest.fn(),
      convert: jest.fn(),
    };
    coreStart.security.authc.apiKeys.uiam = mockUiam as never;

    const strategy = new EsAndUiamApiKeyStrategy(typeToUse, coreStart.security, logger);
    return { strategy, coreStart, mockUiam, logger };
  };

  test('shouldGrantUiam is true', () => {
    const { strategy } = createStrategy();
    expect(strategy.shouldGrantUiam).toBe(true);
  });

  test('typeToUse reflects the config value', () => {
    const { strategy: uiamStrategy } = createStrategy(ApiKeyType.UIAM);
    expect(uiamStrategy.typeToUse).toBe(ApiKeyType.UIAM);

    const { strategy: esStrategy } = createStrategy(ApiKeyType.ES);
    expect(esStrategy.typeToUse).toBe(ApiKeyType.ES);
  });

  describe('getApiKeyForFakeRequest', () => {
    test('returns uiamApiKey when typeToUse is UIAM and uiamApiKey exists', () => {
      const { strategy } = createStrategy(ApiKeyType.UIAM);
      const task = mockTaskInstance({ apiKey: 'es-key', uiamApiKey: 'essu_uiam-key' });

      expect(strategy.getApiKeyForFakeRequest(task)).toBe('essu_uiam-key');
    });

    test('falls back to apiKey and warns when typeToUse is UIAM but uiamApiKey is missing and apiKeyCreatedByUser is false', () => {
      const { strategy, logger } = createStrategy(ApiKeyType.UIAM);
      const task = mockTaskInstance({
        apiKey: 'es-key',
        userScope: {
          apiKeyId: 'es-key-id',
          apiKeyCreatedByUser: false,
          spaceId: 'default',
        },
      });

      expect(strategy.getApiKeyForFakeRequest(task)).toBe('es-key');
      expect(logger.warn).toHaveBeenCalledWith(
        'UIAM API key is not provided to create a fake request, falling back to regular API key.',
        expect.objectContaining({ tags: expect.any(Array) })
      );
      expect(logger.debug).not.toHaveBeenCalled();
    });

    test('falls back to apiKey and warns when typeToUse is UIAM but uiamApiKey is missing and userScope is absent', () => {
      const { strategy, logger } = createStrategy(ApiKeyType.UIAM);
      const task = mockTaskInstance({ apiKey: 'es-key' });

      expect(strategy.getApiKeyForFakeRequest(task)).toBe('es-key');
      expect(logger.warn).toHaveBeenCalledWith(
        'UIAM API key is not provided to create a fake request, falling back to regular API key.',
        expect.objectContaining({ tags: expect.any(Array) })
      );
      expect(logger.debug).not.toHaveBeenCalled();
    });

    test('falls back to apiKey with a debug log when uiamApiKey is missing but apiKeyCreatedByUser is true', () => {
      const { strategy, logger } = createStrategy(ApiKeyType.UIAM);
      const task = mockTaskInstance({
        apiKey: 'es-key',
        userScope: {
          apiKeyId: 'es-key-id',
          apiKeyCreatedByUser: true,
          spaceId: 'default',
        },
      });

      expect(strategy.getApiKeyForFakeRequest(task)).toBe('es-key');
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'UIAM API key is not provided to create a fake request, falling back to ES API key created by the user.',
        expect.objectContaining({ tags: expect.any(Array) })
      );
    });

    test('returns apiKey when typeToUse is ES even if uiamApiKey exists', () => {
      const { strategy, logger } = createStrategy(ApiKeyType.ES);
      const task = mockTaskInstance({ apiKey: 'es-key', uiamApiKey: 'essu_uiam-key' });

      expect(strategy.getApiKeyForFakeRequest(task)).toBe('es-key');
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
    });

    test('returns undefined and does not log when task has no keys', () => {
      const { strategy, logger } = createStrategy(ApiKeyType.UIAM);
      const task = mockTaskInstance();

      expect(strategy.getApiKeyForFakeRequest(task)).toBeUndefined();
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
    });
  });

  describe('getApiKeyIdsForInvalidation', () => {
    test('returns both ES and UIAM targets when both exist', () => {
      const { strategy } = createStrategy();
      const task = mockTaskInstance({
        apiKey: 'es-key',
        uiamApiKey: 'essu_uiam-key',
        userScope: {
          apiKeyId: 'es-key-id',
          uiamApiKeyId: 'uiam-key-id',
          spaceId: 'default',
          apiKeyCreatedByUser: false,
        },
      });

      expect(strategy.getApiKeyIdsForInvalidation(task)).toEqual([
        { apiKeyId: 'es-key-id' },
        { apiKeyId: 'uiam-key-id', uiamApiKey: 'essu_uiam-key' },
      ]);
    });

    test('returns only ES target when UIAM key is missing', () => {
      const { strategy } = createStrategy();
      const task = mockTaskInstance({
        apiKey: 'es-key',
        userScope: {
          apiKeyId: 'es-key-id',
          spaceId: 'default',
          apiKeyCreatedByUser: false,
        },
      });

      expect(strategy.getApiKeyIdsForInvalidation(task)).toEqual([{ apiKeyId: 'es-key-id' }]);
    });

    test('returns empty array when userScope is missing', () => {
      const { strategy } = createStrategy();
      const task = mockTaskInstance({ apiKey: 'es-key' });

      expect(strategy.getApiKeyIdsForInvalidation(task)).toEqual([]);
    });

    test('returns empty array when apiKeyCreatedByUser is true', () => {
      const { strategy } = createStrategy();
      const task = mockTaskInstance({
        apiKey: 'es-key',
        uiamApiKey: 'essu_uiam-key',
        userScope: {
          apiKeyId: 'es-key-id',
          uiamApiKeyId: 'uiam-key-id',
          spaceId: 'default',
          apiKeyCreatedByUser: true,
        },
      });

      expect(strategy.getApiKeyIdsForInvalidation(task)).toEqual([]);
    });

    test('returns only ES target when uiamApiKeyId exists but uiamApiKey is missing', () => {
      const { strategy } = createStrategy();
      const task = mockTaskInstance({
        apiKey: 'es-key',
        userScope: {
          apiKeyId: 'es-key-id',
          uiamApiKeyId: 'uiam-key-id',
          spaceId: 'default',
          apiKeyCreatedByUser: false,
        },
      });

      expect(strategy.getApiKeyIdsForInvalidation(task)).toEqual([{ apiKeyId: 'es-key-id' }]);
    });
  });

  describe('grantApiKeys', () => {
    test('grants both ES and UIAM keys when request has UIAM credential', async () => {
      const { strategy, coreStart, mockUiam } = createStrategy();
      const request = httpServerMock.createKibanaRequest({
        headers: { authorization: 'ApiKey essu_uiam-credential' },
      });

      const esKeyMap = new Map();
      esKeyMap.set('task-1', {
        apiKey: Buffer.from('esId:esSecret').toString('base64'),
        apiKeyId: 'esId',
      });
      createApiKeyMock.mockResolvedValueOnce(esKeyMap);
      hasApiKeyMock.mockReturnValue(false);
      (coreStart.security.authc.getCurrentUser as jest.Mock).mockReturnValue({
        username: 'testuser',
        profile_uid: 'u_profile_123',
      });

      mockUiam.grant.mockResolvedValueOnce({
        id: 'uiamId',
        name: 'test',
        api_key: 'essu_uiam-secret',
      });

      const tasks = [{ id: 'task-1', taskType: 'report', params: {}, state: {} }];
      const result = await strategy.grantApiKeys(tasks, request, coreStart.security);

      const fields = result.get('task-1');
      expect(fields?.apiKey).toBe(Buffer.from('esId:esSecret').toString('base64'));
      expect(fields?.uiamApiKey).toBe('essu_uiam-secret');
      expect(fields?.userScope.apiKeyId).toBe('esId');
      expect(fields?.userScope.uiamApiKeyId).toBe('uiamId');
      expect(fields?.userScope.userProfileId).toBe('u_profile_123');
    });

    test('persists userProfileId resolved from the request on userScope', async () => {
      const { strategy, coreStart } = createStrategy();
      const request = httpServerMock.createKibanaRequest();

      const esKeyMap = new Map();
      esKeyMap.set('task-1', {
        apiKey: Buffer.from('esId:esSecret').toString('base64'),
        apiKeyId: 'esId',
      });
      createApiKeyMock.mockResolvedValueOnce(esKeyMap);
      hasApiKeyMock.mockReturnValue(true);
      getApiKeyFromRequestMock.mockReturnValue({
        id: 'uiam-req-id',
        api_key: 'essu_from-request',
      });
      (coreStart.security.authc.getCurrentUser as jest.Mock).mockReturnValue({
        username: 'testuser',
        profile_uid: 'u_profile_456',
      });

      const tasks = [{ id: 'task-1', taskType: 'report', params: {}, state: {} }];
      const result = await strategy.grantApiKeys(tasks, request, coreStart.security);

      expect(result.get('task-1')?.userScope.userProfileId).toBe('u_profile_456');
    });

    test('leaves userProfileId undefined when the resolved user has no profile_uid', async () => {
      const { strategy, coreStart } = createStrategy();
      const request = httpServerMock.createKibanaRequest();

      const esKeyMap = new Map();
      esKeyMap.set('task-1', {
        apiKey: Buffer.from('esId:esSecret').toString('base64'),
        apiKeyId: 'esId',
      });
      createApiKeyMock.mockResolvedValueOnce(esKeyMap);
      hasApiKeyMock.mockReturnValue(false);
      (coreStart.security.authc.getCurrentUser as jest.Mock).mockReturnValue({
        username: 'testuser',
      });

      const tasks = [{ id: 'task-1', taskType: 'report', params: {}, state: {} }];
      const result = await strategy.grantApiKeys(tasks, request, coreStart.security);

      expect(result.get('task-1')?.userScope.userProfileId).toBeUndefined();
    });

    test('skips UIAM grant when opts.onEsKey is true', async () => {
      const { strategy, coreStart, mockUiam } = createStrategy();
      const request = httpServerMock.createKibanaRequest({
        headers: { authorization: 'ApiKey essu_uiam-credential' },
      });

      const esKeyMap = new Map();
      esKeyMap.set('task-1', {
        apiKey: Buffer.from('esId:esSecret').toString('base64'),
        apiKeyId: 'esId',
      });
      createApiKeyMock.mockResolvedValueOnce(esKeyMap);
      hasApiKeyMock.mockReturnValue(false);
      (coreStart.security.authc.getCurrentUser as jest.Mock).mockReturnValue({
        username: 'testuser',
      });

      const tasks = [{ id: 'task-1', taskType: 'report', params: {}, state: {} }];
      const result = await strategy.grantApiKeys(tasks, request, coreStart.security, {
        onEsKey: true,
      });

      const fields = result.get('task-1');
      expect(fields?.apiKey).toBe(Buffer.from('esId:esSecret').toString('base64'));
      expect(fields?.uiamApiKey).toBeUndefined();
      expect(fields?.userScope.uiamApiKeyId).toBeUndefined();
      expect(mockUiam.grant).not.toHaveBeenCalled();
    });

    test('grants only ES keys when request credential is not UIAM-compatible', async () => {
      const { strategy, coreStart, mockUiam, logger } = createStrategy();
      const request = httpServerMock.createKibanaRequest({
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });

      const esKeyMap = new Map();
      esKeyMap.set('task-1', {
        apiKey: Buffer.from('esId:esSecret').toString('base64'),
        apiKeyId: 'esId',
      });
      createApiKeyMock.mockResolvedValueOnce(esKeyMap);
      hasApiKeyMock.mockReturnValue(false);

      const tasks = [{ id: 'task-1', taskType: 'report', params: {}, state: {} }];
      const result = await strategy.grantApiKeys(tasks, request, coreStart.security);

      const fields = result.get('task-1');
      expect(fields?.apiKey).toBe(Buffer.from('esId:esSecret').toString('base64'));
      expect(fields?.uiamApiKey).toBeUndefined();
      expect(fields?.userScope.uiamApiKeyId).toBeUndefined();
      expect(mockUiam.grant).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'Request credential is not UIAM-compatible, skipping UIAM API key grant. Only ES API keys will be used.',
        { tags: ['serverless', 'task-manager', 'uiam', 'uiam-api-key-invalid-credentials'] }
      );
    });

    test('extracts UIAM key from request when user provides UIAM credential', async () => {
      const { strategy, coreStart } = createStrategy();
      const request = httpServerMock.createKibanaRequest();

      const esKeyMap = new Map();
      esKeyMap.set('task-1', {
        apiKey: Buffer.from('esId:esSecret').toString('base64'),
        apiKeyId: 'esId',
      });
      createApiKeyMock.mockResolvedValueOnce(esKeyMap);
      hasApiKeyMock.mockReturnValue(true);
      getApiKeyFromRequestMock.mockReturnValue({
        id: 'uiam-req-id',
        api_key: 'essu_from-request',
      });

      const tasks = [{ id: 'task-1', taskType: 'report', params: {}, state: {} }];
      const result = await strategy.grantApiKeys(tasks, request, coreStart.security);

      const fields = result.get('task-1');
      expect(fields?.uiamApiKey).toBe('essu_from-request');
      expect(fields?.userScope.uiamApiKeyId).toBe('uiam-req-id');
    });

    test('does not set uiamApiKey when request has non-UIAM api key', async () => {
      const { strategy, coreStart } = createStrategy();
      const request = httpServerMock.createKibanaRequest();

      const esKeyMap = new Map();
      esKeyMap.set('task-1', {
        apiKey: Buffer.from('esId:esSecret').toString('base64'),
        apiKeyId: 'esId',
      });
      createApiKeyMock.mockResolvedValueOnce(esKeyMap);
      hasApiKeyMock.mockReturnValue(true);
      getApiKeyFromRequestMock.mockReturnValue({
        id: 'es-req-id',
        api_key: 'regular-es-secret',
      });

      const tasks = [{ id: 'task-1', taskType: 'report', params: {}, state: {} }];
      const result = await strategy.grantApiKeys(tasks, request, coreStart.security);

      const fields = result.get('task-1');
      expect(fields?.uiamApiKey).toBeUndefined();
      expect(fields?.userScope.uiamApiKeyId).toBeUndefined();
    });
  });

  describe('markForInvalidation', () => {
    test('creates invalidation SOs with uiamApiKey for UIAM targets', async () => {
      const { strategy } = createStrategy();
      const logger = loggingSystemMock.createLogger();
      const soClient = savedObjectsClientMock.create();

      await strategy.markForInvalidation(
        [{ apiKeyId: 'es-key-id' }, { apiKeyId: 'uiam-key-id', uiamApiKey: 'essu_uiam-key' }],
        logger,
        soClient
      );

      expect(soClient.bulkCreate).toHaveBeenCalledWith([
        {
          attributes: { apiKeyId: 'es-key-id', createdAt: expect.any(String) },
          type: 'api_key_to_invalidate',
        },
        {
          attributes: {
            apiKeyId: 'uiam-key-id',
            createdAt: expect.any(String),
            uiamApiKey: 'essu_uiam-key',
          },
          type: 'api_key_to_invalidate',
        },
      ]);
    });
  });
});
