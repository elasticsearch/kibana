/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * A background search saved from a dashboard that was never saved must restore the draft, from
 * every surface that offers to restore it: the in-app flyout and the completion toast while the
 * draft is still live, and the management app after the draft has been discarded.
 */

import { expect } from '@kbn/scout/ui';
import {
  spaceTest,
  getSessionCookieHeader,
  FLIGHTS_SAMPLE_DATA_SET,
} from '@kbn/data-plugin/test/scout_search_sessions/ui/fixtures';

const SAVED_SEARCH_TITLE = 'Unsaved dashboard slow query';
const SLOW_ESQL_QUERY = 'FROM kibana_sample_data_flights | LIMIT 1 | WHERE DELAY(1500ms)';

spaceTest.describe(
  'Background search from an unsaved dashboard',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.cleanStandardList();
      await scoutSpace.uiSettings.set({ enableESQL: true });
    });

    spaceTest.beforeEach(async ({ apiServices, browserAuth, pageObjects, scoutSpace }) => {
      await apiServices.sampleData.install(FLIGHTS_SAMPLE_DATA_SET, scoutSpace.id);

      await apiServices.discover.create(
        {
          title: SAVED_SEARCH_TITLE,
          tabs: [
            {
              id: 'slow-query',
              label: SAVED_SEARCH_TITLE,
              data_source: { type: 'esql', query: SLOW_ESQL_QUERY },
            },
          ],
        },
        scoutSpace.id
      );

      await browserAuth.loginAsPrivilegedUser();

      await pageObjects.dashboard.openNewDashboard();
      await pageObjects.dashboard.addPanelFromLibrary(SAVED_SEARCH_TITLE);
      // Re-submit so a search is genuinely in flight when we send it to the background.
      // The render is not awaited here: each test decides which surface it waits on.
      await pageObjects.backgroundSearch.sendToBackground();
    });

    spaceTest.afterEach(async ({ apiServices, page, pageObjects, scoutSpace }) => {
      await apiServices.backgroundSearch.cleanup.deleteAll({
        cookieHeader: await getSessionCookieHeader(page),
        spaceId: scoutSpace.id,
      });
      await scoutSpace.savedObjects.cleanStandardList();
      // The leftover "New Dashboard" draft would be restored by the next openNewDashboard(). It
      // has to be discarded from the listing: while the dashboard is mounted its unsaved-changes
      // manager keeps rewriting the session storage key, so clearing it in place is undone.
      await pageObjects.dashboard.discardUnsavedDashboard();
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset('enableESQL');
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest(
      'restores the unsaved dashboard from the background search flyout',
      async ({ page, pageObjects }) => {
        // The flyout shows whatever the status was when it mounted, so the search has to be
        // finished before it is opened. Waiting on the completion toast is the readiness signal;
        // the toast itself is not what restores here.
        await pageObjects.backgroundSearch.waitForCompletion();

        await pageObjects.backgroundSearch.openFlyout();
        await pageObjects.backgroundSearch.restoreFromFlyout();

        await pageObjects.dashboard.waitForRenderComplete();
        await expect(page.testSubj.locator('embeddableError')).toHaveCount(0);
        await expect(pageObjects.backgroundSearch.errorOrWarningToasts).toHaveCount(0);
      }
    );

    spaceTest(
      'restores the unsaved dashboard from the background search completion toast',
      async ({ page, pageObjects }) => {
        // The dashboard is still mounted, so the completion toast fires in place and restores the
        // draft without going through any listing.
        await pageObjects.backgroundSearch.openCompletedSearchFromToast();

        await pageObjects.dashboard.waitForRenderComplete();
        await expect(page.testSubj.locator('embeddableError')).toHaveCount(0);
        await expect(pageObjects.backgroundSearch.errorOrWarningToasts).toHaveCount(0);
      }
    );

    spaceTest(
      'restores the unsaved dashboard after its draft has been discarded',
      async ({ page, pageObjects }) => {
        await pageObjects.dashboard.waitForRenderComplete();
        await pageObjects.dashboard.discardUnsavedDashboard();

        // Discarding the draft navigates away and takes the in-app surfaces with it, so this one
        // restores from the management app. It is also the only listing that can be polled for
        // completion: the flyout renders the same table with `hideRefreshButton`, and auto-refresh
        // is off by default (`data.search.sessions.management.refreshInterval` is `0s`).
        await pageObjects.backgroundSearchManagement.goTo();
        await pageObjects.backgroundSearchManagement.waitForRowStatus('complete');
        await pageObjects.backgroundSearchManagement.viewRow();

        await pageObjects.dashboard.waitForRenderComplete();
        await expect(page.testSubj.locator('embeddableError')).toHaveCount(0);
        await expect(pageObjects.backgroundSearch.errorOrWarningToasts).toHaveCount(0);
      }
    );
  }
);
