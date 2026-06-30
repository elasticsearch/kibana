/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Covers the create handoff the legacy FTR suite exercised from the listing.
 * The migration moved the create button into the page header (`newItemButton`),
 * so a broken `onClick` or `showNewVisModal` handoff would otherwise slip past
 * the render/search/edit/delete specs. Asserts the header button opens the
 * new-visualization wizard (its group-selection step), matching what the legacy
 * `waitForVisualizationSelectPage` keyed on.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest, testData } from '../fixtures';

spaceTest.describe('Visualize listing — create', { tag: tags.deploymentAgnostic }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.KBN_ARCHIVES.VISUALIZE);
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    // `loginAsAdmin` satisfies the `visualizeCapabilities.save` gate that
    // renders the header create button.
    await browserAuth.loginAsAdmin();
    await pageObjects.visualizeListing.goto();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest(
    'opens the new-visualization wizard from the header create button',
    async ({ pageObjects }) => {
      const { visualizeListing } = pageObjects;
      await visualizeListing.clickCreateNewVisualization();
      await expect(visualizeListing.newVisDialogGroups).toBeVisible();
    }
  );
});
