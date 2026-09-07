/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import { schema } from '@kbn/config-schema';
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
import { RecoveredActionGroup } from '../../../../../common';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { actionsAuthorizationMock } from '@kbn/actions-plugin/server/mocks';
import type { AlertingAuthorization } from '../../../../authorization/alerting_authorization';
import type { ActionsAuthorization, ActionsClient } from '@kbn/actions-plugin/server';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';
import { getBeforeSetup, setGlobalDate } from '../../../../rules_client/tests/lib';
import { bulkMarkApiKeysForInvalidation } from '../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation';
import { ConnectorAdapterRegistry } from '../../../../connector_adapters/connector_adapter_registry';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { backfillClientMock } from '../../../../backfill_client/backfill_client.mock';
import { toKqlExpression } from '@kbn/es-query';
import { createMockConnector } from '@kbn/actions-plugin/server/application/connector/mocks';

jest.mock('uuid', () => {
  let uuid = 100;
  return { v4: () => `${uuid++}` };
});

jest.mock('../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation', () => ({
  bulkMarkApiKeysForInvalidation: jest.fn(),
}));

const taskManager = taskManagerMock.createStart();
const ruleTypeRegistry = ruleTypeRegistryMock.create();
const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
const encryptedSavedObjects = encryptedSavedObjectsMock.createClient();
const authorization = alertingAuthorizationMock.create();
const actionsAuthorization = actionsAuthorizationMock.create();
const auditLogger = auditLoggerMock.create();
const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();

const kibanaVersion = 'v8.2.0';
const createAPIKeyMock = jest.fn();
const isAuthenticationTypeApiKeyMock = jest.fn();
const getAuthenticationApiKeyMock = jest.fn();

const rulesClientParams: jest.Mocked<ConstructorOptions> = {
  request: httpServerMock.createKibanaRequest(),
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
  logger: loggingSystemMock.create().get(),
  internalSavedObjectsRepository,
  encryptedSavedObjectsClient: encryptedSavedObjects,
  getActionsClient: jest.fn(),
  getEventLogClient: jest.fn(),
  kibanaVersion,
  auditLogger,
  maxScheduledPerMinute: 10000,
  minimumScheduleInterval: { value: '1m', enforce: false },
  isAuthenticationTypeAPIKey: isAuthenticationTypeApiKeyMock,
  getAuthenticationAPIKey: getAuthenticationApiKeyMock,
  connectorAdapterRegistry: new ConnectorAdapterRegistry(),
  isSystemAction: jest.fn(),
  getAlertIndicesAlias: jest.fn(),
  alertsService: null,
  backfillClient: backfillClientMock.create(),
  uiSettings: uiSettingsServiceMock.createStartContract(),
  featureFlags: coreFeatureFlagsMock.createStart(),
  isServerless: false,
};

const MOCK_API_KEY = Buffer.from('123:abc').toString('base64');

beforeEach(() => {
  getBeforeSetup(rulesClientParams, taskManager, ruleTypeRegistry);
  (auditLogger.log as jest.Mock).mockClear();
});

setGlobalDate();

