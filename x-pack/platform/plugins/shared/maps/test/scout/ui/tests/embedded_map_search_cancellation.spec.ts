/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { test } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

const MAPS_DASHBOARD_ARCHIVE =
  'x-pack/platform/plugins/shared/maps/test/scout/ui/fixtures/kbn_archives/maps_search_cancellation.json';

const GEO_INDEX = 'maps-cancellation-test';

test.describe(
  'Maps embedded in dashboard - request cancellation',
  { tag: '@local-stateful-classic' },
  () => {
    let dashboardId: string;

    test.beforeAll(async ({ kbnClient, esClient }) => {
      const indexExists = await esClient.indices.exists({ index: GEO_INDEX });
      if (!indexExists) {
        await esClient.indices.create({
          index: GEO_INDEX,
          mappings: { properties: { location: { type: 'geo_point' } } },
        });
        await esClient.index({
          index: GEO_INDEX,
          document: { location: { lat: 0, lon: 0 } },
          refresh: true,
        });
      }

      const response = await kbnClient.importExport.load(MAPS_DASHBOARD_ARCHIVE, {
        createNewCopies: true,
      });
      const dashboard = (
        response.successResults as Array<{ type: string; destinationId: string }>
      ).find((r) => r.type === 'dashboard');
      if (!dashboard) {
        throw new Error('Dashboard saved object not found in fixture');
      }
      dashboardId = dashboard.destinationId;
    });

    test.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsViewer();
    });

    test.afterAll(async ({ kbnClient, esClient }) => {
      await kbnClient.savedObjects.cleanStandardList();
      await esClient.indices.delete({ index: GEO_INDEX, ignore_unavailable: true });
    });

    test('cancels search when navigating away from the dashboard', async ({
      page,
      pageObjects,
    }) => {
      // Set up listeners before opening the dashboard to avoid race conditions
      const esqlRequestPromise = page.waitForRequest(
        (req) => req.url().includes('/internal/search/esql') && req.method() === 'POST'
      );

      // Open dashboard WITHOUT waiting for render
      await pageObjects.dashboard.openDashboardWithId(dashboardId, { waitForRender: false });

      // Wait for the map to initiate the ES|QL search (stalled by error_query)
      await esqlRequestPromise;

      const esqlAbortedPromise = page.waitForEvent(
        'requestfailed',
        (req) => req.url().includes('/internal/search/esql') && req.method() === 'POST'
      );

      // Navigate away - this should abort the pending request
      await pageObjects.collapsibleNav.clickItem('Discover');

      // Verify the in-flight request was aborted
      const failedRequest = await esqlAbortedPromise;
      expect(failedRequest.failure()).not.toBeNull();
    });

    test('cancels search when clicking the cancel button', async ({ page, pageObjects }) => {
      // Set up listeners before opening the dashboard to avoid race conditions
      const esqlRequestPromise = page.waitForRequest(
        (req) => req.url().includes('/internal/search/esql') && req.method() === 'POST'
      );

      // Open dashboard WITHOUT waiting for render
      await pageObjects.dashboard.openDashboardWithId(dashboardId, { waitForRender: false });

      // Wait for the map to initiate the ES|QL search (stalled by error_query)
      await esqlRequestPromise;

      const esqlAbortedPromise = page.waitForEvent(
        'requestfailed',
        (req) => req.url().includes('/internal/search/esql') && req.method() === 'POST'
      );

      // Click cancel button - this should abort the pending request
      const cancelButton = page.testSubj.locator('queryCancelButton');
      await cancelButton.waitFor({ state: 'visible' });
      await cancelButton.click();

      // Verify the in-flight request was aborted
      const failedRequest = await esqlAbortedPromise;
      expect(failedRequest.failure()).not.toBeNull();

      // Verify cancel button disappears (no more in-flight requests)
      await cancelButton.waitFor({ state: 'hidden' });
    });
  }
);
