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
import type { SavedObject } from '@kbn/core/server';
import type { RawRule } from '../../../../types';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
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
import type { ActionsClient } from '@kbn/actions-plugin/server';
import {
  disabledRule1,
  disabledRule2,
  disabledRuleWithAction1,
  disabledRuleWithAction2,
  savedObjectWith409Error,
  savedObjectWith500Error,
  enabledRuleForBulkOpsWithActions1,
  enabledRuleForBulkOpsWithActions2,
  returnedRuleForBulkEnableWithActions1,
  returnedRuleForBulkEnableWithActions2,
  enabledRuleForBulkOps1,
  enabledRuleForBulkOps2,
  returnedRuleForBulkOps1,
  returnedRuleForBulkOps2,
} from '../../../../rules_client/tests/test_helpers';
import { TaskStatus } from '@kbn/task-manager-plugin/server';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { ConnectorAdapterRegistry } from '../../../../connector_adapters/connector_adapter_registry';
import { backfillClientMock } from '../../../../backfill_client/backfill_client.mock';
import { alertsServiceMock } from '../../../../alerts_service/alerts_service.mock';
import { RecoveredActionGroup } from '../../../../../common';

jest.mock('../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation', () => ({
  bulkMarkApiKeysForInvalidation: jest.fn(),
}));

jest.mock('../get_schedule_frequency', () => ({
  validateScheduleLimit: jest.fn(),
}));

const taskManager = taskManagerMock.createStart();
const ruleTypeRegistry = ruleTypeRegistryMock.create();
const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
const encryptedSavedObjects = encryptedSavedObjectsMock.createClient();
const authorization = alertingAuthorizationMock.create();
const actionsAuthorization = actionsAuthorizationMock.create();
const auditLogger = auditLoggerMock.create();
const logger = loggerMock.create();
const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();
const alertsService = alertsServiceMock.create();

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
  maxScheduledPerMinute: 10000,
  minimumScheduleInterval: { value: '1m', enforce: false },
  isAuthenticationTypeAPIKey: jest.fn(),
  getAuthenticationAPIKey: jest.fn(),
  connectorAdapterRegistry: new ConnectorAdapterRegistry(),
  isSystemAction: jest.fn(),
  getAlertIndicesAlias: jest.fn(),
  alertsService,
  backfillClient: backfillClientMock.create(),
  uiSettings: uiSettingsServiceMock.createStartContract(),
  featureFlags: coreFeatureFlagsMock.createStart(),
  isServerless: false,
};

beforeEach(() => {
  getBeforeSetup(rulesClientParams, taskManager, ruleTypeRegistry);
  taskManager.bulkEnable.mockImplementation(
    async () =>
      ({
        tasks: [],
        errors: [],
      } as unknown as BulkUpdateTaskResult)
  );
  (auditLogger.log as jest.Mock).mockClear();
});

setGlobalDate();

