/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import { test } from '../fixtures';
import { GENERATED_METRICS } from '../fixtures/constants';
import { ALERTS_ONLY_ROLE } from '../fixtures/roles';

test.describe(
  'Alert Details Page',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    let ruleId: string;

    const alertName = `Write bytes test rule ${Date.now()}`;

    test.beforeAll(async ({ apiServices }) => {
      const createdRule = (await apiServices.alerting.rules.create({
        tags: [],
        params: {
          criteria: [
            {
              comparator: '>',
              metrics: [
                {
                  name: 'A',
                  field: GENERATED_METRICS.metricName,
                  aggType: 'max',
                },
              ],
              threshold: [100],
              timeSize: 1,
              timeUnit: 'd',
            },
          ],
          alertOnNoData: false,
          alertOnGroupDisappear: false,
          searchConfiguration: {
            query: {
              query: '',
              language: 'kuery',
            },
            index: 'metrics-*',
          },
        },
        schedule: {
          interval: '1m',
        },
        consumer: 'alerts',
        name: alertName,
        ruleTypeId: 'observability.rules.custom_threshold',
        actions: [],
      })) as { data: { id: string } };
      ruleId = createdRule.data.id;
    });

    test.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsAdmin();
    });

    test('should show an error when the alert does not exist', async ({ page, pageObjects }) => {
      await expect(async () => {
        await pageObjects.alertPage.goto('non-existent-alert-id');
        await expect(page.testSubj.locator('alertDetailsError')).toBeVisible();
      }).toPass({ timeout: 30_000, intervals: [2_000] });
    });

    test('should show a tabbed view', async ({ page, pageObjects }) => {
      await expect(async () => {
        await pageObjects.alertPage.gotoAlertByRuleId(pageObjects.rulesPage, ruleId);
        await expect(page.testSubj.locator('overviewTab')).toBeVisible();
        await expect(page.testSubj.locator('metadataTab')).toBeVisible();
        await expect(page.testSubj.locator('investigationGuideTab')).toBeVisible();
        await expect(page.testSubj.locator('relatedAlertsTab')).toBeVisible();
        await expect(page.testSubj.locator('relatedDashboardsTab')).toBeVisible();
      }).toPass({ timeout: 60_000, intervals: [2_000] });
    });

    test('should show a Threshold Alert Overview section', async ({ page, pageObjects }) => {
      await expect(async () => {
        await pageObjects.alertPage.gotoAlertByRuleId(pageObjects.rulesPage, ruleId);
        await expect(page.testSubj.locator('thresholdAlertOverviewSection')).toBeVisible();
      }).toPass({ timeout: 60_000, intervals: [2_000] });
    });

    test('should show an Alerts History section', async ({ page, pageObjects }) => {
      await expect(async () => {
        await pageObjects.alertPage.gotoAlertByRuleId(pageObjects.rulesPage, ruleId);
        await expect(page.testSubj.locator('AlertDetails')).toBeVisible();
      }).toPass({ timeout: 60_000, intervals: [2_000] });
    });

    test('should show Metadata tab panel when Metadata tab is clicked', async ({
      page,
      pageObjects,
    }) => {
      await expect(async () => {
        await pageObjects.alertPage.gotoAlertByRuleId(pageObjects.rulesPage, ruleId);
        await page.testSubj.locator('metadataTab').click();
        await expect(page.testSubj.locator('metadataTabPanel')).toBeVisible();
      }).toPass({ timeout: 60_000, intervals: [2_000] });
    });

    test('should show an empty prompt in the Investigation Guide tab when no guide is set', async ({
      page,
      pageObjects,
    }) => {
      await expect(async () => {
        await pageObjects.alertPage.gotoAlertByRuleId(pageObjects.rulesPage, ruleId);
        await page.testSubj.locator('investigationGuideTab').click();
        await expect(page.testSubj.locator('alertInvestigationGuideEmptyPrompt')).toBeVisible();
      }).toPass({ timeout: 60_000, intervals: [2_000] });
    });

    test('should show a Related Alerts table when Related Alerts tab is clicked', async ({
      page,
      pageObjects,
    }) => {
      await expect(async () => {
        await pageObjects.alertPage.gotoAlertByRuleId(pageObjects.rulesPage, ruleId);
        await page.testSubj.locator('relatedAlertsTab').click();
        await expect(page.testSubj.locator('relatedAlertsTable')).toBeVisible();
      }).toPass({ timeout: 60_000, intervals: [2_000] });
    });

    test('should show a Related Dashboard component when Related Dashboards tab is clicked', async ({
      page,
      pageObjects,
    }) => {
      await expect(async () => {
        await pageObjects.alertPage.gotoAlertByRuleId(pageObjects.rulesPage, ruleId);
        await page.testSubj.locator('relatedDashboardsTab').click();
        await expect(page.testSubj.locator('alertRelatedDashboards')).toBeVisible();
      }).toPass({ timeout: 60_000, intervals: [2_000] });
    });

    test('should fall back to the generic overview for an Observability alerts user without rule read', async ({
      page,
      browserAuth,
      pageObjects,
    }) => {
      // Resolve the alert id while authenticated as admin (reaching the alert via
      // the rules page requires rule read, which the alerts-only user lacks).
      let alertId = '';
      await expect(async () => {
        alertId = await pageObjects.alertPage.gotoAlertByRuleId(pageObjects.rulesPage, ruleId);
        expect(alertId).not.toBe('');
      }).toPass({ timeout: 60_000, intervals: [2_000] });

      // Re-authenticate as a user that can read alerts but cannot read the rule
      // (the Observability Alerts privilege grants alert read only, no rule read).
      await browserAuth.loginWithCustomRole(ALERTS_ONLY_ROLE);

      await expect(async () => {
        await pageObjects.alertPage.goto(alertId);
        // The generic overview renders (rule-specific app section is gated on rule read).
        await expect(page.testSubj.locator('overviewTabPanel')).toBeVisible();
      }).toPass({ timeout: 60_000, intervals: [2_000] });

      // The custom threshold app section must NOT render without rule read.
      await expect(page.testSubj.locator('thresholdAlertOverviewSection')).toBeHidden();

      // Tabs that depend on rule data are hidden without rule read.
      await expect(page.testSubj.locator('investigationGuideTab')).toBeHidden();
      await expect(page.testSubj.locator('relatedDashboardsTab')).toBeHidden();

      // No error state is shown (the rule fetch and its 403 are skipped entirely).
      await expect(page.testSubj.locator('alertDetailsError')).toBeHidden();

      // The non-rule-dependent tabs are still available.
      await expect(page.testSubj.locator('overviewTab')).toBeVisible();
      await expect(page.testSubj.locator('metadataTab')).toBeVisible();
      await expect(page.testSubj.locator('relatedAlertsTab')).toBeVisible();
    });
  }
);
