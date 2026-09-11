/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient } from '@kbn/scout-oblt';
import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test, testData } from '../fixtures';

const { DYNAMIC_SETTINGS_DEFAULTS, DEFAULT_NAVIGATION_SEARCH } = testData;

const MONITOR_ID = '0000-intermittent';
const CONNECTOR_TYPE_ID = '.server-log';

interface RuleAction {
  id: string;
  connector_type_id: string;
}

interface FoundRule {
  id: string;
  rule_type_id: string;
  consumer: string;
  tags: string[];
  actions: RuleAction[];
  params: { search?: string };
}

const setDefaultConnectors = async (kbnClient: KbnClient, connectorIds: string[]) => {
  await kbnClient.request({
    method: 'PUT',
    path: '/api/uptime/settings',
    body: { ...DYNAMIC_SETTINGS_DEFAULTS, defaultConnectors: connectorIds },
  });
};

const findSimpleStatusRule = async (kbnClient: KbnClient): Promise<FoundRule | undefined> => {
  const { data } = await kbnClient.request<{ data: FoundRule[] }>({
    method: 'GET',
    path: `/api/alerting/rules/_find?search=${encodeURIComponent('Simple status alert')}`,
  });
  return data.data.find((rule) => rule.params?.search?.includes(MONITOR_ID));
};

test.describe('SimpleDownAlert', { tag: tags.stateful.classic }, () => {
  let connectorId: string;

  test.beforeAll(async ({ kbnClient }) => {
    const { data } = await kbnClient.request<{ id: string }>({
      method: 'POST',
      path: '/api/actions/connector',
      body: {
        name: `Scout uptime simple-down connector ${Date.now()}`,
        connector_type_id: CONNECTOR_TYPE_ID,
        config: {},
        secrets: {},
      },
    });
    connectorId = data.id;
    await setDefaultConnectors(kbnClient, [connectorId]);
  });

  test.afterAll(async ({ kbnClient }) => {
    const rule = await findSimpleStatusRule(kbnClient).catch(() => undefined);
    if (rule) {
      await kbnClient
        .request({ method: 'DELETE', path: `/api/alerting/rule/${rule.id}` })
        .catch(() => {});
    }
    await setDefaultConnectors(kbnClient, []).catch(() => {});
    await kbnClient
      .request({ method: 'DELETE', path: `/api/actions/connector/${connectorId}` })
      .catch(() => {});
  });

  test('enables and disables a simple status alert from the monitor list', async ({
    browserAuth,
    pageObjects,
    page,
    kbnClient,
  }) => {
    await browserAuth.loginAsAdmin();
    await pageObjects.uptimeApp.navigateToOverview(DEFAULT_NAVIGATION_SEARCH);
    await pageObjects.uptimeApp.waitForDataLoaded();

    await test.step('enable simple status alert', async () => {
      await page.testSubj.locator(`uptimeEnableSimpleDownAlert${MONITOR_ID}`).click();
      await page.testSubj.waitForSelector(`uptimeDisableSimpleDownAlert${MONITOR_ID}`, {
        timeout: 30_000,
      });
    });

    await test.step('shows the alert in the monitor list drawer', async () => {
      await page.testSubj.click(`xpack.synthetics.monitorList.${MONITOR_ID}.expandMonitorDetail`);
      await page.testSubj.waitForSelector('uptimeMonitorListDrawerAlert0', { timeout: 30_000 });
    });

    await test.step('creates a valid simple alert with expected parameters', async () => {
      await expect(async () => {
        const rule = await findSimpleStatusRule(kbnClient);
        expect(rule).toBeDefined();
        expect(rule?.rule_type_id).toBe('xpack.uptime.alerts.monitorStatus');
        expect(rule?.consumer).toBe('uptime');
        expect(rule?.tags).toContain('UPTIME_AUTO');
        expect(rule?.actions.length).toBeGreaterThanOrEqual(1);
        expect(rule?.actions.every((action) => action.id === connectorId)).toBe(true);
      }).toPass({ timeout: 30_000 });
    });

    await test.step('disable simple status alert', async () => {
      await page.testSubj.locator(`uptimeDisableSimpleDownAlert${MONITOR_ID}`).click();
      await page.testSubj.waitForSelector(`uptimeEnableSimpleDownAlert${MONITOR_ID}`, {
        timeout: 30_000,
      });
    });
  });
});
