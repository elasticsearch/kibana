/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import sinon from 'sinon';
import { errors } from '@elastic/elasticsearch';
import { usageCountersServiceMock } from '@kbn/usage-collection-plugin/server/usage_counters/usage_counters_service.mock';
import type { SavedObject } from '@kbn/core/server';
import type {
  RuleExecutorOptions,
  RuleTypeParams,
  RuleTypeState,
  AlertInstanceState,
  AlertInstanceContext,
  Rule,
  RuleAction,
  RuleAlertData,
} from '../types';
import {
  RuleExecutionStatusWarningReasons,
  DEFAULT_FLAPPING_SETTINGS,
  DEFAULT_QUERY_DELAY_SETTINGS,
  type RawRule,
} from '../types';
import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import {
  createTaskRunError,
  isUnrecoverableError,
  TaskErrorSource,
} from '@kbn/task-manager-plugin/server';
import type { TaskRunnerContext } from './types';
import { ApiKeyType } from './types';
import { TaskRunner } from './task_runner';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import {
  loggingSystemMock,
  savedObjectsRepositoryMock,
  executionContextServiceMock,
  savedObjectsServiceMock,
  elasticsearchServiceMock,
  uiSettingsServiceMock,
  securityServiceMock,
} from '@kbn/core/server/mocks';
import type { PluginStartContract as ActionsPluginStart } from '@kbn/actions-plugin/server';
import { actionsMock, actionsClientMock } from '@kbn/actions-plugin/server/mocks';
import { alertsMock } from '../mocks';
import { eventLoggerMock } from '@kbn/event-log-plugin/server/event_logger.mock';
import type { IEventLogger } from '@kbn/event-log-plugin/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { MaintenanceWindow } from '@kbn/maintenance-windows-plugin/common';
import { omit } from 'lodash';
import { ruleTypeRegistryMock } from '../rule_type_registry.mock';
import { inMemoryMetricsMock } from '../monitoring/in_memory_metrics.mock';
import moment from 'moment';
import {
  generateAlertOpts,
  generateActionOpts,
  mockDate,
  mockedRuleTypeSavedObject,
  ruleType,
  RULE_NAME,
  generateRunnerResult,
  RULE_ACTIONS,
  generateEnqueueFunctionInput,
  generateRuleUpdateParams,
  mockTaskInstance,
  GENERIC_ERROR_MESSAGE,
  generateAlertInstance,
  MOCK_DURATION,
  DATE_1969,
  DATE_1970,
  DATE_1970_5_MIN,
  DATE_9999,
  mockAAD,
  mockedRawRuleSO,
} from './fixtures';
import { EVENT_LOG_ACTIONS } from '../plugin';
import { IN_MEMORY_METRICS } from '../monitoring';
import { translations } from '../constants/translations';
import { gapReasonType } from '../../common/constants';
import { dataPluginMock } from '@kbn/data-plugin/server/mocks';
import type { ContextOpts } from '../lib/alerting_event_logger/alerting_event_logger';
import { AlertingEventLogger } from '../lib/alerting_event_logger/alerting_event_logger';
import { getAlertFromRaw } from '../rules_client/lib/get_alert_from_raw';
import { alertingEventLoggerMock } from '../lib/alerting_event_logger/alerting_event_logger.mock';
import type { SharePluginStart } from '@kbn/share-plugin/server';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import type { DataViewsServerPluginStart } from '@kbn/data-views-plugin/server';
import { alertsServiceMock } from '../alerts_service/alerts_service.mock';
import { ConnectorAdapterRegistry } from '../connector_adapters/connector_adapter_registry';
import { alertsClientMock } from '../alerts_client/alerts_client.mock';
import { RULE_SAVED_OBJECT_TYPE } from '../saved_objects';
import { getErrorSource } from '@kbn/task-manager-plugin/server/task_running';
import { RuleResultService } from '../monitoring/rule_result_service';
import { RuleMonitoringService } from '../monitoring/rule_monitoring_service';
import { ruleResultServiceMock } from '../monitoring/rule_result_service.mock';
import { backfillClientMock } from '../backfill_client/backfill_client.mock';
import type { UntypedNormalizedRuleType } from '../rule_type_registry';
import * as getExecutorServicesModule from './get_executor_services';
import { rulesSettingsServiceMock } from '../rules_settings/rules_settings_service.mock';
import {
  getMockMaintenanceWindow,
  maintenanceWindowsServiceMock,
} from './maintenance_windows/maintenance_windows_service.mock';
import { ErrorWithType } from '../lib/error_with_type';
import { eventLogClientMock } from '@kbn/event-log-plugin/server/mocks';

const RULE_EXECUTION_UUID = '5f6aa57d-3e22-484e-bae8-cbed868f4d28';
jest.mock('uuid', () => ({
  v4: () => '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
}));

jest.mock('../lib/wrap_scoped_cluster_client', () => ({
  createWrappedScopedClusterClientFactory: jest.fn(),
}));

jest.mock('../lib/alerting_event_logger/alerting_event_logger');
jest.mock('../monitoring/rule_result_service');

jest.mock('../rules_client/lib/get_alert_from_raw');
const mockGetRuleFromRaw = getAlertFromRaw as jest.MockedFunction<typeof getAlertFromRaw>;

jest.spyOn(getExecutorServicesModule, 'getExecutorServices');

let fakeTimer: sinon.SinonFakeTimers;
const logger: ReturnType<typeof loggingSystemMock.createLogger> = loggingSystemMock.createLogger();

const mockUsageCountersSetup = usageCountersServiceMock.createSetupContract();
const mockUsageCounter = mockUsageCountersSetup.createUsageCounter('test');
const alertingEventLogger = alertingEventLoggerMock.create();
const alertsClient = alertsClientMock.create();
const ruleResultService = ruleResultServiceMock.create();
const maintenanceWindowsService = maintenanceWindowsServiceMock.create();

