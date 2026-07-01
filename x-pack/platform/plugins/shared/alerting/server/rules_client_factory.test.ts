/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RulesClientFactoryOpts } from './rules_client_factory';
import { RulesClientFactory } from './rules_client_factory';
import { ruleTypeRegistryMock } from './rule_type_registry.mock';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import {
  savedObjectsClientMock,
  savedObjectsServiceMock,
  loggingSystemMock,
  savedObjectsRepositoryMock,
  uiSettingsServiceMock,
  securityServiceMock,
  coreFeatureFlagsMock,
} from '@kbn/core/server/mocks';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import type { AuthenticatedUser } from '@kbn/security-plugin/common';
import { securityMock } from '@kbn/security-plugin/server/mocks';
import type { PluginStartContract as ActionsStartContract } from '@kbn/actions-plugin/server';
import { actionsMock, actionsAuthorizationMock } from '@kbn/actions-plugin/server/mocks';
import { eventLogMock } from '@kbn/event-log-plugin/server/mocks';
import { alertingAuthorizationMock } from './authorization/alerting_authorization.mock';
import { alertingAuthorizationClientFactoryMock } from './alerting_authorization_client_factory.mock';
import type { AlertingAuthorization } from './authorization';
import type { AlertingAuthorizationClientFactory } from './alerting_authorization_client_factory';
import { SECURITY_EXTENSION_ID } from '@kbn/core-saved-objects-server';
import { mockRouter } from '@kbn/core-http-router-server-mocks';
import {
  AD_HOC_RUN_SAVED_OBJECT_TYPE,
  API_KEY_PENDING_INVALIDATION_TYPE,
  RULE_SAVED_OBJECT_TYPE,
  RULE_TEMPLATE_SAVED_OBJECT_TYPE,
  GAP_AUTO_FILL_SCHEDULER_SAVED_OBJECT_TYPE,
} from './saved_objects';
import { backfillClientMock } from './backfill_client/backfill_client.mock';
import { ConnectorAdapterRegistry } from './connector_adapters/connector_adapter_registry';
import type { SavedObjectsClientContract } from '@kbn/core/server';
import type { SecurityStartMock } from '@kbn/core-security-server-mocks';
import type { ActionsAuthorizationMock } from '@kbn/actions-plugin/server/authorization/actions_authorization.mock';
import type { BackfillClient } from './backfill_client/backfill_client';

let savedObjectsClient: jest.Mocked<SavedObjectsClientContract>;
let savedObjectsService: ReturnType<typeof savedObjectsServiceMock.createInternalStartContract>;
let securityPluginSetup: ReturnType<typeof securityMock.createSetup>;
let securityPluginStart: ReturnType<typeof securityMock.createStart>;
let securityService: SecurityStartMock;
let alertingAuthorization: ReturnType<typeof alertingAuthorizationMock.create>;

let rulesClientFactoryParams: jest.Mocked<RulesClientFactoryOpts>;
let alertingAuthorizationClientFactory: ReturnType<
  typeof alertingAuthorizationClientFactoryMock.createFactory
>;

let actionsAuthorization: ActionsAuthorizationMock;
let backfillClient: jest.Mocked<BackfillClient>;
let scopedChangeTrackingService: {
  log: jest.Mock;
  logBulk: jest.Mock;
  getHistory: jest.Mock;
};

jest.mock('./rules_client');
jest.mock('./authorization/alerting_authorization');

