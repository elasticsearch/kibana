/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/ui';
import { tags } from '@kbn/scout-oblt';
import { test } from '../fixtures';

const dateRangeStart = '2019-09-10T12:40:08.078Z';
const dateRangeEnd = '2019-09-11T19:40:08.078Z';
const monitorId = '0000-intermittent';

test.describe('MonitorDetails', { tag: tags.stateful.classic }, () => {
  test('navigates to monitor details and displays ping data', async ({
    pageObjects,
    browserAuth,
  }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.monitorDetails.navigateToOverviewPage({ dateRangeEnd, dateRangeStart });
    await pageObjects.monitorDetails.navigateToMonitorDetails(monitorId);
    await pageObjects.monitorDetails.waitForLoadingToFinish();

    await test.step('filter by location and status', async () => {
      await pageObjects.monitorDetails.selectFilterItem('Location', 'mpls');
      await pageObjects.monitorDetails.setStatusFilterUp();
    });

    await test.step('verify ping list items', async () => {
      await expect(pageObjects.monitorDetails.getPingListRows()).toHaveCount(10, {
        timeout: 20_000,
      });
      await expect(pageObjects.monitorDetails.getDurationChart()).toBeVisible({
        timeout: 20_000,
      });
    });
  });
});
