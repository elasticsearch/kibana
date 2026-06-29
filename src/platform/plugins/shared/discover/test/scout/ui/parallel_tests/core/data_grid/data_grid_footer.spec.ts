/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Discover data-grid footer document counts and load-more behavior.
 */

import type { ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest } from '@kbn/scout';
import { testData } from '../../../fixtures/common';

const expectFooterText = async (page: ScoutPage, documentCount: string) => {
  await expect(footerLocator(page)).toHaveText(
    new RegExp(`Search results are limited to ${documentCount} documents\\.\\s*Load more`)
  );
};

const footerLocator = (page: ScoutPage) => page.testSubj.locator('unifiedDataTableFooter');

const loadMoreLocator = (page: ScoutPage) =>
  page.testSubj.locator('dscGridSampleSizeFetchMoreLink');

spaceTest.describe('Discover data grid footer', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
    await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
    await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.discover.goto({ queryMode: 'classic' });
    await pageObjects.dataGrid.waitForLoad();
    await pageObjects.dataGrid.waitForDocTableRendered();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest(
    'shows the footer only on the last page and allows loading more',
    async ({ page, pageObjects }) => {
      const footer = footerLocator(page);
      const loadMore = loadMoreLocator(page);

      // Footer is not shown on the first page.
      await expect(footer).toBeHidden();

      // Going to the next (non-last) page still doesn't show the footer.
      await page.testSubj.click('pagination-button-next');
      await expect(footer).toBeHidden();

      // The footer appears on the last page of the current sample (500 docs).
      await page.testSubj.click('pagination-button-4');
      await expect(footer).toBeVisible();
      await expectFooterText(page, '500');
      // No page beyond the last one.
      await expect(page.testSubj.locator('pagination-button-5')).toBeHidden();

      // Loading more grows the sample and hides the footer again.
      await loadMore.click();
      await pageObjects.dataGrid.waitForLoad();
      await expect(footer).toBeHidden();

      await page.testSubj.click('pagination-button-9');
      await expect(footer).toBeVisible();
      await expectFooterText(page, '1,000');

      await loadMore.click();
      await pageObjects.dataGrid.waitForLoad();
      await expect(footer).toBeHidden();

      await page.testSubj.click('pagination-button-14');
      await expect(footer).toBeVisible();
      await expectFooterText(page, '1,500');
    }
  );

  spaceTest(
    'disables "Load more" while the refresh interval is on',
    async ({ page, pageObjects }) => {
      const loadMore = loadMoreLocator(page);

      await page.testSubj.click('pagination-button-4');
      await expect(footerLocator(page)).toBeVisible();
      await expect(loadMore).toBeEnabled();

      await pageObjects.datePicker.startAutoRefresh(10);
      await expect(loadMore).toBeDisabled();

      await pageObjects.datePicker.pauseAutoRefresh();
      await expect(loadMore).toBeEnabled();
    }
  );
});
