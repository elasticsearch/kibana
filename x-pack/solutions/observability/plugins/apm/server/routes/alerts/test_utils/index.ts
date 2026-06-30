/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IBasePath, Logger } from '@kbn/core/server';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import type { IRuleDataClient } from '@kbn/rule-registry-plugin/server';
import { ruleRegistryMocks } from '@kbn/rule-registry-plugin/server/mocks';
import type { AlertingServerSetup } from '@kbn/alerting-plugin/server';
import type { ObservabilityPluginSetup } from '@kbn/observability-plugin/server';
import { DEFAULT_FLAPPING_SETTINGS } from '@kbn/alerting-plugin/common';
import type { APMConfig } from '../../..';
import { APM_SERVER_FEATURE_ID } from '../../..';
import type { RegisterRuleDependencies } from '../register_apm_rule_types';

export const createRuleTypeMocks = () => {
  let alertExecutor: (...args: any[]) => Promise<any>;

  const loggerMock = {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;

  const alerting = {
    registerType: ({ executor }) => {
      alertExecutor = executor;
    },
  } as AlertingServerSetup;

  const scheduleActions = jest.fn();
  const getUuid = jest.fn();

  const services = {
    scopedClusterClient: elasticsearchServiceMock.createScopedClusterClient(),
    savedObjectsClient: {
      get: () => ({ attributes: { consumer: APM_SERVER_FEATURE_ID } }),
    },
    uiSettingsClient: {
      get: jest.fn(),
    },
    alertFactory: {
      create: jest.fn(() => ({ scheduleActions, getUuid })),
      done: {},
    },
    alertWithLifecycle: jest.fn(),
    logger: loggerMock,
    shouldWriteAlerts: () => true,
    alertsClient: {
      report: jest.fn(),
      setAlertData: jest.fn(),
      getRecoveredAlerts: jest.fn(),
    },
  };

  const dependencies = {
    alerting,
    basePath: {
      prepend: (path: string) => `http://localhost:5601/eyr${path}`,
      publicBaseUrl: 'http://localhost:5601/eyr',
      serverBasePath: '/eyr',
    } as IBasePath,
    apmConfig: {
      searchAggregatedTransactions: true,
    } as any as APMConfig,
    getApmIndices: async () => ({
      error: 'apm-*',
      transaction: 'apm-*',
      span: 'apm-*',
      metric: 'apm-*',
      onboarding: 'apm-*',
    }),
    observability: {
      getAlertDetailsConfig: jest.fn().mockReturnValue({ apm: true }),
    } as unknown as ObservabilityPluginSetup,
    logger: loggerMock,
    ruleDataClient: ruleRegistryMocks.createRuleDataClient(
      '.alerts-observability.apm.alerts'
    ) as IRuleDataClient,
  } as unknown as RegisterRuleDependencies;

  return {
    dependencies,
    services,
    scheduleActions,
    executor: async ({
      params,
      previousStartedAt = null,
    }: {
      params: Record<string, any>;
      previousStartedAt?: Date | null;
    }) => {
      return alertExecutor({
        services,
        params,
        rule: {
          consumer: APM_SERVER_FEATURE_ID,
          name: 'name',
          producer: 'producer',
          ruleTypeId: 'ruleTypeId',
          ruleTypeName: 'ruleTypeName',
        },
        startedAt: new Date(),
        previousStartedAt,
        flappingSettings: DEFAULT_FLAPPING_SETTINGS,
        getTimeRange: () => {
          const date = new Date(Date.now()).toISOString();
          return { dateStart: date, dateEnd: date };
        },
      });
    },
  };
};
