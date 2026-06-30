/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Legacy saved-search save/load flows.
 *
 * Validates that legacy (pre-tabs) saved searches load into a single untitled
 * tab and can be extended with additional tabs and re-saved.
 */

import { spaceTest } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { testData } from '../../fixtures/common';
import { saveDiscoverSession, getHitCount } from '../../fixtures/tabs/helpers';

const LEGACY_SESSION_NAME = 'A Saved Search';
const UPDATED_SESSION_NAME = 'Updated legacy session';

spaceTest.describe('tabs - legacy Discover sessions', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
    await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
    await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsAdmin();
    await pageObjects.discover.goto({ queryMode: 'classic' });
    await pageObjects.discover.waitUntilTabIsLoaded();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest(
    'should load a legacy Discover session into a single untitled tab',
    async ({ pageObjects, page }) => {
      const { discover, unifiedTabs } = pageObjects;

      await discover.loadSavedSearch(LEGACY_SESSION_NAME);
      await discover.waitUntilTabIsLoaded();

      await expect(page.testSubj.locator('breadcrumb last')).toHaveText(LEGACY_SESSION_NAME);
      expect(await unifiedTabs.getTabLabels()).toStrictEqual(['Untitled']);
      expect(await getHitCount(page)).toBe('14,004');
    }
  );

  spaceTest(
    'should allow adding tabs to a legacy session and saving as new',
    async ({ pageObjects, page }) => {
      const { discover, unifiedTabs } = pageObjects;

      await spaceTest.step('load legacy session', async () => {
        await discover.loadSavedSearch(LEGACY_SESSION_NAME);
        await discover.waitUntilTabIsLoaded();
        await expect(page.testSubj.locator('breadcrumb last')).toHaveText(LEGACY_SESSION_NAME);
        expect(await unifiedTabs.getTabLabels()).toStrictEqual(['Untitled']);
      });

      await spaceTest.step('create a second tab', async () => {
        await unifiedTabs.createNewTab();
        await discover.waitUntilTabIsLoaded();
        expect(await unifiedTabs.getTabLabels()).toStrictEqual(['Untitled', 'Untitled 2']);
      });

      await spaceTest.step('save as new session', async () => {
        await saveDiscoverSession(page, UPDATED_SESSION_NAME, { saveAsNew: true });
        await expect(page.testSubj.locator('breadcrumb last')).toHaveText(UPDATED_SESSION_NAME);
        expect(await unifiedTabs.getTabLabels()).toStrictEqual(['Untitled', 'Untitled 2']);
      });

      await spaceTest.step('load legacy session again', async () => {
        await discover.loadSavedSearch(LEGACY_SESSION_NAME);
        await discover.waitUntilTabIsLoaded();
        await expect(page.testSubj.locator('breadcrumb last')).toHaveText(LEGACY_SESSION_NAME);
        expect(await unifiedTabs.getTabLabels()).toStrictEqual(['Untitled']);
      });

      await spaceTest.step('load updated session again', async () => {
        await discover.loadSavedSearch(UPDATED_SESSION_NAME);
        await discover.waitUntilTabIsLoaded();
        await expect(page.testSubj.locator('breadcrumb last')).toHaveText(UPDATED_SESSION_NAME);
        expect(await unifiedTabs.getTabLabels()).toStrictEqual(['Untitled', 'Untitled 2']);
      });
    }
  );
});
