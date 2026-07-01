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
  'Observability alerts – no privilege',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let state: ObsAlertsPrivilegeState;
    let withoutPrivilegeCreds: RoleApiCredentials;

    apiTest.beforeAll(async ({ apiClient, requestAuth, samlAuth }) => {
      state = await setupObsAlertsPrivilegeRules({ apiClient, requestAuth, samlAuth });

      withoutPrivilegeCreds = await requestAuth.getApiKeyForCustomRole({
        kibana: [{ base: [], feature: { discover: ['read'] }, spaces: ['*'] }],
        elasticsearch: { cluster: [], indices: [] },
      });
    });

    apiTest.afterAll(async ({ apiClient }) => {
      await teardownObsAlertsPrivilegeRules(apiClient, state.adminCreds, state.createdRules);
    });

    for (const spec of RULE_SPECS) {
      apiTest(`cannot mute an alert instance for ${spec.ruleTypeId}`, async ({ apiClient }) => {
        const rule = state.createdRules.find((r) => r.ruleTypeId === spec.ruleTypeId);
        apiTest.skip(!rule, `${spec.ruleTypeId} is not registered on this deployment`);
        const response = await apiClient.post(
          `api/alerting/rule/${
            rule!.ruleId
          }/alert/${FAKE_ALERT_INSTANCE_ID}/_mute?validate_alerts_existence=false`,
          { headers: { ...KIBANA_HEADERS, ...withoutPrivilegeCreds.apiKeyHeader } }
        );
        expect(response).toHaveStatusCode(403);
      });

      apiTest(`cannot unmute an alert instance for ${spec.ruleTypeId}`, async ({ apiClient }) => {
        const rule = state.createdRules.find((r) => r.ruleTypeId === spec.ruleTypeId);
        apiTest.skip(!rule, `${spec.ruleTypeId} is not registered on this deployment`);
        const response = await apiClient.post(
          `api/alerting/rule/${
            rule!.ruleId
          }/alert/${FAKE_ALERT_INSTANCE_ID}/_unmute?validate_alerts_existence=false`,
          { headers: { ...KIBANA_HEADERS, ...withoutPrivilegeCreds.apiKeyHeader } }
        );
        expect(response).toHaveStatusCode(403);
      });
    }

    apiTest('cannot find alerts via RAC', async ({ apiClient }) => {
      const response = await apiClient.post('internal/rac/alerts/find', {
        headers: { ...KIBANA_HEADERS, ...withoutPrivilegeCreds.apiKeyHeader },
        body: {
          rule_type_ids: ['.es-query'],
          consumers: ['logs'],
          query: { match_all: {} },
          size: 10,
        },
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(403);
    });

    apiTest('cannot acknowledge an alert via bulk update', async ({ apiClient }) => {
      const response = await apiClient.post('internal/rac/alerts/bulk_update', {
        headers: { ...KIBANA_HEADERS, ...withoutPrivilegeCreds.apiKeyHeader },
        body: {
          status: 'acknowledged',
          ids: [state.realAlertId],
          index: '.alerts-stack.alerts-default',
        },
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(403);
    });
  }
);
