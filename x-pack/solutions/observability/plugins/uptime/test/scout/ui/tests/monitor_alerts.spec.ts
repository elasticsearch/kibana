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
const alertId = 'uptime-anomaly-alert';
const alertThreshold = 'major';

const mlJobId = '0000_intermittent_high_latency_by_geo';

test.describe('MonitorAlerts', { tag: tags.stateful.classic }, () => {
  test.afterAll(async ({ apiServices }) => {
    await apiServices.ml.anomalyDetection.delete({
      jobIds: [mlJobId],
      deleteUserAnnotations: true,
      deleteAlertingRules: true,
    });
  });

  test('creates and manages anomaly detection alert', async ({
    browserAuth,
    pageObjects,
    page,
  }) => {
    await test.step('go to monitor details', async () => {
      await browserAuth.loginAsAdmin();
      await pageObjects.monitorDetails.navigateToOverviewPage({ dateRangeEnd, dateRangeStart });
      await pageObjects.monitorDetails.navigateToMonitorDetails(monitorId);
      await pageObjects.monitorDetails.waitForLoadingToFinish();
    });

    await test.step('open anomaly detection flyout and verify no license error', async () => {
      await pageObjects.monitorDetails.enableAnomalyDetection();
      await expect(page.testSubj.locator('uptimeMLCreateJobBtn')).toBeEnabled();
      await expect(page.testSubj.locator('uptimeMLLicenseInfo')).toBeHidden();
    });

    await test.step('create ML job', async () => {
      await pageObjects.monitorDetails.createMLJob();
      await expect(page.testSubj.locator('ruleDefinitionHeaderRuleTypeName')).toHaveText(
        'Uptime Duration Anomaly'
      );
    });

    await test.step('update anomaly detection alert and create rule', async () => {
      await pageObjects.monitorDetails.updateAlert({ id: alertId, threshold: alertThreshold });
      await pageObjects.monitorDetails.saveRule();
      await expect(page.getByText(`Created rule "${alertId}"`)).toBeVisible({ timeout: 20_000 });
    });

    await test.step('go to ML management page and find job', async () => {
      await page.gotoApp('management/ml/anomaly_detection');
      const jobIdCell = page.testSubj
        .locator('mlJobListColumnId')
        .locator('.euiTableCellContent')
        .filter({ hasText: mlJobId });
      await expect(jobIdCell).toHaveCount(1);
    });
  });
});
