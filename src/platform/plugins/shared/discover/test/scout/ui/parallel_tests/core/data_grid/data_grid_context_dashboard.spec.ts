/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Dashboard saved-search embeddable behavior when opening surrounding documents.
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest } from '@kbn/scout';
import { testData } from '../../../fixtures/common';

spaceTest.describe(
  'Discover data grid - dashboard context view',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
      await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
      await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
      await scoutSpace.uiSettings.set({ 'discover:rowHeightOption': 0 });
    });

    spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginAsPrivilegedUser();
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
      'navigates to context view from a saved-search dashboard panel',
      async ({ page, pageObjects, scoutSpace }) => {
        const searchName = `context search ${scoutSpace.id}`;
        const dashboardName = `context dashboard ${scoutSpace.id}`;

        await pageObjects.filterBar.addFilter({
          field: 'extension.raw',
          operator: 'is',
          value: 'jpg',
        });
        await pageObjects.dataGrid.waitUntilSearchingHasFinished();
        await pageObjects.discover.saveSearch(searchName);

        await pageObjects.dashboard.openNewDashboard();
        await pageObjects.dashboard.addSavedSearch(searchName);
        await pageObjects.dataGrid.waitUntilSearchingHasFinished();
        await pageObjects.dataGrid.waitForDocTableRendered();
        await pageObjects.dashboard.saveDashboard(dashboardName);

        await pageObjects.dataGrid.openSurroundingDocuments(0);

        await expect(page).toHaveURL(/#\/context/);
        await pageObjects.dataGrid.waitForDocTableRendered();
        await expect.poll(() => pageObjects.dataGrid.getDocTableRowCount()).toBe(6);
      }
    );
  }
);
