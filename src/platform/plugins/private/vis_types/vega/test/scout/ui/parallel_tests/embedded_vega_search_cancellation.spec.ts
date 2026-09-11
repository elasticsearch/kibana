/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { spaceTest } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

const VEGA_DASHBOARD_ARCHIVE =
  'src/platform/plugins/private/vis_types/vega/test/scout/ui/fixtures/kbn_archives/vega_search_cancellation.json';

spaceTest.describe(
  'Vega visualization embedded in dashboard - request cancellation',
  { tag: '@local-stateful-classic' },
  () => {
    let dashboardId: string;

    spaceTest.beforeAll(async ({ scoutSpace }) => {
      const loaded = await scoutSpace.savedObjects.load(VEGA_DASHBOARD_ARCHIVE);
      const dashboard = loaded.find((obj) => obj.type === 'dashboard');
      if (!dashboard) {
        throw new Error('Dashboard saved object not found in fixture');
      }
      dashboardId = dashboard.id;
    });

    spaceTest.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsViewer();
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest(
      'cancels async search when navigating away from the dashboard',
      async ({ page, pageObjects, network }) => {
        // Set up listener before opening the dashboard to avoid race conditions
        const vegaResponsePromise = page.waitForResponse(
          (req) => req.url().endsWith('/internal/search/esql_async') && req.ok()
        );
        // Open dashboard WITHOUT waiting for render
        await pageObjects.dashboard.openDashboardWithId(dashboardId, { waitForRender: false });
        await vegaResponsePromise;

        // Navigate away and verify cancellation DELETE request is sent
        expect(
          await network.countMatchingRequests(
            { endpoint: '/internal/search/esql_async', method: 'DELETE' },
            async () => {
              await pageObjects.collapsibleNav.clickItem('Discover');
            }
          )
        ).toBe(1);
      }
    );

    spaceTest(
      'cancels async search when clicking the cancel button',
      async ({ page, pageObjects, network }) => {
        // Set up listener before opening the dashboard to avoid race conditions
        const vegaResponsePromise = page.waitForResponse(
          (req) => req.url().endsWith('/internal/search/esql_async') && req.ok()
        );
        // Open dashboard WITHOUT waiting for render
        await pageObjects.dashboard.openDashboardWithId(dashboardId, { waitForRender: false });
        await vegaResponsePromise;

        const cancelButton = page.testSubj.locator('queryCancelButton');
        await cancelButton.waitFor({ state: 'visible' });

        // Click cancel button and verify cancellation DELETE request is sent
        expect(
          await network.countMatchingRequests(
            { endpoint: '/internal/search/esql_async', method: 'DELETE' },
            async () => {
              await cancelButton.click();
            }
          )
        ).toBe(1);

        // Verify cancel button disappears (no more in-flight requests)
        await cancelButton.waitFor({ state: 'hidden' });
      }
    );
  }
);
