/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import type { PageObjects, ScoutPage } from '@kbn/scout';
import { testData } from '../fixtures';

const STATIC_MAX_VALUE = '100000';

// Hardcoded to match style output, same approach as group6/metric_primary_and_breakdown.ts FTR tests.
const DEFAULT_PROGRESS_BAR_FILL_COLOR = 'rgb(97, 162, 255)';
const DYNAMIC_PROGRESS_BAR_FILL_COLOR = 'rgb(36, 194, 146)';
const STATIC_PROGRESS_BAR_FILL_COLOR = 'rgb(0, 0, 0)';

function progressBarLocator(page: ScoutPage) {
  // The metric progress bar renders through the charts `Meter` component; the
  // colored fill lives on `.echMeterFillPaint` inside the progress container.
  return page.locator('.echSingleMetricProgress .echMeterFillPaint');
}

async function configureStaticMaxValueForProgressBar(
  page: ScoutPage,
  lens: PageObjects['lens']
): Promise<void> {
  await page.testSubj.locator('lnsMetric_maxDimensionPanel > lns-empty-dimension').click();
  await expect(page.testSubj.locator('lns-indexPattern-dimensionContainerClose')).toBeVisible();

  const staticValueTab = page.testSubj.locator('lens-dimensionTabs-static_value');
  if (await staticValueTab.isVisible()) {
    await staticValueTab.click();
  }

  const staticValueInput = page.getByTestId('lns-indexPattern-static_value-input');
  await expect(staticValueInput).toBeVisible();
  await staticValueInput.fill(STATIC_MAX_VALUE);
  await page.keyboard.press('Tab');

  await lens.closeDimensionEditorPanel();
}

async function openPrimaryMetricDimensionEditor(page: ScoutPage): Promise<void> {
  await page.testSubj
    .locator('lnsMetric_primaryMetricDimensionPanel > lns-dimensionTrigger')
    .click();
  await expect(page.testSubj.locator('lns-indexPattern-dimensionContainerClose')).toBeVisible();
}

async function closePrimaryMetricDimensionEditor(page: ScoutPage): Promise<void> {
  await page.testSubj.locator('lns-indexPattern-dimensionContainerClose').click();
  await expect(page.testSubj.locator('lns-indexPattern-dimensionContainerClose')).toBeHidden();
}

async function setupMetricProgressBarInLensEditor(
  browserAuth: { loginAsPrivilegedUser: () => Promise<void> },
  page: ScoutPage,
  pageObjects: PageObjects
): Promise<void> {
  const { lens, visualize } = pageObjects;

  await browserAuth.loginAsPrivilegedUser();
  await visualize.goto();
  await visualize.openNewVisualizationWizard();
  await visualize.clickVisType('lens');
  await lens.waitForLensApp();
  await lens.switchToVisualization('lnsMetric');

  await lens.configureDimension({
    dimension: 'lnsMetric_primaryMetricDimensionPanel > lns-empty-dimension',
    operation: 'average',
    field: 'bytes',
  });

  await configureStaticMaxValueForProgressBar(page, lens);
  await expect(page.getByTestId('mtrVis')).toBeVisible();

  await expect(page.locator('.echSingleMetricProgress')).toBeVisible();
  await expect(page.getByRole('meter')).toBeVisible();
}

spaceTest.describe(
  'Lens metric progress bar in Lens editor',
  { tag: tags.stateful.classic },
  () => {
    let storedDataViewId: string | undefined;

    spaceTest.beforeAll(async ({ scoutSpace, apiServices }) => {
      await scoutSpace.uiSettings.set({
        defaultIndex: testData.DATA_VIEW_ID.LOGSTASH,
        'dateFormat:tz': 'UTC',
        'timepicker:timeDefaults': JSON.stringify({
          from: testData.LOGSTASH_IN_RANGE_DATES.from,
          to: testData.LOGSTASH_IN_RANGE_DATES.to,
        }),
      });

      const { data: dataView } = await apiServices.dataViews.create({
        title: testData.DATA_VIEW_ID.LOGSTASH,
        name: `scout-metric-progress-bar-editor-dv-${Date.now()}`,
        timeFieldName: '@timestamp',
        spaceId: scoutSpace.id,
      });
      storedDataViewId = dataView.id;
    });

    spaceTest.afterAll(async ({ scoutSpace, apiServices }) => {
      if (storedDataViewId) {
        await apiServices.dataViews.delete(storedDataViewId, scoutSpace.id);
      }
      await scoutSpace.uiSettings.unset('defaultIndex', 'dateFormat:tz', 'timepicker:timeDefaults');
      await scoutSpace.savedObjects.cleanStandardList();
    });

    spaceTest(
      'uses default progress bar fill color when no custom color is set',
      async ({ browserAuth, page, pageObjects }) => {
        await setupMetricProgressBarInLensEditor(browserAuth, page, pageObjects);

        await expect(progressBarLocator(page)).toHaveCSS(
          'background-color',
          DEFAULT_PROGRESS_BAR_FILL_COLOR
        );
      }
    );

    spaceTest(
      'applies static color to progress bar fill',
      async ({ browserAuth, page, pageObjects }) => {
        const STATIC_METRIC_COLOR = '#000000';
        await setupMetricProgressBarInLensEditor(browserAuth, page, pageObjects);
        await openPrimaryMetricDimensionEditor(page);

        const colorPicker = page.getByTestId('euiColorPickerAnchor');
        await expect(colorPicker).toBeVisible();
        await colorPicker.clear();
        await colorPicker.fill(STATIC_METRIC_COLOR);
        await page.keyboard.press('Tab');

        await expect(progressBarLocator(page)).toHaveCSS(
          'background-color',
          STATIC_PROGRESS_BAR_FILL_COLOR
        );

        await closePrimaryMetricDimensionEditor(page);
      }
    );

    spaceTest(
      'applies dynamic color to progress bar fill',
      async ({ browserAuth, page, pageObjects }) => {
        await setupMetricProgressBarInLensEditor(browserAuth, page, pageObjects);
        await openPrimaryMetricDimensionEditor(page);
        await page.testSubj.locator('lnsMetric_color_mode_dynamic').click();

        await expect(progressBarLocator(page)).toHaveCSS(
          'background-color',
          DYNAMIC_PROGRESS_BAR_FILL_COLOR
        );

        await closePrimaryMetricDimensionEditor(page);
      }
    );
  }
);
