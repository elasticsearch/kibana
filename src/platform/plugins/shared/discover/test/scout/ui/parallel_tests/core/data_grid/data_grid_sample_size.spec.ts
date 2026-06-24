/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Discover data-grid sample-size defaults, changes, and reload behavior.
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest } from '@kbn/scout';
import { expectSampleSizeFooter } from '../../../fixtures/common/helpers';
import { testData } from '../../../fixtures/common';

const CUSTOM_SAMPLE_SIZE = 250;

spaceTest.describe('Discover data grid sample size', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
    await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
    await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects, scoutSpace }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.discover.setQueryMode('classic');
    await scoutSpace.uiSettings.set({
      'discover:sampleSize': testData.DEFAULT_SAMPLE_SIZE,
      'discover:rowHeightOption': 0,
      'discover:sampleRowsPerPage': testData.DEFAULT_ROWS_PER_PAGE,
    });
    await pageObjects.discover.goto();
    await pageObjects.dataGrid.waitUntilSearchingHasFinished();
    await pageObjects.dataGrid.waitForDocTableRendered();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset(
      'defaultIndex',
      'timepicker:timeDefaults',
      'discover:sampleSize',
      'discover:rowHeightOption',
      'discover:sampleRowsPerPage'
    );
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('uses the default sample size', async ({ pageObjects }) => {
    const { dataGrid } = pageObjects;

    await dataGrid.openGridDisplaySettings();
    expect(await dataGrid.getCurrentSampleSize()).toBe(testData.DEFAULT_SAMPLE_SIZE);
    await expectSampleSizeFooter({ pageObjects, sampleSize: testData.DEFAULT_SAMPLE_SIZE });
  });

  spaceTest('allows changing the sample size', async ({ pageObjects }) => {
    const { dataGrid } = pageObjects;

    await dataGrid.openGridDisplaySettings();
    expect(await dataGrid.getCurrentSampleSize()).toBe(testData.DEFAULT_SAMPLE_SIZE);

    await dataGrid.setSampleSize(CUSTOM_SAMPLE_SIZE);

    await dataGrid.openGridDisplaySettings();
    expect(await dataGrid.getCurrentSampleSize()).toBe(CUSTOM_SAMPLE_SIZE);
    await expectSampleSizeFooter({ pageObjects, sampleSize: CUSTOM_SAMPLE_SIZE });
  });

  spaceTest('persists the sample-size selection after reloading', async ({ page, pageObjects }) => {
    const { dataGrid } = pageObjects;

    await dataGrid.openGridDisplaySettings();
    expect(await dataGrid.getCurrentSampleSize()).toBe(testData.DEFAULT_SAMPLE_SIZE);

    await dataGrid.setSampleSize(CUSTOM_SAMPLE_SIZE);
    await dataGrid.openGridDisplaySettings();
    expect(await dataGrid.getCurrentSampleSize()).toBe(CUSTOM_SAMPLE_SIZE);

    await page.reload();
    await dataGrid.waitUntilSearchingHasFinished();
    await dataGrid.waitForDocTableRendered();
    await dataGrid.openGridDisplaySettings();

    expect(await dataGrid.getCurrentSampleSize()).toBe(CUSTOM_SAMPLE_SIZE);
    await expectSampleSizeFooter({ pageObjects, sampleSize: CUSTOM_SAMPLE_SIZE });
  });
});
