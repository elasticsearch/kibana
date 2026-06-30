/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { UpdateByQueryRequest } from '@elastic/elasticsearch/lib/api/types';
import type { MaintenanceWindow } from '@kbn/maintenance-windows-plugin/common';
import { MaintenanceWindowStatus } from '@kbn/maintenance-windows-plugin/common';
import type { UntypedNormalizedRuleType } from '../rule_type_registry';
import type { AlertsFilter, RuleAlertData } from '../types';
import { DEFAULT_FLAPPING_SETTINGS, RecoveredActionGroup } from '../types';
import {
  ALERT_ACTION_GROUP,
  ALERT_CONSECUTIVE_MATCHES,
  ALERT_DURATION,
  ALERT_END,
  ALERT_FLAPPING,
  ALERT_FLAPPING_HISTORY,
  ALERT_INSTANCE_ID,
  ALERT_MAINTENANCE_WINDOW_IDS,
  ALERT_MAINTENANCE_WINDOW_NAMES,
  ALERT_MUTED,
  ALERT_PENDING_RECOVERED_COUNT,
  ALERT_PREVIOUS_ACTION_GROUP,
  ALERT_RULE_CATEGORY,
  ALERT_RULE_CONSUMER,
  ALERT_RULE_EXECUTION_TIMESTAMP,
  ALERT_RULE_EXECUTION_UUID,
  ALERT_RULE_NAME,
  ALERT_RULE_PARAMETERS,
  ALERT_RULE_PRODUCER,
  ALERT_RULE_REVISION,
  ALERT_RULE_TAGS,
  ALERT_RULE_TYPE_ID,
  ALERT_RULE_UUID,
  ALERT_SEVERITY_IMPROVING,
  ALERT_SNOOZED,
  ALERT_START,
  ALERT_STATE_NAMESPACE,
  ALERT_STATUS,
  ALERT_STATUS_UNTRACKED,
  ALERT_TIME_RANGE,
  ALERT_UUID,
  ALERT_WORKFLOW_STATUS,
  EVENT_ACTION,
  EVENT_KIND,
  SPACE_IDS,
  TAGS,
  TIMESTAMP,
  VERSION,
} from '@kbn/rule-data-utils';
import * as LegacyAlertsClientModule from './legacy_alerts_client';
import { LegacyAlertsClient } from './legacy_alerts_client';
import { Alert } from '../alert/alert';
import type { AlertsClientParams } from './alerts_client';
import { AlertsClient } from './alerts_client';
import type {
  GetSummarizedAlertsParams,
  GetMaintenanceWindowScopedQueryAlertsParams,
  DetermineDelayedAlertsOpts,
  LogAlertsOpts,
} from './types';
import { legacyAlertsClientMock } from './legacy_alerts_client.mock';
import { keys, omit } from 'lodash';
import { alertingEventLoggerMock } from '../lib/alerting_event_logger/alerting_event_logger.mock';
import { ruleRunMetricsStoreMock } from '../lib/rule_run_metrics_store.mock';
import { expandFlattenedAlert } from './lib';
import {
  alertRuleData,
  getExpectedQueryByExecutionUuid,
  getExpectedQueryByTimeRange,
  getParamsByExecutionUuid,
  getParamsByMaintenanceWindowScopedQuery,
  getParamsByTimeQuery,
  getParamsByUpdateMaintenanceWindowIds,
  mockAAD,
} from './alerts_client_fixtures';
import { getDataStreamAdapter } from '../alerts_service/lib/data_stream_adapter';
import {
  maintenanceWindowsServiceMock,
  getMockMaintenanceWindow,
} from '../task_runner/maintenance_windows/maintenance_windows_service.mock';
import type { KibanaRequest } from '@kbn/core/server';
import { rule } from './lib/test_fixtures';
import { RUNTIME_MAINTENANCE_WINDOW_ID_FIELD } from './lib/get_summarized_alerts_query';
import { DEFAULT_MAX_ALERTS } from '../config';

const date = '2023-03-28T22:27:28.159Z';
const startedAtDate = '2023-03-28T13:00:00.000Z';
const maxAlerts = 1000;
let logger: ReturnType<(typeof loggingSystemMock)['createLogger']>;
const clusterClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
const alertingEventLogger = alertingEventLoggerMock.create();
const maintenanceWindowsService = maintenanceWindowsServiceMock.create();
const ruleRunMetricsStore = ruleRunMetricsStoreMock.create();

const ruleType: jest.Mocked<UntypedNormalizedRuleType> = {
  id: 'test.rule-type',
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
  doesSetRecoveryContext: true,
  validate: {
    params: { validate: (params) => params },
  },
  alerts: {
    context: 'test',
    mappings: { fieldMap: { field: { type: 'keyword', required: false } } },
    shouldWrite: true,
  },
  validLegacyConsumers: [],
};

const mockLegacyAlertsClient = legacyAlertsClientMock.create();
const mockReplaceState = jest.fn();
const mockGetUuid = jest.fn().mockReturnValue('uuidabc');
const mockGetStart = jest.fn().mockReturnValue(date);
const mockScheduleActions = jest.fn().mockImplementation(() => ({
  replaceState: mockReplaceState,
  getUuid: mockGetUuid,
  getStart: mockGetStart,
}));
const mockCreate = jest.fn().mockImplementation(() => ({
  scheduleActions: mockScheduleActions,
  getUuid: mockGetUuid,
  getStart: mockGetStart,
}));
const mockSetContext = jest.fn();

const trackedAlert1Raw = {
  state: { foo: true, start: '2023-03-28T12:27:28.159Z', duration: '0' },
  meta: {
    flapping: false,
    flappingHistory: [true],
    lastScheduledActions: { group: 'default', date: new Date().toISOString() },
    uuid: 'abc',
  },
};
const trackedAlert2Raw = {
  state: { foo: true, start: '2023-03-28T02:27:28.159Z', duration: '36000000000000' },
  meta: {
    flapping: false,
    flappingHistory: [true, false, false],
    lastScheduledActions: { group: 'default', date: new Date().toISOString() },
    uuid: 'def',
  },
};

