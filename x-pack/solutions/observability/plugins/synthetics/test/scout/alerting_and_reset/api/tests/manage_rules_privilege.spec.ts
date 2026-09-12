/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ApiClientFixture, KibanaRole } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/api';
import {
  apiTest,
  mergeSyntheticsApiHeaders,
  PUBLIC_API_VERSION,
  SYNTHETICS_API_URLS,
} from '../../../common/fixtures';

const RULE_TYPE_ID = 'xpack.synthetics.alerts.monitorStatus';
const RULE_TAG = 'scout-synthetics-manage-rules-privilege';
const DEFAULT_RULES_FORBIDDEN = '[uptime-write,write_synthetics_default_rules]';

const createRole = (privileges: string[]): KibanaRole => ({
  elasticsearch: { cluster: [], indices: [] },
  kibana: [{ base: [], feature: { uptime: privileges }, spaces: ['*'] }],
});

const readRole = createRole(['read']);
const readWithManageRulesRole = createRole(['read', 'can_manage_rules']);
const allRole = createRole(['all']);
const minimalAllRole = createRole(['minimal_all']);

const publicApiHeaders = (headers: Record<string, string>) => ({
  ...headers,
  'elastic-api-version': PUBLIC_API_VERSION,
});

const createRule = (apiClient: ApiClientFixture, headers: Record<string, string>, name: string) =>
  apiClient.post('api/alerting/rule', {
    headers,
    body: {
      name,
      rule_type_id: RULE_TYPE_ID,
      consumer: 'uptime',
      schedule: { interval: '1m' },
      enabled: false,
      params: {},
      actions: [],
      tags: [RULE_TAG],
    },
    responseType: 'json',
  });

const deleteRule = (apiClient: ApiClientFixture, headers: Record<string, string>, ruleId: string) =>
  apiClient.delete(`api/alerting/rule/${ruleId}`, {
    headers,
    responseType: 'json',
  });

const postJson = (
  apiClient: ApiClientFixture,
  path: string,
  headers: Record<string, string>,
  body: Record<string, unknown> = {}
) => apiClient.post(path, { headers, body, responseType: 'json' });

