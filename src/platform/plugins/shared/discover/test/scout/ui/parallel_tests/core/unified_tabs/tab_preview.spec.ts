/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PageObjects } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest } from '../../../fixtures/common';

const DISCOVER_SESSION_NAME = 'tab preview test';
const ESQL_QUERY = 'FROM logstash-* | WHERE extension.raw == "png" and bytes > 10000';

const EXPECTED_TAB_PREVIEWS = [
  {
    title: 'Data view: logstash-*',
    query: '',
    label: 'no query',
  },
  {
    title: 'Data view: logstash-*',
    query: 'bytes > 100',
    label: 'with query',
  },
  {
    title: 'Data view: logs*',
    query: '',
    label: 'with different data view',
  },
  {
    title: '',
    query: ESQL_QUERY,
    label: 'esql',
  },
] as const;

const getAllTabPreviewContent = async (pageObjects: PageObjects) => {
  const { unifiedTabs } = pageObjects;
  const previews = [];

  for (let index = 0; index < EXPECTED_TAB_PREVIEWS.length; index++) {
    previews.push(await unifiedTabs.getTabPreviewContent(index));
    await unifiedTabs.hideTabPreview();
  }

  return previews;
};

const createTabsWithPreviewContent = async (pageObjects: PageObjects) => {
  const { discover, queryBar, unifiedTabs } = pageObjects;

  await spaceTest.step('tab 0: rename the default tab', async () => {
    await unifiedTabs.editTabLabel(0, 'no query');
  });

  await spaceTest.step('tab 1: set a KQL query', async () => {
    await unifiedTabs.createNewTab();
    await discover.waitUntilTabIsLoaded();
    await unifiedTabs.editTabLabel(1, 'with query');
    await queryBar.setQuery('bytes > 100');
    await discover.submitQuery();
    await discover.waitUntilTabIsLoaded();
  });

  await spaceTest.step('tab 2: switch to a different ad hoc data view', async () => {
    await unifiedTabs.createNewTab();
    await discover.waitUntilTabIsLoaded();
    await unifiedTabs.editTabLabel(2, 'with different data view');
    await discover.createDataViewFromSearchBar({ name: 'logs', adHoc: true });
  });

  await spaceTest.step('tab 3: switch to ES|QL and set an ES|QL query', async () => {
    await unifiedTabs.createNewTab();
    await discover.waitUntilTabIsLoaded();
    await unifiedTabs.editTabLabel(3, 'esql');
    await discover.writeAndSubmitEsqlQuery(ESQL_QUERY);
  });
};

spaceTest.describe('Discover tabs - tab preview', { tag: '@local-stateful-classic' }, () => {
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

  spaceTest('should show the correct content', async ({ pageObjects }) => {
    await createTabsWithPreviewContent(pageObjects);
    expect(await getAllTabPreviewContent(pageObjects)).toStrictEqual(EXPECTED_TAB_PREVIEWS);
  });

  spaceTest('should preserve content after refresh', async ({ page, pageObjects }) => {
    await createTabsWithPreviewContent(pageObjects);
    await page.reload();
    await pageObjects.discover.waitUntilTabIsLoaded();

    expect(await getAllTabPreviewContent(pageObjects)).toStrictEqual(EXPECTED_TAB_PREVIEWS);
  });

  spaceTest('should preserve content after saving and loading', async ({ pageObjects }) => {
    await createTabsWithPreviewContent(pageObjects);
    await pageObjects.discover.saveSearch(DISCOVER_SESSION_NAME);
    await pageObjects.discover.waitUntilTabIsLoaded();
    await pageObjects.discover.clickNewSearch();
    await pageObjects.discover.loadSavedSearch(DISCOVER_SESSION_NAME);

    expect(await getAllTabPreviewContent(pageObjects)).toStrictEqual(EXPECTED_TAB_PREVIEWS);
  });
});
