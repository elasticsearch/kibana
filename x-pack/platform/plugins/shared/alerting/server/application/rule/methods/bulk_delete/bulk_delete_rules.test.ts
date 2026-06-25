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
import { schema } from '@kbn/config-schema';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { actionsAuthorizationMock } from '@kbn/actions-plugin/server/mocks';
import type { ActionsAuthorization } from '@kbn/actions-plugin/server';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import { ruleTypeRegistryMock } from '../../../../rule_type_registry.mock';
import { alertingAuthorizationMock } from '../../../../authorization/alerting_authorization.mock';
import { RecoveredActionGroup } from '../../../../../common';
import type { AlertingAuthorization } from '../../../../authorization/alerting_authorization';
import { getBeforeSetup, setGlobalDate } from '../../../../rules_client/tests/lib';
import { bulkMarkApiKeysForInvalidation } from '../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation';
import {
  enabledRuleForBulkOps1,
  enabledRuleForBulkOps2,
  enabledRuleForBulkOps3,
  returnedRuleForBulkOps1,
  returnedRuleForBulkOps2,
  returnedRuleForBulkOps3,
  enabledRuleForBulkOpsWithActions1,
  enabledRuleForBulkOpsWithActions2,
  returnedRuleForBulkEnableWithActions1,
  returnedRuleForBulkEnableWithActions2,
  enabledRuleForBulkOpsWithActions1WithUiam,
  enabledRuleForBulkOpsWithActions2WithUiam,
} from '../../../../rules_client/tests/test_helpers';
import { ConnectorAdapterRegistry } from '../../../../connector_adapters/connector_adapter_registry';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { backfillClientMock } from '../../../../backfill_client/backfill_client.mock';
import { softDeleteGaps } from '../../../../lib/rule_gaps/soft_delete/soft_delete_gaps';
import { eventLoggerMock } from '@kbn/event-log-plugin/server/event_logger.mock';
import { eventLogClientMock } from '@kbn/event-log-plugin/server/event_log_client.mock';
import { nodeBuilder, toKqlExpression } from '@kbn/es-query';

jest.mock('../../../../lib/rule_gaps/soft_delete/soft_delete_gaps');

jest.mock('../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation', () => ({
  bulkMarkApiKeysForInvalidation: jest.fn(),
}));

const softDeleteGapsMock = softDeleteGaps as jest.Mock;
const taskManager = taskManagerMock.createStart();
const ruleTypeRegistry = ruleTypeRegistryMock.create();
const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
const encryptedSavedObjects = encryptedSavedObjectsMock.createClient();
const authorization = alertingAuthorizationMock.create();
const actionsAuthorization = actionsAuthorizationMock.create();
const auditLogger = auditLoggerMock.create();
const logger = loggerMock.create();
const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();
const backfillClient = backfillClientMock.create();
const eventLogClient = eventLogClientMock.create();
const eventLogger = eventLoggerMock.create();

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
  alertsService: null,
  backfillClient,
  uiSettings: uiSettingsServiceMock.createStartContract(),
  eventLogger,
  featureFlags: coreFeatureFlagsMock.createStart(),
  isServerless: false,
};

