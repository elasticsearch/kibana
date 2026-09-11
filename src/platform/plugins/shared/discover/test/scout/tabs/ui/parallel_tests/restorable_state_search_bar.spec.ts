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
import { spaceTest } from '../fixtures';

const DEFAULT_ESQL_QUERY = 'FROM logstash-* | SORT @timestamp DESC';

const expectCleanClassicQueryState = async ({ discover, queryBar }: PageObjects, query: string) => {
  expect(await queryBar.getQuery()).toBe(query);
  expect(await discover.getQuerySubmitButtonLabel()).toBe('Refresh query');
};

const expectDirtyClassicQueryState = async ({ discover, queryBar }: PageObjects, query: string) => {
  expect(await queryBar.getQuery()).toBe(query);
  expect(await discover.getQuerySubmitButtonLabel()).toBe('Needs updating');
};

const expectEsqlQueryState = async ({ discover }: PageObjects, query: string) => {
  expect(await discover.getEsqlQueryValue()).toBe(query);
  expect(await discover.getQuerySubmitButtonLabel()).toBe('Search');
};

spaceTest.describe(
  'Discover tabs - restorable search state',
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
      'restores classic query draft and submitted state per tab',
      async ({ pageObjects }) => {
        const { discover, queryBar, unifiedTabs } = pageObjects;
        const draftQuery0 = 'jpg';
        const draftQuery2 = 'png';

        await expectCleanClassicQueryState(pageObjects, '');
        await queryBar.setQuery(draftQuery0);
        await expectDirtyClassicQueryState(pageObjects, draftQuery0);

        await discover.createNewTabAndSearch();
        await expectCleanClassicQueryState(pageObjects, '');

        await discover.createNewTabAndSearch();
        await expectCleanClassicQueryState(pageObjects, '');
        await queryBar.setQuery(draftQuery2);
        await expectDirtyClassicQueryState(pageObjects, draftQuery2);

        await unifiedTabs.selectTab(0);
        await discover.waitUntilTabIsLoaded();
        await expectDirtyClassicQueryState(pageObjects, draftQuery0);
        expect(await discover.getHitCount()).toBe('14,004');
        await discover.submitQuery();
        await discover.waitUntilTabIsLoaded();
        await expectCleanClassicQueryState(pageObjects, draftQuery0);
        expect(await discover.getHitCount()).toBe('11,829');

        await unifiedTabs.selectTab(1);
        await discover.waitUntilTabIsLoaded();
        await expectCleanClassicQueryState(pageObjects, '');
        expect(await discover.getHitCount()).toBe('14,004');

        await unifiedTabs.selectTab(2);
        await discover.waitUntilTabIsLoaded();
        await expectDirtyClassicQueryState(pageObjects, draftQuery2);
        expect(await discover.getHitCount()).toBe('14,004');
        await discover.submitQuery();
        await discover.waitUntilTabIsLoaded();
        await expectCleanClassicQueryState(pageObjects, draftQuery2);
        expect(await discover.getHitCount()).toBe('1,373');

        await unifiedTabs.selectTab(0);
        await discover.waitUntilTabIsLoaded();
        await expectCleanClassicQueryState(pageObjects, draftQuery0);
        expect(await discover.getHitCount()).toBe('11,829');
      }
    );

    spaceTest('restores ES query draft and submitted state per tab', async ({ pageObjects }) => {
      const { discover, unifiedTabs } = pageObjects;
      const draftQuery0 = 'from logstash-* | sort @timestamp desc | limit 50';
      const draftQuery2 = 'from logstash-* | sort @timestamp desc | limit 150';

      await discover.selectTextBaseLang();
      await discover.waitUntilTabIsLoaded();
      await expectEsqlQueryState(pageObjects, DEFAULT_ESQL_QUERY);

      await discover.codeEditor.setCodeEditorValue(draftQuery0);
      await expectEsqlQueryState(pageObjects, draftQuery0);

      await discover.createNewTabAndSearch();
      await expectEsqlQueryState(pageObjects, DEFAULT_ESQL_QUERY);

      await discover.createNewTabAndSearch();
      await expectEsqlQueryState(pageObjects, DEFAULT_ESQL_QUERY);
      await discover.codeEditor.setCodeEditorValue(draftQuery2);
      await expectEsqlQueryState(pageObjects, draftQuery2);

      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();
      await expectEsqlQueryState(pageObjects, draftQuery0);
      expect(await discover.getHitCount()).toBe('1,000');
      await discover.submitQuery();
      await discover.waitUntilTabIsLoaded();
      await expectEsqlQueryState(pageObjects, draftQuery0);
      expect(await discover.getHitCount()).toBe('50');

      await unifiedTabs.selectTab(1);
      await discover.waitUntilTabIsLoaded();
      await expectEsqlQueryState(pageObjects, DEFAULT_ESQL_QUERY);
      expect(await discover.getHitCount()).toBe('1,000');

      await unifiedTabs.selectTab(2);
      await discover.waitUntilTabIsLoaded();
      await expectEsqlQueryState(pageObjects, draftQuery2);
      expect(await discover.getHitCount()).toBe('1,000');
      await discover.submitQuery();
      await discover.waitUntilTabIsLoaded();
      await expectEsqlQueryState(pageObjects, draftQuery2);
      expect(await discover.getHitCount()).toBe('150');

      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();
      await expectEsqlQueryState(pageObjects, draftQuery0);
      expect(await discover.getHitCount()).toBe('50');
    });

    spaceTest(
      'restores an already submitted ES query and a draft ES query',
      async ({ pageObjects }) => {
        const { discover, unifiedTabs } = pageObjects;
        const submittedQuery =
          'from logstash-* | sort @timestamp desc | limit 50 // edit and run this';
        const draftQuery = 'from logstash-* | sort @timestamp desc | limit 150 // only edit this';

        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        await expectEsqlQueryState(pageObjects, DEFAULT_ESQL_QUERY);

        await discover.codeEditor.setCodeEditorValue(submittedQuery);
        await expectEsqlQueryState(pageObjects, submittedQuery);
        await discover.submitQuery();
        await discover.waitUntilTabIsLoaded();
        await expectEsqlQueryState(pageObjects, submittedQuery);
        expect(await discover.getHitCount()).toBe('50');

        await discover.createNewTabAndSearch();
        await expectEsqlQueryState(pageObjects, DEFAULT_ESQL_QUERY);
        await discover.codeEditor.setCodeEditorValue(draftQuery);
        await expectEsqlQueryState(pageObjects, draftQuery);
        expect(await discover.getHitCount()).toBe('1,000');

        await unifiedTabs.selectTab(0);
        await discover.waitUntilTabIsLoaded();
        await expectEsqlQueryState(pageObjects, submittedQuery);
        expect(await discover.getHitCount()).toBe('50');

        await unifiedTabs.selectTab(1);
        await discover.waitUntilTabIsLoaded();
        await expectEsqlQueryState(pageObjects, draftQuery);
        expect(await discover.getHitCount()).toBe('1,000');
      }
    );

    spaceTest('restores ES editor panel state per tab', async ({ pageObjects }) => {
      const { discover, unifiedTabs } = pageObjects;
      const historyPanel = discover.getEsqlHistoryPanel();
      const distance = 100;

      await discover.selectTextBaseLang();
      await discover.waitUntilTabIsLoaded();

      const initialHeight = await discover.getEsqlEditorHeight();
      await expect(historyPanel).toBeHidden();

      await discover.toggleEsqlHistoryPanel();
      await expect(historyPanel).toBeVisible();
      expect(await discover.getEsqlEditorHeight()).toBe(initialHeight);

      await unifiedTabs.createNewTab();
      await expect(historyPanel).toBeVisible();
      await discover.toggleEsqlHistoryPanel();
      await expect(historyPanel).toBeHidden();
      await discover.submitQueryAndWait();
      await expect(historyPanel).toBeHidden();
      expect(await discover.getEsqlEditorHeight()).toBe(initialHeight);

      await discover.resizeEsqlEditorBy(distance);
      const updatedHeight = await discover.getEsqlEditorHeight();
      expect(updatedHeight).toBeGreaterThan(initialHeight);

      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();
      await expect(historyPanel).toBeVisible();
      expect(await discover.getEsqlEditorHeight()).toBe(initialHeight);

      await unifiedTabs.selectTab(1);
      await discover.waitUntilTabIsLoaded();
      await expect(historyPanel).toBeHidden();
      expect(await discover.getEsqlEditorHeight()).toBe(updatedHeight);
    });
  }
);
