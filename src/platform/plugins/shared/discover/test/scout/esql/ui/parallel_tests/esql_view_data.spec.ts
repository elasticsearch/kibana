/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { NULL_LABEL } from '@kbn/field-formats-common';
import { expect } from '@kbn/scout/ui';
import { spaceTest, tags } from '../fixtures';

spaceTest.describe('Discover ES|QL view data', { tag: tags.deploymentAgnostic }, () => {
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
    'renders empty fields correctly and preserves column order',
    async ({ pageObjects }) => {
      const { discover, dataGrid } = pageObjects;

      await discover.writeAndSubmitEsqlQuery(
        'from logstash-* | limit 10 | keep machine.ram_range, bytes'
      );
      await dataGrid.waitForDocTableRendered();

      await expect(dataGrid.getColumnHeader('bytes')).toBeVisible();
      await expect(dataGrid.getColumnHeader('machine.ram_range')).toBeVisible();

      // machine.ram_range has no value in this data, so it renders the null placeholder.
      await expect(dataGrid.getCellValue(0, 'machine.ram_range')).toHaveText(NULL_LABEL);

      // bytes should appear to the left of machine.ram_range in the grid
      const bytesBox = await dataGrid.getColumnHeader('bytes').boundingBox();
      const ramRangeBox = await dataGrid.getColumnHeader('machine.ram_range').boundingBox();
      expect(bytesBox!.x).toBeLessThan(ramRangeBox!.x);
    }
  );

  spaceTest('executes ROW command and adds a field column', async ({ pageObjects }) => {
    const { discover, dataGrid } = pageObjects;

    await discover.writeAndSubmitEsqlQuery('ROW a = 1, b = "two", c = null');
    await dataGrid.waitForDocTableRendered();

    await discover.dragFieldToGrid(['a']);
    await dataGrid.waitForDocTableRendered();

    await expect(dataGrid.getCellValue(0, 'a')).toHaveText('1');
  });

  spaceTest(
    'brushes histogram to narrow the time range without creating a filter',
    async ({ page, pageObjects }) => {
      const { discover, datePicker, filterBar } = pageObjects;

      await discover.writeAndSubmitEsqlQuery('from logstash-* | limit 100');
      await expect(page.testSubj.locator('unifiedHistogramChart')).toBeVisible();

      const initialRange = await datePicker.getTimeRangeText();
      await discover.brushHistogram();
      await discover.waitUntilTabIsLoaded();

      // The brush narrows the time picker itself rather than adding a filter pill.
      const newRange = await datePicker.getTimeRangeText();
      expect(newRange).not.toBe(initialRange);
      await expect.poll(() => filterBar.getFilterCount()).toBe(0);
    }
  );
});
