/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Data-grid rendering and sidebar column management.
 */

import { spaceTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import type { ScoutPage } from '@kbn/scout';
import { testData } from '../../../fixtures/common';

const NARROWED_TIME_RANGE = {
  from: 'Sep 20, 2015 @ 23:00:00.000',
  to: 'Sep 20, 2015 @ 23:14:00.000',
};

const EXTRA_COLUMNS = ['phpmemory', 'ip'];

const addColumnFromSidebar = async (page: ScoutPage, column: string) => {
  await page.testSubj.fill('fieldListFiltersFieldSearch', column);
  await page.testSubj.click(`fieldToggle-${column}`);
};

spaceTest.describe('Discover data grid - doc table', { tag: tags.stateful.all }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
    await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
    await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
    await scoutSpace.uiSettings.set({ 'discover:rowHeightOption': 0 });
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    // Viewer is sufficient for read-only grid interactions.
    await browserAuth.loginAsViewer();
    await pageObjects.discover.setQueryMode('classic');
    await pageObjects.discover.goto();
    await pageObjects.dataGrid.waitUntilSearchingHasFinished();
    // Search can finish before the grid leaves "Loading documents" (histogram may
    // render first). Wait until the table reports a stable render before row counts.
    await pageObjects.dataGrid.waitForDocTableRendered();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset(
      'defaultIndex',
      'timepicker:timeDefaults',
      'discover:rowHeightOption'
    );
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('renders rows by default', async ({ page }) => {
    await expect(page.testSubj.locator('discoverDocTable')).toBeVisible();
    const rows = page.locator('[data-test-subj="discoverDocTable"] [data-grid-row-index]');
    expect(await rows.count()).toBeGreaterThan(0);
  });

  spaceTest('refreshes the table when the time range changes', async ({ page, pageObjects }) => {
    const rows = page.locator('[data-test-subj="discoverDocTable"] [data-grid-row-index]');
    const initialCount = await rows.count();
    expect(initialCount).toBeGreaterThan(0);

    await pageObjects.datePicker.setAbsoluteRange(NARROWED_TIME_RANGE);
    await pageObjects.dataGrid.waitUntilSearchingHasFinished();
    await pageObjects.dataGrid.waitForDocTableRendered();

    const finalCount = await rows.count();
    expect(finalCount).toBeLessThan(initialCount);
  });

  spaceTest('adds columns via the sidebar field list', async ({ page, pageObjects }) => {
    for (const column of EXTRA_COLUMNS) {
      await addColumnFromSidebar(page, column);
    }
    await pageObjects.dataGrid.waitUntilSearchingHasFinished();

    for (const column of EXTRA_COLUMNS) {
      await expect(
        pageObjects.dataGrid.getColumnHeader(column),
        `column ${column} should be present in the grid header`
      ).toBeVisible();
    }
  });

  spaceTest('removes columns via the sidebar field list', async ({ page, pageObjects }) => {
    // Add both, then remove only the second.
    for (const column of EXTRA_COLUMNS) {
      await addColumnFromSidebar(page, column);
    }
    await pageObjects.dataGrid.waitUntilSearchingHasFinished();

    const [firstColumn, secondColumn] = EXTRA_COLUMNS;
    await page.testSubj.fill('fieldListFiltersFieldSearch', secondColumn);
    await page.testSubj.click(`fieldToggle-${secondColumn}`);
    await pageObjects.dataGrid.waitUntilSearchingHasFinished();

    await expect(pageObjects.dataGrid.getColumnHeader(secondColumn)).toBeHidden();
    await expect(pageObjects.dataGrid.getColumnHeader(firstColumn)).toBeVisible();
  });
});
