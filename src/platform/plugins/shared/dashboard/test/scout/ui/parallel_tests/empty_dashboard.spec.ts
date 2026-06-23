/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { spaceTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { DASHBOARD_DEFAULT_INDEX_TITLE, DASHBOARD_SAVED_SEARCH_ARCHIVE } from '../constants';

spaceTest.describe('Empty dashboard', { tag: tags.deploymentAgnostic }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.cleanStandardList();
    await scoutSpace.savedObjects.load(DASHBOARD_SAVED_SEARCH_ARCHIVE);
    await scoutSpace.uiSettings.setDefaultIndex(DASHBOARD_DEFAULT_INDEX_TITLE);
  });

  spaceTest.beforeEach(async ({ browserAuth }) => {
    await browserAuth.loginAsPrivilegedUser();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('supports empty-state widget and add-panel flows', async ({ pageObjects, page }) => {
    await spaceTest.step('shows the empty widget on a fresh dashboard', async () => {
      await pageObjects.dashboard.openNewDashboard();
      await expect(page.testSubj.locator('emptyDashboardWidget')).toBeVisible();
      await expect.poll(() => pageObjects.dashboard.getPanelCount()).toBe(0);
    });

    await spaceTest.step('opens the add-from-library flyout', async () => {
      await pageObjects.dashboard.openLibraryFlyout();
      // Surface the success condition the FTR original checked via
      // `dashboardAddPanel.isAddPanelOpen()` so the step has a visible assertion.
      await expect(page.testSubj.locator('savedObjectsFinderTable')).toBeVisible();
      await pageObjects.dashboard.closeLibraryFlyout();
      await expect(page.testSubj.locator('savedObjectsFinderTable')).toBeHidden();
    });

    await spaceTest.step('adds a new panel via the editor menu', async () => {
      await pageObjects.dashboard.addMarkdownPanel('empty dashboard scout test');
      await expect.poll(() => pageObjects.dashboard.getPanelCount()).toBe(1);
    });

    await spaceTest.step('reopens the add-panel flyout', async () => {
      await pageObjects.dashboard.openAddPanelFlyout();
      await expect(page.testSubj.locator('dashboardPanelSelectionFlyout')).toBeVisible();
    });
  });
});
