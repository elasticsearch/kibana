/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import type { EsClient, RoleApiCredentials, ScoutTestConfig } from '@kbn/scout';
import {
  COMMON_HEADERS,
  ES_QUERY_RULE_PARAMS,
  ES_QUERY_DEFAULT_INSTANCE_ID_ENCODED,
} from '../fixtures/constants';
import { waitForSuccessfulEventLogEntry } from '../lib/wait_for_successful_event_log';

/**
 * Returns the feature privilege and rule consumer appropriate for the current
 * deployment. `stackAlerts` is hidden in serverless observability, so we fall
 * back to the `logs` feature (which registers `.es-query` with consumer `logs`).
 */
const getDeploymentConfig = (
  config: ScoutTestConfig
): { feature: Record<string, string[]>; consumer: string } => {
  if (config.serverless && config.projectType === 'oblt') {
    return { feature: { logs: ['all'] }, consumer: 'logs' };
  }
  return { feature: { stackAlerts: ['all'] }, consumer: 'alerts' };
};

apiTest.describe(
  'Per-alert mute/unmute without connector privilege',
  { tag: tags.deploymentAgnostic },
  () => {
    let adminCreds: RoleApiCredentials;
    let restrictedCreds: RoleApiCredentials;
    let ruleId: string;
    let connectorId: string;

    const getAlertAttrs = async (esClient: EsClient) => {
      const result = await esClient.search({
        index: '.kibana_alerting_cases*',
        query: { term: { _id: `alert:${ruleId}` } },
        size: 1,
      });
      const hit = result.hits.hits[0];
      expect(hit).toBeDefined();
      return (hit._source as Record<string, unknown>)?.alert as Record<string, unknown>;
    };

    apiTest.beforeAll(async ({ apiClient, requestAuth, samlAuth, config }) => {
      const { feature, consumer } = getDeploymentConfig(config);
      adminCreds = await requestAuth.getApiKey('admin');

      restrictedCreds = await requestAuth.getApiKeyForCustomRole({
        kibana: [{ base: [], feature, spaces: ['*'] }],
        elasticsearch: { cluster: [], indices: [{ names: ['.alerts-*'], privileges: ['read'] }] },
      });

      // Verify restricted user has no connector access
      const createConnectorAttempt = await apiClient.post('api/actions/connector', {
        headers: { ...COMMON_HEADERS, ...restrictedCreds.apiKeyHeader },
        body: { connector_type_id: '.server-log', name: 'Should Fail', config: {}, secrets: {} },
        responseType: 'json',
      });
      expect(createConnectorAttempt).toHaveStatusCode(403);

      const getConnectorsAttempt = await apiClient.get('api/actions/connectors', {
        headers: { ...COMMON_HEADERS, ...restrictedCreds.apiKeyHeader },
        responseType: 'json',
      });
      expect(getConnectorsAttempt).toHaveStatusCode(403);

      const connectorResponse = await apiClient.post('api/actions/connector', {
        headers: { ...COMMON_HEADERS, ...adminCreds.apiKeyHeader },
        body: {
          connector_type_id: '.server-log',
          name: 'Scout Test Server Log',
          config: {},
          secrets: {},
        },
        responseType: 'json',
      });
      expect(connectorResponse).toHaveStatusCode(200);
      connectorId = (connectorResponse.body as { id: string }).id;

      const ruleResponse = await apiClient.post('api/alerting/rule', {
        headers: { ...COMMON_HEADERS, ...adminCreds.apiKeyHeader },
        body: {
          name: 'Scout mute-instance-authz test rule',
          rule_type_id: '.es-query',
          consumer,
          schedule: { interval: '1m' },
          enabled: true,
          params: ES_QUERY_RULE_PARAMS,
          actions: [
            {
              group: 'query matched',
              id: connectorId,
              params: { message: 'Test: {{context.message}}' },
              frequency: { summary: false, notify_when: 'onActiveAlert', throttle: null },
            },
          ],
          tags: ['scout-mute-authz'],
        },
        responseType: 'json',
      });
      expect(ruleResponse).toHaveStatusCode(200);
      ruleId = (ruleResponse.body as { id: string }).id;

      const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
      await waitForSuccessfulEventLogEntry(apiClient, ruleId, {
        ...COMMON_HEADERS,
        ...cookieHeader,
      });
    });

    apiTest.afterAll(async ({ apiClient }) => {
      if (ruleId) {
        await apiClient.delete(`api/alerting/rule/${ruleId}`, {
          headers: { ...COMMON_HEADERS, ...adminCreds.apiKeyHeader },
        });
      }
      if (connectorId) {
        await apiClient.delete(`api/actions/connector/${connectorId}`, {
          headers: { ...COMMON_HEADERS, ...adminCreds.apiKeyHeader },
        });
      }
    });

    apiTest(
      'restricted user (alerting all, no actions) can mute an alert instance',
      async ({ apiClient }) => {
        const response = await apiClient.post(
          `api/alerting/rule/${ruleId}/alert/${ES_QUERY_DEFAULT_INSTANCE_ID_ENCODED}/_mute`,
          { headers: { ...COMMON_HEADERS, ...restrictedCreds.apiKeyHeader } }
        );
        expect(response).toHaveStatusCode(204);
      }
    );

    apiTest(
      'restricted user (alerting all, no actions) can unmute an alert instance',
      async ({ apiClient }) => {
        const response = await apiClient.post(
          `api/alerting/rule/${ruleId}/alert/${ES_QUERY_DEFAULT_INSTANCE_ID_ENCODED}/_unmute`,
          { headers: { ...COMMON_HEADERS, ...restrictedCreds.apiKeyHeader } }
        );
        expect(response).toHaveStatusCode(204);
      }
    );

    apiTest('admin can still mute an alert instance (regression)', async ({ apiClient }) => {
      const muteResponse = await apiClient.post(
        `api/alerting/rule/${ruleId}/alert/${ES_QUERY_DEFAULT_INSTANCE_ID_ENCODED}/_mute`,
        { headers: { ...COMMON_HEADERS, ...adminCreds.apiKeyHeader } }
      );
      expect(muteResponse).toHaveStatusCode(204);

      const unmuteResponse = await apiClient.post(
        `api/alerting/rule/${ruleId}/alert/${ES_QUERY_DEFAULT_INSTANCE_ID_ENCODED}/_unmute`,
        { headers: { ...COMMON_HEADERS, ...adminCreds.apiKeyHeader } }
      );
      expect(unmuteResponse).toHaveStatusCode(204);
    });

    apiTest(
      'mute/unmute by restricted user does not rotate the rule API key',
      async ({ apiClient, esClient }) => {
        const before = await getAlertAttrs(esClient);
        expect(before.apiKey).toBeDefined();
        expect(before.apiKeyOwner).toBeDefined();

        await apiClient.post(
          `api/alerting/rule/${ruleId}/alert/${ES_QUERY_DEFAULT_INSTANCE_ID_ENCODED}/_mute`,
          { headers: { ...COMMON_HEADERS, ...restrictedCreds.apiKeyHeader } }
        );
        await apiClient.post(
          `api/alerting/rule/${ruleId}/alert/${ES_QUERY_DEFAULT_INSTANCE_ID_ENCODED}/_unmute`,
          { headers: { ...COMMON_HEADERS, ...restrictedCreds.apiKeyHeader } }
        );

        const after = await getAlertAttrs(esClient);
        expect(after.apiKey).toBe(before.apiKey);
        expect(after.apiKeyOwner).toBe(before.apiKeyOwner);
      }
    );

    apiTest('restricted user can mute_all without connector privilege', async ({ apiClient }) => {
      const response = await apiClient.post(`api/alerting/rule/${ruleId}/_mute_all`, {
        headers: { ...COMMON_HEADERS, ...restrictedCreds.apiKeyHeader },
      });
      expect(response).toHaveStatusCode(204);
    });

    apiTest('restricted user can unmute_all without connector privilege', async ({ apiClient }) => {
      const response = await apiClient.post(`api/alerting/rule/${ruleId}/_unmute_all`, {
        headers: { ...COMMON_HEADERS, ...restrictedCreds.apiKeyHeader },
      });
      expect(response).toHaveStatusCode(204);
    });

    apiTest(
      'mute_all/unmute_all by restricted user does not rotate the rule API key',
      async ({ apiClient, esClient }) => {
        const before = await getAlertAttrs(esClient);

        await apiClient.post(`api/alerting/rule/${ruleId}/_mute_all`, {
          headers: { ...COMMON_HEADERS, ...restrictedCreds.apiKeyHeader },
        });
        await apiClient.post(`api/alerting/rule/${ruleId}/_unmute_all`, {
          headers: { ...COMMON_HEADERS, ...restrictedCreds.apiKeyHeader },
        });

        const after = await getAlertAttrs(esClient);
        expect(after.apiKey).toBe(before.apiKey);
        expect(after.apiKeyOwner).toBe(before.apiKeyOwner);
      }
    );

    apiTest(
      'restricted user can snooze without connector privilege',
      async ({ apiClient, samlAuth, config }) => {
        const { feature } = getDeploymentConfig(config);
        const { cookieHeader } = await samlAuth.asInteractiveUser({
          kibana: [{ base: [], feature, spaces: ['*'] }],
          elasticsearch: {
            cluster: [],
            indices: [{ names: ['.alerts-*'], privileges: ['read'] }],
          },
        });

        const response = await apiClient.post(`internal/alerting/rule/${ruleId}/_snooze`, {
          headers: { ...COMMON_HEADERS, ...cookieHeader },
          body: {
            snooze_schedule: {
              duration: 60000,
              rRule: {
                dtstart: new Date().toISOString(),
                tzid: 'UTC',
                count: 1,
                freq: 0,
              },
            },
          },
        });
        expect(response).toHaveStatusCode(204);
      }
    );

    apiTest(
      'restricted user can unsnooze without connector privilege',
      async ({ apiClient, samlAuth, config }) => {
        const { feature } = getDeploymentConfig(config);
        const { cookieHeader } = await samlAuth.asInteractiveUser({
          kibana: [{ base: [], feature, spaces: ['*'] }],
          elasticsearch: {
            cluster: [],
            indices: [{ names: ['.alerts-*'], privileges: ['read'] }],
          },
        });

        const response = await apiClient.post(`internal/alerting/rule/${ruleId}/_unsnooze`, {
          headers: { ...COMMON_HEADERS, ...cookieHeader },
          body: { schedule_ids: [] },
        });
        expect(response).toHaveStatusCode(204);
      }
    );

    apiTest(
      'snooze/unsnooze by restricted user does not rotate the rule API key',
      async ({ apiClient, samlAuth, esClient, config }) => {
        const { feature } = getDeploymentConfig(config);

        const { cookieHeader } = await samlAuth.asInteractiveUser({
          kibana: [{ base: [], feature, spaces: ['*'] }],
          elasticsearch: {
            cluster: [],
            indices: [{ names: ['.alerts-*'], privileges: ['read'] }],
          },
        });

        const before = await getAlertAttrs(esClient);

        await apiClient.post(`internal/alerting/rule/${ruleId}/_snooze`, {
          headers: { ...COMMON_HEADERS, ...cookieHeader },
          body: {
            snooze_schedule: {
              duration: 60000,
              rRule: {
                dtstart: new Date().toISOString(),
                tzid: 'UTC',
                count: 1,
                freq: 0,
              },
            },
          },
        });

        await apiClient.post(`internal/alerting/rule/${ruleId}/_unsnooze`, {
          headers: { ...COMMON_HEADERS, ...cookieHeader },
          body: { schedule_ids: [] },
        });

        const after = await getAlertAttrs(esClient);
        expect(after.apiKey).toBe(before.apiKey);
        expect(after.apiKeyOwner).toBe(before.apiKeyOwner);
      }
    );

    apiTest(
      'restricted user (alerting all, no actions) can snooze an alert instance',
      async ({ apiClient }) => {
        const response = await apiClient.post(
          `api/alerting/rule/${ruleId}/alert/${ES_QUERY_DEFAULT_INSTANCE_ID_ENCODED}/_snooze`,
          {
            headers: { ...COMMON_HEADERS, ...restrictedCreds.apiKeyHeader },
            body: { expires_at: '2099-12-31T23:59:59.000Z' },
            responseType: 'json',
          }
        );
        expect(response).toHaveStatusCode(204);
      }
    );

    apiTest(
      'restricted user (alerting all, no actions) can unsnooze an alert instance',
      async ({ apiClient }) => {
        const response = await apiClient.post(
          `api/alerting/rule/${ruleId}/alert/${ES_QUERY_DEFAULT_INSTANCE_ID_ENCODED}/_unsnooze`,
          { headers: { ...COMMON_HEADERS, ...restrictedCreds.apiKeyHeader } }
        );
        expect(response).toHaveStatusCode(204);
      }
    );

    apiTest(
      'per-alert snooze/unsnooze by restricted user does not rotate the rule API key',
      async ({ apiClient, esClient }) => {
        const before = await getAlertAttrs(esClient);
        expect(before.apiKey).toBeDefined();
        expect(before.apiKeyOwner).toBeDefined();

        await apiClient.post(
          `api/alerting/rule/${ruleId}/alert/${ES_QUERY_DEFAULT_INSTANCE_ID_ENCODED}/_snooze`,
          {
            headers: { ...COMMON_HEADERS, ...restrictedCreds.apiKeyHeader },
            body: { expires_at: '2099-12-31T23:59:59.000Z' },
            responseType: 'json',
          }
        );
        await apiClient.post(
          `api/alerting/rule/${ruleId}/alert/${ES_QUERY_DEFAULT_INSTANCE_ID_ENCODED}/_unsnooze`,
          { headers: { ...COMMON_HEADERS, ...restrictedCreds.apiKeyHeader } }
        );

        const after = await getAlertAttrs(esClient);
        expect(after.apiKey).toBe(before.apiKey);
        expect(after.apiKeyOwner).toBe(before.apiKeyOwner);
      }
    );
  }
);
