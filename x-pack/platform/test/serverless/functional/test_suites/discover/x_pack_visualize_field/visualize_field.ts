/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): x-pack/platform/test/functional/apps/discover/group3/visualize_field.ts
import expect from '@kbn/expect';
import type { WebElementWrapper } from '@kbn/ftr-common-functional-ui-services';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getPageObjects, getService }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const filterBar = getService('filterBar');
  const queryBar = getService('queryBar');
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');
  const kibanaServer = getService('kibanaServer');
  const dataViews = getService('dataViews');
  const PageObjects = getPageObjects([
    'common',
    'svlCommonPage',
    'discover',
    'timePicker',
    'lens',
    'header',
    'unifiedFieldList',
  ]);

  // TODO: ES|QL setting removed since ES|QL isn't supported in Serverless

  async function setDiscoverTimeRange() {
    await PageObjects.timePicker.setDefaultAbsoluteRange();
  }

  describe('discover field visualize button', () => {
    before(async () => {
      // Security project requires admin role, search/oblt project passes with developer/editor.
      await PageObjects.svlCommonPage.loginAsAdmin();
      await esArchiver.loadIfNeeded(
        'x-pack/platform/test/fixtures/es_archives/logstash_functional'
      );
      await kibanaServer.importExport.load(
        'x-pack/platform/test/functional/fixtures/kbn_archives/lens/lens_basic.json'
      );
      await kibanaServer.uiSettings.replace({
        defaultIndex: 'logstash-*',
      });
    });

    beforeEach(async () => {
      await PageObjects.common.navigateToApp('discover');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await setDiscoverTimeRange();
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
    });

    after(async () => {
      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/logstash_functional');
      await kibanaServer.importExport.unload(
        'x-pack/platform/test/functional/fixtures/kbn_archives/lens/lens_basic.json'
      );
      await kibanaServer.uiSettings.replace({});
    });

    it('shows "visualize" field button', async () => {
      await PageObjects.unifiedFieldList.clickFieldListItem('bytes');
      await PageObjects.unifiedFieldList.expectFieldListItemVisualize('bytes');
    });

    it('visualizes field to Lens and loads fields to the dimension editor', async () => {
      await PageObjects.unifiedFieldList.findFieldByName('bytes');
      await PageObjects.unifiedFieldList.clickFieldListItemVisualize('bytes');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await retry.try(async () => {
        const dimensions = await testSubjects.findAll('lns-dimensionTrigger');
        expect(dimensions).to.have.length(2);
        expect(await dimensions[1].getVisibleText()).to.be('Median of bytes');
      });
    });

    it('should preserve app filters in lens', async () => {
      await filterBar.addFilter({
        field: 'bytes',
        operation: 'is between',
        value: { from: '3500', to: '4000' },
      });
      await PageObjects.unifiedFieldList.findFieldByName('geo.src');
      await PageObjects.unifiedFieldList.clickFieldListItemVisualize('geo.src');
      await PageObjects.header.waitUntilLoadingHasFinished();

      expect(await filterBar.hasFilter('bytes', '3,500 to 4,000')).to.be(true);
    });

    it('should preserve query in lens', async () => {
      await queryBar.setQuery('machine.os : ios');
      await queryBar.submitQuery();
      await PageObjects.unifiedFieldList.findFieldByName('geo.dest');
      await PageObjects.unifiedFieldList.clickFieldListItemVisualize('geo.dest');
      await PageObjects.header.waitUntilLoadingHasFinished();

      expect(await queryBar.getQueryString()).to.equal('machine.os : ios');
    });

    it('should visualize correctly using breakdown field', async () => {
      await PageObjects.discover.chooseBreakdownField('extension.raw');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await testSubjects.click('unifiedHistogramEditVisualization');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await retry.try(async () => {
        const breakdownLabel = await testSubjects.find(
          'lnsDragDrop_domDraggable_Top 9 values of extension.raw'
        );

        const lnsWorkspace = await testSubjects.find('lnsWorkspace');
        const list = await lnsWorkspace.findAllByClassName('echLegendItem__label');
        const values = await Promise.all(
          list.map((elem: WebElementWrapper) => elem.getVisibleText())
        );

        expect(await breakdownLabel.getVisibleText()).to.eql('Top 9 values of extension.raw');
        // Shows all 5 extension types (no Other bucket since all values fit within top 9)
        expect(values).to.eql(['jpg', 'css', 'png', 'gif', 'php']);
      });
    });

    it('should visualize correctly using adhoc data view', async () => {
      await dataViews.createFromSearchBar({
        name: 'logst',
        adHoc: true,
        hasTimeField: true,
      });

      await testSubjects.click('unifiedHistogramEditVisualization');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await dataViews.waitForSwitcherToBe('logst*');
    });

    // TODO: ES|QL tests removed since ES|QL isn't supported in Serverless
  });
}
