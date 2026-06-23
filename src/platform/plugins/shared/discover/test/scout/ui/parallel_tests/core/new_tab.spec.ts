/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Opening new Discover tabs in classic and ES|QL modes, per-tab state isolation,
 * and stability when many tabs are opened quickly.
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest } from '../../fixtures/common';

spaceTest.describe('Discover tabs - opening a new tab', { tag: '@local-stateful-classic' }, () => {
  spaceTest.use({ viewport: { width: 1920, height: 1080 } });

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

  spaceTest('should create a new tab in classic mode', async ({ pageObjects }) => {
    const { discover, filterBar, queryBar, unifiedTabs } = pageObjects;
    const KQL_QUERY = 'machine.os: "macOS"';

    // tab 0 - created automatically with the default data view

    await spaceTest.step(
      'tab 1: create a new tab, create another data view from search bar, set query and filter',
      async () => {
        await unifiedTabs.createNewTab();
        await discover.waitUntilTabIsLoaded();

        await discover.createDataViewFromSearchBar({ name: 'logsta' });
        await discover.waitUntilTabIsLoaded();

        await filterBar.addFilter({ field: 'extension', operator: 'is', value: 'jpeg' });
        await discover.writeAndSubmitKqlQuery(KQL_QUERY);
        await discover.waitUntilTabIsLoaded();
      }
    );

    await spaceTest.step('tab 2: create another new tab in ES|QL mode', async () => {
      await unifiedTabs.createNewTab();
      await discover.waitUntilTabIsLoaded();
      await discover.selectTextBaseLang();
      await discover.waitUntilTabIsLoaded();
      expect(await discover.getEsqlQueryValue()).toBe('FROM logsta*');
    });

    await spaceTest.step(
      'switching tabs restores each tab data view, query and filters',
      async () => {
        await unifiedTabs.selectTab(0);
        await discover.waitUntilTabIsLoaded();
        expect(await discover.getSelectedDataViewName()).toBe('logstash-*');
        expect(await queryBar.getQuery()).toBe('');
        expect(await filterBar.getFilterCount()).toBe(0);

        await unifiedTabs.selectTab(1);
        await discover.waitUntilTabIsLoaded();
        expect(await discover.getSelectedDataViewName()).toBe('logsta*');
        expect(await queryBar.getQuery()).toBe(KQL_QUERY);
        expect(await filterBar.getFilterCount()).toBe(1);
      }
    );

    await spaceTest.step(
      'a new tab inherits the active data view with an empty query and no filters',
      async () => {
        await unifiedTabs.createNewTab();
        await discover.waitUntilTabIsLoaded();
        expect(await discover.getSelectedDataViewName()).toBe('logsta*');
        expect(await queryBar.getQuery()).toBe('');
        expect(await filterBar.getFilterCount()).toBe(0);
      }
    );
  });

  spaceTest('should create a new tab in ES|QL mode', async ({ pageObjects }) => {
    const { discover, unifiedTabs } = pageObjects;
    const defaultQuery = 'FROM logst*';
    const updatedQuery = 'FROM logst* | LIMIT 1050';

    // tab 0 - created automatically with the default data view

    await spaceTest.step('tab 0: create an ad hoc data view from the search bar', async () => {
      expect(await discover.getCurrentQueryMode()).toBe('classic');
      await discover.createDataViewFromSearchBar({ name: 'logst' });
    });

    await spaceTest.step(
      'tab 1: new ES|QL tab defaults to FROM logst* and accepts an edited query',
      async () => {
        await unifiedTabs.createNewTab();
        await discover.waitUntilTabIsLoaded();
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        expect(await discover.getEsqlQueryValue()).toBe(defaultQuery);

        await discover.codeEditor.setCodeEditorValue(updatedQuery);
        await discover.submitQuery();
        await discover.waitUntilTabIsLoaded();
        expect(await discover.getEsqlQueryValue()).toBe(updatedQuery);
      }
    );

    await spaceTest.step('tab 2: another new tab resets to the default FROM logst*', async () => {
      await unifiedTabs.createNewTab();
      await discover.waitUntilTabIsLoaded();
      expect(await discover.getEsqlQueryValue()).toBe(defaultQuery);
    });
  });

  // TODO should be removed/modified after empty canvas is implemented #255686
  spaceTest('should be able to complete all quickly opened tabs', async ({ pageObjects }) => {
    const { discover, datePicker, unifiedTabs } = pageObjects;

    await spaceTest.step(
      'set up an ES|QL query over all indices and a wide time range',
      async () => {
        await discover.writeAndSubmitEsqlQuery('FROM *');
        await discover.waitUntilTabIsLoaded();
        await datePicker.setAbsoluteRange({
          from: 'Jan 10, 2000 @ 00:00:00.000',
          to: 'Dec 10, 2025 @ 00:00:00.000',
        });
        await discover.waitUntilTabIsLoaded();
      }
    );

    await spaceTest.step('open many tabs rapidly, then confirm each one loads', async () => {
      const newTabCount = 7;

      // Click without waiting between clicks to reproduce the rapid-open race.
      for (let i = 0; i < newTabCount; i++) {
        await unifiedTabs.clickNewTabButton();
      }
      await discover.waitUntilTabIsLoaded();

      // The initial tab plus every rapidly-opened tab should be present.
      await expect(unifiedTabs.getTabs()).toHaveCount(newTabCount + 1);

      // selectTab asserts each tab becomes active and finishes loading.
      for (let i = newTabCount - 1; i > 0; i--) {
        await unifiedTabs.selectTab(i);
        await discover.waitUntilTabIsLoaded();
        await unifiedTabs.hideTabPreview();
      }
    });
  });
});
