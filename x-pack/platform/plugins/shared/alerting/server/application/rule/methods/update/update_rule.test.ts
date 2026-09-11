/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { schema } from '@kbn/config-schema';
import { RulesClient } from '../../../../rules_client/rules_client';
import { ApiKeyType } from '../../../../task_runner/types';
import type { IntervalSchedule } from '../../../../types';
import { RuleNotifyWhen } from '../../../../types';
import { RecoveredActionGroup } from '../../../../../common';
import type { ActionsClient } from '@kbn/actions-plugin/server';
import { TaskStatus } from '@kbn/task-manager-plugin/server';
import { getBeforeSetup, setGlobalDate } from '../../../../rules_client/tests/lib';
import { bulkMarkApiKeysForInvalidation } from '../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import type { RuleDomain } from '../../types';
import { createMockConnector } from '@kbn/actions-plugin/server/application/connector/mocks';
import { getRulesClientMockParams } from '../../../../test_utils';

jest.mock('@kbn/core-saved-objects-utils-server', () => {
  const actual = jest.requireActual('@kbn/core-saved-objects-utils-server');
  return {
    ...actual,
    SavedObjectsUtils: {
      generateId: () => 'mock-saved-object-id',
    },
  };
});

jest.mock('../../../../invalidate_pending_api_keys/bulk_mark_api_keys_for_invalidation', () => ({
  bulkMarkApiKeysForInvalidation: jest.fn(),
}));

jest.mock('uuid', () => {
  let uuid = 100;
  return { v4: () => `${uuid++}` };
});

jest.mock('../get_schedule_frequency', () => ({
  validateScheduleLimit: jest.fn(),
}));

const bulkMarkApiKeysForInvalidationMock = bulkMarkApiKeysForInvalidation as jest.Mock;

const {
  rulesClientParams,
  taskManager,
  ruleTypeRegistry,
  unsecuredSavedObjectsClient,
  encryptedSavedObjects,
  authorization,
  actionsAuthorization,
  auditLogger,
} = getRulesClientMockParams();

beforeEach(() => {
  getBeforeSetup(rulesClientParams, taskManager, ruleTypeRegistry);
  (auditLogger.log as jest.Mock).mockClear();
});

setGlobalDate();

