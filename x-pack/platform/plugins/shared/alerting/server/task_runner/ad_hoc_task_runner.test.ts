/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import sinon from 'sinon';
import type { PluginStartContract as ActionsPluginStart } from '@kbn/actions-plugin/server';
import { actionsClientMock, actionsMock } from '@kbn/actions-plugin/server/mocks';
import type { SavedObject } from '@kbn/core/server';
import {
  elasticsearchServiceMock,
  executionContextServiceMock,
  loggingSystemMock,
  savedObjectsRepositoryMock,
  savedObjectsServiceMock,
  uiSettingsServiceMock,
} from '@kbn/core/server/mocks';
import { dataPluginMock } from '@kbn/data-plugin/server/mocks';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import type { DataViewsServerPluginStart } from '@kbn/data-views-plugin/server';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import type { IEventLogger } from '@kbn/event-log-plugin/server';
import { eventLogClientMock, eventLoggerMock } from '@kbn/event-log-plugin/server/mocks';
import type { SharePluginStart } from '@kbn/share-plugin/server';
import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import { TaskPriority, TaskStatus } from '@kbn/task-manager-plugin/server';
import { usageCountersServiceMock } from '@kbn/usage-collection-plugin/server/usage_counters/usage_counters_service.mock';
import { AdHocTaskRunner } from './ad_hoc_task_runner';
import { RuleMonitoringService } from '../monitoring/rule_monitoring_service';
import type { TaskRunnerContext } from './types';
import { ApiKeyType } from './types';
import { backfillClientMock } from '../backfill_client/backfill_client.mock';
import { ruleTypeRegistryMock } from '../rule_type_registry.mock';
import type { ContextOpts } from '../lib/alerting_event_logger/alerting_event_logger';
import {
  AlertingEventLogger,
  executionType,
} from '../lib/alerting_event_logger/alerting_event_logger';
import type { AdHocRunSchedule, AdHocRunSO } from '../data/ad_hoc_run/types';
import { AD_HOC_RUN_SAVED_OBJECT_TYPE, RULE_SAVED_OBJECT_TYPE } from '../saved_objects';
import { adHocRunStatus } from '../../common/constants';
import { DATE_1970, generateEnqueueFunctionInput, mockAAD, ruleType } from './fixtures';
import { alertingEventLoggerMock } from '../lib/alerting_event_logger/alerting_event_logger.mock';
import { alertsMock } from '../mocks';
import type { UntypedNormalizedRuleType } from '../rule_type_registry';
import { AlertsService } from '../alerts_service';
import { of, ReplaySubject } from 'rxjs';
import { getDataStreamAdapter } from '../alerts_service/lib/data_stream_adapter';
import type {
  AlertInstanceContext,
  AlertInstanceState,
  RuleAlertData,
  RuleExecutorOptions,
  RuleTypeParams,
  RuleTypeState,
} from '../types';
import { DEFAULT_FLAPPING_SETTINGS } from '../types';
import {
  TIMESTAMP,
  EVENT_ACTION,
  EVENT_KIND,
  ALERT_ACTION_GROUP,
  ALERT_DURATION,
  ALERT_FLAPPING,
  ALERT_FLAPPING_HISTORY,
  ALERT_INSTANCE_ID,
  ALERT_SEVERITY_IMPROVING,
  ALERT_SNOOZED,
  ALERT_MAINTENANCE_WINDOW_IDS,
  ALERT_MAINTENANCE_WINDOW_NAMES,
  ALERT_RULE_CATEGORY,
  ALERT_RULE_CONSUMER,
  ALERT_RULE_EXECUTION_UUID,
  ALERT_RULE_NAME,
  ALERT_RULE_PARAMETERS,
  ALERT_RULE_PRODUCER,
  ALERT_RULE_REVISION,
  ALERT_RULE_TYPE_ID,
  ALERT_RULE_TAGS,
  ALERT_RULE_UUID,
  ALERT_START,
  ALERT_STATUS,
  ALERT_TIME_RANGE,
  ALERT_UUID,
  ALERT_WORKFLOW_STATUS,
  ALERT_MUTED,
  SPACE_IDS,
  TAGS,
  VERSION,
  ALERT_CONSECUTIVE_MATCHES,
  ALERT_RULE_EXECUTION_TIMESTAMP,
  ALERT_PENDING_RECOVERED_COUNT,
} from '@kbn/rule-data-utils';
import { validateRuleTypeParams } from '../lib/validate_rule_type_params';
import { ruleRunMetricsStoreMock } from '../lib/rule_run_metrics_store.mock';
import { RuleRunMetricsStore } from '../lib/rule_run_metrics_store';
import { ConnectorAdapterRegistry } from '../connector_adapters/connector_adapter_registry';
import { rulesSettingsServiceMock } from '../rules_settings/rules_settings_service.mock';
import { maintenanceWindowsServiceMock } from './maintenance_windows/maintenance_windows_service.mock';
import { updateGaps } from '../lib/rule_gaps/update/update_gaps';
import { alertsClientMock } from '../alerts_client/alerts_client.mock';
import { alertsServiceMock } from '../alerts_service/alerts_service.mock';
import { backfillInitiator } from '../../common/constants';

jest.mock('../lib/rule_gaps/update/update_gaps');
const UUID = '5f6aa57d-3e22-484e-bae8-cbed868f4d28';

jest.mock('uuid', () => ({
  v4: () => UUID,
}));
jest.mock('../lib/wrap_scoped_cluster_client', () => ({
  createWrappedScopedClusterClientFactory: jest.fn(),
}));
jest.mock('../lib/alerting_event_logger/alerting_event_logger');
jest.mock('../lib/rule_run_metrics_store');
jest.mock('../lib/validate_rule_type_params');
const mockValidateRuleTypeParams = validateRuleTypeParams as jest.MockedFunction<
  typeof validateRuleTypeParams
>;

const useDataStreamForAlerts = true;
const mockUsageCountersSetup = usageCountersServiceMock.createSetupContract();
const mockUsageCounter = mockUsageCountersSetup.createUsageCounter('test');
const logger: ReturnType<typeof loggingSystemMock.createLogger> = loggingSystemMock.createLogger();

let fakeTimer: sinon.SinonFakeTimers;
type TaskRunnerFactoryInitializerParamsType = jest.Mocked<TaskRunnerContext> & {
  actionsPlugin: jest.Mocked<ActionsPluginStart>;
  eventLogger: jest.Mocked<IEventLogger>;
  executionContext: ReturnType<typeof executionContextServiceMock.createInternalStartContract>;
};
const clusterClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
const mockAlertsService = alertsServiceMock.create();
const alertingEventLogger = alertingEventLoggerMock.create();
const elasticsearchAndSOAvailability$ = of(true);
const alertsService = new AlertsService({
  logger,
  pluginStop$: new ReplaySubject(1),
  kibanaVersion: '8.8.0',
  elasticsearchClientPromise: Promise.resolve(clusterClient),
  dataStreamAdapter: getDataStreamAdapter({ useDataStreamForAlerts }),
  elasticsearchAndSOAvailability$,
  isServerless: false,
});
const alertsClient = alertsClientMock.create();
const actionsClient = actionsClientMock.create();
const backfillClient = backfillClientMock.create();
const dataPlugin = dataPluginMock.createStartContract();
const dataViewsMock = {
  dataViewsServiceFactory: jest.fn().mockResolvedValue(dataViewPluginMocks.createStartContract()),
  getScriptedFieldsEnabled: jest.fn().mockReturnValue(true),
} as DataViewsServerPluginStart;
const elasticsearchService = elasticsearchServiceMock.createInternalStart();
const encryptedSavedObjectsClient = encryptedSavedObjectsMock.createClient();
const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();
const maintenanceWindowsService = maintenanceWindowsServiceMock.create();
const ruleRunMetricsStore = ruleRunMetricsStoreMock.create();
const rulesSettingsService = rulesSettingsServiceMock.create();
const ruleTypeRegistry = ruleTypeRegistryMock.create();
const savedObjectsService = savedObjectsServiceMock.createInternalStartContract();
const services = alertsMock.createRuleExecutorServices();
const uiSettingsService = uiSettingsServiceMock.createStartContract();
const eventLogClient = eventLogClientMock.create();

