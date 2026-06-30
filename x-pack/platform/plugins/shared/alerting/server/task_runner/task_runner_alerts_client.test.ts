/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { usageCountersServiceMock } from '@kbn/usage-collection-plugin/server/usage_counters/usage_counters_service.mock';
import { MaintenanceWindowStatus } from '@kbn/maintenance-windows-plugin/common';
import type {
  RuleExecutorOptions,
  RuleTypeParams,
  RuleTypeState,
  AlertInstanceState,
  AlertInstanceContext,
  Rule,
  RuleAlertData,
  RawRule,
} from '../types';
import { DEFAULT_FLAPPING_SETTINGS, DEFAULT_QUERY_DELAY_SETTINGS } from '../types';
import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
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
} from '@kbn/core/server/mocks';
import type { PluginStartContract as ActionsPluginStart } from '@kbn/actions-plugin/server';
import { actionsMock, actionsClientMock } from '@kbn/actions-plugin/server/mocks';
import { alertsMock } from '../mocks';
import { eventLoggerMock } from '@kbn/event-log-plugin/server/event_logger.mock';
import type { IEventLogger } from '@kbn/event-log-plugin/server';
import { ruleTypeRegistryMock } from '../rule_type_registry.mock';
import { inMemoryMetricsMock } from '../monitoring/in_memory_metrics.mock';
import {
  mockDate,
  mockedRuleTypeSavedObject,
  ruleType,
  RULE_NAME,
  generateRunnerResult,
  RULE_ACTIONS,
  generateRuleUpdateParams,
  mockTaskInstance,
  DATE_1970,
  DATE_1970_5_MIN,
  mockedRawRuleSO,
} from './fixtures';
import { getAlertFromRaw } from '../rules_client/lib/get_alert_from_raw';
import { dataPluginMock } from '@kbn/data-plugin/server/mocks';
import { AlertingEventLogger } from '../lib/alerting_event_logger/alerting_event_logger';
import { alertingEventLoggerMock } from '../lib/alerting_event_logger/alerting_event_logger.mock';
import type { SharePluginStart } from '@kbn/share-plugin/server';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import type { DataViewsServerPluginStart } from '@kbn/data-views-plugin/server';
import { alertsServiceMock } from '../alerts_service/alerts_service.mock';
import type { UntypedNormalizedRuleType } from '../rule_type_registry';
import { alertsClientMock } from '../alerts_client/alerts_client.mock';
import * as LegacyAlertsClientModule from '../alerts_client/legacy_alerts_client';
import * as RuleRunMetricsStoreModule from '../lib/rule_run_metrics_store';
import { legacyAlertsClientMock } from '../alerts_client/legacy_alerts_client.mock';
import { ruleRunMetricsStoreMock } from '../lib/rule_run_metrics_store.mock';
import { AlertsService } from '../alerts_service';
import { ReplaySubject, Subject } from 'rxjs';
import type { IAlertsClient } from '../alerts_client/types';
import { getDataStreamAdapter } from '../alerts_service/lib/data_stream_adapter';
import {
  TIMESTAMP,
  EVENT_ACTION,
  EVENT_KIND,
  ALERT_ACTION_GROUP,
  ALERT_DURATION,
  ALERT_FLAPPING,
  ALERT_FLAPPING_HISTORY,
  ALERT_INSTANCE_ID,
  ALERT_MAINTENANCE_WINDOW_IDS,
  ALERT_MAINTENANCE_WINDOW_NAMES,
  ALERT_MUTED,
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
  SPACE_IDS,
  TAGS,
  VERSION,
  ALERT_CONSECUTIVE_MATCHES,
  ALERT_RULE_EXECUTION_TIMESTAMP,
  ALERT_SEVERITY_IMPROVING,
  ALERT_SNOOZED,
  ALERT_PENDING_RECOVERED_COUNT,
} from '@kbn/rule-data-utils';
import { backfillClientMock } from '../backfill_client/backfill_client.mock';
import { ConnectorAdapterRegistry } from '../connector_adapters/connector_adapter_registry';
import { createTaskRunnerLogger } from './lib';
import type { SavedObject } from '@kbn/core/server';
import {
  getMockMaintenanceWindow,
  maintenanceWindowsServiceMock,
} from './maintenance_windows/maintenance_windows_service.mock';
import { rulesSettingsServiceMock } from '../rules_settings/rules_settings_service.mock';
import { eventLogClientMock } from '@kbn/event-log-plugin/server/mocks';

