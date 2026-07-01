/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { PageObjects } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest, testData } from '../../../fixtures/common';

const UPDATED_TIME_RANGE_DISPLAY = {
  from: 'Sep 19, 2015 @ 06:31:44.000',
  to: 'Sep 20, 2015 @ 18:31:44.000',
};

const INITIAL_TIME_CONFIGURATION = {
  time: {
    start: testData.DEFAULT_TIME_RANGE.from,
    end: testData.DEFAULT_TIME_RANGE.to,
  },
  refresh: { interval: '60', units: 'Seconds', isPaused: true },
  hitCount: 14_004,
} as const;

const UPDATED_TIME_CONFIGURATION = {
  time: {
    start: '2015-09-19T06:31:44.000Z',
    end: '2015-09-20T18:31:44.000Z',
  },
  refresh: { interval: '30', units: 'Seconds', isPaused: false },
  hitCount: 4_589,
} as const;

const expectCurrentTimeConfiguration = async (
  pageObjects: PageObjects,
  expected: typeof INITIAL_TIME_CONFIGURATION | typeof UPDATED_TIME_CONFIGURATION
) => {
  const { datePicker, discover } = pageObjects;

  expect(await datePicker.getTimeConfig()).toStrictEqual(expected.time);
  expect(await datePicker.getRefreshConfig()).toStrictEqual(expected.refresh);
  expect(await discover.getHitCountInt()).toBe(expected.hitCount);
};

const configureUpdatedTime = async (pageObjects: PageObjects) => {
  const { datePicker, discover } = pageObjects;

  await datePicker.setAbsoluteRange(UPDATED_TIME_RANGE_DISPLAY);
  await discover.waitUntilTabIsLoaded();
  await datePicker.startAutoRefresh(30);
  await discover.waitUntilTabIsLoaded();
};

const createTabsWithStoredTimeDifference = async (pageObjects: PageObjects) => {
  const { discover, unifiedTabs } = pageObjects;

  await expectCurrentTimeConfiguration(pageObjects, INITIAL_TIME_CONFIGURATION);

  await spaceTest.step('tab 1: create a tab with the initial time configuration', async () => {
    await unifiedTabs.createNewTab();
    await discover.waitUntilTabIsLoaded();
    await expectCurrentTimeConfiguration(pageObjects, INITIAL_TIME_CONFIGURATION);
  });

  await spaceTest.step('tab 2: create a tab with an updated time configuration', async () => {
    await unifiedTabs.createNewTab();
    await discover.waitUntilTabIsLoaded();
    await expectCurrentTimeConfiguration(pageObjects, INITIAL_TIME_CONFIGURATION);
    await configureUpdatedTime(pageObjects);
    await expectCurrentTimeConfiguration(pageObjects, UPDATED_TIME_CONFIGURATION);
  });

  await spaceTest.step('switching tabs restores each tab time configuration', async () => {
    await unifiedTabs.selectTab(1);
    await discover.waitUntilTabIsLoaded();
    await expectCurrentTimeConfiguration(pageObjects, INITIAL_TIME_CONFIGURATION);

    await unifiedTabs.selectTab(2);
    await discover.waitUntilTabIsLoaded();
    await expectCurrentTimeConfiguration(pageObjects, UPDATED_TIME_CONFIGURATION);

    await unifiedTabs.selectTab(0);
    await discover.waitUntilTabIsLoaded();
    await expectCurrentTimeConfiguration(pageObjects, INITIAL_TIME_CONFIGURATION);
  });
};

spaceTest.describe('Discover tabs - time range', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.setupDiscoverDefaults();
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.discover.goto({ queryMode: 'classic' });
    await pageObjects.discover.waitUntilTabIsLoaded();
  });

  spaceTest.afterAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.teardownDiscoverDefaults();
  });

  spaceTest(
    'should not save different time ranges when the switch is off',
    async ({ pageObjects }) => {
      const { discover, unifiedTabs } = pageObjects;
      const sessionName = 'tabs time range without stored time';

      await createTabsWithStoredTimeDifference(pageObjects);
      await discover.saveSearch(sessionName, { storeTimeRange: false });
      await discover.waitUntilTabIsLoaded();
      await expect(discover.unsavedChangesIndicator()).toBeHidden();

      await discover.clickNewSearch();
      await discover.loadSavedSearch(sessionName);
      await expectCurrentTimeConfiguration(pageObjects, INITIAL_TIME_CONFIGURATION);

      await unifiedTabs.selectTab(1);
      await discover.waitUntilTabIsLoaded();
      await expectCurrentTimeConfiguration(pageObjects, INITIAL_TIME_CONFIGURATION);

      await unifiedTabs.selectTab(2);
      await discover.waitUntilTabIsLoaded();
      await expectCurrentTimeConfiguration(pageObjects, INITIAL_TIME_CONFIGURATION);
      await expect(discover.unsavedChangesIndicator()).toBeHidden();
    }
  );

  spaceTest('should save different time ranges when the switch is on', async ({ pageObjects }) => {
    const { discover, unifiedTabs } = pageObjects;
    const sessionName = 'tabs time range with stored time';

    await createTabsWithStoredTimeDifference(pageObjects);
    await discover.saveSearch(sessionName, { storeTimeRange: true });
    await discover.waitUntilTabIsLoaded();
    await expect(discover.unsavedChangesIndicator()).toBeHidden();

    await discover.clickNewSearch();
    await discover.loadSavedSearch(sessionName);
    await expectCurrentTimeConfiguration(pageObjects, INITIAL_TIME_CONFIGURATION);

    await unifiedTabs.selectTab(2);
    await discover.waitUntilTabIsLoaded();
    await expectCurrentTimeConfiguration(pageObjects, UPDATED_TIME_CONFIGURATION);
    await expect(discover.unsavedChangesIndicator()).toBeHidden();

    await unifiedTabs.selectTab(1);
    await discover.waitUntilTabIsLoaded();
    await expectCurrentTimeConfiguration(pageObjects, INITIAL_TIME_CONFIGURATION);

    await unifiedTabs.selectTab(0);
    await discover.waitUntilTabIsLoaded();
    await expectCurrentTimeConfiguration(pageObjects, INITIAL_TIME_CONFIGURATION);

    await configureUpdatedTime(pageObjects);
    await expect(discover.unsavedChangesIndicator()).toBeVisible();
  });
});
