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

spaceTest.describe('Lens open in Lens — agg-based Table', { tag: tags.stateful.classic }, () => {
  let tableDashboardId: string;

  spaceTest.beforeAll(async ({ scoutSpace }) => {
    const imported = await scoutSpace.savedObjects.load(
      testData.KBN_ARCHIVES.OPEN_IN_LENS_AGG_BASED.TABLE
    );
    tableDashboardId = getImportedDashboardId(imported, testData.OPEN_IN_LENS_DASHBOARDS.TABLE);

    await scoutSpace.uiSettings.setDefaultIndex(testData.DATA_VIEW_ID.LOGSTASH);
    await scoutSpace.uiSettings.set({
      'dateFormat:tz': 'UTC',
      'timepicker:timeDefaults': `{ "from": "${testData.LOGSTASH_IN_RANGE_DATES.from}", "to": "${testData.LOGSTASH_IN_RANGE_DATES.to}"}`,
    });
  });

  spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
    await browserAuth.loginAsPrivilegedUser();
    await loadDashboardInEditModeById(pageObjects, tableDashboardId);
  });

  spaceTest.afterAll(async ({ scoutSpace }) => {
    await scoutSpace.uiSettings.unset('defaultIndex', 'dateFormat:tz', 'timepicker:timeDefaults');
    await scoutSpace.savedObjects.cleanStandardList();
  });

  spaceTest('should check Convert to Lens action availability', async ({ pageObjects }) => {
    const { dashboard } = pageObjects;

    await spaceTest.step('unsupported aggregation has no Convert to Lens action', async () => {
      expect(await canConvertToLensByTitle({ dashboard }, 'Table - Unsupported Agg')).toBe(false);
    });

    await spaceTest.step('supported aggregation has Convert to Lens action', async () => {
      expect(await canConvertToLensByTitle({ dashboard }, 'Table - Agg with params')).toBe(true);
    });
  });

  spaceTest('should convert aggregation with params', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Table - Agg with params');
    await lens.waitForVisualization('lnsDataTable');
    await lens.assertLayerCount(1);

    const dimensions = await lens.getDimensionTriggers();
    expect(dimensions).toHaveLength(1);
    await expect(dimensions[0]).toHaveText('Average machine.ram');
  });

  spaceTest('should convert total function to summary row', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Table - Summary row');
    await lens.waitForVisualization('lnsDataTable');
    await lens.assertLayerCount(1);

    const dimensions = await lens.getDimensionTriggers();
    expect(dimensions).toHaveLength(1);
    await expect(dimensions[0]).toHaveText('Average machine.ram');

    await lens.openDimensionEditor('lnsDatatable_metrics > lns-dimensionTrigger');
    expect(await lens.getComboBoxSelectedOptions('lnsDatatable_summaryrow_function')).toStrictEqual(
      ['Sum']
    );
  });

  spaceTest('should convert sibling pipeline aggregation', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Table - Sibling pipeline agg');
    await lens.waitForVisualization('lnsDataTable');
    await lens.assertLayerCount(1);

    const metricText = await lens.getDimensionTriggerText('lnsDatatable_metrics', 0);
    const splitRowText = await lens.getDimensionTriggerText('lnsDatatable_rows', 0);

    const dimensions = await lens.getDimensionTriggers();
    expect(dimensions).toHaveLength(2);
    expect(metricText).toBe('Overall Max of Count');
    expect(splitRowText).toBe('@timestamp');
  });

  spaceTest('should convert parent pipeline aggregation', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Table - Parent pipeline agg');
    await lens.waitForVisualization('lnsDataTable');
    await lens.assertLayerCount(1);

    const metricText = await lens.getDimensionTriggerText('lnsDatatable_metrics', 0);
    const splitRowText = await lens.getDimensionTriggerText('lnsDatatable_rows', 0);

    const dimensions = await lens.getDimensionTriggers();
    expect(dimensions).toHaveLength(2);
    expect(metricText).toBe('Cumulative Sum of Count');
    expect(splitRowText).toBe('@timestamp');
  });

  spaceTest(
    'should convert split rows and split table to split table rows',
    async ({ pageObjects }) => {
      const { dashboard, lens } = pageObjects;

      await convertToLensByTitle({ dashboard }, 'Table - Split rows and tables');
      await lens.waitForVisualization('lnsDataTable');
      await lens.assertLayerCount(1);

      const metricText = await lens.getDimensionTriggerText('lnsDatatable_metrics', 0);
      const splitRowText1 = await lens.getDimensionTriggerText('lnsDatatable_rows', 0);
      const splitRowText2 = await lens.getDimensionTriggerText('lnsDatatable_rows', 1);

      const dimensions = await lens.getDimensionTriggers();
      expect(dimensions).toHaveLength(3);
      expect(metricText).toBe('Count');
      expect(splitRowText1).toBe('@timestamp');
      expect(splitRowText2).toBe('bytes: Descending');
    }
  );

  spaceTest('should convert percentage column', async ({ pageObjects }) => {
    const { dashboard, lens } = pageObjects;

    await convertToLensByTitle({ dashboard }, 'Table - Percentage Column');
    await lens.waitForVisualization('lnsDataTable');
    await lens.assertLayerCount(1);

    const metricText = await lens.getDimensionTriggerText('lnsDatatable_metrics', 0);
    const percentageColumnText = await lens.getDimensionTriggerText('lnsDatatable_metrics', 1);

    await lens.openDimensionEditor('lnsDatatable_metrics > lns-dimensionTrigger', 0, 1);
    expect(await lens.getComboBoxSelectedOptions('indexPattern-dimension-format')).toStrictEqual([
      'Percent',
    ]);

    const dimensions = await lens.getDimensionTriggers();
    expect(dimensions).toHaveLength(2);
    expect(metricText).toBe('Count');
    expect(percentageColumnText).toBe('Count percentages');
  });
});
