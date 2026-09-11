/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { RulesClient } from '../../../../rules_client/rules_client';
import { ApiKeyType } from '../../../../task_runner/types';
import { TaskStatus } from '@kbn/task-manager-plugin/server';
import { getBeforeSetup, setGlobalDate } from '../../../../rules_client/tests/lib';
import { bulkMarkApiKeysForInvalidation } from '../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation';
import { bulkMigrateLegacyActions } from '../../../../rules_client/lib';
import {
  API_KEY_PENDING_INVALIDATION_TYPE,
  RULE_SAVED_OBJECT_TYPE,
} from '../../../../saved_objects';
import { alertsServiceMock } from '../../../../alerts_service/alerts_service.mock';
import { getRulesClientMockParams } from '../../../../test_utils';

jest.mock('../../../../rules_client/lib/siem_legacy_actions/migrate_legacy_actions', () => {
  return {
    bulkMigrateLegacyActions: jest.fn(),
  };
});

jest.mock('../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation', () => ({
  bulkMarkApiKeysForInvalidation: jest.fn(),
}));

jest.mock('../get_schedule_frequency', () => ({
  validateScheduleLimit: jest.fn(),
}));

const alertsService = alertsServiceMock.create();
const kibanaVersion = 'v7.10.0';

const {
  rulesClientParams,
  taskManager,
  ruleTypeRegistry,
  unsecuredSavedObjectsClient,
  encryptedSavedObjects,
  authorization,
  actionsAuthorization,
  auditLogger,
} = getRulesClientMockParams({ alertsService });

setGlobalDate();

