/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * In-table search interactions, highlighting, navigation, and pagination state.
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest } from '@kbn/scout';
import { testData } from '../../../fixtures/common';

spaceTest.describe('Discover data grid in-table search', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
    await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
    await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
  });

  spaceTest.beforeEach(async ({ page, browserAuth, pageObjects }) => {
    // A tall viewport renders enough rows for per-cell highlight counts and the
    // exact pagination transitions the assertions below rely on.
    await page.setViewportSize({ width: 1200, height: 2000 });
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

  spaceTest('shows highlights for in-table search', async ({ pageObjects }) => {
    const { dataGrid } = pageObjects;
    await expect(dataGrid.getCurrentPageButton()).toHaveText('1');

    await dataGrid.runInTableSearch('Sep 22, 2015 @ 18:16:13.025');
    await expect(dataGrid.getInTableSearchMatchesCounter()).toHaveText('1/3');
    await expect(dataGrid.getInTableSearchCellMatches(1, '@timestamp')).toHaveCount(1);
    await expect(dataGrid.getInTableSearchCellMatches(1, '_source')).toHaveCount(2);
    await expect(dataGrid.getInTableSearchCellMatches(2, '@timestamp')).toHaveCount(0);
    await expect(dataGrid.getInTableSearchCellMatches(2, '_source')).toHaveCount(0);
    await expect(dataGrid.getCurrentPageButton()).toHaveText('3');

    await dataGrid.setInTableSearchTerm('http');
    await expect(dataGrid.getInTableSearchMatchesCounter()).toHaveText('1/6386');
    await expect(dataGrid.getInTableSearchCellMatches(0, '@timestamp')).toHaveCount(0);
    await expect(dataGrid.getInTableSearchCellMatches(0, '_source')).toHaveCount(13);
    await expect(dataGrid.getCurrentPageButton()).toHaveText('1');

    await dataGrid.closeInTableSearch();
    await expect(dataGrid.getInTableSearchCellMatches(0, '@timestamp')).toHaveCount(0);
  });

  spaceTest('can navigate between matches', async ({ pageObjects }) => {
    const { dataGrid, discover } = pageObjects;
    await dataGrid.changeRowsPerPageTo(10);
    await dataGrid.addFieldFromSidebar('extension');
    await dataGrid.waitUntilSearchingHasFinished();
    await discover.writeAndSubmitKqlQuery('response : 404 and @tags.raw : "info" and bytes < 1000');

    await dataGrid.runInTableSearch('php');
    await expect(dataGrid.getInTableSearchMatchesCounter()).toHaveText('1/4');
    await expect(dataGrid.getCurrentPageButton()).toHaveText('1');

    await dataGrid.goToNextInTableSearchMatch();
    await expect(dataGrid.getInTableSearchMatchesCounter()).toHaveText('2/4');
    await expect(dataGrid.getCurrentPageButton()).toHaveText('1');

    await dataGrid.goToNextInTableSearchMatch();
    await expect(dataGrid.getInTableSearchMatchesCounter()).toHaveText('3/4');
    await expect(dataGrid.getCurrentPageButton()).toHaveText('2');

    await dataGrid.goToNextInTableSearchMatch();
    await expect(dataGrid.getInTableSearchMatchesCounter()).toHaveText('4/4');
    await expect(dataGrid.getCurrentPageButton()).toHaveText('3');

    await dataGrid.goToNextInTableSearchMatch();
    await expect(dataGrid.getInTableSearchMatchesCounter()).toHaveText('1/4');
    await expect(dataGrid.getCurrentPageButton()).toHaveText('1');
  });

  spaceTest('overrides cmd+f if a grid element was in focus', async ({ page, pageObjects }) => {
    const { dataGrid } = pageObjects;
    await dataGrid.getCell(0, '@timestamp').click();

    await page.keyboard.press('ControlOrMeta+f');
    await expect(dataGrid.getInTableSearchInput()).toBeVisible();
  });
});
