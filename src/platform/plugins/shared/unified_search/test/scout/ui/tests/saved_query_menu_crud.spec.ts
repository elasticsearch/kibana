/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest, testData } from '../fixtures';

/**
 * Exercises the full saved-query CRUD flow through the popover for a user
 * with `savedQueryManagement: all`. Replaces the per-app `shouldAllowSavingQueries`
 * blocks from the FTR (3 `it` blocks across 8 CI lanes) with one consolidated
 * test using `test.step` to keep app setup costs low.
 *
 * Custom-role auth is local-stateful only (no ECH support yet for `loginWithCustomRole`).
 */
spaceTest.describe('Saved query menu — CRUD (Discover)', { tag: testData.SQM_UI_TAG }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.KBN_ARCHIVES.SAVED_QUERY_BUNDLE);
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginWithCustomRole(testData.DISCOVER_ALL_SQM_ALL_ROLE);
    await pageObjects.discover.goto({ queryMode: 'classic' });
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest(
    'save, load, update, save-as-new, delete via the popover',
    async ({ page, pageObjects }) => {
      const { savedQueryManagementMenu: menu, queryBar } = pageObjects;
      const NEW_QUERY = 'response:418';
      const NEW_QUERY_NAME = `e2e-${Date.now()}`;
      const COPY_QUERY_NAME = `${NEW_QUERY_NAME}-copy`;

      await spaceTest.step('save a brand-new query', async () => {
        await queryBar.setQuery(NEW_QUERY);
        await menu.saveNewQuery(NEW_QUERY_NAME);
        expect(await menu.hasSavedQuery(NEW_QUERY_NAME)).toBe(true);
        await queryBar.clearQuery();
      });

      await spaceTest.step('load the preloaded `OKJpgs` query', async () => {
        await menu.loadSavedQuery(testData.PRELOADED_SAVED_QUERY.title);
        await expect(page.testSubj.locator('queryInput')).toHaveValue(
          testData.PRELOADED_SAVED_QUERY.query
        );
      });

      await spaceTest.step('update the loaded query and re-load it', async () => {
        await queryBar.setQuery('response:404');
        await menu.updateLoadedQuery({ includeFilters: true });
        await menu.clearLoadedQuery();
        await menu.loadSavedQuery(testData.PRELOADED_SAVED_QUERY.title);
        await expect(page.testSubj.locator('queryInput')).toHaveValue('response:404');
      });

      await spaceTest.step('save the loaded query as a new copy', async () => {
        // The popover's "Save query" item is only enabled when the live query
        // differs from the loaded one; modify it before saving as a copy.
        await queryBar.setQuery('response:500');
        await menu.saveLoadedQueryAsNew(COPY_QUERY_NAME);
        expect(await menu.hasSavedQuery(COPY_QUERY_NAME)).toBe(true);
      });

      await spaceTest.step('delete the saved queries we created', async () => {
        await menu.deleteSavedQuery(NEW_QUERY_NAME);
        expect(await menu.hasSavedQuery(NEW_QUERY_NAME)).toBe(false);
        await menu.deleteSavedQuery(COPY_QUERY_NAME);
        expect(await menu.hasSavedQuery(COPY_QUERY_NAME)).toBe(false);
      });
    }
  );
});
