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

spaceTest.describe('Discover ES|QL sorting', { tag: tags.deploymentAgnostic }, () => {
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

  spaceTest('sorts a column in both directions', async ({ page, pageObjects }) => {
    const { discover, dataGrid, unifiedFieldList } = pageObjects;
    const sortButton = page.testSubj.locator('dataGridColumnSortingButton');

    await discover.writeAndSubmitEsqlQuery(SORT_QUERY);
    await unifiedFieldList.waitUntilSidebarHasLoaded();
    await unifiedFieldList.clickFieldListItemAdd('bytes');

    await expect(dataGrid.getCellValue(0, 'bytes')).toHaveText('1,623');
    await expect(sortButton).toHaveText('Sort fields');

    await dataGrid.sortColumn('bytes', 'Sort High-Low');
    await expect(dataGrid.getCellValue(0, 'bytes')).toHaveText('17,966');
    await expect(sortButton).toHaveText('Sort fields1');

    await dataGrid.sortColumn('bytes', 'Sort Low-High');
    await expect(dataGrid.getCellValue(0, 'bytes')).toHaveText('0');
    await expect(sortButton).toHaveText('Sort fields1');
  });

  spaceTest('sorts on a computed column', async ({ pageObjects }) => {
    const { discover, dataGrid } = pageObjects;

    await discover.writeAndSubmitEsqlQuery(COMPUTED_COLUMN_QUERY);

    await expect(dataGrid.getCellValue(0, 'var0')).toHaveText('1,624');

    await dataGrid.sortColumn('var0', 'Sort High-Low');
    await expect(dataGrid.getCellValue(0, 'var0')).toHaveText('17,967');

    await dataGrid.sortColumn('var0', 'Sort Low-High');
    await expect(dataGrid.getCellValue(0, 'var0')).toHaveText('1');
  });

  spaceTest('sorts on multiple columns', async ({ page, pageObjects }) => {
    const { discover, dataGrid, unifiedFieldList } = pageObjects;

    await discover.writeAndSubmitEsqlQuery(SORT_QUERY);
    await unifiedFieldList.waitUntilSidebarHasLoaded();
    await unifiedFieldList.clickFieldListItemAdd('bytes');
    await unifiedFieldList.clickFieldListItemAdd('extension');

    await dataGrid.sortColumn('bytes', 'Sort Low-High');
    await dataGrid.sortColumn('extension', 'Sort A-Z');

    await expect(dataGrid.getCellValue(0, 'bytes')).toHaveText('0');
    await expect(dataGrid.getCellValue(0, 'extension')).toHaveText('css');
    await expect(page.testSubj.locator('dataGridColumnSortingButton')).toHaveText('Sort fields2');
  });
});
