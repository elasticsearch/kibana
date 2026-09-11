/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/ui';
import { tags } from '@kbn/scout-oblt';
import { test } from '../fixtures';
import { makeChecksWithStatus } from '../fixtures/helpers/make_checks';

const NO_LOCATION_MONITOR_ID = 'location-testing-id';
const LESS_AVAIL_MONITOR_ID = 'less-availability-monitor';

test.describe('Observer location', { tag: tags.stateful.classic }, () => {
  test.beforeAll(async ({ esClient }) => {
    const mogrifyNoLocation = (d: any) => {
      if (d.observer?.geo?.location) {
        d.observer.geo.location = undefined;
      }
      return d;
    };
    await makeChecksWithStatus(
      esClient,
      NO_LOCATION_MONITOR_ID,
      5,
      2,
      10000,
      {},
      'up',
      mogrifyNoLocation
    );

    await makeChecksWithStatus(esClient, LESS_AVAIL_MONITOR_ID, 5, 2, 10000, {}, 'up');
    await makeChecksWithStatus(esClient, LESS_AVAIL_MONITOR_ID, 5, 2, 10000, {}, 'down');
  });

  test('displays the overall availability for no location monitor', async ({
    pageObjects,
    browserAuth,
  }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.monitorDetails.navigateToOverviewPage();
    await pageObjects.monitorDetails.navigateToMonitorDetails(NO_LOCATION_MONITOR_ID);
    await pageObjects.monitorDetails.waitForLoadingToFinish();
    await expect(pageObjects.monitorDetails.getOverallAvailability()).toHaveText('100.00 %');
  });

  test('displays less monitor availability', async ({ pageObjects, browserAuth }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.monitorDetails.navigateToOverviewPage();
    await pageObjects.monitorDetails.navigateToMonitorDetails(LESS_AVAIL_MONITOR_ID);
    await pageObjects.monitorDetails.waitForLoadingToFinish();
    await expect(pageObjects.monitorDetails.getOverallAvailability()).toHaveText('50.00 %');
  });
});
