/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Multi-tab Discover session reset and uninitialized-tab restore flows.
 */

import { spaceTest, type ScoutTestFixtures } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { testData } from '../../fixtures/common';
import {
  createDataViewFromSearchBar,
  saveDiscoverSession,
  selectDataViewMode,
  waitForTabStateToPersist,
} from '../../fixtures/tabs/helpers';

spaceTest.describe(
  'tabs - multi-tab Discover session reset behavior',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.setTimeout(180_000);

    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
      await scoutSpace.savedObjects.load(testData.KIBANA_SAMPLE_DATA_FLIGHTS_INDEX_PATTERN_ARCHIVE);
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

    spaceTest(
      'should clear all tabs when starting a new session',
      async ({ pageObjects, page }) => {
        const { discover, unifiedTabs } = pageObjects;
        const sessionName = 'Clear tabs Discover session';

        await spaceTest.step('create and save a multi-tab session', async () => {
          await unifiedTabs.createNewTab();
          await discover.waitUntilTabIsLoaded();
          await unifiedTabs.createNewTab();
          await discover.waitUntilTabIsLoaded();
          expect(await unifiedTabs.getTabLabels()).toStrictEqual([
            'Untitled',
            'Untitled 2',
            'Untitled 3',
          ]);
          await saveDiscoverSession(page, sessionName);
          await expect(page.testSubj.locator('breadcrumb last')).toHaveText(sessionName);
        });

        await spaceTest.step('load the saved session', async () => {
          await discover.clickNewSearch();
          await discover.waitUntilTabIsLoaded();
          await discover.loadSavedSearch(sessionName);
          await discover.waitUntilTabIsLoaded();
          await expect(page.testSubj.locator('breadcrumb last')).toHaveText(sessionName);
          expect(await unifiedTabs.getTabLabels()).toStrictEqual([
            'Untitled',
            'Untitled 2',
            'Untitled 3',
          ]);
        });

        await spaceTest.step('clear loaded session', async () => {
          await discover.clickNewSearch();
          await discover.waitUntilTabIsLoaded();
          await expect(page.testSubj.locator('breadcrumb last')).toBeHidden();
          expect(await unifiedTabs.getTabLabels()).toStrictEqual(['Untitled']);
        });

        await spaceTest.step('add a second unsaved tab', async () => {
          await unifiedTabs.createNewTab();
          await discover.waitUntilTabIsLoaded();
          expect(await unifiedTabs.getTabLabels()).toStrictEqual(['Untitled', 'Untitled 2']);
        });

        await spaceTest.step('clear unsaved tabs', async () => {
          await discover.clickNewSearch();
          await discover.waitUntilTabIsLoaded();
          expect(await unifiedTabs.getTabLabels()).toStrictEqual(['Untitled']);
        });
      }
    );

    spaceTest(
      'should restore correct data view or ES|QL query for uninitialized tabs',
      async ({ pageObjects, page }) => {
        const { discover, unifiedTabs } = pageObjects;
        const sessionName = 'Uninitialized tabs session';
        const persistedDataView1 = 'logstash-*';
        const persistedDataView2 = 'kibana_sample_data_flights';
        const adHocDataView1 = 'logst*';
        const adHocDataView2 = 'log*';
        const esqlQuery1 = 'FROM logstash-* | LIMIT 100';
        const esqlQuery2 = 'FROM kibana_sample_data_flights | LIMIT 50';

        expect(await discover.getSelectedDataViewName()).toBe(persistedDataView1);

        await spaceTest.step('create tab 1: ad-hoc data view 1', async () => {
          await unifiedTabs.createNewTab();
          await discover.waitUntilTabIsLoaded();
          await createDataViewFromSearchBar(page, {
            name: 'logst',
            adHoc: true,
            hasTimeField: true,
          });
          await discover.waitUntilTabIsLoaded();
          expect(await discover.getSelectedDataViewName()).toBe(adHocDataView1);
        });

        await spaceTest.step('create tab 2: ES|QL 1', async () => {
          await unifiedTabs.createNewTab();
          await discover.waitUntilTabIsLoaded();
          await discover.writeAndSubmitEsqlQuery(esqlQuery1);
          expect(await discover.getEsqlQueryValue()).toBe(esqlQuery1);
        });

        await spaceTest.step('create tab 3: persisted data view 2', async () => {
          await unifiedTabs.createNewTab();
          await discover.waitUntilTabIsLoaded();
          await selectDataViewMode(page, { discardModal: true });
          await discover.waitUntilTabIsLoaded();
          await discover.selectDataView(persistedDataView2);
          await discover.waitUntilTabIsLoaded();
          expect(await discover.getSelectedDataViewName()).toBe(persistedDataView2);
        });

        await spaceTest.step('create tab 4: ad-hoc data view 2', async () => {
          await unifiedTabs.createNewTab();
          await discover.waitUntilTabIsLoaded();
          await createDataViewFromSearchBar(page, {
            name: 'log',
            adHoc: true,
            hasTimeField: true,
          });
          await discover.waitUntilTabIsLoaded();
          expect(await discover.getSelectedDataViewName()).toBe(adHocDataView2);
        });

        await spaceTest.step('create tab 5: ES|QL 2', async () => {
          await unifiedTabs.createNewTab();
          await discover.waitUntilTabIsLoaded();
          await discover.writeAndSubmitEsqlQuery(esqlQuery2);
          expect(await discover.getEsqlQueryValue()).toBe(esqlQuery2);
        });

        await spaceTest.step('refresh and validate all tabs', async () => {
          await waitForTabStateToPersist(page);
          await page.reload();
          await discover.waitUntilTabIsLoaded();
          await expect
            .poll(async () => discover.getEsqlQueryValue(), { timeout: 30_000 })
            .toBe(esqlQuery2);
          await expectTabState(pageObjects, [
            { index: 4, dataView: adHocDataView2 },
            { index: 3, dataView: persistedDataView2 },
            { index: 2, esqlQuery: esqlQuery1 },
            { index: 1, dataView: adHocDataView1 },
            { index: 0, dataView: persistedDataView1 },
          ]);
        });

        await spaceTest.step('save as new session', async () => {
          await saveDiscoverSession(page, sessionName);
          await expect(page.testSubj.locator('breadcrumb last')).toHaveText(sessionName);
        });

        await spaceTest.step('validate all tabs after save', async () => {
          expect(await discover.getSelectedDataViewName()).toBe(persistedDataView1);
          await expectTabState(pageObjects, [
            { index: 1, dataView: adHocDataView1 },
            { index: 2, esqlQuery: esqlQuery1 },
            { index: 3, dataView: persistedDataView2 },
            { index: 4, dataView: adHocDataView2 },
            { index: 5, esqlQuery: esqlQuery2 },
          ]);
        });

        await spaceTest.step('clear session and reload from saved', async () => {
          await discover.clickNewSearch();
          await discover.waitUntilTabIsLoaded();
          await expect(page.testSubj.locator('breadcrumb last')).toBeHidden();
          await discover.loadSavedSearch(sessionName);
          await discover.waitUntilTabIsLoaded();
          await expect(page.testSubj.locator('breadcrumb last')).toHaveText(sessionName);
        });

        await spaceTest.step('validate all tabs after reload', async () => {
          expect(await discover.getSelectedDataViewName()).toBe(persistedDataView1);
          await expectTabState(pageObjects, [
            { index: 1, dataView: adHocDataView1 },
            { index: 2, esqlQuery: esqlQuery1 },
            { index: 3, dataView: persistedDataView2 },
            { index: 4, dataView: adHocDataView2 },
            { index: 5, esqlQuery: esqlQuery2 },
          ]);
        });
      }
    );
  }
);

type DiscoverPageObjects = ScoutTestFixtures['pageObjects'];

const expectTabState = async (
  pageObjects: DiscoverPageObjects,
  expectedStates: Array<{ index: number; dataView?: string; esqlQuery?: string }>
) => {
  const { discover, unifiedTabs } = pageObjects;
  for (const expectedState of expectedStates) {
    await unifiedTabs.selectTab(expectedState.index);
    await discover.waitUntilTabIsLoaded();
    if (expectedState.dataView) {
      expect(await discover.getSelectedDataViewName()).toBe(expectedState.dataView);
    }
    if (expectedState.esqlQuery) {
      expect(await discover.getEsqlQueryValue()).toBe(expectedState.esqlQuery);
    }
  }
};