jest.mock('uuid', () => ({
  v4: () => '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
}));

jest.mock('../lib/wrap_scoped_cluster_client', () => ({
  createWrappedScopedClusterClientFactory: jest.fn(),
}));

jest.mock('../lib/alerting_event_logger/alerting_event_logger');

jest.mock('../rules_client/lib/get_alert_from_raw');
const mockGetAlertFromRaw = getAlertFromRaw as jest.MockedFunction<typeof getAlertFromRaw>;

const logger: ReturnType<typeof loggingSystemMock.createLogger> = loggingSystemMock.createLogger();
const taskRunnerLogger = createTaskRunnerLogger({ logger, tags: ['1', 'test'] });

const mockUsageCountersSetup = usageCountersServiceMock.createSetupContract();
const mockUsageCounter = mockUsageCountersSetup.createUsageCounter('test');
const alertingEventLogger = alertingEventLoggerMock.create();
const clusterClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
const maintenanceWindowsService = maintenanceWindowsServiceMock.create();

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

describe('Task Runner', () => {
  for (const useDataStreamForAlerts of [true, false]) {
    const label = useDataStreamForAlerts ? 'data streams' : 'aliases';

    let mockedTaskInstance: ConcreteTaskInstance;

    beforeAll(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(DATE_1970));
      mockedTaskInstance = mockTaskInstance();
    });

    afterAll(() => jest.useRealTimers());

    const encryptedSavedObjectsClient = encryptedSavedObjectsMock.createClient();
    const internalSavedObjectsRepository = savedObjectsRepositoryMock.create();
    const backfillClient = backfillClientMock.create();
    const services = alertsMock.createRuleExecutorServices();
    const actionsClient = actionsClientMock.create();
    const rulesSettingsService = rulesSettingsServiceMock.create();
    const ruleTypeRegistry = ruleTypeRegistryMock.create();
    const savedObjectsService = savedObjectsServiceMock.createInternalStartContract();
    const elasticsearchService = elasticsearchServiceMock.createInternalStart();
    const dataPlugin = dataPluginMock.createStartContract();
    const uiSettingsService = uiSettingsServiceMock.createStartContract();
    const inMemoryMetrics = inMemoryMetricsMock.create();
    const dataViewsMock = {
      dataViewsServiceFactory: jest
        .fn()
        .mockResolvedValue(dataViewPluginMocks.createStartContract()),
      getScriptedFieldsEnabled: jest.fn().mockReturnValue(true),
    } as DataViewsServerPluginStart;
    const mockAlertsService = alertsServiceMock.create();
    const mockAlertsClient = alertsClientMock.create();
    const mockLegacyAlertsClient = legacyAlertsClientMock.create();
    const ruleRunMetricsStore = ruleRunMetricsStoreMock.create();
    const connectorAdapterRegistry = new ConnectorAdapterRegistry();
    const elasticsearchAndSOAvailability$ = new Subject<boolean>();

    type TaskRunnerFactoryInitializerParamsType = jest.Mocked<TaskRunnerContext> & {
      actionsPlugin: jest.Mocked<ActionsPluginStart>;
      eventLogger: jest.Mocked<IEventLogger>;
      executionContext: ReturnType<typeof executionContextServiceMock.createInternalStartContract>;
    };

    const taskRunnerFactoryInitializerParams: TaskRunnerFactoryInitializerParamsType = {
      actionsConfigMap: { default: { max: 1000 } },
      actionsPlugin: actionsMock.createStart(),
      alertsService: mockAlertsService,
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

    describe(`using ${label} for alert indices`, () => {
      beforeEach(() => {
        jest.clearAllMocks();
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
        ruleTypeRegistry.get.mockReturnValue(ruleTypeWithAlerts);
        taskRunnerFactoryInitializerParams.executionContext.withContext.mockImplementation(
          (ctx, fn) => fn()
        );
        rulesSettingsService.getSettings.mockResolvedValue({
          flappingSettings: DEFAULT_FLAPPING_SETTINGS,
          queryDelaySettings: DEFAULT_QUERY_DELAY_SETTINGS,
        });
        mockedRuleTypeSavedObject.monitoring!.run.history = [];
        mockedRuleTypeSavedObject.monitoring!.run.calculated_metrics.success_ratio = 0;

        alertingEventLogger.getStartAndDuration.mockImplementation(() => ({ start: new Date() }));
        (AlertingEventLogger as jest.Mock).mockImplementation(() => alertingEventLogger);

        maintenanceWindowsService.getMaintenanceWindows.mockReturnValue({
          maintenanceWindows: [
            {
              ...getMockMaintenanceWindow(),
              eventStartTime: new Date().toISOString(),
              eventEndTime: new Date().toISOString(),
              status: MaintenanceWindowStatus.Running,
              id: 'test-id1',
              title: 'test-name1',
            },
            {
              ...getMockMaintenanceWindow(),
              eventStartTime: new Date().toISOString(),
              eventEndTime: new Date().toISOString(),
              status: MaintenanceWindowStatus.Running,
              id: 'test-id2',
              title: 'test-name2',
            },
          ],
          maintenanceWindowsWithoutScopedQueryIds: ['test-id1', 'test-id2'],
        });
        logger.get.mockImplementation(() => logger);
        ruleType.executor.mockResolvedValue({ state: {} });
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

      test('should not use legacy alerts client if alerts client created', async () => {
        const spy1 = jest
          .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
          .mockImplementation(() => mockLegacyAlertsClient);
        const spy2 = jest
          .spyOn(RuleRunMetricsStoreModule, 'RuleRunMetricsStore')
          .mockImplementation(() => ruleRunMetricsStore);
        mockAlertsService.createAlertsClient.mockImplementation(() => mockAlertsClient);
        mockAlertsClient.getRawAlertInstancesForState.mockResolvedValue({
          rawActiveAlerts: {},
          rawRecoveredAlerts: {},
        });
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
        const taskRunner = new TaskRunner({
          ruleType: ruleTypeWithAlerts,
          internalSavedObjectsRepository,
          taskInstance: {
            ...mockedTaskInstance,
            state: {
              ...mockedTaskInstance.state,
              previousStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            },
          },
          context: taskRunnerFactoryInitializerParams,
          inMemoryMetrics,
        });
        expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

        mockGetAlertFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
        encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

        await taskRunner.run();

        expect(mockAlertsService.createAlertsClient).toHaveBeenCalledWith({
          alertingEventLogger,
          logger: taskRunnerLogger,
          maintenanceWindowsService,
          request: expect.any(Object),
          ruleType: ruleTypeWithAlerts,
          spaceId: 'default',
          namespace: 'default',
          rule: {
            alertDelay: 0,
            consumer: 'bar',
            executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
            id: '1',
            muteAll: false,
            mutedInstanceIds: [],
            snoozedInstances: [],
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

        testCorrectAlertsClientUsed({
          alertsClientToUse: mockAlertsClient,
          alertsClientNotToUse: mockLegacyAlertsClient,
        });

        expect(ruleType.executor).toHaveBeenCalledTimes(1);
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
          'ruleRunMetrics for test:1: {"numSearches":3,"totalSearchDurationMs":23423,"esSearchDurationMs":33,"numberOfTriggeredActions":0,"numberOfGeneratedActions":0,"numberOfActiveAlerts":0,"numberOfRecoveredAlerts":0,"numberOfNewAlerts":0,"hasReachedAlertLimit":false,"triggeredActionsStatus":"complete"}',
          { tags: ['1', 'test'] }
        );

        expect(elasticsearchService.client.asInternalUser.update).toHaveBeenCalledWith(
          ...generateRuleUpdateParams({
            metrics: {
              total_search_duration_ms: 23423,
            },
          })
        );

        expect(taskRunnerFactoryInitializerParams.executionContext.withContext).toBeCalledTimes(1);
        expect(
          taskRunnerFactoryInitializerParams.executionContext.withContext
        ).toHaveBeenCalledWith(
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
          jest.requireMock('../lib/wrap_scoped_cluster_client')
            .createWrappedScopedClusterClientFactory
        ).toHaveBeenCalled();
        spy1.mockRestore();
        spy2.mockRestore();
      });

      test('should successfully execute task with alerts client', async () => {
        const alertsService = new AlertsService({
          logger,
          pluginStop$: new ReplaySubject(1),
          kibanaVersion: '8.8.0',
          elasticsearchClientPromise: Promise.resolve(clusterClient),
          dataStreamAdapter: getDataStreamAdapter({ useDataStreamForAlerts }),
          elasticsearchAndSOAvailability$,
          isServerless: false,
        });
        elasticsearchAndSOAvailability$.next(true);

        const spy = jest
          .spyOn(alertsService, 'getContextInitializationPromise')
          .mockResolvedValue({ result: true });

        const taskRunner = new TaskRunner({
          ruleType: ruleTypeWithAlerts,
          internalSavedObjectsRepository,
          taskInstance: {
            ...mockedTaskInstance,
            state: {
              ...mockedTaskInstance.state,
              previousStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            },
          },
          context: {
            ...taskRunnerFactoryInitializerParams,
            alertsService,
          },
          inMemoryMetrics,
        });
        expect(AlertingEventLogger).toHaveBeenCalledTimes(1);
        mockGetAlertFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
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
        expect(call.services.alertsClient).not.toBe(null);
        expect(call.services.alertsClient?.report).toBeTruthy();
        expect(call.services.alertsClient?.setAlertData).toBeTruthy();
        expect(call.services.scopedClusterClient).toBeTruthy();
        expect(call.services).toBeTruthy();
        expect(logger.debug).toHaveBeenCalledTimes(useDataStreamForAlerts ? 9 : 10);

        let debugCall = 1;
        expect(logger.debug).nthCalledWith(
          debugCall++,
          'executing rule test:1 at 1970-01-01T00:00:00.000Z',
          { tags: ['1', 'test'] }
        );
        expect(logger.debug).nthCalledWith(debugCall++, `Initializing resources for AlertsService`);

        if (!useDataStreamForAlerts) {
          expect(logger.debug).nthCalledWith(
            debugCall++,
            'Installing ILM policy .alerts-ilm-policy'
          );
        }
        expect(logger.debug).nthCalledWith(
          debugCall++,
          'Installing component template .alerts-framework-mappings'
        );
        expect(logger.debug).nthCalledWith(
          debugCall++,
          'Installing component template .alerts-legacy-alert-mappings'
        );
        expect(logger.debug).nthCalledWith(
          debugCall++,
          'Installing component template .alerts-ecs-mappings'
        );
        expect(logger.debug).nthCalledWith(
          debugCall++,
          'deprecated ruleRunStatus for test:1: {"lastExecutionDate":"1970-01-01T00:00:00.000Z","status":"ok"}',
          { tags: ['1', 'test'] }
        );
        expect(logger.debug).nthCalledWith(
          debugCall++,
          'ruleRunStatus for test:1: {"outcome":"succeeded","outcomeOrder":0,"outcomeMsg":null,"warning":null,"alertsCount":{"active":0,"new":0,"recovered":0,"ignored":0}}',
          { tags: ['1', 'test'] }
        );
        expect(logger.debug).nthCalledWith(
          debugCall++,
          'ruleRunMetrics for test:1: {"numSearches":3,"totalSearchDurationMs":23423,"esSearchDurationMs":33,"numberOfTriggeredActions":0,"numberOfGeneratedActions":0,"numberOfActiveAlerts":0,"numberOfRecoveredAlerts":0,"numberOfNewAlerts":0,"numberOfDelayedAlerts":0,"hasReachedAlertLimit":false,"hasReachedQueuedActionsLimit":false,"triggeredActionsStatus":"complete"}',
          { tags: ['1', 'test'] }
        );
        expect(elasticsearchService.client.asInternalUser.update).toHaveBeenCalledWith(
          ...generateRuleUpdateParams({
            metrics: {
              total_search_duration_ms: 23423,
            },
          })
        );
        expect(taskRunnerFactoryInitializerParams.executionContext.withContext).toBeCalledTimes(1);
        expect(
          taskRunnerFactoryInitializerParams.executionContext.withContext
        ).toHaveBeenCalledWith(
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
          jest.requireMock('../lib/wrap_scoped_cluster_client')
            .createWrappedScopedClusterClientFactory
        ).toHaveBeenCalled();
        spy.mockRestore();
      });

      test('should successfully execute task and index alert documents', async () => {
        const alertsService = new AlertsService({
          logger,
          pluginStop$: new ReplaySubject(1),
          kibanaVersion: '8.8.0',
          elasticsearchClientPromise: Promise.resolve(clusterClient),
          dataStreamAdapter: getDataStreamAdapter({ useDataStreamForAlerts }),
          elasticsearchAndSOAvailability$,
          isServerless: false,
        });
        elasticsearchAndSOAvailability$.next(true);

        const spy = jest
          .spyOn(alertsService, 'getContextInitializationPromise')
          .mockResolvedValue({ result: true });

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

        const taskRunner = new TaskRunner({
          ruleType: ruleTypeWithAlerts,
          internalSavedObjectsRepository,
          taskInstance: mockedTaskInstance,
          context: {
            ...taskRunnerFactoryInitializerParams,
            alertsService,
          },
          inMemoryMetrics,
        });
        expect(AlertingEventLogger).toHaveBeenCalledTimes(1);
        mockGetAlertFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
        encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);
        await taskRunner.run();

        expect(ruleType.executor).toHaveBeenCalledTimes(1);

        expect(clusterClient.bulk).toHaveBeenCalledWith({
          index: '.alerts-test.alerts-default',
          refresh: 'wait_for',
          require_alias: !useDataStreamForAlerts,
          body: [
            {
              create: {
                _id: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
                ...(useDataStreamForAlerts ? {} : { require_alias: true }),
              },
            },
            // new alert doc
            {
              [TIMESTAMP]: DATE_1970,
              numericField: 27,
              textField: 'foo',
              [EVENT_ACTION]: 'open',
              [EVENT_KIND]: 'signal',
              [ALERT_ACTION_GROUP]: 'default',
              [ALERT_CONSECUTIVE_MATCHES]: 1,
              [ALERT_DURATION]: 0,
              [ALERT_FLAPPING]: false,
              [ALERT_MUTED]: false,
              [ALERT_FLAPPING_HISTORY]: [true],
              [ALERT_INSTANCE_ID]: '1',
              [ALERT_SEVERITY_IMPROVING]: false,
              [ALERT_MAINTENANCE_WINDOW_IDS]: ['test-id1', 'test-id2'],
              [ALERT_MAINTENANCE_WINDOW_NAMES]: ['test-name1', 'test-name2'],
              [ALERT_PENDING_RECOVERED_COUNT]: 0,
              [ALERT_RULE_CATEGORY]: 'My test rule',
              [ALERT_RULE_CONSUMER]: 'bar',
              [ALERT_RULE_EXECUTION_UUID]: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
              [ALERT_RULE_EXECUTION_TIMESTAMP]: DATE_1970,
              [ALERT_RULE_NAME]: 'rule-name',
              [ALERT_RULE_PARAMETERS]: { bar: true },
              [ALERT_RULE_PRODUCER]: 'alerts',
              [ALERT_RULE_REVISION]: 0,
              [ALERT_RULE_TYPE_ID]: 'test',
              [ALERT_RULE_TAGS]: ['rule-', '-tags'],
              [ALERT_RULE_UUID]: '1',
              [ALERT_SNOOZED]: false,
              [ALERT_START]: DATE_1970,
              [ALERT_STATUS]: 'active',
              [ALERT_TIME_RANGE]: { gte: DATE_1970 },
              [ALERT_UUID]: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
              [ALERT_WORKFLOW_STATUS]: 'open',
              [SPACE_IDS]: ['default'],
              [VERSION]: '8.8.0',
              [TAGS]: ['rule-', '-tags'],
            },
          ],
        });
        spy.mockRestore();
      });

      test('should default to legacy alerts client if error creating alerts client', async () => {
        const spy1 = jest
          .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
          .mockImplementation(() => mockLegacyAlertsClient);
        const spy2 = jest
          .spyOn(RuleRunMetricsStoreModule, 'RuleRunMetricsStore')
          .mockImplementation(() => ruleRunMetricsStore);
        mockAlertsService.createAlertsClient.mockImplementation(() => {
          throw new Error('Could not initialize!');
        });
        mockLegacyAlertsClient.getRawAlertInstancesForState.mockResolvedValue({
          rawActiveAlerts: {},
          rawRecoveredAlerts: {},
        });
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
        const taskRunner = new TaskRunner({
          ruleType: ruleTypeWithAlerts,
          internalSavedObjectsRepository,
          taskInstance: {
            ...mockedTaskInstance,
            state: {
              ...mockedTaskInstance.state,
              previousStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            },
          },
          context: taskRunnerFactoryInitializerParams,
          inMemoryMetrics,
        });
        expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

        mockGetAlertFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
        encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

        await taskRunner.run();

        expect(mockAlertsService.createAlertsClient).toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
          `Error initializing AlertsClient for context test. Using legacy alerts client instead. - Could not initialize!`,
          { tags: ['1', 'test'] }
        );
        expect(LegacyAlertsClientModule.LegacyAlertsClient).toHaveBeenCalledWith({
          alertingEventLogger,
          request: expect.any(Object),
          logger: taskRunnerLogger,
          ruleType: ruleTypeWithAlerts,
          maintenanceWindowsService,
          spaceId: 'default',
        });

        testCorrectAlertsClientUsed({
          alertsClientToUse: mockLegacyAlertsClient,
          alertsClientNotToUse: mockAlertsClient,
        });

        expect(ruleType.executor).toHaveBeenCalledTimes(1);

        expect(logger.debug).toHaveBeenCalledTimes(5);
        expect(logger.debug).nthCalledWith(1, 'executing rule test:1 at 1970-01-01T00:00:00.000Z', {
          tags: ['1', 'test'],
        });

        expect(elasticsearchService.client.asInternalUser.update).toHaveBeenCalledWith(
          ...generateRuleUpdateParams({
            metrics: {
              total_search_duration_ms: 23423,
            },
          })
        );

        expect(taskRunnerFactoryInitializerParams.executionContext.withContext).toBeCalledTimes(1);
        expect(
          taskRunnerFactoryInitializerParams.executionContext.withContext
        ).toHaveBeenCalledWith(
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
          jest.requireMock('../lib/wrap_scoped_cluster_client')
            .createWrappedScopedClusterClientFactory
        ).toHaveBeenCalled();
        spy1.mockRestore();
        spy2.mockRestore();
      });

      test('should default to legacy alerts client if alert service is not defined', async () => {
        const spy1 = jest
          .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
          .mockImplementation(() => mockLegacyAlertsClient);
        const spy2 = jest
          .spyOn(RuleRunMetricsStoreModule, 'RuleRunMetricsStore')
          .mockImplementation(() => ruleRunMetricsStore);
        mockLegacyAlertsClient.getRawAlertInstancesForState.mockResolvedValue({
          rawActiveAlerts: {},
          rawRecoveredAlerts: {},
        });
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
        const taskRunner = new TaskRunner({
          ruleType: ruleTypeWithAlerts,
          internalSavedObjectsRepository,
          taskInstance: {
            ...mockedTaskInstance,
            state: {
              ...mockedTaskInstance.state,
              previousStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            },
          },
          context: { ...taskRunnerFactoryInitializerParams, alertsService: null },
          inMemoryMetrics,
        });
        expect(AlertingEventLogger).toHaveBeenCalledTimes(1);

        mockGetAlertFromRaw.mockReturnValue(mockedRuleTypeSavedObject as Rule);
        encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue(mockedRawRuleSO);

        await taskRunner.run();

        expect(mockAlertsService.createAlertsClient).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
        expect(LegacyAlertsClientModule.LegacyAlertsClient).toHaveBeenCalledWith({
          alertingEventLogger,
          request: expect.any(Object),
          spaceId: 'default',
          logger: taskRunnerLogger,
          ruleType: ruleTypeWithAlerts,
          maintenanceWindowsService,
        });

        testCorrectAlertsClientUsed({
          alertsClientToUse: mockLegacyAlertsClient,
          alertsClientNotToUse: mockAlertsClient,
        });

        expect(ruleType.executor).toHaveBeenCalledTimes(1);

        expect(logger.debug).toHaveBeenCalledTimes(5);
        expect(logger.debug).nthCalledWith(1, 'executing rule test:1 at 1970-01-01T00:00:00.000Z', {
          tags: ['1', 'test'],
        });

        expect(elasticsearchService.client.asInternalUser.update).toHaveBeenCalledWith(
          ...generateRuleUpdateParams({
            metrics: {
              total_search_duration_ms: 23423,
            },
          })
        );

        expect(taskRunnerFactoryInitializerParams.executionContext.withContext).toBeCalledTimes(1);
        expect(
          taskRunnerFactoryInitializerParams.executionContext.withContext
        ).toHaveBeenCalledWith(
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
          jest.requireMock('../lib/wrap_scoped_cluster_client')
            .createWrappedScopedClusterClientFactory
        ).toHaveBeenCalled();
        spy1.mockRestore();
        spy2.mockRestore();
      });

      test('should use rule specific flapping settings if global flapping is enabled', async () => {
        mockAlertsService.createAlertsClient.mockImplementation(() => mockAlertsClient);
        mockAlertsClient.getRawAlertInstancesForState.mockResolvedValue({
          rawActiveAlerts: {},
          rawRecoveredAlerts: {},
        });

        const taskRunner = new TaskRunner({
          ruleType: ruleTypeWithAlerts,
          internalSavedObjectsRepository,
          taskInstance: {
            ...mockedTaskInstance,
            state: {
              ...mockedTaskInstance.state,
              previousStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            },
          },
          context: taskRunnerFactoryInitializerParams,
          inMemoryMetrics,
        });

        const ruleSpecificFlapping = {
          enabled: false,
          lookBackWindow: 10,
          statusChangeThreshold: 10,
        };

        mockGetAlertFromRaw.mockReturnValue({
          ...mockedRuleTypeSavedObject,
          flapping: ruleSpecificFlapping,
        } as Rule);

        encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue({
          ...mockedRawRuleSO,
          flapping: ruleSpecificFlapping,
        } as SavedObject<RawRule>);

        await taskRunner.run();

        expect(mockAlertsClient.initializeExecution).toHaveBeenCalledWith(
          expect.objectContaining({
            flappingSettings: {
              enabled: false,
              lookBackWindow: 10,
              statusChangeThreshold: 10,
            },
          })
        );
      });

      test('should still use rule specific flapping settings if global flapping is disabled', async () => {
        rulesSettingsService.getSettings.mockResolvedValue({
          flappingSettings: {
            enabled: false,
            lookBackWindow: 20,
            statusChangeThreshold: 20,
          },
          queryDelaySettings: DEFAULT_QUERY_DELAY_SETTINGS,
        });

        mockAlertsService.createAlertsClient.mockImplementation(() => mockAlertsClient);
        mockAlertsClient.getRawAlertInstancesForState.mockResolvedValue({
          rawActiveAlerts: {},
          rawRecoveredAlerts: {},
        });

        const taskRunner = new TaskRunner({
          ruleType: ruleTypeWithAlerts,
          internalSavedObjectsRepository,
          taskInstance: {
            ...mockedTaskInstance,
            state: {
              ...mockedTaskInstance.state,
              previousStartedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            },
          },
          context: taskRunnerFactoryInitializerParams,
          inMemoryMetrics,
        });

        const ruleSpecificFlapping = {
          lookBackWindow: 10,
          statusChangeThreshold: 10,
        };

        mockGetAlertFromRaw.mockReturnValue({
          ...mockedRuleTypeSavedObject,
          flapping: ruleSpecificFlapping,
        } as Rule);

        encryptedSavedObjectsClient.getDecryptedAsInternalUser.mockResolvedValue({
          ...mockedRawRuleSO,
          flapping: ruleSpecificFlapping,
        } as SavedObject<RawRule>);

        await taskRunner.run();

        expect(mockAlertsClient.initializeExecution).toHaveBeenCalledWith(
          expect.objectContaining({
            flappingSettings: {
              enabled: true,
              lookBackWindow: 10,
              statusChangeThreshold: 10,
            },
          })
        );
      });
    });

    function testCorrectAlertsClientUsed<
      AlertData extends RuleAlertData = never,
      State extends AlertInstanceState = never,
      Context extends AlertInstanceContext = never,
      ActionGroupIds extends string = 'default',
      RecoveryActionGroupId extends string = 'recovered'
    >({
      alertsClientToUse,
      alertsClientNotToUse,
    }: {
      alertsClientToUse: IAlertsClient<
        AlertData,
        State,
        Context,
        ActionGroupIds,
        RecoveryActionGroupId
      >;
      alertsClientNotToUse: IAlertsClient<
        AlertData,
        State,
        Context,
        ActionGroupIds,
        RecoveryActionGroupId
      >;
    }) {
      expect(alertsClientToUse.initializeExecution).toHaveBeenCalledWith({
        activeAlertsFromState: {},
        flappingSettings: {
          enabled: true,
          lookBackWindow: 20,
          statusChangeThreshold: 4,
        },
        maxAlerts: 1000,
        recoveredAlertsFromState: {},
        ruleLabel: "test:1: 'rule-name'",
        runTimestamp: undefined,
        snoozedInstances: [],
        startedAt: new Date(DATE_1970),
      });
      expect(alertsClientNotToUse.initializeExecution).not.toHaveBeenCalled();

      expect(alertsClientToUse.checkLimitUsage).toHaveBeenCalled();
      expect(alertsClientNotToUse.checkLimitUsage).not.toHaveBeenCalled();

      expect(alertsClientToUse.processAlerts).toHaveBeenCalledWith();

      expect(alertsClientToUse.logAlerts).toHaveBeenCalledWith({
        ruleRunMetricsStore,
        shouldLogAlerts: true,
      });

      expect(alertsClientNotToUse.processAlerts).not.toHaveBeenCalled();
      expect(alertsClientNotToUse.logAlerts).not.toHaveBeenCalled();

      expect(alertsClientToUse.persistAlerts).toHaveBeenCalled();
      expect(alertsClientNotToUse.persistAlerts).not.toHaveBeenCalled();

      expect(alertsClientToUse.getProcessedAlerts).toHaveBeenCalledWith('active');
      expect(alertsClientToUse.getProcessedAlerts).toHaveBeenCalledWith('recovered');
      expect(alertsClientNotToUse.getProcessedAlerts).not.toHaveBeenCalled();

      expect(alertsClientToUse.getRawAlertInstancesForState).toHaveBeenCalled();
      expect(alertsClientNotToUse.getRawAlertInstancesForState).not.toHaveBeenCalled();
    }
  }
});
