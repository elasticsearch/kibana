/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { snoozeAlertInstance } from './snooze_alert_instance';

const http = httpServiceMock.createStartContract();

describe('snoozeAlertInstance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls the snooze API with correct URL (URL-encodes slashes)', async () => {
    await snoozeAlertInstance({ http, id: 'rule/1', instanceId: 'alert/2' });

    expect(http.post.mock.calls[0][0]).toBe('/api/alerting/rule/rule%2F1/alert/alert%2F2/_snooze');
  });

  test('sends empty body when no optional params provided', async () => {
    await snoozeAlertInstance({ http, id: 'rule-id', instanceId: 'instance-id' });

    expect(http.post.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        "/api/alerting/rule/rule-id/alert/instance-id/_snooze",
        Object {
          "body": "{}",
        },
      ]
    `);
  });

  test('sends expires_at when expiresAt is provided', async () => {
    await snoozeAlertInstance({
      http,
      id: 'rule-id',
      instanceId: 'instance-id',
      expiresAt: '2026-06-01T00:00:00.000Z',
    });

    const [, opts1] = http.post.mock.calls[0] as unknown as [string, { body: string }];
    expect(JSON.parse(opts1.body)).toEqual({
      expires_at: '2026-06-01T00:00:00.000Z',
    });
  });

  test('sends conditions and condition_operator when provided', async () => {
    await snoozeAlertInstance({
      http,
      id: 'rule-id',
      instanceId: 'instance-id',
      conditions: [{ type: 'severity_change' }],
      conditionOperator: 'any',
    });

    const [, opts2] = http.post.mock.calls[0] as unknown as [string, { body: string }];
    expect(JSON.parse(opts2.body)).toEqual({
      conditions: [{ type: 'severity_change' }],
      condition_operator: 'any',
    });
  });

  test('sends all params when both expiresAt and conditions are provided', async () => {
    await snoozeAlertInstance({
      http,
      id: 'rule-id',
      instanceId: 'instance-id',
      expiresAt: '2026-06-01T00:00:00.000Z',
      conditions: [{ type: 'severity_change' }],
      conditionOperator: 'all',
    });

    const [, opts3] = http.post.mock.calls[0] as unknown as [string, { body: string }];
    expect(JSON.parse(opts3.body)).toEqual({
      expires_at: '2026-06-01T00:00:00.000Z',
      conditions: [{ type: 'severity_change' }],
      condition_operator: 'all',
    });
  });
});
