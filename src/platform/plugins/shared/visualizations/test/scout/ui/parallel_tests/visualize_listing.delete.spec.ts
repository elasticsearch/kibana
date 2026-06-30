/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Scout port of the bulk-delete behaviour exercised by the legacy
 * `delete all viz` test in
 * `src/platform/test/functional/apps/visualize/group7/_visualize_listing.ts`.
 *
 * Replaces the legacy `deleteAllVisualizations` page-object call (which
 * created N visualizations and then deleted them through the FTR helper)
 * with the new Content List bulk-delete flow: select-all, click the
 * toolbar's delete button, confirm. The expected end state is the empty
 * prompt.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest, testData } from '../fixtures';

spaceTest.describe('Visualize listing — bulk delete', { tag: tags.deploymentAgnostic }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.KBN_ARCHIVES.VISUALIZE);
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsAdmin();
    await pageObjects.visualizeListing.goto();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('deletes all selected visualizations from the toolbar', async ({ pageObjects }) => {
    const { visualizeListing } = pageObjects;
    await visualizeListing.contentList.selectAllAndDelete();
    await expect(visualizeListing.emptyPrompt).toBeVisible();
  });
});
