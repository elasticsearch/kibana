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

const DOC_VIEWER_SOURCE_TAB_ID = 'doc_view_source';
const DOC_VIEWER_TABLE_TAB_ID = 'doc_view_table';
const ESE_SEARCH_ENDPOINT = '/internal/search/ese';

const openSourceDocViewer = async (
  { discover, docViewer }: DiscoverPageObjects,
  rowIndex: number
) => {
  await docViewer.openAndWaitForFlyout({ rowIndex });
  expect(await discover.isShowingDocViewer()).toBe(true);
  await docViewer.openTab(DOC_VIEWER_SOURCE_TAB_ID);
  await docViewer.readJsonFromCodeEditor();
};

const openTableDocViewer = async (
  { discover, docViewer }: DiscoverPageObjects,
  rowIndex: number
) => {
  await docViewer.openAndWaitForFlyout({ rowIndex });
  expect(await discover.isShowingDocViewer()).toBe(true);
  await docViewer.openTab(DOC_VIEWER_TABLE_TAB_ID);
  await docViewer.getTab(DOC_VIEWER_TABLE_TAB_ID).waitFor({ state: 'visible' });
};

spaceTest.describe(
  'Discover tabs - restorable DocViewer source state',
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

    spaceTest('restores hide-null-values state for ES|QL tab', async ({ page, pageObjects }) => {
      const { discover, docViewer, unifiedTabs } = pageObjects;

      await discover.selectTextBaseLang();
      await discover.waitUntilTabIsLoaded();
      await openTableDocViewer(pageObjects, 0);

      const hideNullValuesSwitch = page.testSubj.locator('unifiedDocViewerHideNullValuesSwitch');
      await expect(hideNullValuesSwitch).toHaveAttribute('aria-checked', 'false');

      await discover.createNewTabAndSearch();
      await openTableDocViewer(pageObjects, 0);
      await expect(hideNullValuesSwitch).toHaveAttribute('aria-checked', 'false');
      await hideNullValuesSwitch.click();
      await expect(hideNullValuesSwitch).toHaveAttribute('aria-checked', 'true');

      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();
      await expect(docViewer.getFlyout()).toBeVisible();
      await expect(hideNullValuesSwitch).toHaveAttribute('aria-checked', 'false');
    });

    spaceTest(
      'restores JSON source content without refetching',
      async ({ network, pageObjects }) => {
        const { discover, docViewer, unifiedTabs } = pageObjects;

        await openSourceDocViewer(pageObjects, 0);
        const originalJsonContent = await docViewer.getJsonCodeEditorValue();

        await discover.createNewTabAndSearch();
        await openSourceDocViewer(pageObjects, 1);
        const tab2JsonContent = await docViewer.getJsonCodeEditorValue();
        expect(tab2JsonContent).not.toStrictEqual(originalJsonContent);

        expect(
          await network.countMatchingRequests({ endpoint: ESE_SEARCH_ENDPOINT }, async () => {
            await unifiedTabs.selectTab(0);
            await discover.waitUntilTabIsLoaded();
          })
        ).toBe(0);
        expect(await docViewer.getJsonCodeEditorValue()).toBe(originalJsonContent);

        expect(
          await network.countMatchingRequests({ endpoint: ESE_SEARCH_ENDPOINT }, async () => {
            await unifiedTabs.selectTab(1);
            await discover.waitUntilTabIsLoaded();
          })
        ).toBe(0);
        expect(await docViewer.getJsonCodeEditorValue()).toBe(tab2JsonContent);
      }
    );

    spaceTest('restores source viewer scroll position per tab', async ({ pageObjects }) => {
      const { discover, docViewer, unifiedTabs } = pageObjects;
      const scrollAmount = 200;

      await openSourceDocViewer(pageObjects, 0);
      await discover.codeEditor.setScrollTop(scrollAmount);
      const tab1ScrollTop = await discover.codeEditor.getScrollTop();
      expect(tab1ScrollTop).toBeGreaterThanOrEqual(scrollAmount);

      await discover.createNewTabAndSearch();
      await openSourceDocViewer(pageObjects, 0);
      expect(await discover.codeEditor.getScrollTop()).toBe(0);

      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();
      await expect(docViewer.getFlyout()).toBeVisible();
      expect(await discover.codeEditor.getScrollTop()).toBe(tab1ScrollTop);
    });
  }
);
