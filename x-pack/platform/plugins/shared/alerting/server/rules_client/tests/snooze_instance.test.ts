/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConstructorOptions } from '../rules_client';
import { RulesClient } from '../rules_client';
import {
  savedObjectsClientMock,
  loggingSystemMock,
  savedObjectsRepositoryMock,
  uiSettingsServiceMock,
  coreFeatureFlagsMock,
} from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { ruleTypeRegistryMock } from '../../rule_type_registry.mock';
import { alertingAuthorizationMock } from '../../authorization/alerting_authorization.mock';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { actionsAuthorizationMock } from '@kbn/actions-plugin/server/mocks';
import type { AlertingAuthorization } from '../../authorization/alerting_authorization';
import type { ActionsAuthorization } from '@kbn/actions-plugin/server';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';
import { getBeforeSetup, setGlobalDate } from './lib';
import { ConnectorAdapterRegistry } from '../../connector_adapters/connector_adapter_registry';
import { RULE_SAVED_OBJECT_TYPE } from '../../saved_objects';
import { backfillClientMock } from '../../backfill_client/backfill_client.mock';
import type { AlertsService } from '../../alerts_service';

const taskManager = taskManagerMock.createStart();
const ruleTypeRegistry = ruleTypeRegistryMock.create();
const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
const encryptedSavedObjects = encryptedSavedObjectsMock.createClient();
const authorization = alertingAuthorizationMock.create();
const actionsAuthorization = actionsAuthorizationMock.create();
const auditLogger = auditLoggerMock.create();
const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();

const kibanaVersion = 'v7.10.0';
const alertsService = {
  isInitialized: jest.fn(),
  createAlertsClient: jest.fn(),
  muteAlertInstance: jest.fn(),
  unmuteAlertInstance: jest.fn(),
  getAlertSnoozeSnapshot: jest.fn(),
  muteAllAlerts: jest.fn(),
  unmuteAllAlerts: jest.fn(),
  getContextInitializationPromise: jest.fn(),
  register: jest.fn(),
  isExistingAlert: jest.fn(),
  setAlertsToUntracked: jest.fn(),
  clearAlertFlappingHistory: jest.fn(),
} as unknown as jest.Mocked<AlertsService>;

const rulesClientParams: jest.Mocked<ConstructorOptions> = {
  taskManager,
  ruleTypeRegistry,
  unsecuredSavedObjectsClient,
  authorization: authorization as unknown as AlertingAuthorization,
  actionsAuthorization: actionsAuthorization as unknown as ActionsAuthorization,
  spaceId: 'default',
  namespace: 'default',
  maxScheduledPerMinute: 10000,
  minimumScheduleInterval: { value: '1m', enforce: false },
  getUserName: jest.fn(),
  createAPIKey: jest.fn(),
  cloneAPIKey: jest.fn(),
  logger: loggingSystemMock.create().get(),
  internalSavedObjectsRepository,
  encryptedSavedObjectsClient: encryptedSavedObjects,
  getActionsClient: jest.fn(),
  getEventLogClient: jest.fn(),
  kibanaVersion,
  isAuthenticationTypeAPIKey: jest.fn(),
  getAuthenticationAPIKey: jest.fn(),
  connectorAdapterRegistry: new ConnectorAdapterRegistry(),
  getAlertIndicesAlias: jest.fn().mockReturnValue(['.alerts-default']),
  alertsService,
  backfillClient: backfillClientMock.create(),
  uiSettings: uiSettingsServiceMock.createStartContract(),
  isSystemAction: jest.fn(),
  featureFlags: coreFeatureFlagsMock.createStart(),
  isServerless: false,
};

beforeEach(() => {
  getBeforeSetup(rulesClientParams, taskManager, ruleTypeRegistry);
  (auditLogger.log as jest.Mock).mockClear();
  alertsService.getAlertSnoozeSnapshot.mockClear();
  alertsService.getAlertSnoozeSnapshot.mockResolvedValue({ 'host.name': 'web-01' });
  (rulesClientParams.getAlertIndicesAlias as jest.Mock).mockReturnValue(['.alerts-default']);
});

setGlobalDate();

