/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConstructorOptions } from '../../../../rules_client/rules_client';
import { RulesClient } from '../../../../rules_client/rules_client';
import {
  savedObjectsClientMock,
  loggingSystemMock,
  savedObjectsRepositoryMock,
  uiSettingsServiceMock,
  coreFeatureFlagsMock,
} from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { ruleTypeRegistryMock } from '../../../../rule_type_registry.mock';
import { alertingAuthorizationMock } from '../../../../authorization/alerting_authorization.mock';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { actionsAuthorizationMock } from '@kbn/actions-plugin/server/mocks';
import type { AlertingAuthorization } from '../../../../authorization/alerting_authorization';
import type { ActionsAuthorization } from '@kbn/actions-plugin/server';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';
import { getBeforeSetup, setGlobalDate } from '../../../../rules_client/tests/lib';
import { bulkMarkApiKeysForInvalidation } from '../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation';
import { ConnectorAdapterRegistry } from '../../../../connector_adapters/connector_adapter_registry';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { backfillClientMock } from '../../../../backfill_client/backfill_client.mock';

jest.mock('../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation', () => ({
  bulkMarkApiKeysForInvalidation: jest.fn(),
}));

const bulkMarkApiKeysForInvalidationMock = bulkMarkApiKeysForInvalidation as jest.Mock;
const taskManager = taskManagerMock.createStart();
const ruleTypeRegistry = ruleTypeRegistryMock.create();
const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
const encryptedSavedObjects = encryptedSavedObjectsMock.createClient();
const authorization = alertingAuthorizationMock.create();
const actionsAuthorization = actionsAuthorizationMock.create();
const auditLogger = auditLoggerMock.create();
const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();

const kibanaVersion = 'v7.10.0';
const ruleName = 'fakeRuleName';

const rulesClientParams: jest.Mocked<ConstructorOptions> = {
  taskManager,
  ruleTypeRegistry,
  unsecuredSavedObjectsClient,
  authorization: authorization as unknown as AlertingAuthorization,
  actionsAuthorization: actionsAuthorization as unknown as ActionsAuthorization,
  spaceId: 'default',
  namespace: 'default',
  maxScheduledPerMinute: 10000,
  minimumScheduleInterval: { value: '1m', enforce: false },
  getUserName: jest.fn(),
  createAPIKey: jest.fn(),
  cloneAPIKey: jest.fn(),
  logger: loggingSystemMock.create().get(),
  internalSavedObjectsRepository,
  encryptedSavedObjectsClient: encryptedSavedObjects,
  getActionsClient: jest.fn(),
  getEventLogClient: jest.fn(),
  kibanaVersion,
  auditLogger,
  isAuthenticationTypeAPIKey: jest.fn(),
  getAuthenticationAPIKey: jest.fn(),
  connectorAdapterRegistry: new ConnectorAdapterRegistry(),
  getAlertIndicesAlias: jest.fn(),
  alertsService: null,
  backfillClient: backfillClientMock.create(),
  uiSettings: uiSettingsServiceMock.createStartContract(),
  isSystemAction: jest.fn(),
  featureFlags: coreFeatureFlagsMock.createStart(),
  isServerless: false,
};

beforeEach(() => {
  getBeforeSetup(rulesClientParams, taskManager, ruleTypeRegistry);
  (auditLogger.log as jest.Mock).mockClear();
});

setGlobalDate();

