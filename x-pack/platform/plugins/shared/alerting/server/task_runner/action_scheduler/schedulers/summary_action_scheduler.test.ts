/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import sinon from 'sinon';
import { actionsClientMock, actionsMock } from '@kbn/actions-plugin/server/mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { alertsClientMock } from '../../../alerts_client/alerts_client.mock';
import { alertingEventLoggerMock } from '../../../lib/alerting_event_logger/alerting_event_logger.mock';
import { RuleRunMetricsStore } from '../../../lib/rule_run_metrics_store';
import { mockAAD } from '../../fixtures';
import { SummaryActionScheduler } from './summary_action_scheduler';
import {
  getRule,
  getRuleType,
  getDefaultSchedulerContext,
  generateAlert,
  generateRecoveredAlert,
} from '../test_fixtures';
import type { RuleAction } from '@kbn/alerting-types';
import { ALERT_UUID } from '@kbn/rule-data-utils';
import {
  getErrorSource,
  TaskErrorSource,
} from '@kbn/task-manager-plugin/server/task_running/errors';
import type { CombinedSummarizedAlerts } from '../../../types';
import { ActionsCompletion } from '@kbn/alerting-state-types';
import { TaskPriority } from '@kbn/task-manager-plugin/server';

const alertingEventLogger = alertingEventLoggerMock.create();
const actionsClient = actionsClientMock.create();
const alertsClient = alertsClientMock.create();
const mockActionsPlugin = actionsMock.createStart();
const logger = loggingSystemMock.create().get();

let ruleRunMetricsStore: RuleRunMetricsStore;
const rule = getRule({
  id: 'rule-id-1',
  actions: [
    {
      id: 'action-1',
      group: 'default',
      actionTypeId: 'test',
      frequency: { summary: false, notifyWhen: 'onActiveAlert', throttle: null },
      params: {
        foo: true,
        contextVal: 'My {{context.value}} goes here',
        stateVal: 'My {{state.value}} goes here',
        alertVal:
          'My {{rule.id}} {{rule.name}} {{rule.spaceId}} {{rule.tags}} {{alert.id}} goes here',
      },
      uuid: '111-111',
    },
    {
      id: 'action-2',
      group: 'default',
      actionTypeId: 'test',
      frequency: { summary: true, notifyWhen: 'onActiveAlert', throttle: null },
      params: {
        foo: true,
        contextVal: 'My {{context.value}} goes here',
        stateVal: 'My {{state.value}} goes here',
        alertVal:
          'My {{rule.id}} {{rule.name}} {{rule.spaceId}} {{rule.tags}} {{alert.id}} goes here',
      },
      uuid: '222-222',
    },
    {
      id: 'action-3',
      group: 'default',
      actionTypeId: 'test',
      frequency: { summary: true, notifyWhen: 'onActiveAlert', throttle: null },
      params: {
        foo: true,
        contextVal: 'My {{context.value}} goes here',
        stateVal: 'My {{state.value}} goes here',
        alertVal:
          'My {{rule.id}} {{rule.name}} {{rule.spaceId}} {{rule.tags}} {{alert.id}} goes here',
      },
      uuid: '333-333',
    },
  ],
});
const ruleType = getRuleType();
const defaultSchedulerContext = getDefaultSchedulerContext(
  logger,
  mockActionsPlugin,
  alertingEventLogger,
  actionsClient,
  alertsClient
);

// @ts-ignore
const getSchedulerContext = (params = {}) => {
  return { ...defaultSchedulerContext, rule, ...params, ruleRunMetricsStore };
};

const getResult = (
  actionId: string,
  actionUuid: string,
  summary: CombinedSummarizedAlerts,
  priority?: number,
  apiKeyId?: string
) => ({
  actionToEnqueue: {
    actionTypeId: 'test',
    apiKey: 'MTIzOmFiYw==',
    consumer: 'rule-consumer',
    executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
    id: actionId,
    uuid: actionUuid,
    relatedSavedObjects: [{ id: 'rule-id-1', namespace: 'test1', type: 'alert', typeId: 'test' }],
    source: { source: { id: 'rule-id-1', type: 'alert' }, type: 'SAVED_OBJECT' },
    spaceId: 'test1',
    ...(priority && { priority }),
    ...(apiKeyId && { apiKeyId }),
  },
  actionToLog: {
    alertSummary: {
      new: summary.new.count,
      ongoing: summary.ongoing.count,
      recovered: summary.recovered.count,
    },
    id: actionId,
    uuid: actionUuid,
    typeId: 'test',
  },
});

