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
 * Validates the read-only saved-query UX (`shouldDisallowSavingButAllowLoading`
 * branch from the FTR): the popover lets the user load and clear queries but
 * hides save/update/delete affordances. Bulk privilege boolean assertions live
 * in the API capability specs; this spec only verifies the popover honours them.
 *
 * Custom-role auth is local-stateful only (no ECH support yet for `loginWithCustomRole`).
 */
spaceTest.describe('Saved query menu — read-only (Discover)', { tag: testData.SQM_UI_TAG }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.KBN_ARCHIVES.SAVED_QUERY_BUNDLE);
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginWithCustomRole(testData.DISCOVER_READ_SQM_READ_ROLE);
    await pageObjects.discover.goto({ queryMode: 'classic' });
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('hides save/update/delete and allows load/clear', async ({ page, pageObjects }) => {
    const { savedQueryManagementMenu: menu } = pageObjects;

    await spaceTest.step('save is disabled and save-changes is hidden', async () => {
      expect(await menu.isSaveButtonEnabled()).toBe(false);
      expect(await menu.isSaveChangesButtonVisible()).toBe(false);
    });

    await spaceTest.step('load button is available and the preloaded query loads', async () => {
      expect(await menu.isLoadButtonVisible()).toBe(true);
      await menu.loadSavedQuery(testData.PRELOADED_SAVED_QUERY.title);
      await expect(page.testSubj.locator('queryInput')).toHaveValue(
        testData.PRELOADED_SAVED_QUERY.query
      );
    });

    await spaceTest.step('per-row delete is hidden for loaded query', async () => {
      expect(await menu.isDeleteVisibleForQuery(testData.PRELOADED_SAVED_QUERY.title)).toBe(false);
    });

    await spaceTest.step('clearing the loaded query is allowed', async () => {
      await menu.clearLoadedQuery();
      await expect(page.testSubj.locator('queryInput')).toHaveValue('');
    });
  });
});
