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
import { unsnoozeAlertRoute } from './unsnooze_alert_route';

const rulesClient = rulesClientMock.create();
jest.mock('../../../../lib/license_api_access', () => ({
  verifyApiAccess: jest.fn(),
}));

beforeEach(() => {
  jest.resetAllMocks();
});

describe('unsnoozeAlertRoute', () => {
  it('unsnoozes an alert', async () => {
    const licenseState = licenseStateMock.create();
    const router = httpServiceMock.createRouter();

    unsnoozeAlertRoute(router, licenseState);

    const [config, handler] = router.post.mock.calls[0];

    expect(config.path).toMatchInlineSnapshot(
      `"/api/alerting/rule/{rule_id}/alert/{alert_id}/_unsnooze"`
    );

    rulesClient.unsnoozeAlertInstance.mockResolvedValueOnce();

    const [context, req, res] = mockHandlerArguments(
      { rulesClient },
      {
        params: {
          rule_id: '1',
          alert_id: '2',
        },
      },
      ['noContent']
    );

    expect(await handler(context, req, res)).toEqual(undefined);

    expect(rulesClient.unsnoozeAlertInstance).toHaveBeenCalledWith({
      alertId: '1',
      alertInstanceId: '2',
    });
    expect(res.noContent).toHaveBeenCalled();
  });

  it('ensures the rule type gets validated for the license', async () => {
    const licenseState = licenseStateMock.create();
    const router = httpServiceMock.createRouter();

    unsnoozeAlertRoute(router, licenseState);

    const [, handler] = router.post.mock.calls[0];

    rulesClient.unsnoozeAlertInstance.mockRejectedValue(
      new RuleTypeDisabledError('Fail', 'license_invalid')
    );

    const [context, req, res] = mockHandlerArguments({ rulesClient }, { params: {} }, [
      'ok',
      'forbidden',
    ]);

    await handler(context, req, res);

    expect(res.forbidden).toHaveBeenCalledWith({ body: { message: 'Fail' } });
  });
});
