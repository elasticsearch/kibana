/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/ui';
import { tags } from '@kbn/scout-oblt';
import { test } from '../fixtures';

test.describe('TlsFlyoutInAlertingApp', { tag: tags.stateful.classic }, () => {
  test('opens TLS alert flyout and verifies setting values', async ({ browserAuth, page }) => {
    await browserAuth.loginAsPrivilegedUser();
    await page.gotoApp('management/insightsAndAlerting/triggersActions/rules');
    await page.testSubj.locator('createRuleButton').waitFor({ timeout: 20_000 });

    await test.step('open TLS certificate rule flyout', async () => {
      await page.testSubj.locator('createRuleButton').click();
      await page.testSubj.click('xpack.uptime.alerts.tlsCertificate-SelectOption');
      await page.testSubj.waitForSelector('xpack.synthetics.alerts.monitorStatus.filterBar', {
        state: 'visible',
      });
    });

    await test.step('verify TLS threshold values', async () => {
      await expect(page.getByText('has a certificate expiring within')).toBeVisible();
      await expect(page.testSubj.locator('tlsExpirationThreshold')).toHaveText(
        'has a certificate expiring within days:  30'
      );
      await expect(page.testSubj.locator('tlsAgeExpirationThreshold')).toHaveText(
        'or older than days:  730'
      );
    });
  });
});
