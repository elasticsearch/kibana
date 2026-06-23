/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import { spaceTest, testData, resolveDataViewId } from '../../../fixtures/surrounding_docs';

const TEST_DEFAULT_CONTEXT_SIZE = 2;
const TEST_STEP_SIZE = 2;
const INITIAL_ROW_COUNT = 2 * TEST_DEFAULT_CONTEXT_SIZE + 1;

spaceTest.describe('Discover context - size settings', { tag: tags.deploymentAgnostic }, () => {
  let dataViewId: string;

  spaceTest.beforeAll(async ({ scoutSpace }) => {
    const imported = await scoutSpace.savedObjects.load(testData.KBN_ARCHIVE_VISUALIZE);
    dataViewId = resolveDataViewId(imported, testData.LOGSTASH_DATA_VIEW);
    await scoutSpace.uiSettings.setDefaultIndex(testData.LOGSTASH_DATA_VIEW);
    await scoutSpace.uiSettings.set({
      'context:defaultSize': String(TEST_DEFAULT_CONTEXT_SIZE),
      'context:step': String(TEST_STEP_SIZE),
    });
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.contextPage.navigateTo(dataViewId, testData.LOGSTASH_ANCHOR_ID);
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'context:defaultSize', 'context:step');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest(
    'should increase according to the context:step setting when clicking load newer',
    async ({ pageObjects }) => {
      await pageObjects.contextPage.clickPredecessorLoadMoreButton();
      await expect(pageObjects.contextPage.rows).toHaveCount(INITIAL_ROW_COUNT + TEST_STEP_SIZE);
    }
  );

  spaceTest(
    'should increase according to the context:step setting when clicking load older',
    async ({ pageObjects }) => {
      await pageObjects.contextPage.clickSuccessorLoadMoreButton();
      await expect(pageObjects.contextPage.rows).toHaveCount(INITIAL_ROW_COUNT + TEST_STEP_SIZE);
    }
  );
});
