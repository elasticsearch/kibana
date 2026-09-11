/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * A Lens panel with a terms aggregation and "other bucket" enabled fires its searches
 * sequentially: the terms query first, then a follow-up filter query once the first results
 * arrive. Saving the dashboard as a background search before the follow-up has fired produces a
 * session that does not yet track it, so restoring that session issues a search the session has
 * never seen. This spec verifies the two halves of how that is handled:
 *
 *   1. The restore reports the session as still running, because the untracked follow-up search
 *      joins the session and puts it back into an incomplete state.
 *   2. Once that settles, the follow-up has been added to the session — the searches count grows —
 *      and restoring again is clean: no warnings, no panel errors.
 *
 * The backend contract — that a search submitted after a session's tracked searches have already
 * completed in Elasticsearch is still recorded — is covered at the API layer in
 * `api/tests/session_searches_integration.spec.ts`.
 *
 * No shard_delay aggregation or SNAPSHOT build is required: the dashboard uses a standard terms
 * aggregation, and page.route() gives us control over ESE response timing directly.
 */

import { expect } from '@kbn/scout/ui';
import {
  spaceTest,
  getSessionCookieHeader,
  findLoadedDashboardId,
  DASHBOARD_ASYNC_SEARCH_KBN_ARCHIVE,
} from '@kbn/data-plugin/test/scout_search_sessions/ui/fixtures';

const LENS_OTHER_BUCKET_DASHBOARD = 'Lens with other bucket';

spaceTest.describe(
  'Lens other-bucket background search',
  { tag: '@local-stateful-classic' },
  () => {
    let dashboardId: string;

    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.cleanStandardList();
      const loadedObjects = await scoutSpace.savedObjects.load(DASHBOARD_ASYNC_SEARCH_KBN_ARCHIVE);
      dashboardId = findLoadedDashboardId(loadedObjects, LENS_OTHER_BUCKET_DASHBOARD);
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
      'adds the Lens other-bucket search to the session when restoring',
      async ({ page, pageObjects }) => {
        // Hold every ESE request until the session has been saved, then let exactly one through:
        // the terms query in flight at save time. Holding it until then means it reaches Kibana
        // with the session already saved, so it is the one search the session tracks. Everything
        // else stays held for the rest of the dashboard's life, so the other-bucket follow-up
        // never reaches Kibana and is left for the restore to issue — letting it through here
        // would have it tracked too, and the restore would then be fully cached.
        let releaseSavedSearch: () => void;
        const savedSearchGate = new Promise<void>((res) => {
          releaseSavedSearch = res;
        });
        let releaseHeldSearches: () => void;
        const heldSearchesGate = new Promise<void>((res) => {
          releaseHeldSearches = res;
        });

        let eseRequestCount = 0;
        // Filled in once the save completes; held in an object so the route handler reads the
        // value at interception time rather than closing over it.
        const savedSearch: { index?: number } = {};
        await page.route('**/internal/search/ese', async (route) => {
          const requestIndex = (eseRequestCount += 1);
          await savedSearchGate;
          if (requestIndex !== savedSearch.index) {
            await heldSearchesGate;
          }
          // Held requests belong to a page that has since been navigated away from, so the
          // frame they were issued from is gone by the time they are let go.
          await route.continue().catch(() => {});
        });

        await spaceTest.step(
          'navigate and save as background search while Lens is loading',
          async () => {
            await pageObjects.dashboard.openDashboardWithId(dashboardId, { waitForRender: false });
            // The dashboard swaps the submit button for a cancel button while searches are in
            // flight. Use alreadyInFlight so sendToBackground waits for the cancel button and
            // saves without re-submitting.
            await pageObjects.backgroundSearch.sendToBackground({ alreadyInFlight: true });
          }
        );

        // The search saved to background is the one that was in flight when the session was
        // saved. Earlier requests that reached Kibana before the session was saved are included;
        savedSearch.index = eseRequestCount;

        // Wait for the response, not just the release: the navigation that follows cancels
        // anything still in flight, so the terms query has to have reached Kibana — and been
        // recorded in the session's idMapping — before we leave the dashboard.
        const savedSearchResponse = page.waitForResponse(
          (r) => r.url().includes('/internal/search/ese') && r.request().method() === 'POST',
          { timeout: 15_000 }
        );
        releaseSavedSearch!();
        await savedSearchResponse;

        await spaceTest.step('the saved session tracks only the terms query', async () => {
          await pageObjects.backgroundSearchManagement.goTo();
          await pageObjects.backgroundSearchManagement.waitForRowStatus('complete');
          expect(await pageObjects.backgroundSearchManagement.getRowSearchesCount()).toBe(1);
        });

        // The dashboard is gone, so the held other-bucket request can be let go — it dies with
        // the frame that issued it. Replace the gate with a delay for the restore: the follow-up
        // cannot be gated there (it is only issued once the query it follows returns), so widen
        // the window in which it is in flight instead, making the incomplete state the restore
        // reports observable rather than a race against a fast local Elasticsearch.
        releaseHeldSearches!();
        await page.unroute('**/internal/search/ese');
        await page.route('**/internal/search/ese', async (route) => {
          await new Promise((res) => setTimeout(res, 2_000));
          await route.continue();
        });

        await spaceTest.step(
          'restore the session and observe it pick up the other-bucket search',
          async () => {
            await pageObjects.backgroundSearchManagement.viewRow();
            // The follow-up search is not in the session's idMapping, so it runs live and puts
            // the restored session back into an incomplete state, which the UI surfaces.
            await expect(pageObjects.backgroundSearch.errorOrWarningToasts).toHaveCount(1);
            await page.components.toast().closeAll();
            await pageObjects.dashboard.waitForRenderComplete();
          }
        );

        await spaceTest.step('verify the other-bucket search joined the session', async () => {
          await pageObjects.backgroundSearchManagement.goTo();
          await pageObjects.backgroundSearchManagement.waitForRowStatus('complete');
          await expect
            .poll(() => pageObjects.backgroundSearchManagement.getRowSearchesCount(), {
              timeout: 20_000,
              intervals: [2_000],
            })
            .toBeGreaterThan(1);
        });

        await spaceTest.step('restoring the now-complete session is clean', async () => {
          await pageObjects.backgroundSearchManagement.viewRow();
          await pageObjects.dashboard.waitForRenderComplete();
          await expect(pageObjects.backgroundSearch.errorOrWarningToasts).toHaveCount(0);
          await expect(page.testSubj.locator('embeddableError')).toHaveCount(0);
        });
      }
    );
  }
);
