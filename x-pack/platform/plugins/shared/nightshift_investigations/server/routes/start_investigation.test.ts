/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { startInvestigationRoute } from './start_investigation';

const { handler, params } = startInvestigationRoute['POST /internal/nightshift/investigations'];

const schema = params.shape.body;

const alert = {
  'kibana.alert.uuid': 'alert-1',
  'kibana.alert.rule.uuid': 'rule-1',
  'kibana.alert.rule.name': 'Test rule',
  'kibana.alert.rule.rule_type_id': 'test.rule',
  'kibana.alert.rule.category': 'Test category',
  'kibana.alert.reason': 'Threshold exceeded',
  'kibana.alert.status': 'active',
  'kibana.alert.start': '2026-09-02T10:00:00.000Z',
};

const start = jest.fn().mockResolvedValue({ investigation_id: 'investigation-1' });
const getInvestigationsClient = jest.fn().mockReturnValue({ start });
const getAlertsClient = jest.fn().mockResolvedValue({
  getAuthorizedAlertsIndices: jest.fn().mockResolvedValue(['.alerts-observability.test']),
  get: jest.fn().mockResolvedValue(alert),
});

beforeEach(() => jest.clearAllMocks());

it('loads the alert and builds the investigation context server-side', async () => {
  await expect(
    handler({
      request: {},
      getInvestigationsClient,
      getAlertsClient,
      params: { body: { subject: { type: 'alert', id: 'alert-1' } } },
    } as never)
  ).resolves.toEqual({ investigation_id: 'investigation-1' });
  expect(start).toHaveBeenCalledWith({
    subject: { type: 'alert', id: 'alert-1' },
    concurrency_key: 'alert-1',
    context: { alerts: [expect.objectContaining({ id: 'alert-1', rule_id: 'rule-1' })] },
    trigger_type: 'manual',
  });
});

it('keeps a caller-provided concurrency key', async () => {
  await handler({
    request: {},
    getInvestigationsClient,
    getAlertsClient,
    params: { body: { subject: { type: 'alert', id: 'alert-1' }, concurrency_key: 'key-1' } },
  } as never);
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ concurrency_key: 'key-1' }));
});

it('forwards a caller-provided message as the investigation prompt', async () => {
  await handler({
    request: {},
    getInvestigationsClient,
    getAlertsClient,
    params: {
      body: {
        subject: { type: 'significant_event', id: 'event-1' },
        message: 'Why did checkout p99 spike?',
      },
    },
  } as never);
  expect(start).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Why did checkout p99 spike?' })
  );
});

it('starts a manual investigation from the question alone', async () => {
  const body = schema.parse({
    subject: { type: 'manual' },
    message: 'Why did checkout p99 spike?',
  });

  await handler({
    request: {},
    getInvestigationsClient,
    getAlertsClient,
    params: { body },
  } as never);

  expect(start).toHaveBeenCalledWith(
    expect.objectContaining({
      subject: { type: 'manual', id: 'manual' },
      message: 'Why did checkout p99 spike?',
      trigger_type: 'manual',
    })
  );
});

it('rejects a manual investigation without a question', () => {
  expect(schema.safeParse({ subject: { type: 'manual' } }).success).toBe(false);
});

it('returns service unavailable when alert lookup is not wired', async () => {
  await expect(
    handler({
      request: {},
      getInvestigationsClient,
      getAlertsClient: () => undefined,
      params: { body: { subject: { type: 'alert', id: 'alert-1' } } },
    } as never)
  ).rejects.toMatchObject({ output: { statusCode: 503 } });
});
