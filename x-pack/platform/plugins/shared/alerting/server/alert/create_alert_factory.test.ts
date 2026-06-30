/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import sinon from 'sinon';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { Alert } from './alert';
import { createAlertFactory, getPublicAlertFactory } from './create_alert_factory';
import { processAlerts } from '../lib';

jest.mock('../lib', () => ({
  processAlerts: jest.fn(),
}));

let clock: sinon.SinonFakeTimers;
const logger = loggingSystemMock.create().get();

describe('createAlertFactory()', () => {
  beforeAll(() => {
    clock = sinon.useFakeTimers();
  });
  beforeEach(() => clock.reset());
  afterAll(() => clock.restore());

  test('creates new alerts for ones not passed in', () => {
    const alertFactory = createAlertFactory({
      alerts: {},
      logger,
      configuredMaxAlerts: 1000,
      autoRecoverAlerts: true,
    });
    const result = alertFactory.create('1');
    expect(result).toMatchObject({
      meta: {
        uuid: expect.any(String),
        flappingHistory: [],
      },
      state: {},
      context: {},
      id: '1',
    });
    // @ts-expect-error
    expect(result.getId()).toEqual('1');
  });

  test('reuses existing alerts', () => {
    const alert = new Alert('1', {
      state: { foo: true },
      meta: {
        lastScheduledActions: { group: 'default', date: new Date().toISOString() },
        uuid: 'uuid-previous',
      },
    });
    const alertFactory = createAlertFactory({
      alerts: {
        '1': alert,
      },
      logger,
      configuredMaxAlerts: 1000,
      autoRecoverAlerts: true,
    });
    const result = alertFactory.create('1');
    expect(result).toMatchObject({
      meta: {
        uuid: 'uuid-previous',
        flappingHistory: [],
        lastScheduledActions: {
          date: expect.any(String),
          group: 'default',
        },
      },
      state: { foo: true },
      context: {},
      id: '1',
    });
  });

  test('sets snooze config on newly created alert when snoozedInstancesMap contains a matching entry', () => {
    const snoozeConfig = {
      instanceId: '1',
      snoozedAt: '2024-01-01T00:00:00.000Z',
      snoozedBy: 'user',
    };
    const alertFactory = createAlertFactory({
      alerts: {},
      logger,
      configuredMaxAlerts: 1000,
      autoRecoverAlerts: true,
      snoozedInstancesMap: new Map([['1', snoozeConfig]]),
    });
    const setSnoozeConfigSpy = jest.spyOn(Alert.prototype, 'setSnoozeConfig');
    alertFactory.create('1');
    expect(setSnoozeConfigSpy).toHaveBeenCalledWith(snoozeConfig);
    setSnoozeConfigSpy.mockRestore();
  });

  test('does not set snooze config on existing alert when called via create()', () => {
    const existingAlert = new Alert('1');
    const setSnoozeConfigSpy = jest.spyOn(Alert.prototype, 'setSnoozeConfig');
    const alertFactory = createAlertFactory({
      alerts: { '1': existingAlert },
      logger,
      configuredMaxAlerts: 1000,
      autoRecoverAlerts: true,
      snoozedInstancesMap: new Map([
        ['1', { instanceId: '1', snoozedAt: '2024-01-01T00:00:00.000Z', snoozedBy: 'user' }],
      ]),
    });
    alertFactory.create('1');
    expect(setSnoozeConfigSpy).not.toHaveBeenCalled();
    setSnoozeConfigSpy.mockRestore();
  });

  test('mutates given alerts', () => {
    const alerts = {};
    const alertFactory = createAlertFactory({
      alerts,
      logger,
      configuredMaxAlerts: 1000,
      autoRecoverAlerts: true,
    });
    alertFactory.create('1');
    expect(alerts).toMatchObject({
      1: {
        meta: {
          uuid: expect.any(String),
          flappingHistory: [],
        },
        state: {},
        context: {},
        id: '1',
      },
    });
  });

  test('gets alert if it exists, returns null if it does not', () => {
    const alert = new Alert('1', {
      state: { foo: true },
      meta: {
        lastScheduledActions: { group: 'default', date: new Date().toISOString() },
        uuid: 'uuid-previous',
      },
    });
    const alertFactory = createAlertFactory({
      alerts: {
        '1': alert,
      },
      logger,
      configuredMaxAlerts: 1000,
      autoRecoverAlerts: true,
    });
    expect(alertFactory.get('1')).toMatchObject({
      meta: {
        uuid: expect.any(String),
        flappingHistory: [],
      },
      state: {},
      context: {},
      id: '1',
    });
    expect(alertFactory.get('2')).toBe(null);
    alertFactory.create('2');
    expect(alertFactory.get('2')).not.toBe(null);
    expect(alertFactory.get('2')).toMatchObject({
      meta: {
        uuid: expect.any(String),
        flappingHistory: [],
      },
      state: {},
      context: {},
      id: '2',
    });
  });

  test('throws error and sets flag when more alerts are created than allowed', () => {
    const alertFactory = createAlertFactory({
      alerts: {},
      logger,
      configuredMaxAlerts: 3,
      autoRecoverAlerts: true,
    });

    expect(alertFactory.hasReachedAlertLimit()).toBe(false);
    alertFactory.create('1');
    alertFactory.create('2');
    alertFactory.create('3');

    expect(() => {
      alertFactory.create('4');
    }).toThrowErrorMatchingInlineSnapshot(`"Rule reported more than 3 alerts."`);

    expect(alertFactory.hasReachedAlertLimit()).toBe(true);
  });

  test('logs a warning when more alerts are created than allowed and the configured alert limit is greater than the max allowed threshold', () => {
    const alertFactory = createAlertFactory({
      alerts: {},
      logger,
      configuredMaxAlerts: 50001,
      autoRecoverAlerts: true,
    });

    expect(alertFactory.hasReachedAlertLimit()).toBe(false);
    for (let i = 0; i < 5000; i++) {
      alertFactory.create(`${i}`);
    }

    expect(() => {
      alertFactory.create('50001');
    }).toThrowErrorMatchingInlineSnapshot(`"Rule reported more than 5000 alerts."`);
    expect(logger.warn).toHaveBeenCalledWith(
      'The configured maximum alert limit exceeds the allowed threshold. Only 5000 alerts are being returned. Please consider adjusting xpack.alerting.rules.run.alerts.max.'
    );
    expect(alertFactory.hasReachedAlertLimit()).toBe(true);
  });

  test('throws error when creating alerts after done() is called', () => {
    const alertFactory = createAlertFactory({
      alerts: {},
      logger,
      configuredMaxAlerts: 1000,
      autoRecoverAlerts: true,
    });
    const result = alertFactory.create('1');
    expect(result).toMatchObject({
      meta: {
        flappingHistory: [],
        uuid: expect.any(String),
      },
      state: {},
      context: {},
      scheduledExecutionOptions: undefined,
      id: '1',
    });

    alertFactory.done();

    expect(() => {
      alertFactory.create('2');
    }).toThrowErrorMatchingInlineSnapshot(
      `"Can't create new alerts after calling done() in AlertsFactory."`
    );
  });

  test('returns recovered alerts when setsRecoveryContext is true', () => {
    (processAlerts as jest.Mock).mockReturnValueOnce({
      recoveredAlerts: {
        z: {
          id: 'z',
          state: { foo: true },
          meta: { lastScheduledActions: { group: 'default', date: new Date() } },
        },
        y: {
          id: 'y',
          state: { foo: true },
          meta: { lastScheduledActions: { group: 'default', date: new Date() } },
        },
      },
    });
    const alertFactory = createAlertFactory({
      alerts: {},
      logger,
      canSetRecoveryContext: true,
      configuredMaxAlerts: 1000,
      autoRecoverAlerts: true,
    });
    const result = alertFactory.create('1');
    expect(result).toMatchObject({
      meta: {
        flappingHistory: [],
        uuid: expect.any(String),
      },
      state: {},
      context: {},
      scheduledExecutionOptions: undefined,
      id: '1',
    });

    const { getRecoveredAlerts: getRecoveredAlertsFn } = alertFactory.done();
    expect(getRecoveredAlertsFn).toBeDefined();
    const recoveredAlerts = getRecoveredAlertsFn!();
    expect(Array.isArray(recoveredAlerts)).toBe(true);
    expect(recoveredAlerts.length).toEqual(2);
  });

  test('returns empty array if no recovered alerts', () => {
    (processAlerts as jest.Mock).mockReturnValueOnce({ recoveredAlerts: {} });
    const alertFactory = createAlertFactory({
      alerts: {},
      logger,
      configuredMaxAlerts: 1000,
      canSetRecoveryContext: true,
      autoRecoverAlerts: true,
    });
    const result = alertFactory.create('1');
    expect(result).toMatchObject({
      meta: {
        flappingHistory: [],
        uuid: expect.any(String),
      },
      state: {},
      context: {},
      scheduledExecutionOptions: undefined,
      id: '1',
    });

    const { getRecoveredAlerts: getRecoveredAlertsFn } = alertFactory.done();
    const recoveredAlerts = getRecoveredAlertsFn!();
    expect(Array.isArray(recoveredAlerts)).toBe(true);
    expect(recoveredAlerts.length).toEqual(0);
  });

  test('returns empty array if recovered alerts are null', () => {
    (processAlerts as jest.Mock).mockReturnValueOnce({ recoveredAlerts: null });
    const alertFactory = createAlertFactory({
      alerts: {},
      logger,
      configuredMaxAlerts: 1000,
      canSetRecoveryContext: true,
      autoRecoverAlerts: true,
    });
    const result = alertFactory.create('1');
    expect(result).toMatchObject({
      meta: {
        flappingHistory: [],
        uuid: expect.any(String),
      },
      state: {},
      context: {},
      scheduledExecutionOptions: undefined,
      id: '1',
    });

    const { getRecoveredAlerts: getRecoveredAlertsFn } = alertFactory.done();
    const recoveredAlerts = getRecoveredAlertsFn!();
    expect(Array.isArray(recoveredAlerts)).toBe(true);
    expect(recoveredAlerts.length).toEqual(0);
  });

  test('returns empty array if recovered alerts exist but setsRecoveryContext is false', () => {
    const alertFactory = createAlertFactory({
      alerts: {},
      logger,
      configuredMaxAlerts: 1000,
      canSetRecoveryContext: false,
      autoRecoverAlerts: true,
    });
    const result = alertFactory.create('1');
    expect(result).toMatchObject({
      meta: {
        flappingHistory: [],
        uuid: expect.any(String),
      },
      state: {},
      context: {},
      scheduledExecutionOptions: undefined,
      id: '1',
    });

    const { getRecoveredAlerts: getRecoveredAlertsFn } = alertFactory.done();
    const recoveredAlerts = getRecoveredAlertsFn!();
    expect(Array.isArray(recoveredAlerts)).toBe(true);
    expect(recoveredAlerts.length).toEqual(0);
    expect(logger.debug).toHaveBeenCalledWith(
      `Set doesSetRecoveryContext to true on rule type to get access to recovered alerts.`
    );
  });

  test('throws error when checking limit usage if alertLimit.getValue is called but alertLimit.setLimitReached is not', () => {
    const alertFactory = createAlertFactory({
      alerts: {},
      logger,
      configuredMaxAlerts: 1000,
      autoRecoverAlerts: true,
    });

    const limit = alertFactory.alertLimit.getValue();
    expect(limit).toEqual(1000);

    expect(() => {
      alertFactory.alertLimit.checkLimitUsage();
    }).toThrowErrorMatchingInlineSnapshot(
      `"Rule has not reported whether alert limit has been reached after requesting limit value!"`
    );
  });

  test('does not throw error when checking limit usage if alertLimit.getValue is called and alertLimit.setLimitReached is called with reached = true', () => {
    const alertFactory = createAlertFactory({
      alerts: {},
      logger,
      configuredMaxAlerts: 1000,
      autoRecoverAlerts: true,
    });

    const limit = alertFactory.alertLimit.getValue();
    expect(limit).toEqual(1000);

    alertFactory.alertLimit.setLimitReached(true);
    alertFactory.alertLimit.checkLimitUsage();
  });

  test('does not throw error when checking limit usage if alertLimit.getValue is called and alertLimit.setLimitReached is called with reached = false', () => {
    const alertFactory = createAlertFactory({
      alerts: {},
      logger,
      configuredMaxAlerts: 1000,
      autoRecoverAlerts: true,
    });

    const limit = alertFactory.alertLimit.getValue();
    expect(limit).toEqual(1000);

    alertFactory.alertLimit.setLimitReached(false);
    alertFactory.alertLimit.checkLimitUsage();
  });

  test('returns empty array if recovered alerts exist but autoRecoverAlerts is false', () => {
    const alertFactory = createAlertFactory({
      alerts: {},
      logger,
      configuredMaxAlerts: 1000,
      canSetRecoveryContext: true,
      autoRecoverAlerts: false,
    });
    const result = alertFactory.create('1');
    expect(result).toEqual({
      meta: {
        flappingHistory: [],
        maintenanceWindowIds: [],
        maintenanceWindowNames: [],
        uuid: expect.any(String),
      },
      state: {},
      context: {},
      scheduledExecutionOptions: undefined,
      id: '1',
    });

    const { getRecoveredAlerts: getRecoveredAlertsFn } = alertFactory.done();
    const recoveredAlerts = getRecoveredAlertsFn!();
    expect(Array.isArray(recoveredAlerts)).toBe(true);
    expect(recoveredAlerts.length).toEqual(0);
    expect(logger.debug).toHaveBeenCalledWith(
      `Set autoRecoverAlerts to true on rule type to get access to recovered alerts.`
    );
  });
});

