/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import {
  mockTaskInstance,
  ruleType,
  RULE_ID,
  RULE_NAME,
  RULE_TYPE_ID,
} from '../../task_runner/fixtures';
import * as LegacyAlertsClientModule from '../legacy_alerts_client';
import { alertsServiceMock } from '../../alerts_service/alerts_service.mock';
import { ruleRunMetricsStoreMock } from '../../lib/rule_run_metrics_store.mock';
import { alertingEventLoggerMock } from '../../lib/alerting_event_logger/alerting_event_logger.mock';
import { DEFAULT_FLAPPING_SETTINGS } from '../../types';
import { alertsClientMock } from '../alerts_client.mock';
import type { UntypedNormalizedRuleType } from '../../rule_type_registry';
import { legacyAlertsClientMock } from '../legacy_alerts_client.mock';
import type { RuleData } from './initialize_alerts_client';
import { initializeAlertsClient } from './initialize_alerts_client';
import { maintenanceWindowsServiceMock } from '../../task_runner/maintenance_windows/maintenance_windows_service.mock';
import type { KibanaRequest } from '@kbn/core/server';

const alertingEventLogger = alertingEventLoggerMock.create();
const ruleRunMetricsStore = ruleRunMetricsStoreMock.create();
const alertsService = alertsServiceMock.create();
const alertsClient = alertsClientMock.create();
const legacyAlertsClient = legacyAlertsClientMock.create();
const logger = loggingSystemMock.create().get();
const maintenanceWindowsService = maintenanceWindowsServiceMock.create();

const fakeRequest = {
  headers: {},
  getBasePath: () => '',
  path: '/',
  route: { settings: {} },
  url: {
    href: '/',
  },
  raw: {
    req: {
      url: '/',
    },
  },
  getSavedObjectsClient: jest.fn(),
} as unknown as KibanaRequest;

const ruleTypeWithAlerts: jest.Mocked<UntypedNormalizedRuleType> = {
  ...ruleType,
  alerts: {
    context: 'test',
    mappings: {
      fieldMap: {
        textField: {
          type: 'keyword',
          required: false,
        },
        numericField: {
          type: 'long',
          required: false,
        },
      },
    },
    shouldWrite: true,
  },
};

const mockedRule: RuleData<Record<string, unknown>> = {
  muteAll: false,
  mutedInstanceIds: [],
  id: '1',
  name: 'rule-name',
  tags: ['rule-', '-tags'],
  consumer: 'bar',
  revision: 0,
  params: {
    bar: true,
  },
};

const mockedTaskInstance = mockTaskInstance();

