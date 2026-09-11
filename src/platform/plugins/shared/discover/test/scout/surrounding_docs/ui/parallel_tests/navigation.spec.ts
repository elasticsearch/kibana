/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest } from '../fixtures';

const FIRST_TAB_LABEL = 'Untitled';
const SECOND_TAB_LABEL = 'testing';
const THIRD_TAB_LABEL = 'third tab';
const SAVED_SEARCH_TITLE = 'A Saved Search';

spaceTest.describe('Discover tabs - navigation', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.setupDiscoverDefaults();
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.discover.goto({ queryMode: 'classic' });
    await pageObjects.discover.waitUntilTabIsLoaded();
  });

  spaceTest.afterAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.teardownDiscoverDefaults();
  });

  spaceTest(
    'goes back to the last active tab when returning from Surrounding Docs page',
    async ({ page, pageObjects }) => {
      const { contextPage, discover, docViewer, filterBar, unifiedTabs } = pageObjects;

      await discover.loadSavedSearch(SAVED_SEARCH_TITLE);
      await discover.waitUntilTabIsLoaded();
      expect(await discover.getHitCountInt()).toBe(14_004);
      expect(await discover.getCurrentQueryName()).toBe(SAVED_SEARCH_TITLE);

      await discover.createNewTabAndSearch();
      await unifiedTabs.editTabLabel(1, SECOND_TAB_LABEL);
      await filterBar.addFilter({ field: 'extension', operator: 'is', value: 'jpg' });
      // Close the filter tooltip; it can overlap the tabs and block clicks.
      await page.keyboard.press('Escape');
      await discover.waitUntilTabIsLoaded();

      expect(await discover.getHitCountInt()).toBe(9_109);
      expect(await unifiedTabs.getTabLabels()).toStrictEqual([FIRST_TAB_LABEL, SECOND_TAB_LABEL]);

      // Re-select the active tab to ensure tooltips do not block further clicks.
      await unifiedTabs.selectTab(1);
      await discover.createNewTabAndSearch();
      await unifiedTabs.editTabLabel(2, THIRD_TAB_LABEL);
      await filterBar.addFilter({ field: 'extension', operator: 'is', value: 'png' });
      // Close the filter tooltip; it can overlap the tabs and block clicks.
      await page.keyboard.press('Escape');
      await discover.waitUntilTabIsLoaded();

      expect(await discover.getHitCountInt()).toBe(1_373);
      expect(await unifiedTabs.getTabLabels()).toStrictEqual([
        FIRST_TAB_LABEL,
        SECOND_TAB_LABEL,
        THIRD_TAB_LABEL,
      ]);

      await unifiedTabs.selectTab(1);
      await discover.waitUntilTabIsLoaded();
      await docViewer.openSurroundingDocuments(0);
      await page.waitForURL(/#\/context/);
      expect(await filterBar.hasFilter({ field: 'extension', value: 'jpg' })).toBe(true);

      await contextPage.goBackToDiscover();
      await discover.waitUntilTabIsLoaded();

      expect(await discover.getHitCountInt()).toBe(9_109);
      expect(await unifiedTabs.getTabLabels()).toStrictEqual([
        FIRST_TAB_LABEL,
        SECOND_TAB_LABEL,
        THIRD_TAB_LABEL,
      ]);
      expect(await filterBar.hasFilter({ field: 'extension', value: 'jpg' })).toBe(true);
      expect(await unifiedTabs.getSelectedTabLabel()).toBe(SECOND_TAB_LABEL);
      expect(await discover.getCurrentQueryName()).toBe(SAVED_SEARCH_TITLE);
    }
  );

  spaceTest(
    'returns to the last active tab from Single Doc page',
    async ({ page, pageObjects }) => {
      const { contextPage, discover, docViewer, filterBar, unifiedTabs } = pageObjects;

      await discover.createNewTabAndSearch();
      await unifiedTabs.editTabLabel(1, SECOND_TAB_LABEL);
      await filterBar.addFilter({ field: 'extension', operator: 'is', value: 'jpg' });
      await discover.waitUntilTabIsLoaded();

      expect(await discover.getHitCountInt()).toBe(9_109);
      expect(await unifiedTabs.getTabLabels()).toStrictEqual([FIRST_TAB_LABEL, SECOND_TAB_LABEL]);

      await docViewer.openSingleDocument(0);
      await page.waitForURL(/#\/doc/);
      await expect(page.testSubj.locator('doc-hit')).toBeVisible();

      await contextPage.goBackToDiscover();
      await discover.waitUntilTabIsLoaded();

      expect(await discover.getHitCountInt()).toBe(9_109);
      expect(await unifiedTabs.getTabLabels()).toStrictEqual([FIRST_TAB_LABEL, SECOND_TAB_LABEL]);
      expect(await filterBar.hasFilter({ field: 'extension', value: 'jpg' })).toBe(true);
      expect(await unifiedTabs.getSelectedTabLabel()).toBe(SECOND_TAB_LABEL);
      await expect(page.testSubj.locator('breadcrumb first last')).toHaveCount(1);
    }
  );

  spaceTest(
    'restores the latest tabs when returning via app navigation',
    async ({ page, pageObjects }) => {
      const { collapsibleNav, discover, queryBar, unifiedTabs } = pageObjects;
      const queryKql = 'response:200';
      const queryEsql = 'FROM logstash-* | LIMIT 11';

      await unifiedTabs.editTabLabel(0, 'kql');
      await discover.writeAndSubmitKqlQuery(queryKql);
      await discover.waitUntilTabIsLoaded();

      expect(await discover.getHitCountInt()).toBe(12_891);
      expect(await unifiedTabs.getTabLabels()).toStrictEqual(['kql']);

      await unifiedTabs.createNewTab();
      await discover.writeAndSubmitEsqlQuery(queryEsql);
      await unifiedTabs.editTabLabel(1, 'esql');
      await discover.waitUntilTabIsLoaded();

      expect(await discover.getHitCountInt()).toBe(11);
      expect(await unifiedTabs.getTabLabels()).toStrictEqual(['kql', 'esql']);

      // goto() opens app from a fresh app URL, which bypasses the chrome navigation which we want to test here
      await collapsibleNav.clickItem('Dashboards');
      await expect(page.testSubj.locator('dashboardLandingPage')).toBeVisible();

      // goto() opens app from a fresh app URL, which bypasses the chrome navigation which we want to test here
      await collapsibleNav.clickItem('Discover');
      await discover.waitUntilTabIsLoaded();

      expect(await discover.getHitCountInt()).toBe(11);
      expect(await unifiedTabs.getTabLabels()).toStrictEqual(['kql', 'esql']);
      expect(await unifiedTabs.getSelectedTabLabel()).toBe('esql');
      expect(await discover.getEsqlQueryValue()).toBe(queryEsql);

      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();

      expect(await discover.getHitCountInt()).toBe(12_891);
      expect(await unifiedTabs.getSelectedTabLabel()).toBe('kql');
      expect(await queryBar.getQuery()).toBe(queryKql);
    }
  );
});
