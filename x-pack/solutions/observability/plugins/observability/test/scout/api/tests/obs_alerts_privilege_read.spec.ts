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
  'Observability alerts – read privilege',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let state: ObsAlertsPrivilegeState;
    let withReadPrivilegeCreds: RoleApiCredentials;

    apiTest.beforeAll(async ({ apiClient, requestAuth, samlAuth }) => {
      state = await setupObsAlertsPrivilegeRules({ apiClient, requestAuth, samlAuth });

      withReadPrivilegeCreds = await requestAuth.getApiKeyForCustomRole({
        kibana: [{ base: [], feature: { observabilityAlerts: ['read'] }, spaces: ['*'] }],
        elasticsearch: { cluster: [], indices: [] },
      });
    });

    apiTest.afterAll(async ({ apiClient }) => {
      await teardownObsAlertsPrivilegeRules(apiClient, state.adminCreds, state.createdRules);
    });

    apiTest('can find the alert via RAC', async ({ apiClient }) => {
      const response = await apiClient.post('internal/rac/alerts/find', {
        headers: { ...KIBANA_HEADERS, ...withReadPrivilegeCreds.apiKeyHeader },
        body: {
          rule_type_ids: ['.es-query'],
          consumers: ['logs'],
          query: { ids: { values: [state.realAlertId] } },
          size: 10,
        },
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(200);

      const body = response.body as {
        hits?: {
          total?: { value?: number };
          hits?: Array<{ _id: string }>;
        };
      };
      expect(body.hits?.total?.value).toBeGreaterThan(0);
      expect(body.hits?.hits?.map((hit) => hit._id)).toContain(state.realAlertId);
    });

    for (const spec of RULE_SPECS) {
      apiTest(`cannot mute an alert instance for ${spec.ruleTypeId}`, async ({ apiClient }) => {
        const rule = state.createdRules.find((r) => r.ruleTypeId === spec.ruleTypeId);
        apiTest.skip(!rule, `${spec.ruleTypeId} is not registered on this deployment`);
        const response = await apiClient.post(
          `api/alerting/rule/${
            rule!.ruleId
          }/alert/${FAKE_ALERT_INSTANCE_ID}/_mute?validate_alerts_existence=false`,
          { headers: { ...KIBANA_HEADERS, ...withReadPrivilegeCreds.apiKeyHeader } }
        );
        expect(response).toHaveStatusCode(403);
      });
    }

    apiTest('cannot acknowledge an alert via bulk update', async ({ apiClient }) => {
      const response = await apiClient.post('internal/rac/alerts/bulk_update', {
        headers: { ...KIBANA_HEADERS, ...withReadPrivilegeCreds.apiKeyHeader },
        body: {
          status: 'acknowledged',
          ids: [state.realAlertId],
          index: state.realAlertIndex,
        },
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(403);
    });

    for (const spec of RULE_SPECS) {
      apiTest(`cannot create a ${spec.ruleTypeId} rule`, async ({ apiClient }) => {
        const rule = state.createdRules.find((r) => r.ruleTypeId === spec.ruleTypeId);
        apiTest.skip(!rule, `${spec.ruleTypeId} is not registered on this deployment`);
        const response = await apiClient.post('api/alerting/rule', {
          headers: { ...KIBANA_HEADERS, ...withReadPrivilegeCreds.apiKeyHeader },
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
  }
);
