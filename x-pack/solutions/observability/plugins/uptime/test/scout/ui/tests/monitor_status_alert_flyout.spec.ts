/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/ui';
import { tags } from '@kbn/scout-oblt';
import { test } from '../fixtures';

test.describe('MonitorStatusFlyoutInAlertingApp', { tag: tags.stateful.classic }, () => {
  test('opens monitor status alert flyout and verifies the form renders', async ({
    browserAuth,
    page,
  }) => {
    await browserAuth.loginAsPrivilegedUser();
    await page.gotoApp('management/insightsAndAlerting/triggersActions/rules');
    await page.testSubj.locator('createRuleButton').waitFor({ timeout: 20_000 });

    await test.step('open monitor status rule flyout', async () => {
      await page.testSubj.locator('createRuleButton').click();
      await page.testSubj.click('xpack.uptime.alerts.monitorStatus-SelectOption');
      await page.testSubj.waitForSelector('xpack.synthetics.alerts.monitorStatus.filterBar', {
        state: 'visible',
      });
    });

    await test.step('verify monitor status alert expressions render', async () => {
      await expect(
        page.testSubj.locator('xpack.synthetics.alerts.monitorStatus.timerangeValueExpression')
      ).toBeVisible();
      await expect(page.testSubj.locator('uptimeCreateAlertAddFilter')).toBeVisible();
    });
  });
});
