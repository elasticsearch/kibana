/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Data-grid row and header row-height settings, reset, and reload persistence.
 */

import type { ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest } from '@kbn/scout';
import { testData } from '../../../fixtures/common';

const resetDisplaySelector = (page: ScoutPage) => page.testSubj.locator('resetDisplaySelector');

spaceTest.describe('Discover data grid row height', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
    await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
    await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
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

  spaceTest('uses the default row height', async ({ pageObjects }) => {
    expect(await pageObjects.dataGrid.getDocTableRowCount()).toBeGreaterThan(0);

    await pageObjects.dataGrid.openGridDisplaySettings();
    expect(await pageObjects.dataGrid.getCurrentRowHeight()).toBe('Custom');
  });

  spaceTest('allows changing the row height', async ({ page, pageObjects }) => {
    const { dataGrid } = pageObjects;

    await dataGrid.openGridDisplaySettings();
    expect(await dataGrid.getCurrentRowHeight()).toBe('Custom');
    await expect(resetDisplaySelector(page)).toBeHidden();

    await dataGrid.setRowHeight('Auto');

    // Re-open the popover to confirm the selection sticks.
    await dataGrid.openGridDisplaySettings();
    await dataGrid.openGridDisplaySettings();
    expect(await dataGrid.getCurrentRowHeight()).toBe('Auto');

    // Discover hides the "Reset to default" action in this display-settings context.
    await expect(resetDisplaySelector(page)).toBeHidden();

    await dataGrid.setRowHeight('Custom');
    expect(await dataGrid.getCurrentRowHeight()).toBe('Custom');
  });

  spaceTest(
    'persists the row height selection after reloading the page',
    async ({ page, pageObjects }) => {
      const { dataGrid } = pageObjects;

      await dataGrid.openGridDisplaySettings();
      expect(await dataGrid.getCurrentRowHeight()).toBe('Custom');

      await dataGrid.setRowHeight('Auto');
      expect(await dataGrid.getCurrentRowHeight()).toBe('Auto');

      await page.reload();
      await dataGrid.waitUntilSearchingHasFinished();
      await dataGrid.waitForDocTableRendered();
      await dataGrid.openGridDisplaySettings();

      expect(await dataGrid.getCurrentRowHeight()).toBe('Auto');
    }
  );

  spaceTest('uses the default header row height', async ({ pageObjects }) => {
    expect(await pageObjects.dataGrid.getDocTableRowCount()).toBeGreaterThan(0);

    await pageObjects.dataGrid.openGridDisplaySettings();
    expect(await pageObjects.dataGrid.getCurrentRowHeight('header')).toBe('Custom');
  });

  spaceTest('allows changing the header row height', async ({ page, pageObjects }) => {
    const { dataGrid } = pageObjects;

    await dataGrid.openGridDisplaySettings();
    expect(await dataGrid.getCurrentRowHeight('header')).toBe('Custom');

    await dataGrid.setRowHeight('Auto', 'header');

    // Re-open the popover to confirm the selection sticks.
    await dataGrid.openGridDisplaySettings();
    await dataGrid.openGridDisplaySettings();
    expect(await dataGrid.getCurrentRowHeight('header')).toBe('Auto');

    // Discover hides the "Reset to default" action in this display-settings context.
    await expect(resetDisplaySelector(page)).toBeHidden();

    await dataGrid.setRowHeight('Custom', 'header');
    expect(await dataGrid.getCurrentRowHeight('header')).toBe('Custom');
  });

  spaceTest(
    'persists the header row height selection after reloading the page',
    async ({ page, pageObjects }) => {
      const { dataGrid } = pageObjects;

      await dataGrid.openGridDisplaySettings();
      expect(await dataGrid.getCurrentRowHeight('header')).toBe('Custom');

      await dataGrid.setRowHeight('Auto', 'header');
      expect(await dataGrid.getCurrentRowHeight('header')).toBe('Auto');

      await page.reload();
      await dataGrid.waitUntilSearchingHasFinished();
      await dataGrid.waitForDocTableRendered();
      await dataGrid.openGridDisplaySettings();

      expect(await dataGrid.getCurrentRowHeight('header')).toBe('Auto');
    }
  );
});