describe('RulesClientFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    savedObjectsClient = savedObjectsClientMock.create();
    savedObjectsClient.asScopedToNamespace = jest.fn().mockReturnValue(savedObjectsClient);
    savedObjectsService = savedObjectsServiceMock.createInternalStartContract();

    securityPluginSetup = securityMock.createSetup();

    securityPluginStart = securityMock.createStart();

    securityService = securityServiceMock.createStart();

    alertingAuthorization = alertingAuthorizationMock.create();

    alertingAuthorizationClientFactory = alertingAuthorizationClientFactoryMock.createFactory();

    actionsAuthorization = actionsAuthorizationMock.create();

    const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();
    backfillClient = backfillClientMock.create();
    scopedChangeTrackingService = {
      log: jest.fn(),
      logBulk: jest.fn(),
      getHistory: jest.fn(),
    };

    rulesClientFactoryParams = {
      logger: loggingSystemMock.create().get(),
      taskManager: taskManagerMock.createStart(),
      ruleTypeRegistry: ruleTypeRegistryMock.create(),
      getSpaceId: jest.fn(),
      spaceIdToNamespace: jest.fn(),
      maxScheduledPerMinute: 10000,
      minimumScheduleInterval: { value: '1m', enforce: false },
      internalSavedObjectsRepository,
      encryptedSavedObjectsClient: encryptedSavedObjectsMock.createClient(),
      actions: actionsMock.createStart(),
      eventLog: eventLogMock.createStart(),
      changeTrackingService: {
        asScoped: jest.fn().mockReturnValue(scopedChangeTrackingService),
      },
      kibanaVersion: '7.10.0',
      authorization:
        alertingAuthorizationClientFactory as unknown as AlertingAuthorizationClientFactory,
      backfillClient,
      connectorAdapterRegistry: new ConnectorAdapterRegistry(),
      uiSettings: uiSettingsServiceMock.createStartContract(),
      securityService: securityServiceMock.createStart(),
      getAlertIndicesAlias: jest.fn(),
      alertsService: null,
      shouldGrantUiam: false,
      featureFlags: coreFeatureFlagsMock.createStart(),
      isServerless: false,
    };

    rulesClientFactoryParams.actions = actionsMock.createStart();
    (
      rulesClientFactoryParams.actions as jest.Mocked<ActionsStartContract>
    ).getActionsAuthorizationWithRequest.mockReturnValue(actionsAuthorization);
    rulesClientFactoryParams.getSpaceId.mockReturnValue('default');
    rulesClientFactoryParams.spaceIdToNamespace.mockReturnValue('default');
    rulesClientFactoryParams.uiSettings.asScopedToClient =
      uiSettingsServiceMock.createStartContract().asScopedToClient;
  });

  test('creates a rules client with proper constructor arguments when security is enabled', async () => {
    const factory = new RulesClientFactory();
    const { securityService: _paramSecurity, ...restParams } = rulesClientFactoryParams;
    factory.initialize({
      ...restParams,
      securityPluginSetup,
      securityPluginStart,
      securityService,
    });
    const request = mockRouter.createKibanaRequest();

    savedObjectsService.getScopedClient.mockReturnValue(savedObjectsClient);
    alertingAuthorizationClientFactory.createForSpace.mockResolvedValue(
      alertingAuthorization as unknown as AlertingAuthorization
    );

    await factory.create(request, savedObjectsService);

    expect(savedObjectsService.getScopedClient).toHaveBeenCalledWith(request, {
      excludedExtensions: [SECURITY_EXTENSION_ID],
      includedHiddenTypes: [
        RULE_SAVED_OBJECT_TYPE,
        RULE_TEMPLATE_SAVED_OBJECT_TYPE,
        API_KEY_PENDING_INVALIDATION_TYPE,
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        GAP_AUTO_FILL_SCHEDULER_SAVED_OBJECT_TYPE,
      ],
    });

    expect(alertingAuthorizationClientFactory.createForSpace).toHaveBeenCalledWith(
      request,
      'default'
    );

    expect(
      rulesClientFactoryParams.actions.getActionsAuthorizationWithRequest
    ).toHaveBeenCalledWith(request);

    expect(jest.requireMock('./rules_client').RulesClient).toHaveBeenCalledWith(
      expect.objectContaining({
        auditLogger: {
          enabled: true,
          includeSavedObjectNames: false,
          log: expect.any(Function),
        },
        unsecuredSavedObjectsClient: savedObjectsClient,
        authorization: alertingAuthorization,
        actionsAuthorization,
        logger: rulesClientFactoryParams.logger,
        taskManager: rulesClientFactoryParams.taskManager,
        ruleTypeRegistry: rulesClientFactoryParams.ruleTypeRegistry,
        spaceId: 'default',
        namespace: 'default',
        getUserName: expect.any(Function),
        changeTrackingService: scopedChangeTrackingService,
        getActionsClient: expect.any(Function),
        getEventLogClient: expect.any(Function),
        createAPIKey: expect.any(Function),
        internalSavedObjectsRepository: rulesClientFactoryParams.internalSavedObjectsRepository,
        encryptedSavedObjectsClient: rulesClientFactoryParams.encryptedSavedObjectsClient,
        kibanaVersion: '7.10.0',
        maxScheduledPerMinute: 10000,
        minimumScheduleInterval: { value: '1m', enforce: false },
        isAuthenticationTypeAPIKey: expect.any(Function),
        getAuthenticationAPIKey: expect.any(Function),
        connectorAdapterRegistry: expect.any(ConnectorAdapterRegistry),
        isSystemAction: expect.any(Function),
        getAlertIndicesAlias: expect.any(Function),
        alertsService: null,
        backfillClient,
        uiSettings: rulesClientFactoryParams.uiSettings,
        shouldGrantUiam: false,
      })
    );
  });

  test('creates a rules client without changeTrackingService when omitted', async () => {
    const factory = new RulesClientFactory();
    const { changeTrackingService: _omit, ...paramsWithoutChangeTracking } =
      rulesClientFactoryParams;
    factory.initialize(paramsWithoutChangeTracking);
    const request = mockRouter.createKibanaRequest();

    savedObjectsService.getScopedClient.mockReturnValue(savedObjectsClient);
    alertingAuthorizationClientFactory.createForSpace.mockResolvedValue(
      alertingAuthorization as unknown as AlertingAuthorization
    );

    await factory.create(request, savedObjectsService);

    expect(jest.requireMock('./rules_client').RulesClient).toHaveBeenCalledWith(
      expect.objectContaining({
        changeTrackingService: undefined,
      })
    );
  });

  test('creates a rules client with proper constructor arguments', async () => {
    const factory = new RulesClientFactory();
    factory.initialize(rulesClientFactoryParams);
    const request = mockRouter.createKibanaRequest();

    savedObjectsService.getScopedClient.mockReturnValue(savedObjectsClient);
    alertingAuthorizationClientFactory.createForSpace.mockResolvedValue(
      alertingAuthorization as unknown as AlertingAuthorization
    );

    await factory.create(request, savedObjectsService);

    expect(savedObjectsService.getScopedClient).toHaveBeenCalledWith(request, {
      excludedExtensions: [SECURITY_EXTENSION_ID],
      includedHiddenTypes: [
        RULE_SAVED_OBJECT_TYPE,
        RULE_TEMPLATE_SAVED_OBJECT_TYPE,
        API_KEY_PENDING_INVALIDATION_TYPE,
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        GAP_AUTO_FILL_SCHEDULER_SAVED_OBJECT_TYPE,
      ],
    });

    expect(alertingAuthorizationClientFactory.createForSpace).toHaveBeenCalledWith(
      request,
      'default'
    );

    expect(jest.requireMock('./rules_client').RulesClient).toHaveBeenCalledWith(
      expect.objectContaining({
        unsecuredSavedObjectsClient: savedObjectsClient,
        authorization: alertingAuthorization,
        actionsAuthorization,
        logger: rulesClientFactoryParams.logger,
        taskManager: rulesClientFactoryParams.taskManager,
        ruleTypeRegistry: rulesClientFactoryParams.ruleTypeRegistry,
        spaceId: 'default',
        namespace: 'default',
        getUserName: expect.any(Function),
        changeTrackingService: scopedChangeTrackingService,
        createAPIKey: expect.any(Function),
        internalSavedObjectsRepository: rulesClientFactoryParams.internalSavedObjectsRepository,
        encryptedSavedObjectsClient: rulesClientFactoryParams.encryptedSavedObjectsClient,
        getActionsClient: expect.any(Function),
        getEventLogClient: expect.any(Function),
        kibanaVersion: '7.10.0',
        maxScheduledPerMinute: 10000,
        minimumScheduleInterval: { value: '1m', enforce: false },
        isAuthenticationTypeAPIKey: expect.any(Function),
        getAuthenticationAPIKey: expect.any(Function),
        connectorAdapterRegistry: expect.any(ConnectorAdapterRegistry),
        isSystemAction: expect.any(Function),
        getAlertIndicesAlias: expect.any(Function),
        alertsService: null,
        backfillClient,
        uiSettings: rulesClientFactoryParams.uiSettings,
        shouldGrantUiam: false,
      })
    );
  });

  test('getUserName() returns null when security is disabled', async () => {
    const factory = new RulesClientFactory();
    factory.initialize(rulesClientFactoryParams);
    await factory.create(mockRouter.createKibanaRequest(), savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    const userNameResult = await constructorCall.getUserName();
    expect(userNameResult).toEqual(null);
  });

  test('getUserName() returns a name when security is enabled', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
    });
    await factory.create(mockRouter.createKibanaRequest(), savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    securityService.authc.getCurrentUser.mockReturnValueOnce({
      username: 'bob',
    } as unknown as AuthenticatedUser);
    const userNameResult = await constructorCall.getUserName();
    expect(userNameResult).toEqual('bob');
  });

  test('getActionsClient() returns ActionsClient', async () => {
    const factory = new RulesClientFactory();
    factory.initialize(rulesClientFactoryParams);
    await factory.create(mockRouter.createKibanaRequest(), savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    const actionsClient = await constructorCall.getActionsClient();
    expect(actionsClient).not.toBe(null);
  });

  test('createAPIKey() returns { apiKeysEnabled: false } when security is disabled', async () => {
    const factory = new RulesClientFactory();
    factory.initialize(rulesClientFactoryParams);
    await factory.create(mockRouter.createKibanaRequest(), savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    const createAPIKeyResult = await constructorCall.createAPIKey('test');
    expect(createAPIKeyResult).toEqual({ apiKeysEnabled: false });
  });

  test('createAPIKey() returns { apiKeysEnabled: false } when security is enabled but ES security is disabled', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityPluginStart,
      securityService,
    });
    await factory.create(mockRouter.createKibanaRequest(), savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    securityService.authc.apiKeys.grantAsInternalUser.mockResolvedValueOnce(null);
    const createAPIKeyResult = await constructorCall.createAPIKey('test');
    expect(createAPIKeyResult).toEqual({ apiKeysEnabled: false });
  });

  test('createAPIKey() invalidates UIAM API key when ES API key creation returns null', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
      shouldGrantUiam: true,
    });
    const requestWithUiam = mockRouter.createKibanaRequest({
      headers: { authorization: 'ApiKey essu_uiam_api_key' },
    });
    await factory.create(requestWithUiam, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    const uiamApiKeys = {
      grant: jest.fn().mockResolvedValueOnce({
        api_key: 'uiam-key',
        id: 'uiam-id',
        name: 'uiam-name',
      }),
      invalidate: jest.fn().mockResolvedValueOnce({}),
    };
    securityService.authc.apiKeys.uiam = uiamApiKeys as never;
    securityService.authc.apiKeys.grantAsInternalUser.mockResolvedValueOnce(null);

    const createAPIKeyResult = await constructorCall.createAPIKey('test');

    expect(createAPIKeyResult).toEqual({ apiKeysEnabled: false });
    expect(uiamApiKeys.grant).toHaveBeenCalledWith(expect.any(Object), {
      name: 'uiam-test',
    });
    expect(uiamApiKeys.invalidate).toHaveBeenCalledWith(expect.any(Object), {
      id: 'uiam-id',
    });
  });

  test('createAPIKey() returns { apiKeysEnabled: false } when UIAM grant returns null and ES grant returns null', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
      shouldGrantUiam: true,
    });
    const requestWithUiam = mockRouter.createKibanaRequest({
      headers: { authorization: 'ApiKey essu_uiam_api_key' },
    });
    await factory.create(requestWithUiam, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    const uiamApiKeys = {
      grant: jest.fn().mockResolvedValueOnce(null),
      invalidate: jest.fn(),
    };
    securityService.authc.apiKeys.uiam = uiamApiKeys as never;
    securityService.authc.apiKeys.grantAsInternalUser.mockResolvedValueOnce(null);

    const createAPIKeyResult = await constructorCall.createAPIKey('test');

    expect(createAPIKeyResult).toEqual({ apiKeysEnabled: false });
    expect(uiamApiKeys.grant).toHaveBeenCalledWith(expect.any(Object), {
      name: 'uiam-test',
    });
    expect(securityService.authc.apiKeys.grantAsInternalUser).toHaveBeenCalled();
    expect(uiamApiKeys.invalidate).not.toHaveBeenCalled();
  });

  test('createAPIKey() logs an error and returns ES API key when uiam.grant returns null but grantAsInternalUser succeeds', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
      shouldGrantUiam: true,
    });
    const requestWithUiam = mockRouter.createKibanaRequest({
      headers: { authorization: 'ApiKey essu_uiam_api_key' },
    });
    await factory.create(requestWithUiam, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    const uiamApiKeys = {
      grant: jest.fn().mockResolvedValueOnce(null),
      invalidate: jest.fn(),
    };
    securityService.authc.apiKeys.uiam = uiamApiKeys as never;
    securityService.authc.apiKeys.grantAsInternalUser.mockResolvedValueOnce({
      api_key: '123',
      id: 'abc',
      name: '',
    });

    const createAPIKeyResult = await constructorCall.createAPIKey('test');

    expect(createAPIKeyResult).toEqual({
      apiKeysEnabled: true,
      result: { api_key: '123', id: 'abc', name: '' },
    });
    expect(createAPIKeyResult).not.toHaveProperty('uiamResult');
    expect(rulesClientFactoryParams.logger.error).toHaveBeenCalledWith(
      'Failed to create UIAM API key for alerting rule : test',
      expect.objectContaining({ tags: expect.any(Array) })
    );
    expect(uiamApiKeys.grant).toHaveBeenCalledWith(expect.any(Object), {
      name: 'uiam-test',
    });
  });

  test('createAPIKey() logs an error and returns ES API key when uiam.grant throws but grantAsInternalUser succeeds', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
      shouldGrantUiam: true,
    });
    const requestWithUiam = mockRouter.createKibanaRequest({
      headers: { authorization: 'ApiKey essu_uiam_api_key' },
    });
    await factory.create(requestWithUiam, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    const uiamError = new Error('UIAM service unavailable');
    const uiamApiKeys = {
      grant: jest.fn().mockRejectedValueOnce(uiamError),
      invalidate: jest.fn(),
    };
    securityService.authc.apiKeys.uiam = uiamApiKeys as never;
    securityService.authc.apiKeys.grantAsInternalUser.mockResolvedValueOnce({
      api_key: '123',
      id: 'abc',
      name: '',
    });

    const createAPIKeyResult = await constructorCall.createAPIKey('test');

    expect(createAPIKeyResult).toEqual({
      apiKeysEnabled: true,
      result: { api_key: '123', id: 'abc', name: '' },
    });
    expect(createAPIKeyResult).not.toHaveProperty('uiamResult');
    expect(rulesClientFactoryParams.logger.error).toHaveBeenCalledWith(
      'Failed to create UIAM API key for alerting rule : test: UIAM service unavailable',
      expect.objectContaining({
        tags: expect.any(Array),
        error: expect.objectContaining({ stack_trace: uiamError.stack }),
      })
    );
    expect(uiamApiKeys.grant).toHaveBeenCalledWith(expect.any(Object), {
      name: 'uiam-test',
    });
  });

  test('createAPIKey() logs an error and does not call uiam.grant when shouldGrantUiam is true but request has no authorization header', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
      shouldGrantUiam: true,
    });
    const requestWithoutAuth = mockRouter.createKibanaRequest();
    await factory.create(requestWithoutAuth, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    const uiamApiKeys = {
      grant: jest.fn(),
      invalidate: jest.fn(),
    };
    securityService.authc.apiKeys.uiam = uiamApiKeys as never;
    securityService.authc.apiKeys.grantAsInternalUser.mockResolvedValueOnce({
      api_key: '123',
      id: 'abc',
      name: '',
    });

    const createAPIKeyResult = await constructorCall.createAPIKey('test');

    expect(createAPIKeyResult).toEqual({
      apiKeysEnabled: true,
      result: { api_key: '123', id: 'abc', name: '' },
    });
    expect(createAPIKeyResult).not.toHaveProperty('uiamResult');
    expect(rulesClientFactoryParams.logger.error).toHaveBeenCalledWith(
      'Failed to create UIAM API key for alerting rule : test: Invalid or missing UIAM credentials',
      expect.objectContaining({ tags: expect.any(Array) })
    );
    expect(uiamApiKeys.grant).not.toHaveBeenCalled();
  });

  test('createAPIKey() logs an error and does not call uiam.grant when shouldGrantUiam is true but request has non-UIAM credentials', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
      shouldGrantUiam: true,
    });
    const requestWithNonUiamAuth = mockRouter.createKibanaRequest({
      headers: {
        authorization: `ApiKey ${Buffer.from('id:regular_es_api_key').toString('base64')}`,
      },
    });
    await factory.create(requestWithNonUiamAuth, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    const uiamApiKeys = {
      grant: jest.fn(),
      invalidate: jest.fn(),
    };
    securityService.authc.apiKeys.uiam = uiamApiKeys as never;
    securityService.authc.apiKeys.grantAsInternalUser.mockResolvedValueOnce({
      api_key: '123',
      id: 'abc',
      name: '',
    });

    const createAPIKeyResult = await constructorCall.createAPIKey('test');

    expect(createAPIKeyResult).toEqual({
      apiKeysEnabled: true,
      result: { api_key: '123', id: 'abc', name: '' },
    });
    expect(createAPIKeyResult).not.toHaveProperty('uiamResult');
    expect(rulesClientFactoryParams.logger.error).toHaveBeenCalledWith(
      'Failed to create UIAM API key for alerting rule : test: Invalid or missing UIAM credentials',
      expect.objectContaining({ tags: expect.any(Array) })
    );
    expect(uiamApiKeys.grant).not.toHaveBeenCalled();
  });

  test('createAPIKey() returns an API key when security is enabled and grantAsInternalUser succeeds', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
    });
    await factory.create(mockRouter.createKibanaRequest(), savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    securityService.authc.apiKeys.grantAsInternalUser.mockResolvedValueOnce({
      api_key: '123',
      id: 'abc',
      name: '',
    });
    const createAPIKeyResult = await constructorCall.createAPIKey('test');
    expect(createAPIKeyResult).toEqual({
      apiKeysEnabled: true,
      result: { api_key: '123', id: 'abc', name: '' },
    });
    expect(securityService.authc.apiKeys.grantAsInternalUser).toHaveBeenCalledWith(
      expect.any(Object),
      {
        metadata: { managed: true, kibana: { type: 'alerting_rule' } },
        name: 'test',
        role_descriptors: {},
      }
    );
  });

  test('createAPIKey() throws when grantAsInternalUser throws an error', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
    });
    await factory.create(mockRouter.createKibanaRequest(), savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    securityService.authc.apiKeys.grantAsInternalUser.mockRejectedValueOnce(
      new Error('TLS disabled')
    );
    await expect(constructorCall.createAPIKey('test')).rejects.toThrowErrorMatchingInlineSnapshot(
      `"TLS disabled"`
    );
  });

  test('createAPIKey() invalidates UIAM API key when ES API key creation throws', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
      shouldGrantUiam: true,
    });
    const requestWithUiam = mockRouter.createKibanaRequest({
      headers: { authorization: 'ApiKey essu_uiam_api_key' },
    });
    await factory.create(requestWithUiam, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    const uiamApiKeys = {
      grant: jest.fn().mockResolvedValueOnce({
        api_key: 'uiam-key',
        id: 'uiam-id',
        name: 'uiam-name',
      }),
      invalidate: jest.fn().mockResolvedValueOnce({
        invalidated_api_keys: [{ id: 'uiam-id', invalidated: true }],
        previously_invalidated_api_keys: [],
        error_count: 0,
        error_details: [],
      }),
    };
    securityService.authc.apiKeys.uiam = uiamApiKeys as never;
    securityService.authc.apiKeys.grantAsInternalUser.mockRejectedValueOnce(
      new Error('TLS disabled')
    );

    await expect(constructorCall.createAPIKey('test')).rejects.toThrowErrorMatchingInlineSnapshot(
      `"TLS disabled"`
    );
    expect(uiamApiKeys.invalidate).toHaveBeenCalledWith(expect.any(Object), {
      id: 'uiam-id',
    });
  });

  test('create() calls getSpaceId to derive spaceId from request', async () => {
    const factory = new RulesClientFactory();
    factory.initialize(rulesClientFactoryParams);
    const request = mockRouter.createKibanaRequest();

    savedObjectsService.getScopedClient.mockReturnValue(savedObjectsClient);
    alertingAuthorizationClientFactory.createForSpace.mockResolvedValue(
      alertingAuthorization as unknown as AlertingAuthorization
    );

    await factory.create(request, savedObjectsService);

    expect(rulesClientFactoryParams.getSpaceId).toHaveBeenCalledWith(request);
    expect(alertingAuthorizationClientFactory.createForSpace).toHaveBeenCalledWith(
      request,
      'default'
    );
  });

  test('createWithSpaceId() uses the provided spaceId instead of deriving from request', async () => {
    const factory = new RulesClientFactory();
    factory.initialize(rulesClientFactoryParams);
    const request = mockRouter.createKibanaRequest();

    savedObjectsService.getScopedClient.mockReturnValue(savedObjectsClient);
    alertingAuthorizationClientFactory.createForSpace.mockResolvedValue(
      alertingAuthorization as unknown as AlertingAuthorization
    );

    await factory.createWithSpaceId(request, savedObjectsService, 'custom-space');

    // getSpaceId should NOT be called when using createWithSpaceId
    expect(rulesClientFactoryParams.getSpaceId).not.toHaveBeenCalled();

    // createForSpace should be called with the provided spaceId
    expect(alertingAuthorizationClientFactory.createForSpace).toHaveBeenCalledWith(
      request,
      'custom-space'
    );

    // Saved objects client should be scoped to the custom namespace
    expect(savedObjectsClient.asScopedToNamespace).toHaveBeenCalledWith('custom-space');

    // RulesClient should be created with the custom spaceId
    expect(jest.requireMock('./rules_client').RulesClient).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'custom-space',
      })
    );
  });

  test('create() uses request-derived client methods for actions and event log', async () => {
    const factory = new RulesClientFactory();
    factory.initialize(rulesClientFactoryParams);
    const request = mockRouter.createKibanaRequest();

    savedObjectsService.getScopedClient.mockReturnValue(savedObjectsClient);
    alertingAuthorizationClientFactory.createForSpace.mockResolvedValue(
      alertingAuthorization as unknown as AlertingAuthorization
    );

    await factory.create(request, savedObjectsService);

    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    // Call getActionsClient and verify it uses the request-derived method
    await constructorCall.getActionsClient();
    expect(rulesClientFactoryParams.actions.getActionsClientWithRequest).toHaveBeenCalledWith(
      request
    );
    expect(
      rulesClientFactoryParams.actions.getActionsClientWithRequestInSpace
    ).not.toHaveBeenCalled();

    // Call getEventLogClient and verify it uses the request-derived method
    await constructorCall.getEventLogClient();
    expect(rulesClientFactoryParams.eventLog.getClient).toHaveBeenCalledWith(request);
    expect(rulesClientFactoryParams.eventLog.getClientWithRequestInSpace).not.toHaveBeenCalled();
  });

  test('createWithSpaceId() uses space-scoped client methods for actions and event log', async () => {
    const factory = new RulesClientFactory();
    factory.initialize(rulesClientFactoryParams);
    const request = mockRouter.createKibanaRequest();

    savedObjectsService.getScopedClient.mockReturnValue(savedObjectsClient);
    alertingAuthorizationClientFactory.createForSpace.mockResolvedValue(
      alertingAuthorization as unknown as AlertingAuthorization
    );

    await factory.createWithSpaceId(request, savedObjectsService, 'custom-space');

    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    // Call getActionsClient and verify it uses the space-scoped method
    await constructorCall.getActionsClient();
    expect(
      rulesClientFactoryParams.actions.getActionsClientWithRequestInSpace
    ).toHaveBeenCalledWith(request, 'custom-space');
    expect(rulesClientFactoryParams.actions.getActionsClientWithRequest).not.toHaveBeenCalled();

    // Call getEventLogClient and verify it uses the space-scoped method
    await constructorCall.getEventLogClient();
    expect(rulesClientFactoryParams.eventLog.getClientWithRequestInSpace).toHaveBeenCalledWith(
      request,
      'custom-space'
    );
    expect(rulesClientFactoryParams.eventLog.getClient).not.toHaveBeenCalled();
  });

  test('getAuthenticationAPIKey() throws when a UIAM API key is used in a non-serverless environment', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
      shouldGrantUiam: false,
    });

    const request = mockRouter.createKibanaRequest({
      headers: {
        authorization: `ApiKey ${Buffer.from('id:essu_uiam_api_key').toString('base64')}`,
      },
    });

    await factory.create(request, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    expect(() =>
      constructorCall.getAuthenticationAPIKey('test')
    ).toThrowErrorMatchingInlineSnapshot(
      `"UIAM API keys should only be used in serverless environments"`
    );
  });

  test('getAuthenticationAPIKey() throws when API key credentials cannot be parsed from the request', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
      shouldGrantUiam: false,
    });

    const request = mockRouter.createKibanaRequest({
      headers: {
        authorization: `ApiKey a-broken-api-key`,
      },
    });

    await factory.create(request, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    expect(() =>
      constructorCall.getAuthenticationAPIKey('test')
    ).toThrowErrorMatchingInlineSnapshot(
      `"Failed to parse API key credentials from authorization header for alerting rule : test"`
    );
  });

  test('cloneAPIKey is always defined on the context', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
    });

    const request = mockRouter.createKibanaRequest();
    await factory.create(request, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    expect(constructorCall.cloneAPIKey).toEqual(expect.any(Function));
  });

  test('cloneApiKeysOnCreate is false when option is not set', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
    });

    const request = mockRouter.createKibanaRequest();
    await factory.create(request, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    expect(constructorCall.cloneApiKeysOnCreate).toBe(false);
  });

  test('cloneApiKeysOnCreate is true when option is true', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
    });

    const request = mockRouter.createKibanaRequest();
    await factory.create(request, savedObjectsService, { cloneApiKeysOnCreate: true });
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    expect(constructorCall.cloneApiKeysOnCreate).toBe(true);
  });

  test('cloneAPIKey calls cloneAsInternalUser and returns the result', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
    });

    securityService.authc.apiKeys.cloneAsInternalUser.mockResolvedValueOnce({
      id: 'cloned-id',
      name: 'test-rule-key',
      api_key: 'cloned-secret',
      encoded: 'encoded-value',
    });

    const apiKeyCredentials = Buffer.from('key-id:key-secret').toString('base64');
    const request = mockRouter.createKibanaRequest({
      headers: { authorization: `ApiKey ${apiKeyCredentials}` },
    });
    await factory.create(request, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    const result = await constructorCall.cloneAPIKey('test-rule-key');

    expect(securityService.authc.apiKeys.cloneAsInternalUser).toHaveBeenCalledWith(request, {
      name: 'test-rule-key',
      metadata: { managed: true, kibana: { type: 'alerting_rule' } },
    });

    expect(result).toEqual({
      apiKeysEnabled: true,
      result: {
        id: 'cloned-id',
        name: 'test-rule-key',
        api_key: 'cloned-secret',
        encoded: 'encoded-value',
      },
    });
  });

  test('cloneAPIKey grants a fresh UIAM key (no ES clone) when the request carries a UIAM credential', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
      shouldGrantUiam: true,
    });

    const requestWithUiam = mockRouter.createKibanaRequest({
      headers: { authorization: 'ApiKey essu_uiam_api_key' },
    });
    await factory.create(requestWithUiam, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    const uiamApiKeys = {
      grant: jest.fn().mockResolvedValueOnce({
        api_key: 'uiam-key',
        id: 'uiam-id',
        name: 'uiam-name',
      }),
      invalidate: jest.fn(),
    };
    securityService.authc.apiKeys.uiam = uiamApiKeys as never;

    const result = await constructorCall.cloneAPIKey('test');

    expect(uiamApiKeys.grant).toHaveBeenCalledWith(expect.any(Object), { name: 'uiam-test' });
    expect(securityService.authc.apiKeys.cloneAsInternalUser).not.toHaveBeenCalled();
    expect(result).toEqual({
      apiKeysEnabled: true,
      uiamResult: { api_key: 'uiam-key', id: 'uiam-id', name: 'uiam-name' },
    });
    expect(result).not.toHaveProperty('result');
  });

  test('cloneAPIKey throws when the UIAM grant returns no key for a UIAM request', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
      shouldGrantUiam: true,
    });

    const requestWithUiam = mockRouter.createKibanaRequest({
      headers: { authorization: 'ApiKey essu_uiam_api_key' },
    });
    await factory.create(requestWithUiam, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    const uiamApiKeys = {
      grant: jest.fn().mockResolvedValueOnce(null),
      invalidate: jest.fn(),
    };
    securityService.authc.apiKeys.uiam = uiamApiKeys as never;

    await expect(constructorCall.cloneAPIKey('test')).rejects.toThrow(
      'Failed to grant UIAM API key for cloned alerting rule'
    );
    expect(securityService.authc.apiKeys.cloneAsInternalUser).not.toHaveBeenCalled();
  });

  test('cloneAPIKey throws when clone fails', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
    });

    securityService.authc.apiKeys.cloneAsInternalUser.mockRejectedValueOnce(
      new Error('Clone endpoint not available')
    );

    const apiKeyCredentials = Buffer.from('key-id:key-secret').toString('base64');
    const request = mockRouter.createKibanaRequest({
      headers: { authorization: `ApiKey ${apiKeyCredentials}` },
    });

    await factory.create(request, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    await expect(constructorCall.cloneAPIKey('test-rule-key')).rejects.toThrow(
      'Clone endpoint not available'
    );
  });

  test('cloneAPIKey throws when request uses non-ApiKey auth', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
    });

    securityService.authc.apiKeys.cloneAsInternalUser.mockRejectedValueOnce(
      new Error('Unable to clone an API key, expected ApiKey authorization scheme but got "Bearer"')
    );

    const request = mockRouter.createKibanaRequest({
      headers: { authorization: 'Bearer some-bearer-token' },
    });

    await factory.create(request, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    await expect(constructorCall.cloneAPIKey('test-rule-key')).rejects.toThrow(
      'Unable to clone an API key, expected ApiKey authorization scheme but got "Bearer"'
    );
  });

  test('isAuthenticationTypeAPIKey() falls back to header when getCurrentUser returns null and ApiKey header present', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
    });

    const apiKeyCredentials = Buffer.from('key-id:key-secret').toString('base64');
    const request = mockRouter.createKibanaRequest({
      headers: { authorization: `ApiKey ${apiKeyCredentials}` },
    });
    await factory.create(request, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    securityService.authc.getCurrentUser.mockReturnValueOnce(null);

    expect(constructorCall.isAuthenticationTypeAPIKey()).toBe(true);
  });

  test('isAuthenticationTypeAPIKey() returns false when getCurrentUser returns null and Bearer header present', async () => {
    const factory = new RulesClientFactory();
    factory.initialize({
      ...rulesClientFactoryParams,
      securityService,
      securityPluginSetup,
      securityPluginStart,
    });

    const request = mockRouter.createKibanaRequest({
      headers: { authorization: 'Bearer some-token' },
    });
    await factory.create(request, savedObjectsService);
    const constructorCall = jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];

    securityService.authc.getCurrentUser.mockReturnValueOnce(null);

    expect(constructorCall.isAuthenticationTypeAPIKey()).toBe(false);
  });

  describe('invalidateApiKeyNow()', () => {
    const esApiKey = Buffer.from('es-id:es-secret').toString('base64');
    const uiamApiKey = Buffer.from('uiam-id:essu_uiam_secret').toString('base64');

    const setupFactory = async ({ shouldGrantUiam = false } = {}) => {
      const factory = new RulesClientFactory();
      factory.initialize({
        ...rulesClientFactoryParams,
        securityService,
        securityPluginSetup,
        securityPluginStart,
        shouldGrantUiam,
      });
      // Caller auth is intentionally non-UIAM to prove neither branch depends on it.
      await factory.create(
        mockRouter.createKibanaRequest({ headers: { authorization: 'Basic non-uiam-caller' } }),
        savedObjectsService
      );
      return jest.requireMock('./rules_client').RulesClient.mock.calls[0][0];
    };

    test('invalidates ES API key via invalidateAsInternalUser, not the caller-scoped invalidate', async () => {
      const constructorCall = await setupFactory();

      await constructorCall.invalidateApiKeyNow({ ruleName: 'rule-x', apiKey: esApiKey });

      expect(securityService.authc.apiKeys.invalidateAsInternalUser).toHaveBeenCalledWith({
        ids: ['es-id'],
      });
      expect(securityService.authc.apiKeys.invalidate).not.toHaveBeenCalled();
    });

    test("invalidates UIAM API key with a forged request carrying the rule's own UIAM credential", async () => {
      const constructorCall = await setupFactory({ shouldGrantUiam: true });
      const uiamInvalidate = jest.fn().mockResolvedValueOnce({});
      securityService.authc.apiKeys.uiam = {
        grant: jest.fn(),
        invalidate: uiamInvalidate,
      } as never;

      await constructorCall.invalidateApiKeyNow({ ruleName: 'rule-x', uiamApiKey });

      expect(uiamInvalidate).toHaveBeenCalledTimes(1);
      const [forgedRequest, params] = uiamInvalidate.mock.calls[0];
      expect(params).toEqual({ id: 'uiam-id' });
      // Forged request must carry the rule's own essu_ credential, NOT the caller's.
      expect(forgedRequest.headers.authorization).toBe('ApiKey essu_uiam_secret');
    });

    test('does not call uiam.invalidate when the stored uiamApiKey is not a UIAM credential', async () => {
      const constructorCall = await setupFactory({ shouldGrantUiam: true });
      const uiamInvalidate = jest.fn();
      securityService.authc.apiKeys.uiam = {
        grant: jest.fn(),
        invalidate: uiamInvalidate,
      } as never;

      await constructorCall.invalidateApiKeyNow({
        ruleName: 'rule-x',
        uiamApiKey: Buffer.from('uiam-id:not-a-uiam-secret').toString('base64'),
      });

      expect(uiamInvalidate).not.toHaveBeenCalled();
    });
  });
});