const taskRunnerFactoryInitializerParams: TaskRunnerFactoryInitializerParamsType = {
  actionsConfigMap: { default: { max: 1000 } },
  actionsPlugin: actionsMock.createStart(),
  alertsService,
  backfillClient,
  cancelAlertsOnRuleTimeout: true,
  connectorAdapterRegistry: new ConnectorAdapterRegistry(),
  data: dataPlugin,
  dataViews: dataViewsMock,
  elasticsearch: elasticsearchService,
  encryptedSavedObjectsClient,
  eventLogger: eventLoggerMock.create(),
  executionContext: executionContextServiceMock.createInternalStartContract(),
  maintenanceWindowsService,
  kibanaBaseUrl: 'https://localhost:5601',
  logger,
  maxAlerts: 1000,
  ruleTypeRegistry,
  rulesSettingsService,
  savedObjects: savedObjectsService,
  share: {} as SharePluginStart,
  spaceIdToNamespace: jest.fn().mockReturnValue(undefined),
  uiSettings: uiSettingsService,
  usageCounter: mockUsageCounter,
  isServerless: false,
  getEventLogClient: jest.fn(),
  apiKeyType: ApiKeyType.ES,
};

const mockedTaskInstance: ConcreteTaskInstance = {
  id: '',
  attempts: 0,
  status: TaskStatus.Running,
  version: '123',
  runAt: new Date(),
  scheduledAt: new Date(),
  startedAt: new Date(),
  retryAt: new Date(Date.now() + 5 * 60 * 1000),
  state: {},
  taskType: 'backfill',
  timeoutOverride: '3m',
  params: {
    adHocRunParamsId: 'abc',
    spaceId: 'default',
  },
  ownerId: null,
};
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

const RULE_ID = 'rule-id';

