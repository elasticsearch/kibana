/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsClientMock, uiSettingsServiceMock } from '@kbn/core/server/mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { asSpaceId } from '@kbn/core-spaces-common';
import { DATE_1970, mockTaskInstance, RULE_ID, RULE_NAME, RULE_TYPE_ID } from './fixtures';
import { alertingEventLoggerMock } from '../lib/alerting_event_logger/alerting_event_logger.mock';
import { ruleRunMetricsStoreMock } from '../lib/rule_run_metrics_store.mock';
import type { RuleData } from './rule_type_runner';
import { RuleTypeRunner } from './rule_type_runner';
import { TaskRunnerTimer } from './task_runner_timer';
import { DEFAULT_FLAPPING_SETTINGS, RecoveredActionGroup } from '../types';
import type { TaskRunnerContext } from './types';
import { executionContextServiceMock } from '@kbn/core-execution-context-server-mocks';
import type { SharePluginStart } from '@kbn/share-plugin/server';
import { alertsClientMock } from '../alerts_client/alerts_client.mock';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import { publicRuleMonitoringServiceMock } from '../monitoring/rule_monitoring_service.mock';
import { publicRuleResultServiceMock } from '../monitoring/rule_result_service.mock';
import { wrappedScopedClusterClientMock } from '../lib/wrap_scoped_cluster_client.mock';
import type { NormalizedRuleType } from '../rule_type_registry';
import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import { createTaskRunError, TaskErrorSource, TaskStatus } from '@kbn/task-manager-plugin/server';
import { getErrorSource } from '@kbn/task-manager-plugin/server/task_running';
import { maintenanceWindowsServiceMock } from './maintenance_windows/maintenance_windows_service.mock';
import type { KibanaRequest } from '@kbn/core/server';

const alertingEventLogger = alertingEventLoggerMock.create();
const alertsClient = alertsClientMock.create();
const dataViews = dataViewPluginMocks.createStartContract();
const logger = loggingSystemMock.create().get();
const maintenanceWindowsService = maintenanceWindowsServiceMock.create();
const publicRuleMonitoringService = publicRuleMonitoringServiceMock.create();
const publicRuleResultService = publicRuleResultServiceMock.create();
const ruleRunMetricsStore = ruleRunMetricsStoreMock.create();
const savedObjectsClient = savedObjectsClientMock.create();
const uiSettingsClient = uiSettingsServiceMock.createClient();
const wrappedScopedClusterClient = wrappedScopedClusterClientMock.create();
const getDataViews = jest.fn().mockResolvedValue(dataViews);
const getWrappedSearchSourceClient = jest.fn();
const getAsyncSearchClient = jest.fn();
const getCpsData = jest.fn().mockResolvedValue({ linkedProjects: [] });

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

const timer = new TaskRunnerTimer({ logger });
const ruleType: jest.Mocked<
  NormalizedRuleType<{}, {}, { foo: string }, {}, {}, 'default', 'recovered', {}>
> = {
  id: RULE_TYPE_ID,
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
  autoRecoverAlerts: true,
  validate: {
    params: { validate: (params) => params },
  },
  alerts: {
    context: 'test',
    mappings: { fieldMap: { field: { type: 'keyword', required: false } } },
  },
  validLegacyConsumers: [],
};

const mockedRule: RuleData<Record<string, unknown>> = {
  alertTypeId: ruleType.id,
  consumer: 'bar',
  schedule: { interval: '10s' },
  throttle: null,
  notifyWhen: 'onActiveAlert',
  name: RULE_NAME,
  tags: ['rule-', '-tags'],
  createdBy: 'rule-creator',
  updatedBy: 'rule-updater',
  createdAt: new Date('2019-02-12T21:01:22.479Z'),
  updatedAt: new Date('2019-02-12T21:01:22.479Z'),
  enabled: true,
  actions: [
    {
      group: 'default',
      actionTypeId: 'action',
      params: {
        foo: true,
      },
      uuid: '111-111',
      id: '1',
    },
    {
      group: RecoveredActionGroup.id,
      actionTypeId: 'action',
      params: {
        isResolved: true,
      },
      uuid: '222-222',
      id: '2',
    },
  ],
  muteAll: false,
  revision: 0,
};

const mockedRuleParams = { bar: true };

const mockedTaskInstance: ConcreteTaskInstance = {
  id: '',
  attempts: 0,
  status: TaskStatus.Running,
  version: '123',
  runAt: new Date(),
  scheduledAt: new Date(),
  startedAt: new Date(DATE_1970),
  retryAt: new Date(Date.now() + 5 * 60 * 1000),
  state: {},
  taskType: 'backfill',
  timeoutOverride: '3m',
  params: {
    adHocRunParamsId: 'abc',
    spaceId: asSpaceId('default'),
  },
  ownerId: null,
};

