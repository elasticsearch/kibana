/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BulletSubtype } from '@elastic/charts';
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

spaceTest.describe('Lens open in Lens — agg-based Gauge', { tag: tags.stateful.classic }, () => {
  let gaugeDashboardId: string;

  spaceTest.beforeAll(async ({ scoutSpace }) => {
    const imported = await scoutSpace.savedObjects.load(
      testData.KBN_ARCHIVES.OPEN_IN_LENS_AGG_BASED.GAUGE
    );
    gaugeDashboardId = getImportedDashboardId(imported, testData.OPEN_IN_LENS_DASHBOARDS.GAUGE);

    await scoutSpace.uiSettings.setDefaultIndex(testData.DATA_VIEW_ID.LOGSTASH);
    await scoutSpace.uiSettings.set({
      'dateFormat:tz': 'UTC',
      'timepicker:timeDefaults': `{ "from": "${testData.LOGSTASH_IN_RANGE_DATES.from}", "to": "${testData.LOGSTASH_IN_RANGE_DATES.to}"}`,
    });
  });

  spaceTest.beforeEach(async ({ browserAuth, context, pageObjects }) => {
    await enableElasticChartDebug(context);
    await browserAuth.loginAsPrivilegedUser();
    await pageObjects.dashboard.openDashboardWithIdInEditMode(gaugeDashboardId);
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'dateFormat:tz', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('should check Convert to Lens action availability', async ({ pageObjects }) => {
    const { dashboard } = pageObjects;

    await spaceTest.step('unsupported field type has no Convert to Lens action', async () => {
      expect(await canConvertToLensByTitle({ dashboard }, 'Gauge - Unsupported field type')).toBe(
        false
      );
    });

    await spaceTest.step('basic gauge has Convert to Lens action', async () => {
      expect(await canConvertToLensByTitle({ dashboard }, 'Gauge - Basic')).toBe(true);
    });
  });

  spaceTest('should convert aggregation with params', async ({ page, pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Gauge - Agg with params');
    await lens.waitForVisualization('gaugeChart');
    expect(await lens.getLayerCount()).toBe(1);

    const dimensions = await lens.getDimensionTriggers();
    expect(dimensions).toHaveLength(3);
    await expect(dimensions[0]).toHaveText('Average machine.ram');
    await expect(dimensions[1]).toHaveText('Static value: 0');
    await expect(dimensions[2]).toHaveText('Static value: 100');

    const { bullet } = await getChartDebugData(page, 'gaugeChart');
    const debugData = bullet?.rows[0][0];
    expect(debugData?.subtype).toBe(BulletSubtype.twoThirdsCircle);
    expect(debugData?.title).toBe('Average machine.ram');
    expect(Math.round(debugData?.value ?? 0)).toBe(13104036081);
    expect(debugData?.domain).toStrictEqual([0, 100]);
  });

  spaceTest('should convert color ranges', async ({ page, pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Gauge - Color ranges');
    await lens.waitForVisualization('gaugeChart');
    expect(await lens.getLayerCount()).toBe(1);

    const dimensions = await lens.getDimensionTriggers();
    expect(dimensions).toHaveLength(3);
    await expect(dimensions[0]).toHaveText('Average machine.ram');
    await expect(dimensions[1]).toHaveText('Static value: 0');
    await expect(dimensions[2]).toHaveText('Static value: 15000000000');

    const { bullet } = await getChartDebugData(page, 'gaugeChart');
    const debugData = bullet?.rows[0][0];
    expect(debugData?.subtype).toBe(BulletSubtype.twoThirdsCircle);
    expect(debugData?.title).toBe('Average machine.ram');
    expect(Math.round(debugData?.value ?? 0)).toBe(13104036081);
    expect(debugData?.domain).toStrictEqual([0, 15000000000]);

    await dimensions[0].click();
    await lens.openPalettePanel();
    await expect
      .poll(async () => lens.getPaletteColorStops(), { timeout: 20_000 })
      .toStrictEqual([
        { stop: '0', color: 'rgba(0, 104, 55, 1)' },
        { stop: '10000', color: 'rgba(183, 224, 117, 1)' },
        { stop: '20000', color: 'rgba(253, 191, 111, 1)' },
        { stop: '30000', color: 'rgba(165, 0, 38, 1)' },
        { stop: '15000000000', color: undefined },
      ]);
  });
});
