/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServiceMock } from '@kbn/core/server/mocks';
import { rulesClientMock } from '../../../../rules_client.mock';
import { RuleTypeDisabledError } from '../../../../lib/errors/rule_type_disabled';
import { licenseStateMock } from '../../../../lib/license_state.mock';
import { mockHandlerArguments } from '../../../_mock_handler_arguments';
import { snoozeAlertRoute } from './snooze_alert_route';

const rulesClient = rulesClientMock.create();
jest.mock('../../../../lib/license_api_access', () => ({
  verifyApiAccess: jest.fn(),
}));

beforeEach(() => {
  jest.resetAllMocks();
});

describe('snoozeAlertRoute', () => {
  it('snoozes an alert with an expires_at body', async () => {
    const licenseState = licenseStateMock.create();
    const router = httpServiceMock.createRouter();

    snoozeAlertRoute(router, licenseState);

    const [config, handler] = router.post.mock.calls[0];

    expect(config.path).toMatchInlineSnapshot(
      `"/api/alerting/rule/{rule_id}/alert/{alert_id}/_snooze"`
    );

    rulesClient.snoozeAlertInstance.mockResolvedValueOnce(undefined);

    const [context, req, res] = mockHandlerArguments(
      { rulesClient },
      {
        params: { rule_id: 'rule-1', alert_id: 'alert-1' },
        query: {},
        body: {
          expires_at: '2026-05-01T00:00:00.000Z',
        },
      },
      ['noContent']
    );

    expect(await handler(context, req, res)).toEqual(undefined);

    expect(rulesClient.snoozeAlertInstance).toHaveBeenCalledWith({
      params: { alertId: 'rule-1', alertInstanceId: 'alert-1' },
      query: { validateAlertsExistence: true },
      body: {
        expiresAt: '2026-05-01T00:00:00.000Z',
        conditions: undefined,
        conditionOperator: undefined,
      },
    });
    expect(res.noContent).toHaveBeenCalled();
  });

  it('snoozes an alert with conditions body', async () => {
    const licenseState = licenseStateMock.create();
    const router = httpServiceMock.createRouter();

    snoozeAlertRoute(router, licenseState);

    const [, handler] = router.post.mock.calls[0];

    rulesClient.snoozeAlertInstance.mockResolvedValueOnce(undefined);

    const [context, req, res] = mockHandlerArguments(
      { rulesClient },
      {
        params: { rule_id: 'rule-1', alert_id: 'alert-1' },
        query: { validate_alerts_existence: true },
        body: {
          expires_at: '2026-05-01T00:00:00.000Z',
          conditions: [{ type: 'field_change', field: 'host.name' }],
          condition_operator: 'any',
        },
      },
      ['noContent']
    );

    expect(await handler(context, req, res)).toEqual(undefined);

    expect(rulesClient.snoozeAlertInstance).toHaveBeenCalledWith({
      params: { alertId: 'rule-1', alertInstanceId: 'alert-1' },
      query: { validateAlertsExistence: true },
      body: {
        expiresAt: '2026-05-01T00:00:00.000Z',
        conditions: [{ type: 'field_change', field: 'host.name' }],
        conditionOperator: 'any',
      },
    });
    expect(res.noContent).toHaveBeenCalled();
  });

  it('ensures the rule type gets validated for the license', async () => {
    const licenseState = licenseStateMock.create();
    const router = httpServiceMock.createRouter();

    snoozeAlertRoute(router, licenseState);

    const [, handler] = router.post.mock.calls[0];

    rulesClient.snoozeAlertInstance.mockRejectedValue(
      new RuleTypeDisabledError('Disabled for license reasons', 'license_invalid')
    );

    const [context, req, res] = mockHandlerArguments(
      { rulesClient },
      {
        params: { rule_id: 'rule-1', alert_id: 'alert-1' },
        query: {},
        body: { expires_at: '2026-05-01T00:00:00.000Z' },
      },
      ['ok', 'noContent', 'forbidden']
    );

    await handler(context, req, res);

    expect(res.forbidden).toHaveBeenCalledWith({
      body: { message: 'Disabled for license reasons' },
    });
  });
});
