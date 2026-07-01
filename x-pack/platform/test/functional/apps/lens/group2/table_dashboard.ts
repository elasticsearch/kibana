/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { lens, visualize, dashboard } = getPageObjects(['lens', 'visualize', 'dashboard']);
  const listingTable = getService('listingTable');
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');

  const disableEmptyRowsOnDateHistogramRow = async () => {
    const triggerTexts = await lens.getDimensionTriggersTexts('lnsDatatable_rows');
    const dateHistogramIndex = triggerTexts.findIndex((text) => text.includes('@timestamp'));
    await lens.openDimensionEditor(
      'lnsDatatable_rows > lns-dimensionTrigger',
      0,
      dateHistogramIndex
    );
    await testSubjects.setEuiSwitch('indexPattern-include-empty-rows', 'uncheck');
    await lens.closeDimensionEditor();
  };

  const checkTableSorting = async () => {
    // Sort by number
    await lens.changeTableSortingBy(2, 'ascending');
    await lens.waitForVisualization();
    expect(await lens.getDatatableCellText(0, 2)).to.eql('17,246');
    // Now sort by IP
    await lens.changeTableSortingBy(0, 'ascending');
    await lens.waitForVisualization();
    expect(await lens.getDatatableCellText(0, 0)).to.eql('78.83.247.30');
    // Change the sorting
    await lens.changeTableSortingBy(0, 'descending');
    await lens.waitForVisualization();
    expect(await lens.getDatatableCellText(0, 0)).to.eql('169.228.188.120');
    // Remove the sorting
    await retry.try(async () => {
      await lens.changeTableSortingBy(0, 'ascending');
      await lens.waitForVisualization();
      expect(await lens.isDatatableHeaderSorted(0)).to.eql(false);
    });
  };

  describe('lens table on dashboard', () => {
    it('should sort a table by column in dashboard edit mode', async () => {
      await visualize.gotoVisualizationLandingPage();
      await listingTable.searchForItemWithName('lnsXYvis');
      await lens.clickVisualizeListItemTitle('lnsXYvis');
      await lens.goToTimeRange();
      await lens.switchToVisualization('lnsDatatable');

      // Switching chart type re-applies the target type's empty-rows default, so
      // the datatable turns "Include empty rows" back on for its date histogram
      // row. Turn it off again so the sorting checks below only see populated
      // buckets and no leading empty row.
      await disableEmptyRowsOnDateHistogramRow();

      await lens.save('New Table', true, false, false, 'new');
      await dashboard.waitForRenderComplete();

      await checkTableSorting();
    });

    it('should sort a table by column in dashboard view mode', async () => {
      await dashboard.saveDashboard('Dashboard with a Lens Table');

      await checkTableSorting();
    });
  });
}