describe('update()', () => {
  let rulesClient: RulesClient;
  let actionsClient: jest.Mocked<ActionsClient>;

  const existingAlert = {
    id: '1',
    type: RULE_SAVED_OBJECT_TYPE,
    attributes: {
      name: 'fakeRuleName',
      enabled: true,
      tags: ['foo'],
      alertTypeId: 'myType',
      schedule: { interval: '1m' },
      consumer: 'myApp',
      revision: 0,
      scheduledTaskId: 'task-123',
      params: {},
      executionStatus: {
        lastExecutionDate: '2019-02-12T21:01:22.479Z',
        status: 'pending',
      },
      muteAll: false,
      legacyId: null,
      snoozeSchedule: [],
      mutedInstanceIds: [],
      createdBy: 'elastic',
      createdAt: '2019-02-12T21:01:22.479Z',
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
          frequency: {
            summary: false,
            notifyWhen: RuleNotifyWhen.CHANGE,
            throttle: null,
          },
        },
      ],
    },
    references: [
      {
        name: '1',
        type: 'action',
        id: '1',
      },
    ],
    version: '123',
  };
  const existingDecryptedAlert = {
    ...existingAlert,
    attributes: {
      ...existingAlert.attributes,
      apiKey: Buffer.from('123:abc').toString('base64'),
    },
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
    unsecuredSavedObjectsClient.get.mockResolvedValue(existingAlert);
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue(existingDecryptedAlert);
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
        params: { validate: (params) => params },
      },
      validLegacyConsumers: [],
    });
  });

  test('updates given parameters', async () => {
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
        name: 'email connector',
      }),
    ]);
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: true,
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
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
            group: 'default',
            actionRef: 'action_1',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
          },
          {
            group: 'default',
            actionRef: 'action_2',
            actionTypeId: 'test2',
            params: {
              foo: true,
            },
          },
        ],
        notifyWhen: 'onActiveAlert',
        revision: 1,
        scheduledTaskId: 'task-123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        alertDelay: {
          active: 5,
        },
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
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
    const result = await rulesClient.update({
      id: '1',
      data: {
        schedule: { interval: '1m' },
        name: 'abc',
        tags: ['foo'],
        params: {
          bar: true,
          risk_score: 40,
          severity: 'low',
        },
        throttle: null,
        notifyWhen: 'onActiveAlert',
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
        alertDelay: {
          active: 10,
        },
      },
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
            "uuid": undefined,
          },
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
        "alertDelay": Object {
          "active": 5,
        },
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "createdAt": 2019-02-12T21:01:22.479Z,
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.479Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "notifyWhen": "onActiveAlert",
        "params": Object {
          "bar": true,
        },
        "revision": 1,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "updatedAt": 2019-02-12T21:01:22.479Z,
      }
    `);
    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );
    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidationMock).toHaveBeenCalledTimes(1);
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
            "uuid": "100",
          },
          Object {
            "actionRef": "action_1",
            "actionTypeId": "test",
            "group": "default",
            "params": Object {
              "foo": true,
            },
            "uuid": "101",
          },
          Object {
            "actionRef": "action_2",
            "actionTypeId": "test2",
            "group": "default",
            "params": Object {
              "foo": true,
            },
            "uuid": "102",
          },
        ],
        "alertDelay": Object {
          "active": 10,
        },
        "alertTypeId": "myType",
        "apiKey": null,
        "apiKeyCreatedByUser": null,
        "apiKeyOwner": null,
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "consumer": "myApp",
        "createdAt": "2019-02-12T21:01:22.479Z",
        "createdBy": "elastic",
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": "2019-02-12T21:01:22.479Z",
          "status": "pending",
        },
        "legacyId": null,
        "mapped_params": Object {
          "risk_score": 40,
          "severity": "20-low",
        },
        "meta": Object {
          "versionApiKeyLastmodified": "v7.10.0",
        },
        "muteAll": false,
        "mutedInstanceIds": Array [],
        "name": "abc",
        "notifyWhen": "onActiveAlert",
        "params": Object {
          "bar": true,
          "risk_score": 40,
          "severity": "low",
        },
        "revision": 1,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
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
        "id": "1",
        "overwrite": true,
        "references": Array [
          Object {
            "id": "1",
            "name": "action_0",
            "type": "action",
          },
          Object {
            "id": "1",
            "name": "action_1",
            "type": "action",
          },
          Object {
            "id": "2",
            "name": "action_2",
            "type": "action",
          },
        ],
        "version": "123",
      }
    `);
    expect(actionsClient.isActionTypeEnabled).toHaveBeenCalledWith('test', { notifyUsage: true });
    expect(actionsClient.isActionTypeEnabled).toHaveBeenCalledWith('test2', { notifyUsage: true });
  });

  test('should update a rule with some preconfigured actions', async () => {
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
    actionsClient.isPreconfigured.mockImplementation((id: string) => id === 'preconfigured');

    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: true,
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
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
            group: 'default',
            actionRef: 'preconfigured:preconfigured',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
          },
          {
            group: 'custom',
            actionRef: 'preconfigured:preconfigured',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
          },
        ],
        notifyWhen: 'onActiveAlert',
        revision: 1,
        scheduledTaskId: 'task-123',
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
    const result = await rulesClient.update({
      id: '1',
      data: {
        schedule: { interval: '1m' },
        name: 'abc',
        tags: ['foo'],
        params: {
          bar: true,
        },
        throttle: null,
        notifyWhen: 'onActiveAlert',
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
            group: 'custom',
            id: 'preconfigured',
            params: {
              foo: true,
            },
          },
        ],
      },
    });

    expect(unsecuredSavedObjectsClient.create).toHaveBeenNthCalledWith(
      1,
      RULE_SAVED_OBJECT_TYPE,
      {
        muteAll: false,
        legacyId: null,
        snoozeSchedule: [],
        mutedInstanceIds: [],
        createdBy: 'elastic',
        createdAt: '2019-02-12T21:01:22.479Z',
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
            uuid: '103',
          },
          {
            group: 'default',
            actionRef: 'preconfigured:preconfigured',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
            uuid: '104',
          },
          {
            group: 'custom',
            actionRef: 'preconfigured:preconfigured',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
            uuid: '105',
          },
        ],
        alertTypeId: 'myType',
        apiKey: null,
        apiKeyOwner: null,
        artifacts: {
          dashboards: [],
          investigation_guide: { blob: '' },
        },
        apiKeyCreatedByUser: null,
        consumer: 'myApp',
        enabled: true,
        meta: { versionApiKeyLastmodified: 'v7.10.0' },
        name: 'abc',
        notifyWhen: 'onActiveAlert',
        params: { bar: true },
        revision: 1,
        schedule: { interval: '1m' },
        scheduledTaskId: 'task-123',
        tags: ['foo'],
        throttle: null,
        updatedAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
      },
      {
        id: '1',
        overwrite: true,
        references: [{ id: '1', name: 'action_0', type: 'action' }],
        version: '123',
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
            "uuid": undefined,
          },
          Object {
            "actionTypeId": "test",
            "group": "default",
            "id": "preconfigured",
            "params": Object {
              "foo": true,
            },
            "uuid": undefined,
          },
          Object {
            "actionTypeId": "test",
            "group": "custom",
            "id": "preconfigured",
            "params": Object {
              "foo": true,
            },
            "uuid": undefined,
          },
        ],
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "createdAt": 2019-02-12T21:01:22.479Z,
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.479Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "notifyWhen": "onActiveAlert",
        "params": Object {
          "bar": true,
        },
        "revision": 1,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "updatedAt": 2019-02-12T21:01:22.479Z,
      }
    `);
    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );
    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(actionsClient.isPreconfigured).toHaveBeenCalled();
  });

  test('should update a rule with system actions', async () => {
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

    actionsClient.isSystemAction.mockImplementation((id: string) => id === 'system_action-id');

    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: true,
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
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
        ],
        notifyWhen: 'onActiveAlert',
        revision: 1,
        scheduledTaskId: 'task-123',
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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

    const result = await rulesClient.update({
      id: '1',
      data: {
        schedule: { interval: '1m' },
        name: 'abc',
        tags: ['foo'],
        params: {
          bar: true,
        },
        throttle: null,
        notifyWhen: 'onActiveAlert',
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
            params: {},
          },
        ],
      },
    });

    expect(unsecuredSavedObjectsClient.create).toHaveBeenNthCalledWith(
      1,
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
            uuid: '106',
          },
          {
            actionRef: 'system_action:system_action-id',
            actionTypeId: 'test',
            params: {},
            uuid: '107',
          },
        ],
        muteAll: false,
        legacyId: null,
        snoozeSchedule: [],
        mutedInstanceIds: [],
        createdBy: 'elastic',
        createdAt: '2019-02-12T21:01:22.479Z',
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        alertTypeId: 'myType',
        apiKey: null,
        apiKeyOwner: null,
        artifacts: {
          dashboards: [],
          investigation_guide: { blob: '' },
        },
        apiKeyCreatedByUser: null,
        consumer: 'myApp',
        enabled: true,
        meta: { versionApiKeyLastmodified: 'v7.10.0' },
        name: 'abc',
        notifyWhen: 'onActiveAlert',
        params: { bar: true },
        revision: 1,
        schedule: { interval: '1m' },
        scheduledTaskId: 'task-123',
        tags: ['foo'],
        throttle: null,
        updatedAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
      },
      {
        id: '1',
        overwrite: true,
        references: [{ id: '1', name: 'action_0', type: 'action' }],
        version: '123',
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
            "uuid": undefined,
          },
        ],
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "createdAt": 2019-02-12T21:01:22.479Z,
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.479Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "notifyWhen": "onActiveAlert",
        "params": Object {
          "bar": true,
        },
        "revision": 1,
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

    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );

    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(actionsClient.isSystemAction).toHaveBeenCalled();
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
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: true,
        schedule: { interval: '1m' },
        params: {
          bar: true,
          parameterThatIsSavedObjectRef: 'soRef_0',
        },
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
          },
        ],
        notifyWhen: 'onActiveAlert',
        revision: 1,
        scheduledTaskId: 'task-123',
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
    const result = await rulesClient.update({
      id: '1',
      data: {
        schedule: { interval: '1m' },
        name: 'abc',
        tags: ['foo'],
        params: ruleParams,
        throttle: null,
        notifyWhen: 'onActiveAlert',
        actions: [
          {
            group: 'default',
            id: '1',
            params: {
              foo: true,
            },
          },
        ],
      },
    });

    expect(extractReferencesFn).toHaveBeenCalledWith(ruleParams);
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      {
        muteAll: false,
        legacyId: null,
        snoozeSchedule: [],
        mutedInstanceIds: [],
        createdBy: 'elastic',
        createdAt: '2019-02-12T21:01:22.479Z',
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        actions: [
          {
            actionRef: 'action_0',
            actionTypeId: 'test',
            group: 'default',
            params: { foo: true },
            uuid: '108',
          },
        ],
        alertTypeId: 'myType',
        apiKey: null,
        apiKeyOwner: null,
        artifacts: {
          dashboards: [],
          investigation_guide: { blob: '' },
        },
        apiKeyCreatedByUser: null,
        consumer: 'myApp',
        enabled: true,
        meta: { versionApiKeyLastmodified: 'v7.10.0' },
        name: 'abc',
        notifyWhen: 'onActiveAlert',
        params: { bar: true, parameterThatIsSavedObjectRef: 'soRef_0' },
        revision: 1,
        schedule: { interval: '1m' },
        scheduledTaskId: 'task-123',
        tags: ['foo'],
        throttle: null,
        updatedAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
      },
      {
        id: '1',
        overwrite: true,
        references: [
          { id: '1', name: 'action_0', type: 'action' },
          { id: '9', name: 'param:soRef_0', type: 'someSavedObjectType' },
        ],
        version: '123',
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
            "uuid": undefined,
          },
        ],
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "createdAt": 2019-02-12T21:01:22.479Z,
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.479Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "notifyWhen": "onActiveAlert",
        "params": Object {
          "bar": true,
          "parameterThatIsSavedObjectId": "9",
        },
        "revision": 1,
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

  it('calls the createApiKey function', async () => {
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '123', name: '123', api_key: 'abc' },
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: true,
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notifyWhen: 'onThrottleInterval',
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
          },
        ],
        apiKey: Buffer.from('123:abc').toString('base64'),
        revision: 1,
        scheduledTaskId: 'task-123',
      },
      updated_at: new Date().toISOString(),
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    });
    const result = await rulesClient.update({
      id: '1',
      data: {
        schedule: { interval: '1m' },
        name: 'abc',
        tags: ['foo'],
        params: {
          bar: true,
        },
        throttle: '5m',
        notifyWhen: 'onThrottleInterval',
        actions: [
          {
            group: 'default',
            id: '1',
            params: {
              foo: true,
            },
          },
        ],
      },
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
            "uuid": undefined,
          },
        ],
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "createdAt": 2019-02-12T21:01:22.479Z,
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.479Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "notifyWhen": "onThrottleInterval",
        "params": Object {
          "bar": true,
        },
        "revision": 1,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "updatedAt": 2019-02-12T21:01:22.479Z,
      }
    `);
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidationMock).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidationMock).toHaveBeenCalledWith(
      {
        apiKeys: ['MTIzOmFiYw=='],
      },
      expect.any(Object),
      expect.any(Object)
    );
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
            "uuid": "109",
          },
        ],
        "alertTypeId": "myType",
        "apiKey": "MTIzOmFiYw==",
        "apiKeyCreatedByUser": false,
        "apiKeyOwner": "elastic",
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "consumer": "myApp",
        "createdAt": "2019-02-12T21:01:22.479Z",
        "createdBy": "elastic",
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": "2019-02-12T21:01:22.479Z",
          "status": "pending",
        },
        "legacyId": null,
        "meta": Object {
          "versionApiKeyLastmodified": "v7.10.0",
        },
        "muteAll": false,
        "mutedInstanceIds": Array [],
        "name": "abc",
        "notifyWhen": "onThrottleInterval",
        "params": Object {
          "bar": true,
        },
        "revision": 1,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "tags": Array [
          "foo",
        ],
        "throttle": "5m",
        "updatedAt": "2019-02-12T21:01:22.479Z",
        "updatedBy": "elastic",
      }
    `);
    expect(unsecuredSavedObjectsClient.create.mock.calls[0][2]).toMatchInlineSnapshot(`
      Object {
        "id": "1",
        "overwrite": true,
        "references": Array [
          Object {
            "id": "1",
            "name": "action_0",
            "type": "action",
          },
        ],
        "version": "123",
      }
    `);
  });

  it(`doesn't call the createAPIKey function when alert is disabled`, async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
      ...existingDecryptedAlert,
      attributes: {
        ...existingDecryptedAlert.attributes,
        enabled: false,
      },
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: false,
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        notifyWhen: 'onThrottleInterval',
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
          },
        ],
        revision: 1,
        scheduledTaskId: 'task-123',
        apiKey: null,
      },
      updated_at: new Date().toISOString(),
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    });
    const result = await rulesClient.update({
      id: '1',
      data: {
        schedule: { interval: '1m' },
        name: 'abc',
        tags: ['foo'],
        params: {
          bar: true,
        },
        throttle: '5m',
        notifyWhen: 'onThrottleInterval',
        actions: [
          {
            group: 'default',
            id: '1',
            params: {
              foo: true,
            },
          },
        ],
      },
    });
    expect(rulesClientParams.createAPIKey).not.toHaveBeenCalled();
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
        ],
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "createdAt": 2019-02-12T21:01:22.479Z,
        "enabled": false,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.479Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "notifyWhen": "onThrottleInterval",
        "params": Object {
          "bar": true,
        },
        "revision": 1,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "updatedAt": 2019-02-12T21:01:22.479Z,
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
            "uuid": "110",
          },
        ],
        "alertTypeId": "myType",
        "apiKey": null,
        "apiKeyCreatedByUser": null,
        "apiKeyOwner": null,
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "consumer": "myApp",
        "createdAt": "2019-02-12T21:01:22.479Z",
        "createdBy": "elastic",
        "enabled": false,
        "executionStatus": Object {
          "lastExecutionDate": "2019-02-12T21:01:22.479Z",
          "status": "pending",
        },
        "legacyId": null,
        "meta": Object {
          "versionApiKeyLastmodified": "v7.10.0",
        },
        "muteAll": false,
        "mutedInstanceIds": Array [],
        "name": "abc",
        "notifyWhen": "onThrottleInterval",
        "params": Object {
          "bar": true,
        },
        "revision": 1,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "tags": Array [
          "foo",
        ],
        "throttle": "5m",
        "updatedAt": "2019-02-12T21:01:22.479Z",
        "updatedBy": "elastic",
      }
    `);
    expect(unsecuredSavedObjectsClient.create.mock.calls[0][2]).toMatchInlineSnapshot(`
      Object {
        "id": "1",
        "overwrite": true,
        "references": Array [
          Object {
            "id": "1",
            "name": "action_0",
            "type": "action",
          },
        ],
        "version": "123",
      }
    `);
  });

  it('throws an error if API key creation throws', async () => {
    rulesClientParams.createAPIKey.mockImplementation(() => {
      throw new Error('no');
    });
    await expect(
      async () =>
        await rulesClient.update({
          id: '1',
          data: {
            schedule: { interval: '1m' },
            name: 'abc',
            tags: ['foo'],
            params: {
              bar: true,
            },
            throttle: null,
            notifyWhen: 'onActiveAlert',
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
          },
        })
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Error updating rule: could not create API key - no"`
    );
  });

  it('should validate params', async () => {
    ruleTypeRegistry.get.mockReturnValueOnce({
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
      category: 'test',
      producer: 'alerts',
      solution: 'stack',
      validLegacyConsumers: [],
    });
    await expect(
      rulesClient.update({
        id: '1',
        data: {
          schedule: { interval: '1m' },
          name: 'abc',
          tags: ['foo'],
          params: {
            bar: true,
          },
          throttle: null,
          notifyWhen: null,
          actions: [
            {
              group: 'default',
              id: '1',
              params: {
                foo: true,
              },
            },
          ],
        },
      })
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"params invalid: [param1]: expected value of type [string] but got [undefined]"`
    );
  });

  it('should trim alert name in the API key name', async () => {
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: false,
        name: ' my alert name ',
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        createdAt: new Date().toISOString(),
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
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
        scheduledTaskId: 'task-123',
        apiKey: null,
      },
      updated_at: new Date().toISOString(),
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    });

    await rulesClient.update({
      id: '1',
      data: {
        tags: existingAlert.attributes.tags,
        params: existingAlert.attributes.params,
        schedule: existingAlert.attributes.schedule,
        actions: [],
        name: ' my alert name ',
      },
    });

    expect(rulesClientParams.createAPIKey).toHaveBeenCalledWith(
      'Alerting: myType/my alert name',
      undefined
    );
  });

  it('should update rule flapping', async () => {
    const flapping = {
      enabled: true,
      lookBackWindow: 10,
      statusChangeThreshold: 10,
    };

    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: true,
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        actions: [],
        notifyWhen: 'onActiveAlert',
        revision: 1,
        scheduledTaskId: 'task-123',
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        flapping,
      },
      references: [],
    });

    const result = await rulesClient.update({
      id: '1',
      data: {
        schedule: { interval: '1m' },
        name: 'abc',
        tags: ['foo'],
        params: {
          bar: true,
        },
        throttle: null,
        notifyWhen: 'onActiveAlert',
        actions: [],
        systemActions: [],
        flapping,
      },
    });

    expect(unsecuredSavedObjectsClient.create).toHaveBeenNthCalledWith(
      1,
      RULE_SAVED_OBJECT_TYPE,
      expect.objectContaining({
        flapping,
      }),
      {
        id: '1',
        overwrite: true,
        references: [],
        version: '123',
      }
    );

    expect(result.flapping).toEqual(flapping);
  });

  it('swallows error when invalidate API key throws', async () => {
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: true,
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
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
        scheduledTaskId: 'task-123',
      },
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    });
    bulkMarkApiKeysForInvalidationMock.mockImplementationOnce(() => new Error('Fail'));
    await rulesClient.update({
      id: '1',
      data: {
        schedule: { interval: '1m' },
        name: 'abc',
        tags: ['foo'],
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

            frequency: {
              summary: false,
              notifyWhen: 'onActionGroupChange',
              throttle: null,
            },
          },
        ],
      },
    });
    expect(bulkMarkApiKeysForInvalidationMock).toHaveBeenCalledWith(
      {
        apiKeys: ['MTIzOmFiYw=='],
      },
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('swallows error when getDecryptedAsInternalUser throws', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockRejectedValue(new Error('Fail'));
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
        name: 'email connector',
      }),
    ]);
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: true,
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
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
            group: 'default',
            actionRef: 'action_1',
            actionTypeId: 'test',
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
            group: 'default',
            actionRef: 'action_2',
            actionTypeId: 'test2',
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
        scheduledTaskId: 'task-123',
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        createdAt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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
    await rulesClient.update({
      id: '1',
      data: {
        schedule: { interval: '1m' },
        name: 'abc',
        tags: ['foo'],
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

            frequency: {
              summary: false,
              notifyWhen: 'onThrottleInterval',
              throttle: '5m',
            },
          },
          {
            group: 'default',
            id: '1',
            params: {
              foo: true,
            },

            frequency: {
              summary: false,
              notifyWhen: 'onThrottleInterval',
              throttle: '5m',
            },
          },
          {
            group: 'default',
            id: '2',
            params: {
              foo: true,
            },

            frequency: {
              summary: false,
              notifyWhen: 'onThrottleInterval',
              throttle: '5m',
            },
          },
        ],
      },
    });
    expect(unsecuredSavedObjectsClient.get).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      undefined
    );
    expect(rulesClientParams.logger.error).toHaveBeenCalledWith(
      'update(): Failed to load API key to invalidate on alert 1: Fail'
    );
  });

  test('throws when unsecuredSavedObjectsClient update fails and invalidates newly created API key', async () => {
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '234', name: '234', api_key: 'abc' },
      uiamResult: { id: 'uiam-234', name: 'uiam-234', api_key: 'def' },
    });
    unsecuredSavedObjectsClient.create.mockRejectedValue(new Error('Fail'));
    await expect(
      rulesClient.update({
        id: '1',
        data: {
          schedule: { interval: '1m' },
          name: 'abc',
          tags: ['foo'],
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

              frequency: {
                summary: false,
                notifyWhen: 'onActionGroupChange',
                throttle: null,
              },
            },
          ],
        },
      })
    ).rejects.toThrowErrorMatchingInlineSnapshot(`"Fail"`);
    expect(bulkMarkApiKeysForInvalidationMock).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidationMock).toHaveBeenCalledWith(
      {
        apiKeys: ['MjM0OmFiYw==', 'dWlhbS0yMzQ6ZGVm'],
      },
      expect.any(Object),
      expect.any(Object)
    );
  });

  describe('updating an alert schedule', () => {
    function mockApiCalls(
      alertId: string,
      taskId: string,
      currentSchedule: IntervalSchedule,
      updatedSchedule: IntervalSchedule
    ) {
      // mock return values from deps
      ruleTypeRegistry.get.mockReturnValueOnce({
        id: '123',
        name: 'Test',
        actionGroups: [
          { id: 'default', name: 'Default' },
          { id: 'group2', name: 'Action Group 2' },
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
          params: { validate: (params) => params },
        },
        validLegacyConsumers: [],
      });
      encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValueOnce({
        id: alertId,
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          actions: [],
          enabled: true,
          alertTypeId: '123',
          executionStatus: {
            lastExecutionDate: '2019-02-12T21:01:22.479Z',
            status: 'pending',
          },
          schedule: currentSchedule,
          scheduledTaskId: 'task-123',
        },
        references: [],
        version: '123',
      });

      taskManager.schedule.mockResolvedValueOnce({
        id: taskId,
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
        id: alertId,
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          enabled: true,
          schedule: updatedSchedule,
          actions: [
            {
              group: 'default',
              actionRef: 'action_0',
              actionTypeId: 'test',
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
          executionStatus: {
            lastExecutionDate: '2019-02-12T21:01:22.479Z',
            status: 'pending',
          },
          scheduledTaskId: taskId,
        },
        references: [
          {
            name: 'action_0',
            type: 'action',
            id: alertId,
          },
        ],
      });

      taskManager.runSoon.mockReturnValueOnce(Promise.resolve({ id: alertId, forced: false }));
    }

    test('updating the alert schedule should call taskManager.bulkUpdateSchedules', async () => {
      const alertId = uuidv4();
      const taskId = uuidv4();

      mockApiCalls(alertId, taskId, { interval: '60m' }, { interval: '1m' });

      await rulesClient.update({
        id: alertId,
        data: {
          schedule: { interval: '1m' },
          name: 'abc',
          tags: ['foo'],
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

              frequency: {
                summary: false,
                notifyWhen: 'onActionGroupChange',
                throttle: null,
              },
            },
          ],
        },
      });

      expect(taskManager.bulkUpdateSchedules).toHaveBeenCalledWith([taskId], { interval: '1m' });
    });

    test('updating the alert without changing the schedule should not call taskManager.bulkUpdateSchedules', async () => {
      const alertId = uuidv4();
      const taskId = uuidv4();

      mockApiCalls(alertId, taskId, { interval: '1m' }, { interval: '1m' });

      await rulesClient.update({
        id: alertId,
        data: {
          schedule: { interval: '1m' },
          name: 'abc',
          tags: ['foo'],
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

              frequency: {
                summary: false,
                notifyWhen: 'onActionGroupChange',
                throttle: null,
              },
            },
          ],
        },
      });

      expect(taskManager.bulkUpdateSchedules).not.toHaveBeenCalled();
    });

    test('throws error when mixing and matching global and per-action frequency values', async () => {
      const alertId = uuidv4();
      const taskId = uuidv4();

      mockApiCalls(alertId, taskId, { interval: '1m' }, { interval: '1m' });
      await expect(
        rulesClient.update({
          id: alertId,
          data: {
            schedule: { interval: '1m' },
            name: 'abc',
            tags: ['foo'],
            params: {
              bar: true,
            },
            throttle: null,
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
          },
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failed to validate actions due to the following error: Cannot specify per-action frequency params when notify_when or throttle are defined at the rule level: default, group2"`
      );
      expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
      expect(taskManager.schedule).not.toHaveBeenCalled();

      await expect(
        rulesClient.update({
          id: alertId,
          data: {
            schedule: { interval: '1m' },
            name: 'abc',
            tags: ['foo'],
            params: {
              bar: true,
            },
            throttle: null,
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
                group: 'default',
                id: '2',
                params: {
                  foo: true,
                },
              },
            ],
          },
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failed to validate actions due to the following error: Cannot specify per-action frequency params when notify_when or throttle are defined at the rule level: default"`
      );
      expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
      expect(taskManager.schedule).not.toHaveBeenCalled();
    });

    test('throws error when neither global frequency nor action frequency are defined', async () => {
      const alertId = uuidv4();
      const taskId = uuidv4();

      mockApiCalls(alertId, taskId, { interval: '1m' }, { interval: '1m' });

      await expect(
        rulesClient.update({
          id: alertId,
          data: {
            schedule: { interval: '1m' },
            name: 'abc',
            tags: ['foo'],
            params: {
              bar: true,
            },
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
          },
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failed to validate actions due to the following error: Actions missing frequency parameters: default"`
      );
      expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
      expect(taskManager.schedule).not.toHaveBeenCalled();
    });

    test('throws error when when some actions are missing frequency params', async () => {
      const alertId = uuidv4();
      const taskId = uuidv4();

      mockApiCalls(alertId, taskId, { interval: '1m' }, { interval: '1m' });

      await expect(
        rulesClient.update({
          id: alertId,
          data: {
            schedule: { interval: '1m' },
            name: 'abc',
            tags: ['foo'],
            params: {
              bar: true,
            },
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
                group: 'default',
                id: '2',
                params: {
                  foo: true,
                },
              },
            ],
          },
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Failed to validate actions due to the following error: Actions missing frequency parameters: default"`
      );
      expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
      expect(taskManager.schedule).not.toHaveBeenCalled();
    });

    test('logs when update of schedule of an alerts underlying task fails', async () => {
      const alertId = uuidv4();
      const taskId = uuidv4();

      mockApiCalls(alertId, taskId, { interval: '1m' }, { interval: '30s' });

      taskManager.bulkUpdateSchedules.mockReset();
      taskManager.bulkUpdateSchedules.mockRejectedValue(new Error('Failed to run alert'));

      await rulesClient.update({
        id: alertId,
        data: {
          schedule: { interval: '1m' },
          name: 'abc',
          tags: ['foo'],
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

              frequency: {
                summary: false,
                notifyWhen: 'onActionGroupChange',
                throttle: null,
              },
            },
          ],
        },
      });

      expect(taskManager.bulkUpdateSchedules).toHaveBeenCalled();

      expect(rulesClientParams.logger.error).toHaveBeenCalledWith(
        `Rule update failed to run its underlying task. TaskManager bulkUpdateSchedules failed with Error: Failed to run alert`
      );
    });
  });

  test('throws error when updating action using connector with missing secrets', async () => {
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
        name: 'email connector',
      }),
      createMockConnector({
        id: '2',
        actionTypeId: 'tes2',
        config: {
          from: 'me@me.com',
          hasAuth: false,
          host: 'hello',
          port: 22,
          secure: null,
          service: null,
        },
        isMissingSecrets: true,
        name: 'another connector',
      }),
    ]);

    await expect(
      rulesClient.update({
        id: '1',
        data: {
          schedule: { interval: '1m' },
          name: 'abc',
          tags: ['foo'],
          params: {
            bar: true,
          },
          throttle: null,
          notifyWhen: 'onActiveAlert',
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
        },
      })
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Failed to validate actions due to the following error: Invalid connectors: another connector"`
    );
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(taskManager.schedule).not.toHaveBeenCalled();
  });
  test('should update a rule even if action is missing secret when allowMissingConnectorSecrets is true', async () => {
    // Reset from default behaviour
    actionsClient.getBulk.mockReset();
    actionsClient.getBulk.mockResolvedValue([
      createMockConnector({
        id: '1',
        actionTypeId: '.slack',
        name: 'slack connector',
      }),
    ]);
    actionsClient.isPreconfigured.mockImplementation((id: string) => id === 'preconfigured');

    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: true,
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: '.slack',
            params: {
              foo: true,
            },
          },
        ],
        notifyWhen: 'onActiveAlert',
        revision: 1,
        scheduledTaskId: 'task-123',
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
    const result = await rulesClient.update({
      id: '1',
      data: {
        schedule: { interval: '1m' },
        name: 'abc',
        tags: ['foo'],
        params: {
          bar: true,
        },
        throttle: null,
        notifyWhen: 'onActiveAlert',
        actions: [
          {
            group: 'default',
            id: '1',
            params: {
              foo: true,
            },
          },
        ],
      },
      allowMissingConnectorSecrets: true,
    });

    expect(unsecuredSavedObjectsClient.create).toHaveBeenNthCalledWith(
      1,
      RULE_SAVED_OBJECT_TYPE,
      {
        muteAll: false,
        legacyId: null,
        snoozeSchedule: [],
        mutedInstanceIds: [],
        createdBy: 'elastic',
        createdAt: '2019-02-12T21:01:22.479Z',
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: '.slack',
            params: {
              foo: true,
            },
            uuid: '145',
          },
        ],
        alertTypeId: 'myType',
        apiKey: null,
        apiKeyOwner: null,
        artifacts: {
          dashboards: [],
          investigation_guide: { blob: '' },
        },
        apiKeyCreatedByUser: null,
        consumer: 'myApp',
        enabled: true,
        meta: { versionApiKeyLastmodified: 'v7.10.0' },
        name: 'abc',
        notifyWhen: 'onActiveAlert',
        params: { bar: true },
        revision: 1,
        schedule: { interval: '1m' },
        scheduledTaskId: 'task-123',
        tags: ['foo'],
        throttle: null,
        updatedAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
      },
      {
        id: '1',
        overwrite: true,
        references: [{ id: '1', name: 'action_0', type: 'action' }],
        version: '123',
      }
    );

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
            "uuid": undefined,
          },
        ],
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "createdAt": 2019-02-12T21:01:22.479Z,
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.479Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "notifyWhen": "onActiveAlert",
        "params": Object {
          "bar": true,
        },
        "revision": 1,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "updatedAt": 2019-02-12T21:01:22.479Z,
      }
    `);
    expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        namespace: 'default',
      }
    );
    expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    expect(actionsClient.isPreconfigured).toHaveBeenCalled();
  });

  test('logs warning when creating with an interval less than the minimum configured one when enforce = false', async () => {
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
        name: 'email connector',
      }),
    ]);
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: true,
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
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
            group: 'default',
            actionRef: 'action_1',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
          },
          {
            group: 'default',
            actionRef: 'action_2',
            actionTypeId: 'test2',
            params: {
              foo: true,
            },
          },
        ],
        notifyWhen: 'onActiveAlert',
        scheduledTaskId: 'task-123',
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
    await rulesClient.update({
      id: '1',
      data: {
        schedule: { interval: '1s' },
        name: 'abc',
        tags: ['foo'],
        params: {
          bar: true,
        },
        throttle: null,
        notifyWhen: 'onActiveAlert',
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
      },
    });
    expect(rulesClientParams.logger.warn).toHaveBeenCalledWith(
      `Rule schedule interval (1s) for "myType" rule type with ID "1" is less than the minimum value (1m). Running rules at this interval may impact alerting performance. Set "xpack.alerting.rules.minimumScheduleInterval.enforce" to true to prevent such changes.`
    );
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalled();
  });

  test('throws error when updating with an interval less than the minimum configured one when enforce = true', async () => {
    rulesClient = new RulesClient({
      ...rulesClientParams,
      minimumScheduleInterval: { value: '1m', enforce: true },
    });
    await expect(
      rulesClient.update({
        id: '1',
        data: {
          schedule: { interval: '1s' },
          name: 'abc',
          tags: ['foo'],
          params: {
            bar: true,
          },
          throttle: null,
          notifyWhen: 'onActiveAlert',
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
        },
      })
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Error updating rule: the interval is less than the allowed minimum interval of 1m"`
    );
    expect(unsecuredSavedObjectsClient.create).not.toHaveBeenCalled();
    expect(taskManager.schedule).not.toHaveBeenCalled();
  });

  describe('authorization', () => {
    beforeEach(() => {
      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          alertTypeId: 'myType',
          consumer: 'myApp',
          enabled: true,
          schedule: { interval: '1m' },
          params: {
            bar: true,
          },
          actions: [],
          scheduledTaskId: 'task-123',
          executionStatus: {
            lastExecutionDate: '2019-02-12T21:01:22.479Z',
            status: 'pending',
          },
          createdAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
        references: [],
      });
    });

    test('ensures user is authorised to update this type of alert under the consumer', async () => {
      await rulesClient.update({
        id: '1',
        data: {
          schedule: { interval: '1m' },
          name: 'abc',
          tags: ['foo'],
          params: {
            bar: true,
          },
          throttle: null,
          notifyWhen: null,
          actions: [],
        },
      });

      expect(authorization.ensureAuthorized).toHaveBeenCalledWith({
        entity: 'rule',
        consumer: 'myApp',
        operation: 'update',
        ruleTypeId: 'myType',
      });
    });

    test('throws when user is not authorised to update this type of alert', async () => {
      authorization.ensureAuthorized.mockRejectedValue(
        new Error(`Unauthorized to update a "myType" alert for "myApp"`)
      );

      await expect(
        rulesClient.update({
          id: '1',
          data: {
            schedule: { interval: '1m' },
            name: 'abc',
            tags: ['foo'],
            params: {
              bar: true,
            },
            throttle: null,
            notifyWhen: null,
            actions: [],
          },
        })
      ).rejects.toMatchInlineSnapshot(
        `[Error: Unauthorized to update a "myType" alert for "myApp"]`
      );

      expect(authorization.ensureAuthorized).toHaveBeenCalledWith({
        entity: 'rule',
        consumer: 'myApp',
        operation: 'update',
        ruleTypeId: 'myType',
      });
    });
  });

  describe('auditLogger', () => {
    beforeEach(() => {
      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          name: 'fakeRuleName',
          enabled: true,
          schedule: { interval: '1m' },
          params: {
            bar: true,
          },
          actions: [],
          scheduledTaskId: 'task-123',
          executionStatus: {
            lastExecutionDate: '2019-02-12T21:01:22.479Z',
            status: 'pending',
          },
          createdAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
        references: [],
      });
    });

    test('logs audit event when updating a rule', async () => {
      await rulesClient.update({
        id: '1',
        data: {
          schedule: { interval: '1m' },
          name: 'abc',
          tags: ['foo'],
          params: {
            bar: true,
          },
          throttle: null,
          actions: [],
          notifyWhen: null,
        },
      });

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_update',
            outcome: 'unknown',
          }),
          kibana: {
            saved_object: { id: '1', type: RULE_SAVED_OBJECT_TYPE, name: 'fakeRuleName' },
          },
        })
      );
    });

    test('logs audit event when not authorised to update a rule', async () => {
      authorization.ensureAuthorized.mockRejectedValue(new Error('Unauthorized'));

      await expect(
        rulesClient.update({
          id: '1',
          data: {
            schedule: { interval: '1m' },
            name: 'abc',
            tags: ['foo'],
            params: {
              bar: true,
            },
            throttle: null,
            actions: [],
            notifyWhen: null,
          },
        })
      ).rejects.toThrow();
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            outcome: 'failure',
            action: 'rule_update',
          }),
          kibana: {
            saved_object: {
              id: '1',
              type: RULE_SAVED_OBJECT_TYPE,
              name: 'fakeRuleName',
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

  test('updates an action with uuid and adds uuid to an action without it', async () => {
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
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: true,
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
            frequency: {
              notifyWhen: 'onActiveAlert',
              throttle: null,
              summary: false,
            },
            uuid: '123-456',
          },
          {
            group: 'default',
            actionRef: 'action_1',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
            frequency: {
              notifyWhen: 'onActiveAlert',
              throttle: null,
              summary: false,
            },
            uuid: '111-111',
          },
        ],
        scheduledTaskId: 'task-123',
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
    await rulesClient.update({
      id: '1',
      data: {
        schedule: { interval: '1m' },
        name: 'abc',
        tags: ['foo'],
        params: {
          bar: true,
          risk_score: 40,
          severity: 'low',
        },
        actions: [
          {
            group: 'default',
            id: '1',
            params: {
              foo: true,
            },

            frequency: {
              notifyWhen: 'onActiveAlert',
              throttle: null,
              summary: false,
            },
            uuid: '123-456',
          },
          {
            group: 'default',
            id: '2',
            params: {
              foo: true,
            },

            frequency: {
              notifyWhen: 'onActiveAlert',
              throttle: null,
              summary: false,
            },
          },
        ],
      },
    });
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      {
        muteAll: false,
        legacyId: null,
        snoozeSchedule: [],
        mutedInstanceIds: [],
        createdBy: 'elastic',
        createdAt: '2019-02-12T21:01:22.479Z',
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        actions: [
          {
            actionRef: 'action_0',
            actionTypeId: 'test',
            frequency: { notifyWhen: 'onActiveAlert', summary: false, throttle: null },
            group: 'default',
            params: { foo: true },
            uuid: '123-456',
          },
          {
            actionRef: '',
            actionTypeId: '',
            frequency: { notifyWhen: 'onActiveAlert', summary: false, throttle: null },
            group: 'default',
            params: { foo: true },
            uuid: '152',
          },
        ],
        alertTypeId: 'myType',
        apiKey: null,
        apiKeyOwner: null,
        artifacts: {
          dashboards: [],
          investigation_guide: { blob: '' },
        },
        apiKeyCreatedByUser: null,
        consumer: 'myApp',
        enabled: true,
        mapped_params: { risk_score: 40, severity: '20-low' },
        meta: { versionApiKeyLastmodified: 'v7.10.0' },
        name: 'abc',
        notifyWhen: null,
        params: { bar: true, risk_score: 40, severity: 'low' },
        revision: 1,
        schedule: { interval: '1m' },
        scheduledTaskId: 'task-123',
        tags: ['foo'],
        updatedAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
      },
      {
        id: '1',
        overwrite: true,
        references: [{ id: '1', name: 'action_0', type: 'action' }],
        version: '123',
      }
    );
  });

  it('calls the authentication API key function if the user is authenticated using an api key', async () => {
    rulesClientParams.isAuthenticationTypeAPIKey.mockReturnValueOnce(true);
    rulesClientParams.getAuthenticationAPIKey.mockReturnValueOnce({
      apiKeysEnabled: true,
      result: { id: '123', name: '123', api_key: 'abc' },
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: true,
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notifyWhen: 'onThrottleInterval',
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
          },
        ],
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        apiKey: Buffer.from('123:abc').toString('base64'),
        apiKeyCreatedByUser: true,
        revision: 1,
        scheduledTaskId: 'task-123',
      },
      updated_at: new Date().toISOString(),
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    });
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
      ...existingDecryptedAlert,
      attributes: {
        ...existingDecryptedAlert.attributes,
        apiKeyCreatedByUser: true,
      },
    });

    const result = await rulesClient.update({
      id: '1',
      data: {
        schedule: { interval: '1m' },
        name: 'abc',
        tags: ['foo'],
        params: {
          bar: true,
        },
        throttle: '5m',
        notifyWhen: 'onThrottleInterval',
        actions: [
          {
            group: 'default',
            id: '1',
            params: {
              foo: true,
            },
          },
        ],
      },
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
            "uuid": undefined,
          },
        ],
        "apiKeyCreatedByUser": true,
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "createdAt": 2019-02-12T21:01:22.479Z,
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": 2019-02-12T21:01:22.479Z,
          "status": "pending",
        },
        "id": "1",
        "isSnoozedUntil": null,
        "notifyWhen": "onThrottleInterval",
        "params": Object {
          "bar": true,
        },
        "revision": 1,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "systemActions": Array [],
        "updatedAt": 2019-02-12T21:01:22.479Z,
      }
    `);
    expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidationMock).not.toHaveBeenCalled();

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
            "uuid": "153",
          },
        ],
        "alertTypeId": "myType",
        "apiKey": "MTIzOmFiYw==",
        "apiKeyCreatedByUser": true,
        "apiKeyOwner": "elastic",
        "artifacts": Object {
          "dashboards": Array [],
          "investigation_guide": Object {
            "blob": "",
          },
        },
        "consumer": "myApp",
        "createdAt": "2019-02-12T21:01:22.479Z",
        "createdBy": "elastic",
        "enabled": true,
        "executionStatus": Object {
          "lastExecutionDate": "2019-02-12T21:01:22.479Z",
          "status": "pending",
        },
        "legacyId": null,
        "meta": Object {
          "versionApiKeyLastmodified": "v7.10.0",
        },
        "muteAll": false,
        "mutedInstanceIds": Array [],
        "name": "abc",
        "notifyWhen": "onThrottleInterval",
        "params": Object {
          "bar": true,
        },
        "revision": 1,
        "schedule": Object {
          "interval": "1m",
        },
        "scheduledTaskId": "task-123",
        "snoozeSchedule": Array [],
        "tags": Array [
          "foo",
        ],
        "throttle": "5m",
        "updatedAt": "2019-02-12T21:01:22.479Z",
        "updatedBy": "elastic",
      }
    `);
    expect(unsecuredSavedObjectsClient.create.mock.calls[0][2]).toMatchInlineSnapshot(`
      Object {
        "id": "1",
        "overwrite": true,
        "references": Array [
          Object {
            "id": "1",
            "name": "action_0",
            "type": "action",
          },
        ],
        "version": "123",
      }
    `);
  });

  test('throws when unsecuredSavedObjectsClient update fails and does not invalidate newly created API key if the user is authenticated using an api key', async () => {
    rulesClientParams.isAuthenticationTypeAPIKey.mockReturnValueOnce(true);
    rulesClientParams.getAuthenticationAPIKey.mockReturnValueOnce({
      apiKeysEnabled: true,
      result: { id: '123', name: '123', api_key: 'abc' },
    });
    unsecuredSavedObjectsClient.create.mockRejectedValue(new Error('Fail'));
    await expect(
      rulesClient.update({
        id: '1',
        data: {
          schedule: { interval: '1m' },
          name: 'abc',
          tags: ['foo'],
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

              frequency: {
                summary: false,
                notifyWhen: 'onActionGroupChange',
                throttle: null,
              },
            },
          ],
        },
      })
    ).rejects.toThrowErrorMatchingInlineSnapshot(`"Fail"`);
    expect(bulkMarkApiKeysForInvalidationMock).toHaveBeenCalledTimes(1);
    expect(bulkMarkApiKeysForInvalidationMock).toHaveBeenCalledWith(
      {
        apiKeys: [],
      },
      expect.any(Object),
      expect.any(Object)
    );
  });

  describe('actions', () => {
    beforeEach(() => {
      actionsClient.isSystemAction.mockImplementation((id: string) => id === 'system_action-id');
      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          enabled: true,
          schedule: { interval: '1m' },
          params: {
            bar: true,
          },
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
          ],
          executionStatus: {
            lastExecutionDate: '2019-02-12T21:01:22.479Z',
            status: 'pending',
          },
          notifyWhen: 'onActiveAlert',
          revision: 1,
          scheduledTaskId: 'task-123',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
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
    });

    test('update a rule with system actions and default actions', async () => {
      const result = await rulesClient.update({
        id: '1',
        data: {
          schedule: { interval: '1m' },
          name: 'abc',
          tags: ['foo'],
          params: {
            bar: true,
          },
          throttle: null,
          notifyWhen: 'onActiveAlert',
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
              params: {},
            },
          ],
        },
      });

      expect(unsecuredSavedObjectsClient.create).toHaveBeenNthCalledWith(
        1,
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
              uuid: '155',
            },
            {
              actionRef: 'system_action:system_action-id',
              actionTypeId: 'test',
              params: {},
              uuid: '156',
            },
          ],
          executionStatus: {
            lastExecutionDate: '2019-02-12T21:01:22.479Z',
            status: 'pending',
          },
          legacyId: null,
          createdAt: '2019-02-12T21:01:22.479Z',
          createdBy: 'elastic',
          snoozeSchedule: [],
          muteAll: false,
          mutedInstanceIds: [],
          alertTypeId: 'myType',
          apiKey: null,
          apiKeyOwner: null,
          artifacts: {
            dashboards: [],
            investigation_guide: { blob: '' },
          },
          apiKeyCreatedByUser: null,
          consumer: 'myApp',
          enabled: true,
          meta: { versionApiKeyLastmodified: 'v7.10.0' },
          name: 'abc',
          notifyWhen: 'onActiveAlert',
          params: { bar: true },
          revision: 1,
          schedule: { interval: '1m' },
          scheduledTaskId: 'task-123',
          tags: ['foo'],
          throttle: null,
          updatedAt: '2019-02-12T21:01:22.479Z',
          updatedBy: 'elastic',
        },
        {
          id: '1',
          overwrite: true,
          references: [{ id: '1', name: 'action_0', type: 'action' }],
          version: '123',
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
              "uuid": undefined,
            },
          ],
          "artifacts": Object {
            "dashboards": Array [],
            "investigation_guide": Object {
              "blob": "",
            },
          },
          "createdAt": 2019-02-12T21:01:22.479Z,
          "enabled": true,
          "executionStatus": Object {
            "lastExecutionDate": 2019-02-12T21:01:22.479Z,
            "status": "pending",
          },
          "id": "1",
          "isSnoozedUntil": null,
          "notifyWhen": "onActiveAlert",
          "params": Object {
            "bar": true,
          },
          "revision": 1,
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

      expect(encryptedSavedObjects.getDecryptedAsInternalUser).toHaveBeenCalledWith(
        RULE_SAVED_OBJECT_TYPE,
        '1',
        {
          namespace: 'default',
        }
      );

      expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
      expect(actionsClient.isSystemAction).toHaveBeenCalled();
    });

    test('should construct the refs correctly and persist the actions to ES correctly', async () => {
      await rulesClient.update({
        id: '1',
        data: {
          schedule: { interval: '1m' },
          name: 'abc',
          tags: ['foo'],
          params: {
            bar: true,
          },
          throttle: null,
          notifyWhen: 'onActiveAlert',
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
              params: {},
            },
          ],
        },
      });

      const rule = unsecuredSavedObjectsClient.create.mock.calls[0][1] as RuleDomain;

      expect(rule.actions).toEqual([
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
          actionTypeId: 'test',
          params: {},
          uuid: '158',
        },
      ]);
    });

    test('should transforms the actions from ES correctly', async () => {
      const result = await rulesClient.update({
        id: '1',
        data: {
          schedule: { interval: '1m' },
          name: 'abc',
          tags: ['foo'],
          params: {
            bar: true,
          },
          throttle: null,
          notifyWhen: 'onActiveAlert',
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
              params: {},
            },
          ],
        },
      });

      expect(result.actions).toMatchInlineSnapshot(`
        Array [
          Object {
            "actionTypeId": "test",
            "group": "default",
            "id": "1",
            "params": Object {
              "foo": true,
            },
            "uuid": undefined,
          },
        ]
      `);

      expect(result.systemActions).toMatchInlineSnapshot(`
        Array [
          Object {
            "actionTypeId": "test",
            "id": "system_action-id",
            "params": Object {},
            "uuid": undefined,
          },
        ]
      `);
    });

    test('should throw an error if the system action does not exist', async () => {
      await expect(() =>
        rulesClient.update({
          id: '1',
          data: {
            schedule: { interval: '1m' },
            name: 'abc',
            tags: ['foo'],
            params: {
              bar: true,
            },
            throttle: null,
            notifyWhen: 'onActiveAlert',
            actions: [],
            systemActions: [
              {
                id: 'fake-system-action',
                params: {},
              },
            ],
          },
        })
      ).rejects.toMatchInlineSnapshot(`[Error: Action fake-system-action is not a system action]`);
    });

    test('should throw an error if the system action contains the group', async () => {
      await expect(() =>
        rulesClient.update({
          id: '1',
          data: {
            schedule: { interval: '1m' },
            name: 'abc',
            tags: ['foo'],
            params: {
              bar: true,
            },
            throttle: null,
            notifyWhen: 'onActiveAlert',
            actions: [],
            systemActions: [
              {
                id: 'system_action-id',
                params: {},
                // @ts-expect-error: testing validation
                group: 'default',
              },
            ],
          },
        })
      ).rejects.toMatchInlineSnapshot(
        `[Error: Error validating update data - [systemActions.0.group]: Additional properties are not allowed ('group' was unexpected)]`
      );
    });

    test('should throw an error if the system action contains the frequency', async () => {
      await expect(() =>
        rulesClient.update({
          id: '1',
          data: {
            schedule: { interval: '1m' },
            name: 'abc',
            tags: ['foo'],
            params: {
              bar: true,
            },
            throttle: null,
            notifyWhen: 'onActiveAlert',
            actions: [],
            systemActions: [
              {
                id: 'system_action-id',
                params: {},
                // @ts-expect-error: testing validation
                frequency: {
                  summary: false,
                  notifyWhen: 'onActionGroupChange',
                  throttle: null,
                },
              },
            ],
          },
        })
      ).rejects.toMatchInlineSnapshot(
        `[Error: Error validating update data - [systemActions.0.frequency]: Additional properties are not allowed ('frequency' was unexpected)]`
      );
    });

    test('should throw an error if the system action contains the alertsFilter', async () => {
      await expect(() =>
        rulesClient.update({
          id: '1',
          data: {
            schedule: { interval: '1m' },
            name: 'abc',
            tags: ['foo'],
            params: {
              bar: true,
            },
            throttle: null,
            notifyWhen: 'onActiveAlert',
            actions: [],
            systemActions: [
              {
                id: 'system_action-id',
                params: {},
                // @ts-expect-error: testing validation
                alertsFilter: {
                  query: { kql: 'test:1', filters: [] },
                },
              },
            ],
          },
        })
      ).rejects.toMatchInlineSnapshot(
        `[Error: Error validating update data - [systemActions.0.alertsFilter]: Additional properties are not allowed ('alertsFilter' was unexpected)]`
      );
    });

    test('should throw an error if the same system action is used twice', async () => {
      await expect(() =>
        rulesClient.update({
          id: '1',
          data: {
            schedule: { interval: '1m' },
            name: 'abc',
            tags: ['foo'],
            params: {
              bar: true,
            },
            throttle: null,
            notifyWhen: 'onActiveAlert',
            actions: [],
            systemActions: [
              {
                id: 'system_action-id',
                params: {},
              },
              {
                id: 'system_action-id',
                params: {},
              },
            ],
          },
        })
      ).rejects.toMatchInlineSnapshot(
        `[Error: Cannot use action system_action-id more than once for this rule]`
      );
    });

    test('should throw an error if the default action does not contain the group', async () => {
      await expect(() =>
        rulesClient.update({
          id: '1',
          data: {
            schedule: { interval: '1m' },
            name: 'abc',
            tags: ['foo'],
            params: {
              bar: true,
            },
            throttle: null,
            notifyWhen: 'onActiveAlert',
            actions: [
              // @ts-expect-error: testing validation
              {
                id: 'action-id-1',
                params: {},
              },
            ],
          },
        })
      ).rejects.toMatchInlineSnapshot(
        `[Error: Error validating update data - [actions.0.group]: expected value of type [string] but got [undefined]]`
      );
    });

    test('should throw an error if the user does not have privileges to execute the action', async () => {
      actionsAuthorization.ensureAuthorized.mockRejectedValueOnce(
        new Error('Unauthorized to execute actions')
      );

      await expect(() =>
        rulesClient.update({
          id: '1',
          data: {
            schedule: { interval: '1m' },
            name: 'abc',
            tags: ['foo'],
            params: {
              bar: true,
            },
            throttle: null,
            notifyWhen: 'onActiveAlert',
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
                params: {},
              },
            ],
          },
        })
      ).rejects.toMatchInlineSnapshot(`[Error: Unauthorized to execute actions]`);
    });
  });

  describe('artifacts', () => {
    test('remove an existing dashboard', async () => {
      const existingDashboards = [
        {
          refId: 'dashboard_0',
        },
        {
          refId: 'dashboard_1',
        },
      ];

      const existingRule = {
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          name: 'fakeRuleName',
          enabled: true,
          tags: ['foo'],
          alertTypeId: 'myType',
          schedule: { interval: '1m' },
          consumer: 'myApp',
          revision: 0,
          scheduledTaskId: 'task-123',
          params: {},
          executionStatus: {
            lastExecutionDate: '2019-02-12T21:01:22.479Z',
            status: 'pending',
          },
          muteAll: false,
          legacyId: null,
          snoozeSchedule: [],
          mutedInstanceIds: [],
          createdBy: 'elastic',
          createdAt: '2019-02-12T21:01:22.479Z',
          updatedBy: 'elastic',
          updatedAt: '2019-02-12T21:01:22.479Z',
          actions: [],
          artifacts: {
            dashboards: existingDashboards,
            investigation_guide: { blob: '' },
          },
        },
        references: [
          {
            name: 'dashboard_0',
            type: 'dashboard',
            id: 'dashboard-1',
          },
          {
            name: 'dashboard_1',
            type: 'dashboard',
            id: 'dashboard-2',
          },
        ],
        version: '123',
      };

      unsecuredSavedObjectsClient.get.mockResolvedValue(existingRule);

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          enabled: true,
          schedule: { interval: '1m' },
          params: {
            bar: true,
          },
          actions: [],
          artifacts: {
            dashboards: [
              {
                refId: 'dashboard_0',
              },
            ],
            investigation_guide: { blob: '' },
          },
          executionStatus: {
            lastExecutionDate: '2019-02-12T21:01:22.479Z',
            status: 'pending',
          },
          notifyWhen: 'onActiveAlert',
          revision: 1,
          scheduledTaskId: 'task-123',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        references: [
          {
            name: 'dashboard_0',
            type: 'dashboard',
            id: 'dashboard-1',
          },
        ],
      });

      const result = await rulesClient.update({
        id: '1',
        data: {
          schedule: { interval: '1m' },
          name: 'abc',
          tags: ['foo'],
          params: {
            bar: true,
          },
          throttle: null,
          notifyWhen: 'onActiveAlert',
          actions: [],
          systemActions: [],
          artifacts: {
            dashboards: [
              {
                id: 'dashboard-1',
              },
            ],
            investigation_guide: { blob: '' },
          },
        },
      });

      expect(unsecuredSavedObjectsClient.create).toHaveBeenNthCalledWith(
        1,
        RULE_SAVED_OBJECT_TYPE,
        expect.objectContaining({
          artifacts: {
            dashboards: [
              {
                refId: 'dashboard_0',
              },
            ],
            investigation_guide: { blob: '' },
          },
        }),
        {
          id: '1',
          overwrite: true,
          references: [{ id: 'dashboard-1', name: 'dashboard_0', type: 'dashboard' }],
          version: '123',
        }
      );

      expect(result?.artifacts).toEqual({
        dashboards: [
          {
            id: 'dashboard-1',
          },
        ],
        investigation_guide: { blob: '' },
      });

      expect(result).toMatchInlineSnapshot(`
        Object {
          "actions": Array [],
          "artifacts": Object {
            "dashboards": Array [
              Object {
                "id": "dashboard-1",
              },
            ],
            "investigation_guide": Object {
              "blob": "",
            },
          },
          "createdAt": 2019-02-12T21:01:22.479Z,
          "enabled": true,
          "executionStatus": Object {
            "lastExecutionDate": 2019-02-12T21:01:22.479Z,
            "status": "pending",
          },
          "id": "1",
          "isSnoozedUntil": null,
          "notifyWhen": "onActiveAlert",
          "params": Object {
            "bar": true,
          },
          "revision": 1,
          "schedule": Object {
            "interval": "1m",
          },
          "scheduledTaskId": "task-123",
          "snoozeSchedule": Array [],
          "systemActions": Array [],
          "updatedAt": 2019-02-12T21:01:22.479Z,
        }
      `);

      expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    });

    test('adds a new linked dashboard', async () => {
      const existingDashboards = [
        {
          refId: 'dashboard_0',
        },
        {
          refId: 'dashboard_1',
        },
      ];

      const existingRule = {
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          name: 'fakeRuleName',
          enabled: true,
          tags: ['foo'],
          alertTypeId: 'myType',
          schedule: { interval: '1m' },
          consumer: 'myApp',
          revision: 0,
          scheduledTaskId: 'task-123',
          params: {},
          executionStatus: {
            lastExecutionDate: '2019-02-12T21:01:22.479Z',
            status: 'pending',
          },
          muteAll: false,
          legacyId: null,
          snoozeSchedule: [],
          mutedInstanceIds: [],
          createdBy: 'elastic',
          createdAt: '2019-02-12T21:01:22.479Z',
          updatedBy: 'elastic',
          updatedAt: '2019-02-12T21:01:22.479Z',
          actions: [],
          artifacts: {
            dashboards: existingDashboards,
            investigation_guide: { blob: '' },
          },
        },
        references: [
          {
            name: 'dashboard_0',
            type: 'dashboard',
            id: 'dashboard-1',
          },
          {
            name: 'dashboard_1',
            type: 'dashboard',
            id: 'dashboard-2',
          },
        ],
        version: '123',
      };

      unsecuredSavedObjectsClient.get.mockResolvedValue(existingRule);

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          enabled: true,
          schedule: { interval: '1m' },
          params: {
            bar: true,
          },
          actions: [],
          artifacts: {
            dashboards: [
              {
                refId: 'dashboard_0',
              },
              {
                refId: 'dashboard_1',
              },
              {
                refId: 'dashboard_2',
              },
            ],
          },
          executionStatus: {
            lastExecutionDate: '2019-02-12T21:01:22.479Z',
            status: 'pending',
          },
          notifyWhen: 'onActiveAlert',
          revision: 1,
          scheduledTaskId: 'task-123',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        references: [
          {
            name: 'dashboard_0',
            type: 'dashboard',
            id: 'dashboard-1',
          },
          {
            name: 'dashboard_1',
            type: 'dashboard',
            id: 'dashboard-2',
          },
          {
            name: 'dashboard_2',
            type: 'dashboard',
            id: 'dashboard-3',
          },
        ],
      });

      const result = await rulesClient.update({
        id: '1',
        data: {
          schedule: { interval: '1m' },
          name: 'abc',
          tags: ['foo'],
          params: {
            bar: true,
          },
          throttle: null,
          notifyWhen: 'onActiveAlert',
          actions: [],
          systemActions: [],
          artifacts: {
            dashboards: [
              {
                id: 'dashboard-1',
              },
              {
                id: 'dashboard-2',
              },
              {
                id: 'dashboard-3',
              },
            ],
          },
        },
      });

      expect(unsecuredSavedObjectsClient.create).toHaveBeenNthCalledWith(
        1,
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
              {
                refId: 'dashboard_2',
              },
            ],
            investigation_guide: { blob: '' },
          },
        }),
        {
          id: '1',
          overwrite: true,
          references: [
            { id: 'dashboard-1', name: 'dashboard_0', type: 'dashboard' },
            { id: 'dashboard-2', name: 'dashboard_1', type: 'dashboard' },
            { id: 'dashboard-3', name: 'dashboard_2', type: 'dashboard' },
          ],
          version: '123',
        }
      );

      expect(result?.artifacts).toEqual({
        dashboards: [
          {
            id: 'dashboard-1',
          },
          {
            id: 'dashboard-2',
          },
          {
            id: 'dashboard-3',
          },
        ],
        investigation_guide: { blob: '' },
      });

      expect(result).toMatchInlineSnapshot(`
        Object {
          "actions": Array [],
          "artifacts": Object {
            "dashboards": Array [
              Object {
                "id": "dashboard-1",
              },
              Object {
                "id": "dashboard-2",
              },
              Object {
                "id": "dashboard-3",
              },
            ],
            "investigation_guide": Object {
              "blob": "",
            },
          },
          "createdAt": 2019-02-12T21:01:22.479Z,
          "enabled": true,
          "executionStatus": Object {
            "lastExecutionDate": 2019-02-12T21:01:22.479Z,
            "status": "pending",
          },
          "id": "1",
          "isSnoozedUntil": null,
          "notifyWhen": "onActiveAlert",
          "params": Object {
            "bar": true,
          },
          "revision": 1,
          "schedule": Object {
            "interval": "1m",
          },
          "scheduledTaskId": "task-123",
          "snoozeSchedule": Array [],
          "systemActions": Array [],
          "updatedAt": 2019-02-12T21:01:22.479Z,
        }
      `);

      expect(unsecuredSavedObjectsClient.get).not.toHaveBeenCalled();
    });

    test('gives updated investigation guide to saved objects client', async () => {
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
          name: 'email connector',
        }),
      ]);
      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          enabled: true,
          schedule: { interval: '1m' },
          params: {
            bar: true,
          },
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
              group: 'default',
              actionRef: 'action_1',
              actionTypeId: 'test',
              params: {
                foo: true,
              },
            },
            {
              group: 'default',
              actionRef: 'action_2',
              actionTypeId: 'test2',
              params: {
                foo: true,
              },
            },
          ],
          notifyWhen: 'onActiveAlert',
          revision: 1,
          scheduledTaskId: 'task-123',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          alertDelay: {
            active: 5,
          },
          executionStatus: {
            lastExecutionDate: '2019-02-12T21:01:22.479Z',
            status: 'pending',
          },
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

      const result = await rulesClient.update({
        id: '1',
        data: {
          schedule: { interval: '1m' },
          name: 'abc',
          tags: ['foo'],
          params: {
            bar: true,
            risk_score: 40,
            severity: 'low',
          },
          throttle: null,
          notifyWhen: 'onActiveAlert',
          artifacts: {
            investigation_guide: { blob: 'new blob' },
          },
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
          alertDelay: {
            active: 10,
          },
        },
      });

      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledTimes(1);
      expect(
        (unsecuredSavedObjectsClient.create.mock.calls[0][1] as RuleDomain).artifacts
          ?.investigation_guide?.blob
      ).toEqual('new blob');
      expect(result.artifacts).toBeDefined();
    });
  });

  describe('rule migration', () => {
    test('migrates legacy lastRun.outcomeMsg string to string[]', async () => {
      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          enabled: true,
          schedule: { interval: '1m' },
          params: {
            bar: true,
          },
          actions: [],
          lastRun: {
            outcomeMsg: 'Some message',
          },
          revision: 1,
          scheduledTaskId: 'task-123',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        references: [],
      });

      const result = await rulesClient.update({
        id: '1',
        data: {
          schedule: { interval: '1m' },
          name: 'abc',
          tags: ['foo'],
          params: {
            bar: true,
            risk_score: 40,
            severity: 'low',
          },
          actions: [],
          alertDelay: {
            active: 10,
          },
        },
      });

      expect(result).toMatchObject({
        lastRun: {
          outcomeMsg: ['Some message'],
        },
      });
    });
  });

  it('creates and invalidates UIAM API key as well', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
      ...existingDecryptedAlert,
      attributes: {
        ...existingDecryptedAlert.attributes,
        uiamApiKey: Buffer.from('001:essu_222').toString('base64'),
      },
    });
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '123', name: '123', api_key: 'abc' },
      uiamResult: { id: '456', name: '456', api_key: 'essu_def' },
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: true,
        schedule: { interval: '1m' },
        params: {
          bar: true,
        },
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notifyWhen: 'onThrottleInterval',
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            params: {
              foo: true,
            },
          },
        ],
        apiKey: Buffer.from('123:abc').toString('base64'),
        uiamApiKey: '456:essu_def',
        revision: 1,
        scheduledTaskId: 'task-123',
      },
      updated_at: new Date().toISOString(),
      references: [
        {
          name: 'action_0',
          type: 'action',
          id: '1',
        },
      ],
    });
    await rulesClient.update({
      id: '1',
      data: {
        schedule: { interval: '1m' },
        name: 'abc',
        tags: ['foo'],
        params: {
          bar: true,
        },
        throttle: '5m',
        notifyWhen: 'onThrottleInterval',
        actions: [
          {
            group: 'default',
            id: '1',
            params: {
              foo: true,
            },
          },
        ],
      },
    });

    expect(bulkMarkApiKeysForInvalidationMock).toHaveBeenCalledWith(
      {
        apiKeys: ['MTIzOmFiYw==', 'MDAxOmVzc3VfMjIy'],
      },
      expect.any(Object),
      expect.any(Object)
    );

    expect(unsecuredSavedObjectsClient.create.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        apiKey: 'MTIzOmFiYw==',
        uiamApiKey: 'NDU2OmVzc3VfZGVm',
      })
    );
  });

  it('does not leak stale uiamApiKey when new API key set has no UIAM key', async () => {
    encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
      ...existingDecryptedAlert,
      attributes: {
        ...existingDecryptedAlert.attributes,
        uiamApiKey: Buffer.from('stale-uiam-id:stale-uiam-key').toString('base64'),
      },
    });
    rulesClientParams.createAPIKey.mockResolvedValueOnce({
      apiKeysEnabled: true,
      result: { id: '123', name: '123', api_key: 'abc' },
    });
    unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        enabled: true,
        schedule: { interval: '1m' },
        params: { bar: true },
        executionStatus: {
          lastExecutionDate: '2019-02-12T21:01:22.479Z',
          status: 'pending',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notifyWhen: 'onThrottleInterval',
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            actionTypeId: 'test',
            params: { foo: true },
          },
        ],
        apiKey: Buffer.from('123:abc').toString('base64'),
        revision: 1,
        scheduledTaskId: 'task-123',
      },
      updated_at: new Date().toISOString(),
      references: [{ name: 'action_0', type: 'action', id: '1' }],
    });
    await rulesClient.update({
      id: '1',
      data: {
        schedule: { interval: '1m' },
        name: 'abc',
        tags: ['foo'],
        params: { bar: true },
        throttle: '5m',
        notifyWhen: 'onThrottleInterval',
        actions: [{ group: 'default', id: '1', params: { foo: true } }],
      },
    });

    const writtenAttributes = unsecuredSavedObjectsClient.create.mock.calls[0][1];
    expect(writtenAttributes).not.toHaveProperty('uiamApiKey');
  });

  describe('missing UIAM API key tagging', () => {
    test('should add missing UIAM API key tag when updating rule with API key rotation and missing UIAM key in serverless', async () => {
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
          enabled: true,
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
          params: {},
          scheduledTaskId: 'task-123',
        },
        references: [],
        version: '123',
      });

      // Mock API key creation where UIAM key is missing
      rulesClientParams.createAPIKey.mockResolvedValueOnce({
        apiKeysEnabled: true,
        result: { id: '456', name: '456', api_key: 'def' },
        // uiamResult is undefined/null - UIAM key creation failed
      });

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: 'alert',
        attributes: {
          enabled: true,
          schedule: { interval: '10s' },
          params: {},
          actions: [],
          scheduledTaskId: 'task-123',
        },
        references: [],
      });

      await serverlessRulesClient.update({
        id: '1',
        data: {
          name: 'my rule',
          tags: ['existing-tag'],
          schedule: { interval: '10s' },
          actions: [],
          params: {},
          throttle: null,
          notifyWhen: null,
        },
        allowMissingConnectorSecrets: true,
        shouldIncrementRevision: () => true,
      });

      // Verify the missing UIAM key tag was added
      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
        'alert',
        expect.objectContaining({
          tags: expect.arrayContaining(['existing-tag', 'Missing Elastic Cloud API Key']),
        }),
        expect.anything()
      );
    });

    test('should not add missing UIAM API key tag when UIAM key is present during update', async () => {
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
          enabled: true,
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
          params: {},
          scheduledTaskId: 'task-123',
        },
        references: [],
        version: '123',
      });

      // The rule is enabled, so the API key is rotated: the tag decision is made on the
      // freshly created key set, which does contain a UIAM key here.
      rulesClientParams.createAPIKey.mockResolvedValueOnce({
        apiKeysEnabled: true,
        result: { id: '456', name: '456', api_key: 'abc' },
        uiamResult: { id: '789', name: '789', api_key: 'def' },
      });

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: 'alert',
        attributes: {
          enabled: true,
          schedule: { interval: '10s' },
          params: {},
          actions: [],
          scheduledTaskId: 'task-123',
        },
        references: [],
      });

      await serverlessRulesClient.update({
        id: '1',
        data: {
          name: 'my rule',
          tags: ['existing-tag'],
          schedule: { interval: '10s' },
          actions: [],
          params: {},
          throttle: null,
          notifyWhen: null,
        },
        allowMissingConnectorSecrets: true,
        shouldIncrementRevision: () => true,
      });

      // Verify the missing UIAM key tag was NOT added
      expect(unsecuredSavedObjectsClient.create).toHaveBeenCalledWith(
        'alert',
        expect.objectContaining({
          tags: ['existing-tag'], // Only original tags
        }),
        expect.anything()
      );
    });

    test('should not add missing UIAM API key tag in non-serverless environment during update', async () => {
      // Non-serverless environment (default rulesClientParams.isServerless = false)
      const nonServerlessRulesClient = new RulesClient({
        ...rulesClientParams,
      });

      encryptedSavedObjects.getDecryptedAsInternalUser.mockResolvedValue({
        id: '1',
        type: 'alert',
        attributes: {
          enabled: true,
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
          params: {},
          scheduledTaskId: 'task-123',
        },
        references: [],
        version: '123',
      });

      unsecuredSavedObjectsClient.create.mockResolvedValueOnce({
        id: '1',
        type: 'alert',
        attributes: {
          enabled: true,
          schedule: { interval: '10s' },
          params: {},
          actions: [],
          scheduledTaskId: 'task-123',
        },
        references: [],
      });

      await nonServerlessRulesClient.update({
        id: '1',
        data: {
          name: 'my rule',
          tags: ['existing-tag'],
          schedule: { interval: '10s' },
          actions: [],
          params: {},
          throttle: null,
          notifyWhen: null,
        },
        allowMissingConnectorSecrets: true,
        shouldIncrementRevision: () => true,
      });

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
