/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';
import { CUSTOM_QUERY_RULE } from '@kbn/scout-security/src/playwright/constants/detection_rules';

const RISK_SCORE_RULE: typeof CUSTOM_QUERY_RULE = {
  ...CUSTOM_QUERY_RULE,
  name: 'Risk Score Tab Test Rule',
  query: 'user.name:* or host.name:*',
  risk_score: 70,
  rule_id: 'risk-score-tab-rule',
};

// Failing: See https://github.com/elastic/kibana/issues/266895
spaceTest.describe.skip(
  'Entity analytics management page - Risk Score tab',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    spaceTest.beforeEach(async ({ browserAuth, apiServices, scoutSpace }) => {
      await apiServices.entityAnalytics.deleteEntityStoreEngines();
      await apiServices.detectionRule.deleteAll();

      await apiServices.detectionRule.createCustomQueryRule({
        ...RISK_SCORE_RULE,
        name: `${RISK_SCORE_RULE.name}_${scoutSpace.id}_${Date.now()}`,
      });

      await browserAuth.loginAsAdmin();
    });

    spaceTest.afterEach(async ({ apiServices }) => {
      await apiServices.entityAnalytics.deleteEntityStoreEngines();
      await apiServices.detectionRule.deleteAll();
    });

    spaceTest('Risk Score tab is selected by default', async ({ pageObjects }) => {
      const managementPage = pageObjects.entityAnalyticsManagementPage;

      await managementPage.navigate();
      await managementPage.waitForStatusLoaded();
      await expect(managementPage.riskScoreTab).toHaveAttribute('aria-selected', 'true');
    });

    spaceTest('should show preview error panel when API fails', async ({ pageObjects, page }) => {
      const managementPage = pageObjects.entityAnalyticsManagementPage;

      await page.route('**/internal/risk_score/preview', (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Internal Server Error' }),
        })
      );

      await managementPage.navigate();
      await managementPage.waitForStatusLoaded();

      await expect(managementPage.riskPreviewError).toContainText('Preview failed', {
        timeout: 30000,
      });

      await page.unroute('**/internal/risk_score/preview');
    });

    spaceTest(
      'should show save bar when toggling retain checkbox',
      async ({ pageObjects, apiServices }) => {
        const managementPage = pageObjects.entityAnalyticsManagementPage;

        await managementPage.navigate();
        await managementPage.waitForStatusLoaded();
        await managementPage.toggleEntityAnalytics();
        await apiServices.entityAnalytics.waitForEntityStoreStatusV2('running', 180000);

        await expect(managementPage.riskScoreSaveButton).toBeHidden();

        await managementPage.riskScoreRetainCheckbox.click();

        await expect(managementPage.riskScoreSaveButton).toBeVisible({ timeout: 5000 });
      }
    );

    spaceTest(
      'should show save bar when toggling closed alerts switch',
      async ({ pageObjects, apiServices }) => {
        const managementPage = pageObjects.entityAnalyticsManagementPage;

        await managementPage.navigate();
        await managementPage.waitForStatusLoaded();
        await managementPage.toggleEntityAnalytics();
        await apiServices.entityAnalytics.waitForEntityStoreStatusV2('running', 180000);

        await expect(managementPage.riskScoreSaveButton).toBeHidden();

        await managementPage.includeClosedAlertsSwitch.click();

        await expect(managementPage.riskScoreSaveButton).toBeVisible({ timeout: 5000 });
      }
    );

    spaceTest(
      'should discard changes when clicking discard button',
      async ({ pageObjects, apiServices }) => {
        const managementPage = pageObjects.entityAnalyticsManagementPage;

        await managementPage.navigate();
        await managementPage.waitForStatusLoaded();
        await managementPage.toggleEntityAnalytics();
        await apiServices.entityAnalytics.waitForEntityStoreStatusV2('running', 180000);

        await expect(managementPage.includeClosedAlertsSwitch).not.toBeChecked();

        await managementPage.includeClosedAlertsSwitch.click();

        await expect(managementPage.riskScoreSaveButton).toBeVisible({ timeout: 5000 });

        await managementPage.riskScoreDiscardButton.click();

        await expect(managementPage.riskScoreSaveButton).toBeHidden({ timeout: 5000 });
        await expect(managementPage.includeClosedAlertsSwitch).not.toBeChecked();
      }
    );

    spaceTest(
      'should save changes and persist after page reload',
      async ({ pageObjects, apiServices }) => {
        const managementPage = pageObjects.entityAnalyticsManagementPage;

        await managementPage.navigate();
        await managementPage.waitForStatusLoaded();
        await managementPage.toggleEntityAnalytics();
        await apiServices.entityAnalytics.waitForEntityStoreStatusV2('running', 180000);

        await expect(managementPage.includeClosedAlertsSwitch).not.toBeChecked();

        await managementPage.includeClosedAlertsSwitch.click();

        await expect(managementPage.riskScoreSaveButton).toBeVisible({ timeout: 5000 });

        await managementPage.riskScoreSaveButton.click();

        await expect(managementPage.riskScoreSaveButton).toBeHidden({ timeout: 10000 });

        await managementPage.navigate();
        await managementPage.waitForStatusLoaded();

        await expect(managementPage.includeClosedAlertsSwitch).toBeChecked();
      }
    );
  }
);
