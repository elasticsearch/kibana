/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import {
  completeLensCsvExport,
  createAdHocDataViewFromLens,
  createRuntimeFieldFromEditor,
  enableElasticChartDebug,
  spaceTest,
  testData,
} from '../fixtures';

declare global {
  interface Window {
    ELASTIC_LENS_CSV_DOWNLOAD_DEBUG?: boolean;
    ELASTIC_LENS_CSV_CONTENT?: Record<string, { content: string; type: string }>;
  }
}

/** Extracts the Discover data view id from a URL (rison `dataViewId:`), matching FTR `getCurrentDataViewId`. */
function getDiscoverDataViewIdFromUrl(url: string): string {
  const matches = [...url.matchAll(/dataViewId:[^,]*/g)].map((match) =>
    decodeURIComponent(match[0]).replace('dataViewId:', '').replaceAll("'", '')
  );
  return matches[0] ?? '';
}

spaceTest.describe('Lens ad hoc data view', { tag: '@local-stateful-classic' }, () => {
  spaceTest.beforeAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.set({
      defaultIndex: testData.DATA_VIEW_ID.LOGSTASH,
      'dateFormat:tz': 'UTC',
      'timepicker:timeDefaults': JSON.stringify(testData.LOGSTASH_IN_RANGE_DATES),
    });
  });

  // Each test saves objects; clean up before each test so previous saves don't affect
  // the Visualize listing page (unresolvable ad hoc DV refs can break its fetch).
  // The logstash-* data view is recreated after each cleanup so the app has a valid default.
  spaceTest.beforeEach(async ({ scoutSpace, apiServices, browserAuth }) => {
    await scoutSpace.savedObjects.cleanStandardList();
    await apiServices.dataViews.create({
      title: testData.DATA_VIEW_ID.LOGSTASH,
      // Name must match title so the switcher test subject is `dataView-logstash-*`
      name: testData.DATA_VIEW_ID.LOGSTASH,
      timeFieldName: '@timestamp',
      spaceId: scoutSpace.id,
    });
    await browserAuth.loginAsPrivilegedUser();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'dateFormat:tz', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest(
    'should allow building a chart based on ad hoc data view',
    async ({ page, pageObjects, context }) => {
      const { visualize, lens } = pageObjects;

      await enableElasticChartDebug(context);

      await visualize.goto();
      await visualize.openNewVisualizationWizard();
      await visualize.clickVisType('lens');
      await lens.waitForLensApp();

      await createAdHocDataViewFromLens(page, testData.AD_HOC_DATA_VIEW_NAME);

      await lens.configureDimension({
        dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
        operation: 'terms',
        field: 'ip',
      });

      await lens.configureDimension({
        dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
        operation: 'average',
        field: 'bytes',
      });

      await lens.waitForVisualization('xyVisChart');
      // Default terms size is Top 9 (+ Other). Exact bucket values belong at the API layer.
      await expect
        .poll(async () => {
          const bars =
            (await lens.workspace.getCurrentChartDebugState('xyVisChart')).bars?.[0]?.bars ?? [];
          return {
            length: bars.length,
            hasOther: bars.some((bar) => bar.x === 'Other'),
          };
        })
        .toStrictEqual({ length: 10, hasOther: true });
    }
  );

  // FTR tests 2–4 form a sequential journey sharing browser state;
  // combined into one test with spaceTest.step() per Scout migration guidance.
  spaceTest(
    'should allow managing runtime fields on an ad hoc data view',
    async ({ page, pageObjects }) => {
      const { visualize, lens } = pageObjects;

      await visualize.goto();
      await visualize.openNewVisualizationWizard();
      await visualize.clickVisType('lens');
      await lens.waitForLensApp();

      await createAdHocDataViewFromLens(page, testData.AD_HOC_DATA_VIEW_NAME);
      await lens.switchToVisualization('lnsDatatable');

      await spaceTest.step('add a runtime field and use it in the datatable', async () => {
        await page.testSubj.click('lns-dataView-switch-link');
        await page.testSubj.click('indexPattern-add-field');
        await createRuntimeFieldFromEditor(page, 'runtimefield', "emit('abc')");
        await page.testSubj.locator('fieldListLoading').waitFor({ state: 'hidden' });

        await page.testSubj.locator('lnsIndexPatternFieldSearch').fill('runtime');
        const availableRuntimeField = page.testSubj
          .locator('lnsIndexPatternAvailableFields')
          .getByTestId('lnsFieldListPanelField-runtimefield');
        await availableRuntimeField.waitFor({ state: 'visible' });

        const workspace = page.testSubj.locator('lnsWorkspace');
        await availableRuntimeField.dragTo(workspace);
        await lens.waitForVisualization();

        const runtimeHeader = page.testSubj
          .locator('lnsVisualizationContainer')
          .getByRole('columnheader', { name: 'Top 9 values of runtimefield' });
        await expect(runtimeHeader).toBeVisible();
        await expect(
          page.testSubj.locator('lnsVisualizationContainer').getByRole('gridcell', { name: 'abc' })
        ).toBeVisible();
      });

      await spaceTest.step('switch to another data view and back', async () => {
        await page.testSubj.locator('lnsIndexPatternFieldSearch').fill('');
        await lens.dragDrop.switchDataPanelIndexPattern(testData.DATA_VIEW_ID.LOGSTASH);
        await expect(page.testSubj.locator('lnsFieldListPanelField-runtimefield')).toHaveCount(0);

        await lens.dragDrop.switchDataPanelIndexPattern(testData.AD_HOC_DATA_VIEW_NAME);
        // Scope to Available fields — the same test subject also appears under Selected.
        await expect(
          page.testSubj
            .locator('lnsIndexPatternAvailableFields')
            .getByTestId('lnsFieldListPanelField-runtimefield')
        ).toBeVisible();
      });

      await spaceTest.step('remove the runtime field', async () => {
        await page.testSubj
          .locator('lnsIndexPatternAvailableFields')
          .getByTestId('lnsFieldListPanelField-runtimefield')
          .click();
        await page.testSubj.locator('fieldPopoverHeader_deleteField-runtimefield').click();
        await expect(
          page.testSubj.locator('fieldPopoverHeader_deleteField-runtimefield')
        ).toBeHidden();

        await page.testSubj.locator('deleteModalConfirmText').fill('remove');
        await page.testSubj.click('confirmModalConfirmButton');

        await expect(page.testSubj.locator('lnsFieldListPanelField-runtimefield')).toHaveCount(0);
      });
    }
  );

  spaceTest(
    'should allow adding an ad-hoc chart to a new dashboard',
    async ({ page, pageObjects }) => {
      const { visualize, lens, dashboard } = pageObjects;

      await visualize.goto();
      await visualize.openNewVisualizationWizard();
      await visualize.clickVisType('lens');
      await lens.waitForLensApp();

      await createAdHocDataViewFromLens(page, testData.AD_HOC_DATA_VIEW_NAME);

      await lens.switchToVisualization('lnsMetric');
      await lens.configureDimension({
        dimension: 'lnsMetric_primaryMetricDimensionPanel > lns-empty-dimension',
        operation: 'average',
        field: 'bytes',
      });

      await lens.waitForVisualization('mtrVis');
      await expect
        .poll(async () => {
          const metric = (await lens.metric.getMetricVisualizationData())[0];
          if (!metric?.title || !metric?.value) {
            return null;
          }
          return { title: metric.title, hasValue: true };
        })
        .toStrictEqual({ title: 'Average of bytes', hasValue: true });

      await lens.save('New Lens from Modal', { addToDashboard: 'new' });
      await dashboard.waitForRenderComplete();
      await dashboard.expectPanelCount(1);
    }
  );

  spaceTest(
    'should allow saving the ad-hoc chart into a saved object',
    async ({ page, pageObjects, scoutSpace }) => {
      const { visualize, lens } = pageObjects;
      const title = `Lens with adhoc data view ${scoutSpace.id}`;

      await visualize.goto();
      await visualize.openNewVisualizationWizard();
      await visualize.clickVisType('lens');
      await lens.waitForLensApp();

      await createAdHocDataViewFromLens(page, testData.AD_HOC_DATA_VIEW_NAME);

      await lens.configureDimension({
        dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
        operation: 'average',
        field: 'bytes',
      });

      await lens.switchToVisualization('lnsMetric');
      await lens.waitForVisualization('mtrVis');

      await lens.save(title, { addToDashboard: 'none' });
      await lens.waitForVisualization('mtrVis');

      // Poll title + value together — chart tiles can briefly disappear after save.
      await expect
        .poll(async () => {
          const metric = (await lens.metric.getMetricVisualizationData())[0];
          if (!metric?.title || !metric?.value) {
            return null;
          }
          return { title: metric.title, hasValue: true };
        })
        .toStrictEqual({ title: 'Average of bytes', hasValue: true });
    }
  );

  spaceTest(
    'should be possible to share a URL of a visualization with ad hoc data views',
    async ({ page, pageObjects, context }) => {
      const { visualize, lens } = pageObjects;

      await visualize.goto();
      await visualize.openNewVisualizationWizard();
      await visualize.clickVisType('lens');
      await lens.waitForLensApp();

      await createAdHocDataViewFromLens(page, testData.AD_HOC_DATA_VIEW_NAME);

      await lens.configureDimension({
        dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
        operation: 'average',
        field: 'bytes',
      });

      await lens.switchToVisualization('lnsMetric');
      await lens.waitForVisualization('mtrVis');

      await lens.save(`Lens adhoc share url ${Date.now()}`, { addToDashboard: 'none' });
      await lens.waitForVisualization('mtrVis');

      const url = page.url();

      const newPage = await context.newPage();
      try {
        await newPage.goto(url);
        await newPage
          .getByTestId('lnsMetric_primaryMetricDimensionPanel')
          .waitFor({ state: 'visible' });

        const dimText = await newPage
          .getByTestId('lnsMetric_primaryMetricDimensionPanel')
          .locator('[data-test-subj="lns-dimensionTrigger"]')
          .innerText();
        expect(dimText.trim()).toBe('Average of bytes');
      } finally {
        await newPage.close();
      }
    }
  );

  spaceTest(
    'should be possible to download a visualization with ad hoc data views as CSV',
    async ({ page, pageObjects, scoutSpace }) => {
      const { visualize, lens } = pageObjects;

      await visualize.goto();
      await visualize.openNewVisualizationWizard();
      await visualize.clickVisType('lens');
      await lens.waitForLensApp();

      await createAdHocDataViewFromLens(page, testData.AD_HOC_DATA_VIEW_NAME);

      await lens.configureDimension({
        dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
        operation: 'average',
        field: 'bytes',
      });

      await lens.switchToVisualization('lnsMetric');
      await lens.waitForVisualization('mtrVis');

      await lens.save(`Lens adhoc csv download ${scoutSpace.id}`, { addToDashboard: 'none' });
      await lens.waitForVisualization('mtrVis');

      // Stable chart + data before Export — empty activeData makes CSV auto-download a no-op.
      await expect
        .poll(async () => {
          const metric = (await lens.metric.getMetricVisualizationData())[0];
          if (!metric?.title || !metric?.value) {
            return null;
          }
          return { title: metric.title, hasValue: true };
        })
        .toStrictEqual({ title: 'Average of bytes', hasValue: true });

      await page.evaluate(() => {
        window.ELASTIC_LENS_CSV_DOWNLOAD_DEBUG = true;
        window.ELASTIC_LENS_CSV_CONTENT = undefined;
      });

      await completeLensCsvExport(page);

      await expect
        .poll(async () => {
          const content = await page.evaluate(
            () =>
              window.ELASTIC_LENS_CSV_CONTENT as
                | Record<string, { content: string; type: string }>
                | undefined
          );
          return content && Object.keys(content).length > 0 ? content : undefined;
        })
        .toBeTruthy();

      const csvContent = await page.evaluate(
        () =>
          window.ELASTIC_LENS_CSV_CONTENT as
            | Record<string, { content: string; type: string }>
            | undefined
      );
      expect(Object.keys(csvContent!)).toHaveLength(1);

      await page.evaluate(() => {
        window.ELASTIC_LENS_CSV_DOWNLOAD_DEBUG = false;
      });
    }
  );

  spaceTest(
    'should navigate to Discover correctly from Lens with an ad hoc data view',
    async ({ page, pageObjects, context }) => {
      const { visualize, lens } = pageObjects;

      await visualize.goto();
      await visualize.openNewVisualizationWizard();
      await visualize.clickVisType('lens');
      await lens.waitForLensApp();

      await createAdHocDataViewFromLens(page, testData.AD_HOC_DATA_VIEW_NAME);

      await lens.configureDimension({
        dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
        operation: 'average',
        field: 'bytes',
      });

      await lens.switchToVisualization('lnsMetric');
      await lens.waitForVisualization('mtrVis');

      await lens.save(`Lens adhoc discover lens ${Date.now()}`, { addToDashboard: 'none' });
      await lens.waitForVisualization('mtrVis');

      const discoverPagePromise = context.waitForEvent('page');
      await page.testSubj.click('lnsApp_openInDiscover');
      const discoverPage = await discoverPagePromise;

      try {
        const dvSwitch = discoverPage.getByTestId('discover-dataView-switch-link');
        await expect(dvSwitch).toContainText(testData.AD_HOC_DATA_VIEW_NAME);

        const queryHits = discoverPage.getByTestId('discoverQueryHits');
        await expect(queryHits).toBeVisible();
        await expect(queryHits).not.toHaveText('');

        const dvName = await dvSwitch.getByTestId('fullText').innerText();
        await dvSwitch.click();
        const hasBadge = discoverPage.getByTestId(`dataViewItemTempBadge-${dvName}`);
        await expect(hasBadge).toBeVisible();
        await discoverPage.keyboard.press('Escape');

        const prevDvId = getDiscoverDataViewIdFromUrl(discoverPage.url());
        expect(prevDvId).toBeTruthy();

        // Re-open the data view menu — add-field is a menu item, not a standalone button
        await discoverPage.getByTestId('discover-dataView-switch-link').click();
        await discoverPage.getByTestId('indexPattern-add-field').click();
        await createRuntimeFieldFromEditor(
          discoverPage as typeof page,
          '_bytes-runtimefield',
          'emit(doc["bytes"].value.toString())'
        );
        // Discover field list uses fieldToggle-* (same as FTR unifiedFieldList.clickFieldListItemToggle)
        await discoverPage.getByTestId('fieldListFiltersFieldSearch').fill('_bytes-runtimefield');
        const runtimeFieldToggle = discoverPage.getByTestId('fieldToggle-_bytes-runtimefield');
        await expect(runtimeFieldToggle).toBeVisible();
        await runtimeFieldToggle.click();

        // Creating a runtime field on an ad hoc data view updates its id in the URL
        await expect
          .poll(() => getDiscoverDataViewIdFromUrl(discoverPage.url()))
          .not.toBe(prevDvId);
      } finally {
        await discoverPage.close();
      }
    }
  );

  spaceTest(
    'should navigate to Discover correctly from a dashboard embeddable and persist ad hoc data view after refresh',
    async ({ page, pageObjects, context }) => {
      const { visualize, lens, dashboard } = pageObjects;

      await visualize.goto();
      await visualize.openNewVisualizationWizard();
      await visualize.clickVisType('lens');
      await lens.waitForLensApp();

      await createAdHocDataViewFromLens(page, testData.AD_HOC_DATA_VIEW_NAME);

      await lens.configureDimension({
        dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
        operation: 'average',
        field: 'bytes',
      });

      await lens.save('embeddable-test-with-adhoc-data-view', { addToDashboard: 'new' });
      await dashboard.waitForRenderComplete();

      const assertDiscoverNavigation = async () => {
        const discoverPagePromise = context.waitForEvent('page');
        await dashboard.clickPanelAction(testData.DATA_TEST_SUBJECTS.OPEN_IN_DISCOVER_ACTION);
        const discoverPage = await discoverPagePromise;

        try {
          const dvSwitch = discoverPage.getByTestId('discover-dataView-switch-link');
          await dvSwitch.waitFor({ state: 'visible' });
          await expect(dvSwitch).toContainText(testData.AD_HOC_DATA_VIEW_NAME);

          const queryHits = discoverPage.getByTestId('discoverQueryHits');
          await expect(queryHits).toBeVisible();
          await expect(queryHits).not.toHaveText('');

          const dvName = await dvSwitch.getByTestId('fullText').innerText();
          await dvSwitch.click();
          const hasBadge = discoverPage.getByTestId(`dataViewItemTempBadge-${dvName}`);
          await expect(hasBadge).toBeVisible();
          await discoverPage.keyboard.press('Escape');
        } finally {
          await discoverPage.close();
        }
      };

      await assertDiscoverNavigation();

      await page.reload();
      await dashboard.waitForRenderComplete();

      await assertDiscoverNavigation();
    }
  );
});
