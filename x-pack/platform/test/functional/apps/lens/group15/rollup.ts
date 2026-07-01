/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { visualize, lens } = getPageObjects(['visualize', 'lens']);
  const find = getService('find');
  const listingTable = getService('listingTable');
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const testSubjects = getService('testSubjects');

  // Switching the xy chart (whose x-axis is a `@timestamp` date histogram) to a
  // datatable re-applies the datatable's empty-rows default, which inserts empty
  // boundary buckets and shifts the first data row. Turn the option back off so
  // the single populated bucket stays at row 0 for the assertions below.
  const disableEmptyRowsOnDateHistogramRow = async () => {
    const triggerTexts = await lens.getDimensionTriggersTexts('lnsDatatable_rows');
    const dateHistogramIndex = triggerTexts.findIndex((text) => text.includes('@timestamp'));
    if (dateHistogramIndex === -1) {
      return;
    }
    await lens.openDimensionEditor(
      'lnsDatatable_rows > lns-dimensionTrigger',
      0,
      dateHistogramIndex
    );
    await testSubjects.setEuiSwitch('indexPattern-include-empty-rows', 'uncheck');
    await lens.closeDimensionEditor();
  };

  describe('lens rollup tests', () => {
    before(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await esArchiver.loadIfNeeded('x-pack/platform/test/fixtures/es_archives/lens/rollup/data');
      await kibanaServer.importExport.load(
        'x-pack/platform/test/functional/fixtures/kbn_archives/rollup/config.json'
      );
    });

    after(async () => {
      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/lens/rollup/data');
      await kibanaServer.savedObjects.cleanStandardList();
    });

    it('should allow creation of lens xy chart', async () => {
      await visualize.navigateToNewVisualization();
      await visualize.clickVisType('lens');
      await lens.configureDimension({
        dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
        operation: 'date_histogram',
        field: '@timestamp',
      });

      await lens.configureDimension({
        dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
        operation: 'sum',
        field: 'bytes',
      });

      await lens.configureDimension({
        dimension: 'lnsXY_splitDimensionPanel > lns-empty-dimension',
        operation: 'terms',
        field: 'geo.src',
      });
      expect(await find.allByCssSelector('.echLegendItem')).to.have.length(2);

      await lens.save('Afancilenstest');

      // Ensure the visualization shows up in the visualize list, and takes
      // us back to the visualization as we configured it.
      await visualize.gotoVisualizationLandingPage();
      await listingTable.searchForItemWithName('Afancilenstest');
      await lens.clickVisualizeListItemTitle('Afancilenstest');
      expect(await lens.getTitle()).to.eql('Afancilenstest');

      // .echLegendItem__title is the only viable way of getting the xy chart's
      // legend item(s), so we're using a class selector here.
      expect(await find.allByCssSelector('.echLegendItem')).to.have.length(2);
    });

    it('should allow seamless transition to and from table view', async () => {
      await lens.switchToVisualization('lnsLegacyMetric');
      await lens.assertLegacyMetric('Sum of bytes', '16,788');
      await lens.switchToVisualization('lnsDatatable');
      await disableEmptyRowsOnDateHistogramRow();
      expect(await lens.getDatatableHeaderText()).to.eql('Sum of bytes');
      expect(await lens.getDatatableCellText(0, 0)).to.eql('16,788');
    });

    it('should allow to switch from regular index to rollup index retaining config', async () => {
      await visualize.navigateToNewVisualization();
      await visualize.clickVisType('lens');
      await lens.switchDataPanelIndexPattern('lens_regular_data');
      await lens.switchToVisualization('lnsLegacyMetric');
      await lens.configureDimension({
        dimension: 'lns-empty-dimension',
        operation: 'sum',
        field: 'bytes',
      });
      await lens.waitForVisualization('legacyMtrVis');

      await lens.assertLegacyMetric('Sum of bytes', '16,788');

      await lens.switchFirstLayerIndexPattern('lens_rolled_up_data');
      await lens.waitForVisualization('legacyMtrVis');

      await lens.assertLegacyMetric('Sum of bytes', '16,788');
    });
  });
}
