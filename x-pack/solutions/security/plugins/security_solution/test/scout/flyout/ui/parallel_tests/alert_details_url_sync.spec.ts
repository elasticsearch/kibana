/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags, CUSTOM_QUERY_RULE } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

const RIGHT = 'right';

spaceTest.describe(
  'Expandable flyout state sync',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    let ruleName: string;

    // Detection-engine first-run scheduling can take up to ~120 s under load. The default 60 s
    // per-test budget applies to hooks + test body combined, so it is shorter than the worst-case
    // rule-execution time. Extend to 5 minutes to cover the full waitForAlerts poll in beforeEach.
    spaceTest.setTimeout(5 * 60_000);

    spaceTest.beforeEach(async ({ browserAuth, apiServices, scoutSpace }) => {
      ruleName = `${CUSTOM_QUERY_RULE.name}_${scoutSpace.id}_${Date.now()}`;
      await apiServices.detectionRule.createCustomQueryRule({
        ...CUSTOM_QUERY_RULE,
        name: ruleName,
      });
      // Wait for the detection engine to produce at least one alert before logging in and loading
      // the UI. Without this gate, alerts.tsx renders NoIndexEmptyPage (signalIndexNeedsInit) and
      // the alerts-by-rule-table locator never appears, causing a 20 s timeout on slower CI workers.
      await apiServices.detectionAlerts.waitForAlerts(ruleName, 1, 120_000);
      await browserAuth.loginAsPlatformEngineer();
    });

    spaceTest.afterEach(async ({ apiServices }) => {
      await apiServices.detectionRule.deleteAll();
      await apiServices.detectionAlerts.deleteAll();
    });

    spaceTest('should test flyout url sync', async ({ pageObjects, page }) => {
      await pageObjects.alertsTablePage.navigate();

      const urlBeforeAlertDetails = page.url();
      expect(urlBeforeAlertDetails).not.toContain(RIGHT);

      await pageObjects.alertsTablePage.waitForRuleAlert(ruleName);
      await pageObjects.alertsTablePage.alertsTable.scrollIntoViewIfNeeded();
      await pageObjects.alertsTablePage.expandAlertDetailsFlyout(ruleName);

      const urlAfterAlertDetails = page.url();
      expect(urlAfterAlertDetails).toContain(RIGHT);

      const headerTitle = pageObjects.alertDetailsRightPanelPage.detailsFlyoutHeaderTitle;
      await expect(headerTitle).toHaveText(ruleName);

      await page.reload();
      await pageObjects.alertsTablePage.waitForRuleAlert(ruleName);

      const urlAfterReload = page.url();
      expect(urlAfterReload).toContain(RIGHT);

      await pageObjects.alertDetailsRightPanelPage.closeFlyout();

      const urlAfterClosingFlyout = page.url();
      expect(urlAfterClosingFlyout).not.toContain(RIGHT);
    });
  }
);