describe('bulkEditRuleParamsWithReadAuth()', () => {
  let rulesClient: RulesClient;
  let actionsClient: jest.Mocked<ActionsClient>;
  const existingRule = {
    id: '1',
    type: RULE_SAVED_OBJECT_TYPE,
    attributes: {
      enabled: false,
      tags: ['foo'],
      createdBy: 'user',
      createdAt: '2019-02-12T21:01:22.479Z',
      updatedAt: '2019-02-12T21:01:22.479Z',
      legacyId: null,
      muteAll: false,
      mutedInstanceIds: [],
      snoozeSchedule: [],
      alertTypeId: 'myType',
      schedule: { interval: '1m' },
      consumer: 'myApp',
      scheduledTaskId: 'task-123',
      executionStatus: {
        lastExecutionDate: '2019-02-12T21:01:22.479Z',
        status: 'pending',
      },
      params: {
        exceptionsList: [
          {
            id: 'exception-list-id',
            list_id: 'exception-list',
            type: 'detection',
            namespace_type: 'single',
          },
        ],
      },
      throttle: null,
      notifyWhen: null,
      actions: [],
      artifacts: {
        dashboards: [],
        investigation_guide: { blob: '' },
      },
      name: 'my rule name',
      revision: 0,
    },
    references: [],
    version: '123',
  };
  const existingDecryptedRule = {
    ...existingRule,
    attributes: {
      ...existingRule.attributes,
      apiKey: MOCK_API_KEY,
      apiKeyCreatedByUser: false,
    },
  };

  const mockCreatePointInTimeFinderAsInternalUser = (
    response = { saved_objects: [existingDecryptedRule] }
  ) => {
    encryptedSavedObjects.createPointInTimeFinderDecryptedAsInternalUser = jest
      .fn()
      .mockResolvedValueOnce({
        close: jest.fn(),
        find: function* asyncGenerator() {
          yield response;
        },
      });
  };

  beforeEach(async () => {
    rulesClient = new RulesClient(rulesClientParams);

    actionsClient = (await rulesClientParams.getActionsClient()) as jest.Mocked<ActionsClient>;
    actionsClient.getBulk.mockReset();
    actionsClient.getBulk.mockResolvedValue([
      createMockConnector({
        id: '1',
        actionTypeId: 'test',
        config: {
          from: 'me@me.com',
          hasAuth: false,
          host: 'hello',
          port: 22,
          secure: null,
          service: null,
        },
        name: 'email connector',
      }),
    ]);
    actionsClient.listTypes.mockReset();
    actionsClient.listTypes.mockResolvedValue([]);
    rulesClientParams.getActionsClient.mockResolvedValue(actionsClient);

    authorization.getFindAuthorizationFilter.mockResolvedValue({
      ensureRuleTypeIsAuthorized() {},
    });

    unsecuredSavedObjectsClient.find.mockResolvedValue({
      aggregations: {
        alertTypeId: {
          buckets: [{ key: ['myType', 'myApp'], key_as_string: 'myType|myApp', doc_count: 1 }],
        },
      },
      saved_objects: [],
      per_page: 0,
      page: 0,
      total: 1,
    });

    mockCreatePointInTimeFinderAsInternalUser({
      saved_objects: [
        {
          ...existingDecryptedRule,
          attributes: { ...existingDecryptedRule.attributes, enabled: true },
        },
      ],
    });

    unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
      saved_objects: [existingRule],
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
      validLegacyConsumers: [],
      producer: 'alerts',
      solution: 'stack',
      validate: {
        params: { validate: (params) => params },
      },
    });

    rulesClientParams.isSystemAction.mockImplementation((id: string) => id === 'system_action-id');
    actionsClient.isSystemAction.mockImplementation((id: string) => id === 'system_action-id');
  });

  describe('exceptionsList operations', () => {
    test('should throw error if operation is invalid', async () => {
      await expect(
        rulesClient.bulkEditRuleParamsWithReadAuth({
          operations: [
            {
              field: 'exceptionsList',
              // @ts-expect-error
              operation: 'invalid',
              value: [
                {
                  id: 'exception-list-id',
                  list_id: 'exception-list',
                  type: 'detection',
                  namespace_type: 'single',
                },
                {
                  id: 'exception-list-id-2',
                  list_id: 'exception-list',
                  type: 'detection',
                  namespace_type: 'single',
                },
              ],
            },
          ],
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Error validating bulkEditRuleParamsWithReadAuth options - [operations.0.operation]: expected value to equal [set]"`
      );
    });

    test('should throw error if operation is incorrect for field', async () => {
      await expect(
        rulesClient.bulkEditRuleParamsWithReadAuth({
          operations: [
            {
              field: 'exceptionsList',
              // @ts-expect-error
              operation: 'add',
              value: [
                {
                  id: 'exception-list-id',
                  list_id: 'exception-list',
                  type: 'detection',
                  namespace_type: 'single',
                },
                {
                  id: 'exception-list-id-2',
                  list_id: 'exception-list',
                  type: 'detection',
                  namespace_type: 'single',
                },
              ],
            },
          ],
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Error validating bulkEditRuleParamsWithReadAuth options - [operations.0.operation]: expected value to equal [set]"`
      );
    });
    test('should update exceptionsList', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [
          {
            id: '1',
            type: RULE_SAVED_OBJECT_TYPE,
            attributes: {
              enabled: true,
              tags: ['test-1', 'test-2'],
              alertTypeId: 'myType',
              schedule: { interval: '1m' },
              consumer: 'myApp',
              scheduledTaskId: 'task-123',
              executionStatus: {
                lastExecutionDate: '2019-02-12T21:01:22.479Z',
                status: 'pending',
              },
              params: {
                exceptionsList: [
                  {
                    id: 'exception-list-id',
                    list_id: 'exception-list',
                    type: 'detection',
                    namespace_type: 'single',
                  },
                  {
                    id: 'exception-list-id-2',
                    list_id: 'exception-list',
                    type: 'detection',
                    namespace_type: 'single',
                  },
                ],
              },
              throttle: null,
              notifyWhen: null,
              actions: [],
              revision: 0,
            },
            references: [
              { name: 'param:exceptionsList_0', id: 'exception-list-id', type: 'exception-list' },
              { name: 'param:exceptionsList_1', id: 'exception-list-id-2', type: 'exception-list' },
            ],
            version: '123',
          },
        ],
      });

      const result = await rulesClient.bulkEditRuleParamsWithReadAuth({
        operations: [
          {
            field: 'exceptionsList',
            operation: 'set',
            value: [
              {
                id: 'exception-list-id',
                list_id: 'exception-list',
                type: 'detection',
                namespace_type: 'single',
              },
              {
                id: 'exception-list-id-2',
                list_id: 'exception-list',
                type: 'detection',
                namespace_type: 'single',
              },
            ],
          },
        ],
      });
      expect(result.rules[0].params.exceptionsList).toEqual([
        {
          id: 'exception-list-id',
          list_id: 'exception-list',
          type: 'detection',
          namespace_type: 'single',
        },
        {
          id: 'exception-list-id-2',
          list_id: 'exception-list',
          type: 'detection',
          namespace_type: 'single',
        },
      ]);

      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            id: '1',
            type: RULE_SAVED_OBJECT_TYPE,
            attributes: expect.objectContaining({
              params: {
                exceptionsList: [
                  {
                    id: 'exception-list-id',
                    list_id: 'exception-list',
                    type: 'detection',
                    namespace_type: 'single',
                  },
                  {
                    id: 'exception-list-id-2',
                    list_id: 'exception-list',
                    type: 'detection',
                    namespace_type: 'single',
                  },
                ],
              },
              revision: 1,
            }),
          }),
        ],
        { overwrite: true }
      );
    });

    test('runs the rule type params authorizer', async () => {
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
        validLegacyConsumers: [],
        producer: 'alerts',
        solution: 'stack',
        validate: {
          params: { validate: (params) => params },
        },
        authorize: {
          params: {
            authorize: async () => {
              throw new Error('Not authorized to edit params');
            },
          },
        },
      });

      const result = await rulesClient.bulkEditRuleParamsWithReadAuth({
        operations: [
          {
            field: 'exceptionsList',
            operation: 'set',
            value: [
              {
                id: 'exception-list-id',
                list_id: 'exception-list',
                type: 'detection',
                namespace_type: 'single',
              },
              {
                id: 'exception-list-id-2',
                list_id: 'exception-list',
                type: 'detection',
                namespace_type: 'single',
              },
            ],
          },
        ],
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toHaveProperty('message', 'Not authorized to edit params');
    });
  });

  describe('apiKeys', () => {
    beforeEach(() => {
      createAPIKeyMock.mockResolvedValueOnce({ apiKeysEnabled: true, result: { api_key: '111' } });
    });

    test('should not call bulkMarkApiKeysForInvalidation', async () => {
      await rulesClient.bulkEditRuleParamsWithReadAuth({
        operations: [
          {
            field: 'exceptionsList',
            operation: 'set',
            value: [
              {
                id: 'exception-list-id',
                list_id: 'exception-list',
                type: 'detection',
                namespace_type: 'single',
              },
              {
                id: 'exception-list-id-2',
                list_id: 'exception-list',
                type: 'detection',
                namespace_type: 'single',
              },
            ],
          },
        ],
      });

      expect(bulkMarkApiKeysForInvalidation).not.toHaveBeenCalled();
    });

    test('should not call bulkMarkApiKeysForInvalidation if bulkCreate failed', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockImplementation(() => {
        throw new Error('Fail');
      });

      await expect(
        rulesClient.bulkEditRuleParamsWithReadAuth({
          operations: [
            {
              field: 'exceptionsList',
              operation: 'set',
              value: [
                {
                  id: 'exception-list-id',
                  list_id: 'exception-list',
                  type: 'detection',
                  namespace_type: 'single',
                },
                {
                  id: 'exception-list-id-2',
                  list_id: 'exception-list',
                  type: 'detection',
                  namespace_type: 'single',
                },
              ],
            },
          ],
        })
      ).rejects.toThrow('Fail');

      expect(bulkMarkApiKeysForInvalidation).not.toHaveBeenCalled();
    });

    test('should not call bulkMarkApiKeysForInvalidation if SO returns with errors failed', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [
          {
            id: '1',
            type: RULE_SAVED_OBJECT_TYPE,
            attributes: {
              enabled: true,
              tags: ['foo'],
              alertTypeId: 'myType',
              schedule: { interval: '1m' },
              consumer: 'myApp',
              scheduledTaskId: 'task-123',
              executionStatus: {
                lastExecutionDate: '2019-02-12T21:01:22.479Z',
                status: 'pending',
              },
              params: { index: ['test-index-*'] },
              throttle: null,
              notifyWhen: null,
              actions: [],
            },
            references: [],
            version: '123',
            error: {
              error: 'test failure',
              statusCode: 500,
              message: 'test failure',
            },
          },
        ],
      });

      await rulesClient.bulkEditRuleParamsWithReadAuth({
        operations: [
          {
            field: 'exceptionsList',
            operation: 'set',
            value: [
              {
                id: 'exception-list-id',
                list_id: 'exception-list',
                type: 'detection',
                namespace_type: 'single',
              },
              {
                id: 'exception-list-id-2',
                list_id: 'exception-list',
                type: 'detection',
                namespace_type: 'single',
              },
            ],
          },
        ],
      });

      expect(bulkMarkApiKeysForInvalidation).not.toHaveBeenCalled();
    });
  });

  describe('params validation', () => {
    test('should return error for rule that failed params validation', async () => {
      ruleTypeRegistry.get.mockReturnValue({
        id: '123',
        name: 'Test',
        actionGroups: [{ id: 'default', name: 'Default' }],
        defaultActionGroupId: 'default',
        minimumLicenseRequired: 'basic',
        isExportable: true,
        recoveryActionGroup: RecoveredActionGroup,
        validate: {
          params: schema.object({
            param1: schema.string(),
          }),
        },
        async executor() {
          return { state: {} };
        },
        producer: 'alerts',
        solution: 'stack',
        category: 'test',
        validLegacyConsumers: [],
      });

      const result = await rulesClient.bulkEditRuleParamsWithReadAuth({
        operations: [
          {
            field: 'exceptionsList',
            operation: 'set',
            value: [
              {
                id: 'exception-list-id',
                list_id: 'exception-list',
                type: 'detection',
                namespace_type: 'single',
              },
              {
                id: 'exception-list-id-2',
                list_id: 'exception-list',
                type: 'detection',
                namespace_type: 'single',
              },
            ],
          },
        ],
      });

      expect(result.errors).toHaveLength(1);

      expect(result.errors[0]).toHaveProperty(
        'message',
        'params invalid: [param1]: expected value of type [string] but got [undefined]'
      );
      expect(result.errors[0]).toHaveProperty('rule.id', '1');
      expect(result.errors[0]).toHaveProperty('rule.name', 'my rule name');
    });
  });

  describe('paramsModifier', () => {
    test('should call paramsModifier fn if defined', async () => {
      unsecuredSavedObjectsClient.bulkCreate.mockResolvedValue({
        saved_objects: [
          {
            id: '1',
            type: RULE_SAVED_OBJECT_TYPE,
            attributes: {
              enabled: true,
              tags: ['foo'],
              alertTypeId: 'myType',
              schedule: { interval: '1m' },
              consumer: 'myApp',
              scheduledTaskId: 'task-123',
              executionStatus: {
                lastExecutionDate: '2019-02-12T21:01:22.479Z',
                status: 'pending',
              },
              params: { index: ['old-index-*'] },
              throttle: null,
              notifyWhen: null,
              actions: [],
            },
            references: [],
            version: '123',
          },
        ],
      });

      const paramsModifier = jest.fn().mockImplementation((rule) => {
        const params = rule.params;
        params.index = ['test-index-*'];

        return { modifiedParams: params, isParamsUpdateSkipped: false, skipReasons: [] };
      });

      const result = await rulesClient.bulkEditRuleParamsWithReadAuth({
        operations: [
          {
            field: 'exceptionsList',
            operation: 'set',
            value: [
              {
                id: 'exception-list-id',
                list_id: 'exception-list',
                type: 'detection',
                namespace_type: 'single',
              },
              {
                id: 'exception-list-id-2',
                list_id: 'exception-list',
                type: 'detection',
                namespace_type: 'single',
              },
            ],
          },
        ],
        paramsModifier,
      });

      expect(result.errors).toHaveLength(0);
      expect(result.rules).toHaveLength(1);
      expect(paramsModifier).toHaveBeenCalledTimes(1);

      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledTimes(1);
      expect(unsecuredSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            id: '1',
            type: RULE_SAVED_OBJECT_TYPE,
            attributes: expect.objectContaining({
              params: expect.objectContaining({
                index: ['test-index-*'],
              }),
            }),
          }),
        ],
        { overwrite: true }
      );
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
    });

    it('should ignore updates to internally managed rule types by default and combine all filters correctly', async () => {
      await rulesClient.bulkEditRuleParamsWithReadAuth({
        operations: [
          {
            field: 'exceptionsList',
            operation: 'set',
            value: [
              {
                id: 'exception-list-id',
                list_id: 'exception-list',
                type: 'detection',
                namespace_type: 'single',
              },
            ],
          },
        ],
      });

      const findFilter = unsecuredSavedObjectsClient.find.mock.calls[0][0].filter;

      const encryptedFindFilter =
        encryptedSavedObjects.createPointInTimeFinderDecryptedAsInternalUser.mock.calls[0][0]
          .filter;

      expect(toKqlExpression(findFilter)).toMatchInlineSnapshot(
        `"NOT (alert.attributes.alertTypeId: test.internal-rule-type OR alert.attributes.alertTypeId: test.internal-rule-type-2)"`
      );

      expect(toKqlExpression(encryptedFindFilter)).toMatchInlineSnapshot(
        `"NOT (alert.attributes.alertTypeId: test.internal-rule-type OR alert.attributes.alertTypeId: test.internal-rule-type-2)"`
      );
    });
  });
});
