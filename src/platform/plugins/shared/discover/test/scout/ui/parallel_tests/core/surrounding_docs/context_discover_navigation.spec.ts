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
import {
  spaceTest,
  testData,
  addFilters,
  loginAndGoToDiscover,
  navigateToFirstDocContext,
} from '../../../fixtures/surrounding_docs';

const TEST_COLUMN_NAMES = ['@message'];
const TEST_FILTER_COLUMN_NAMES: Array<[string, string]> = [
  ['extension.raw', 'jpg'],
  ['geo.src', 'IN'],
];

spaceTest.describe(
  'Discover context - navigation from Discover',
  { tag: tags.deploymentAgnostic },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.load(testData.KBN_ARCHIVE_VISUALIZE);
      await scoutSpace.uiSettings.setDefaultIndex(testData.LOGSTASH_DATA_VIEW);
      await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest(
      'should open context view with the same columns',
      async ({ page, pageObjects, browserAuth }) => {
        await loginAndGoToDiscover({ browserAuth, pageObjects });
        for (const columnName of TEST_COLUMN_NAMES) {
          await page.testSubj.fill('fieldListFiltersFieldSearch', columnName);
          await page.testSubj.click(`fieldToggle-${columnName}`);
        }
        await pageObjects.discover.waitUntilSearchingHasFinished();

        await navigateToFirstDocContext(pageObjects);

        const headerColumns = await pageObjects.discover.getDocHeader();
        expect(headerColumns).toStrictEqual(['@timestamp', ...TEST_COLUMN_NAMES]);
      }
    );

    spaceTest(
      'should open context view with selected document as anchor and allow selecting next anchor',
      async ({ pageObjects, browserAuth }) => {
        await loginAndGoToDiscover({ browserAuth, pageObjects });
        const discoverRows = await pageObjects.discover.getDataGridRows();
        const firstTimestamp = discoverRows[0][0];

        await spaceTest.step('verify initial anchor matches selected document', async () => {
          await navigateToFirstDocContext(pageObjects);

          const anchorData = await pageObjects.contextPage.getAnchorRowData();
          expect(anchorData[0]).toBe(firstTimestamp);
        });

        await spaceTest.step('select next anchor from context view', async () => {
          const surroundingRows = await pageObjects.discover.getDataGridRows();
          const firstSurroundingTimestamp = surroundingRows[0][0];

          await pageObjects.contextPage.viewSurroundingDocs(0);

          const anchorData = await pageObjects.contextPage.getAnchorRowData();
          expect(anchorData[0]).toBe(firstSurroundingTimestamp);
        });
      }
    );

    spaceTest(
      'should open context view with filters disabled',
      async ({ page, pageObjects, browserAuth }) => {
        await loginAndGoToDiscover({ browserAuth, pageObjects });
        await addFilters(page, TEST_FILTER_COLUMN_NAMES);
        await pageObjects.discover.waitUntilSearchingHasFinished();

        await navigateToFirstDocContext(pageObjects);

        for (const [field, value] of TEST_FILTER_COLUMN_NAMES) {
          expect(await pageObjects.filterBar.hasFilter({ field, value, enabled: false })).toBe(
            true
          );
        }
      }
    );

    spaceTest(
      'should navigate to doc view and back to discover',
      async ({ page, pageObjects, browserAuth }) => {
        await loginAndGoToDiscover({ browserAuth, pageObjects });
        await navigateToFirstDocContext(pageObjects);

        await pageObjects.contextPage.viewSingleDocument(0);
        await pageObjects.contextPage.goBackToDiscover();
        await expect(page).toHaveURL(/app\/discover#/);
      }
    );

    spaceTest(
      'should navigate to doc view from embeddable',
      async ({ browserAuth, page, pageObjects }) => {
        await browserAuth.loginAsPrivilegedUser();
        await pageObjects.discover.goto({ queryMode: 'classic' });
        await pageObjects.discover.waitUntilSearchingHasFinished();
        await pageObjects.discover.waitForDocTableRendered();
        const savedSearchName = 'my search';
        await pageObjects.discover.saveSearch(savedSearchName);

        await pageObjects.dashboard.openNewDashboard();
        await pageObjects.dashboard.addSavedSearch(savedSearchName);
        await pageObjects.dashboard.waitForRenderComplete();

        await pageObjects.discover.openDocumentDetails({ rowIndex: 0 });
        await pageObjects.contextPage.clickRowAction(0);

        // dashboard may prompt "unsaved changes" confirmation on navigation
        await page.testSubj
          .locator('confirmModalConfirmButton')
          .click({ timeout: 3_000 })
          .catch(() => {});

        await expect(page).toHaveURL(/#\/doc/, { timeout: 30_000 });
        expect(await pageObjects.discover.isShowingDocViewer()).toBe(true);
      }
    );
  }
);
