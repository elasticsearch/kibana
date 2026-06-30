/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import type { RoleApiCredentials } from '@kbn/scout';
import {
  ALERTING_V2_EXECUTION_HISTORY_ALL_ROLE,
  ALERTING_V2_EXECUTION_HISTORY_READ_ROLE,
  apiTest,
  buildCreateRuleData,
  getRuleExecutionsUrl,
  NO_ACCESS_ROLE,
  testData,
} from '../../../fixtures';

const OTHER_SPACE_ID = 'cross-space-execution-history';

apiTest.describe('Get rule executions API', { tag: '@local-stateful-classic' }, () => {
  let readerCredentials: RoleApiCredentials;
  let readerHeaders: Record<string, string>;

  apiTest.beforeAll(async ({ requestAuth, apiServices }) => {
    readerCredentials = await requestAuth.getApiKeyForCustomRole(
      ALERTING_V2_EXECUTION_HISTORY_READ_ROLE
    );

    readerHeaders = { ...testData.COMMON_HEADERS, ...readerCredentials.apiKeyHeader };

    await apiServices.spaces.delete(OTHER_SPACE_ID);
    await apiServices.spaces.create({ id: OTHER_SPACE_ID, name: OTHER_SPACE_ID });
  });

  apiTest.afterEach(async ({ apiServices }) => {
    await apiServices.alertingV2.rules.cleanUp();
  });

  apiTest.afterAll(async ({ apiServices }) => {
    await apiServices.spaces.delete(OTHER_SPACE_ID);
  });

  apiTest(
    'happy path: returns at least one execution record after the rule executor runs',
    async ({ apiServices, apiClient }) => {
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({ metadata: { name: 'get-rule-executions-smoke' } })
      );

      await apiServices.alertingV2.ruleExecutions.waitForRuns({ ruleId: rule.id, runs: 1 });

      const response = await apiClient.get(getRuleExecutionsUrl({ ruleId: [rule.id] }), {
        headers: readerHeaders,
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.items.length).toBeGreaterThanOrEqual(1);

      for (const item of response.body.items) {
        expect(item.rule.id).toBe(rule.id);
        expect(item.spaceId).toBe('default');
        expect(Date.parse(item.startedAt)).toBeGreaterThan(0);
        expect(Date.parse(item.endedAt)).toBeGreaterThan(0);
        expect(['success', 'failure']).toContain(item.outcome);
        expect(Number.isInteger(item.timings.duration)).toBe(true);
        expect(Number.isInteger(item.timings.scheduledDelay)).toBe(true);
      }

      const successful = response.body.items.find(
        (item: { outcome: string }) => item.outcome === 'success'
      );

      expect(successful).toBeDefined();
    }
  );

  apiTest(
    'space scoping: does not return executions from another space',
    async ({ apiServices, apiClient }) => {
      const ruleInDefaultSpace = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({ metadata: { name: 'cross-space-default' } })
      );

      const ruleInOtherSpace = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({ metadata: { name: 'cross-space-other' } }),
        { spaceId: OTHER_SPACE_ID }
      );

      await apiServices.alertingV2.ruleExecutions.waitForRuns({
        ruleId: ruleInDefaultSpace.id,
        runs: 1,
      });

      await apiServices.alertingV2.ruleExecutions.waitForRuns({
        ruleId: ruleInOtherSpace.id,
        runs: 1,
        spaceId: OTHER_SPACE_ID,
      });

      const response = await apiClient.get(getRuleExecutionsUrl({ perPage: 100 }), {
        headers: readerHeaders,
      });

      expect(response).toHaveStatusCode(200);

      const items = response.body.items as Array<{
        rule: { id: string };
        spaceId: string;
      }>;

      const sawDefaultSpaceRule = items.some(
        (item) => item.rule.id === ruleInDefaultSpace.id && item.spaceId === 'default'
      );

      expect(sawDefaultSpaceRule).toBe(true);

      const leaked = items
        .filter((item) => item.spaceId === OTHER_SPACE_ID || item.rule.id === ruleInOtherSpace.id)
        .map((item) => `${item.spaceId}/${item.rule.id}`);

      expect(leaked).toHaveLength(0);
    }
  );

  apiTest('validation: rejects page=0', async ({ apiClient }) => {
    const response = await apiClient.get(getRuleExecutionsUrl({ page: 0 }), {
      headers: readerHeaders,
    });
    expect(response).toHaveStatusCode(400);
  });

  apiTest('validation: rejects perPage=0', async ({ apiClient }) => {
    const response = await apiClient.get(getRuleExecutionsUrl({ perPage: 0 }), {
      headers: readerHeaders,
    });
    expect(response).toHaveStatusCode(400);
  });

  apiTest('validation: rejects perPage above the maximum', async ({ apiClient }) => {
    const response = await apiClient.get(getRuleExecutionsUrl({ perPage: 101 }), {
      headers: readerHeaders,
    });
    expect(response).toHaveStatusCode(400);
  });

  apiTest('validation: rejects unknown outcome values', async ({ apiClient }) => {
    const response = await apiClient.get(`${getRuleExecutionsUrl()}?outcome=cancelled`, {
      headers: readerHeaders,
    });
    expect(response).toHaveStatusCode(400);
  });

  apiTest('validation: rejects malformed datetimes for from', async ({ apiClient }) => {
    const response = await apiClient.get(`${getRuleExecutionsUrl()}?from=yesterday`, {
      headers: readerHeaders,
    });
    expect(response).toHaveStatusCode(400);
  });

  apiTest(
    'authorization: 200 with alerting_v2_execution_history read privilege',
    async ({ apiClient }) => {
      const response = await apiClient.get(getRuleExecutionsUrl(), { headers: readerHeaders });
      expect(response).toHaveStatusCode(200);
    }
  );

  apiTest(
    'authorization: 200 with alerting_v2_execution_history all privilege',
    async ({ apiClient, requestAuth }) => {
      const writerCredentials = await requestAuth.getApiKeyForCustomRole(
        ALERTING_V2_EXECUTION_HISTORY_ALL_ROLE
      );
      const response = await apiClient.get(getRuleExecutionsUrl(), {
        headers: { ...testData.COMMON_HEADERS, ...writerCredentials.apiKeyHeader },
      });
      expect(response).toHaveStatusCode(200);
    }
  );

  apiTest(
    'authorization: 403 without any alerting_v2 privileges',
    async ({ apiClient, requestAuth }) => {
      const noAccessCredentials = await requestAuth.getApiKeyForCustomRole(NO_ACCESS_ROLE);
      const response = await apiClient.get(getRuleExecutionsUrl(), {
        headers: { ...testData.COMMON_HEADERS, ...noAccessCredentials.apiKeyHeader },
      });
      expect(response).toHaveStatusCode(403);
    }
  );
});
