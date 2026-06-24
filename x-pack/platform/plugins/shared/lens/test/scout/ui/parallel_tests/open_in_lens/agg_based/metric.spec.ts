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
  getImportedDashboardId,
  loadDashboardInEditModeById,
} from '../../../fixtures';

spaceTest.describe('Lens open in Lens — agg-based Metric', { tag: tags.stateful.classic }, () => {
  let metricDashboardId: string;

  spaceTest.beforeAll(async ({ scoutSpace }) => {
    const imported = await scoutSpace.savedObjects.load(
      testData.KBN_ARCHIVES.OPEN_IN_LENS_AGG_BASED.METRIC
    );
    metricDashboardId = getImportedDashboardId(imported, testData.OPEN_IN_LENS_DASHBOARDS.METRIC);

    await scoutSpace.uiSettings.setDefaultIndex(testData.DATA_VIEW_ID.LOGSTASH);
    await scoutSpace.uiSettings.set({
      'dateFormat:tz': 'UTC',
      'timepicker:timeDefaults': `{ "from": "${testData.LOGSTASH_IN_RANGE_DATES.from}", "to": "${testData.LOGSTASH_IN_RANGE_DATES.to}"}`,
    });
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsPrivilegedUser();
    await loadDashboardInEditModeById(pageObjects, metricDashboardId);
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'dateFormat:tz', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('should convert to Lens', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Metric - Basic');
    await lens.waitForVisualization('mtrVis');

    await lens.hoverOverDimensionButton();
    const data = await lens.getMetricVisualizationData();
    expect(data).toHaveLength(1);
    expect(data).toStrictEqual([
      {
        title: 'Count',
        subtitle: undefined,
        extraText: '',
        value: '14,005',
        color: 'rgba(255, 255, 255, 1)',
        trendlineColor: undefined,
        showingBar: false,
        showingTrendline: false,
      },
    ]);
  });

  spaceTest('should convert aggregation with params', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Metric - Agg with params');
    await lens.waitForVisualization('mtrVis');
    await lens.assertLayerCount(1);

    const dimensions = await lens.getDimensionTriggers();
    expect(dimensions).toHaveLength(1);
    await expect(dimensions[0]).toHaveText('Average machine.ram');

    await lens.hoverOverDimensionButton();
    const data = await lens.getMetricVisualizationData();
    expect(data).toHaveLength(1);
    expect(data).toStrictEqual([
      {
        title: 'Average machine.ram',
        subtitle: undefined,
        extraText: '',
        value: '13,104,036,080.615',
        color: 'rgba(255, 255, 255, 1)',
        trendlineColor: undefined,
        showingBar: false,
        showingTrendline: false,
      },
    ]);
  });

  spaceTest('should convert sibling pipeline aggregation', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Metric - Sibling pipeline agg');
    await lens.waitForVisualization('mtrVis');
    await lens.assertLayerCount(1);

    const dimensions = await lens.getDimensionTriggers();
    expect(dimensions).toHaveLength(2);
    await expect(dimensions[0]).toHaveText('Overall Max of Count');
    await expect(dimensions[1]).toHaveText('@timestamp');

    await lens.hoverOverDimensionButton();
    const data = await lens.getMetricVisualizationData();
    expect(data).toHaveLength(1);
    expect(data).toStrictEqual([
      {
        title: 'Overall Max of Count',
        subtitle: undefined,
        extraText: '',
        value: '1,437',
        color: 'rgba(255, 255, 255, 1)',
        trendlineColor: undefined,
        showingBar: false,
        showingTrendline: false,
      },
    ]);
  });

  spaceTest(
    'should not convert aggregation with not supported field type',
    async ({ pageObjects }) => {
      const { dashboard } = pageObjects;
      expect(await canConvertToLensByTitle({ dashboard }, 'Metric - Unsupported field type')).toBe(
        false
      );
    }
  );

  spaceTest('should convert color ranges', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Metric - Color ranges');
    await lens.waitForVisualization('mtrVis');
    await lens.assertLayerCount(1);

    const dimensions = await lens.getDimensionTriggers();
    expect(dimensions).toHaveLength(2);
    await expect(dimensions[0]).toHaveText('Average machine.ram');
    await expect(dimensions[1]).toHaveText('machine.os.raw: Descending');

    await lens.hoverOverDimensionButton();
    await expect
      .poll(async () => lens.getMetricVisualizationData(), { timeout: 20_000 })
      .toStrictEqual([
        {
          title: 'osx',
          subtitle: 'Average machine.ram',
          extraText: '',
          value: '13,228,964,670.613',
          color: 'rgba(165, 0, 38, 1)',
          trendlineColor: undefined,
          showingBar: false,
          showingTrendline: false,
        },
        {
          title: 'win 7',
          subtitle: 'Average machine.ram',
          extraText: '',
          value: '13,186,695,551.251',
          color: 'rgba(253, 191, 111, 1)',
          trendlineColor: undefined,
          showingBar: false,
          showingTrendline: false,
        },
        {
          title: 'win xp',
          subtitle: 'Average machine.ram',
          extraText: '',
          value: '13,073,190,186.423',
          color: 'rgba(183, 224, 117, 1)',
          trendlineColor: undefined,
          showingBar: false,
          showingTrendline: false,
        },
        {
          title: 'win 8',
          subtitle: 'Average machine.ram',
          extraText: '',
          value: '13,031,579,645.108',
          color: 'rgba(183, 224, 117, 1)',
          trendlineColor: undefined,
          showingBar: false,
          showingTrendline: false,
        },
        {
          title: 'ios',
          subtitle: 'Average machine.ram',
          extraText: '',
          value: '13,009,497,206.823',
          color: 'rgba(183, 224, 117, 1)',
          trendlineColor: undefined,
          showingBar: false,
          showingTrendline: false,
        },
        {
          title: undefined,
          subtitle: undefined,
          extraText: undefined,
          value: undefined,
          color: 'rgba(255, 255, 255, 1)',
          trendlineColor: undefined,
          showingBar: false,
          showingTrendline: false,
        },
      ]);

    await dimensions[0].click();
    await lens.openPalettePanel();
    const colorStops = await lens.getPaletteColorStops();
    expect(colorStops).toStrictEqual([
      { color: 'rgba(0, 104, 55, 1)', stop: '12000000000' },
      { color: 'rgba(183, 224, 117, 1)', stop: '13000000000' },
      { color: 'rgba(253, 191, 111, 1)', stop: '13100000000' },
      { color: 'rgba(165, 0, 38, 1)', stop: '13200000000' },
      { color: undefined, stop: '13300000000' },
    ]);
  });
});