describe('Ad Hoc Task Runner', () => {
  let mockedAdHocRunSO: SavedObject<AdHocRunSO>;
  let schedule1: AdHocRunSchedule;
  let schedule2: AdHocRunSchedule;
  let schedule3: AdHocRunSchedule;
  let schedule4: AdHocRunSchedule;
  let schedule5: AdHocRunSchedule;
  let alertingEventLoggerInitializer: ContextOpts;
  const mockUpdateGaps = updateGaps as jest.MockedFunction<typeof updateGaps>;

  beforeAll(() => {
    fakeTimer = sinon.useFakeTimers();
    alertingEventLoggerInitializer = {
      executionId: UUID,
      savedObjectId: 'abc',
      savedObjectType: AD_HOC_RUN_SAVED_OBJECT_TYPE,
      spaceId: 'default',
      taskScheduledAt: mockedTaskInstance.scheduledAt,
    };
  });

  beforeEach(() => {
    schedule1 = {
      runAt: '2024-03-01T01:00:00.000Z',
      status: adHocRunStatus.PENDING,
      interval: '1h',
    };
    schedule2 = {
      runAt: '2024-03-01T02:00:00.000Z',
      status: adHocRunStatus.PENDING,
      interval: '1h',
    };
    schedule3 = {
      runAt: '2024-03-01T03:00:00.000Z',
      status: adHocRunStatus.PENDING,
      interval: '1h',
    };
    schedule4 = {
      runAt: '2024-03-01T04:00:00.000Z',
      status: adHocRunStatus.PENDING,
      interval: '1h',
    };
    schedule5 = {
      runAt: '2024-03-01T05:00:00.000Z',
      status: adHocRunStatus.PENDING,
      interval: '1h',
    };

    mockedAdHocRunSO = {
      id: 'abc',
      type: AD_HOC_RUN_SAVED_OBJECT_TYPE,
      references: [{ type: RULE_SAVED_OBJECT_TYPE, name: 'rule', id: RULE_ID }],
      attributes: {
        apiKeyId: 'apiKeyId',
        apiKeyToUse: 'MTIzOmFiYw==',
        createdAt: '2024-03-13T16:24:32.296Z',
        duration: '1h',
        enabled: true,
        end: '2024-03-01T05:00:00.000Z',
        initiator: backfillInitiator.USER,
        rule: {
          name: 'test',
          tags: [],
          alertTypeId: 'siem.queryRule',
          actions: [],
          params: {
            author: [],
            description: 'test',
            falsePositives: [],
            from: 'now-86460s',
            ruleId: '31c54f10-9d3b-45a8-b064-b92e8c6fcbe7',
            immutable: false,
            license: '',
            outputIndex: '',
            meta: {
              from: '1m',
              kibana_siem_app_url: 'https://localhost:5601/app/security',
            },
            maxSignals: 100,
            riskScore: 21,
            riskScoreMapping: [],
            severity: 'low',
            severityMapping: [],
            threat: [],
            to: 'now',
            references: [],
            version: 1,
            exceptionsList: [],
            relatedIntegrations: [],
            requiredFields: [],
            setup: '',
            type: 'query',
            language: 'kuery',
            index: ['.kibana-event-log*'],
            query: 'event.provider:*',
            filters: [],
          },
          apiKeyOwner: 'elastic',
          apiKeyCreatedByUser: false,
          consumer: 'siem',
          enabled: true,
          schedule: {
            interval: '1h',
          },
          revision: 0,
          createdBy: 'elastic',
          createdAt: '2024-03-13T16:06:20.089Z',
          updatedBy: 'elastic',
          updatedAt: '2024-03-13T16:06:20.089Z',
        },
        spaceId: 'default',
        start: '2024-03-01T00:00:00.000Z',
        status: adHocRunStatus.PENDING,
        schedule: [schedule1, schedule2, schedule3, schedule4, schedule5],
      },
    };
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
    jest
      .spyOn(alertsService, 'getContextInitializationPromise')
      .mockResolvedValue({ result: true });
    elasticsearchService.client.asScoped.mockReturnValue(services.scopedClusterClient);
    alertingEventLogger.getStartAndDuration.mockImplementation(() => ({ start: new Date() }));
    (AlertingEventLogger as jest.Mock).mockImplementation(() => alertingEventLogger);
    ruleRunMetricsStore.getMetrics.mockReturnValue({
      numSearches: 3,
      totalSearchDurationMs: 23423,
      esSearchDurationMs: 33,
      numberOfTriggeredActions: 0,
      numberOfGeneratedActions: 0,
      numberOfActiveAlerts: 0,
      numberOfRecoveredAlerts: 0,
      numberOfNewAlerts: 0,
      hasReachedAlertLimit: false,
      triggeredActionsStatus: 'complete',
    });
    (RuleRunMetricsStore as jest.Mock).mockImplementation(() => ruleRunMetricsStore);
    logger.isLevelEnabled.mockReturnValue(true);
    logger.get.mockImplementation(() => logger);
    taskRunnerFactoryInitializerParams.executionContext.withContext.mockImplementation((ctx, fn) =>
      fn()
    );
    taskRunnerFactoryInitializerParams.actionsPlugin.getActionsClientWithRequest.mockResolvedValue(
      actionsClient
    );
    taskRunnerFactoryInitializerParams.actionsPlugin.isActionExecutable.mockReturnValue(true);
    taskRunnerFactoryInitializerParams.actionsPlugin.renderActionParameterTemplates.mockImplementation(
      (_, __, params) => params
    );
    maintenanceWindowsService.getMaintenanceWindows.mockResolvedValue({
      maintenanceWindows: [],
      maintenanceWindowsWithoutScopedQueryIds: [],
    });
    ruleTypeRegistry.get.mockReturnValue(ruleTypeWithAlerts);
    ruleTypeWithAlerts.executor.mockResolvedValue({ state: {} });
    mockValidateRuleTypeParams.mockReturnValue(mockedAdHocRunSO.attributes.rule.params);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedAdHocRunSO);
    actionsClient.bulkEnqueueExecution.mockResolvedValue({ errors: false, items: [] });

    clusterClient.search.mockResolvedValue({
      took: 10,
      timed_out: false,
      _shards: { failed: 0, successful: 1, total: 0, skipped: 0 },
      hits: {
        total: { relation: 'eq', value: 0 },
        hits: [],
      },
    });
  });

  afterAll(() => fakeTimer.restore());

  test('successfully executes the task', async () => {
    const addFrameworkMetricsSpy = jest.spyOn(
      RuleMonitoringService.prototype,
      'addFrameworkMetrics'
    );
    ruleTypeWithAlerts.executor.mockImplementation(
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
        executorServices.alertsClient?.report({
          id: '1',
          actionGroup: 'default',
          payload: { textField: 'foo', numericField: 27 },
        });
        return { state: {} };
      }
    );

    const taskRunner = new AdHocTaskRunner({
      context: taskRunnerFactoryInitializerParams,
      internalSavedObjectsRepository,
      taskInstance: mockedTaskInstance,
    });
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

    const runnerResult = await taskRunner.run();
    expect(runnerResult).toEqual({ state: {}, runAt: new Date('1970-01-01T00:00:00.000Z') });
    expect(addFrameworkMetricsSpy).toHaveBeenCalledWith({
      total_search_duration_ms: 23423,
    });
    addFrameworkMetricsSpy.mockRestore();
    await taskRunner.cleanup();

    // Verify all the expected calls were made before calling the rule executor
    expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      AD_HOC_RUN_SAVED_OBJECT_TYPE,
      'abc',
      {}
    );
    expect(ruleTypeRegistry.ensureRuleTypeEnabled).toHaveBeenCalledWith('siem.queryRule');
    expect(mockValidateRuleTypeParams).toHaveBeenCalledWith(
      mockedAdHocRunSO.attributes.rule.params,
      ruleTypeWithAlerts.validate.params
    );
    // @ts-ignore - accessing private variable
    // should run the first entry in the schedule
    expect(taskRunner.scheduleToRunIndex).toEqual(0);

    // Verify all the expected calls were made while calling the rule executor
    expect(RuleRunMetricsStore).toHaveBeenCalledTimes(1);
    expect(ruleTypeWithAlerts.executor).toHaveBeenCalledTimes(1);
    const call = ruleTypeWithAlerts.executor.mock.calls[0][0];

    expect(call.executionId).toEqual(UUID);
    expect(call.services).toBeTruthy();
    expect(call.services.actionsClient).toBeUndefined();
    expect(call.services.alertsClient).not.toBe(null);
    expect(call.services.alertsClient?.report).toBeTruthy();
    expect(call.services.alertsClient?.setAlertData).toBeTruthy();
    expect(call.services.scopedClusterClient).toBeTruthy();
    expect(call.params).toEqual(mockedAdHocRunSO.attributes.rule.params);
    expect(call.state).toEqual({});
    expect(call.startedAt).toStrictEqual(new Date(schedule1.runAt));
    expect(call.previousStartedAt).toStrictEqual(null);
    expect(call.spaceId).toEqual('default');
    expect(call.rule).not.toBe(null);
    expect(call.rule.id).toBe(RULE_ID);
    expect(call.rule.name).toBe('test');
    expect(call.rule.tags).toEqual([]);
    expect(call.rule.consumer).toBe('siem');
    expect(call.rule.enabled).toBe(true);
    expect(call.rule.schedule).toEqual({ interval: '1h' });
    expect(call.rule.createdBy).toBe('elastic');
    expect(call.rule.updatedBy).toBe('elastic');
    expect(call.rule.createdAt).toStrictEqual(new Date('2024-03-13T16:06:20.089Z'));
    expect(call.rule.updatedAt).toStrictEqual(new Date('2024-03-13T16:06:20.089Z'));
    expect(call.rule.notifyWhen).toBe(null);
    expect(call.rule.throttle).toBe(null);
    expect(call.rule.producer).toBe('alerts');
    expect(call.rule.ruleTypeId).toBe('siem.queryRule');
    expect(call.rule.ruleTypeName).toBe('My test rule');
    expect(call.rule.actions).toEqual([]);
    expect(call.flappingSettings).toEqual(DEFAULT_FLAPPING_SETTINGS);

    expect(clusterClient.bulk).toHaveBeenCalledWith({
      index: '.alerts-test.alerts-default',
      refresh: 'wait_for',
      require_alias: !useDataStreamForAlerts,
      body: [
        {
          create: {
            _id: UUID,
            ...(useDataStreamForAlerts ? {} : { require_alias: true }),
          },
        },
        // new alert doc
        {
          [TIMESTAMP]: schedule1.runAt,
          numericField: 27,
          textField: 'foo',
          [EVENT_ACTION]: 'open',
          [EVENT_KIND]: 'signal',
          [ALERT_ACTION_GROUP]: 'default',
          [ALERT_DURATION]: 0,
          [ALERT_FLAPPING]: false,
          [ALERT_MUTED]: false,
          [ALERT_FLAPPING_HISTORY]: [true],
          [ALERT_INSTANCE_ID]: '1',
          [ALERT_SEVERITY_IMPROVING]: false,
          [ALERT_MAINTENANCE_WINDOW_IDS]: [],
          [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
          [ALERT_PENDING_RECOVERED_COUNT]: 0,
          [ALERT_CONSECUTIVE_MATCHES]: 1,
          [ALERT_RULE_CATEGORY]: 'My test rule',
          [ALERT_RULE_CONSUMER]: mockedAdHocRunSO.attributes.rule.consumer,
          [ALERT_RULE_EXECUTION_UUID]: UUID,
          [ALERT_RULE_EXECUTION_TIMESTAMP]: DATE_1970,
          [ALERT_RULE_NAME]: mockedAdHocRunSO.attributes.rule.name,
          [ALERT_RULE_PARAMETERS]: mockedAdHocRunSO.attributes.rule.params,
          [ALERT_RULE_PRODUCER]: 'alerts',
          [ALERT_RULE_REVISION]: 0,
          [ALERT_RULE_TYPE_ID]: ruleTypeWithAlerts.id,
          [ALERT_RULE_TAGS]: mockedAdHocRunSO.attributes.rule.tags,
          [ALERT_RULE_UUID]: RULE_ID,
          [ALERT_SNOOZED]: false,
          [ALERT_START]: schedule1.runAt,
          [ALERT_STATUS]: 'active',
          [ALERT_TIME_RANGE]: { gte: schedule1.runAt },
          [ALERT_UUID]: UUID,
          [ALERT_WORKFLOW_STATUS]: 'open',
          [SPACE_IDS]: ['default'],
          [VERSION]: '8.8.0',
          [TAGS]: mockedAdHocRunSO.attributes.rule.tags,
        },
      ],
    });

    expect(internalSavedObjectsRepository.update).toHaveBeenCalledWith(
      AD_HOC_RUN_SAVED_OBJECT_TYPE,
      mockedAdHocRunSO.id,
      {
        schedule: [
          { ...schedule1, status: adHocRunStatus.COMPLETE },
          schedule2,
          schedule3,
          schedule4,
          schedule5,
        ],
      },
      { namespace: undefined, refresh: false }
    );

    expect(internalSavedObjectsRepository.delete).not.toHaveBeenCalled();

    testAlertingEventLogCalls({
      status: 'ok',
      backfillRunAt: schedule1.runAt,
      backfillInterval: schedule1.interval,
      logAlert: 2,
    });
    expect(logger.debug).toHaveBeenCalledTimes(2);
    expect(logger.debug).nthCalledWith(
      1,
      `Executing ad hoc run for rule test:rule-id for runAt ${schedule1.runAt}`
    );
    expect(logger.debug).nthCalledWith(
      2,
      `rule test:rule-id: 'test' has 1 active alerts: [{"instanceId":"1","actionGroup":"default"}]`
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('passes consumer metrics to AlertingEventLogger', async () => {
    const consumerMetrics = {
      matched_indices_count: 3,
      alerts_candidate_count: 100,
      total_enrichment_duration_ms: 50,
    };
    ruleTypeWithAlerts.executor.mockImplementation(
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
        executorServices.ruleMonitoringService?.setMetrics(consumerMetrics);
        return { state: {} };
      }
    );

    const taskRunner = new AdHocTaskRunner({
      context: taskRunnerFactoryInitializerParams,
      internalSavedObjectsRepository,
      taskInstance: mockedTaskInstance,
    });

    await taskRunner.run();
    await taskRunner.cleanup();

    expect(alertingEventLogger.done).toHaveBeenCalledWith(
      expect.objectContaining({
        consumerMetrics,
        backfill: {
          id: mockedAdHocRunSO.id,
          start: schedule1.runAt,
          interval: schedule1.interval,
        },
      })
    );
  });

  test('should schedule actions for rule with actions', async () => {
    const mockedAdHocRunSOWithActions = {
      ...mockedAdHocRunSO,
      attributes: {
        ...mockedAdHocRunSO.attributes,
        rule: {
          ...mockedAdHocRunSO.attributes.rule,
          id: '1',
          actions: [
            {
              uuid: '123abc',
              group: 'default',
              actionRef: 'action_0',
              actionTypeId: 'action',
              params: { foo: true },
              frequency: {
                notifyWhen: 'onActiveAlert',
                summary: true,
                throttle: null,
              },
            },
          ],
        },
      },
      references: [
        { type: RULE_SAVED_OBJECT_TYPE, name: 'rule', id: '1' },
        { id: '4', name: 'action_0', type: 'action' },
      ],
    };
    alertsClient.getProcessedAlerts.mockReturnValue({});
    alertsClient.getSummarizedAlerts.mockResolvedValue({
      new: { count: 1, data: [mockAAD] },
      ongoing: { count: 0, data: [] },
      recovered: { count: 0, data: [] },
    });
    mockAlertsService.createAlertsClient.mockImplementation(() => alertsClient);
    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(
      mockedAdHocRunSOWithActions
    );

    ruleTypeWithAlerts.executor.mockImplementation(
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
        executorServices.alertsClient?.report({
          id: '1',
          actionGroup: 'default',
          payload: { textField: 'foo', numericField: 27 },
        });
        return { state: {} };
      }
    );

    const taskRunner = new AdHocTaskRunner({
      context: { ...taskRunnerFactoryInitializerParams, alertsService: mockAlertsService },
      internalSavedObjectsRepository,
      taskInstance: mockedTaskInstance,
    });
    expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

    const runnerResult = await taskRunner.run();
    expect(runnerResult).toEqual({ state: {}, runAt: new Date('1970-01-01T00:00:00.000Z') });
    await taskRunner.cleanup();

    // Verify all the expected calls were made before calling the rule executor
    expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
      AD_HOC_RUN_SAVED_OBJECT_TYPE,
      'abc',
      {}
    );
    expect(ruleTypeRegistry.ensureRuleTypeEnabled).toHaveBeenCalledWith('siem.queryRule');
    expect(mockValidateRuleTypeParams).toHaveBeenCalledWith(
      mockedAdHocRunSO.attributes.rule.params,
      ruleTypeWithAlerts.validate.params
    );
    // @ts-ignore - accessing private variable
    // should run the first entry in the schedule
    expect(taskRunner.scheduleToRunIndex).toEqual(0);

    // Verify all the expected calls were made while calling the rule executor
    expect(RuleRunMetricsStore).toHaveBeenCalledTimes(1);
    expect(ruleTypeWithAlerts.executor).toHaveBeenCalledTimes(1);

    expect(internalSavedObjectsRepository.update).toHaveBeenCalledWith(
      AD_HOC_RUN_SAVED_OBJECT_TYPE,
      mockedAdHocRunSO.id,
      {
        schedule: [
          { ...schedule1, status: adHocRunStatus.COMPLETE },
          schedule2,
          schedule3,
          schedule4,
          schedule5,
        ],
      },
      { namespace: undefined, refresh: false }
    );

    expect(internalSavedObjectsRepository.delete).not.toHaveBeenCalled();

    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledTimes(1);
    expect(actionsClient.bulkEnqueueExecution).toHaveBeenCalledWith(
      generateEnqueueFunctionInput({
        isBulk: true,
        id: '4',
        foo: true,
        consumer: 'siem',
        uuid: '123abc',
        priority: TaskPriority.Low,
        apiKeyId: 'apiKeyId',
      })
    );
  });

  test('should run with the next pending schedule', async () => {
    ruleTypeWithAlerts.executor.mockImplementation(
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
        executorServices.alertsClient?.report({
          id: '1',
          actionGroup: 'default',
          payload: { textField: 'foo', numericField: 27 },
        });
        return { state: {} };
      }
    );
    const taskRunner = new AdHocTaskRunner({
      context: taskRunnerFactoryInitializerParams,
      internalSavedObjectsRepository,
      taskInstance: mockedTaskInstance,
    });

    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      ...mockedAdHocRunSO,
      attributes: {
        ...mockedAdHocRunSO.attributes,
        schedule: [
          { ...schedule1, status: adHocRunStatus.COMPLETE },
          { ...schedule2, status: adHocRunStatus.TIMEOUT },
          { ...schedule3, status: adHocRunStatus.ERROR },
          schedule4,
          schedule5,
        ],
      },
    });

    const runnerResult = await taskRunner.run();
    // should return a runAt because there's another entry in the schedule
    expect(runnerResult).toEqual({
      state: {},
      runAt: new Date('1970-01-01T00:00:00.000Z'),
    });
    await taskRunner.cleanup();

    // Verify all the expected calls were made before calling the rule executor
    expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalled();
    expect(ruleTypeRegistry.ensureRuleTypeEnabled).toHaveBeenCalledWith('siem.queryRule');
    expect(mockValidateRuleTypeParams).toHaveBeenCalled();
    // @ts-ignore - accessing private variable
    // should run the first PENDING entry in the schedule
    expect(taskRunner.scheduleToRunIndex).toEqual(3);

    // Verify all the expected calls were made while calling the rule executor
    expect(RuleRunMetricsStore).toHaveBeenCalledTimes(1);
    expect(ruleTypeWithAlerts.executor).toHaveBeenCalledTimes(1);
    const call = ruleTypeWithAlerts.executor.mock.calls[0][0];

    expect(call.startedAt).toStrictEqual(new Date(schedule4.runAt));

    expect(clusterClient.bulk).toHaveBeenCalledTimes(1);
    const bulkCall = clusterClient.bulk.mock.calls[0][0];

    // @ts-ignore
    expect(bulkCall.body[1][TIMESTAMP]).toEqual(schedule4.runAt);
    // @ts-ignore
    expect(bulkCall.body[1][ALERT_START]).toEqual(schedule4.runAt);
    // @ts-ignore
    expect(bulkCall.body[1][ALERT_TIME_RANGE]).toEqual({ gte: schedule4.runAt });
    // @ts-ignore
    expect(bulkCall.body[1][ALERT_RULE_EXECUTION_TIMESTAMP]).toEqual(DATE_1970);

    expect(internalSavedObjectsRepository.update).toHaveBeenCalledWith(
      AD_HOC_RUN_SAVED_OBJECT_TYPE,
      mockedAdHocRunSO.id,
      {
        schedule: [
          { ...schedule1, status: adHocRunStatus.COMPLETE },
          { ...schedule2, status: adHocRunStatus.TIMEOUT },
          { ...schedule3, status: adHocRunStatus.ERROR },
          { ...schedule4, status: adHocRunStatus.COMPLETE },
          schedule5,
        ],
      },
      { namespace: undefined, refresh: false }
    );

    expect(internalSavedObjectsRepository.delete).not.toHaveBeenCalled();

    testAlertingEventLogCalls({
      status: 'ok',
      backfillRunAt: schedule4.runAt,
      backfillInterval: schedule4.interval,
      logAlert: 2,
    });
    expect(logger.debug).toHaveBeenCalledTimes(2);
    expect(logger.debug).nthCalledWith(
      1,
      `Executing ad hoc run for rule test:rule-id for runAt ${schedule4.runAt}`
    );
    expect(logger.debug).nthCalledWith(
      2,
      `rule test:rule-id: 'test' has 1 active alerts: [{"instanceId":"1","actionGroup":"default"}]`
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('should delete ad hoc run SO and not return a new runAt date when all schedules have been processed ', async () => {
    taskRunnerFactoryInitializerParams.getEventLogClient = jest
      .fn()
      .mockResolvedValue(eventLogClient);
    ruleTypeWithAlerts.executor.mockImplementation(
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
        executorServices.alertsClient?.report({
          id: '1',
          actionGroup: 'default',
          payload: { textField: 'foo', numericField: 27 },
        });
        return { state: {} };
      }
    );
    const taskRunner = new AdHocTaskRunner({
      context: taskRunnerFactoryInitializerParams,
      internalSavedObjectsRepository,
      taskInstance: mockedTaskInstance,
    });

    encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
      ...mockedAdHocRunSO,
      attributes: {
        ...mockedAdHocRunSO.attributes,
        schedule: [
          { ...schedule1, status: adHocRunStatus.COMPLETE },
          { ...schedule2, status: adHocRunStatus.TIMEOUT },
          { ...schedule3, status: adHocRunStatus.ERROR },
          { ...schedule4, status: adHocRunStatus.COMPLETE },
          schedule5,
        ],
      },
    });

    const runnerResult = await taskRunner.run();
    // should not return a runAt because there are no more schedule entries
    expect(runnerResult).toEqual({ state: {} });
    await taskRunner.cleanup();

    // Verify all the expected calls were made before calling the rule executor
    expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalled();
    expect(ruleTypeRegistry.ensureRuleTypeEnabled).toHaveBeenCalledWith('siem.queryRule');
    expect(mockValidateRuleTypeParams).toHaveBeenCalled();
    // @ts-ignore - accessing private variable
    // should run the first PENDING entry in the schedule
    expect(taskRunner.scheduleToRunIndex).toEqual(4);

    // Verify all the expected calls were made while calling the rule executor
    expect(RuleRunMetricsStore).toHaveBeenCalledTimes(1);
    expect(ruleTypeWithAlerts.executor).toHaveBeenCalledTimes(1);
    const call = ruleTypeWithAlerts.executor.mock.calls[0][0];

    expect(call.startedAt).toStrictEqual(new Date(schedule5.runAt));

    expect(clusterClient.bulk).toHaveBeenCalledTimes(1);
    const bulkCall = clusterClient.bulk.mock.calls[0][0];

    // @ts-ignore
    expect(bulkCall.body[1][TIMESTAMP]).toEqual(schedule5.runAt);
    // @ts-ignore
    expect(bulkCall.body[1][ALERT_START]).toEqual(schedule5.runAt);
    // @ts-ignore
    expect(bulkCall.body[1][ALERT_TIME_RANGE]).toEqual({ gte: schedule5.runAt });
    // @ts-ignore
    expect(bulkCall.body[1][ALERT_RULE_EXECUTION_TIMESTAMP]).toEqual(DATE_1970);

    expect(internalSavedObjectsRepository.update).toHaveBeenCalledWith(
      AD_HOC_RUN_SAVED_OBJECT_TYPE,
      mockedAdHocRunSO.id,
      {
        schedule: [
          { ...schedule1, status: adHocRunStatus.COMPLETE },
          { ...schedule2, status: adHocRunStatus.TIMEOUT },
          { ...schedule3, status: adHocRunStatus.ERROR },
          { ...schedule4, status: adHocRunStatus.COMPLETE },
          { ...schedule5, status: adHocRunStatus.COMPLETE },
        ],
      },
      { namespace: undefined, refresh: false }
    );

    expect(internalSavedObjectsRepository.delete).toHaveBeenCalledWith(
      AD_HOC_RUN_SAVED_OBJECT_TYPE,
      'abc',
      { refresh: true, namespace: undefined }
    );

    // Verify that updateGaps was called after delete
    const deleteCallOrder = internalSavedObjectsRepository.delete.mock.invocationCallOrder[0];
    const updateGapsCallOrder = mockUpdateGaps.mock.invocationCallOrder[0];
    expect(updateGapsCallOrder).toBeGreaterThan(deleteCallOrder);

    expect(mockUpdateGaps).toHaveBeenCalledWith({
      ruleId: RULE_ID,
      start: new Date(mockedAdHocRunSO.attributes.start),
      end: mockedAdHocRunSO.attributes.end ? new Date(mockedAdHocRunSO.attributes.end) : new Date(),
      eventLogger: taskRunnerFactoryInitializerParams.eventLogger,
      eventLogClient,
      logger: taskRunnerFactoryInitializerParams.logger,
      backfillSchedule: [
        { ...schedule1, status: adHocRunStatus.COMPLETE },
        { ...schedule2, status: adHocRunStatus.TIMEOUT },
        { ...schedule3, status: adHocRunStatus.ERROR },
        { ...schedule4, status: adHocRunStatus.COMPLETE },
        { ...schedule5, status: adHocRunStatus.COMPLETE },
      ],
      savedObjectsRepository: internalSavedObjectsRepository,
      backfillClient: taskRunnerFactoryInitializerParams.backfillClient,
      actionsClient,
      initiator: backfillInitiator.USER,
    });

    testAlertingEventLogCalls({
      status: 'ok',
      backfillRunAt: schedule5.runAt,
      backfillInterval: schedule5.interval,
      logAlert: 2,
    });
    expect(logger.debug).toHaveBeenCalledTimes(2);
    expect(logger.debug).nthCalledWith(
      1,
      `Executing ad hoc run for rule test:rule-id for runAt ${schedule5.runAt}`
    );
    expect(logger.debug).nthCalledWith(
      2,
      `rule test:rule-id: 'test' has 1 active alerts: [{"instanceId":"1","actionGroup":"default"}]`
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  describe('error handling', () => {
    test('should handle errors decrypting ad hoc rule run SO', async () => {
      const taskRunner = new AdHocTaskRunner({
        context: taskRunnerFactoryInitializerParams,
        internalSavedObjectsRepository,
        taskInstance: mockedTaskInstance,
      });

      encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockImplementationOnce(() => {
        throw new Error('fail fail');
      });

      const runnerResult = await taskRunner.run();
      // should not return a new runAt
      expect(runnerResult).toEqual({ state: {} });
      await taskRunner.cleanup();

      expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        'abc',
        {}
      );
      expect(ruleTypeRegistry.get).not.toHaveBeenCalled();
      expect(ruleTypeRegistry.ensureRuleTypeEnabled).not.toHaveBeenCalled();
      expect(mockValidateRuleTypeParams).not.toHaveBeenCalled();
      // @ts-ignore - accessing private variable
      // shouldn't have picked a schedule to run
      expect(taskRunner.scheduleToRunIndex).toEqual(-1);
      expect(RuleRunMetricsStore).not.toHaveBeenCalled();
      expect(ruleTypeWithAlerts.executor).not.toHaveBeenCalled();

      expect(internalSavedObjectsRepository.update).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        mockedAdHocRunSO.id,
        { status: adHocRunStatus.ERROR },
        { namespace: undefined, refresh: false }
      );

      expect(internalSavedObjectsRepository.delete).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        'abc',
        { refresh: true, namespace: undefined }
      );

      testAlertingEventLogCalls({
        status: 'error',
        errorMessage: 'fail fail',
        errorReason: 'decrypt',
        executionStatus: 'not-reached',
      });
      expect(logger.debug).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledTimes(1);

      const loggerCall = logger.error.mock.calls[0][0];
      const loggerMeta = logger.error.mock.calls[0][1];
      const loggerCallPrefix = (loggerCall as string).split('-');
      expect(loggerCallPrefix[0].trim()).toMatchInlineSnapshot(
        `"Executing ad hoc run with id \\"abc\\" has resulted in Error: fail fail"`
      );
      expect(loggerMeta?.tags).toEqual(['abc', 'rule-ad-hoc-run-failed']);
      expect(loggerMeta?.error?.stack_trace).toBeDefined();
    });

    test('should handle errors when rule type is not found in the rule type registry', async () => {
      ruleTypeRegistry.get.mockImplementationOnce(() => {
        throw new Error('no rule type');
      });

      const taskRunner = new AdHocTaskRunner({
        context: taskRunnerFactoryInitializerParams,
        internalSavedObjectsRepository,
        taskInstance: mockedTaskInstance,
      });

      const runnerResult = await taskRunner.run();
      // should not return a new runAt
      expect(runnerResult).toEqual({ state: {} });
      await taskRunner.cleanup();

      expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        'abc',
        {}
      );
      expect(ruleTypeRegistry.get).toHaveBeenCalledWith('siem.queryRule');
      expect(ruleTypeRegistry.ensureRuleTypeEnabled).not.toHaveBeenCalled();
      expect(mockValidateRuleTypeParams).not.toHaveBeenCalled();
      // @ts-ignore - accessing private variable
      // shouldn't have picked a schedule to run
      expect(taskRunner.scheduleToRunIndex).toEqual(-1);
      expect(RuleRunMetricsStore).not.toHaveBeenCalled();
      expect(ruleTypeWithAlerts.executor).not.toHaveBeenCalled();

      expect(internalSavedObjectsRepository.update).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        mockedAdHocRunSO.id,
        { status: adHocRunStatus.ERROR },
        { namespace: undefined, refresh: false }
      );

      expect(internalSavedObjectsRepository.delete).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        'abc',
        { refresh: true, namespace: undefined }
      );

      testAlertingEventLogCalls({
        status: 'error',
        errorMessage: 'no rule type',
        errorReason: 'read',
        executionStatus: 'not-reached',
      });
      expect(logger.debug).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledTimes(1);

      const loggerCall = logger.error.mock.calls[0][0];
      const loggerMeta = logger.error.mock.calls[0][1];
      const loggerCallPrefix = (loggerCall as string).split('-');
      expect(loggerCallPrefix[0].trim()).toMatchInlineSnapshot(
        `"Executing ad hoc run with id \\"abc\\" has resulted in Error: no rule type"`
      );
      expect(loggerMeta?.tags).toEqual(['abc', 'rule-ad-hoc-run-failed']);
      expect(loggerMeta?.error?.stack_trace).toBeDefined();
    });

    test('should handle errors when rule type is not enabled', async () => {
      ruleTypeRegistry.ensureRuleTypeEnabled.mockImplementationOnce(() => {
        throw new Error('rule type not enabled');
      });

      const taskRunner = new AdHocTaskRunner({
        context: taskRunnerFactoryInitializerParams,
        internalSavedObjectsRepository,
        taskInstance: mockedTaskInstance,
      });

      const runnerResult = await taskRunner.run();
      // should not return a new runAt
      expect(runnerResult).toEqual({ state: {} });
      await taskRunner.cleanup();

      expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        'abc',
        {}
      );
      expect(ruleTypeRegistry.get).toHaveBeenCalledWith('siem.queryRule');
      expect(ruleTypeRegistry.ensureRuleTypeEnabled).toHaveBeenCalledWith('siem.queryRule');
      expect(mockValidateRuleTypeParams).not.toHaveBeenCalled();
      // @ts-ignore - accessing private variable
      // shouldn't have picked a schedule to run
      expect(taskRunner.scheduleToRunIndex).toEqual(-1);
      expect(RuleRunMetricsStore).not.toHaveBeenCalled();
      expect(ruleTypeWithAlerts.executor).not.toHaveBeenCalled();

      expect(internalSavedObjectsRepository.update).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        mockedAdHocRunSO.id,
        { status: adHocRunStatus.ERROR },
        { namespace: undefined, refresh: false }
      );

      expect(internalSavedObjectsRepository.delete).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        'abc',
        { refresh: true, namespace: undefined }
      );

      testAlertingEventLogCalls({
        status: 'error',
        errorMessage: 'rule type not enabled',
        errorReason: 'license',
        executionStatus: 'not-reached',
      });
      expect(logger.debug).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledTimes(1);

      const loggerCall = logger.error.mock.calls[0][0];
      const loggerMeta = logger.error.mock.calls[0][1];
      const loggerCallPrefix = (loggerCall as string).split('-');
      expect(loggerCallPrefix[0].trim()).toMatchInlineSnapshot(
        `"Executing ad hoc run with id \\"abc\\" has resulted in Error: rule type not enabled"`
      );
      expect(loggerMeta?.tags).toEqual(['abc', 'rule-ad-hoc-run-failed', 'test', 'rule-id']);
      expect(loggerMeta?.error?.stack_trace).toBeDefined();
    });

    test('should handle errors when rule type params are not valid', async () => {
      mockValidateRuleTypeParams.mockImplementationOnce(() => {
        throw new Error('params not valid');
      });

      const taskRunner = new AdHocTaskRunner({
        context: taskRunnerFactoryInitializerParams,
        internalSavedObjectsRepository,
        taskInstance: mockedTaskInstance,
      });

      const runnerResult = await taskRunner.run();
      // should not return a new runAt
      expect(runnerResult).toEqual({ state: {} });
      await taskRunner.cleanup();

      expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        'abc',
        {}
      );
      expect(ruleTypeRegistry.get).toHaveBeenCalledWith('siem.queryRule');
      expect(ruleTypeRegistry.ensureRuleTypeEnabled).toHaveBeenCalledWith('siem.queryRule');
      expect(mockValidateRuleTypeParams).toHaveBeenCalledWith(
        mockedAdHocRunSO.attributes.rule.params,
        ruleTypeWithAlerts.validate.params
      ); // @ts-ignore - accessing private variable
      // shouldn't have picked a schedule to run
      expect(taskRunner.scheduleToRunIndex).toEqual(-1);
      expect(RuleRunMetricsStore).not.toHaveBeenCalled();
      expect(ruleTypeWithAlerts.executor).not.toHaveBeenCalled();

      expect(internalSavedObjectsRepository.update).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        mockedAdHocRunSO.id,
        { status: adHocRunStatus.ERROR },
        { namespace: undefined, refresh: false }
      );

      expect(internalSavedObjectsRepository.delete).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        'abc',
        { refresh: true, namespace: undefined }
      );

      testAlertingEventLogCalls({
        status: 'error',
        errorMessage: 'params not valid',
        errorReason: 'validate',
        executionStatus: 'not-reached',
      });
      expect(logger.debug).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledTimes(1);

      const loggerCall = logger.error.mock.calls[0][0];
      const loggerMeta = logger.error.mock.calls[0][1];
      const loggerCallPrefix = (loggerCall as string).split('-');
      expect(loggerCallPrefix[0].trim()).toMatchInlineSnapshot(
        `"Executing ad hoc run with id \\"abc\\" has resulted in Error: params not valid"`
      );
      expect(loggerMeta?.tags).toEqual(['abc', 'rule-ad-hoc-run-failed', 'test', 'rule-id']);
      expect(loggerMeta?.error?.stack_trace).toBeDefined();
    });

    test('should handle errors when rule type executor throws error', async () => {
      ruleTypeWithAlerts.executor.mockImplementationOnce(() => {
        throw new Error('executor failed');
      });

      const taskRunner = new AdHocTaskRunner({
        context: taskRunnerFactoryInitializerParams,
        internalSavedObjectsRepository,
        taskInstance: mockedTaskInstance,
      });

      const runnerResult = await taskRunner.run();
      // should return a new runAt to try to next scheduled execution
      expect(runnerResult).toEqual({ state: {}, runAt: new Date('1970-01-01T00:00:00.000Z') });
      await taskRunner.cleanup();

      expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        'abc',
        {}
      );
      expect(ruleTypeRegistry.get).toHaveBeenCalledWith('siem.queryRule');
      expect(ruleTypeRegistry.ensureRuleTypeEnabled).toHaveBeenCalledWith('siem.queryRule');
      expect(mockValidateRuleTypeParams).toHaveBeenCalledWith(
        mockedAdHocRunSO.attributes.rule.params,
        ruleTypeWithAlerts.validate.params
      );

      // @ts-ignore - accessing private variable
      // should run the first entry in the schedule
      expect(taskRunner.scheduleToRunIndex).toEqual(0);
      expect(RuleRunMetricsStore).toHaveBeenCalledTimes(1);
      expect(ruleTypeWithAlerts.executor).toHaveBeenCalledTimes(1);

      expect(internalSavedObjectsRepository.update).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        mockedAdHocRunSO.id,
        {
          schedule: [
            { ...schedule1, status: adHocRunStatus.ERROR },
            schedule2,
            schedule3,
            schedule4,
            schedule5,
          ],
        },
        { namespace: undefined, refresh: false }
      );

      expect(internalSavedObjectsRepository.delete).not.toHaveBeenCalled();

      testAlertingEventLogCalls({
        status: 'error',
        errorMessage: 'executor failed',
        errorReason: 'execute',
        executionStatus: 'failed',
        backfillRunAt: schedule1.runAt,
        backfillInterval: schedule1.interval,
      });
      expect(logger.debug).toHaveBeenCalledTimes(1);
      expect(logger.debug).nthCalledWith(
        1,
        `Executing ad hoc run for rule test:rule-id for runAt ${schedule1.runAt}`
      );
      expect(logger.error).toHaveBeenCalledTimes(1);

      const loggerCall = logger.error.mock.calls[0][0];
      const loggerMeta = logger.error.mock.calls[0][1];
      const loggerCallPrefix = (loggerCall as string).split('-');
      expect(loggerCallPrefix[0].trim()).toMatchInlineSnapshot(
        `"Executing ad hoc run with id \\"abc\\" has resulted in Error: executor failed"`
      );
      expect(loggerMeta?.tags).toEqual(['abc', 'rule-ad-hoc-run-failed', 'test', 'rule-id']);
      expect(loggerMeta?.error?.stack_trace).toBeDefined();
    });

    test('should log if error deleting ad hoc rule run SO after done', async () => {
      internalSavedObjectsRepository.delete.mockImplementationOnce(() => {
        throw new Error('trouble deleting this');
      });
      const taskRunner = new AdHocTaskRunner({
        context: taskRunnerFactoryInitializerParams,
        internalSavedObjectsRepository,
        taskInstance: mockedTaskInstance,
      });

      encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValueOnce({
        ...mockedAdHocRunSO,
        attributes: {
          ...mockedAdHocRunSO.attributes,
          schedule: [
            { ...schedule1, status: adHocRunStatus.COMPLETE },
            { ...schedule2, status: adHocRunStatus.TIMEOUT },
            { ...schedule3, status: adHocRunStatus.ERROR },
            { ...schedule4, status: adHocRunStatus.COMPLETE },
            schedule5,
          ],
        },
      });

      const runnerResult = await taskRunner.run();
      // should not return a runAt because there are no more schedule entries
      expect(runnerResult).toEqual({ state: {} });
      await taskRunner.cleanup();

      // Verify all the expected calls were made before calling the rule executor
      expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalled();
      expect(ruleTypeRegistry.ensureRuleTypeEnabled).toHaveBeenCalledWith('siem.queryRule');
      expect(mockValidateRuleTypeParams).toHaveBeenCalled();
      // @ts-ignore - accessing private variable
      // should run the first PENDING entry in the schedule
      expect(taskRunner.scheduleToRunIndex).toEqual(4);

      // Verify all the expected calls were made while calling the rule executor
      expect(RuleRunMetricsStore).toHaveBeenCalledTimes(1);
      expect(ruleTypeWithAlerts.executor).toHaveBeenCalledTimes(1);

      expect(internalSavedObjectsRepository.update).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        mockedAdHocRunSO.id,
        {
          schedule: [
            { ...schedule1, status: adHocRunStatus.COMPLETE },
            { ...schedule2, status: adHocRunStatus.TIMEOUT },
            { ...schedule3, status: adHocRunStatus.ERROR },
            { ...schedule4, status: adHocRunStatus.COMPLETE },
            { ...schedule5, status: adHocRunStatus.COMPLETE },
          ],
        },
        { namespace: undefined, refresh: false }
      );

      expect(internalSavedObjectsRepository.delete).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        'abc',
        { refresh: true, namespace: undefined }
      );

      testAlertingEventLogCalls({
        status: 'ok',
        backfillRunAt: schedule5.runAt,
        backfillInterval: schedule5.interval,
      });
      expect(logger.debug).toHaveBeenCalledTimes(1);
      expect(logger.debug).nthCalledWith(
        1,
        `Executing ad hoc run for rule test:rule-id for runAt ${schedule5.runAt}`
      );
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).nthCalledWith(
        1,
        `Failed to cleanup ad_hoc_run_params object [id="abc"]: trouble deleting this`
      );
    });
  });

  describe('timeout', () => {
    test('should handle task cancellation signal due to timeout', async () => {
      const taskRunner = new AdHocTaskRunner({
        context: taskRunnerFactoryInitializerParams,
        internalSavedObjectsRepository,
        taskInstance: mockedTaskInstance,
      });

      const promise = taskRunner.run();
      await Promise.resolve();
      await taskRunner.cancel();
      await promise;
      await taskRunner.cleanup();

      expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        'abc',
        {}
      );
      expect(ruleTypeRegistry.get).toHaveBeenCalledWith('siem.queryRule');
      expect(ruleTypeRegistry.ensureRuleTypeEnabled).toHaveBeenCalledWith('siem.queryRule');
      expect(mockValidateRuleTypeParams).toHaveBeenCalledWith(
        mockedAdHocRunSO.attributes.rule.params,
        ruleTypeWithAlerts.validate.params
      );

      // @ts-ignore - accessing private variable
      // should run the first entry in the schedule
      expect(taskRunner.scheduleToRunIndex).toEqual(0);
      expect(RuleRunMetricsStore).toHaveBeenCalledTimes(1);
      expect(ruleTypeWithAlerts.executor).toHaveBeenCalledTimes(1);

      expect(internalSavedObjectsRepository.update).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        mockedAdHocRunSO.id,
        {
          schedule: [
            { ...schedule1, status: adHocRunStatus.TIMEOUT },
            schedule2,
            schedule3,
            schedule4,
            schedule5,
          ],
        },
        { namespace: undefined, refresh: false }
      );

      expect(internalSavedObjectsRepository.delete).not.toHaveBeenCalled();

      testAlertingEventLogCalls({
        status: 'ok',
        timeout: true,
        backfillRunAt: schedule1.runAt,
        backfillInterval: schedule1.interval,
      });
      expect(logger.debug).toHaveBeenCalledTimes(6);
      expect(logger.debug).nthCalledWith(
        1,
        `Executing ad hoc run for rule test:rule-id for runAt ${schedule1.runAt}`
      );
      expect(logger.debug).nthCalledWith(
        2,
        `Cancelling execution for ad hoc run with id abc for rule type test with id rule-id - execution exceeded rule type timeout of 3m`
      );
      expect(logger.debug).nthCalledWith(
        3,
        `Aborting any in-progress ES searches for rule type test with id rule-id`
      );
      expect(logger.debug).nthCalledWith(
        4,
        `skipping persisting alerts for rule test:rule-id: 'test': rule execution has been cancelled.`
      );
      expect(logger.debug).nthCalledWith(
        5,
        `no scheduling of actions for rule test:rule-id: 'test': rule execution has been cancelled.`
      );
      expect(logger.debug).nthCalledWith(
        6,
        `skipping updating alerts for rule test:rule-id: 'test': rule execution has been cancelled.`
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    test('should handle task cancellation signal due to timeout when for last schedule entry', async () => {
      encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue({
        ...mockedAdHocRunSO,
        attributes: {
          ...mockedAdHocRunSO.attributes,
          schedule: [{ ...schedule1, status: adHocRunStatus.COMPLETE }, schedule2],
        },
      });
      const taskRunner = new AdHocTaskRunner({
        context: taskRunnerFactoryInitializerParams,
        internalSavedObjectsRepository,
        taskInstance: mockedTaskInstance,
      });

      const promise = taskRunner.run();
      await Promise.resolve();
      await taskRunner.cancel();
      await promise;
      await taskRunner.cleanup();

      expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        'abc',
        {}
      );
      expect(ruleTypeRegistry.get).toHaveBeenCalledWith('siem.queryRule');
      expect(ruleTypeRegistry.ensureRuleTypeEnabled).toHaveBeenCalledWith('siem.queryRule');
      expect(mockValidateRuleTypeParams).toHaveBeenCalledWith(
        mockedAdHocRunSO.attributes.rule.params,
        ruleTypeWithAlerts.validate.params
      );

      // @ts-ignore - accessing private variable
      // should run the first entry in the schedule
      expect(taskRunner.scheduleToRunIndex).toEqual(1);
      expect(RuleRunMetricsStore).toHaveBeenCalledTimes(1);
      expect(ruleTypeWithAlerts.executor).toHaveBeenCalledTimes(1);

      expect(internalSavedObjectsRepository.update).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        mockedAdHocRunSO.id,
        {
          schedule: [
            { ...schedule1, status: adHocRunStatus.COMPLETE },
            { ...schedule2, status: adHocRunStatus.TIMEOUT },
          ],
        },
        { namespace: undefined, refresh: false }
      );

      expect(internalSavedObjectsRepository.delete).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        mockedAdHocRunSO.id,
        { namespace: undefined, refresh: true }
      );

      testAlertingEventLogCalls({
        status: 'ok',
        timeout: true,
        backfillRunAt: schedule2.runAt,
        backfillInterval: schedule2.interval,
      });
      expect(logger.debug).toHaveBeenCalledTimes(6);
      expect(logger.debug).nthCalledWith(
        1,
        `Executing ad hoc run for rule test:rule-id for runAt ${schedule2.runAt}`
      );
      expect(logger.debug).nthCalledWith(
        2,
        `Cancelling execution for ad hoc run with id abc for rule type test with id rule-id - execution exceeded rule type timeout of 3m`
      );
      expect(logger.debug).nthCalledWith(
        3,
        `Aborting any in-progress ES searches for rule type test with id rule-id`
      );
      expect(logger.debug).nthCalledWith(
        4,
        `skipping persisting alerts for rule test:rule-id: 'test': rule execution has been cancelled.`
      );
      expect(logger.debug).nthCalledWith(
        5,
        `no scheduling of actions for rule test:rule-id: 'test': rule execution has been cancelled.`
      );
      expect(logger.debug).nthCalledWith(
        6,
        `skipping updating alerts for rule test:rule-id: 'test': rule execution has been cancelled.`
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    test('should handle task cancellation that leads to executor throwing error', async () => {
      ruleTypeWithAlerts.executor.mockImplementationOnce(() => {
        throw new Error('Search has been aborted due to cancelled execution');
      });

      const taskRunner = new AdHocTaskRunner({
        context: taskRunnerFactoryInitializerParams,
        internalSavedObjectsRepository,
        taskInstance: mockedTaskInstance,
      });

      const promise = taskRunner.run();
      await Promise.resolve();
      await taskRunner.cancel();
      await promise;
      await taskRunner.cleanup();

      expect(encryptedSavedObjectsClient.getDecryptedAsInternalUser).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        'abc',
        {}
      );
      expect(ruleTypeRegistry.get).toHaveBeenCalledWith('siem.queryRule');
      expect(ruleTypeRegistry.ensureRuleTypeEnabled).toHaveBeenCalledWith('siem.queryRule');
      expect(mockValidateRuleTypeParams).toHaveBeenCalledWith(
        mockedAdHocRunSO.attributes.rule.params,
        ruleTypeWithAlerts.validate.params
      );

      // @ts-ignore - accessing private variable
      // should run the first entry in the schedule
      expect(taskRunner.scheduleToRunIndex).toEqual(0);
      expect(RuleRunMetricsStore).toHaveBeenCalledTimes(1);
      expect(ruleTypeWithAlerts.executor).toHaveBeenCalledTimes(1);

      expect(internalSavedObjectsRepository.update).toHaveBeenCalledWith(
        AD_HOC_RUN_SAVED_OBJECT_TYPE,
        mockedAdHocRunSO.id,
        {
          schedule: [
            { ...schedule1, status: adHocRunStatus.TIMEOUT },
            schedule2,
            schedule3,
            schedule4,
            schedule5,
          ],
        },
        { namespace: undefined, refresh: false }
      );

      expect(internalSavedObjectsRepository.delete).not.toHaveBeenCalled();

      testAlertingEventLogCalls({
        status: 'error',
        errorMessage: 'Search has been aborted due to cancelled execution',
        errorReason: 'execute',
        executionStatus: 'failed',
        backfillRunAt: schedule1.runAt,
        backfillInterval: schedule1.interval,
        timeout: true,
      });
      expect(logger.debug).toHaveBeenCalledTimes(3);
      expect(logger.debug).nthCalledWith(
        1,
        `Executing ad hoc run for rule test:rule-id for runAt ${schedule1.runAt}`
      );
      expect(logger.debug).nthCalledWith(
        2,
        `Cancelling execution for ad hoc run with id abc for rule type test with id rule-id - execution exceeded rule type timeout of 3m`
      );
      expect(logger.debug).nthCalledWith(
        3,
        `Aborting any in-progress ES searches for rule type test with id rule-id`
      );
      expect(logger.error).toHaveBeenCalledTimes(1);

      const loggerCall = logger.error.mock.calls[0][0];
      const loggerMeta = logger.error.mock.calls[0][1];
      const loggerCallPrefix = (loggerCall as string).split('-');
      expect(loggerCallPrefix[0].trim()).toMatchInlineSnapshot(
        `"Executing ad hoc run with id \\"abc\\" has resulted in Error: Search has been aborted due to cancelled execution"`
      );
      expect(loggerMeta?.tags).toEqual(['abc', 'rule-ad-hoc-run-failed', 'test', 'rule-id']);
      expect(loggerMeta?.error?.stack_trace).toBeDefined();
    });
  });

  function testAlertingEventLogCalls({
    context = alertingEventLoggerInitializer,
    backfillRunAt,
    backfillInterval,
    activeAlerts = 0,
    newAlerts = 0,
    recoveredAlerts = 0,
    triggeredActions = 0,
    generatedActions = 0,
    status,
    errorReason,
    errorMessage = 'GENERIC ERROR MESSAGE',
    executionStatus = 'succeeded',
    logAlert = 0,
    hasReachedAlertLimit = false,
    hasReachedQueuedActionsLimit = false,
    timeout = false,
  }: {
    status: string;
    backfillRunAt?: string;
    backfillInterval?: string;
    context?: ContextOpts;
    activeAlerts?: number;
    newAlerts?: number;
    recoveredAlerts?: number;
    triggeredActions?: number;
    generatedActions?: number;
    executionStatus?: 'succeeded' | 'failed' | 'not-reached';
    logAlert?: number;
    errorReason?: string;
    errorMessage?: string;
    hasReachedAlertLimit?: boolean;
    hasReachedQueuedActionsLimit?: boolean;
    timeout?: boolean;
  }) {
    expect(alertingEventLogger.initialize).toHaveBeenCalledWith({
      context,
      runDate: new Date(DATE_1970),
      type: executionType.BACKFILL,
    });
    if (errorReason === 'decrypt') {
      expect(alertingEventLogger.addOrUpdateRuleData).not.toHaveBeenCalled();
    } else if (errorReason === 'read') {
      expect(alertingEventLogger.addOrUpdateRuleData).not.toHaveBeenCalled();
    } else {
      expect(alertingEventLogger.addOrUpdateRuleData).toHaveBeenCalledWith({
        id: RULE_ID,
        type: ruleTypeWithAlerts,
        name: mockedAdHocRunSO.attributes.rule.name,
        consumer: mockedAdHocRunSO.attributes.rule.consumer,
        revision: mockedAdHocRunSO.attributes.rule.revision,
      });
    }

    if (executionStatus === 'succeeded') {
      expect(alertingEventLogger.setExecutionSucceeded).toHaveBeenCalledWith(
        `rule executed: test:rule-id: 'test'`
      );
      expect(alertingEventLogger.setExecutionFailed).not.toHaveBeenCalled();
    } else if (executionStatus === 'failed') {
      expect(alertingEventLogger.setExecutionFailed).toHaveBeenCalledWith(
        `rule execution failure: test:rule-id: 'test'`,
        errorMessage
      );
      expect(alertingEventLogger.setExecutionSucceeded).not.toHaveBeenCalled();
    } else if (executionStatus === 'not-reached') {
      expect(alertingEventLogger.setExecutionSucceeded).not.toHaveBeenCalled();
      expect(alertingEventLogger.setExecutionFailed).not.toHaveBeenCalled();
    }

    expect(alertingEventLogger.setMaintenanceWindowIds).not.toHaveBeenCalled();

    if (logAlert > 0) {
      expect(alertingEventLogger.logAlert).toHaveBeenCalledTimes(logAlert);
    } else {
      expect(alertingEventLogger.logAlert).not.toHaveBeenCalled();
    }

    expect(alertingEventLogger.getStartAndDuration).toHaveBeenCalled();

    if (status === 'error') {
      expect(alertingEventLogger.done).toHaveBeenCalledWith({
        backfill: {
          id: mockedAdHocRunSO.id,
          ...(backfillRunAt ? { start: backfillRunAt } : {}),
          ...(backfillInterval ? { interval: backfillInterval } : {}),
        },
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
          claim_to_start_duration_ms: expect.any(Number),
          persist_alerts_duration_ms: 0,
          prepare_rule_duration_ms: 0,
          process_alerts_duration_ms: 0,
          process_rule_duration_ms: 0,
          rule_type_run_duration_ms: 0,
          total_run_duration_ms: expect.any(Number),
          trigger_actions_duration_ms: 0,
          update_alerts_duration_ms: 0,
        },
      });
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
        backfill: {
          id: mockedAdHocRunSO.id,
          ...(backfillRunAt ? { start: backfillRunAt } : {}),
          ...(backfillInterval ? { interval: backfillInterval } : {}),
        },
        metrics: {
          numSearches: 3,
          totalSearchDurationMs: 23423,
          esSearchDurationMs: 33,
          numberOfTriggeredActions: 0,
          numberOfGeneratedActions: 0,
          numberOfActiveAlerts: 0,
          numberOfRecoveredAlerts: 0,
          numberOfNewAlerts: 0,
          hasReachedAlertLimit: false,
          triggeredActionsStatus: 'complete',
        },
        status: {
          lastExecutionDate: new Date('1970-01-01T00:00:00.000Z'),
          status,
        },
        timings: {
          claim_to_start_duration_ms: expect.any(Number),
          persist_alerts_duration_ms: 0,
          prepare_rule_duration_ms: 0,
          process_alerts_duration_ms: 0,
          process_rule_duration_ms: 0,
          rule_type_run_duration_ms: 0,
          total_run_duration_ms: expect.any(Number),
          trigger_actions_duration_ms: 0,
          update_alerts_duration_ms: 0,
        },
      });
    }

    if (timeout) {
      expect(alertingEventLogger.logTimeout).toHaveBeenCalled();
    } else {
      expect(alertingEventLogger.logTimeout).not.toHaveBeenCalled();
    }
  }
});