describe('updateRuleApiKey()', () => {
  let rulesClient: RulesClient;
  const existingAlert = {
    id: '1',
    type: RULE_SAVED_OBJECT_TYPE,
    attributes: {
      name: ruleName,
      revision: 0,
      schedule: { interval: '10s' },
      alertTypeId: 'myType',
      consumer: 'myApp',
      enabled: true,
      actions: [
        {
          group: 'default',
          id: '1',
          actionTypeId: '1',
          actionRef: '1',
          params: {
            foo: true,
          },
        },
      ],
    },
    version: '123',
    references: [],
  };
  const existingEncryptedAlert = {
    ...existingAlert,
    attributes: {
      ...existingAlert.attributes,
      apiKey: Buffer.from('123:abc').toString('base64'),
    },
  };

  beforeEach(() => {
    rulesClient = new RulesClient(rulesClientParams);
    unsecuredSavedObjectsClient.get.mockResolvedValue(existingAlert);
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue(existingEncryptedAlert);
  });

  test('updates the API key for the alert', async () => {
    rulesClientParams.isAuthenticationTypeAPIKey.mockReturnValueOnce(false);
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '234', name: '123', api_key: 'abc' },
    });
    await rulesClient.updateRuleApiKey({ id: '1' });
    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );
    expect(unsecuredSavedObjectsClient.update).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        schedule: { interval: '10s' },
        name: ruleName,
        alertTypeId: 'myType',
        consumer: 'myApp',
        enabled: true,
        apiKey: Buffer.from('234:abc').toString('base64'),
        apiKeyOwner: 'elastic',
        apiKeyCreatedByUser: false,
        revision: 0,
        updatedBy: 'elastic',
        updatedAt: '2019-02-12T21:01:22.479Z',
        actions: [
          {
            group: 'default',
            id: '1',
            actionTypeId: '1',
            actionRef: '1',
            params: {
              foo: true,
            },
          },
        ],
        meta: {
          versionApiKeyLastmodified: kibanaVersion,
        },
      },
      { version: '123' }
    );
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      { apiKeys: ['MTIzOmFiYw=='] },
      expect.any(Object),
      expect.any(Object)
    );
  });

  test('updates the UIAM API key for the alert', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
      ...existingEncryptedAlert,
      attributes: {
        ...existingEncryptedAlert.attributes,
        uiamApiKey: 'old-uiam-234:essu_abc',
      },
    });

    rulesClientParams.isAuthenticationTypeAPIKey.mockReturnValueOnce(false);
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '234', name: '123', api_key: 'abc' },
      uiamResult: { id: 'uiam-234', name: 'uiam-123', api_key: 'essu_abc' },
    });
    await rulesClient.updateRuleApiKey({ id: '1' });
    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(unsecuredSavedObjectsClient.update).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        schedule: { interval: '10s' },
        name: ruleName,
        alertTypeId: 'myType',
        consumer: 'myApp',
        enabled: true,
        apiKey: Buffer.from('234:abc').toString('base64'),
        uiamApiKey: 'dWlhbS0yMzQ6ZXNzdV9hYmM=',
        apiKeyOwner: 'elastic',
        apiKeyCreatedByUser: false,
        revision: 0,
        updatedBy: 'elastic',
        updatedAt: '2019-02-12T21:01:22.479Z',
        actions: [
          {
            group: 'default',
            id: '1',
            actionTypeId: '1',
            actionRef: '1',
            params: {
              foo: true,
            },
          },
        ],
        meta: {
          versionApiKeyLastmodified: kibanaVersion,
        },
      },
      { version: '123' }
    );
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      {
        apiKeys: ['MTIzOmFiYw==', 'old-uiam-234:essu_abc'],
      },
      expect.any(Object),
      expect.any(Object)
    );
  });

  test('does not leak stale uiamApiKey when new API key set has no UIAM key', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
      ...existingEncryptedAlert,
      attributes: {
        ...existingEncryptedAlert.attributes,
        uiamApiKey: Buffer.from('stale-uiam:stale-key').toString('base64'),
      },
    });

    rulesClientParams.isAuthenticationTypeAPIKey.mockReturnValueOnce(false);
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '234', name: '123', api_key: 'abc' },
    });
    await rulesClient.updateRuleApiKey({ id: '1' });

    const writtenAttributes = unsecuredSavedObjectsClient.update.mock.calls[0][2];
    expect(writtenAttributes).not.toHaveProperty('uiamApiKey');
  });

  test('updates the API key for the alert and does not invalidate the old api key if created by a user authenticated using an api key', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
      ...existingEncryptedAlert,
      attributes: {
        ...existingEncryptedAlert.attributes,
        apiKeyCreatedByUser: true,
      },
    });
    rulesClientParams.isAuthenticationTypeAPIKey.mockReturnValueOnce(false);
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '234', name: '123', api_key: 'abc' },
    });
    await rulesClient.updateRuleApiKey({ id: '1' });
    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );
    expect(unsecuredSavedObjectsClient.update).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        schedule: { interval: '10s' },
        name: ruleName,
        alertTypeId: 'myType',
        consumer: 'myApp',
        enabled: true,
        apiKey: Buffer.from('234:abc').toString('base64'),
        apiKeyOwner: 'elastic',
        apiKeyCreatedByUser: false,
        revision: 0,
        updatedBy: 'elastic',
        updatedAt: '2019-02-12T21:01:22.479Z',
        actions: [
          {
            group: 'default',
            id: '1',
            actionTypeId: '1',
            actionRef: '1',
            params: {
              foo: true,
            },
          },
        ],
        meta: {
          versionApiKeyLastmodified: kibanaVersion,
        },
      },
      { version: '123' }
    );
    expect(bulkMarkApiKeysForInvalidation).not.toHaveBeenCalled();
  });

  test('calls the authentication API key function if the user is authenticated using an api key', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
      ...existingEncryptedAlert,
      attributes: {
        ...existingEncryptedAlert.attributes,
        apiKeyCreatedByUser: true,
      },
    });
    rulesClientParams.isAuthenticationTypeAPIKey.mockReturnValueOnce(true);
    rulesClientParams.getAuthenticationAPIKey.mockReturnValueOnce({
      apiKeysEnabled: true,
      result: { id: '234', name: '123', api_key: 'abc' },
    });
    await rulesClient.updateRuleApiKey({ id: '1' });
    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );
    expect(unsecuredSavedObjectsClient.update).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        schedule: { interval: '10s' },
        name: ruleName,
        alertTypeId: 'myType',
        consumer: 'myApp',
        enabled: true,
        apiKey: Buffer.from('234:abc').toString('base64'),
        apiKeyOwner: 'elastic',
        apiKeyCreatedByUser: true,
        revision: 0,
        updatedBy: 'elastic',
        updatedAt: '2019-02-12T21:01:22.479Z',
        actions: [
          {
            group: 'default',
            id: '1',
            actionTypeId: '1',
            actionRef: '1',
            params: {
              foo: true,
            },
          },
        ],
        meta: {
          versionApiKeyLastmodified: kibanaVersion,
        },
      },
      { version: '123' }
    );
    expect(bulkMarkApiKeysForInvalidation).not.toHaveBeenCalled();
  });

  test('throws an error if API key creation throws', async () => {
    rulesClientParams.createAPIKey.mockImplementation(() => {
      throw new Error('no');
    });
    await expect(
      async () => await rulesClient.updateRuleApiKey({ id: '1' })
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Error updating API key for rule: could not create API key - no"`
    );
  });

  test('throws an error if API params do not match the schema', async () => {
    await expect(
      // @ts-ignore: this is what we are testing
      async () => await rulesClient.updateRuleApiKey({ id: 1 })
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Error validating update api key parameters - [id]: expected value of type [string] but got [number]"`
    );
  });

  test('falls back to SOC when getDecryptedAsInternalUser throws an error', async () => {
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '234', name: '123', api_key: 'abc' },
    });
    encryptedSavedObjects.getDecryptedAsInternalUser.mockRejectedValueOnce(new Error('Fail'));

    await rulesClient.updateRuleApiKey({ id: '1' });
    expect(unsecuredSavedObjectsClient.get).toHaveBeenCalledWith(RULE_SAVED_OBJECT_TYPE, '1');
    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );
    expect(unsecuredSavedObjectsClient.update).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        schedule: { interval: '10s' },
        name: ruleName,
        alertTypeId: 'myType',
        consumer: 'myApp',
        enabled: true,
        apiKey: Buffer.from('234:abc').toString('base64'),
        apiKeyCreatedByUser: false,
        apiKeyOwner: 'elastic',
        revision: 0,
        updatedAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
        actions: [
          {
            group: 'default',
            id: '1',
            actionTypeId: '1',
            actionRef: '1',
            params: {
              foo: true,
            },
          },
        ],
        meta: {
          versionApiKeyLastmodified: kibanaVersion,
        },
      },
      { version: '123' }
    );
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
  });

  test('swallows error when invalidate API key throws', async () => {
    bulkMarkApiKeysForInvalidationMock.mockImplementationOnce(() => new Error('Fail'));

    await rulesClient.updateRuleApiKey({ id: '1' });
    expect(unsecuredSavedObjectsClient.update).toHaveBeenCalled();
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      { apiKeys: ['MTIzOmFiYw=='] },
      expect.any(Object),
      expect.any(Object)
    );
  });

  test('swallows error when getting decrypted object throws', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockRejectedValueOnce(new Error('Fail'));

    await rulesClient.updateRuleApiKey({ id: '1' });
    expect(rulesClientParams.logger.error).toHaveBeenCalledWith(
      'updateApiKey(): Failed to load API key to invalidate on alert 1: Fail'
    );
    expect(unsecuredSavedObjectsClient.update).toHaveBeenCalled();
  });

  test('throws when unsecuredSavedObjectsClient update fails and invalidates newly created API key', async () => {
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '234', name: '234', api_key: 'abc' },
    });
    unsecuredSavedObjectsClient.update.mockRejectedValueOnce(new Error('Fail'));

    await expect(
      rulesClient.updateRuleApiKey({ id: '1' })
    ).rejects.toThrowErrorMatchingInlineSnapshot(`"Fail"`);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      { apiKeys: ['MjM0OmFiYw=='] },
      expect.any(Object),
      expect.any(Object)
    );
  });

  describe('authorization', () => {
    test('ensures user is authorised to updateRuleApiKey this type of alert under the consumer', async () => {
      await rulesClient.updateRuleApiKey({ id: '1' });

      expect(actionsAuthorization.ensureAuthorized).toHaveBeenCalledWith({ operation: 'execute' });
      expect(authorization.ensureAuthorized).toHaveBeenCalledWith({
        entity: 'rule',
        consumer: 'myApp',
        operation: 'updateApiKey',
        ruleTypeId: 'myType',
      });
    });

    test('throws when user is not authorised to updateRuleApiKey this type of alert', async () => {
      authorization.ensureAuthorized.mockRejectedValue(
        new Error(`Unauthorized to updateRuleApiKey a "myType" alert for "myApp"`)
      );

      await expect(rulesClient.updateRuleApiKey({ id: '1' })).rejects.toMatchInlineSnapshot(
        `[Error: Unauthorized to updateRuleApiKey a "myType" alert for "myApp"]`
      );

      expect(authorization.ensureAuthorized).toHaveBeenCalledWith({
        entity: 'rule',
        consumer: 'myApp',
        operation: 'updateApiKey',
        ruleTypeId: 'myType',
      });
    });
  });

  describe('auditLogger', () => {
    test('logs audit event when updating the API key of a rule', async () => {
      await rulesClient.updateRuleApiKey({ id: '1' });

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_update_api_key',
            outcome: 'unknown',
          }),
          kibana: {
            saved_object: { id: '1', type: RULE_SAVED_OBJECT_TYPE, name: ruleName },
          },
        })
      );
    });

    test('logs audit event when not authorised to update the API key of a rule', async () => {
      authorization.ensureAuthorized.mockRejectedValue(new Error('Unauthorized'));

      await expect(rulesClient.updateRuleApiKey({ id: '1' })).rejects.toThrow();
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            outcome: 'failure',
            action: 'rule_update_api_key',
          }),
          kibana: {
            saved_object: {
              id: '1',
              type: RULE_SAVED_OBJECT_TYPE,
              name: ruleName,
            },
          },
          error: {
            code: 'Error',
            message: 'Unauthorized',
          },
        })
      );
    });
  });

  describe('change tracking', () => {
    const updatedRuleSO = {
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        name: ruleName,
        alertTypeId: 'myType',
        consumer: 'myApp',
        enabled: true,
        apiKey: Buffer.from('234:abc').toString('base64'),
        apiKeyOwner: 'elastic',
        apiKeyCreatedByUser: false,
        revision: 0,
        updatedBy: 'elastic',
        createdAt: '2019-02-12T21:01:22.479Z',
        updatedAt: '2019-02-12T21:01:22.479Z',
        actions: [],
      },
      references: [{ id: 'action-1', name: 'action_0', type: 'action' }],
    };

    const createChangeTrackingService = () => ({
      log: jest.fn().mockResolvedValue(undefined),
      logBulk: jest.fn().mockResolvedValue(undefined),
      getHistory: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    });

    const setRuleType = (overrides: { trackChanges?: boolean } = {}) => {
      ruleTypeRegistry.get.mockReturnValue({
        id: 'myType',
        name: 'Test',
        actionGroups: [{ id: 'default', name: 'Default' }],
        recoveryActionGroup: { id: 'recovered', name: 'Recovered' },
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        async executor() {
          return { state: {} };
        },
        category: 'test',
        producer: 'alerts',
        solution: 'stack' as const,
        validate: { params: { validate: (params) => params } },
        validLegacyConsumers: [],
        trackChanges: true,
        ...overrides,
      });
    };

    test('logs the change exactly once after the saved object update succeeds', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      rulesClientParams.createAPIKey.mockResolvedValueOnce({
        apiKeysEnabled: true,
        result: { id: '234', name: '123', api_key: 'abc' },
      });
      unsecuredSavedObjectsClient.update.mockResolvedValueOnce(updatedRuleSO);

      await trackingClient.updateRuleApiKey({ id: '1' });

      expect(unsecuredSavedObjectsClient.update).toHaveBeenCalledTimes(1);
      expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
      // Single-rule callers fall back to ruleSOs.length for bulkCount.
      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [expect.objectContaining({ objectId: '1', module: 'stack' })],
        {
          action: 'rule_update_api_key',
          spaceId: 'default',
        }
      );
    });

    test('captures the full post-update attributes of the rule', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      rulesClientParams.createAPIKey.mockResolvedValueOnce({
        apiKeysEnabled: true,
        result: { id: '234', name: '123', api_key: 'abc' },
      });
      unsecuredSavedObjectsClient.update.mockResolvedValueOnce(updatedRuleSO);

      await trackingClient.updateRuleApiKey({ id: '1' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            snapshot: expect.objectContaining({
              id: '1',
              name: ruleName,
              alertTypeId: 'myType',
              consumer: 'myApp',
              apiKey: Buffer.from('234:abc').toString('base64'),
              createdAt: '2019-02-12T21:01:22.479Z',
              updatedAt: '2019-02-12T21:01:22.479Z',
            }),
          }),
        ],
        expect.any(Object)
      );
    });

    test('captures the context of the rule', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      rulesClientParams.createAPIKey.mockResolvedValueOnce({
        apiKeysEnabled: true,
        result: { id: '234', name: '123', api_key: 'abc' },
      });
      unsecuredSavedObjectsClient.update.mockResolvedValueOnce(updatedRuleSO);

      await trackingClient.updateRuleApiKey({ id: '1' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            objectId: '1',
            objectType: RULE_SAVED_OBJECT_TYPE,
            module: 'stack',
          }),
        ],
        expect.any(Object)
      );
    });

    test('stamps the change with the time captured immediately before the SO update', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      const startTimeMs = Date.parse('2030-06-01T08:00:00.000Z');
      const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(startTimeMs);

      try {
        rulesClientParams.createAPIKey.mockResolvedValueOnce({
          apiKeysEnabled: true,
          result: { id: '234', name: '123', api_key: 'abc' },
        });
        unsecuredSavedObjectsClient.update.mockResolvedValueOnce(updatedRuleSO);

        await trackingClient.updateRuleApiKey({ id: '1' });

        expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
        const [changes] = changeTrackingService.logBulk.mock.calls[0];
        expect(changes[0].timestamp).toBe('2030-06-01T08:00:00.000Z');
      } finally {
        dateNowSpy.mockRestore();
      }
    });

    test('logs the change only after the OCC retry succeeds (no logging on the failed attempt)', async () => {
      const { SavedObjectsErrorHelpers } = jest.requireActual('@kbn/core/server');
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      rulesClientParams.createAPIKey
        .mockResolvedValueOnce({
          apiKeysEnabled: true,
          result: { id: '234', name: '123', api_key: 'abc' },
        })
        .mockResolvedValueOnce({
          apiKeysEnabled: true,
          result: { id: '345', name: '345', api_key: 'def' },
        });
      // First attempt: SO update fails with a 409 conflict — `retryIfConflicts` retries.
      // Second attempt: SO update succeeds — change tracking should be invoked exactly once.
      unsecuredSavedObjectsClient.update
        .mockRejectedValueOnce(
          SavedObjectsErrorHelpers.createConflictError(RULE_SAVED_OBJECT_TYPE, '1')
        )
        .mockResolvedValueOnce(updatedRuleSO);

      await trackingClient.updateRuleApiKey({ id: '1' });

      expect(unsecuredSavedObjectsClient.update).toHaveBeenCalledTimes(2);
      expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [expect.objectContaining({ objectId: '1' })],
        expect.objectContaining({ action: 'rule_update_api_key' })
      );
    });

    test('does not log when the saved object update fails with a non-retryable error', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      rulesClientParams.createAPIKey.mockResolvedValueOnce({
        apiKeysEnabled: true,
        result: { id: '234', name: '123', api_key: 'abc' },
      });
      unsecuredSavedObjectsClient.update.mockRejectedValueOnce(new Error('boom'));

      await expect(trackingClient.updateRuleApiKey({ id: '1' })).rejects.toThrow('boom');
      expect(changeTrackingService.logBulk).not.toHaveBeenCalled();
    });

    test('does not log when rule type opts out of tracking', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType({ trackChanges: false });

      rulesClientParams.createAPIKey.mockResolvedValueOnce({
        apiKeysEnabled: true,
        result: { id: '234', name: '123', api_key: 'abc' },
      });
      unsecuredSavedObjectsClient.update.mockResolvedValueOnce(updatedRuleSO);

      await trackingClient.updateRuleApiKey({ id: '1' });

      expect(changeTrackingService.logBulk).not.toHaveBeenCalled();
    });

    test('captures rule.revision in object.sequence', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      rulesClientParams.createAPIKey.mockResolvedValueOnce({
        apiKeysEnabled: true,
        result: { id: '234', name: '123', api_key: 'abc' },
      });
      unsecuredSavedObjectsClient.update.mockResolvedValueOnce(updatedRuleSO);

      await trackingClient.updateRuleApiKey({ id: '1' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            sequence: 0,
          }),
        ],
        expect.any(Object)
      );
    });
  });
});
