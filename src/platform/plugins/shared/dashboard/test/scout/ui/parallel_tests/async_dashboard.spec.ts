/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { spaceTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { UI_SETTINGS } from '@kbn/data-plugin/common';
import {
  SAMPLE_DATA_SET_ID,
  SAMPLE_DATA_DASHBOARD_ID,
  SAMPLE_DATA_VIEW,
  SAMPLE_DATA_TIME_RANGE,
  SAMPLE_DATA_RANGE,
} from '../constants';

spaceTest.describe.skip('Flights dashboard (sample data)', { tag: tags.deploymentAgnostic }, () => {
  spaceTest.beforeAll(async ({ apiServices, scoutSpace }) => {
    await scoutSpace.savedObjects.cleanStandardList();

    // install sample flights data
    await apiServices.sampleData.install(SAMPLE_DATA_SET_ID, scoutSpace.id);

    await expect
      .poll(
        async () => {
          const { data: dataViews } = await apiServices.dataViews.find(
            (dataView) => dataView.name === SAMPLE_DATA_VIEW || dataView.title === SAMPLE_DATA_VIEW,
            scoutSpace.id
          );
          return dataViews.length;
        },
        // Sample data install can take longer than Scout's default polling window.
        { timeout: 60_000 }
      )
      .toBeGreaterThan(0);

    await scoutSpace.uiSettings.set({
      [UI_SETTINGS.TIMEPICKER_QUICK_RANGES]: JSON.stringify(SAMPLE_DATA_RANGE),
    });
  });

  spaceTest.afterAll(async ({ apiServices, scoutSpace }) => {
    // remove sample flights data
    await apiServices.sampleData.remove(SAMPLE_DATA_SET_ID, scoutSpace.id);
  });

  spaceTest('loads dashboard and renders panels', async ({ browserAuth, page, pageObjects }) => {
    await spaceTest.step('login and prepare Discover', async () => {
      await browserAuth.loginAsAdmin();
      await pageObjects.discover.goto({ queryMode: 'classic' });
      await pageObjects.discover.selectDataView(SAMPLE_DATA_VIEW);
      await pageObjects.datePicker.setCommonlyUsedTime(SAMPLE_DATA_TIME_RANGE);
      await pageObjects.discover.waitUntilSearchingHasFinished();
      expect(await pageObjects.discover.getHitCountInt()).toBeGreaterThan(0);
    });

    await spaceTest.step('open flights dashboard and validate panels', async () => {
      await pageObjects.dashboard.openDashboardWithId(SAMPLE_DATA_DASHBOARD_ID);
      await pageObjects.datePicker.setCommonlyUsedTime(SAMPLE_DATA_TIME_RANGE);
      expect(await pageObjects.dashboard.getPanelCount()).toBeGreaterThan(0);
    });

    await spaceTest.step('return to dashboard and validate panels', async () => {
      await pageObjects.dashboard.openDashboardWithId(SAMPLE_DATA_DASHBOARD_ID);

      await expect.poll(async () => await pageObjects.dashboard.getControlCount()).toBe(3);

      // check panels rendered
      await expect.poll(async () => await pageObjects.dashboard.getPanelCount()).toBe(16);

      // check charts rendered
      await expect.poll(async () => await page.testSubj.locator('xyVisChart').count()).toBe(5);

      // Checking saved searches rendered
      await expect
        .poll(async () => await pageObjects.dashboard.getSavedSearchRowCount())
        .toBeGreaterThan(10);

      // Checking tag clouds rendered
      const legendLabels = page.locator('[data-testid="echLegendItemLabel"]');
      const legendTexts = await legendLabels.allInnerTexts();
      ['Sunny', 'Rain', 'Clear', 'Cloudy', 'Hail'].forEach((value) => {
        expect(legendTexts).toContain(value);
      });

      // Checking vega chart rendered
      await expect(page.locator('.vgaVis__view')).toBeVisible();
    });
  });
});
