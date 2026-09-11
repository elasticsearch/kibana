/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DebugState } from '@elastic/charts';
import { expect } from '@kbn/scout/ui';
import {
  addDataLayer,
  enableElasticChartDebug,
  openEmptyLensEditor,
  spaceTest,
  testData,
} from '../fixtures';

const VIS_TITLE = 'xyChart with multiple data views';

function getNonEmptyLineSeriesCount(state: DebugState): number {
  return state.lines?.filter((series) => series.points.length > 0).length ?? 0;
}

spaceTest.describe('Lens with multiple data views', { tag: '@local-stateful-classic' }, () => {
  // Prefer API-created DVs over the kbn archive: the archive uses saved-object id
  // `long-window-logstash-*`, and the unencoded `*` in data-view URLs 404s under CI load.
  let longWindowDataViewId: string | undefined;

  spaceTest.beforeAll(async ({ scoutSpace, apiServices }) => {
    const { data: longWindowDv } = await apiServices.dataViews.create({
      title: testData.DATA_VIEW_ID.LONG_WINDOW_LOGSTASH,
      // Name matches title so switcher rows resolve as `dataView-long-window-logstash-*`.
      name: testData.DATA_VIEW_ID.LONG_WINDOW_LOGSTASH,
      timeFieldName: '@timestamp',
      spaceId: scoutSpace.id,
    });
    longWindowDataViewId = longWindowDv.id;

    await apiServices.dataViews.create({
      title: testData.DATA_VIEW_ID.FLIGHTS,
      name: testData.DATA_VIEW_ID.FLIGHTS,
      timeFieldName: 'timestamp',
      spaceId: scoutSpace.id,
    });

    await scoutSpace.uiSettings.set({
      'courier:ignoreFilterIfFieldNotInIndex': true,
      defaultIndex: longWindowDataViewId ?? testData.DATA_VIEW_ID.LONG_WINDOW_LOGSTASH,
      'dateFormat:tz': 'UTC',
      'timepicker:timeDefaults': JSON.stringify(testData.MULTIPLE_DATA_VIEWS_TIME_RANGE),
    });
  });

  spaceTest.beforeEach(async ({ context, browserAuth }) => {
    await enableElasticChartDebug(context);
    await browserAuth.loginAsPrivilegedUser();
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset(
      'courier:ignoreFilterIfFieldNotInIndex',
      'defaultIndex',
      'dateFormat:tz',
      'timepicker:timeDefaults'
    );
    await scoutSpace.savedObjects.cleanStandardList();
  });

  // Tests 1-3 form a sequential journey: build → filter → reopen with changed setting.
  // Combined into one test with test.step() per Scout migration guidance for chained FTR `it` blocks.
  spaceTest(
    'should allow building a multi-data-view chart and applying global filters',
    async ({ page, pageObjects, scoutSpace }) => {
      const { visualize, lens, filterBar } = pageObjects;

      await spaceTest.step('build multi-layer chart with logstash and flights layers', async () => {
        await openEmptyLensEditor(pageObjects, {
          timeRange: testData.MULTIPLE_DATA_VIEWS_TIME_RANGE,
        });

        // defaultIndex already points at the long-window DV; wait for it to resolve instead of
        // opening the switcher (search + `*` titles races under parallel CI load).
        await expect(
          page.testSubj.locator('lns-dataView-switch-link').locator('[data-test-subj="fullText"]')
        ).toHaveText(testData.DATA_VIEW_ID.LONG_WINDOW_LOGSTASH);
        await page.testSubj.locator('fieldToggle-bytes').waitFor({ state: 'visible' });
        await page.testSubj.click('fieldToggle-bytes');

        // Flights layer — switch data panel first so the new layer inherits flights,
        // then add a line layer and toggle DistanceKilometers (matches FTR order).
        await lens.dragDrop.switchDataPanelIndexPattern(testData.DATA_VIEW_ID.FLIGHTS);
        await addDataLayer(page, 'line');
        await lens.layers.activateLayerTab(1);
        await page.testSubj.locator('fieldToggle-DistanceKilometers').waitFor({ state: 'visible' });
        await page.testSubj.click('fieldToggle-DistanceKilometers');

        await lens.waitForVisualization('xyVisChart');
        // Two non-empty series (logstash + flights). Exact bucket values belong at the API layer.
        await expect
          .poll(async () =>
            getNonEmptyLineSeriesCount(await lens.workspace.getCurrentChartDebugState('xyVisChart'))
          )
          .toBe(2);
      });

      await spaceTest.step(
        'ignores global filter on layer using a data view without the filter field',
        async () => {
          // Add a Carrier exists filter — Carrier is only in flights, so logstash should be unaffected
          await filterBar.addFilter({ field: 'Carrier', operator: 'exists' });

          await lens.waitForVisualization('xyVisChart');
          await expect
            .poll(async () =>
              getNonEmptyLineSeriesCount(
                await lens.workspace.getCurrentChartDebugState('xyVisChart')
              )
            )
            .toBe(2);

          await lens.save(VIS_TITLE, { addToDashboard: 'none' });
        }
      );

      await spaceTest.step(
        'applies global filter on layers using data view without the filter field when setting disabled',
        async () => {
          // Disable the ignore-missing-field setting: the Carrier filter now applies to logstash too,
          // which has no Carrier field, so the logstash layer returns empty data.
          await scoutSpace.uiSettings.set({
            'courier:ignoreFilterIfFieldNotInIndex': false,
          });

          await visualize.goto();
          // Lens editors do not use visualizationLoader; open the listing link then wait on Lens.
          await page.testSubj.click(`visListingTitleLink-${VIS_TITLE.split(' ').join('-')}`);
          await lens.waitForLensApp();
          await lens.waitForVisualization('xyVisChart');

          // Only the flights series remains non-empty.
          await expect
            .poll(async () =>
              getNonEmptyLineSeriesCount(
                await lens.workspace.getCurrentChartDebugState('xyVisChart')
              )
            )
            .toBe(1);
        }
      );
    }
  );
});