describe('bulkEnableRules', () => {
  let rulesClient: RulesClient;
  let actionsClient: jest.Mocked<ActionsClient>;

  const mockCreatePointInTimeFinderAsInternalUser = (
    response: { saved_objects: Array<SavedObject<Partial<RawRule>>> } = {
      saved_objects: [disabledRule1, disabledRule2],
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
    authorization.getFindAuthorizationFilter.mockResolvedValue({
      ensureRuleTypeIsAuthorized() {},
    });
    mockCreatePointInTimeFinderAsInternalUser();
    mockUnsecuredSavedObjectFind(2);
    actionsClient = (await rulesClientParams.getActionsClient()) as jest.Mocked<ActionsClient>;
    actionsClient.isSystemAction.mockImplementation((id: string) => id === 'system_action:id');
    rulesClientParams.getActionsClient.mockResolvedValue(actionsClient);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('should enable two rules', async () => {
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
    });

    const result = await rulesClient.bulkEnableRules({ filter: 'fake_filter' });

    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'id1',
          attributes: expect.objectContaining({
            enabled: true,
            lastEnabledAt: '2019-02-12T21:01:22.479Z',
          }),
        }),
        expect.objectContaining({
          id: 'id2',
          attributes: expect.objectContaining({
            enabled: true,
            lastEnabledAt: '2019-02-12T21:01:22.479Z',
          }),
        }),
      ]),
      { overwrite: true }
    );

    expect(taskManager.bulkSchedule).not.toHaveBeenCalled();

    expect(taskManager.bulkEnable).toHaveBeenCalledTimes(1);
    expect(taskManager.bulkEnable).toHaveBeenCalledWith(['id1', 'id2']);

    expect(result).toStrictEqual({
      errors: [],
      rules: [returnedRuleForBulkOps1, returnedRuleForBulkOps2],
      total: 2,
      taskIdsFailedToBeEnabled: [],
    });
  });

  test('does not leak stale uiamApiKey when bulk enabling a rule without apiKey', async () => {
    const disabledRuleWithStaleUiam: SavedObject<RawRule> = {
      ...disabledRule1,
      attributes: {
        ...disabledRule1.attributes,
        apiKey: null,
        apiKeyOwner: null,
        uiamApiKey: Buffer.from('stale-uiam:stale-key').toString('base64'),
      },
    } as unknown as SavedObject<RawRule>;

    mockCreatePointInTimeFinderAsInternalUser({
      saved_objects: [disabledRuleWithStaleUiam],
    });
    mockUnsecuredSavedObjectFind(1);

    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '123', name: '123', api_key: 'abc' },
    });
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [enabledRuleForBulkOps1],
    });

    await rulesClient.bulkEnableRules({ filter: 'fake_filter' });

    const bulkCreatePayload = unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0];
    const writtenAttributes = bulkCreatePayload[0].attributes;
    expect(writtenAttributes).not.toHaveProperty('uiamApiKey');
  });

  test('should enable two rules and return right actions', async () => {
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [enabledRuleForBulkOpsWithActions1, enabledRuleForBulkOpsWithActions2],
    });

    const result = await rulesClient.bulkEnableRules({ filter: 'fake_filter' });

    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'id1',
          attributes: expect.objectContaining({
            enabled: true,
          }),
        }),
        expect.objectContaining({
          id: 'id2',
          attributes: expect.objectContaining({
            enabled: true,
          }),
        }),
      ]),
      { overwrite: true }
    );

    expect(result).toStrictEqual({
      errors: [],
      rules: [returnedRuleForBulkEnableWithActions1, returnedRuleForBulkEnableWithActions2],
      taskIdsFailedToBeEnabled: [],
      total: 2,
    });
  });

  test('should try to enable rules, one successful and one with 500 error', async () => {
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [enabledRuleForBulkOps1, savedObjectWith500Error],
    });

    const result = await rulesClient.bulkEnableRules({ filter: 'fake_filter' });

    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'id1',
          attributes: expect.objectContaining({
            enabled: true,
          }),
        }),
      ]),
      { overwrite: true }
    );

    expect(result).toStrictEqual({
      errors: [{ message: 'UPS', rule: { id: 'id2', name: 'fakeName' }, status: 500 }],
      rules: [returnedRuleForBulkOps1],
      total: 2,
      taskIdsFailedToBeEnabled: [],
    });
  });

  test('should try to enable rules, one successful and one with 409 error, which will not be deleted with retry', async () => {
    unsecuredSavedObjectsClient.bulkCreate
      .mockResolvedValueOnce({
        saved_objects: [enabledRuleForBulkOps1, savedObjectWith409Error],
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
          yield { saved_objects: [disabledRule1, disabledRule2] };
        },
      })
      .mockResolvedValueOnce({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield { saved_objects: [disabledRule2] };
        },
      })
      .mockResolvedValueOnce({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield { saved_objects: [disabledRule2] };
        },
      })
      .mockResolvedValueOnce({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield { saved_objects: [disabledRule2] };
        },
      });

    const result = await rulesClient.bulkEnableRules({ ids: ['id1', 'id2'] });

    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(4);
    expect(result).toStrictEqual({
      errors: [{ message: 'UPS', rule: { id: 'id2', name: 'fakeName' }, status: 409 }],
      rules: [returnedRuleForBulkOps1],
      total: 2,
      taskIdsFailedToBeEnabled: [],
    });
  });

  test('should try to enable rules, one successful and one with 409 error, which successfully will be deleted with retry', async () => {
    unsecuredSavedObjectsClient.bulkCreate
      .mockResolvedValueOnce({
        saved_objects: [enabledRuleForBulkOps1, savedObjectWith409Error],
      })
      .mockResolvedValueOnce({
        saved_objects: [enabledRuleForBulkOps2],
      });

    encryptedSavedObjects.createPointInTimeFinderDecryptedAsInternalUser = jest
      .fn()
      .mockResolvedValueOnce({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield { saved_objects: [disabledRule1, disabledRule2] };
        },
      })
      .mockResolvedValueOnce({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield { saved_objects: [disabledRule2] };
        },
      })
      .mockResolvedValueOnce({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield { saved_objects: [disabledRule2] };
        },
      });

    const result = await rulesClient.bulkEnableRules({ ids: ['id1', 'id2'] });

    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(2);
    expect(result).toStrictEqual({
      errors: [],
      rules: [returnedRuleForBulkOps1, returnedRuleForBulkOps2],
      total: 2,
      taskIdsFailedToBeEnabled: [],
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

    await expect(rulesClient.bulkEnableRules({ filter: 'fake_filter' })).rejects.toThrow(
      'More than 10000 rules matched for bulk enable'
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

    await expect(rulesClient.bulkEnableRules({ filter: 'fake_filter' })).rejects.toThrow(
      'No rules found for bulk enable'
    );
  });

  test('should throw if there are actions, but do not have execute permissions', async () => {
    mockCreatePointInTimeFinderAsInternalUser({
      saved_objects: [disabledRuleWithAction1, disabledRuleWithAction2],
    });

    actionsAuthorization.ensureAuthorized.mockImplementation(() => {
      throw new Error('UPS');
    });

    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [],
    });

    const result = await rulesClient.bulkEnableRules({ filter: 'fake_filter' });

    expect(unsecuredSavedObjectsClient.bulkCreate).toBeCalledWith([], { overwrite: true });
    expect(result).toStrictEqual({
      errors: [
        {
          message: 'Rule not authorized for bulk enable - UPS',
          rule: { id: 'id1', name: 'fakeName' },
        },
        {
          message: 'Rule not authorized for bulk enable - UPS',
          rule: { id: 'id2', name: 'fakeName' },
        },
      ],
      rules: [],
      taskIdsFailedToBeEnabled: [],
      total: 2,
    });
  });

  test('should return both rules if one is already enabled and one is disabled when bulk enable is based on ids', async () => {
    mockCreatePointInTimeFinderAsInternalUser({
      saved_objects: [disabledRule1, enabledRuleForBulkOps2],
    });
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
    });

    const result = await rulesClient.bulkEnableRules({
      ids: ['id1', 'id2'],
    });

    expect(taskManager.bulkSchedule).not.toHaveBeenCalled();

    expect(taskManager.bulkEnable).toHaveBeenCalledTimes(1);
    expect(taskManager.bulkEnable).toHaveBeenCalledWith(['id1', 'id2']);

    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'id1',
          attributes: expect.objectContaining({
            enabled: true,
            lastEnabledAt: '2019-02-12T21:01:22.479Z',
          }),
        }),
      ]),
      { overwrite: true }
    );

    const bulkCreateArgs = unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0];
    const alreadyEnabledRule = bulkCreateArgs.find((so: { id?: string }) => so.id === 'id2');
    expect(alreadyEnabledRule?.attributes).not.toHaveProperty('lastEnabledAt');

    expect(result).toStrictEqual({
      errors: [],
      rules: [returnedRuleForBulkOps1, returnedRuleForBulkOps2],
      total: 2,
      taskIdsFailedToBeEnabled: [],
    });
  });

  test('should return both rules if one is already enabled and one is disabled when bulk enable is based on filters', async () => {
    mockCreatePointInTimeFinderAsInternalUser({
      saved_objects: [disabledRule1, enabledRuleForBulkOps2],
    });
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
    });

    const result = await rulesClient.bulkEnableRules({
      filter: 'fake_filter',
    });

    expect(taskManager.bulkSchedule).not.toHaveBeenCalled();

    expect(taskManager.bulkEnable).toHaveBeenCalledTimes(1);
    expect(taskManager.bulkEnable).toHaveBeenCalledWith(['id1', 'id2']);

    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'id1',
          attributes: expect.objectContaining({
            enabled: true,
            lastEnabledAt: '2019-02-12T21:01:22.479Z',
          }),
        }),
      ]),
      { overwrite: true }
    );

    const bulkCreateArgs = unsecuredSavedObjectsClient.bulkCreate.mock.calls[0][0];
    const alreadyEnabledRule = bulkCreateArgs.find((so: { id?: string }) => so.id === 'id2');
    expect(alreadyEnabledRule?.attributes).not.toHaveProperty('lastEnabledAt');

    expect(result).toStrictEqual({
      errors: [],
      rules: [returnedRuleForBulkOps1, returnedRuleForBulkOps2],
      total: 2,
      taskIdsFailedToBeEnabled: [],
    });
  });

  test('should clear flapping history for alerts generated by rules when bulk enabled', async () => {
    mockCreatePointInTimeFinderAsInternalUser({
      saved_objects: [disabledRule1, enabledRuleForBulkOps2],
    });
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
    });

    rulesClientParams.getAlertIndicesAlias.mockReturnValueOnce(['test-index-1', 'test-index-2']);

    (rulesClientParams.ruleTypeRegistry.get as jest.Mock).mockReturnValueOnce({
      autoRecoverAlerts: true,
      id: 'fakeType1',
    });

    (rulesClientParams.ruleTypeRegistry.get as jest.Mock).mockReturnValueOnce({
      autoRecoverAlerts: true,
      id: 'fakeType2',
    });

    const result = await rulesClient.bulkEnableRules({
      filter: 'fake_filter',
    });

    expect(rulesClientParams.getAlertIndicesAlias).toHaveBeenCalledWith(
      ['fakeType1', 'fakeType2'],
      'default'
    );

    expect(alertsService.clearAlertFlappingHistory).toHaveBeenCalledWith({
      indices: ['test-index-1', 'test-index-2'],
      ruleIds: ['id1', 'id2'],
    });

    expect(result).toStrictEqual({
      errors: [],
      rules: [returnedRuleForBulkOps1, returnedRuleForBulkOps2],
      total: 2,
      taskIdsFailedToBeEnabled: [],
    });
  });

  test('should not prevent enabling if clear flapping throws', async () => {
    mockCreatePointInTimeFinderAsInternalUser({
      saved_objects: [disabledRule1, enabledRuleForBulkOps2],
    });
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
    });

    rulesClientParams.getAlertIndicesAlias.mockReturnValue(['test-index']);

    (rulesClientParams.ruleTypeRegistry.get as jest.Mock).mockReturnValue({
      autoRecoverAlerts: true,
    });

    (rulesClientParams.alertsService?.clearAlertFlappingHistory as jest.Mock).mockRejectedValue(
      Error('something went wrong!')
    );

    const result = await rulesClient.bulkEnableRules({
      filter: 'fake_filter',
    });

    expect(alertsService.clearAlertFlappingHistory).toHaveBeenCalledWith({
      indices: ['test-index'],
      ruleIds: ['id1', 'id2'],
    });

    expect(result).toStrictEqual({
      errors: [],
      rules: [returnedRuleForBulkOps1, returnedRuleForBulkOps2],
      total: 2,
      taskIdsFailedToBeEnabled: [],
    });

    expect(logger.error).toBeCalledWith(
      'Failure to clear flapping history from rule ["id1","id2"] - something went wrong!'
    );
  });

  test('should not try to clear flapping if its not a lifecycle rule', async () => {
    mockCreatePointInTimeFinderAsInternalUser({
      saved_objects: [disabledRule1, enabledRuleForBulkOps2],
    });
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
    });

    rulesClientParams.getAlertIndicesAlias.mockReturnValue(['test-index']);

    (rulesClientParams.ruleTypeRegistry.get as jest.Mock).mockReturnValue({
      autoRecoverAlerts: false,
    });

    const result = await rulesClient.bulkEnableRules({
      filter: 'fake_filter',
    });

    expect(alertsService.clearAlertFlappingHistory).toHaveBeenCalledTimes(0);

    expect(result).toStrictEqual({
      errors: [],
      rules: [returnedRuleForBulkOps1, returnedRuleForBulkOps2],
      total: 2,
      taskIdsFailedToBeEnabled: [],
    });
  });

  test('should not try to clear flapping for rules that failed to enable', async () => {
    mockCreatePointInTimeFinderAsInternalUser({
      saved_objects: [disabledRule1, enabledRuleForBulkOps2],
    });
    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [
        enabledRuleForBulkOps1,
        {
          ...enabledRuleForBulkOps2,
          error: {
            message: 'something went wrong!',
            statusCode: 400,
            error: 'something went wrong!',
          },
        },
      ],
    });

    rulesClientParams.getAlertIndicesAlias.mockReturnValue(['test-index']);

    (rulesClientParams.ruleTypeRegistry.get as jest.Mock).mockReturnValue({
      autoRecoverAlerts: true,
    });

    const result = await rulesClient.bulkEnableRules({
      filter: 'fake_filter',
    });

    expect(alertsService.clearAlertFlappingHistory).toHaveBeenCalledWith({
      indices: ['test-index'],
      ruleIds: ['id1'],
    });

    expect(result).toStrictEqual({
      errors: [
        {
          message: 'something went wrong!',
          rule: {
            id: 'id2',
            name: 'fakeName',
          },
          status: 400,
        },
      ],
      rules: [returnedRuleForBulkOps1],
      total: 2,
      taskIdsFailedToBeEnabled: [],
    });
  });

  describe('lastRun outcome message migration', () => {
    test('migrates legacy string lastRun.outcomeMsg to string[] when bulk enabling', async () => {
      mockCreatePointInTimeFinderAsInternalUser({
        saved_objects: [
          {
            ...disabledRule1,
            attributes: {
              ...disabledRule1.attributes,
              lastRun: {
                outcome: 'failed',
                // @ts-expect-error test legacy outcomeMsg migration
                outcomeMsg: 'legacy message',
              },
            },
          },
          disabledRule2,
        ],
      });
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
      });

      await rulesClient.bulkEnableRules({ filter: 'fake_filter' });

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
            ...disabledRule1,
            attributes: {
              ...disabledRule1.attributes,
              lastRun,
            },
          },
        ],
      });
      mockUnsecuredSavedObjectFind(1);
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1],
      });

      await rulesClient.bulkEnableRules({ filter: 'fake_filter' });

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
        saved_objects: [disabledRule1],
      });
      mockUnsecuredSavedObjectFind(1);
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1],
      });

      await rulesClient.bulkEnableRules({ filter: 'fake_filter' });

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
    test('should return task id if enabling task failed', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
      });
      taskManager.bulkEnable.mockImplementation(async () => ({
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
      }));

      const result = await rulesClient.bulkEnableRules({ filter: 'fake_filter' });

      expect(logger.debug).toBeCalledTimes(1);
      expect(logger.debug).toBeCalledWith(
        'Successfully enabled schedules for underlying tasks: id1'
      );
      expect(logger.error).toBeCalledTimes(1);
      expect(logger.error).toBeCalledWith('Failure to enable schedules for underlying tasks: id2');

      expect(result).toStrictEqual({
        errors: [],
        rules: [returnedRuleForBulkOps1, returnedRuleForBulkOps2],
        total: 2,
        taskIdsFailedToBeEnabled: ['id2'],
      });
    });

    test('should not throw an error if taskManager throw an error', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
      });
      taskManager.bulkEnable.mockImplementation(() => {
        throw new Error('UPS');
      });

      const result = await rulesClient.bulkEnableRules({ filter: 'fake_filter' });

      expect(logger.error).toBeCalledTimes(1);
      expect(logger.error).toBeCalledWith(
        'Failure to enable schedules for underlying tasks: id1, id2. TaskManager bulkEnable failed with Error: UPS'
      );

      expect(result).toStrictEqual({
        errors: [],
        rules: [returnedRuleForBulkOps1, returnedRuleForBulkOps2],
        taskIdsFailedToBeEnabled: ['id1', 'id2'],
        total: 2,
      });
    });

    test('should call task manager bulkEnable for two tasks', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
      });

      await rulesClient.bulkEnableRules({ filter: 'fake_filter' });

      expect(taskManager.bulkEnable).toHaveBeenCalledTimes(1);
      expect(taskManager.bulkEnable).toHaveBeenCalledWith(['id1', 'id2']);
    });

    test('should should call task manager bulkEnable only for one task, if one rule have an error', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1, savedObjectWith500Error],
      });

      await rulesClient.bulkEnableRules({ filter: 'fake_filter' });

      expect(taskManager.bulkEnable).toHaveBeenCalledTimes(1);
      expect(taskManager.bulkEnable).toHaveBeenCalledWith(['id1']);
    });

    test('should skip task if rule is already enabled', async () => {
      mockCreatePointInTimeFinderAsInternalUser({
        saved_objects: [disabledRule1, enabledRuleForBulkOps2],
      });
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1],
      });

      taskManager.bulkEnable.mockImplementation(
        async () =>
          ({
            tasks: [{ id: 'id1' }],
            errors: [],
          } as unknown as BulkUpdateTaskResult)
      );

      await rulesClient.bulkEnableRules({ filter: 'fake_filter' });

      expect(taskManager.bulkEnable).toHaveBeenCalledTimes(1);
      expect(taskManager.bulkEnable).toHaveBeenCalledWith(['id1']);

      expect(logger.debug).toBeCalledTimes(1);
      expect(logger.debug).toBeCalledWith(
        'Successfully enabled schedules for underlying tasks: id1'
      );
      expect(logger.error).toBeCalledTimes(0);
    });

    test('should schedule task when scheduledTaskId is defined but task with that ID does not', async () => {
      // One rule gets the task successfully, one rule doesn't so only one task should be scheduled
      taskManager.get.mockRejectedValueOnce(new Error('Failed to get task!'));
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
      });

      const result = await rulesClient.bulkEnableRules({ ids: ['id1', 'id2'] });

      expect(taskManager.bulkSchedule).toHaveBeenCalledTimes(1);
      expect(taskManager.bulkSchedule).toHaveBeenCalledWith([
        {
          id: 'id1',
          taskType: `alerting:fakeType`,
          params: {
            alertId: 'id1',
            spaceId: 'default',
            consumer: 'fakeConsumer',
          },
          schedule: {
            interval: '5m',
          },
          enabled: false,
          state: {
            alertInstances: {},
            alertTypeState: {},
            previousStartedAt: null,
          },
          scope: ['alerting'],
        },
      ]);

      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'id1',
            attributes: expect.objectContaining({
              enabled: true,
            }),
          }),
          expect.objectContaining({
            id: 'id2',
            attributes: expect.objectContaining({
              enabled: true,
            }),
          }),
        ]),
        { overwrite: true }
      );

      expect(result).toStrictEqual({
        errors: [],
        rules: [returnedRuleForBulkOps1, returnedRuleForBulkOps2],
        total: 2,
        taskIdsFailedToBeEnabled: [],
      });
    });

    test('should schedule task when scheduledTaskId is not defined', async () => {
      encryptedSavedObjects.createPointInTimeFinderDecryptedAsInternalUser = jest
        .fn()
        .mockResolvedValueOnce({
          close: jest.fn(),
          find: function* asyncGenerator() {
            yield {
              saved_objects: [
                {
                  ...disabledRule1,
                  attributes: { ...disabledRule1.attributes, scheduledTaskId: null },
                },
                disabledRule2,
              ],
            };
          },
        });
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
      });
      const result = await rulesClient.bulkEnableRules({ ids: ['id1', 'id2'] });

      expect(taskManager.bulkSchedule).toHaveBeenCalledTimes(1);
      expect(taskManager.bulkSchedule).toHaveBeenCalledWith([
        {
          id: 'id1',
          taskType: `alerting:fakeType`,
          params: {
            alertId: 'id1',
            spaceId: 'default',
            consumer: 'fakeConsumer',
          },
          schedule: {
            interval: '5m',
          },
          enabled: false,
          state: {
            alertInstances: {},
            alertTypeState: {},
            previousStartedAt: null,
          },
          scope: ['alerting'],
        },
      ]);

      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'id1',
            attributes: expect.objectContaining({
              enabled: true,
            }),
          }),
          expect.objectContaining({
            id: 'id2',
            attributes: expect.objectContaining({
              enabled: true,
            }),
          }),
        ]),
        { overwrite: true }
      );

      expect(result).toStrictEqual({
        errors: [],
        rules: [returnedRuleForBulkOps1, returnedRuleForBulkOps2],
        total: 2,
        taskIdsFailedToBeEnabled: [],
      });
    });

    test('should schedule task when task with scheduledTaskId exists but is unrecognized', async () => {
      taskManager.get.mockResolvedValueOnce({
        id: 'task-123',
        taskType: 'alerting:123',
        scheduledAt: new Date(),
        attempts: 1,
        status: TaskStatus.Unrecognized,
        runAt: new Date(),
        startedAt: null,
        retryAt: null,
        state: {},
        params: {
          alertId: '1',
        },
        ownerId: null,
        enabled: false,
      });
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
      });

      const result = await rulesClient.bulkEnableRules({ ids: ['id1', 'id2'] });

      expect(taskManager.removeIfExists).toHaveBeenCalledTimes(1);
      expect(taskManager.removeIfExists).toHaveBeenCalledWith('id1');
      expect(taskManager.bulkSchedule).toHaveBeenCalledTimes(1);
      expect(taskManager.bulkSchedule).toHaveBeenCalledWith([
        {
          id: 'id1',
          taskType: `alerting:fakeType`,
          params: {
            alertId: 'id1',
            spaceId: 'default',
            consumer: 'fakeConsumer',
          },
          schedule: {
            interval: '5m',
          },
          enabled: false,
          state: {
            alertInstances: {},
            alertTypeState: {},
            previousStartedAt: null,
          },
          scope: ['alerting'],
        },
      ]);

      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'id1',
            attributes: expect.objectContaining({
              enabled: true,
            }),
          }),
          expect.objectContaining({
            id: 'id2',
            attributes: expect.objectContaining({
              enabled: true,
            }),
          }),
        ]),
        { overwrite: true }
      );

      expect(result).toStrictEqual({
        errors: [],
        rules: [returnedRuleForBulkOps1, returnedRuleForBulkOps2],
        total: 2,
        taskIdsFailedToBeEnabled: [],
      });
    });
  });

  describe('auditLogger', () => {
    jest.spyOn(auditLogger, 'log').mockImplementation();

    test('logs audit event when enabling rules', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1],
      });

      await rulesClient.bulkEnableRules({ filter: 'fake_filter' });

      expect(auditLogger.log.mock.calls[0][0]?.event?.action).toEqual('rule_enable');
      expect(auditLogger.log.mock.calls[0][0]?.event?.outcome).toEqual('unknown');
      expect(auditLogger.log.mock.calls[0][0]?.kibana).toEqual({
        saved_object: { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, name: 'fakeName' },
      });
      expect(auditLogger.log.mock.calls[1][0]?.event?.action).toEqual('rule_enable');
      expect(auditLogger.log.mock.calls[1][0]?.event?.outcome).toEqual('unknown');
      expect(auditLogger.log.mock.calls[1][0]?.kibana).toEqual({
        saved_object: { id: 'id2', type: RULE_SAVED_OBJECT_TYPE, name: 'fakeName' },
      });
    });

    test('logs audit event when authentication failed', async () => {
      authorization.bulkEnsureAuthorized.mockImplementation(() => {
        throw new Error('Unauthorized');
      });

      await expect(rulesClient.bulkEnableRules({ filter: 'fake_filter' })).rejects.toThrowError(
        'Unauthorized'
      );

      expect(auditLogger.log.mock.calls[0][0]?.event?.action).toEqual('rule_enable');
      expect(auditLogger.log.mock.calls[0][0]?.event?.outcome).toEqual('failure');
    });

    test('logs audit event when getting an authorization filter failed', async () => {
      authorization.getFindAuthorizationFilter.mockImplementation(() => {
        throw new Error('Error');
      });

      await expect(rulesClient.bulkEnableRules({ filter: 'fake_filter' })).rejects.toThrowError(
        'Error'
      );

      expect(auditLogger.log.mock.calls[0][0]?.event?.action).toEqual('rule_enable');
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

    test('logs every successfully enabled rule with action "rule_enable"', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
      });

      await trackingClient.bulkEnableRules({ filter: 'fake_filter' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
      // bulkCount comes from the original total returned by `find` (mocked to 2).
      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({ objectId: 'id1' }),
          expect.objectContaining({ objectId: 'id2' }),
        ],
        {
          action: 'rule_enable',
          spaceId: 'default',
          data: { metadata: { bulkCount: 2 } },
        }
      );
    });

    test('captures the full post-enable attributes of each rule', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();
      mockUnsecuredSavedObjectFind(1);
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1],
      });

      await trackingClient.bulkEnableRules({ filter: 'fake_filter' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            snapshot: expect.objectContaining({
              id: enabledRuleForBulkOps1.id,
              name: enabledRuleForBulkOps1.attributes.name,
              enabled: true,
              alertTypeId: enabledRuleForBulkOps1.attributes.alertTypeId,
              createdAt: enabledRuleForBulkOps1.attributes.createdAt,
              updatedAt: enabledRuleForBulkOps1.attributes.updatedAt,
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
        saved_objects: [enabledRuleForBulkOps1],
      });

      await trackingClient.bulkEnableRules({ filter: 'fake_filter' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            objectId: enabledRuleForBulkOps1.id,
            objectType: RULE_SAVED_OBJECT_TYPE,
            module: 'stack',
          }),
        ],
        expect.any(Object)
      );
    });

    test('stamps every change with the time captured immediately before the bulkCreate', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
      });

      const startTimeMs = Date.parse('2030-06-01T08:00:00.000Z');
      const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(startTimeMs);

      try {
        await trackingClient.bulkEnableRules({ filter: 'fake_filter' });

        expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
        const [changes] = changeTrackingService.logBulk.mock.calls[0];
        // All rules share the same operation timestamp.
        expect(changes.map((c: { timestamp: string }) => c.timestamp)).toEqual([
          '2030-06-01T08:00:00.000Z',
          '2030-06-01T08:00:00.000Z',
        ]);
      } finally {
        dateNowSpy.mockRestore();
      }
    });

    test('skips rules whose saved object update failed (partial bulk failures)', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      // Non-409 errors are not retried, so the partial failure case is single-pass.
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1, savedObjectWith500Error],
      });

      await trackingClient.bulkEnableRules({ filter: 'fake_filter' });

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
          saved_objects: [enabledRuleForBulkOps1, savedObjectWith409Error],
        })
        .mockResolvedValueOnce({
          saved_objects: [enabledRuleForBulkOps2],
        });

      encryptedSavedObjects.createPointInTimeFinderDecryptedAsInternalUser = jest
        .fn()
        .mockResolvedValueOnce({
          close: jest.fn(),
          find: function* asyncGenerator() {
            yield { saved_objects: [disabledRule1, disabledRule2] };
          },
        })
        .mockResolvedValueOnce({
          close: jest.fn(),
          find: function* asyncGenerator() {
            yield { saved_objects: [disabledRule2] };
          },
        });

      await trackingClient.bulkEnableRules({ ids: ['id1', 'id2'] });

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
        saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
      });

      await trackingClient.bulkEnableRules({ filter: 'fake_filter' });

      expect(changeTrackingService.logBulk).not.toHaveBeenCalled();
    });

    test('does nothing when no change tracking service is configured', async () => {
      // Default rulesClient has no changeTrackingService configured.
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2],
      });

      await rulesClient.bulkEnableRules({ filter: 'fake_filter' });

      // Negative assertion is exercised at the helper level.
      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalled();
    });

    test('captures rule.revision in object.sequence', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();
      mockUnsecuredSavedObjectFind(1);
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [enabledRuleForBulkOps1],
      });

      await trackingClient.bulkEnableRules({ filter: 'fake_filter' });

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
