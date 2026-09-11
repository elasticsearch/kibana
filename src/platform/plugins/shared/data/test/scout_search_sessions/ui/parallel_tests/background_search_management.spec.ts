/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * End-to-end journey tests for the Background Search management UI.
 *
 * Each parallel worker operates in its own Kibana space. Background searches have
 * namespaceType:'single' so they are fully space-scoped — workers never see each
 * other's sessions.
 */

import { v4 as uuidv4 } from 'uuid';
import { expect } from '@kbn/scout/ui';
import {
  spaceTest,
  getSessionCookieHeader,
  findLoadedDashboardId,
  DASHBOARD_ASYNC_SEARCH_KBN_ARCHIVE,
} from '../fixtures';

const DASHBOARD_TITLE = 'Delayed 5s';

spaceTest.describe('Background Search management UI', { tag: '@local-stateful-classic' }, () => {
  let dashboardId: string;

  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.cleanStandardList();

    const loadedObjects = await scoutSpace.savedObjects.load(DASHBOARD_ASYNC_SEARCH_KBN_ARCHIVE);
    dashboardId = findLoadedDashboardId(loadedObjects, DASHBOARD_TITLE);
  });

  spaceTest.beforeEach(async ({ browserAuth }) => {
    await browserAuth.loginAsPrivilegedUser();
  });

  spaceTest.afterEach(async ({ apiServices, page, scoutSpace }) => {
    await apiServices.backgroundSearch.cleanup.deleteAll({
      cookieHeader: await getSessionCookieHeader(page),
      spaceId: scoutSpace.id,
    });
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.cleanStandardList();
  });

  /**
   * Full lifecycle journey:
   *  1. Open the "Delayed 5s" dashboard (space-scoped copy).
   *  2. Submit the query and save it as a background search.
   *  3. Navigate to the management page and wait for the search to complete.
   *  4. Rename the background search and verify its details.
   *  5. Click "View" to return to the dashboard.
   *  6. Verify the dashboard panel is rendered.
   */
  spaceTest(
    'saves a background search from a dashboard, verifies it in management',
    async ({ page, pageObjects }) => {
      await spaceTest.step('open the Delayed 5s dashboard', async () => {
        await pageObjects.dashboard.openDashboardWithId(dashboardId);
      });

      await spaceTest.step('submit query and save as a background search', async () => {
        await pageObjects.backgroundSearch.sendToBackground();
        await pageObjects.dashboard.waitForRenderComplete();
      });

      await spaceTest.step(
        'navigate to management and wait for the background search to complete',
        async () => {
          await pageObjects.backgroundSearchManagement.goTo();
          await pageObjects.backgroundSearchManagement.waitForRowStatus('complete');
        }
      );

      await spaceTest.step('rename the background search and verify details', async () => {
        const searchName = `Background search - ${uuidv4()}`;
        await pageObjects.backgroundSearchManagement.renameRow(searchName);
        await page.testSubj.click('sessionManagementRefreshBtn');
        await pageObjects.backgroundSearchManagement.expectRowCount(1);
        await expect(page.testSubj.locator('sessionManagementNameCol')).toHaveText(searchName);
        const expires = await pageObjects.backgroundSearchManagement.getRowExpires();
        // The expiration date is time-dependent, so only verify that a value is present.
        expect(expires.trim()).toMatch(/^\d/);
      });

      await spaceTest.step('navigate back to the dashboard via the management link', async () => {
        await pageObjects.backgroundSearchManagement.viewRow();
        await pageObjects.dashboard.waitForRenderComplete();
        const viz = page.testSubj.locator(
          'embeddablePanelHeading-SumofBytesbyExtension(Delayed5s)'
        );
        await expect(viz).toBeVisible();
      });
    }
  );
});
