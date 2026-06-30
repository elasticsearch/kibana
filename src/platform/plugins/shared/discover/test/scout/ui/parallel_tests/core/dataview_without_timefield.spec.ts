/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Tests for timepicker and data view switching behavior.
 */

import { spaceTest } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

spaceTest.describe('Data view without timefield', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    // Load Kibana saved objects (3 data views: with and without time fields)
    await scoutSpace.savedObjects.load(
      'src/platform/test/functional/fixtures/kbn_archiver/index_pattern_without_timefield'
    );
    await scoutSpace.uiSettings.setDefaultIndex('without-timefield');
    await scoutSpace.uiSettings.set({
      'timepicker:timeDefaults': '{"from": "2019-01-18T19:37:13.000Z", "to": "now"}',
    });
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.discover.goto({ queryMode: 'classic' });
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('timepicker:timeDefaults', 'defaultIndex');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('should not display a timepicker', async ({ pageObjects }) => {
    // Verify timepicker does not exist for data view without timefield
    const timePickerExists = await pageObjects.datePicker.timePickerExists();
    expect(timePickerExists).toBe(false);
  });

  spaceTest('should adapt sidebar fields when switching', async ({ page, pageObjects }) => {
    // Switch to data view with timefield
    await pageObjects.discover.selectDataView('with-timefield');
    await pageObjects.discover.waitUntilSearchingHasFinished();

    // @timestamp field should exist
    await expect(page.testSubj.locator('field-@timestamp')).toBeVisible();

    // Switch to data view without timefield
    await pageObjects.discover.selectDataView('without-timefield');
    await pageObjects.discover.waitUntilSearchingHasFinished();

    // @timestamp field should not exist
    await expect(page.testSubj.locator('field-@timestamp')).toBeHidden();
  });

  spaceTest(
    'should display a timepicker after switching to an index pattern with timefield',
    async ({ pageObjects }) => {
      // Switch to data view with timefield
      await pageObjects.discover.selectDataView('with-timefield');
      await pageObjects.dataGrid.waitForDocTableRendered();

      // Verify timepicker exists
      const timePickerExists = await pageObjects.datePicker.timePickerExists();
      expect(timePickerExists).toBe(true);
    }
  );

  spaceTest(
    'should switch between with and without timefield using the browser back button',
    async ({ page, pageObjects }) => {
      await pageObjects.discover.selectDataView('without-timefield');
      await pageObjects.dataGrid.waitForDocTableRendered();

      // Wait for timepicker to disappear
      await expect(async () => {
        const timePickerExists = await pageObjects.datePicker.timePickerExists();
        expect(timePickerExists).toBe(false);
      }).toPass();

      await pageObjects.discover.selectDataView('with-timefield');
      await pageObjects.dataGrid.waitForDocTableRendered();

      // Wait for timepicker to appear
      await expect(async () => {
        const timePickerExists = await pageObjects.datePicker.timePickerExists();
        expect(timePickerExists).toBe(true);
      }).toPass();

      // Navigate back using browser back button
      await page.goBack();
      await pageObjects.dataGrid.waitForDocTableRendered();

      await expect(page.testSubj.locator('discover-dataView-switch-link')).toHaveText(
        'without-timefield'
      );

      // Verify timepicker disappeared again
      await expect(async () => {
        const timePickerExists = await pageObjects.datePicker.timePickerExists();
        expect(timePickerExists).toBe(false);
      }).toPass();
    }
  );

  spaceTest(
    'should disable the auto refresh interval when switching to a data view without a time field',
    async ({ page, pageObjects }) => {
      const autoRefreshInterval = 5;

      // Switch to data view with timefield
      await pageObjects.discover.selectDataView('with-timefield');
      await pageObjects.datePicker.startAutoRefresh(autoRefreshInterval);

      // Verify auto-refresh is enabled in URL
      let url = page.url();
      expect(url).toContain(`refreshInterval:(pause:!f,value:${autoRefreshInterval * 1000})`);

      // Switch to data view without timefield
      await pageObjects.discover.selectDataView('without-timefield');

      // Verify auto-refresh is paused in URL
      url = page.url();
      expect(url).toContain(`refreshInterval:(pause:!t,value:${autoRefreshInterval * 1000})`);
    }
  );

  spaceTest(
    'should allow switching from a saved search with a time field to a saved search without a time field',
    async ({ pageObjects }) => {
      // Navigate to Discover
      await pageObjects.discover.goto({ queryMode: 'classic' });

      // Create saved search with timefield
      await pageObjects.discover.selectDataView('with-timefield');
      await pageObjects.discover.waitUntilSearchingHasFinished();
      await pageObjects.discover.saveSearch('with-timefield');

      // Create saved search without timefield
      await pageObjects.discover.selectDataView('without-timefield');
      await pageObjects.discover.waitUntilSearchingHasFinished();
      await pageObjects.discover.saveSearchAsNew('without-timefield');

      // Load saved search with timefield
      await pageObjects.discover.loadSavedSearch('with-timefield');
      await pageObjects.discover.waitUntilSearchingHasFinished();

      // Load saved search without timefield
      await pageObjects.discover.loadSavedSearch('without-timefield');
      await pageObjects.discover.waitUntilSearchingHasFinished();

      // Verify hit count
      const hitCount = await pageObjects.discover.getHitCountInt();
      expect(hitCount).toBe(1);
    }
  );

  spaceTest(
    'should allow switching from data views with different timefields and sort correctly',
    async ({ page, pageObjects }) => {
      // Navigate to Discover
      await pageObjects.discover.goto({ queryMode: 'classic' });

      // Switch to data view with @timestamp
      await pageObjects.discover.selectDataView('with-timefield');
      await pageObjects.discover.waitUntilSearchingHasFinished();

      let url = page.url();
      expect(url).toContain('@timestamp');

      // Switch to data view with different timefield
      await pageObjects.discover.selectDataView('with-different-timefield');
      await pageObjects.discover.waitUntilSearchingHasFinished();

      url = page.url();
      expect(url).toContain('with-different-timefield');

      // Navigate back
      await page.goBack();
      await pageObjects.discover.waitUntilSearchingHasFinished();

      url = page.url();
      expect(url).toContain('@timestamp');
    }
  );
});
