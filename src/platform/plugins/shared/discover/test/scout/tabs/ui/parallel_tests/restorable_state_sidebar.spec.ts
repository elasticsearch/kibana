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

spaceTest.describe(
  'Discover tabs - restorable sidebar state',
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

    spaceTest('restores sidebar collapsible state per tab', async ({ pageObjects }) => {
      const { discover, unifiedTabs } = pageObjects;

      expect(await discover.isSidebarPanelOpen()).toBe(true);

      await discover.createNewTabAndSearch();
      expect(await discover.isSidebarPanelOpen()).toBe(true);

      await discover.closeSidebar();
      expect(await discover.isSidebarPanelOpen()).toBe(false);

      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();
      expect(await discover.isSidebarPanelOpen()).toBe(true);

      await unifiedTabs.selectTab(1);
      await discover.waitUntilTabIsLoaded();
      expect(await discover.isSidebarPanelOpen()).toBe(false);
    });

    spaceTest('restores sidebar width per tab', async ({ pageObjects }) => {
      const { discover, unifiedTabs } = pageObjects;
      const initialWidth = await discover.getSidebarWidth();

      await discover.createNewTabAndSearch();
      expect(await discover.getSidebarWidth()).toBe(initialWidth);

      await discover.resizeSidebarBy(100);
      const updatedWidth = await discover.getSidebarWidth();
      expect(updatedWidth).toBeGreaterThan(initialWidth);

      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();
      expect(await discover.getSidebarWidth()).toBe(initialWidth);

      await unifiedTabs.selectTab(1);
      await discover.waitUntilTabIsLoaded();
      expect(await discover.getSidebarWidth()).toBe(updatedWidth);
    });

    spaceTest('restores sidebar field filters per tab', async ({ pageObjects }) => {
      const { discover, unifiedFieldList, unifiedTabs } = pageObjects;
      const initialCount = 49;

      await unifiedFieldList.expectAvailableFieldCount(initialCount);

      await discover.createNewTabAndSearch();
      await unifiedFieldList.expectAvailableFieldCount(initialCount);
      await unifiedFieldList.searchField('i');
      await unifiedFieldList.expectAvailableFieldCount(29);

      await discover.createNewTabAndSearch();
      await unifiedFieldList.expectAvailableFieldCount(initialCount);
      await unifiedFieldList.searchField('e');
      await unifiedFieldList.expectAvailableFieldCount(43);
      await unifiedFieldList.openFieldTypeFilter();
      await unifiedFieldList.selectFieldTypeFilter('number');
      await unifiedFieldList.closeFieldTypeFilter();
      await unifiedFieldList.expectAvailableFieldCount(5);

      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();
      await unifiedFieldList.expectAvailableFieldCount(initialCount);

      await unifiedTabs.selectTab(1);
      await discover.waitUntilTabIsLoaded();
      await unifiedFieldList.expectAvailableFieldCount(29);

      await unifiedTabs.selectTab(2);
      await discover.waitUntilTabIsLoaded();
      await unifiedFieldList.expectAvailableFieldCount(5);

      await unifiedFieldList.clearFieldSearch();
      await unifiedFieldList.clearFieldTypeFilters();
      await unifiedFieldList.expectAvailableFieldCount(initialCount);
    });
  }
);