describe('initializeAlertsClient', () => {
  test('should initialize and return alertsClient if createAlertsClient succeeds', async () => {
    const startedAt = new Date(Date.now() + 5 * 60 * 1000);
    const spy1 = jest
      .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
      .mockImplementation(() => legacyAlertsClient);
    alertsService.createAlertsClient.mockImplementationOnce(() => alertsClient);
    await initializeAlertsClient({
      alertsService,
      context: {
        alertingEventLogger,
        flappingSettings: DEFAULT_FLAPPING_SETTINGS,
        maintenanceWindowsService,
        logger,
        request: fakeRequest,
        ruleId: RULE_ID,
        ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
        ruleRunMetricsStore,
        spaceId: 'default',
        isServerless: false,
      },
      executionId: 'abc',
      logger,
      maxAlerts: 100,
      rule: mockedRule,
      ruleType: ruleTypeWithAlerts,
      startedAt,
      taskInstance: mockedTaskInstance,
    });

    expect(alertsService.createAlertsClient).toHaveBeenCalledWith({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      ruleType: ruleTypeWithAlerts,
      maintenanceWindowsService,
      namespace: 'default',
      spaceId: 'default',
      rule: {
        alertDelay: 0,
        consumer: 'bar',
        executionId: 'abc',
        id: '1',
        muteAll: false,
        mutedInstanceIds: [],
        snoozedInstances: undefined,
        name: 'rule-name',
        parameters: {
          bar: true,
        },
        revision: 0,
        spaceId: 'default',
        tags: ['rule-', '-tags'],
      },
    });
    expect(LegacyAlertsClientModule.LegacyAlertsClient).not.toHaveBeenCalled();
    expect(alertsClient.initializeExecution).toHaveBeenCalledWith({
      activeAlertsFromState: {},
      flappingSettings: DEFAULT_FLAPPING_SETTINGS,
      maxAlerts: 100,
      recoveredAlertsFromState: {},
      ruleLabel: `test:1: 'rule-name'`,
      startedAt,
    });
    spy1.mockRestore();
  });

  test('should use DEFAULT_FLAPPING_SETTINGS if flappingSettings not defined', async () => {
    const spy1 = jest
      .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
      .mockImplementation(() => legacyAlertsClient);
    alertsService.createAlertsClient.mockImplementationOnce(() => alertsClient);
    await initializeAlertsClient({
      alertsService,
      context: {
        alertingEventLogger,
        logger,
        maintenanceWindowsService,
        request: fakeRequest,
        ruleId: RULE_ID,
        ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
        ruleRunMetricsStore,
        spaceId: 'default',
        isServerless: false,
      },
      executionId: 'abc',
      logger,
      maxAlerts: 100,
      rule: mockedRule,
      ruleType: ruleTypeWithAlerts,
      startedAt: mockedTaskInstance.startedAt,
      taskInstance: mockedTaskInstance,
    });

    expect(alertsService.createAlertsClient).toHaveBeenCalledWith({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      ruleType: ruleTypeWithAlerts,
      maintenanceWindowsService,
      namespace: 'default',
      spaceId: 'default',
      rule: {
        alertDelay: 0,
        consumer: 'bar',
        executionId: 'abc',
        id: '1',
        muteAll: false,
        mutedInstanceIds: [],
        snoozedInstances: undefined,
        name: 'rule-name',
        parameters: {
          bar: true,
        },
        revision: 0,
        spaceId: 'default',
        tags: ['rule-', '-tags'],
      },
    });
    expect(LegacyAlertsClientModule.LegacyAlertsClient).not.toHaveBeenCalled();
    expect(alertsClient.initializeExecution).toHaveBeenCalledWith({
      activeAlertsFromState: {},
      flappingSettings: DEFAULT_FLAPPING_SETTINGS,
      maxAlerts: 100,
      recoveredAlertsFromState: {},
      ruleLabel: `test:1: 'rule-name'`,
      startedAt: expect.any(Date),
    });
    spy1.mockRestore();
  });

  test('should use LegacyAlertsClient if createAlertsClient returns null', async () => {
    const spy1 = jest
      .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
      .mockImplementation(() => legacyAlertsClient);
    alertsService.createAlertsClient.mockImplementationOnce(() => null);
    await initializeAlertsClient({
      alertsService,
      context: {
        alertingEventLogger,
        flappingSettings: DEFAULT_FLAPPING_SETTINGS,
        maintenanceWindowsService,
        logger,
        request: fakeRequest,
        ruleId: RULE_ID,
        ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
        ruleRunMetricsStore,
        spaceId: 'default',
        isServerless: false,
      },
      executionId: 'abc',
      logger,
      maxAlerts: 100,
      rule: mockedRule,
      ruleType: ruleTypeWithAlerts,
      startedAt: mockedTaskInstance.startedAt,
      taskInstance: mockedTaskInstance,
    });

    expect(alertsService.createAlertsClient).toHaveBeenCalledWith({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      ruleType: ruleTypeWithAlerts,
      maintenanceWindowsService,
      namespace: 'default',
      spaceId: 'default',
      rule: {
        alertDelay: 0,
        consumer: 'bar',
        executionId: 'abc',
        id: '1',
        muteAll: false,
        mutedInstanceIds: [],
        snoozedInstances: undefined,
        name: 'rule-name',
        parameters: {
          bar: true,
        },
        revision: 0,
        spaceId: 'default',
        tags: ['rule-', '-tags'],
      },
    });
    expect(LegacyAlertsClientModule.LegacyAlertsClient).toHaveBeenCalledWith({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      ruleType: ruleTypeWithAlerts,
      spaceId: 'default',
      maintenanceWindowsService,
    });
    expect(legacyAlertsClient.initializeExecution).toHaveBeenCalledWith({
      activeAlertsFromState: {},
      flappingSettings: DEFAULT_FLAPPING_SETTINGS,
      maxAlerts: 100,
      recoveredAlertsFromState: {},
      ruleLabel: `test:1: 'rule-name'`,
      startedAt: expect.any(Date),
    });
    spy1.mockRestore();
  });

  test('should use LegacyAlertsClient if createAlertsClient throws error', async () => {
    const spy1 = jest
      .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
      .mockImplementation(() => legacyAlertsClient);
    alertsService.createAlertsClient.mockImplementationOnce(() => {
      throw new Error('fail fail');
    });
    await initializeAlertsClient({
      alertsService,
      context: {
        alertingEventLogger,
        flappingSettings: DEFAULT_FLAPPING_SETTINGS,
        logger,
        maintenanceWindowsService,
        request: fakeRequest,
        ruleId: RULE_ID,
        ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
        ruleRunMetricsStore,
        spaceId: 'default',
        isServerless: false,
      },
      executionId: 'abc',
      logger,
      maxAlerts: 100,
      rule: mockedRule,
      ruleType: ruleTypeWithAlerts,
      startedAt: mockedTaskInstance.startedAt,
      taskInstance: mockedTaskInstance,
    });

    expect(alertsService.createAlertsClient).toHaveBeenCalledWith({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      ruleType: ruleTypeWithAlerts,
      maintenanceWindowsService,
      namespace: 'default',
      spaceId: 'default',
      rule: {
        alertDelay: 0,
        consumer: 'bar',
        executionId: 'abc',
        id: '1',
        name: 'rule-name',
        muteAll: false,
        mutedInstanceIds: [],
        snoozedInstances: undefined,
        parameters: {
          bar: true,
        },
        revision: 0,
        spaceId: 'default',
        tags: ['rule-', '-tags'],
      },
    });
    expect(LegacyAlertsClientModule.LegacyAlertsClient).toHaveBeenCalledWith({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      ruleType: ruleTypeWithAlerts,
      spaceId: 'default',
      maintenanceWindowsService,
    });
    expect(logger.error).toHaveBeenCalledWith(
      `Error initializing AlertsClient for context test. Using legacy alerts client instead. - fail fail`
    );
    expect(legacyAlertsClient.initializeExecution).toHaveBeenCalledWith({
      activeAlertsFromState: {},
      flappingSettings: DEFAULT_FLAPPING_SETTINGS,
      maxAlerts: 100,
      recoveredAlertsFromState: {},
      ruleLabel: `test:1: 'rule-name'`,
      startedAt: expect.any(Date),
    });
    spy1.mockRestore();
  });

  test('should pass snoozedInstances to createAlertsClient when provided', async () => {
    const startedAt = new Date(Date.now() + 5 * 60 * 1000);
    const snoozedInstances = [
      { instanceId: 'alert-1', snoozedAt: '2026-01-01T00:00:00.000Z', snoozedBy: 'user1' },
      {
        instanceId: 'alert-2',
        snoozedAt: '2026-01-01T00:00:00.000Z',
        snoozedBy: 'user1',
        expiresAt: '2026-12-31T00:00:00.000Z',
      },
    ];
    const spy1 = jest
      .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
      .mockImplementation(() => legacyAlertsClient);
    alertsService.createAlertsClient.mockImplementationOnce(() => alertsClient);
    await initializeAlertsClient({
      alertsService,
      context: {
        alertingEventLogger,
        flappingSettings: DEFAULT_FLAPPING_SETTINGS,
        maintenanceWindowsService,
        logger,
        request: fakeRequest,
        ruleId: RULE_ID,
        ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
        ruleRunMetricsStore,
        spaceId: 'default',
        isServerless: false,
      },
      executionId: 'abc',
      logger,
      maxAlerts: 100,
      rule: { ...mockedRule, snoozedInstances },
      ruleType: ruleTypeWithAlerts,
      startedAt,
      taskInstance: mockedTaskInstance,
    });

    expect(alertsService.createAlertsClient).toHaveBeenCalledWith(
      expect.objectContaining({
        rule: expect.objectContaining({ snoozedInstances }),
      })
    );
    expect(alertsClient.initializeExecution).toHaveBeenCalledWith(
      expect.objectContaining({ snoozedInstances })
    );
    spy1.mockRestore();
  });
});
