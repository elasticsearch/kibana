/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { nodeBuilder } from '@kbn/es-query';
import {
  COMMON_HEADERS,
  ES_QUERY_DEFAULT_INSTANCE_ID,
  ES_QUERY_DEFAULT_INSTANCE_ID_ENCODED,
} from '../fixtures/constants';
import { createMutedRule } from '../lib/create_muted_rule';

const FIND_MUTED_ALERTS_PATH = 'internal/alerting/rules/_find_muted_alerts';

const buildRuleFilter = (ruleId: string): string =>
  JSON.stringify(nodeBuilder.or([nodeBuilder.is('alert.id', `alert:${ruleId}`)]));

interface SnoozedAlertInstance {
  instance_id: string;
  expires_at?: string;
  conditions?: unknown[];
  condition_operator?: 'any' | 'all';
  snoozed_at: string;
  snoozed_by: string;
}

interface FindMutedAlertsResponseBody {
  page: number;
  per_page: number;
  total: number;
  data: Array<{
    id: string;
    muted_alert_instance_ids: string[];
    snoozed_alert_instances: SnoozedAlertInstance[];
  }>;
}

apiTest.describe('Find muted alerts', { tag: tags.deploymentAgnostic }, () => {
  let ruleId: string;

  apiTest.beforeAll(async ({ apiClient, samlAuth }) => {
    const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
    const adminHeaders = { ...COMMON_HEADERS, ...cookieHeader };

    ruleId = await createMutedRule({ apiClient, headers: adminHeaders });
  });

  apiTest.afterAll(async ({ apiClient, samlAuth }) => {
    const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
    const adminHeaders = { ...COMMON_HEADERS, ...cookieHeader };

    if (ruleId) {
      await apiClient.delete(`api/alerting/rule/${ruleId}`, { headers: adminHeaders });
    }
  });

  const expectValidResponseShape = (body: FindMutedAlertsResponseBody): void => {
    expect(typeof body.page).toBe('number');
    expect(typeof body.per_page).toBe('number');
    expect(typeof body.total).toBe('number');
    expect(Array.isArray(body.data)).toBe(true);

    for (const record of body.data) {
      // Each entry must expose exactly the muted/snoozed-alert contract
      // (id + muted_alert_instance_ids + snoozed_alert_instances) and never leak additional rule attributes.
      expect(Object.keys(record).sort()).toStrictEqual([
        'id',
        'muted_alert_instance_ids',
        'snoozed_alert_instances',
      ]);
      expect(typeof record.id).toBe('string');
      expect(Array.isArray(record.muted_alert_instance_ids)).toBe(true);
      for (const alertId of record.muted_alert_instance_ids) {
        expect(typeof alertId).toBe('string');
      }
      expect(Array.isArray(record.snoozed_alert_instances)).toBe(true);
    }
  };

  apiTest('returns the muted alert instance for a rule', async ({ apiClient, samlAuth }) => {
    const { cookieHeader } = await samlAuth.asInteractiveUser('admin');

    const response = await apiClient.post(FIND_MUTED_ALERTS_PATH, {
      headers: { ...COMMON_HEADERS, ...cookieHeader },
      body: { filter: buildRuleFilter(ruleId), page: 1, per_page: 10 },
      responseType: 'json',
    });

    expect(response).toHaveStatusCode(200);
    const body = response.body as FindMutedAlertsResponseBody;
    expectValidResponseShape(body);

    const record = body.data.find((rule) => rule.id === ruleId);
    expect(record).toBeDefined();
    expect(record!.muted_alert_instance_ids).toContain(ES_QUERY_DEFAULT_INSTANCE_ID);
  });

  apiTest(
    'returns muted and snoozed instance state for a rule',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
      const adminHeaders = { ...COMMON_HEADERS, ...cookieHeader };

      // Snooze the same (already-muted) alert instance with a far-future expiry.
      const expiresAt = '2099-12-31T23:59:59.000Z';
      const snoozeResponse = await apiClient.post(
        `api/alerting/rule/${ruleId}/alert/${ES_QUERY_DEFAULT_INSTANCE_ID_ENCODED}/_snooze`,
        {
          headers: adminHeaders,
          body: { expires_at: expiresAt },
          responseType: 'json',
        }
      );
      expect(snoozeResponse).toHaveStatusCode(204);

      const response = await apiClient.post(FIND_MUTED_ALERTS_PATH, {
        headers: adminHeaders,
        body: { filter: buildRuleFilter(ruleId), page: 1, per_page: 10 },
        responseType: 'json',
      });

      expect(response).toHaveStatusCode(200);
      const body = response.body as FindMutedAlertsResponseBody;
      expectValidResponseShape(body);

      const record = body.data.find((rule) => rule.id === ruleId);
      expect(record).toBeDefined();
      // The single API surfaces both muted and snoozed state for the instance.
      expect(record!.muted_alert_instance_ids).toContain(ES_QUERY_DEFAULT_INSTANCE_ID);

      const snoozed = record!.snoozed_alert_instances.find(
        (instance) => instance.instance_id === ES_QUERY_DEFAULT_INSTANCE_ID
      );
      expect(snoozed).toBeDefined();
      expect(snoozed!.expires_at).toBe(expiresAt);
      expect(typeof snoozed!.snoozed_at).toBe('string');
      expect(typeof snoozed!.snoozed_by).toBe('string');
    }
  );
});