apiTest.describe(
  'Synthetics manage rules privilege',
  { tag: ['@local-stateful-classic', '@local-serverless-observability_complete'] },
  () => {
    let readHeaders: Record<string, string>;
    let readWithManageRulesHeaders: Record<string, string>;
    let allHeaders: Record<string, string>;
    let minimalAllHeaders: Record<string, string>;

    apiTest.beforeAll(async ({ requestAuth }) => {
      const resolveRoleHeaders = async (role: KibanaRole) => {
        const { apiKeyHeader } = await requestAuth.getApiKeyForCustomRole(role);
        return mergeSyntheticsApiHeaders(apiKeyHeader);
      };

      readHeaders = await resolveRoleHeaders(readRole);
      readWithManageRulesHeaders = await resolveRoleHeaders(readWithManageRulesRole);
      allHeaders = await resolveRoleHeaders(allRole);
      minimalAllHeaders = await resolveRoleHeaders(minimalAllRole);
    });

    apiTest.afterAll(async ({ apiServices }) => {
      await apiServices.alerting.cleanup.deleteRulesByTags([RULE_TAG]);
    });

    apiTest('does not let a read-only user create a rule', async ({ apiClient }) => {
      const response = await createRule(apiClient, readHeaders, `read-only-${uuidv4()}`);
      expect(response).toHaveStatusCode(403);
    });

    apiTest('lets a read user with can_manage_rules manage a rule', async ({ apiClient }) => {
      const name = `manage-rules-${uuidv4()}`;
      const createResponse = await createRule(apiClient, readWithManageRulesHeaders, name);
      expect(createResponse).toHaveStatusCode(200);

      const { id } = createResponse.body as { id: string };
      const updateResponse = await apiClient.put(`api/alerting/rule/${id}`, {
        headers: readWithManageRulesHeaders,
        body: {
          name: `${name}-updated`,
          schedule: { interval: '2m' },
          params: {},
          actions: [],
          tags: [RULE_TAG],
        },
        responseType: 'json',
      });
      expect(updateResponse).toHaveStatusCode(200);

      const enableResponse = await postJson(
        apiClient,
        `api/alerting/rule/${id}/_enable`,
        readWithManageRulesHeaders
      );
      expect([200, 204]).toContain(enableResponse.statusCode);

      const runSoonResponse = await postJson(
        apiClient,
        `internal/alerting/rule/${id}/_run_soon`,
        readWithManageRulesHeaders
      );
      expect([200, 204]).toContain(runSoonResponse.statusCode);

      const disableResponse = await postJson(
        apiClient,
        `api/alerting/rule/${id}/_disable`,
        readWithManageRulesHeaders
      );
      expect([200, 204]).toContain(disableResponse.statusCode);

      const readEnableResponse = await postJson(
        apiClient,
        `api/alerting/rule/${id}/_enable`,
        readHeaders
      );
      expect(readEnableResponse).toHaveStatusCode(403);

      const deleteResponse = await deleteRule(apiClient, readWithManageRulesHeaders, id);
      expect(deleteResponse).toHaveStatusCode(204);
    });

    apiTest(
      'does not let a read user with can_manage_rules write monitors, settings, params, or private locations',
      async ({ apiClient }) => {
        const forbiddenWrites: Array<{ path: string; headers: Record<string, string> }> = [
          {
            path: SYNTHETICS_API_URLS.SYNTHETICS_MONITORS,
            headers: publicApiHeaders(readWithManageRulesHeaders),
          },
          {
            path: SYNTHETICS_API_URLS.PARAMS,
            headers: publicApiHeaders(readWithManageRulesHeaders),
          },
          {
            path: SYNTHETICS_API_URLS.PRIVATE_LOCATIONS,
            headers: publicApiHeaders(readWithManageRulesHeaders),
          },
        ];

        for (const { path, headers } of forbiddenWrites) {
          const response = await postJson(apiClient, path, headers);
          expect(response).toHaveStatusCode(403);
        }

        const settingsPut = await apiClient.put(SYNTHETICS_API_URLS.DYNAMIC_SETTINGS, {
          headers: readWithManageRulesHeaders,
          body: {},
          responseType: 'json',
        });
        expect(settingsPut).toHaveStatusCode(403);
      }
    );

    apiTest(
      'does not let a read-only user enable or update default alerting',
      async ({ apiClient }) => {
        const postResponse = await postJson(
          apiClient,
          SYNTHETICS_API_URLS.ENABLE_DEFAULT_ALERTING,
          readHeaders
        );
        expect(postResponse).toHaveStatusCode(403);
        expect(
          decodeURIComponent((postResponse.body as { message?: string }).message ?? '')
        ).toContain(DEFAULT_RULES_FORBIDDEN);

        const putResponse = await apiClient.put(SYNTHETICS_API_URLS.ENABLE_DEFAULT_ALERTING, {
          headers: readHeaders,
          body: {},
          responseType: 'json',
        });
        expect(putResponse).toHaveStatusCode(403);
        expect(
          decodeURIComponent((putResponse.body as { message?: string }).message ?? '')
        ).toContain(DEFAULT_RULES_FORBIDDEN);
      }
    );

    apiTest(
      'lets a read user with can_manage_rules enable default alerting',
      async ({ apiClient }) => {
        const response = await postJson(
          apiClient,
          SYNTHETICS_API_URLS.ENABLE_DEFAULT_ALERTING,
          readWithManageRulesHeaders
        );
        expect(response).toHaveStatusCode(200);

        const body = response.body as {
          statusRule?: { id?: string } | null;
          tlsRule?: { id?: string } | null;
        };
        expect(body.statusRule != null || body.tlsRule != null).toBe(true);
      }
    );

    apiTest('keeps rule management available to all users', async ({ apiClient }) => {
      const createResponse = await createRule(apiClient, allHeaders, `all-${uuidv4()}`);
      expect(createResponse).toHaveStatusCode(200);

      const { id } = createResponse.body as { id: string };
      const deleteResponse = await deleteRule(apiClient, allHeaders, id);
      expect(deleteResponse).toHaveStatusCode(204);
    });

    apiTest('keeps rule management available to minimal_all users', async ({ apiClient }) => {
      const createResponse = await createRule(
        apiClient,
        minimalAllHeaders,
        `minimal_all-${uuidv4()}`
      );
      expect(createResponse).toHaveStatusCode(200);

      const { id } = createResponse.body as { id: string };
      const deleteResponse = await deleteRule(apiClient, minimalAllHeaders, id);
      expect(deleteResponse).toHaveStatusCode(204);
    });
  }
);
