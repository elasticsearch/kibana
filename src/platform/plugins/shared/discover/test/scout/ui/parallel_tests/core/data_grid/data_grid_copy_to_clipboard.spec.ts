/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Data-grid column-name and column-value copy-to-clipboard actions.
 */

import type { PageObjects, ScoutPage } from '@kbn/scout';
import { EuiToastWrapper, spaceTest } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { testData } from '../../../fixtures/common';

// Copying the column values produces a CSV-escaped string. The leading
// apostrophe on `@timestamp` is intentional formula-injection protection.
const EXPECTED_TIMESTAMP_COLUMN_PREFIX =
  '"\'@timestamp"\n"Sep 22, 2015 @ 23:50:13.253"\n"Sep 22, 2015 @ 23:43:58.175"';
const EXPECTED_SOURCE_COLUMN_PREFIX = 'Summary\n{"@message":["238.171.34.42';

type DataGridPage = PageObjects['dataGrid'];

const clickCopyColumnName = async (page: ScoutPage, dataGrid: DataGridPage, field: string) => {
  await dataGrid.openColumnMenuByField(field);
  await page.getByRole('button', { name: 'Copy name' }).click();
};

const clickCopyColumnValues = async (page: ScoutPage, dataGrid: DataGridPage, field: string) => {
  await dataGrid.openColumnMenuByField(field);
  await page.getByRole('button', { name: 'Copy column' }).click();
};

const expectSingleToastThenDismiss = async (page: ScoutPage) => {
  const toasts = new EuiToastWrapper(page, { locator: '.euiToast' });

  await expect(toasts.getWrapper()).toHaveCount(1);

  await toasts.closeAllToasts();
};

const readClipboard = async (page: ScoutPage): Promise<string> => {
  return await page.evaluate(() => navigator.clipboard.readText());
};

spaceTest.describe(
  'Discover data grid - copy to clipboard',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
      await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
      await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
    });

    spaceTest.beforeEach(async ({ page, browserAuth, pageObjects }) => {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
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

    spaceTest('copies a column values to clipboard', async ({ page, pageObjects }) => {
      const { dataGrid } = pageObjects;

      await clickCopyColumnValues(page, dataGrid, '@timestamp');
      const copiedTimestampData = await readClipboard(page);
      expect(
        copiedTimestampData.startsWith(EXPECTED_TIMESTAMP_COLUMN_PREFIX),
        `copied @timestamp column "${copiedTimestampData}" should start with the expected values`
      ).toBe(true);
      await expectSingleToastThenDismiss(page);

      await clickCopyColumnValues(page, dataGrid, '_source');
      const copiedSourceData = await readClipboard(page);
      expect(
        copiedSourceData.startsWith(EXPECTED_SOURCE_COLUMN_PREFIX) &&
          copiedSourceData.endsWith('}'),
        `copied _source column "${copiedSourceData}" should start with the summary and end with "}"`
      ).toBe(true);

      await expectSingleToastThenDismiss(page);
    });

    spaceTest('copies a column name to clipboard', async ({ page, pageObjects }) => {
      const { dataGrid } = pageObjects;

      await clickCopyColumnName(page, dataGrid, '@timestamp');

      const copiedTimestampName = await readClipboard(page);
      expect(copiedTimestampName, `copied column name should be "@timestamp"`).toBe('@timestamp');

      await expectSingleToastThenDismiss(page);

      await clickCopyColumnName(page, dataGrid, '_source');

      const copiedSourceName = await readClipboard(page);
      expect(copiedSourceName, `copied column name should be "Summary"`).toBe('Summary');

      await expectSingleToastThenDismiss(page);
    });
  }
);
