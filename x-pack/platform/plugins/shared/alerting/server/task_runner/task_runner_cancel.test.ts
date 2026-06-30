/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import sinon from 'sinon';
import { usageCountersServiceMock } from '@kbn/usage-collection-plugin/server/usage_counters/usage_counters_service.mock';
import type {
  RuleExecutorOptions,
  RuleTypeParams,
  RuleTypeState,
  AlertInstanceState,
  AlertInstanceContext,
  Rule,
  RuleAlertData,
} from '../types';
import { DEFAULT_FLAPPING_SETTINGS, DEFAULT_QUERY_DELAY_SETTINGS } from '../types';
import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import { TaskRunner } from './task_runner';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import {
  loggingSystemMock,
  savedObjectsRepositoryMock,
  executionContextServiceMock,
  savedObjectsServiceMock,
  elasticsearchServiceMock,
  uiSettingsServiceMock,
} from '@kbn/core/server/mocks';
import type { PluginStartContract as ActionsPluginStart } from '@kbn/actions-plugin/server';
import { actionsMock, actionsClientMock } from '@kbn/actions-plugin/server/mocks';
import { alertsMock } from '../mocks';
import { eventLoggerMock } from '@kbn/event-log-plugin/server/event_logger.mock';
import type { IEventLogger } from '@kbn/event-log-plugin/server';
import { ruleTypeRegistryMock } from '../rule_type_registry.mock';
import { dataPluginMock } from '@kbn/data-plugin/server/mocks';
import { inMemoryMetricsMock } from '../monitoring/in_memory_metrics.mock';
import { getAlertFromRaw } from '../rules_client/lib/get_alert_from_raw';
import type { ContextOpts } from '../lib/alerting_event_logger/alerting_event_logger';
import { AlertingEventLogger } from '../lib/alerting_event_logger/alerting_event_logger';
import { alertingEventLoggerMock } from '../lib/alerting_event_logger/alerting_event_logger.mock';
import {
  mockTaskInstance,
  ruleType,
  mockedRuleTypeSavedObject,
  generateAlertOpts,
  DATE_1970,
  generateActionOpts,
  mockedRawRuleSO,
} from './fixtures';
import { EVENT_LOG_ACTIONS } from '../plugin';
import type { SharePluginStart } from '@kbn/share-plugin/server';
import type { DataViewsServerPluginStart } from '@kbn/data-views-plugin/server';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import { alertsServiceMock } from '../alerts_service/alerts_service.mock';
import { ConnectorAdapterRegistry } from '../connector_adapters/connector_adapter_registry';
import { RULE_SAVED_OBJECT_TYPE } from '../saved_objects';
import type { TaskRunnerContext } from './types';
import { ApiKeyType } from './types';
import { backfillClientMock } from '../backfill_client/backfill_client.mock';
import type { UntypedNormalizedRuleType } from '../rule_type_registry';
import { rulesSettingsServiceMock } from '../rules_settings/rules_settings_service.mock';
import { ALERTING_CASES_SAVED_OBJECT_INDEX } from '@kbn/core-saved-objects-server';
import { maintenanceWindowsServiceMock } from './maintenance_windows/maintenance_windows_service.mock';
import { eventLogClientMock } from '@kbn/event-log-plugin/server/mocks';

const RULE_EXECUTION_UUID = '5f6aa57d-3e22-484e-bae8-cbed868f4d28';
jest.mock('uuid', () => ({
  v4: () => RULE_EXECUTION_UUID,
}));
jest.mock('../lib/wrap_scoped_cluster_client', () => ({
  createWrappedScopedClusterClientFactory: jest.fn(),
}));

jest.mock('../lib/alerting_event_logger/alerting_event_logger');

jest.mock('../rules_client/lib/get_alert_from_raw');
const mockGetAlertFromRaw = getAlertFromRaw as jest.MockedFunction<typeof getAlertFromRaw>;

let fakeTimer: sinon.SinonFakeTimers;

