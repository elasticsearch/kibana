/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { unsnoozeAlertInstance } from './unsnooze_alert_instance';

const http = httpServiceMock.createStartContract();

describe('unsnoozeAlertInstance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls the unsnooze API with correct URL', async () => {
    await unsnoozeAlertInstance({ http, id: 'rule-id', instanceId: 'instance-id' });

    expect(http.post.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "/api/alerting/rule/rule-id/alert/instance-id/_unsnooze",
        ],
      ]
    `);
  });

  test('URL-encodes special characters in id and instanceId', async () => {
    await unsnoozeAlertInstance({ http, id: 'rule/1', instanceId: 'alert/2' });

    expect(http.post.mock.calls[0][0]).toBe(
      '/api/alerting/rule/rule%2F1/alert/alert%2F2/_unsnooze'
    );
  });
});
