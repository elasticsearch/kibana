/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Basic Discover data-grid rendering, column selection, and full-screen behavior.
 */

import type { ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest } from '@kbn/scout';
import { testData } from '../../../fixtures/common';

// Mirrors the FTR `dataGrid.getHeaderFields`: only the data-column titles live in
// `.euiDataGridHeaderCell__content`, so this excludes control columns (select,
// actions) and their screen-reader-only labels.
const getColumnTitles = async (page: ScoutPage): Promise<string[]> => {
  const titles = await page.locator('.euiDataGridHeaderCell__content').allInnerTexts();
  return titles.map((title) => title.trim());
};

/**
 * Mirrors the FTR `isVisible` helper: returns whether the element identified by
 * `dataTestSubj` is the top-most element at its own center point. Full-screen
 * mode keeps the elements beneath the grid in the DOM but covers them with a
 * higher z-index overlay, so a plain visibility check is not enough - we need to
 * confirm nothing is painted on top of them.
 */
const isTopMostAtCenter = async (page: ScoutPage, dataTestSubj: string): Promise<boolean> => {
  const box = await page.testSubj.locator(dataTestSubj).boundingBox();

  if (!box) return false;

  return page.evaluate(
    ({ selector, x, y }) => {
      let currentElement = document.elementFromPoint(x, y);

      while (currentElement) {
        if (currentElement.matches(`[data-test-subj="${selector}"]`)) return true;

        currentElement = currentElement.parentElement;
      }

      return false;
    },
    { selector: dataTestSubj, x: box.x + box.width / 2, y: box.y + box.height / 2 }
  );
};

const toggleColumnFromSidebar = async (page: ScoutPage, column: string) => {
  await page.testSubj.fill('fieldListFiltersFieldSearch', column);
  await page.testSubj.click(`fieldToggle-${column}`);
};

spaceTest.describe('Discover data grid', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
    await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
    await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.discover.setQueryMode('classic');
    await pageObjects.discover.goto();
    await pageObjects.dataGrid.waitUntilSearchingHasFinished();
    await pageObjects.dataGrid.waitForDocTableRendered();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('can add fields to the table', async ({ page }) => {
    // The default view shows the `@timestamp` and `Summary` (`_source`) columns.
    // Adding a field replaces the `Summary` column, and removing all added fields
    // restores it.
    await expect.poll(() => getColumnTitles(page)).toStrictEqual(['@timestamp', 'Summary']);

    await toggleColumnFromSidebar(page, 'bytes');
    await expect.poll(() => getColumnTitles(page)).toStrictEqual(['@timestamp', 'bytes']);

    await toggleColumnFromSidebar(page, 'agent');
    await expect.poll(() => getColumnTitles(page)).toStrictEqual(['@timestamp', 'bytes', 'agent']);

    await toggleColumnFromSidebar(page, 'bytes');
    await expect.poll(() => getColumnTitles(page)).toStrictEqual(['@timestamp', 'agent']);

    await toggleColumnFromSidebar(page, 'agent');
    await expect.poll(() => getColumnTitles(page)).toStrictEqual(['@timestamp', 'Summary']);
  });

  spaceTest(
    'should hide elements beneath the table when in full screen mode regardless of their z-index',
    async ({ page }) => {
      await expect.poll(() => isTopMostAtCenter(page, 'discover-dataView-switch-link')).toBe(true);
      await expect
        .poll(() => isTopMostAtCenter(page, 'unifiedHistogramResizableButton'))
        .toBe(true);

      await page.testSubj.click('dataGridFullScreenButton');
      await expect.poll(() => isTopMostAtCenter(page, 'discover-dataView-switch-link')).toBe(false);
      await expect
        .poll(() => isTopMostAtCenter(page, 'unifiedHistogramResizableButton'))
        .toBe(false);

      await page.testSubj.click('dataGridFullScreenButton');
      await expect.poll(() => isTopMostAtCenter(page, 'discover-dataView-switch-link')).toBe(true);
      await expect
        .poll(() => isTopMostAtCenter(page, 'unifiedHistogramResizableButton'))
        .toBe(true);
    }
  );

  spaceTest('should show the grid toolbar', async ({ page }) => {
    await expect(page.testSubj.locator('unifiedDataTableToolbar')).toBeVisible();
  });
});