describe('RuleTypeRunner', () => {
  let ruleTypeRunner: RuleTypeRunner<{}, {}, { foo: string }, {}, {}, 'default', 'recovered', {}>;
  let context: TaskRunnerContext;
  let contextMock: ReturnType<typeof getTaskRunnerContext>;

  beforeEach(() => {
    jest.resetAllMocks();
    contextMock = getTaskRunnerContext();
    context = contextMock as unknown as TaskRunnerContext;

    ruleTypeRunner = new RuleTypeRunner<
      {},
      {},
      { foo: string },
      {},
      {},
      'default',
      'recovered',
      {}
    >({
      context,
      task: mockedTaskInstance,
      timer,
    });
  });

  describe('run', () => {
    test('should return state when rule type executor succeeds', async () => {
      ruleType.executor.mockResolvedValueOnce({ state: { foo: 'bar' } });

      const { state, error, stackTrace } = await ruleTypeRunner.run({
        context: {
          alertingEventLogger,
          logger,
          maintenanceWindowsService,
          flappingSettings: DEFAULT_FLAPPING_SETTINGS,
          queryDelaySec: 0,
          request: fakeRequest,
          ruleId: RULE_ID,
          ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
          ruleRunMetricsStore,
          spaceId: asSpaceId('default'),
          isServerless: false,
        },
        alertsClient,
        executionId: 'abc',
        executorServices: {
          getDataViews,
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          uiSettingsClient,
          wrappedScopedClusterClient,
          getWrappedSearchSourceClient,
          getAsyncSearchClient,
          getCpsData,
        },
        rule: mockedRule,
        ruleType,
        startedAt: new Date(DATE_1970),
        state: mockTaskInstance().state,
        validatedParams: mockedRuleParams,
      });

      expect(ruleType.executor).toHaveBeenCalledWith({
        executionId: 'abc',
        ruleExecutionTimeout: '5m',
        services: {
          alertFactory: alertsClient.factory(),
          alertsClient: alertsClient.client(),
          getDataViews: expect.any(Function),
          getMaintenanceWindowIds: expect.any(Function),
          getMaintenanceWindowNames: expect.any(Function),
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          scopedClusterClient: wrappedScopedClusterClient.client(),
          getSearchSourceClient: expect.any(Function),
          share: {},
          shouldStopExecution: expect.any(Function),
          shouldWriteAlerts: expect.any(Function),
          getAsyncSearchClient: expect.any(Function),
          uiSettingsClient,
        },
        params: mockedRuleParams,
        state: mockTaskInstance().state,
        startedAt: new Date(DATE_1970),
        startedAtOverridden: false,
        previousStartedAt: null,
        spaceId: 'default',
        isServerless: false,
        rule: {
          id: RULE_ID,
          name: mockedRule.name,
          tags: mockedRule.tags,
          consumer: mockedRule.consumer,
          producer: ruleType.producer,
          revision: mockedRule.revision,
          ruleTypeId: mockedRule.alertTypeId,
          ruleTypeName: ruleType.name,
          enabled: mockedRule.enabled,
          schedule: mockedRule.schedule,
          actions: mockedRule.actions,
          createdBy: mockedRule.createdBy,
          updatedBy: mockedRule.updatedBy,
          createdAt: mockedRule.createdAt,
          updatedAt: mockedRule.updatedAt,
          throttle: mockedRule.throttle,
          notifyWhen: mockedRule.notifyWhen,
          muteAll: mockedRule.muteAll,
          snoozeSchedule: mockedRule.snoozeSchedule,
          alertDelay: mockedRule.alertDelay,
        },
        logger,
        flappingSettings: DEFAULT_FLAPPING_SETTINGS,
        getTimeRange: expect.any(Function),
      });

      expect(state).toEqual({ foo: 'bar' });
      expect(error).toBeUndefined();
      expect(stackTrace).toBeUndefined();
      expect(alertsClient.hasReachedAlertLimit).toHaveBeenCalled();
      expect(alertsClient.checkLimitUsage).toHaveBeenCalled();
      expect(alertingEventLogger.setExecutionSucceeded).toHaveBeenCalledWith(
        `rule executed: ${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`
      );
      expect(ruleRunMetricsStore.setSearchMetrics).toHaveBeenCalled();
      expect(alertsClient.processAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineFlappingAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineDelayedAlerts).toHaveBeenCalledWith({
        alertDelay: 0,
        ruleRunMetricsStore,
      });
      expect(alertsClient.persistAlerts).toHaveBeenCalled();
      expect(alertingEventLogger.setMaintenanceWindowIds).not.toHaveBeenCalled();
      expect(alertsClient.logAlerts).toHaveBeenCalledWith({
        ruleRunMetricsStore,
        shouldLogAlerts: true,
      });
    });

    test('should identify when startedAt passed to executor does not equal task startedAt', async () => {
      const differentStartedAt = new Date();
      ruleType.executor.mockResolvedValueOnce({ state: { foo: 'bar' } });

      const { state, error, stackTrace } = await ruleTypeRunner.run({
        context: {
          alertingEventLogger,
          flappingSettings: DEFAULT_FLAPPING_SETTINGS,
          logger,
          queryDelaySec: 0,
          request: fakeRequest,
          maintenanceWindowsService,
          ruleId: RULE_ID,
          ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
          ruleRunMetricsStore,
          spaceId: asSpaceId('default'),
          isServerless: false,
        },
        alertsClient,
        executionId: 'abc',
        executorServices: {
          getDataViews,
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          uiSettingsClient,
          wrappedScopedClusterClient,
          getWrappedSearchSourceClient,
          getAsyncSearchClient,
          getCpsData,
        },
        rule: mockedRule,
        ruleType,
        startedAt: differentStartedAt,
        state: mockTaskInstance().state,
        validatedParams: mockedRuleParams,
      });

      expect(ruleType.executor).toHaveBeenCalledWith({
        executionId: 'abc',
        ruleExecutionTimeout: '5m',
        services: {
          alertFactory: alertsClient.factory(),
          alertsClient: alertsClient.client(),
          getDataViews: expect.any(Function),
          getMaintenanceWindowIds: expect.any(Function),
          getMaintenanceWindowNames: expect.any(Function),
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          scopedClusterClient: wrappedScopedClusterClient.client(),
          getSearchSourceClient: expect.any(Function),
          share: {},
          shouldStopExecution: expect.any(Function),
          shouldWriteAlerts: expect.any(Function),
          getAsyncSearchClient: expect.any(Function),
          uiSettingsClient,
        },
        params: mockedRuleParams,
        state: mockTaskInstance().state,
        startedAt: differentStartedAt,
        startedAtOverridden: true,
        previousStartedAt: null,
        spaceId: 'default',
        isServerless: false,
        rule: {
          id: RULE_ID,
          name: mockedRule.name,
          tags: mockedRule.tags,
          consumer: mockedRule.consumer,
          producer: ruleType.producer,
          revision: mockedRule.revision,
          ruleTypeId: mockedRule.alertTypeId,
          ruleTypeName: ruleType.name,
          enabled: mockedRule.enabled,
          schedule: mockedRule.schedule,
          actions: mockedRule.actions,
          createdBy: mockedRule.createdBy,
          updatedBy: mockedRule.updatedBy,
          createdAt: mockedRule.createdAt,
          updatedAt: mockedRule.updatedAt,
          throttle: mockedRule.throttle,
          notifyWhen: mockedRule.notifyWhen,
          muteAll: mockedRule.muteAll,
          snoozeSchedule: mockedRule.snoozeSchedule,
          alertDelay: mockedRule.alertDelay,
        },
        logger,
        flappingSettings: DEFAULT_FLAPPING_SETTINGS,
        getTimeRange: expect.any(Function),
      });

      expect(state).toEqual({ foo: 'bar' });
      expect(error).toBeUndefined();
      expect(stackTrace).toBeUndefined();
      expect(alertsClient.hasReachedAlertLimit).toHaveBeenCalled();
      expect(alertsClient.checkLimitUsage).toHaveBeenCalled();
      expect(alertingEventLogger.setExecutionSucceeded).toHaveBeenCalledWith(
        `rule executed: ${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`
      );
      expect(ruleRunMetricsStore.setSearchMetrics).toHaveBeenCalled();
      expect(alertsClient.processAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineFlappingAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineDelayedAlerts).toHaveBeenCalledWith({
        alertDelay: 0,
        ruleRunMetricsStore,
      });
      expect(alertsClient.persistAlerts).toHaveBeenCalled();
      expect(alertingEventLogger.setMaintenanceWindowIds).not.toHaveBeenCalled();
      expect(alertsClient.logAlerts).toHaveBeenCalledWith({
        ruleRunMetricsStore,
        shouldLogAlerts: true,
      });
    });

    test('should return error when checkLimitUsage() throws error', async () => {
      const err = new Error('limit exceeded');
      alertsClient.checkLimitUsage.mockImplementationOnce(() => {
        throw err;
      });
      ruleType.executor.mockResolvedValueOnce({ state: { foo: 'bar' } });

      const { state, error, stackTrace } = await ruleTypeRunner.run({
        context: {
          alertingEventLogger,
          flappingSettings: DEFAULT_FLAPPING_SETTINGS,
          queryDelaySec: 0,
          logger,
          request: fakeRequest,
          maintenanceWindowsService,
          ruleId: RULE_ID,
          ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
          ruleRunMetricsStore,
          spaceId: asSpaceId('default'),
          isServerless: false,
        },
        alertsClient,
        executionId: 'abc',
        executorServices: {
          getDataViews,
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          uiSettingsClient,
          wrappedScopedClusterClient,
          getWrappedSearchSourceClient,
          getAsyncSearchClient,
          getCpsData,
        },
        rule: mockedRule,
        ruleType,
        startedAt: new Date(DATE_1970),
        state: mockTaskInstance().state,
        validatedParams: mockedRuleParams,
      });

      expect(ruleType.executor).toHaveBeenCalledWith({
        executionId: 'abc',
        ruleExecutionTimeout: '5m',
        services: {
          alertFactory: alertsClient.factory(),
          alertsClient: alertsClient.client(),
          getDataViews: expect.any(Function),
          getMaintenanceWindowIds: expect.any(Function),
          getMaintenanceWindowNames: expect.any(Function),
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          scopedClusterClient: wrappedScopedClusterClient.client(),
          getSearchSourceClient: expect.any(Function),
          share: {},
          shouldStopExecution: expect.any(Function),
          shouldWriteAlerts: expect.any(Function),
          getAsyncSearchClient: expect.any(Function),
          uiSettingsClient,
        },
        params: mockedRuleParams,
        state: mockTaskInstance().state,
        startedAt: new Date(DATE_1970),
        startedAtOverridden: false,
        previousStartedAt: null,
        spaceId: 'default',
        isServerless: false,
        rule: {
          id: RULE_ID,
          name: mockedRule.name,
          tags: mockedRule.tags,
          consumer: mockedRule.consumer,
          producer: ruleType.producer,
          revision: mockedRule.revision,
          ruleTypeId: mockedRule.alertTypeId,
          ruleTypeName: ruleType.name,
          enabled: mockedRule.enabled,
          schedule: mockedRule.schedule,
          actions: mockedRule.actions,
          createdBy: mockedRule.createdBy,
          updatedBy: mockedRule.updatedBy,
          createdAt: mockedRule.createdAt,
          updatedAt: mockedRule.updatedAt,
          throttle: mockedRule.throttle,
          notifyWhen: mockedRule.notifyWhen,
          muteAll: mockedRule.muteAll,
          snoozeSchedule: mockedRule.snoozeSchedule,
          alertDelay: mockedRule.alertDelay,
        },
        logger,
        flappingSettings: DEFAULT_FLAPPING_SETTINGS,
        getTimeRange: expect.any(Function),
      });

      expect(state).toBeUndefined();
      expect(error).toEqual(err);
      expect(stackTrace).toEqual({ message: err, stackTrace: err.stack });
      expect(alertsClient.checkLimitUsage).toHaveBeenCalled();
      expect(alertsClient.hasReachedAlertLimit).toHaveBeenCalled();
      expect(alertingEventLogger.setExecutionSucceeded).not.toHaveBeenCalled();
      expect(alertingEventLogger.setExecutionFailed).toHaveBeenCalledWith(
        `rule execution failure: test:1: 'rule-name'`,
        'limit exceeded'
      );
      expect(ruleRunMetricsStore.setSearchMetrics).not.toHaveBeenCalled();
      expect(alertsClient.processAlerts).not.toHaveBeenCalled();
      expect(alertsClient.determineFlappingAlerts).not.toHaveBeenCalled();
      expect(alertsClient.determineDelayedAlerts).not.toHaveBeenCalled();
      expect(alertsClient.persistAlerts).not.toHaveBeenCalled();
      expect(alertsClient.logAlerts).not.toHaveBeenCalled();
    });

    test('should return error when rule type executor throws error', async () => {
      const err = new Error('executor error');
      ruleType.executor.mockImplementationOnce(() => {
        throw err;
      });

      const { state, error, stackTrace } = await ruleTypeRunner.run({
        context: {
          alertingEventLogger,
          flappingSettings: DEFAULT_FLAPPING_SETTINGS,
          queryDelaySec: 0,
          logger,
          maintenanceWindowsService,
          request: fakeRequest,
          ruleId: RULE_ID,
          ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
          ruleRunMetricsStore,
          spaceId: asSpaceId('default'),
          isServerless: false,
        },
        alertsClient,
        executionId: 'abc',
        executorServices: {
          getDataViews,
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          uiSettingsClient,
          wrappedScopedClusterClient,
          getWrappedSearchSourceClient,
          getAsyncSearchClient,
          getCpsData,
        },
        rule: mockedRule,
        ruleType,
        startedAt: new Date(DATE_1970),
        state: mockTaskInstance().state,
        validatedParams: mockedRuleParams,
      });

      expect(ruleType.executor).toHaveBeenCalledWith({
        executionId: 'abc',
        ruleExecutionTimeout: '5m',
        services: {
          alertFactory: alertsClient.factory(),
          alertsClient: alertsClient.client(),
          getDataViews: expect.any(Function),
          getMaintenanceWindowIds: expect.any(Function),
          getMaintenanceWindowNames: expect.any(Function),
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          scopedClusterClient: wrappedScopedClusterClient.client(),
          getSearchSourceClient: expect.any(Function),
          share: {},
          shouldStopExecution: expect.any(Function),
          shouldWriteAlerts: expect.any(Function),
          getAsyncSearchClient: expect.any(Function),
          uiSettingsClient,
        },
        params: mockedRuleParams,
        state: mockTaskInstance().state,
        startedAt: new Date(DATE_1970),
        startedAtOverridden: false,
        previousStartedAt: null,
        spaceId: 'default',
        isServerless: false,
        rule: {
          id: RULE_ID,
          name: mockedRule.name,
          tags: mockedRule.tags,
          consumer: mockedRule.consumer,
          producer: ruleType.producer,
          revision: mockedRule.revision,
          ruleTypeId: mockedRule.alertTypeId,
          ruleTypeName: ruleType.name,
          enabled: mockedRule.enabled,
          schedule: mockedRule.schedule,
          actions: mockedRule.actions,
          createdBy: mockedRule.createdBy,
          updatedBy: mockedRule.updatedBy,
          createdAt: mockedRule.createdAt,
          updatedAt: mockedRule.updatedAt,
          throttle: mockedRule.throttle,
          notifyWhen: mockedRule.notifyWhen,
          muteAll: mockedRule.muteAll,
          snoozeSchedule: mockedRule.snoozeSchedule,
          alertDelay: mockedRule.alertDelay,
        },
        logger,
        flappingSettings: DEFAULT_FLAPPING_SETTINGS,
        getTimeRange: expect.any(Function),
      });

      expect(state).toBeUndefined();
      expect(error).toEqual(err);
      expect(stackTrace).toEqual({ message: err, stackTrace: err.stack });
      expect(alertsClient.checkLimitUsage).not.toHaveBeenCalled();
      expect(alertsClient.hasReachedAlertLimit).toHaveBeenCalled();
      expect(alertingEventLogger.setExecutionSucceeded).not.toHaveBeenCalled();
      expect(alertingEventLogger.setExecutionFailed).toHaveBeenCalledWith(
        `rule execution failure: test:1: 'rule-name'`,
        'executor error'
      );
      expect(ruleRunMetricsStore.setSearchMetrics).not.toHaveBeenCalled();
      expect(alertsClient.processAlerts).not.toHaveBeenCalled();
      expect(alertsClient.determineFlappingAlerts).not.toHaveBeenCalled();
      expect(alertsClient.determineDelayedAlerts).not.toHaveBeenCalled();
      expect(alertsClient.persistAlerts).not.toHaveBeenCalled();
      expect(alertsClient.logAlerts).not.toHaveBeenCalled();
    });

    test('should return user error when rule type executor throws a user error', async () => {
      const err = createTaskRunError(new Error('fail'), TaskErrorSource.USER);
      ruleType.executor.mockImplementationOnce(() => {
        throw err;
      });

      const { error } = await ruleTypeRunner.run({
        context: {
          alertingEventLogger,
          flappingSettings: DEFAULT_FLAPPING_SETTINGS,
          queryDelaySec: 0,
          maintenanceWindowsService,
          logger,
          request: fakeRequest,
          ruleId: RULE_ID,
          ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
          ruleRunMetricsStore,
          spaceId: asSpaceId('default'),
          isServerless: false,
        },
        alertsClient,
        executionId: 'abc',
        executorServices: {
          getDataViews,
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          uiSettingsClient,
          wrappedScopedClusterClient,
          getWrappedSearchSourceClient,
          getAsyncSearchClient,
          getCpsData,
        },
        rule: mockedRule,
        ruleType,
        startedAt: new Date(DATE_1970),
        state: mockTaskInstance().state,
        validatedParams: mockedRuleParams,
      });

      expect(getErrorSource(error!)).toEqual(TaskErrorSource.USER);
    });

    test('should handle reaching alert limit when rule type executor succeeds', async () => {
      alertsClient.getMaxAlertLimit.mockReturnValueOnce(100);
      alertsClient.hasReachedAlertLimit.mockReturnValueOnce(true);
      ruleType.executor.mockResolvedValueOnce({ state: { foo: 'bar' } });

      const { state, error, stackTrace } = await ruleTypeRunner.run({
        context: {
          alertingEventLogger,
          flappingSettings: DEFAULT_FLAPPING_SETTINGS,
          queryDelaySec: 0,
          request: fakeRequest,
          logger,
          ruleId: RULE_ID,
          maintenanceWindowsService,
          ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
          ruleRunMetricsStore,
          spaceId: asSpaceId('default'),
          isServerless: false,
        },
        alertsClient,
        executionId: 'abc',
        executorServices: {
          getDataViews,
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          uiSettingsClient,
          wrappedScopedClusterClient,
          getWrappedSearchSourceClient,
          getAsyncSearchClient,
          getCpsData,
        },
        rule: mockedRule,
        ruleType,
        startedAt: new Date(DATE_1970),
        state: mockTaskInstance().state,
        validatedParams: mockedRuleParams,
      });

      expect(ruleType.executor).toHaveBeenCalledWith({
        executionId: 'abc',
        ruleExecutionTimeout: '5m',
        services: {
          alertFactory: alertsClient.factory(),
          alertsClient: alertsClient.client(),
          getDataViews: expect.any(Function),
          getMaintenanceWindowIds: expect.any(Function),
          getMaintenanceWindowNames: expect.any(Function),
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          scopedClusterClient: wrappedScopedClusterClient.client(),
          getSearchSourceClient: expect.any(Function),
          share: {},
          shouldStopExecution: expect.any(Function),
          shouldWriteAlerts: expect.any(Function),
          getAsyncSearchClient: expect.any(Function),
          uiSettingsClient,
        },
        params: mockedRuleParams,
        state: mockTaskInstance().state,
        startedAt: new Date(DATE_1970),
        startedAtOverridden: false,
        previousStartedAt: null,
        spaceId: 'default',
        isServerless: false,
        rule: {
          id: RULE_ID,
          name: mockedRule.name,
          tags: mockedRule.tags,
          consumer: mockedRule.consumer,
          producer: ruleType.producer,
          revision: mockedRule.revision,
          ruleTypeId: mockedRule.alertTypeId,
          ruleTypeName: ruleType.name,
          enabled: mockedRule.enabled,
          schedule: mockedRule.schedule,
          actions: mockedRule.actions,
          createdBy: mockedRule.createdBy,
          updatedBy: mockedRule.updatedBy,
          createdAt: mockedRule.createdAt,
          updatedAt: mockedRule.updatedAt,
          throttle: mockedRule.throttle,
          notifyWhen: mockedRule.notifyWhen,
          muteAll: mockedRule.muteAll,
          snoozeSchedule: mockedRule.snoozeSchedule,
          alertDelay: mockedRule.alertDelay,
        },
        logger,
        flappingSettings: DEFAULT_FLAPPING_SETTINGS,
        getTimeRange: expect.any(Function),
      });

      expect(logger.warn).toHaveBeenCalledWith(
        `rule execution generated greater than 100 alerts: test:1: 'rule-name'`
      );
      expect(ruleRunMetricsStore.setHasReachedAlertLimit).toHaveBeenCalledWith(true);
      expect(state).toEqual({ foo: 'bar' });
      expect(error).toBeUndefined();
      expect(stackTrace).toBeUndefined();
      expect(alertsClient.hasReachedAlertLimit).toHaveBeenCalled();
      expect(alertsClient.checkLimitUsage).toHaveBeenCalled();
      expect(alertingEventLogger.setExecutionSucceeded).toHaveBeenCalledWith(
        `rule executed: ${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`
      );
      expect(ruleRunMetricsStore.setSearchMetrics).toHaveBeenCalled();
      expect(alertsClient.processAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineFlappingAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineDelayedAlerts).toHaveBeenCalledWith({
        alertDelay: 0,
        ruleRunMetricsStore,
      });
      expect(alertsClient.persistAlerts).toHaveBeenCalled();
      expect(alertsClient.logAlerts).toHaveBeenCalledWith({
        ruleRunMetricsStore,
        shouldLogAlerts: true,
      });
    });

    test('should handle reaching alert limit when rule type executor throws error', async () => {
      alertsClient.getMaxAlertLimit.mockReturnValueOnce(100);
      alertsClient.hasReachedAlertLimit.mockReturnValueOnce(true);
      alertsClient.hasReachedAlertLimit.mockReturnValueOnce(true);
      const err = new Error('executor error');
      ruleType.executor.mockImplementationOnce(() => {
        throw err;
      });

      const { state, error, stackTrace } = await ruleTypeRunner.run({
        context: {
          alertingEventLogger,
          flappingSettings: DEFAULT_FLAPPING_SETTINGS,
          queryDelaySec: 0,
          logger,
          request: fakeRequest,
          ruleId: RULE_ID,
          maintenanceWindowsService,
          ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
          ruleRunMetricsStore,
          spaceId: asSpaceId('default'),
          isServerless: false,
        },
        alertsClient,
        executionId: 'abc',
        executorServices: {
          getDataViews,
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          uiSettingsClient,
          wrappedScopedClusterClient,
          getWrappedSearchSourceClient,
          getAsyncSearchClient,
          getCpsData,
        },
        rule: mockedRule,
        ruleType,
        startedAt: new Date(DATE_1970),
        state: mockTaskInstance().state,
        validatedParams: mockedRuleParams,
      });

      expect(ruleType.executor).toHaveBeenCalledWith({
        executionId: 'abc',
        ruleExecutionTimeout: '5m',
        services: {
          alertFactory: alertsClient.factory(),
          alertsClient: alertsClient.client(),
          getDataViews: expect.any(Function),
          getMaintenanceWindowIds: expect.any(Function),
          getMaintenanceWindowNames: expect.any(Function),
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          scopedClusterClient: wrappedScopedClusterClient.client(),
          getSearchSourceClient: expect.any(Function),
          share: {},
          shouldStopExecution: expect.any(Function),
          shouldWriteAlerts: expect.any(Function),
          getAsyncSearchClient: expect.any(Function),
          uiSettingsClient,
        },
        params: mockedRuleParams,
        state: mockTaskInstance().state,
        startedAt: new Date(DATE_1970),
        startedAtOverridden: false,
        previousStartedAt: null,
        spaceId: 'default',
        isServerless: false,
        rule: {
          id: RULE_ID,
          name: mockedRule.name,
          tags: mockedRule.tags,
          consumer: mockedRule.consumer,
          producer: ruleType.producer,
          revision: mockedRule.revision,
          ruleTypeId: mockedRule.alertTypeId,
          ruleTypeName: ruleType.name,
          enabled: mockedRule.enabled,
          schedule: mockedRule.schedule,
          actions: mockedRule.actions,
          createdBy: mockedRule.createdBy,
          updatedBy: mockedRule.updatedBy,
          createdAt: mockedRule.createdAt,
          updatedAt: mockedRule.updatedAt,
          throttle: mockedRule.throttle,
          notifyWhen: mockedRule.notifyWhen,
          muteAll: mockedRule.muteAll,
          snoozeSchedule: mockedRule.snoozeSchedule,
          alertDelay: mockedRule.alertDelay,
        },
        logger,
        flappingSettings: DEFAULT_FLAPPING_SETTINGS,
        getTimeRange: expect.any(Function),
      });

      expect(logger.warn).toHaveBeenCalledWith(
        `rule execution generated greater than 100 alerts: test:1: 'rule-name'`
      );
      expect(ruleRunMetricsStore.setHasReachedAlertLimit).toHaveBeenCalledWith(true);
      expect(state).toBeUndefined();
      expect(error).toBeUndefined();
      expect(stackTrace).toBeUndefined();
      expect(alertsClient.checkLimitUsage).not.toHaveBeenCalled();
      expect(alertsClient.hasReachedAlertLimit).toHaveBeenCalled();
      expect(alertingEventLogger.setExecutionSucceeded).toHaveBeenCalledWith(
        `rule executed: ${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`
      );
      expect(ruleRunMetricsStore.setSearchMetrics).toHaveBeenCalled();
      expect(alertsClient.processAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineFlappingAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineDelayedAlerts).toHaveBeenCalledWith({
        alertDelay: 0,
        ruleRunMetricsStore,
      });
      expect(alertsClient.persistAlerts).toHaveBeenCalled();
      expect(alertsClient.logAlerts).toHaveBeenCalledWith({
        ruleRunMetricsStore,
        shouldLogAlerts: true,
      });
    });

    test('should throw error if alertsClient.processAlerts throws error', async () => {
      alertsClient.processAlerts.mockImplementationOnce(() => {
        throw new Error('process alerts failed');
      });

      ruleType.executor.mockResolvedValueOnce({ state: { foo: 'bar' } });

      await expect(
        ruleTypeRunner.run({
          context: {
            alertingEventLogger,
            flappingSettings: DEFAULT_FLAPPING_SETTINGS,
            queryDelaySec: 0,
            logger,
            request: fakeRequest,
            maintenanceWindowsService,
            ruleId: RULE_ID,
            ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
            ruleRunMetricsStore,
            spaceId: asSpaceId('default'),
            isServerless: false,
          },
          alertsClient,
          executionId: 'abc',
          executorServices: {
            getDataViews,
            ruleMonitoringService: publicRuleMonitoringService,
            ruleResultService: publicRuleResultService,
            savedObjectsClient,
            uiSettingsClient,
            wrappedScopedClusterClient,
            getWrappedSearchSourceClient,
            getAsyncSearchClient,
            getCpsData,
          },
          rule: mockedRule,
          ruleType,
          startedAt: new Date(DATE_1970),
          state: mockTaskInstance().state,
          validatedParams: mockedRuleParams,
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"process alerts failed"`);

      expect(ruleType.executor).toHaveBeenCalledWith({
        executionId: 'abc',
        ruleExecutionTimeout: '5m',
        services: {
          alertFactory: alertsClient.factory(),
          alertsClient: alertsClient.client(),
          getDataViews: expect.any(Function),
          getMaintenanceWindowIds: expect.any(Function),
          getMaintenanceWindowNames: expect.any(Function),
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          scopedClusterClient: wrappedScopedClusterClient.client(),
          getSearchSourceClient: expect.any(Function),
          share: {},
          shouldStopExecution: expect.any(Function),
          shouldWriteAlerts: expect.any(Function),
          getAsyncSearchClient: expect.any(Function),
          uiSettingsClient,
        },
        params: mockedRuleParams,
        state: mockTaskInstance().state,
        startedAt: new Date(DATE_1970),
        startedAtOverridden: false,
        previousStartedAt: null,
        spaceId: 'default',
        isServerless: false,
        rule: {
          id: RULE_ID,
          name: mockedRule.name,
          tags: mockedRule.tags,
          consumer: mockedRule.consumer,
          producer: ruleType.producer,
          revision: mockedRule.revision,
          ruleTypeId: mockedRule.alertTypeId,
          ruleTypeName: ruleType.name,
          enabled: mockedRule.enabled,
          schedule: mockedRule.schedule,
          actions: mockedRule.actions,
          createdBy: mockedRule.createdBy,
          updatedBy: mockedRule.updatedBy,
          createdAt: mockedRule.createdAt,
          updatedAt: mockedRule.updatedAt,
          throttle: mockedRule.throttle,
          notifyWhen: mockedRule.notifyWhen,
          muteAll: mockedRule.muteAll,
          snoozeSchedule: mockedRule.snoozeSchedule,
          alertDelay: mockedRule.alertDelay,
        },
        logger,
        flappingSettings: DEFAULT_FLAPPING_SETTINGS,
        getTimeRange: expect.any(Function),
      });

      expect(alertsClient.hasReachedAlertLimit).toHaveBeenCalled();
      expect(alertsClient.checkLimitUsage).toHaveBeenCalled();
      expect(alertingEventLogger.setExecutionSucceeded).toHaveBeenCalledWith(
        `rule executed: ${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`
      );
      expect(ruleRunMetricsStore.setSearchMetrics).toHaveBeenCalled();
      expect(alertsClient.processAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineFlappingAlerts).not.toHaveBeenCalled();
      expect(alertsClient.determineDelayedAlerts).not.toHaveBeenCalled();
      expect(alertsClient.persistAlerts).not.toHaveBeenCalled();
      expect(alertsClient.logAlerts).not.toHaveBeenCalled();
    });

    test('should throw error if alertsClient.persistAlerts throws error', async () => {
      alertsClient.persistAlerts.mockImplementationOnce(() => {
        throw new Error('persist alerts failed');
      });

      ruleType.executor.mockResolvedValueOnce({ state: { foo: 'bar' } });

      await expect(
        ruleTypeRunner.run({
          context: {
            alertingEventLogger,
            flappingSettings: DEFAULT_FLAPPING_SETTINGS,
            request: fakeRequest,
            queryDelaySec: 0,
            logger,
            ruleId: RULE_ID,
            maintenanceWindowsService,
            ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
            ruleRunMetricsStore,
            spaceId: asSpaceId('default'),
            isServerless: false,
          },
          alertsClient,
          executionId: 'abc',
          executorServices: {
            getDataViews,
            ruleMonitoringService: publicRuleMonitoringService,
            ruleResultService: publicRuleResultService,
            savedObjectsClient,
            uiSettingsClient,
            wrappedScopedClusterClient,
            getWrappedSearchSourceClient,
            getAsyncSearchClient,
            getCpsData,
          },
          rule: mockedRule,
          ruleType,
          startedAt: new Date(DATE_1970),
          state: mockTaskInstance().state,
          validatedParams: mockedRuleParams,
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"persist alerts failed"`);

      expect(ruleType.executor).toHaveBeenCalledWith({
        executionId: 'abc',
        ruleExecutionTimeout: '5m',
        services: {
          alertFactory: alertsClient.factory(),
          alertsClient: alertsClient.client(),
          getDataViews: expect.any(Function),
          getMaintenanceWindowIds: expect.any(Function),
          getMaintenanceWindowNames: expect.any(Function),
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          scopedClusterClient: wrappedScopedClusterClient.client(),
          getSearchSourceClient: expect.any(Function),
          share: {},
          shouldStopExecution: expect.any(Function),
          shouldWriteAlerts: expect.any(Function),
          getAsyncSearchClient: expect.any(Function),
          uiSettingsClient,
        },
        params: mockedRuleParams,
        state: mockTaskInstance().state,
        startedAt: new Date(DATE_1970),
        startedAtOverridden: false,
        previousStartedAt: null,
        spaceId: 'default',
        isServerless: false,
        rule: {
          id: RULE_ID,
          name: mockedRule.name,
          tags: mockedRule.tags,
          consumer: mockedRule.consumer,
          producer: ruleType.producer,
          revision: mockedRule.revision,
          ruleTypeId: mockedRule.alertTypeId,
          ruleTypeName: ruleType.name,
          enabled: mockedRule.enabled,
          schedule: mockedRule.schedule,
          actions: mockedRule.actions,
          createdBy: mockedRule.createdBy,
          updatedBy: mockedRule.updatedBy,
          createdAt: mockedRule.createdAt,
          updatedAt: mockedRule.updatedAt,
          throttle: mockedRule.throttle,
          notifyWhen: mockedRule.notifyWhen,
          muteAll: mockedRule.muteAll,
          snoozeSchedule: mockedRule.snoozeSchedule,
          alertDelay: mockedRule.alertDelay,
        },
        logger,
        flappingSettings: DEFAULT_FLAPPING_SETTINGS,
        getTimeRange: expect.any(Function),
      });

      expect(alertsClient.hasReachedAlertLimit).toHaveBeenCalled();
      expect(alertsClient.checkLimitUsage).toHaveBeenCalled();
      expect(alertingEventLogger.setExecutionSucceeded).toHaveBeenCalledWith(
        `rule executed: ${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`
      );
      expect(ruleRunMetricsStore.setSearchMetrics).toHaveBeenCalled();
      expect(alertsClient.processAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineFlappingAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineDelayedAlerts).toHaveBeenCalledWith({
        alertDelay: 0,
        ruleRunMetricsStore,
      });
      expect(alertsClient.persistAlerts).toHaveBeenCalled();
      expect(alertsClient.logAlerts).not.toHaveBeenCalled();
    });

    test('should throw error if alertsClient.logAlerts throws error', async () => {
      alertsClient.logAlerts.mockImplementationOnce(() => {
        throw new Error('log alerts failed');
      });

      ruleType.executor.mockResolvedValueOnce({ state: { foo: 'bar' } });

      await expect(
        ruleTypeRunner.run({
          context: {
            alertingEventLogger,
            flappingSettings: DEFAULT_FLAPPING_SETTINGS,
            queryDelaySec: 0,
            request: fakeRequest,
            logger,
            maintenanceWindowsService,
            ruleId: RULE_ID,
            ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
            ruleRunMetricsStore,
            spaceId: asSpaceId('default'),
            isServerless: false,
          },
          alertsClient,
          executionId: 'abc',
          executorServices: {
            getDataViews,
            ruleMonitoringService: publicRuleMonitoringService,
            ruleResultService: publicRuleResultService,
            savedObjectsClient,
            uiSettingsClient,
            wrappedScopedClusterClient,
            getWrappedSearchSourceClient,
            getAsyncSearchClient,
            getCpsData,
          },
          rule: mockedRule,
          ruleType,
          startedAt: new Date(DATE_1970),
          state: mockTaskInstance().state,
          validatedParams: mockedRuleParams,
        })
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"log alerts failed"`);

      expect(ruleType.executor).toHaveBeenCalledWith({
        executionId: 'abc',
        ruleExecutionTimeout: '5m',
        services: {
          alertFactory: alertsClient.factory(),
          alertsClient: alertsClient.client(),
          getMaintenanceWindowIds: expect.any(Function),
          getMaintenanceWindowNames: expect.any(Function),
          getDataViews: expect.any(Function),
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          scopedClusterClient: wrappedScopedClusterClient.client(),
          getSearchSourceClient: expect.any(Function),
          share: {},
          shouldStopExecution: expect.any(Function),
          shouldWriteAlerts: expect.any(Function),
          getAsyncSearchClient: expect.any(Function),
          uiSettingsClient,
        },
        params: mockedRuleParams,
        state: mockTaskInstance().state,
        startedAt: new Date(DATE_1970),
        startedAtOverridden: false,
        previousStartedAt: null,
        spaceId: 'default',
        isServerless: false,
        rule: {
          id: RULE_ID,
          name: mockedRule.name,
          tags: mockedRule.tags,
          consumer: mockedRule.consumer,
          producer: ruleType.producer,
          revision: mockedRule.revision,
          ruleTypeId: mockedRule.alertTypeId,
          ruleTypeName: ruleType.name,
          enabled: mockedRule.enabled,
          schedule: mockedRule.schedule,
          actions: mockedRule.actions,
          createdBy: mockedRule.createdBy,
          updatedBy: mockedRule.updatedBy,
          createdAt: mockedRule.createdAt,
          updatedAt: mockedRule.updatedAt,
          throttle: mockedRule.throttle,
          notifyWhen: mockedRule.notifyWhen,
          muteAll: mockedRule.muteAll,
          snoozeSchedule: mockedRule.snoozeSchedule,
          alertDelay: mockedRule.alertDelay,
        },
        logger,
        flappingSettings: DEFAULT_FLAPPING_SETTINGS,
        getTimeRange: expect.any(Function),
      });

      expect(alertsClient.hasReachedAlertLimit).toHaveBeenCalled();
      expect(alertsClient.checkLimitUsage).toHaveBeenCalled();
      expect(alertingEventLogger.setExecutionSucceeded).toHaveBeenCalledWith(
        `rule executed: ${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`
      );
      expect(ruleRunMetricsStore.setSearchMetrics).toHaveBeenCalled();
      expect(alertsClient.processAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineFlappingAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineDelayedAlerts).toHaveBeenCalledWith({
        alertDelay: 0,
        ruleRunMetricsStore,
      });
      expect(alertsClient.persistAlerts).toHaveBeenCalled();
      expect(alertsClient.logAlerts).toHaveBeenCalledWith({
        ruleRunMetricsStore,
        shouldLogAlerts: true,
      });
    });

    test('should call executor with custom ruleExecutionTimeout', async () => {
      const mockRuleExecutionTimeout = '15m';

      await ruleTypeRunner.run({
        context: {
          alertingEventLogger,
          flappingSettings: DEFAULT_FLAPPING_SETTINGS,
          queryDelaySec: 0,
          logger,
          request: fakeRequest,
          maintenanceWindowsService,
          ruleId: RULE_ID,
          ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
          ruleRunMetricsStore,
          spaceId: asSpaceId('default'),
          isServerless: false,
        },
        alertsClient,
        executionId: 'abc',
        executorServices: {
          getDataViews,
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          uiSettingsClient,
          wrappedScopedClusterClient,
          getWrappedSearchSourceClient,
          getAsyncSearchClient,
          getCpsData,
        },
        rule: mockedRule,
        ruleType: { ...ruleType, ruleTaskTimeout: mockRuleExecutionTimeout },
        startedAt: new Date(DATE_1970),
        state: mockTaskInstance().state,
        validatedParams: mockedRuleParams,
      });

      expect(ruleType.executor).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleExecutionTimeout: mockRuleExecutionTimeout,
        })
      );
    });
  });

  describe('lastEnabledAt', () => {
    const getRunOpts = (rule: RuleData<Record<string, unknown>>) => ({
      context: {
        alertingEventLogger,
        logger,
        maintenanceWindowsService,
        flappingSettings: DEFAULT_FLAPPING_SETTINGS,
        queryDelaySec: 0,
        request: fakeRequest,
        ruleId: RULE_ID,
        ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
        ruleRunMetricsStore,
        spaceId: asSpaceId('default'),
        isServerless: false,
      },
      alertsClient,
      executionId: 'abc',
      executorServices: {
        getDataViews,
        ruleMonitoringService: publicRuleMonitoringService,
        ruleResultService: publicRuleResultService,
        savedObjectsClient,
        uiSettingsClient,
        wrappedScopedClusterClient,
        getWrappedSearchSourceClient,
        getAsyncSearchClient,
        getCpsData,
      },
      rule,
      ruleType,
      startedAt: new Date(DATE_1970),
      state: mockTaskInstance().state,
      validatedParams: mockedRuleParams,
    });

    test('should pass lastEnabledAt to executor when present', async () => {
      const enabledAt = new Date('2024-01-15T10:00:00.000Z');
      ruleType.executor.mockResolvedValueOnce({ state: { foo: 'bar' } });

      await ruleTypeRunner.run(getRunOpts({ ...mockedRule, lastEnabledAt: enabledAt }));

      expect(ruleType.executor).toHaveBeenCalledWith(
        expect.objectContaining({
          rule: expect.objectContaining({ lastEnabledAt: enabledAt }),
        })
      );
    });

    test('should not include lastEnabledAt when it is undefined', async () => {
      ruleType.executor.mockResolvedValueOnce({ state: { foo: 'bar' } });

      await ruleTypeRunner.run(getRunOpts(mockedRule));

      const executorCall = ruleType.executor.mock.calls[0][0];
      expect(executorCall.rule).not.toHaveProperty('lastEnabledAt');
    });
  });

  describe('cancel', () => {
    test('should not persist or log alerts if rule run is cancelled due to timeout', async () => {
      ruleType.executor.mockResolvedValueOnce({ state: { foo: 'bar' } });

      const promise = ruleTypeRunner.run({
        context: {
          alertingEventLogger,
          logger,
          maintenanceWindowsService,
          flappingSettings: DEFAULT_FLAPPING_SETTINGS,
          queryDelaySec: 0,
          request: fakeRequest,
          ruleId: RULE_ID,
          ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
          ruleRunMetricsStore,
          spaceId: asSpaceId('default'),
          isServerless: false,
        },
        alertsClient,
        executionId: 'abc',
        executorServices: {
          getDataViews,
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          uiSettingsClient,
          wrappedScopedClusterClient,
          getWrappedSearchSourceClient,
          getAsyncSearchClient,
          getCpsData,
        },
        rule: mockedRule,
        ruleType,
        startedAt: new Date(DATE_1970),
        state: mockTaskInstance().state,
        validatedParams: mockedRuleParams,
      });
      await Promise.resolve();
      await ruleTypeRunner.cancelRun();
      await promise;

      expect(alertsClient.hasReachedAlertLimit).toHaveBeenCalled();
      expect(alertsClient.checkLimitUsage).toHaveBeenCalled();
      expect(alertingEventLogger.setExecutionSucceeded).toHaveBeenCalledWith(
        `rule executed: ${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`
      );
      expect(ruleRunMetricsStore.setSearchMetrics).toHaveBeenCalled();
      expect(alertsClient.processAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineFlappingAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineDelayedAlerts).toHaveBeenCalledWith({
        alertDelay: 0,
        ruleRunMetricsStore,
      });
      expect(alertsClient.persistAlerts).not.toHaveBeenCalled();
      expect(alertsClient.logAlerts).toHaveBeenCalledWith({
        ruleRunMetricsStore,
        shouldLogAlerts: false,
      });
    });

    test('should persist and log alerts if rule run is cancelled due to timeout but cancelAlertsOnRuleTimeout from config is false', async () => {
      const newContext = {
        ...context,
        cancelAlertsOnRuleTimeout: false,
      };
      ruleType.executor.mockResolvedValueOnce({ state: { foo: 'bar' } });

      const thisRuleTypeRunner = new RuleTypeRunner<
        {},
        {},
        { foo: string },
        {},
        {},
        'default',
        'recovered',
        {}
      >({
        context: newContext,
        task: mockedTaskInstance,
        timer,
      });

      const promise = thisRuleTypeRunner.run({
        context: {
          alertingEventLogger,
          logger,
          maintenanceWindowsService,
          flappingSettings: DEFAULT_FLAPPING_SETTINGS,
          queryDelaySec: 0,
          request: fakeRequest,
          ruleId: RULE_ID,
          ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
          ruleRunMetricsStore,
          spaceId: asSpaceId('default'),
          isServerless: false,
        },
        alertsClient,
        executionId: 'abc',
        executorServices: {
          getDataViews,
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          uiSettingsClient,
          wrappedScopedClusterClient,
          getWrappedSearchSourceClient,
          getAsyncSearchClient,
          getCpsData,
        },
        rule: mockedRule,
        ruleType,
        startedAt: new Date(DATE_1970),
        state: mockTaskInstance().state,
        validatedParams: mockedRuleParams,
      });
      await Promise.resolve();
      await thisRuleTypeRunner.cancelRun();
      await promise;

      expect(alertsClient.hasReachedAlertLimit).toHaveBeenCalled();
      expect(alertsClient.checkLimitUsage).toHaveBeenCalled();
      expect(alertingEventLogger.setExecutionSucceeded).toHaveBeenCalledWith(
        `rule executed: ${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`
      );
      expect(ruleRunMetricsStore.setSearchMetrics).toHaveBeenCalled();
      expect(alertsClient.processAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineFlappingAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineDelayedAlerts).toHaveBeenCalledWith({
        alertDelay: 0,
        ruleRunMetricsStore,
      });
      expect(alertsClient.persistAlerts).toHaveBeenCalled();
      expect(alertsClient.logAlerts).toHaveBeenCalledWith({
        ruleRunMetricsStore,
        shouldLogAlerts: true,
      });
    });

    test('should persist and log alerts if rule run is cancelled due to timeout but cancelAlertsOnRuleTimeout for ruleType is false', async () => {
      ruleType.cancelAlertsOnRuleTimeout = false;
      ruleType.executor.mockResolvedValueOnce({ state: { foo: 'bar' } });

      const promise = ruleTypeRunner.run({
        context: {
          alertingEventLogger,
          logger,
          maintenanceWindowsService,
          flappingSettings: DEFAULT_FLAPPING_SETTINGS,
          queryDelaySec: 0,
          request: fakeRequest,
          ruleId: RULE_ID,
          ruleLogPrefix: `${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`,
          ruleRunMetricsStore,
          spaceId: asSpaceId('default'),
          isServerless: false,
        },
        alertsClient,
        executionId: 'abc',
        executorServices: {
          getDataViews,
          ruleMonitoringService: publicRuleMonitoringService,
          ruleResultService: publicRuleResultService,
          savedObjectsClient,
          uiSettingsClient,
          wrappedScopedClusterClient,
          getWrappedSearchSourceClient,
          getAsyncSearchClient,
          getCpsData,
        },
        rule: mockedRule,
        ruleType,
        startedAt: new Date(DATE_1970),
        state: mockTaskInstance().state,
        validatedParams: mockedRuleParams,
      });
      await Promise.resolve();
      await ruleTypeRunner.cancelRun();
      await promise;

      expect(alertsClient.hasReachedAlertLimit).toHaveBeenCalled();
      expect(alertsClient.checkLimitUsage).toHaveBeenCalled();
      expect(alertingEventLogger.setExecutionSucceeded).toHaveBeenCalledWith(
        `rule executed: ${RULE_TYPE_ID}:${RULE_ID}: '${RULE_NAME}'`
      );
      expect(ruleRunMetricsStore.setSearchMetrics).toHaveBeenCalled();
      expect(alertsClient.processAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineFlappingAlerts).toHaveBeenCalledWith();
      expect(alertsClient.determineDelayedAlerts).toHaveBeenCalledWith({
        alertDelay: 0,
        ruleRunMetricsStore,
      });
      expect(alertsClient.persistAlerts).toHaveBeenCalled();
      expect(alertsClient.logAlerts).toHaveBeenCalledWith({
        ruleRunMetricsStore,
        shouldLogAlerts: true,
      });
    });
  });
});

// return enough of TaskRunnerContext that RuleTypeRunner needs
function getTaskRunnerContext() {
  return {
    cancelAlertsOnRuleTimeout: true,
    maxAlerts: 100,
    executionContext: executionContextServiceMock.createInternalStartContract(),
    share: {} as SharePluginStart,
  };
}
