/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { MaintenanceWindowStatus } from '@kbn/maintenance-windows-plugin/common';
import type { UntypedNormalizedRuleType } from '../rule_type_registry';
import type { AlertInstanceContext } from '../types';
import { RecoveredActionGroup } from '../types';
import { LegacyAlertsClient } from './legacy_alerts_client';
import { createAlertFactory, getPublicAlertFactory } from '../alert/create_alert_factory';
import { Alert } from '../alert/alert';
import { ruleRunMetricsStoreMock } from '../lib/rule_run_metrics_store.mock';
import { processAlerts } from '../lib';
import { DEFAULT_FLAPPING_SETTINGS } from '../../common/rules_settings';
import { schema } from '@kbn/config-schema';
import {
  maintenanceWindowsServiceMock,
  getMockMaintenanceWindow,
} from '../task_runner/maintenance_windows/maintenance_windows_service.mock';
import type { KibanaRequest } from '@kbn/core/server';
import { alertingEventLoggerMock } from '../lib/alerting_event_logger/alerting_event_logger.mock';
import { determineFlappingAlerts } from '../lib/flapping/determine_flapping_alerts';
import { determineDelayedAlerts } from '../lib/determine_delayed_alerts';

const maintenanceWindowsService = maintenanceWindowsServiceMock.create();
const scheduleActions = jest.fn();
const replaceState = jest.fn(() => ({ scheduleActions }));
const mockCreateAlert = jest.fn(() => ({ replaceState, scheduleActions }));
const mockGetAlert = jest.fn();
const mockGetRecoveredAlerts = jest.fn().mockReturnValue([]);
const mockSetLimitReached = jest.fn();
const mockCreateAlertFactory = {
  create: mockCreateAlert,
  get: mockGetAlert,
  hasReachedAlertLimit: jest.fn().mockReturnValue(false),
  alertLimit: {
    getValue: jest.fn().mockReturnValue(1000),
    setLimitReached: mockSetLimitReached,
    checkLimitUsage: jest.fn(),
  },
  done: () => ({
    getRecoveredAlerts: mockGetRecoveredAlerts,
  }),
};
jest.mock('../alert/create_alert_factory', () => {
  const original = jest.requireActual('../alert/create_alert_factory');
  return {
    ...original,
    getPublicAlertFactory: jest.fn().mockImplementation(() => {
      return {
        create: mockCreateAlert,
        alertLimit: {
          getValue: jest.fn().mockReturnValue(1000),
          setLimitReached: mockSetLimitReached,
        },
        done: () => ({
          getRecoveredAlerts: mockGetRecoveredAlerts,
        }),
      };
    }),
    createAlertFactory: jest.fn().mockImplementation(() => mockCreateAlertFactory),
  };
});

jest.mock('../lib', () => {
  const original = jest.requireActual('../lib');
  return {
    ...original,
    processAlerts: jest.fn(),
    setFlapping: jest.fn(),
  };
});

jest.mock('../lib/flapping/determine_flapping_alerts', () => {
  return {
    determineFlappingAlerts: jest.fn(),
  };
});

jest.mock('../lib/determine_delayed_alerts', () => {
  return {
    determineDelayedAlerts: jest.fn(),
  };
});

jest.mock('../task_runner/log_alerts', () => ({ logAlerts: jest.fn() }));

let logger: ReturnType<(typeof loggingSystemMock)['createLogger']>;
const ruleRunMetricsStore = ruleRunMetricsStoreMock.create();
const alertingEventLogger = alertingEventLoggerMock.create();

const ruleType: jest.Mocked<UntypedNormalizedRuleType> = {
  id: 'test',
  name: 'My test rule',
  actionGroups: [{ id: 'default', name: 'Default' }, RecoveredActionGroup],
  defaultActionGroupId: 'default',
  minimumLicenseRequired: 'basic',
  isExportable: true,
  recoveryActionGroup: RecoveredActionGroup,
  executor: jest.fn(),
  category: 'test',
  producer: 'alerts',
  solution: 'stack',
  cancelAlertsOnRuleTimeout: true,
  ruleTaskTimeout: '5m',
  validate: {
    params: schema.any(),
  },
  validLegacyConsumers: [],
};

