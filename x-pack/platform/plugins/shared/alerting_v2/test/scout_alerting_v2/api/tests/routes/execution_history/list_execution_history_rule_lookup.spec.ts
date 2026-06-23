/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Smoke test for rna-program#592.
 *
 * Asserts that the execution history listing tolerates rule ids that no longer
 * resolve: deleting a rule referenced by an event log entry must not poison
 * name resolution for the rest of the batch.
 *
 * Setup mirrors `dispatcher.spec.ts`: rules are upserted with stable ids and
 * disabled so the executor task does not race the seeded alert events.
 */

import { expect } from '@kbn/scout/api';
import type { RoleApiCredentials } from '@kbn/scout';
import type {
  ListPolicyExecutionHistoryResponse,
  PolicyExecutionHistoryItem,
} from '@kbn/alerting-v2-schemas';
import type { AlertEvent } from '../../../../../../server/resources/datastreams/alert_events';
import {
  apiTest,
  buildCreateRuleData,
  getListExecutionHistoryUrl,
  READ_ROLE,
  testData,
} from '../../../fixtures';

const { POLL_INTERVAL_MS, POLL_TIMEOUT_MS } = testData;

const ACTION_POLICY_ID = 'eh-rule-lookup-policy';
const RULE_ID_KEPT = 'eh-rule-lookup-kept';
const RULE_ID_DELETED = 'eh-rule-lookup-deleted';
const RULE_KEPT_NAME = 'Execution History Rule Kept';
const RULE_DELETED_NAME = 'Execution History Rule Deleted';

const buildSeedEvent = (ruleId: string): AlertEvent =>
  ({
    '@timestamp': new Date().toISOString(),
    type: 'alert',
    rule: { id: ruleId, version: 1 },
    group_hash: `${ruleId}-series`,
    episode: { id: `${ruleId}-episode`, status: 'active' },
    data: {},
    status: 'breached',
    source: 'internal',
    space_id: 'default',
  } as AlertEvent);

apiTest.describe(
  'List execution history — tolerates missing rule ids',
  { tag: '@local-stateful-classic' },
  () => {
    let readerCredentials: RoleApiCredentials;
    let readerHeaders: Record<string, string>;

    apiTest.beforeAll(async ({ apiServices, requestAuth }) => {
      readerCredentials = await requestAuth.getApiKeyForCustomRole(READ_ROLE);
      readerHeaders = { ...testData.COMMON_HEADERS, ...readerCredentials.apiKeyHeader };

      await apiServices.alertingV2.alertActions.cleanUp();
      await apiServices.alertingV2.ruleEvents.cleanUp();
      await apiServices.alertingV2.rules.cleanUp();
      await apiServices.alertingV2.actionPolicies.cleanUp();

      await apiServices.alertingV2.actionPolicies.upsert(ACTION_POLICY_ID, {
        name: 'Execution history rule lookup policy',
        description: 'Smoke test policy',
        destinations: [{ type: 'workflow', id: 'test-workflow' }],
      });
    });

    apiTest.afterAll(async ({ apiServices }) => {
      await apiServices.alertingV2.alertActions.cleanUp();
      await apiServices.alertingV2.ruleEvents.cleanUp();
      await apiServices.alertingV2.rules.cleanUp();
      await apiServices.alertingV2.actionPolicies.cleanUp();
    });

    apiTest(
      'resolves names for surviving rules and falls back to id for deleted ones',
      async ({ apiServices, apiClient }) => {
        for (const [id, name] of [
          [RULE_ID_KEPT, RULE_KEPT_NAME],
          [RULE_ID_DELETED, RULE_DELETED_NAME],
        ] as const) {
          await apiServices.alertingV2.rules.upsert(
            id,
            buildCreateRuleData({
              metadata: { name },
              schedule: { every: '1d' },
              query: {
                format: 'standalone',
                breach: { query: 'FROM .alert-actions | WHERE rule_id == "__never_matches__"' },
              },
              state_transition: { pending_count: 0, recovering_count: 0 },
            })
          );
        }
        await apiServices.alertingV2.rules.bulkDisable({ ids: [RULE_ID_KEPT, RULE_ID_DELETED] });

        await apiServices.alertingV2.ruleEvents.seed([
          buildSeedEvent(RULE_ID_KEPT),
          buildSeedEvent(RULE_ID_DELETED),
        ]);

        await apiServices.alertingV2.alertActions.waitForAtLeast(1, {
          ruleId: RULE_ID_KEPT,
          actionTypes: ['fire'],
        });
        await apiServices.alertingV2.alertActions.waitForAtLeast(1, {
          ruleId: RULE_ID_DELETED,
          actionTypes: ['fire'],
        });

        await apiServices.alertingV2.rules.delete(RULE_ID_DELETED);

        const seenBothIds = async (): Promise<boolean> => {
          const response = await apiClient.get(getListExecutionHistoryUrl({ perPage: 100 }), {
            headers: readerHeaders,
          });
          const ids = new Set(
            (response.body as ListPolicyExecutionHistoryResponse).items.map((it) => it.rule.id)
          );
          return ids.has(RULE_ID_KEPT) && ids.has(RULE_ID_DELETED);
        };

        await expect
          .poll(seenBothIds, { timeout: POLL_TIMEOUT_MS, intervals: [POLL_INTERVAL_MS] })
          .toBe(true);

        const response = await apiClient.get(getListExecutionHistoryUrl({ perPage: 100 }), {
          headers: readerHeaders,
        });
        expect(response).toHaveStatusCode(200);

        const body = response.body as ListPolicyExecutionHistoryResponse;
        const itemsByRule = (id: string): PolicyExecutionHistoryItem[] =>
          body.items.filter((it) => it.rule.id === id);

        const itemsOfRuleKept = itemsByRule(RULE_ID_KEPT);
        const itemsOfRuleDeleted = itemsByRule(RULE_ID_DELETED);

        expect(itemsOfRuleKept.length).toBeGreaterThanOrEqual(1);
        expect(itemsOfRuleDeleted.length).toBeGreaterThanOrEqual(1);

        for (const item of itemsOfRuleKept) {
          expect(item.rule).toStrictEqual({ id: RULE_ID_KEPT, name: RULE_KEPT_NAME });
        }
        for (const item of itemsOfRuleDeleted) {
          expect(item.rule).toStrictEqual({ id: RULE_ID_DELETED, name: null });
        }
      }
    );
  }
);
