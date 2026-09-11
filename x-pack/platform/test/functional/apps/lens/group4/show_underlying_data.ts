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
  const { lens, common, header, discover, unifiedFieldList } = getPageObjects([
    'lens',
    'common',
    'header',
    'discover',
    'unifiedFieldList',
  ]);
  const queryBar = getService('queryBar');
  const filterBar = getService('filterBar');
  const testSubjects = getService('testSubjects');
  const find = getService('find');
  const browser = getService('browser');

  const openXyVisWithExtensionBreakdown = async () => {
    await lens.openEditor(LENS_BASIC_FIXTURE_IDS.xyVis, 'xyVisChart');
    await lens.configureDimension({
      dimension: 'lnsXY_splitDimensionPanel > lns-dimensionTrigger',
      operation: 'terms',
      field: 'extension.raw',
    });
    await lens.waitForVisualization('xyVisChart');
  };

  describe('show underlying data', () => {
    describe('layer composition', () => {
      it('should show the open button for a compatible saved visualization', async () => {
        await openXyVisWithExtensionBreakdown();

        // expect the button is shown and enabled

        await testSubjects.clickWhenNotDisabledWithoutRetry(`lnsApp_openInDiscover`);

        const [lensWindowHandler, discoverWindowHandle] = await browser.getAllWindowHandles();
        await browser.switchToWindow(discoverWindowHandle);

        await header.waitUntilLoadingHasFinished();
        await discover.waitUntilSearchingHasFinished();
        await testSubjects.existOrFail('unifiedDataTableToolbar');
        // check the table columns
        const columns = await discover.getColumnHeaders();
        expect(columns).to.eql(['@timestamp', 'extension.raw', 'bytes']);
        await browser.closeCurrentWindow();
        await browser.switchToWindow(lensWindowHandler);
      });

      it('should show the open button if visualization has an annotation layer', async () => {
        await lens.createLayer('annotations');
        await testSubjects.clickWhenNotDisabledWithoutRetry(`lnsApp_openInDiscover`);
        const [lensWindowHandler, discoverWindowHandle] = await browser.getAllWindowHandles();
        await browser.switchToWindow(discoverWindowHandle);

        await header.waitUntilLoadingHasFinished();
        await testSubjects.existOrFail('unifiedHistogramChart');
        const columns = await discover.getColumnHeaders();
        expect(columns).to.eql(['@timestamp', 'extension.raw', 'bytes']);
        await browser.closeCurrentWindow();
        await browser.switchToWindow(lensWindowHandler);
      });

      it('should show the open button if visualization has a reference line layer', async () => {
        await lens.createLayer('referenceLine');
        await testSubjects.clickWhenNotDisabledWithoutRetry(`lnsApp_openInDiscover`);
        const [lensWindowHandler, discoverWindowHandle] = await browser.getAllWindowHandles();
        await browser.switchToWindow(discoverWindowHandle);

        await header.waitUntilLoadingHasFinished();
        await testSubjects.existOrFail('unifiedHistogramChart');
        const columns = await discover.getColumnHeaders();
        expect(columns).to.eql(['@timestamp', 'extension.raw', 'bytes']);
        await browser.closeCurrentWindow();
        await browser.switchToWindow(lensWindowHandler);
      });

      it('should not show the open button if visualization has multiple data layers', async () => {
        await lens.createLayer();
        await lens.configureDimension({
          dimension: 'lns-layerPanel-3 > lnsXY_xDimensionPanel > lns-empty-dimension',
          operation: 'date_histogram',
          field: '@timestamp',
        });

        await lens.configureDimension({
          dimension: 'lns-layerPanel-3 > lnsXY_yDimensionPanel > lns-empty-dimension',
          operation: 'median',
          field: 'bytes',
        });

        await lens.waitForVisualization('xyVisChart');

        expect(await testSubjects.isEnabled(`lnsApp_openInDiscover`)).to.be(false);

        for (const index of [3, 2, 1]) {
          await lens.removeLayer(index);
        }
      });
    });

    describe('formula and filters', () => {
      it('should ignore the top values column if other category is enabled', async () => {
        await openXyVisWithExtensionBreakdown();

        await lens.openDimensionEditor('lnsXY_splitDimensionPanel > lns-dimensionTrigger');
        await testSubjects.click('indexPattern-terms-advanced');
        await testSubjects.click('indexPattern-terms-other-bucket');

        await lens.closeDimensionEditor();

        await lens.waitForVisualization('xyVisChart');
        // expect the button is shown and enabled

        await testSubjects.clickWhenNotDisabledWithoutRetry(`lnsApp_openInDiscover`);

        const [lensWindowHandler, discoverWindowHandle] = await browser.getAllWindowHandles();
        await browser.switchToWindow(discoverWindowHandle);
        await header.waitUntilLoadingHasFinished();
        await testSubjects.existOrFail('unifiedHistogramChart');
        expect(await queryBar.getQueryString()).be.eql('');
        await browser.closeCurrentWindow();
        await browser.switchToWindow(lensWindowHandler);
      });

      it('should show the open button for a compatible saved visualization with a lucene query', async () => {
        await openXyVisWithExtensionBreakdown();

        // add a lucene query to the yDimension
        await lens.openDimensionEditor('lnsXY_yDimensionPanel > lns-dimensionTrigger');
        await lens.enableFilter();
        // turn off the KQL switch to change the language to lucene
        await testSubjects.click('indexPattern-filter-by-input > switchQueryLanguageButton');
        await testSubjects.click('luceneLanguageMenuItem');
        await testSubjects.click('indexPattern-filter-by-input > switchQueryLanguageButton');
        // apparently setting a filter requires some time before and after typing to work properly
        await common.sleep(1000);
        await lens.setFilterBy('machine.ram:*');
        await common.sleep(1000);

        await lens.closeDimensionEditor();

        await lens.waitForVisualization('xyVisChart');

        await testSubjects.clickWhenNotDisabledWithoutRetry(`lnsApp_openInDiscover`);

        const [lensWindowHandler, discoverWindowHandle] = await browser.getAllWindowHandles();
        await browser.switchToWindow(discoverWindowHandle);
        await header.waitUntilLoadingHasFinished();
        await unifiedFieldList.waitUntilSidebarHasLoaded();
        await testSubjects.existOrFail('unifiedHistogramChart');
        // check the query
        expect(await queryBar.getQueryString()).be.eql(
          '( ( extension.raw: "png" ) OR ( extension.raw: "css" ) OR ( extension.raw: "jpg" ) )'
        );
        const filterPills = await filterBar.getFiltersLabel();
        expect(filterPills.length).to.be(1);
        expect(filterPills[0]).to.be('Lens context (lucene)');
        await browser.closeCurrentWindow();
        await browser.switchToWindow(lensWindowHandler);
      });

      it('should show the underlying data extracting all filters and columns from a formula', async () => {
        await openXyVisWithExtensionBreakdown();

        await lens.removeDimension('lnsXY_yDimensionPanel');

        await lens.configureDimension({
          dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
          operation: 'formula',
          formula: `average(memory, kql=`,
          keepOpen: true,
        });

        const input = await find.activeElement();
        await input.type(`bytes > 2000`);
        // the tooltip seems to be there as long as the focus is in the query string
        await input.pressKeys(browser.keys.RIGHT);

        await lens.closeDimensionEditor();

        await lens.waitForVisualization('xyVisChart');
        // expect the button is shown and enabled
        await testSubjects.clickWhenNotDisabledWithoutRetry(`lnsApp_openInDiscover`);

        const [lensWindowHandler, discoverWindowHandle] = await browser.getAllWindowHandles();
        await browser.switchToWindow(discoverWindowHandle);
        await header.waitUntilLoadingHasFinished();
        await testSubjects.existOrFail('unifiedHistogramChart');
        // check the columns
        const columns = await discover.getColumnHeaders();
        expect(columns).to.eql(['@timestamp', 'extension.raw', 'memory']);
        // check the query
        expect(await queryBar.getQueryString()).be.eql(
          '( ( bytes > 2000 ) AND ( ( extension.raw: "css" ) OR ( extension.raw: "gif" ) OR ( extension.raw: "jpg" ) ) )'
        );
        await browser.closeCurrentWindow();
        await browser.switchToWindow(lensWindowHandler);
      });

      it('should extract a filter from a formula global filter', async () => {
        await openXyVisWithExtensionBreakdown();

        await lens.removeDimension('lnsXY_yDimensionPanel');

        await lens.configureDimension({
          dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
          operation: 'formula',
          formula: `count()`,
          keepOpen: true,
        });

        await lens.enableFilter();
        // apparently setting a filter requires some time before and after typing to work properly
        await common.sleep(1000);
        await lens.setFilterBy('bytes > 4000');
        await common.sleep(1000);

        await lens.waitForVisualization('xyVisChart');
        // expect the button is shown and enabled
        await testSubjects.clickWhenNotDisabledWithoutRetry(`lnsApp_openInDiscover`);

        const [lensWindowHandler, discoverWindowHandle] = await browser.getAllWindowHandles();
        await browser.switchToWindow(discoverWindowHandle);
        await header.waitUntilLoadingHasFinished();
        await testSubjects.existOrFail('unifiedHistogramChart');
        // check the query
        expect(await queryBar.getQueryString()).be.eql(
          '( ( bytes > 4000 ) AND ( ( extension.raw: "css" ) OR ( extension.raw: "gif" ) OR ( extension.raw: "jpg" ) ) )'
        );
        await browser.closeCurrentWindow();
        await browser.switchToWindow(lensWindowHandler);
      });
    });
  });
}
