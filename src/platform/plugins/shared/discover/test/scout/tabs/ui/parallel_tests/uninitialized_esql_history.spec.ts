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

const QUERY = 'FROM logstash-* | SORT @timestamp DESC | LIMIT 100';

spaceTest.describe(
  'Discover tabs - uninitialized search experience',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
      await discoverScoutSpace.setupDiscoverDefaults();
    });

    spaceTest.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsViewer();
    });

    spaceTest.afterAll(async ({ discoverScoutSpace }) => {
      await discoverScoutSpace.teardownDiscoverDefaults();
    });

    spaceTest(
      'keeps a new tab uninitialized while switching between tabs',
      async ({ pageObjects }) => {
        const { discover, unifiedTabs } = pageObjects;

        await spaceTest.step('loads data in the initial tab', async () => {
          await discover.goto({ queryMode: 'classic' });
          await discover.waitUntilSearchingHasFinished();
          await expect(discover.getRefreshDataButton()).toBeHidden();
          expect(await discover.getHitCount()).toBe('14,004');
          expect(await discover.getSearchFetchCount()).toBe(1);
        });

        await spaceTest.step('creates a new tab without running a query', async () => {
          await unifiedTabs.createNewTab();
          await expect(discover.getRefreshDataButton()).toBeVisible();
          expect(await discover.getSearchFetchCount()).toBe(0);
        });

        await spaceTest.step(
          'restores loaded and uninitialized states when switching tabs',
          async () => {
            await unifiedTabs.selectTab(0);
            await expect(discover.getRefreshDataButton()).toBeHidden();
            expect(await discover.getHitCount()).toBe('14,004');
            expect(await discover.getSearchFetchCount()).toBe(0);

            await unifiedTabs.selectTab(1);
            await expect(discover.getRefreshDataButton()).toBeVisible();
            expect(await discover.getSearchFetchCount()).toBe(0);
          }
        );
      }
    );

    spaceTest(
      'opens query history on a new ES|QL tab and closes it after searching',
      async ({ pageObjects }) => {
        const { discover, unifiedTabs } = pageObjects;
        const historyPanel = discover.getEsqlHistoryPanel();

        await discover.goto({ queryMode: 'esql' });
        await discover.waitUntilSearchingHasFinished();

        await unifiedTabs.createNewTab();

        await expect(historyPanel).toBeVisible();

        await discover.codeEditor.setCodeEditorValue(QUERY);
        await discover.submitQuery();

        await expect(historyPanel).toBeHidden();
        await discover.waitUntilSearchingHasFinished();
      }
    );

    spaceTest(
      'keeps manually opened query history open across searches',
      async ({ pageObjects }) => {
        const { discover } = pageObjects;
        const historyPanel = discover.getEsqlHistoryPanel();

        await discover.goto({ queryMode: 'esql' });
        await discover.waitUntilSearchingHasFinished();
        await expect(historyPanel).toBeHidden();

        await discover.toggleEsqlHistoryPanel();
        await discover.codeEditor.setCodeEditorValue(QUERY);
        await discover.submitQuery();
        await discover.waitUntilSearchingHasFinished();

        await expect(historyPanel).toBeVisible();
      }
    );

    spaceTest('switches to ES|QL from a new classic empty tab', async ({ pageObjects }) => {
      const { discover, unifiedTabs } = pageObjects;

      await discover.goto({ queryMode: 'classic' });
      await discover.waitUntilSearchingHasFinished();
      await unifiedTabs.createNewTab();

      await expect(discover.getRefreshDataButton()).toBeVisible();
      await expect(discover.getQueryInEsqlButton()).toHaveText('Query in ES|QL');

      await discover.getQueryInEsqlButton().click();

      expect(await discover.getCurrentQueryMode()).toBe('esql');
    });
  }
);
