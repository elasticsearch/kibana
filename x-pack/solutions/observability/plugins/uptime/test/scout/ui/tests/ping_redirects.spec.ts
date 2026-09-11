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

const testMonitor = {
  id: '0000-intermittent',
  start: 'now-15m',
  end: 'now',
  redirects: ['http://localhost:3000/first', 'https://www.washingtonpost.com/'],
};

test.describe('MonitorPingRedirects', { tag: tags.stateful.classic }, () => {
  test.beforeAll(async ({ esClient }) => {
    await makeChecksWithStatus(
      esClient,
      testMonitor.id,
      5,
      2,
      10000,
      {
        http: {
          rtt: { total: { us: 157784 } },
          response: {
            status_code: 200,
            redirects: testMonitor.redirects,
            body: {
              bytes: 642102,
              hash: '597a8cfb33ff8e09bff16283306553c3895282aaf5386e1843d466d44979e28a',
            },
          },
        },
      },
      'up'
    );
  });

  test('displays redirect info in detail panel and ping list', async ({
    pageObjects,
    browserAuth,
    page,
  }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.monitorDetails.navigateToOverviewPage({
      dateRangeEnd: testMonitor.end,
      dateRangeStart: testMonitor.start,
    });
    await pageObjects.monitorDetails.navigateToMonitorDetails(testMonitor.id);
    await pageObjects.monitorDetails.waitForLoadingToFinish();

    await expect(pageObjects.monitorDetails.getMonitorRedirects()).toHaveText(
      `${testMonitor.redirects.length}`
    );

    await pageObjects.monitorDetails.expandPingDetails();
    await pageObjects.monitorDetails.waitForLoadingToFinish();
    await page.testSubj.locator('uptimeMonitorPingListRedirectInfo').waitFor();
  });
});
