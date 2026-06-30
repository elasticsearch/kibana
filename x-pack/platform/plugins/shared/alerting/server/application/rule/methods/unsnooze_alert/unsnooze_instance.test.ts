/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsRepositoryMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { RulesClientContext } from '../../../../rules_client';
import { unsnoozeAlertInstance } from './unsnooze_instance';
import { AlertAuditAction } from '../../../../lib/alert_audit_events';
import { RULE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';

describe('unsnooze alert instance', () => {
  const savedObjectsMock = savedObjectsRepositoryMock.create();
  const auditLoggerMock = { log: jest.fn() };
  const authorizationMock = { ensureAuthorized: jest.fn() };
  const actionsAuthorizationMock = { ensureAuthorized: jest.fn() };
  const ruleTypeRegistryMock = { ensureRuleTypeEnabled: jest.fn() };

  afterEach(() => {
    jest.resetAllMocks();
  });

  const context = {
    logger: { error: jest.fn() },
    unsecuredSavedObjectsClient: savedObjectsMock,
    authorization: authorizationMock,
    actionsAuthorization: actionsAuthorizationMock,
    auditLogger: auditLoggerMock,
    ruleTypeRegistry: ruleTypeRegistryMock,
    getUserName: async () => 'elastic',
  } as unknown as RulesClientContext;

  it('removes only the targeted per-alert snooze entry', async () => {
    savedObjectsMock.get.mockResolvedValueOnce({
      id: '1',
      type: 'test-rule-type',
      attributes: {
        name: 'test rule',
        alertTypeId: '123',
        consumer: 'alerts',
        schedule: { interval: '10s' },
        params: { bar: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        actions: [],
        notifyWhen: 'onActiveAlert',
        mutedInstanceIds: ['still-muted'],
        snoozedInstances: [
          {
            instanceId: 'instance1',
            snoozedAt: '2026-04-14T10:00:00.000Z',
            snoozedBy: 'elastic',
          },
          {
            instanceId: 'instance2',
            snoozedAt: '2026-04-14T11:00:00.000Z',
            snoozedBy: 'elastic',
          },
        ],
      },
      references: [],
      version: 'v1',
    });

    await unsnoozeAlertInstance(context, { alertId: '1', alertInstanceId: 'instance1' });

    expect(savedObjectsMock.update).toHaveBeenCalledWith(
      'alert',
      '1',
      {
        snoozedInstances: [
          {
            instanceId: 'instance2',
            snoozedAt: '2026-04-14T11:00:00.000Z',
            snoozedBy: 'elastic',
          },
        ],
        updatedBy: 'elastic',
        updatedAt: expect.any(String),
      },
      { version: 'v1' }
    );
  });

  it('does not update the rule when no matching snooze entry exists', async () => {
    savedObjectsMock.get.mockResolvedValueOnce({
      id: '1',
      type: 'test-rule-type',
      attributes: {
        name: 'test rule',
        alertTypeId: '123',
        consumer: 'alerts',
        schedule: { interval: '10s' },
        params: { bar: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        actions: [],
        notifyWhen: 'onActiveAlert',
        snoozedInstances: [
          {
            instanceId: 'instance2',
            snoozedAt: '2026-04-14T11:00:00.000Z',
            snoozedBy: 'elastic',
          },
        ],
      },
      references: [],
    });

    await unsnoozeAlertInstance(context, { alertId: '1', alertInstanceId: 'missing-instance' });

    expect(savedObjectsMock.update).not.toHaveBeenCalled();
  });

  it('does not check actionsAuthorization.execute even when the rule has actions', async () => {
    savedObjectsMock.get.mockResolvedValueOnce({
      id: '1',
      type: 'test-rule-type',
      attributes: {
        name: 'connector rule',
        alertTypeId: '123',
        consumer: 'alerts',
        schedule: { interval: '10s' },
        params: { bar: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        actions: [
          {
            group: 'default',
            actionRef: 'action_0',
            params: { foo: true },
          },
        ],
        notifyWhen: 'onActiveAlert',
        snoozedInstances: [
          {
            instanceId: 'instance1',
            snoozedAt: '2026-04-14T10:00:00.000Z',
            snoozedBy: 'elastic',
          },
        ],
      },
      references: [{ name: 'action_0', type: 'action', id: '1' }],
      version: 'v1',
    });

    await unsnoozeAlertInstance(context, { alertId: '1', alertInstanceId: 'instance1' });

    expect(actionsAuthorizationMock.ensureAuthorized).not.toHaveBeenCalled();
    expect(savedObjectsMock.update).toHaveBeenCalled();
  });

  it('logs an alert_unsnooze audit event before the SO update', async () => {
    savedObjectsMock.get.mockResolvedValueOnce({
      id: '1',
      type: 'test-rule-type',
      attributes: {
        name: 'test rule',
        alertTypeId: '123',
        consumer: 'alerts',
        schedule: { interval: '10s' },
        params: { bar: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        actions: [],
        notifyWhen: 'onActiveAlert',
        snoozedInstances: [
          {
            instanceId: 'instance1',
            snoozedAt: '2026-04-14T10:00:00.000Z',
            snoozedBy: 'elastic',
          },
        ],
      },
      references: [],
      version: 'v1',
    });

    await unsnoozeAlertInstance(context, { alertId: '1', alertInstanceId: 'instance1' });

    expect(auditLoggerMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          action: AlertAuditAction.UNSNOOZE,
          outcome: 'unknown',
        }),
        kibana: expect.objectContaining({
          saved_object: { type: RULE_SAVED_OBJECT_TYPE, id: '1', name: 'test rule' },
        }),
        message: 'User is unsnoozing alert [id=instance1] of rule [id=1] and [name=test rule]',
      })
    );
  });

  it('throws 400 for Security Solution (Detection Engine) rule types', async () => {
    savedObjectsMock.get.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        alertTypeId: 'siem.queryRule',
        consumer: 'siem',
        schedule: { interval: '1m' },
        params: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        actions: [],
        notifyWhen: 'onActiveAlert',
        snoozedInstances: [],
      },
      references: [],
      version: 'v1',
    });

    await expect(() =>
      unsnoozeAlertInstance(context, { alertId: '1', alertInstanceId: 'instance1' })
    ).rejects.toThrow('Per-alert unsnooze is not supported for rule type "siem.queryRule"');

    expect(savedObjectsMock.update).not.toHaveBeenCalled();
  });

  it('throws 400 for rules with consumer siem even if rule type is not in ruleTypeMappings', async () => {
    savedObjectsMock.get.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        alertTypeId: 'siem.unknownFutureRule',
        consumer: 'siem',
        schedule: { interval: '1m' },
        params: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        actions: [],
        notifyWhen: 'onActiveAlert',
        snoozedInstances: [],
      },
      references: [],
      version: 'v1',
    });

    await expect(() =>
      unsnoozeAlertInstance(context, { alertId: '1', alertInstanceId: 'instance1' })
    ).rejects.toThrow('Per-alert unsnooze is not supported for rule type "siem.unknownFutureRule"');

    expect(savedObjectsMock.update).not.toHaveBeenCalled();
  });

  it('logs an alert_unsnooze failure audit event when authorization fails', async () => {
    savedObjectsMock.get.mockResolvedValueOnce({
      id: '1',
      type: 'test-rule-type',
      attributes: {
        name: 'test rule',
        alertTypeId: '123',
        consumer: 'alerts',
        schedule: { interval: '10s' },
        params: { bar: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        actions: [],
        notifyWhen: 'onActiveAlert',
        snoozedInstances: [],
      },
      references: [],
      version: 'v1',
    });

    const authError = new Error('Unauthorized');
    authorizationMock.ensureAuthorized.mockRejectedValueOnce(authError);

    await expect(() =>
      unsnoozeAlertInstance(context, { alertId: '1', alertInstanceId: 'instance1' })
    ).rejects.toThrow('Unauthorized');

    expect(auditLoggerMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          action: AlertAuditAction.UNSNOOZE,
          outcome: 'failure',
        }),
        kibana: expect.objectContaining({
          saved_object: { type: RULE_SAVED_OBJECT_TYPE, id: '1', name: 'test rule' },
        }),
      })
    );
  });
});
