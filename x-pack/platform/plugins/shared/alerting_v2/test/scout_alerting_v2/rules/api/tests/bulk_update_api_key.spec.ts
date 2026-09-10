/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import type { RoleApiCredentials } from '@kbn/scout';
import { ID_MAX_LENGTH, MAX_BULK_ITEMS } from '@kbn/alerting-v2-schemas';
import {
  ALERTING_V2_RULES_ALL_ROLE,
  ALERTING_V2_RULES_READ_ROLE,
  type AlertingApiServicesFixture,
  apiTest,
  buildCreateRuleData,
  NO_ACCESS_ROLE,
  testData,
} from '../fixtures';

const BULK_UPDATE_API_KEY_URL = `${testData.RULE_API_PATH}/_bulk_update_api_key`;

// Rules are created enabled, so Task Manager runs their executor once
// immediately — independent of the schedule interval. `_bulk_update_api_key`
// only rotates `idle` tasks, so rotating while that first run is still in
// flight skips the rule and reports a per-rule error. Create with a long
// interval and wait for the executor to settle back to `idle` (its next run a
// day out) before rotating, so the rotation acts on an idle task deterministically.
const createRotatableRule = async (apiServices: AlertingApiServicesFixture, name: string) => {
  const rule = await apiServices.alertingV2.rules.create(
    buildCreateRuleData({
      metadata: { name },
      schedule: { every: '1d', lookback: testData.LOOKBACK_WINDOW },
    })
  );
  await apiServices.alertingV2.ruleExecutions.waitForExecutorIdle({ ruleId: rule.id });
  return rule;
};

