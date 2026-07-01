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
  const listingTable = getService('listingTable');
  const find = getService('find');
  const retry = getService('retry');
  const testSubjects = getService('testSubjects');

  // Switching `lnsXYvis` to a datatable re-applies the datatable's empty-rows
  // default to its `@timestamp` row, which inserts empty boundary buckets and
  // shifts every later row/cell assertion in this shared-state suite. Turn the
  // option back off so the table matches the populated-only layout the
  // assertions below were written against.
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

  describe('lens datatable', () => {
    it('should able to sort a table by a column', async () => {
      await visualize.gotoVisualizationLandingPage();
      await listingTable.searchForItemWithName('lnsXYvis');
      await lens.clickVisualizeListItemTitle('lnsXYvis');
      await lens.switchToVisualization('lnsDatatable');
      await disableEmptyRowsOnDateHistogramRow();
      // Sort by number
      await lens.changeTableSortingBy(2, 'ascending');
      await lens.waitForVisualization();
      expect(await lens.getDatatableCellText(0, 0, false)).to.eql('1');
      expect(await lens.getDatatableCellText(1, 0, false)).to.eql('2');
      expect(await lens.getDatatableCellText(2, 0, false)).to.eql('3');
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
        await lens.changeTableSortingBy(0, 'descending');
        await lens.waitForVisualization();
        expect(await lens.isDatatableHeaderSorted(0)).to.eql(false);
      });
    });

    it('should apply compact density correctly', async () => {
      await lens.openStyleSettingsFlyout();
      await lens.setDataTableDensity('compact');
      expect(await lens.checkDataTableDensity('s')).to.be(true);
      await lens.closeFlyoutWithBackButton();
    });

    it('should allow toggling row numbers from the style settings flyout', async () => {
      await lens.openStyleSettingsFlyout();

      // Disable row number
      await lens.toggleShowRowNumbers();
      expect(await lens.findRowNumberColumn()).to.be(false);

      // Enable row number
      await lens.toggleShowRowNumbers();
      expect(await lens.findRowNumberColumn()).to.be(true);

      await lens.closeFlyoutWithBackButton();
    });

    it('should apply expanded density correctly', async () => {
      await lens.openStyleSettingsFlyout();
      await lens.setDataTableDensity('expanded');
      expect(await lens.checkDataTableDensity('l')).to.be(true);
      await lens.closeFlyoutWithBackButton();
    });

    it('should apply normal density correctly', async () => {
      await lens.openStyleSettingsFlyout();
      await lens.setDataTableDensity('normal');
      expect(await lens.checkDataTableDensity('m')).to.be(true);
      await lens.closeFlyoutWithBackButton();
    });

    it('should able to sort a last_value column correctly in a table', async () => {
      // configure last_value with a keyword field
      await lens.configureDimension({
        dimension: 'lnsDatatable_metrics > lns-empty-dimension',
        operation: 'last_value',
        field: 'geo.dest',
      });

      await lens.changeTableSortingBy(3, 'ascending');
      await lens.waitForVisualization();
      expect(await lens.getDatatableCellText(0, 3)).to.eql('CN');

      await lens.changeTableSortingBy(3, 'descending');
      await lens.waitForVisualization();
      expect(await lens.getDatatableCellText(0, 3)).to.eql('PH');

      // now configure a new one with an ip field
      await lens.configureDimension({
        dimension: 'lnsDatatable_metrics > lns-empty-dimension',
        operation: 'last_value',
        field: 'ip',
      });
      await lens.changeTableSortingBy(4, 'ascending');
      await lens.waitForVisualization();
      expect(await lens.getDatatableCellText(0, 4)).to.eql('78.83.247.30');
      // Change the sorting
      await lens.changeTableSortingBy(4, 'descending');
      await lens.waitForVisualization();
      expect(await lens.getDatatableCellText(0, 0)).to.eql('169.228.188.120');

      await retry.try(async () => {
        await lens.changeTableSortingBy(4, 'descending');
        await lens.waitForVisualization();
        expect(await lens.isDatatableHeaderSorted(0)).to.eql(false);
      });

      // clear all metrics and reconfigure the default
      await lens.removeDimension('lnsDatatable_metrics');
      await lens.removeDimension('lnsDatatable_metrics');
      await lens.removeDimension('lnsDatatable_metrics');
      await lens.configureDimension({
        dimension: 'lnsDatatable_metrics > lns-empty-dimension',
        operation: 'average',
        field: 'bytes',
      });
    });

    it('should able to use filters cell actions in table', async () => {
      const firstCellContent = await lens.getDatatableCellText(0, 0);
      await retry.try(async () => {
        await lens.clickTableCellAction(0, 0, 'lensDatatableFilterOut');
        await lens.waitForVisualization();
        expect(
          await find.existsByCssSelector(
            `[data-test-subj*="filter-value-${firstCellContent}"][data-test-subj*="filter-negated"]`
          )
        ).to.eql(true);
      });
    });

    it('should allow to configure column visibility', async () => {
      expect(await lens.getDatatableHeaderText(0)).to.equal('Top 3 values of ip');
      expect(await lens.getDatatableHeaderText(1)).to.equal('@timestamp per 3 hours');
      expect(await lens.getDatatableHeaderText(2)).to.equal('Average of bytes');

      await lens.toggleColumnVisibility('lnsDatatable_rows > lns-dimensionTrigger', 1);

      expect(await lens.getDatatableHeaderText(0)).to.equal('@timestamp per 3 hours');
      expect(await lens.getDatatableHeaderText(1)).to.equal('Average of bytes');

      await lens.toggleColumnVisibility('lnsDatatable_rows > lns-dimensionTrigger', 4);

      expect(await lens.getDatatableHeaderText(0)).to.equal('Top 3 values of ip');
      expect(await lens.getDatatableHeaderText(1)).to.equal('@timestamp per 3 hours');
      expect(await lens.getDatatableHeaderText(2)).to.equal('Average of bytes');
    });

    it('should allow to transpose columns', async () => {
      await lens.dragDimensionToDimension({
        from: 'lnsDatatable_rows > lns-dimensionTrigger',
        to: 'lnsDatatable_columns > lns-empty-dimension',
      });
      expect(await lens.getDatatableHeaderText(0)).to.equal('@timestamp per 3 hours');
      expect(await lens.getDatatableHeaderText(1)).to.equal('169.228.188.120 › Average of bytes');
      expect(await lens.getDatatableHeaderText(2)).to.equal('78.83.247.30 › Average of bytes');
      expect(await lens.getDatatableHeaderText(3)).to.equal('226.82.228.233 › Average of bytes');
    });

    it('should allow to sort by transposed columns', async () => {
      await lens.changeTableSortingBy(2, 'ascending');
      await lens.waitForVisualization();
      expect(await lens.getDatatableCellText(0, 2)).to.eql('17,246');
    });

    it('should show dynamic coloring feature for numeric columns', async () => {
      await lens.openDimensionEditor('lnsDatatable_metrics > lns-dimensionTrigger');
      await lens.setTableDynamicColoring('text');
      await lens.waitForVisualization();
      const styleObj = await lens.getDatatableCellStyle(0, 2);
      expect(styleObj['background-color']).to.be(undefined);
      expect(styleObj.color).to.be('rgb(140, 217, 187)');
    });

    it('should allow to color cell background rather than text', async () => {
      await lens.setTableDynamicColoring('cell');
      await lens.waitForVisualization();
      const styleObj = await lens.getDatatableCellStyle(0, 2);
      expect(styleObj['background-color']).to.be('rgb(140, 217, 187)');
      // should also set text color when in cell mode
      expect(styleObj.color).to.be('rgb(7, 16, 31)');
    });

    it('should open the palette panel to customize the palette look', async () => {
      await lens.openPalettePanel();
      await lens.waitForVisualization();
      await lens.changePaletteTo('temperature');
      await lens.waitForVisualization();
      const styleObj = await lens.getDatatableCellStyle(0, 2);
      expect(styleObj['background-color']).to.be('rgb(246, 249, 252)');
    });

    it('should keep the coloring consistent when changing mode', async () => {
      // Change mode from percent to number
      await testSubjects.click('lnsPalettePanel_dynamicColoring_rangeType_groups_number');
      await lens.waitForVisualization();
      // check that all remained the same
      const styleObj = await lens.getDatatableCellStyle(0, 2);
      expect(styleObj['background-color']).to.be('rgb(246, 249, 252)');
    });

    it('should keep the coloring consistent when moving to custom palette from default', async () => {
      await lens.changePaletteTo('custom');
      await lens.waitForVisualization();
      // check that all remained the same
      const styleObj = await lens.getDatatableCellStyle(0, 2);
      expect(styleObj['background-color']).to.be('rgb(246, 249, 252)');
    });

    it('tweak the color stops numeric value', async () => {
      // restore default palette and percent mode
      await lens.changePaletteTo('temperature');
      await testSubjects.click('lnsPalettePanel_dynamicColoring_rangeType_groups_percent');
      // now tweak the value
      await testSubjects.setValue('lnsPalettePanel_dynamicColoring_range_value_0', '30', {
        clearWithKeyboard: true,
      });
      // when clicking on another row will trigger a sorting + update
      await testSubjects.click('lnsPalettePanel_dynamicColoring_range_value_1');
      await lens.waitForVisualization();
      // pick a cell without color as is below the range
      const styleObj = await lens.getDatatableCellStyle(3, 3);
      expect(styleObj['background-color']).to.be(undefined);
      // should also set text color when in cell mode
      expect(styleObj.color).to.be(undefined);
    });

    it('should allow the user to reverse the palette', async () => {
      await testSubjects.click('lnsPalettePanel_dynamicColoring_reverseColors');
      await lens.waitForVisualization();
      const styleObj = await lens.getDatatableCellStyle(1, 1);
      expect(styleObj['background-color']).to.be('rgb(207, 225, 255)');
      // should also set text color when in cell mode
      expect(styleObj.color).to.be('rgb(7, 16, 31)');
      await lens.closePalettePanel();
    });

    it('should render values as badges when badge coloring is enabled', async () => {
      await lens.setTableDynamicColoring('badge');
      await lens.waitForVisualization();
      const cell = await lens.getDatatableCell(0, 2);
      const badge = await cell.findByTestSubject('lnsTableCellContentBadge');
      const badgeText = await badge.getVisibleText();
      expect(badgeText).to.not.be.empty();
      const cellStyle = await lens.getDatatableCellStyle(0, 2);
      expect(cellStyle['background-color']).to.be(undefined);
    });

    it('should allow to show a summary table for metric columns', async () => {
      await lens.setTableSummaryRowFunction('sum');
      await lens.waitForVisualization();
      await lens.assertExactText(
        '[data-test-subj="lnsDataTable-footer-169.228.188.120-›-Average-of-bytes"]',
        'Sum: 18,994'
      );
    });
  });
}
