/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

spaceTest.describe(
  'Entity analytics management page - Engine Status tab',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    spaceTest.beforeEach(async ({ browserAuth, apiServices }) => {
      await apiServices.entityAnalytics.deleteEntityStoreEngines();
      await browserAuth.loginAsAdmin();
    });

    spaceTest.afterEach(async ({ apiServices }) => {
      await apiServices.entityAnalytics.deleteEntityStoreEngines();
    });

    spaceTest(
      'Engine Status tab is hidden when entity store is not installed',
      async ({ pageObjects }) => {
        const managementPage = pageObjects.entityAnalyticsManagementPage;

        await managementPage.navigate();
        await managementPage.waitForStatusLoaded();
        await expect(managementPage.riskScoreTab).toBeVisible();
        await expect(managementPage.assetCriticalityTab).toBeVisible();
        await expect(managementPage.engineStatusTab).toBeHidden();
      }
    );

    spaceTest(
      'Engine Status tab appears after enabling entity analytics and shows components table',
      async ({ pageObjects, apiServices }) => {
        spaceTest.setTimeout(180000);
        const managementPage = pageObjects.entityAnalyticsManagementPage;

        await spaceTest.step('Enable entity analytics via toggle', async () => {
          await managementPage.navigate();
          await managementPage.waitForStatusLoaded();
          await managementPage.toggleEntityAnalytics();
          await managementPage.waitForStatusLoaded();
          await apiServices.entityAnalytics.waitForEntityStoreStatusV2('running', 60000);
          await expect(managementPage.entityAnalyticsHealth).toContainText('On', {
            timeout: 60000,
          });
        });

        await spaceTest.step(
          'Verify Engine Status tab is now visible and navigate to it',
          async () => {
            await expect(managementPage.engineStatusTab).toBeVisible({ timeout: 30000 });
            await managementPage.navigateToEngineStatusTab();
            await expect(managementPage.engineStatusTab).toHaveAttribute('aria-selected', 'true');
          }
        );

        await spaceTest.step('Verify components status table renders', async () => {
          await expect(managementPage.engineComponentsStatusTable).toBeVisible({ timeout: 30000 });
        });
      }
    );
  }
);
