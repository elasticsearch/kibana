/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Scout port of the `search` block in
 * `src/platform/test/functional/apps/visualize/group7/_visualize_listing.ts`.
 *
 * The legacy block authored a "Hello World" visualization via TSVB so it could
 * assert against a single seeded row. The kbn archive used here ships the full
 * set of fixtures the FTR group already relies on (10 visualizations, including
 * 5 "input control …" rows, several "AreaChart" rows, and uniquely-named
 * `VegaMap` / `Shared-Item …` rows). Expected counts target that seeded shape:
 *
 *  - 5 rows contain the substring "input"
 *  - 5 rows contain the substring "control"
 *  - "VegaMap" is the only row containing that distinguishing token
 *  - tokens with no substring overlap surface the no-results panel
 *  - search is prefix-anchored: a mid-word substring ("nput") matches nothing
 *  - multi-token queries are AND'd: "input banana" matches nothing
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest, testData } from '../fixtures';

const INPUT_CONTROL_MATCHES = 5;
const UNIQUE_VIZ = 'VegaMap';

spaceTest.describe('Visualize listing — search', { tag: tags.deploymentAgnostic }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.KBN_ARCHIVES.VISUALIZE);
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    // `loginAsAdmin` matches the legacy FTR coverage and the sibling specs. A
    // viewer can't see the seeded `input_control_vis` rows on serverless (the
    // type is `readOnly` there), which would drop the `input control` matches
    // to zero and is orthogonal to what these search cases assert.
    await browserAuth.loginAsAdmin();
    await pageObjects.visualizeListing.goto();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('matches on the first word', async ({ pageObjects }) => {
    const { visualizeListing } = pageObjects;
    await visualizeListing.contentList.searchFor('input');
    await expect(visualizeListing.contentList.itemLinks).toHaveCount(INPUT_CONTROL_MATCHES);
  });

  spaceTest('matches the second word', async ({ pageObjects }) => {
    const { visualizeListing } = pageObjects;
    await visualizeListing.contentList.searchFor('control');
    await expect(visualizeListing.contentList.itemLinks).toHaveCount(INPUT_CONTROL_MATCHES);
  });

  spaceTest('matches a word prefix', async ({ pageObjects }) => {
    const { visualizeListing } = pageObjects;
    await visualizeListing.contentList.searchFor('cont');
    await expect(visualizeListing.contentList.itemLinks).toHaveCount(INPUT_CONTROL_MATCHES);
  });

  spaceTest('is case insensitive', async ({ pageObjects }) => {
    const { visualizeListing } = pageObjects;
    await visualizeListing.contentList.searchFor('INPUT CONTROL');
    await expect(visualizeListing.contentList.itemLinks).toHaveCount(INPUT_CONTROL_MATCHES);
  });

  spaceTest('narrows to a single match for a distinguishing token', async ({ pageObjects }) => {
    const { visualizeListing } = pageObjects;
    await visualizeListing.contentList.searchFor('VegaMap');
    await expect(visualizeListing.contentList.itemLinks).toHaveCount(1);
    await expect(visualizeListing.rowByTitle(UNIQUE_VIZ)).toBeVisible();
  });

  spaceTest('returns no results for non-matching tokens', async ({ pageObjects }) => {
    const { visualizeListing } = pageObjects;
    await visualizeListing.contentList.searchFor('banana');
    await expect(visualizeListing.contentList.noResultsPanel).toBeVisible();
  });

  spaceTest('does not match a mid-word substring', async ({ pageObjects }) => {
    const { visualizeListing } = pageObjects;
    // `nput` is a mid-word substring of `input`; prefix-anchored search must skip it.
    await visualizeListing.contentList.searchFor('nput');
    await expect(visualizeListing.contentList.noResultsPanel).toBeVisible();
  });

  spaceTest('AND-combines multi-token queries', async ({ pageObjects }) => {
    const { visualizeListing } = pageObjects;
    // `input` matches the seeded rows but `banana` matches nothing; AND yields zero.
    await visualizeListing.contentList.searchFor('input banana');
    await expect(visualizeListing.contentList.noResultsPanel).toBeVisible();
  });
});
