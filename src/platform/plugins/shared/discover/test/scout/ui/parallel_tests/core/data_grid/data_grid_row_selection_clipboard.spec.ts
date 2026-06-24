/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Clipboard export actions for selected data-grid rows and visible columns.
 */

import type { ScoutPage, ScoutTestFixtures } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest } from '@kbn/scout';
import { testData } from '../../../fixtures/common';

const PAGE_SIZE = 5;

const EXPECTED_SELECTED_ROWS_JSON_PREFIX =
  '[{"_index":"logstash-2015.09.22","_id":"AU_x3-TcGFA8no6Qjipx","_version":1,"_score":null,"fields":{';
const EXPECTED_SELECTED_ROWS_MARKDOWN_PREFIX =
  '| @timestamp | @message | @message.raw | @tags | @tags.raw | _i';
const EXPECTED_SELECTED_ROWS_TEXT_PREFIX =
  '"\'@timestamp"\t"\'@message"\t"\'@message.raw"\t"\'@tags"\t"\'@tags.raw"\t"_id"';
const EXPECTED_SELECTED_COLUMNS_MARKDOWN =
  '| @timestamp | extension | bytes |\n| --- | --- | --- |\n| Sep 22, 2015 @ 23:50:13.253 | jpg | 7,124 |\n| Sep 22, 2015 @ 23:43:58.175 | jpg | 5,453 |';
const EXPECTED_SELECTED_COLUMNS_TEXT =
  '"\'@timestamp"\textension\tbytes\n"Sep 22, 2015 @ 23:50:13.253"\tjpg\t"7,124"\n"Sep 22, 2015 @ 23:43:58.175"\tjpg\t"5,453"';

const clickSelectedRowsMenuAction = async (page: ScoutPage, actionTestSubj: string) => {
  await page.testSubj.click(actionTestSubj);
  await page.testSubj.waitForSelector('unifiedDataTableSelectionMenu', { state: 'hidden' });
};

const getDataGridHeaderFields = (page: ScoutPage): Promise<string[]> => {
  return page
    .locator('[data-test-subj^="dataGridHeaderCell-"]')
    .evaluateAll((headers) =>
      headers
        .map((header) =>
          (header.getAttribute('data-test-subj') ?? '').replace('dataGridHeaderCell-', '')
        )
        .filter((fieldName) => !['select', 'actions'].includes(fieldName))
    );
};

const readClipboard = async (page: ScoutPage): Promise<string> => {
  return await page.evaluate(() => navigator.clipboard.readText());
};

const copySelectedRowsAsText = async ({
  actionTestSubj,
  page,
  pageObjects,
}: {
  actionTestSubj: string;
  page: ScoutPage;
  pageObjects: ScoutTestFixtures['pageObjects'];
}): Promise<string> => {
  const { dataGrid } = pageObjects;

  await dataGrid.selectRow(2);
  await dataGrid.selectRow(1);

  await expect.poll(() => dataGrid.isSelectedRowsMenuVisible()).toBe(true);
  await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(2);
  await expect.poll(() => dataGrid.getNumberOfSelectedRows()).toBe(2);

  await dataGrid.openSelectedRowsMenu();
  await clickSelectedRowsMenuAction(page, actionTestSubj);

  return await readClipboard(page);
};

const copyVisibleColumnsForSelectedRowsAsText = async ({
  actionTestSubj,
  page,
  pageObjects,
}: {
  actionTestSubj: string;
  page: ScoutPage;
  pageObjects: ScoutTestFixtures['pageObjects'];
}): Promise<string> => {
  const { dataGrid } = pageObjects;

  await dataGrid.addFieldFromSidebar('extension');
  await dataGrid.addFieldFromSidebar('bytes');

  await expect
    .poll(() => getDataGridHeaderFields(page))
    .toStrictEqual(['@timestamp', 'extension', 'bytes']);

  await dataGrid.selectRow(1);
  await dataGrid.selectRow(0);

  await expect.poll(() => dataGrid.isSelectedRowsMenuVisible()).toBe(true);
  await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(2);
  await expect.poll(() => dataGrid.getNumberOfSelectedRows()).toBe(2);

  await dataGrid.openSelectedRowsMenu();
  await clickSelectedRowsMenuAction(page, actionTestSubj);

  return await readClipboard(page);
};