describe('enable()', () => {
  let rulesClient: RulesClient;

  const existingRule = {
    id: '1',
    type: RULE_SAVED_OBJECT_TYPE,
    attributes: {
      name: 'name',
      consumer: 'myApp',
      schedule: { interval: '10s' },
      alertTypeId: 'myType',
      scheduledTaskId: 'task-123',
      enabled: false,
      apiKey: 'MTIzOmFiYw==',
      apiKeyOwner: 'elastic',
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

  const existingRuleWithoutApiKey = {
    ...existingRule,
    attributes: {
      ...existingRule.attributes,
      apiKey: null,
      apiKeyOwner: null,
    },
  };

  const mockTask = {
    id: 'task-123',
    taskType: 'alerting:123',
    scheduledAt: new Date(),
    attempts: 1,
    status: TaskStatus.Idle,
    runAt: new Date(),
    startedAt: null,
    retryAt: null,
    state: {},
    params: {
      alertId: '1',
    },
    ownerId: null,
    enabled: false,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    getBeforeSetup(rulesClientParams, taskManager, ruleTypeRegistry);
    (auditLogger.log as jest.Mock).mockClear();
    rulesClient = new RulesClient(rulesClientParams);
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue(existingRule);
    unsecuredSavedObjectsClient.get.mockResolvedValue(existingRule);
    rulesClientParams.createAPIKey.mockResolvedValue({
      apiKeysEnabled: false,
    });
    taskManager.get.mockResolvedValue(mockTask);
    (bulkMigrateLegacyActions as jest.Mock).mockResolvedValue([]);
  });

  describe('authorization', () => {
    test('ensures user is authorised to enable this type of alert under the consumer', async () => {
      await rulesClient.enableRule({ id: '1' });

      expect(authorization.ensureAuthorized).toHaveBeenCalledWith({
        entity: 'rule',
        consumer: 'myApp',
        operation: 'enable',
        ruleTypeId: 'myType',
      });
      expect(actionsAuthorization.ensureAuthorized).toHaveBeenCalledWith({ operation: 'execute' });
    });

    test('throws when user is not authorised to enable this type of alert', async () => {
      authorization.ensureAuthorized.mockRejectedValue(
        new Error(`Unauthorized to enable a "myType" alert for "myApp"`)
      );

      await expect(rulesClient.enableRule({ id: '1' })).rejects.toMatchInlineSnapshot(
        `[Error: Unauthorized to enable a "myType" alert for "myApp"]`
      );

      expect(authorization.ensureAuthorized).toHaveBeenCalledWith({
        entity: 'rule',
        consumer: 'myApp',
        operation: 'enable',
        ruleTypeId: 'myType',
      });
    });
  });

  describe('auditLogger', () => {
    test('logs audit event when enabling a rule', async () => {
      await rulesClient.enableRule({ id: '1' });
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_enable',
            outcome: 'unknown',
          }),
          kibana: { saved_object: { id: '1', type: RULE_SAVED_OBJECT_TYPE, name: 'name' } },
        })
      );
    });

    test('logs audit event when not authorised to enable a rule', async () => {
      authorization.ensureAuthorized.mockRejectedValue(new Error('Unauthorized'));

      await expect(rulesClient.enableRule({ id: '1' })).rejects.toThrow();
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_enable',
            outcome: 'failure',
          }),
          kibana: {
            saved_object: {
              id: '1',
              type: RULE_SAVED_OBJECT_TYPE,
              name: 'name',
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

  test('enables a rule', async () => {
    await rulesClient.enableRule({ id: '1' });
    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalledWith(
      API_KEY_PENDING_INVALIDATION_TYPE
    );
    // The rule is persisted as a whole document, so the stripped API key attributes are really
    // removed rather than merely absent from a merged update payload.
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      {
        name: 'name',
        schedule: { interval: '10s' },
        alertTypeId: 'myType',
        consumer: 'myApp',
        enabled: true,
        meta: {
          versionApiKeyLastmodified: kibanaVersion,
        },
        updatedAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
        apiKey: 'MTIzOmFiYw==',
        apiKeyOwner: 'elastic',
        scheduledTaskId: 'task-123',
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
        executionStatus: {
          status: 'pending',
          lastDuration: 0,
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          error: null,
          warning: null,
        },
        lastEnabledAt: '2019-02-12T21:01:22.479Z',
        nextRun: '2019-02-12T21:01:32.479Z',
      },
      { id: '1', overwrite: true, version: '123', references: [] }
    );
    expect(taskManager.bulkEnable).toHaveBeenCalledWith(['task-123']);
  });

  test('enables a rule that does not have an apiKey', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue(existingRuleWithoutApiKey);
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '123', name: '123', api_key: 'abc' },
    });
    await rulesClient.enableRule({ id: '1' });
    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalledWith(
      API_KEY_PENDING_INVALIDATION_TYPE
    );
    expect(rulesClientParams.createAPIKey).toHaveBeenCalledWith('Alerting: myType/name', undefined);
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      {
        name: 'name',
        schedule: { interval: '10s' },
        alertTypeId: 'myType',
        consumer: 'myApp',
        enabled: true,
        meta: {
          versionApiKeyLastmodified: kibanaVersion,
        },
        updatedAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
        apiKey: 'MTIzOmFiYw==',
        apiKeyOwner: 'elastic',
        apiKeyCreatedByUser: false,
        scheduledTaskId: 'task-123',
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
        executionStatus: {
          status: 'pending',
          lastDuration: 0,
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          error: null,
          warning: null,
        },
        lastEnabledAt: '2019-02-12T21:01:22.479Z',
        nextRun: '2019-02-12T21:01:32.479Z',
      },
      { id: '1', overwrite: true, version: '123', references: [] }
    );
    expect(taskManager.bulkEnable).toHaveBeenCalledWith(['task-123']);
  });

  test('does not leak stale uiamApiKey when enabling a rule without API key', async () => {
    const ruleWithStaleUiam = {
      ...existingRuleWithoutApiKey,
      attributes: {
        ...existingRuleWithoutApiKey.attributes,
        uiamApiKey: Buffer.from('stale-uiam:stale-key').toString('base64'),
      },
    };
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue(ruleWithStaleUiam);
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '123', name: '123', api_key: 'abc' },
    });
    await rulesClient.enableRule({ id: '1' });

    const writtenAttributes = unsecuredSavedObjectsClient.create.mock.calls[0][1];
    expect(writtenAttributes).not.toHaveProperty('uiamApiKey');
    expect(writtenAttributes).not.toHaveProperty('uiamApiKeyExternal');
  });

  test(`doesn't update already enabled alerts but ensures task is enabled`, async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValueOnce({
      ...existingRuleWithoutApiKey,
      attributes: {
        ...existingRuleWithoutApiKey.attributes,
        enabled: true,
      },
    });

    await rulesClient.enableRule({ id: '1' });
    expect(rulesClientParams.getUserName).not.toHaveBeenCalled();
    expect(rulesClientParams.createAPIKey).not.toHaveBeenCalled();
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(taskManager.bulkEnable).toHaveBeenCalledWith(['task-123']);
  });

  test('sets API key when createAPIKey returns one', async () => {
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '123', name: '123', api_key: 'abc' },
    });

    await rulesClient.enableRule({ id: '1' });
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      {
        name: 'name',
        schedule: { interval: '10s' },
        alertTypeId: 'myType',
        consumer: 'myApp',
        enabled: true,
        meta: {
          versionApiKeyLastmodified: kibanaVersion,
        },
        apiKey: Buffer.from('123:abc').toString('base64'),
        apiKeyOwner: 'elastic',
        scheduledTaskId: 'task-123',
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
        executionStatus: {
          status: 'pending',
          lastDuration: 0,
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          error: null,
          warning: null,
        },
        lastEnabledAt: '2019-02-12T21:01:22.479Z',
        nextRun: '2019-02-12T21:01:32.479Z',
      },
      { id: '1', overwrite: true, version: '123', references: [] }
    );
    expect(taskManager.bulkEnable).toHaveBeenCalledWith(['task-123']);
  });

  test('throws an error if API key creation throws', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue(existingRuleWithoutApiKey);

    rulesClientParams.createAPIKey.mockImplementation(() => {
      throw new Error('no');
    });
    await expect(
      async () => await rulesClient.enableRule({ id: '1' })
    ).rejects.toThrowErrorMatchingInlineSnapshot(`"Error creating API key for rule - no"`);
    expect(taskManager.bulkEnable).not.toHaveBeenCalled();
  });

  test('throws an error if API params do not match the schema', async () => {
    await expect(
      // @ts-ignore: this is what we are testing
      async () => await rulesClient.enableRule({ id: 1 })
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Error validating enable rule parameters - [id]: expected value of type [string] but got [number]"`
    );
    expect(taskManager.bulkEnable).not.toHaveBeenCalled();
  });

  test('falls back when failing to getDecryptedAsInternalUser', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockRejectedValue(new Error('Fail'));

    await rulesClient.enableRule({ id: '1' });
    expect(unsecuredSavedObjectsClient.get).toHaveBeenCalledWith(RULE_SAVED_OBJECT_TYPE, '1');
    expect(rulesClientParams.logger.error).toHaveBeenCalledWith(
      'enable(): Failed to load API key of alert 1: Fail'
    );
    expect(taskManager.bulkEnable).toHaveBeenCalledWith(['task-123']);
  });

  test('throws error when failing to load the saved object using SOC', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockRejectedValue(new Error('Fail'));
    unsecuredSavedObjectsClient.get.mockRejectedValueOnce(new Error('Fail to get'));

    await expect(rulesClient.enableRule({ id: '1' })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Fail to get"`
    );
    expect(rulesClientParams.getUserName).not.toHaveBeenCalled();
    expect(rulesClientParams.createAPIKey).not.toHaveBeenCalled();
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(taskManager.bulkEnable).not.toHaveBeenCalled();
  });

  test('throws when the rule saved object write fails', async () => {
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '123', name: '123', api_key: 'abc' },
    });
    unsecuredSavedObjectsClient.create.mockReset();
    unsecuredSavedObjectsClient.create.mockRejectedValueOnce(new Error('Fail to update'));

    await expect(rulesClient.enableRule({ id: '1' })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Fail to update"`
    );
    expect(rulesClientParams.getUserName).toHaveBeenCalled();
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
    expect(taskManager.bulkEnable).not.toHaveBeenCalled();
    // The rule already had a key, so enable reused it and minted nothing. The stored key is still
    // in use and must not be queued for invalidation.
    expect(bulkMarkApiKeysForInvalidation).not.toHaveBeenCalled();
  });

  test('invalidates the API key it minted when the rule saved object write fails', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue(existingRuleWithoutApiKey);
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '123', name: '123', api_key: 'abc' },
    });
    unsecuredSavedObjectsClient.create.mockReset();
    unsecuredSavedObjectsClient.create.mockRejectedValueOnce(new Error('Fail to update'));

    await expect(rulesClient.enableRule({ id: '1' })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Fail to update"`
    );
    // The rule never took ownership of the key, so nothing else would ever clean it up.
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      { apiKeys: ['MTIzOmFiYw=='] },
      expect.any(Object),
      expect.any(Object)
    );
    expect(taskManager.bulkEnable).not.toHaveBeenCalled();
  });

  test('does not invalidate the caller API key when the rule saved object write fails', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue(existingRuleWithoutApiKey);
    // Authenticating with an API key makes the rule borrow the caller's key rather than being
    // granted one of its own, so it belongs to the user and alerting must never revoke it.
    rulesClientParams.isAuthenticationTypeAPIKey.mockReturnValueOnce(true);
    rulesClientParams.getAuthenticationAPIKey.mockReturnValueOnce({
      apiKeysEnabled: true,
      result: { id: '123', name: '123', api_key: 'abc' },
    });
    unsecuredSavedObjectsClient.create.mockReset();
    unsecuredSavedObjectsClient.create.mockRejectedValueOnce(new Error('Fail to update'));

    await expect(rulesClient.enableRule({ id: '1' })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Fail to update"`
    );
    expect(bulkMarkApiKeysForInvalidation).not.toHaveBeenCalled();
  });

  test('enables task when scheduledTaskId is defined and task exists', async () => {
    await rulesClient.enableRule({ id: '1' });
    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalled();
    expect(taskManager.bulkEnable).toHaveBeenCalledWith(['task-123']);
  });

  test('throws error when enabling task fails', async () => {
    taskManager.bulkEnable.mockRejectedValueOnce(new Error('Failed to enable task'));
    await expect(rulesClient.enableRule({ id: '1' })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Failed to enable task"`
    );
    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalled();
  });

  test('schedules task when scheduledTaskId is defined but task with that ID does not', async () => {
    taskManager.schedule.mockResolvedValueOnce({
      id: '1',
      taskType: 'alerting:123',
      scheduledAt: new Date(),
      attempts: 1,
      status: TaskStatus.Idle,
      runAt: new Date(),
      startedAt: null,
      retryAt: null,
      state: {},
      params: {},
      ownerId: null,
    });
    taskManager.get.mockRejectedValueOnce(new Error('Failed to get task!'));
    await rulesClient.enableRule({ id: '1' });
    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.update).toHaveBeenCalledTimes(1);
    expect(taskManager.bulkEnable).not.toHaveBeenCalled();
    expect(taskManager.schedule).toHaveBeenCalledWith({
      id: '1',
      taskType: `alerting:myType`,
      params: {
        alertId: '1',
        spaceId: 'default',
        consumer: 'myApp',
      },
      schedule: {
        interval: '10s',
      },
      enabled: true,
      state: {
        alertInstances: {},
        alertTypeState: {},
        previousStartedAt: null,
      },
      scope: ['alerting'],
    });
    expect(unsecuredSavedObjectsClient.update).toHaveBeenNthCalledWith(
      1,
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        scheduledTaskId: '1',
      }
    );
  });

  test('schedules task when scheduledTaskId is not defined', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValueOnce({
      ...existingRule,
      attributes: { ...existingRule.attributes, scheduledTaskId: null },
    });
    taskManager.schedule.mockResolvedValueOnce({
      id: '1',
      taskType: 'alerting:123',
      scheduledAt: new Date(),
      attempts: 1,
      status: TaskStatus.Idle,
      runAt: new Date(),
      startedAt: null,
      retryAt: null,
      state: {},
      params: {},
      ownerId: null,
    });
    await rulesClient.enableRule({ id: '1' });
    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.update).toHaveBeenCalledTimes(1);
    expect(taskManager.bulkEnable).not.toHaveBeenCalled();
    expect(taskManager.schedule).toHaveBeenCalledWith({
      id: '1',
      taskType: `alerting:myType`,
      params: {
        alertId: '1',
        spaceId: 'default',
        consumer: 'myApp',
      },
      schedule: {
        interval: '10s',
      },
      enabled: true,
      state: {
        alertInstances: {},
        alertTypeState: {},
        previousStartedAt: null,
      },
      scope: ['alerting'],
    });
    expect(unsecuredSavedObjectsClient.update).toHaveBeenNthCalledWith(
      1,
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        scheduledTaskId: '1',
      }
    );
  });

  test('schedules task when task with scheduledTaskId exists but is unrecognized', async () => {
    taskManager.schedule.mockResolvedValueOnce({
      id: '1',
      taskType: 'alerting:123',
      scheduledAt: new Date(),
      attempts: 1,
      status: TaskStatus.Idle,
      runAt: new Date(),
      startedAt: null,
      retryAt: null,
      state: {},
      params: {},
      ownerId: null,
    });
    taskManager.get.mockResolvedValue({ ...mockTask, status: TaskStatus.Unrecognized });
    await rulesClient.enableRule({ id: '1' });
    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.update).toHaveBeenCalledTimes(1);
    expect(taskManager.bulkEnable).not.toHaveBeenCalled();
    expect(taskManager.removeIfExists).toHaveBeenCalledWith('task-123');
    expect(taskManager.schedule).toHaveBeenCalledWith({
      id: '1',
      taskType: `alerting:myType`,
      params: {
        alertId: '1',
        spaceId: 'default',
        consumer: 'myApp',
      },
      schedule: {
        interval: '10s',
      },
      enabled: true,
      state: {
        alertInstances: {},
        alertTypeState: {},
        previousStartedAt: null,
      },
      scope: ['alerting'],
    });
    expect(unsecuredSavedObjectsClient.update).toHaveBeenNthCalledWith(
      1,
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        scheduledTaskId: '1',
      }
    );
  });

  test('throws error when scheduling task fails', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValueOnce({
      ...existingRule,
      attributes: { ...existingRule.attributes, scheduledTaskId: null },
    });
    taskManager.schedule.mockRejectedValueOnce(new Error('Fail to schedule'));
    await expect(rulesClient.enableRule({ id: '1' })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Fail to schedule"`
    );
    expect(rulesClientParams.getUserName).toHaveBeenCalled();
    expect(taskManager.bulkEnable).not.toHaveBeenCalled();
    expect(taskManager.schedule).toHaveBeenCalled();
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.update).not.toHaveBeenCalled();
  });

  test('succeeds if conflict errors received when scheduling a task', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValueOnce({
      ...existingRule,
      attributes: { ...existingRule.attributes, scheduledTaskId: null },
    });
    taskManager.schedule.mockRejectedValueOnce(
      Object.assign(new Error('Conflict!'), { statusCode: 409 })
    );
    await rulesClient.enableRule({ id: '1' });
    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.update).toHaveBeenCalledTimes(1);
    expect(taskManager.bulkEnable).not.toHaveBeenCalled();
    expect(taskManager.schedule).toHaveBeenCalled();
  });

  test('throws error when update after scheduling task fails', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValueOnce({
      ...existingRule,
      attributes: { ...existingRule.attributes, scheduledTaskId: null },
    });
    taskManager.schedule.mockResolvedValueOnce({
      id: '1',
      taskType: 'alerting:123',
      scheduledAt: new Date(),
      attempts: 1,
      status: TaskStatus.Idle,
      runAt: new Date(),
      startedAt: null,
      retryAt: null,
      state: {},
      params: {},
      ownerId: null,
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      ...existingRule,
      attributes: {
        ...existingRule.attributes,
        enabled: true,
      },
    });
    unsecuredSavedObjectsClient.update.mockRejectedValueOnce(
      new Error('Fail to update after scheduling task')
    );

    await expect(rulesClient.enableRule({ id: '1' })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Fail to update after scheduling task"`
    );
    expect(rulesClientParams.getUserName).toHaveBeenCalled();
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.update).toHaveBeenCalledTimes(1);
    expect(taskManager.schedule).toHaveBeenCalled();
    expect(taskManager.bulkEnable).not.toHaveBeenCalled();
    expect(unsecuredSavedObjectsClient.update).toHaveBeenNthCalledWith(
      1,
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        scheduledTaskId: '1',
      }
    );
  });

  test('should clear flapping history for alerts generated by rule when enabled', async () => {
    rulesClientParams.getAlertIndicesAlias.mockReturnValue(['test-index']);
    (rulesClientParams.ruleTypeRegistry.get as jest.Mock).mockReturnValue({
      autoRecoverAlerts: true,
    });

    await rulesClient.enableRule({ id: '1' });

    expect(alertsService.clearAlertFlappingHistory).toHaveBeenCalledWith({
      indices: ['test-index'],
      ruleIds: ['1'],
    });
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
  });

  test('should not prevent rule from being enable if clearing flapping throws an error', async () => {
    rulesClientParams.getAlertIndicesAlias.mockReturnValue(['test-index']);
    (rulesClientParams.ruleTypeRegistry.get as jest.Mock).mockReturnValue({
      autoRecoverAlerts: true,
    });

    (rulesClientParams.alertsService?.clearAlertFlappingHistory as jest.Mock).mockRejectedValue(
      Error('something went wrong!')
    );

    await rulesClient.enableRule({ id: '1' });

    expect(rulesClientParams.alertsService?.clearAlertFlappingHistory).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
    expect(rulesClientParams.logger.error).toHaveBeenCalledWith(
      'Failure to clear flapping history from rule 1 - something went wrong!'
    );
  });

  test('should not try to clear flapping if the ruletype does not support lifecycle rules', async () => {
    rulesClientParams.getAlertIndicesAlias.mockReturnValue(['test-index']);
    (rulesClientParams.ruleTypeRegistry.get as jest.Mock).mockReturnValue({
      autoRecoverAlerts: false,
    });

    await rulesClient.enableRule({ id: '1' });
    expect(alertsService.clearAlertFlappingHistory).toHaveBeenCalledTimes(0);
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
  });

  describe('missing UIAM API key tagging', () => {
    test('should add missing UIAM API key tag when enabling rule with missing UIAM key in serverless', async () => {
      // Set up serverless environment
      const serverlessRulesClient = new RulesClient({
        ...rulesClientParams,
        isServerless: true,
        shouldGrantUiam: true,
        apiKeyType: ApiKeyType.UIAM,
      });

      encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
        id: '1',
        type: 'alert',
        attributes: {
          enabled: false,
          name: 'my rule',
          tags: ['existing-tag'],
          alertTypeId: 'myType',
          consumer: 'myApp',
          apiKey: Buffer.from('123:abc').toString('base64'),
          apiKeyOwner: 'elastic',
          apiKeyCreatedByUser: false,
          uiamApiKey: null, // Missing UIAM key
          schedule: { interval: '10s' },
          actions: [],
          scheduledTaskId: 'task-123',
        },
        references: [],
        version: '123',
      });

      await serverlessRulesClient.enableRule({ id: '1' });

      // Verify the missing UIAM key tag was added
      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
        'alert',
        expect.objectContaining({
          tags: expect.arrayContaining(['existing-tag', 'Missing Elastic Cloud API Key']),
        }),
        expect.anything()
      );
    });

    test('should add missing UIAM API key tag when enabling rule without existing API key', async () => {
      // Set up serverless environment
      const serverlessRulesClient = new RulesClient({
        ...rulesClientParams,
        isServerless: true,
        shouldGrantUiam: true,
        apiKeyType: ApiKeyType.UIAM,
        // To signal that user does not create the API key
        isAuthenticationTypeAPIKey: () => false,
      });

      encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
        id: '1',
        type: 'alert',
        attributes: {
          enabled: false,
          name: 'my rule',
          tags: ['existing-tag'],
          alertTypeId: 'myType',
          consumer: 'myApp',
          apiKey: null, // No existing API key
          apiKeyOwner: null,
          apiKeyCreatedByUser: null,
          schedule: { interval: '10s' },
          actions: [],
          scheduledTaskId: 'task-123',
        },
        references: [],
        version: '123',
      });

      // Mock API key creation where UIAM key is missing
      rulesClientParams.createAPIKey.mockResolvedValueOnce({
        apiKeysEnabled: true,
        result: { id: '123', name: '123', api_key: 'abc' },
        // uiamResult is undefined/null - UIAM key creation failed
      });

      await serverlessRulesClient.enableRule({ id: '1' });

      // Verify the missing UIAM key tag was added
      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
        'alert',
        expect.objectContaining({
          tags: expect.arrayContaining(['existing-tag', 'Missing Elastic Cloud API Key']),
        }),
        expect.anything()
      );
    });

    test('should not add missing UIAM API key tag when UIAM key is present', async () => {
      // Set up serverless environment
      const serverlessRulesClient = new RulesClient({
        ...rulesClientParams,
        isServerless: true,
        shouldGrantUiam: true,
        apiKeyType: ApiKeyType.UIAM,
      });

      encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
        id: '1',
        type: 'alert',
        attributes: {
          enabled: false,
          name: 'my rule',
          tags: ['existing-tag'],
          alertTypeId: 'myType',
          consumer: 'myApp',
          apiKey: Buffer.from('123:abc').toString('base64'),
          apiKeyOwner: 'elastic',
          apiKeyCreatedByUser: false,
          uiamApiKey: Buffer.from('456:def').toString('base64'), // UIAM key present
          schedule: { interval: '10s' },
          actions: [],
          scheduledTaskId: 'task-123',
        },
        references: [],
        version: '123',
      });

      await serverlessRulesClient.enableRule({ id: '1' });

      // Verify the missing UIAM key tag was NOT added
      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
        'alert',
        expect.objectContaining({
          tags: ['existing-tag'], // Only original tags
        }),
        expect.anything()
      );
    });

    test('should not add missing UIAM API key tag in non-serverless environment', async () => {
      // Non-serverless environment (default rulesClientParams.isServerless = false)
      const nonServerlessRulesClient = new RulesClient({
        ...rulesClientParams,
      });

      encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
        id: '1',
        type: 'alert',
        attributes: {
          enabled: false,
          name: 'my rule',
          tags: ['existing-tag'],
          alertTypeId: 'myType',
          consumer: 'myApp',
          apiKey: Buffer.from('123:abc').toString('base64'),
          apiKeyOwner: 'elastic',
          apiKeyCreatedByUser: false,
          uiamApiKey: null, // Missing UIAM key but not serverless
          schedule: { interval: '10s' },
          actions: [],
          scheduledTaskId: 'task-123',
        },
        references: [],
        version: '123',
      });

      await nonServerlessRulesClient.enableRule({ id: '1' });

      // Verify the missing UIAM key tag was NOT added (non-serverless)
      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
        'alert',
        expect.objectContaining({
          tags: ['existing-tag'], // Only original tags
        }),
        expect.anything()
      );
    });
  });
});
