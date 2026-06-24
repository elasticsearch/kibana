/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Discover context view opened from the data grid with anchor row and filters.
 */

import type { PageObjects, ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest } from '@kbn/scout';
import { testData } from '../../../fixtures/common';

const CONTEXT_COLUMN = '@message';
const CONTEXT_FILTERS = [
  { sidebarField: 'extension', filterField: 'extension.raw', value: 'jpg' },
  { sidebarField: 'geo.src', filterField: 'geo.src', value: 'IN' },
] as const;

const addFilterForFieldValueFromSidebar = async ({
  dataGrid,
  page,
  field,
  value,
}: {
  dataGrid: PageObjects['dataGrid'];
  page: ScoutPage;
  field: string;
  value: string;
}) => {
  await page.testSubj.waitForSelector('fieldListGroupedAvailableFields-countLoading', {
    state: 'hidden',
  });
  await page.testSubj.fill('fieldListFiltersFieldSearch', field);
  await page.testSubj.click(`field-${field}`);
  await page.locator('[data-popover-open="true"]').waitFor({ state: 'visible' });
  await expect(page.locator('[data-test-subj*="-statsLoading"]')).toBeHidden();
  await page.testSubj.click(`plus-${field}-${value}`);
  await dataGrid.waitUntilSearchingHasFinished();
};

const firstRowTimestampCell = (page: ScoutPage) =>
  page.locator('[data-grid-visible-row-index="0"] [data-gridcell-column-id="@timestamp"]');

const getColumnTitles = async (page: ScoutPage): Promise<string[]> => {
  const titles = await page.locator('.euiDataGridHeaderCell__content').allInnerTexts();

  return titles.map((title) => title.trim());
};

const normalizeTimestamp = (timestamp: string) => timestamp.replace('↦', '').trim();

const openAnchorDocumentDetails = async (page: ScoutPage, dataGrid: PageObjects['dataGrid']) => {
  const expandButton = page.testSubj.locator('docTableExpandToggleColumnAnchor');
  await expect(expandButton).toBeVisible();
  await expandButton.scrollIntoViewIfNeeded();
  await expandButton.hover();
  await expandButton.click();
  await dataGrid.waitForDocViewerFlyoutOpen();
};

spaceTest.describe('Discover data grid - context view', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
    await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
    await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
    await scoutSpace.uiSettings.set({ 'discover:rowHeightOption': 0 });
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.discover.setQueryMode('classic');
    await pageObjects.discover.goto();
    await pageObjects.dataGrid.waitUntilSearchingHasFinished();
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

  spaceTest(
    'opens the context view with Discover columns, disabled filters, toolbar, and anchor document',
    async ({ page, pageObjects }) => {
      await pageObjects.dataGrid.addFieldFromSidebar(CONTEXT_COLUMN);

      for (const filter of CONTEXT_FILTERS) {
        await addFilterForFieldValueFromSidebar({
          dataGrid: pageObjects.dataGrid,
          page,
          field: filter.sidebarField,
          value: filter.value,
        });
      }
      await pageObjects.dataGrid.waitUntilSearchingHasFinished();
      await pageObjects.dataGrid.waitForDocTableRendered();

      const firstTimestamp = normalizeTimestamp(await firstRowTimestampCell(page).innerText());

      await pageObjects.dataGrid.openSurroundingDocuments(0);
      await expect(page).toHaveURL(/#\/context/);
      await pageObjects.dataGrid.waitForDocTableRendered();

      // Covers the original FTR assertions for same columns, disabled filters, toolbar,
      // and selected document as anchor in one independent context-navigation flow.
      await expect.poll(() => getColumnTitles(page)).toStrictEqual(['@timestamp', CONTEXT_COLUMN]);
      await expect(page.testSubj.locator('unifiedDataTableToolbar')).toBeVisible();

      for (const filter of CONTEXT_FILTERS) {
        await expect
          .poll(() =>
            pageObjects.filterBar.hasFilter({
              field: filter.filterField,
              value: filter.value,
              enabled: false,
              pinned: false,
              negated: false,
            })
          )
          .toBe(true);
      }

      await openAnchorDocumentDetails(page, pageObjects.dataGrid);
      await page.testSubj.click('docViewerTab-doc_view_table');
      await expect(page.testSubj.locator('tableDocViewRow-@timestamp-value')).toHaveText(
        firstTimestamp
      );
    }
  );
});
