/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RoleApiCredentials } from '@kbn/scout-oblt';
import { apiTest, tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import { KIBANA_HEADERS } from '../fixtures/helpers';
import {
  type ObsAlertsPrivilegeState,
  RULE_SPECS,
  FAKE_ALERT_INSTANCE_ID,
  setupObsAlertsPrivilegeRules,
  teardownObsAlertsPrivilegeRules,
} from '../fixtures/obs_alerts_privilege_setup';

apiTest.describe(
  'Observability alerts – all privilege',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let state: ObsAlertsPrivilegeState;
    let withAllPrivilegeCreds: RoleApiCredentials;

    apiTest.beforeAll(async ({ apiClient, requestAuth, samlAuth }) => {
      state = await setupObsAlertsPrivilegeRules({ apiClient, requestAuth, samlAuth });

      withAllPrivilegeCreds = await requestAuth.getApiKeyForCustomRole({
        kibana: [{ base: [], feature: { observabilityAlerts: ['all'] }, spaces: ['*'] }],
        elasticsearch: { cluster: [], indices: [] },
      });
    });

    apiTest.afterAll(async ({ apiClient }) => {
      await teardownObsAlertsPrivilegeRules(apiClient, state.adminCreds, state.createdRules);
    });

    for (const spec of RULE_SPECS) {
      apiTest(`cannot create a ${spec.ruleTypeId} rule`, async ({ apiClient }) => {
        const rule = state.createdRules.find((r) => r.ruleTypeId === spec.ruleTypeId);
        apiTest.skip(!rule, `${spec.ruleTypeId} is not registered on this deployment`);
        const response = await apiClient.post('api/alerting/rule', {
          headers: { ...KIBANA_HEADERS, ...withAllPrivilegeCreds.apiKeyHeader },
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
      const { ruleId, ruleTypeId } = state.createdRules[0];
      const spec = RULE_SPECS.find((s) => s.ruleTypeId === ruleTypeId)!;
      const response = await apiClient.put(`api/alerting/rule/${ruleId}`, {
        headers: { ...KIBANA_HEADERS, ...withAllPrivilegeCreds.apiKeyHeader },
        body: {
          name: 'Updated name',
          schedule: { interval: '2m' },
          params: spec.params,
          actions: [],
          tags: [],
        },
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(403);
    });

    apiTest('cannot delete a rule', async ({ apiClient }) => {
      const { ruleId } = state.createdRules[0];
      const response = await apiClient.delete(`api/alerting/rule/${ruleId}`, {
        headers: { ...KIBANA_HEADERS, ...withAllPrivilegeCreds.apiKeyHeader },
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(403);
    });

    apiTest('cannot mute all alerts on a rule', async ({ apiClient }) => {
      const { ruleId } = state.createdRules[0];
      const response = await apiClient.post(`api/alerting/rule/${ruleId}/_mute_all`, {
        headers: { ...KIBANA_HEADERS, ...withAllPrivilegeCreds.apiKeyHeader },
      });
      expect(response).toHaveStatusCode(403);
    });

    apiTest('cannot snooze a rule', async ({ apiClient }) => {
      const { ruleId } = state.createdRules[0];
      const response = await apiClient.post(`internal/alerting/rule/${ruleId}/_snooze`, {
        headers: { ...KIBANA_HEADERS, ...withAllPrivilegeCreds.apiKeyHeader },
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
        apiTest.skip(!rule, `${spec.ruleTypeId} is not registered on this deployment`);
        const response = await apiClient.post(
          `api/alerting/rule/${
            rule!.ruleId
          }/alert/${FAKE_ALERT_INSTANCE_ID}/_mute?validate_alerts_existence=false`,
          { headers: { ...KIBANA_HEADERS, ...withAllPrivilegeCreds.apiKeyHeader } }
        );
        expect(response).toHaveStatusCode(204);
      });

      apiTest(`can unmute an alert instance for ${spec.ruleTypeId}`, async ({ apiClient }) => {
        const rule = state.createdRules.find((r) => r.ruleTypeId === spec.ruleTypeId);
        apiTest.skip(!rule, `${spec.ruleTypeId} is not registered on this deployment`);
        const response = await apiClient.post(
          `api/alerting/rule/${
            rule!.ruleId
          }/alert/${FAKE_ALERT_INSTANCE_ID}/_unmute?validate_alerts_existence=false`,
          { headers: { ...KIBANA_HEADERS, ...withAllPrivilegeCreds.apiKeyHeader } }
        );
        expect(response).toHaveStatusCode(204);
      });
    }

    apiTest('can find alerts via RAC', async ({ apiClient }) => {
      const response = await apiClient.post('internal/rac/alerts/find', {
        headers: { ...KIBANA_HEADERS, ...withAllPrivilegeCreds.apiKeyHeader },
        body: {
          rule_type_ids: ['.es-query'],
          consumers: ['logs'],
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
      const response = await apiClient.post('internal/rac/alerts/bulk_update', {
        headers: { ...KIBANA_HEADERS, ...withAllPrivilegeCreds.apiKeyHeader },
        body: {
          status: 'acknowledged',
          ids: [state.realAlertId],
          index: state.realAlertIndex,
        },
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(200);
    });
  }
);
