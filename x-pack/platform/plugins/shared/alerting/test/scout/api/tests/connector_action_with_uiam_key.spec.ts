/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { apiTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { COMMON_HEADERS } from '../fixtures/constants';

/**
 * Regression test for https://github.com/elastic/kibana/issues/268737.
 *
 * In serverless with UIAM enabled, rules created via the HTTP API end up with
 * `apiKey: null` and `uiamApiKey: <base64 id:essu_…>` on the rule SO. Before
 * the fix, `task_runner.runRule` only forwarded the raw `apiKey` to the
 * `ActionScheduler`, so connector tasks were enqueued with `apiKey: null` and
 * ran without an `Authorization` header — failing whenever the connector
 * touched any secured endpoint (e.g. fetching the connector SO under the
 * task's fake request, or talking to ES via `.index`).
 *
 * This test creates an `.index` connector and an always-firing `.es-query`
 * rule that schedules that connector. End-to-end success is verified by
 * polling the target index for the document the action is expected to write.
 * Pre-fix, the document never lands; post-fix it does.
 */

const TARGET_INDEX = 'scout-uiam-connector-action-target';
const RULE_TAG = 'scout-uiam-connector-action';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 120_000;

const waitFor = async (
  predicate: () => Promise<boolean>,
  { timeoutMs, intervalMs }: { timeoutMs: number; intervalMs: number }
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
};

apiTest.describe(
  'Connector actions for rules with UIAM-issued API keys',
  { tag: tags.serverless.observability.complete },
  () => {
    let createdRuleId: string | undefined;
    let createdConnectorId: string | undefined;

    apiTest.afterAll(async ({ apiClient, samlAuth, esClient }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
      if (createdRuleId) {
        // Internal delete route invalidates the rule's apiKey + uiamApiKey
        // synchronously, so no `api_key_pending_invalidation` SOs are left
        // around to leak into neighbouring specs.
        await apiClient.delete(`internal/alerting/rule/${createdRuleId}`, {
          headers: { ...COMMON_HEADERS, ...cookieHeader },
        });
      }
      if (createdConnectorId) {
        await apiClient.delete(`api/actions/connector/${createdConnectorId}`, {
          headers: { ...COMMON_HEADERS, ...cookieHeader },
        });
      }
      await esClient.indices.delete({ index: TARGET_INDEX }, { ignore: [404] });
    });

    apiTest(
      'index connector scheduled by a UIAM rule writes its document end-to-end',
      async ({ apiClient, esClient, samlAuth }) => {
        // Scout's default per-test timeout (60s) is below POLL_TIMEOUT_MS, so we
        // lift it just above the polling ceiling to leave room for connector +
        // rule creation and the sanity check.
        apiTest.setTimeout(POLL_TIMEOUT_MS + 30_000);

        const { cookieHeader } = await samlAuth.asInteractiveUser('admin');

        // The .index connector requires the target index to exist.
        await esClient.indices.create(
          { index: TARGET_INDEX, mappings: { properties: { ruleId: { type: 'keyword' } } } },
          { ignore: [400] }
        );

        const connectorResponse = await apiClient.post('api/actions/connector', {
          headers: { ...COMMON_HEADERS, ...cookieHeader },
          body: {
            name: 'scout-uiam-target-index',
            connector_type_id: '.index',
            config: { index: TARGET_INDEX, refresh: true },
            secrets: {},
          },
          responseType: 'json',
        });
        expect(connectorResponse).toHaveStatusCode(200);
        createdConnectorId = (connectorResponse.body as { id: string }).id;

        // Always-firing .es-query rule: match_all against an index that always
        // has documents (the event log), threshold `> -1` so count is always
        // above it. The rule is force-triggered below via _run_soon, so the
        // schedule interval just satisfies the API contract.
        const ruleResponse = await apiClient.post('api/alerting/rule', {
          headers: { ...COMMON_HEADERS, ...cookieHeader },
          body: {
            name: 'scout-uiam-connector-action-rule',
            tags: [RULE_TAG],
            rule_type_id: '.es-query',
            consumer: 'alerts',
            schedule: { interval: '1m' },
            enabled: true,
            params: {
              searchType: 'esQuery',
              size: 10,
              timeWindowSize: 5,
              timeWindowUnit: 'm',
              thresholdComparator: '>',
              threshold: [-1],
              esQuery: '{"query":{"match_all":{}}}',
              aggType: 'count',
              groupBy: 'all',
              termSize: 5,
              excludeHitsFromPreviousRun: false,
              sourceFields: [],
              index: ['.kibana-event-log-*'],
              timeField: '@timestamp',
            },
            actions: [
              {
                id: createdConnectorId,
                group: 'query matched',
                params: {
                  documents: [{ ruleId: '{{rule.id}}' }],
                },
                frequency: { summary: false, throttle: null, notify_when: 'onActiveAlert' },
              },
            ],
          },
          responseType: 'json',
        });
        expect(ruleResponse).toHaveStatusCode(200);
        createdRuleId = (ruleResponse.body as { id: string }).id;

        // Sanity-check that the rule SO was provisioned with a UIAM credential;
        // otherwise we'd be testing the ES-key path and not the regression we
        // care about.
        const { _source } = await esClient.get<{ alert: Record<string, unknown> }>({
          index: '.kibana_alerting_cases_1',
          id: `alert:${createdRuleId}`,
        });
        const alertAttrs = _source?.alert as Record<string, unknown> | undefined;
        expect(alertAttrs?.uiamApiKey).toBeDefined();

        // Force an immediate run so we don't pay the rule's 1m schedule cadence
        // before the action task is enqueued. Same pattern as
        // wait_for_successful_event_log.ts.
        await apiClient.post(`internal/alerting/rule/${createdRuleId}/_run_soon`, {
          headers: { ...COMMON_HEADERS, ...cookieHeader },
        });

        // End-to-end assertion: the action runs and indexes its document.
        const actionRan = await waitFor(
          async () => {
            const search = await esClient.search({
              index: TARGET_INDEX,
              query: { term: { ruleId: createdRuleId as string } },
              size: 1,
              track_total_hits: true,
            });
            const total = (search.hits.total as { value: number } | undefined)?.value ?? 0;
            return total >= 1;
          },
          { timeoutMs: POLL_TIMEOUT_MS, intervalMs: POLL_INTERVAL_MS }
        );
        expect(actionRan).toBe(true);
      }
    );
  }
);
