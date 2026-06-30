/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Scout port of the `Edit` block in
 * `src/platform/test/functional/apps/visualize/group7/_visualize_listing.ts`.
 *
 * Opens the content-editor flyout for one of the seeded visualizations,
 * renames it, and re-asserts via search that the updated title is what the
 * listing surfaces. Requires admin to satisfy the new
 * `features.contentEditor.isReadonly: !visualizeCapabilities.save` gate.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest, testData } from '../fixtures';

const FIRST_VIZ = 'input control options';

spaceTest.describe('Visualize listing — edit', { tag: tags.deploymentAgnostic }, () => {
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

  spaceTest(
    'edits the title and description via the content-editor flyout',
    async ({ pageObjects }) => {
      const { visualizeListing } = pageObjects;
      await visualizeListing.openContentEditorFor(FIRST_VIZ);
      await visualizeListing.editVisualizationDetails({
        title: 'new title',
        description: 'new description',
      });
      await visualizeListing.contentList.searchFor('new title');
      await expect(visualizeListing.contentList.itemLinks).toHaveCount(1);
      await expect(visualizeListing.rowByTitle('new title')).toBeVisible();
    }
  );
});
