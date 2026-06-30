/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { test, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { ES_ARCHIVE, KBN_ARCHIVE } from '../constants';

test.describe('Kibana navigation', { tag: tags.stateful.classic }, () => {
  test.beforeAll(async ({ esArchiver, kbnClient }) => {
    await esArchiver.loadIfNeeded(ES_ARCHIVE);
    await kbnClient.importExport.load(KBN_ARCHIVE);
    await kbnClient.uiSettings.update({ defaultIndex: 'logstash-*' });
  });

  test.afterAll(async ({ kbnClient }) => {
    await kbnClient.importExport.unload(KBN_ARCHIVE);
    await kbnClient.uiSettings.unset('defaultIndex');
  });

  test('clicking on kibana logo should take you to home page', async ({ browserAuth, page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('home:welcome:show', 'false');
    });
    await browserAuth.loginAsViewer();
    await page.gotoApp('management');
    await page.testSubj.locator('logo').click();
    await expect(page).toHaveURL(/\/app\/home/);
  });

  test('browser back navigation preserves URL state', async ({
    browserAuth,
    page,
    pageObjects,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('home:welcome:show', 'false');
    });
    await browserAuth.loginAsViewer();

    // Regression test for #31238 — back navigation getting stuck on URL encoding
    await pageObjects.home.goto();
    const homeUrl = page.url();

    await pageObjects.discover.goto({ queryMode: 'classic' });
    const discoverUrl = page.url();

    // Mutate Discover URL by setting a time range
    await pageObjects.datePicker.setAbsoluteRange({
      from: 'Sep 19, 2015 @ 06:31:44.000',
      to: 'Sep 23, 2015 @ 18:31:44.000',
    });
    const modifiedTimeDiscoverUrl = page.url();

    await pageObjects.dashboard.goto();

    // Back to Discover with modified time range
    await page.goBack();
    await expect(page).toHaveURL(modifiedTimeDiscoverUrl);

    // Back to Discover without time range modification
    await page.goBack();
    expect(page.url().startsWith(discoverUrl)).toBe(true);

    // Back to home
    await page.goBack();
    await expect(page).toHaveURL(homeUrl);
  });
});
