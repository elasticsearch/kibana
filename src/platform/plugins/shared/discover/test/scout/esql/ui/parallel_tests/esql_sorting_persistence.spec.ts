/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest, tags } from '../fixtures';

const SORT_QUERY = 'from logstash-* | sort @timestamp | limit 100';
const COMPUTED_COLUMN_QUERY = `${SORT_QUERY} | keep bytes | eval var0 = abs(bytes) + 1`;

spaceTest.describe('Discover ES|QL sorting persistence', { tag: tags.deploymentAgnostic }, () => {
  spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.setupDiscoverDefaults();
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.discover.goto({ queryMode: 'esql' });
    await pageObjects.discover.waitUntilTabIsLoaded();
  });

  spaceTest.afterAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.teardownDiscoverDefaults();
  });

  spaceTest(
    'restores sorting after save, reload and reopen',
    async ({ page, pageObjects, scoutSpace }) => {
      const { discover, dataGrid, unifiedFieldList } = pageObjects;
      const savedSearchTitle = `esql sorting persistence ${scoutSpace.id}`;

      await discover.writeAndSubmitEsqlQuery(SORT_QUERY);
      await unifiedFieldList.waitUntilSidebarHasLoaded();
      await unifiedFieldList.clickFieldListItemAdd('bytes');
      await dataGrid.sortColumn('bytes', 'Sort High-Low');
      await expect(dataGrid.getCellValue(0, 'bytes')).toHaveText('17,966');

      await discover.saveSearch(savedSearchTitle);
      await expect(dataGrid.getCellValue(0, 'bytes')).toHaveText('17,966');

      await page.reload();
      await discover.waitUntilTabIsLoaded();
      await expect(dataGrid.getCellValue(0, 'bytes')).toHaveText('17,966');

      await discover.clickNewSearch();
      // Confirms the new search really cleared the state, so reopening below is
      // restoring the sort rather than just finding it still applied.
      await expect(dataGrid.getColumnHeader('bytes')).toBeHidden();

      await discover.loadSavedSearch(savedSearchTitle);
      await expect(dataGrid.getCellValue(0, 'bytes')).toHaveText('17,966');
    }
  );

  spaceTest(
    'restores sorting on a computed column after save, reload and reopen',
    async ({ page, pageObjects, scoutSpace }) => {
      const { discover, dataGrid } = pageObjects;
      const savedSearchTitle = `esql computed sort persistence ${scoutSpace.id}`;

      // `var0` is computed by the query rather than being a real field, so its sort
      // state round-trips through a different path than a column like `bytes`.
      await discover.writeAndSubmitEsqlQuery(COMPUTED_COLUMN_QUERY);
      await dataGrid.sortColumn('var0', 'Sort High-Low');
      await expect(dataGrid.getCellValue(0, 'var0')).toHaveText('17,967');

      await discover.saveSearch(savedSearchTitle);

      await page.reload();
      await discover.waitUntilTabIsLoaded();
      await expect(dataGrid.getCellValue(0, 'var0')).toHaveText('17,967');

      await discover.clickNewSearch();
      await expect(dataGrid.getColumnHeader('var0')).toBeHidden();

      await discover.loadSavedSearch(savedSearchTitle);
      await expect(dataGrid.getCellValue(0, 'var0')).toHaveText('17,967');
    }
  );

  spaceTest(
    'applies the saved sorting in a dashboard panel',
    async ({ pageObjects, scoutSpace }) => {
      const { dashboard, discover, dataGrid, unifiedFieldList } = pageObjects;
      const savedSearchTitle = `esql sorting dashboard ${scoutSpace.id}`;

      await discover.writeAndSubmitEsqlQuery(SORT_QUERY);
      await unifiedFieldList.waitUntilSidebarHasLoaded();
      await unifiedFieldList.clickFieldListItemAdd('bytes');
      await unifiedFieldList.clickFieldListItemAdd('extension');
      await dataGrid.sortColumn('bytes', 'Sort Low-High');
      await dataGrid.sortColumn('extension', 'Sort A-Z');
      await expect(dataGrid.getCellValue(0, 'bytes')).toHaveText('0');

      await discover.saveSearch(savedSearchTitle);

      // The dashboard picks up the default time range from ui settings, so the
      // panel covers the same range the saved search was built against.
      await dashboard.openNewDashboard();
      await dashboard.addPanelFromLibrary(savedSearchTitle);
      await dashboard.waitForRenderComplete();

      await expect(dataGrid.getCellValue(0, 'bytes')).toHaveText('0');
      await expect(dataGrid.getCellValue(0, 'extension')).toHaveText('css');
    }
  );
});
