/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest } from '../fixtures';

spaceTest.describe(
  'Discover tabs - restorable data grid state',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
      await discoverScoutSpace.setupDiscoverDefaults();
    });

    spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginAsViewer();
      await pageObjects.discover.goto({ queryMode: 'classic' });
      await pageObjects.discover.waitUntilTabIsLoaded();
    });

    spaceTest.afterAll(async ({ discoverScoutSpace }) => {
      await discoverScoutSpace.teardownDiscoverDefaults();
    });

    spaceTest('restores selected documents per tab', async ({ pageObjects }) => {
      const { dataGrid, discover, unifiedTabs } = pageObjects;

      expect(await dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(0);
      expect(await dataGrid.isSelectedRowsMenuVisible()).toBe(false);

      await dataGrid.selectRow(1);
      await dataGrid.selectRow(3);
      expect(await dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(2);
      expect(await dataGrid.isSelectedRowsMenuVisible()).toBe(true);

      await discover.createNewTabAndSearch();
      expect(await dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(0);
      expect(await dataGrid.isSelectedRowsMenuVisible()).toBe(false);

      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();
      expect(await dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(2);
      expect(await dataGrid.isSelectedRowsMenuVisible()).toBe(true);
    });

    spaceTest(
      'restores display settings and in-table search per tab',
      async ({ page, pageObjects }) => {
        const { dataGrid, discover, unifiedTabs } = pageObjects;
        const searchTerm = 'Sep 22, 2015 @ 18:16:13.025';
        const updatedActiveMatch = '2/3';

        expect(await dataGrid.getCurrentPageNumber()).toBe('1');

        await dataGrid.openGridDisplaySettings();
        await dataGrid.setDensityValue('Expanded');
        await dataGrid.setRowHeight('Auto');
        expect(await dataGrid.getCurrentDensityValue()).toBe('Expanded');
        expect(await dataGrid.getCurrentRowHeight('row')).toBe('Auto');
        await page.keyboard.press('Escape');

        await dataGrid.runInTableSearch(searchTerm);
        await dataGrid.goToNextInTableSearchMatch();
        expect(await dataGrid.getInTableSearchTerm()).toBe(searchTerm);
        await expect(dataGrid.getInTableSearchMatchesCounter()).toHaveText(updatedActiveMatch);
        expect(await dataGrid.getCurrentPageNumber()).toBe('3');

        await discover.createNewTabAndSearch();
        await dataGrid.openGridDisplaySettings();
        await dataGrid.setDensityValue('Normal');
        await dataGrid.setRowHeight('Custom');
        expect(await dataGrid.getCurrentDensityValue()).toBe('Normal');
        expect(await dataGrid.getCurrentRowHeight('row')).toBe('Custom');
        await page.keyboard.press('Escape');
        expect(await dataGrid.getInTableSearchTerm()).toBeNull();
        expect(await dataGrid.getCurrentPageNumber()).toBe('1');

        await unifiedTabs.selectTab(0);
        await discover.waitUntilTabIsLoaded();
        await dataGrid.openGridDisplaySettings();
        expect(await dataGrid.getCurrentDensityValue()).toBe('Expanded');
        expect(await dataGrid.getCurrentRowHeight('row')).toBe('Auto');
        await page.keyboard.press('Escape');
        expect(await dataGrid.getInTableSearchTerm()).toBe(searchTerm);
        await expect(dataGrid.getInTableSearchMatchesCounter()).toHaveText(updatedActiveMatch);
        expect(await dataGrid.getCurrentPageNumber()).toBe('3');

        await dataGrid.closeInTableSearch();
        expect(await dataGrid.getInTableSearchTerm()).toBeNull();
        expect(await dataGrid.getCurrentPageNumber()).toBe('3');

        await unifiedTabs.selectTab(1);
        await discover.waitUntilTabIsLoaded();
        await dataGrid.openGridDisplaySettings();
        expect(await dataGrid.getCurrentDensityValue()).toBe('Normal');
        expect(await dataGrid.getCurrentRowHeight('row')).toBe('Custom');
        await page.keyboard.press('Escape');
        expect(await dataGrid.getInTableSearchTerm()).toBeNull();
        expect(await dataGrid.getCurrentPageNumber()).toBe('1');
      }
    );

    spaceTest('restores comparison mode per tab', async ({ pageObjects }) => {
      const { dataGrid, discover, unifiedTabs } = pageObjects;

      expect(await dataGrid.isComparisonModeActive()).toBe(false);

      await dataGrid.selectRow(1);
      await dataGrid.selectRow(3);
      await dataGrid.clickCompareSelectedButton();
      expect(await dataGrid.isComparisonModeActive()).toBe(true);
      expect(await dataGrid.getComparisonDiffMode()).toBe('Full value');
      await dataGrid.selectComparisonDiffMode('words');
      expect(await dataGrid.getComparisonDiffMode()).toBe('By word');

      await discover.createNewTabAndSearch();
      expect(await dataGrid.isComparisonModeActive()).toBe(false);
      await dataGrid.selectRow(1);
      await dataGrid.selectRow(2);
      await dataGrid.clickCompareSelectedButton();
      expect(await dataGrid.isComparisonModeActive()).toBe(true);
      expect(await dataGrid.getComparisonDiffMode()).toBe('By word');
      await dataGrid.selectComparisonDiffMode('lines');
      expect(await dataGrid.getComparisonDiffMode()).toBe('By line');

      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();
      expect(await dataGrid.isComparisonModeActive()).toBe(true);
      expect(await dataGrid.getComparisonDiffMode()).toBe('By word');

      await unifiedTabs.selectTab(1);
      await discover.waitUntilTabIsLoaded();
      expect(await dataGrid.isComparisonModeActive()).toBe(true);
      expect(await dataGrid.getComparisonDiffMode()).toBe('By line');
    });
  }
);
