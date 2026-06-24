/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Data-grid footer and sorting behavior for date_nanos data views.
 */

import type { ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest } from '@kbn/scout';

const DATE_NANOS_KBN_ARCHIVE = 'src/platform/test/functional/fixtures/kbn_archiver/date_nanos';
const DATE_NANOS_DATA_VIEW = 'date-nanos';
const DATE_NANOS_TIME_RANGE = {
  from: '2015-09-10T00:00:00.000Z',
  to: '2019-09-30T00:00:00.000Z',
};

const expectFooterText = async (page: ScoutPage, documentCount: string) => {
  await expect(footerLocator(page)).toHaveText(
    new RegExp(`Search results are limited to ${documentCount} documents\\.\\s*Load more`)
  );
};

const footerLocator = (page: ScoutPage) => page.testSubj.locator('unifiedDataTableFooter');

const getRowsText = async (page: ScoutPage): Promise<string[]> =>
  page
    .locator('[data-test-subj="discoverDocTable"] .euiDataGridRow[data-grid-row-index]')
    .evaluateAll((rows) =>
      rows.map((row) => {
        const getCellText = (columnId: string) =>
          row
            .querySelector(`[data-gridcell-column-id="${columnId}"] .unifiedDataTable__cellValue`)
            ?.textContent?.trim() ?? '';

        return `${getCellText('@timestamp')}${getCellText('_id')}`;
      })
    );

spaceTest.describe(
  'Discover data grid footer - date nanos',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.load(DATE_NANOS_KBN_ARCHIVE);
      await scoutSpace.uiSettings.setDefaultIndex(DATE_NANOS_DATA_VIEW);
      await scoutSpace.uiSettings.setDefaultTime(DATE_NANOS_TIME_RANGE);
      // Small sample/page sizes so pagination + "Load more" can be exercised quickly.
      await scoutSpace.uiSettings.set({
        'discover:sampleSize': 4,
        'discover:sampleRowsPerPage': 2,
      });
    });

    spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginAsViewer();
      await pageObjects.discover.setQueryMode('classic');
      await pageObjects.discover.goto();
      await pageObjects.dataGrid.waitUntilSearchingHasFinished();
      await pageObjects.dataGrid.waitForDocTableRendered();
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset(
        'defaultIndex',
        'timepicker:timeDefaults',
        'discover:sampleSize',
        'discover:sampleRowsPerPage'
      );
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest('works for date nanos too', async ({ page, pageObjects }) => {
      const footer = footerLocator(page);
      const loadMore = page.testSubj.locator('dscGridSampleSizeFetchMoreLink');

      await pageObjects.dataGrid.expandMetaFieldsSection();
      await pageObjects.dataGrid.addFieldFromSidebar('_id');
      await pageObjects.dataGrid.waitUntilSearchingHasFinished();

      await expect
        .poll(() => getRowsText(page))
        .toStrictEqual([
          'Sep 22, 2019 @ 23:50:13.253123345AU_x3-TaGFA8no6QjiSJ',
          'Sep 18, 2019 @ 06:50:13.000000104AU_x3-TaGFA8no6Qjis104Z',
        ]);

      // Footer is not shown on the first page.
      await expect(footer).toBeHidden();

      // Last page of the current sample (4 docs).
      await page.testSubj.click('pagination-button-1');
      await expect(footer).toBeVisible();
      await expectFooterText(page, '4');
      await expect
        .poll(() => getRowsText(page))
        .toStrictEqual([
          'Sep 18, 2019 @ 06:50:13.000000103BU_x3-TaGFA8no6Qjis103Z',
          'Sep 18, 2019 @ 06:50:13.000000102AU_x3-TaGFA8no6Qji102Z',
        ]);
      // No page beyond the last one yet.
      await expect(page.testSubj.locator('pagination-button-2')).toBeHidden();

      await loadMore.click();
      await pageObjects.dataGrid.waitUntilSearchingHasFinished();
      await expect(footer).toBeHidden();

      await page.testSubj.click('pagination-button-3');
      await expect(footer).toBeVisible();
      await expectFooterText(page, '8');
      await expect
        .poll(() => getRowsText(page))
        .toStrictEqual([
          'Sep 18, 2019 @ 06:50:13.000000000CU_x3-TaGFA8no6QjiSX000Z',
          'Sep 18, 2019 @ 06:50:12.999999999AU_x3-TaGFA8no6Qj999Z',
        ]);

      await loadMore.click();
      await pageObjects.dataGrid.waitUntilSearchingHasFinished();
      await expect(footer).toBeHidden();

      // Final page holds the last remaining document and shows no footer.
      await page.testSubj.click('pagination-button-4');
      await expect(footer).toBeHidden();
      await expect
        .poll(() => getRowsText(page))
        .toStrictEqual(['Sep 19, 2015 @ 06:50:13.000100001AU_x3-TaGFA8no000100001Z']);
    });
  }
);
