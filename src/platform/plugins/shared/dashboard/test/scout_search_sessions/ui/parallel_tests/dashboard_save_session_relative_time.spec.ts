/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Saving and restoring a background search whose dashboard uses a relative time range.
 */

import { expect } from '@kbn/scout/ui';
import {
  spaceTest,
  getSessionCookieHeader,
  findLoadedDashboardId,
  DASHBOARD_ASYNC_SEARCH_KBN_ARCHIVE,
} from '@kbn/data-plugin/test/scout_search_sessions/ui/fixtures';

const DASHBOARD_TITLE = 'Delayed 5s';
const PANEL_HEADING = 'embeddablePanelHeading-SumofBytesbyExtension(Delayed5s)';

spaceTest.describe(
  'Dashboard background search with a relative time range',
  { tag: '@local-stateful-classic' },
  () => {
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

    spaceTest(
      'saves and restores a background search with a relative time range',
      async ({ page, pageObjects }) => {
        await pageObjects.dashboard.openDashboardWithId(dashboardId);
        await pageObjects.dashboard.waitForRenderComplete();
        await pageObjects.datePicker.setCommonlyUsedTime('This_week');

        await pageObjects.backgroundSearch.sendToBackground();

        await pageObjects.backgroundSearchManagement.goTo();
        await pageObjects.backgroundSearchManagement.waitForRowStatus('complete');

        await pageObjects.backgroundSearchManagement.viewRow();
        await pageObjects.dashboard.waitForRenderComplete();
        await expect(page.testSubj.locator(PANEL_HEADING)).toBeVisible();
        await expect(page.testSubj.locator('embeddableError')).toHaveCount(0);
        await expect(pageObjects.backgroundSearch.errorOrWarningToasts).toHaveCount(0);
      }
    );
  }
);
