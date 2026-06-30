/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Multi-tab save/load flows.
 *
 * Validates saving and loading multi-tab Discover sessions with persisted
 * data views, ad-hoc data views, and ES|QL tabs.
 */

import { spaceTest } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { testData } from '../../fixtures/common';
import {
  saveDiscoverSession,
  createDataViewFromSearchBar,
  changeVisShape,
  getCurrentVisTitle,
  addFieldColumn,
  getHitCount,
  getSelectedSidebarFields,
  waitForTabStateToPersist,
} from '../../fixtures/tabs/helpers';
import {
  AD_HOC_TAB,
  ESQL_TAB,
  PERSISTED_TAB,
} from '../../fixtures/tabs/discover_session_test_data';
import { createMultiTabDiscoverSession } from '../../fixtures/tabs/discover_session_setup';

const SAVED_SESSION_NAME = 'Saved multi-tab Discover session';
const LOADED_SESSION_NAME = 'Loaded multi-tab Discover session';
const UNSAVED_CHANGES_SESSION_NAME = 'Unsaved changes Discover session';

spaceTest.describe('tabs - multi-tab Discover sessions', { tag: '@local-stateful-classic' }, () => {
  spaceTest.setTimeout(180_000);

  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
    await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
    await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsAdmin();
    await pageObjects.discover.goto({ queryMode: 'classic' });
    await pageObjects.discover.waitUntilTabIsLoaded();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('should support saving a multi-tab Discover session', async ({ pageObjects, page }) => {
    const { discover, datePicker, queryBar, unifiedTabs } = pageObjects;

    await spaceTest.step('configure persisted data view tab', async () => {
      await datePicker.setAbsoluteRange(PERSISTED_TAB.time);
      await queryBar.setQuery(PERSISTED_TAB.query);
      await discover.submitQuery();
      await discover.waitUntilTabIsLoaded();
      await addFieldColumn(page, PERSISTED_TAB.column1);
      await unifiedTabs.editTabLabel(0, PERSISTED_TAB.label);
      await discover.setChartInterval(PERSISTED_TAB.chartIntervalTitle);
      expect(await getHitCount(page)).toBe(PERSISTED_TAB.hitCount);
    });

    await spaceTest.step('configure ad hoc data view tab', async () => {
      await unifiedTabs.createNewTab();
      await discover.waitUntilTabIsLoaded();
      await datePicker.setAbsoluteRange(AD_HOC_TAB.time);
      await createDataViewFromSearchBar(page, {
        name: 'logs',
        adHoc: true,
        hasTimeField: true,
      });
      await discover.waitUntilTabIsLoaded();
      await queryBar.setQuery(AD_HOC_TAB.query);
      await discover.submitQuery();
      await discover.waitUntilTabIsLoaded();
      await addFieldColumn(page, AD_HOC_TAB.column1);
      await unifiedTabs.editTabLabel(1, AD_HOC_TAB.label);
      expect(await getHitCount(page)).toBe(AD_HOC_TAB.hitCount);
    });

    await spaceTest.step('configure ES|QL tab', async () => {
      await unifiedTabs.createNewTab();
      await discover.waitUntilTabIsLoaded();
      await datePicker.setAbsoluteRange(ESQL_TAB.time);
      await discover.writeAndSubmitEsqlQuery(ESQL_TAB.query);
      await changeVisShape(page, ESQL_TAB.visShape);
      await unifiedTabs.editTabLabel(2, ESQL_TAB.label);
      expect(await getHitCount(page)).toBe(ESQL_TAB.hitCount);
    });

    await spaceTest.step('refresh and validate tab labels', async () => {
      await unifiedTabs.selectTab(0);
      await waitForTabStateToPersist(page);
      await page.reload();
      await discover.waitUntilTabIsLoaded();
      expect(await unifiedTabs.getTabLabels()).toStrictEqual([
        PERSISTED_TAB.label,
        AD_HOC_TAB.label,
        ESQL_TAB.label,
      ]);
    });

    await spaceTest.step('validate persisted tab after refresh', async () => {
      expect(await getHitCount(page)).toBe(PERSISTED_TAB.hitCount);
      expect(await queryBar.getQuery()).toBe(PERSISTED_TAB.query);
      expect(await discover.getChartInterval()).toBe(PERSISTED_TAB.chartIntervalValue);
      expect(await getSelectedSidebarFields(page)).toStrictEqual([PERSISTED_TAB.column1]);
      expect(await discover.getSelectedDataViewName()).toBe(PERSISTED_TAB.dataView);
      expect(await datePicker.getTimeConfig()).toStrictEqual({
        start: PERSISTED_TAB.timeISO.start,
        end: PERSISTED_TAB.timeISO.end,
      });
    });

    await spaceTest.step('validate ad hoc tab after refresh', async () => {
      await unifiedTabs.selectTab(1);
      await discover.waitUntilTabIsLoaded();
      expect(await getHitCount(page)).toBe(AD_HOC_TAB.hitCount);
      expect(await queryBar.getQuery()).toBe(AD_HOC_TAB.query);
      expect(await getSelectedSidebarFields(page)).toStrictEqual([AD_HOC_TAB.column1]);
      expect(await discover.getSelectedDataViewName()).toBe(AD_HOC_TAB.dataView);
      expect(await datePicker.getTimeConfig()).toStrictEqual({
        start: AD_HOC_TAB.timeISO.start,
        end: AD_HOC_TAB.timeISO.end,
      });
    });

    await spaceTest.step('validate ES|QL tab after refresh', async () => {
      await unifiedTabs.selectTab(2);
      await discover.waitUntilTabIsLoaded();
      expect(await getHitCount(page)).toBe(ESQL_TAB.hitCount);
      expect(await discover.getEsqlQueryValue()).toBe(ESQL_TAB.query);
      expect(await getCurrentVisTitle(page)).toBe(ESQL_TAB.visShape);
      expect(await datePicker.getTimeConfig()).toStrictEqual({
        start: ESQL_TAB.timeISO.start,
        end: ESQL_TAB.timeISO.end,
      });
    });

    await spaceTest.step('save the session with time range', async () => {
      await unifiedTabs.selectTab(0);
      await waitForTabStateToPersist(page);
      await page.reload();
      await discover.waitUntilTabIsLoaded();
      expect(await unifiedTabs.getTabLabels()).toStrictEqual([
        PERSISTED_TAB.label,
        AD_HOC_TAB.label,
        ESQL_TAB.label,
      ]);
      expect(await discover.getSelectedDataViewName()).toBe(PERSISTED_TAB.dataView);
      await saveDiscoverSession(page, SAVED_SESSION_NAME, { storeTimeRange: true });
      await expect(page.testSubj.locator('breadcrumb last')).toHaveText(SAVED_SESSION_NAME);
      await expect(page.testSubj.locator('split-button-notification-indicator')).toBeHidden();
    });

    await spaceTest.step('validate persisted tab after save', async () => {
      expect(await getHitCount(page)).toBe(PERSISTED_TAB.hitCount);
      expect(await queryBar.getQuery()).toBe(PERSISTED_TAB.query);
      expect(await discover.getChartInterval()).toBe(PERSISTED_TAB.chartIntervalValue);
      expect(await getSelectedSidebarFields(page)).toStrictEqual([PERSISTED_TAB.column1]);
      expect(await discover.getSelectedDataViewName()).toBe(PERSISTED_TAB.dataView);
      expect(await datePicker.getTimeConfig()).toStrictEqual({
        start: PERSISTED_TAB.timeISO.start,
        end: PERSISTED_TAB.timeISO.end,
      });
    });

    await spaceTest.step('validate ad hoc tab after save', async () => {
      await unifiedTabs.selectTab(1);
      await discover.waitUntilTabIsLoaded();
      expect(await getHitCount(page)).toBe(AD_HOC_TAB.hitCount);
      expect(await queryBar.getQuery()).toBe(AD_HOC_TAB.query);
      expect(await getSelectedSidebarFields(page)).toStrictEqual([AD_HOC_TAB.column1]);
      expect(await discover.getSelectedDataViewName()).toBe(AD_HOC_TAB.dataView);
      expect(await datePicker.getTimeConfig()).toStrictEqual({
        start: AD_HOC_TAB.timeISO.start,
        end: AD_HOC_TAB.timeISO.end,
      });
    });

    await spaceTest.step('validate ES|QL tab after save', async () => {
      await unifiedTabs.selectTab(2);
      await discover.waitUntilTabIsLoaded();
      expect(await getHitCount(page)).toBe(ESQL_TAB.hitCount);
      expect(await discover.getEsqlQueryValue()).toBe(ESQL_TAB.query);
      expect(await getCurrentVisTitle(page)).toBe(ESQL_TAB.visShape);
      expect(await datePicker.getTimeConfig()).toStrictEqual({
        start: ESQL_TAB.timeISO.start,
        end: ESQL_TAB.timeISO.end,
      });
    });
  });

  spaceTest(
    'should support loading a multi-tab Discover session',
    async ({ pageObjects, page }) => {
      const { discover, datePicker, queryBar, unifiedTabs } = pageObjects;

      await createMultiTabDiscoverSession(pageObjects, page, LOADED_SESSION_NAME);
      await discover.clickNewSearch();
      await discover.waitUntilTabIsLoaded();
      await discover.loadSavedSearch(LOADED_SESSION_NAME);
      await discover.waitUntilTabIsLoaded();

      await expect(page.testSubj.locator('breadcrumb last')).toHaveText(LOADED_SESSION_NAME);
      expect(await unifiedTabs.getTabLabels()).toStrictEqual([
        PERSISTED_TAB.label,
        AD_HOC_TAB.label,
        ESQL_TAB.label,
      ]);
      await expect(page.testSubj.locator('split-button-notification-indicator')).toBeHidden();

      await spaceTest.step('validate persisted tab', async () => {
        expect(await getHitCount(page)).toBe(PERSISTED_TAB.hitCount);
        expect(await queryBar.getQuery()).toBe(PERSISTED_TAB.query);
        expect(await discover.getChartInterval()).toBe(PERSISTED_TAB.chartIntervalValue);
        expect(await getSelectedSidebarFields(page)).toStrictEqual([PERSISTED_TAB.column1]);
        expect(await discover.getSelectedDataViewName()).toBe(PERSISTED_TAB.dataView);
        expect(await datePicker.getTimeConfig()).toStrictEqual({
          start: PERSISTED_TAB.timeISO.start,
          end: PERSISTED_TAB.timeISO.end,
        });
      });

      await spaceTest.step('validate ad hoc tab', async () => {
        await unifiedTabs.selectTab(1);
        await discover.waitUntilTabIsLoaded();
        expect(await getHitCount(page)).toBe(AD_HOC_TAB.hitCount);
        expect(await queryBar.getQuery()).toBe(AD_HOC_TAB.query);
        expect(await getSelectedSidebarFields(page)).toStrictEqual([AD_HOC_TAB.column1]);
        expect(await discover.getSelectedDataViewName()).toBe(AD_HOC_TAB.dataView);
        expect(await datePicker.getTimeConfig()).toStrictEqual({
          start: AD_HOC_TAB.timeISO.start,
          end: AD_HOC_TAB.timeISO.end,
        });
      });

      await spaceTest.step('validate ES|QL tab', async () => {
        await unifiedTabs.selectTab(2);
        await discover.waitUntilTabIsLoaded();
        expect(await getHitCount(page)).toBe(ESQL_TAB.hitCount);
        expect(await discover.getEsqlQueryValue()).toBe(ESQL_TAB.query);
        expect(await getCurrentVisTitle(page)).toBe(ESQL_TAB.visShape);
        expect(await datePicker.getTimeConfig()).toStrictEqual({
          start: ESQL_TAB.timeISO.start,
          end: ESQL_TAB.timeISO.end,
        });
      });
    }
  );

  spaceTest(
    'should locally persist unsaved changes to a multi-tab session',
    async ({ pageObjects, page }) => {
      const { discover, datePicker, queryBar, unifiedTabs } = pageObjects;

      await createMultiTabDiscoverSession(pageObjects, page, UNSAVED_CHANGES_SESSION_NAME);
      await discover.clickNewSearch();
      await discover.waitUntilTabIsLoaded();
      await discover.loadSavedSearch(UNSAVED_CHANGES_SESSION_NAME);
      await discover.waitUntilTabIsLoaded();
      expect(await discover.getSelectedDataViewName()).toBe(PERSISTED_TAB.dataView);

      const persistedUnsaved = {
        time: { from: 'Sep 20, 2015 @ 01:00:00.000', to: 'Sep 22, 2015 @ 01:00:00.000' },
        timeISO: { start: '2015-09-20T01:00:00.000Z', end: '2015-09-22T01:00:00.000Z' },
        query: 'test and extension : png',
        columns: [PERSISTED_TAB.column1, PERSISTED_TAB.column2],
      };
      const adHocUnsaved = {
        time: { from: 'Sep 20, 2015 @ 07:00:00.000', to: 'Sep 22, 2015 @ 07:00:00.000' },
        timeISO: { start: '2015-09-20T07:00:00.000Z', end: '2015-09-22T07:00:00.000Z' },
        query: 'extension : png',
        columns: [AD_HOC_TAB.column1, AD_HOC_TAB.column2],
      };
      const esqlUnsaved = {
        time: { from: 'Sep 20, 2015 @ 13:00:00.000', to: 'Sep 22, 2015 @ 13:00:00.000' },
        timeISO: { start: '2015-09-20T13:00:00.000Z', end: '2015-09-22T13:00:00.000Z' },
        query: 'FROM logstash-* | SORT @timestamp DESC | LIMIT 25',
        visShape: 'Area',
      };

      let persistedUnsavedCount: string;
      let adHocUnsavedCount: string;
      let esqlUnsavedCount: string;

      await spaceTest.step('make unsaved changes to persisted tab', async () => {
        await datePicker.setAbsoluteRange(persistedUnsaved.time);
        await queryBar.setQuery(persistedUnsaved.query);
        await discover.submitQuery();
        await discover.waitUntilTabIsLoaded();
        await addFieldColumn(page, PERSISTED_TAB.column2);
        persistedUnsavedCount = await getHitCount(page);
      });

      await spaceTest.step('make unsaved changes to ad hoc tab', async () => {
        await unifiedTabs.selectTab(1);
        await discover.waitUntilTabIsLoaded();
        expect(await discover.getSelectedDataViewName()).toBe(AD_HOC_TAB.dataView);
        await datePicker.setAbsoluteRange(adHocUnsaved.time);
        await queryBar.setQuery(adHocUnsaved.query);
        await discover.submitQuery();
        await discover.waitUntilTabIsLoaded();
        await addFieldColumn(page, AD_HOC_TAB.column2);
        adHocUnsavedCount = await getHitCount(page);
      });

      await spaceTest.step('make unsaved changes to ES|QL tab', async () => {
        await unifiedTabs.selectTab(2);
        await discover.waitUntilTabIsLoaded();
        await datePicker.setAbsoluteRange(esqlUnsaved.time);
        await discover.codeEditor.setCodeEditorValue(esqlUnsaved.query);
        await page.testSubj.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();
        await changeVisShape(page, esqlUnsaved.visShape);
        esqlUnsavedCount = await getHitCount(page);
      });

      await expect(page.testSubj.locator('split-button-notification-indicator')).toBeVisible();

      await spaceTest.step('refresh and validate unsaved changes persist', async () => {
        await waitForTabStateToPersist(page);
        await page.reload();
        await discover.waitUntilTabIsLoaded();
      });

      await spaceTest.step('validate persisted tab unsaved changes', async () => {
        await unifiedTabs.selectTab(0);
        await discover.waitUntilTabIsLoaded();
        expect(await queryBar.getQuery()).toBe(persistedUnsaved.query);
        expect(await datePicker.getTimeConfig()).toStrictEqual({
          start: persistedUnsaved.timeISO.start,
          end: persistedUnsaved.timeISO.end,
        });
        expect(await getSelectedSidebarFields(page)).toStrictEqual(persistedUnsaved.columns);
        expect(await discover.getSelectedDataViewName()).toBe(PERSISTED_TAB.dataView);
        expect(await getHitCount(page)).toBe(persistedUnsavedCount!);
      });

      await spaceTest.step('validate ad hoc tab unsaved changes', async () => {
        await unifiedTabs.selectTab(1);
        await discover.waitUntilTabIsLoaded();
        expect(await queryBar.getQuery()).toBe(adHocUnsaved.query);
        expect(await datePicker.getTimeConfig()).toStrictEqual({
          start: adHocUnsaved.timeISO.start,
          end: adHocUnsaved.timeISO.end,
        });
        expect(await getSelectedSidebarFields(page)).toStrictEqual(adHocUnsaved.columns);
        expect(await discover.getSelectedDataViewName()).toBe(AD_HOC_TAB.dataView);
        expect(await getHitCount(page)).toBe(adHocUnsavedCount!);
      });

      await spaceTest.step('validate ES|QL tab unsaved changes', async () => {
        await unifiedTabs.selectTab(2);
        await discover.waitUntilTabIsLoaded();
        expect(await discover.getEsqlQueryValue()).toBe(esqlUnsaved.query);
        expect(await datePicker.getTimeConfig()).toStrictEqual({
          start: esqlUnsaved.timeISO.start,
          end: esqlUnsaved.timeISO.end,
        });
        expect(await getCurrentVisTitle(page)).toBe(esqlUnsaved.visShape);
        expect(await getHitCount(page)).toBe(esqlUnsavedCount!);
      });

      await expect(page.testSubj.locator('split-button-notification-indicator')).toBeVisible();
    }
  );
});
