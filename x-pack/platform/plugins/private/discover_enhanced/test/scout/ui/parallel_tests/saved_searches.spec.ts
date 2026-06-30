/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import { spaceTest, testData } from '../fixtures';
import type { ExtParallelRunTestFixtures } from '../fixtures';

const assertNoFilterAndEmptyQuery = async (
  filterBadge: { field: string; value: string },
  pageObjects: ExtParallelRunTestFixtures['pageObjects'],
  page: ExtParallelRunTestFixtures['page']
) => {
  expect(
    // checking if filter exists, enabled or disabled
    await pageObjects.filterBar.hasFilter(filterBadge),
    `Filter ${JSON.stringify(filterBadge)} should not exist`
  ).toBe(false);
  await expect(
    page.testSubj.locator('queryInput'),
    'Query Bar input field should be empty'
  ).toHaveText('');
};

spaceTest.describe(
  'Discover app - saved searches',
  {
    tag: [
      ...tags.stateful.classic,
      ...tags.serverless.search,
      ...tags.serverless.observability.all,
    ],
  },
  () => {
    // TODO: Update to use an ES archive with an index accessible to 'viewer'
    // for running this test against the Security serverless project.
    const START_TIME = '2019-04-27T23:56:51.374Z';
    const END_TIME = '2019-08-23T16:18:51.821Z';
    const PANEL_NAME = 'Ecommerce Data';
    const SEARCH_QUERY = 'customer_gender:MALE';
    const SAVED_SEARCH_NAME = 'test-unselect-saved-search';
    const filterFieldAndValue = {
      field: 'category',
      value: `Men's Shoes`,
    };

    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.load(testData.KBN_ARCHIVES.DISCOVER);
      await scoutSpace.savedObjects.load(testData.KBN_ARCHIVES.ECOMMERCE);
      await scoutSpace.uiSettings.setDefaultIndex(testData.DATA_VIEW_NAME.ECOMMERCE);
      await scoutSpace.uiSettings.setDefaultTime({ from: START_TIME, to: END_TIME });
    });

    spaceTest.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsPrivilegedUser();
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest('should customize time range on dashboards', async ({ pageObjects, page }) => {
      await pageObjects.dashboard.goto();
      await pageObjects.dashboard.openNewDashboard();
      await pageObjects.dashboard.addPanelFromLibrary(PANEL_NAME);
      await page.testSubj.locator('savedSearchTotalDocuments').waitFor({
        state: 'visible',
      });

      await pageObjects.dashboard.customizePanel({
        name: PANEL_NAME,
        customTimeRageCommonlyUsed: { value: 'Last_90 days' },
      });
      await expect(
        page.testSubj.locator('embeddedSavedSearchDocTable').locator('.euiDataGrid__noResults'),
        'No results message in Saved Search panel should be visible'
      ).toBeVisible();
    });

    spaceTest(
      `should unselect saved search when navigating to a 'new'`,
      async ({ pageObjects, page }) => {
        await pageObjects.discover.goto({ queryMode: 'classic' });
        await expect(pageObjects.discover.getSelectedDataView()).toHaveText(
          testData.DATA_VIEW_NAME.ECOMMERCE
        );
        await pageObjects.filterBar.addFilter({
          ...filterFieldAndValue,
          operator: 'is',
        });
        expect(
          await pageObjects.filterBar.hasFilter({
            ...filterFieldAndValue,
            enabled: true, // Filter is enabled by default
          })
        ).toBe(true);
        await page.testSubj.fill('queryInput', SEARCH_QUERY);
        await page.testSubj.click('querySubmitButton');
        await pageObjects.discover.waitForHistogramRendered();

        await pageObjects.discover.saveSearch(SAVED_SEARCH_NAME);
        await pageObjects.discover.waitForHistogramRendered();

        expect(
          await pageObjects.filterBar.hasFilter({
            ...filterFieldAndValue,
            enabled: true, // Filter is still enabled
          })
        ).toBe(true);
        await expect(page.testSubj.locator('queryInput')).toHaveText(SEARCH_QUERY);

        // create new search
        await pageObjects.discover.clickNewSearch();
        await expect(pageObjects.discover.getSelectedDataView()).toHaveText(
          testData.DATA_VIEW_NAME.ECOMMERCE
        );
        await assertNoFilterAndEmptyQuery(filterFieldAndValue, pageObjects, page);

        // change data view
        await pageObjects.discover.selectDataView(testData.DATA_VIEW_NAME.LOGSTASH);
        await expect(pageObjects.discover.getSelectedDataView()).toHaveText(
          testData.DATA_VIEW_NAME.LOGSTASH
        );
        await assertNoFilterAndEmptyQuery(filterFieldAndValue, pageObjects, page);

        // change data view again
        await pageObjects.discover.selectDataView(testData.DATA_VIEW_NAME.ECOMMERCE);
        await expect(pageObjects.discover.getSelectedDataView()).toHaveText(
          testData.DATA_VIEW_NAME.ECOMMERCE
        );
        await assertNoFilterAndEmptyQuery(filterFieldAndValue, pageObjects, page);

        // create new search again
        await pageObjects.discover.clickNewSearch();
        await expect(pageObjects.discover.getSelectedDataView()).toHaveText(
          testData.DATA_VIEW_NAME.ECOMMERCE
        );
      }
    );
  }
);
