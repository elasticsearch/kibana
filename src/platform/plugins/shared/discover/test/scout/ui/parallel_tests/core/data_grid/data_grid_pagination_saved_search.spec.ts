/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Saved-search persistence of data-grid rows-per-page pagination settings.
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest } from '@kbn/scout';
import { testData } from '../../../fixtures/common';

const ESQL_ROWS_PER_PAGE = 5;
const SAMPLE_SIZE = 12;
const SAVED_ROWS_PER_PAGE = 10;
const SETTINGS_ROWS_PER_PAGE = 6;

spaceTest.describe(
  'Discover data grid pagination - saved search',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
      await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
      await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
      await scoutSpace.uiSettings.set({ 'discover:rowHeightOption': 0 });
    });

    spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
      // Saving searches and creating dashboard panels require write access.
      await browserAuth.loginAsPrivilegedUser();
      await pageObjects.discover.setQueryMode('classic');
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset(
        'defaultIndex',
        'timepicker:timeDefaults',
        'discover:rowHeightOption',
        'discover:sampleSize',
        'discover:sampleRowsPerPage'
      );
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest(
      'uses rows per page from settings or from the saved search',
      async ({ pageObjects, scoutSpace }) => {
        const { dashboard, dataGrid, datePicker, discover } = pageObjects;
        const savedSearchTitle = `search with saved rowsPerPage ${scoutSpace.id}`;

        await scoutSpace.uiSettings.set({
          'discover:sampleSize': SAMPLE_SIZE,
          'discover:sampleRowsPerPage': SETTINGS_ROWS_PER_PAGE,
        });

        await spaceTest.step('render the default Discover rows-per-page setting', async () => {
          await discover.goto();
          await dataGrid.waitUntilSearchingHasFinished();

          expect(await dataGrid.getDocTableRowCount()).toBe(SETTINGS_ROWS_PER_PAGE);
          expect(await dataGrid.getCurrentRowsPerPage()).toBe(SETTINGS_ROWS_PER_PAGE);
        });

        await spaceTest.step('save an overridden rows-per-page value onto a search', async () => {
          await dataGrid.changeRowsPerPageTo(SAVED_ROWS_PER_PAGE);
          await expect.poll(() => dataGrid.getCurrentRowsPerPage()).toBe(SAVED_ROWS_PER_PAGE);
          await discover.saveSearch(savedSearchTitle);
        });

        await spaceTest.step('new Discover sessions still use the settings value', async () => {
          await discover.clickNewSearch();
          await dataGrid.waitUntilSearchingHasFinished();

          expect(await dataGrid.getDocTableRowCount()).toBe(SETTINGS_ROWS_PER_PAGE);
          expect(await dataGrid.getCurrentRowsPerPage()).toBe(SETTINGS_ROWS_PER_PAGE);
        });

        await spaceTest.step(
          'the saved search restores its saved rows-per-page value',
          async () => {
            await discover.loadSavedSearch(savedSearchTitle);
            await dataGrid.waitUntilSearchingHasFinished();

            expect(await dataGrid.getDocTableRowCount()).toBe(SAVED_ROWS_PER_PAGE);
            expect(await dataGrid.getCurrentRowsPerPage()).toBe(SAVED_ROWS_PER_PAGE);
          }
        );

        await spaceTest.step(
          'Dashboard panels use the saved search rows-per-page value',
          async () => {
            await dashboard.openNewDashboard();
            await datePicker.setAbsoluteRange(testData.DEFAULT_TIME_RANGE);
            await dashboard.addSavedSearch(savedSearchTitle);
            await dataGrid.waitUntilSearchingHasFinished();

            expect(await dataGrid.getDocTableRowCount()).toBe(SAVED_ROWS_PER_PAGE);
            expect(await dataGrid.getCurrentRowsPerPage()).toBe(SAVED_ROWS_PER_PAGE);
          }
        );

        await spaceTest.step(
          'Dashboard panels use settings by default for archived searches',
          async () => {
            await dashboard.removePanel(savedSearchTitle);
            await dashboard.addSavedSearch(testData.SAVED_SEARCH_TITLE);
            await dataGrid.waitUntilSearchingHasFinished();

            expect(await dataGrid.getDocTableRowCount()).toBe(SETTINGS_ROWS_PER_PAGE);
            expect(await dataGrid.getCurrentRowsPerPage()).toBe(SETTINGS_ROWS_PER_PAGE);
          }
        );
      }
    );

    spaceTest(
      'does not split ES|QL results into pages',
      async ({ page, pageObjects, scoutSpace }) => {
        const { dashboard, dataGrid, datePicker, discover } = pageObjects;
        const savedSearchTitle = `testESQLPagination ${scoutSpace.id}`;

        await scoutSpace.uiSettings.set({
          'discover:sampleSize': SAMPLE_SIZE,
          'discover:sampleRowsPerPage': ESQL_ROWS_PER_PAGE,
        });

        await spaceTest.step('classic mode shows pagination', async () => {
          await discover.goto();
          await dataGrid.waitUntilSearchingHasFinished();

          expect(await dataGrid.getDocTableRowCount()).toBe(ESQL_ROWS_PER_PAGE);
          expect(await dataGrid.getCurrentRowsPerPage()).toBe(ESQL_ROWS_PER_PAGE);
          await expect(page.testSubj.locator('pagination-button-0')).toBeVisible();
        });

        await spaceTest.step('ES|QL mode renders all rows without pagination', async () => {
          await discover.selectTextBaseLang();
          await dataGrid.waitUntilSearchingHasFinished();

          expect(await dataGrid.getDocTableRowCount()).toBeGreaterThan(ESQL_ROWS_PER_PAGE);
          await expect(page.testSubj.locator('pagination-button-0')).toBeHidden();
          await discover.saveSearch(savedSearchTitle);
        });

        await spaceTest.step('Dashboard ES|QL panels also render without pagination', async () => {
          await dashboard.openNewDashboard();
          await datePicker.setAbsoluteRange(testData.DEFAULT_TIME_RANGE);
          await dashboard.addSavedSearch(savedSearchTitle);
          await dataGrid.waitUntilSearchingHasFinished();

          expect(await dataGrid.getDocTableRowCount()).toBeGreaterThan(ESQL_ROWS_PER_PAGE);
          await expect(page.testSubj.locator('pagination-button-0')).toBeHidden();
        });
      }
    );
  }
);
