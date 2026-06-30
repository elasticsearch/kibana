/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest, testData } from '../fixtures';

/**
 * The seed archive (`kbn_archiver/visualize.json`) ships {@link SEEDED_VIZ_COUNT}
 * visualizations spanning input controls, area charts, a Vega map, and shared-item
 * variants — enough to exercise listing, search, and bulk-delete without driving
 * the TSVB editor.
 */
const SEEDED_VIZ_COUNT = 10;
const SAMPLE_VIZ = 'input control options';
const UNIQUE_VIZ = 'VegaMap';

spaceTest.describe('Visualize listing — renders', { tag: tags.deploymentAgnostic }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.KBN_ARCHIVES.VISUALIZE);
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    // `loginAsAdmin` matches the legacy FTR coverage and is required for the
    // dashboard-flow callout (gated by `dashboardCapabilities.createNew`).
    await browserAuth.loginAsAdmin();
    await pageObjects.visualizeListing.goto();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('lists the seeded visualizations', async ({ pageObjects }) => {
    const { visualizeListing } = pageObjects;
    await expect(visualizeListing.contentList.itemLinks).toHaveCount(SEEDED_VIZ_COUNT);
    await expect(visualizeListing.rowByTitle(SAMPLE_VIZ)).toBeVisible();
    await expect(visualizeListing.rowByTitle(UNIQUE_VIZ)).toBeVisible();
  });

  spaceTest('shows the dashboard-flow callout', async ({ pageObjects }) => {
    await expect(pageObjects.visualizeListing.dashboardFlowPrompt).toBeVisible();
  });
});
