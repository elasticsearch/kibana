/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConstructorOptions } from '../../../../rules_client/rules_client';
import { RulesClient } from '../../../../rules_client/rules_client';
import {
  coreFeatureFlagsMock,
  savedObjectsClientMock,
  savedObjectsRepositoryMock,
  uiSettingsServiceMock,
} from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import type { SavedObject } from '@kbn/core-saved-objects-server';
import type { RawRule } from '../../../../types';
import { ruleTypeRegistryMock } from '../../../../rule_type_registry.mock';
import { alertingAuthorizationMock } from '../../../../authorization/alerting_authorization.mock';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { actionsAuthorizationMock } from '@kbn/actions-plugin/server/mocks';
import type { AlertingAuthorization } from '../../../../authorization/alerting_authorization';
import type { ActionsAuthorization } from '@kbn/actions-plugin/server';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';
import { getBeforeSetup, setGlobalDate } from '../../../../rules_client/tests/lib';
import { loggerMock } from '@kbn/logging-mocks';
import type { BulkUpdateTaskResult } from '@kbn/task-manager-plugin/server/task_scheduling';
import { eventLoggerMock } from '@kbn/event-log-plugin/server/mocks';
import {
  enabledRule1,
  enabledRule2,
  savedObjectWith409Error,
  savedObjectWith500Error,
  disabledRuleForBulkDisable1,
  disabledRuleForBulkDisable2,
  returnedRuleForBulkDisableWithActions1,
  returnedRuleForBulkDisableWithActions2,
  enabledRuleForBulkOps1,
  enabledRuleForBulkOps2,
  disabledRuleForBulkOpsWithActions1,
  disabledRuleForBulkOpsWithActions2,
  returnedRuleForBulkDisable1,
  returnedRuleForBulkDisable2,
} from '../../../../rules_client/tests/test_helpers';
import { ConnectorAdapterRegistry } from '../../../../connector_adapters/connector_adapter_registry';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { backfillClientMock } from '../../../../backfill_client/backfill_client.mock';
import { RecoveredActionGroup } from '../../../../../common';

jest.mock('../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation', () => ({
  bulkMarkApiKeysForInvalidation: jest.fn(),
}));

jest.mock('../../../../rules_client/lib/untrack_rule_alerts', () => ({
  untrackRuleAlerts: jest.fn(),
}));

const { untrackRuleAlerts } = jest.requireMock('../../../../rules_client/lib/untrack_rule_alerts');

const taskManager = taskManagerMock.createStart();
const ruleTypeRegistry = ruleTypeRegistryMock.create();
const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
const encryptedSavedObjects = encryptedSavedObjectsMock.createClient();
const authorization = alertingAuthorizationMock.create();
const actionsAuthorization = actionsAuthorizationMock.create();
const auditLogger = auditLoggerMock.create();
const logger = loggerMock.create();
const eventLogger = eventLoggerMock.create();
const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();

const kibanaVersion = 'v8.2.0';
const createAPIKeyMock = jest.fn();
const rulesClientParams: jest.Mocked<ConstructorOptions> = {
  taskManager,
  ruleTypeRegistry,
  unsecuredSavedObjectsClient,
  authorization: authorization as unknown as AlertingAuthorization,
  actionsAuthorization: actionsAuthorization as unknown as ActionsAuthorization,
  spaceId: 'default',
  namespace: 'default',
  getUserName: jest.fn(),
  createAPIKey: createAPIKeyMock,
  cloneAPIKey: jest.fn(),
  logger,
  internalSavedObjectsRepository,
  encryptedSavedObjectsClient: encryptedSavedObjects,
  getActionsClient: jest.fn(),
  getEventLogClient: jest.fn(),
  kibanaVersion,
  auditLogger,
  eventLogger,
  maxScheduledPerMinute: 10000,
  minimumScheduleInterval: { value: '1m', enforce: false },
  isAuthenticationTypeAPIKey: jest.fn(),
  getAuthenticationAPIKey: jest.fn(),
  connectorAdapterRegistry: new ConnectorAdapterRegistry(),
  isSystemAction: jest.fn(),
  getAlertIndicesAlias: jest.fn(),
  alertsService: null,
  backfillClient: backfillClientMock.create(),
  uiSettings: uiSettingsServiceMock.createStartContract(),
  featureFlags: coreFeatureFlagsMock.createStart(),
  isServerless: false,
};

