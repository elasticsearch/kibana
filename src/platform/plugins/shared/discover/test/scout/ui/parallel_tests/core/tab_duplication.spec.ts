/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest, testData } from '../../fixtures/common';

const INITIAL_HIT_COUNT = 14004;
const FILTERED_HIT_COUNT = 270;
const BREAKDOWN_FIELD = 'geo.src';
const BREAKDOWN_SELECTED_LABEL = `Breakdown by ${BREAKDOWN_FIELD}`;
const BREAKDOWN_NONE_LABEL = 'No breakdown';

spaceTest.describe('Discover tabs - tab duplication', { tag: '@local-stateful-classic' }, () => {
  spaceTest.use({ viewport: { width: 1920, height: 1080 } });

  spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.setupDiscoverDefaults();
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsViewer();
    await pageObjects.discover.goto({ queryMode: 'classic' });
    await pageObjects.discover.waitUntilTabIsLoaded();
  });

  spaceTest.afterAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.teardownDiscoverDefaults();
  });

  spaceTest('should restore the previous app and global states', async ({ pageObjects }) => {
    const { discover, filterBar, datePicker, unifiedTabs } = pageObjects;

    const expectHitCount = (count: number) =>
      expect.poll(() => discover.getHitCountInt()).toBe(count);
    const expectBreakdownLabel = async (label: string) =>
      expect(await discover.getBreakdownFieldValue()).toBe(label);

    await spaceTest.step('set breakdown, query, filter and time range', async () => {
      await expectHitCount(INITIAL_HIT_COUNT);

      await discover.chooseBreakdownField(BREAKDOWN_FIELD);
      await discover.writeAndSubmitKqlQuery('geo.dest: "US"');
      await discover.waitUntilTabIsLoaded();
      await filterBar.addFilter({ field: 'extension', operator: 'is', value: 'jpg' });
      await discover.waitUntilTabIsLoaded();
      await datePicker.setAbsoluteRange({
        from: 'Sep 19, 2015 @ 06:31:44.000',
        to: 'Sep 21, 2015 @ 06:31:44.000',
      });
      await discover.waitUntilTabIsLoaded();

      await expectHitCount(FILTERED_HIT_COUNT);
      await expectBreakdownLabel(BREAKDOWN_SELECTED_LABEL);
    });

    await spaceTest.step('a new tab starts with default app and global state', async () => {
      await unifiedTabs.createNewTab();
      await discover.waitUntilTabIsLoaded();
      await datePicker.setAbsoluteRange(testData.DEFAULT_TIME_RANGE_DISPLAY);
      await discover.waitUntilTabIsLoaded();

      await expectHitCount(INITIAL_HIT_COUNT);
      await expectBreakdownLabel(BREAKDOWN_NONE_LABEL);
    });

    await spaceTest.step('duplicating the first tab copies its state', async () => {
      await unifiedTabs.duplicateTab(0);
      await discover.waitUntilTabIsLoaded();
      await expectHitCount(FILTERED_HIT_COUNT);
      await expectBreakdownLabel(BREAKDOWN_SELECTED_LABEL);
    });

    await spaceTest.step('duplicating the new tab copies its state', async () => {
      await unifiedTabs.duplicateTab(2);
      await discover.waitUntilTabIsLoaded();
      await expectHitCount(INITIAL_HIT_COUNT);
      await expectBreakdownLabel(BREAKDOWN_NONE_LABEL);
    });
  });
});