const fetchedAlert1 = {
  [TIMESTAMP]: '2023-03-28T12:27:28.159Z',
  [EVENT_ACTION]: 'open',
  [EVENT_KIND]: 'signal',
  [ALERT_ACTION_GROUP]: 'default',
  [ALERT_CONSECUTIVE_MATCHES]: 0,
  [ALERT_DURATION]: 0,
  [ALERT_FLAPPING]: false,
  [ALERT_MUTED]: false,
  [ALERT_FLAPPING_HISTORY]: [true],
  [ALERT_INSTANCE_ID]: '1',
  [ALERT_MAINTENANCE_WINDOW_IDS]: [],
  [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
  [ALERT_PENDING_RECOVERED_COUNT]: 0,
  [ALERT_RULE_CATEGORY]: 'My test rule',
  [ALERT_RULE_CONSUMER]: 'bar',
  [ALERT_RULE_EXECUTION_UUID]: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
  [ALERT_RULE_NAME]: 'rule-name',
  [ALERT_RULE_PARAMETERS]: { bar: true },
  [ALERT_RULE_PRODUCER]: 'alerts',
  [ALERT_RULE_REVISION]: 0,
  [ALERT_RULE_TYPE_ID]: 'test.rule-type',
  [ALERT_RULE_TAGS]: ['rule-', '-tags'],
  [ALERT_RULE_UUID]: '1',
  [ALERT_SNOOZED]: false,
  [ALERT_START]: '2023-03-28T12:27:28.159Z',
  [ALERT_STATUS]: 'active',
  [ALERT_TIME_RANGE]: { gte: '2023-03-28T12:27:28.159Z' },
  [ALERT_UUID]: 'abc',
  [ALERT_WORKFLOW_STATUS]: 'open',
  [SPACE_IDS]: ['default'],
  [VERSION]: '8.8.0',
  [TAGS]: ['rule-', '-tags'],
};

const fetchedAlert2 = {
  [TIMESTAMP]: '2023-03-28T13:27:28.159Z',
  [EVENT_ACTION]: 'active',
  [EVENT_KIND]: 'signal',
  [ALERT_ACTION_GROUP]: 'default',
  [ALERT_CONSECUTIVE_MATCHES]: 0,
  [ALERT_DURATION]: 36000000000,
  [ALERT_FLAPPING]: false,
  [ALERT_MUTED]: false,
  [ALERT_FLAPPING_HISTORY]: [true, false],
  [ALERT_INSTANCE_ID]: '2',
  [ALERT_MAINTENANCE_WINDOW_IDS]: [],
  [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
  [ALERT_PENDING_RECOVERED_COUNT]: 0,
  [ALERT_RULE_CATEGORY]: 'My test rule',
  [ALERT_RULE_CONSUMER]: 'bar',
  [ALERT_RULE_EXECUTION_UUID]: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
  [ALERT_RULE_NAME]: 'rule-name',
  [ALERT_RULE_PARAMETERS]: { bar: true },
  [ALERT_RULE_PRODUCER]: 'alerts',
  [ALERT_RULE_REVISION]: 0,
  [ALERT_RULE_TYPE_ID]: 'test.rule-type',
  [ALERT_RULE_TAGS]: ['rule-', '-tags'],
  [ALERT_RULE_UUID]: '1',
  [ALERT_SNOOZED]: false,
  [ALERT_START]: '2023-03-28T02:27:28.159Z',
  [ALERT_STATUS]: 'active',
  [ALERT_TIME_RANGE]: { gte: '2023-03-28T02:27:28.159Z' },
  [ALERT_UUID]: 'def',
  [ALERT_WORKFLOW_STATUS]: 'open',
  [SPACE_IDS]: ['default'],
  [VERSION]: '8.8.0',
  [TAGS]: ['rule-', '-tags'],
};

const fetchedAlert3 = {
  ...fetchedAlert2,
  [TIMESTAMP]: '2023-05-28T13:27:28.159Z',
  [ALERT_START]: '2023-05-28T02:27:28.159Z',
  [ALERT_RULE_EXECUTION_UUID]: '34lrfhw-645g-as67-sdf5-2534fvf8vfnjks',
  [ALERT_UUID]: 'xyz',
};

const getNewIndexedAlertDoc = (overrides = {}) => ({
  [TIMESTAMP]: date,
  [EVENT_ACTION]: 'open',
  [EVENT_KIND]: 'signal',
  [ALERT_ACTION_GROUP]: 'default',
  [ALERT_CONSECUTIVE_MATCHES]: 1,
  [ALERT_DURATION]: 0,
  [ALERT_FLAPPING]: false,
  [ALERT_MUTED]: false,
  [ALERT_FLAPPING_HISTORY]: [true],
  [ALERT_INSTANCE_ID]: '1',
  [ALERT_MAINTENANCE_WINDOW_IDS]: ['test-id1', 'test-id2'],
  [ALERT_MAINTENANCE_WINDOW_NAMES]: ['test-name1', 'test-name2'],
  [ALERT_PENDING_RECOVERED_COUNT]: 0,
  [ALERT_RULE_CATEGORY]: 'My test rule',
  [ALERT_RULE_CONSUMER]: 'bar',
  [ALERT_RULE_EXECUTION_UUID]: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
  [ALERT_RULE_EXECUTION_TIMESTAMP]: date,
  [ALERT_RULE_NAME]: 'rule-name',
  [ALERT_RULE_PARAMETERS]: { bar: true },
  [ALERT_RULE_PRODUCER]: 'alerts',
  [ALERT_RULE_REVISION]: 0,
  [ALERT_RULE_TYPE_ID]: 'test.rule-type',
  [ALERT_RULE_TAGS]: ['rule-', '-tags'],
  [ALERT_RULE_UUID]: '1',
  [ALERT_SEVERITY_IMPROVING]: false,
  [ALERT_SNOOZED]: false,
  [ALERT_START]: date,
  [ALERT_STATUS]: 'active',
  [ALERT_TIME_RANGE]: { gte: date },
  [ALERT_UUID]: 'uuid',
  [ALERT_WORKFLOW_STATUS]: 'open',
  [SPACE_IDS]: ['default'],
  [VERSION]: '8.9.0',
  [TAGS]: ['rule-', '-tags'],
  ...overrides,
});

const getOngoingIndexedAlertDoc = (overrides = {}) => ({
  ...omit(getNewIndexedAlertDoc(), ALERT_SEVERITY_IMPROVING),
  [EVENT_ACTION]: 'active',
  [ALERT_DURATION]: 36000000000,
  [ALERT_FLAPPING_HISTORY]: [true, false],
  [ALERT_START]: '2023-03-28T12:27:28.159Z',
  [ALERT_TIME_RANGE]: { gte: '2023-03-28T12:27:28.159Z' },
  [ALERT_PREVIOUS_ACTION_GROUP]: 'default',
  [ALERT_SNOOZED]: false,
  [ALERT_MAINTENANCE_WINDOW_IDS]: [],
  [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
  [ALERT_PENDING_RECOVERED_COUNT]: 0,
  ...overrides,
});

const getRecoveredIndexedAlertDoc = (overrides = {}) => ({
  ...getNewIndexedAlertDoc(),
  [EVENT_ACTION]: 'close',
  [ALERT_DURATION]: 36000000000,
  [ALERT_ACTION_GROUP]: 'recovered',
  [ALERT_FLAPPING_HISTORY]: [true, true],
  [ALERT_START]: '2023-03-28T12:27:28.159Z',
  [ALERT_END]: date,
  [ALERT_TIME_RANGE]: { gte: '2023-03-28T12:27:28.159Z', lte: date },
  [ALERT_STATUS]: 'recovered',
  [ALERT_CONSECUTIVE_MATCHES]: 0,
  [ALERT_PREVIOUS_ACTION_GROUP]: 'default',
  [ALERT_SEVERITY_IMPROVING]: true,
  [ALERT_MAINTENANCE_WINDOW_IDS]: [],
  [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
  [ALERT_PENDING_RECOVERED_COUNT]: 0,
  ...overrides,
});

const defaultExecutionOpts = {
  maxAlerts,
  ruleLabel: `test: rule-name`,
  flappingSettings: DEFAULT_FLAPPING_SETTINGS,
  activeAlertsFromState: {},
  recoveredAlertsFromState: {},
  startedAt: null,
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

const ruleInfo = `for test.rule-type:1 'rule-name'`;
const logTags = { tags: ['test.rule-type', '1', 'alerts-client'] };

type InnerHit = { count?: number; url?: string } & (
  | typeof fetchedAlert1
  | typeof fetchedAlert2
  | typeof fetchedAlert3
);

describe('Alerts Client', () => {
  let alertsClientParams: AlertsClientParams;
  let determineDelayedAlertsOpts: DetermineDelayedAlertsOpts;
  let logAlertsOpts: LogAlertsOpts;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(date));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  for (const useDataStreamForAlerts of [false, true]) {
    const label = useDataStreamForAlerts ? 'data streams' : 'aliases';

    describe(`using ${label} for alert indices`, () => {
      beforeEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
        logger = loggingSystemMock.createLogger();
        alertsClientParams = {
          alertingEventLogger,
          logger,
          elasticsearchClientPromise: Promise.resolve(clusterClient),
          request: fakeRequest,
          ruleType,
          maintenanceWindowsService,
          namespace: 'default',
          rule: alertRuleData,
          kibanaVersion: '8.9.0',
          spaceId: 'space1',
          isServerless: false,
          dataStreamAdapter: getDataStreamAdapter({ useDataStreamForAlerts }),
        };
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
        determineDelayedAlertsOpts = {
          ruleRunMetricsStore,
          alertDelay: 0,
        };
        logAlertsOpts = { shouldLogAlerts: false, ruleRunMetricsStore };
        clusterClient.search.mockResolvedValue({
          took: 10,
          timed_out: false,
          _shards: { failed: 0, successful: 1, total: 0, skipped: 0 },
          hits: {
            total: { relation: 'eq', value: 0 },
            hits: [],
          },
        });
        clusterClient.msearch.mockResolvedValue({
          took: 10,
          responses: [
            {
              took: 10,
              timed_out: false,
              _shards: { failed: 0, successful: 1, total: 0, skipped: 0 },
              hits: {
                total: { relation: 'eq', value: 0 },
                hits: [],
              },
            },
          ],
        });
        clusterClient.bulk.mockResponse({
          errors: true,
          took: 201,
          items: [],
        });
      });

      describe('initializeExecution()', () => {
        test('should initialize LegacyAlertsClient', async () => {
          const spy = jest
            .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
            .mockImplementation(() => mockLegacyAlertsClient);

          const alertsClient = new AlertsClient(alertsClientParams);

          await alertsClient.initializeExecution(defaultExecutionOpts);
          expect(mockLegacyAlertsClient.initializeExecution).toHaveBeenCalledWith(
            defaultExecutionOpts
          );

          spy.mockRestore();
        });

        test('should skip track alerts ruleType shouldWrite is false', async () => {
          const spy = jest
            .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
            .mockImplementation(() => mockLegacyAlertsClient);

          const alertsClient = new AlertsClient({
            ...alertsClientParams,
            ruleType: {
              ...alertsClientParams.ruleType,
              alerts: {
                context: 'test',
                mappings: { fieldMap: { field: { type: 'keyword', required: false } } },
                shouldWrite: false,
              },
            },
          });

          await alertsClient.initializeExecution(defaultExecutionOpts);
          expect(mockLegacyAlertsClient.initializeExecution).toHaveBeenCalledWith(
            defaultExecutionOpts
          );
          spy.mockRestore();
        });

        test('should query for alerts', async () => {
          clusterClient.search.mockResolvedValueOnce({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  fields: { [ALERT_RULE_EXECUTION_UUID]: ['exec-uuid-1'] },
                },
              ],
            },
          });
          const spy = jest
            .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
            .mockImplementation(() => mockLegacyAlertsClient);

          const alertsClient = new AlertsClient(alertsClientParams);

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
          });
          expect(mockLegacyAlertsClient.initializeExecution).toHaveBeenCalledWith({
            ...defaultExecutionOpts,
          });

          expect(clusterClient.search).toHaveBeenNthCalledWith(1, {
            size: 20,
            ignore_unavailable: true,
            index: useDataStreamForAlerts
              ? '.alerts-test.alerts-default'
              : '.internal.alerts-test.alerts-default-*',
            query: {
              bool: {
                must: [{ term: { [ALERT_RULE_UUID]: '1' } }],
              },
            },
            collapse: {
              field: ALERT_RULE_EXECUTION_UUID,
            },
            _source: false,
            sort: [{ [TIMESTAMP]: { order: 'desc' } }],
          });

          expect(clusterClient.search).toHaveBeenNthCalledWith(2, {
            size: 2000,
            ignore_unavailable: true,
            seq_no_primary_term: true,
            index: useDataStreamForAlerts
              ? '.alerts-test.alerts-default'
              : '.internal.alerts-test.alerts-default-*',
            query: {
              bool: {
                must: [{ term: { [ALERT_RULE_UUID]: '1' } }],
                must_not: [{ term: { [ALERT_STATUS]: ALERT_STATUS_UNTRACKED } }],
                filter: [{ terms: { [ALERT_RULE_EXECUTION_UUID]: ['exec-uuid-1'] } }],
              },
            },
          });

          spy.mockRestore();
        });

        test('should query for alerts and filter out null execution uuids', async () => {
          clusterClient.search.mockResolvedValueOnce({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  fields: { [ALERT_RULE_EXECUTION_UUID]: ['exec-uuid-1'] },
                },
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  fields: { [ALERT_RULE_EXECUTION_UUID]: [null] },
                },
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  fields: { [ALERT_RULE_EXECUTION_UUID]: null },
                },
              ],
            },
          });
          const spy = jest
            .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
            .mockImplementation(() => mockLegacyAlertsClient);

          const alertsClient = new AlertsClient(alertsClientParams);

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
          });
          expect(mockLegacyAlertsClient.initializeExecution).toHaveBeenCalledWith({
            ...defaultExecutionOpts,
          });

          expect(clusterClient.search).toHaveBeenNthCalledWith(1, {
            size: 20,
            ignore_unavailable: true,
            index: useDataStreamForAlerts
              ? '.alerts-test.alerts-default'
              : '.internal.alerts-test.alerts-default-*',
            query: {
              bool: {
                must: [{ term: { [ALERT_RULE_UUID]: '1' } }],
              },
            },
            collapse: {
              field: ALERT_RULE_EXECUTION_UUID,
            },
            _source: false,
            sort: [{ [TIMESTAMP]: { order: 'desc' } }],
          });

          expect(clusterClient.search).toHaveBeenNthCalledWith(2, {
            size: 2000,
            ignore_unavailable: true,
            seq_no_primary_term: true,
            index: useDataStreamForAlerts
              ? '.alerts-test.alerts-default'
              : '.internal.alerts-test.alerts-default-*',
            query: {
              bool: {
                must: [{ term: { [ALERT_RULE_UUID]: '1' } }],
                must_not: [{ term: { [ALERT_STATUS]: ALERT_STATUS_UNTRACKED } }],
                filter: [{ terms: { [ALERT_RULE_EXECUTION_UUID]: ['exec-uuid-1'] } }],
              },
            },
          });

          spy.mockRestore();
        });

        test('should not query for the alerts if the rule type is not a lifecycle rule', async () => {
          const alertsClient = new AlertsClient({
            ...alertsClientParams,
            ruleType: {
              ...alertsClientParams.ruleType,
              autoRecoverAlerts: false, // not a lifecycle rule
            },
          });

          await alertsClient.initializeExecution(defaultExecutionOpts);
          expect(clusterClient.search).not.toHaveBeenCalled();
        });

        test('should log an error and throw if query returns error', async () => {
          clusterClient.search.mockImplementation(() => {
            throw new Error('search failed!');
          });

          const spy = jest
            .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
            .mockImplementation(() => mockLegacyAlertsClient);

          const alertsClient = new AlertsClient(alertsClientParams);

          try {
            await alertsClient.initializeExecution(defaultExecutionOpts);
          } catch (e) {
            spy.mockRestore();
            expect(e.message).toBe(`search failed!`);
          }

          expect(mockLegacyAlertsClient.initializeExecution).toHaveBeenCalledWith(
            defaultExecutionOpts
          );

          expect(logger.error).toHaveBeenCalledWith(
            `Error searching for tracked alerts by UUID ${ruleInfo} - search failed!`,
            logTags
          );

          spy.mockRestore();
        });
      });

      describe('persistAlerts()', () => {
        test('should index new alerts with refresh: wait_for in stateful', async () => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>({
            ...alertsClientParams,
            isServerless: false,
          });

          await alertsClient.initializeExecution(defaultExecutionOpts);

          // Report 2 new alerts
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('1').scheduleActions('default');
          alertExecutorService.create('2').scheduleActions('default');

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          const { rawActiveAlerts } = alertsClient.getRawAlertInstancesForState();
          const uuid1 = rawActiveAlerts['1'].meta?.uuid;
          const uuid2 = rawActiveAlerts['2'].meta?.uuid;

          expect(clusterClient.bulk).toHaveBeenCalledWith({
            index: '.alerts-test.alerts-default',
            refresh: 'wait_for',
            require_alias: !useDataStreamForAlerts,
            body: [
              {
                create: { _id: uuid1, ...(useDataStreamForAlerts ? {} : { require_alias: true }) },
              },
              // new alert doc
              getNewIndexedAlertDoc({ [ALERT_UUID]: uuid1 }),
              {
                create: { _id: uuid2, ...(useDataStreamForAlerts ? {} : { require_alias: true }) },
              },
              // new alert doc
              getNewIndexedAlertDoc({ [ALERT_UUID]: uuid2, [ALERT_INSTANCE_ID]: '2' }),
            ],
          });
          expect(maintenanceWindowsService.getMaintenanceWindows).toHaveBeenCalledWith({
            eventLogger: alertingEventLogger,
            request: fakeRequest,
            ruleTypeCategory: 'test',
            spaceId: 'space1',
          });
        });

        test('should index new alerts with refresh: true in stateless', async () => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>({
            ...alertsClientParams,
            isServerless: true,
          });

          await alertsClient.initializeExecution(defaultExecutionOpts);

          // Report 2 new alerts
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('1').scheduleActions('default');
          alertExecutorService.create('2').scheduleActions('default');

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          const { rawActiveAlerts } = alertsClient.getRawAlertInstancesForState();
          const uuid1 = rawActiveAlerts['1'].meta?.uuid;
          const uuid2 = rawActiveAlerts['2'].meta?.uuid;

          expect(clusterClient.bulk).toHaveBeenCalledWith({
            index: '.alerts-test.alerts-default',
            refresh: true,
            require_alias: !useDataStreamForAlerts,
            body: [
              {
                create: { _id: uuid1, ...(useDataStreamForAlerts ? {} : { require_alias: true }) },
              },
              // new alert doc
              getNewIndexedAlertDoc({ [ALERT_UUID]: uuid1 }),
              {
                create: { _id: uuid2, ...(useDataStreamForAlerts ? {} : { require_alias: true }) },
              },
              // new alert doc
              getNewIndexedAlertDoc({ [ALERT_UUID]: uuid2, [ALERT_INSTANCE_ID]: '2' }),
            ],
          });
          expect(maintenanceWindowsService.getMaintenanceWindows).toHaveBeenCalledWith({
            eventLogger: alertingEventLogger,
            request: fakeRequest,
            ruleTypeCategory: 'test',
            spaceId: 'space1',
          });
        });

        test('should set alert status "delayed" if activeCount is less than the rule alertDelay', async () => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>({
            ...alertsClientParams,
            rule: { ...alertsClientParams.rule, alertDelay: 3 },
          });

          await alertsClient.initializeExecution(defaultExecutionOpts);

          // Report 1 new alerts
          const alertExecutorService = alertsClient.factory();
          const alert = alertExecutorService.create('1').scheduleActions('default');

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts({ ...determineDelayedAlertsOpts, alertDelay: 3 });

          await alertsClient.persistAlerts();

          expect(alert.isDelayed()).toBe(true);
        });

        test('should update ongoing alerts in existing index', async () => {
          clusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  _seq_no: 41,
                  _primary_term: 665,
                  _source: fetchedAlert1,
                },
              ],
            },
          });

          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              '1': trackedAlert1Raw,
            },
          });

          // Report 1 new alert and 1 active alert
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('1').scheduleActions('default');
          alertExecutorService.create('2').scheduleActions('default');

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          const { rawActiveAlerts } = alertsClient.getRawAlertInstancesForState();
          const uuid2 = rawActiveAlerts['2'].meta?.uuid;

          expect(clusterClient.bulk).toHaveBeenCalledWith({
            index: '.alerts-test.alerts-default',
            refresh: 'wait_for',
            require_alias: !useDataStreamForAlerts,
            body: [
              {
                index: {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  if_seq_no: 41,
                  if_primary_term: 665,
                  require_alias: false,
                },
              },
              // ongoing alert doc
              getOngoingIndexedAlertDoc({
                [ALERT_UUID]: 'abc',
                [ALERT_STATE_NAMESPACE]: { foo: true },
              }),
              {
                create: { _id: uuid2, ...(useDataStreamForAlerts ? {} : { require_alias: true }) },
              },
              // new alert doc
              getNewIndexedAlertDoc({ [ALERT_UUID]: uuid2, [ALERT_INSTANCE_ID]: '2' }),
            ],
          });
          expect(maintenanceWindowsService.getMaintenanceWindows).toHaveBeenCalledWith({
            eventLogger: alertingEventLogger,
            request: fakeRequest,
            ruleTypeCategory: 'test',
            spaceId: 'space1',
          });
        });

        test('should update unflattened ongoing alerts in existing index', async () => {
          clusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  _seq_no: 41,
                  _primary_term: 665,
                  _source: expandFlattenedAlert(fetchedAlert1) as InnerHit,
                },
              ],
            },
          });

          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              '1': trackedAlert1Raw,
            },
          });

          // Report 1 new alert and 1 active alert
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('1').scheduleActions('default');
          alertExecutorService.create('2').scheduleActions('default');

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          const { rawActiveAlerts } = alertsClient.getRawAlertInstancesForState();
          const uuid2 = rawActiveAlerts['2'].meta?.uuid;

          expect(clusterClient.bulk).toHaveBeenCalledWith({
            index: '.alerts-test.alerts-default',
            refresh: 'wait_for',
            require_alias: !useDataStreamForAlerts,
            body: [
              {
                index: {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  if_seq_no: 41,
                  if_primary_term: 665,
                  require_alias: false,
                },
              },
              // ongoing alert doc
              {
                event: { kind: 'signal' },
                kibana: {
                  alert: {
                    instance: { id: '1' },
                    start: '2023-03-28T12:27:28.159Z',
                    uuid: 'abc',
                  },
                },
                [TIMESTAMP]: date,
                [ALERT_RULE_EXECUTION_TIMESTAMP]: date,
                [EVENT_ACTION]: 'active',
                [ALERT_ACTION_GROUP]: 'default',
                [ALERT_CONSECUTIVE_MATCHES]: 1,
                [ALERT_DURATION]: 36000000000,
                [ALERT_FLAPPING]: false,
                [ALERT_FLAPPING_HISTORY]: [true, false],
                [ALERT_MAINTENANCE_WINDOW_IDS]: [],
                [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
                [ALERT_MUTED]: false,
                [ALERT_PENDING_RECOVERED_COUNT]: 0,
                [ALERT_PREVIOUS_ACTION_GROUP]: 'default',
                [ALERT_RULE_CATEGORY]: 'My test rule',
                [ALERT_RULE_CONSUMER]: 'bar',
                [ALERT_RULE_EXECUTION_UUID]: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
                [ALERT_RULE_NAME]: 'rule-name',
                [ALERT_RULE_PARAMETERS]: { bar: true },
                [ALERT_RULE_PRODUCER]: 'alerts',
                [ALERT_RULE_REVISION]: 0,
                [ALERT_RULE_TYPE_ID]: 'test.rule-type',
                [ALERT_RULE_TAGS]: ['rule-', '-tags'],
                [ALERT_RULE_UUID]: '1',
                [ALERT_SNOOZED]: false,
                [ALERT_STATUS]: 'active',
                [ALERT_TIME_RANGE]: { gte: '2023-03-28T12:27:28.159Z' },
                [ALERT_WORKFLOW_STATUS]: 'open',
                [SPACE_IDS]: ['default'],
                [VERSION]: '8.9.0',
                [TAGS]: ['rule-', '-tags'],
                [ALERT_STATE_NAMESPACE]: { foo: true },
              },
              {
                create: { _id: uuid2, ...(useDataStreamForAlerts ? {} : { require_alias: true }) },
              },
              // new alert doc
              getNewIndexedAlertDoc({ [ALERT_UUID]: uuid2, [ALERT_INSTANCE_ID]: '2' }),
            ],
          });
          expect(maintenanceWindowsService.getMaintenanceWindows).toHaveBeenCalledWith({
            eventLogger: alertingEventLogger,
            request: fakeRequest,
            ruleTypeCategory: 'test',
            spaceId: 'space1',
          });
        });

        test('should not update ongoing alerts in existing index when they are not in the processed alerts', async () => {
          const activeAlert = {
            state: { foo: true, start: '2023-03-28T12:27:28.159Z', duration: '36000000000000' },
            meta: {
              flapping: false,
              flappingHistory: [true, false],
              maintenanceWindowIds: [],
              lastScheduledActions: { group: 'default', date: new Date().toISOString() },
              uuid: 'abc',
            },
          };

          const activeAlertObj = new Alert<{}, {}, 'default'>('1', activeAlert);
          activeAlertObj.scheduleActions('default', {});
          const spy = jest
            .spyOn(LegacyAlertsClient.prototype, 'getProcessedAlerts')
            .mockReturnValueOnce({
              '1': activeAlertObj, // return only the first (tracked) alert
            })
            .mockReturnValueOnce({})
            .mockReturnValueOnce({});

          clusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  _source: fetchedAlert1,
                },
              ],
            },
          });

          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              '1': activeAlert,
            },
          });

          // Report 1 new alert and 1 active alert
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('1').scheduleActions('default');
          alertExecutorService.create('2').scheduleActions('default'); // will be skipped as getProcessedAlerts does not return it

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          expect(spy).toHaveBeenCalledTimes(4);
          expect(spy).toHaveBeenNthCalledWith(1, 'active');
          expect(spy).toHaveBeenNthCalledWith(2, 'delayed');
          expect(spy).toHaveBeenNthCalledWith(3, 'recovered');
          expect(spy).toHaveBeenNthCalledWith(4, 'delayed');

          expect(logger.error).toHaveBeenCalledWith(
            `Error writing alert(2) to .alerts-test.alerts-default - alert(2) doesn't exist in active or delayed alerts ${ruleInfo}.`,
            logTags
          );
          spy.mockRestore();

          expect(clusterClient.bulk).toHaveBeenCalledWith({
            index: '.alerts-test.alerts-default',
            refresh: 'wait_for',
            require_alias: !useDataStreamForAlerts,
            body: [
              {
                create: {
                  _id: 'abc',
                  ...(useDataStreamForAlerts ? {} : { require_alias: true }),
                },
              },
              // ongoing alert doc
              getOngoingIndexedAlertDoc({
                [ALERT_UUID]: 'abc',
                [ALERT_CONSECUTIVE_MATCHES]: 0,
                [ALERT_STATE_NAMESPACE]: { foo: true },
              }),
            ],
          });
          expect(maintenanceWindowsService.getMaintenanceWindows).toHaveBeenCalledWith({
            eventLogger: alertingEventLogger,
            request: fakeRequest,
            ruleTypeCategory: 'test',
            spaceId: 'space1',
          });
        });

        test('should recover recovered alerts in existing index', async () => {
          clusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  _seq_no: 41,
                  _primary_term: 665,
                  _source: fetchedAlert1,
                },
                {
                  _id: 'def',
                  _index: '.internal.alerts-test.alerts-default-000002',
                  _seq_no: 42,
                  _primary_term: 666,
                  _source: fetchedAlert2,
                },
              ],
            },
          });

          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              '1': trackedAlert1Raw,
              '2': trackedAlert2Raw,
            },
          });

          // Report 1 new alert and 1 active alert, recover 1 alert
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('2').scheduleActions('default');
          alertExecutorService.create('3').scheduleActions('default');

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          const { rawActiveAlerts } = alertsClient.getRawAlertInstancesForState();
          const uuid3 = rawActiveAlerts['3'].meta?.uuid;

          expect(clusterClient.bulk).toHaveBeenCalledWith({
            index: '.alerts-test.alerts-default',
            refresh: 'wait_for',
            require_alias: !useDataStreamForAlerts,
            body: [
              {
                index: {
                  _id: 'def',
                  _index: '.internal.alerts-test.alerts-default-000002',
                  if_seq_no: 42,
                  if_primary_term: 666,
                  require_alias: false,
                },
              },
              // ongoing alert doc
              getOngoingIndexedAlertDoc({
                [ALERT_UUID]: 'def',
                [ALERT_INSTANCE_ID]: '2',
                [ALERT_FLAPPING_HISTORY]: [true, false, false, false],
                [ALERT_DURATION]: 72000000000,
                [ALERT_START]: '2023-03-28T02:27:28.159Z',
                [ALERT_TIME_RANGE]: { gte: '2023-03-28T02:27:28.159Z' },
                [ALERT_STATE_NAMESPACE]: { foo: true },
              }),
              {
                create: { _id: uuid3, ...(useDataStreamForAlerts ? {} : { require_alias: true }) },
              },
              // new alert doc
              getNewIndexedAlertDoc({
                [ALERT_UUID]: uuid3,
                [ALERT_INSTANCE_ID]: '3',
              }),
              {
                index: {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  if_seq_no: 41,
                  if_primary_term: 665,
                  require_alias: false,
                },
              },
              // recovered alert doc
              getRecoveredIndexedAlertDoc({
                [ALERT_UUID]: 'abc',
                [ALERT_STATE_NAMESPACE]: { foo: true },
              }),
            ],
          });
          expect(maintenanceWindowsService.getMaintenanceWindows).toHaveBeenCalledWith({
            eventLogger: alertingEventLogger,
            request: fakeRequest,
            ruleTypeCategory: 'test',
            spaceId: 'space1',
          });
        });

        test('should recover unflattened recovered alerts in existing index', async () => {
          clusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  _seq_no: 41,
                  _primary_term: 665,
                  _source: expandFlattenedAlert(fetchedAlert1) as InnerHit,
                },
                {
                  _id: 'def',
                  _index: '.internal.alerts-test.alerts-default-000002',
                  _seq_no: 42,
                  _primary_term: 666,
                  _source: expandFlattenedAlert(fetchedAlert2) as InnerHit,
                },
              ],
            },
          });

          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              '1': trackedAlert1Raw,
              '2': trackedAlert2Raw,
            },
          });

          // Report 1 new alert and 1 active alert, recover 1 alert
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('2').scheduleActions('default');
          alertExecutorService.create('3').scheduleActions('default');

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          const { rawActiveAlerts } = alertsClient.getRawAlertInstancesForState();
          const uuid3 = rawActiveAlerts['3'].meta?.uuid;

          expect(clusterClient.bulk).toHaveBeenCalledWith({
            index: '.alerts-test.alerts-default',
            refresh: 'wait_for',
            require_alias: !useDataStreamForAlerts,
            body: [
              {
                index: {
                  _id: 'def',
                  _index: '.internal.alerts-test.alerts-default-000002',
                  if_seq_no: 42,
                  if_primary_term: 666,
                  require_alias: false,
                },
              },
              // ongoing alert doc
              {
                event: { kind: 'signal' },
                kibana: {
                  alert: {
                    instance: { id: '2' },
                    start: '2023-03-28T02:27:28.159Z',
                    uuid: 'def',
                  },
                },
                [TIMESTAMP]: date,
                [ALERT_RULE_EXECUTION_TIMESTAMP]: date,
                [EVENT_ACTION]: 'active',
                [ALERT_ACTION_GROUP]: 'default',
                [ALERT_CONSECUTIVE_MATCHES]: 1,
                [ALERT_DURATION]: 72000000000,
                [ALERT_FLAPPING]: false,
                [ALERT_FLAPPING_HISTORY]: [true, false, false, false],
                [ALERT_MAINTENANCE_WINDOW_IDS]: [],
                [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
                [ALERT_MUTED]: false,
                [ALERT_PENDING_RECOVERED_COUNT]: 0,
                [ALERT_PREVIOUS_ACTION_GROUP]: 'default',
                [ALERT_RULE_CATEGORY]: 'My test rule',
                [ALERT_RULE_CONSUMER]: 'bar',
                [ALERT_RULE_EXECUTION_UUID]: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
                [ALERT_RULE_NAME]: 'rule-name',
                [ALERT_RULE_PARAMETERS]: { bar: true },
                [ALERT_RULE_PRODUCER]: 'alerts',
                [ALERT_RULE_REVISION]: 0,
                [ALERT_RULE_TYPE_ID]: 'test.rule-type',
                [ALERT_RULE_TAGS]: ['rule-', '-tags'],
                [ALERT_RULE_UUID]: '1',
                [ALERT_SNOOZED]: false,
                [ALERT_STATUS]: 'active',
                [ALERT_TIME_RANGE]: { gte: '2023-03-28T02:27:28.159Z' },
                [ALERT_WORKFLOW_STATUS]: 'open',
                [SPACE_IDS]: ['default'],
                [VERSION]: '8.9.0',
                [TAGS]: ['rule-', '-tags'],
                [ALERT_STATE_NAMESPACE]: { foo: true },
              },
              {
                create: { _id: uuid3, ...(useDataStreamForAlerts ? {} : { require_alias: true }) },
              },
              // new alert doc
              getNewIndexedAlertDoc({ [ALERT_UUID]: uuid3, [ALERT_INSTANCE_ID]: '3' }),
              {
                index: {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  if_seq_no: 41,
                  if_primary_term: 665,
                  require_alias: false,
                },
              },
              // recovered alert doc
              {
                event: { kind: 'signal' },
                kibana: {
                  alert: {
                    instance: { id: '1' },
                    rule: omit(rule, 'execution'),
                    uuid: 'abc',
                  },
                },
                [TIMESTAMP]: date,
                [ALERT_RULE_EXECUTION_TIMESTAMP]: date,
                [ALERT_RULE_EXECUTION_UUID]: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
                [EVENT_ACTION]: 'close',
                [ALERT_ACTION_GROUP]: 'recovered',
                [ALERT_CONSECUTIVE_MATCHES]: 0,
                [ALERT_DURATION]: 36000000000,
                [ALERT_FLAPPING]: false,
                [ALERT_FLAPPING_HISTORY]: [true, true],
                [ALERT_MAINTENANCE_WINDOW_IDS]: [],
                [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
                [ALERT_MUTED]: false,
                [ALERT_PENDING_RECOVERED_COUNT]: 0,
                [ALERT_PREVIOUS_ACTION_GROUP]: 'default',
                [ALERT_SEVERITY_IMPROVING]: true,
                [ALERT_SNOOZED]: false,
                [ALERT_START]: '2023-03-28T12:27:28.159Z',
                [ALERT_END]: date,
                [ALERT_STATUS]: 'recovered',
                [ALERT_TIME_RANGE]: { gte: '2023-03-28T12:27:28.159Z', lte: date },
                [ALERT_WORKFLOW_STATUS]: 'open',
                [SPACE_IDS]: ['default'],
                [VERSION]: '8.9.0',
                [TAGS]: ['rule-', '-tags'],
                [ALERT_STATE_NAMESPACE]: {
                  foo: true,
                },
              },
            ],
          });
          expect(maintenanceWindowsService.getMaintenanceWindows).toHaveBeenCalledWith({
            eventLogger: alertingEventLogger,
            request: fakeRequest,
            ruleTypeCategory: 'test',
            spaceId: 'space1',
          });
        });

        test('should use startedAt time if provided', async () => {
          clusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  _seq_no: 41,
                  _primary_term: 665,
                  _source: fetchedAlert1,
                },
                {
                  _id: 'def',
                  _index: '.internal.alerts-test.alerts-default-000002',
                  _seq_no: 42,
                  _primary_term: 666,
                  _source: fetchedAlert2,
                },
              ],
            },
          });

          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              '1': trackedAlert1Raw,
              '2': trackedAlert2Raw,
            },
            startedAt: new Date(startedAtDate),
          });

          // Report 1 new alert and 1 active alert, recover 1 alert
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('2').scheduleActions('default');
          alertExecutorService.create('3').scheduleActions('default');

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          const { rawActiveAlerts } = alertsClient.getRawAlertInstancesForState();
          const uuid3 = rawActiveAlerts['3'].meta?.uuid;

          expect(clusterClient.bulk).toHaveBeenCalledWith({
            index: '.alerts-test.alerts-default',
            refresh: 'wait_for',
            require_alias: !useDataStreamForAlerts,
            body: [
              {
                index: {
                  _id: 'def',
                  _index: '.internal.alerts-test.alerts-default-000002',
                  if_seq_no: 42,
                  if_primary_term: 666,
                  require_alias: false,
                },
              },
              // ongoing alert doc
              getOngoingIndexedAlertDoc({
                [TIMESTAMP]: startedAtDate,
                [ALERT_RULE_EXECUTION_TIMESTAMP]: startedAtDate,
                [ALERT_UUID]: 'def',
                [ALERT_INSTANCE_ID]: '2',
                [ALERT_FLAPPING_HISTORY]: [true, false, false, false],
                [ALERT_DURATION]: 37951841000,
                [ALERT_START]: '2023-03-28T02:27:28.159Z',
                [ALERT_TIME_RANGE]: { gte: '2023-03-28T02:27:28.159Z' },
                [ALERT_STATE_NAMESPACE]: {
                  foo: true,
                },
              }),
              {
                create: { _id: uuid3, ...(useDataStreamForAlerts ? {} : { require_alias: true }) },
              },
              // new alert doc
              getNewIndexedAlertDoc({
                [TIMESTAMP]: startedAtDate,
                [ALERT_RULE_EXECUTION_TIMESTAMP]: startedAtDate,
                [ALERT_UUID]: uuid3,
                [ALERT_INSTANCE_ID]: '3',
                [ALERT_START]: startedAtDate,
                [ALERT_TIME_RANGE]: { gte: startedAtDate },
              }),
              {
                index: {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  if_seq_no: 41,
                  if_primary_term: 665,
                  require_alias: false,
                },
              },
              // recovered alert doc
              getRecoveredIndexedAlertDoc({
                [TIMESTAMP]: startedAtDate,
                [ALERT_RULE_EXECUTION_TIMESTAMP]: startedAtDate,
                [ALERT_DURATION]: 1951841000,
                [ALERT_UUID]: 'abc',
                [ALERT_END]: startedAtDate,
                [ALERT_TIME_RANGE]: { gte: '2023-03-28T12:27:28.159Z', lte: startedAtDate },
                [ALERT_STATE_NAMESPACE]: {
                  foo: true,
                },
              }),
            ],
          });
          expect(maintenanceWindowsService.getMaintenanceWindows).toHaveBeenCalledWith({
            eventLogger: alertingEventLogger,
            request: fakeRequest,
            ruleTypeCategory: 'test',
            spaceId: 'space1',
          });
        });

        test('should use runTimestamp time if provided', async () => {
          const runTimestamp = '2023-10-01T00:00:00.000Z';

          clusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  _seq_no: 41,
                  _primary_term: 665,
                  _source: fetchedAlert1,
                },
                {
                  _id: 'def',
                  _index: '.internal.alerts-test.alerts-default-000002',
                  _seq_no: 42,
                  _primary_term: 666,
                  _source: fetchedAlert2,
                },
              ],
            },
          });

          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              '1': trackedAlert1Raw,
              '2': trackedAlert2Raw,
            },
            runTimestamp: new Date(runTimestamp),
            startedAt: new Date(startedAtDate),
          });

          // Report 1 new alert and 1 active alert, recover 1 alert
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('2').scheduleActions('default');
          alertExecutorService.create('3').scheduleActions('default');

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          const { rawActiveAlerts } = alertsClient.getRawAlertInstancesForState();
          const uuid3 = rawActiveAlerts['3'].meta?.uuid;

          expect(clusterClient.bulk).toHaveBeenCalledWith({
            index: '.alerts-test.alerts-default',
            refresh: 'wait_for',
            require_alias: !useDataStreamForAlerts,
            body: [
              {
                index: {
                  _id: 'def',
                  _index: '.internal.alerts-test.alerts-default-000002',
                  if_seq_no: 42,
                  if_primary_term: 666,
                  require_alias: false,
                },
              },
              // ongoing alert doc
              getOngoingIndexedAlertDoc({
                [TIMESTAMP]: startedAtDate,
                [ALERT_RULE_EXECUTION_TIMESTAMP]: runTimestamp,
                [ALERT_UUID]: 'def',
                [ALERT_INSTANCE_ID]: '2',
                [ALERT_FLAPPING_HISTORY]: [true, false, false, false],
                [ALERT_DURATION]: 37951841000,
                [ALERT_START]: '2023-03-28T02:27:28.159Z',
                [ALERT_TIME_RANGE]: { gte: '2023-03-28T02:27:28.159Z' },
                [ALERT_STATE_NAMESPACE]: {
                  foo: true,
                },
              }),
              {
                create: { _id: uuid3, ...(useDataStreamForAlerts ? {} : { require_alias: true }) },
              },
              // new alert doc
              getNewIndexedAlertDoc({
                [TIMESTAMP]: startedAtDate,
                [ALERT_RULE_EXECUTION_TIMESTAMP]: runTimestamp,
                [ALERT_UUID]: uuid3,
                [ALERT_INSTANCE_ID]: '3',
                [ALERT_START]: startedAtDate,
                [ALERT_TIME_RANGE]: { gte: startedAtDate },
              }),
              {
                index: {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  if_seq_no: 41,
                  if_primary_term: 665,
                  require_alias: false,
                },
              },
              // recovered alert doc
              getRecoveredIndexedAlertDoc({
                [TIMESTAMP]: startedAtDate,
                [ALERT_RULE_EXECUTION_TIMESTAMP]: runTimestamp,
                [ALERT_DURATION]: 1951841000,
                [ALERT_UUID]: 'abc',
                [ALERT_END]: startedAtDate,
                [ALERT_TIME_RANGE]: { gte: '2023-03-28T12:27:28.159Z', lte: startedAtDate },
                [ALERT_STATE_NAMESPACE]: {
                  foo: true,
                },
              }),
            ],
          });
          expect(maintenanceWindowsService.getMaintenanceWindows).toHaveBeenCalledWith({
            eventLogger: alertingEventLogger,
            request: fakeRequest,
            ruleTypeCategory: 'test',
            spaceId: 'space1',
          });
        });

        test('should not try to index if no alerts', async () => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution(defaultExecutionOpts);

          // Report no alerts

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          expect(clusterClient.bulk).not.toHaveBeenCalled();
          expect(maintenanceWindowsService.getMaintenanceWindows).not.toHaveBeenCalled();
        });

        test('should log if bulk indexing fails for some alerts', async () => {
          clusterClient.bulk.mockResponseOnce({
            took: 1,
            errors: true,
            items: [
              {
                index: {
                  _index: '.internal.alerts-test.alerts-default-000001',
                  status: 400,
                  error: {
                    type: 'action_request_validation_exception',
                    reason: 'Validation Failed: 1: index is missing;2: type is missing;',
                  },
                },
              },
              {
                index: {
                  _index: '.internal.alerts-test.alerts-default-000001',
                  _id: '7',
                  status: 404,
                  error: {
                    type: 'mapper_parsing_exception',
                    reason:
                      "failed to parse field [process.command_line] of type [wildcard] in document with id 'f0c9805be95fedbc3c99c663f7f02cc15826c122'. Preview of field's value: 'we don't want this field value to be echoed'",
                    caused_by: {
                      type: 'illegal_state_exception',
                      reason: "Can't get text on a START_OBJECT at 1:3845",
                    },
                  },
                },
              },
              {
                index: {
                  _index: '.internal.alerts-test.alerts-default-000002',
                  _id: '1',
                  _version: 1,
                  result: 'created',
                  _shards: { total: 2, successful: 1, failed: 0 },
                  status: 201,
                  _seq_no: 0,
                  _primary_term: 1,
                },
              },
            ],
          });
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution(defaultExecutionOpts);

          // Report 2 new alerts
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('1').scheduleActions('default');
          alertExecutorService.create('2').scheduleActions('default');

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          expect(clusterClient.bulk).toHaveBeenCalled();
          expect(logger.error).toHaveBeenCalledWith(
            `Error writing alerts ${ruleInfo}: 1 successful, 0 conflicts, 2 errors: Validation Failed: 1: index is missing;2: type is missing;; failed to parse field [process.command_line] of type [wildcard] in document with id 'f0c9805be95fedbc3c99c663f7f02cc15826c122'.`,
            { tags: ['test.rule-type', '1', 'resolve-alert-conflicts'] }
          );
          expect(maintenanceWindowsService.getMaintenanceWindows).toHaveBeenCalledWith({
            eventLogger: alertingEventLogger,
            request: fakeRequest,
            ruleTypeCategory: 'test',
            spaceId: 'space1',
          });
        });

        test('should log if alert to update belongs to a non-standard index', async () => {
          clusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [
                {
                  _id: 'abc',
                  _index: 'partial-.internal.alerts-test.alerts-default-000001',
                  _seq_no: 41,
                  _primary_term: 665,
                  _source: fetchedAlert1,
                },
                {
                  _id: 'def',
                  _index: '.internal.alerts-test.alerts-default-000002',
                  _seq_no: 42,
                  _primary_term: 666,
                  _source: fetchedAlert2,
                },
              ],
            },
          });

          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              '1': trackedAlert1Raw,
              '2': trackedAlert2Raw,
            },
          });

          // Report 2 active alerts
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('1').scheduleActions('default');
          alertExecutorService.create('2').scheduleActions('default');

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          expect(clusterClient.bulk).toHaveBeenCalledWith({
            index: '.alerts-test.alerts-default',
            refresh: 'wait_for',
            require_alias: !useDataStreamForAlerts,
            body: [
              {
                index: {
                  _id: 'def',
                  _index: '.internal.alerts-test.alerts-default-000002',
                  if_seq_no: 42,
                  if_primary_term: 666,
                  require_alias: false,
                },
              },
              // ongoing alert doc
              getOngoingIndexedAlertDoc({
                [ALERT_UUID]: 'def',
                [ALERT_INSTANCE_ID]: '2',
                [ALERT_DURATION]: 72000000000,
                [ALERT_FLAPPING_HISTORY]: [true, false, false, false],
                [ALERT_START]: '2023-03-28T02:27:28.159Z',
                [ALERT_TIME_RANGE]: { gte: '2023-03-28T02:27:28.159Z' },
                [ALERT_STATE_NAMESPACE]: {
                  foo: true,
                },
              }),
            ],
          });

          expect(logger.warn).toHaveBeenCalledWith(
            `Could not update alert abc in partial-.internal.alerts-test.alerts-default-000001. Partial and restored alert indices are not supported ${ruleInfo}.`,
            logTags
          );

          expect(maintenanceWindowsService.getMaintenanceWindows).toHaveBeenCalledWith({
            eventLogger: alertingEventLogger,
            request: fakeRequest,
            ruleTypeCategory: 'test',
            spaceId: 'space1',
          });
        });

        test('should log and swallow error if bulk indexing throws error', async () => {
          clusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 2 },
              hits: [],
            },
          });

          clusterClient.bulk.mockImplementation(() => {
            throw new Error('fail');
          });
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution(defaultExecutionOpts);

          // Report 2 new alerts
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('1').scheduleActions('default');
          alertExecutorService.create('2').scheduleActions('default');

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          try {
            await alertsClient.persistAlerts();
          } catch (e) {
            expect(e.message).toBe(`fail`);
          }

          expect(clusterClient.bulk).toHaveBeenCalled();
          expect(logger.error).toHaveBeenCalledWith(
            `Error writing 2 alerts to .alerts-test.alerts-default ${ruleInfo} - fail`,
            logTags
          );

          expect(maintenanceWindowsService.getMaintenanceWindows).toHaveBeenCalledWith({
            eventLogger: alertingEventLogger,
            request: fakeRequest,
            ruleTypeCategory: 'test',
            spaceId: 'space1',
          });
        });

        test('should not persist alerts if shouldWrite is false', async () => {
          alertsClientParams = {
            alertingEventLogger,
            logger,
            elasticsearchClientPromise: Promise.resolve(clusterClient),
            maintenanceWindowsService,
            ruleType: {
              ...ruleType,
              alerts: {
                ...ruleType.alerts!,
                shouldWrite: false,
              },
            },
            isServerless: false,
            request: fakeRequest,
            namespace: 'default',
            rule: alertRuleData,
            kibanaVersion: '8.9.0',
            dataStreamAdapter: getDataStreamAdapter({ useDataStreamForAlerts }),
            spaceId: 'space1',
          };
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.persistAlerts();

          expect(logger.debug).toHaveBeenCalledWith(
            `Resources registered and installed for test context but "shouldWrite" is set to false ${ruleInfo}.`,
            logTags
          );
          expect(clusterClient.bulk).not.toHaveBeenCalled();
          expect(maintenanceWindowsService.getMaintenanceWindows).not.toHaveBeenCalled();
        });

        test('should throw an error in case of cluster_block_exception', async () => {
          clusterClient.bulk.mockResponseOnce({
            errors: true,
            took: 201,
            items: [
              {
                index: {
                  _index: '.internal.alerts-default.alerts-default-000001',
                  _id: '933de4e7-6f99-4df9-b66d-d34b7670d471',
                  status: 403,
                  error: {
                    type: 'cluster_block_exception',
                    reason:
                      'index [.internal.alerts-default.alerts-default-000001] blocked by: [FORBIDDEN/8/index write (api)];',
                  },
                },
              },
            ],
          });

          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution(defaultExecutionOpts);

          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('1').scheduleActions('default');

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await expect(alertsClient.persistAlerts()).rejects.toThrowError(
            'index [.internal.alerts-default.alerts-default-000001] blocked by: [FORBIDDEN/8/index write (api)];'
          );
        });
      });

      describe('getBuiltActiveAlertDataByInstanceId()', () => {
        test('returns undefined before persistAlerts() has been called', async () => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );
          await alertsClient.initializeExecution(defaultExecutionOpts);
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('1').scheduleActions('default');
          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);

          expect(alertsClient.getBuiltActiveAlertDataByInstanceId('1')).toBeUndefined();
        });

        test('returns built alert document by instance ID after persistAlerts()', async () => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );
          await alertsClient.initializeExecution(defaultExecutionOpts);
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('1').scheduleActions('default');
          alertExecutorService.create('2').scheduleActions('default');
          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          const doc1 = alertsClient.getBuiltActiveAlertDataByInstanceId('1');
          const doc2 = alertsClient.getBuiltActiveAlertDataByInstanceId('2');

          expect(doc1).toEqual(expect.objectContaining({ [ALERT_INSTANCE_ID]: '1' }));
          expect(doc2).toEqual(expect.objectContaining({ [ALERT_INSTANCE_ID]: '2' }));
        });

        test('returns undefined for an instance ID not present in the built alerts', async () => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );
          await alertsClient.initializeExecution(defaultExecutionOpts);
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('1').scheduleActions('default');
          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          expect(alertsClient.getBuiltActiveAlertDataByInstanceId('unknown-id')).toBeUndefined();
        });

        test('does not cache recovered alerts', async () => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );
          // Seed a tracked ongoing alert so it can recover this run
          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              '1': {
                state: {},
                meta: {
                  uuid: 'uuid-1',
                  flappingHistory: [],
                  flapping: false,
                  pendingRecoveredCount: 0,
                  activeCount: 1,
                },
              },
            },
          });
          // Do not schedule any actions → alert '1' recovers
          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          // Recovered alerts are not in the cache — only active alerts matter for
          // condition-based snooze evaluation.
          expect(alertsClient.getBuiltActiveAlertDataByInstanceId('1')).toBeUndefined();
        });

        test('caches only active alert when both active and recovered alerts exist in the same execution', async () => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );
          // Seed alert '1' as tracked so it can recover, alert '2' will be new/active
          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              '1': {
                state: {},
                meta: {
                  uuid: 'uuid-1',
                  flappingHistory: [],
                  flapping: false,
                  pendingRecoveredCount: 0,
                  activeCount: 1,
                },
              },
            },
          });
          // '1' is not re-scheduled → it recovers; '2' fires for the first time
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('2').scheduleActions('default');
          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          // '1' is recovered — must not be in the cache
          expect(alertsClient.getBuiltActiveAlertDataByInstanceId('1')).toBeUndefined();
          // '2' is active — must be in the cache
          expect(alertsClient.getBuiltActiveAlertDataByInstanceId('2')).toBeDefined();
        });

        test('cache is cleared and repopulated on each persistAlerts() call', async () => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );
          await alertsClient.initializeExecution(defaultExecutionOpts);
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('1').scheduleActions('default');
          alertExecutorService.create('2').scheduleActions('default');
          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();
          expect(alertsClient.getBuiltActiveAlertDataByInstanceId('1')).toBeDefined();
          expect(alertsClient.getBuiltActiveAlertDataByInstanceId('2')).toBeDefined();

          // Simulate a second execution where the cache is reset
          await alertsClient.persistAlerts();
          // Cache still has both (same alerts were re-built)
          expect(alertsClient.getBuiltActiveAlertDataByInstanceId('1')).toBeDefined();
          expect(alertsClient.getBuiltActiveAlertDataByInstanceId('2')).toBeDefined();
        });
      });

      describe('clearSnoozedStatusForAlerts()', () => {
        const snoozedInstanceId = '1';
        const snoozedRuleData = {
          ...alertRuleData,
          snoozedInstances: [
            {
              instanceId: snoozedInstanceId,
              snoozedAt: '2024-01-01T00:00:00.000Z',
              snoozedBy: 'test_user',
            },
          ],
        };

        const setupAndPersist = async (ruleData = snoozedRuleData) => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>({
            ...alertsClientParams,
            rule: ruleData,
          });
          await alertsClient.initializeExecution(defaultExecutionOpts);
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create(snoozedInstanceId).scheduleActions('default');
          alertExecutorService.create('2').scheduleActions('default');
          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);
          await alertsClient.persistAlerts();
          return alertsClient;
        };

        test('calls updateByQuery to set kibana.alert.snoozed=false for condition-expired instances', async () => {
          clusterClient.updateByQuery.mockResolvedValueOnce({
            failures: [],
            updated: 1,
            total: 1,
          });
          const alertsClient = await setupAndPersist();

          const doc = alertsClient.getBuiltActiveAlertDataByInstanceId(snoozedInstanceId);
          expect(doc).toBeDefined();
          expect(doc![ALERT_SNOOZED]).toBe(true);

          const uuid = doc![ALERT_UUID] as string;
          await alertsClient.clearSnoozedStatusForAlerts([snoozedInstanceId]);

          expect(clusterClient.updateByQuery).toHaveBeenCalledWith({
            conflicts: 'proceed',
            index: '.alerts-test.alerts-default',
            query: { terms: { _id: [uuid] } },
            refresh: true,
            script: {
              lang: 'painless',
              source: `ctx._source['${ALERT_SNOOZED}'] = false;`,
            },
          });
        });

        test('updates the in-memory cache to reflect the cleared snooze status', async () => {
          clusterClient.updateByQuery.mockResolvedValueOnce({
            failures: [],
            updated: 1,
            total: 1,
          });
          const alertsClient = await setupAndPersist();

          expect(
            alertsClient.getBuiltActiveAlertDataByInstanceId(snoozedInstanceId)![ALERT_SNOOZED]
          ).toBe(true);

          await alertsClient.clearSnoozedStatusForAlerts([snoozedInstanceId]);

          expect(
            alertsClient.getBuiltActiveAlertDataByInstanceId(snoozedInstanceId)![ALERT_SNOOZED]
          ).toBe(false);
        });

        test('does nothing when conditionExpiredInstanceIds is empty', async () => {
          const alertsClient = await setupAndPersist();

          await alertsClient.clearSnoozedStatusForAlerts([]);

          expect(clusterClient.updateByQuery).not.toHaveBeenCalled();
        });

        test('does nothing when ruleType.alerts.shouldWrite is false', async () => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>({
            ...alertsClientParams,
            rule: snoozedRuleData,
            ruleType: { ...ruleType, alerts: { ...ruleType.alerts!, shouldWrite: false } },
          });
          await alertsClient.initializeExecution(defaultExecutionOpts);
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create(snoozedInstanceId).scheduleActions('default');
          await alertsClient.processAlerts();
          // persistAlerts() short-circuits when shouldWrite is false, so cache is empty
          await alertsClient.persistAlerts();

          await alertsClient.clearSnoozedStatusForAlerts([snoozedInstanceId]);

          expect(clusterClient.updateByQuery).not.toHaveBeenCalled();
        });

        test('skips instance IDs not present in the built alert cache', async () => {
          clusterClient.updateByQuery.mockResolvedValueOnce({
            failures: [],
            updated: 1,
            total: 1,
          });
          const alertsClient = await setupAndPersist();

          // 'unknown-id' was never built, 'snoozedInstanceId' was
          await alertsClient.clearSnoozedStatusForAlerts(['unknown-id', snoozedInstanceId]);

          const callArgs = clusterClient.updateByQuery.mock.calls[0][0] as unknown as {
            query: { terms: { _id: string[] } };
          };
          // Only the known instance's UUID should be in the query
          expect(callArgs.query.terms._id).toHaveLength(1);
        });

        test('does nothing when no cached instance matches any of the provided IDs', async () => {
          const alertsClient = await setupAndPersist();

          await alertsClient.clearSnoozedStatusForAlerts(['unknown-id-1', 'unknown-id-2']);

          expect(clusterClient.updateByQuery).not.toHaveBeenCalled();
        });

        test('logs error and swallows when updateByQuery fails', async () => {
          clusterClient.updateByQuery.mockRejectedValueOnce(new Error('ES unavailable'));
          const alertsClient = await setupAndPersist();

          await expect(
            alertsClient.clearSnoozedStatusForAlerts([snoozedInstanceId])
          ).resolves.toBeUndefined();

          expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Error clearing snoozed status for condition-expired alerts'),
            logTags
          );
        });
      });

      describe('updatePersistedAlerts', () => {
        test('should update the persistent alerts successfully', async () => {
          clusterClient.updateByQuery.mockResponseOnce({
            failures: [],
            updated: 0,
            total: 1,
          });
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>({
            ...alertsClientParams,
            isServerless: false,
          });

          await alertsClient.initializeExecution(defaultExecutionOpts);

          // Report 2 new alerts
          const alertExecutorService = alertsClient.factory();
          alertExecutorService
            .create('1')
            .scheduleActions('default')
            .updateLastScheduledActions('default');
          alertExecutorService
            .create('2')
            .scheduleActions('default')
            .updateLastScheduledActions('default');

          await alertsClient.processAlerts();
          await alertsClient.persistAlerts();

          const { rawActiveAlerts } = alertsClient.getRawAlertInstancesForState();

          const uuid1 = rawActiveAlerts['1'].meta!.uuid!;
          const uuid2 = rawActiveAlerts['2'].meta!.uuid!;

          await alertsClient.updatePersistedAlerts({
            alertsToUpdateWithLastScheduledActions:
              alertsClient.getAlertsToUpdateWithLastScheduledActions(),
            alertsToUpdateWithMaintenanceWindows: {},
          });

          expect(clusterClient.updateByQuery).toHaveBeenCalledTimes(1);

          expect(clusterClient.updateByQuery).toHaveBeenCalledWith({
            conflicts: 'proceed',
            index: '.alerts-test.alerts-default',
            query: {
              terms: {
                _id: [uuid1, uuid2],
              },
            },
            script: {
              lang: 'painless',
              params: {
                toMaintenanceWindows: {},
                toScheduledAction: {
                  [uuid1]: {
                    date: '2023-03-28T22:27:28.159Z',
                    group: 'default',
                  },
                  [uuid2]: {
                    date: '2023-03-28T22:27:28.159Z',
                    group: 'default',
                  },
                },
              },
              source: `
                if (params.toScheduledAction.containsKey(ctx._source['kibana.alert.uuid'])) {
                  ctx._source['kibana.alert.scheduled_action.group'] = params.toScheduledAction[ctx._source['kibana.alert.uuid']].group;
                  ctx._source['kibana.alert.scheduled_action.date'] = params.toScheduledAction[ctx._source['kibana.alert.uuid']].date;
                  if (params.toScheduledAction[ctx._source['kibana.alert.uuid']].containsKey('throttling')) {
                    ctx._source['kibana.alert.scheduled_action.throttling'] = params.toScheduledAction[ctx._source['kibana.alert.uuid']].throttling;
                  }
                }
                if (params.toMaintenanceWindows.containsKey(ctx._source['kibana.alert.uuid'])) {
                  ctx._source['kibana.alert.maintenance_window_ids'] = params.toMaintenanceWindows[ctx._source['kibana.alert.uuid']];
                }
              `,
            },
          });
        });

        test('should not call updateByQuery if there is no alert neither with last scheduled actions nor maintenance windows', async () => {
          clusterClient.updateByQuery.mockResponseOnce({
            failures: [],
            updated: 0,
            total: 1,
          });
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>({
            ...alertsClientParams,
            isServerless: false,
          });

          await alertsClient.initializeExecution(defaultExecutionOpts);

          // Report 2 new alerts
          const alertExecutorService = alertsClient.factory();
          alertExecutorService.create('1').scheduleActions('default');
          alertExecutorService.create('2').scheduleActions('default');

          await alertsClient.processAlerts();
          await alertsClient.persistAlerts();

          await alertsClient.updatePersistedAlerts({
            alertsToUpdateWithLastScheduledActions:
              alertsClient.getAlertsToUpdateWithLastScheduledActions(),
            alertsToUpdateWithMaintenanceWindows: {},
          });

          expect(clusterClient.updateByQuery).not.toHaveBeenCalled();
        });

        test('should update alerts with new maintenance window Ids', async () => {
          const alertsClient = new AlertsClient(alertsClientParams);

          const alert1 = new Alert('1', { meta: { maintenanceWindowIds: ['mw1'] } });
          const alert2 = new Alert('2', { meta: { maintenanceWindowIds: ['mw1', 'mw2'] } });
          const alert3 = new Alert('3', { meta: { maintenanceWindowIds: ['mw2', 'mw3'] } });

          jest.spyOn(LegacyAlertsClient.prototype, 'getProcessedAlerts').mockReturnValueOnce({
            '1': alert1,
            '2': alert2,
            '3': alert3,
          });

          // @ts-ignore
          await alertsClient.updatePersistedAlerts({
            alertsToUpdateWithLastScheduledActions: {},
            alertsToUpdateWithMaintenanceWindows: {
              [alert1.getUuid()]: ['mw1'],
              [alert2.getUuid()]: ['mw1', 'mw2'],
              [alert3.getUuid()]: ['mw2', 'mw3'],
            },
          });

          const params = clusterClient.updateByQuery.mock.calls[0][0] as UpdateByQueryRequest;

          expect(params.query).toEqual({
            terms: {
              _id: [alert1.getUuid(), alert2.getUuid(), alert3.getUuid()],
            },
          });

          expect(params.script).toEqual({
            source: expect.anything(),
            lang: 'painless',
            params: {
              toScheduledAction: {},
              toMaintenanceWindows: {
                [alert1.getUuid()]: ['mw1'],
                [alert2.getUuid()]: ['mw1', 'mw2'],
                [alert3.getUuid()]: ['mw2', 'mw3'],
              },
            },
          });
        });

        test('should call warn if ES errors with a non retryable error', async () => {
          clusterClient.updateByQuery.mockRejectedValueOnce('something went wrong!');
          const alertsClient = new AlertsClient(alertsClientParams);

          const alert1 = new Alert('1', { meta: { maintenanceWindowIds: ['mw1'] } });

          jest.spyOn(LegacyAlertsClient.prototype, 'getProcessedAlerts').mockReturnValueOnce({
            '1': alert1,
          });

          await expect(
            // @ts-ignore
            alertsClient.updatePersistedAlerts({
              alertsToUpdateWithLastScheduledActions: {},
              alertsToUpdateWithMaintenanceWindows: {
                [alert1.getUuid()]: ['mw1'],
              },
            })
          ).rejects.toBe('something went wrong!');

          expect(logger.error).toHaveBeenCalledWith(
            `Error updating alerts. (last scheduled actions or maintenance windows) for test.rule-type:1 'rule-name': something went wrong!`,
            logTags
          );
        });
      });

      describe('getSummarizedAlerts', () => {
        beforeEach(() => {
          clusterClient.search.mockReturnValue({
            // @ts-ignore
            hits: { total: { value: 0 }, hits: [] },
          });
        });

        const excludedAlertInstanceIds = ['1', '2'];
        const alertsFilter: AlertsFilter = {
          query: {
            kql: 'kibana.alert.rule.name:test',
            dsl: '{"bool":{"minimum_should_match":1,"should":[{"match":{"kibana.alert.rule.name":"test"}}]}}',
            filters: [],
          },
          timeframe: {
            days: [1, 2, 3, 4, 5, 6, 7],
            hours: { start: '08:00', end: '17:00' },
            timezone: 'UTC',
          },
        };

        test('should get the persistent LifeCycle Alerts successfully', async () => {
          clusterClient.search
            .mockReturnValueOnce({
              // @ts-ignore
              hits: { total: { value: 1 }, hits: [mockAAD] },
            })
            .mockReturnValueOnce({
              // @ts-ignore
              hits: { total: { value: 1 }, hits: [mockAAD, mockAAD] },
            })
            .mockReturnValueOnce({
              // @ts-ignore
              hits: { total: { value: 0 }, hits: [] },
            });

          const alertsClient = new AlertsClient(alertsClientParams);
          const result = await alertsClient.getSummarizedAlerts(getParamsByExecutionUuid);

          expect(clusterClient.search).toHaveBeenCalledTimes(3);

          expect(result).toEqual({
            new: {
              count: 1,
              data: [
                {
                  _id: mockAAD._id,
                  _index: mockAAD._index,
                  ...expandFlattenedAlert(mockAAD._source),
                },
              ],
            },
            ongoing: {
              count: 1,
              data: [
                {
                  _id: mockAAD._id,
                  _index: mockAAD._index,
                  ...expandFlattenedAlert(mockAAD._source),
                },
                {
                  _id: mockAAD._id,
                  _index: mockAAD._index,
                  ...expandFlattenedAlert(mockAAD._source),
                },
              ],
            },
            recovered: { count: 0, data: [] },
          });
        });

        test('should get the persistent Continual Alerts successfully', async () => {
          clusterClient.search.mockReturnValueOnce({
            // @ts-ignore
            hits: { total: { value: 1 }, hits: [mockAAD] },
          });
          const alertsClient = new AlertsClient({
            ...alertsClientParams,
            ruleType: {
              ...alertsClientParams.ruleType,
              autoRecoverAlerts: false,
            },
          });

          const result = await alertsClient.getSummarizedAlerts(getParamsByExecutionUuid);

          expect(clusterClient.search).toHaveBeenCalledTimes(1);

          expect(result).toEqual({
            new: {
              count: 1,
              data: [
                {
                  _id: mockAAD._id,
                  _index: mockAAD._index,
                  ...expandFlattenedAlert(mockAAD._source),
                },
              ],
            },
            ongoing: { count: 0, data: [] },
            recovered: { count: 0, data: [] },
          });
        });

        test('formats alerts with formatAlert when provided', async () => {
          interface AlertData extends RuleAlertData {
            'signal.rule.consumer': string;
          }
          const alertsClient = new AlertsClient<AlertData, {}, {}, 'default', 'recovered'>({
            ...alertsClientParams,
            ruleType: {
              ...alertsClientParams.ruleType,
              autoRecoverAlerts: false,
              alerts: {
                context: 'test',
                mappings: { fieldMap: { field: { type: 'keyword', required: false } } },
                shouldWrite: true,
                formatAlert: (alert) => {
                  const alertCopy = { ...alert } as Partial<AlertData>;
                  alertCopy['kibana.alert.rule.consumer'] = alert['signal.rule.consumer'];
                  delete alertCopy['signal.rule.consumer'];
                  return alertCopy;
                },
              },
            },
          });

          clusterClient.search.mockReturnValueOnce({
            // @ts-ignore
            hits: {
              total: { value: 1 },
              hits: [
                {
                  ...mockAAD,
                  _source: { ...mockAAD._source, 'signal.rule.consumer': 'signalConsumer' },
                },
              ],
            },
          });

          const result = await alertsClient.getSummarizedAlerts(getParamsByExecutionUuid);

          expect(clusterClient.search).toHaveBeenCalledTimes(1);

          const expectedResult = { ...mockAAD._source };
          expectedResult['kibana.alert.rule.consumer'] = 'signalConsumer';

          expect(result).toEqual({
            new: {
              count: 1,
              data: [
                {
                  _id: mockAAD._id,
                  _index: mockAAD._index,
                  ...expandFlattenedAlert(expectedResult),
                },
              ],
            },
            ongoing: { count: 0, data: [] },
            recovered: { count: 0, data: [] },
          });
        });

        describe.each([
          { alertType: 'LifeCycle Alerts Query', isLifecycleAlert: true },
          { alertType: 'Continual Alerts Query', isLifecycleAlert: false },
        ])('$alertType', ({ isLifecycleAlert }) => {
          describe.each([
            {
              queryByType: 'ByExecutionUuid',
              baseParams: getParamsByExecutionUuid,
              getQuery: getExpectedQueryByExecutionUuid,
            },
            {
              queryByType: 'ByTimeRange',
              baseParams: getParamsByTimeQuery,
              getQuery: getExpectedQueryByTimeRange,
            },
          ])('$queryByType', ({ baseParams, getQuery }) => {
            const indexName = useDataStreamForAlerts
              ? '.alerts-test.alerts-default'
              : '.internal.alerts-test.alerts-default-*';
            test.each([
              {
                text: 'should generate the correct query',
                params: baseParams,
                call1: getQuery({
                  indexName,
                  alertType: 'new',
                  isLifecycleAlert,
                }),
                call2: getQuery({
                  indexName,
                  alertType: 'ongoing',
                }),
                call3: getQuery({
                  indexName,
                  alertType: 'recovered',
                }),
              },
              {
                text: 'should filter by excludedAlertInstanceIds',
                params: {
                  ...baseParams,
                  excludedAlertInstanceIds,
                },
                call1: getQuery({
                  indexName,
                  alertType: 'new',
                  isLifecycleAlert,
                  excludedAlertInstanceIds,
                }),
                call2: getQuery({
                  indexName,
                  alertType: 'ongoing',
                  excludedAlertInstanceIds,
                }),
                call3: getQuery({
                  indexName,
                  alertType: 'recovered',
                  excludedAlertInstanceIds,
                }),
              },
              {
                text: 'should filter by alertsFilter',
                params: {
                  ...baseParams,
                  alertsFilter,
                },
                call1: getQuery({
                  indexName,
                  alertType: 'new',
                  isLifecycleAlert,
                  alertsFilter,
                }),
                call2: getQuery({
                  indexName,
                  alertType: 'ongoing',
                  alertsFilter,
                }),
                call3: getQuery({
                  indexName,
                  alertType: 'recovered',
                  alertsFilter,
                }),
              },
              {
                text: 'alertsFilter uses the all the days (ISO_WEEKDAYS) when no day is selected',
                params: {
                  ...baseParams,
                  alertsFilter: {
                    ...alertsFilter,
                    timeframe: {
                      ...alertsFilter.timeframe!,
                      days: [],
                    },
                  },
                },
                call1: getQuery({
                  indexName,
                  alertType: 'new',
                  isLifecycleAlert,
                  alertsFilter,
                }),
                call2: getQuery({
                  indexName,
                  alertType: 'ongoing',
                  alertsFilter,
                }),
                call3: getQuery({
                  indexName,
                  alertType: 'recovered',
                  alertsFilter,
                }),
              },
            ])('$text', async ({ params, call1, call2, call3 }) => {
              const alertsClient = new AlertsClient({
                ...alertsClientParams,
                ruleType: {
                  ...alertsClientParams.ruleType,
                  autoRecoverAlerts: isLifecycleAlert,
                },
              });
              await alertsClient.getSummarizedAlerts(params);
              expect(clusterClient.search).toHaveBeenCalledTimes(isLifecycleAlert ? 3 : 1);
              expect(clusterClient.search).toHaveBeenNthCalledWith(1, call1);
              if (isLifecycleAlert) {
                expect(clusterClient.search).toHaveBeenNthCalledWith(2, call2);
                expect(clusterClient.search).toHaveBeenNthCalledWith(3, call3);
              }
            });
          });
        });

        describe('throws error', () => {
          let alertsClient: AlertsClient<{}, {}, {}, 'default', 'recovered'>;

          beforeEach(() => {
            alertsClient = new AlertsClient(alertsClientParams);
          });
          test('if ruleId is not specified', async () => {
            const { ruleId, ...paramsWithoutRuleId } = getParamsByExecutionUuid;

            await expect(
              alertsClient.getSummarizedAlerts(paramsWithoutRuleId as GetSummarizedAlertsParams)
            ).rejects.toThrowError(`Must specify both rule ID and space ID for AAD alert query.`);
          });

          test('if spaceId is not specified', async () => {
            const { spaceId, ...paramsWithoutSpaceId } = getParamsByExecutionUuid;

            await expect(
              alertsClient.getSummarizedAlerts(paramsWithoutSpaceId as GetSummarizedAlertsParams)
            ).rejects.toThrowError(`Must specify both rule ID and space ID for AAD alert query.`);
          });

          test('if executionUuid or start date are not specified', async () => {
            const { executionUuid, ...paramsWithoutExecutionUuid } = getParamsByExecutionUuid;

            await expect(
              alertsClient.getSummarizedAlerts(
                paramsWithoutExecutionUuid as GetSummarizedAlertsParams
              )
            ).rejects.toThrowError(
              'Must specify either execution UUID or time range for AAD alert query.'
            );
          });

          test('if start date is not specified for a TimeRange query', async () => {
            const { start, ...paramsWithoutStart } = getParamsByTimeQuery;

            await expect(
              alertsClient.getSummarizedAlerts(paramsWithoutStart as GetSummarizedAlertsParams)
            ).rejects.toThrowError(
              'Must specify either execution UUID or time range for AAD alert query.'
            );
          });

          test('if end date is not specified for a TimeRange query', async () => {
            const { end, ...paramsWithoutEnd } = getParamsByTimeQuery;

            await expect(
              alertsClient.getSummarizedAlerts(paramsWithoutEnd as GetSummarizedAlertsParams)
            ).rejects.toThrowError(
              'Must specify either execution UUID or time range for AAD alert query.'
            );
          });
        });
      });

      describe('getMaintenanceWindowScopedQueryAlerts', () => {
        beforeEach(() => {
          clusterClient.msearch.mockResolvedValue({
            took: 10,
            responses: [
              {
                took: 10,
                timed_out: false,
                _shards: { failed: 0, successful: 1, total: 0, skipped: 0 },
                hits: {
                  total: { relation: 'eq', value: 0 },
                  hits: [
                    {
                      _index: '.internal.alerts-test.alerts-default-000001',
                      fields: {
                        [ALERT_UUID]: ['alert_id_1'],
                        [RUNTIME_MAINTENANCE_WINDOW_ID_FIELD]: ['mw1'],
                      },
                    },
                    {
                      _index: '.internal.alerts-test.alerts-default-000001',
                      fields: {
                        [ALERT_UUID]: ['alert_id_2'],
                        [RUNTIME_MAINTENANCE_WINDOW_ID_FIELD]: ['mw1'],
                      },
                    },
                  ],
                },
              },
              {
                took: 10,
                timed_out: false,
                _shards: { failed: 0, successful: 1, total: 0, skipped: 0 },
                hits: {
                  total: { relation: 'eq', value: 0 },
                  hits: [
                    {
                      _index: '.internal.alerts-test.alerts-default-000001',
                      fields: {
                        [ALERT_UUID]: ['alert_id_1'],
                        [RUNTIME_MAINTENANCE_WINDOW_ID_FIELD]: ['mw2'],
                      },
                    },
                  ],
                },
              },
            ],
          });
        });
        test('should get the persistent lifecycle alerts affected by scoped query successfully', async () => {
          const alertsClient = new AlertsClient(alertsClientParams);
          // @ts-ignore
          const result = await alertsClient.getMaintenanceWindowScopedQueryAlerts(
            getParamsByMaintenanceWindowScopedQuery
          );

          expect(clusterClient.msearch).toHaveBeenCalledWith({
            ignore_unavailable: true,
            index: expect.any(String),
            searches: [
              {},
              expect.objectContaining({ size: DEFAULT_MAX_ALERTS }),
              {},
              expect.objectContaining({ size: DEFAULT_MAX_ALERTS }),
            ],
          });

          expect(result).toEqual({
            mw1: ['alert_id_1', 'alert_id_2'],
            mw2: ['alert_id_1'],
          });
        });

        test('should get the persistent continual alerts affected by scoped query successfully', async () => {
          const alertsClient = new AlertsClient({
            ...alertsClientParams,
            ruleType: {
              ...alertsClientParams.ruleType,
              autoRecoverAlerts: false,
            },
          });
          // @ts-ignore
          const result = await alertsClient.getMaintenanceWindowScopedQueryAlerts(
            getParamsByMaintenanceWindowScopedQuery
          );

          expect(result).toEqual({
            mw1: ['alert_id_1', 'alert_id_2'],
            mw2: ['alert_id_1'],
          });
        });

        test('should throw if ruleId is not specified', async () => {
          const alertsClient = new AlertsClient(alertsClientParams);
          const { ruleId, ...paramsWithoutRuleId } = getParamsByMaintenanceWindowScopedQuery;

          await expect(
            // @ts-ignore
            alertsClient.getMaintenanceWindowScopedQueryAlerts(
              paramsWithoutRuleId as GetMaintenanceWindowScopedQueryAlertsParams
            )
          ).rejects.toThrowError(
            'Must specify rule ID, space ID, and executionUuid for scoped query AAD alert query.'
          );
        });

        test('should throw if spaceId is not specified', async () => {
          const alertsClient = new AlertsClient(alertsClientParams);
          const { spaceId, ...paramsWithoutRuleId } = getParamsByMaintenanceWindowScopedQuery;

          await expect(
            // @ts-ignore
            alertsClient.getMaintenanceWindowScopedQueryAlerts(
              paramsWithoutRuleId as GetMaintenanceWindowScopedQueryAlertsParams
            )
          ).rejects.toThrowError(
            'Must specify rule ID, space ID, and executionUuid for scoped query AAD alert query.'
          );
        });

        test('should throw if executionUuid is not specified', async () => {
          const alertsClient = new AlertsClient(alertsClientParams);
          const { executionUuid, ...paramsWithoutRuleId } = getParamsByMaintenanceWindowScopedQuery;

          await expect(
            // @ts-ignore
            alertsClient.getMaintenanceWindowScopedQueryAlerts(
              paramsWithoutRuleId as GetMaintenanceWindowScopedQueryAlertsParams
            )
          ).rejects.toThrowError(
            'Must specify rule ID, space ID, and executionUuid for scoped query AAD alert query.'
          );
        });

        test('should skip the falied request returned by msearch', async () => {
          clusterClient.msearch.mockResolvedValue({
            took: 10,
            responses: [
              {
                took: 10,
                timed_out: false,
                _shards: { failed: 0, successful: 1, total: 0, skipped: 0 },
                hits: {
                  total: { relation: 'eq', value: 0 },
                  hits: [
                    {
                      _index: '.internal.alerts-test.alerts-default-000001',
                      fields: {
                        [ALERT_UUID]: ['alert_id_1'],
                        [RUNTIME_MAINTENANCE_WINDOW_ID_FIELD]: ['mw1'],
                      },
                    },
                    {
                      _index: '.internal.alerts-test.alerts-default-000001',
                      fields: {
                        [ALERT_UUID]: ['alert_id_2'],
                        [RUNTIME_MAINTENANCE_WINDOW_ID_FIELD]: ['mw1'],
                      },
                    },
                  ],
                },
              },
              {
                error: {
                  type: 'search_phase_execution_exception',
                  reason: 'Failed to fetch alerts for maintenance windows with scoped query',
                },
                status: 500,
              },
            ],
          });
          const alertsClient = new AlertsClient(alertsClientParams);
          // @ts-ignore
          const result = await alertsClient.getMaintenanceWindowScopedQueryAlerts(
            getParamsByMaintenanceWindowScopedQuery
          );

          expect(result).toEqual({
            mw1: ['alert_id_1', 'alert_id_2'],
          });

          expect(logger.error).toHaveBeenCalledWith(
            "Error fetching scoped query alerts for maintenance windows for test.rule-type:1 'rule-name': Failed to fetch alerts for maintenance windows with scoped query",
            { tags: ['test.rule-type', '1', 'alerts-client'] }
          );
        });
      });

      describe('getAlertsToUpdateWithMaintenanceWindows', () => {
        test('should return alert IDs to update with maintenance windows', async () => {
          const alert1 = new Alert('1');
          const alert2 = new Alert('2');

          const loggerSpy = jest
            .spyOn(alertingEventLogger, 'setMaintenanceWindowIds')
            .mockImplementation();

          maintenanceWindowsService.getMaintenanceWindows.mockReturnValue({
            maintenanceWindows: getParamsByUpdateMaintenanceWindowIds.maintenanceWindows,
            maintenanceWindowsWithoutScopedQueryIds: [],
          });

          jest.spyOn(LegacyAlertsClient.prototype, 'getProcessedAlerts').mockReturnValueOnce({
            '1': alert1,
            '2': alert2,
          });

          jest
            // @ts-ignore
            .spyOn(AlertsClient.prototype, 'getMaintenanceWindowScopedQueryAlerts')
            // @ts-ignore
            .mockResolvedValueOnce({
              mw1: [alert1.getUuid(), alert2.getUuid()],
              mw2: [alert2.getUuid()],
            });

          const alertsClient = new AlertsClient(alertsClientParams);

          const result = await alertsClient.getAlertsToUpdateWithMaintenanceWindows();

          expect(loggerSpy).toHaveBeenCalledWith(['mw1', 'mw2']);

          expect(alert1.getMaintenanceWindowIds()).toEqual(['mw1']);
          expect(alert2.getMaintenanceWindowIds()).toEqual(['mw1', 'mw2']);

          expect(result).toEqual({
            [alert1.getUuid()]: ['mw1'],
            [alert2.getUuid()]: ['mw1', 'mw2'],
          });
        });

        test('should skip loading maintenance windows when there are no alerts', async () => {
          jest.spyOn(LegacyAlertsClient.prototype, 'getProcessedAlerts').mockReturnValueOnce({});
          const msearchSpy = jest.spyOn(AlertsClient.prototype, 'msearch');

          const alertsClient = new AlertsClient(alertsClientParams);
          const result = await alertsClient.getAlertsToUpdateWithMaintenanceWindows();

          expect(maintenanceWindowsService.getMaintenanceWindows).not.toHaveBeenCalled();
          expect(msearchSpy).not.toHaveBeenCalled();

          expect(result).toEqual({});
        });

        test('should not return alerts if none match the maintenance window scoped query', async () => {
          maintenanceWindowsService.getMaintenanceWindows.mockReturnValue({
            maintenanceWindows: [
              ...getParamsByUpdateMaintenanceWindowIds.maintenanceWindows,
              { id: 'mw3' } as unknown as MaintenanceWindow,
            ],
            maintenanceWindowsWithoutScopedQueryIds: [],
          });
          const alertsClient = new AlertsClient(alertsClientParams);

          const alert1 = new Alert('1');
          const alert2 = new Alert('2');
          const alert3 = new Alert('3');
          const alert4 = new Alert('4');

          jest.spyOn(LegacyAlertsClient.prototype, 'getProcessedAlerts').mockReturnValueOnce({
            '1': alert1,
            '2': alert2,
            '3': alert3,
            '4': alert4,
          });

          jest
            // @ts-ignore
            .spyOn(AlertsClient.prototype, 'getMaintenanceWindowScopedQueryAlerts')
            // @ts-ignore
            .mockResolvedValueOnce({});

          const result = await alertsClient.getAlertsToUpdateWithMaintenanceWindows();

          expect(alert1.getMaintenanceWindowIds()).toEqual([]);
          expect(alert2.getMaintenanceWindowIds()).toEqual([]);
          expect(alert3.getMaintenanceWindowIds()).toEqual([]);

          expect(result).toEqual({});
        });

        test('should return alerts based on alert id with MW ids when provided with maintenance windows', async () => {
          const loggerSpy = jest
            .spyOn(alertingEventLogger, 'setMaintenanceWindowIds')
            .mockImplementation();

          maintenanceWindowsService.getMaintenanceWindows.mockReturnValueOnce({
            maintenanceWindows: [
              ...getParamsByUpdateMaintenanceWindowIds.maintenanceWindows,
              { id: 'mw3' } as unknown as MaintenanceWindow,
            ],
            maintenanceWindowsWithoutScopedQueryIds: [],
          });
          const alertsClient = new AlertsClient(alertsClientParams);

          const alert1 = new Alert('1');
          const alert2 = new Alert('2');
          const alert3 = new Alert('3');
          const alert4 = new Alert('4');

          jest.spyOn(LegacyAlertsClient.prototype, 'getProcessedAlerts').mockReturnValueOnce({
            '1': alert1,
            '2': alert2,
            '3': alert3,
            '4': alert4,
          });

          jest
            // @ts-ignore
            .spyOn(AlertsClient.prototype, 'getMaintenanceWindowScopedQueryAlerts')
            // @ts-ignore
            .mockResolvedValueOnce({
              mw1: [alert1.getUuid(), alert2.getUuid()],
              mw2: [alert3.getUuid()],
            });

          const result = await alertsClient.getAlertsToUpdateWithMaintenanceWindows();

          expect(alert1.getMaintenanceWindowIds()).toEqual(['mw3', 'mw1']);
          expect(alert2.getMaintenanceWindowIds()).toEqual(['mw3', 'mw1']);
          expect(alert3.getMaintenanceWindowIds()).toEqual(['mw3', 'mw2']);

          expect(result).toEqual({
            [alert1.getUuid()]: ['mw3', 'mw1'],
            [alert2.getUuid()]: ['mw3', 'mw1'],
            [alert3.getUuid()]: ['mw3', 'mw2'],
          });

          expect(loggerSpy).toHaveBeenCalledWith(['mw3', 'mw1', 'mw2']);
        });
      });

      describe('getAlertsToUpdateWithLastScheduledActions()', () => {
        test('should return alert IDs to update with last scheduled actions', async () => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>({
            ...alertsClientParams,
            isServerless: false,
          });

          await alertsClient.initializeExecution(defaultExecutionOpts);

          // Report 2 new alerts
          const alertExecutorService = alertsClient.factory();
          alertExecutorService
            .create('1')
            .scheduleActions('default')
            .updateLastScheduledActions('default');
          alertExecutorService
            .create('2')
            .scheduleActions('default')
            .updateLastScheduledActions('default', null, '111-2222');

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          const { rawActiveAlerts } = alertsClient.getRawAlertInstancesForState();
          const uuid1 = rawActiveAlerts['1'].meta?.uuid as string;
          const uuid2 = rawActiveAlerts['2'].meta?.uuid as string;
          const result = await alertsClient.getAlertsToUpdateWithLastScheduledActions();

          expect(Object.keys(rawActiveAlerts)).toHaveLength(2);
          expect(result).toEqual({
            [uuid1]: {
              date: '2023-03-28T22:27:28.159Z',
              group: 'default',
            },
            [uuid2]: {
              date: '2023-03-28T22:27:28.159Z',
              group: 'default',
              throttling: {
                '111-2222': {
                  date: '2023-03-28T22:27:28.159Z',
                },
              },
            },
          });
        });

        test('should return an empty object if no alerts are found', async () => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>({
            ...alertsClientParams,
            isServerless: false,
          });

          await alertsClient.initializeExecution(defaultExecutionOpts);
          await alertsClient.processAlerts();
          await alertsClient.persistAlerts();

          const result = await alertsClient.getAlertsToUpdateWithLastScheduledActions();

          expect(result).toEqual({});
        });

        test('filter the alerts without last scheduled actions', async () => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>({
            ...alertsClientParams,
            isServerless: false,
          });

          await alertsClient.initializeExecution(defaultExecutionOpts);

          // Report 2 new alerts
          const alertExecutorService = alertsClient.factory();
          alertExecutorService
            .create('1')
            .scheduleActions('default')
            .updateLastScheduledActions('default');

          // Does not update last scheduled actions for alert '2'
          alertExecutorService.create('2').scheduleActions('default');

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          const result = await alertsClient.getAlertsToUpdateWithLastScheduledActions();
          const { rawActiveAlerts } = alertsClient.getRawAlertInstancesForState();
          const uuid1 = rawActiveAlerts['1'].meta?.uuid as string;

          expect(result).toEqual({
            [uuid1]: {
              date: '2023-03-28T22:27:28.159Z',
              group: 'default',
            },
          });
        });
      });

      describe('report()', () => {
        test('should create legacy alert with id, action group', async () => {
          const mockGetUuidCurrent = jest
            .fn()
            .mockReturnValueOnce('uuid1')
            .mockReturnValueOnce('uuid2');
          const mockGetStartCurrent = jest.fn().mockReturnValue(null);
          const mockScheduleActionsCurrent = jest.fn().mockImplementation(() => ({
            replaceState: mockReplaceState,
            getUuid: mockGetUuidCurrent,
            getStart: mockGetStartCurrent,
          }));
          const mockCreateCurrent = jest.fn().mockImplementation(() => ({
            scheduleActions: mockScheduleActionsCurrent,
          }));
          mockLegacyAlertsClient.factory.mockImplementation(() => ({ create: mockCreateCurrent }));
          const spy = jest
            .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
            .mockImplementation(() => mockLegacyAlertsClient);
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution(defaultExecutionOpts);

          // Report 2 new alerts
          const { uuid: uuid1, start: start1 } = alertsClient.report({
            id: '1',
            actionGroup: 'default',
            state: {},
            context: {},
          });
          const { uuid: uuid2, start: start2 } = alertsClient.report({
            id: '2',
            actionGroup: 'default',
            state: {},
            context: {},
          });

          expect(mockCreateCurrent).toHaveBeenCalledTimes(2);
          expect(mockCreateCurrent).toHaveBeenNthCalledWith(1, '1');
          expect(mockCreateCurrent).toHaveBeenNthCalledWith(2, '2');
          expect(mockScheduleActionsCurrent).toHaveBeenCalledTimes(2);
          expect(mockScheduleActionsCurrent).toHaveBeenNthCalledWith(1, 'default', {});
          expect(mockScheduleActionsCurrent).toHaveBeenNthCalledWith(2, 'default', {});

          expect(mockReplaceState).not.toHaveBeenCalled();
          spy.mockRestore();

          expect(uuid1).toEqual('uuid1');
          expect(uuid2).toEqual('uuid2');
          expect(start1).toBeNull();
          expect(start2).toBeNull();
        });

        test('should use startedAt time if provided', async () => {
          const mockGetUuidCurrent = jest
            .fn()
            .mockReturnValueOnce('uuid1')
            .mockReturnValueOnce('uuid2');
          const mockGetStartCurrent = jest.fn().mockReturnValue(null);
          const mockScheduleActionsCurrent = jest.fn().mockImplementation(() => ({
            replaceState: mockReplaceState,
            getUuid: mockGetUuidCurrent,
            getStart: mockGetStartCurrent,
          }));
          const mockCreateCurrent = jest.fn().mockImplementation(() => ({
            scheduleActions: mockScheduleActionsCurrent,
          }));
          mockLegacyAlertsClient.factory.mockImplementation(() => ({ create: mockCreateCurrent }));
          const spy = jest
            .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
            .mockImplementation(() => mockLegacyAlertsClient);
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            startedAt: new Date(startedAtDate),
          });

          // Report 2 new alerts
          const { uuid: uuid1, start: start1 } = alertsClient.report({
            id: '1',
            actionGroup: 'default',
            state: {},
            context: {},
          });
          const { uuid: uuid2, start: start2 } = alertsClient.report({
            id: '2',
            actionGroup: 'default',
            state: {},
            context: {},
          });

          expect(mockCreateCurrent).toHaveBeenCalledTimes(2);
          expect(mockCreateCurrent).toHaveBeenNthCalledWith(1, '1');
          expect(mockCreateCurrent).toHaveBeenNthCalledWith(2, '2');
          expect(mockScheduleActionsCurrent).toHaveBeenCalledTimes(2);
          expect(mockScheduleActionsCurrent).toHaveBeenNthCalledWith(1, 'default', {});
          expect(mockScheduleActionsCurrent).toHaveBeenNthCalledWith(2, 'default', {});

          expect(mockReplaceState).not.toHaveBeenCalled();
          spy.mockRestore();

          expect(uuid1).toEqual('uuid1');
          expect(uuid2).toEqual('uuid2');
          expect(start1).toEqual(startedAtDate);
          expect(start2).toEqual(startedAtDate);
        });

        test('should set context if defined', async () => {
          mockLegacyAlertsClient.factory.mockImplementation(() => ({ create: mockCreate }));
          const spy = jest
            .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
            .mockImplementation(() => mockLegacyAlertsClient);
          const alertsClient = new AlertsClient<{}, {}, { foo?: string }, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution(defaultExecutionOpts);

          // Report 2 new alerts
          alertsClient.report({
            id: '1',
            actionGroup: 'default',
            state: {},
            context: { foo: 'cheese' },
          });
          alertsClient.report({ id: '2', actionGroup: 'default', state: {}, context: {} });

          expect(mockCreate).toHaveBeenCalledTimes(2);
          expect(mockCreate).toHaveBeenNthCalledWith(1, '1');
          expect(mockCreate).toHaveBeenNthCalledWith(2, '2');
          expect(mockScheduleActions).toHaveBeenCalledTimes(2);
          expect(mockScheduleActions).toHaveBeenNthCalledWith(1, 'default', { foo: 'cheese' });
          expect(mockScheduleActions).toHaveBeenNthCalledWith(2, 'default', {});

          expect(mockReplaceState).not.toHaveBeenCalled();
          spy.mockRestore();
        });

        test('should set state if defined', async () => {
          mockLegacyAlertsClient.factory.mockImplementation(() => ({ create: mockCreate }));
          const spy = jest
            .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
            .mockImplementation(() => mockLegacyAlertsClient);
          const alertsClient = new AlertsClient<{}, { count: number }, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution(defaultExecutionOpts);

          // Report 2 new alerts
          alertsClient.report({
            id: '1',
            actionGroup: 'default',
            state: { count: 1 },
            context: {},
          });
          alertsClient.report({
            id: '2',
            actionGroup: 'default',
            state: { count: 2 },
            context: {},
          });

          expect(mockCreate).toHaveBeenCalledTimes(2);
          expect(mockCreate).toHaveBeenNthCalledWith(1, '1');
          expect(mockCreate).toHaveBeenNthCalledWith(2, '2');
          expect(mockScheduleActions).toHaveBeenCalledTimes(2);
          expect(mockScheduleActions).toHaveBeenNthCalledWith(1, 'default', {});
          expect(mockScheduleActions).toHaveBeenNthCalledWith(2, 'default', {});
          expect(mockReplaceState).toHaveBeenCalledTimes(2);
          expect(mockReplaceState).toHaveBeenNthCalledWith(1, { count: 1 });
          expect(mockReplaceState).toHaveBeenNthCalledWith(2, { count: 2 });
          spy.mockRestore();
        });

        test('should set payload if defined and write out to alert doc', async () => {
          const alertsClient = new AlertsClient<
            { count: number; url: string },
            {},
            {},
            'default',
            'recovered'
          >(alertsClientParams);

          await alertsClient.initializeExecution(defaultExecutionOpts);

          // Report 2 new alerts
          alertsClient.report({
            id: '1',
            actionGroup: 'default',
            state: {},
            context: {},
            payload: { count: 1, url: `https://url1` },
          });
          alertsClient.report({
            id: '2',
            actionGroup: 'default',
            state: {},
            context: {},
            payload: { count: 2, url: `https://url2` },
          });

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          const { rawActiveAlerts } = alertsClient.getRawAlertInstancesForState();
          const uuid1 = rawActiveAlerts['1'].meta?.uuid;
          const uuid2 = rawActiveAlerts['2'].meta?.uuid;

          expect(clusterClient.bulk).toHaveBeenCalledWith({
            index: '.alerts-test.alerts-default',
            refresh: 'wait_for',
            require_alias: !useDataStreamForAlerts,
            body: [
              {
                create: { _id: uuid1, ...(useDataStreamForAlerts ? {} : { require_alias: true }) },
              },
              // new alert doc
              {
                ...getNewIndexedAlertDoc({ [ALERT_UUID]: uuid1 }),
                count: 1,
                url: `https://url1`,
                [EVENT_ACTION]: 'open',
                [EVENT_KIND]: 'signal',
                [ALERT_ACTION_GROUP]: 'default',
                [ALERT_DURATION]: 0,
                [ALERT_FLAPPING]: false,
                [ALERT_MUTED]: false,
                [ALERT_FLAPPING_HISTORY]: [true],
                [ALERT_INSTANCE_ID]: '1',
                [ALERT_MAINTENANCE_WINDOW_IDS]: ['test-id1', 'test-id2'],
                [ALERT_MAINTENANCE_WINDOW_NAMES]: ['test-name1', 'test-name2'],
                [ALERT_RULE_CATEGORY]: 'My test rule',
                [ALERT_RULE_CONSUMER]: 'bar',
                [ALERT_RULE_EXECUTION_UUID]: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
                [ALERT_RULE_NAME]: 'rule-name',
                [ALERT_RULE_PARAMETERS]: { bar: true },
                [ALERT_RULE_PRODUCER]: 'alerts',
                [ALERT_RULE_REVISION]: 0,
                [ALERT_RULE_TYPE_ID]: 'test.rule-type',
                [ALERT_RULE_TAGS]: ['rule-', '-tags'],
                [ALERT_RULE_UUID]: '1',
                [ALERT_START]: date,
                [ALERT_STATUS]: 'active',
                [ALERT_TIME_RANGE]: { gte: date },
                [ALERT_UUID]: uuid1,
                [ALERT_WORKFLOW_STATUS]: 'open',
                [SPACE_IDS]: ['default'],
                [VERSION]: '8.9.0',
                [TAGS]: ['rule-', '-tags'],
              },
              {
                create: { _id: uuid2, ...(useDataStreamForAlerts ? {} : { require_alias: true }) },
              },
              // new alert doc
              {
                ...getNewIndexedAlertDoc({ [ALERT_UUID]: uuid2, [ALERT_INSTANCE_ID]: '2' }),
                count: 2,
                url: `https://url2`,
                [EVENT_ACTION]: 'open',
                [EVENT_KIND]: 'signal',
                [ALERT_ACTION_GROUP]: 'default',
                [ALERT_DURATION]: 0,
                [ALERT_FLAPPING]: false,
                [ALERT_MUTED]: false,
                [ALERT_FLAPPING_HISTORY]: [true],
                [ALERT_INSTANCE_ID]: '2',
                [ALERT_MAINTENANCE_WINDOW_IDS]: ['test-id1', 'test-id2'],
                [ALERT_MAINTENANCE_WINDOW_NAMES]: ['test-name1', 'test-name2'],
                [ALERT_RULE_CATEGORY]: 'My test rule',
                [ALERT_RULE_CONSUMER]: 'bar',
                [ALERT_RULE_EXECUTION_UUID]: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
                [ALERT_RULE_NAME]: 'rule-name',
                [ALERT_RULE_PARAMETERS]: { bar: true },
                [ALERT_RULE_PRODUCER]: 'alerts',
                [ALERT_RULE_REVISION]: 0,
                [ALERT_RULE_TYPE_ID]: 'test.rule-type',
                [ALERT_RULE_TAGS]: ['rule-', '-tags'],
                [ALERT_RULE_UUID]: '1',
                [ALERT_START]: date,
                [ALERT_STATUS]: 'active',
                [ALERT_TIME_RANGE]: { gte: date },
                [ALERT_UUID]: uuid2,
                [ALERT_WORKFLOW_STATUS]: 'open',
                [SPACE_IDS]: ['default'],
                [VERSION]: '8.9.0',
                [TAGS]: ['rule-', '-tags'],
              },
            ],
          });
        });

        test('should return undefined if an alert doc with provided id do not exist', async () => {
          const mockAlertPayload = { count: 1, url: `https://url1` };
          const alertInstanceId = 'existing_alert';
          const alertSource = {
            ...mockAlertPayload,
            [ALERT_INSTANCE_ID]: alertInstanceId,
          };

          clusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 1 },
              hits: [
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  _source: alertSource,
                },
              ],
            },
          });

          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              [alertInstanceId]: {},
            },
          });

          const { alertDoc } = alertsClient.report({
            id: 'another_alert',
            actionGroup: 'default',
            state: {},
            context: {},
          });

          expect(alertDoc).toBeUndefined();
        });

        test('should return a previous alert payload if one exists', async () => {
          const mockAlertPayload = { count: 1, url: `https://url1` };
          const alertInstanceId = 'existing_alert';
          const alertSource = {
            ...mockAlertPayload,
            [ALERT_INSTANCE_ID]: alertInstanceId,
            [ALERT_STATUS]: 'active',
            [ALERT_UUID]: 'abc',
          } as InnerHit;
          const newClusterClient = elasticsearchServiceMock.createClusterClient().asInternalUser;

          newClusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  _source: alertSource,
                },
              ],
            },
          });

          const alertsClient = new AlertsClient<
            { count: number; url: string },
            {},
            {},
            'default',
            'recovered'
          >({
            ...alertsClientParams,
            elasticsearchClientPromise: Promise.resolve(newClusterClient),
          });

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              [alertInstanceId]: trackedAlert1Raw,
            },
          });

          // Report the same alert again
          const { alertDoc } = alertsClient.report({
            id: alertInstanceId,
            actionGroup: 'default',
          });

          expect(alertDoc).toEqual(alertSource);
        });
      });

      describe('setAlertData()', () => {
        test('should call setContext on legacy alert', async () => {
          mockLegacyAlertsClient.getAlert.mockReturnValueOnce({
            getId: jest.fn().mockReturnValue('1'),
            setContext: mockSetContext,
          });
          mockLegacyAlertsClient.getAlert.mockReturnValueOnce({
            getId: jest.fn().mockReturnValue('1'),
            setContext: mockSetContext,
          });
          const spy = jest
            .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
            .mockImplementation(() => mockLegacyAlertsClient);
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              '1': trackedAlert1Raw,
              '2': trackedAlert2Raw,
            },
          });

          // Set context on 2 recovered alerts
          alertsClient.setAlertData({ id: '1', context: { foo: 'bar' } });
          alertsClient.setAlertData({ id: '2' });

          expect(mockSetContext).toHaveBeenCalledTimes(2);
          expect(mockSetContext).toHaveBeenNthCalledWith(1, { foo: 'bar' });
          expect(mockSetContext).toHaveBeenNthCalledWith(2, {});
          spy.mockRestore();
        });

        test('should throw error if called on unknown alert id', async () => {
          mockLegacyAlertsClient.getAlert.mockReturnValueOnce(null);
          const spy = jest
            .spyOn(LegacyAlertsClientModule, 'LegacyAlertsClient')
            .mockImplementation(() => mockLegacyAlertsClient);
          const alertsClient = new AlertsClient<{}, {}, { foo?: string }, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              '1': trackedAlert1Raw,
              '2': trackedAlert2Raw,
            },
          });

          // Set context on 2 recovered alerts
          expect(() => {
            alertsClient.setAlertData({ id: '1', context: { foo: 'bar' } });
          }).toThrowErrorMatchingInlineSnapshot(
            `"Cannot set alert data for alert 1 because it has not been reported and it is not recovered."`
          );
          spy.mockRestore();
        });

        test('should successfully update context and payload for new alert', async () => {
          clusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [],
            },
          });
          const alertsClient = new AlertsClient<
            { count: number; url: string },
            {},
            {},
            'default',
            'recovered'
          >(alertsClientParams);

          await alertsClient.initializeExecution(defaultExecutionOpts);

          // Report new alert
          alertsClient.report({
            id: '1',
            actionGroup: 'default',
            context: { foo: 'bar' },
            payload: { count: 1, url: `http://localhost:5601` },
          });

          // Update context and payload on the new alert
          alertsClient.setAlertData({
            id: '1',
            context: { foo: 'notbar' },
            payload: { count: 100, url: `https://elastic.co` },
          });

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          expect(clusterClient.bulk).toHaveBeenCalledWith({
            index: '.alerts-test.alerts-default',
            refresh: 'wait_for',
            require_alias: !useDataStreamForAlerts,
            body: [
              {
                create: {
                  _id: expect.any(String),
                  ...(useDataStreamForAlerts ? {} : { require_alias: true }),
                },
              },
              {
                ...getNewIndexedAlertDoc({ [ALERT_UUID]: expect.any(String) }),
                count: 100,
                url: 'https://elastic.co',
                [EVENT_ACTION]: 'open',
                [EVENT_KIND]: 'signal',
                [ALERT_ACTION_GROUP]: 'default',
                [ALERT_DURATION]: 0,
                [ALERT_FLAPPING]: false,
                [ALERT_MUTED]: false,
                [ALERT_FLAPPING_HISTORY]: [true],
                [ALERT_INSTANCE_ID]: '1',
                [ALERT_MAINTENANCE_WINDOW_IDS]: ['test-id1', 'test-id2'],
                [ALERT_MAINTENANCE_WINDOW_NAMES]: ['test-name1', 'test-name2'],
                [ALERT_RULE_CATEGORY]: 'My test rule',
                [ALERT_RULE_CONSUMER]: 'bar',
                [ALERT_RULE_EXECUTION_UUID]: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
                [ALERT_RULE_NAME]: 'rule-name',
                [ALERT_RULE_PARAMETERS]: { bar: true },
                [ALERT_RULE_PRODUCER]: 'alerts',
                [ALERT_RULE_REVISION]: 0,
                [ALERT_RULE_TYPE_ID]: 'test.rule-type',
                [ALERT_RULE_TAGS]: ['rule-', '-tags'],
                [ALERT_RULE_UUID]: '1',
                [ALERT_START]: date,
                [ALERT_STATUS]: 'active',
                [ALERT_TIME_RANGE]: { gte: date },
                [ALERT_UUID]: expect.any(String),
                [ALERT_WORKFLOW_STATUS]: 'open',
                [SPACE_IDS]: ['default'],
                [VERSION]: '8.9.0',
                [TAGS]: ['rule-', '-tags'],
              },
            ],
          });
        });

        test('should successfully update context and payload for ongoing alert', async () => {
          clusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  _source: {
                    ...fetchedAlert1,
                    count: 1,
                    url: 'https://localhost:5601/abc',
                  },
                },
              ],
            },
          });

          const alertsClient = new AlertsClient<
            { count: number; url: string },
            {},
            {},
            'default',
            'recovered'
          >(alertsClientParams);

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              '1': trackedAlert1Raw,
            },
          });

          // Report ongoing alert
          alertsClient.report({
            id: '1',
            actionGroup: 'default',
            context: { foo: 'bar' },
            payload: { count: 1, url: `http://localhost:5601` },
          });

          // Update context and payload on the new alert
          alertsClient.setAlertData({
            id: '1',
            context: { foo: 'notbar' },
            payload: { count: 100, url: `https://elastic.co` },
          });

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          expect(clusterClient.bulk).toHaveBeenCalledWith({
            index: '.alerts-test.alerts-default',
            refresh: 'wait_for',
            require_alias: !useDataStreamForAlerts,
            body: [
              {
                create: {
                  _id: 'abc',
                  ...(useDataStreamForAlerts ? {} : { require_alias: true }),
                },
              },
              {
                ...getOngoingIndexedAlertDoc({ [ALERT_UUID]: 'abc' }),
                count: 100,
                url: 'https://elastic.co',
                [EVENT_ACTION]: 'active',
                [EVENT_KIND]: 'signal',
                [ALERT_ACTION_GROUP]: 'default',
                [ALERT_DURATION]: 36000000000,
                [ALERT_FLAPPING]: false,
                [ALERT_MUTED]: false,
                [ALERT_FLAPPING_HISTORY]: [true, false],
                [ALERT_INSTANCE_ID]: '1',
                [ALERT_MAINTENANCE_WINDOW_IDS]: [],
                [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
                [ALERT_RULE_CATEGORY]: 'My test rule',
                [ALERT_RULE_CONSUMER]: 'bar',
                [ALERT_RULE_EXECUTION_UUID]: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
                [ALERT_RULE_NAME]: 'rule-name',
                [ALERT_RULE_PARAMETERS]: { bar: true },
                [ALERT_RULE_PRODUCER]: 'alerts',
                [ALERT_RULE_REVISION]: 0,
                [ALERT_RULE_TYPE_ID]: 'test.rule-type',
                [ALERT_RULE_TAGS]: ['rule-', '-tags'],
                [ALERT_RULE_UUID]: '1',
                [ALERT_UUID]: 'abc',
                [ALERT_START]: '2023-03-28T12:27:28.159Z',
                [ALERT_STATUS]: 'active',
                [ALERT_TIME_RANGE]: { gte: '2023-03-28T12:27:28.159Z' },
                [ALERT_WORKFLOW_STATUS]: 'open',
                [SPACE_IDS]: ['default'],
                [VERSION]: '8.9.0',
                [TAGS]: ['rule-', '-tags'],
                [ALERT_STATE_NAMESPACE]: { foo: true },
              },
            ],
          });
        });

        test('should successfully update context and payload for recovered alert', async () => {
          clusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  _seq_no: 42,
                  _primary_term: 666,
                  _source: {
                    ...fetchedAlert1,
                    count: 1,
                    url: 'https://localhost:5601/abc',
                  },
                },
              ],
            },
          });

          const alertsClient = new AlertsClient<
            { count: number; url: string },
            {},
            {},
            'default',
            'recovered'
          >(alertsClientParams);

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              '1': trackedAlert1Raw,
            },
          });

          // Don't report any alerts so existing alert recovers

          // Update context and payload on the new alert
          alertsClient.setAlertData({
            id: '1',
            context: { foo: 'notbar' },
            payload: { count: 100, url: `https://elastic.co` },
          });

          await alertsClient.processAlerts();
          alertsClient.determineFlappingAlerts();
          alertsClient.determineDelayedAlerts(determineDelayedAlertsOpts);
          alertsClient.logAlerts(logAlertsOpts);

          await alertsClient.persistAlerts();

          expect(clusterClient.bulk).toHaveBeenCalledWith({
            index: '.alerts-test.alerts-default',
            refresh: 'wait_for',
            require_alias: !useDataStreamForAlerts,
            body: [
              {
                index: {
                  _id: 'abc',
                  if_primary_term: 666,
                  if_seq_no: 42,
                  _index: '.internal.alerts-test.alerts-default-000001',
                  require_alias: false,
                },
              },
              {
                ...getRecoveredIndexedAlertDoc({ [ALERT_UUID]: 'abc' }),
                count: 100,
                url: 'https://elastic.co',
                [EVENT_ACTION]: 'close',
                [EVENT_KIND]: 'signal',
                [ALERT_ACTION_GROUP]: 'recovered',
                [ALERT_DURATION]: 36000000000,
                [ALERT_END]: date,
                [ALERT_FLAPPING]: false,
                [ALERT_MUTED]: false,
                [ALERT_FLAPPING_HISTORY]: [true, true],
                [ALERT_INSTANCE_ID]: '1',
                [ALERT_MAINTENANCE_WINDOW_IDS]: [],
                [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
                [ALERT_RULE_CATEGORY]: 'My test rule',
                [ALERT_RULE_CONSUMER]: 'bar',
                [ALERT_RULE_EXECUTION_UUID]: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
                [ALERT_RULE_NAME]: 'rule-name',
                [ALERT_RULE_PARAMETERS]: { bar: true },
                [ALERT_RULE_PRODUCER]: 'alerts',
                [ALERT_RULE_REVISION]: 0,
                [ALERT_RULE_TYPE_ID]: 'test.rule-type',
                [ALERT_RULE_TAGS]: ['rule-', '-tags'],
                [ALERT_RULE_UUID]: '1',
                [ALERT_UUID]: 'abc',
                [ALERT_START]: '2023-03-28T12:27:28.159Z',
                [ALERT_STATUS]: 'recovered',
                [ALERT_TIME_RANGE]: { gte: '2023-03-28T12:27:28.159Z', lte: date },
                [ALERT_WORKFLOW_STATUS]: 'open',
                [SPACE_IDS]: ['default'],
                [VERSION]: '8.9.0',
                [TAGS]: ['rule-', '-tags'],
                [ALERT_STATE_NAMESPACE]: { foo: true },
              },
            ],
          });
        });
      });

      describe('client()', () => {
        test('only returns subset of functionality', async () => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          await alertsClient.initializeExecution(defaultExecutionOpts);

          const publicAlertsClient = alertsClient.client();

          expect(keys(publicAlertsClient)).toEqual([
            'report',
            'isTrackedAlert',
            'setAlertData',
            'getAlertLimitValue',
            'setAlertLimitReached',
            'getRecoveredAlerts',
          ]);
        });

        test('should return recovered alert document with recovered alert, if it exists', async () => {
          clusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  _seq_no: 42,
                  _primary_term: 666,
                  _source: fetchedAlert1,
                },
              ],
            },
          });

          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );
          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              '1': trackedAlert1Raw,
            },
          });

          // report no alerts to allow existing alert to recover

          const publicAlertsClient = alertsClient.client();
          const recoveredAlerts = publicAlertsClient.getRecoveredAlerts();
          expect(recoveredAlerts.length).toEqual(1);
          const recoveredAlert = recoveredAlerts[0];
          expect(recoveredAlert.alert.getId()).toEqual('1');
          expect(recoveredAlert.alert.getUuid()).toEqual('abc');
          expect(recoveredAlert.alert.getStart()).toEqual('2023-03-28T12:27:28.159Z');
          expect(recoveredAlert.hit).toEqual(fetchedAlert1);
        });

        test('should return undefined document with recovered alert, if it does not exists', async () => {
          clusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [],
            },
          });
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );
          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: {
              '1': trackedAlert1Raw,
            },
          });

          // report no alerts to allow existing alert to recover

          const publicAlertsClient = alertsClient.client();
          const recoveredAlerts = publicAlertsClient.getRecoveredAlerts();
          expect(recoveredAlerts.length).toEqual(1);
          const recoveredAlert = recoveredAlerts[0];
          expect(recoveredAlert.alert.getId()).toEqual('1');
          expect(recoveredAlert.alert.getUuid()).toEqual('abc');
          expect(recoveredAlert.alert.getStart()).toEqual('2023-03-28T12:27:28.159Z');
          expect(recoveredAlert.hit).toBeUndefined();
        });
      });

      describe('isTrackedAlert()', () => {
        test('should return true if alert was active in a previous execution, false otherwise', async () => {
          const alertsClient = new AlertsClient<{}, {}, {}, 'default', 'recovered'>(
            alertsClientParams
          );

          clusterClient.search.mockResolvedValue({
            took: 10,
            timed_out: false,
            _shards: { failed: 0, successful: 1, total: 1, skipped: 0 },
            hits: {
              total: { relation: 'eq', value: 0 },
              hits: [
                {
                  _id: 'abc',
                  _index: '.internal.alerts-test.alerts-default-000001',
                  _seq_no: 42,
                  _primary_term: 666,
                  _source: fetchedAlert1,
                },
                {
                  _id: 'def',
                  _index: '.internal.alerts-test.alerts-default-000002',
                  _seq_no: 42,
                  _primary_term: 666,
                  _source: fetchedAlert2,
                },
              ],
            },
          });

          await alertsClient.initializeExecution({
            ...defaultExecutionOpts,
            activeAlertsFromState: { '1': trackedAlert1Raw, '2': trackedAlert2Raw },
          });

          expect(alertsClient.isTrackedAlert('1')).toBe(true);
          expect(alertsClient.isTrackedAlert('2')).toBe(true);
          expect(alertsClient.isTrackedAlert('3')).toBe(false);
        });
      });
    });
  }
});