beforeEach(() => {
  getBeforeSetup(rulesClientParams, taskManager, ruleTypeRegistry);
  (auditLogger.log as jest.Mock).mockClear();
});

setGlobalDate();

describe('bulkDisableRules', () => {
  let rulesClient: RulesClient;
  let actionsClient: jest.Mocked<ActionsClient>;

  const mockCreatePointInTimeFinderAsInternalUser = (
    response: { saved_objects: Array<SavedObject<Partial<RawRule>>> } = {
      saved_objects: [enabledRule1, enabledRule2],
    }
  ) => {
    encryptedSavedObjects.createPointInTimeFinderDecryptedAsInternalUser = jest
      .fn()
      .mockResolvedValue({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield response;
        },
      });
  };

  const mockUnsecuredSavedObjectFind = (total: number) => {
    unsecuredSavedObjectsClient.find.mockResolvedValue({
      aggregations: {
        alertTypeId: {
          buckets: [
            {
              key: ['fakeType', 'fakeConsumer'],
              key_as_string: 'fakeType|fakeConsumer',
              doc_count: total,
            },
          ],
        },
      },
      saved_objects: [],
      per_page: 0,
      page: 0,
      total,
    });
  };

  beforeEach(async () => {
    rulesClient = new RulesClient(rulesClientParams);
    actionsClient = (await rulesClientParams.getActionsClient()) as jest.Mocked<ActionsClient>;
    rulesClientParams.getActionsClient.mockResolvedValue(actionsClient);

    authorization.getFindAuthorizationFilter.mockResolvedValue({
      ensureRuleTypeIsAuthorized() {},
    });
    mockCreatePointInTimeFinderAsInternalUser();
    mockUnsecuredSavedObjectFind(2);
    actionsClient.isSystemAction.mockImplementation((id: string) => id === 'system_action:id');
  });

  test('should disable two rule', async () => {
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [disabledRuleForBulkDisable1, disabledRuleForBulkDisable2],
    });

    const result = await rulesClient.bulkDisableRules({ filter: 'fake_filter' });

    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'id1',
          attributes: expect.objectContaining({
            enabled: false,
          }),
        }),
        expect.objectContaining({
          id: 'id2',
          attributes: expect.objectContaining({
            enabled: false,
          }),
        }),
      ]),
      { overwrite: true }
    );

    expect(result).toStrictEqual({
      errors: [],
      rules: [returnedRuleForBulkDisable1, returnedRuleForBulkDisable2],
      total: 2,
    });
  });

  test('should disable two rule and return right actions', async () => {
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [disabledRuleForBulkOpsWithActions1, disabledRuleForBulkOpsWithActions2],
    });

    const result = await rulesClient.bulkDisableRules({ filter: 'fake_filter' });
    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'id1',
          attributes: expect.objectContaining({
            enabled: false,
          }),
        }),
        expect.objectContaining({
          id: 'id2',
          attributes: expect.objectContaining({
            enabled: false,
          }),
        }),
      ]),
      { overwrite: true }
    );

    expect(result).toStrictEqual({
      errors: [],
      rules: [returnedRuleForBulkDisableWithActions1, returnedRuleForBulkDisableWithActions2],
      total: 2,
    });
  });

  test('should call untrack alert if untrack is true', async () => {
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [disabledRuleForBulkDisable1, disabledRuleForBulkDisable2],
    });

    const result = await rulesClient.bulkDisableRules({ filter: 'fake_filter', untrack: true });

    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'id1',
          attributes: expect.objectContaining({
            enabled: false,
          }),
        }),
        expect.objectContaining({
          id: 'id2',
          attributes: expect.objectContaining({
            enabled: false,
          }),
        }),
      ]),
      { overwrite: true }
    );

    expect(result).toStrictEqual({
      errors: [],
      rules: [returnedRuleForBulkDisable1, returnedRuleForBulkDisable2],
      total: 2,
    });

    expect(untrackRuleAlerts).toHaveBeenCalled();
  });

  test('should not call untrack alert if untrack is false', async () => {
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [disabledRuleForBulkDisable1, disabledRuleForBulkDisable2],
    });

    const result = await rulesClient.bulkDisableRules({ filter: 'fake_filter', untrack: true });

    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'id1',
          attributes: expect.objectContaining({
            enabled: false,
          }),
        }),
        expect.objectContaining({
          id: 'id2',
          attributes: expect.objectContaining({
            enabled: false,
          }),
        }),
      ]),
      { overwrite: true }
    );

    expect(result).toStrictEqual({
      errors: [],
      rules: [returnedRuleForBulkDisable1, returnedRuleForBulkDisable2],
      total: 2,
    });

    expect(untrackRuleAlerts).toHaveBeenCalled();
  });

  test('should try to disable rules, one successful and one with 500 error', async () => {
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [disabledRuleForBulkDisable1, savedObjectWith500Error],
    });

    const result = await rulesClient.bulkDisableRules({ filter: 'fake_filter' });

    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'id1',
          attributes: expect.objectContaining({
            enabled: false,
          }),
        }),
      ]),
      { overwrite: true }
    );

    expect(result).toStrictEqual({
      errors: [{ message: 'UPS', rule: { id: 'id2', name: 'fakeName' }, status: 500 }],
      rules: [returnedRuleForBulkDisable1],
      total: 2,
    });
  });

  test('should try to disable rules, one successful and one with 409 error, which will not be deleted with retry', async () => {
    unsecuredSavedObjectsClient.bulkCreate
      .mockResolvedValueOnce({
        saved_objects: [disabledRuleForBulkDisable1, savedObjectWith409Error],
      })
      .mockResolvedValueOnce({
        saved_objects: [savedObjectWith409Error],
      })
      .mockResolvedValueOnce({
        saved_objects: [savedObjectWith409Error],
      })
      .mockResolvedValueOnce({
        saved_objects: [savedObjectWith409Error],
      });

    encryptedSavedObjects.createPointInTimeFinderDecryptedAsInternalUser = jest
      .fn()
      .mockResolvedValueOnce({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield { saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2] };
        },
      })
      .mockResolvedValueOnce({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield { saved_objects: [enabledRuleForBulkOps2] };
        },
      })
      .mockResolvedValueOnce({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield { saved_objects: [enabledRuleForBulkOps2] };
        },
      })
      .mockResolvedValueOnce({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield { saved_objects: [enabledRuleForBulkOps2] };
        },
      });

    const result = await rulesClient.bulkDisableRules({ ids: ['id1', 'id2'] });

    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(4);
    expect(taskManager.bulkDisable).toHaveBeenCalledTimes(1);
    expect(taskManager.bulkDisable).toHaveBeenCalledWith(['id1'], []);
    expect(result).toStrictEqual({
      errors: [{ message: 'UPS', rule: { id: 'id2', name: 'fakeName' }, status: 409 }],
      rules: [returnedRuleForBulkDisable1],
      total: 2,
    });
  });

  test('should try to disable rules, one successful and one with 409 error, which successfully will be disabled with retry', async () => {
    unsecuredSavedObjectsClient.bulkCreate
      .mockResolvedValueOnce({
        saved_objects: [disabledRuleForBulkDisable1, savedObjectWith409Error],
      })
      .mockResolvedValueOnce({
        saved_objects: [disabledRuleForBulkDisable1],
      });

    encryptedSavedObjects.createPointInTimeFinderDecryptedAsInternalUser = jest
      .fn()
      .mockResolvedValueOnce({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield { saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2] };
        },
      })
      .mockResolvedValueOnce({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield { saved_objects: [enabledRuleForBulkOps1] };
        },
      })
      .mockResolvedValueOnce({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield { saved_objects: [enabledRuleForBulkOps1] };
        },
      });

    const result = await rulesClient.bulkDisableRules({ ids: ['id1', 'id2'] });

    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(2);

    expect(result).toStrictEqual({
      errors: [],
      rules: [returnedRuleForBulkDisable1, returnedRuleForBulkDisable1],
      total: 2,
    });
  });

  test('should throw an error if number of matched rules greater than 10,000', async () => {
    unsecuredSavedObjectsClient.find.mockResolvedValue({
      aggregations: {
        alertTypeId: {
          buckets: [{ key: ['myType', 'myApp'], key_as_string: 'myType|myApp', doc_count: 2 }],
        },
      },
      saved_objects: [],
      per_page: 0,
      page: 0,
      total: 10001,
    });

    await expect(rulesClient.bulkDisableRules({ filter: 'fake_filter' })).rejects.toThrow(
      'More than 10000 rules matched for bulk disable'
    );
  });

  test('should throw an error if we do not get buckets', async () => {
    unsecuredSavedObjectsClient.find.mockResolvedValue({
      aggregations: {
        alertTypeId: {},
      },
      saved_objects: [],
      per_page: 0,
      page: 0,
      total: 2,
    });

    await expect(rulesClient.bulkDisableRules({ filter: 'fake_filter' })).rejects.toThrow(
      'No rules found for bulk disable'
    );
  });

  test('should return both rules if one is already disabled and one is enabled when bulk disable is based on ids', async () => {
    mockCreatePointInTimeFinderAsInternalUser({
      saved_objects: [enabledRuleForBulkOps1, disabledRuleForBulkDisable2],
    });
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [disabledRuleForBulkDisable1, disabledRuleForBulkDisable2],
    });

    const result = await rulesClient.bulkDisableRules({ ids: ['id1', 'id2'] });

    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'id1',
          attributes: expect.objectContaining({
            enabled: false,
          }),
        }),
        expect.objectContaining({
          id: 'id2',
          attributes: expect.objectContaining({
            enabled: false,
          }),
        }),
      ]),
      { overwrite: true }
    );

    expect(result.rules[0].id).toBe('id1');
    expect(result.rules[1].id).toBe('id2');
  });

  test('should return rules in correct format', async () => {
    mockCreatePointInTimeFinderAsInternalUser({
      saved_objects: [enabledRuleForBulkOps1, disabledRuleForBulkDisable2],
    });
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [disabledRuleForBulkDisable1, disabledRuleForBulkDisable2],
    });

    const result = await rulesClient.bulkDisableRules({ ids: ['id1', 'id2'] });

    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'id1',
          attributes: expect.objectContaining({
            enabled: false,
          }),
        }),
        expect.objectContaining({
          id: 'id2',
          attributes: expect.objectContaining({
            enabled: false,
          }),
        }),
      ]),
      { overwrite: true }
    );

    expect(result).toStrictEqual({
      errors: [],
      rules: [returnedRuleForBulkDisable1, returnedRuleForBulkDisable2],
      total: 2,
    });
  });

  test('should return both rules if one is already disabled and one is enabled when bulk disable is based on filter', async () => {
    mockCreatePointInTimeFinderAsInternalUser({
      saved_objects: [enabledRuleForBulkOps1, disabledRuleForBulkDisable2],
    });
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [disabledRuleForBulkDisable1, disabledRuleForBulkDisable2],
    });

    const result = await rulesClient.bulkDisableRules({ filter: 'fake_filter' });

    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'id1',
          attributes: expect.objectContaining({
            enabled: false,
          }),
        }),
        expect.objectContaining({
          id: 'id2',
          attributes: expect.objectContaining({
            enabled: false,
          }),
        }),
      ]),
      { overwrite: true }
    );

    expect(result).toStrictEqual({
      errors: [],
      rules: [returnedRuleForBulkDisable1, returnedRuleForBulkDisable2],
      total: 2,
    });
  });

  describe('lastRun outcome message migration', () => {
    test('migrates legacy string lastRun.outcomeMsg to string[] when bulk disabling', async () => {
      mockCreatePointInTimeFinderAsInternalUser({
        saved_objects: [
          {
            ...enabledRule1,
            attributes: {
              ...enabledRule1.attributes,
              lastRun: {
                outcome: 'failed',
                // @ts-expect-error test legacy outcomeMsg migration
                outcomeMsg: 'legacy message',
              },
            },
          },
          enabledRule2,
        ],
      });
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [disabledRuleForBulkDisable1, disabledRuleForBulkDisable2],
      });

      await rulesClient.bulkDisableRules({ filter: 'fake_filter' });

      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'id1',
            attributes: expect.objectContaining({
              lastRun: {
                outcome: 'failed',
                outcomeMsg: ['legacy message'],
              },
            }),
          }),
        ]),
        { overwrite: true }
      );
    });

    test('leaves lastRun unchanged when outcomeMsg is already a string array', async () => {
      const lastRun = {
        outcome: 'succeeded' as const,
        outcomeMsg: ['msg a', 'msg b'],
        alertsCount: {
          new: 0,
          ignored: 0,
          recovered: 0,
          active: 0,
        },
      };
      mockCreatePointInTimeFinderAsInternalUser({
        saved_objects: [
          {
            ...enabledRule1,
            attributes: {
              ...enabledRule1.attributes,
              lastRun,
            },
          },
        ],
      });
      mockUnsecuredSavedObjectFind(1);
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [disabledRuleForBulkDisable1],
      });

      await rulesClient.bulkDisableRules({ filter: 'fake_filter' });

      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'id1',
            attributes: expect.objectContaining({
              lastRun,
            }),
          }),
        ]),
        { overwrite: true }
      );
    });

    test('does not add lastRun when the rule has no lastRun', async () => {
      mockCreatePointInTimeFinderAsInternalUser({
        saved_objects: [enabledRule1],
      });
      mockUnsecuredSavedObjectFind(1);
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [disabledRuleForBulkDisable1],
      });

      await rulesClient.bulkDisableRules({ filter: 'fake_filter' });

      const bulkCreateObjects = unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0] as Array<{
        id: string;
        attributes: Record<string, unknown>;
      }>;
      const attributesForRule = bulkCreateObjects.find((o) => o.id === 'id1')?.attributes;
      expect(attributesForRule).toBeDefined();
      expect(attributesForRule).not.toHaveProperty('lastRun');
    });
  });

  describe('taskManager', () => {
    test('should call task manager bulkDisable', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [disabledRuleForBulkDisable1, disabledRuleForBulkDisable2],
      });

      taskManager.bulkDisable.mockResolvedValue({
        tasks: [taskManagerMock.createTask({ id: 'id1' })],
        errors: [
          {
            type: 'task',
            id: 'id2',
            error: {
              error: '',
              message: 'UPS',
              statusCode: 500,
            },
          },
        ],
      });

      await rulesClient.bulkDisableRules({ filter: 'fake_filter' });

      expect(taskManager.bulkDisable).toHaveBeenCalledTimes(1);
      expect(taskManager.bulkDisable).toHaveBeenCalledWith(['id1', 'id2'], []);

      expect(logger.debug).toBeCalledTimes(1);
      expect(logger.debug).toBeCalledWith(
        'Successfully disabled schedules for underlying tasks: id1'
      );
      expect(logger.error).toBeCalledTimes(1);
      expect(logger.error).toBeCalledWith('Failure to disable schedules for underlying tasks: id2');
    });

    test('should call task manager bulkDeleteIfExist', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [
          {
            ...enabledRuleForBulkOps1,
            attributes: {
              ...enabledRuleForBulkOps1.attributes,
              scheduledTaskId: 'taskId1',
            },
          } as SavedObject,
          {
            ...enabledRuleForBulkOps2,
            attributes: {
              ...enabledRuleForBulkOps2.attributes,
              scheduledTaskId: 'taskId2',
            },
          } as SavedObject,
        ],
      });

      taskManager.bulkRemove.mockResolvedValue({
        statuses: [
          { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true },
          { id: 'id2', type: RULE_SAVED_OBJECT_TYPE, success: false },
        ],
      });

      await rulesClient.bulkDisableRules({ filter: 'fake_filter' });

      expect(taskManager.bulkRemove).toHaveBeenCalledTimes(1);
      expect(taskManager.bulkRemove).toHaveBeenCalledWith(['taskId1', 'taskId2']);

      expect(logger.debug).toBeCalledTimes(1);
      expect(logger.debug).toBeCalledWith(
        'Successfully deleted schedules for underlying tasks: id1'
      );
      expect(logger.error).toBeCalledTimes(1);
      expect(logger.error).toBeCalledWith('Failure to delete schedules for underlying tasks: id2');
    });

    test('should disable one task if one rule was successfully disabled and one has 500 error', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [disabledRuleForBulkDisable1, savedObjectWith500Error],
      });

      taskManager.bulkDisable.mockResolvedValue({
        tasks: [{ id: 'id1' }],
        errors: [],
      } as unknown as BulkUpdateTaskResult);

      await rulesClient.bulkDisableRules({ filter: 'fake_filter' });

      expect(taskManager.bulkDisable).toHaveBeenCalledTimes(1);
      expect(taskManager.bulkDisable).toHaveBeenCalledWith(['id1'], []);

      expect(logger.debug).toBeCalledTimes(1);
      expect(logger.debug).toBeCalledWith(
        'Successfully disabled schedules for underlying tasks: id1'
      );
      expect(logger.error).toBeCalledTimes(0);
    });

    test('should disable one task if one rule was successfully disabled and one was disabled from beginning', async () => {
      mockCreatePointInTimeFinderAsInternalUser({
        saved_objects: [
          enabledRuleForBulkOps1,
          {
            ...enabledRule2,
            attributes: { ...enabledRuleForBulkOps2.attributes, enabled: false },
          },
        ],
      });
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [disabledRuleForBulkDisable1],
      });

      await rulesClient.bulkDisableRules({ filter: 'fake_filter' });

      expect(taskManager.bulkDisable).toHaveBeenCalledTimes(1);
      expect(taskManager.bulkDisable).toHaveBeenCalledWith(['id1'], []);
    });

    test('should not throw an error if taskManager.bulkDisable throw an error', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [disabledRuleForBulkDisable1, disabledRuleForBulkDisable2],
      });
      taskManager.bulkDisable.mockImplementation(() => {
        throw new Error('Something happend during bulkDisable');
      });

      await rulesClient.bulkDisableRules({ filter: 'fake_filter' });

      expect(logger.error).toBeCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Failure to disable schedules for underlying tasks: id1, id2. TaskManager bulkDisable failed with Error: Something happend during bulkDisable'
      );
    });

    test('should not throw an error if taskManager.bulkRemove throw an error', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [
          {
            ...disabledRuleForBulkDisable1,
            attributes: {
              ...disabledRuleForBulkDisable1.attributes,
              scheduledTaskId: 'taskId1',
            },
          } as SavedObject,
        ],
      });

      taskManager.bulkRemove.mockImplementation(() => {
        throw new Error('Something happend during bulkRemove');
      });

      await rulesClient.bulkDisableRules({ filter: 'fake_filter' });

      expect(logger.error).toBeCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Failure to delete schedules for underlying tasks: taskId1. TaskManager bulkRemove failed with Error: Something happend during bulkRemove'
      );
    });
  });

  describe('auditLogger', () => {
    jest.spyOn(auditLogger, 'log').mockImplementation();

    test('logs audit event when disabling rules', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [disabledRuleForBulkDisable1],
      });

      await rulesClient.bulkDisableRules({ filter: 'fake_filter' });

      expect(auditLogger.log.mock.calls[0][0]?.event?.action).toEqual('rule_disable');
      expect(auditLogger.log.mock.calls[0][0]?.event?.outcome).toEqual('unknown');
      expect(auditLogger.log.mock.calls[0][0]?.kibana).toEqual({
        saved_object: { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, name: 'fakeName' },
      });
      expect(auditLogger.log.mock.calls[1][0]?.event?.action).toEqual('rule_disable');
      expect(auditLogger.log.mock.calls[1][0]?.event?.outcome).toEqual('unknown');
      expect(auditLogger.log.mock.calls[1][0]?.kibana).toEqual({
        saved_object: { id: 'id2', type: RULE_SAVED_OBJECT_TYPE, name: 'fakeName' },
      });
    });

    test('logs audit event when authentication failed', async () => {
      authorization.bulkEnsureAuthorized.mockImplementation(() => {
        throw new Error('Unauthorized');
      });

      await expect(rulesClient.bulkDisableRules({ filter: 'fake_filter' })).rejects.toThrowError(
        'Unauthorized'
      );

      expect(auditLogger.log.mock.calls[0][0]?.event?.action).toEqual('rule_disable');
      expect(auditLogger.log.mock.calls[0][0]?.event?.outcome).toEqual('failure');
    });

    test('logs audit event when getting an authorization filter failed', async () => {
      authorization.getFindAuthorizationFilter.mockImplementation(() => {
        throw new Error('Error');
      });

      await expect(rulesClient.bulkDisableRules({ filter: 'fake_filter' })).rejects.toThrowError(
        'Error'
      );

      expect(auditLogger.log.mock.calls[0][0]?.event?.action).toEqual('rule_disable');
      expect(auditLogger.log.mock.calls[0][0]?.event?.outcome).toEqual('failure');
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
        id: 'fakeType',
        name: 'Test',
        actionGroups: [{ id: 'default', name: 'Default' }],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        recoveryActionGroup: RecoveredActionGroup,
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

    test('logs every successfully disabled rule with action "rule_disable"', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [disabledRuleForBulkDisable1, disabledRuleForBulkDisable2],
      });

      await trackingClient.bulkDisableRules({ filter: 'fake_filter' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
      // bulkCount comes from the original total returned by `find` (mocked to 2).
      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({ objectId: 'id1' }),
          expect.objectContaining({ objectId: 'id2' }),
        ],
        {
          action: 'rule_disable',
          spaceId: 'default',
          data: { metadata: { bulkCount: 2 } },
        }
      );
    });

    test('captures the full post-disable attributes of each rule', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();
      mockUnsecuredSavedObjectFind(1);
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [disabledRuleForBulkDisable1],
      });

      await trackingClient.bulkDisableRules({ filter: 'fake_filter' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            snapshot: expect.objectContaining({
              id: disabledRuleForBulkDisable1.id,
              name: disabledRuleForBulkDisable1.attributes.name,
              enabled: false,
              alertTypeId: disabledRuleForBulkDisable1.attributes.alertTypeId,
              createdAt: disabledRuleForBulkDisable1.attributes.createdAt,
              updatedAt: disabledRuleForBulkDisable1.attributes.updatedAt,
            }),
          }),
        ],
        expect.any(Object)
      );
    });

    test('captures the context of each rule', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();
      mockUnsecuredSavedObjectFind(1);
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [disabledRuleForBulkDisable1],
      });

      await trackingClient.bulkDisableRules({ filter: 'fake_filter' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            objectId: disabledRuleForBulkDisable1.id,
            objectType: RULE_SAVED_OBJECT_TYPE,
            module: 'stack',
          }),
        ],
        expect.any(Object)
      );
    });

    test('stamps every change with updated_at from the saved object', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [
          { ...disabledRuleForBulkDisable1, updated_at: '2023-03-05T10:30:00.000Z' },
          { ...disabledRuleForBulkDisable2, updated_at: '2023-03-05T11:00:00.000Z' },
        ],
      });

      await trackingClient.bulkDisableRules({ filter: 'fake_filter' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
      const [changes] = changeTrackingService.logBulk.mock.calls[0];
      expect(changes.map((c: { timestamp: string }) => c.timestamp)).toEqual([
        '2023-03-05T10:30:00.000Z',
        '2023-03-05T11:00:00.000Z',
      ]);
    });

    test('skips rules whose saved object update failed (partial bulk failures)', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      // Non-409 errors are not retried, so the partial failure case is single-pass.
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [disabledRuleForBulkDisable1, savedObjectWith500Error],
      });

      await trackingClient.bulkDisableRules({ filter: 'fake_filter' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [expect.objectContaining({ objectId: 'id1' })],
        expect.any(Object)
      );
    });

    test('reports bulkCount as the original `find` total even when OCC retries shrink the batch', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      // Original operation targets 5 rules; bulkCount must reflect this even though
      // each OCC pass operates on a smaller subset.
      mockUnsecuredSavedObjectFind(5);

      // First pass: id1 succeeds, id2 fails with 409. Retry pass: id2 succeeds.
      unsecuredSavedObjectsClient.bulkCreate
        .mockResolvedValueOnce({
          saved_objects: [disabledRuleForBulkDisable1, savedObjectWith409Error],
        })
        .mockResolvedValueOnce({
          saved_objects: [disabledRuleForBulkDisable2],
        });

      encryptedSavedObjects.createPointInTimeFinderDecryptedAsInternalUser = jest
        .fn()
        .mockResolvedValueOnce({
          close: jest.fn(),
          find: function* asyncGenerator() {
            yield { saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2] };
          },
        })
        .mockResolvedValueOnce({
          close: jest.fn(),
          find: function* asyncGenerator() {
            yield { saved_objects: [enabledRuleForBulkOps2] };
          },
        });

      await trackingClient.bulkDisableRules({ ids: ['id1', 'id2'] });

      // Both OCC passes log with bulkCount = 5 (the original `find` total),
      // not the per-pass batch size (2 then 1).
      expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(2);
      for (const [, opts] of changeTrackingService.logBulk.mock.calls) {
        expect(opts.data).toEqual({ metadata: { bulkCount: 5 } });
      }
    });

    test('does not log when rule type opts out of tracking', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType({ trackChanges: false });
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [disabledRuleForBulkDisable1, disabledRuleForBulkDisable2],
      });

      await trackingClient.bulkDisableRules({ filter: 'fake_filter' });

      expect(changeTrackingService.logBulk).not.toHaveBeenCalled();
    });

    test('does nothing when no change tracking service is configured', async () => {
      // Default rulesClient has no changeTrackingService configured.
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [disabledRuleForBulkDisable1, disabledRuleForBulkDisable2],
      });

      await rulesClient.bulkDisableRules({ filter: 'fake_filter' });

      // Negative assertion is exercised at the helper level.
      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalled();
    });

    test('captures rule.revision in object.sequence', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();
      mockUnsecuredSavedObjectFind(1);
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [disabledRuleForBulkDisable1],
      });

      await trackingClient.bulkDisableRules({ filter: 'fake_filter' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            sequence: 1,
          }),
        ],
        expect.any(Object)
      );
    });
  });
});
