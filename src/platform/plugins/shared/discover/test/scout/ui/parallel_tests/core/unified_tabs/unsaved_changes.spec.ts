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

const QUERY_IOS = 'machine.os: "ios"';
const QUERY_WINDOWS = 'machine.os: "win"';
const FILTER_FIELD = 'extension';
const FILTER_VALUE = 'png';

const UPDATED_TIME_RANGE_DISPLAY = {
  from: 'Sep 20, 2015 @ 00:00:00.000',
  to: 'Sep 21, 2015 @ 00:00:00.000',
};

const createSessionName = (prefix: string) => `${prefix}-${Date.now()}`;

const saveSession = async (
  pageObjects: PageObjects,
  sessionName: string,
  { storeTimeRange }: { storeTimeRange?: boolean } = {}
) => {
  await pageObjects.discover.saveSearch(sessionName, { storeTimeRange });
  await pageObjects.discover.waitUntilTabIsLoaded();
};

const submitQueryAndWait = async (pageObjects: PageObjects, query: string) => {
  await pageObjects.discover.writeAndSubmitKqlQuery(query);
  await pageObjects.discover.waitUntilTabIsLoaded();
};

spaceTest.describe('Discover tabs - unsaved changes', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.setupDiscoverDefaults({ loadFlightsDataView: true });
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.discover.goto({ queryMode: 'classic' });
    await pageObjects.discover.waitUntilTabIsLoaded();
  });

  spaceTest.afterEach(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.uiSettings.unset('defaultColumns');
  });

  spaceTest.afterAll(async ({ discoverScoutSpace }) => {
    await discoverScoutSpace.teardownDiscoverDefaults();
  });

  spaceTest('shows unsaved changes after altering state post-save', async ({ pageObjects }) => {
    const { discover, unifiedTabs } = pageObjects;

    await saveSession(pageObjects, createSessionName('unsaved-changes-query'));
    await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();

    await submitQueryAndWait(pageObjects, QUERY_IOS);

    await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeVisible();
    await expect(discover.unsavedChangesIndicator()).toBeVisible();
  });

  spaceTest('clears unsaved changes indicator on session save', async ({ pageObjects }) => {
    const { discover, unifiedTabs } = pageObjects;
    const sessionName = createSessionName('unsaved-changes-save');

    await saveSession(pageObjects, sessionName);
    await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();

    await submitQueryAndWait(pageObjects, QUERY_IOS);
    await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeVisible();
    await expect(discover.unsavedChangesIndicator()).toBeVisible();

    await saveSession(pageObjects, sessionName);
    await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();
    await expect(discover.unsavedChangesIndicator()).toBeHidden();
  });

  spaceTest('reverts unsaved changes in all tabs', async ({ pageObjects }) => {
    const { discover, unifiedTabs } = pageObjects;

    await unifiedTabs.createNewTab();
    await discover.waitUntilTabIsLoaded();
    await saveSession(pageObjects, createSessionName('unsaved-changes-revert'));
    await expect(await unifiedTabs.getTabUnsavedIndicator(1)).toBeHidden();

    await submitQueryAndWait(pageObjects, QUERY_WINDOWS);
    await expect(await unifiedTabs.getTabUnsavedIndicator(1)).toBeVisible();
    await expect(discover.unsavedChangesIndicator()).toBeVisible();

    await unifiedTabs.selectTab(0);
    await discover.waitUntilTabIsLoaded();
    await submitQueryAndWait(pageObjects, QUERY_IOS);
    await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeVisible();
    await expect(discover.unsavedChangesIndicator()).toBeVisible();

    await discover.revertUnsavedChanges();
    await discover.waitUntilTabIsLoaded();

    await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();
    await expect(await unifiedTabs.getTabUnsavedIndicator(1)).toBeHidden();
    await expect(discover.unsavedChangesIndicator()).toBeHidden();
  });

  spaceTest(
    'persists modified tab indicators across refresh and clears on save',
    async ({ page, pageObjects }) => {
      const { discover, unifiedTabs } = pageObjects;
      const sessionName = createSessionName('unsaved-changes-refresh');

      await unifiedTabs.createNewTab();
      await discover.waitUntilTabIsLoaded();
      await unifiedTabs.createNewTab();
      await discover.waitUntilTabIsLoaded();
      await saveSession(pageObjects, sessionName);
      await expect(await unifiedTabs.getTabUnsavedIndicator(2)).toBeHidden();

      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();
      await submitQueryAndWait(pageObjects, QUERY_IOS);
      await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeVisible();
      await expect(discover.unsavedChangesIndicator()).toBeVisible();

      await unifiedTabs.selectTab(1);
      await discover.waitUntilTabIsLoaded();
      await submitQueryAndWait(pageObjects, QUERY_WINDOWS);
      await expect(await unifiedTabs.getTabUnsavedIndicator(1)).toBeVisible();
      await expect(await unifiedTabs.getTabUnsavedIndicator(2)).toBeHidden();

      await page.reload();
      await discover.waitUntilTabIsLoaded();

      await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeVisible();
      await expect(await unifiedTabs.getTabUnsavedIndicator(1)).toBeVisible();
      await expect(await unifiedTabs.getTabUnsavedIndicator(2)).toBeHidden();
      await expect(discover.unsavedChangesIndicator()).toBeVisible();

      await saveSession(pageObjects, sessionName);
      await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();
      await expect(await unifiedTabs.getTabUnsavedIndicator(1)).toBeHidden();
      await expect(discover.unsavedChangesIndicator()).toBeHidden();
    }
  );

  spaceTest(
    'refetches a modified tab when switching back after reverting changes',
    async ({ pageObjects }) => {
      const { discover, unifiedTabs } = pageObjects;
      const originalHitCount = await discover.getHitCountInt();

      await unifiedTabs.createNewTab();
      await discover.waitUntilTabIsLoaded();
      await expect(await unifiedTabs.getTabUnsavedIndicator(1)).toBeHidden();
      await saveSession(pageObjects, createSessionName('unsaved-changes-refetch'));

      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();
      await submitQueryAndWait(pageObjects, QUERY_IOS);
      await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeVisible();
      await expect(discover.unsavedChangesIndicator()).toBeVisible();
      expect(await discover.getHitCountInt()).not.toBe(originalHitCount);

      await unifiedTabs.selectTab(1);
      await discover.waitUntilTabIsLoaded();
      await discover.revertUnsavedChanges();
      await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();
      await expect(discover.unsavedChangesIndicator()).toBeHidden();

      await unifiedTabs.selectTab(0);
      await discover.waitUntilTabIsLoaded();
      expect(await discover.getHitCountInt()).toBe(originalHitCount);
    }
  );

  spaceTest(
    'does not mark a saved tab dirty when default columns are applied',
    async ({ discoverScoutSpace, pageObjects }) => {
      const { dataGrid, discover } = pageObjects;
      const sessionName = createSessionName('unsaved-changes-default-columns');

      expect(await dataGrid.getDataGridHeaderFieldTokens()).toStrictEqual([
        '@timestamp',
        'Summary',
      ]);
      await saveSession(pageObjects, sessionName);
      await expect(discover.unsavedChangesIndicator()).toBeHidden();

      await discoverScoutSpace.uiSettings.set({ defaultColumns: ['agent'] });
      await discover.goto({ queryMode: 'classic' });
      await discover.loadSavedSearch(sessionName);
      await discover.waitUntilTabIsLoaded();

      expect(await dataGrid.getDataGridHeaderFieldTokens()).toStrictEqual(['@timestamp', 'agent']);
      await expect(discover.unsavedChangesIndicator()).toBeHidden();
    }
  );

  spaceTest(
    'marks data-view switches dirty and clears after switching back',
    async ({ pageObjects }) => {
      const { discover, unifiedTabs } = pageObjects;

      await saveSession(pageObjects, createSessionName('unsaved-changes-data-view'));
      await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();

      await discover.selectDataView('kibana_sample_data_flights');
      await discover.waitUntilTabIsLoaded();
      await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeVisible();
      await expect(discover.unsavedChangesIndicator()).toBeVisible();

      await discover.selectDataView(testData.DEFAULT_DATA_VIEW);
      await discover.waitUntilTabIsLoaded();
      await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();
      await expect(discover.unsavedChangesIndicator()).toBeHidden();
    }
  );

  spaceTest(
    'marks ad hoc data-view switches dirty and clears after switching back',
    async ({ pageObjects }) => {
      const { discover, unifiedTabs } = pageObjects;

      await saveSession(pageObjects, createSessionName('unsaved-changes-ad-hoc-data-view'));
      await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();

      await discover.createDataViewFromSearchBar({ name: 'logstash', adHoc: true });
      await discover.waitUntilTabIsLoaded();
      await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeVisible();
      await expect(discover.unsavedChangesIndicator()).toBeVisible();

      await discover.selectDataView(testData.DEFAULT_DATA_VIEW);
      await discover.waitUntilTabIsLoaded();
      await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();
      await expect(discover.unsavedChangesIndicator()).toBeHidden();
    }
  );

  spaceTest(
    'tracks time range changes only when time restore is enabled',
    async ({ pageObjects }) => {
      const { datePicker, discover, unifiedTabs } = pageObjects;
      const initialTimeConfig = await datePicker.getTimeConfig();

      await saveSession(pageObjects, createSessionName('unsaved-changes-time-restore'), {
        storeTimeRange: true,
      });
      await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();

      await datePicker.setAbsoluteRange(UPDATED_TIME_RANGE_DISPLAY);
      await discover.waitUntilTabIsLoaded();
      await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeVisible();
      await expect(discover.unsavedChangesIndicator()).toBeVisible();

      await datePicker.setAbsoluteRange({
        from: initialTimeConfig.start,
        to: initialTimeConfig.end,
      });
      await discover.waitUntilTabIsLoaded();
      await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();
      await expect(discover.unsavedChangesIndicator()).toBeHidden();
    }
  );

  spaceTest('ignores time range changes when time restore is disabled', async ({ pageObjects }) => {
    const { datePicker, discover, unifiedTabs } = pageObjects;

    await saveSession(pageObjects, createSessionName('unsaved-changes-time-without-restore'));
    await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();

    await datePicker.setAbsoluteRange(UPDATED_TIME_RANGE_DISPLAY);
    await discover.waitUntilTabIsLoaded();

    await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();
    await expect(discover.unsavedChangesIndicator()).toBeHidden();
  });

  spaceTest('marks filter add and removal as dirty and clean', async ({ pageObjects }) => {
    const { discover, filterBar, unifiedTabs } = pageObjects;

    await saveSession(pageObjects, createSessionName('unsaved-changes-filter'));
    await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();

    await filterBar.addFilter({ field: FILTER_FIELD, operator: 'is', value: FILTER_VALUE });
    await discover.waitUntilTabIsLoaded();
    await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeVisible();
    await expect(discover.unsavedChangesIndicator()).toBeVisible();

    await filterBar.removeFilter(FILTER_FIELD);
    await discover.waitUntilTabIsLoaded();
    await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();
    await expect(discover.unsavedChangesIndicator()).toBeHidden();
  });

  spaceTest('marks a saved pinned filter dirty when negated', async ({ pageObjects }) => {
    const { discover, filterBar, unifiedTabs } = pageObjects;

    await filterBar.addFilter({ field: FILTER_FIELD, operator: 'is', value: FILTER_VALUE });
    await discover.waitUntilTabIsLoaded();
    await filterBar.toggleFilterPinned(FILTER_FIELD);
    await discover.waitUntilTabIsLoaded();

    await saveSession(pageObjects, createSessionName('unsaved-changes-pinned-filter'));
    expect(
      await filterBar.hasFilter({
        field: FILTER_FIELD,
        value: FILTER_VALUE,
        pinned: true,
      })
    ).toBe(true);
    await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();

    await filterBar.toggleFilterNegated(FILTER_FIELD);
    await discover.waitUntilTabIsLoaded();
    await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeVisible();
    await expect(discover.unsavedChangesIndicator()).toBeVisible();

    await filterBar.toggleFilterNegated(FILTER_FIELD);
    await discover.waitUntilTabIsLoaded();
    await expect(await unifiedTabs.getTabUnsavedIndicator(0)).toBeHidden();
    await expect(discover.unsavedChangesIndicator()).toBeHidden();
  });
});