let clock: sinon.SinonFakeTimers;

describe('Summary Action Scheduler', () => {
  beforeAll(() => {
    clock = sinon.useFakeTimers();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockActionsPlugin.isActionTypeEnabled.mockReturnValue(true);
    mockActionsPlugin.isActionExecutable.mockReturnValue(true);
    mockActionsPlugin.getActionsClientWithRequest.mockResolvedValue(actionsClient);
    ruleRunMetricsStore = new RuleRunMetricsStore();
  });

  afterAll(() => {
    clock.restore();
  });

  test('should initialize with only summary actions', () => {
    const scheduler = new SummaryActionScheduler(getSchedulerContext());

    // @ts-expect-error private variable
    expect(scheduler.actions).toHaveLength(2);
    // @ts-expect-error private variable
    expect(scheduler.actions).toEqual([rule.actions[1], rule.actions[2]]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('should log if rule type does not support summarized alerts and not initialize any actions', () => {
    const scheduler = new SummaryActionScheduler(
      getSchedulerContext({ ruleType: { ...ruleType, alerts: undefined } })
    );

    // @ts-expect-error private variable
    expect(scheduler.actions).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenNthCalledWith(
      1,
      `Skipping action \"action-2\" for rule \"rule-id-1\" because the rule type \"Test\" does not support alert-as-data.`
    );
    expect(logger.error).toHaveBeenNthCalledWith(
      2,
      `Skipping action \"action-3\" for rule \"rule-id-1\" because the rule type \"Test\" does not support alert-as-data.`
    );
  });

  describe('getActionsToSchedule', () => {
    const newAlert1 = generateAlert({ id: 1 });
    const newAlert2 = generateAlert({ id: 2 });
    const recoveredAlert = generateRecoveredAlert({ id: 3 });
    const alerts = { ...newAlert1, ...newAlert2 };

    const summaryActionWithAlertFilter: RuleAction = {
      id: 'action-3',
      group: 'default',
      actionTypeId: 'test',
      frequency: {
        summary: true,
        notifyWhen: 'onActiveAlert',
        throttle: null,
      },
      params: {
        foo: true,
        contextVal: 'My {{context.value}} goes here',
        stateVal: 'My {{state.value}} goes here',
        alertVal:
          'My {{rule.id}} {{rule.name}} {{rule.spaceId}} {{rule.tags}} {{alert.id}} goes here',
      },
      alertsFilter: { query: { kql: 'kibana.alert.rule.name:foo', dsl: '{}', filters: [] } },
      uuid: '333-333',
    };

    const summaryActionWithThrottle: RuleAction = {
      id: 'action-4',
      group: 'default',
      actionTypeId: 'test',
      frequency: {
        summary: true,
        notifyWhen: 'onThrottleInterval',
        throttle: '1d',
      },
      params: {
        foo: true,
        contextVal: 'My {{context.value}} goes here',
        stateVal: 'My {{state.value}} goes here',
        alertVal:
          'My {{rule.id}} {{rule.name}} {{rule.spaceId}} {{rule.tags}} {{alert.id}} goes here',
      },
      uuid: '444-444',
    };

    test('should create action to schedule for summary action when summary action is per rule run', async () => {
      alertsClient.getProcessedAlerts.mockReturnValue(alerts);
      const summarizedAlerts = {
        new: { count: 2, data: [mockAAD, mockAAD] },
        ongoing: { count: 0, data: [] },
        recovered: { count: 0, data: [] },
      };
      alertsClient.getSummarizedAlerts.mockResolvedValue(summarizedAlerts);

      const throttledSummaryActions = {};
      const scheduler = new SummaryActionScheduler(getSchedulerContext());
      const results = await scheduler.getActionsToSchedule({
        activeAlerts: alerts,
        throttledSummaryActions,
      });

      expect(throttledSummaryActions).toEqual({});
      expect(alertsClient.getSummarizedAlerts).toHaveBeenCalledTimes(2);
      expect(alertsClient.getSummarizedAlerts).toHaveBeenNthCalledWith(1, {
        excludedAlertInstanceIds: [],
        executionUuid: defaultSchedulerContext.executionId,
        ruleId: 'rule-id-1',
        spaceId: 'test1',
      });
      expect(alertsClient.getSummarizedAlerts).toHaveBeenNthCalledWith(2, {
        excludedAlertInstanceIds: [],
        executionUuid: defaultSchedulerContext.executionId,
        ruleId: 'rule-id-1',
        spaceId: 'test1',
      });
      expect(logger.debug).not.toHaveBeenCalled();

      expect(ruleRunMetricsStore.getNumberOfGeneratedActions()).toEqual(2);
      expect(ruleRunMetricsStore.getNumberOfTriggeredActions()).toEqual(2);
      expect(ruleRunMetricsStore.getStatusByConnectorType('test')).toEqual({
        numberOfGeneratedActions: 2,
        numberOfTriggeredActions: 2,
      });

      expect(results).toHaveLength(2);

      const finalSummary = { ...summarizedAlerts, all: { count: 2, data: [mockAAD, mockAAD] } };
      expect(results).toEqual([
        getResult('action-2', '222-222', finalSummary),
        getResult('action-3', '333-333', finalSummary),
      ]);
    });

    test('should include snoozed alert IDs in excludedAlertInstanceIds when querying summarized alerts', async () => {
      alertsClient.getProcessedAlerts.mockReturnValue(alerts);
      const summarizedAlerts = {
        new: { count: 2, data: [mockAAD, mockAAD] },
        ongoing: { count: 0, data: [] },
        recovered: { count: 0, data: [] },
      };
      alertsClient.getSummarizedAlerts.mockResolvedValue(summarizedAlerts);

      const throttledSummaryActions = {};
      const scheduler = new SummaryActionScheduler({
        ...getSchedulerContext(),
        activeSnoozedIds: new Set(['alert-snoozed-1']),
      });
      await scheduler.getActionsToSchedule({ activeAlerts: alerts, throttledSummaryActions });

      expect(alertsClient.getSummarizedAlerts).toHaveBeenCalledWith(
        expect.objectContaining({
          excludedAlertInstanceIds: expect.arrayContaining(['alert-snoozed-1']),
        })
      );
    });

    test('should create action to schedule with priority if specified for summary action when summary action is per rule run', async () => {
      alertsClient.getProcessedAlerts.mockReturnValue(alerts);
      const summarizedAlerts = {
        new: { count: 2, data: [mockAAD, mockAAD] },
        ongoing: { count: 0, data: [] },
        recovered: { count: 0, data: [] },
      };
      alertsClient.getSummarizedAlerts.mockResolvedValue(summarizedAlerts);

      const throttledSummaryActions = {};
      const scheduler = new SummaryActionScheduler({
        ...getSchedulerContext(),
        priority: TaskPriority.Low,
      });
      const results = await scheduler.getActionsToSchedule({
        activeAlerts: alerts,
        throttledSummaryActions,
      });

      expect(throttledSummaryActions).toEqual({});
      expect(alertsClient.getSummarizedAlerts).toHaveBeenCalledTimes(2);
      expect(alertsClient.getSummarizedAlerts).toHaveBeenNthCalledWith(1, {
        excludedAlertInstanceIds: [],
        executionUuid: defaultSchedulerContext.executionId,
        ruleId: 'rule-id-1',
        spaceId: 'test1',
      });
      expect(alertsClient.getSummarizedAlerts).toHaveBeenNthCalledWith(2, {
        excludedAlertInstanceIds: [],
        executionUuid: defaultSchedulerContext.executionId,
        ruleId: 'rule-id-1',
        spaceId: 'test1',
      });
      expect(logger.debug).not.toHaveBeenCalled();

      expect(ruleRunMetricsStore.getNumberOfGeneratedActions()).toEqual(2);
      expect(ruleRunMetricsStore.getNumberOfTriggeredActions()).toEqual(2);
      expect(ruleRunMetricsStore.getStatusByConnectorType('test')).toEqual({
        numberOfGeneratedActions: 2,
        numberOfTriggeredActions: 2,
      });

      expect(results).toHaveLength(2);

      const finalSummary = { ...summarizedAlerts, all: { count: 2, data: [mockAAD, mockAAD] } };
      expect(results).toEqual([
        getResult('action-2', '222-222', finalSummary, 1),
        getResult('action-3', '333-333', finalSummary, 1),
      ]);
    });

    test('should create action to schedule with apiKeyId if specified for summary action when summary action is per rule run', async () => {
      alertsClient.getProcessedAlerts.mockReturnValue(alerts);
      const summarizedAlerts = {
        new: { count: 2, data: [mockAAD, mockAAD] },
        ongoing: { count: 0, data: [] },
        recovered: { count: 0, data: [] },
      };
      alertsClient.getSummarizedAlerts.mockResolvedValue(summarizedAlerts);

      const throttledSummaryActions = {};
      const scheduler = new SummaryActionScheduler({
        ...getSchedulerContext(),
        apiKeyId: '24534wy3wydfbs',
      });
      const results = await scheduler.getActionsToSchedule({
        activeAlerts: alerts,
        throttledSummaryActions,
      });

      expect(throttledSummaryActions).toEqual({});
      expect(alertsClient.getSummarizedAlerts).toHaveBeenCalledTimes(2);
      expect(alertsClient.getSummarizedAlerts).toHaveBeenNthCalledWith(1, {
        excludedAlertInstanceIds: [],
        executionUuid: defaultSchedulerContext.executionId,
        ruleId: 'rule-id-1',
        spaceId: 'test1',
      });
      expect(alertsClient.getSummarizedAlerts).toHaveBeenNthCalledWith(2, {
        excludedAlertInstanceIds: [],
        executionUuid: defaultSchedulerContext.executionId,
        ruleId: 'rule-id-1',
        spaceId: 'test1',
      });
      expect(logger.debug).not.toHaveBeenCalled();

      expect(ruleRunMetricsStore.getNumberOfGeneratedActions()).toEqual(2);
      expect(ruleRunMetricsStore.getNumberOfTriggeredActions()).toEqual(2);
      expect(ruleRunMetricsStore.getStatusByConnectorType('test')).toEqual({
        numberOfGeneratedActions: 2,
        numberOfTriggeredActions: 2,
      });

      expect(results).toHaveLength(2);

      const finalSummary = { ...summarizedAlerts, all: { count: 2, data: [mockAAD, mockAAD] } };
      expect(results).toEqual([
        getResult('action-2', '222-222', finalSummary, undefined, '24534wy3wydfbs'),
        getResult('action-3', '333-333', finalSummary, undefined, '24534wy3wydfbs'),
      ]);
    });

    test('should create actions to schedule for summary action when summary action has alertsFilter', async () => {
      alertsClient.getProcessedAlerts.mockReturnValue(alerts);
      const summarizedAlerts = {
        new: { count: 2, data: [mockAAD, mockAAD] },
        ongoing: { count: 0, data: [] },
        recovered: { count: 0, data: [] },
      };
      alertsClient.getSummarizedAlerts.mockResolvedValue(summarizedAlerts);

      const scheduler = new SummaryActionScheduler({
        ...getSchedulerContext(),
        rule: { ...rule, actions: [summaryActionWithAlertFilter] },
      });

      const throttledSummaryActions = {};
      const results = await scheduler.getActionsToSchedule({
        activeAlerts: alerts,
        throttledSummaryActions,
      });

      expect(throttledSummaryActions).toEqual({});
      expect(alertsClient.getSummarizedAlerts).toHaveBeenCalledTimes(1);
      expect(alertsClient.getSummarizedAlerts).toHaveBeenCalledWith({
        excludedAlertInstanceIds: [],
        executionUuid: defaultSchedulerContext.executionId,
        ruleId: 'rule-id-1',
        spaceId: 'test1',
        alertsFilter: { query: { kql: 'kibana.alert.rule.name:foo', dsl: '{}', filters: [] } },
      });
      expect(logger.debug).not.toHaveBeenCalled();

      expect(ruleRunMetricsStore.getNumberOfGeneratedActions()).toEqual(1);
      expect(ruleRunMetricsStore.getNumberOfTriggeredActions()).toEqual(1);
      expect(ruleRunMetricsStore.getStatusByConnectorType('test')).toEqual({
        numberOfGeneratedActions: 1,
        numberOfTriggeredActions: 1,
      });

      expect(results).toHaveLength(1);

      const finalSummary = { ...summarizedAlerts, all: { count: 2, data: [mockAAD, mockAAD] } };
      expect(results).toEqual([getResult('action-3', '333-333', finalSummary)]);
    });

    test('should create actions to schedule for summary action when summary action is throttled with no throttle history', async () => {
      alertsClient.getProcessedAlerts.mockReturnValue(alerts);
      const summarizedAlerts = {
        new: { count: 2, data: [mockAAD, mockAAD] },
        ongoing: { count: 0, data: [] },
        recovered: { count: 0, data: [] },
      };
      alertsClient.getSummarizedAlerts.mockResolvedValue(summarizedAlerts);

      const scheduler = new SummaryActionScheduler({
        ...getSchedulerContext(),
        rule: { ...rule, actions: [summaryActionWithThrottle] },
      });

      const throttledSummaryActions = {};
      const results = await scheduler.getActionsToSchedule({
        activeAlerts: alerts,
        throttledSummaryActions,
      });

      expect(throttledSummaryActions).toEqual({ '444-444': { date: '1970-01-01T00:00:00.000Z' } });
      expect(alertsClient.getSummarizedAlerts).toHaveBeenCalledTimes(1);
      expect(alertsClient.getSummarizedAlerts).toHaveBeenCalledWith({
        excludedAlertInstanceIds: [],
        ruleId: 'rule-id-1',
        spaceId: 'test1',
        start: new Date('1969-12-31T00:00:00.000Z'),
        end: new Date(),
      });
      expect(logger.debug).not.toHaveBeenCalled();

      expect(ruleRunMetricsStore.getNumberOfGeneratedActions()).toEqual(1);
      expect(ruleRunMetricsStore.getNumberOfTriggeredActions()).toEqual(1);
      expect(ruleRunMetricsStore.getStatusByConnectorType('test')).toEqual({
        numberOfGeneratedActions: 1,
        numberOfTriggeredActions: 1,
      });

      expect(results).toHaveLength(1);

      const finalSummary = { ...summarizedAlerts, all: { count: 2, data: [mockAAD, mockAAD] } };
      expect(results).toEqual([getResult('action-4', '444-444', finalSummary)]);
    });

    test('should skip creating actions to schedule for summary action when summary action is throttled', async () => {
      const scheduler = new SummaryActionScheduler({
        ...getSchedulerContext(),
        rule: { ...rule, actions: [summaryActionWithThrottle] },
      });

      const throttledSummaryActions = { '444-444': { date: '1969-12-31T13:00:00.000Z' } };
      const results = await scheduler.getActionsToSchedule({
        activeAlerts: alerts,
        throttledSummaryActions,
      });

      expect(throttledSummaryActions).toEqual({ '444-444': { date: '1969-12-31T13:00:00.000Z' } });
      expect(alertsClient.getSummarizedAlerts).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        `skipping scheduling the action 'test:action-4', summary action is still being throttled`
      );

      expect(ruleRunMetricsStore.getNumberOfGeneratedActions()).toEqual(0);
      expect(ruleRunMetricsStore.getNumberOfTriggeredActions()).toEqual(0);

      expect(results).toHaveLength(0);
    });

    test('should remove new alerts from summary if suppressed by maintenance window', async () => {
      const newAlertWithMaintenanceWindow = generateAlert({
        id: 1,
        maintenanceWindowIds: ['mw-1'],
      });
      const alertsWithMaintenanceWindow = { ...newAlertWithMaintenanceWindow, ...newAlert2 };
      alertsClient.getProcessedAlerts.mockReturnValue(alertsWithMaintenanceWindow);
      const newAADAlerts = [
        { ...mockAAD, [ALERT_UUID]: newAlertWithMaintenanceWindow[1].getUuid() },
        mockAAD,
      ];
      const summarizedAlerts = {
        new: { count: 2, data: newAADAlerts },
        ongoing: { count: 0, data: [] },
        recovered: { count: 0, data: [] },
      };
      alertsClient.getSummarizedAlerts.mockResolvedValue(summarizedAlerts);
      const scheduler = new SummaryActionScheduler(getSchedulerContext());

      const throttledSummaryActions = {};
      const results = await scheduler.getActionsToSchedule({
        activeAlerts: alerts,
        throttledSummaryActions,
      });

      expect(throttledSummaryActions).toEqual({});
      expect(alertsClient.getSummarizedAlerts).toHaveBeenCalledTimes(2);
      expect(alertsClient.getSummarizedAlerts).toHaveBeenNthCalledWith(1, {
        excludedAlertInstanceIds: [],
        executionUuid: defaultSchedulerContext.executionId,
        ruleId: 'rule-id-1',
        spaceId: 'test1',
      });
      expect(alertsClient.getSummarizedAlerts).toHaveBeenNthCalledWith(2, {
        excludedAlertInstanceIds: [],
        executionUuid: defaultSchedulerContext.executionId,
        ruleId: 'rule-id-1',
        spaceId: 'test1',
      });
      expect(logger.debug).toHaveBeenCalledTimes(2);
      expect(logger.debug).toHaveBeenNthCalledWith(
        1,
        `(1) alert has been filtered out for: test:222-222`
      );
      expect(logger.debug).toHaveBeenNthCalledWith(
        2,
        `(1) alert has been filtered out for: test:333-333`
      );

      expect(ruleRunMetricsStore.getNumberOfGeneratedActions()).toEqual(2);
      expect(ruleRunMetricsStore.getNumberOfTriggeredActions()).toEqual(2);
      expect(ruleRunMetricsStore.getStatusByConnectorType('test')).toEqual({
        numberOfGeneratedActions: 2,
        numberOfTriggeredActions: 2,
      });

      expect(results).toHaveLength(2);

      const finalSummary = {
        all: { count: 1, data: [newAADAlerts[1]] },
        new: { count: 1, data: [newAADAlerts[1]] },
        ongoing: { count: 0, data: [] },
        recovered: { count: 0, data: [] },
      };
      expect(results).toEqual([
        getResult('action-2', '222-222', finalSummary),
        getResult('action-3', '333-333', finalSummary),
      ]);
    });

    test('should create alerts to schedule for summary action and log when alerts have been filtered out by action condition', async () => {
      alertsClient.getProcessedAlerts.mockReturnValue(alerts);
      const summarizedAlerts = {
        new: { count: 1, data: [mockAAD] },
        ongoing: { count: 0, data: [] },
        recovered: { count: 0, data: [] },
      };
      alertsClient.getSummarizedAlerts.mockResolvedValue(summarizedAlerts);

      const scheduler = new SummaryActionScheduler({
        ...getSchedulerContext(),
        rule: { ...rule, actions: [summaryActionWithAlertFilter] },
      });

      const throttledSummaryActions = {};
      const results = await scheduler.getActionsToSchedule({
        activeAlerts: alerts,
        recoveredAlerts: recoveredAlert,
        throttledSummaryActions,
      });

      expect(throttledSummaryActions).toEqual({});
      expect(alertsClient.getSummarizedAlerts).toHaveBeenCalledTimes(1);
      expect(alertsClient.getSummarizedAlerts).toHaveBeenCalledWith({
        excludedAlertInstanceIds: [],
        executionUuid: defaultSchedulerContext.executionId,
        ruleId: 'rule-id-1',
        spaceId: 'test1',
        alertsFilter: { query: { kql: 'kibana.alert.rule.name:foo', dsl: '{}', filters: [] } },
      });
      expect(logger.debug).toHaveBeenCalledTimes(1);
      expect(logger.debug).toHaveBeenCalledWith(
        `(2) alerts have been filtered out for: test:333-333`
      );

      expect(ruleRunMetricsStore.getNumberOfGeneratedActions()).toEqual(1);
      expect(ruleRunMetricsStore.getNumberOfTriggeredActions()).toEqual(1);
      expect(ruleRunMetricsStore.getStatusByConnectorType('test')).toEqual({
        numberOfGeneratedActions: 1,
        numberOfTriggeredActions: 1,
      });

      expect(results).toHaveLength(1);

      const finalSummary = { ...summarizedAlerts, all: { count: 1, data: [mockAAD] } };
      expect(results).toEqual([getResult('action-3', '333-333', finalSummary)]);
    });

    test('should skip creating actions to schedule for summary action when no alerts found', async () => {
      alertsClient.getProcessedAlerts.mockReturnValue(alerts);
      const summarizedAlerts = {
        new: { count: 0, data: [] },
        ongoing: { count: 0, data: [] },
        recovered: { count: 0, data: [] },
      };
      alertsClient.getSummarizedAlerts.mockResolvedValue(summarizedAlerts);

      const scheduler = new SummaryActionScheduler({
        ...getSchedulerContext(),
        rule: { ...rule, actions: [summaryActionWithThrottle] },
      });

      const throttledSummaryActions = {};
      const results = await scheduler.getActionsToSchedule({
        activeAlerts: alerts,
        throttledSummaryActions,
      });

      expect(throttledSummaryActions).toEqual({});
      expect(alertsClient.getSummarizedAlerts).toHaveBeenCalledTimes(1);
      expect(alertsClient.getSummarizedAlerts).toHaveBeenCalledWith({
        excludedAlertInstanceIds: [],
        ruleId: 'rule-id-1',
        spaceId: 'test1',
        start: new Date('1969-12-31T00:00:00.000Z'),
        end: new Date(),
      });
      expect(logger.debug).not.toHaveBeenCalled();

      expect(ruleRunMetricsStore.getNumberOfGeneratedActions()).toEqual(0);
      expect(ruleRunMetricsStore.getNumberOfTriggeredActions()).toEqual(0);
      expect(results).toHaveLength(0);
    });

    test('should throw framework error if getSummarizedAlerts throws error', async () => {
      alertsClient.getProcessedAlerts.mockReturnValue(alerts);
      alertsClient.getSummarizedAlerts.mockImplementation(() => {
        throw new Error('no alerts for you');
      });

      const scheduler = new SummaryActionScheduler(getSchedulerContext());

      try {
        await scheduler.getActionsToSchedule({
          activeAlerts: alerts,
          throttledSummaryActions: {},
        });
      } catch (err) {
        expect(err.message).toEqual(`no alerts for you`);
        expect(getErrorSource(err)).toBe(TaskErrorSource.FRAMEWORK);
      }
    });

    test('should skip creating actions to schedule if overall max actions limit exceeded', async () => {
      alertsClient.getProcessedAlerts.mockReturnValue(alerts);
      const summarizedAlerts = {
        new: { count: 2, data: [mockAAD, mockAAD] },
        ongoing: { count: 0, data: [] },
        recovered: { count: 0, data: [] },
      };
      alertsClient.getSummarizedAlerts.mockResolvedValue(summarizedAlerts);

      const defaultContext = getSchedulerContext();
      const scheduler = new SummaryActionScheduler({
        ...defaultContext,
        taskRunnerContext: {
          ...defaultContext.taskRunnerContext,
          actionsConfigMap: {
            default: { max: 1 },
          },
        },
      });
      const results = await scheduler.getActionsToSchedule({
        activeAlerts: alerts,
        throttledSummaryActions: {},
      });

      expect(alertsClient.getSummarizedAlerts).toHaveBeenCalledTimes(2);
      expect(alertsClient.getSummarizedAlerts).toHaveBeenNthCalledWith(1, {
        excludedAlertInstanceIds: [],
        executionUuid: defaultSchedulerContext.executionId,
        ruleId: 'rule-id-1',
        spaceId: 'test1',
      });
      expect(alertsClient.getSummarizedAlerts).toHaveBeenNthCalledWith(2, {
        excludedAlertInstanceIds: [],
        executionUuid: defaultSchedulerContext.executionId,
        ruleId: 'rule-id-1',
        spaceId: 'test1',
      });

      expect(ruleRunMetricsStore.getNumberOfGeneratedActions()).toEqual(2);
      expect(ruleRunMetricsStore.getNumberOfTriggeredActions()).toEqual(1);
      expect(ruleRunMetricsStore.getStatusByConnectorType('test')).toEqual({
        numberOfGeneratedActions: 2,
        numberOfTriggeredActions: 1,
        triggeredActionsStatus: ActionsCompletion.PARTIAL,
      });

      expect(logger.debug).toHaveBeenCalledWith(
        `Rule "rule-id-1" skipped scheduling action "action-3" because the maximum number of allowed actions has been reached.`
      );

      expect(results).toHaveLength(1);

      const finalSummary = { ...summarizedAlerts, all: { count: 2, data: [mockAAD, mockAAD] } };
      expect(results).toEqual([getResult('action-2', '222-222', finalSummary)]);
    });

    test('should skip creating actions to schedule if connector type max actions limit exceeded', async () => {
      alertsClient.getProcessedAlerts.mockReturnValue(alerts);
      const summarizedAlerts = {
        new: { count: 2, data: [mockAAD, mockAAD] },
        ongoing: { count: 0, data: [] },
        recovered: { count: 0, data: [] },
      };
      alertsClient.getSummarizedAlerts.mockResolvedValue(summarizedAlerts);

      const defaultContext = getSchedulerContext();
      const scheduler = new SummaryActionScheduler({
        ...defaultContext,
        taskRunnerContext: {
          ...defaultContext.taskRunnerContext,
          actionsConfigMap: {
            default: { max: 1000 },
            test: { max: 1 },
          },
        },
      });
      const results = await scheduler.getActionsToSchedule({
        activeAlerts: alerts,
        throttledSummaryActions: {},
      });

      expect(alertsClient.getSummarizedAlerts).toHaveBeenCalledTimes(2);
      expect(alertsClient.getSummarizedAlerts).toHaveBeenNthCalledWith(1, {
        excludedAlertInstanceIds: [],
        executionUuid: defaultSchedulerContext.executionId,
        ruleId: 'rule-id-1',
        spaceId: 'test1',
      });
      expect(alertsClient.getSummarizedAlerts).toHaveBeenNthCalledWith(2, {
        excludedAlertInstanceIds: [],
        executionUuid: defaultSchedulerContext.executionId,
        ruleId: 'rule-id-1',
        spaceId: 'test1',
      });

      expect(ruleRunMetricsStore.getNumberOfGeneratedActions()).toEqual(2);
      expect(ruleRunMetricsStore.getNumberOfTriggeredActions()).toEqual(1);
      expect(ruleRunMetricsStore.getStatusByConnectorType('test')).toEqual({
        numberOfGeneratedActions: 2,
        numberOfTriggeredActions: 1,
        triggeredActionsStatus: ActionsCompletion.PARTIAL,
      });

      expect(logger.debug).toHaveBeenCalledWith(
        `Rule "rule-id-1" skipped scheduling action "action-3" because the maximum number of allowed actions for connector type test has been reached.`
      );

      expect(results).toHaveLength(1);
      const finalSummary = { ...summarizedAlerts, all: { count: 2, data: [mockAAD, mockAAD] } };
      expect(results).toEqual([getResult('action-2', '222-222', finalSummary)]);
    });
  });
});
