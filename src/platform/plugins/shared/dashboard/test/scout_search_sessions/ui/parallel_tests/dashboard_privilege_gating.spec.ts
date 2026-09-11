/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Background searches on a dashboard inside a non-default Kibana space, and the
 * `store_search_session` privilege that gates them.
 *
 */

import { expect } from '@kbn/scout/ui';
import type { KibanaRole } from '@kbn/scout';
import {
  spaceTest,
  getSessionCookieHeader,
  findLoadedDashboardId,
  LOGSTASH_MONTH_TIME_RANGE,
  SESSION_IN_ANOTHER_SPACE_KBN_ARCHIVE,
} from '@kbn/data-plugin/test/scout_search_sessions/ui/fixtures';

const DELAYED_DASHBOARD_TITLE = 'A Dashboard in another space + Delay 5s';
const PLAIN_DASHBOARD_TITLE = 'A Dashboard in another space';

/** Role with dashboard:minimal_read + store_search_session in one space, scoped to `logstash-*`. */
const dashboardWithBackgroundSearchRole = (spaceId: string): KibanaRole => ({
  elasticsearch: {
    cluster: [],
    indices: [{ names: ['logstash-*'], privileges: ['all'] }],
  },
  kibana: [
    {
      base: [],
      feature: { dashboard: ['minimal_read', 'store_search_session'] },
      spaces: [spaceId],
    },
  ],
});

/** Role with dashboard:minimal_read only — no background search management privilege. */
const dashboardReadOnlyRole = (spaceId: string): KibanaRole => ({
  elasticsearch: {
    cluster: [],
    indices: [{ names: ['logstash-*'], privileges: ['all'] }],
  },
  kibana: [
    {
      base: [],
      feature: { dashboard: ['minimal_read'] },
      spaces: [spaceId],
    },
  ],
});

spaceTest.describe(
  'Dashboard background search privilege gating',
  { tag: '@local-stateful-classic' },
  () => {
    let delayedDashboardId: string;
    let plainDashboardId: string;

    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.cleanStandardList();
      const loadedObjects = await scoutSpace.savedObjects.load(
        SESSION_IN_ANOTHER_SPACE_KBN_ARCHIVE
      );
      delayedDashboardId = findLoadedDashboardId(loadedObjects, DELAYED_DASHBOARD_TITLE);
      plainDashboardId = findLoadedDashboardId(loadedObjects, PLAIN_DASHBOARD_TITLE);
      await scoutSpace.uiSettings.setDefaultTime(LOGSTASH_MONTH_TIME_RANGE);
    });

    spaceTest.afterEach(async ({ apiServices, page, scoutSpace }) => {
      await apiServices.backgroundSearch.cleanup.deleteAll({
        cookieHeader: await getSessionCookieHeader(page),
        spaceId: scoutSpace.id,
      });
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset('timepicker:timeDefaults');
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest(
      'saves and restores a background search with store_search_session',
      async ({ browserAuth, page, pageObjects, scoutSpace }) => {
        await browserAuth.loginWithCustomRole(dashboardWithBackgroundSearchRole(scoutSpace.id));

        await pageObjects.dashboard.openDashboardWithId(delayedDashboardId);
        await pageObjects.dashboard.waitForRenderComplete();

        await pageObjects.backgroundSearch.sendToBackground();
        await pageObjects.backgroundSearch.openCompletedSearchFromToast();

        await pageObjects.dashboard.waitForRenderComplete();
        await expect(page.testSubj.locator('embeddableError')).toHaveCount(0);
        await expect(pageObjects.backgroundSearch.errorOrWarningToasts).toHaveCount(0);
      }
    );

    spaceTest(
      'does not offer background search without the store_search_session privilege',
      async ({ browserAuth, pageObjects, scoutSpace }) => {
        await browserAuth.loginWithCustomRole(dashboardReadOnlyRole(scoutSpace.id));

        await pageObjects.dashboard.openDashboardWithId(plainDashboardId);
        // Wait for the dashboard to finish rendering before asserting on an absence, so a
        // hidden entrypoint means "not offered" rather than "not yet drawn".
        await pageObjects.dashboard.waitForRenderComplete();
        await expect(pageObjects.backgroundSearch.flyoutEntrypoint).toBeHidden();
      }
    );
  }
);