spaceTest.describe(
  'Discover data grid row selection clipboard actions',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
      await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
      await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
      await scoutSpace.uiSettings.set({ 'discover:sampleRowsPerPage': PAGE_SIZE });
    });

    spaceTest.beforeEach(async ({ page, browserAuth, pageObjects }) => {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await browserAuth.loginAsViewer();
      await pageObjects.discover.setQueryMode('classic');
      await pageObjects.discover.goto({ queryMode: 'classic' });
      await pageObjects.dataGrid.waitUntilSearchingHasFinished();
      await pageObjects.dataGrid.waitForDocTableRendered();
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset(
        'defaultIndex',
        'timepicker:timeDefaults',
        'discover:sampleRowsPerPage'
      );
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest('copies selected rows as JSON', async ({ page, pageObjects }) => {
      const { dataGrid } = pageObjects;

      await dataGrid.selectRow(2);
      await dataGrid.selectRow(1);

      await expect.poll(() => dataGrid.isSelectedRowsMenuVisible()).toBe(true);
      await expect.poll(() => dataGrid.getNumberOfSelectedRowsOnCurrentPage()).toBe(2);
      await expect.poll(() => dataGrid.getNumberOfSelectedRows()).toBe(2);

      await dataGrid.openSelectedRowsMenu();
      await clickSelectedRowsMenuAction(page, 'dscGridCopySelectedDocumentsJSON');

      const clipboardData = await readClipboard(page);
      expect(
        clipboardData.startsWith(EXPECTED_SELECTED_ROWS_JSON_PREFIX),
        `copied selected rows JSON "${clipboardData}" should start with the expected row data`
      ).toBe(true);
    });

    spaceTest('copies selected rows as tabular text', async ({ page, pageObjects }) => {
      const clipboardData = await copySelectedRowsAsText({
        actionTestSubj: 'unifiedDataTableCopyRowsAsText',
        page,
        pageObjects,
      });

      expect(
        clipboardData.startsWith(EXPECTED_SELECTED_ROWS_TEXT_PREFIX),
        `copied selected rows tabular text "${clipboardData}" should start with the expected data`
      ).toBe(true);
    });

    spaceTest('copies selected rows as Markdown text', async ({ page, pageObjects }) => {
      const clipboardData = await copySelectedRowsAsText({
        actionTestSubj: 'unifiedDataTableCopyRowsAsMarkdown',
        page,
        pageObjects,
      });

      expect(
        clipboardData.startsWith(EXPECTED_SELECTED_ROWS_MARKDOWN_PREFIX),
        `copied selected rows Markdown text "${clipboardData}" should start with the expected data`
      ).toBe(true);
    });

    spaceTest(
      'copies visible columns for selected rows as tabular text',
      async ({ page, pageObjects }) => {
        const clipboardData = await copyVisibleColumnsForSelectedRowsAsText({
          actionTestSubj: 'unifiedDataTableCopyRowsAsText',
          page,
          pageObjects,
        });

        expect(
          clipboardData,
          `copied selected columns tabular text "${clipboardData}" should equal the expected data`
        ).toBe(EXPECTED_SELECTED_COLUMNS_TEXT);
      }
    );

    spaceTest(
      'copies visible columns for selected rows as Markdown text',
      async ({ page, pageObjects }) => {
        const clipboardData = await copyVisibleColumnsForSelectedRowsAsText({
          actionTestSubj: 'unifiedDataTableCopyRowsAsMarkdown',
          page,
          pageObjects,
        });

        expect(
          clipboardData,
          `copied selected columns Markdown text "${clipboardData}" should equal the expected data`
        ).toBe(EXPECTED_SELECTED_COLUMNS_MARKDOWN);
      }
    );
  }
);
