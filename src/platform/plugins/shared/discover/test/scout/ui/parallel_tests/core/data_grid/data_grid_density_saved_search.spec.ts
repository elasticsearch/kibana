/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Discover data-grid density on a saved search: saving a density change as an
 * unsaved-changes update, then reverting it. This writes to a saved search, so
 * it runs with write privileges.
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest } from '@kbn/scout';
import { testData } from '../../../fixtures/common';

spaceTest.describe(
  'Discover data grid density - saved search',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
      await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
      await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
    });

    spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
      // Saving over a saved search requires write access.
      await browserAuth.loginAsPrivilegedUser();
      await pageObjects.discover.setQueryMode('classic');
      await pageObjects.discover.goto();
      await pageObjects.dataGrid.waitUntilSearchingHasFinished();
      await pageObjects.dataGrid.waitForDocTableRendered();
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest('saves and reverts unsaved densities properly', async ({ pageObjects }) => {
      await pageObjects.discover.loadSavedSearch(testData.SAVED_SEARCH_TITLE);

      // Change density and save it onto the saved search.
      await pageObjects.dataGrid.openGridDisplaySettings();
      await pageObjects.dataGrid.setDensityValue('Expanded');
      await pageObjects.discover.saveUnsavedChanges();

      // Change density again without saving -> unsaved-changes indicator appears.
      await pageObjects.dataGrid.openGridDisplaySettings();
      await pageObjects.dataGrid.setDensityValue('Normal');
      await expect(pageObjects.discover.unsavedChangesIndicator()).toBeVisible();

      // Reverting restores the last saved density.
      await pageObjects.discover.revertUnsavedChanges();

      await pageObjects.dataGrid.openGridDisplaySettings();
      expect(await pageObjects.dataGrid.getCurrentDensityValue()).toBe('Expanded');
    });
  }
);
