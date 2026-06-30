/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test } from '../../fixtures';

// Ported from the FTR `Mute and Unmute alerts` suite
// (x-pack/solutions/observability/test/observability_functional/apps/observability/pages/alerts/mute_unmute.ts).
//
// A grouped `.es-query` rule is created and left to fire (>= 2 alert instances),
// then the table's bulk mute/unmute actions are exercised. The FTR split this
// into a sequence of dependent `it`s sharing one browser session; here they are
// one journey with `test.step`s. The mute field is written server-side via a
// fire-and-forget `updateByQuery` (alertsService `_updateMuteState`), so every
// post-action assertion polls by re-running the query bar (the FTR used
// `retry.try` for the same reason).
const TEST_INDEX = 'mute-test-data';
const STACK_ALERTS_INDEX = '.alerts-stack.alerts-default';
const MIN_ALERTS = 2;
// Not `as const`: `expect.poll` expects `intervals?: number[]`, and `as const`
// would widen it to a readonly tuple that isn't assignable.
const ASYNC_POLL: { timeout: number; intervals: number[] } = {
  timeout: 60_000,
  intervals: [3_000],
};

async function countActiveAlerts(esClient: Client, ruleId: string): Promise<number> {
  const response = await esClient.count({
    index: STACK_ALERTS_INDEX,
    ignore_unavailable: true,
    query: {
      bool: {
        must: [
          { term: { 'kibana.alert.rule.uuid': ruleId } },
          { term: { 'kibana.alert.status': 'active' } },
        ],
      },
    },
  });
  return response.count;
}

test.describe(
  'Observability alerts - bulk mute / unmute',
  { tag: [...tags.stateful.classic] },
  () => {
    let ruleId: string;

    test.beforeAll(async ({ esClient, apiServices, log }) => {
      await apiServices.alerting.cleanup.deleteAllRules();

      await esClient.indices.create({
        index: TEST_INDEX,
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            host: { type: 'keyword' },
            message: { type: 'text' },
          },
        },
      });

      const now = new Date().toISOString();
      await esClient.bulk({
        refresh: 'wait_for',
        operations: [
          { index: { _index: TEST_INDEX } },
          { '@timestamp': now, host: 'host-a', message: 'test message 1' },
          { index: { _index: TEST_INDEX } },
          { '@timestamp': now, host: 'host-b', message: 'test message 2' },
          { index: { _index: TEST_INDEX } },
          { '@timestamp': now, host: 'host-a', message: 'test message 3' },
          { index: { _index: TEST_INDEX } },
          { '@timestamp': now, host: 'host-b', message: 'test message 4' },
        ],
      });

      const { data } = await apiServices.alerting.rules.create({
        name: 'Mute test rule',
        consumer: 'logs',
        ruleTypeId: '.es-query',
        schedule: { interval: '1m' },
        params: {
          size: 100,
          thresholdComparator: '>',
          threshold: [0],
          index: [TEST_INDEX],
          timeField: '@timestamp',
          esQuery: JSON.stringify({ query: { match_all: {} } }),
          timeWindowSize: 5,
          timeWindowUnit: 'm',
          groupBy: 'top',
          termSize: 10,
          termField: 'host',
        },
        actions: [],
      });
      ruleId = data.id;
      log.info(`Created mute test rule ${ruleId}`);

      // Let the rule fire and produce the grouped alert instances.
      await apiServices.alerting.waiting.waitForRuleStatus(ruleId, 'active', undefined, 120_000);
      await expect
        .poll(() => countActiveAlerts(esClient, ruleId), { timeout: 120_000, intervals: [3_000] })
        .toBeGreaterThanOrEqual(MIN_ALERTS);
    });

    test.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsAdmin();
    });

    test.afterAll(async ({ esClient, apiServices }) => {
      await apiServices.alerting.cleanup.deleteAllRules();
      await esClient.indices.delete({ index: TEST_INDEX, ignore_unavailable: true });
    });

    test('bulk mutes and unmutes the rule alerts', async ({ pageObjects }) => {
      const { alertsTablePage } = pageObjects;
      const ruleQuery = `kibana.alert.rule.uuid: "${ruleId}"`;
      let totalAlerts = 0;

      await alertsTablePage.goto({ withoutFilter: true });
      await alertsTablePage.submitQuery(ruleQuery);
      await alertsTablePage.waitForTableToLoad();

      await test.step('finds at least two alerts for the rule', async () => {
        await expect.poll(() => alertsTablePage.getRowCount()).toBeGreaterThanOrEqual(MIN_ALERTS);
        totalAlerts = await alertsTablePage.getRowCount();
      });

      await test.step('bulk mutes all selected alerts and shows a success toast', async () => {
        await alertsTablePage.selectAllVisibleAlerts();
        await alertsTablePage.bulkMuteSelected();
        const toast = await alertsTablePage.readAndDismissLatestToastTitle();
        expect(toast).toContain('Muted');
        expect(toast).toContain('alert instance');
        expect(toast).toContain('rule');
      });

      await test.step('reports every alert as muted', async () => {
        await expect
          .poll(
            () => alertsTablePage.countForQuery(`${ruleQuery} AND kibana.alert.muted: true`),
            ASYNC_POLL
          )
          .toBe(totalAlerts);
        await expect
          .poll(
            () => alertsTablePage.countForQuery(`${ruleQuery} AND kibana.alert.muted: false`),
            ASYNC_POLL
          )
          .toBe(0);
      });

      await test.step('renders the muted indicator icon on the muted alert rows', async () => {
        await alertsTablePage.countForQuery(ruleQuery);
        await expect
          .poll(() => alertsTablePage.getVisibleSnoozedBadgeCount(), ASYNC_POLL)
          .toBe(totalAlerts);
      });

      await test.step('bulk unmutes all selected alerts and shows a success toast', async () => {
        await alertsTablePage.countForQuery(ruleQuery);
        await alertsTablePage.selectAllVisibleAlerts();
        await alertsTablePage.bulkUnmuteSelected();
        const toast = await alertsTablePage.readAndDismissLatestToastTitle();
        expect(toast).toContain('Unmuted');
        expect(toast).toContain('alert instance');
        expect(toast).toContain('rule');
      });

      await test.step('reports every alert as unmuted', async () => {
        await expect
          .poll(
            () => alertsTablePage.countForQuery(`${ruleQuery} AND kibana.alert.muted: false`),
            ASYNC_POLL
          )
          .toBe(totalAlerts);
        await expect
          .poll(
            () => alertsTablePage.countForQuery(`${ruleQuery} AND kibana.alert.muted: true`),
            ASYNC_POLL
          )
          .toBe(0);
      });

      await test.step('removes the muted indicator icon from the alert rows', async () => {
        await alertsTablePage.countForQuery(ruleQuery);
        await expect.poll(() => alertsTablePage.getVisibleSnoozedBadgeCount(), ASYNC_POLL).toBe(0);
      });
    });
  }
);