const testAlert1 = {
  state: { foo: 'bar' },
  meta: { flapping: false, flappingHistory: [false, false], uuid: 'abc' },
};
const testAlert2 = {
  state: { any: 'value' },
  meta: {
    lastScheduledActions: {
      group: 'default',
      date: new Date().toISOString(),
    },
    uuid: 'def',
  },
};

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

const defaultExecutionOpts = {
  maxAlerts: 1000,
  ruleLabel: `test: rule-name`,
  flappingSettings: DEFAULT_FLAPPING_SETTINGS,
  activeAlertsFromState: {
    '1': testAlert1,
    '2': testAlert2,
  },
  recoveredAlertsFromState: {},
  startedAt: null,
};

describe('Legacy Alerts Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    logger = loggingSystemMock.createLogger();
  });

  test('initializeExecution() should create alert factory with given alerts', async () => {
    const alertsClient = new LegacyAlertsClient({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      spaceId: 'space1',
      ruleType,
      maintenanceWindowsService,
    });

    await alertsClient.initializeExecution(defaultExecutionOpts);

    expect(createAlertFactory).toHaveBeenCalledWith({
      alerts: {
        '1': new Alert<AlertInstanceContext, AlertInstanceContext>('1', testAlert1),
        '2': new Alert<AlertInstanceContext, AlertInstanceContext>('2', testAlert2),
      },
      logger,
      configuredMaxAlerts: 1000,
      canSetRecoveryContext: false,
      autoRecoverAlerts: true,
      snoozedInstancesMap: new Map(),
    });
  });

  test('initializeExecution() should set maxAlerts and pass the configured value to the alert factory if greater than the max allowed threshold', async () => {
    const alertsClient = new LegacyAlertsClient({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      spaceId: 'space1',
      ruleType,
      maintenanceWindowsService,
    });

    await alertsClient.initializeExecution({ ...defaultExecutionOpts, maxAlerts: 10000 });

    expect(alertsClient.getMaxAlertLimit()).toBe(5000);
    expect(createAlertFactory).toHaveBeenCalledWith({
      alerts: {
        '1': new Alert<AlertInstanceContext, AlertInstanceContext>('1', testAlert1),
        '2': new Alert<AlertInstanceContext, AlertInstanceContext>('2', testAlert2),
      },
      logger,
      configuredMaxAlerts: 10000,
      canSetRecoveryContext: false,
      autoRecoverAlerts: true,
      snoozedInstancesMap: new Map(),
    });
  });

  test('initializeExecution() should set snooze config on active alerts with a matching snoozed instance', async () => {
    const setSnoozeConfigSpy = jest.spyOn(Alert.prototype, 'setSnoozeConfig');
    const alertsClient = new LegacyAlertsClient({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      spaceId: 'space1',
      ruleType,
      maintenanceWindowsService,
    });

    const snoozeConfig = {
      instanceId: '1',
      snoozedAt: '2024-01-01T00:00:00.000Z',
      snoozedBy: 'user',
    };
    await alertsClient.initializeExecution({
      ...defaultExecutionOpts,
      snoozedInstances: [snoozeConfig],
    });

    expect(setSnoozeConfigSpy).toHaveBeenCalledTimes(1);
    expect(setSnoozeConfigSpy).toHaveBeenCalledWith(snoozeConfig);
    setSnoozeConfigSpy.mockRestore();
  });

  test('initializeExecution() should set snooze config on recovered alerts with a matching snoozed instance', async () => {
    const setSnoozeConfigSpy = jest.spyOn(Alert.prototype, 'setSnoozeConfig');
    const alertsClient = new LegacyAlertsClient({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      spaceId: 'space1',
      ruleType,
      maintenanceWindowsService,
    });

    const snoozeConfig = {
      instanceId: 'r1',
      snoozedAt: '2024-01-01T00:00:00.000Z',
      snoozedBy: 'user',
    };
    await alertsClient.initializeExecution({
      ...defaultExecutionOpts,
      activeAlertsFromState: {},
      recoveredAlertsFromState: { r1: testAlert1 },
      snoozedInstances: [snoozeConfig],
    });

    expect(setSnoozeConfigSpy).toHaveBeenCalledTimes(1);
    expect(setSnoozeConfigSpy).toHaveBeenCalledWith(snoozeConfig);
    setSnoozeConfigSpy.mockRestore();
  });

  test('initializeExecution() should not set snooze config on alerts without a matching snoozed instance', async () => {
    const setSnoozeConfigSpy = jest.spyOn(Alert.prototype, 'setSnoozeConfig');
    const alertsClient = new LegacyAlertsClient({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      spaceId: 'space1',
      ruleType,
      maintenanceWindowsService,
    });

    await alertsClient.initializeExecution({
      ...defaultExecutionOpts,
      snoozedInstances: [
        { instanceId: 'no-match', snoozedAt: '2024-01-01T00:00:00.000Z', snoozedBy: 'user' },
      ],
    });

    expect(setSnoozeConfigSpy).not.toHaveBeenCalled();
    setSnoozeConfigSpy.mockRestore();
  });

  test('factory().create() should pass snoozedInstancesMap to createAlertFactory so new alerts get snooze config set', async () => {
    const alertsClient = new LegacyAlertsClient({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      spaceId: 'space1',
      ruleType,
      maintenanceWindowsService,
    });

    const snoozeConfig = {
      instanceId: 'new-alert',
      snoozedAt: '2024-01-01T00:00:00.000Z',
      snoozedBy: 'user',
    };
    await alertsClient.initializeExecution({
      ...defaultExecutionOpts,
      activeAlertsFromState: {},
      snoozedInstances: [snoozeConfig],
    });

    expect(createAlertFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        snoozedInstancesMap: new Map([['new-alert', snoozeConfig]]),
      })
    );
  });

  test('factory() should call getPublicAlertFactory on alert factory', async () => {
    const alertsClient = new LegacyAlertsClient({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      spaceId: 'space1',
      ruleType,
      maintenanceWindowsService,
    });

    await alertsClient.initializeExecution(defaultExecutionOpts);

    alertsClient.factory();
    expect(getPublicAlertFactory).toHaveBeenCalledWith(mockCreateAlertFactory);
  });

  test('getAlert() should pass through to alert factory function', async () => {
    const alertsClient = new LegacyAlertsClient({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      spaceId: 'space1',
      ruleType,
      maintenanceWindowsService,
    });

    await alertsClient.initializeExecution(defaultExecutionOpts);

    alertsClient.getAlert('1');
    expect(mockCreateAlertFactory.get).toHaveBeenCalledWith('1');
  });

  test('checkLimitUsage() should pass through to alert factory function', async () => {
    const alertsClient = new LegacyAlertsClient({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      spaceId: 'space1',
      ruleType,
      maintenanceWindowsService,
    });

    await alertsClient.initializeExecution(defaultExecutionOpts);

    alertsClient.checkLimitUsage();
    expect(mockCreateAlertFactory.alertLimit.checkLimitUsage).toHaveBeenCalled();
  });

  test('hasReachedAlertLimit() should pass through to alert factory function', async () => {
    const alertsClient = new LegacyAlertsClient({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      spaceId: 'space1',
      ruleType,
      maintenanceWindowsService,
    });

    await alertsClient.initializeExecution(defaultExecutionOpts);

    alertsClient.hasReachedAlertLimit();
    expect(mockCreateAlertFactory.hasReachedAlertLimit).toHaveBeenCalled();
  });

  test('getMaxAlertLimit() should return the maxAlertLimit', async () => {
    const alertsClient = new LegacyAlertsClient({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      spaceId: 'space1',
      ruleType,
      maintenanceWindowsService,
    });

    await alertsClient.initializeExecution(defaultExecutionOpts);

    expect(alertsClient.getMaxAlertLimit()).toBe(1000);
  });

  test('processAlerts() should call processAlerts', async () => {
    maintenanceWindowsService.getMaintenanceWindows.mockReturnValue({
      maintenanceWindows: [
        {
          ...getMockMaintenanceWindow(),
          eventStartTime: new Date().toISOString(),
          eventEndTime: new Date().toISOString(),
          status: MaintenanceWindowStatus.Running,
          id: 'test-id1',
        },
        {
          ...getMockMaintenanceWindow(),
          eventStartTime: new Date().toISOString(),
          eventEndTime: new Date().toISOString(),
          status: MaintenanceWindowStatus.Running,
          id: 'test-id2',
        },
      ],
      maintenanceWindowsWithoutScopedQueryIds: ['test-id1', 'test-id2'],
    });
    (processAlerts as jest.Mock).mockReturnValue({
      newAlerts: {},
      activeAlerts: {
        '1': new Alert<AlertInstanceContext, AlertInstanceContext>('1', testAlert1),
        '2': new Alert<AlertInstanceContext, AlertInstanceContext>('2', testAlert2),
      },
      recoveredAlerts: {},
    });
    const alertsClient = new LegacyAlertsClient({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      spaceId: 'space1',
      ruleType,
      maintenanceWindowsService,
    });

    await alertsClient.initializeExecution(defaultExecutionOpts);

    await alertsClient.processAlerts();

    expect(processAlerts).toHaveBeenCalledWith({
      alerts: {
        '1': new Alert<AlertInstanceContext, AlertInstanceContext>('1', testAlert1),
        '2': new Alert<AlertInstanceContext, AlertInstanceContext>('2', testAlert2),
      },
      existingAlerts: {
        '1': new Alert<AlertInstanceContext, AlertInstanceContext>('1', testAlert1),
        '2': new Alert<AlertInstanceContext, AlertInstanceContext>('2', testAlert2),
      },
      hasReachedAlertLimit: false,
      alertLimit: 1000,
      autoRecoverAlerts: true,
      startedAt: null,
    });

    expect(alertsClient.getProcessedAlerts('active')).toEqual({
      '1': new Alert<AlertInstanceContext, AlertInstanceContext>('1', testAlert1),
      '2': new Alert<AlertInstanceContext, AlertInstanceContext>('2', testAlert2),
    });

    expect(maintenanceWindowsService.getMaintenanceWindows).toHaveBeenCalledWith({
      eventLogger: alertingEventLogger,
      request: fakeRequest,
      ruleTypeCategory: 'test',
      spaceId: 'space1',
    });
  });

  test('processAlerts() should set maintenance windows IDs and names on new alerts and remove the expired maintenance windows from the active and recovered alerts', async () => {
    maintenanceWindowsService.getMaintenanceWindows.mockReturnValue({
      maintenanceWindows: [
        {
          ...getMockMaintenanceWindow(),
          eventStartTime: new Date().toISOString(),
          eventEndTime: new Date().toISOString(),
          status: MaintenanceWindowStatus.Running,
          id: 'test-id1',
          title: 'Maintenance Window 1',
        },
        {
          ...getMockMaintenanceWindow(),
          eventStartTime: new Date().toISOString(),
          eventEndTime: new Date().toISOString(),
          status: MaintenanceWindowStatus.Running,
          id: 'test-id5',
          title: 'Maintenance Window 5',
        },
      ],
      maintenanceWindowsWithoutScopedQueryIds: ['test-id1', 'test-id5'],
    });

    const activeAlert = {
      state: {},
      meta: {
        uuid: 'bar',
        maintenanceWindowIds: ['test-id1', 'test-id2'],
        maintenanceWindowNames: ['Maintenance Window 1', 'Maintenance Window 2'],
      },
    };

    const recoveredAlert = {
      state: {},
      meta: {
        uuid: 'ghi',
        maintenanceWindowIds: ['test-id1', `test-id3`],
        maintenanceWindowNames: ['Maintenance Window 1', 'Maintenance Window 3'],
      },
    };

    (processAlerts as jest.Mock).mockReturnValue({
      newAlerts: {
        '1': new Alert<AlertInstanceContext, AlertInstanceContext>('1', testAlert1),
      },
      activeAlerts: {
        '2': new Alert<AlertInstanceContext, AlertInstanceContext>('2', activeAlert),
      },
      recoveredAlerts: {
        '3': new Alert<AlertInstanceContext, AlertInstanceContext>('3', recoveredAlert),
      },
    });
    const alertsClient = new LegacyAlertsClient({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      spaceId: 'space1',
      ruleType,
      maintenanceWindowsService,
    });

    await alertsClient.initializeExecution({
      ...defaultExecutionOpts,
      activeAlertsFromState: {
        '2': activeAlert,
        '3': recoveredAlert,
      },
    });

    await alertsClient.processAlerts();

    expect(maintenanceWindowsService.getMaintenanceWindows).toHaveBeenCalledWith({
      eventLogger: alertingEventLogger,
      request: fakeRequest,
      ruleTypeCategory: 'test',
      spaceId: 'space1',
    });

    expect(alertsClient.getProcessedAlerts('new')['1'].getMaintenanceWindowIds()).toEqual([
      'test-id1',
      'test-id5',
    ]);
    expect(alertsClient.getProcessedAlerts('new')['1'].getMaintenanceWindowNames()).toEqual([
      'Maintenance Window 1',
      'Maintenance Window 5',
    ]);
    expect(alertsClient.getProcessedAlerts('active')['2'].getMaintenanceWindowIds()).toEqual([
      'test-id1',
    ]);
    expect(alertsClient.getProcessedAlerts('active')['2'].getMaintenanceWindowNames()).toEqual([
      'Maintenance Window 1',
    ]);
    expect(alertsClient.getProcessedAlerts('recovered')['3'].getMaintenanceWindowIds()).toEqual([
      'test-id1',
    ]);
    expect(alertsClient.getProcessedAlerts('recovered')['3'].getMaintenanceWindowNames()).toEqual([
      'Maintenance Window 1',
    ]);
  });

  test('isTrackedAlert() should return true if alert was active in a previous execution, false otherwise', async () => {
    const alertsClient = new LegacyAlertsClient({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      spaceId: 'space1',
      ruleType,
      maintenanceWindowsService,
    });

    await alertsClient.initializeExecution(defaultExecutionOpts);
    expect(alertsClient.isTrackedAlert('1')).toBe(true);
    expect(alertsClient.isTrackedAlert('2')).toBe(true);
    expect(alertsClient.isTrackedAlert('3')).toBe(false);
  });

  test('determineFlappingAlerts() should call determineFlappingAlerts', async () => {
    (determineFlappingAlerts as jest.Mock).mockReturnValue({
      newAlerts: {},
      activeAlerts: {
        '1': new Alert<AlertInstanceContext, AlertInstanceContext>('1', testAlert1),
        '2': new Alert<AlertInstanceContext, AlertInstanceContext>('2', testAlert2),
      },
      trackedActiveAlerts: {
        '1': new Alert<AlertInstanceContext, AlertInstanceContext>('1', testAlert1),
        '2': new Alert<AlertInstanceContext, AlertInstanceContext>('2', testAlert2),
      },
      trackedRecoveredAlerts: {},
      recoveredAlerts: {},
    });
    const alertsClient = new LegacyAlertsClient({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      spaceId: 'space1',
      ruleType,
      maintenanceWindowsService,
    });

    await alertsClient.initializeExecution(defaultExecutionOpts);

    alertsClient.determineFlappingAlerts();

    expect(determineFlappingAlerts).toHaveBeenCalledWith({
      newAlerts: {},
      activeAlerts: {},
      recoveredAlerts: {},
      flappingSettings: {
        enabled: true,
        lookBackWindow: 20,
        statusChangeThreshold: 4,
      },
      previouslyRecoveredAlerts: {},
      actionGroupId: 'default',
    });

    expect(alertsClient.getProcessedAlerts('active')).toEqual({
      '1': new Alert<AlertInstanceContext, AlertInstanceContext>('1', testAlert1),
      '2': new Alert<AlertInstanceContext, AlertInstanceContext>('2', testAlert2),
    });
  });

  test('determineDelayedAlerts() should call determineDelayedAlerts', async () => {
    (determineDelayedAlerts as jest.Mock).mockReturnValue({
      newAlerts: {},
      activeAlerts: {
        '1': new Alert<AlertInstanceContext, AlertInstanceContext>('1', testAlert1),
      },
      trackedActiveAlerts: {
        '1': new Alert<AlertInstanceContext, AlertInstanceContext>('1', testAlert1),
      },
      trackedRecoveredAlerts: {},
      recoveredAlerts: {},
    });
    const alertsClient = new LegacyAlertsClient({
      alertingEventLogger,
      logger,
      request: fakeRequest,
      spaceId: 'space1',
      ruleType,
      maintenanceWindowsService,
    });

    await alertsClient.initializeExecution(defaultExecutionOpts);

    alertsClient.determineDelayedAlerts({
      ruleRunMetricsStore,
      alertDelay: 5,
    });

    expect(determineDelayedAlerts).toHaveBeenCalledWith({
      newAlerts: {},
      delayedAlerts: {},
      activeAlerts: {},
      trackedActiveAlerts: {},
      recoveredAlerts: {},
      trackedRecoveredAlerts: {},
      alertDelay: 5,
      startedAt: null,
      ruleRunMetricsStore,
    });

    expect(alertsClient.getProcessedAlerts('active')).toEqual({
      '1': new Alert<AlertInstanceContext, AlertInstanceContext>('1', testAlert1),
    });
  });
});
