/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Sample-size persistence across saved searches and dashboard saved-search panels.
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest } from '@kbn/scout';
import { expectSampleSizeFooter } from '../../../fixtures/common/helpers';
import { testData } from '../../../fixtures/common';

const CUSTOM_SAMPLE_SIZE_FOR_SAVED_SEARCH = 150;
const CUSTOM_SAMPLE_SIZE_FOR_DASHBOARD_PANEL = 10;

spaceTest.describe(
  'Discover data grid sample size - saved search and Dashboard',
  { tag: '@local-stateful-classic' },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.savedObjects.load(testData.DISCOVER_KBN_ARCHIVE);
      await scoutSpace.uiSettings.setDefaultIndex(testData.DEFAULT_DATA_VIEW);
      await scoutSpace.uiSettings.setDefaultTime(testData.DEFAULT_TIME_RANGE);
    });

    spaceTest.beforeEach(async ({ browserAuth, pageObjects, scoutSpace }) => {
      await browserAuth.loginAsPrivilegedUser();
      await pageObjects.discover.setQueryMode('classic');
      await scoutSpace.uiSettings.set({
        'discover:sampleSize': testData.DEFAULT_SAMPLE_SIZE,
        'discover:rowHeightOption': 0,
        'discover:sampleRowsPerPage': testData.DEFAULT_ROWS_PER_PAGE,
      });
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

    spaceTest('saves a custom sample size with a search', async ({ pageObjects, scoutSpace }) => {
      const { dataGrid, discover } = pageObjects;
      const savedSearchName = `With sample size ${scoutSpace.id}`;

      await spaceTest.step('save a search with a custom sample size', async () => {
        await discover.goto();
        await dataGrid.waitUntilSearchingHasFinished();
        await dataGrid.waitForDocTableRendered();
        await dataGrid.openGridDisplaySettings();
        expect(await dataGrid.getCurrentSampleSize()).toBe(testData.DEFAULT_SAMPLE_SIZE);

        await dataGrid.setSampleSize(CUSTOM_SAMPLE_SIZE_FOR_SAVED_SEARCH);
        await discover.saveSearch(savedSearchName);

        await dataGrid.openGridDisplaySettings();
        expect(await dataGrid.getCurrentSampleSize()).toBe(CUSTOM_SAMPLE_SIZE_FOR_SAVED_SEARCH);
        await expectSampleSizeFooter({
          pageObjects,
          sampleSize: CUSTOM_SAMPLE_SIZE_FOR_SAVED_SEARCH,
        });
      });

      await spaceTest.step('new Discover sessions use the default sample size', async () => {
        await discover.clickNewSearch();
        await dataGrid.waitUntilSearchingHasFinished();
        await dataGrid.waitForDocTableRendered();
        await dataGrid.openGridDisplaySettings();

        expect(await dataGrid.getCurrentSampleSize()).toBe(testData.DEFAULT_SAMPLE_SIZE);
        await expectSampleSizeFooter({ pageObjects, sampleSize: testData.DEFAULT_SAMPLE_SIZE });
      });

      await spaceTest.step('loading the saved search restores the custom sample size', async () => {
        await discover.loadSavedSearch(savedSearchName);
        await dataGrid.waitUntilSearchingHasFinished();
        await dataGrid.waitForDocTableRendered();
        await dataGrid.openGridDisplaySettings();

        expect(await dataGrid.getCurrentSampleSize()).toBe(CUSTOM_SAMPLE_SIZE_FOR_SAVED_SEARCH);
        await expectSampleSizeFooter({
          pageObjects,
          sampleSize: CUSTOM_SAMPLE_SIZE_FOR_SAVED_SEARCH,
        });
      });

      await spaceTest.step(
        'loading an archived saved search uses the default sample size',
        async () => {
          await discover.loadSavedSearch(testData.SAVED_SEARCH_TITLE);
          await dataGrid.waitUntilSearchingHasFinished();
          await dataGrid.waitForDocTableRendered();
          await dataGrid.openGridDisplaySettings();

          expect(await dataGrid.getCurrentSampleSize()).toBe(testData.DEFAULT_SAMPLE_SIZE);
          await expectSampleSizeFooter({ pageObjects, sampleSize: testData.DEFAULT_SAMPLE_SIZE });
        }
      );
    });

    spaceTest('uses the default sample size on Dashboard', async ({ pageObjects }) => {
      const { dashboard, dataGrid } = pageObjects;

      await dashboard.openNewDashboard();
      await dashboard.addSavedSearch(testData.SAVED_SEARCH_TITLE);
      await dataGrid.waitUntilSearchingHasFinished();
      await dataGrid.waitForDocTableRendered();

      await dataGrid.openGridDisplaySettings();
      expect(await dataGrid.getCurrentSampleSize()).toBe(testData.DEFAULT_SAMPLE_SIZE);
      await expectSampleSizeFooter({ pageObjects, sampleSize: testData.DEFAULT_SAMPLE_SIZE });
    });

    spaceTest(
      'uses a custom sample size on Dashboard when specified',
      async ({ page, pageObjects, scoutSpace }) => {
        const { dashboard, dataGrid, discover } = pageObjects;
        const savedSearchName = `dashboard sample size search ${scoutSpace.id}`;
        const dashboardName = `dashboard sample size ${scoutSpace.id}`;

        await spaceTest.step('save a search with a custom sample size', async () => {
          await discover.goto();
          await dataGrid.waitUntilSearchingHasFinished();
          await dataGrid.waitForDocTableRendered();
          await dataGrid.openGridDisplaySettings();
          await dataGrid.setSampleSize(CUSTOM_SAMPLE_SIZE_FOR_SAVED_SEARCH);
          await discover.saveSearch(savedSearchName);
        });

        await spaceTest.step('override the sample size on a Dashboard panel', async () => {
          await dashboard.openNewDashboard();
          await dashboard.addSavedSearch(savedSearchName);
          await dataGrid.waitUntilSearchingHasFinished();
          await dataGrid.waitForDocTableRendered();

          await dataGrid.openGridDisplaySettings();
          expect(await dataGrid.getCurrentSampleSize()).toBe(CUSTOM_SAMPLE_SIZE_FOR_SAVED_SEARCH);

          await dataGrid.setSampleSize(CUSTOM_SAMPLE_SIZE_FOR_DASHBOARD_PANEL);
          await dataGrid.openGridDisplaySettings();
          expect(await dataGrid.getCurrentSampleSize()).toBe(
            CUSTOM_SAMPLE_SIZE_FOR_DASHBOARD_PANEL
          );
          await expectSampleSizeFooter({
            pageObjects,
            sampleSize: CUSTOM_SAMPLE_SIZE_FOR_DASHBOARD_PANEL,
          });
        });

        await spaceTest.step(
          'the Dashboard panel override persists after saving and reload',
          async () => {
            await dashboard.saveDashboard(dashboardName);
            await page.reload();
            await dashboard.waitForRenderComplete();
            await dataGrid.waitUntilSearchingHasFinished();
            await dataGrid.waitForDocTableRendered();

            await dataGrid.openGridDisplaySettings();
            expect(await dataGrid.getCurrentSampleSize()).toBe(
              CUSTOM_SAMPLE_SIZE_FOR_DASHBOARD_PANEL
            );
            await expectSampleSizeFooter({
              pageObjects,
              sampleSize: CUSTOM_SAMPLE_SIZE_FOR_DASHBOARD_PANEL,
            });
          }
        );
      }
    );
  }
);
