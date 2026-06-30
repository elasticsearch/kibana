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

apiTest.describe(
  'Stack alerts privilege - read privilege',
  { tag: tags.deploymentAgnostic },
  () => {
    let state: StackAlertsPrivilegeState;
    let withReadPrivilegeCreds: RoleApiCredentials;
    let withReadPrivilegeCookieHeader: Record<string, string>;

    apiTest.beforeAll(async ({ apiClient, requestAuth, samlAuth }) => {
      state = await setupStackAlertsPrivilegeTests(apiClient, requestAuth, samlAuth);

      withReadPrivilegeCreds = await requestAuth.getApiKeyForCustomRole({
        kibana: [{ base: [], feature: { stackAlertsOnly: ['read'] }, spaces: ['*'] }],
        elasticsearch: { cluster: [], indices: [] },
      });

      const session = await samlAuth.asInteractiveUser({
        kibana: [{ base: [], feature: { stackAlertsOnly: ['read'] }, spaces: ['*'] }],
        elasticsearch: { cluster: [], indices: [] },
      });
      withReadPrivilegeCookieHeader = session.cookieHeader;
    });

    apiTest.afterAll(async ({ apiClient }) => {
      await teardownStackAlertsPrivilegeTests(apiClient, state);
    });

    apiTest('can find alerts via RAC', async ({ apiClient }) => {
      const response = await apiClient.post('internal/rac/alerts/find', {
        headers: { ...COMMON_HEADERS, ...withReadPrivilegeCookieHeader },
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
        hits?: { total?: { value?: number }; hits?: Array<{ _source: Record<string, unknown> }> };
      };
      expect(body.hits?.total?.value).toBeGreaterThan(0);
    });

    for (const spec of RULE_SPECS) {
      apiTest(`cannot mute an alert instance for ${spec.ruleTypeId}`, async ({ apiClient }) => {
        const rule = state.createdRules.find((r) => r.ruleTypeId === spec.ruleTypeId);
        if (!rule) return;
        const response = await apiClient.post(
          `api/alerting/rule/${rule.ruleId}/alert/${FAKE_ALERT_INSTANCE_ID}/_mute?validate_alerts_existence=false`,
          { headers: { ...COMMON_HEADERS, ...withReadPrivilegeCreds.apiKeyHeader } }
        );
        expect(response).toHaveStatusCode(403);
      });
    }

    apiTest('cannot acknowledge an alert via bulk update', async ({ apiClient }) => {
      const response = await apiClient.post('internal/rac/alerts/bulk_update', {
        headers: { ...COMMON_HEADERS, ...withReadPrivilegeCookieHeader },
        body: {
          status: 'acknowledged',
          ids: [state.realAlertId],
          index: '.alerts-stack.alerts-default',
        },
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(403);
    });

    apiTest('cannot create a rule', async ({ apiClient }) => {
      const spec = RULE_SPECS[0];
      const response = await apiClient.post('api/alerting/rule', {
        headers: { ...COMMON_HEADERS, ...withReadPrivilegeCreds.apiKeyHeader },
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
);
