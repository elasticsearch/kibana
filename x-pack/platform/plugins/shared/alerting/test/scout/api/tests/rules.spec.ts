/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { COMMON_HEADERS } from '../fixtures/constants';
import { waitForSuccessfulEventLogEntry } from '../lib/wait_for_successful_event_log';

const INDEX_THRESHOLD_PARAMS = {
  aggType: 'count',
  termSize: 5,
  thresholdComparator: '>' as const,
  timeWindowSize: 5,
  timeWindowUnit: 'm' as const,
  groupBy: 'all' as const,
  threshold: [10],
  index: ['.kibana-event-log-*'],
  timeField: '@timestamp',
};

const RULE_NAME = 'scout-create-rule';

apiTest.describe('Alerting Rule', { tag: tags.serverless.observability.complete }, () => {
  let createdRuleId: string;

  apiTest.beforeAll(async ({ apiClient, samlAuth }) => {
    const { cookieHeader } = await samlAuth.asInteractiveUser('admin');

    const createResponse = await apiClient.post('api/alerting/rule', {
      headers: { ...COMMON_HEADERS, ...cookieHeader },
      body: {
        name: RULE_NAME,
        rule_type_id: '.index-threshold',
        consumer: 'stackAlerts',
        schedule: { interval: '1m' },
        enabled: true,
        actions: [],
        params: INDEX_THRESHOLD_PARAMS,
        tags: ['scout'],
      },
      responseType: 'json',
    });
    expect(createResponse).toHaveStatusCode(200);
    const createBody = createResponse.body as { id: string; api_key_owner: string | null };
    expect(createBody.id).toBeDefined();
    expect(createBody.api_key_owner != null && createBody.api_key_owner !== '').toBe(true);
    createdRuleId = createBody.id;
  });

  apiTest.afterAll(async ({ apiClient, kbnClient, samlAuth }) => {
    if (createdRuleId) {
      const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
      const deleteResponse = await apiClient.delete(`api/alerting/rule/${createdRuleId}`, {
        headers: { ...COMMON_HEADERS, ...cookieHeader },
      });
      // Rule may already be deleted by the "when rule is deleted..." test
      expect(deleteResponse.statusCode === 204 || deleteResponse.statusCode === 404).toBe(true);
    }
    await kbnClient.savedObjects.clean({ types: ['api_key_pending_invalidation'] });
  });

  apiTest('newly created rule has api_key_owner', async ({ esClient }) => {
    // Verify encrypted fields exist on the rule saved object in ES (not exposed by the API)
    const { _source } = await esClient.get({
      index: '.kibana_alerting_cases_1',
      id: `alert:${createdRuleId}`,
    });

    expect(_source).toBeDefined();
    const alertAttrs = (_source as Record<string, unknown>)?.alert as Record<string, unknown>;
    expect(alertAttrs).toBeDefined();
    expect(alertAttrs.apiKey).toBeDefined();
    expect(alertAttrs.uiamApiKey).toBeDefined();
    expect(alertAttrs.apiKeyOwner).toBeDefined();
  });

  apiTest('The rule runs and event log shows success', async ({ apiClient, samlAuth }) => {
    // rule is created with enabled: true, so it should run automatically
    const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
    const result = await waitForSuccessfulEventLogEntry(apiClient, createdRuleId, {
      ...COMMON_HEADERS,
      ...cookieHeader,
    });
    expect(result.data.some((entry) => entry.status === 'success')).toBe(true);
  });

  apiTest(
    'when rule is updated, apiKey and uiamApiKey are queued for invalidation',
    async ({ apiClient, kbnClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser('admin');

      const { saved_objects: pendingInvalidationsBefore } = await kbnClient.savedObjects.find({
        type: 'api_key_pending_invalidation',
      });

      expect(pendingInvalidationsBefore).toHaveLength(0);

      const updateResponse = await apiClient.put(`api/alerting/rule/${createdRuleId}`, {
        headers: { ...COMMON_HEADERS, ...cookieHeader },
        body: {
          name: 'scout-updated-rule',
          tags: ['scout'],
          schedule: { interval: '1m' },
          params: INDEX_THRESHOLD_PARAMS,
          actions: [],
        },
        responseType: 'json',
      });
      expect(updateResponse).toHaveStatusCode(200);

      // There is no encrypted saved objects client in scout, so we need to use the raw saved objects client
      const { saved_objects: pendingInvalidations } = await kbnClient.savedObjects.find({
        type: 'api_key_pending_invalidation',
      });

      // apiKeyId and uiamApiKey fields are encrypted, therefore not returned in the response
      // we can check the length of the response to confirm that both apiKey and uiamApiKey were created
      expect(pendingInvalidations).toHaveLength(2);
    }
  );

  apiTest(
    'when rule is deleted, apiKey and uiamApiKey are queued for invalidation',
    async ({ apiClient, kbnClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser('admin');

      const deleteResponse = await apiClient.delete(`api/alerting/rule/${createdRuleId}`, {
        headers: { ...COMMON_HEADERS, ...cookieHeader },
      });
      expect(deleteResponse).toHaveStatusCode(204);

      const { saved_objects: pendingInvalidations } = await kbnClient.savedObjects.find({
        type: 'api_key_pending_invalidation',
      });

      // 2 from update test + 2 from this delete = 4 total (apiKey and uiamApiKey each time)
      expect(pendingInvalidations).toHaveLength(4);
    }
  );
});