describe('Task Runner', () => {
  let mockedTaskInstance: ConcreteTaskInstance;
  let alertingEventLoggerInitializer: ContextOpts;

  beforeAll(() => {
    fakeTimer = sinon.useFakeTimers();
    mockedTaskInstance = mockTaskInstance();

    alertingEventLoggerInitializer = {
      executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
      savedObjectId: mockedTaskInstance.params.alertId,
      savedObjectType: RULE_SAVED_OBJECT_TYPE,
      spaceId: mockedTaskInstance.params.spaceId,
      taskScheduledAt: mockedTaskInstance.scheduledAt,
    };
  });

  afterAll(() => fakeTimer.restore());

  const encryptedSavedObjectsClient = encryptedSavedObjectsMock.createClient();
  const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();
  const backfillClient = backfillClientMock.create();
  const services = alertsMock.createRuleExecutorServices();
  const actionsClient = actionsClientMock.create();
  const ruleTypeRegistry = ruleTypeRegistryMock.create();
  const savedObjectsService = savedObjectsServiceMock.createInternalStartContract();
  const elasticsearchService = elasticsearchServiceMock.createInternalStart();
  const dataPlugin = dataPluginMock.createStartContract();
  const uiSettingsService = uiSettingsServiceMock.createStartContract();
  const inMemoryMetrics = inMemoryMetricsMock.create();
  const dataViewsMock = {
    dataViewsServiceFactory: jest.fn().mockResolvedValue(dataViewPluginMocks.createStartContract()),
    getScriptedFieldsEnabled: jest.fn().mockReturnValue(true),
  } as DataViewsServerPluginStart;
  const alertsService = alertsServiceMock.create();
  const connectorAdapterRegistry = new ConnectorAdapterRegistry();
  const rulesSettingsService = rulesSettingsServiceMock.create();
  const auditService = securityServiceMock.createStart().audit;

  type TaskRunnerFactoryInitializerParamsType = jest.Mocked<TaskRunnerContext> & {
    actionsPlugin: jest.Mocked<ActionsPluginStart>;
    eventLogger: jest.Mocked<IEventLogger>;
    executionContext: ReturnType<typeof executionContextServiceMock.createInternalStartContract>;
  };

  const taskRunnerFactoryInitializerParams: TaskRunnerFactoryInitializerParamsType = {
    actionsConfigMap: { default: { max: 1000 } },
    actionsPlugin: actionsMock.createStart(),
    alertsService,
    auditService,
    backfillClient,
    cancelAlertsOnRuleTimeout: true,
    connectorAdapterRegistry,
    data: dataPlugin,
    dataViews: dataViewsMock,
    elasticsearch: elasticsearchService,
    encryptedSavedObjectsClient,
    eventLogger: eventLoggerMock.create(),
    executionContext: executionContextServiceMock.createInternalStartContract(),
    kibanaBaseUrl: 'https://localhost:5601',
    logger,
    maintenanceWindowsService,
    maxAlerts: 1000,
    ruleTypeRegistry,
    rulesSettingsService,
    savedObjects: savedObjectsService,
    share: {} as SharePluginStart,
    spaceIdToNamespace: jest.fn().mockReturnValue(undefined),
    uiSettings: uiSettingsService,
    usageCounter: mockUsageCounter,
    isServerless: false,
    getEventLogClient: jest.fn().mockReturnValue(eventLogClientMock.create()),
    apiKeyType: ApiKeyType.ES,
    shouldGrantUiam: false,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks(); // clear spy mock implementations
    logger.isLevelEnabled.mockReturnValue(true);
    jest
      .requireMock('../lib/wrap_scoped_cluster_client')
      .createWrappedScopedClusterClientFactory.mockReturnValue({
        client: () => services.scopedClusterClient,
        getMetrics: () => ({
          numSearches: 3,
          esSearchDurationMs: 33,
          totalSearchDurationMs: 23423,
        }),
      });
    savedObjectsService.getScopedClient.mockReturnValue(services.savedObjectsClient);
    elasticsearchService.client.asScoped.mockReturnValue(services.scopedClusterClient);
    taskRunnerFactoryInitializerParams.actionsPlugin.getActionsClientWithRequest.mockResolvedValue(
      actionsClient
    );
    taskRunnerFactoryInitializerParams.actionsPlugin.renderActionParameterTemplates.mockImplementation(
      (actionTypeId, actionId, params) => params
    );
    rulesSettingsService.getSettings.mockResolvedValue({
      flappingSettings: DEFAULT_FLAPPING_SETTINGS,
      queryDelaySettings: DEFAULT_QUERY_DELAY_SETTINGS,
    });
    maintenanceWindowsService.getMaintenanceWindows.mockResolvedValue({
      maintenanceWindows: [],
      maintenanceWindowsWithoutScopedQueryIds: [],
    });
    ruleTypeRegistry.get.mockReturnValue(ruleType);
    taskRunnerFactoryInitializerParams.executionContext.withContext.mockImplementation((ctx, fn) =>
      fn()
    );
    mockedRuleTypeSavedObject.monitoring!.run.history = [];
    mockedRuleTypeSavedObject.monitoring!.run.calculated_metrics.success_ratio = 0;

    alertingEventLogger.getStartAndDuration.mockImplementation(() => ({ start: new Date() }));
    (AlertingEventLogger as jest.Mock).mockImplementation(() => alertingEventLogger);
    logger.get.mockImplementation(() => logger);

    ruleType.executor.mockResolvedValue({ state: {} });

    actionsClient.bulkEnqueueExecution.mockResolvedValue({ errors: false, items: [] });

    alertsClient.updatePersistedAlerts.mockResolvedValue({
      failures: [],
      updated: 0,
      total: 1,
    });

    ruleResultService.getLastRunResults.mockImplementation(() => ({
      errors: [],
      warnings: [],
      outcomeMessage: '',
    }));
    (RuleResultService as jest.Mock).mockImplementation(() => ruleResultService);
  });

  const createTaskRunner = (overrides: Partial<ConstructorParameters<typeof TaskRunner>[0]> = {}) =>
    new TaskRunner({
      ruleType,
      taskInstance: mockedTaskInstance,
      context: taskRunnerFactoryInitializerParams,
      inMemoryMetrics,
      internalSavedObjectsRepository,
      executionUuid: RULE_EXECUTION_UUID,
      ...overrides,
    });

  test('successfully executes the task', async () => {
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          previousStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    const runnerResult = await taskRunner.run();
    expect(runnerResult).toEqual(generateRunnerResult({ state: true, history: [true] }));

    expect(ruleType.executor).toHaveBeenCalledTimes(1);
    const call = ruleType.executor.mock.calls[0][0];
    expect(call.params).toEqual({ bar: true });
    expect(call.startedAt).toStrictEqual(new Date(DATE_1970));
    expect(call.previousStartedAt).toStrictEqual(new Date(DATE_1970_5_MIN));
    expect(call.state).toEqual({});
    expect(call.rule).not.toBe(null);
    expect(call.rule.id).toBe('1');
    expect(call.rule.name).toBe(RULE_NAME);
    expect(call.rule.tags).toEqual(['rule-', '-tags']);
    expect(call.rule.consumer).toBe('bar');
    expect(call.rule.enabled).toBe(true);
    expect(call.rule.schedule).toEqual({ interval: '10s' });
    expect(call.rule.createdBy).toBe('rule-creator');
    expect(call.rule.updatedBy).toBe('rule-updater');
    expect(call.rule.createdAt).toBe(mockDate);
    expect(call.rule.updatedAt).toBe(mockDate);
    expect(call.rule.notifyWhen).toBe('onActiveAlert');
    expect(call.rule.throttle).toBe(null);
    expect(call.rule.producer).toBe('alerts');
    expect(call.rule.ruleTypeId).toBe('test');
    expect(call.rule.ruleTypeName).toBe('My test rule');
    expect(call.rule.actions).toEqual(RULE_ACTIONS);
    expect(call.services.alertFactory.create).toBeTruthy();
    expect(call.services.alertsClient).toBe(null);
    expect(call.services.scopedClusterClient).toBeTruthy();
    expect(call.services).toBeTruthy();

    expect(logger.debug).toHaveBeenCalledTimes(5);
    expect(logger.debug).nthCalledWith(1, 'executing rule test:1 at 1970-01-01T00:00:00.000Z', {
      tags: ['1', 'test'],
    });
    expect(logger.debug).nthCalledWith(
      2,
      'deprecated ruleRunStatus for test:1: {"lastExecutionDate":"1970-01-01T00:00:00.000Z","status":"ok"}',
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      3,
      'ruleRunStatus for test:1: {"outcome":"succeeded","outcomeOrder":0,"outcomeMsg":null,"warning":null,"alertsCount":{"active":0,"new":0,"recovered":0,"ignored":0}}',
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      4,
      'ruleRunMetrics for test:1: {"numSearches":3,"totalSearchDurationMs":23423,"esSearchDurationMs":33,"numberOfTriggeredActions":0,"numberOfGeneratedActions":0,"numberOfActiveAlerts":0,"numberOfRecoveredAlerts":0,"numberOfNewAlerts":0,"numberOfDelayedAlerts":0,"hasReachedAlertLimit":false,"hasReachedQueuedActionsLimit":false,"triggeredActionsStatus":"complete"}',
      { tags: ['1', 'test'] }
    );

    testAlertingEventLogCalls({ status: 'ok' });

    expect(elasticsearchService.client.asInternalUser.update).toHaveBeenCalledWith(
      ...generateRuleUpdateParams({
        metrics: {
          total_search_duration_ms: 23423,
        },
      })
    );

    expect(taskRunnerFactoryInitializerParams.executionContext.withContext).toBeCalledTimes(1);
    expect(taskRunnerFactoryInitializerParams.executionContext.withContext).toHaveBeenCalledWith(
      {
        id: '1',
        name: 'execute test',
        type: 'alert',
        description: 'execute [test] with name [rule-name] in [default] namespace',
      },
      expect.any(Function)
    );
    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
    expect(
      jest.requireMock('../lib/wrap_scoped_cluster_client').createWrappedScopedClusterClientFactory
    ).toHaveBeenCalled();
  });

  test('uses executionUuid from constructor as the rule execution id', async () => {
    const executionUuid = 'custom-execution-uuid-from-task-manager';
    const taskRunner = createTaskRunner({ executionUuid });

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();

    expect(alertingEventLogger.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ executionId: executionUuid }),
      })
    );
  });

  test('passes total_search_duration_ms from execution metrics into rule monitoring via addFrameworkMetrics', async () => {
    const addFrameworkMetricsSpy = jest.spyOn(
      RuleMonitoringService.prototype,
      'addFrameworkMetrics'
    );
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          previousStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        },
      },
    });

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    await taskRunner.run();

    expect(addFrameworkMetricsSpy).toHaveBeenCalledWith({
      total_search_duration_ms: 23423,
    });
    addFrameworkMetricsSpy.mockRestore();
  });

  test('passes consumer metrics to AlertingEventLogger', async () => {
    const consumerMetrics = {
      matched_indices_count: 3,
      frozen_indices_queried_count: 3,
      alerts_candidate_count: 42,
      alerts_suppressed_count: 7,
    };
    ruleType.executor.mockImplementation(async ({ services: { ruleMonitoringService } }) => {
      ruleMonitoringService?.setMetrics(consumerMetrics);
      return { state: {} };
    });

    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          previousStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        },
      },
    });

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    await taskRunner.run();

    expect(alertingEventLogger.done).toHaveBeenCalledWith(
      expect.objectContaining({
        consumerMetrics,
      })
    );
  });

  test('should update the persisted alerts', async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(async () => {
      return { state: {} };
    });
    alertsClient.getProcessedAlerts.mockReturnValue({});
    alertsClient.getSummarizedAlerts.mockResolvedValue({
      new: {
        count: 1,
        data: [mockAAD],
      },
      ongoing: { count: 0, data: [] },
      recovered: { count: 0, data: [] },
    });
    alertsClient.getAlertsToUpdateWithMaintenanceWindows.mockReturnValue([
      mockAAD['kibana.alert.uuid'],
    ]);
    alertsClient.getAlertsToUpdateWithLastScheduledActions.mockReturnValue({
      [mockAAD['kibana.alert.uuid']]: {
        group: 'default',
        date: new Date().toISOString(),
      },
    });
    alertsClient.getRawAlertInstancesForState.mockReturnValue({
      rawActiveAlerts: {
        [mockAAD['kibana.alert.uuid']]: {
          meta: {
            uuid: mockAAD['kibana.alert.uuid'],
            lastScheduledActions: {
              group: 'default',
              date: new Date().toISOString(),
            },
          },
          state: {},
        },
      },
      rawRecoveredAlerts: {},
    });

    alertsService.createAlertsClient.mockImplementation(() => alertsClient);

    const taskRunner = createTaskRunner();

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      actions: [
        {
          group: 'default',
          id: '1',
          actionTypeId: 'slack',
          frequency: {
            notifyWhen: 'onThrottleInterval',
            summary: true,
            throttle: '1h',
          },
          params: {
            foo: true,
          },
          uuid: '111-111',
        },
      ],
    });

    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();

    expect(alertsClient.updatePersistedAlerts).toHaveBeenCalledTimes(1);
    expect(alertsClient.getAlertsToUpdateWithMaintenanceWindows).toHaveBeenCalledTimes(1);
    expect(alertsClient.getAlertsToUpdateWithLastScheduledActions).toHaveBeenCalledTimes(1);
  });

  test('throws error when schedule.interval is not provided', async () => {
    mockGetRuleFromRaw.mockReturnValue({ ...mockedRuleTypeSavedObject, schedule: {} } as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue({
      ...mockedRawRuleSO,
      attributes: { ...mockedRawRuleSO.attributes, schedule: {} },
    });
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          previousStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        },
        // @ts-ignore
        schedule: {},
      },
    });

    await expect(taskRunner.run()).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Interval is required to calculate next run"'
    );
  });

  test('actionsPlugin.execute is called per alert that is scheduled', async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();
    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledTimes(1);
    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledWith(
      generateEnqueueFunctionInput({ isBulk: true, id: '1', foo: true })
    );

    expect(logger.debug).toHaveBeenCalledTimes(6);
    expect(logger.debug).nthCalledWith(1, 'executing rule test:1 at 1970-01-01T00:00:00.000Z', {
      tags: ['1', 'test'],
    });
    expect(logger.debug).nthCalledWith(
      2,
      `rule test:1: '${RULE_NAME}' has 1 active alerts: [{\"instanceId\":\"1\",\"actionGroup\":\"default\"}]`,
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      3,
      'deprecated ruleRunStatus for test:1: {"lastExecutionDate":"1970-01-01T00:00:00.000Z","status":"active"}',
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      4,
      'ruleRunStatus for test:1: {"outcome":"succeeded","outcomeOrder":0,"outcomeMsg":null,"warning":null,"alertsCount":{"active":1,"new":1,"recovered":0,"ignored":0}}',
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      5,
      'ruleRunMetrics for test:1: {"numSearches":3,"totalSearchDurationMs":23423,"esSearchDurationMs":33,"numberOfTriggeredActions":1,"numberOfGeneratedActions":1,"numberOfActiveAlerts":1,"numberOfRecoveredAlerts":0,"numberOfNewAlerts":1,"numberOfDelayedAlerts":0,"hasReachedAlertLimit":false,"hasReachedQueuedActionsLimit":false,"triggeredActionsStatus":"complete"}',
      { tags: ['1', 'test'] }
    );

    testAlertingEventLogCalls({
      activeAlerts: 1,
      generatedActions: 1,
      newAlerts: 1,
      triggeredActions: 1,
      status: 'active',
      logAlert: 2,
      logAction: 1,
    });
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      1,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.newInstance,
        group: 'default',
        state: { start: DATE_1970, duration: '0' },
      })
    );
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      2,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        group: 'default',
        state: { start: DATE_1970, duration: '0' },
      })
    );
    expect(alertingEventLogger.logAction).toHaveBeenNthCalledWith(1, generateActionOpts());

    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('enqueues actions with the decoded UIAM credential when rule uses a UIAM API key', async () => {
    const uiamApiKey = Buffer.from('456:essu_uiam_api_key').toString('base64');
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = new TaskRunner({
      ruleType,
      taskInstance: mockedTaskInstance,
      context: {
        ...taskRunnerFactoryInitializerParams,
        apiKeyType: ApiKeyType.UIAM,
        shouldGrantUiam: true,
      },
      inMemoryMetrics,
      internalSavedObjectsRepository,
    });

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue({
      ...mockedRawRuleSO,
      attributes: {
        ...mockedRawRuleSO.attributes,
        apiKey: null,
        uiamApiKey,
      },
    });

    await taskRunner.run();

    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledTimes(1);
    const [enqueuedActions] = actionsClient.bulkEnqueueExecution.mock.calls[0];
    expect(enqueuedActions).toHaveLength(1);
    expect(enqueuedActions[0]).toEqual(
      expect.objectContaining({
        id: '1',
        apiKey: 'essu_uiam_api_key',
      })
    );
  });

  test('actionsPlugin.execute is skipped if muteAll is true', async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      muteAll: true,
    });
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();

    expect(logger.debug).toHaveBeenCalledTimes(7);
    expect(logger.debug).nthCalledWith(1, 'executing rule test:1 at 1970-01-01T00:00:00.000Z', {
      tags: ['1', 'test'],
    });
    expect(logger.debug).nthCalledWith(
      2,
      `rule test:1: '${RULE_NAME}' has 1 active alerts: [{\"instanceId\":\"1\",\"actionGroup\":\"default\"}]`,
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      3,
      `no scheduling of actions for rule test:1: '${RULE_NAME}': rule is snoozed.`,
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      4,
      'deprecated ruleRunStatus for test:1: {"lastExecutionDate":"1970-01-01T00:00:00.000Z","status":"active"}',
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      5,
      'ruleRunStatus for test:1: {"outcome":"succeeded","outcomeOrder":0,"outcomeMsg":null,"warning":null,"alertsCount":{"active":1,"new":1,"recovered":0,"ignored":0}}',
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      6,
      'ruleRunMetrics for test:1: {"numSearches":3,"totalSearchDurationMs":23423,"esSearchDurationMs":33,"numberOfTriggeredActions":0,"numberOfGeneratedActions":0,"numberOfActiveAlerts":1,"numberOfRecoveredAlerts":0,"numberOfNewAlerts":1,"numberOfDelayedAlerts":0,"hasReachedAlertLimit":false,"hasReachedQueuedActionsLimit":false,"triggeredActionsStatus":"complete"}',
      { tags: ['1', 'test'] }
    );

    testAlertingEventLogCalls({
      activeAlerts: 1,
      newAlerts: 1,
      status: 'active',
      logAlert: 2,
    });
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      1,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.newInstance,
        group: 'default',
        state: { start: DATE_1970, duration: '0' },
      })
    );
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      2,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        group: 'default',
        state: { start: DATE_1970, duration: '0' },
      })
    );

    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  type SnoozeTestParams = [
    muteAll: boolean,
    snoozeEndTime: string | undefined | null,
    shouldBeSnoozed: boolean
  ];

  const snoozeTestParams: SnoozeTestParams[] = [
    [false, null, false],
    [false, undefined, false],
    // Stringify the snooze schedules for better failure reporting
    [
      false,
      JSON.stringify([
        { rRule: { dtstart: DATE_9999, tzid: 'UTC', count: 1 }, duration: 100000000 },
      ]),
      false,
    ],
    [
      false,
      JSON.stringify([
        { rRule: { dtstart: DATE_1970, tzid: 'UTC', count: 1 }, duration: 100000000 },
      ]),
      true,
    ],
    [true, null, true],
    [true, undefined, true],
    [
      true,
      JSON.stringify([
        { rRule: { dtstart: DATE_9999, tzid: 'UTC', count: 1 }, duration: 100000000 },
      ]),
      true,
    ],
    [
      true,
      JSON.stringify([
        { rRule: { dtstart: DATE_1970, tzid: 'UTC', count: 1 }, duration: 100000000 },
      ]),
      true,
    ],
  ];

  test.each(snoozeTestParams)(
    'snoozing works as expected with muteAll: %s; snoozeSchedule: %s',
    async (muteAll, snoozeSchedule, shouldBeSnoozed) => {
      taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
      taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
      ruleType.executor.mockImplementation(
        async ({
          services: executorServices,
        }: RuleExecutorOptions<
          RuleTypeParams,
          RuleTypeState,
          AlertInstanceState,
          AlertInstanceContext,
          string,
          RuleAlertData
        >) => {
          executorServices.alertFactory.create('1').scheduleActions('default');
          return { state: {} };
        }
      );
      const taskRunner = createTaskRunner();
      expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

      mockGetRuleFromRaw.mockReturnValue({
        ...(mockedRuleTypeSavedObject as Rule),
        muteAll,
        snoozeSchedule: snoozeSchedule != null ? JSON.parse(snoozeSchedule) : [],
      });
      encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
      await taskRunner.run();

      const expectedExecutions = shouldBeSnoozed ? 0 : 1;
      expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledTimes(expectedExecutions);

      const expectedMessage = `no scheduling of actions for rule test:1: '${RULE_NAME}': rule is snoozed.`;
      if (expectedExecutions) {
        expect(logger.debug).not.toHaveBeenCalledWith(expectedMessage);
      } else {
        expect(logger.debug).toHaveBeenCalledWith(expectedMessage, { tags: ['1', 'test'] });
      }
    }
  );

  test('skips alert notification if there are active maintenance windows', async () => {
    const mw = [
      {
        ...getMockMaintenanceWindow(),
        id: 'test-id-1',
      } as MaintenanceWindow,
      {
        ...getMockMaintenanceWindow(),
        id: 'test-id-2',
      } as MaintenanceWindow,
    ];
    const maintenanceWindowIds = ['test-id-1', 'test-id-2'];
    maintenanceWindowsService.getMaintenanceWindows.mockResolvedValue({
      maintenanceWindows: mw,
      maintenanceWindowsWithoutScopedQueryIds: maintenanceWindowIds,
    });
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);
    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);

    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();

    testAlertingEventLogCalls({
      activeAlerts: 1,
      newAlerts: 1,
      status: 'active',
      logAlert: 2,
    });
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      1,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.newInstance,
        group: 'default',
        state: { start: DATE_1970, duration: '0' },
        maintenanceWindowIds,
      })
    );
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      2,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        group: 'default',
        state: { start: DATE_1970, duration: '0' },
        maintenanceWindowIds,
      })
    );

    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('skips alert notification if active maintenance window contains the rule type category', async () => {
    const mw = [
      {
        ...getMockMaintenanceWindow(),
        categoryIds: ['test'] as unknown as MaintenanceWindow['categoryIds'],
        id: 'test-id-1',
      } as MaintenanceWindow,
    ];
    const maintenanceWindowIds = ['test-id-1'];
    maintenanceWindowsService.getMaintenanceWindows.mockResolvedValue({
      maintenanceWindows: mw,
      maintenanceWindowsWithoutScopedQueryIds: maintenanceWindowIds,
    });
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);
    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);

    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();

    testAlertingEventLogCalls({
      activeAlerts: 1,
      newAlerts: 1,
      status: 'active',
      logAlert: 2,
    });
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      1,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.newInstance,
        group: 'default',
        state: { start: DATE_1970, duration: '0' },
        maintenanceWindowIds,
      })
    );
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      2,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        group: 'default',
        state: { start: DATE_1970, duration: '0' },
        maintenanceWindowIds,
      })
    );
    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('allows alert notification if active maintenance window does not contain the rule type category', async () => {
    maintenanceWindowsService.getMaintenanceWindows.mockResolvedValue({
      maintenanceWindows: [],
      maintenanceWindowsWithoutScopedQueryIds: [],
    });
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);
    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);

    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();

    testAlertingEventLogCalls({
      activeAlerts: 1,
      generatedActions: 1,
      newAlerts: 1,
      triggeredActions: 1,
      status: 'active',
      logAlert: 2,
      logAction: 1,
    });

    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      1,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.newInstance,
        group: 'default',
        state: { start: DATE_1970, duration: '0' },
      })
    );
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      2,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        group: 'default',
        state: { start: DATE_1970, duration: '0' },
      })
    );
    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('skips firing actions for active alert if alert is muted', async () => {
    (
      taskRunnerFactoryInitializerParams as TaskRunnerFactoryInitializerParamsType
    ).actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        executorServices.alertFactory.create('2').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      mutedInstanceIds: ['2'],
    });
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();
    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledTimes(1);

    expect(logger.debug).toHaveBeenCalledTimes(7);
    expect(logger.debug).nthCalledWith(1, 'executing rule test:1 at 1970-01-01T00:00:00.000Z', {
      tags: ['1', 'test'],
    });
    expect(logger.debug).nthCalledWith(
      2,
      `rule test:1: '${RULE_NAME}' has 2 active alerts: [{\"instanceId\":\"1\",\"actionGroup\":\"default\"},{\"instanceId\":\"2\",\"actionGroup\":\"default\"}]`,
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      3,
      `skipping scheduling of actions for '2' in rule test:1: '${RULE_NAME}': rule is muted`,
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      4,
      'deprecated ruleRunStatus for test:1: {"lastExecutionDate":"1970-01-01T00:00:00.000Z","status":"active"}',
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      5,
      'ruleRunStatus for test:1: {"outcome":"succeeded","outcomeOrder":0,"outcomeMsg":null,"warning":null,"alertsCount":{"active":2,"new":2,"recovered":0,"ignored":0}}',
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      6,
      'ruleRunMetrics for test:1: {"numSearches":3,"totalSearchDurationMs":23423,"esSearchDurationMs":33,"numberOfTriggeredActions":1,"numberOfGeneratedActions":1,"numberOfActiveAlerts":2,"numberOfRecoveredAlerts":0,"numberOfNewAlerts":2,"numberOfDelayedAlerts":0,"hasReachedAlertLimit":false,"hasReachedQueuedActionsLimit":false,"triggeredActionsStatus":"complete"}',
      { tags: ['1', 'test'] }
    );
    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('skips firing actions for active alert if alert is throttled', async () => {
    (
      taskRunnerFactoryInitializerParams as TaskRunnerFactoryInitializerParamsType
    ).actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        executorServices.alertFactory.create('2').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          alertInstances: {
            '2': {
              meta: {
                lastScheduledActions: { date: moment().toISOString(), group: 'default' },
              },
              state: {
                bar: false,
                start: DATE_1969,
                duration: MOCK_DURATION,
              },
            },
          },
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      notifyWhen: 'onThrottleInterval',
      throttle: '1d',
    });
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();
    // expect(enqueueFunction).toHaveBeenCalledTimes(1);

    // expect(logger.debug).toHaveBeenCalledTimes(5);
    expect(logger.debug).nthCalledWith(
      3,
      `skipping scheduling of actions for '2' in rule test:1: '${RULE_NAME}': rule is throttled`,
      { tags: ['1', 'test'] }
    );
  });

  test('skips firing actions for active alert when alert is muted even if notifyWhen === onActionGroupChange', async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        executorServices.alertFactory.create('2').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      mutedInstanceIds: ['2'],
      notifyWhen: 'onActionGroupChange',
    });
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();
    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledTimes(7);
    expect(logger.debug).nthCalledWith(
      3,
      `skipping scheduling of actions for '2' in rule test:1: '${RULE_NAME}': rule is muted`,
      { tags: ['1', 'test'] }
    );
  });

  test('actionsPlugin.execute is not called when notifyWhen=onActionGroupChange and alert state does not change', async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          alertInstances: {
            '1': {
              meta: {
                lastScheduledActions: { date: DATE_1970, group: 'default' },
              },
              state: {
                bar: false,
                start: DATE_1969,
                duration: MOCK_DURATION,
              },
            },
          },
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      notifyWhen: 'onActionGroupChange',
    });
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();

    testAlertingEventLogCalls({
      activeAlerts: 1,
      status: 'active',
      logAlert: 1,
    });
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      1,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        group: 'default',
        state: { start: DATE_1969, duration: MOCK_DURATION, bar: false },
      })
    );

    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('actionsPlugin.execute is called when notifyWhen=onActionGroupChange and alert state has changed', async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          alertInstances: {
            '1': {
              meta: {
                lastScheduledActions: { group: 'newGroup', date: new Date().toISOString() },
              },
              state: { bar: false },
            },
          },
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      notifyWhen: 'onActionGroupChange',
    });
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    await taskRunner.run();

    testAlertingEventLogCalls({
      activeAlerts: 1,
      triggeredActions: 1,
      generatedActions: 1,
      status: 'active',
      logAlert: 1,
      logAction: 1,
    });
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      1,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        group: 'default',
        state: { bar: false },
      })
    );
    expect(alertingEventLogger.logAction).toHaveBeenNthCalledWith(1, generateActionOpts({}));

    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledTimes(1);
    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('includes the apiKey in the request used to initialize the actionsClient', async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();
    expect(
      taskRunnerFactoryInitializerParams.actionsPlugin.getActionsClientWithRequest
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          // base64 encoded "123:abc"
          authorization: 'ApiKey MTIzOmFiYw==',
        },
      })
    );

    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledTimes(1);
    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledWith(
      generateEnqueueFunctionInput({ isBulk: true, id: '1', foo: true })
    );

    testAlertingEventLogCalls({
      activeAlerts: 1,
      newAlerts: 1,
      triggeredActions: 1,
      generatedActions: 1,
      status: 'active',
      logAlert: 2,
      logAction: 1,
    });
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      1,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.newInstance,
        group: 'default',
        state: { start: DATE_1970, duration: '0' },
      })
    );
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      2,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        group: 'default',
        state: { start: DATE_1970, duration: '0' },
      })
    );
    expect(alertingEventLogger.logAction).toHaveBeenNthCalledWith(1, generateActionOpts({}));

    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('fire recovered actions for execution for the alertInstances which is in the recovered state', async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);

    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          alertInstances: {
            '1': {
              meta: {},
              state: {
                bar: false,
                start: DATE_1969,
                duration: '80000000000',
              },
            },
            '2': {
              meta: {},
              state: {
                bar: false,
                start: '1969-12-31T06:00:00.000Z',
                duration: '70000000000',
              },
            },
          },
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    const runnerResult = await taskRunner.run();
    expect(runnerResult.state.alertInstances).toEqual(
      generateAlertInstance({
        id: 1,
        duration: MOCK_DURATION,
        start: DATE_1969,
        flappingHistory: [false],
      })
    );

    expect(logger.debug).toHaveBeenCalledTimes(7);
    expect(logger.debug).nthCalledWith(1, 'executing rule test:1 at 1970-01-01T00:00:00.000Z', {
      tags: ['1', 'test'],
    });
    expect(logger.debug).nthCalledWith(
      2,
      `rule test:1: '${RULE_NAME}' has 1 active alerts: [{\"instanceId\":\"1\",\"actionGroup\":\"default\"}]`,
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      3,
      `rule test:1: '${RULE_NAME}' has 1 recovered alerts: [\"2\"]`,
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      4,
      'deprecated ruleRunStatus for test:1: {"lastExecutionDate":"1970-01-01T00:00:00.000Z","status":"active"}',
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      5,
      'ruleRunStatus for test:1: {"outcome":"succeeded","outcomeOrder":0,"outcomeMsg":null,"warning":null,"alertsCount":{"active":1,"new":0,"recovered":1,"ignored":0}}',
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      6,
      'ruleRunMetrics for test:1: {"numSearches":3,"totalSearchDurationMs":23423,"esSearchDurationMs":33,"numberOfTriggeredActions":2,"numberOfGeneratedActions":2,"numberOfActiveAlerts":1,"numberOfRecoveredAlerts":1,"numberOfNewAlerts":0,"numberOfDelayedAlerts":0,"hasReachedAlertLimit":false,"hasReachedQueuedActionsLimit":false,"triggeredActionsStatus":"complete"}',
      { tags: ['1', 'test'] }
    );

    testAlertingEventLogCalls({
      activeAlerts: 1,
      recoveredAlerts: 1,
      triggeredActions: 2,
      generatedActions: 2,
      status: 'active',
      logAlert: 2,
      logAction: 2,
    });
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      1,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.recoveredInstance,
        id: '2',
        state: {
          bar: false,
          start: '1969-12-31T06:00:00.000Z',
          duration: '64800000000000',
          end: DATE_1970,
        },
      })
    );
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      2,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        group: 'default',
        state: { bar: false, start: DATE_1969, duration: MOCK_DURATION },
      })
    );
    expect(alertingEventLogger.logAction).toHaveBeenNthCalledWith(1, generateActionOpts({}));
    expect(alertingEventLogger.logAction).toHaveBeenNthCalledWith(
      2,
      generateActionOpts({ id: '2', alertId: '2', alertGroup: 'recovered', uuid: '222-222' })
    );

    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledTimes(1);
    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledWith([
      generateEnqueueFunctionInput({ isBulk: false, id: '1', foo: true }),
      generateEnqueueFunctionInput({
        isBulk: false,
        id: '2',
        isResolved: true,
        uuid: '222-222',
      }),
    ]);
    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
    jest.resetAllMocks();
  });

  test("should skip alertInstances which weren't active on the previous execution", async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);

    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');

        // create an instance, but don't schedule any actions, so it doesn't go active
        executorServices.alertFactory.create('3');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          alertInstances: {
            '1': { meta: {}, state: { bar: false } },
            '2': { meta: {}, state: { bar: false } },
          },
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    const runnerResult = await taskRunner.run();
    expect(runnerResult.state.alertInstances).toEqual(
      generateAlertInstance({
        id: 1,
        flappingHistory: [false],
      })
    );

    expect(logger.debug).toHaveBeenCalledWith(
      `rule test:1: '${RULE_NAME}' has 1 active alerts: [{\"instanceId\":\"1\",\"actionGroup\":\"default\"}]`,
      { tags: ['1', 'test'] }
    );

    expect(logger.debug).nthCalledWith(
      3,
      `rule test:1: '${RULE_NAME}' has 1 recovered alerts: [\"2\"]`,
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      4,
      `deprecated ruleRunStatus for test:1: {"lastExecutionDate":"1970-01-01T00:00:00.000Z","status":"active"}`,
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      5,
      'ruleRunStatus for test:1: {"outcome":"succeeded","outcomeOrder":0,"outcomeMsg":null,"warning":null,"alertsCount":{"active":1,"new":0,"recovered":1,"ignored":0}}',
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      6,
      `ruleRunMetrics for test:1: {"numSearches":3,"totalSearchDurationMs":23423,"esSearchDurationMs":33,"numberOfTriggeredActions":2,"numberOfGeneratedActions":2,"numberOfActiveAlerts":1,"numberOfRecoveredAlerts":1,"numberOfNewAlerts":0,"numberOfDelayedAlerts":0,"hasReachedAlertLimit":false,"hasReachedQueuedActionsLimit":false,"triggeredActionsStatus":"complete"}`,
      { tags: ['1', 'test'] }
    );

    testAlertingEventLogCalls({
      activeAlerts: 1,
      recoveredAlerts: 1,
      triggeredActions: 2,
      generatedActions: 2,
      status: 'active',
      logAlert: 2,
      logAction: 2,
    });

    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledTimes(1);
    expect((actionsClient.bulkEnqueueExecution as jest.Mock).mock.calls[0][0][0].id).toEqual('1');
    expect((actionsClient.bulkEnqueueExecution as jest.Mock).mock.calls[0][0][1].id).toEqual('2');
    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('fire actions under a custom recovery group when specified on an alert type for alertInstances which are in the recovered state', async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);

    const recoveryActionGroup = {
      id: 'customRecovered',
      name: 'Custom Recovered',
    };
    const ruleTypeWithCustomRecovery = {
      ...ruleType,
      recoveryActionGroup,
      actionGroups: [{ id: 'default', name: 'Default' }, recoveryActionGroup],
    };

    ruleTypeWithCustomRecovery.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner({
      ruleType: ruleTypeWithCustomRecovery,
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          alertInstances: {
            '1': { meta: {}, state: { bar: false } },
            '2': { meta: {}, state: { bar: false } },
          },
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      actions: [
        {
          group: 'default',
          id: '1',
          actionTypeId: 'action',
          params: {
            foo: true,
          },
          uuid: '111-111',
        },
        {
          group: recoveryActionGroup.id,
          id: '2',
          actionTypeId: 'action',
          params: {
            isResolved: true,
          },
          uuid: '222-222',
        },
      ],
    });
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    const runnerResult = await taskRunner.run();
    expect(runnerResult.state.alertInstances).toEqual(
      generateAlertInstance({
        id: 1,
        flappingHistory: [false],
      })
    );

    testAlertingEventLogCalls({
      ruleTypeDef: ruleTypeWithCustomRecovery,
      activeAlerts: 1,
      recoveredAlerts: 1,
      triggeredActions: 2,
      generatedActions: 2,
      status: 'active',
      logAlert: 2,
      logAction: 2,
    });

    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledTimes(1);
    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledWith([
      generateEnqueueFunctionInput({ isBulk: false, id: '1', foo: true }),
      generateEnqueueFunctionInput({
        isBulk: false,
        id: '2',
        isResolved: true,
        uuid: '222-222',
      }),
    ]);
    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('triggers summary actions (Per rule run)', async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(async () => {
      return { state: {} };
    });

    alertsClient.getProcessedAlerts.mockReturnValue({});
    alertsClient.getSummarizedAlerts.mockResolvedValue({
      new: {
        count: 1,
        data: [mockAAD],
      },
      ongoing: { count: 0, data: [] },
      recovered: { count: 0, data: [] },
    });
    alertsService.createAlertsClient.mockImplementation(() => alertsClient);

    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      actions: [
        {
          group: 'default',
          id: '1',
          actionTypeId: 'slack',
          frequency: {
            notifyWhen: 'onActiveAlert',
            summary: true,
            throttle: null,
          },
          params: {
            foo: true,
          },
          uuid: '111-111',
        },
      ],
    });
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();

    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledTimes(1);
    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledWith(
      generateEnqueueFunctionInput({ isBulk: true, id: '1', foo: true, actionTypeId: 'slack' })
    );
  });

  test('triggers summary actions (Custom Frequency)', async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(async () => {
      return { state: {} };
    });
    alertsClient.getProcessedAlerts.mockReturnValue({});
    alertsClient.getSummarizedAlerts.mockResolvedValue({
      new: {
        count: 1,
        data: [mockAAD],
      },
      ongoing: { count: 0, data: [] },
      recovered: { count: 0, data: [] },
    });

    alertsClient.getRawAlertInstancesForState.mockResolvedValueOnce({ state: {}, meta: {} });
    alertsService.createAlertsClient.mockImplementation(() => alertsClient);

    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      actions: [
        {
          group: 'default',
          id: '1',
          actionTypeId: 'slack',
          frequency: {
            notifyWhen: 'onThrottleInterval',
            summary: true,
            throttle: '1h',
          },
          params: {
            foo: true,
          },
          uuid: '111-111',
        },
      ],
    });

    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    const result = await taskRunner.run();

    expect(alertsClient.getSummarizedAlerts).toHaveBeenCalledWith({
      start: new Date('1969-12-31T23:00:00.000Z'),
      end: new Date(DATE_1970),
      ruleId: '1',
      spaceId: 'default',
      excludedAlertInstanceIds: [],
    });

    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledTimes(1);
    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledWith(
      generateEnqueueFunctionInput({ isBulk: true, id: '1', foo: true, actionTypeId: 'slack' })
    );
    expect(result.state.summaryActions).toEqual({
      '111-111': { date: new Date(DATE_1970).toISOString() },
    });
  });

  test('persists alertInstances passed in from state, only if they are scheduled for execution', async () => {
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        return { state: {} };
      }
    );
    const date = new Date().toISOString();
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          alertInstances: {
            '1': {
              meta: { lastScheduledActions: { group: 'default', date } },
              state: {
                bar: false,
                start: DATE_1969,
                duration: '80000000000',
              },
            },
            '2': {
              meta: { lastScheduledActions: { group: 'default', date } },
              state: {
                bar: false,
                start: '1969-12-31T06:00:00.000Z',
                duration: '70000000000',
              },
            },
          },
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    const runnerResult = await taskRunner.run();
    expect(runnerResult.state.alertInstances).toEqual(
      generateAlertInstance({
        id: 1,
        duration: MOCK_DURATION,
        start: DATE_1969,
        flappingHistory: [false],
        flapping: false,
      })
    );

    testAlertingEventLogCalls({
      activeAlerts: 1,
      recoveredAlerts: 1,
      triggeredActions: 0,
      generatedActions: 2,
      status: 'active',
      logAlert: 2,
    });
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      1,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.recoveredInstance,
        id: '2',
        group: 'default',
        state: {
          bar: false,
          start: '1969-12-31T06:00:00.000Z',
          duration: '64800000000000',
          end: DATE_1970,
        },
      })
    );
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      2,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        group: 'default',
        state: { bar: false, start: DATE_1969, duration: MOCK_DURATION },
      })
    );

    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('should set authentication errors as user-error', async () => {
    jest.spyOn(getExecutorServicesModule, 'getExecutorServices').mockImplementation(() => {
      throw new errors.ResponseError({
        warnings: [],
        meta: {} as never,
        statusCode: 401,
      });
    });

    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalled();
    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    await taskRunner.run();

    expect(logger.error).toBeCalledTimes(1);

    const loggerCall = logger.error.mock.calls[0][0];
    const loggerMeta = logger.error.mock.calls[0][1];
    const loggerCallPrefix = (loggerCall as string).split('-');
    expect(loggerCallPrefix[0].trim()).toMatchInlineSnapshot(
      `"Executing Rule default:test:1 has resulted in Error: Response Error"`
    );
    expect(loggerMeta?.tags).toEqual(['1', 'test', 'rule-run-failed', 'user-error']);
  });

  test('should set unexpected errors as framework-error', async () => {
    jest.spyOn(getExecutorServicesModule, 'getExecutorServices').mockImplementation(() => {
      throw new Error('test');
    });

    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalled();
    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    await taskRunner.run();

    expect(logger.error).toBeCalledTimes(1);

    const loggerCall = logger.error.mock.calls[0][0];
    const loggerMeta = logger.error.mock.calls[0][1];
    const loggerCallPrefix = (loggerCall as string).split('-');
    expect(loggerCallPrefix[0].trim()).toMatchInlineSnapshot(
      `"Executing Rule default:test:1 has resulted in Error: test"`
    );
    expect(loggerMeta?.tags).toEqual(['1', 'test', 'rule-run-failed', 'framework-error']);
  });

  test('recovers gracefully when the RuleType executor throws an exception', async () => {
    const taskRunError = new Error(GENERIC_ERROR_MESSAGE);

    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        throw taskRunError;
      }
    );

    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(mockedRawRuleSO);

    const runnerResult = await taskRunner.run();

    expect(runnerResult).toEqual(generateRunnerResult({ successRatio: 0, taskRunError }));

    testAlertingEventLogCalls({
      status: 'error',
      errorReason: 'execute',
      executionStatus: 'failed',
    });

    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();

    const loggerCall = logger.error.mock.calls[0][0];
    const loggerMeta = logger.error.mock.calls[0][1];
    const loggerCallPrefix = (loggerCall as string).split('-');
    expect(loggerCallPrefix[0].trim()).toMatchInlineSnapshot(
      `"Executing Rule default:test:1 has resulted in Error: GENERIC ERROR MESSAGE"`
    );
    expect(loggerMeta?.tags).toEqual(['1', 'test', 'rule-run-failed', 'framework-error']);
    expect(loggerMeta?.error?.stack_trace).toBeDefined();
    expect(logger.error).toBeCalledTimes(1);
    expect(getErrorSource(runnerResult.taskRunError as Error)).toBe(TaskErrorSource.FRAMEWORK);
  });

  test('recovers gracefully when the Rule Task Runner throws an exception when loading rule to prepare for run', async () => {
    const taskRunError = new Error(GENERIC_ERROR_MESSAGE);

    // used in loadIndirectParams() which is called to load rule data
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockImplementation(() => {
      throw taskRunError;
    });

    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalled();

    const runnerResult = await taskRunner.run();

    expect(runnerResult).toEqual(generateRunnerResult({ successRatio: 0, taskRunError }));

    testAlertingEventLogCalls({
      setRuleName: false,
      status: 'error',
      errorReason: 'decrypt',
      executionStatus: 'not-reached',
    });

    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('recovers gracefully when the Runner of a legacy Rule task which has no schedule throws an exception when fetching attributes', async () => {
    const taskRunError = new TypeError(GENERIC_ERROR_MESSAGE);

    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockImplementation(() => {
      throw taskRunError;
    });

    // legacy rules used to run by returning a new `runAt` instead of using a schedule
    // ensure we return a fallback schedule when this happens, otherwise the task might be deleted
    const legacyTaskInstance = omit(mockedTaskInstance, 'schedule');

    const taskRunner = createTaskRunner({ taskInstance: legacyTaskInstance });
    expect(AlertingEventLogger).toHaveBeenCalled();

    const runnerResult = await taskRunner.run();

    expect(runnerResult).toEqual(
      generateRunnerResult({ successRatio: 0, interval: '5m', taskRunError })
    );
    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test(`doesn't change previousStartedAt when it fails to run`, async () => {
    const originalAlertSate = {
      previousStartedAt: DATE_1970,
    };

    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        throw new Error(GENERIC_ERROR_MESSAGE);
      }
    );

    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: originalAlertSate,
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    const runnerResult = await taskRunner.run();

    expect(runnerResult.state.previousStartedAt).toEqual(originalAlertSate.previousStartedAt);
    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('avoids rescheduling a failed Rule Task Runner when it throws due to failing to fetch the rule', async () => {
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        params: {
          ...mockedTaskInstance.params,
          spaceId: 'foo',
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();

    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    return taskRunner.run().catch((ex) => {
      expect(ex.toString()).toEqual(`Error: Saved object [alert/1] not found`);
      const updateRuleDebugLogger = logger.debug.mock.calls[3][0];
      expect(updateRuleDebugLogger as string).toMatchInlineSnapshot(
        `"Updating rule task for test rule with id 1 - {\\"lastExecutionDate\\":\\"1970-01-01T00:00:00.000Z\\",\\"status\\":\\"error\\",\\"error\\":{\\"reason\\":\\"read\\",\\"message\\":\\"Saved object [alert/1] not found\\"}} - {\\"outcome\\":\\"failed\\",\\"warning\\":\\"read\\",\\"outcomeMsg\\":\\"Saved object [alert/1] not found\\",\\"alertsCount\\":{}}"`
      );
      const executeRuleDebugLogger = logger.debug.mock.calls[4][0];
      expect(executeRuleDebugLogger as string).toMatchInlineSnapshot(
        `"Executing Rule foo:test:1 has resulted in Error: Saved object [alert/1] not found"`
      );

      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).nthCalledWith(
        1,
        `Unable to execute rule "1" in the "foo" space because Saved object [alert/1] not found - this rule will not be rescheduled. To restart rule execution, try disabling and re-enabling this rule.`,
        { tags: ['1', 'test'] }
      );
      expect(isUnrecoverableError(ex)).toBeTruthy();
      expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
    });
  });

  test('reschedules for next schedule interval if es connectivity error encountered and schedule interval is less than connectivity retry', async () => {
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalled();

    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    const runnerResult = await taskRunner.run();
    expect(runnerResult.schedule!.interval).toEqual(mockedTaskInstance.schedule!.interval);
  });

  test('reschedules for smaller interval if es connectivity error encountered and schedule interval is greater than connectivity retry', async () => {
    mockGetRuleFromRaw.mockImplementation(() => {
      throw SavedObjectsErrorHelpers.createGenericNotFoundEsUnavailableError(
        RULE_SAVED_OBJECT_TYPE,
        '1'
      );
    });

    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        schedule: {
          interval: '1d',
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();

    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    const runnerResult = await taskRunner.run();

    expect(runnerResult.schedule!.interval).toEqual('5m');
  });

  test('correctly logs warning when Rule Task Runner throws due to failing to fetch the rule in a space', async () => {
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        params: {
          ...mockedTaskInstance.params,
          spaceId: 'test space',
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();

    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    return taskRunner.run().catch((ex) => {
      expect(ex.toString()).toEqual(`Error: Saved object [alert/1] not found`);
      const updateRuleDebugLogger = logger.debug.mock.calls[3][0];
      expect(updateRuleDebugLogger as string).toMatchInlineSnapshot(
        `"Updating rule task for test rule with id 1 - {\\"lastExecutionDate\\":\\"1970-01-01T00:00:00.000Z\\",\\"status\\":\\"error\\",\\"error\\":{\\"reason\\":\\"read\\",\\"message\\":\\"Saved object [alert/1] not found\\"}} - {\\"outcome\\":\\"failed\\",\\"warning\\":\\"read\\",\\"outcomeMsg\\":\\"Saved object [alert/1] not found\\",\\"alertsCount\\":{}}"`
      );
      const ruleExecuteDebugLog = logger.debug.mock.calls[4][0];
      expect(ruleExecuteDebugLog as string).toMatchInlineSnapshot(
        `"Executing Rule test space:test:1 has resulted in Error: Saved object [alert/1] not found"`
      );

      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).nthCalledWith(
        1,
        `Unable to execute rule "1" in the "test space" space because Saved object [alert/1] not found - this rule will not be rescheduled. To restart rule execution, try disabling and re-enabling this rule.`,
        { tags: ['1', 'test'] }
      );
      expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
    });
  });

  test('start time is logged for new alerts', async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        executorServices.alertFactory.create('2').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          alertInstances: {},
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      notifyWhen: 'onActionGroupChange',
      actions: [],
    });

    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();

    testAlertingEventLogCalls({
      activeAlerts: 2,
      newAlerts: 2,
      status: 'active',
      logAlert: 4,
    });
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      1,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.newInstance,
        group: 'default',
        state: {
          start: DATE_1970,
          duration: '0',
        },
      })
    );
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      2,
      generateAlertOpts({
        id: '2',
        action: EVENT_LOG_ACTIONS.newInstance,
        group: 'default',
        state: {
          start: DATE_1970,
          duration: '0',
        },
      })
    );
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      3,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        group: 'default',
        state: { start: DATE_1970, duration: '0' },
      })
    );
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      4,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        id: '2',
        group: 'default',
        state: { start: DATE_1970, duration: '0' },
      })
    );

    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('duration is updated for active alerts when alert state contains start time', async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        executorServices.alertFactory.create('2').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          alertInstances: {
            '1': {
              meta: {},
              state: {
                bar: false,
                start: DATE_1969,
                duration: '80000000000',
              },
            },
            '2': {
              meta: {},
              state: {
                bar: false,
                start: '1969-12-31T06:00:00.000Z',
                duration: '70000000000',
              },
            },
          },
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      notifyWhen: 'onActionGroupChange',
      actions: [],
    });

    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();

    testAlertingEventLogCalls({
      activeAlerts: 2,
      status: 'active',
      logAlert: 2,
    });
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      1,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        group: 'default',
        state: { bar: false, start: DATE_1969, duration: MOCK_DURATION },
      })
    );
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      2,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        id: '2',
        group: 'default',
        state: { bar: false, start: '1969-12-31T06:00:00.000Z', duration: '64800000000000' },
      })
    );

    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('duration is not calculated for active alerts when alert state does not contain start time', async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        executorServices.alertFactory.create('2').scheduleActions('default');
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          alertInstances: {
            '1': {
              meta: {},
              state: { bar: false },
            },
            '2': {
              meta: {},
              state: { bar: false },
            },
          },
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      notifyWhen: 'onActionGroupChange',
      actions: [],
    });
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();

    testAlertingEventLogCalls({
      activeAlerts: 2,
      status: 'active',
      logAlert: 2,
    });
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      1,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        group: 'default',
        state: { bar: false },
      })
    );
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      2,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        id: '2',
        group: 'default',
        state: { bar: false },
      })
    );

    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('end is logged for active alerts when alert state contains start time and alert recovers', async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(async () => {
      return { state: {} };
    });
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          alertInstances: {
            '1': {
              meta: {},
              state: {
                bar: false,
                start: DATE_1969,
                duration: '80000000000',
              },
            },
            '2': {
              meta: {},
              state: {
                bar: false,
                start: '1969-12-31T06:00:00.000Z',
                duration: '70000000000',
              },
            },
          },
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      notifyWhen: 'onActionGroupChange',
      actions: [],
    });
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();

    testAlertingEventLogCalls({
      recoveredAlerts: 2,
      status: 'ok',
      logAlert: 2,
    });
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      1,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.recoveredInstance,
        state: { bar: false, start: DATE_1969, end: DATE_1970, duration: MOCK_DURATION },
      })
    );
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      2,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.recoveredInstance,
        id: '2',
        state: {
          bar: false,
          start: '1969-12-31T06:00:00.000Z',
          end: DATE_1970,
          duration: '64800000000000',
        },
      })
    );

    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('end calculation is skipped for active alerts when alert state does not contain start time and alert recovers', async () => {
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        return { state: {} };
      }
    );
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          alertInstances: {
            '1': {
              meta: {},
              state: { bar: false },
            },
            '2': {
              meta: {},
              state: { bar: false },
            },
          },
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      notifyWhen: 'onActionGroupChange',
      actions: [],
    });
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();

    testAlertingEventLogCalls({
      recoveredAlerts: 2,
      status: 'ok',
      logAlert: 2,
    });
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      1,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.recoveredInstance,
        state: { bar: false },
      })
    );
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      2,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.recoveredInstance,
        id: '2',
        state: {
          bar: false,
        },
      })
    );

    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('successfully stores successful runs', async () => {
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    const runnerResult = await taskRunner.run();
    expect(runnerResult).toEqual(generateRunnerResult({ state: true, history: [true] }));
  });

  test('successfully stores failure runs', async () => {
    const taskRunError = new Error(GENERIC_ERROR_MESSAGE);
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(mockedRawRuleSO);
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        throw taskRunError;
      }
    );
    const runnerResult = await taskRunner.run();
    expect(runnerResult).toEqual(
      generateRunnerResult({ successRatio: 0, success: false, taskRunError })
    );
  });

  test('successfully stores the success ratio', async () => {
    const taskRunError = new Error(GENERIC_ERROR_MESSAGE);
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    await taskRunner.run();
    await taskRunner.run();
    await taskRunner.run();

    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        throw taskRunError;
      }
    );
    const runnerResult = await taskRunner.run();
    ruleType.executor.mockClear();
    expect(runnerResult).toEqual(
      generateRunnerResult({
        successRatio: 0.75,
        history: [true, true, true, false],
        taskRunError,
      })
    );
  });

  test('successfully stores next run', async () => {
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalled();
    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue({
      ...mockedRawRuleSO,
      attributes: { ...mockedRawRuleSO.attributes, schedule: { interval: '50s' } },
    });

    await taskRunner.run();
    expect(elasticsearchService.client.asInternalUser.update).toHaveBeenCalledWith(
      ...generateRuleUpdateParams({
        nextRun: '1970-01-01T00:00:10.000Z',
        metrics: { total_search_duration_ms: 23423 },
      })
    );
  });

  test('updates the rule saved object correctly when failed', async () => {
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        throw new Error(GENERIC_ERROR_MESSAGE);
      }
    );
    await taskRunner.run();
    ruleType.executor.mockClear();

    expect(elasticsearchService.client.asInternalUser.update).toHaveBeenCalledWith(
      ...generateRuleUpdateParams({
        error: { message: GENERIC_ERROR_MESSAGE, reason: 'execute' },
        outcome: 'failed',
        status: 'error',
        successRatio: 0,
        history: [{ success: false, timestamp: 0 }],
      })
    );
  });

  test('caps monitoring history at 200', async () => {
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    for (let i = 0; i < 300; i++) {
      await taskRunner.run();
    }
    await taskRunner.run();
    expect(mockedRuleTypeSavedObject.monitoring?.run.history.length).toEqual(200);
  });

  test('Actions circuit breaker kicked in, should set status as warning and log a message in event log', async () => {
    const actionsConfigMap = {
      default: {
        max: 3,
      },
    };

    const warning = {
      reason: RuleExecutionStatusWarningReasons.MAX_EXECUTABLE_ACTIONS,
      message: translations.taskRunner.warning.maxExecutableActions,
    };

    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);

    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        return { state: {} };
      }
    );

    const mockActions = [
      {
        group: 'default',
        id: '1',
        uuid: '111-111',
        actionTypeId: 'action',
      },
      {
        group: 'default',
        id: '2',
        uuid: '222-222',
        actionTypeId: 'action',
      },
      {
        group: 'default',
        id: '3',
        uuid: '333-333',
        actionTypeId: 'action',
      },
      {
        group: 'default',
        id: '4',
        uuid: '444-444',
        actionTypeId: 'action',
      },
      {
        group: 'default',
        id: '5',
        uuid: '555-555',
        actionTypeId: 'action',
      },
    ];

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      actions: mockActions as RuleAction[],
    });

    ruleTypeRegistry.get.mockReturnValue(ruleType);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    const taskRunner = createTaskRunner({
      context: {
        ...taskRunnerFactoryInitializerParams,
        actionsConfigMap,
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();

    const runnerResult = await taskRunner.run();

    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledTimes(1);

    expect(elasticsearchService.client.asInternalUser.update).toHaveBeenCalledWith(
      ...generateRuleUpdateParams({
        status: 'warning',
        outcome: 'warning',
        warning,
        alertsCount: { active: 1, new: 1 },
        metrics: {
          total_search_duration_ms: null,
        },
      })
    );

    expect(runnerResult).toEqual(
      generateRunnerResult({
        state: true,
        history: [true],
        alertInstances: {
          '1': {
            meta: {
              uuid: expect.any(String),
              lastScheduledActions: {
                date: new Date(DATE_1970).toISOString(),
                group: 'default',
              },
              flappingHistory: [true],
              maintenanceWindowIds: [],
              maintenanceWindowNames: [],
              flapping: false,
              pendingRecoveredCount: 0,
              activeCount: 1,
            },
            state: {
              duration: '0',
              start: '1970-01-01T00:00:00.000Z',
            },
          },
        },
      })
    );

    expect(logger.debug).toHaveBeenCalledTimes(8);

    expect(logger.debug).nthCalledWith(
      3,
      'Rule "1" skipped scheduling action "4" because the maximum number of allowed actions has been reached.',
      { tags: ['1', 'test'] }
    );

    testAlertingEventLogCalls({
      newAlerts: 1,
      activeAlerts: 1,
      triggeredActions: actionsConfigMap.default.max,
      generatedActions: mockActions.length,
      status: 'warning',
      errorReason: `maxExecutableActions`,
      logAlert: 2,
      logAction: 3,
    });
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      1,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.newInstance,
        group: 'default',
        state: { start: DATE_1970, duration: '0' },
      })
    );
    expect(alertingEventLogger.logAlert).toHaveBeenNthCalledWith(
      2,
      generateAlertOpts({
        action: EVENT_LOG_ACTIONS.activeInstance,
        group: 'default',
        state: { start: DATE_1970, duration: '0' },
      })
    );
    expect(alertingEventLogger.logAction).toHaveBeenNthCalledWith(1, generateActionOpts({}));
    expect(alertingEventLogger.logAction).toHaveBeenNthCalledWith(
      2,
      generateActionOpts({ id: '2', uuid: '222-222' })
    );
    expect(alertingEventLogger.logAction).toHaveBeenNthCalledWith(
      3,
      generateActionOpts({ id: '3', uuid: '333-333' })
    );
  });

  test('Actions circuit breaker kicked in with connectorType specific config and multiple alerts', async () => {
    const actionsConfigMap = {
      default: {
        max: 30,
      },
      '.server-log': {
        max: 1,
      },
    };

    const warning = {
      reason: RuleExecutionStatusWarningReasons.MAX_EXECUTABLE_ACTIONS,
      message: translations.taskRunner.warning.maxExecutableActions,
    };

    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);

    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        executorServices.alertFactory.create('2').scheduleActions('default');
        return { state: {} };
      }
    );

    mockGetRuleFromRaw.mockReturnValue({
      ...(mockedRuleTypeSavedObject as Rule),
      actions: [
        {
          group: 'default',
          id: '1',
          uuid: '111-111',
          actionTypeId: '.server-log',
        },
        {
          group: 'default',
          id: '2',
          uuid: '222-222',
          actionTypeId: '.server-log',
        },
        {
          group: 'default',
          id: '3',
          uuid: '333-333',
          actionTypeId: '.server-log',
        },
        {
          group: 'default',
          id: '4',
          uuid: '444-444',
          actionTypeId: 'any-action',
        },
        {
          group: 'default',
          id: '5',
          uuid: '555-555',
          actionTypeId: 'any-action',
        },
      ] as RuleAction[],
    });

    ruleTypeRegistry.get.mockReturnValue(ruleType);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(mockedRawRuleSO);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(mockedRawRuleSO);

    const taskRunner = createTaskRunner({
      context: {
        ...taskRunnerFactoryInitializerParams,
        actionsConfigMap,
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();

    const runnerResult = await taskRunner.run();

    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledTimes(1);

    expect(elasticsearchService.client.asInternalUser.update).toHaveBeenCalledWith(
      ...generateRuleUpdateParams({
        status: 'warning',
        outcome: 'warning',
        warning,
        alertsCount: { active: 2, new: 2 },
        metrics: {
          total_search_duration_ms: null,
        },
      })
    );

    expect(runnerResult).toEqual(
      generateRunnerResult({
        state: true,
        history: [true],
        alertInstances: {
          '1': {
            meta: {
              uuid: expect.any(String),
              lastScheduledActions: {
                date: new Date(DATE_1970).toISOString(),
                group: 'default',
              },
              flappingHistory: [true],
              maintenanceWindowIds: [],
              maintenanceWindowNames: [],
              flapping: false,
              pendingRecoveredCount: 0,
              activeCount: 1,
            },
            state: {
              duration: '0',
              start: '1970-01-01T00:00:00.000Z',
            },
          },
          '2': {
            meta: {
              uuid: expect.any(String),
              lastScheduledActions: {
                date: new Date(DATE_1970).toISOString(),
                group: 'default',
              },
              flappingHistory: [true],
              maintenanceWindowIds: [],
              maintenanceWindowNames: [],
              flapping: false,
              pendingRecoveredCount: 0,
              activeCount: 1,
            },
            state: {
              duration: '0',
              start: '1970-01-01T00:00:00.000Z',
            },
          },
        },
      })
    );

    expect(logger.debug).toHaveBeenCalledTimes(7);

    expect(logger.debug).nthCalledWith(
      3,
      'Rule "1" skipped scheduling action "1" because the maximum number of allowed actions for connector type .server-log has been reached.',
      { tags: ['1', 'test'] }
    );

    testAlertingEventLogCalls({
      newAlerts: 2,
      activeAlerts: 2,
      generatedActions: 10,
      triggeredActions: 5,
      status: 'warning',
      errorReason: `maxExecutableActions`,
      logAlert: 4,
      logAction: 5,
    });
  });

  test('increments monitoring metrics after execution', async () => {
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    await taskRunner.run();
    await taskRunner.run();
    await taskRunner.run();

    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        throw new Error('OMG');
      }
    );
    await taskRunner.run();
    await taskRunner.cancel();

    expect(inMemoryMetrics.increment).toHaveBeenCalledTimes(6);
    expect(inMemoryMetrics.increment.mock.calls[0][0]).toBe(IN_MEMORY_METRICS.RULE_EXECUTIONS);
    expect(inMemoryMetrics.increment.mock.calls[1][0]).toBe(IN_MEMORY_METRICS.RULE_EXECUTIONS);
    expect(inMemoryMetrics.increment.mock.calls[2][0]).toBe(IN_MEMORY_METRICS.RULE_EXECUTIONS);
    expect(inMemoryMetrics.increment.mock.calls[3][0]).toBe(IN_MEMORY_METRICS.RULE_EXECUTIONS);
    expect(inMemoryMetrics.increment.mock.calls[4][0]).toBe(IN_MEMORY_METRICS.RULE_FAILURES);
    expect(inMemoryMetrics.increment.mock.calls[5][0]).toBe(IN_MEMORY_METRICS.RULE_TIMEOUTS);
  });

  test('does not persist alertInstances or recoveredAlertInstances passed in from state if autoRecoverAlerts is false', async () => {
    ruleType.autoRecoverAlerts = false;
    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        executorServices.alertFactory.create('1').scheduleActions('default');
        return { state: {} };
      }
    );
    const date = new Date().toISOString();
    const taskRunner = createTaskRunner({
      taskInstance: {
        ...mockedTaskInstance,
        state: {
          ...mockedTaskInstance.state,
          alertInstances: {
            '1': {
              meta: { lastScheduledActions: { group: 'default', date } },
              state: {
                bar: false,
                start: DATE_1969,
                duration: '80000000000',
              },
            },
            '2': {
              meta: { lastScheduledActions: { group: 'default', date } },
              state: {
                bar: false,
                start: '1969-12-31T06:00:00.000Z',
                duration: '70000000000',
              },
            },
          },
        },
      },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    const runnerResult = await taskRunner.run();
    expect(runnerResult.state.alertInstances).toEqual({});
    expect(runnerResult.state.alertRecoveredInstances).toEqual({});

    testAlertingEventLogCalls({
      activeAlerts: 1,
      recoveredAlerts: 0,
      triggeredActions: 0,
      generatedActions: 1,
      status: 'ok',
      logAlert: 0,
    });
    expect(alertingEventLogger.logAlert).not.toHaveBeenCalled();

    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('reports error to eventLogger when ruleResultService.addLastRunError adds an error', async () => {
    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    const taskRunner = createTaskRunner();

    ruleResultService.getLastRunResults.mockImplementation(() => ({
      errors: [
        { message: 'an error occurred', userError: false },
        { message: 'second error occurred', userError: true },
      ],
      warnings: [],
      outcomeMessage: '',
    }));

    const runnerResult = await taskRunner.run();

    expect(inMemoryMetrics.increment).toHaveBeenCalledTimes(2);
    expect(inMemoryMetrics.increment.mock.calls[0][0]).toBe(IN_MEMORY_METRICS.RULE_EXECUTIONS);
    expect(inMemoryMetrics.increment.mock.calls[1][0]).toBe(IN_MEMORY_METRICS.RULE_FAILURES);

    testAlertingEventLogCalls({
      status: 'error',
      softErrorFromLastRun: true,
      errorMessage: 'an error occurred,second error occurred',
      errorReason: 'unknown',
    });

    expect(getErrorSource(runnerResult.taskRunError as Error)).toBe(TaskErrorSource.FRAMEWORK);
    expect(runnerResult.taskRunError?.message).toBe(
      'Executing Rule test:1 has resulted in the following error(s): an error occurred,second error occurred'
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Executing Rule test:1 has resulted in the following error(s): an error occurred,second error occurred',
      { tags: ['1', 'test', 'rule-run-failed', 'framework-error'] }
    );
  });

  test('returns user error if all the errors reported by getLastRunResults are user error', async () => {
    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    const taskRunner = createTaskRunner();

    ruleResultService.getLastRunResults.mockImplementation(() => ({
      errors: [
        { message: 'an error occurred', userError: true },
        { message: 'second error occurred', userError: true },
      ],
      warnings: [],
      outcomeMessage: '',
    }));

    const runnerResult = await taskRunner.run();

    expect(getErrorSource(runnerResult.taskRunError as Error)).toBe(TaskErrorSource.USER);
  });

  test('returns a taskRunError as user error when ruleType.executor throws a user error', async () => {
    const taskRunError = createTaskRunError(new Error(GENERIC_ERROR_MESSAGE), TaskErrorSource.USER);

    ruleType.executor.mockImplementation(
      async ({
        services: executorServices,
      }: RuleExecutorOptions<
        RuleTypeParams,
        RuleTypeState,
        AlertInstanceState,
        AlertInstanceContext,
        string,
        RuleAlertData
      >) => {
        throw taskRunError;
      }
    );

    const taskRunner = createTaskRunner();
    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(mockedRawRuleSO);

    const runnerResult = await taskRunner.run();

    expect(getErrorSource(runnerResult.taskRunError as Error)).toBe(TaskErrorSource.USER);
  });

  test('when there is a gap, report it with reason to alert event log', async () => {
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    jest.spyOn(RuleMonitoringService.prototype, 'getMonitoring').mockImplementation(() => {
      return {
        run: {
          history: [],
          calculated_metrics: {
            success_ratio: 0,
          },
          last_run: {
            timestamp: '2021-09-01T00:00:00.000Z',
            metrics: {
              gap_range: {
                gte: '2021-09-01T00:00:00.000Z',
                lte: '2021-09-01T00:00:00.001Z',
              },
              gap_reason: {
                type: gapReasonType.RULE_DISABLED,
              },
            },
          },
        },
      };
    });

    const taskRunner = createTaskRunner();

    await taskRunner.run();

    expect(alertingEventLogger.reportGap).toHaveBeenCalledWith({
      gap: { gte: '2021-09-01T00:00:00.000Z', lte: '2021-09-01T00:00:00.001Z' },
      reason: { type: gapReasonType.RULE_DISABLED },
    });
  });

  test('reschedules when persistAlerts returns an exception', async () => {
    const err = new ErrorWithType({
      message: 'Index is blocked',
      type: 'cluster_block_exception',
    });

    alertsClient.persistAlerts.mockRejectedValueOnce(err);
    alertsService.createAlertsClient.mockImplementation(() => alertsClient);

    const taskRunner = createTaskRunner();
    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(mockedRawRuleSO);

    const runnerResult = await taskRunner.run();

    expect(getErrorSource(runnerResult.taskRunError as Error)).toBe(TaskErrorSource.FRAMEWORK);
    expect(runnerResult.state).toEqual(mockedTaskInstance.state);
    expect(runnerResult.schedule!.interval).toEqual('1m');
    expect(runnerResult.taskRunError).toMatchInlineSnapshot('[Error: Index is blocked]');
    expect(logger.debug).toHaveBeenCalledWith(
      'Executing Rule default:test:1 has resulted in Error: Index is blocked',
      {
        tags: ['1', 'test', 'rule-run-failed', 'framework-error'],
      }
    );
  });

  test('reschedules when getting tracked alerts returns an exception', async () => {
    const err = new Error(GENERIC_ERROR_MESSAGE);
    alertsClient.initializeExecution.mockRejectedValueOnce(err);
    alertsService.createAlertsClient.mockImplementation(() => alertsClient);

    const taskRunner = createTaskRunner();
    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce(mockedRawRuleSO);

    const runnerResult = await taskRunner.run();

    expect(getErrorSource(runnerResult.taskRunError as Error)).toBe(TaskErrorSource.FRAMEWORK);
    expect(runnerResult.state).toEqual(mockedTaskInstance.state);
    expect(runnerResult.schedule!.interval).toEqual('10s');
    expect(runnerResult.taskRunError).toMatchInlineSnapshot('[Error: GENERIC ERROR MESSAGE]');
    expect(logger.debug).toHaveBeenCalledWith(
      'ruleRunStatus for test:1: {"outcome":"failed","outcomeOrder":20,"warning":"unknown","outcomeMsg":["GENERIC ERROR MESSAGE"],"alertsCount":{}}',
      {
        tags: ['1', 'test'],
      }
    );
  });

  test('should not run the rule and return DeleteRuleTaskRunResult when the task is outdated', async () => {
    const taskRunner = createTaskRunner({
      taskInstance: { ...mockedTaskInstance, id: 'old-task-id' },
    });
    expect(AlertingEventLogger).toHaveBeenCalled();
    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    const result = await taskRunner.run();

    expect(logger.info).toBeCalledTimes(1);
    const loggerCall = logger.info.mock.calls[0][0];
    expect(loggerCall).toMatchInlineSnapshot(
      `"Outdated task version: The task instance ID: old-task-id does not match the rule ID: 1."`
    );

    expect(ruleType.executor).not.toHaveBeenCalled();

    expect(result).toEqual({
      monitoring: undefined,
      schedule: undefined,
      shouldDeleteTask: true,
      state: {},
    });
  });

  test('should return shouldDisableTask when task is enabled but rule is not', async () => {
    const taskRunner = createTaskRunner({ taskInstance: { ...mockedTaskInstance } });
    expect(AlertingEventLogger).toHaveBeenCalled();
    const mockedRuleTypeSavedObjectDisabled = {
      ...(mockedRuleTypeSavedObject as Rule),
      enabled: false,
    };
    const mockedRawRuleSODisabled: SavedObject<RawRule> = {
      ...mockedRawRuleSO,
    };
    mockedRawRuleSODisabled.attributes.enabled = false;

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObjectDisabled);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

    const result = await taskRunner.run();

    expect(ruleType.executor).not.toHaveBeenCalled();

    expect(result.shouldDisableTask).toEqual(true);
    expect(result.taskRunError?.message).toBe(
      'Rule failed to execute because rule ran after it was disabled.'
    );
  });

  test('should atomically remove expired snoozedInstances using a Painless script', async () => {
    const expiredSnooze = {
      instanceId: 'alert-1',
      expiresAt: '1969-12-31T23:59:59.000Z',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
    };
    const activeSnooze = {
      instanceId: 'alert-2',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
    };
    const rawRuleSOWithSnooze: SavedObject<RawRule> = {
      ...mockedRawRuleSO,
      attributes: {
        ...mockedRawRuleSO.attributes,
        enabled: true,
        snoozedInstances: [expiredSnooze, activeSnooze],
      },
    };

    const taskRunner = new TaskRunner({
      ruleType,
      taskInstance: mockedTaskInstance,
      context: taskRunnerFactoryInitializerParams,
      inMemoryMetrics,
      internalSavedObjectsRepository,
    });

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(rawRuleSOWithSnooze);

    await taskRunner.run();

    // The script-based atomic remove should have been called with the expired ID only.
    // The surviving active snooze ('alert-2') should NOT be listed — it is preserved
    // in ES because the script only removes the specified IDs, not the whole array.
    expect(elasticsearchService.client.asInternalUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          lang: 'painless',
          params: {
            expired: [{ instanceId: 'alert-1', snoozedAt: '1969-12-01T00:00:00.000Z' }],
          },
        }),
      }),
      expect.anything()
    );

    // Must not replace the whole array via a doc update — that would cause the race condition
    expect(elasticsearchService.client.asInternalUser.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        doc: expect.objectContaining({
          alert: expect.objectContaining({ snoozedInstances: expect.anything() }),
        }),
      }),
      expect.anything()
    );

    expect(auditService.withoutRequest.log).toHaveBeenCalledTimes(1);
    expect(auditService.withoutRequest.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          action: 'alert_auto_unsnooze',
          outcome: 'success',
        }),
        kibana: expect.objectContaining({
          saved_object: expect.objectContaining({ type: RULE_SAVED_OBJECT_TYPE }),
        }),
        message: expect.stringContaining('alert-1'),
      })
    );
    expect(auditService.withoutRequest.log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('reason: ttl_expired'),
      })
    );
  });

  test('should not call the atomic remove script when no snooze entries have expired', async () => {
    const activeSnooze = {
      instanceId: 'alert-2',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
    };
    const rawRuleSOWithSnooze: SavedObject<RawRule> = {
      ...mockedRawRuleSO,
      attributes: {
        ...mockedRawRuleSO.attributes,
        enabled: true,
        snoozedInstances: [activeSnooze],
      },
    };

    const taskRunner = new TaskRunner({
      ruleType,
      taskInstance: mockedTaskInstance,
      context: taskRunnerFactoryInitializerParams,
      inMemoryMetrics,
      internalSavedObjectsRepository,
    });

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(rawRuleSOWithSnooze);

    await taskRunner.run();

    // No expired entries → the atomic script should not be called
    expect(elasticsearchService.client.asInternalUser.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ script: expect.anything() }),
      expect.anything()
    );
    expect(elasticsearchService.client.asInternalUser.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ script: expect.anything() })
    );
  });

  test('should atomically remove snoozed instance when field_change condition is met', async () => {
    const conditionSnooze = {
      instanceId: 'alert-1',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
      conditions: [{ type: 'field_change' as const, field: 'kibana.alert.severity' }],
      snoozeSnapshot: { 'kibana.alert.severity': 'critical' },
    };
    const rawRuleSOWithSnooze: SavedObject<RawRule> = {
      ...mockedRawRuleSO,
      attributes: {
        ...mockedRawRuleSO.attributes,
        enabled: true,
        snoozedInstances: [conditionSnooze],
      },
    };

    // Current severity ('high') differs from the snapshot ('critical') → condition met
    alertsClient.getBuiltActiveAlertDataByInstanceId.mockImplementation((instanceId: string) =>
      instanceId === 'alert-1' ? { 'kibana.alert.severity': 'high' } : undefined
    );
    alertsClient.getRawAlertInstancesForState.mockReturnValue({
      rawActiveAlerts: {},
      rawRecoveredAlerts: {},
    });
    alertsService.createAlertsClient.mockImplementation(() => alertsClient);

    const taskRunner = new TaskRunner({
      ruleType,
      taskInstance: mockedTaskInstance,
      context: taskRunnerFactoryInitializerParams,
      inMemoryMetrics,
      internalSavedObjectsRepository,
    });

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(rawRuleSOWithSnooze);

    await taskRunner.run();

    expect(elasticsearchService.client.asInternalUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          lang: 'painless',
          params: {
            expired: [{ instanceId: 'alert-1', snoozedAt: '1969-12-01T00:00:00.000Z' }],
          },
        }),
      }),
      expect.anything()
    );

    expect(auditService.withoutRequest.log).toHaveBeenCalledTimes(1);
    expect(auditService.withoutRequest.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          action: 'alert_auto_unsnooze',
          outcome: 'success',
        }),
        message: expect.stringContaining('alert-1'),
      })
    );
    expect(auditService.withoutRequest.log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('reason: condition_met'),
      })
    );
  });

  test('should call clearSnoozedStatusForAlerts for condition-expired instances', async () => {
    const conditionSnooze = {
      instanceId: 'alert-1',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
      conditions: [{ type: 'field_change' as const, field: 'kibana.alert.severity' }],
      snoozeSnapshot: { 'kibana.alert.severity': 'critical' },
    };
    const rawRuleSOWithSnooze: SavedObject<RawRule> = {
      ...mockedRawRuleSO,
      attributes: {
        ...mockedRawRuleSO.attributes,
        enabled: true,
        snoozedInstances: [conditionSnooze],
      },
    };

    // Current severity ('high') differs from snapshot ('critical') → condition met
    alertsClient.getBuiltActiveAlertDataByInstanceId.mockImplementation((instanceId: string) =>
      instanceId === 'alert-1' ? { 'kibana.alert.severity': 'high' } : undefined
    );
    alertsClient.getRawAlertInstancesForState.mockReturnValue({
      rawActiveAlerts: {},
      rawRecoveredAlerts: {},
    });
    alertsService.createAlertsClient.mockImplementation(() => alertsClient);

    const taskRunner = new TaskRunner({
      ruleType,
      taskInstance: mockedTaskInstance,
      context: taskRunnerFactoryInitializerParams,
      inMemoryMetrics,
      internalSavedObjectsRepository,
    });

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(rawRuleSOWithSnooze);

    await taskRunner.run();

    expect(alertsClient.clearSnoozedStatusForAlerts).toHaveBeenCalledWith(['alert-1']);
  });

  test('should NOT call clearSnoozedStatusForAlerts when field_change condition is not met', async () => {
    const conditionSnooze = {
      instanceId: 'alert-1',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
      conditions: [{ type: 'field_change' as const, field: 'kibana.alert.severity' }],
      snoozeSnapshot: { 'kibana.alert.severity': 'critical' },
    };
    const rawRuleSOWithSnooze: SavedObject<RawRule> = {
      ...mockedRawRuleSO,
      attributes: {
        ...mockedRawRuleSO.attributes,
        enabled: true,
        snoozedInstances: [conditionSnooze],
      },
    };

    // Current severity matches snapshot → condition NOT met
    alertsClient.getBuiltActiveAlertDataByInstanceId.mockImplementation((instanceId: string) =>
      instanceId === 'alert-1' ? { 'kibana.alert.severity': 'critical' } : undefined
    );
    alertsClient.getRawAlertInstancesForState.mockReturnValue({
      rawActiveAlerts: {},
      rawRecoveredAlerts: {},
    });
    alertsService.createAlertsClient.mockImplementation(() => alertsClient);

    const taskRunner = new TaskRunner({
      ruleType,
      taskInstance: mockedTaskInstance,
      context: taskRunnerFactoryInitializerParams,
      inMemoryMetrics,
      internalSavedObjectsRepository,
    });

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(rawRuleSOWithSnooze);

    await taskRunner.run();

    expect(alertsClient.clearSnoozedStatusForAlerts).not.toHaveBeenCalled();
  });

  test('should NOT call the atomic remove script when field_change condition is not met', async () => {
    const conditionSnooze = {
      instanceId: 'alert-1',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
      conditions: [{ type: 'field_change' as const, field: 'kibana.alert.severity' }],
      snoozeSnapshot: { 'kibana.alert.severity': 'critical' },
    };
    const rawRuleSOWithSnooze: SavedObject<RawRule> = {
      ...mockedRawRuleSO,
      attributes: {
        ...mockedRawRuleSO.attributes,
        enabled: true,
        snoozedInstances: [conditionSnooze],
      },
    };

    // Current severity matches snapshot ('critical' === 'critical') → condition not met
    alertsClient.getBuiltActiveAlertDataByInstanceId.mockImplementation((instanceId: string) =>
      instanceId === 'alert-1' ? { 'kibana.alert.severity': 'critical' } : undefined
    );
    alertsClient.getRawAlertInstancesForState.mockReturnValue({
      rawActiveAlerts: {},
      rawRecoveredAlerts: {},
    });
    alertsService.createAlertsClient.mockImplementation(() => alertsClient);

    const taskRunner = new TaskRunner({
      ruleType,
      taskInstance: mockedTaskInstance,
      context: taskRunnerFactoryInitializerParams,
      inMemoryMetrics,
      internalSavedObjectsRepository,
    });

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(rawRuleSOWithSnooze);

    await taskRunner.run();

    // No entries expired → the atomic script should not be called
    expect(elasticsearchService.client.asInternalUser.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ script: expect.anything() }),
      expect.anything()
    );
    expect(elasticsearchService.client.asInternalUser.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ script: expect.anything() })
    );

    expect(auditService.withoutRequest.log).not.toHaveBeenCalled();
  });

  test('should NOT remove snoozed instance with conditions when alert is not currently firing', async () => {
    const conditionSnooze = {
      instanceId: 'alert-1',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
      conditions: [{ type: 'field_change' as const, field: 'kibana.alert.severity' }],
      snoozeSnapshot: { 'kibana.alert.severity': 'critical' },
    };
    const rawRuleSOWithSnooze: SavedObject<RawRule> = {
      ...mockedRawRuleSO,
      attributes: {
        ...mockedRawRuleSO.attributes,
        enabled: true,
        snoozedInstances: [conditionSnooze],
      },
    };

    // Alert is not in active alerts — skip condition evaluation, keep snooze
    alertsClient.getProcessedAlerts.mockReturnValue({});
    alertsClient.getRawAlertInstancesForState.mockReturnValue({
      rawActiveAlerts: {},
      rawRecoveredAlerts: {},
    });
    alertsService.createAlertsClient.mockImplementation(() => alertsClient);

    const taskRunner = new TaskRunner({
      ruleType,
      taskInstance: mockedTaskInstance,
      context: taskRunnerFactoryInitializerParams,
      inMemoryMetrics,
      internalSavedObjectsRepository,
    });

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(rawRuleSOWithSnooze);

    await taskRunner.run();

    // No entries expired → the atomic script should not be called
    expect(elasticsearchService.client.asInternalUser.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ script: expect.anything() }),
      expect.anything()
    );
    expect(elasticsearchService.client.asInternalUser.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ script: expect.anything() })
    );

    expect(auditService.withoutRequest.log).not.toHaveBeenCalled();
  });

  test('should prune both time-expired and condition-expired instances in one pass', async () => {
    const timeExpiredSnooze = {
      instanceId: 'alert-expired-time',
      expiresAt: '1969-12-31T23:59:59.000Z',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
    };
    const conditionExpiredSnooze = {
      instanceId: 'alert-condition-change',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
      conditions: [{ type: 'field_change' as const, field: 'kibana.alert.severity' }],
      snoozeSnapshot: { 'kibana.alert.severity': 'critical' },
    };
    const stillActiveSnooze = {
      instanceId: 'alert-still-snoozed',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
    };
    const rawRuleSOWithSnooze: SavedObject<RawRule> = {
      ...mockedRawRuleSO,
      attributes: {
        ...mockedRawRuleSO.attributes,
        enabled: true,
        snoozedInstances: [timeExpiredSnooze, conditionExpiredSnooze, stillActiveSnooze],
      },
    };

    // Current severity ('high') differs from the snapshot ('critical') → condition met
    alertsClient.getBuiltActiveAlertDataByInstanceId.mockImplementation((instanceId: string) =>
      instanceId === 'alert-condition-change' ? { 'kibana.alert.severity': 'high' } : undefined
    );
    alertsClient.getRawAlertInstancesForState.mockReturnValue({
      rawActiveAlerts: {},
      rawRecoveredAlerts: {},
    });
    alertsService.createAlertsClient.mockImplementation(() => alertsClient);

    const taskRunner = new TaskRunner({
      ruleType,
      taskInstance: mockedTaskInstance,
      context: taskRunnerFactoryInitializerParams,
      inMemoryMetrics,
      internalSavedObjectsRepository,
    });

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(rawRuleSOWithSnooze);

    await taskRunner.run();

    // Both expired IDs should be passed together to the atomic script,
    // while 'alert-still-snoozed' is untouched in ES.
    expect(elasticsearchService.client.asInternalUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          lang: 'painless',
          params: {
            expired: expect.arrayContaining([
              { instanceId: 'alert-expired-time', snoozedAt: '1969-12-01T00:00:00.000Z' },
              { instanceId: 'alert-condition-change', snoozedAt: '1969-12-01T00:00:00.000Z' },
            ]),
          },
        }),
      }),
      expect.anything()
    );

    expect(auditService.withoutRequest.log).toHaveBeenCalledTimes(2);
    expect(auditService.withoutRequest.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ action: 'alert_auto_unsnooze' }),
        message: expect.stringContaining('alert-expired-time'),
      })
    );
    expect(auditService.withoutRequest.log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('reason: ttl_expired'),
      })
    );
    expect(auditService.withoutRequest.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ action: 'alert_auto_unsnooze' }),
        message: expect.stringContaining('alert-condition-change'),
      })
    );
    expect(auditService.withoutRequest.log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('reason: condition_met'),
      })
    );
  });

  test('should NOT emit alert_auto_unsnooze audit events when the rule SO update fails', async () => {
    const expiredSnooze = {
      instanceId: 'alert-1',
      expiresAt: '1969-12-31T23:59:59.000Z',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
    };
    const rawRuleSOWithSnooze: SavedObject<RawRule> = {
      ...mockedRawRuleSO,
      attributes: {
        ...mockedRawRuleSO.attributes,
        enabled: true,
        snoozedInstances: [expiredSnooze],
      },
    };

    elasticsearchService.client.asInternalUser.update.mockRejectedValueOnce(
      new Error('simulated ES update failure')
    );

    const taskRunner = new TaskRunner({
      ruleType,
      taskInstance: mockedTaskInstance,
      context: taskRunnerFactoryInitializerParams,
      inMemoryMetrics,
      internalSavedObjectsRepository,
    });

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(rawRuleSOWithSnooze);

    await taskRunner.run();

    expect(auditService.withoutRequest.log).not.toHaveBeenCalled();
  });

  test('concurrent snooze: atomic script preserves user-added entry despite concurrent TTL expiry', async () => {
    // Simulates the race condition described in kibana-team#3176:
    //   T0: rule run loads SO with snoozedInstances = [A, B_expired]
    //   T1: user API adds C → SO now has [A, B_expired, C]
    //   T2: rule run finishes, should only remove B_expired (not overwrite with [A])
    //
    // Because we use a Painless removeIf script instead of a full-array doc update,
    // the script only removes the IDs we found expired at T0, so C is preserved by ES.
    // This test verifies the correct IDs are sent and that no doc-level array write happens.
    const expiredSnooze = {
      instanceId: 'alert-expired',
      expiresAt: '1969-12-31T23:59:59.000Z',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
    };
    const stillActiveSnooze = {
      instanceId: 'alert-active',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
    };
    // The rule SO loaded at the start of the run (before the concurrent user snooze)
    const rawRuleSOAtRunStart: SavedObject<RawRule> = {
      ...mockedRawRuleSO,
      attributes: {
        ...mockedRawRuleSO.attributes,
        enabled: true,
        snoozedInstances: [expiredSnooze, stillActiveSnooze],
      },
    };

    const taskRunner = new TaskRunner({
      ruleType,
      taskInstance: mockedTaskInstance,
      context: taskRunnerFactoryInitializerParams,
      inMemoryMetrics,
      internalSavedObjectsRepository,
    });

    mockGetRuleFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(rawRuleSOAtRunStart);

    await taskRunner.run();

    // The post-run write must use the Painless script with only the expired ID.
    // Even if a user concurrently added 'alert-concurrent' to the SO, that entry
    // remains untouched in ES because we never replace the full array.
    expect(elasticsearchService.client.asInternalUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          lang: 'painless',
          params: {
            expired: [{ instanceId: 'alert-expired', snoozedAt: '1969-12-01T00:00:00.000Z' }],
          },
        }),
      }),
      expect.anything()
    );

    // Confirm no full-array doc replacement was made for snoozedInstances
    expect(elasticsearchService.client.asInternalUser.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        doc: expect.objectContaining({
          alert: expect.objectContaining({ snoozedInstances: expect.anything() }),
        }),
      }),
      expect.anything()
    );
  });

  function testAlertingEventLogCalls({
    ruleContext = alertingEventLoggerInitializer,
    ruleTypeDef = ruleType,
    activeAlerts = 0,
    newAlerts = 0,
    recoveredAlerts = 0,
    triggeredActions = 0,
    generatedActions = 0,
    status,
    errorReason,
    errorMessage = 'GENERIC ERROR MESSAGE',
    executionStatus = 'succeeded',
    setRuleName = true,
    maintenanceWindowIds,
    logAlert = 0,
    logAction = 0,
    hasReachedAlertLimit = false,
    hasReachedQueuedActionsLimit = false,
    softErrorFromLastRun = false,
  }: {
    status: string;
    ruleContext?: ContextOpts;
    ruleTypeDef?: UntypedNormalizedRuleType;
    activeAlerts?: number;
    newAlerts?: number;
    recoveredAlerts?: number;
    triggeredActions?: number;
    generatedActions?: number;
    executionStatus?: 'succeeded' | 'failed' | 'not-reached';
    setRuleName?: boolean;
    maintenanceWindowIds?: string[];
    logAlert?: number;
    logAction?: number;
    errorReason?: string;
    errorMessage?: string;
    hasReachedAlertLimit?: boolean;
    hasReachedQueuedActionsLimit?: boolean;
    softErrorFromLastRun?: boolean;
  }) {
    expect(alertingEventLogger.initialize).toHaveBeenCalledWith({
      context: ruleContext,
      runDate: new Date(DATE_1970),
      ruleData: {
        id: mockedTaskInstance.params.alertId,
        type: ruleTypeDef,
        consumer: 'bar',
      },
    });
    if (setRuleName) {
      expect(alertingEventLogger.addOrUpdateRuleData).toHaveBeenCalledWith({
        name: mockedRuleTypeSavedObject.name,
        consumer: mockedRuleTypeSavedObject.consumer,
        revision: mockedRuleTypeSavedObject.revision,
      });
    } else {
      expect(alertingEventLogger.addOrUpdateRuleData).not.toHaveBeenCalled();
    }
    if (status !== 'skip') {
      expect(alertingEventLogger.getStartAndDuration).toHaveBeenCalled();
    }
    if (maintenanceWindowIds?.length) {
      expect(alertingEventLogger.setMaintenanceWindowIds).toHaveBeenCalledWith(
        maintenanceWindowIds
      );
    }
    if (status === 'error') {
      if (softErrorFromLastRun) {
        expect(alertingEventLogger.done).toHaveBeenCalledWith(
          expect.objectContaining({
            status: {
              lastExecutionDate: new Date('1970-01-01T00:00:00.000Z'),
              status,
              error: {
                message: errorMessage,
                reason: errorReason,
              },
            },
          })
        );
      } else {
        expect(alertingEventLogger.done).toHaveBeenCalledWith({
          metrics: null,
          status: {
            lastExecutionDate: new Date('1970-01-01T00:00:00.000Z'),
            status,
            error: {
              message: errorMessage,
              reason: errorReason,
            },
          },
          timings: {
            claim_to_start_duration_ms: 0,
            persist_alerts_duration_ms: 0,
            prepare_rule_duration_ms: 0,
            process_alerts_duration_ms: 0,
            process_rule_duration_ms: 0,
            rule_type_run_duration_ms: 0,
            total_run_duration_ms: 0,
            trigger_actions_duration_ms: 0,
            update_alerts_duration_ms: 0,
          },
        });
      }
    } else if (status === 'warning') {
      expect(alertingEventLogger.done).toHaveBeenCalledWith({
        metrics: {
          esSearchDurationMs: 33,
          numSearches: 3,
          numberOfActiveAlerts: activeAlerts,
          numberOfGeneratedActions: generatedActions,
          numberOfNewAlerts: newAlerts,
          numberOfRecoveredAlerts: recoveredAlerts,
          numberOfTriggeredActions: triggeredActions,
          numberOfDelayedAlerts: 0,
          totalSearchDurationMs: 23423,
          hasReachedAlertLimit,
          triggeredActionsStatus: 'partial',
          hasReachedQueuedActionsLimit,
        },
        status: {
          lastExecutionDate: new Date('1970-01-01T00:00:00.000Z'),
          status,
          warning: {
            message: `The maximum number of actions for this rule type was reached; excess actions were not triggered.`,
            reason: errorReason,
          },
        },
        timings: {
          claim_to_start_duration_ms: 0,
          persist_alerts_duration_ms: 0,
          prepare_rule_duration_ms: 0,
          process_alerts_duration_ms: 0,
          process_rule_duration_ms: 0,
          rule_type_run_duration_ms: 0,
          total_run_duration_ms: 0,
          trigger_actions_duration_ms: 0,
          update_alerts_duration_ms: 0,
        },
      });
    } else if (status === 'skip') {
      expect(alertingEventLogger.done).not.toHaveBeenCalled();
    } else {
      expect(alertingEventLogger.done).toHaveBeenCalledWith({
        metrics: {
          esSearchDurationMs: 33,
          numSearches: 3,
          numberOfActiveAlerts: activeAlerts,
          numberOfGeneratedActions: generatedActions,
          numberOfNewAlerts: newAlerts,
          numberOfRecoveredAlerts: recoveredAlerts,
          numberOfTriggeredActions: triggeredActions,
          numberOfDelayedAlerts: 0,
          totalSearchDurationMs: 23423,
          hasReachedAlertLimit,
          triggeredActionsStatus: 'complete',
          hasReachedQueuedActionsLimit,
        },
        consumerMetrics: undefined,
        status: {
          lastExecutionDate: new Date('1970-01-01T00:00:00.000Z'),
          status,
        },
        timings: {
          claim_to_start_duration_ms: 0,
          persist_alerts_duration_ms: 0,
          prepare_rule_duration_ms: 0,
          process_alerts_duration_ms: 0,
          process_rule_duration_ms: 0,
          rule_type_run_duration_ms: 0,
          total_run_duration_ms: 0,
          trigger_actions_duration_ms: 0,
          update_alerts_duration_ms: 0,
        },
      });
    }

    if (executionStatus === 'succeeded') {
      expect(alertingEventLogger.setExecutionSucceeded).toHaveBeenCalledWith(
        `rule executed: test:1: 'rule-name'`
      );
      expect(alertingEventLogger.setExecutionFailed).not.toHaveBeenCalled();
    } else if (executionStatus === 'failed') {
      expect(alertingEventLogger.setExecutionFailed).toHaveBeenCalledWith(
        `rule execution failure: test:1: 'rule-name'`,
        errorMessage
      );
      expect(alertingEventLogger.setExecutionSucceeded).not.toHaveBeenCalled();
    } else if (executionStatus === 'not-reached') {
      expect(alertingEventLogger.setExecutionSucceeded).not.toHaveBeenCalled();
      expect(alertingEventLogger.setExecutionFailed).not.toHaveBeenCalled();
    }

    if (logAlert > 0) {
      expect(alertingEventLogger.logAlert).toHaveBeenCalledTimes(logAlert);
    } else {
      expect(alertingEventLogger.logAlert).not.toHaveBeenCalled();
    }

    if (logAction > 0) {
      expect(alertingEventLogger.logAction).toHaveBeenCalledTimes(logAction);
    } else {
      expect(alertingEventLogger.logAction).not.toHaveBeenCalled();
    }
    expect(alertingEventLogger.logTimeout).not.toHaveBeenCalled();
  }
});
