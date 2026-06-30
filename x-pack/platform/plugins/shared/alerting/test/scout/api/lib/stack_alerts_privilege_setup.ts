/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RoleApiCredentials } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import type { ApiClientFixture } from '@kbn/scout/src/playwright/fixtures/scope/worker';
import { COMMON_HEADERS } from '../fixtures/constants';
import { waitForSuccessfulEventLogEntry } from './wait_for_successful_event_log';

const ES_QUERY_PARAMS = {
  index: ['.kibana-event-log-*'],
  timeField: '@timestamp',
  esQuery: '{\n  "query":{\n    "match_all" : {}\n  }\n}',
  size: 100,
  timeWindowSize: 5,
  timeWindowUnit: 'm',
  thresholdComparator: '>',
  threshold: [0],
  searchType: 'esQuery',
  excludeHitsFromPreviousRun: true,
  aggType: 'count',
  groupBy: 'all',
};

const INDEX_THRESHOLD_PARAMS = {
  aggType: 'count',
  termSize: 5,
  thresholdComparator: '>' as const,
  timeWindowSize: 5,
  timeWindowUnit: 'm' as const,
  groupBy: 'all' as const,
  threshold: [1000000],
  index: ['.kibana-event-log-*'],
  timeField: '@timestamp',
};

export interface RuleSpec {
  ruleTypeId: string;
  consumer: string;
  params: Record<string, unknown>;
  enabled: boolean;
}

export const RULE_SPECS: RuleSpec[] = [
  {
    ruleTypeId: '.es-query',
    consumer: 'stackAlerts',
    params: ES_QUERY_PARAMS,
    enabled: true,
  },
  {
    ruleTypeId: '.index-threshold',
    consumer: 'stackAlerts',
    params: INDEX_THRESHOLD_PARAMS,
    enabled: false,
  },
];

export const FAKE_ALERT_INSTANCE_ID = 'fake-instance-id';

export interface StackAlertsPrivilegeState {
  adminCreds: RoleApiCredentials;
  createdRules: Array<{ ruleTypeId: string; ruleId: string }>;
  enabledRuleId: string;
  realAlertId: string;
}

export const setupStackAlertsPrivilegeTests = async (
  apiClient: ApiClientFixture,
  requestAuth: { getApiKey: Function },
  samlAuth: { asInteractiveUser: Function }
): Promise<StackAlertsPrivilegeState> => {
  const adminCreds = await requestAuth.getApiKey('admin');
  const createdRules: Array<{ ruleTypeId: string; ruleId: string }> = [];
  let enabledRuleId: string | undefined;

  for (const spec of RULE_SPECS) {
    const response = await apiClient.post('api/alerting/rule', {
      headers: { ...COMMON_HEADERS, ...adminCreds.apiKeyHeader },
      body: {
        name: `Scout stack-alerts-priv: ${spec.ruleTypeId}`,
        rule_type_id: spec.ruleTypeId,
        consumer: spec.consumer,
        schedule: { interval: '1m' },
        enabled: spec.enabled,
        params: spec.params,
        actions: [],
        tags: ['scout-stack-alerts-priv'],
      },
      responseType: 'json',
    });
    expect(response).toHaveStatusCode(200);

    const ruleId = (response.body as { id: string }).id;
    createdRules.push({ ruleTypeId: spec.ruleTypeId, ruleId });
    if (spec.enabled) {
      enabledRuleId = ruleId;
    }
  }

  expect(enabledRuleId, 'expected at least one enabled rule spec').toBeDefined();

  const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
  await waitForSuccessfulEventLogEntry(apiClient, enabledRuleId!, {
    ...COMMON_HEADERS,
    ...cookieHeader,
  });

  const findResponse = await apiClient.post('internal/rac/alerts/find', {
    headers: { ...COMMON_HEADERS, ...cookieHeader },
    body: {
      rule_type_ids: ['.es-query'],
      consumers: ['stackAlerts'],
      query: { match_all: {} },
      size: 1,
    },
    responseType: 'json',
  });
  const findBody = findResponse.body as { hits?: { hits?: Array<{ _id: string }> } };
  const realAlertId = findBody?.hits?.hits?.[0]?._id;
  expect(realAlertId, 'expected an alert to be generated for the enabled rule').toBeDefined();

  return { adminCreds, createdRules, enabledRuleId: enabledRuleId!, realAlertId: realAlertId! };
};

export const teardownStackAlertsPrivilegeTests = async (
  apiClient: ApiClientFixture,
  state: StackAlertsPrivilegeState
) => {
  for (const { ruleId } of state.createdRules) {
    await apiClient.delete(`api/alerting/rule/${ruleId}`, {
      headers: { ...COMMON_HEADERS, ...state.adminCreds.apiKeyHeader },
    });
  }
};
