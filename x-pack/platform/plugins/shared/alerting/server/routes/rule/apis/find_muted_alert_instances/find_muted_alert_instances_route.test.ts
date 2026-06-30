/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { httpServiceMock } from '@kbn/core/server/mocks';
import { licenseStateMock } from '../../../../lib/license_state.mock';
import { findMutedAlertInstancesRoute } from './find_muted_alert_instances_route';
import { mockHandlerArguments } from '../../../_mock_handler_arguments';
import { rulesClientMock } from '../../../../rules_client.mock';
import type { FindMutedAlertsResult } from '../../../../application/rule/methods/find_muted_alerts';

jest.mock('../../../../lib/license_api_access', () => ({
  verifyApiAccess: jest.fn(),
}));

beforeEach(() => {
  jest.resetAllMocks();
});

const rulesClient = rulesClientMock.create();

describe('findMutedAlertInstancesRoute', () => {
  it('registers the route as internal (not public)', () => {
    const licenseState = licenseStateMock.create();
    const router = httpServiceMock.createRouter();

    findMutedAlertInstancesRoute(router, licenseState);

    const [config] = router.post.mock.calls[0];
    expect(config.path).toMatchInlineSnapshot(`"/internal/alerting/rules/_find_muted_alerts"`);
    expect(config.options).toEqual(expect.objectContaining({ access: 'internal' }));
  });

  it('transforms the request body and returns id + muted_alert_instance_ids + snoozed_alert_instances', async () => {
    const licenseState = licenseStateMock.create();
    const router = httpServiceMock.createRouter();

    findMutedAlertInstancesRoute(router, licenseState);

    const [, handler] = router.post.mock.calls[0];

    const findResult: FindMutedAlertsResult = {
      page: 1,
      perPage: 10,
      total: 1,
      data: [
        {
          id: 'rule-1',
          mutedInstanceIds: ['instance-1', 'instance-2'],
          snoozedInstances: [
            {
              instanceId: 'instance-3',
              expiresAt: '2099-01-01T00:00:00.000Z',
              snoozedAt: '2026-01-01T00:00:00.000Z',
              snoozedBy: 'elastic',
            },
          ],
        },
      ],
    };
    rulesClient.findMutedAlerts.mockResolvedValueOnce(findResult);

    const [context, req, res] = mockHandlerArguments(
      { rulesClient },
      {
        body: {
          per_page: 10,
          page: 1,
          filter: 'alert.id: alert:rule-1',
        },
      },
      ['ok']
    );

    await handler(context, req, res);

    expect(rulesClient.findMutedAlerts).toHaveBeenCalledTimes(1);
    expect(rulesClient.findMutedAlerts.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        Object {
          "options": Object {
            "filter": "alert.id: alert:rule-1",
            "page": 1,
            "perPage": 10,
          },
        },
      ]
    `);

    expect(res.ok).toHaveBeenCalledWith({
      body: {
        page: 1,
        per_page: 10,
        total: 1,
        data: [
          {
            id: 'rule-1',
            muted_alert_instance_ids: ['instance-1', 'instance-2'],
            snoozed_alert_instances: [
              {
                instance_id: 'instance-3',
                expires_at: '2099-01-01T00:00:00.000Z',
                snoozed_at: '2026-01-01T00:00:00.000Z',
                snoozed_by: 'elastic',
              },
            ],
          },
        ],
      },
    });
  });

  it('omits optional options that are not provided in the body', async () => {
    const licenseState = licenseStateMock.create();
    const router = httpServiceMock.createRouter();

    findMutedAlertInstancesRoute(router, licenseState);

    const [, handler] = router.post.mock.calls[0];

    rulesClient.findMutedAlerts.mockResolvedValueOnce({
      page: 1,
      perPage: 10,
      total: 0,
      data: [],
    });

    const [context, req, res] = mockHandlerArguments({ rulesClient }, { body: {} }, ['ok']);

    await handler(context, req, res);

    expect(rulesClient.findMutedAlerts.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        Object {
          "options": Object {},
        },
      ]
    `);

    expect(res.ok).toHaveBeenCalledWith({
      body: { page: 1, per_page: 10, total: 0, data: [] },
    });
  });

  it('does not leak extra rule fields if the rules client returns more data than expected', async () => {
    const licenseState = licenseStateMock.create();
    const router = httpServiceMock.createRouter();

    findMutedAlertInstancesRoute(router, licenseState);

    const [, handler] = router.post.mock.calls[0];

    // Simulate a bug where the rules client leaks sensitive rule attributes beyond
    // the id + muted instance ids contract. The route must not forward them.
    rulesClient.findMutedAlerts.mockResolvedValueOnce({
      page: 1,
      perPage: 10,
      total: 1,
      data: [
        {
          id: 'rule-1',
          mutedInstanceIds: ['instance-1'],
          name: 'super secret rule name',
          consumer: 'siem',
          alertTypeId: '.es-query',
          apiKey: 'should-never-be-exposed',
        },
      ],
    } as unknown as FindMutedAlertsResult);

    const [context, req, res] = mockHandlerArguments({ rulesClient }, { body: {} }, ['ok']);

    await handler(context, req, res);

    expect(res.ok).toHaveBeenCalledWith({
      body: {
        page: 1,
        per_page: 10,
        total: 1,
        data: [
          { id: 'rule-1', muted_alert_instance_ids: ['instance-1'], snoozed_alert_instances: [] },
        ],
      },
    });
  });
});
