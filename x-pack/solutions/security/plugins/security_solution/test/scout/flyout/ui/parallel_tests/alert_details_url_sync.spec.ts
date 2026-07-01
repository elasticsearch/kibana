/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags, CUSTOM_QUERY_RULE } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

const RIGHT = 'right';

// Failing: See https://github.com/elastic/kibana/issues/256433
spaceTest.describe.skip(
  'Expandable flyout state sync',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    let ruleName: string;
    spaceTest.beforeEach(async ({ browserAuth, apiServices, scoutSpace }) => {
      ruleName = `${CUSTOM_QUERY_RULE.name}_${scoutSpace.id}_${Date.now()}`;
      await apiServices.detectionRule.createCustomQueryRule({
        ...CUSTOM_QUERY_RULE,
        name: ruleName,
      });
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

      await pageObjects.alertsTablePage.waitForDetectionsAlertsWrapper();
      await pageObjects.alertsTablePage.alertsTable.scrollIntoViewIfNeeded();
      await pageObjects.alertsTablePage.expandAlertDetailsFlyout(ruleName);

      const urlAfterAlertDetails = page.url();
      expect(urlAfterAlertDetails).toContain(RIGHT);

      const headerTitle = pageObjects.alertDetailsRightPanelPage.detailsFlyoutHeaderTitle;
      await expect(headerTitle).toHaveText(ruleName);

      await page.reload();
      await pageObjects.alertsTablePage.waitForDetectionsAlertsWrapper();

      const urlAfterReload = page.url();
      expect(urlAfterReload).toContain(RIGHT);

      await pageObjects.alertDetailsRightPanelPage.closeFlyout();

      const urlAfterClosingFlyout = page.url();
      expect(urlAfterClosingFlyout).not.toContain(RIGHT);
    });
  }
);