apiTest.describe('Bulk update rule API key by IDs API', { tag: '@local-stateful-classic' }, () => {
  let writerCredentials: RoleApiCredentials;
  let writerHeaders: Record<string, string>;

  apiTest.beforeAll(async ({ requestAuth, apiServices }) => {
    writerCredentials = await requestAuth.getApiKeyForCustomRole(ALERTING_V2_RULES_ALL_ROLE);
    writerHeaders = { ...testData.COMMON_HEADERS, ...writerCredentials.apiKeyHeader };

    await apiServices.alertingV2.rules.cleanUp();
  });

  apiTest.afterAll(async ({ apiServices }) => {
    await apiServices.alertingV2.rules.cleanUp();
  });

  apiTest(
    'update: rotates the API key for rules and stamps audit metadata',
    async ({ apiClient, apiServices }) => {
      const ruleA = await createRotatableRule(apiServices, 'rule-a');
      const ruleB = await createRotatableRule(apiServices, 'rule-b');

      const response = await apiClient.post(BULK_UPDATE_API_KEY_URL, {
        headers: writerHeaders,
        body: { ids: [ruleA.id, ruleB.id] },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ affected_count: 2, errors: [] });

      // The API key rotation is not observable directly (Task Manager stores it
      // encrypted), so assert the side effect via the saved object write. The
      // OCC `version` is the reliable witness: every successful write bumps it,
      // independently of the clock. `updated_at` is a weaker, clock-dependent
      // proxy kept only as a sanity check that the write advanced the timestamp.
      for (const created of [ruleA, ruleB]) {
        const fetched = await apiServices.alertingV2.rules.get(created.id);
        expect(fetched.version).not.toBe(created.version);
        expect(Date.parse(fetched.updated_at)).toBeGreaterThan(Date.parse(created.updated_at));
      }
    }
  );

  apiTest(
    'state: preserves all rule attributes other than the audit metadata',
    async ({ apiClient, apiServices }) => {
      const created = await createRotatableRule(apiServices, 'preserve-attrs-rule');

      const response = await apiClient.post(BULK_UPDATE_API_KEY_URL, {
        headers: writerHeaders,
        body: { ids: [created.id] },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ affected_count: 1, errors: [] });

      const fetched = await apiServices.alertingV2.rules.get(created.id);
      // Rotation neither disables the rule nor changes its configuration.
      expect(fetched.enabled).toBe(true);
      expect(fetched).toStrictEqual({
        ...created,
        updated_at: fetched.updated_at,
        updated_by: fetched.updated_by,
        version: fetched.version,
      });
      expect(fetched.version).not.toBe(created.version);
    }
  );

  apiTest(
    'update: reports unknown ids in the errors array with RULE_NOT_FOUND while rotating the valid ones',
    async ({ apiClient, apiServices }) => {
      const rule = await createRotatableRule(apiServices, 'existing-rule');

      const response = await apiClient.post(BULK_UPDATE_API_KEY_URL, {
        headers: writerHeaders,
        body: { ids: [rule.id, 'does-not-exist'] },
      });

      expect(response).toHaveStatusCode(200);
      expect(response.body.affected_count).toBe(1);
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0]).toMatchObject({
        id: 'does-not-exist',
        error: { code: 'RULE_NOT_FOUND' },
      });
    }
  );

  apiTest('validation: should reject an empty ids array', async ({ apiClient }) => {
    const response = await apiClient.post(BULK_UPDATE_API_KEY_URL, {
      headers: writerHeaders,
      body: { ids: [] },
    });
    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('validation: should reject a body with no ids field', async ({ apiClient }) => {
    const response = await apiClient.post(BULK_UPDATE_API_KEY_URL, {
      headers: writerHeaders,
      body: {},
    });
    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('validation: should reject unknown fields (strict schema)', async ({ apiClient }) => {
    const response = await apiClient.post(BULK_UPDATE_API_KEY_URL, {
      headers: writerHeaders,
      body: { ids: ['some-id'], unknown: 'value' },
    });
    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest('validation: should reject ids longer than ID_MAX_LENGTH', async ({ apiClient }) => {
    const tooLongId = 'a'.repeat(ID_MAX_LENGTH + 1);
    const response = await apiClient.post(BULK_UPDATE_API_KEY_URL, {
      headers: writerHeaders,
      body: { ids: [tooLongId] },
    });
    expect(response).toHaveStatusCode(400);
    expect(response.body.code).toBe('BAD_REQUEST');
  });

  apiTest(
    'validation: should reject ids arrays longer than MAX_BULK_ITEMS',
    async ({ apiClient }) => {
      const ids = Array.from({ length: MAX_BULK_ITEMS + 1 }, (_, i) => `id-${i}`);
      const response = await apiClient.post(BULK_UPDATE_API_KEY_URL, {
        headers: writerHeaders,
        body: { ids },
      });
      expect(response).toHaveStatusCode(400);
      expect(response.body.code).toBe('BAD_REQUEST');
    }
  );

  apiTest(
    'authorization: should return 200 for a user with full alerting_v2 privileges',
    async ({ apiClient, apiServices }) => {
      const rule = await createRotatableRule(apiServices, 'writer-can-rotate');
      const response = await apiClient.post(BULK_UPDATE_API_KEY_URL, {
        headers: writerHeaders,
        body: { ids: [rule.id] },
      });
      expect(response).toHaveStatusCode(200);
      expect(response.body).toStrictEqual({ affected_count: 1, errors: [] });
    }
  );

  apiTest(
    'authorization: should return 403 for a user with read-only alerting_v2 privileges',
    async ({ apiClient, apiServices, requestAuth }) => {
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({ metadata: { name: 'reader-cannot-rotate' } })
      );
      const readerCredentials = await requestAuth.getApiKeyForCustomRole(
        ALERTING_V2_RULES_READ_ROLE
      );
      const response = await apiClient.post(BULK_UPDATE_API_KEY_URL, {
        headers: { ...testData.COMMON_HEADERS, ...readerCredentials.apiKeyHeader },
        body: { ids: [rule.id] },
      });
      expect(response).toHaveStatusCode(403);
      // Verify the rule was left untouched after the forbidden call.
      const stored = await apiServices.alertingV2.rules.get(rule.id);
      expect(stored.version).toBe(rule.version);
    }
  );

  apiTest(
    'authorization: should return 403 for a user without alerting_v2 privileges',
    async ({ apiClient, apiServices, requestAuth }) => {
      const rule = await apiServices.alertingV2.rules.create(
        buildCreateRuleData({ metadata: { name: 'noaccess-cannot-rotate' } })
      );
      const noAccessCredentials = await requestAuth.getApiKeyForCustomRole(NO_ACCESS_ROLE);
      const response = await apiClient.post(BULK_UPDATE_API_KEY_URL, {
        headers: { ...testData.COMMON_HEADERS, ...noAccessCredentials.apiKeyHeader },
        body: { ids: [rule.id] },
      });
      expect(response).toHaveStatusCode(403);
      const stored = await apiServices.alertingV2.rules.get(rule.id);
      expect(stored.version).toBe(rule.version);
    }
  );
});
