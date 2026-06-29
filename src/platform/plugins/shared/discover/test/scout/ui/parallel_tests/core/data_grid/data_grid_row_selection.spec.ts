/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Data-grid row selection, shift-range selection, and bulk clear behavior.
 */

import type { ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest } from '@kbn/scout';
import { testData } from '../../../fixtures/common';

const PAGE_SIZE = 5;

const getSelectAllRowsOnCurrentPageTitle = (page: ScoutPage) =>
  page.testSubj.locator('selectAllDocsOnPageToggle').getAttribute('title');

const getSelectAllRowsText = async (page: ScoutPage): Promise<string | null> => {
  const selectAllRows = page.testSubj.locator('dscGridSelectAllDocs');
  if (!(await selectAllRows.isVisible())) {
    return null;
  }

  return selectAllRows.innerText();
};

const selectAllRows = async (page: ScoutPage) => {
  await page.testSubj.click('dscGridSelectAllDocs');
};

const toggleSelectAllRowsOnCurrentPage = async (page: ScoutPage) => {
  await page.testSubj.click('selectAllDocsOnPageToggle');
};

spaceTest.describe('Discover data grid row selection', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
    await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
    await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
    await scoutSpace.uiSettings.set({ 'discover:sampleRowsPerPage': PAGE_SIZE });
  });

  spaceTest.beforeEach(async ({ page, browserAuth, pageObjects }) => {
    await page.setViewportSize({ width: 1600, height: 1200 });
    await browserAuth.loginAsViewer();
    await pageObjects.discover.goto({ queryMode: 'classic' });
    await pageObjects.dataGrid.waitForLoad();
    await pageObjects.dataGrid.waitForDocTableRendered();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset(
      'defaultIndex',
      'timepicker:timeDefaults',
      'discover:sampleRowsPerPage'
    );
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('allows selecting and deselecting rows manually', async ({ pageObjects }) => {
    const { dataGrid } = pageObjects;

    expect(await dataGrid.isSelectedRowsMenuVisible()).toBe(false);

    await dataGrid.selectRow(1);

    await expect.poll(() => dataGrid.isSelectedRowsMenuVisible()).toBe(true);
    await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(1);
    await expect.poll(() => dataGrid.getNumberOfSelectedRows()).toBe(1);

    await dataGrid.selectRow(2);

    await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(2);
    await expect.poll(() => dataGrid.getNumberOfSelectedRows()).toBe(2);

    await dataGrid.selectRow(2);

    await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(1);
    await expect.poll(() => dataGrid.getNumberOfSelectedRows()).toBe(1);
  });

  spaceTest('allows selecting multiple rows with the Shift key', async ({ page, pageObjects }) => {
    const { dataGrid } = pageObjects;

    expect(await dataGrid.isSelectedRowsMenuVisible()).toBe(false);

    await spaceTest.step('select a range on the first page', async () => {
      await dataGrid.selectRow(1);

      await expect.poll(() => dataGrid.isSelectedRowsMenuVisible()).toBe(true);
      await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(1);
      await expect.poll(() => dataGrid.getNumberOfSelectedRows()).toBe(1);

      await dataGrid.selectRow(4, { pressShiftKey: true });

      await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(4);
      await expect.poll(() => dataGrid.getNumberOfSelectedRows()).toBe(4);
    });

    await spaceTest.step('deselect part of the range', async () => {
      await dataGrid.selectRow(3, { pressShiftKey: true });

      await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(2);
      await expect.poll(() => dataGrid.getNumberOfSelectedRows()).toBe(2);
    });

    await spaceTest.step('select a reverse range', async () => {
      await dataGrid.selectRow(0, { pressShiftKey: true });

      await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(4);
      await expect.poll(() => dataGrid.getNumberOfSelectedRows()).toBe(4);
    });

    await spaceTest.step('extend the selection across pages', async () => {
      await page.testSubj.click('pagination-button-1');
      await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(0);

      await dataGrid.selectRow(2, { pressShiftKey: true });

      await expect.poll(() => dataGrid.isSelectedRowsMenuVisible()).toBe(true);
      await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(3);
      await expect.poll(() => dataGrid.getNumberOfSelectedRows()).toBe(8);
    });
  });

  spaceTest('allows selecting and clearing rows in bulk', async ({ page, pageObjects }) => {
    const { dataGrid } = pageObjects;

    expect(await dataGrid.isSelectedRowsMenuVisible()).toBe(false);
    expect(await getSelectAllRowsOnCurrentPageTitle(page)).toBe('Select all visible rows');

    await dataGrid.selectRow(1);

    await expect.poll(() => dataGrid.isSelectedRowsMenuVisible()).toBe(true);
    await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(1);
    await expect.poll(() => dataGrid.getNumberOfSelectedRows()).toBe(1);
    await expect
      .poll(() => getSelectAllRowsOnCurrentPageTitle(page))
      .toBe('Deselect all visible rows');

    await toggleSelectAllRowsOnCurrentPage(page);

    await expect.poll(() => dataGrid.isSelectedRowsMenuVisible()).toBe(false);
    await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(0);
    await expect
      .poll(() => getSelectAllRowsOnCurrentPageTitle(page))
      .toBe('Select all visible rows');

    await toggleSelectAllRowsOnCurrentPage(page);

    await expect.poll(() => dataGrid.isSelectedRowsMenuVisible()).toBe(true);
    await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(PAGE_SIZE);
    await expect.poll(() => dataGrid.getNumberOfSelectedRows()).toBe(PAGE_SIZE);
    await expect
      .poll(() => getSelectAllRowsOnCurrentPageTitle(page))
      .toBe('Deselect all visible rows');
    await expect.poll(() => getSelectAllRowsText(page)).toBe('Select all 500');

    await selectAllRows(page);

    await expect.poll(() => dataGrid.isSelectedRowsMenuVisible()).toBe(true);
    await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(PAGE_SIZE);
    await expect.poll(() => dataGrid.getNumberOfSelectedRows()).toBe(500);
    await expect.poll(() => getSelectAllRowsText(page)).toBeNull();

    await toggleSelectAllRowsOnCurrentPage(page);

    await expect.poll(() => dataGrid.isSelectedRowsMenuVisible()).toBe(true);
    await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(0);
    await expect.poll(() => dataGrid.getNumberOfSelectedRows()).toBe(500 - PAGE_SIZE);
    await expect
      .poll(() => getSelectAllRowsOnCurrentPageTitle(page))
      .toBe('Select all visible rows');
    await expect.poll(() => getSelectAllRowsText(page)).toBe('Select all 500');

    await dataGrid.openSelectedRowsMenu();
    await page.testSubj.click('dscGridClearSelectedDocuments');

    await expect.poll(() => dataGrid.isSelectedRowsMenuVisible()).toBe(false);
    await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(0);
    await expect
      .poll(() => getSelectAllRowsOnCurrentPageTitle(page))
      .toBe('Select all visible rows');
    await expect.poll(() => getSelectAllRowsText(page)).toBeNull();
  });
});
