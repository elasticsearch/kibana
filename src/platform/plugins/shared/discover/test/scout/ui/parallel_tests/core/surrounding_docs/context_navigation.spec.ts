/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import type { ContextTestFixtures } from '../../../fixtures/surrounding_docs';
import {
  spaceTest,
  testData,
  addFilters,
  loginAndGoToDiscover,
  navigateToFirstDocContext,
} from '../../../fixtures/surrounding_docs';

const TEST_FILTER_COLUMN_NAMES: Array<[string, string]> = [
  [
    'agent',
    'Mozilla/5.0 (X11; Linux i686) AppleWebKit/534.24 (KHTML, like Gecko) Chrome/11.0.696.50 Safari/534.24',
  ],
  ['extension', 'jpg'],
];

const checkMainViewFilters = async (pageObjects: ContextTestFixtures['pageObjects']) => {
  for (const [field, value] of TEST_FILTER_COLUMN_NAMES) {
    expect(await pageObjects.filterBar.hasFilter({ field, value, enabled: true })).toBe(true);
  }
  const timeRange = await pageObjects.datePicker.getTimeConfig();
  expect(timeRange.start).toContain('2015-09-19');
  expect(timeRange.end).toContain('2015-09-23');
};

spaceTest.describe('Discover context - back navigation', { tag: tags.deploymentAgnostic }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.KBN_ARCHIVE_VISUALIZE);
    await scoutSpace.uiSettings.setDefaultIndex(testData.LOGSTASH_DATA_VIEW);
    await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
  });

  let initialHitCount: number;

  spaceTest.beforeEach(async ({ browserAuth, page, pageObjects }) => {
    await loginAndGoToDiscover({ browserAuth, pageObjects });

    await addFilters(page, TEST_FILTER_COLUMN_NAMES);
    await pageObjects.discover.waitUntilSearchingHasFinished();

    initialHitCount = await pageObjects.discover.getHitCountInt();

    await navigateToFirstDocContext(pageObjects);
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('should go back after loading more in context view', async ({ page, pageObjects }) => {
    await pageObjects.contextPage.clickSuccessorLoadMoreButton();
    await pageObjects.contextPage.clickSuccessorLoadMoreButton();
    await pageObjects.contextPage.clickSuccessorLoadMoreButton();

    await page.goBack();
    await pageObjects.discover.waitUntilSearchingHasFinished();
    await pageObjects.discover.waitForDocTableRendered();

    const hitCount = await pageObjects.discover.getHitCountInt();
    expect(hitCount).toBe(initialHitCount);
  });

  spaceTest('should go back via breadcrumbs with preserved state', async ({ pageObjects }) => {
    await pageObjects.contextPage.goBackToDiscover();
    await checkMainViewFilters(pageObjects);
  });

  spaceTest(
    'should go back via breadcrumbs with preserved state after page refresh',
    async ({ page, pageObjects }) => {
      await page.reload();
      await pageObjects.contextPage.waitUntilContextLoadingHasFinished();

      await pageObjects.contextPage.goBackToDiscover();
      await checkMainViewFilters(pageObjects);
    }
  );

  spaceTest(
    'should preserve state when navigating back after URL state changes',
    async ({ page, pageObjects }) => {
      await spaceTest.step('remove a filter in context view to change URL state', async () => {
        await pageObjects.filterBar.removeFilter('agent');
        await pageObjects.contextPage.waitUntilContextLoadingHasFinished();
      });

      await spaceTest.step(
        'navigate to discover via breadcrumbs and verify original filters',
        async () => {
          await pageObjects.contextPage.goBackToDiscover();

          expect(await pageObjects.filterBar.getFilterCount()).toBe(2);
          await checkMainViewFilters(pageObjects);
        }
      );

      await spaceTest.step('go back to context and verify modified filter state', async () => {
        await page.goBack();
        await pageObjects.contextPage.waitUntilContextLoadingHasFinished();

        expect(await pageObjects.filterBar.getFilterCount()).toBe(1);
        const [, extensionValue] = TEST_FILTER_COLUMN_NAMES[1];
        expect(
          await pageObjects.filterBar.hasFilter({
            field: 'extension',
            value: extensionValue,
            enabled: false,
          })
        ).toBe(true);
      });

      await spaceTest.step(
        'return to discover and verify original filters are restored',
        async () => {
          await pageObjects.contextPage.goBackToDiscover();

          expect(await pageObjects.filterBar.getFilterCount()).toBe(2);
          await checkMainViewFilters(pageObjects);
        }
      );
    }
  );
});