const mockUsageCountersSetup = usageCountersServiceMock.createSetupContract();
const mockUsageCounter = mockUsageCountersSetup.createUsageCounter('test');
const alertingEventLogger = alertingEventLoggerMock.create();
const logger: ReturnType<typeof loggingSystemMock.createLogger> = loggingSystemMock.createLogger();
const dataViewsMock = {
  dataViewsServiceFactory: jest.fn().mockResolvedValue(dataViewPluginMocks.createStartContract()),
  getScriptedFieldsEnabled: jest.fn().mockReturnValue(true),
} as DataViewsServerPluginStart;
const alertsService = alertsServiceMock.create();
const maintenanceWindowsService = maintenanceWindowsServiceMock.create();

describe('Task Runner Cancel', () => {
  let mockedTaskInstance: ConcreteTaskInstance;
  let alertingEventLoggerInitializer: ContextOpts;

  beforeAll(() => {
    fakeTimer = sinon.useFakeTimers();
    mockedTaskInstance = mockTaskInstance();

    alertingEventLoggerInitializer = {
      executionId: RULE_EXECUTION_UUID,
      savedObjectId: mockedTaskInstance.params.alertId,
      savedObjectType: RULE_SAVED_OBJECT_TYPE,
      spaceId: mockedTaskInstance.params.spaceId,
      taskScheduledAt: mockedTaskInstance.scheduledAt,
    };
  });

  afterAll(() => fakeTimer.restore());

  const encryptedSavedObjectsClient = encryptedSavedObjectsMock.createClient();
  const services = alertsMock.createRuleExecutorServices();
  const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();
  const backfillClient = backfillClientMock.create();
  const actionsClient = actionsClientMock.create();
  const ruleTypeRegistry = ruleTypeRegistryMock.create();
  const savedObjectsService = savedObjectsServiceMock.createInternalStartContract();
  const elasticsearchService = elasticsearchServiceMock.createInternalStart();
  const uiSettingsService = uiSettingsServiceMock.createStartContract();
  const dataPlugin = dataPluginMock.createStartContract();
  const inMemoryMetrics = inMemoryMetricsMock.create();
  const connectorAdapterRegistry = new ConnectorAdapterRegistry();
  const rulesSettingsService = rulesSettingsServiceMock.create();

  type TaskRunnerFactoryInitializerParamsType = jest.Mocked<TaskRunnerContext> & {
    actionsPlugin: jest.Mocked<ActionsPluginStart>;
    eventLogger: jest.Mocked<IEventLogger>;
    executionContext: ReturnType<typeof executionContextServiceMock.createInternalStartContract>;
  };

  const taskRunnerFactoryInitializerParams: TaskRunnerFactoryInitializerParamsType = {
    actionsConfigMap: { default: { max: 1000 } },
    actionsPlugin: actionsMock.createStart(),
    alertsService,
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
  };

  beforeEach(() => {
    jest.resetAllMocks();
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
    ruleTypeRegistry.get.mockReturnValue(ruleType);
    taskRunnerFactoryInitializerParams.executionContext.withContext.mockImplementation((ctx, fn) =>
      fn()
    );
    rulesSettingsService.getSettings.mockResolvedValue({
      flappingSettings: DEFAULT_FLAPPING_SETTINGS,
      queryDelaySettings: DEFAULT_QUERY_DELAY_SETTINGS,
    });
    mockGetAlertFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
    maintenanceWindowsService.getMaintenanceWindows.mockReturnValue({
      maintenanceWindows: [],
      maintenanceWindowsWithoutScopedQueryIds: [],
    });
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    alertingEventLogger.getStartAndDuration.mockImplementation(() => ({ start: new Date() }));
    (AlertingEventLogger as jest.Mock).mockImplementation(() => alertingEventLogger);
    logger.get.mockImplementation(() => logger);
    logger.isLevelEnabled.mockReturnValue(true);

    actionsClient.bulkEnqueueExecution.mockResolvedValue({ errors: false, items: [] });
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

  test('updates rule saved object execution status and writes to event log entry when task is cancelled mid-execution', async () => {
    const taskRunner = createTaskRunner();
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

    const promise = taskRunner.run();
    await Promise.resolve();
    await taskRunner.cancel();
    await promise;

    expect(logger.debug).toHaveBeenNthCalledWith(
      3,
      `Aborting any in-progress ES searches for rule type test with id 1`,
      { tags: ['1', 'test'] }
    );

    expect(logger.debug).toHaveBeenNthCalledWith(
      5,
      `skipping persisting alerts for rule test:1: 'rule-name': rule execution has been cancelled.`,
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).toHaveBeenNthCalledWith(
      6,
      `no scheduling of actions for rule test:1: 'rule-name': rule execution has been cancelled.`,
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).toHaveBeenNthCalledWith(
      7,
      `skipping updating alerts for rule test:1: 'rule-name': rule execution has been cancelled.`,
      { tags: ['1', 'test'] }
    );

    testAlertingEventLogCalls({ status: 'ok' });

    expect(elasticsearchService.client.asInternalUser.update).toHaveBeenCalledTimes(1);
    expect(elasticsearchService.client.asInternalUser.update).toHaveBeenCalledWith(
      {
        id: `alert:1`,
        index: ALERTING_CASES_SAVED_OBJECT_INDEX,
        doc: {
          alert: {
            executionStatus: {
              error: {
                message: `test:1: execution cancelled due to timeout - exceeded rule type timeout of 5m`,
                reason: 'timeout',
              },
              lastDuration: 0,
              lastExecutionDate: '1970-01-01T00:00:00.000Z',
              status: 'error',
              warning: null,
            },
            lastRun: {
              alertsCount: {},
              outcome: 'failed',
              outcomeMsg: [
                'test:1: execution cancelled due to timeout - exceeded rule type timeout of 5m',
              ],
              outcomeOrder: 20,
              warning: 'timeout',
            },
            monitoring: {
              run: {
                calculated_metrics: {
                  success_ratio: 0,
                },
                history: [],
                last_run: {
                  metrics: {
                    duration: 0,
                    gap_duration_s: null,
                    gap_range: null,
                    gap_reason: null,
                    total_alerts_created: null,
                    total_alerts_detected: null,
                    total_indexing_duration_ms: null,
                    total_search_duration_ms: null,
                  },
                  timestamp: '1970-01-01T00:00:00.000Z',
                },
              },
            },
            nextRun: '1970-01-01T00:00:10.000Z',
            running: false,
          },
        },
      },
      { ignore: [404] }
    );
    expect(mockUsageCounter.incrementCounter).toHaveBeenCalledTimes(1);
    expect(mockUsageCounter.incrementCounter).toHaveBeenCalledWith({
      counterName: 'alertsSkippedDueToRuleExecutionTimeout_test',
      incrementBy: 1,
    });
  });

  test('actionsPlugin.execute is called if rule execution is cancelled but cancelAlertsOnRuleTimeout from config is false', async () => {
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
    // setting cancelAlertsOnRuleTimeout to false here
    const taskRunner = createTaskRunner({
      context: { ...taskRunnerFactoryInitializerParams, cancelAlertsOnRuleTimeout: false },
    });
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

    const promise = taskRunner.run();
    await Promise.resolve();
    await taskRunner.cancel();
    await promise;

    testLogger();
    testAlertingEventLogCalls({
      status: 'active',
      newAlerts: 1,
      activeAlerts: 1,
      generatedActions: 1,
      triggeredActions: 1,
      logAction: 1,
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
    expect(alertingEventLogger.logAction).toHaveBeenNthCalledWith(1, generateActionOpts({}));

    expect(mockUsageCounter.incrementCounter).not.toHaveBeenCalled();
  });

  test('actionsPlugin.execute is called if rule execution is cancelled but cancelAlertsOnRuleTimeout for ruleType is false', async () => {
    const updatedRuleType = {
      ...ruleType,
      cancelAlertsOnRuleTimeout: false,
    };
    ruleTypeRegistry.get.mockReturnValue(updatedRuleType);
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
    // setting cancelAlertsOnRuleTimeout for ruleType to false here
    const taskRunner = createTaskRunner({ ruleType: updatedRuleType });
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

    const promise = taskRunner.run();
    await Promise.resolve();
    await taskRunner.cancel();
    await promise;

    testLogger();
    testAlertingEventLogCalls({
      ruleTypeDef: updatedRuleType,
      status: 'active',
      activeAlerts: 1,
      generatedActions: 1,
      newAlerts: 1,
      triggeredActions: 1,
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

  test('actionsPlugin.execute is skipped if rule execution is cancelled and cancelAlertsOnRuleTimeout for both config and ruleType are true', async () => {
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

    const promise = taskRunner.run();
    await Promise.resolve();
    await taskRunner.cancel();
    await promise;

    testAlertingEventLogCalls({
      status: 'active',
    });

    expect(mockUsageCounter.incrementCounter).toHaveBeenCalledTimes(1);
    expect(mockUsageCounter.incrementCounter).toHaveBeenCalledWith({
      counterName: 'alertsSkippedDueToRuleExecutionTimeout_test',
      incrementBy: 1,
    });
  });

  function testLogger() {
    expect(logger.debug).toHaveBeenCalledTimes(8);
    expect(logger.debug).nthCalledWith(1, 'executing rule test:1 at 1970-01-01T00:00:00.000Z', {
      tags: ['1', 'test'],
    });
    expect(logger.debug).nthCalledWith(
      2,
      `Cancelling rule type test with id 1 - execution exceeded rule type timeout of 5m`,
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      3,
      'Aborting any in-progress ES searches for rule type test with id 1',
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      4,
      `Updating rule task for test rule with id 1 - execution error due to timeout`,
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      5,
      `rule test:1: 'rule-name' has 1 active alerts: [{\"instanceId\":\"1\",\"actionGroup\":\"default\"}]`,
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      6,
      'deprecated ruleRunStatus for test:1: {"lastExecutionDate":"1970-01-01T00:00:00.000Z","status":"active"}',
      { tags: ['1', 'test'] }
    );
    expect(logger.debug).nthCalledWith(
      8,
      'ruleRunMetrics for test:1: {"numSearches":3,"totalSearchDurationMs":23423,"esSearchDurationMs":33,"numberOfTriggeredActions":1,"numberOfGeneratedActions":1,"numberOfActiveAlerts":1,"numberOfRecoveredAlerts":0,"numberOfNewAlerts":1,"numberOfDelayedAlerts":0,"hasReachedAlertLimit":false,"hasReachedQueuedActionsLimit":false,"triggeredActionsStatus":"complete"}',
      { tags: ['1', 'test'] }
    );
  }

  function testAlertingEventLogCalls({
    ruleContext = alertingEventLoggerInitializer,
    ruleTypeDef = ruleType,
    activeAlerts = 0,
    newAlerts = 0,
    recoveredAlerts = 0,
    triggeredActions = 0,
    generatedActions = 0,
    status,
    logAlert = 0,
    logAction = 0,
    hasReachedAlertLimit = false,
    hasReachedQueuedActionsLimit = false,
  }: {
    status: string;
    ruleContext?: ContextOpts;
    ruleTypeDef?: UntypedNormalizedRuleType;
    activeAlerts?: number;
    newAlerts?: number;
    recoveredAlerts?: number;
    triggeredActions?: number;
    generatedActions?: number;
    setRuleName?: boolean;
    logAlert?: number;
    logAction?: number;
    hasReachedAlertLimit?: boolean;
    hasReachedQueuedActionsLimit?: boolean;
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
    expect(alertingEventLogger.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ executionId: RULE_EXECUTION_UUID }),
      })
    );
    expect(alertingEventLogger.addOrUpdateRuleData).toHaveBeenCalledWith({
      name: mockedRuleTypeSavedObject.name,
      consumer: mockedRuleTypeSavedObject.consumer,
      revision: mockedRuleTypeSavedObject.revision,
    });
    expect(alertingEventLogger.getStartAndDuration).toHaveBeenCalled();

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

    expect(alertingEventLogger.setExecutionSucceeded).toHaveBeenCalledWith(
      `rule executed: test:1: 'rule-name'`
    );
    expect(alertingEventLogger.setExecutionFailed).not.toHaveBeenCalled();

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
    expect(alertingEventLogger.logTimeout).toHaveBeenCalled();
  }
});