describe('getPublicAlertFactory', () => {
  test('only returns subset of function from given alert factory', () => {
    const alertFactory = createAlertFactory({
      alerts: {},
      logger,
      configuredMaxAlerts: 1000,
      autoRecoverAlerts: true,
    });

    expect(alertFactory.create).toBeDefined();
    expect(alertFactory.get).toBeDefined();
    expect(alertFactory.alertLimit.getValue).toBeDefined();
    expect(alertFactory.alertLimit.setLimitReached).toBeDefined();
    expect(alertFactory.alertLimit.checkLimitUsage).toBeDefined();
    expect(alertFactory.hasReachedAlertLimit).toBeDefined();
    expect(alertFactory.done).toBeDefined();

    const publicAlertFactory = getPublicAlertFactory(alertFactory);

    expect(publicAlertFactory.create).toBeDefined();
    expect(publicAlertFactory.done).toBeDefined();
    expect(publicAlertFactory.alertLimit.getValue).toBeDefined();
    expect(publicAlertFactory.alertLimit.setLimitReached).toBeDefined();

    // @ts-expect-error
    expect(publicAlertFactory.get).not.toBeDefined();
    // @ts-expect-error
    expect(publicAlertFactory.alertLimit.checkLimitUsage).not.toBeDefined();
    // @ts-expect-error
    expect(publicAlertFactory.hasReachedAlertLimit).not.toBeDefined();
  });
});