const getBulkOperationStatusErrorResponse = (statusCode: number) => ({
  id: 'id2',
  type: RULE_SAVED_OBJECT_TYPE,
  success: false,
  error: {
    error: '',
    message: 'UPS',
    statusCode,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  getBeforeSetup(rulesClientParams, taskManager, ruleTypeRegistry, eventLogClient);
});

setGlobalDate();

describe('bulkDelete', () => {
  let rulesClient: RulesClient;
  let actionsClient: jest.Mocked<ActionsClient>;

  const mockCreatePointInTimeFinderAsInternalUser = (
    response = {
      saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2, enabledRuleForBulkOps3],
    } as unknown
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

  beforeEach(async () => {
    rulesClient = new RulesClient(rulesClientParams);
    mockCreatePointInTimeFinderAsInternalUser();
    authorization.getFindAuthorizationFilter.mockResolvedValue({
      ensureRuleTypeIsAuthorized() {},
    });

    unsecuredSavedObjectsClient.find.mockResolvedValue({
      aggregations: {
        alertTypeId: {
          buckets: [{ key: ['myType', 'myApp'], key_as_string: 'myType|myApp', doc_count: 2 }],
        },
      },
      saved_objects: [],
      per_page: 0,
      page: 0,
      total: 2,
    });

    ruleTypeRegistry.get.mockReturnValue({
      id: 'myType',
      name: 'Test',
      actionGroups: [
        { id: 'default', name: 'Default' },
        { id: 'custom', name: 'Not the Default' },
      ],
      defaultActionGroupId: 'default',
      minimumLicenseRequired: 'basic',
      isExportable: true,
      recoveryActionGroup: RecoveredActionGroup,
      async executor() {
        return { state: {} };
      },
      category: 'test',
      producer: 'alerts',
      solution: 'stack',
      validate: {
        params: schema.any(),
      },
      validLegacyConsumers: [],
    });

    actionsClient = (await rulesClientParams.getActionsClient()) as jest.Mocked<ActionsClient>;
    actionsClient.isSystemAction.mockImplementation((id: string) => id === 'system_action:id');
    rulesClientParams.getActionsClient.mockResolvedValue(actionsClient);

    unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
      statuses: [
        { id: 'id1', type: 'alert', success: true },
        { id: 'id2', type: 'alert', success: true },
      ],
    });
  });

  test('should successfully delete two rule and return right actions', async () => {
    mockCreatePointInTimeFinderAsInternalUser({
      saved_objects: [enabledRuleForBulkOpsWithActions1, enabledRuleForBulkOpsWithActions2],
    });
    unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
      statuses: [
        { id: 'id1', type: 'alert', success: true },
        { id: 'id2', type: 'alert', success: true },
      ],
    });

    const result = await rulesClient.bulkDeleteRules({ filter: 'fake_filter' });

    expect(unsecuredSavedObjectsClient.bulkDelete).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.bulkDelete).toHaveBeenCalledWith(
      [enabledRuleForBulkOps1, enabledRuleForBulkOps2].map(({ id }) => ({
        id,
        type: 'alert',
      })),
      undefined
    );
    const ruleIds = ['id1', 'id2'];
    expect(taskManager.bulkRemove).toHaveBeenCalledTimes(1);
    expect(taskManager.bulkRemove).toHaveBeenCalledWith(ruleIds);
    expect(backfillClient.deleteBackfillForRules).toHaveBeenCalledTimes(1);
    expect(backfillClient.deleteBackfillForRules).toHaveBeenCalledWith({
      ruleIds,
      namespace: 'default',
      unsecuredSavedObjectsClient,
    });

    expect(softDeleteGapsMock).toHaveBeenCalledWith({
      ruleIds,
      eventLogClient,
      logger,
      eventLogger,
    });

    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      { apiKeys: ['MTIzOmFiYw==', 'MzIxOmFiYw=='] },
      expect.anything(),
      expect.anything()
    );
    expect(result).toStrictEqual({
      rules: [returnedRuleForBulkEnableWithActions1, returnedRuleForBulkEnableWithActions2],
      errors: [],
      total: 2,
      taskIdsFailedToBeDeleted: [],
    });
  });

  test('invalidates UIAM ApiKeys as well', async () => {
    rulesClient = new RulesClient({ ...rulesClientParams, shouldGrantUiam: true });

    encryptedSavedObjects.createPointInTimeFinderDecryptedAsInternalUser = jest
      .fn()
      .mockResolvedValueOnce({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield {
            saved_objects: [
              enabledRuleForBulkOpsWithActions1,
              enabledRuleForBulkOpsWithActions1WithUiam,
              enabledRuleForBulkOpsWithActions2WithUiam,
            ],
          };
        },
      });

    unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
      statuses: [
        { id: 'id1', type: 'alert', success: true },
        { id: 'uiam-1', type: 'alert', success: true },
        { id: 'uiam-2', type: 'alert', success: true },
      ],
    });

    await rulesClient.bulkDeleteRules({ filter: 'fake_filter' });

    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      {
        apiKeys: ['MTIzOmFiYw==', 'OTc4Onh5eg==', 'MTIzOmVzc3VfYWJj', 'NTc2Onh5eg=='],
      },
      expect.anything(),
      expect.anything()
    );
  });

  test('does not invalidate API keys created by user', async () => {
    rulesClient = new RulesClient({ ...rulesClientParams, shouldGrantUiam: true });

    encryptedSavedObjects.createPointInTimeFinderDecryptedAsInternalUser = jest
      .fn()
      .mockResolvedValueOnce({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield {
            saved_objects: [
              {
                ...enabledRuleForBulkOpsWithActions1,
                attributes: {
                  ...enabledRuleForBulkOpsWithActions1.attributes,
                  apiKeyCreatedByUser: true,
                },
              },
              {
                ...enabledRuleForBulkOpsWithActions2WithUiam,
                attributes: {
                  ...enabledRuleForBulkOpsWithActions2WithUiam.attributes,
                  apiKeyCreatedByUser: true,
                },
              },
            ],
          };
        },
      });

    unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
      statuses: [
        { id: 'id1', type: 'alert', success: true },
        { id: 'uiam-1', type: 'alert', success: true },
        { id: 'uiam-2', type: 'alert', success: true },
      ],
    });

    await rulesClient.bulkDeleteRules({ filter: 'fake_filter' });

    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      {
        apiKeys: [],
      },
      expect.anything(),
      expect.anything()
    );
  });

  test('swallows errors when soft deleting gaps fails', async () => {
    mockCreatePointInTimeFinderAsInternalUser({
      saved_objects: [enabledRuleForBulkOpsWithActions1, enabledRuleForBulkOpsWithActions2],
    });

    unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
      statuses: [
        { id: 'id1', type: 'alert', success: true },
        { id: 'id2', type: 'alert', success: true },
      ],
    });

    softDeleteGapsMock.mockRejectedValue(new Error('Boom!'));

    await rulesClient.bulkDeleteRules({ filter: 'fake_filter' });
    expect(rulesClientParams.logger.error).toHaveBeenCalledWith(
      'delete(): Failed to soft delete gaps for rules: id1,id2: Boom!'
    );
  });

  test('should try to delete rules, two successful and one with 500 error', async () => {
    unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
      statuses: [
        { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true },
        getBulkOperationStatusErrorResponse(500),
        { id: 'id3', type: RULE_SAVED_OBJECT_TYPE, success: true },
      ],
    });

    const result = await rulesClient.bulkDeleteRules({ filter: 'fake_filter' });

    expect(unsecuredSavedObjectsClient.bulkDelete).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.bulkDelete).toHaveBeenCalledWith(
      [enabledRuleForBulkOps1, enabledRuleForBulkOps2, enabledRuleForBulkOps3].map(({ id }) => ({
        id,
        type: RULE_SAVED_OBJECT_TYPE,
      })),
      undefined
    );

    expect(taskManager.bulkRemove).toHaveBeenCalledTimes(1);
    expect(taskManager.bulkRemove).toHaveBeenCalledWith(['id1', 'id3']);
    expect(backfillClient.deleteBackfillForRules).toHaveBeenCalledTimes(1);
    expect(backfillClient.deleteBackfillForRules).toHaveBeenCalledWith({
      ruleIds: ['id1', 'id3'],
      namespace: 'default',
      unsecuredSavedObjectsClient,
    });
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      { apiKeys: ['MTIzOmFiYw=='] },
      expect.anything(),
      expect.anything()
    );
    expect(result).toStrictEqual({
      rules: [returnedRuleForBulkOps1, returnedRuleForBulkOps3],
      errors: [{ message: 'UPS', rule: { id: 'id2', name: 'fakeName' }, status: 500 }],
      total: 2,
      taskIdsFailedToBeDeleted: [],
    });
  });

  test('should try to delete rules, one successful and one with 409 error, which will not be deleted with retry', async () => {
    unsecuredSavedObjectsClient.bulkDelete
      .mockResolvedValueOnce({
        statuses: [
          { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true },
          getBulkOperationStatusErrorResponse(409),
        ],
      })
      .mockResolvedValueOnce({
        statuses: [getBulkOperationStatusErrorResponse(409)],
      })
      .mockResolvedValueOnce({
        statuses: [getBulkOperationStatusErrorResponse(409)],
      })
      .mockResolvedValueOnce({
        statuses: [getBulkOperationStatusErrorResponse(409)],
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

    const result = await rulesClient.bulkDeleteRules({ ids: ['id1', 'id2'] });

    expect(unsecuredSavedObjectsClient.bulkDelete).toHaveBeenCalledTimes(4);
    expect(taskManager.bulkRemove).toHaveBeenCalledTimes(1);
    expect(taskManager.bulkRemove).toHaveBeenCalledWith(['id1']);
    expect(backfillClient.deleteBackfillForRules).toHaveBeenCalledTimes(1);
    expect(backfillClient.deleteBackfillForRules).toHaveBeenCalledWith({
      ruleIds: ['id1'],
      namespace: 'default',
      unsecuredSavedObjectsClient,
    });

    expect(softDeleteGapsMock).toHaveBeenCalledWith({
      ruleIds: ['id1', 'id2'],
      eventLogClient,
      logger,
      eventLogger,
    });

    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      { apiKeys: ['MTIzOmFiYw=='] },
      expect.anything(),
      expect.anything()
    );
    expect(result).toStrictEqual({
      rules: [returnedRuleForBulkOps1],
      errors: [{ message: 'UPS', rule: { id: 'id2', name: 'fakeName' }, status: 409 }],
      total: 2,
      taskIdsFailedToBeDeleted: [],
    });
  });

  test('should try to delete rules, one successful and one with 409 error, which successfully will be deleted with retry', async () => {
    unsecuredSavedObjectsClient.bulkDelete
      .mockResolvedValueOnce({
        statuses: [
          { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true },
          getBulkOperationStatusErrorResponse(409),
        ],
      })
      .mockResolvedValueOnce({
        statuses: [
          {
            id: 'id2',
            type: RULE_SAVED_OBJECT_TYPE,
            success: true,
          },
        ],
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
      });

    const result = await rulesClient.bulkDeleteRules({ ids: ['id1', 'id2'] });

    expect(unsecuredSavedObjectsClient.bulkDelete).toHaveBeenCalledTimes(2);
    expect(taskManager.bulkRemove).toHaveBeenCalledTimes(1);
    expect(taskManager.bulkRemove).toHaveBeenCalledWith(['id1', 'id2']);
    expect(backfillClient.deleteBackfillForRules).toHaveBeenCalledTimes(1);
    expect(backfillClient.deleteBackfillForRules).toHaveBeenCalledWith({
      ruleIds: ['id1', 'id2'],
      namespace: 'default',
      unsecuredSavedObjectsClient,
    });
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      { apiKeys: ['MTIzOmFiYw==', 'MzIxOmFiYw=='] },
      expect.anything(),
      expect.anything()
    );
    expect(result).toStrictEqual({
      rules: [returnedRuleForBulkOps1, returnedRuleForBulkOps2],
      errors: [],
      total: 2,
      taskIdsFailedToBeDeleted: [],
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

    await expect(rulesClient.bulkDeleteRules({ filter: 'fake_filter' })).rejects.toThrow(
      'More than 10000 rules matched for bulk delete'
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

    await expect(rulesClient.bulkDeleteRules({ filter: 'fake_filter' })).rejects.toThrow(
      'No rules found for bulk delete'
    );
  });

  test('should not mark API keys for invalidation if the user is authenticated using an api key', async () => {
    unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
      statuses: [
        { id: 'id3', type: RULE_SAVED_OBJECT_TYPE, success: true },
        { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true },
        { id: 'id2', type: RULE_SAVED_OBJECT_TYPE, success: true },
      ],
    });

    await rulesClient.bulkDeleteRules({ filter: 'fake_filter' });

    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      { apiKeys: ['MTIzOmFiYw==', 'MzIxOmFiYw=='] },
      expect.anything(),
      expect.anything()
    );
  });

  describe('taskManager', () => {
    test('should return task id if deleting task failed', async () => {
      unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
        statuses: [
          { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true },
          { id: 'id2', type: RULE_SAVED_OBJECT_TYPE, success: true },
        ],
      });
      taskManager.bulkRemove.mockImplementation(async () => ({
        statuses: [
          {
            id: 'id1',
            type: RULE_SAVED_OBJECT_TYPE,
            success: true,
          },
          getBulkOperationStatusErrorResponse(500),
        ],
      }));

      await rulesClient.bulkDeleteRules({ filter: 'fake_filter' });

      expect(logger.debug).toBeCalledTimes(1);
      expect(logger.debug).toBeCalledWith(
        'Successfully deleted schedules for underlying tasks: id1'
      );
      expect(logger.error).toBeCalledTimes(1);
      expect(logger.error).toBeCalledWith('Failure to delete schedules for underlying tasks: id2');
    });

    test('should not throw an error if taskManager throw an error', async () => {
      unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
        statuses: [
          { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true },
          { id: 'id2', type: RULE_SAVED_OBJECT_TYPE, success: true },
        ],
      });
      taskManager.bulkRemove.mockImplementation(() => {
        throw new Error('UPS');
      });

      await rulesClient.bulkDeleteRules({ filter: 'fake_filter' });

      expect(logger.error).toBeCalledTimes(1);
      expect(logger.error).toBeCalledWith(
        'Failure to delete schedules for underlying tasks: id1, id2. TaskManager bulkRemove failed with Error: UPS'
      );
    });

    test('should not call logger.error if all tasks successfully deleted', async () => {
      mockCreatePointInTimeFinderAsInternalUser();
      unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
        statuses: [
          { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true },
          { id: 'id2', type: RULE_SAVED_OBJECT_TYPE, success: true },
        ],
      });
      taskManager.bulkRemove.mockImplementation(async () => ({
        statuses: [
          {
            id: 'id1',
            type: RULE_SAVED_OBJECT_TYPE,
            success: true,
          },
          {
            id: 'id2',
            type: RULE_SAVED_OBJECT_TYPE,
            success: true,
          },
        ],
      }));

      await rulesClient.bulkDeleteRules({ filter: 'fake_filter' });

      expect(logger.debug).toBeCalledTimes(1);
      expect(logger.debug).toBeCalledWith(
        'Successfully deleted schedules for underlying tasks: id1, id2'
      );
      expect(logger.error).toBeCalledTimes(0);
    });
  });

  describe('auditLogger', () => {
    jest.spyOn(auditLogger, 'log').mockImplementation();

    test('logs audit event when deleting rules', async () => {
      unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
        statuses: [
          { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true },
          { id: 'id2', type: RULE_SAVED_OBJECT_TYPE, success: true },
        ],
      });

      await rulesClient.bulkDeleteRules({ filter: 'fake_filter' });

      expect(auditLogger.log.mock.calls[0][0]?.event?.action).toEqual('rule_delete');
      expect(auditLogger.log.mock.calls[0][0]?.event?.outcome).toEqual('unknown');
      expect(auditLogger.log.mock.calls[0][0]?.kibana).toEqual({
        saved_object: { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, name: 'fakeName' },
      });
      expect(auditLogger.log.mock.calls[1][0]?.event?.action).toEqual('rule_delete');
      expect(auditLogger.log.mock.calls[1][0]?.event?.outcome).toEqual('unknown');
      expect(auditLogger.log.mock.calls[1][0]?.kibana).toEqual({
        saved_object: { id: 'id2', type: RULE_SAVED_OBJECT_TYPE, name: 'fakeName' },
      });
    });

    test('logs audit event when authentication failed', async () => {
      authorization.bulkEnsureAuthorized.mockImplementation(() => {
        throw new Error('Unauthorized');
      });
      unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
        statuses: [{ id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true }],
      });

      await expect(rulesClient.bulkDeleteRules({ filter: 'fake_filter' })).rejects.toThrowError(
        'Unauthorized'
      );

      expect(auditLogger.log.mock.calls[0][0]?.event?.action).toEqual('rule_delete');
      expect(auditLogger.log.mock.calls[0][0]?.event?.outcome).toEqual('failure');
    });

    test('logs audit event when getting an authorization filter failed', async () => {
      authorization.getFindAuthorizationFilter.mockImplementation(() => {
        throw new Error('Error');
      });
      unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
        statuses: [{ id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true }],
      });

      await expect(rulesClient.bulkDeleteRules({ filter: 'fake_filter' })).rejects.toThrowError(
        'Error'
      );

      expect(auditLogger.log.mock.calls[0][0]?.event?.action).toEqual('rule_delete');
      expect(auditLogger.log.mock.calls[0][0]?.event?.outcome).toEqual('failure');
    });
  });

  describe('internally managed rule types', () => {
    beforeEach(() => {
      ruleTypeRegistry.list.mockReturnValue(
        // @ts-expect-error: not all args are required for this test
        new Map([
          ['test.internal-rule-type', { id: 'test.internal-rule-type', internallyManaged: true }],
          [
            'test.internal-rule-type-2',
            { id: 'test.internal-rule-type-2', internallyManaged: true },
          ],
        ])
      );

      // @ts-expect-error: not all args are required for this test
      authorization.getFindAuthorizationFilter.mockResolvedValue({
        filter: nodeBuilder.and([
          nodeBuilder.is('alert.attributes.alertTypeId', 'foo'),
          nodeBuilder.is('alert.attributes.consumer', 'bar'),
        ]),
      });
    });

    it('should ignore updates to internally managed rule types by default and combine all filters correctly', async () => {
      await rulesClient.bulkDeleteRules({
        filter: 'alert.attributes.tags: "APM"',
      });

      const findFilter = unsecuredSavedObjectsClient.find.mock.calls[0][0].filter;

      const encryptedFindFilter =
        encryptedSavedObjects.createPointInTimeFinderDecryptedAsInternalUser.mock.calls[0][0]
          .filter;

      expect(toKqlExpression(findFilter)).toMatchInlineSnapshot(
        `"((alert.attributes.tags: \\"APM\\" AND (alert.attributes.alertTypeId: foo AND alert.attributes.consumer: bar)) AND NOT (alert.attributes.alertTypeId: test.internal-rule-type OR alert.attributes.alertTypeId: test.internal-rule-type-2))"`
      );

      expect(toKqlExpression(encryptedFindFilter)).toMatchInlineSnapshot(
        `"((alert.attributes.tags: \\"APM\\" AND (alert.attributes.alertTypeId: foo AND alert.attributes.consumer: bar)) AND NOT (alert.attributes.alertTypeId: test.internal-rule-type OR alert.attributes.alertTypeId: test.internal-rule-type-2))"`
      );
    });

    it('should not ignore updates to internally managed rule types by default and combine all filters correctly', async () => {
      await rulesClient.bulkDeleteRules({
        filter: 'alert.attributes.tags: "APM"',
        ignoreInternalRuleTypes: false,
      });

      const findFilter = unsecuredSavedObjectsClient.find.mock.calls[0][0].filter;

      const encryptedFindFilter =
        encryptedSavedObjects.createPointInTimeFinderDecryptedAsInternalUser.mock.calls[0][0]
          .filter;

      expect(toKqlExpression(findFilter)).toMatchInlineSnapshot(
        `"(alert.attributes.tags: \\"APM\\" AND (alert.attributes.alertTypeId: foo AND alert.attributes.consumer: bar))"`
      );

      expect(toKqlExpression(encryptedFindFilter)).toMatchInlineSnapshot(
        `"(alert.attributes.tags: \\"APM\\" AND (alert.attributes.alertTypeId: foo AND alert.attributes.consumer: bar))"`
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
        validate: { params: schema.any() },
        validLegacyConsumers: [],
        trackChanges: true,
        ...overrides,
      });
    };

    test('logs every successfully deleted rule in a single bulk call', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      await trackingClient.bulkDeleteRules({ filter: 'fake_filter' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({ objectId: 'id1' }),
          expect.objectContaining({ objectId: 'id2' }),
        ],
        {
          action: 'rule_delete',
          spaceId: 'default',
          data: { metadata: { bulkCount: 2 } },
        }
      );
    });

    test('captures the full pre-deletion attributes of each rule', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      mockCreatePointInTimeFinderAsInternalUser({
        saved_objects: [enabledRuleForBulkOpsWithActions1, enabledRuleForBulkOpsWithActions2],
      });
      unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
        statuses: [
          { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true },
          { id: 'id2', type: RULE_SAVED_OBJECT_TYPE, success: true },
        ],
      });

      await trackingClient.bulkDeleteRules({ filter: 'fake_filter' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            snapshot: expect.objectContaining({
              id: enabledRuleForBulkOpsWithActions1.id,
              name: enabledRuleForBulkOpsWithActions1.attributes.name,
              alertTypeId: enabledRuleForBulkOpsWithActions1.attributes.alertTypeId,
              createdAt: enabledRuleForBulkOpsWithActions1.attributes.createdAt,
              updatedAt: enabledRuleForBulkOpsWithActions1.attributes.updatedAt,
            }),
          }),
          expect.objectContaining({
            snapshot: expect.objectContaining({
              id: enabledRuleForBulkOpsWithActions2.id,
              name: enabledRuleForBulkOpsWithActions2.attributes.name,
              alertTypeId: enabledRuleForBulkOpsWithActions2.attributes.alertTypeId,
              createdAt: enabledRuleForBulkOpsWithActions2.attributes.createdAt,
              updatedAt: enabledRuleForBulkOpsWithActions2.attributes.updatedAt,
            }),
          }),
        ],
        expect.any(Object)
      );
    });

    test('captures context of each rule', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      mockCreatePointInTimeFinderAsInternalUser({
        saved_objects: [enabledRuleForBulkOpsWithActions1, enabledRuleForBulkOpsWithActions2],
      });
      unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
        statuses: [
          { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true },
          { id: 'id2', type: RULE_SAVED_OBJECT_TYPE, success: true },
        ],
      });

      await trackingClient.bulkDeleteRules({ filter: 'fake_filter' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            objectId: enabledRuleForBulkOpsWithActions1.id,
            objectType: RULE_SAVED_OBJECT_TYPE,
            module: 'stack',
          }),
          expect.objectContaining({
            objectId: enabledRuleForBulkOpsWithActions2.id,
            objectType: RULE_SAVED_OBJECT_TYPE,
            module: 'stack',
          }),
        ],
        expect.any(Object)
      );
    });

    test('stamps every change with the time captured immediately before the bulkDelete', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      const startTimeMs = Date.parse('2030-06-01T08:00:00.000Z');
      const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(startTimeMs);

      try {
        await trackingClient.bulkDeleteRules({ filter: 'fake_filter' });

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

    test('only logs successfully deleted rules when bulk delete has partial failures', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      mockCreatePointInTimeFinderAsInternalUser({
        saved_objects: [enabledRuleForBulkOps1, enabledRuleForBulkOps2, enabledRuleForBulkOps3],
      });
      unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
        statuses: [
          { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true },
          getBulkOperationStatusErrorResponse(500),
          { id: 'id3', type: RULE_SAVED_OBJECT_TYPE, success: true },
        ],
      });

      await trackingClient.bulkDeleteRules({ filter: 'fake_filter' });

      expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          expect.objectContaining({ objectId: 'id1' }),
          expect.objectContaining({ objectId: 'id3' }),
        ],
        expect.any(Object)
      );
    });

    test('does not call logBulk when every delete fails (OCC retries exhausted)', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      // 4 = initial + RETRY_IF_CONFLICTS_ATTEMPTS retries; all return 409 conflicts.
      unsecuredSavedObjectsClient.bulkDelete
        .mockResolvedValueOnce({ statuses: [getBulkOperationStatusErrorResponse(409)] })
        .mockResolvedValueOnce({ statuses: [getBulkOperationStatusErrorResponse(409)] })
        .mockResolvedValueOnce({ statuses: [getBulkOperationStatusErrorResponse(409)] })
        .mockResolvedValueOnce({ statuses: [getBulkOperationStatusErrorResponse(409)] });

      encryptedSavedObjects.createPointInTimeFinderDecryptedAsInternalUser = jest
        .fn()
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
        })
        .mockResolvedValueOnce({
          close: jest.fn(),
          find: function* asyncGenerator() {
            yield { saved_objects: [enabledRuleForBulkOps2] };
          },
        });

      await trackingClient.bulkDeleteRules({ ids: ['id2'] });

      expect(changeTrackingService.logBulk).not.toHaveBeenCalled();
    });

    test('logs only the rules that succeed across OCC retry attempts', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      // First attempt: id1 succeeds, id2 fails with 409.
      // Retry: id2 succeeds.
      unsecuredSavedObjectsClient.bulkDelete
        .mockResolvedValueOnce({
          statuses: [
            { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true },
            getBulkOperationStatusErrorResponse(409),
          ],
        })
        .mockResolvedValueOnce({
          statuses: [{ id: 'id2', type: RULE_SAVED_OBJECT_TYPE, success: true }],
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

      await trackingClient.bulkDeleteRules({ ids: ['id1', 'id2'] });

      expect(changeTrackingService.logBulk).toHaveBeenNthCalledWith(
        1,
        [
          expect.objectContaining({
            objectId: 'id1',
          }),
        ],
        expect.any(Object)
      );

      expect(changeTrackingService.logBulk).toHaveBeenNthCalledWith(
        2,
        [
          expect.objectContaining({
            objectId: 'id2',
          }),
        ],
        expect.any(Object)
      );
    });

    test('reports bulkCount as the original `find` total even when OCC retries shrink the batch', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      // Original operation targets 5 rules; bulkCount must reflect this even though
      // each OCC pass operates on a smaller subset.
      unsecuredSavedObjectsClient.find.mockResolvedValue({
        aggregations: {
          alertTypeId: {
            buckets: [{ key: ['myType', 'myApp'], key_as_string: 'myType|myApp', doc_count: 5 }],
          },
        },
        saved_objects: [],
        per_page: 0,
        page: 0,
        total: 5,
      });

      // First pass: id1 succeeds, id2 fails with a 409 conflict.
      // Retry pass: id2 succeeds.
      unsecuredSavedObjectsClient.bulkDelete
        .mockResolvedValueOnce({
          statuses: [
            { id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true },
            getBulkOperationStatusErrorResponse(409),
          ],
        })
        .mockResolvedValueOnce({
          statuses: [{ id: 'id2', type: RULE_SAVED_OBJECT_TYPE, success: true }],
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

      await trackingClient.bulkDeleteRules({ ids: ['id1', 'id2'] });

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

      await trackingClient.bulkDeleteRules({ filter: 'fake_filter' });

      expect(changeTrackingService.logBulk).not.toHaveBeenCalled();
    });

    test('does not log when no change tracking service is configured', async () => {
      // Default rulesClient has no changeTrackingService; verify the call simply did not throw.
      await rulesClient.bulkDeleteRules({ filter: 'fake_filter' });
      expect(unsecuredSavedObjectsClient.bulkDelete).toHaveBeenCalled();
    });

    test('captures rule.revision in object.sequence', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      mockCreatePointInTimeFinderAsInternalUser({
        saved_objects: [enabledRuleForBulkOps1],
      });
      unsecuredSavedObjectsClient.bulkDelete.mockResolvedValue({
        statuses: [{ id: 'id1', type: RULE_SAVED_OBJECT_TYPE, success: true }],
      });

      await trackingClient.bulkDeleteRules({ filter: 'fake_filter' });

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
