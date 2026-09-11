/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest, type DiscoverPageObjects } from '../fixtures';

const DOC_VIEWER_TABLE_TAB_ID = 'doc_view_table';

const openTableDocViewer = async ({ discover, docViewer }: DiscoverPageObjects) => {
  await docViewer.openAndWaitForFlyout({ rowIndex: 0 });
  expect(await discover.isShowingDocViewer()).toBe(true);
  await docViewer.openTab(DOC_VIEWER_TABLE_TAB_ID);
  await docViewer.getFlyout().waitFor({ state: 'visible' });
};

spaceTest.describe(
  'Discover tabs - restorable DocViewer table state',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
      await discoverScoutSpace.setupDiscoverDefaults();
    });

    spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginAsViewer();
      await pageObjects.discover.goto({ queryMode: 'classic' });
      await pageObjects.discover.waitUntilTabIsLoaded();
    });

    spaceTest.afterAll(async ({ discoverScoutSpace }) => {
      await discoverScoutSpace.teardownDiscoverDefaults();
    });

    spaceTest(
      'restores DocViewer field search and pinned fields per tab',
      async ({ pageObjects }) => {
        const { discover, docViewer, unifiedTabs } = pageObjects;

        await spaceTest.step('tab 0: search fields and pin geo.src', async () => {
          await openTableDocViewer(pageObjects);
          await docViewer.findFieldByNameOrValue('geo');
          await expect(docViewer.getFieldNames()).toHaveCount(4);

          await docViewer.togglePinAction('geo.src');
          expect(await docViewer.isFieldPinned('geo.src')).toBe(true);
        });

        await spaceTest.step('tab 1: search fields and pin geo.srcdest', async () => {
          await discover.createNewTabAndSearch();
          await openTableDocViewer(pageObjects);
          await docViewer.findFieldByNameOrValue('.sr');
          await expect(docViewer.getFieldNames()).toHaveCount(2);

          await docViewer.togglePinAction('geo.src');
          await docViewer.togglePinAction('geo.srcdest');
          expect(await docViewer.isFieldPinned('geo.src')).toBe(false);
          expect(await docViewer.isFieldPinned('geo.srcdest')).toBe(true);
        });

        await spaceTest.step(
          'return to tab 0 and restore its field search and pinned field',
          async () => {
            await unifiedTabs.selectTab(0);
            await discover.waitUntilTabIsLoaded();
            await expect(docViewer.getFlyout()).toBeVisible();
            expect(await docViewer.getFieldSearchValue()).toBe('geo');
            expect(await docViewer.getFieldNameCount()).toBe(4);
            expect(await docViewer.isFieldPinned('geo.src')).toBe(true);
          }
        );
      }
    );

    spaceTest(
      'restores DocViewer field type filters and selected-only state per tab',
      async ({ page, pageObjects }) => {
        const { discover, docViewer, unifiedFieldList, unifiedTabs } = pageObjects;

        await spaceTest.step('tab 0: filter date fields and add utc_time to the grid', async () => {
          await openTableDocViewer(pageObjects);
          await docViewer.openFieldTypeFilter();
          await page.testSubj.locator('typeFilter-date').click();
          await expect(page.testSubj.locator('typeFilter-date')).toHaveAttribute(
            'aria-checked',
            'true'
          );
          await docViewer.closeFieldTypeFilter();
          await docViewer.expectFieldTypeFilterCount('1');

          await unifiedFieldList.clickFieldListItemAdd('utc_time');
          await discover.waitUntilTabIsLoaded();
          await docViewer.expectShowOnlySelectedFields(false);
        });

        await spaceTest.step(
          'tab 1: filter number fields and enable selected-only mode',
          async () => {
            await discover.createNewTabAndSearch();
            await openTableDocViewer(pageObjects);
            await docViewer.openFieldTypeFilter();
            await page.testSubj.locator('typeFilter-number').click();
            await expect(page.testSubj.locator('typeFilter-number')).toHaveAttribute(
              'aria-checked',
              'true'
            );
            await docViewer.closeFieldTypeFilter();
            await docViewer.expectFieldTypeFilterCount('2');

            await unifiedFieldList.clickFieldListItemAdd('utc_time');
            await discover.waitUntilTabIsLoaded();
            await docViewer.expectShowOnlySelectedFields(false);
            await docViewer.clickShowOnlySelectedFieldsSwitch();
            await docViewer.expectShowOnlySelectedFields(true);
          }
        );

        await spaceTest.step('return to tab 0 and restore its field filters', async () => {
          await unifiedTabs.selectTab(0);
          await discover.waitUntilTabIsLoaded();
          await expect(docViewer.getFlyout()).toBeVisible();
          await docViewer.expectFieldTypeFilterCount('1');
          await docViewer.expectShowOnlySelectedFields(false);
        });
      }
    );
  }
);
