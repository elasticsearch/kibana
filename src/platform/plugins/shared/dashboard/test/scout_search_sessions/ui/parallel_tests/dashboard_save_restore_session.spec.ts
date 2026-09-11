/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * How a dashboard treats the search session id in its URL: an unknown id errors the panels out,
 * re-submitting starts a fresh one, the back button restores the old one, and leaving for the
 * listing page drops the session entirely.
 *
 * Local-only: the dashboard archive relies on the `shard_delay` aggregation, which only ships
 * with test builds.
 */

import { expect } from '@kbn/scout/ui';
import {
  spaceTest,
  getSessionCookieHeader,
  findLoadedDashboardId,
  DASHBOARD_ASYNC_SEARCH_KBN_ARCHIVE,
} from '@kbn/data-plugin/test/scout_search_sessions/ui/fixtures';

const UNDELAYED_DASHBOARD_TITLE = 'Not Delayed';
const DELAYED_DASHBOARD_TITLE = 'Delayed 5s';
const TSVB_TIMELION_DASHBOARD_TITLE = 'TSVBwithTimelion + Delay 5s';
const UNDELAYED_PANEL_TITLE = 'Sum of Bytes by Extension';

const FAKE_SEARCH_SESSION_ID = '__fake__';
// TSVB, Timelion and the delayed visualization each issue their own search.
const TSVB_TIMELION_SEARCH_COUNT = 3;

spaceTest.describe(
  'Dashboard background search restore',
  { tag: '@local-stateful-classic' },
  () => {
    let undelayedDashboardId: string;
    let delayedDashboardId: string;
    let tsvbTimelionDashboardId: string;

    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.cleanStandardList();
      const loadedObjects = await scoutSpace.savedObjects.load(DASHBOARD_ASYNC_SEARCH_KBN_ARCHIVE);
      undelayedDashboardId = findLoadedDashboardId(loadedObjects, UNDELAYED_DASHBOARD_TITLE);
      delayedDashboardId = findLoadedDashboardId(loadedObjects, DELAYED_DASHBOARD_TITLE);
      tsvbTimelionDashboardId = findLoadedDashboardId(loadedObjects, TSVB_TIMELION_DASHBOARD_TITLE);
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
      'errors out on an unknown session id, starts a fresh one on re-submit and restores it with the back button',
      async ({ page, pageObjects }) => {
        const panelError = page.testSubj.locator('embeddableError');

        await spaceTest.step('an unknown session id in the URL errors the panel out', async () => {
          // Navigated with the id already in the hash rather than appended to the current URL,
          // which has no query string to append to.
          await page.gotoApp('dashboards', {
            hash: `/view/${undelayedDashboardId}?searchSessionId=${FAKE_SEARCH_SESSION_ID}`,
          });

          await expect(panelError).toBeVisible();
          await pageObjects.dashboard.openInspector(UNDELAYED_PANEL_TITLE);
          expect(await pageObjects.inspector.getSearchSessionId()).toBe(FAKE_SEARCH_SESSION_ID);
        });

        await spaceTest.step('re-submitting starts a fresh session and renders', async () => {
          await page.testSubj.click('querySubmitButton');
          await pageObjects.dashboard.waitForRenderComplete();
          await expect(panelError).toHaveCount(0);

          // The dashboard rewrites the hash asynchronously; waiting on the predicate avoids
          // reading the URL before the restored id has been dropped.
          await page.waitForURL((url) => !url.href.includes('searchSessionId'));
          await pageObjects.dashboard.openInspector(UNDELAYED_PANEL_TITLE);
          expect(await pageObjects.inspector.getSearchSessionId()).not.toBe(FAKE_SEARCH_SESSION_ID);
        });

        await spaceTest.step('going back restores the session from the URL', async () => {
          await page.goBack();
          await page.waitForURL(/searchSessionId/);

          await pageObjects.dashboard.openInspector(UNDELAYED_PANEL_TITLE);
          expect(await pageObjects.inspector.getSearchSessionId()).toBe(FAKE_SEARCH_SESSION_ID);
        });
      }
    );

    spaceTest(
      'navigating to the dashboard listing drops the session',
      async ({ page, pageObjects }) => {
        await pageObjects.dashboard.openDashboardWithId(delayedDashboardId);
        await pageObjects.backgroundSearch.sendToBackground();

        await page.gotoApp('dashboards');
        await expect(pageObjects.backgroundSearch.flyoutEntrypoint).toBeHidden();
      }
    );

    spaceTest(
      'restores a TSVB and Timelion dashboard with every search it grouped',
      async ({ page, pageObjects }) => {
        await pageObjects.dashboard.openDashboardWithId(tsvbTimelionDashboardId);
        await pageObjects.backgroundSearch.sendToBackground();

        await pageObjects.backgroundSearchManagement.goTo();
        await pageObjects.backgroundSearchManagement.waitForRowStatus('complete');
        expect(await pageObjects.backgroundSearchManagement.getRowSearchesCount()).toBe(
          TSVB_TIMELION_SEARCH_COUNT
        );

        await pageObjects.backgroundSearchManagement.viewRow();
        await pageObjects.dashboard.waitForRenderComplete();
        await expect(page.testSubj.locator('embeddableError')).toHaveCount(0);
        await expect(pageObjects.backgroundSearch.errorOrWarningToasts).toHaveCount(0);
      }
    );
  }
);
