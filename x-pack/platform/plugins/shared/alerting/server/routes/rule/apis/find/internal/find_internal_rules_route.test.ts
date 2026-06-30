/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { httpServiceMock } from '@kbn/core/server/mocks';
import { licenseStateMock } from '../../../../../lib/license_state.mock';
import { findInternalRulesRoute } from './find_internal_rules_route';
import { mockHandlerArguments } from '../../../../_mock_handler_arguments';
import { rulesClientMock } from '../../../../../rules_client.mock';
import type { FindResult } from '../../../../../application/rule/methods/find/find_rules';

jest.mock('../../../../../lib/license_api_access', () => ({
  verifyApiAccess: jest.fn(),
}));

jest.mock('../../../../lib/track_legacy_terminology', () => ({
  trackLegacyTerminology: jest.fn(),
}));

beforeEach(() => {
  jest.resetAllMocks();
});

const rulesClient = rulesClientMock.create();

describe('findInternalRulesRoute', () => {
  it('registers the route without public access', async () => {
    const licenseState = licenseStateMock.create();
    const router = httpServiceMock.createRouter();

    findInternalRulesRoute(router, licenseState);
    expect(router.post).toHaveBeenCalledWith(
      expect.not.objectContaining({
        options: expect.objectContaining({ access: 'public' }),
      }),
      expect.any(Function)
    );
  });

  it('finds rules with proper parameters', async () => {
    const licenseState = licenseStateMock.create();
    const router = httpServiceMock.createRouter();

    findInternalRulesRoute(router, licenseState);

    const [config, handler] = router.post.mock.calls[0];

    expect(config.path).toMatchInlineSnapshot(`"/internal/alerting/rules/_find"`);

    const findResult = {
      page: 1,
      perPage: 1,
      total: 0,
      data: [],
    };
    rulesClient.find.mockResolvedValueOnce(findResult);

    const [context, req, res] = mockHandlerArguments(
      { rulesClient },
      {
        body: {
          per_page: 1,
          page: 1,
          default_search_operator: 'OR',
          rule_type_ids: ['foo'],
          consumers: ['bar'],
        },
      },
      ['ok']
    );

    expect(await handler(context, req, res)).toMatchInlineSnapshot(`
            Object {
              "body": Object {
                "data": Array [],
                "page": 1,
                "per_page": 1,
                "total": 0,
              },
            }
        `);

    expect(rulesClient.find).toHaveBeenCalledTimes(1);
    expect(rulesClient.find.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        Object {
          "options": Object {
            "consumers": Array [
              "bar",
            ],
            "defaultSearchOperator": "OR",
            "page": 1,
            "perPage": 1,
            "ruleTypeIds": Array [
              "foo",
            ],
          },
        },
      ]
    `);

    expect(res.ok).toHaveBeenCalledWith({
      body: {
        page: 1,
        per_page: 1,
        total: 0,
        data: [],
      },
    });
  });

  it('finds rules with search_fields string parameters', async () => {
    const licenseState = licenseStateMock.create();
    const router = httpServiceMock.createRouter();

    findInternalRulesRoute(router, licenseState);

    const [config, handler] = router.post.mock.calls[0];

    expect(config.path).toMatchInlineSnapshot(`"/internal/alerting/rules/_find"`);

    const findResult = {
      page: 1,
      perPage: 1,
      total: 0,
      data: [],
    };
    rulesClient.find.mockResolvedValueOnce(findResult);

    const [context, req, res] = mockHandlerArguments(
      { rulesClient },
      {
        body: {
          per_page: 1,
          page: 1,
          default_search_operator: 'OR',
          search_fields: 'foo',
          consumers: ['bar'],
        },
      },
      ['ok']
    );

    expect(await handler(context, req, res)).toMatchInlineSnapshot(`
            Object {
              "body": Object {
                "data": Array [],
                "page": 1,
                "per_page": 1,
                "total": 0,
              },
            }
        `);

    expect(rulesClient.find).toHaveBeenCalledTimes(1);
    expect(rulesClient.find.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        Object {
          "options": Object {
            "consumers": Array [
              "bar",
            ],
            "defaultSearchOperator": "OR",
            "page": 1,
            "perPage": 1,
            "searchFields": Array [
              "foo",
            ],
          },
        },
      ]
    `);

    expect(res.ok).toHaveBeenCalledWith({
      body: {
        page: 1,
        per_page: 1,
        total: 0,
        data: [],
      },
    });
  });

  it('should rewrite the rule and actions correctly', async () => {
    const licenseState = licenseStateMock.create();
    const router = httpServiceMock.createRouter();

    findInternalRulesRoute(router, licenseState);

    const [config, handler] = router.post.mock.calls[0];

    expect(config.path).toMatchInlineSnapshot(`"/internal/alerting/rules/_find"`);

    const findResult: FindResult<{}> = {
      page: 1,
      perPage: 1,
      total: 0,
      data: [
        {
          id: '3d534c70-582b-11ec-8995-2b1578a3bc5d',
          notifyWhen: 'onActiveAlert' as const,
          alertTypeId: '.index-threshold',
          name: 'stressing index-threshold 37/200',
          consumer: 'alerts',
          tags: [],
          enabled: true,
          throttle: null,
          apiKeyOwner: '2889684073',
          createdBy: 'elastic',
          updatedBy: '2889684073',
          muteAll: false,
          mutedInstanceIds: [],
          schedule: {
            interval: '1s',
          },
          snoozeSchedule: [],
          actions: [
            {
              actionTypeId: '.server-log',
              params: {
                message: 'alert 37: {{context.message}}',
              },
              group: 'threshold met',
              id: '3619a0d0-582b-11ec-8995-2b1578a3bc5d',
              uuid: '123-456',
            },
          ],
          systemActions: [
            { actionTypeId: '.test', id: 'system_action-id', params: {}, uuid: '789' },
          ],
          params: { x: 42 },
          updatedAt: new Date('2024-03-21T13:15:00.498Z'),
          createdAt: new Date('2024-03-21T13:15:00.498Z'),
          scheduledTaskId: '52125fb0-5895-11ec-ae69-bb65d1a71b72',
          executionStatus: {
            status: 'ok' as const,
            lastExecutionDate: new Date('2024-03-21T13:15:00.498Z'),
            lastDuration: 1194,
          },
          revision: 0,
          artifacts: {
            dashboards: [
              {
                id: 'dashboard-1',
              },
            ],
          },
        },
      ],
    };

    rulesClient.find.mockResolvedValueOnce(findResult);

    const [context, req, res] = mockHandlerArguments(
      { rulesClient },
      {
        body: {
          per_page: 1,
          page: 1,
          default_search_operator: 'OR',
          search_fields: 'foo',
          consumers: ['bar'],
        },
      },
      ['ok']
    );

    expect(await handler(context, req, res)).toMatchInlineSnapshot(`
      Object {
        "body": Object {
          "data": Array [
            Object {
              "actions": Array [
                Object {
                  "connector_type_id": ".server-log",
                  "group": "threshold met",
                  "id": "3619a0d0-582b-11ec-8995-2b1578a3bc5d",
                  "params": Object {
                    "message": "alert 37: {{context.message}}",
                  },
                  "uuid": "123-456",
                },
                Object {
                  "connector_type_id": ".test",
                  "id": "system_action-id",
                  "params": Object {},
                  "uuid": "789",
                },
              ],
              "api_key_owner": "2889684073",
              "artifacts": Object {
                "dashboards": Array [
                  Object {
                    "id": "dashboard-1",
                  },
                ],
              },
              "consumer": "alerts",
              "created_at": "2024-03-21T13:15:00.498Z",
              "created_by": "elastic",
              "enabled": true,
              "execution_status": Object {
                "last_duration": 1194,
                "last_execution_date": "2024-03-21T13:15:00.498Z",
                "status": "ok",
              },
              "id": "3d534c70-582b-11ec-8995-2b1578a3bc5d",
              "mute_all": false,
              "muted_alert_ids": Array [],
              "name": "stressing index-threshold 37/200",
              "notify_when": "onActiveAlert",
              "params": Object {
                "x": 42,
              },
              "revision": 0,
              "rule_type_id": ".index-threshold",
              "schedule": Object {
                "interval": "1s",
              },
              "scheduled_task_id": "52125fb0-5895-11ec-ae69-bb65d1a71b72",
              "snooze_schedule": Array [],
              "tags": Array [],
              "throttle": null,
              "updated_at": "2024-03-21T13:15:00.498Z",
              "updated_by": "2889684073",
            },
          ],
          "page": 1,
          "per_page": 1,
          "total": 0,
        },
      }
    `);

    expect(rulesClient.find).toHaveBeenCalledTimes(1);
    expect(rulesClient.find.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        Object {
          "options": Object {
            "consumers": Array [
              "bar",
            ],
            "defaultSearchOperator": "OR",
            "page": 1,
            "perPage": 1,
            "searchFields": Array [
              "foo",
            ],
          },
        },
      ]
    `);

    // @ts-expect-error - res.ok is mocked
    expect(res.ok.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "body": Object {
          "data": Array [
            Object {
              "actions": Array [
                Object {
                  "connector_type_id": ".server-log",
                  "group": "threshold met",
                  "id": "3619a0d0-582b-11ec-8995-2b1578a3bc5d",
                  "params": Object {
                    "message": "alert 37: {{context.message}}",
                  },
                  "uuid": "123-456",
                },
                Object {
                  "connector_type_id": ".test",
                  "id": "system_action-id",
                  "params": Object {},
                  "uuid": "789",
                },
              ],
              "api_key_owner": "2889684073",
              "artifacts": Object {
                "dashboards": Array [
                  Object {
                    "id": "dashboard-1",
                  },
                ],
              },
              "consumer": "alerts",
              "created_at": "2024-03-21T13:15:00.498Z",
              "created_by": "elastic",
              "enabled": true,
              "execution_status": Object {
                "last_duration": 1194,
                "last_execution_date": "2024-03-21T13:15:00.498Z",
                "status": "ok",
              },
              "id": "3d534c70-582b-11ec-8995-2b1578a3bc5d",
              "mute_all": false,
              "muted_alert_ids": Array [],
              "name": "stressing index-threshold 37/200",
              "notify_when": "onActiveAlert",
              "params": Object {
                "x": 42,
              },
              "revision": 0,
              "rule_type_id": ".index-threshold",
              "schedule": Object {
                "interval": "1s",
              },
              "scheduled_task_id": "52125fb0-5895-11ec-ae69-bb65d1a71b72",
              "snooze_schedule": Array [],
              "tags": Array [],
              "throttle": null,
              "updated_at": "2024-03-21T13:15:00.498Z",
              "updated_by": "2889684073",
            },
          ],
          "page": 1,
          "per_page": 1,
          "total": 0,
        },
      }
    `);
  });

  it('transforms snoozedInstances into snoozed_alert_instances in the response', async () => {
    const licenseState = licenseStateMock.create();
    const router = httpServiceMock.createRouter();

    findInternalRulesRoute(router, licenseState);

    const [, handler] = router.post.mock.calls[0];

    const baseRule = {
      id: 'rule-id-1',
      alertTypeId: '.index-threshold',
      name: 'test rule',
      consumer: 'alerts',
      tags: [],
      enabled: true,
      throttle: null,
      apiKeyOwner: 'elastic',
      createdBy: 'elastic',
      updatedBy: 'elastic',
      muteAll: false,
      mutedInstanceIds: [],
      schedule: { interval: '1m' },
      snoozeSchedule: [],
      actions: [],
      params: {},
      updatedAt: new Date('2024-03-21T13:15:00.498Z'),
      createdAt: new Date('2024-03-21T13:15:00.498Z'),
      executionStatus: {
        status: 'ok' as const,
        lastExecutionDate: new Date('2024-03-21T13:15:00.498Z'),
      },
      revision: 0,
    };

    const findResult = {
      page: 1,
      perPage: 3,
      total: 3,
      data: [
        {
          ...baseRule,
          id: 'rule-id-1',
          // time-based snooze only
          snoozedInstances: [
            {
              instanceId: 'alert-1',
              expiresAt: '2024-04-01T00:00:00.000Z',
              snoozedAt: '2024-03-21T13:15:00.000Z',
              snoozedBy: 'elastic',
            },
          ],
        },
        {
          ...baseRule,
          id: 'rule-id-2',
          // condition-based snooze only
          snoozedInstances: [
            {
              instanceId: 'alert-2',
              conditions: [{ type: 'field_change', field: 'kibana.alert.severity' }],
              conditionOperator: 'any' as const,
              snoozedAt: '2024-03-21T13:15:00.000Z',
              snoozedBy: 'elastic',
            },
          ],
        },
        {
          ...baseRule,
          id: 'rule-id-3',
          // time-based + condition-based snooze combined
          snoozedInstances: [
            {
              instanceId: 'alert-3',
              expiresAt: '2024-04-01T00:00:00.000Z',
              conditions: [{ type: 'severity_change' }],
              conditionOperator: 'any' as const,
              snoozedAt: '2024-03-21T13:15:00.000Z',
              snoozedBy: 'elastic',
            },
          ],
        },
      ],
    } as unknown as FindResult<{}>;

    rulesClient.find.mockResolvedValueOnce(findResult);

    const [context, req, res] = mockHandlerArguments(
      { rulesClient },
      { body: { per_page: 3, page: 1, default_search_operator: 'OR' } },
      ['ok']
    );

    await handler(context, req, res);

    // @ts-expect-error
    const { data } = res.ok.mock.calls[0][0].body;

    // time-based snooze: expires_at present, no conditions
    expect(data[0].snoozed_alert_instances).toEqual([
      {
        instance_id: 'alert-1',
        expires_at: '2024-04-01T00:00:00.000Z',
        snoozed_at: '2024-03-21T13:15:00.000Z',
        snoozed_by: 'elastic',
      },
    ]);

    // condition-based snooze: conditions + conditionOperator present, no expires_at
    expect(data[1].snoozed_alert_instances).toEqual([
      {
        instance_id: 'alert-2',
        conditions: [{ type: 'field_change', field: 'kibana.alert.severity' }],
        condition_operator: 'any',
        snoozed_at: '2024-03-21T13:15:00.000Z',
        snoozed_by: 'elastic',
      },
    ]);

    // combined snooze: both expires_at and conditions present
    expect(data[2].snoozed_alert_instances).toEqual([
      {
        instance_id: 'alert-3',
        expires_at: '2024-04-01T00:00:00.000Z',
        conditions: [{ type: 'severity_change' }],
        condition_operator: 'any',
        snoozed_at: '2024-03-21T13:15:00.000Z',
        snoozed_by: 'elastic',
      },
    ]);
  });
});
