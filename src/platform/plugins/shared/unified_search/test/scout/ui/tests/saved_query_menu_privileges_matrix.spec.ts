/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { spaceTest, testData } from '../fixtures';

/**
 * Walks 3 representative cells of the discover_v2 × savedQueryManagement
 * matrix and checks the popover renders what the capabilities say it should.
 *
 * The API specs check the capabilities payload, the Jest test checks the
 * component renders the right affordances for a payload — this spec is what
 * makes sure the two are still wired together over the network. Three cells
 * is enough to cover all three outcomes: section visible, section visible
 * with save gated, and section absent.
 *
 */
spaceTest.describe(
  'Saved query menu — capabilities matrix (Discover v2)',
  { tag: testData.SQM_UI_TAG },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace }) => {
      // Pre-seed a saved query so the load-section enabled state is
      // deterministic when the capability allows it. The fresh-Discover load
      // means `saveQuery` is always disabled for this spec (no filters/query),
      // so the matrix only asserts visibility — see the comment on
      // `SAVED_QUERY_UI_MATRIX` for why that's intentional.
      await scoutSpace.savedObjects.load(testData.KBN_ARCHIVES.SAVED_QUERY_BUNDLE);
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.cleanStandardList();
    });

    for (const matrixCase of testData.SAVED_QUERY_UI_MATRIX) {
      spaceTest(matrixCase.label, async ({ browserAuth, pageObjects }) => {
        const role = testData.buildDiscoverV2Role(matrixCase.featurePriv, matrixCase.sqmPriv);
        await browserAuth.loginWithCustomRole(role);
        await pageObjects.discover.goto({ queryMode: 'classic' });

        const affordances =
          await pageObjects.savedQueryManagementMenu.inspectSavedQueryAffordances();

        spaceTest
          .expect(affordances, `popover affordances for ${matrixCase.label}`)
          .toStrictEqual(matrixCase.expected);
      });
    }
  }
);
