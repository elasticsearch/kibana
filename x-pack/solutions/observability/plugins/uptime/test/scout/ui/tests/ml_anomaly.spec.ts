/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/ui';
import { tags } from '@kbn/scout-oblt';
import { test, testData } from '../fixtures';

test.describe('Uptime ML anomaly', { tag: tags.stateful.classic }, () => {
  const dateStart = '2019-09-10T12:40:08.078Z';
  const dateEnd = '2019-09-11T19:40:08.078Z';
  const monitorId = '0000-intermittent';
  const jobId = `${monitorId.replace(/-/g, '_')}_high_latency_by_geo`;
  const datafeedId = `datafeed-${jobId}`;

  test.beforeAll(async ({ esArchiver, kbnClient }) => {
    await esArchiver.loadIfNeeded(testData.ES_ARCHIVES.FULL_HEARTBEAT);
    try {
      await kbnClient.request({
        method: 'POST',
        path: '/internal/ml/jobs/delete_jobs',
        body: { jobIds: [jobId] },
        headers: { 'elastic-api-version': '1' },
      });
      await new Promise((r) => setTimeout(r, 3_000));
    } catch {
      // job may not exist
    }
  });

  test.afterAll(async ({ kbnClient }) => {
    try {
      await kbnClient.request({
        method: 'POST',
        path: '/internal/ml/jobs/delete_jobs',
        body: { jobIds: [jobId] },
        headers: { 'elastic-api-version': '1' },
      });
    } catch {
      // ignore
    }
  });

  test('create and delete ML anomaly job', async ({ browserAuth, pageObjects, kbnClient }) => {
    await browserAuth.loginAsPrivilegedUser();
    const search = `dateRangeEnd=${dateEnd}&dateRangeStart=${dateStart}`;
    await pageObjects.uptimeApp.navigateToOverview(search);

    await test.step('navigate to monitor page', async () => {
      await pageObjects.uptimeApp.navigateToMonitor(monitorId);
    });

    await test.step('clean up existing ML job if present', async () => {
      if (await pageObjects.uptimeApp.hasMLJob()) {
        await pageObjects.uptimeApp.deleteMLJob();
      }
    });

    await test.step('open ML flyout', async () => {
      await pageObjects.uptimeApp.openMLFlyout();
    });

    await test.step('verify permissions to create job', async () => {
      const isDisabled = await pageObjects.uptimeApp.isCreateMLJobButtonDisabled();
      expect(isDisabled).toBe(false);
      const licenseInfoMissing = await pageObjects.uptimeApp.isMLLicenseInfoMissing();
      expect(licenseInfoMissing).toBe(true);
    });

    await test.step('create ML job', async () => {
      await pageObjects.uptimeApp.createMLJob();
    });

    await test.step('restart datafeed with historical data range', async () => {
      await kbnClient.request({
        method: 'POST',
        path: `/internal/ml/datafeeds/${datafeedId}/_stop`,
        body: {},
        headers: { 'elastic-api-version': '1' },
      });
      await kbnClient.request({
        method: 'POST',
        path: `/internal/ml/datafeeds/${datafeedId}/_start`,
        body: { start: '2019-09-10T00:00:00.000Z' },
        headers: { 'elastic-api-version': '1' },
      });
      await new Promise((r) => setTimeout(r, 5_000));
    });

    await test.step('open ML manage menu', async () => {
      await pageObjects.uptimeApp.openMLManageMenu();
    });

    await test.step('delete ML job', async () => {
      await pageObjects.uptimeApp.deleteMLJob();
    });
  });
});
