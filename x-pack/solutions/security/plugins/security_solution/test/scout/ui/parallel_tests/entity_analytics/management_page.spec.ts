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
  name: 'Entity Analytics Management Test Rule',
  query: 'user.name:* or host.name:*',
  risk_score: 70,
  rule_id: 'entity-analytics-mgmt-rule',
};

spaceTest.describe(
  'Entity analytics management page',
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

    spaceTest('renders page title', async ({ pageObjects }) => {
      const managementPage = pageObjects.entityAnalyticsManagementPage;

      await managementPage.navigate();
      await expect(managementPage.pageTitle).toContainText('Entity analytics', { timeout: 30000 });
    });

    spaceTest('displays Entity Risk Score and Asset Criticality tabs', async ({ pageObjects }) => {
      const managementPage = pageObjects.entityAnalyticsManagementPage;

      await managementPage.navigate();
      await managementPage.waitForStatusLoaded();
      await expect(managementPage.riskScoreTab).toBeVisible();
      await expect(managementPage.assetCriticalityTab).toBeVisible();
    });

    spaceTest('should init and disable entity analytics', async ({ pageObjects, apiServices }) => {
      spaceTest.setTimeout(240000);
      const managementPage = pageObjects.entityAnalyticsManagementPage;

      await spaceTest.step('Navigate and verify initial off state', async () => {
        await managementPage.navigate();
        await managementPage.waitForStatusLoaded();
        await expect(managementPage.entityAnalyticsHealth).toContainText('Off');
      });

      await spaceTest.step('Toggle on and verify enabled state', async () => {
        await managementPage.toggleEntityAnalytics();
        // Sync on backend readiness first. The UI shows "Off" while the entity
        // store is in `installing` state (status === 'enabling'), so asserting
        // UI text alone races against install completion. Mirrors
        // engine_status_management.spec.ts. See #259664.
        await apiServices.entityAnalytics.waitForEntityStoreStatusV2('running', 180000);
        await managementPage.waitForStatusLoaded();
        await expect(managementPage.entityAnalyticsHealth).toContainText('On', {
          timeout: 30000,
        });
      });

      await spaceTest.step('Toggle off and verify disabled state', async () => {
        await managementPage.toggleEntityAnalytics();
        // Toggle OFF stops the engines (status `stopped`) — it does not delete
        // them. Full deletion to `not_installed` only happens in afterEach via
        // deleteEntityStoreEngines. Wait for the post-stop backend state, then
        // assert the UI flip.
        await apiServices.entityAnalytics.waitForEntityStoreStatusV2('stopped', 60000);
        await managementPage.waitForStatusLoaded();
        await expect(managementPage.entityAnalyticsHealth).toContainText('Off', {
          timeout: 30000,
        });
      });
    });

    spaceTest(
      'should redirect old entity store URL to the management page',
      async ({ pageObjects }) => {
        const managementPage = pageObjects.entityAnalyticsManagementPage;

        await managementPage.navigateToOldEntityStoreUrl();
        await expect(managementPage.managementPage).toBeVisible({ timeout: 30000 });
        await expect(managementPage.pageTitle).toContainText('Entity analytics');
      }
    );

    spaceTest(
      'should redirect old asset criticality URL to Asset Criticality tab',
      async ({ pageObjects }) => {
        const managementPage = pageObjects.entityAnalyticsManagementPage;

        await managementPage.navigateToOldAssetCriticalityUrl();
        await expect(managementPage.managementPage).toBeVisible({ timeout: 30000 });
        await expect(managementPage.assetCriticalityTab).toHaveAttribute('aria-selected', 'true');
      }
    );

    spaceTest('should show error panel when init fails', async ({ pageObjects, page }) => {
      spaceTest.setTimeout(120000);
      const managementPage = pageObjects.entityAnalyticsManagementPage;

      await managementPage.navigate();
      await managementPage.waitForStatusLoaded();

      await expect(managementPage.entityAnalyticsHealth).toContainText('Off');

      await page.route('**/api/security/entity_store/install', (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Internal Server Error' }),
        })
      );

      await managementPage.toggleEntityAnalytics();

      await expect(managementPage.errorPanel).toContainText('There was an error', {
        timeout: 30000,
      });

      await page.unroute('**/api/security/entity_store/install');
    });
  }
);
