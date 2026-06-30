/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import type { RoleApiCredentials } from '@kbn/scout';
import { COMMON_HEADERS } from '../fixtures/constants';
import {
  RULE_SPECS,
  FAKE_ALERT_INSTANCE_ID,
  setupStackAlertsPrivilegeTests,
  teardownStackAlertsPrivilegeTests,
  type StackAlertsPrivilegeState,
} from '../lib/stack_alerts_privilege_setup';

apiTest.describe('Stack alerts privilege - all privilege', { tag: tags.deploymentAgnostic }, () => {
  let state: StackAlertsPrivilegeState;
  let withAllPrivilegeCreds: RoleApiCredentials;
  let withAllPrivilegeCookieHeader: Record<string, string>;

  apiTest.beforeAll(async ({ apiClient, requestAuth, samlAuth }) => {
    state = await setupStackAlertsPrivilegeTests(apiClient, requestAuth, samlAuth);

    withAllPrivilegeCreds = await requestAuth.getApiKeyForCustomRole({
      kibana: [{ base: [], feature: { stackAlertsOnly: ['all'] }, spaces: ['*'] }],
      elasticsearch: { cluster: [], indices: [] },
    });

    const session = await samlAuth.asInteractiveUser({
      kibana: [{ base: [], feature: { stackAlertsOnly: ['all'] }, spaces: ['*'] }],
      elasticsearch: { cluster: [], indices: [] },
    });
    withAllPrivilegeCookieHeader = session.cookieHeader;
  });

  apiTest.afterAll(async ({ apiClient }) => {
    await teardownStackAlertsPrivilegeTests(apiClient, state);
  });

  for (const spec of RULE_SPECS) {
    apiTest(`cannot create a ${spec.ruleTypeId} rule`, async ({ apiClient }) => {
      const response = await apiClient.post('api/alerting/rule', {
        headers: { ...COMMON_HEADERS, ...withAllPrivilegeCreds.apiKeyHeader },
        body: {
          name: 'Should fail',
          rule_type_id: spec.ruleTypeId,
          consumer: spec.consumer,
          schedule: { interval: '1m' },
          enabled: false,
          params: spec.params,
          actions: [],
          tags: [],
        },
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(403);
    });
  }

  apiTest('cannot update a rule', async ({ apiClient }) => {
    const rule = state.createdRules[0];
    if (!rule) return;
    const spec = RULE_SPECS.find((s) => s.ruleTypeId === rule.ruleTypeId);
    const response = await apiClient.put(`api/alerting/rule/${rule.ruleId}`, {
      headers: { ...COMMON_HEADERS, ...withAllPrivilegeCreds.apiKeyHeader },
      body: {
        name: 'Updated name',
        schedule: { interval: '2m' },
        params: spec?.params ?? {},
        actions: [],
        tags: [],
      },
      responseType: 'json',
    });
    expect(response).toHaveStatusCode(403);
  });

  apiTest('cannot delete a rule', async ({ apiClient }) => {
    const rule = state.createdRules[0];
    if (!rule) return;
    const response = await apiClient.delete(`api/alerting/rule/${rule.ruleId}`, {
      headers: { ...COMMON_HEADERS, ...withAllPrivilegeCreds.apiKeyHeader },
      responseType: 'json',
    });
    expect(response).toHaveStatusCode(403);
  });

  apiTest('cannot mute all alerts on a rule', async ({ apiClient }) => {
    const rule = state.createdRules[0];
    if (!rule) return;
    const response = await apiClient.post(`api/alerting/rule/${rule.ruleId}/_mute_all`, {
      headers: { ...COMMON_HEADERS, ...withAllPrivilegeCreds.apiKeyHeader },
    });
    expect(response).toHaveStatusCode(403);
  });

  apiTest('cannot snooze a rule', async ({ apiClient }) => {
    const rule = state.createdRules[0];
    if (!rule) return;
    const response = await apiClient.post(`internal/alerting/rule/${rule.ruleId}/_snooze`, {
      headers: { ...COMMON_HEADERS, ...withAllPrivilegeCookieHeader },
      body: {
        snooze_schedule: {
          duration: 3600000,
          rRule: {
            dtstart: new Date().toISOString(),
            tzid: 'UTC',
            count: 1,
          },
        },
      },
      responseType: 'json',
    });
    expect(response).toHaveStatusCode(403);
  });

  for (const spec of RULE_SPECS) {
    apiTest(`can mute an alert instance for ${spec.ruleTypeId}`, async ({ apiClient }) => {
      const rule = state.createdRules.find((r) => r.ruleTypeId === spec.ruleTypeId);
      if (!rule) return;
      const response = await apiClient.post(
        `api/alerting/rule/${rule.ruleId}/alert/${FAKE_ALERT_INSTANCE_ID}/_mute?validate_alerts_existence=false`,
        { headers: { ...COMMON_HEADERS, ...withAllPrivilegeCreds.apiKeyHeader } }
      );
      expect(response).toHaveStatusCode(204);
    });

    apiTest(`can unmute an alert instance for ${spec.ruleTypeId}`, async ({ apiClient }) => {
      const rule = state.createdRules.find((r) => r.ruleTypeId === spec.ruleTypeId);
      if (!rule) return;
      const response = await apiClient.post(
        `api/alerting/rule/${rule.ruleId}/alert/${FAKE_ALERT_INSTANCE_ID}/_unmute?validate_alerts_existence=false`,
        { headers: { ...COMMON_HEADERS, ...withAllPrivilegeCreds.apiKeyHeader } }
      );
      expect(response).toHaveStatusCode(204);
    });
  }

  apiTest('can find alerts via RAC', async ({ apiClient }) => {
    const response = await apiClient.post('internal/rac/alerts/find', {
      headers: { ...COMMON_HEADERS, ...withAllPrivilegeCookieHeader },
      body: {
        rule_type_ids: ['.es-query'],
        consumers: ['stackAlerts'],
        query: { match_all: {} },
        size: 10,
      },
      responseType: 'json',
    });
    expect(response).toHaveStatusCode(200);

    const body = response.body as {
      hits?: {
        total?: { value?: number };
        hits?: Array<{ _source: Record<string, unknown> }>;
      };
    };
    expect(body.hits?.total?.value).toBeGreaterThan(0);

    const alert = body.hits!.hits![0]._source;
    expect(alert['kibana.alert.rule.rule_type_id']).toBe('.es-query');
    expect(alert['kibana.alert.status']).toBeDefined();
  });

  apiTest('can acknowledge a real alert via bulk update', async ({ apiClient }) => {
    if (!state.realAlertId) {
      return;
    }
    const response = await apiClient.post('internal/rac/alerts/bulk_update', {
      headers: { ...COMMON_HEADERS, ...withAllPrivilegeCookieHeader },
      body: {
        status: 'acknowledged',
        ids: [state.realAlertId],
        index: '.alerts-stack.alerts-default',
      },
      responseType: 'json',
    });
    expect(response).toHaveStatusCode(200);
  });
});
