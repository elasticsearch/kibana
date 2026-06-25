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

spaceTest.describe('Lens open in Lens — agg-based Heatmap', { tag: tags.stateful.classic }, () => {
  let heatmapDashboardId: string;

  spaceTest.beforeAll(async ({ scoutSpace }) => {
    const imported = await scoutSpace.savedObjects.load(
      testData.KBN_ARCHIVES.OPEN_IN_LENS_AGG_BASED.HEATMAP
    );
    heatmapDashboardId = getImportedDashboardId(imported, testData.OPEN_IN_LENS_DASHBOARDS.HEATMAP);

    await scoutSpace.uiSettings.setDefaultIndex(testData.DATA_VIEW_ID.LOGSTASH);
    await scoutSpace.uiSettings.set({
      'dateFormat:tz': 'UTC',
      'timepicker:timeDefaults': `{ "from": "${testData.LOGSTASH_IN_RANGE_DATES.from}", "to": "${testData.LOGSTASH_IN_RANGE_DATES.to}"}`,
    });
  });

  spaceTest.beforeEach(async ({ browserAuth, context, pageObjects }) => {
    await enableElasticChartDebug(context);
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.dashboard.openDashboardWithIdInEditMode(heatmapDashboardId);
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'dateFormat:tz', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('should check Convert to Lens action availability', async ({ pageObjects }) => {
    const { dashboard } = pageObjects;

    await spaceTest.step('shows action when only Y-axis is specified', async () => {
      expect(await canConvertToLensByTitle({ dashboard }, 'Heatmap - With Y-Axis only')).toBe(true);
    });

    await spaceTest.step('shows action when X-axis is specified', async () => {
      expect(await canConvertToLensByTitle({ dashboard }, 'Heatmap - With X-Axis only')).toBe(true);
    });
  });

  spaceTest('should convert to Lens', async ({ page, pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Heatmap - With X-Axis only');
    await lens.waitForVisualization('heatmapChart');

    const debugState = await getChartDebugData(page, 'heatmapChart');
    expect(debugState.axes?.x[0].labels).toStrictEqual(['win 8', 'win xp', 'win 7', 'ios', 'osx']);
    expect(debugState.axes?.y[0].labels).toStrictEqual(['']);
    expect(debugState.heatmap?.cells).toHaveLength(5);
    expect(debugState.legend?.items).toStrictEqual([
      {
        color: '#006837',
        key: '1,322 - 1,717.5',
        name: '1,322 - 1,717.5',
      },
      { color: '#86cb66', key: '1,717.5 - 2,113', name: '1,717.5 - 2,113' },
      {
        color: '#fefebd',
        key: '2,113 - 2,508.5',
        name: '2,113 - 2,508.5',
      },
      {
        color: '#f88d52',
        key: '2,508.5 - 2,904',
        name: '2,508.5 - 2,904',
      },
    ]);
  });

  spaceTest(
    'should convert to Lens if Y-axis is defined, but X-axis is not',
    async ({ page, pageObjects }) => {
      const { dashboard, lens } = pageObjects;

      await convertToLensByTitle({ dashboard }, 'Heatmap - With Y-Axis only');
      await lens.waitForVisualization('heatmapChart');

      const debugState = await getChartDebugData(page, 'heatmapChart');
      expect(debugState.axes?.x[0].labels).toStrictEqual(['*']);
      expect(debugState.axes?.y[0].labels).toStrictEqual([
        'win 8',
        'win xp',
        'win 7',
        'ios',
        'osx',
      ]);
      expect(debugState.heatmap?.cells).toHaveLength(5);
    }
  );

  spaceTest('should respect heatmap colors number', async ({ page, pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Heatmap - Color number');
    await lens.waitForVisualization('heatmapChart');

    const debugState = await getChartDebugData(page, 'heatmapChart');
    expect(debugState.legend?.items).toStrictEqual([
      { key: '1,322 - 1,585.667', name: '1,322 - 1,585.667', color: '#006837' },
      { key: '1,585.667 - 1,849.333', name: '1,585.667 - 1,849.333', color: '#4cb15d' },
      { key: '1,849.333 - 2,113', name: '1,849.333 - 2,113', color: '#b7e075' },
      { key: '2,113 - 2,376.667', name: '2,113 - 2,376.667', color: '#fefebd' },
      { key: '2,376.667 - 2,640.333', name: '2,376.667 - 2,640.333', color: '#fdbf6f' },
      { key: '2,640.333 - 2,904', name: '2,640.333 - 2,904', color: '#ea5839' },
    ]);
  });

  spaceTest('should respect heatmap custom color ranges', async ({ page, pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Heatmap - Custom Color ranges');
    await lens.waitForVisualization('heatmapChart');

    const debugState = await getChartDebugData(page, 'heatmapChart');
    expect(debugState.legend?.items).toStrictEqual([
      {
        color: '#006837',
        key: '0 - 100',
        name: '0 - 100',
      },
      {
        color: '#65bc62',
        key: '100 - 200',
        name: '100 - 200',
      },
      {
        color: '#d8ef8c',
        key: '200 - 300',
        name: '200 - 300',
      },
      {
        color: '#fedf8b',
        key: '300 - 400',
        name: '300 - 400',
      },
      {
        color: '#f36d43',
        key: '400 - 500',
        name: '400 - 500',
      },
      {
        color: '#a50026',
        key: '500 - 600',
        name: '500 - 600',
      },
    ]);
  });
});
