/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/examples/unified_field_list_examples/field_stats.ts
import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

const TEST_START_TIME = 'Sep 19, 2015 @ 06:31:44.000';
const TEST_END_TIME = 'Sep 23, 2015 @ 18:31:44.000';

export default ({ getService, getPageObjects }: FtrProviderContext) => {
  const PageObjects = getPageObjects([
    'common',
    'timePicker',
    'header',
    'unifiedFieldList',
    'svlCommonPage',
  ]);
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const comboBox = getService('comboBox');
  const retry = getService('retry');
  const testSubjects = getService('testSubjects');
  const filterBar = getService('filterBar');
  const dataViewTitle = 'logstash-2015.09.22';

  describe('Field stats', () => {
    before(async () => {
      await PageObjects.svlCommonPage.loginAsAdmin();
      await kibanaServer.savedObjects.cleanStandardList();
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/logstash_functional'
      );
      await kibanaServer.importExport.load(
        'x-pack/platform/test/functional/fixtures/kbn_archives/visualize/default'
      );
      // TODO: Loading this from `es_archives` in `test/serverless`
      // instead since minor modifications were required
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/serverless/fixtures/es_archives/pre_calculated_histogram'
      );
      await PageObjects.common.navigateToApp('unifiedFieldListExamples');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await retry.waitFor('combobox is ready', async () => {
        return await testSubjects.exists('dataViewSelector');
      });
      await comboBox.setCustom('dataViewSelector', dataViewTitle);
      await retry.waitFor('page is ready', async () => {
        return await testSubjects.exists('globalQueryBar');
      });
      await PageObjects.timePicker.setAbsoluteRange(TEST_START_TIME, TEST_END_TIME);
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();
    });

    after(async () => {
      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/logstash_functional');
      // TODO: Loading this from `es_archives` in `test/serverless`
      // instead since minor modifications were required
      await esArchiver.unload(
        'x-pack/platform/test/serverless/fixtures/es_archives/pre_calculated_histogram'
      );
      await kibanaServer.savedObjects.cleanStandardList();
      await PageObjects.unifiedFieldList.cleanSidebarLocalStorage();
    });

    describe('field distribution', () => {
      before(async () => {
        await PageObjects.unifiedFieldList.toggleSidebarSection('meta'); // it will allow to render more fields in Available fields section
      });

      it('should return an auto histogram for numbers and top values', async () => {
        await PageObjects.unifiedFieldList.clickFieldListItem('bytes');
        expect(await PageObjects.unifiedFieldList.getFieldStatsViewType()).to.be(
          'topValuesAndDistribution'
        );
        expect(await PageObjects.unifiedFieldList.getFieldStatsDocsCount()).to.be(4634);
        expect(await PageObjects.unifiedFieldList.getFieldStatsTopValueBucketsVisibleText()).to.be(
          '0\n3.2%\n3,954\n0.1%\n5,846\n0.1%\n6,497\n0.1%\n1,840\n0.1%\n4,206\n0.1%\n4,328\n0.1%\n4,669\n0.1%\n5,863\n0.1%\n6,631\n0.1%\nOther\n96.0%'
        );
      });

      it('should return an auto histogram for dates', async () => {
        await PageObjects.unifiedFieldList.clickFieldListItem('@timestamp');
        expect(await PageObjects.unifiedFieldList.getFieldStatsViewType()).to.be(
          'timeDistribution'
        );
        expect(await PageObjects.unifiedFieldList.getFieldStatsDocsCount()).to.be(4634);
      });

      it('should return top values for strings', async () => {
        await PageObjects.unifiedFieldList.clickFieldListItem('geo.src');
        expect(await PageObjects.unifiedFieldList.getFieldStatsViewType()).to.be('topValues');
        expect(await PageObjects.unifiedFieldList.getFieldStatsDocsCount()).to.be(4634);
        expect(await PageObjects.unifiedFieldList.getFieldStatsTopValueBucketsVisibleText()).to.be(
          'CN\n18.0%\nIN\n17.4%\nUS\n9.2%\nID\n3.4%\nBR\n3.1%\nPK\n2.5%\nBD\n2.3%\nNG\n2.0%\nRU\n1.8%\nJP\n1.6%\nOther\n38.8%'
        );
      });

      it('should return top values for ip fields', async () => {
        await PageObjects.unifiedFieldList.clickFieldListItem('ip');
        expect(await PageObjects.unifiedFieldList.getFieldStatsViewType()).to.be('topValues');
        expect(await PageObjects.unifiedFieldList.getFieldStatsDocsCount()).to.be(4634);
        expect(await PageObjects.unifiedFieldList.getFieldStatsTopValueBucketsVisibleText()).to.be(
          '177.194.175.66\n0.3%\n18.55.141.62\n0.3%\n53.55.251.105\n0.3%\n21.111.249.239\n0.2%\n97.63.84.25\n0.2%\n100.99.207.174\n0.2%\n112.34.138.226\n0.2%\n194.68.89.92\n0.2%\n235.186.79.201\n0.2%\n57.79.108.136\n0.2%\nOther\n97.6%'
        );
      });

      // TODO: Scripted fields tests dropped since they're not supported in Serverless

      it('should return examples for non-aggregatable or geo fields', async () => {
        await PageObjects.unifiedFieldList.clickFieldListItem('geo.coordinates');
        expect(await PageObjects.unifiedFieldList.getFieldStatsViewType()).to.be('exampleValues');
        expect(await PageObjects.unifiedFieldList.getFieldStatsDocsCount()).to.be(100);
        // actual hits might vary
        expect(
          (await PageObjects.unifiedFieldList.getFieldStatsExampleBucketsVisibleText()).length
        ).to.above(0);
      });

      it('should return top values for index pattern runtime string fields', async () => {
        await PageObjects.unifiedFieldList.clickFieldListItem('runtime_string_field');
        expect(await PageObjects.unifiedFieldList.getFieldStatsViewType()).to.be('topValues');
        expect(await PageObjects.unifiedFieldList.getFieldStatsDocsCount()).to.be(4634);
        expect(await PageObjects.unifiedFieldList.getFieldStatsTopValueBucketsVisibleText()).to.be(
          'hello world!\n100%'
        );
      });

      it('should apply filters and queries', async () => {
        await filterBar.addFilter({ field: 'geo.src', operation: 'is', value: 'US' });
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.unifiedFieldList.clickFieldListItem('bytes');
        expect(await PageObjects.unifiedFieldList.getFieldStatsViewType()).to.be(
          'topValuesAndDistribution'
        );
        expect(await PageObjects.unifiedFieldList.getFieldStatsDocsCount()).to.be(425);
        await filterBar.removeFilter('geo.src');
        await PageObjects.header.waitUntilLoadingHasFinished();
      });

      it('should allow filtering on a runtime field other than the field in use', async () => {
        await filterBar.addFilter({ field: 'runtime_string_field', operation: 'exists' });
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.unifiedFieldList.clickFieldListItem('runtime_number_field');
        expect(await PageObjects.unifiedFieldList.getFieldStatsViewType()).to.be('topValues');
        expect(await PageObjects.unifiedFieldList.getFieldStatsDocsCount()).to.be(4634);
        expect(await PageObjects.unifiedFieldList.getFieldStatsTopValueBucketsVisibleText()).to.be(
          '5\n100%'
        );
        await filterBar.removeFilter('runtime_string_field');
        await PageObjects.header.waitUntilLoadingHasFinished();
      });
    });

    describe('histogram', () => {
      before(async () => {
        await comboBox.setCustom('dataViewSelector', 'histogram-test');
        await retry.waitFor('page is ready', async () => {
          return await testSubjects.exists('globalQueryBar');
        });
        await PageObjects.timePicker.setAbsoluteRange(TEST_START_TIME, TEST_END_TIME);
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();
      });

      it('should return an auto histogram for precalculated histograms', async () => {
        await PageObjects.unifiedFieldList.clickFieldListItem('histogram-content');
        expect(await PageObjects.unifiedFieldList.getFieldStatsViewType()).to.be('histogram');
        expect(await PageObjects.unifiedFieldList.getFieldStatsDocsCount()).to.be(7);
      });

      it('should return a single-value histogram when filtering a precalculated histogram', async () => {
        await filterBar.addFilter({
          field: 'histogram-title',
          operation: 'is',
          value: 'single value',
        });
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.unifiedFieldList.clickFieldListItem('histogram-content');
        expect(await PageObjects.unifiedFieldList.getFieldStatsViewType()).to.be('histogram');
        expect(await PageObjects.unifiedFieldList.getFieldStatsDocsCount()).to.be(1);
        await filterBar.removeFilter('histogram-title');
        await PageObjects.header.waitUntilLoadingHasFinished();
      });
    });
  });
};
