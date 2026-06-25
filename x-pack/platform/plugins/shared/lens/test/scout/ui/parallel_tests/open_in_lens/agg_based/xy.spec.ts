/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import {
  testData,
  canConvertToLensByTitle,
  convertToLensByTitle,
  enableElasticChartDebug,
  getChartDebugData,
  getImportedDashboardId,
} from '../../../fixtures';

spaceTest.describe('Lens open in Lens — agg-based XY', { tag: tags.stateful.classic }, () => {
  let xyDashboardId: string;

  spaceTest.beforeAll(async ({ scoutSpace }) => {
    const imported = await scoutSpace.savedObjects.load(
      testData.KBN_ARCHIVES.OPEN_IN_LENS_AGG_BASED.XY
    );
    xyDashboardId = getImportedDashboardId(imported, testData.OPEN_IN_LENS_DASHBOARDS.XY);

    await scoutSpace.uiSettings.setDefaultIndex(testData.DATA_VIEW_ID.LOGSTASH);
    await scoutSpace.uiSettings.set({
      'dateFormat:tz': 'UTC',
      'timepicker:timeDefaults': `{ "from": "${testData.LOGSTASH_IN_RANGE_DATES.from}", "to": "${testData.LOGSTASH_IN_RANGE_DATES.to}"}`,
    });
  });

  spaceTest.beforeEach(async ({ browserAuth, context, pageObjects }) => {
    await enableElasticChartDebug(context);
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.dashboard.openDashboardWithIdInEditMode(xyDashboardId);
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'dateFormat:tz', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('should check Convert to Lens action availability', async ({ pageObjects }) => {
    const { dashboard } = pageObjects;

    await spaceTest.step('dot size aggregation cannot convert', async () => {
      expect(await canConvertToLensByTitle({ dashboard }, 'XY - Dot size metric')).toBe(false);
    });

    await spaceTest.step('split chart cannot convert', async () => {
      expect(await canConvertToLensByTitle({ dashboard }, 'XY - Split chart')).toBe(false);
    });

    await spaceTest.step('multiple Y axes on the same side cannot convert', async () => {
      expect(await canConvertToLensByTitle({ dashboard }, 'XY - Multiple Y Axes')).toBe(false);
    });

    await spaceTest.step('multiple split series cannot convert', async () => {
      expect(await canConvertToLensByTitle({ dashboard }, 'XY - Multiple Split Series')).toBe(
        false
      );
    });

    await spaceTest.step('sibling pipeline agg with split series cannot convert', async () => {
      expect(
        await canConvertToLensByTitle({ dashboard }, 'XY - Sibling pipeline agg w/ split')
      ).toBe(false);
    });

    await spaceTest.step('unsupported aggregation cannot convert', async () => {
      expect(await canConvertToLensByTitle({ dashboard }, 'XY - Unsupported Agg')).toBe(false);
    });
  });

  spaceTest(
    'should convert in different layers if metrics have different chart types',
    async ({ pageObjects }) => {
      const { dashboard, lens } = pageObjects;

      await convertToLensByTitle({ dashboard }, 'XY - Differing Layers');
      await lens.waitForVisualization('xyVisChart');
      expect(await lens.getLayerCount()).toBe(2);

      await lens.activateLayerTab(0);
      expect(await lens.getChartSwitchType()).toBe('Area');
      expect(await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0)).toBe('Count');

      await lens.activateLayerTab(1);
      expect(await lens.getChartSwitchType()).toBe('Bar');
      expect(await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0)).toBe('Max memory');
    }
  );

  spaceTest(
    'should convert in one layer if metrics have the same chart type',
    async ({ pageObjects }) => {
      const { dashboard, lens } = pageObjects;

      await convertToLensByTitle({ dashboard }, 'XY - Similar Layers');
      await lens.waitForVisualization('xyVisChart');
      expect(await lens.getLayerCount()).toBe(1);

      expect(await lens.getChartSwitchType()).toBe('Bar');
      expect(await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0)).toBe('Count');
      expect(await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 1)).toBe('Max memory');
    }
  );

  spaceTest('should convert parent pipeline aggregation', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'XY - Parent pipeline agg');
    await lens.waitForVisualization('xyVisChart');
    expect(await lens.getLayerCount()).toBe(1);

    expect(await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0)).toBe(
      'Cumulative Sum of Count'
    );
    expect(await lens.getDimensionTriggerText('lnsXY_splitDimensionPanel', 0)).toBe('@timestamp');
  });

  spaceTest('should convert sibling pipeline aggregation', async ({ page, pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'XY - Sibling pipeline agg');
    await lens.waitForVisualization('xyVisChart');
    expect(await lens.getLayerCount()).toBe(1);

    expect(await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0)).toBe(
      'Overall Max of Count'
    );
    expect(await lens.getDimensionTriggerText('lnsXY_splitDimensionPanel', 0)).toBe('@timestamp');

    await lens.openDimensionEditor('lnsXY_splitDimensionPanel > lns-dimensionTrigger');
    await expect(page.testSubj.locator('indexPattern-collapse-by')).toHaveValue('max');
  });

  spaceTest('should draw a reference line', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'XY - Reference line');
    await lens.waitForVisualization('xyVisChart');
    expect(await lens.getLayerCount()).toBe(2);

    await lens.activateLayerTab(0);
    expect(await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0)).toBe('Count');

    await lens.activateLayerTab(1);
    expect(await lens.getDimensionTriggerText('lnsXY_yReferenceLineLeftPanel', 0)).toBe(
      'Static value: 10'
    );
  });

  spaceTest('should convert line stacked to area stacked chart', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'XY - Stacked lines');
    await lens.waitForVisualization('xyVisChart');
    expect(await lens.getLayerCount()).toBe(1);

    expect(await lens.getChartSwitchType()).toBe('Area');
  });

  spaceTest('should convert percentage charts', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'XY - Percentage chart');
    await lens.waitForVisualization('xyVisChart');
    expect(await lens.getLayerCount()).toBe(1);

    expect(await lens.getChartSwitchType()).toBe('Area');
  });

  spaceTest('should convert horizontal bar', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'XY - Horizontal Bar');
    await lens.waitForVisualization('xyVisChart');
    expect(await lens.getLayerCount()).toBe(1);

    expect(await lens.getChartSwitchType()).toBe('Bar');
    expect(await lens.getSelectedBarOrientationSetting()).toBe('Horizontal');
  });

  spaceTest('should convert y-axis positions', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'XY - Axis positions');
    await lens.waitForVisualization('xyVisChart');
    expect(await lens.getLayerCount()).toBe(1);

    expect(await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0)).toBe('Count');
    expect(await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 1)).toBe('Max memory');

    await lens.openDimensionEditor('lnsXY_yDimensionPanel > lns-dimensionTrigger');
    expect(await lens.getSelectedAxisSide()).toBe('Left');
    await lens.closeDimensionEditor();

    await lens.openDimensionEditor('lnsXY_yDimensionPanel > lns-dimensionTrigger', 0, 1);
    expect(await lens.getSelectedAxisSide()).toBe('Right');
  });

  spaceTest('should convert split series', async ({ page, pageObjects }) => {
    const { dashboard, lens } = pageObjects;
    const expectedLegend = ['win 8', 'win xp', 'win 7', 'ios', 'osx'];

    await convertToLensByTitle({ dashboard }, 'XY - Split Series');
    await lens.waitForVisualization('xyVisChart');

    expect(await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0)).toBe('Count');
    expect(await lens.getDimensionTriggerText('lnsXY_splitDimensionPanel', 0)).toBe(
      'machine.os.raw: Descending'
    );

    await expect
      .poll(
        async () =>
          (await getChartDebugData(page, 'xyVisChart')).legend?.items.map((item) => item.name),
        { timeout: 20_000 }
      )
      .toStrictEqual(expectedLegend);
  });

  spaceTest('should convert x-axis', async ({ page, pageObjects }) => {
    const { dashboard, lens } = pageObjects;
    const expectedLegend = ['Count'];

    await convertToLensByTitle({ dashboard }, 'XY - X Axis');
    await lens.waitForVisualization('xyVisChart');

    expect(await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0)).toBe('Count');
    expect(await lens.getDimensionTriggerText('lnsXY_xDimensionPanel', 0)).toBe(
      'machine.os.raw: Descending'
    );

    await expect
      .poll(
        async () =>
          (await getChartDebugData(page, 'xyVisChart')).legend?.items.map((item) => item.name),
        { timeout: 20_000 }
      )
      .toStrictEqual(expectedLegend);
  });
});
