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
  getPieChartLabels,
  loadDashboardInEditModeById,
} from '../../../fixtures';

spaceTest.describe('Lens open in Lens — agg-based Pie', { tag: tags.deploymentAgnostic }, () => {
  let pieDashboardId: string;

  spaceTest.beforeAll(async ({ scoutSpace }) => {
    const imported = await scoutSpace.savedObjects.load(
      testData.KBN_ARCHIVES.OPEN_IN_LENS_AGG_BASED.PIE
    );
    pieDashboardId = getImportedDashboardId(imported, testData.OPEN_IN_LENS_DASHBOARDS.PIE);

    await scoutSpace.uiSettings.setDefaultIndex(testData.DATA_VIEW_ID.LOGSTASH);
    await scoutSpace.uiSettings.set({
      'dateFormat:tz': 'UTC',
      'timepicker:timeDefaults': `{ "from": "${testData.LOGSTASH_IN_RANGE_DATES.from}", "to": "${testData.LOGSTASH_IN_RANGE_DATES.to}"}`,
    });
  });

  spaceTest.beforeEach(async ({ browserAuth, context, pageObjects }) => {
    await enableElasticChartDebug(context);
    await browserAuth.loginAsPrivilegedUser();
    await loadDashboardInEditModeById(pageObjects, pieDashboardId);
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'dateFormat:tz', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest(
    'should hide the "Convert to Lens" menu item if no split slices were defined',
    async ({ pageObjects }) => {
      const { dashboard } = pageObjects;
      expect(await canConvertToLensByTitle({ dashboard }, 'Pie - No split slices')).toBe(false);
    }
  );

  spaceTest(
    'should hide the "Convert to Lens" menu item if more than 3 split slices were defined',
    async ({ pageObjects }) => {
      const { dashboard } = pageObjects;
      expect(await canConvertToLensByTitle({ dashboard }, 'Pie - 4 layers')).toBe(false);
    }
  );

  spaceTest('should show the "Convert to Lens" menu item', async ({ pageObjects }) => {
    const { dashboard } = pageObjects;
    expect(await canConvertToLensByTitle({ dashboard }, 'Pie - 1 Split slice')).toBe(true);
  });

  spaceTest('should convert aggregation with params', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Pie - Agg with params');
    await lens.waitForVisualization('partitionVisChart');
    await lens.assertLayerCount(1);

    const sliceByText = await lens.getDimensionTriggerText('lnsPie_sliceByDimensionPanel', 0);
    const sizeByText = await lens.getDimensionTriggerText('lnsPie_sizeByDimensionPanel', 0);

    const dimensions = await lens.getDimensionTriggers();
    expect(dimensions).toHaveLength(2);
    expect(sliceByText).toBe('machine.os.raw: Descending');
    expect(sizeByText).toBe('Sum of machine.ram');
  });

  spaceTest('should convert terms to slice by', async ({ page, pageObjects }) => {
    const { dashboard, lens } = pageObjects;
    const expectedLabels = ['ios', 'osx', 'win 7', 'win 8', 'win xp'];

    await convertToLensByTitle({ dashboard }, 'Pie - Basic count');
    await lens.waitForVisualization('partitionVisChart');

    const sliceByText = await lens.getDimensionTriggerText('lnsPie_sliceByDimensionPanel', 0);
    const sizeByText = await lens.getDimensionTriggerText('lnsPie_sizeByDimensionPanel', 0);

    const dimensions = await lens.getDimensionTriggers();
    expect(dimensions).toHaveLength(2);
    expect(sliceByText).toBe('machine.os.raw: Descending');
    expect(sizeByText).toBe('Count');

    await expect
      .poll(
        async () => getPieChartLabels(await getChartDebugData(page, 'partitionVisChart')).sort(),
        { timeout: 20_000 }
      )
      .toStrictEqual([...expectedLabels].sort());
  });

  spaceTest('should convert pie with hole type correctly', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Pie - Basic count');
    await lens.waitForVisualization('partitionVisChart');

    expect(await lens.getChartSwitchType()).toBe('Pie');
    expect(await lens.getDonutHoleSize()).toBe('Small');
  });

  spaceTest('should convert Pie types correctly', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Pie - Non Donut');
    await lens.waitForVisualization('partitionVisChart');

    expect(await lens.getChartSwitchType()).toBe('Pie');
  });
});
