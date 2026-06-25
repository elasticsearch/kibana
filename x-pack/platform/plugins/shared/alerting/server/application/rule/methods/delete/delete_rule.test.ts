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
import { getBeforeSetup } from '../../../../rules_client/tests/lib';
import { RecoveredActionGroup } from '../../../../../common';
import { bulkMarkApiKeysForInvalidation } from '../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation';
import { ConnectorAdapterRegistry } from '../../../../connector_adapters/connector_adapter_registry';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { backfillClientMock } from '../../../../backfill_client/backfill_client.mock';
import { softDeleteGaps } from '../../../../lib/rule_gaps/soft_delete/soft_delete_gaps';
import { eventLogClientMock } from '@kbn/event-log-plugin/server/event_log_client.mock';
import { eventLoggerMock } from '@kbn/event-log-plugin/server/event_logger.mock';

jest.mock('../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation', () => ({
  bulkMarkApiKeysForInvalidation: jest.fn(),
}));

jest.mock('../../../../lib/rule_gaps/soft_delete/soft_delete_gaps');

const softDeleteGapsMock = softDeleteGaps as jest.Mock;

const taskManager = taskManagerMock.createStart();
const ruleTypeRegistry = ruleTypeRegistryMock.create();
const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
const encryptedSavedObjects = encryptedSavedObjectsMock.createClient();
const authorization = alertingAuthorizationMock.create();
const actionsAuthorization = actionsAuthorizationMock.create();
const auditLogger = auditLoggerMock.create();
const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();
const backfillClient = backfillClientMock.create();
const eventLogClient = eventLogClientMock.create();
const eventLogger = eventLoggerMock.create();

const kibanaVersion = 'v7.10.0';
const rulesClientParams: jest.Mocked<ConstructorOptions> = {
  taskManager,
  ruleTypeRegistry,
  unsecuredSavedObjectsClient,
  maxScheduledPerMinute: 10000,
  minimumScheduleInterval: { value: '1m', enforce: false },
  authorization: authorization as unknown as AlertingAuthorization,
  actionsAuthorization: actionsAuthorization as unknown as ActionsAuthorization,
  spaceId: 'default',
  namespace: 'default',
  getUserName: jest.fn(),
  createAPIKey: jest.fn(),
  cloneAPIKey: jest.fn(),
  invalidateApiKeyNow: jest.fn(),
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
  backfillClient,
  uiSettings: uiSettingsServiceMock.createStartContract(),
  isSystemAction: jest.fn(),
  eventLogger,
  featureFlags: coreFeatureFlagsMock.createStart(),
  isServerless: false,
};

beforeEach(() => {
  getBeforeSetup(rulesClientParams, taskManager, ruleTypeRegistry, eventLogClient);
  (auditLogger.log as jest.Mock).mockClear();
});

const fakeRuleName = 'fakeRuleName';

