/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { CreateRuleParams } from './create_rule';
import type { ConstructorOptions } from '../../../../rules_client';
import { RulesClient } from '../../../../rules_client';
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
import type { ActionsAuthorization, ActionsClient } from '@kbn/actions-plugin/server';
import { ruleNotifyWhen } from '../../constants';
import { TaskStatus } from '@kbn/task-manager-plugin/server';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';
import { getBeforeSetup, setGlobalDate } from '../../../../rules_client/tests/lib';
import { RecoveredActionGroup } from '../../../../../common';
import { bulkMarkApiKeysForInvalidation } from '../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation';
import { getRuleExecutionStatusPending, getDefaultMonitoring } from '../../../../lib';
import { ConnectorAdapterRegistry } from '../../../../connector_adapters/connector_adapter_registry';
import type { ConnectorAdapter } from '../../../../connector_adapters/types';
import type { RuleDomain } from '../../types';
import type { RuleSystemAction } from '../../../../types';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { backfillClientMock } from '../../../../backfill_client/backfill_client.mock';
import { createMockConnector } from '@kbn/actions-plugin/server/application/connector/mocks';

jest.mock('../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation', () => ({
  bulkMarkApiKeysForInvalidation: jest.fn(),
}));

jest.mock('@kbn/core-saved-objects-utils-server', () => {
  const actual = jest.requireActual('@kbn/core-saved-objects-utils-server');
  return {
    ...actual,
    SavedObjectsUtils: {
      generateId: () => 'mock-saved-object-id',
    },
  };
});

jest.mock('uuid', () => {
  let uuid = 100;
  return { v4: () => `${uuid++}` };
});

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
const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();
const connectorAdapterRegistry = new ConnectorAdapterRegistry();

const kibanaVersion = 'v8.0.0';
const rulesClientParams: jest.Mocked<ConstructorOptions> = {
  taskManager,
  ruleTypeRegistry,
  unsecuredSavedObjectsClient,
  authorization: authorization as unknown as AlertingAuthorization,
  actionsAuthorization: actionsAuthorization as unknown as ActionsAuthorization,
  spaceId: 'default',
  namespace: 'default',
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
  maxScheduledPerMinute: 10000,
  minimumScheduleInterval: { value: '1m', enforce: false },
  isAuthenticationTypeAPIKey: jest.fn(),
  getAuthenticationAPIKey: jest.fn(),
  getAlertIndicesAlias: jest.fn(),
  alertsService: null,
  backfillClient: backfillClientMock.create(),
  connectorAdapterRegistry,
  isSystemAction: jest.fn(),
  uiSettings: uiSettingsServiceMock.createStartContract(),
  featureFlags: coreFeatureFlagsMock.createStart(),
  isServerless: false,
};

beforeEach(() => {
  getBeforeSetup(rulesClientParams, taskManager, ruleTypeRegistry);
  (auditLogger.log as jest.Mock).mockClear();
});

setGlobalDate();

const now = new Date().toISOString();

function getMockData(overwrites: Record<string, unknown> = {}): CreateRuleParams<{
  bar: boolean;
}>['data'] {
  return {
    enabled: true,
    name: 'abc',
    tags: ['foo'],
    alertTypeId: '123',
    consumer: 'bar',
    schedule: { interval: '1m' },
    throttle: null,
    notifyWhen: null,
    params: {
      bar: true,
    },
    actions: [
      {
        group: 'default',
        id: '1',
        params: {
          foo: true,
        },
      },
    ],
    ...overwrites,
  };
}