describe('snoozeAlertInstance()', () => {
  test('writes a conditional snooze entry', async () => {
    const rulesClient = new RulesClient(rulesClientParams);
    unsecuredSavedObjectsClient.get.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        actions: [],
        schedule: { interval: '10s' },
        alertTypeId: '2',
        enabled: true,
        scheduledTaskId: 'task-123',
        mutedInstanceIds: ['still-muted'],
        snoozedInstances: [
          {
            instanceId: 'existing-snooze',
            snoozedAt: '2026-04-14T10:00:00.000Z',
            snoozedBy: 'elastic',
          },
        ],
      },
      version: '123',
      references: [],
    });

    await rulesClient.snoozeAlertInstance({
      params: { alertId: '1', alertInstanceId: '2' },
      query: { validateAlertsExistence: false },
      body: {
        expiresAt: '2099-12-31T23:59:59.000Z',
        conditions: [{ type: 'field_change', field: 'host.name' }],
        conditionOperator: 'all',
      },
    });

    expect(alertsService.getAlertSnoozeSnapshot).toHaveBeenCalledWith({
      indices: ['.alerts-default'],
      alertId: '2',
      ruleId: '1',
      fields: ['host.name'],
    });
    expect(unsecuredSavedObjectsClient.update).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        snoozedInstances: [
          {
            instanceId: 'existing-snooze',
            snoozedAt: '2026-04-14T10:00:00.000Z',
            snoozedBy: 'elastic',
          },
          {
            instanceId: '2',
            expiresAt: '2099-12-31T23:59:59.000Z',
            conditions: [{ type: 'field_change', field: 'host.name' }],
            conditionOperator: 'all',
            snoozeSnapshot: { 'host.name': 'web-01' },
            snoozedAt: '2019-02-12T21:01:22.479Z',
            snoozedBy: 'elastic',
          },
        ],
        updatedAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
      },
      { version: '123' }
    );
  });

  test('writes a time-only snooze entry when no conditions provided', async () => {
    const rulesClient = new RulesClient(rulesClientParams);
    unsecuredSavedObjectsClient.get.mockResolvedValueOnce({
      id: '1',
      type: RULE_SAVED_OBJECT_TYPE,
      attributes: {
        actions: [],
        schedule: { interval: '10s' },
        alertTypeId: '2',
        enabled: true,
        scheduledTaskId: 'task-123',
        mutedInstanceIds: [],
        snoozedInstances: [],
      },
      version: '123',
      references: [],
    });

    await rulesClient.snoozeAlertInstance({
      params: { alertId: '1', alertInstanceId: '2' },
      query: { validateAlertsExistence: false },
      body: {
        expiresAt: '2099-12-31T23:59:59.000Z',
      },
    });

    expect(alertsService.getAlertSnoozeSnapshot).not.toHaveBeenCalled();
    expect(unsecuredSavedObjectsClient.update).toHaveBeenCalledWith(
      RULE_SAVED_OBJECT_TYPE,
      '1',
      {
        snoozedInstances: [
          {
            instanceId: '2',
            expiresAt: '2099-12-31T23:59:59.000Z',
            conditions: undefined,
            conditionOperator: undefined,
            snoozeSnapshot: undefined,
            snoozedAt: '2019-02-12T21:01:22.479Z',
            snoozedBy: 'elastic',
          },
        ],
        updatedAt: '2019-02-12T21:01:22.479Z',
        updatedBy: 'elastic',
      },
      { version: '123' }
    );
  });

  describe('authorization', () => {
    beforeEach(() => {
      unsecuredSavedObjectsClient.get.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          actions: [
            {
              group: 'default',
              id: '1',
              actionTypeId: '1',
              actionRef: '1',
              params: { foo: true },
            },
          ],
          schedule: { interval: '10s' },
          alertTypeId: 'myType',
          consumer: 'myApp',
          enabled: true,
          scheduledTaskId: 'task-123',
          mutedInstanceIds: [],
          snoozedInstances: [],
        },
        version: '123',
        references: [],
      });
    });

    test('ensures user is authorised to snoozeAlert this type of alert under the consumer', async () => {
      const rulesClient = new RulesClient(rulesClientParams);
      await rulesClient.snoozeAlertInstance({
        params: { alertId: '1', alertInstanceId: '2' },
        query: { validateAlertsExistence: false },
        body: { expiresAt: '2099-12-31T23:59:59.000Z' },
      });

      expect(actionsAuthorization.ensureAuthorized).not.toHaveBeenCalled();
      expect(authorization.ensureAuthorized).toHaveBeenCalledWith({
        entity: 'rule',
        consumer: 'myApp',
        operation: 'snoozeAlert',
        ruleTypeId: 'myType',
      });
    });

    test('throws when user is not authorised to snoozeAlert this type of alert', async () => {
      const rulesClient = new RulesClient(rulesClientParams);
      authorization.ensureAuthorized.mockRejectedValue(
        new Error(`Unauthorized to snoozeAlert a "myType" alert for "myApp"`)
      );

      await expect(
        rulesClient.snoozeAlertInstance({
          params: { alertId: '1', alertInstanceId: '2' },
          query: { validateAlertsExistence: false },
          body: { expiresAt: '2099-12-31T23:59:59.000Z' },
        })
      ).rejects.toMatchInlineSnapshot(
        `[Error: Unauthorized to snoozeAlert a "myType" alert for "myApp"]`
      );

      expect(authorization.ensureAuthorized).toHaveBeenCalledWith({
        entity: 'rule',
        consumer: 'myApp',
        operation: 'snoozeAlert',
        ruleTypeId: 'myType',
      });
    });
  });

  describe('auditLogger', () => {
    test('logs audit event when snoozeing an alert', async () => {
      const rulesClient = new RulesClient({ ...rulesClientParams, auditLogger });
      unsecuredSavedObjectsClient.get.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          actions: [],
          schedule: { interval: '10s' },
          alertTypeId: '2',
          enabled: true,
          scheduledTaskId: 'task-123',
          mutedInstanceIds: [],
          snoozedInstances: [],
        },
        version: '123',
        references: [],
      });

      await rulesClient.snoozeAlertInstance({
        params: { alertId: '1', alertInstanceId: '2' },
        query: { validateAlertsExistence: false },
        body: { expiresAt: '2099-12-31T23:59:59.000Z' },
      });

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'alert_snooze',
            outcome: 'unknown',
          }),
          kibana: { saved_object: { id: '1', type: RULE_SAVED_OBJECT_TYPE } },
        })
      );
    });

    test('logs audit event when not authorised to snooze an alert', async () => {
      const rulesClient = new RulesClient({ ...rulesClientParams, auditLogger });
      unsecuredSavedObjectsClient.get.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          actions: [],
          schedule: { interval: '10s' },
          alertTypeId: '2',
          enabled: true,
          scheduledTaskId: 'task-123',
          mutedInstanceIds: [],
          snoozedInstances: [],
        },
        version: '123',
        references: [],
      });
      authorization.ensureAuthorized.mockRejectedValue(new Error('Unauthorized'));

      await expect(
        rulesClient.snoozeAlertInstance({
          params: { alertId: '1', alertInstanceId: '2' },
          query: { validateAlertsExistence: false },
          body: { expiresAt: '2099-12-31T23:59:59.000Z' },
        })
      ).rejects.toThrow();

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'alert_snooze',
            outcome: 'failure',
          }),
          kibana: { saved_object: { id: '1', type: RULE_SAVED_OBJECT_TYPE } },
          error: {
            code: 'Error',
            message: 'Unauthorized',
          },
        })
      );
    });
  });

  describe('elasticsearch operations', () => {
    test('does not call getAlertSnoozeSnapshot when no alert indices exist', async () => {
      (rulesClientParams.getAlertIndicesAlias as jest.Mock).mockReturnValue([]);
      const rulesClient = new RulesClient(rulesClientParams);
      unsecuredSavedObjectsClient.get.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          actions: [],
          schedule: { interval: '10s' },
          alertTypeId: '2',
          enabled: true,
          scheduledTaskId: 'task-123',
          mutedInstanceIds: [],
          snoozedInstances: [],
        },
        version: '123',
        references: [],
      });

      await rulesClient.snoozeAlertInstance({
        params: { alertId: '1', alertInstanceId: '2' },
        query: { validateAlertsExistence: false },
        body: {
          expiresAt: '2099-12-31T23:59:59.000Z',
          conditions: [{ type: 'field_change', field: 'host.name' }],
          conditionOperator: 'any',
        },
      });

      expect(alertsService.getAlertSnoozeSnapshot).not.toHaveBeenCalled();
      expect(unsecuredSavedObjectsClient.update).toHaveBeenCalled();
    });

    test('throws error and does not update rule when getAlertSnoozeSnapshot fails', async () => {
      const rulesClient = new RulesClient(rulesClientParams);
      alertsService.getAlertSnoozeSnapshot.mockRejectedValueOnce(new Error('ES connection failed'));
      unsecuredSavedObjectsClient.get.mockResolvedValueOnce({
        id: '1',
        type: RULE_SAVED_OBJECT_TYPE,
        attributes: {
          actions: [],
          schedule: { interval: '10s' },
          alertTypeId: '2',
          enabled: true,
          scheduledTaskId: 'task-123',
          mutedInstanceIds: [],
          snoozedInstances: [],
        },
        version: '123',
        references: [],
      });

      await expect(
        rulesClient.snoozeAlertInstance({
          params: { alertId: '1', alertInstanceId: '2' },
          query: { validateAlertsExistence: false },
          body: {
            expiresAt: '2099-12-31T23:59:59.000Z',
            conditions: [{ type: 'field_change', field: 'host.name' }],
            conditionOperator: 'any',
          },
        })
      ).rejects.toThrow('ES connection failed');

      expect(unsecuredSavedObjectsClient.update).not.toHaveBeenCalled();
    });
  });
});