describe('delete()', () => {
  let rulesClient: RulesClient;
  const existingAlert = {
    id: '1',
    type: RULE_SAVED_OBJECT_TYPE,
    attributes: {
      name: fakeRuleName,
      alertTypeId: 'myType',
      consumer: 'myApp',
      schedule: { interval: '10s' },
      params: {
        bar: true,
      },
      scheduledTaskId: 'task-123',
      createdAt: '2019-02-12T21:01:22.479Z',
      updatedAt: '2019-02-12T21:01:22.479Z',
      actions: [
        {
          group: 'default',
          actionTypeId: '.no-op',
          actionRef: 'action_0',
          params: {
            foo: true,
          },
        },
      ],
    },
    references: [
      {
        name: 'action_0',
        type: 'action',
        id: '1',
      },
    ],
  };
  const existingDecryptedAlert = {
    ...existingAlert,
    attributes: {
      ...existingAlert.attributes,
      apiKey: Buffer.from('123:abc').toString('base64'),
    },
  };

  const existingDecryptedAlertWithUiam = {
    ...existingAlert,
    attributes: {
      ...existingAlert.attributes,
      apiKey: Buffer.from('123:abc').toString('base64'),
      uiamApiKey: Buffer.from('123:essu_uiam').toString('base64'),
    },
  };

  beforeEach(() => {
    rulesClient = new RulesClient(rulesClientParams);
    unsecuredSavedObjectsClient.get.mockResolvedValue(existingAlert);
    unsecuredSavedObjectsClient.delete.mockResolvedValue({
      success: true,
    });
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue(existingDecryptedAlert);
  });

  test('successfully removes an alert', async () => {
    const result = await rulesClient.delete({ id: '1' });
    expect(result).toEqual({ success: true });
    expect(unsecuredSavedObjectsClient.delete).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      undefined
    );
    expect(taskManager.removeIfExists).toHaveBeenCalledWith('task-123');
    expect(backfillClient.deleteBackfillForRules).toHaveBeenCalledWith({
      ruleIds: ['1'],
      namespace: 'default',
      unsecuredSavedObjectsClient,
    });
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      { apiKeys: ['MTIzOmFiYw=='] },
      expect.any(Object),
      expect.any(Object)
    );
    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );
    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
  });

  test('invalidate UIAM API keys as well', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue(
      existingDecryptedAlertWithUiam
    );

    const result = await rulesClient.delete({ id: '1' });
    expect(result).toEqual({ success: true });
    expect(unsecuredSavedObjectsClient.delete).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      undefined
    );

    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      {
        apiKeys: ['MTIzOmFiYw==', 'MTIzOmVzc3VfdWlhbQ=='],
      },
      expect.any(Object),
      expect.any(Object)
    );
  });

  test('synchronously invalidates API keys when invalidateApiKeyNow=true and skips the pending queue', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue(
      existingDecryptedAlertWithUiam
    );

    const result = await rulesClient.delete({ id: '1', invalidateApiKeyNow: true });
    expect(result).toEqual({ success: true });

    expect(bulkMarkApiKeysForInvalidation).not.toHaveBeenCalled();
    expect(rulesClientParams.invalidateApiKeyNow).toHaveBeenCalledTimes(1);
    expect(rulesClientParams.invalidateApiKeyNow).toHaveBeenCalledWith({
      ruleName: fakeRuleName,
      apiKey: 'MTIzOmFiYw==',
      uiamApiKey: 'MTIzOmVzc3VfdWlhbQ==',
    });
  });

  test('falls back to queueing when invalidateApiKeyNow is not set (default behavior)', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue(
      existingDecryptedAlertWithUiam
    );

    await rulesClient.delete({ id: '1' });

    expect(rulesClientParams.invalidateApiKeyNow).not.toHaveBeenCalled();
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
  });

  test('does not call invalidateApiKeyNow when apiKeyCreatedByUser is true even with invalidateApiKeyNow=true', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
      ...existingDecryptedAlertWithUiam,
      attributes: {
        ...existingDecryptedAlertWithUiam.attributes,
        apiKeyCreatedByUser: true,
      },
    });

    await rulesClient.delete({ id: '1', invalidateApiKeyNow: true });

    expect(rulesClientParams.invalidateApiKeyNow).not.toHaveBeenCalled();
    expect(bulkMarkApiKeysForInvalidation).not.toHaveBeenCalled();
  });

  test('attempts to soft delete gaps', async () => {
    await rulesClient.delete({ id: '1' });
    expect(softDeleteGapsMock).toHaveBeenCalledWith({
      ruleIds: ['1'],
      logger: rulesClientParams.logger,
      eventLogClient,
      eventLogger: rulesClientParams.eventLogger,
    });
  });

  test('swallows errors when soft deleting gaps fails', async () => {
    softDeleteGapsMock.mockRejectedValueOnce(new Error('Boom!'));
    await rulesClient.delete({ id: '1' });
    expect(rulesClientParams.logger.error).toHaveBeenCalledWith(
      'delete(): Failed to soft delete gaps for rule 1: Boom!'
    );
  });

  test('falls back to SOC.get when getDecryptedAsInternalUser throws an error', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockRejectedValue(new Error('Fail'));

    const result = await rulesClient.delete({ id: '1' });
    expect(result).toEqual({ success: true });
    expect(unsecuredSavedObjectsClient.delete).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      undefined
    );
    expect(taskManager.removeIfExists).toHaveBeenCalledWith('task-123');
    expect(backfillClient.deleteBackfillForRules).toHaveBeenCalledWith({
      ruleIds: ['1'],
      namespace: 'default',
      unsecuredSavedObjectsClient,
    });
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(unsecuredSavedObjectsClient.get).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      undefined
    );
    expect(rulesClientParams.logger.error).toHaveBeenCalledWith(
      'delete(): Failed to load API key to invalidate on alert 1: Fail'
    );
  });

  test(`doesn't remove a task when scheduledTaskId is null`, async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
      ...existingDecryptedAlert,
      attributes: {
        ...existingDecryptedAlert.attributes,
        scheduledTaskId: null,
      },
    });

    await rulesClient.delete({ id: '1' });
    expect(taskManager.removeIfExists).not.toHaveBeenCalled();
  });

  test(`doesn't invalidate API key when apiKey is null`, async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
      ...existingAlert,
      attributes: {
        ...existingAlert.attributes,
        apiKey: null,
      },
    });

    await rulesClient.delete({ id: '1' });
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
  });

  test(`doesn't invalidate API key if set by the user when authenticated using api keys`, async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
      ...existingAlert,
      attributes: {
        ...existingAlert.attributes,
        apiKeyCreatedByUser: true,
      },
    });

    await rulesClient.delete({ id: '1' });
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(bulkMarkApiKeysForInvalidation).not.toHaveBeenCalled();
  });

  test('swallows error when invalidate API key throws', async () => {
    unsecuredSavedObjectsClient.create.mockRejectedValueOnce(new Error('Fail'));
    await rulesClient.delete({ id: '1' });
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      { apiKeys: ['MTIzOmFiYw=='] },
      expect.any(Object),
      expect.any(Object)
    );
  });

  test('swallows error when getDecryptedAsInternalUser throws an error', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockRejectedValue(new Error('Fail'));

    await rulesClient.delete({ id: '1' });
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(rulesClientParams.logger.error).toHaveBeenCalledWith(
      'delete(): Failed to load API key to invalidate on alert 1: Fail'
    );
  });

  test('throws error when unsecuredSavedObjectsClient.get throws an error', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockRejectedValue(new Error('Fail'));
    unsecuredSavedObjectsClient.get.mockRejectedValue(new Error('SOC Fail'));

    await expect(rulesClient.delete({ id: '1' })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"SOC Fail"`
    );
  });

  test('throws error when taskManager.removeIfExists throws an error', async () => {
    taskManager.removeIfExists.mockRejectedValue(new Error('TM Fail'));

    await expect(rulesClient.delete({ id: '1' })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"TM Fail"`
    );
  });

  test('throws error when backfillClient.deleteBackfillForRules throws an error', async () => {
    backfillClient.deleteBackfillForRules.mockRejectedValue(new Error('backfill Fail'));

    await expect(rulesClient.delete({ id: '1' })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"backfill Fail"`
    );
  });

  describe('authorization', () => {
    test('ensures user is authorised to delete this type of alert under the consumer', async () => {
      await rulesClient.delete({ id: '1' });

      expect(authorization.ensureAuthorized).toHaveBeenCalledWith({
        entity: 'rule',
        consumer: 'myApp',
        operation: 'delete',
        ruleTypeId: 'myType',
      });
    });

    test('throws when user is not authorised to delete this type of alert', async () => {
      authorization.ensureAuthorized.mockRejectedValue(
        new Error(`Unauthorized to delete a "myType" alert for "myApp"`)
      );

      await expect(rulesClient.delete({ id: '1' })).rejects.toMatchInlineSnapshot(
        `[Error: Unauthorized to delete a "myType" alert for "myApp"]`
      );

      expect(authorization.ensureAuthorized).toHaveBeenCalledWith({
        entity: 'rule',
        consumer: 'myApp',
        operation: 'delete',
        ruleTypeId: 'myType',
      });
    });
  });

  describe('auditLogger', () => {
    test('logs audit event when deleting a rule', async () => {
      await rulesClient.delete({ id: '1' });
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_delete',
            outcome: 'unknown',
          }),
          kibana: { saved_object: { id: '1', type: RULE_SAVED_OBJECT_TYPE, name: fakeRuleName } },
        })
      );
    });

    test('logs audit event when not authorised to delete a rule', async () => {
      authorization.ensureAuthorized.mockRejectedValue(new Error('Unauthorized'));

      await expect(rulesClient.delete({ id: '1' })).rejects.toThrow();
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_delete',
            outcome: 'failure',
          }),
          kibana: {
            saved_object: {
              id: '1',
              type: RULE_SAVED_OBJECT_TYPE,
              name: fakeRuleName,
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
        recoveryActionGroup: RecoveredActionGroup,
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

    test('logs the change when the rule is deleted', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      await trackingClient.delete({ id: '1' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [expect.objectContaining({ objectId: '1', module: 'stack' })],
        {
          action: 'rule_delete',
          spaceId: 'default',
        }
      );
    });

    test('captures the pre-deletion attributes and references of the rule', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      await trackingClient.delete({ id: '1' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          {
            timestamp: expect.any(String),
            objectId: '1',
            objectType: RULE_SAVED_OBJECT_TYPE,
            module: 'stack',
            snapshot: expect.objectContaining({
              id: '1',
              name: fakeRuleName,
              alertTypeId: 'myType',
              consumer: 'myApp',
              params: { bar: true },
              createdAt: '2019-02-12T21:01:22.479Z',
              updatedAt: '2019-02-12T21:01:22.479Z',
            }),
          },
        ],
        expect.any(Object)
      );
    });

    test('stamps the change with the time the delete flow began', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      const startTimeMs = Date.parse('2030-06-01T08:00:00.000Z');
      const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(startTimeMs);

      try {
        await trackingClient.delete({ id: '1' });

        expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
        const [changes] = changeTrackingService.logBulk.mock.calls[0];
        expect(changes).toHaveLength(1);
        expect(changes[0].timestamp).toBe('2030-06-01T08:00:00.000Z');
      } finally {
        dateNowSpy.mockRestore();
      }
    });

    test('does not log when the rule type opts out of tracking', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType({ trackChanges: false });

      await trackingClient.delete({ id: '1' });

      expect(changeTrackingService.logBulk).not.toHaveBeenCalled();
    });

    test('does not log when no change tracking service is configured', async () => {
      setRuleType();

      await rulesClient.delete({ id: '1' });

      expect(unsecuredSavedObjectsClient.delete).toHaveBeenCalled();
    });

    test('rule deletion succeeds even if change tracking throws', async () => {
      const changeTrackingService = createChangeTrackingService();
      changeTrackingService.logBulk.mockRejectedValueOnce(new Error('boom'));
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      await expect(trackingClient.delete({ id: '1' })).resolves.toBeDefined();
      expect(rulesClientParams.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unable to log bulk rule changes for action "rule_delete"')
      );
    });
  });
});