describe('create()', () => {
  let rulesClient: RulesClient;
  let actionsClient: jest.Mocked<ActionsClient>;

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

    actionsClient.isSystemAction.mockImplementation((id: string) => id === 'system_action-id');

    taskManager.schedule.mockResolvedValue({
      id: 'task-123',
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

    rulesClientParams.getActionsClient.mockResolvedValue(actionsClient);
  });

  describe('authorization', () => {
    function tryToExecuteOperation(
      options: CreateRuleParams<{
        bar: boolean;
      }>
    ): Promise<unknown> {
      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          alertTypeId: '123',
          schedule: { interval: '1m' },
          params: {
            bar: true,
          },
          executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
          running: false,
          createdAt: '2019-02-12T21:01:22.479Z',
          actions: [
            {
              group: 'default',
              actionRef: 'action_0',
              actionTypeId: 'test',
              uuid: 'test-uuid',
              params: {
                foo: true,
              },
              frequency: { summary: false, notifyWhen: ruleNotifyWhen.CHANGE, throttle: null },
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
      });
      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          actions: [],
          scheduledTaskId: 'task-123',
        },
        references: [
          {
            id: '1',
            name: 'action_0',
            type: 'action',
          },
        ],
      });

      return rulesClient.create(options);
    }

    test('ensures user is authorised to create this type of rule under the consumer', async () => {
      const data = getMockData({
        alertTypeId: 'myType',
        consumer: 'myApp',
      });

      await tryToExecuteOperation({ data });

      expect(authorization.ensureAuthorized).toHaveBeenCalledWith({
        entity: 'rule',
        consumer: 'myApp',
        operation: 'create',
        ruleTypeId: 'myType',
      });
    });

    test('throws when user is not authorised to create this type of rule', async () => {
      const data = getMockData({
        alertTypeId: 'myType',
        consumer: 'myApp',
      });

      authorization.ensureAuthorized.mockRejectedValue(
        new Error(`Unauthorized to create a "myType" rule for "myApp"`)
      );

      await expect(tryToExecuteOperation({ data })).rejects.toMatchInlineSnapshot(
        `[Error: Unauthorized to create a "myType" rule for "myApp"]`
      );

      expect(authorization.ensureAuthorized).toHaveBeenCalledWith({
        entity: 'rule',
        consumer: 'myApp',
        operation: 'create',
        ruleTypeId: 'myType',
      });
    });
  });

  describe('auditLogger', () => {
    test('logs audit event when creating a rule', async () => {
      const data = getMockData({
        enabled: false,
        actions: [],
      });
      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          ...data,
          executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
          running: false,
        },
        references: [],
      });
      await rulesClient.create({ data });
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_create',
            outcome: 'unknown',
          }),
          kibana: {
            saved_object: { id: 'mock-saved-object-id', type: RULE_SAVED_OBJECT_TYPE, name: 'abc' },
          },
        })
      );
    });

    test('logs audit event when not authorised to create a rule', async () => {
      authorization.ensureAuthorized.mockRejectedValue(new Error('Unauthorized'));

      await expect(
        rulesClient.create({
          data: getMockData({
            enabled: false,
            actions: [],
          }),
        })
      ).rejects.toThrow();
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_create',
            outcome: 'failure',
          }),
          kibana: {
            saved_object: {
              id: 'mock-saved-object-id',
              type: RULE_SAVED_OBJECT_TYPE,
              name: 'abc',
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

  test('creates a rule', async () => {
    const data = getMockData();
    const createdAttributes = {
      ...data,
      alertTypeId: '123',
      schedule: { interval: '1m' },
      params: {
        bar: true,
      },
      createdAt: '2019-02-12T21:01:22.479Z',
      createdBy: 'elastic',
      updatedBy: 'elastic',
      updatedAt: '2019-02-12T21:01:22.479Z',
      muteAll: false,
      snoozeSchedule: [],
      mutedInstanceIds: [],
      actions: [
        {
          group: 'default',
          actionRef: 'action_0',
          actionTypeId: 'test',
          uuid: 'test-uuid',
          params: {
            foo: true,
          },
        },
      ],
    };

    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        ...createdAttributes,
        running: false,
        executionStatus: getRuleExecutionStatusPending(createdAttributes.createdAt),
      },
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    });

    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        ...createdAttributes,
        running: false,
        executionStatus: getRuleExecutionStatusPending(createdAttributes.createdAt),
        scheduledTaskId: 'task-123',
      },
      references: [
        {
          id: '1',
          name: 'action_0',
          type: 'action',
        },
      ],
    });

    const result = await rulesClient.create({ data });

    expect(authorization.ensureAuthorized).toHaveBeenCalledWith({
      entity: 'rule',
      consumer: 'bar',
      operation: 'create',
      ruleTypeId: '123',
    });

    expect(result).toMatchInlineSnapshot(`
      Object {
        "actions": Array [
          Object {
            "actionTypeId": "test",
            "group": "default",
            "id": "1",
            "params": Object {
              "foo": true,
            },
            "uuid": "test-uuid",
          },
        ],
        "alertTypeId": "123",
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "consumer": "bar",
        "createdAt": 2019-02-12T21:01:22.479Z,
        "createdBy": "elastic",
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.000Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "muteAll": false,
        "mutedInstanceIds": Array [],
        "name": "abc",
        "notifyWhen": null,
        "params": Object {
          "bar": true,
        },
        "running": false,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "tags": Array [
          "foo",
        ],
        "throttle": null,
        "updatedAt": 2019-02-12T21:01:22.479Z,
        "updatedBy": "elastic",
      }
    `);
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.create.mock.calls[0]).toHaveLength(3);
    expect(unsecuredSavedObjectsClient.create.mock.calls[0][0]).toEqual(RULE_SAVED_OBJECT_TYPE);
    expect(unsecuredSavedObjectsClient.create.mock.calls[0][1]).toMatchInlineSnapshot(`
      Object {
        "actions": Array [
          Object {
            "actionRef": "action_0",
            "actionTypeId": "test",
            "group": "default",
            "params": Object {
              "foo": true,
            },
            "uuid": "102",
          },
        ],
        "alertTypeId": "123",
        "apiKey": null,
        "apiKeyCreatedByUser": null,
        "apiKeyOwner": null,
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "consumer": "bar",
        "createdAt": "2019-02-12T21:01:22.479Z",
        "createdBy": "elastic",
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": "2019-02-12T21:01:22.479Z",
          "status": "pending",
        },
        "lastEnabledAt": "2019-02-12T21:01:22.479Z",
        "legacyId": null,
        "meta": Object {
          "versionApiKeyLastmodified": "v8.0.0",
        },
        "monitoring": Object {
          "run": Object {
            "calculated_metrics": Object {
              "success_ratio": 0,
            },
            "history": Array [],
            "last_run": Object {
              "metrics": Object {
                "duration": 0,
                "gap_duration_s": null,
                "gap_range": null,
                "gap_reason": null,
                "total_alerts_created": null,
                "total_alerts_detected": null,
                "total_indexing_duration_ms": null,
                "total_search_duration_ms": null,
              },
              "timestamp": "2019-02-12T21:01:22.479Z",
            },
          },
        },
        "muteAll": false,
        "mutedInstanceIds": Array [],
        "name": "abc",
        "notifyWhen": null,
        "params": Object {
          "bar": true,
        },
        "revision": 0,
        "running": false,
        "schedule": Object {
          "interval": "1m",
        },
        "snoozeSchedule": Array [],
        "tags": Array [
          "foo",
        ],
        "throttle": null,
        "updatedAt": "2019-02-12T21:01:22.479Z",
        "updatedBy": "elastic",
      }
    `);
    expect(unsecuredSavedObjectsClient.create.mock.calls[0][2]).toMatchInlineSnapshot(`
      Object {
        "id": "mock-saved-object-id",
        "references": Array [
          Object {
            "id": "1",
            "name": "action_0",
            "type": "action",
          },
        ],
      }
    `);
    expect(taskManager.schedule).toHaveBeenCalledTimes(1);
    expect(taskManager.schedule.mock.calls[0]).toMatchInlineSnapshot(`
                                                                        Array [
                                                                          Object {
                                                                            "enabled": true,
                                                                            "id": "1",
                                                                            "params": Object {
                                                                              "alertId": "1",
                                                                              "consumer": "bar",
                                                                              "spaceId": "default",
                                                                            },
                                                                            "schedule": Object {
                                                                              "interval": "1m",
                                                                            },
                                                                            "scope": Array [
                                                                              "alerting",
                                                                            ],
                                                                            "state": Object {
                                                                              "alertInstances": Object {},
                                                                              "alertTypeState": Object {},
                                                                              "previousStartedAt": null,
                                                                            },
                                                                            "taskType": "alerting:123",
                                                                          },
                                                                        ]
                                                `);
    expect(unsecuredSavedObjectsClient.update).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.update.mock.calls[0]).toHaveLength(4);
    expect(unsecuredSavedObjectsClient.update.mock.calls[0][0]).toEqual(RULE_SAVED_OBJECT_TYPE);
    expect(unsecuredSavedObjectsClient.update.mock.calls[0][1]).toEqual('1');
    expect(unsecuredSavedObjectsClient.update.mock.calls[0][2]).toMatchInlineSnapshot(`
      Object {
        "scheduledTaskId": "task-123",
      }
    `);
    expect(actionsClient.isActionTypeEnabled).toHaveBeenCalledWith('test', { notifyUsage: true });
  });

  test('creates an rule with a custom id', async () => {
    const data = getMockData();
    const createdAttributes = {
      ...data,
      alertTypeId: '123',
      schedule: { interval: '1m' },
      params: {
        bar: true,
      },
      createdAt: '2019-02-12T21:01:22.479Z',
      createdBy: 'elastic',
      updatedBy: 'elastic',
      updatedAt: '2019-02-12T21:01:22.479Z',
      muteAll: false,
      snoozeSchedule: [],
      mutedInstanceIds: [],
      actions: [
        {
          group: 'default',
          actionRef: 'action_0',
          actionTypeId: 'test',
          uuid: 'test-uuid',
          params: {
            foo: true,
          },
        },
      ],
    };
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '123',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        ...createdAttributes,
        running: false,
        executionStatus: getRuleExecutionStatusPending(createdAttributes.createdAt),
      },
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    });
    const result = await rulesClient.create({ data, options: { id: '123' } });
    expect(result.id).toEqual('123');
    expect(unsecuredSavedObjectsClient.create.mock.calls[0][2]).toMatchInlineSnapshot(`
      Object {
        "id": "123",
        "references": Array [
          Object {
            "id": "1",
            "name": "action_0",
            "type": "action",
          },
        ],
      }
    `);
  });

  test('uses initialRevision when provided in options', async () => {
    const data = getMockData();
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        ...data,
        alertTypeId: '123',
        createdAt: '2019-02-12T21:01:22.479Z',
        updatedAt: '2019-02-12T21:01:22.479Z',
        createdBy: 'elastic',
        updatedBy: 'elastic',
        muteAll: false,
        snoozeSchedule: [],
        mutedInstanceIds: [],
        running: false,
        executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
        actions: [],
      },
      references: [],
    });

    await rulesClient.create({ data: { ...data, actions: [] }, options: { initialRevision: 5 } });

    expect(unsecuredSavedObjectsClient.create.mock.calls[0][1]).toMatchObject({ revision: 5 });
  });

  test('sets legacyId when kibanaVersion is < 8.0.0', async () => {
    const customrulesClient = new RulesClient({
      ...rulesClientParams,
      kibanaVersion: 'v7.10.0',
    });
    const data = getMockData();
    const createdAttributes = {
      ...data,
      legacyId: '123',
      alertTypeId: '123',
      schedule: { interval: '1m' },
      params: {
        bar: true,
      },
      createdAt: '2019-02-12T21:01:22.479Z',
      createdBy: 'elastic',
      updatedBy: 'elastic',
      updatedAt: '2019-02-12T21:01:22.479Z',
      muteAll: false,
      snoozeSchedule: [],
      mutedInstanceIds: [],
      actions: [
        {
          group: 'default',
          actionRef: 'action_0',
          actionTypeId: 'test',
          uuid: 'test-uuid',
          params: {
            foo: true,
          },
        },
      ],
    };
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '123',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        ...createdAttributes,
        running: false,
        executionStatus: getRuleExecutionStatusPending(createdAttributes.createdAt),
      },
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    });
    const result = await customrulesClient.create({ data, options: { id: '123' } });
    expect(result.id).toEqual('123');
    expect(unsecuredSavedObjectsClient.create.mock.calls[0][1]).toMatchInlineSnapshot(`
      Object {
        "actions": Array [
          Object {
            "actionRef": "action_0",
            "actionTypeId": "test",
            "group": "default",
            "params": Object {
              "foo": true,
            },
            "uuid": "104",
          },
        ],
        "alertTypeId": "123",
        "apiKey": null,
        "apiKeyCreatedByUser": null,
        "apiKeyOwner": null,
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "consumer": "bar",
        "createdAt": "2019-02-12T21:01:22.479Z",
        "createdBy": "elastic",
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": "2019-02-12T21:01:22.479Z",
          "status": "pending",
        },
        "lastEnabledAt": "2019-02-12T21:01:22.479Z",
        "legacyId": "123",
        "meta": Object {
          "versionApiKeyLastmodified": "v7.10.0",
        },
        "monitoring": Object {
          "run": Object {
            "calculated_metrics": Object {
              "success_ratio": 0,
            },
            "history": Array [],
            "last_run": Object {
              "metrics": Object {
                "duration": 0,
                "gap_duration_s": null,
                "gap_range": null,
                "gap_reason": null,
                "total_alerts_created": null,
                "total_alerts_detected": null,
                "total_indexing_duration_ms": null,
                "total_search_duration_ms": null,
              },
              "timestamp": "2019-02-12T21:01:22.479Z",
            },
          },
        },
        "muteAll": false,
        "mutedInstanceIds": Array [],
        "name": "abc",
        "notifyWhen": null,
        "params": Object {
          "bar": true,
        },
        "revision": 0,
        "running": false,
        "schedule": Object {
          "interval": "1m",
        },
        "snoozeSchedule": Array [],
        "tags": Array [
          "foo",
        ],
        "throttle": null,
        "updatedAt": "2019-02-12T21:01:22.479Z",
        "updatedBy": "elastic",
      }
    `);
  });

  test('creates an rule with multiple actions', async () => {
    const data = getMockData({
      actions: [
        {
          group: 'default',
          id: '1',
          params: {
            foo: true,
          },
        },
        {
          group: 'default',
          id: '1',
          params: {
            foo: true,
          },
        },
        {
          group: 'default',
          id: '2',
          params: {
            foo: true,
          },
        },
      ],
    });
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
      createMockConnector({
        id: '2',
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
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        running: false,
        executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
        alertTypeId: '123',
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notifyWhen: null,
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            uuid: 'test-uuid',
            params: {
              foo: true,
            },
          },
          {
            group: 'default',
            actionRef: 'action_1',
            actionTypeId: 'test',
            uuid: 'test-uuid-1',
            params: {
              foo: true,
            },
          },
          {
            group: 'default',
            actionRef: 'action_2',
            actionTypeId: 'test2',
            uuid: 'test-uuid-2',
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
        {
          name: 'action_1',
          type: 'action',
          id: '1',
        },
        {
          name: 'action_2',
          type: 'action',
          id: '2',
        },
      ],
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        actions: [],
        scheduledTaskId: 'task-123',
      },
      references: [],
    });
    const result = await rulesClient.create({ data });
    expect(result).toMatchInlineSnapshot(`
      Object {
        "actions": Array [
          Object {
            "actionTypeId": "test",
            "group": "default",
            "id": "1",
            "params": Object {
              "foo": true,
            },
            "uuid": "test-uuid",
          },
          Object {
            "actionTypeId": "test",
            "group": "default",
            "id": "1",
            "params": Object {
              "foo": true,
            },
            "uuid": "test-uuid-1",
          },
          Object {
            "actionTypeId": "test2",
            "group": "default",
            "id": "2",
            "params": Object {
              "foo": true,
            },
            "uuid": "test-uuid-2",
          },
        ],
        "alertTypeId": "123",
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "createdAt": 2019-02-12T21:01:22.479Z,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.000Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "notifyWhen": null,
        "params": Object {
          "bar": true,
        },
        "running": false,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "updatedAt": 2019-02-12T21:01:22.479Z,
      }
    `);
  });

  test('creates a rule with some actions using preconfigured connectors', async () => {
    const data = getMockData({
      actions: [
        {
          group: 'default',
          id: '1',
          params: {
            foo: true,
          },
        },
        {
          group: 'default',
          id: 'preconfigured',
          params: {
            foo: true,
          },
        },
        {
          group: 'default',
          id: '2',
          params: {
            foo: true,
          },
        },
      ],
    });
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
      createMockConnector({
        id: '2',
        actionTypeId: 'test2',
        config: {
          from: 'me@me.com',
          hasAuth: false,
          host: 'hello',
          port: 22,
          secure: null,
          service: null,
        },
        name: 'another email connector',
      }),
      createMockConnector({
        id: 'preconfigured',
        actionTypeId: 'test',
        config: {
          from: 'me@me.com',
          hasAuth: false,
          host: 'hello',
          port: 22,
          secure: null,
          service: null,
        },
        name: 'preconfigured email connector',
        isPreconfigured: true,
      }),
    ]);

    actionsClient.isPreconfigured.mockReset();
    actionsClient.isPreconfigured.mockImplementation((id) => id === 'preconfigured');

    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
        alertTypeId: '123',
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notifyWhen: null,
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            uuid: 'test-uuid',
            params: {
              foo: true,
            },
          },
          {
            group: 'default',
            actionRef: 'preconfigured:preconfigured',
            actionTypeId: 'test',
            uuid: 'test-uuid-1',
            params: {
              foo: true,
            },
          },
          {
            group: 'default',
            actionRef: 'action_2',
            actionTypeId: 'test2',
            uuid: 'test-uuid-2',
            params: {
              foo: true,
            },
          },
        ],
        running: false,
      },
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
        {
          name: 'action_2',
          type: 'action',
          id: '2',
        },
      ],
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        actions: [],
        scheduledTaskId: 'task-123',
      },
      references: [],
    });
    const result = await rulesClient.create({ data });
    expect(result).toMatchInlineSnapshot(`
      Object {
        "actions": Array [
          Object {
            "actionTypeId": "test",
            "group": "default",
            "id": "1",
            "params": Object {
              "foo": true,
            },
            "uuid": "test-uuid",
          },
          Object {
            "actionTypeId": "test",
            "group": "default",
            "id": "preconfigured",
            "params": Object {
              "foo": true,
            },
            "uuid": "test-uuid-1",
          },
          Object {
            "actionTypeId": "test2",
            "group": "default",
            "id": "2",
            "params": Object {
              "foo": true,
            },
            "uuid": "test-uuid-2",
          },
        ],
        "alertTypeId": "123",
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "createdAt": 2019-02-12T21:01:22.479Z,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.000Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "notifyWhen": null,
        "params": Object {
          "bar": true,
        },
        "running": false,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "updatedAt": 2019-02-12T21:01:22.479Z,
      }
    `);
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      {
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
            uuid: '108',
          },
          {
            group: 'default',
            actionRef: 'preconfigured:preconfigured',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
            uuid: '109',
          },
          {
            group: 'default',
            actionRef: 'action_2',
            actionTypeId: 'test2',
            params: {
              foo: true,
            },
            uuid: '110',
          },
        ],
        alertTypeId: '123',
        apiKey: null,
        apiKeyOwner: null,
        artifacts: {
          dashboards: [],
          investigation_guide: { blob: '' },
        },
        apiKeyCreatedByUser: null,
        consumer: 'bar',
        createdAt: '2019-02-12T21:01:22.479Z',
        createdBy: 'elastic',
        enabled: true,
        legacyId: null,
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        lastEnabledAt: '2019-02-12T21:01:22.479Z',
        monitoring: getDefaultMonitoring('2019-02-12T21:01:22.479Z'),
        meta: { versionApiKeyLastmodified: kibanaVersion },
        muteAll: false,
        snoozeSchedule: [],
        mutedInstanceIds: [],
        name: 'abc',
        notifyWhen: null,
        params: { bar: true },
        revision: 0,
        running: false,
        schedule: { interval: '1m' },
        tags: ['foo'],
        throttle: null,
        updatedAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
      },
      {
        id: 'mock-saved-object-id',
        references: [
          { id: '1', name: 'action_0', type: 'action' },
          { id: '2', name: 'action_2', type: 'action' },
        ],
      }
    );
    expect(actionsClient.isPreconfigured).toHaveBeenCalledTimes(3);
  });

  test('creates a rule with some actions using system connectors', async () => {
    const data = getMockData({
      actions: [
        {
          group: 'default',
          id: '1',
          params: {
            foo: true,
          },
        },
        {
          group: 'default',
          id: '2',
          params: {
            foo: true,
          },
        },
      ],
      systemActions: [
        {
          id: 'system_action-id',
          params: {},
        },
      ],
    });

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
      createMockConnector({
        id: '2',
        actionTypeId: 'test2',
        config: {
          from: 'me@me.com',
          hasAuth: false,
          host: 'hello',
          port: 22,
          secure: null,
          service: null,
        },
        name: 'another email connector',
      }),
      createMockConnector({
        id: 'system_action-id',
        actionTypeId: 'test',
        config: {},
        name: 'system action connector',
        isSystemAction: true,
      }),
    ]);

    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
        alertTypeId: '123',
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notifyWhen: null,
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
          },
          {
            actionRef: 'system_action:system_action-id',
            actionTypeId: 'test',
            params: {},
          },
          {
            group: 'default',
            actionRef: 'action_1',
            actionTypeId: 'test2',
            params: {
              foo: true,
            },
          },
        ],
        running: false,
      },
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
        {
          name: 'action_1',
          type: 'action',
          id: '2',
        },
      ],
    });

    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        actions: [],
        scheduledTaskId: 'task-123',
      },
      references: [],
    });

    const result = await rulesClient.create({ data });

    expect(result).toMatchInlineSnapshot(`
      Object {
        "actions": Array [
          Object {
            "actionTypeId": "test",
            "group": "default",
            "id": "1",
            "params": Object {
              "foo": true,
            },
            "uuid": undefined,
          },
          Object {
            "actionTypeId": "test2",
            "group": "default",
            "id": "2",
            "params": Object {
              "foo": true,
            },
            "uuid": undefined,
          },
        ],
        "alertTypeId": "123",
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "createdAt": 2019-02-12T21:01:22.479Z,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.000Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "notifyWhen": null,
        "params": Object {
          "bar": true,
        },
        "running": false,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [
          Object {
            "actionTypeId": "test",
            "id": "system_action-id",
            "params": Object {},
            "uuid": undefined,
          },
        ],
        "updatedAt": 2019-02-12T21:01:22.479Z,
      }
    `);

    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      {
        actions: [
          {
            actionRef: 'action_0',
            actionTypeId: 'test',
            group: 'default',
            params: {
              foo: true,
            },
            uuid: '111',
          },
          {
            actionRef: 'action_1',
            actionTypeId: 'test2',
            group: 'default',
            params: {
              foo: true,
            },
            uuid: '112',
          },
          {
            actionRef: 'system_action:system_action-id',
            actionTypeId: 'test',
            params: {},
            uuid: '113',
          },
        ],
        alertTypeId: '123',
        apiKey: null,
        apiKeyCreatedByUser: null,
        apiKeyOwner: null,
        artifacts: {
          dashboards: [],
          investigation_guide: { blob: '' },
        },
        consumer: 'bar',
        createdAt: '2019-02-12T21:01:22.479Z',
        createdBy: 'elastic',
        enabled: true,
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        lastEnabledAt: '2019-02-12T21:01:22.479Z',
        legacyId: null,
        meta: {
          versionApiKeyLastmodified: 'v8.0.0',
        },
        monitoring: {
          run: {
            calculated_metrics: {
              success_ratio: 0,
            },
            history: [],
            last_run: {
              metrics: {
                duration: 0,
                gap_duration_s: null,
                gap_range: null,
                gap_reason: null,
                total_alerts_created: null,
                total_alerts_detected: null,
                total_indexing_duration_ms: null,
                total_search_duration_ms: null,
              },
              timestamp: '2019-02-12T21:01:22.479Z',
            },
          },
        },
        muteAll: false,
        mutedInstanceIds: [],
        name: 'abc',
        notifyWhen: null,
        params: {
          bar: true,
        },
        revision: 0,
        running: false,
        schedule: {
          interval: '1m',
        },
        snoozeSchedule: [],
        tags: ['foo'],
        throttle: null,
        updatedAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
      },
      {
        id: 'mock-saved-object-id',
        references: [
          { id: '1', name: 'action_0', type: 'action' },
          { id: '2', name: 'action_1', type: 'action' },
        ],
      }
    );
  });

  test('creates a disabled rule', async () => {
    const data = getMockData({ enabled: false });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: false,
        alertTypeId: '123',
        schedule: { interval: 10000 },
        params: {
          bar: true,
        },
        running: false,
        executionStatus: getRuleExecutionStatusPending(now),
        createdAt: now,
        updatedAt: now,
        notifyWhen: null,
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            uuid: 'test-uuid',
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
    });
    const result = await rulesClient.create({ data });
    expect(result).toMatchInlineSnapshot(`
      Object {
        "actions": Array [
          Object {
            "actionTypeId": "test",
            "group": "default",
            "id": "1",
            "params": Object {
              "foo": true,
            },
            "uuid": "test-uuid",
          },
        ],
        "alertTypeId": "123",
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "createdAt": 2019-02-12T21:01:22.479Z,
        "enabled": false,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.000Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "notifyWhen": null,
        "params": Object {
          "bar": true,
        },
        "running": false,
        "schedule": Object {
          "interval": 10000,
        },
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "updatedAt": 2019-02-12T21:01:22.479Z,
      }
    `);
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
    expect(taskManager.schedule).toHaveBeenCalledTimes(0);
  });

  test('should call useSavedObjectReferences.extractReferences and useSavedObjectReferences.injectReferences if defined for rule type', async () => {
    const ruleParams = {
      bar: true,
      parameterThatIsSavedObjectId: '9',
    };
    const extractReferencesFn = jest.fn().mockReturnValue({
      params: {
        bar: true,
        parameterThatIsSavedObjectRef: 'soRef_0',
      },
      references: [
        {
          name: 'soRef_0',
          type: 'someSavedObjectType',
          id: '9',
        },
      ],
    });
    const injectReferencesFn = jest.fn().mockReturnValue({
      bar: true,
      parameterThatIsSavedObjectId: '9',
    });
    ruleTypeRegistry.get.mockImplementation(() => ({
      id: '123',
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
      solution: 'stack',
      useSavedObjectReferences: {
        extractReferences: extractReferencesFn,
        injectReferences: injectReferencesFn,
      },
      validate: {
        params: { validate: (params) => params },
      },
      validLegacyConsumers: [],
    }));
    const data = getMockData({
      params: ruleParams,
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        alertTypeId: '123',
        schedule: { interval: '1m' },
        params: {
          bar: true,
          parameterThatIsSavedObjectRef: 'soRef_0',
        },
        executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
        running: false,
        createdAt: now,
        updatedAt: now,
        notifyWhen: null,
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            uuid: 'test-uuid',
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
        {
          name: 'param:soRef_0',
          type: 'someSavedObjectType',
          id: '9',
        },
      ],
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        actions: [],
        scheduledTaskId: 'task-123',
      },
      references: [],
    });
    const result = await rulesClient.create({ data });

    expect(extractReferencesFn).toHaveBeenCalledWith(ruleParams);
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      {
        actions: [
          {
            actionRef: 'action_0',
            actionTypeId: 'test',
            group: 'default',
            params: { foo: true },
            uuid: '115',
          },
        ],
        alertTypeId: '123',
        apiKey: null,
        apiKeyOwner: null,
        apiKeyCreatedByUser: null,
        artifacts: {
          dashboards: [],
          investigation_guide: { blob: '' },
        },
        consumer: 'bar',
        createdAt: '2019-02-12T21:01:22.479Z',
        createdBy: 'elastic',
        enabled: true,
        legacyId: null,
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        lastEnabledAt: '2019-02-12T21:01:22.479Z',
        monitoring: getDefaultMonitoring('2019-02-12T21:01:22.479Z'),
        meta: { versionApiKeyLastmodified: kibanaVersion },
        muteAll: false,
        snoozeSchedule: [],
        mutedInstanceIds: [],
        name: 'abc',
        notifyWhen: null,
        params: { bar: true, parameterThatIsSavedObjectRef: 'soRef_0' },
        revision: 0,
        running: false,
        schedule: { interval: '1m' },
        tags: ['foo'],
        throttle: null,
        updatedAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
      },
      {
        id: 'mock-saved-object-id',
        references: [
          { id: '1', name: 'action_0', type: 'action' },
          { id: '9', name: 'param:soRef_0', type: 'someSavedObjectType' },
        ],
      }
    );

    expect(injectReferencesFn).toHaveBeenCalledWith(
      {
        bar: true,
        parameterThatIsSavedObjectRef: 'soRef_0',
      },
      [{ id: '9', name: 'soRef_0', type: 'someSavedObjectType' }]
    );
    expect(result).toMatchInlineSnapshot(`
      Object {
        "actions": Array [
          Object {
            "actionTypeId": "test",
            "group": "default",
            "id": "1",
            "params": Object {
              "foo": true,
            },
            "uuid": "test-uuid",
          },
        ],
        "alertTypeId": "123",
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "createdAt": 2019-02-12T21:01:22.479Z,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.000Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "notifyWhen": null,
        "params": Object {
          "bar": true,
          "parameterThatIsSavedObjectId": "9",
        },
        "running": false,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "updatedAt": 2019-02-12T21:01:22.479Z,
      }
    `);
  });

  test('should allow rule types to use action_ prefix for saved object reference names', async () => {
    const ruleParams = {
      bar: true,
      parameterThatIsSavedObjectId: '8',
    };
    const extractReferencesFn = jest.fn().mockReturnValue({
      params: {
        bar: true,
        parameterThatIsSavedObjectRef: 'action_0',
      },
      references: [
        {
          name: 'action_0',
          type: 'someSavedObjectType',
          id: '8',
        },
      ],
    });
    const injectReferencesFn = jest.fn().mockReturnValue({
      bar: true,
      parameterThatIsSavedObjectId: '8',
    });
    ruleTypeRegistry.get.mockImplementation(() => ({
      id: '123',
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
      validLegacyConsumers: [],
      producer: 'alerts',
      solution: 'stack',
      useSavedObjectReferences: {
        extractReferences: extractReferencesFn,
        injectReferences: injectReferencesFn,
      },
      validate: {
        params: { validate: (params) => params },
      },
    }));
    const data = getMockData({
      params: ruleParams,
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        alertTypeId: '123',
        schedule: { interval: '1m' },
        params: {
          bar: true,
          parameterThatIsSavedObjectRef: 'action_0',
        },
        executionStatus: getRuleExecutionStatusPending(now),
        createdAt: now,
        updatedAt: now,
        notifyWhen: null,
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            uuid: 'test-uuid',
            params: {
              foo: true,
            },
          },
        ],
        running: false,
      },
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
        {
          name: 'param:action_0',
          type: 'someSavedObjectType',
          id: '8',
        },
      ],
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        actions: [],
        scheduledTaskId: 'task-123',
      },
      references: [],
    });
    const result = await rulesClient.create({ data });

    expect(extractReferencesFn).toHaveBeenCalledWith(ruleParams);
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      {
        actions: [
          {
            actionRef: 'action_0',
            actionTypeId: 'test',
            group: 'default',
            params: { foo: true },
            uuid: '116',
          },
        ],
        alertTypeId: '123',
        apiKey: null,
        apiKeyOwner: null,
        apiKeyCreatedByUser: null,
        artifacts: {
          dashboards: [],
          investigation_guide: { blob: '' },
        },
        legacyId: null,
        consumer: 'bar',
        createdAt: '2019-02-12T21:01:22.479Z',
        createdBy: 'elastic',
        enabled: true,
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        lastEnabledAt: '2019-02-12T21:01:22.479Z',
        monitoring: getDefaultMonitoring('2019-02-12T21:01:22.479Z'),
        meta: { versionApiKeyLastmodified: kibanaVersion },
        muteAll: false,
        snoozeSchedule: [],
        mutedInstanceIds: [],
        name: 'abc',
        notifyWhen: null,
        params: { bar: true, parameterThatIsSavedObjectRef: 'action_0' },
        revision: 0,
        running: false,
        schedule: { interval: '1m' },
        tags: ['foo'],
        throttle: null,
        updatedAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
      },
      {
        id: 'mock-saved-object-id',
        references: [
          { id: '1', name: 'action_0', type: 'action' },
          { id: '8', name: 'param:action_0', type: 'someSavedObjectType' },
        ],
      }
    );

    expect(injectReferencesFn).toHaveBeenCalledWith(
      {
        bar: true,
        parameterThatIsSavedObjectRef: 'action_0',
      },
      [{ id: '8', name: 'action_0', type: 'someSavedObjectType' }]
    );
    expect(result).toMatchInlineSnapshot(`
      Object {
        "actions": Array [
          Object {
            "actionTypeId": "test",
            "group": "default",
            "id": "1",
            "params": Object {
              "foo": true,
            },
            "uuid": "test-uuid",
          },
        ],
        "alertTypeId": "123",
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "createdAt": 2019-02-12T21:01:22.479Z,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.000Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "notifyWhen": null,
        "params": Object {
          "bar": true,
          "parameterThatIsSavedObjectId": "8",
        },
        "running": false,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "updatedAt": 2019-02-12T21:01:22.479Z,
      }
    `);
  });

  test('should trim rule name when creating API key', async () => {
    const data = getMockData({ name: ' my rule name ' });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: false,
        name: ' my rule name ',
        alertTypeId: '123',
        schedule: { interval: 10000 },
        params: {
          bar: true,
        },
        executionStatus: getRuleExecutionStatusPending(now),
        running: false,
        createdAt: now,
        updatedAt: now,
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            uuid: 'test-uuid',
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
    });

    await rulesClient.create({ data });
    expect(rulesClientParams.createAPIKey).toHaveBeenCalledWith('Alerting: 123/my rule name');
  });

  test('should create rule with given notifyWhen value if notifyWhen is not null', async () => {
    const data = getMockData({ notifyWhen: 'onActionGroupChange', throttle: '10m' });
    const createdAttributes = {
      ...data,
      alertTypeId: '123',
      schedule: { interval: '1m' },
      params: {
        bar: true,
      },
      executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
      createdAt: '2019-02-12T21:01:22.479Z',
      createdBy: 'elastic',
      updatedBy: 'elastic',
      updatedAt: '2019-02-12T21:01:22.479Z',
      muteAll: false,
      snoozeSchedule: [],
      mutedInstanceIds: [],
      notifyWhen: 'onActionGroupChange',
      actions: [
        {
          group: 'default',
          actionRef: 'action_0',
          actionTypeId: 'test',
          uuid: 'test-uuid',
          params: {
            foo: true,
          },
        },
      ],
      running: false,
    };
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: createdAttributes,
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    });
    const result = await rulesClient.create({ data });
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      {
        actions: [
          {
            actionRef: 'action_0',
            group: 'default',
            actionTypeId: 'test',
            params: { foo: true },
            uuid: '118',
          },
        ],
        alertTypeId: '123',
        consumer: 'bar',
        name: 'abc',
        legacyId: null,
        params: { bar: true },
        apiKey: null,
        apiKeyOwner: null,
        apiKeyCreatedByUser: null,
        artifacts: {
          dashboards: [],
          investigation_guide: { blob: '' },
        },
        createdBy: 'elastic',
        createdAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
        updatedAt: '2019-02-12T21:01:22.479Z',
        enabled: true,
        meta: {
          versionApiKeyLastmodified: kibanaVersion,
        },
        schedule: { interval: '1m' },
        throttle: '10m',
        notifyWhen: 'onActionGroupChange',
        muteAll: false,
        snoozeSchedule: [],
        mutedInstanceIds: [],
        tags: ['foo'],
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        lastEnabledAt: '2019-02-12T21:01:22.479Z',
        monitoring: getDefaultMonitoring('2019-02-12T21:01:22.479Z'),
        revision: 0,
        running: false,
      },
      {
        id: 'mock-saved-object-id',
        references: [
          {
            id: '1',
            name: 'action_0',
            type: 'action',
          },
        ],
      }
    );
    expect(result).toMatchInlineSnapshot(`
      Object {
        "actions": Array [
          Object {
            "actionTypeId": "test",
            "group": "default",
            "id": "1",
            "params": Object {
              "foo": true,
            },
            "uuid": "test-uuid",
          },
        ],
        "alertTypeId": "123",
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "consumer": "bar",
        "createdAt": 2019-02-12T21:01:22.479Z,
        "createdBy": "elastic",
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.000Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "muteAll": false,
        "mutedInstanceIds": Array [],
        "name": "abc",
        "notifyWhen": "onActionGroupChange",
        "params": Object {
          "bar": true,
        },
        "running": false,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "tags": Array [
          "foo",
        ],
        "throttle": "10m",
        "updatedAt": 2019-02-12T21:01:22.479Z,
        "updatedBy": "elastic",
      }
    `);
  });

  test('should create rule with notifyWhen = onThrottleInterval if notifyWhen is null and throttle is set', async () => {
    const data = getMockData({ throttle: '10m' });
    const createdAttributes = {
      ...data,
      alertTypeId: '123',
      schedule: { interval: '1m' },
      params: {
        bar: true,
      },
      executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
      createdAt: '2019-02-12T21:01:22.479Z',
      createdBy: 'elastic',
      updatedBy: 'elastic',
      updatedAt: '2019-02-12T21:01:22.479Z',
      muteAll: false,
      snoozeSchedule: [],
      mutedInstanceIds: [],
      notifyWhen: 'onThrottleInterval',
      actions: [
        {
          group: 'default',
          actionRef: 'action_0',
          actionTypeId: 'test',
          uuid: 'test-uuid',
          params: {
            foo: true,
          },
        },
      ],
      running: false,
    };
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: createdAttributes,
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    });
    const result = await rulesClient.create({ data });
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      {
        actions: [
          {
            actionRef: 'action_0',
            group: 'default',
            actionTypeId: 'test',
            params: { foo: true },
            uuid: '119',
          },
        ],
        legacyId: null,
        alertTypeId: '123',
        consumer: 'bar',
        name: 'abc',
        params: { bar: true },
        apiKey: null,
        apiKeyOwner: null,
        apiKeyCreatedByUser: null,
        artifacts: {
          dashboards: [],
          investigation_guide: { blob: '' },
        },
        createdBy: 'elastic',
        createdAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
        updatedAt: '2019-02-12T21:01:22.479Z',
        enabled: true,
        meta: {
          versionApiKeyLastmodified: kibanaVersion,
        },
        schedule: { interval: '1m' },
        throttle: '10m',
        notifyWhen: 'onThrottleInterval',
        muteAll: false,
        snoozeSchedule: [],
        mutedInstanceIds: [],
        tags: ['foo'],
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        lastEnabledAt: '2019-02-12T21:01:22.479Z',
        monitoring: getDefaultMonitoring('2019-02-12T21:01:22.479Z'),
        revision: 0,
        running: false,
      },
      {
        id: 'mock-saved-object-id',
        references: [
          {
            id: '1',
            name: 'action_0',
            type: 'action',
          },
        ],
      }
    );
    expect(result).toMatchInlineSnapshot(`
      Object {
        "actions": Array [
          Object {
            "actionTypeId": "test",
            "group": "default",
            "id": "1",
            "params": Object {
              "foo": true,
            },
            "uuid": "test-uuid",
          },
        ],
        "alertTypeId": "123",
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "consumer": "bar",
        "createdAt": 2019-02-12T21:01:22.479Z,
        "createdBy": "elastic",
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.000Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "muteAll": false,
        "mutedInstanceIds": Array [],
        "name": "abc",
        "notifyWhen": "onThrottleInterval",
        "params": Object {
          "bar": true,
        },
        "running": false,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "tags": Array [
          "foo",
        ],
        "throttle": "10m",
        "updatedAt": 2019-02-12T21:01:22.479Z,
        "updatedBy": "elastic",
      }
    `);
  });

  test('should create rule with notifyWhen = onActiveAlert if notifyWhen is null and throttle is null', async () => {
    const data = getMockData();
    const createdAttributes = {
      ...data,
      alertTypeId: '123',
      schedule: { interval: '1m' },
      params: {
        bar: true,
      },
      executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
      createdAt: '2019-02-12T21:01:22.479Z',
      createdBy: 'elastic',
      updatedBy: 'elastic',
      updatedAt: '2019-02-12T21:01:22.479Z',
      muteAll: false,
      snoozeSchedule: [],
      mutedInstanceIds: [],
      notifyWhen: null,
      actions: [
        {
          group: 'default',
          actionRef: 'action_0',
          actionTypeId: 'test',
          uuid: 'test-uuid',
          params: {
            foo: true,
          },
        },
      ],
      running: false,
    };
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: createdAttributes,
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    });
    const result = await rulesClient.create({ data });
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      {
        actions: [
          {
            actionRef: 'action_0',
            group: 'default',
            actionTypeId: 'test',
            params: { foo: true },
            uuid: '120',
          },
        ],
        legacyId: null,
        alertTypeId: '123',
        consumer: 'bar',
        name: 'abc',
        params: { bar: true },
        apiKey: null,
        apiKeyOwner: null,
        apiKeyCreatedByUser: null,
        artifacts: {
          dashboards: [],
          investigation_guide: {
            blob: '',
          },
        },
        createdBy: 'elastic',
        createdAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
        updatedAt: '2019-02-12T21:01:22.479Z',
        enabled: true,
        meta: {
          versionApiKeyLastmodified: kibanaVersion,
        },
        schedule: { interval: '1m' },
        throttle: null,
        notifyWhen: null,
        muteAll: false,
        snoozeSchedule: [],
        mutedInstanceIds: [],
        tags: ['foo'],
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        lastEnabledAt: '2019-02-12T21:01:22.479Z',
        monitoring: getDefaultMonitoring('2019-02-12T21:01:22.479Z'),
        revision: 0,
        running: false,
      },
      {
        id: 'mock-saved-object-id',
        references: [
          {
            id: '1',
            name: 'action_0',
            type: 'action',
          },
        ],
      }
    );
    expect(result).toMatchInlineSnapshot(`
      Object {
        "actions": Array [
          Object {
            "actionTypeId": "test",
            "group": "default",
            "id": "1",
            "params": Object {
              "foo": true,
            },
            "uuid": "test-uuid",
          },
        ],
        "alertTypeId": "123",
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "consumer": "bar",
        "createdAt": 2019-02-12T21:01:22.479Z,
        "createdBy": "elastic",
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.000Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "muteAll": false,
        "mutedInstanceIds": Array [],
        "name": "abc",
        "notifyWhen": null,
        "params": Object {
          "bar": true,
        },
        "running": false,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "tags": Array [
          "foo",
        ],
        "throttle": null,
        "updatedAt": 2019-02-12T21:01:22.479Z,
        "updatedBy": "elastic",
      }
    `);
  });

  test('should create rules with mapped_params', async () => {
    const data = getMockData({
      params: {
        bar: true,
        risk_score: 42,
        severity: 'low',
      },
    });

    const createdAttributes = {
      ...data,
      alertTypeId: '123',
      schedule: { interval: '10s' },
      params: {
        bar: true,
        risk_score: 42,
        severity: 'low',
      },
      executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
      createdAt: '2019-02-12T21:01:22.479Z',
      createdBy: 'elastic',
      updatedBy: 'elastic',
      updatedAt: '2019-02-12T21:01:22.479Z',
      muteAll: false,
      snoozeSchedule: [],
      mutedInstanceIds: [],
      actions: [
        {
          group: 'default',
          actionRef: 'action_0',
          actionTypeId: 'test',
          uuid: 'test-uuid',
          params: {
            foo: true,
          },
        },
      ],
      running: false,
    };
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '123',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: createdAttributes,
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    });

    const result = await rulesClient.create({ data });

    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      {
        enabled: true,
        name: 'abc',
        tags: ['foo'],
        alertTypeId: '123',
        consumer: 'bar',
        schedule: {
          interval: '1m',
        },
        throttle: null,
        notifyWhen: null,
        params: {
          bar: true,
          risk_score: 42,
          severity: 'low',
        },
        actions: [
          {
            group: 'default',
            params: {
              foo: true,
            },
            actionRef: 'action_0',
            actionTypeId: 'test',
            uuid: '121',
          },
        ],
        apiKeyOwner: null,
        apiKey: null,
        apiKeyCreatedByUser: null,
        artifacts: {
          dashboards: [],
          investigation_guide: {
            blob: '',
          },
        },
        legacyId: null,
        createdBy: 'elastic',
        updatedBy: 'elastic',
        createdAt: '2019-02-12T21:01:22.479Z',
        updatedAt: '2019-02-12T21:01:22.479Z',
        muteAll: false,
        snoozeSchedule: [],
        mutedInstanceIds: [],
        executionStatus: {
          status: 'pending',
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
        },
        lastEnabledAt: '2019-02-12T21:01:22.479Z',
        monitoring: {
          run: {
            history: [],
            calculated_metrics: {
              success_ratio: 0,
            },
            last_run: {
              timestamp: '2019-02-12T21:01:22.479Z',
              metrics: {
                duration: 0,
                gap_duration_s: null,
                gap_range: null,
                gap_reason: null,
                total_alerts_created: null,
                total_alerts_detected: null,
                total_indexing_duration_ms: null,
                total_search_duration_ms: null,
              },
            },
          },
        },
        mapped_params: {
          risk_score: 42,
          severity: '20-low',
        },
        meta: {
          versionApiKeyLastmodified: 'v8.0.0',
        },
        revision: 0,
        running: false,
      },
      {
        references: [
          {
            id: '1',
            name: 'action_0',
            type: 'action',
          },
        ],
        id: 'mock-saved-object-id',
      }
    );

    expect(result).toMatchInlineSnapshot(`
      Object {
        "actions": Array [
          Object {
            "actionTypeId": "test",
            "group": "default",
            "id": "1",
            "params": Object {
              "foo": true,
            },
            "uuid": "test-uuid",
          },
        ],
        "alertTypeId": "123",
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "consumer": "bar",
        "createdAt": 2019-02-12T21:01:22.479Z,
        "createdBy": "elastic",
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.000Z,
          "status": "pending",
        },
        "id": "123",
        "isSnoozedUntil": null,
        "muteAll": false,
        "mutedInstanceIds": Array [],
        "name": "abc",
        "notifyWhen": null,
        "params": Object {
          "bar": true,
          "risk_score": 42,
          "severity": "low",
        },
        "running": false,
        "schedule": Object {
          "interval": "10s",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "tags": Array [
          "foo",
        ],
        "throttle": null,
        "updatedAt": 2019-02-12T21:01:22.479Z,
        "updatedBy": "elastic",
      }
    `);
  });

  test('should validate params', async () => {
    const data = getMockData();
    ruleTypeRegistry.get.mockReturnValue({
      id: '123',
      name: 'Test',
      actionGroups: [
        {
          id: 'default',
          name: 'Default',
        },
      ],
      category: 'test',
      validLegacyConsumers: [],
      defaultActionGroupId: 'default',
      recoveryActionGroup: RecoveredActionGroup,
      validate: {
        params: schema.object({
          param1: schema.string(),
          threshold: schema.number({ min: 0, max: 1 }),
        }),
      },
      minimumLicenseRequired: 'basic',
      isExportable: true,
      async executor() {
        return { state: {} };
      },
      producer: 'alerts',
      solution: 'stack',
    });
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"params invalid: [param1]: expected value of type [string] but got [undefined]"`
    );
  });

  test('throws error if loading actions fails', async () => {
    const data = getMockData();
    // Reset from default behaviour
    actionsClient.getBulk.mockReset();
    actionsClient.getBulk.mockRejectedValueOnce(new Error('Test Error'));
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Test Error"`
    );
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(taskManager.schedule).not.toHaveBeenCalled();
  });

  test('throws error and add API key to invalidatePendingApiKey SO when create saved object fails', async () => {
    const data = getMockData();
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '123', name: '123', api_key: 'abc' },
    });
    unsecuredSavedObjectsClient.create.mockRejectedValueOnce(new Error('Test failure'));
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Test failure"`
    );
    expect(taskManager.schedule).not.toHaveBeenCalled();
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      { apiKeys: ['MTIzOmFiYw=='] },
      expect.any(Object),
      expect.any(Object)
    );
  });

  test('fails if task scheduling fails due to conflict', async () => {
    const data = getMockData();
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        alertTypeId: '123',
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
        running: false,
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            uuid: 'test-uuid',
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
    });
    taskManager.schedule.mockRejectedValueOnce(
      Object.assign(new Error('Conflict!'), { statusCode: 409 })
    );
    unsecuredSavedObjectsClient.delete.mockResolvedValueOnce({});
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Conflict!"`
    );
    expect(unsecuredSavedObjectsClient.delete).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.delete.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        "alert",
        "1",
        undefined,
      ]
    `);
  });

  test('attempts to remove saved object if scheduling failed', async () => {
    const data = getMockData();
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        alertTypeId: '123',
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
        running: false,
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            uuid: 'test-uuid',
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
    });
    taskManager.schedule.mockRejectedValueOnce(new Error('Test failure'));
    unsecuredSavedObjectsClient.delete.mockResolvedValueOnce({});
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Test failure"`
    );
    expect(unsecuredSavedObjectsClient.delete).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.delete.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        "alert",
        "1",
        undefined,
      ]
    `);
  });

  test('returns task manager error if cleanup fails, logs to console', async () => {
    const data = getMockData();
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        alertTypeId: '123',
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
        running: false,
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            uuid: 'test-uuid',
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
    });
    taskManager.schedule.mockRejectedValueOnce(new Error('Task manager error'));
    unsecuredSavedObjectsClient.delete.mockRejectedValueOnce(
      new Error('Saved object delete error')
    );
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Task manager error"`
    );
    expect(rulesClientParams.logger.error).toHaveBeenCalledWith(
      'Failed to cleanup rule "1" after scheduling task failed. Error: Saved object delete error'
    );
  });

  test('throws an error if rule type not registered', async () => {
    const data = getMockData();
    ruleTypeRegistry.get.mockImplementation(() => {
      throw new Error('Invalid type');
    });
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Invalid type"`
    );
  });

  test('calls the API key function', async () => {
    const data = getMockData();
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '123', name: '123', api_key: 'abc' },
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        alertTypeId: '123',
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
        running: false,
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            uuid: 'test-uuid',
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
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        actions: [],
        scheduledTaskId: 'task-123',
      },
      references: [
        {
          id: '1',
          name: 'action_0',
          type: 'action',
        },
      ],
    });
    await rulesClient.create({ data });

    expect(rulesClientParams.createAPIKey).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      {
        actions: [
          {
            actionRef: 'action_0',
            group: 'default',
            actionTypeId: 'test',
            params: { foo: true },
            uuid: '129',
          },
        ],
        alertTypeId: '123',
        consumer: 'bar',
        name: 'abc',
        legacyId: null,
        params: { bar: true },
        apiKey: Buffer.from('123:abc').toString('base64'),
        apiKeyCreatedByUser: false,
        apiKeyOwner: 'elastic',
        artifacts: {
          dashboards: [],
          investigation_guide: {
            blob: '',
          },
        },
        createdBy: 'elastic',
        createdAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
        updatedAt: '2019-02-12T21:01:22.479Z',
        enabled: true,
        meta: {
          versionApiKeyLastmodified: kibanaVersion,
        },
        schedule: { interval: '1m' },
        throttle: null,
        notifyWhen: null,
        muteAll: false,
        snoozeSchedule: [],
        mutedInstanceIds: [],
        tags: ['foo'],
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        lastEnabledAt: '2019-02-12T21:01:22.479Z',
        monitoring: getDefaultMonitoring('2019-02-12T21:01:22.479Z'),
        revision: 0,
        running: false,
      },
      {
        id: 'mock-saved-object-id',
        references: [
          {
            id: '1',
            name: 'action_0',
            type: 'action',
          },
        ],
      }
    );
  });

  test(`doesn't create API key for disabled rules`, async () => {
    const data = getMockData({ enabled: false });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        alertTypeId: '123',
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            uuid: 'test-uuid',
            params: {
              foo: true,
            },
          },
        ],
        executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
        running: false,
      },
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        actions: [],
        scheduledTaskId: 'task-123',
      },
      references: [
        {
          id: '1',
          name: 'action_0',
          type: 'action',
        },
      ],
    });
    await rulesClient.create({ data });

    expect(rulesClientParams.createAPIKey).not.toHaveBeenCalled();
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      {
        actions: [
          {
            actionRef: 'action_0',
            group: 'default',
            actionTypeId: 'test',
            params: { foo: true },
            uuid: '130',
          },
        ],
        legacyId: null,
        alertTypeId: '123',
        artifacts: {
          dashboards: [],
          investigation_guide: {
            blob: '',
          },
        },
        consumer: 'bar',
        name: 'abc',
        params: { bar: true },
        apiKey: null,
        apiKeyOwner: null,
        apiKeyCreatedByUser: null,
        createdBy: 'elastic',
        createdAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
        updatedAt: '2019-02-12T21:01:22.479Z',
        enabled: false,
        meta: {
          versionApiKeyLastmodified: kibanaVersion,
        },
        schedule: { interval: '1m' },
        throttle: null,
        notifyWhen: null,
        muteAll: false,
        snoozeSchedule: [],
        mutedInstanceIds: [],
        tags: ['foo'],
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        monitoring: getDefaultMonitoring('2019-02-12T21:01:22.479Z'),
        revision: 0,
        running: false,
      },
      {
        id: 'mock-saved-object-id',
        references: [
          {
            id: '1',
            name: 'action_0',
            type: 'action',
          },
        ],
      }
    );
  });

  test('throws an error if API key creation throws', async () => {
    const data = getMockData();
    rulesClientParams.createAPIKey.mockImplementation(() => {
      throw new Error('no');
    });
    await expect(
      async () => await rulesClient.create({ data })
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Error creating rule: could not create API key - no"`
    );
  });

  test('throws error when ensureActionTypeEnabled throws', async () => {
    const data = getMockData();
    ruleTypeRegistry.ensureRuleTypeEnabled.mockImplementation(() => {
      throw new Error('Fail');
    });
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(`"Fail"`);
  });

  test('throws error when adding action using connector with missing secrets', async () => {
    const data = getMockData();
    // Reset from default behaviour
    actionsClient.getBulk.mockReset();
    actionsClient.getBulk.mockResolvedValueOnce([
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
        isMissingSecrets: true,
        name: 'email connector',
      }),
    ]);
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Failed to validate actions due to the following error: Invalid connectors: email connector"`
    );
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(taskManager.schedule).not.toHaveBeenCalled();
  });

  test('logs warning when creating with an interval less than the minimum configured one when enforce = false', async () => {
    const data = getMockData({ schedule: { interval: '1s' } });
    ruleTypeRegistry.get.mockImplementation(() => ({
      id: '123',
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
      validLegacyConsumers: [],
      producer: 'alerts',
      solution: 'stack',
      useSavedObjectReferences: {
        extractReferences: jest.fn(),
        injectReferences: jest.fn(),
      },
      validate: {
        params: { validate: (params) => params },
      },
    }));
    const createdAttributes = {
      ...data,
      alertTypeId: '123',
      schedule: { interval: '1s' },
      params: {
        bar: true,
      },
      executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
      createdAt: '2019-02-12T21:01:22.479Z',
      createdBy: 'elastic',
      updatedBy: 'elastic',
      updatedAt: '2019-02-12T21:01:22.479Z',
      muteAll: false,
      mutedInstanceIds: [],
      actions: [
        {
          group: 'default',
          actionRef: 'action_0',
          actionTypeId: 'test',
          uuid: 'test-uuid',
          params: {
            foo: true,
          },
        },
      ],
      running: false,
    };
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: createdAttributes,
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    });

    await rulesClient.create({ data });
    expect(rulesClientParams.logger.warn).toHaveBeenCalledWith(
      `Rule schedule interval (1s) for "123" rule type with ID "1" is less than the minimum value (1m). Running rules at this interval may impact alerting performance. Set "xpack.alerting.rules.minimumScheduleInterval.enforce" to true to prevent creation of these rules.`
    );
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalled();
    expect(taskManager.schedule).toHaveBeenCalled();
  });

  test('should create rule with flapping', async () => {
    const flapping = {
      enabled: true,
      lookBackWindow: 10,
      statusChangeThreshold: 10,
    };

    const data = getMockData({
      name: 'my rule name',
      flapping,
    });

    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: false,
        name: ' my rule name ',
        alertTypeId: '123',
        schedule: { interval: 10000 },
        params: {
          bar: true,
        },
        executionStatus: getRuleExecutionStatusPending(now),
        running: false,
        createdAt: now,
        updatedAt: now,
        actions: [],
        flapping,
      },
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    });

    const result = await rulesClient.create({ data });
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      expect.objectContaining({
        flapping,
      }),
      {
        id: 'mock-saved-object-id',
        references: [
          {
            id: '1',
            name: 'action_0',
            type: 'action',
          },
        ],
      }
    );

    expect(result.flapping).toEqual(flapping);
  });

  test('throws error when creating with an interval less than the minimum configured one when enforce = true', async () => {
    rulesClient = new RulesClient({
      ...rulesClientParams,
      minimumScheduleInterval: { value: '1m', enforce: true },
    });
    ruleTypeRegistry.get.mockImplementation(() => ({
      id: '123',
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
      validLegacyConsumers: [],
      producer: 'alerts',
      solution: 'stack',
      useSavedObjectReferences: {
        extractReferences: jest.fn(),
        injectReferences: jest.fn(),
      },
      validate: {
        params: { validate: (params) => params },
      },
    }));

    const data = getMockData({ schedule: { interval: '1s' } });
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Error creating rule: the interval is less than the allowed minimum interval of 1m"`
    );
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(taskManager.schedule).not.toHaveBeenCalled();
  });

  test('throws error when mixing and matching global and per-action frequency values', async () => {
    rulesClient = new RulesClient({
      ...rulesClientParams,
      minimumScheduleInterval: { value: '1m', enforce: true },
    });

    ruleTypeRegistry.get.mockImplementation(() => ({
      id: '123',
      name: 'Test',
      actionGroups: [
        { id: 'default', name: 'Default' },
        { id: 'group2', name: 'Action Group 2' },
      ],
      recoveryActionGroup: RecoveredActionGroup,
      defaultActionGroupId: 'default',
      minimumLicenseRequired: 'basic',
      isExportable: true,
      async executor() {
        return { state: {} };
      },
      category: 'test',
      validLegacyConsumers: [],
      producer: 'alerts',
      solution: 'stack',
      useSavedObjectReferences: {
        extractReferences: jest.fn(),
        injectReferences: jest.fn(),
      },
      validate: {
        params: { validate: (params) => params },
      },
    }));

    const data = getMockData({
      notifyWhen: 'onActionGroupChange',
      actions: [
        {
          group: 'default',
          id: '1',
          params: {
            foo: true,
          },
          frequency: {
            summary: false,
            notifyWhen: 'onActionGroupChange',
            throttle: null,
          },
        },
        {
          group: 'group2',
          id: '2',
          params: {
            foo: true,
          },
          frequency: {
            summary: false,
            notifyWhen: 'onActionGroupChange',
            throttle: null,
          },
        },
      ],
    });
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Failed to validate actions due to the following error: Cannot specify per-action frequency params when notify_when or throttle are defined at the rule level: default, group2"`
    );
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(taskManager.schedule).not.toHaveBeenCalled();

    const data2 = getMockData({
      notifyWhen: null,
      actions: [
        {
          group: 'default',
          id: '1',
          params: {
            foo: true,
          },
          frequency: {
            summary: false,
            notifyWhen: 'onActionGroupChange',
            throttle: null,
          },
        },
        {
          group: 'group2',
          id: '2',
          params: {
            foo: true,
          },
        },
      ],
    });
    await expect(rulesClient.create({ data: data2 })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Failed to validate actions due to the following error: Cannot specify per-action frequency params when notify_when or throttle are defined at the rule level: default"`
    );
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(taskManager.schedule).not.toHaveBeenCalled();
  });

  test('throws error when neither global frequency nor action frequency are defined', async () => {
    rulesClient = new RulesClient({
      ...rulesClientParams,
      minimumScheduleInterval: { value: '1m', enforce: true },
    });
    ruleTypeRegistry.get.mockImplementation(() => ({
      id: '123',
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
      validLegacyConsumers: [],
      producer: 'alerts',
      solution: 'stack',
      useSavedObjectReferences: {
        extractReferences: jest.fn(),
        injectReferences: jest.fn(),
      },
      validate: {
        params: { validate: (params) => params },
      },
    }));

    const data = getMockData({
      notifyWhen: undefined,
      throttle: undefined,
      actions: [
        {
          group: 'default',
          id: '1',
          params: {
            foo: true,
          },
        },
      ],
    });
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Failed to validate actions due to the following error: Actions missing frequency parameters: default"`
    );
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(taskManager.schedule).not.toHaveBeenCalled();
  });

  test('throws error when some actions are missing frequency params', async () => {
    rulesClient = new RulesClient({
      ...rulesClientParams,
      minimumScheduleInterval: { value: '1m', enforce: true },
    });
    ruleTypeRegistry.get.mockImplementation(() => ({
      id: '123',
      name: 'Test',
      actionGroups: [
        { id: 'default', name: 'Default' },
        { id: 'group2', name: 'Action Group 2' },
      ],
      recoveryActionGroup: RecoveredActionGroup,
      defaultActionGroupId: 'default',
      minimumLicenseRequired: 'basic',
      isExportable: true,
      async executor() {
        return { state: {} };
      },
      category: 'test',
      validLegacyConsumers: [],
      producer: 'alerts',
      solution: 'stack',
      useSavedObjectReferences: {
        extractReferences: jest.fn(),
        injectReferences: jest.fn(),
      },
      validate: {
        params: { validate: (params) => params },
      },
    }));

    const data = getMockData({
      notifyWhen: undefined,
      throttle: undefined,
      actions: [
        {
          group: 'default',
          id: '1',
          params: {
            foo: true,
          },
          frequency: {
            summary: false,
            notifyWhen: 'onActionGroupChange',
            throttle: null,
          },
        },
        {
          group: 'group2',
          id: '2',
          params: {
            foo: true,
          },
        },
      ],
    });
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Failed to validate actions due to the following error: Actions missing frequency parameters: group2"`
    );
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(taskManager.schedule).not.toHaveBeenCalled();
  });

  test('throws error when some actions have throttle intervals shorter than the check interval', async () => {
    rulesClient = new RulesClient({
      ...rulesClientParams,
      minimumScheduleInterval: { value: '1m', enforce: true },
    });
    ruleTypeRegistry.get.mockImplementation(() => ({
      id: '123',
      name: 'Test',
      actionGroups: [
        { id: 'default', name: 'Default' },
        { id: 'group2', name: 'Action Group 2' },
        { id: 'group3', name: 'Action Group 3' },
      ],
      recoveryActionGroup: RecoveredActionGroup,
      defaultActionGroupId: 'default',
      minimumLicenseRequired: 'basic',
      isExportable: true,
      async executor() {
        return { state: {} };
      },
      category: 'test',
      validLegacyConsumers: [],
      producer: 'alerts',
      solution: 'stack',
      useSavedObjectReferences: {
        extractReferences: jest.fn(),
        injectReferences: jest.fn(),
      },
      validate: {
        params: { validate: (params) => params },
      },
    }));

    const data = getMockData({
      notifyWhen: undefined,
      throttle: undefined,
      schedule: { interval: '3h' },
      actions: [
        {
          group: 'default',
          id: '1',
          params: {
            foo: true,
          },
          frequency: {
            summary: false,
            notifyWhen: 'onThrottleInterval',
            throttle: '1h',
          },
        },
        {
          group: 'group2',
          id: '2',
          params: {
            foo: true,
          },
          frequency: {
            summary: false,
            notifyWhen: 'onThrottleInterval',
            throttle: '3m',
          },
        },
        {
          group: 'group3',
          id: '3',
          params: {
            foo: true,
          },
          frequency: {
            summary: false,
            notifyWhen: 'onThrottleInterval',
            throttle: '240m',
          },
        },
      ],
    });
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Failed to validate actions due to the following error: Action frequency cannot be shorter than the schedule interval of 3h: default (1h), group2 (3m)"`
    );
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(taskManager.schedule).not.toHaveBeenCalled();
  });

  test('throws multiple errors when actions have multiple problems', async () => {
    rulesClient = new RulesClient({
      ...rulesClientParams,
      minimumScheduleInterval: { value: '1m', enforce: true },
    });
    ruleTypeRegistry.get.mockImplementation(() => ({
      id: '123',
      name: 'Test',
      actionGroups: [
        { id: 'default', name: 'Default' },
        { id: 'group2', name: 'Action Group 2' },
        { id: 'group3', name: 'Action Group 3' },
      ],
      recoveryActionGroup: RecoveredActionGroup,
      defaultActionGroupId: 'default',
      minimumLicenseRequired: 'basic',
      isExportable: true,
      async executor() {
        return { state: {} };
      },
      category: 'test',
      validLegacyConsumers: [],
      producer: 'alerts',
      solution: 'stack',
      useSavedObjectReferences: {
        extractReferences: jest.fn(),
        injectReferences: jest.fn(),
      },
      validate: {
        params: { validate: (params) => params },
      },
    }));

    const data = getMockData({
      notifyWhen: undefined,
      throttle: undefined,
      schedule: { interval: '3h' },
      actions: [
        {
          group: 'default',
          id: '1',
          params: {
            foo: true,
          },
          frequency: {
            summary: false,
            notifyWhen: 'onThrottleInterval',
            throttle: '1h',
          },
        },
        {
          group: 'group2',
          id: '2',
          params: {
            foo: true,
          },
          frequency: {
            summary: false,
            notifyWhen: 'onThrottleInterval',
            throttle: '3m',
          },
        },
        {
          group: 'group3',
          id: '3',
          params: {
            foo: true,
          },
        },
      ],
    });
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(`
      "Failed to validate actions due to the following 2 errors:
      - Actions missing frequency parameters: group3
      - Action frequency cannot be shorter than the schedule interval of 3h: default (1h), group2 (3m)"
    `);
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(taskManager.schedule).not.toHaveBeenCalled();
  });
  test('should create a rule even if action is missing secret when allowMissingConnectorSecrets is true', async () => {
    const data = getMockData({
      actions: [
        {
          group: 'default',
          id: '1',
          params: {
            foo: true,
          },
        },
        {
          group: 'default',
          id: '1',
          params: {
            foo: true,
          },
        },
        {
          group: 'default',
          id: '2',
          params: {
            foo: true,
          },
        },
      ],
    });
    actionsClient.getBulk.mockReset();
    actionsClient.getBulk.mockResolvedValue([
      createMockConnector({
        id: '1',
        actionTypeId: '.slack',
        config: {},
        isMissingSecrets: true,
        name: 'Slack connector',
      }),
    ]);
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        alertTypeId: '123',
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        executionStatus: getRuleExecutionStatusPending(now),
        createdAt: now,
        updatedAt: now,
        notifyWhen: null,
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: '.slack',
            uuid: 'test-uuid',
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
        {
          name: 'action_1',
          type: 'action',
          id: '1',
        },
        {
          name: 'action_2',
          type: 'action',
          id: '2',
        },
      ],
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        actions: [],
        scheduledTaskId: 'task-123',
      },
      references: [],
    });
    const result = await rulesClient.create({ data, allowMissingConnectorSecrets: true });
    expect(result).toMatchInlineSnapshot(`
      Object {
        "actions": Array [
          Object {
            "actionTypeId": ".slack",
            "group": "default",
            "id": "1",
            "params": Object {
              "foo": true,
            },
            "uuid": "test-uuid",
          },
        ],
        "alertTypeId": "123",
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "createdAt": 2019-02-12T21:01:22.479Z,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.000Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "notifyWhen": null,
        "params": Object {
          "bar": true,
        },
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "updatedAt": 2019-02-12T21:01:22.479Z,
      }
    `);
  });

  test('throws error when some actions have alertsFilter but neither timeframe nor query', async () => {
    rulesClient = new RulesClient({
      ...rulesClientParams,
      minimumScheduleInterval: { value: '1m', enforce: true },
    });
    ruleTypeRegistry.get.mockImplementation(() => ({
      id: '123',
      name: 'Test',
      actionGroups: [
        { id: 'default', name: 'Default' },
        { id: 'group2', name: 'Action Group 2' },
        { id: 'group3', name: 'Action Group 3' },
      ],
      recoveryActionGroup: RecoveredActionGroup,
      defaultActionGroupId: 'default',
      minimumLicenseRequired: 'basic',
      isExportable: true,
      async executor() {
        return { state: {} };
      },
      category: 'test',
      validLegacyConsumers: [],
      producer: 'alerts',
      solution: 'stack',
      useSavedObjectReferences: {
        extractReferences: jest.fn(),
        injectReferences: jest.fn(),
      },
      validate: {
        params: { validate: (params) => params },
      },
      alerts: {
        context: 'test',
        mappings: { fieldMap: { field: { type: 'keyword', required: false } } },
        shouldWrite: true,
      },
    }));

    const data = getMockData({
      notifyWhen: undefined,
      throttle: undefined,
      actions: [
        {
          group: 'default',
          id: '1',
          params: {
            foo: true,
          },
          frequency: {
            summary: false,
            notifyWhen: 'onThrottleInterval',
            throttle: '10h',
          },
          alertsFilter: {},
        },
      ],
    });
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Failed to validate actions due to the following error: Action's alertsFilter  must have either \\"query\\" or \\"timeframe\\" : 153"`
    );
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(taskManager.schedule).not.toHaveBeenCalled();
  });

  test('throws error when some actions have alertsFilter but the rule type does not support it', async () => {
    rulesClient = new RulesClient({
      ...rulesClientParams,
      minimumScheduleInterval: { value: '1m', enforce: true },
    });
    ruleTypeRegistry.get.mockImplementation(() => ({
      id: '123',
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
      validLegacyConsumers: [],
      producer: 'alerts',
      solution: 'stack',
      useSavedObjectReferences: {
        extractReferences: jest.fn(),
        injectReferences: jest.fn(),
      },
      validate: {
        params: { validate: (params) => params },
      },
    }));

    const data = getMockData({
      notifyWhen: undefined,
      throttle: undefined,
      actions: [
        {
          group: 'default',
          id: '1',
          params: {
            foo: true,
          },
          frequency: {
            summary: true,
            notifyWhen: 'onActiveAlert',
            throttle: null,
          },
          alertsFilter: {
            query: { kql: 'test:1', filters: [] },
          },
        },
      ],
    });
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Failed to validate actions due to the following error: This ruleType (Test) can't have an action with Alerts Filter. Actions: [154]"`
    );
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(taskManager.schedule).not.toHaveBeenCalled();
  });

  test('calls the authentication API key function if the user is authenticated using an api key', async () => {
    const data = getMockData();
    rulesClientParams.getAuthenticationAPIKey.mockReturnValueOnce({
      apiKeysEnabled: true,
      result: { id: '123', name: '123', api_key: 'abc' },
    });
    rulesClientParams.isAuthenticationTypeAPIKey.mockReturnValueOnce(true);
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        alertTypeId: '123',
        schedule: { interval: '1m' },
        running: false,
        executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
        params: {
          bar: true,
        },
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            uuid: 'test-uuid',
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
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        actions: [],
        scheduledTaskId: 'task-123',
      },
      references: [
        {
          id: '1',
          name: 'action_0',
          type: 'action',
        },
      ],
    });
    await rulesClient.create({ data });

    expect(rulesClientParams.isAuthenticationTypeAPIKey).toHaveBeenCalledTimes(1);
    expect(rulesClientParams.getAuthenticationAPIKey).toHaveBeenCalledTimes(1);
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      {
        actions: [
          {
            actionRef: 'action_0',
            group: 'default',
            actionTypeId: 'test',
            params: { foo: true },
            uuid: '155',
          },
        ],
        alertTypeId: '123',
        consumer: 'bar',
        name: 'abc',
        legacyId: null,
        params: { bar: true },
        apiKey: Buffer.from('123:abc').toString('base64'),
        apiKeyOwner: 'elastic',
        apiKeyCreatedByUser: true,
        artifacts: {
          dashboards: [],
          investigation_guide: {
            blob: '',
          },
        },
        createdBy: 'elastic',
        createdAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
        updatedAt: '2019-02-12T21:01:22.479Z',
        enabled: true,
        meta: {
          versionApiKeyLastmodified: kibanaVersion,
        },
        schedule: { interval: '1m' },
        throttle: null,
        notifyWhen: null,
        muteAll: false,
        snoozeSchedule: [],
        mutedInstanceIds: [],
        tags: ['foo'],
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        lastEnabledAt: '2019-02-12T21:01:22.479Z',
        monitoring: getDefaultMonitoring('2019-02-12T21:01:22.479Z'),
        revision: 0,
        running: false,
      },
      {
        id: 'mock-saved-object-id',
        references: [
          {
            id: '1',
            name: 'action_0',
            type: 'action',
          },
        ],
      }
    );
  });

  test('throws error and does not add API key to invalidatePendingApiKey SO when create saved object fails if the user is authenticated using an api key', async () => {
    const data = getMockData();
    rulesClientParams.getAuthenticationAPIKey.mockReturnValueOnce({
      apiKeysEnabled: true,
      result: { id: '123', name: '123', api_key: 'abc' },
    });
    rulesClientParams.isAuthenticationTypeAPIKey.mockReturnValueOnce(true);
    unsecuredSavedObjectsClient.create.mockRejectedValueOnce(new Error('Test failure'));
    await expect(rulesClient.create({ data })).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Test failure"`
    );
    expect(taskManager.schedule).not.toHaveBeenCalled();
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidation).toHaveBeenCalledWith(
      { apiKeys: [] },
      expect.any(Object),
      expect.any(Object)
    );
  });

  describe('actions', () => {
    const connectorAdapter: ConnectorAdapter = {
      connectorTypeId: '.test',
      ruleActionParamsSchema: schema.object({ foo: schema.string() }),
      buildActionParams: jest.fn(),
    };

    connectorAdapterRegistry.register(connectorAdapter);

    beforeEach(() => {
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
        createMockConnector({
          id: 'system_action-id',
          actionTypeId: '.test',
          config: {},
          name: 'system action connector',
          isSystemAction: true,
        }),
      ]);

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: 'alert',
        attributes: {
          executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
          alertTypeId: '123',
          schedule: { interval: '1m' },
          params: {
            bar: true,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          notifyWhen: null,
          actions: [
            {
              group: 'default',
              actionRef: 'action_0',
              actionTypeId: 'test',
              uuid: 'test-uuid',
              params: {
                foo: true,
              },
            },
            {
              group: 'default',
              actionRef: 'system_action:system_action-id',
              actionTypeId: 'test',
              uuid: 'test-uuid-1',
              params: { foo: 'test' },
            },
          ],
          running: false,
        },
        references: [
          {
            name: 'action_0',
            type: 'action',
            id: '1',
          },
        ],
      });
    });

    test('create a rule with system actions and default actions', async () => {
      const data = getMockData({
        actions: [
          {
            group: 'default',
            id: '1',
            params: {
              foo: true,
            },
          },
        ],
        systemActions: [
          {
            id: 'system_action-id',
            params: {
              foo: 'test',
            },
          },
        ],
      });

      const result = await rulesClient.create({ data });

      expect(result).toMatchInlineSnapshot(`
        Object {
          "actions": Array [
            Object {
              "actionTypeId": "test",
              "group": "default",
              "id": "1",
              "params": Object {
                "foo": true,
              },
              "uuid": "test-uuid",
            },
          ],
          "alertTypeId": "123",
          "artifacts": Object {
            "dashboards": Array [],
            "investigation_guide": Object {
              "blob": "",
            },
          },
          "createdAt": 2019-02-12T21:01:22.479Z,
          "executionStatus": Object {
            "lastExecutionDate": 2019-02-12T21:01:22.000Z,
            "status": "pending",
          },
          "id": "1",
          "isSnoozedUntil": null,
          "notifyWhen": null,
          "params": Object {
            "bar": true,
          },
          "running": false,
          "schedule": Object {
            "interval": "1m",
          },
          "scheduledTaskId": "task-123",
          "snoozeSchedule": Array [],
          "systemActions": Array [
            Object {
              "actionTypeId": "test",
              "id": "system_action-id",
              "params": Object {
                "foo": "test",
              },
              "uuid": "test-uuid-1",
            },
          ],
          "updatedAt": 2019-02-12T21:01:22.479Z,
        }
      `);

      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
        'alert',
        {
          actions: [
            {
              group: 'default',
              actionRef: 'action_0',
              actionTypeId: 'test',
              params: {
                foo: true,
              },
              uuid: '157',
            },
            {
              actionRef: 'system_action:system_action-id',
              actionTypeId: '.test',
              params: { foo: 'test' },
              uuid: '158',
            },
          ],
          alertTypeId: '123',
          apiKey: null,
          apiKeyOwner: null,
          apiKeyCreatedByUser: null,
          artifacts: {
            dashboards: [],
            investigation_guide: {
              blob: '',
            },
          },
          consumer: 'bar',
          createdAt: '2019-02-12T21:01:22.479Z',
          createdBy: 'elastic',
          enabled: true,
          legacyId: null,
          executionStatus: {
            lastExecutionDate: '2019-02-12T21:01:22.479Z',
            status: 'pending',
          },
          lastEnabledAt: '2019-02-12T21:01:22.479Z',
          monitoring: getDefaultMonitoring('2019-02-12T21:01:22.479Z'),
          meta: { versionApiKeyLastmodified: kibanaVersion },
          muteAll: false,
          snoozeSchedule: [],
          mutedInstanceIds: [],
          name: 'abc',
          notifyWhen: null,
          params: { bar: true },
          revision: 0,
          running: false,
          schedule: { interval: '1m' },
          tags: ['foo'],
          throttle: null,
          updatedAt: '2019-02-12T21:01:22.479Z',
          updatedBy: 'elastic',
        },
        {
          id: 'mock-saved-object-id',
          references: [{ id: '1', name: 'action_0', type: 'action' }],
        }
      );
    });

    test('should construct the refs correctly and persist the actions to ES correctly', async () => {
      const data = getMockData({
        actions: [
          {
            group: 'default',
            id: '1',
            params: {
              foo: true,
            },
          },
        ],
        systemActions: [
          {
            id: 'system_action-id',
            params: {
              foo: 'test',
            },
          },
        ],
      });

      await rulesClient.create({ data });

      const rule = unsecuredSavedObjectsClient.create.mock.calls[0][1] as RuleDomain;

      expect(rule.actions).toEqual([
        {
          group: 'default',
          actionRef: 'action_0',
          actionTypeId: 'test',
          params: {
            foo: true,
          },
          uuid: '159',
        },
        {
          actionRef: 'system_action:system_action-id',
          actionTypeId: '.test',
          params: { foo: 'test' },
          uuid: '160',
        },
      ]);
    });

    test('should transforms the actions from ES correctly', async () => {
      const data = getMockData({
        actions: [
          {
            group: 'default',
            id: '1',
            params: {
              foo: true,
            },
          },
        ],
        systemActions: [
          {
            id: 'system_action-id',
            params: {
              foo: 'test',
            },
          },
        ],
      });

      const result = await rulesClient.create({ data });

      expect(result.actions).toMatchInlineSnapshot(`
        Array [
          Object {
            "actionTypeId": "test",
            "group": "default",
            "id": "1",
            "params": Object {
              "foo": true,
            },
            "uuid": "test-uuid",
          },
        ]
      `);

      expect(result.systemActions).toMatchInlineSnapshot(`
        Array [
          Object {
            "actionTypeId": "test",
            "id": "system_action-id",
            "params": Object {
              "foo": "test",
            },
            "uuid": "test-uuid-1",
          },
        ]
      `);
    });

    test('should throw an error if the system action does not exist', async () => {
      const systemAction: RuleSystemAction = {
        id: 'fake-system-action',
        uuid: '123',
        params: {},
        actionTypeId: '.test',
      };

      const data = getMockData({ actions: [], systemActions: [systemAction] });
      await expect(() => rulesClient.create({ data })).rejects.toMatchInlineSnapshot(
        `[Error: Action fake-system-action is not a system action]`
      );
    });

    test('should throw an error if the system action contains the group', async () => {
      const systemAction = {
        id: 'system_action-id',
        uuid: '123',
        params: {},
        actionTypeId: '.test',
        group: 'default',
      };

      const data = getMockData({ actions: [], systemActions: [systemAction] });
      await expect(() => rulesClient.create({ data })).rejects.toMatchInlineSnapshot(
        `[Error: Error validating create data - [systemActions.0.group]: Additional properties are not allowed ('group' was unexpected)]`
      );
    });

    test('should throw an error if the system action contains the frequency', async () => {
      const systemAction = {
        id: 'system_action-id',
        uuid: '123',
        params: {},
        actionTypeId: '.test',
        frequency: {
          summary: false,
          notifyWhen: 'onActionGroupChange',
          throttle: null,
        },
      };

      const data = getMockData({ actions: [], systemActions: [systemAction] });
      await expect(() => rulesClient.create({ data })).rejects.toMatchInlineSnapshot(
        `[Error: Error validating create data - [systemActions.0.frequency]: Additional properties are not allowed ('frequency' was unexpected)]`
      );
    });

    test('should throw an error if the system action contains the alertsFilter', async () => {
      const systemAction = {
        id: 'system_action-id',
        uuid: '123',
        params: {},
        actionTypeId: '.test',
        alertsFilter: {
          query: { kql: 'test:1', filters: [] },
        },
      };

      const data = getMockData({ systemActions: [systemAction] });
      await expect(() => rulesClient.create({ data })).rejects.toMatchInlineSnapshot(
        `[Error: Error validating create data - [systemActions.0.alertsFilter]: Additional properties are not allowed ('alertsFilter' was unexpected)]`
      );
    });

    test('should throw an error if the default action does not contain the group', async () => {
      const action = {
        id: 'action-id-1',
        params: {},
        actionTypeId: '.test',
      };

      const data = getMockData({ actions: [action] });
      await expect(() => rulesClient.create({ data })).rejects.toMatchInlineSnapshot(
        `[Error: Error validating create data - [actions.0.group]: expected value of type [string] but got [undefined]]`
      );
    });

    test('should throw an error if the same system action is used twice', async () => {
      const systemAction: RuleSystemAction = {
        id: 'system_action-id',
        uuid: '123',
        params: { foo: 'test' },
        actionTypeId: '.test',
      };

      const data = getMockData({ actions: [], systemActions: [systemAction, systemAction] });
      await expect(() => rulesClient.create({ data })).rejects.toMatchInlineSnapshot(
        `[Error: Cannot use action system_action-id more than once for this rule]`
      );
    });

    test('should throw an error if the user does not have privileges to execute the action', async () => {
      actionsAuthorization.ensureAuthorized.mockRejectedValueOnce(
        new Error('Unauthorized to execute actions')
      );

      const data = getMockData({
        actions: [
          {
            group: 'default',
            id: '1',
            params: {
              foo: true,
            },
          },
        ],
        systemActions: [
          {
            id: 'system_action-id',
            params: {
              foo: 'test',
            },
          },
        ],
      });

      await expect(() => rulesClient.create({ data })).rejects.toMatchInlineSnapshot(
        `[Error: Unauthorized to execute actions]`
      );
    });
  });

  describe('artifacts', () => {
    test('should create a rule with linked dashboards', async () => {
      const dashboards = [
        {
          id: '1',
        },
        {
          id: '2',
        },
      ];

      const data = getMockData({
        name: 'my rule name',
        actions: [],
        artifacts: {
          dashboards,
        },
      });

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          enabled: false,
          name: 'my rule name',
          alertTypeId: '123',
          schedule: { interval: 10000 },
          params: {
            bar: true,
          },
          executionStatus: getRuleExecutionStatusPending(now),
          running: false,
          createdAt: now,
          updatedAt: now,
          actions: [],
          artifacts: {
            dashboards: [
              {
                refId: 'dashboard_0',
              },
              {
                refId: 'dashboard_1',
              },
            ],
          },
        },
        references: [
          {
            id: '1',
            name: 'dashboard_0',
            type: 'dashboard',
          },
          {
            id: '2',
            name: 'dashboard_1',
            type: 'dashboard',
          },
        ],
      });

      const result = await rulesClient.create({ data });

      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
        RULE_SAVED_OBJECT_TYPE,
        expect.objectContaining({
          artifacts: {
            dashboards: [
              {
                refId: 'dashboard_0',
              },
              {
                refId: 'dashboard_1',
              },
            ],
            investigation_guide: {
              blob: '',
            },
          },
        }),
        {
          id: 'mock-saved-object-id',
          references: [
            {
              id: '1',
              name: 'dashboard_0',
              type: 'dashboard',
            },
            {
              id: '2',
              name: 'dashboard_1',
              type: 'dashboard',
            },
          ],
        }
      );

      expect(result.artifacts?.dashboards).toEqual(dashboards);
    });

    test('should create a rule with an investigation guide', async () => {
      const expectedBlob = `# Summary
This is an example of *Markdown* content.
This is the type of text _investigation guides_ will contain.`;
      const investigationGuide = {
        investigation_guide: {
          blob: expectedBlob,
        },
      };
      const data = getMockData({
        name: 'investigation guide test rule',
        actions: [],
        artifacts: {
          ...investigationGuide,
        },
      });

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: 'ig123',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          enabled: false,
          name: 'investigation guide test rule',
          alertTypeId: '123',
          schedule: { interval: 10000 },
          params: {
            bar: true,
          },
          executionStatus: getRuleExecutionStatusPending(now),
          running: false,
          createdAt: now,
          updatedAt: now,
          actions: [],
          artifacts: {
            ...investigationGuide,
          },
        },
        references: [],
      });

      const result = await rulesClient.create({ data });

      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
        RULE_SAVED_OBJECT_TYPE,
        expect.objectContaining({
          artifacts: {
            dashboards: [],
            investigation_guide: {
              blob: expectedBlob,
            },
          },
        }),
        {
          id: 'mock-saved-object-id',
          references: [],
        }
      );

      expect(result.artifacts?.investigation_guide).toEqual(investigationGuide.investigation_guide);
    });
  });

  describe('missing UIAM API key tagging', () => {
    test('should add missing UIAM API key tag when UIAM key creation fails in serverless with feature flag enabled', async () => {
      // Set up serverless environment with feature flag enabled
      const featureFlags = coreFeatureFlagsMock.createStart();
      featureFlags.getBooleanValue = jest.fn().mockResolvedValue(true);

      const serverlessRulesClient = new RulesClient({
        ...rulesClientParams,
        isServerless: true,
        // To signal that user does not create the API key
        isAuthenticationTypeAPIKey: () => false,
        featureFlags,
      });

      const data = getMockData();

      // Mock API key creation where UIAM key is missing (null) but ES key is created
      rulesClientParams.createAPIKey.mockResolvedValueOnce({
        apiKeysEnabled: true,
        result: { id: '123', name: '123', api_key: 'abc' },
        // uiamResult is undefined/null - UIAM key creation failed
      });

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          alertTypeId: '123',
          schedule: { interval: '1m' },
          params: {
            bar: true,
          },
          executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
          running: false,
          actions: [],
        },
        references: [],
      });

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          actions: [],
          scheduledTaskId: 'task-123',
        },
        references: [],
      });

      await serverlessRulesClient.create({ data });

      // Verify the missing UIAM key tag was added
      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
        RULE_SAVED_OBJECT_TYPE,
        expect.objectContaining({
          tags: expect.arrayContaining(['foo', 'Missing Universal Api Key']),
        }),
        expect.anything()
      );
    });

    test('should not add missing UIAM API key tag when UIAM key is present', async () => {
      // Set up serverless environment with feature flag enabled
      const featureFlags = coreFeatureFlagsMock.createStart();
      featureFlags.getBooleanValue = jest.fn().mockResolvedValue(true);

      const serverlessRulesClient = new RulesClient({
        ...rulesClientParams,
        isServerless: true,
        featureFlags,
      });

      const data = getMockData();

      // Mock API key creation where UIAM key is successfully created
      rulesClientParams.createAPIKey.mockResolvedValueOnce({
        apiKeysEnabled: true,
        result: { id: '123', name: '123', api_key: 'abc' },
        uiamResult: { id: '456', name: '456', api_key: 'def' },
      });

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          alertTypeId: '123',
          schedule: { interval: '1m' },
          params: {
            bar: true,
          },
          executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
          running: false,
          actions: [],
        },
        references: [],
      });

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          actions: [],
          scheduledTaskId: 'task-123',
        },
        references: [],
      });

      await serverlessRulesClient.create({ data });

      // Verify the missing UIAM key tag was NOT added
      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
        RULE_SAVED_OBJECT_TYPE,
        expect.objectContaining({
          tags: ['foo'], // Only original tags, no UIAM tag
        }),
        expect.anything()
      );
    });

    test('should not add missing UIAM API key tag in non-serverless environment', async () => {
      // Non-serverless environment (default rulesClientParams.isServerless = false)
      const featureFlags = coreFeatureFlagsMock.createStart();
      featureFlags.getBooleanValue = jest.fn().mockResolvedValue(true);

      const nonServerlessRulesClient = new RulesClient({
        ...rulesClientParams,
        featureFlags,
      });

      const data = getMockData();

      rulesClientParams.createAPIKey.mockResolvedValueOnce({
        apiKeysEnabled: true,
        result: { id: '123', name: '123', api_key: 'abc' },
        // uiamResult is undefined/null
      });

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          alertTypeId: '123',
          schedule: { interval: '1m' },
          params: {
            bar: true,
          },
          executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
          running: false,
          actions: [],
        },
        references: [],
      });

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          actions: [],
          scheduledTaskId: 'task-123',
        },
        references: [],
      });

      await nonServerlessRulesClient.create({ data });

      // Verify the missing UIAM key tag was NOT added (non-serverless)
      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
        RULE_SAVED_OBJECT_TYPE,
        expect.objectContaining({
          tags: ['foo'], // Only original tags
        }),
        expect.anything()
      );
    });
  });

  describe('change tracking', () => {
    const createdRuleSO = {
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      updated_at: '2023-03-05T10:30:00.000Z',
      attributes: {
        alertTypeId: '123',
        schedule: { interval: '1m' },
        params: { bar: true },
        createdAt: '2019-02-12T21:01:22.479Z',
        updatedAt: '2019-02-12T21:01:22.479Z',
        actions: [],
        executionStatus: getRuleExecutionStatusPending('2019-02-12T21:01:22.479Z'),
        running: false,
      },
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    };

    const createChangeTrackingService = () => ({
      log: jest.fn().mockResolvedValue(undefined),
      logBulk: jest.fn().mockResolvedValue(undefined),
      getHistory: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    });

    const setRuleType = (overrides: { trackChanges?: boolean } = {}) => {
      ruleTypeRegistry.get.mockReturnValue({
        id: '123',
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

    test('logs the change after the rule is created', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce(createdRuleSO);

      await trackingClient.create({ data: getMockData() });

      expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
      // Single-rule callers fall back to ruleSOs.length for bulkCount.
      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [expect.objectContaining({ objectId: '1', module: 'stack' })],
        {
          action: 'rule_create',
          spaceId: 'default',
        }
      );
    });

    test('captures the full post-creation attributes and references of the rule', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce(createdRuleSO);

      await trackingClient.create({ data: getMockData() });

      expect(changeTrackingService.logBulk).toHaveBeenCalledWith(
        [
          {
            timestamp: '2023-03-05T10:30:00.000Z',
            objectId: '1',
            objectType: RULE_SAVED_OBJECT_TYPE,
            module: 'stack',
            snapshot: expect.objectContaining({
              id: '1',
              alertTypeId: '123',
              params: { bar: true },
              createdAt: '2019-02-12T21:01:22.479Z',
              updatedAt: '2019-02-12T21:01:22.479Z',
            }),
          },
        ],
        expect.any(Object)
      );
    });

    test('stamps the change with updated_at from the saved object', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce(createdRuleSO);

      await trackingClient.create({ data: getMockData() });

      expect(changeTrackingService.logBulk).toHaveBeenCalledTimes(1);
      const [changes] = changeTrackingService.logBulk.mock.calls[0];
      expect(changes).toHaveLength(1);
      expect(changes[0].timestamp).toBe('2023-03-05T10:30:00.000Z');
    });

    test('does not log when the rule type opts out of tracking', async () => {
      const changeTrackingService = createChangeTrackingService();
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType({ trackChanges: false });

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce(createdRuleSO);

      await trackingClient.create({ data: getMockData() });

      expect(changeTrackingService.logBulk).not.toHaveBeenCalled();
    });

    test('does not log when no change tracking service is configured', async () => {
      // Default rulesClient has no changeTrackingService configured.
      setRuleType();

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce(createdRuleSO);

      await rulesClient.create({ data: getMockData() });

      // No service to assert against; verify the call simply did not throw.
      // The negative assertion is exercised at the helper level
      // (see common_utils/log_bulk_rule_changes.test.ts).
      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalled();
    });

    test('rule creation succeeds even if change tracking throws', async () => {
      const changeTrackingService = createChangeTrackingService();
      changeTrackingService.logBulk.mockRejectedValueOnce(new Error('boom'));
      const trackingClient = new RulesClient({ ...rulesClientParams, changeTrackingService });
      setRuleType();

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce(createdRuleSO);

      await expect(trackingClient.create({ data: getMockData() })).resolves.toBeDefined();
      expect(rulesClientParams.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unable to log bulk rule changes for action "rule_create"')
      );
    });
  });
});
