/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest, testData } from '../fixtures';

spaceTest.describe('Discover app - errors', { tag: tags.stateful.all }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.cleanStandardList();
    await scoutSpace.savedObjects.load(testData.KBN_ARCHIVES.INVALID_SCRIPTED_FIELD);
    await scoutSpace.uiSettings.setDefaultTime({
      from: testData.LOGSTASH_DEFAULT_START_TIME,
      to: testData.LOGSTASH_DEFAULT_END_TIME,
    });
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.discover.goto({ queryMode: 'classic' });
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('should render invalid scripted field error', async ({ page }) => {
    await page.testSubj.locator('discoverErrorCalloutTitle').waitFor({ state: 'visible' });
    await expect(
      page.testSubj.locator('painlessStackTrace'),
      'Painless error stacktrace should be displayed'
    ).toBeVisible();
  });
});
