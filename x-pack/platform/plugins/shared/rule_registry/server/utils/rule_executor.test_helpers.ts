/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  elasticsearchServiceMock,
  savedObjectsClientMock,
  uiSettingsServiceMock,
} from '@kbn/core/server/mocks';
import type {
  RuleExecutorOptions,
  AlertInstanceContext,
  AlertInstanceState,
  RuleTypeParams,
  RuleTypeState,
} from '@kbn/alerting-plugin/server';
import { alertsMock } from '@kbn/alerting-plugin/server/mocks';
import { searchSourceCommonMock } from '@kbn/data-plugin/common/search/search_source/mocks';
import type { Logger } from '@kbn/logging';
import type { SharePluginStart } from '@kbn/share-plugin/server';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import { DEFAULT_FLAPPING_SETTINGS } from '@kbn/alerting-plugin/common/rules_settings';
import { asSpaceId } from '@kbn/core-spaces-common';

export const createDefaultAlertExecutorOptions = <
  Params extends RuleTypeParams = never,
  State extends RuleTypeState = never,
  InstanceState extends AlertInstanceState = {},
  InstanceContext extends AlertInstanceContext = {},
  ActionGroupIds extends string = ''
>({
  alertId = 'ALERT_INSTANCE_ID',
  ruleName = 'ALERT_RULE_NAME',
  params,
  state,
  logger,
  createdAt = new Date(),
  startedAt = new Date(),
  updatedAt = new Date(),
  shouldWriteAlerts = true,
}: {
  alertId?: string;
  ruleName?: string;
  params: Params;
  state: State;
  logger: Logger;
  createdAt?: Date;
  startedAt?: Date;
  updatedAt?: Date;
  shouldWriteAlerts?: boolean;
}): RuleExecutorOptions<Params, State, InstanceState, InstanceContext, ActionGroupIds> => ({
  startedAt,
  startedAtOverridden: false,
  rule: {
    id: alertId,
    updatedBy: null,
    tags: ['rule-tag1', 'rule-tag2'],
    name: ruleName,
    createdBy: 'CREATED_BY',
    actions: [],
    enabled: true,
    consumer: 'CONSUMER',
    producer: 'ALERT_PRODUCER',
    schedule: { interval: '1m' },
    throttle: null,
    createdAt,
    updatedAt,
    notifyWhen: null,
    revision: 0,
    ruleTypeId: 'RULE_TYPE_ID',
    ruleTypeName: 'RULE_TYPE_NAME',
    muteAll: false,
    snoozeSchedule: [],
  },
  params,
  spaceId: asSpaceId('space-id'),
  services: {
    alertFactory: alertsMock.createRuleExecutorServices<InstanceState, InstanceContext>()
      .alertFactory,
    alertsClient: null,
    getDataViews: async () => dataViewPluginMocks.createStartContract(),
    getMaintenanceWindowIds: async () => ['test-id-1', 'test-id-2'],
    getMaintenanceWindowNames: async () => ['test-name-1', 'test-name-2'],
    getSearchSourceClient: async () => searchSourceCommonMock,
    savedObjectsClient: savedObjectsClientMock.create(),
    scopedClusterClient: elasticsearchServiceMock.createScopedClusterClient(),
    share: {} as SharePluginStart,
    shouldStopExecution: () => false,
    shouldWriteAlerts: () => shouldWriteAlerts,
    uiSettingsClient: uiSettingsServiceMock.createClient(),
    getAsyncSearchClient: () => ({ search: jest.fn() }),
  },
  state,
  previousStartedAt: null,
  namespace: undefined,
  executionId: 'b33f65d7-6e8b-4aae-8d20-c93613deb33f',
  logger,
  flappingSettings: DEFAULT_FLAPPING_SETTINGS,
  getTimeRange: () => {
    const date = new Date(Date.now()).toISOString();
    return { dateStart: date, dateEnd: date };
  },
  isServerless: false,
});
