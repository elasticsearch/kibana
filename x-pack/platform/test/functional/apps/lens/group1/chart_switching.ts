/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';
import { LENS_BASIC_FIXTURE_IDS } from '../../../fixtures/kbn_archives/lens/ids';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { visualize, lens } = getPageObjects(['visualize', 'lens']);
  const testSubjects = getService('testSubjects');

  // Add tests here when the main behavior is switching one visualization type
  // to another and verifying that Lens preserves or maps the configuration.
  describe('lens chart switching', () => {
    it('should transition from metric to table to metric', async () => {
      await lens.openEditor(LENS_BASIC_FIXTURE_IDS.artistMetric, 'legacyMtrVis');

      await lens.assertLegacyMetric('Maximum of bytes', '19,986');
      await lens.switchToVisualization('lnsDatatable');
      expect(await lens.getDatatableHeaderText()).to.eql('Maximum of bytes');
      expect(await lens.getDatatableCellText(0, 0)).to.eql('19,986');
      await lens.switchToVisualization('lnsLegacyMetric');
      await lens.assertLegacyMetric('Maximum of bytes', '19,986');
    });

    it('should transition from line chart to pie chart and to bar chart', async () => {
      await lens.openEditor(LENS_BASIC_FIXTURE_IDS.xyVis, 'xyVisChart');

      expect(await lens.hasChartSwitchWarning('pie')).to.eql(true);
      await lens.switchToVisualization('pie');

      expect(await lens.getTitle()).to.eql('lnsXYvis');
      expect(await lens.getDimensionTriggerText('lnsPie_sliceByDimensionPanel')).to.eql(
        'Top 3 values of ip'
      );
      expect(await lens.getDimensionTriggerText('lnsPie_sizeByDimensionPanel')).to.eql(
        'Average of bytes'
      );

      expect(await lens.hasChartSwitchWarning('bar')).to.eql(false);
      await lens.switchToVisualization('bar');
      expect(await lens.getTitle()).to.eql('lnsXYvis');
      expect(await lens.getDimensionTriggerText('lnsXY_splitDimensionPanel')).to.eql(
        'Top 3 values of ip'
      );
      expect(await lens.getDimensionTriggerText('lnsXY_yDimensionPanel')).to.eql(
        'Average of bytes'
      );
    });

    it('should transition from bar chart to line chart', async () => {
      await lens.openEditor(LENS_BASIC_FIXTURE_IDS.xyVis, 'xyVisChart');

      await lens.switchToVisualization('line');
      expect(await lens.getTitle()).to.eql('lnsXYvis');
      expect(await lens.getDimensionTriggerText('lnsXY_xDimensionPanel')).to.eql('@timestamp');
      expect(await lens.getDimensionTriggerText('lnsXY_yDimensionPanel')).to.eql(
        'Average of bytes'
      );
      expect(await lens.getDimensionTriggerText('lnsXY_splitDimensionPanel')).to.eql(
        'Top 3 values of ip'
      );
    });

    it('should transition from pie chart to treemap chart', async () => {
      await lens.openEditor(LENS_BASIC_FIXTURE_IDS.pieVis, 'partitionVisChart');

      expect(await lens.hasChartSwitchWarning('treemap')).to.eql(false);
      await lens.switchToVisualization('treemap');
      expect(await lens.getDimensionTriggersTexts('lnsPie_groupByDimensionPanel')).to.eql([
        'Top 7 values of geo.dest',
        'Top 3 values of geo.src',
      ]);
      expect(await lens.getDimensionTriggerText('lnsPie_sizeByDimensionPanel')).to.eql(
        'Average of bytes'
      );
    });

    it('should create a pie chart and switch to datatable', async () => {
      await visualize.navigateToNewVisualization();
      await visualize.clickVisType('lens');

      await lens.switchToVisualization('pie');
      await lens.configureDimension({
        dimension: 'lnsPie_sliceByDimensionPanel > lns-empty-dimension',
        operation: 'date_histogram',
        field: '@timestamp',
        disableEmptyRows: true,
      });

      await lens.configureDimension({
        dimension: 'lnsPie_sizeByDimensionPanel > lns-empty-dimension',
        operation: 'average',
        field: 'bytes',
      });

      expect(await lens.hasChartSwitchWarning('lnsDatatable')).to.eql(false);
      await lens.switchToVisualization('lnsDatatable');

      // Switching chart type re-applies the target type's empty-rows default, so
      // the datatable turns "Include empty rows" back on. Turn it off again to
      // assert the populated buckets only.
      await lens.openDimensionEditor('lnsDatatable_rows > lns-dimensionTrigger');
      await testSubjects.setEuiSwitch('indexPattern-include-empty-rows', 'uncheck');
      await lens.closeDimensionEditor();

      expect(await lens.getDatatableHeaderText()).to.eql('@timestamp per 3 hours');
      expect(await lens.getDatatableCellText(0, 0)).to.eql('2015-09-20 00:00');
      expect(await lens.getDatatableHeaderText(1)).to.eql('Average of bytes');
      expect(await lens.getDatatableCellText(0, 1)).to.eql('6,011.351');
    });

    it('should create a heatmap chart and transition to barchart', async () => {
      await visualize.navigateToNewVisualization();
      await visualize.clickVisType('lens');

      await lens.switchToVisualization('heatmap', 'heat');

      await lens.configureDimension({
        dimension: 'lnsHeatmap_xDimensionPanel > lns-empty-dimension',
        operation: 'date_histogram',
        field: '@timestamp',
      });
      await lens.configureDimension({
        dimension: 'lnsHeatmap_yDimensionPanel > lns-empty-dimension',
        operation: 'terms',
        field: 'geo.dest',
      });
      await lens.configureDimension({
        dimension: 'lnsHeatmap_cellPanel > lns-empty-dimension',
        operation: 'average',
        field: 'bytes',
      });

      expect(await lens.hasChartSwitchWarning('bar')).to.eql(false);
      await lens.switchToVisualization('bar');
      expect(await lens.getDimensionTriggerText('lnsXY_xDimensionPanel')).to.eql('@timestamp');
      expect(await lens.getDimensionTriggerText('lnsXY_yDimensionPanel')).to.eql(
        'Average of bytes'
      );
    });
  });
}
