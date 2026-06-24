/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../../../ftr_provider_context';

export default function ({ getPageObjects, getService }: FtrProviderContext) {
  const { svlCommonPage, lens, timePicker, dashboard } = getPageObjects([
    'svlCommonPage',
    'lens',
    'timePicker',
    'dashboard',
  ]);

  const testSubjects = getService('testSubjects');
  const panelActions = getService('dashboardPanelActions');
  const kibanaServer = getService('kibanaServer');
  const comboBox = getService('comboBox');

  describe('Table', function describeIndexTests() {
    const fixture =
      'x-pack/platform/test/serverless/fixtures/kbn_archives/lens/open_in_lens/agg_based/table.json';

    before(async () => {
      await kibanaServer.importExport.load(fixture);
      await svlCommonPage.loginWithPrivilegedRole();
    });

    after(async () => {
      await kibanaServer.importExport.unload(fixture);
    });

    beforeEach(async () => {
      await dashboard.navigateToApp(); // required for svl until dashboard PO navigation is fixed
      await dashboard.loadDashboardInEditMode('Convert to Lens - Table');
      await timePicker.setDefaultAbsoluteRange();
    });

    it('should not allow converting of unsupported aggregations', async () => {
      expect(await panelActions.canConvertToLensByTitle('Table - Unsupported Agg')).to.eql(false);
    });

    it('should show the "Convert to Lens" menu item', async () => {
      expect(await panelActions.canConvertToLensByTitle('Table - Agg with params')).to.eql(true);
    });

    it('should convert aggregation with params', async () => {
      await panelActions.convertToLensByTitle('Table - Agg with params');
      await lens.waitForVisualization('lnsDataTable');

      await lens.assertLayerCount(1);

      const dimensions = await testSubjects.findAll('lns-dimensionTrigger');
      expect(dimensions).to.have.length(1);
      expect(await dimensions[0].getVisibleText()).to.be('Average machine.ram');
    });

    it('should convert total function to summary row', async () => {
      await panelActions.convertToLensByTitle('Table - Summary row');
      await lens.waitForVisualization('lnsDataTable');

      await lens.assertLayerCount(1);

      const dimensions = await testSubjects.findAll('lns-dimensionTrigger');
      expect(dimensions).to.have.length(1);
      expect(await dimensions[0].getVisibleText()).to.be('Average machine.ram');

      await lens.openDimensionEditor('lnsDatatable_metrics > lns-dimensionTrigger');
      expect(await comboBox.getComboBoxSelectedOptions('lnsDatatable_summaryrow_function')).to.eql([
        'Sum',
      ]);
    });

    it('should convert sibling pipeline aggregation', async () => {
      await panelActions.convertToLensByTitle('Table - Sibling pipeline agg');
      await lens.waitForVisualization('lnsDataTable');

      await lens.assertLayerCount(1);

      const metricText = await lens.getDimensionTriggerText('lnsDatatable_metrics', 0);
      const splitRowText = await lens.getDimensionTriggerText('lnsDatatable_rows', 0);

      const dimensions = await testSubjects.findAll('lns-dimensionTrigger');
      expect(dimensions).to.have.length(2);
      expect(metricText).to.be('Overall Max of Count');
      expect(splitRowText).to.be('@timestamp');
    });

    it('should convert parent pipeline aggregation', async () => {
      await panelActions.convertToLensByTitle('Table - Parent pipeline agg');
      await lens.waitForVisualization('lnsDataTable');

      await lens.assertLayerCount(1);

      const metricText = await lens.getDimensionTriggerText('lnsDatatable_metrics', 0);
      const splitRowText = await lens.getDimensionTriggerText('lnsDatatable_rows', 0);

      const dimensions = await testSubjects.findAll('lns-dimensionTrigger');
      expect(dimensions).to.have.length(2);
      expect(metricText).to.be('Cumulative Sum of Count');
      expect(splitRowText).to.be('@timestamp');
    });

    it('should convert split rows and split table to split table rows', async () => {
      await panelActions.convertToLensByTitle('Table - Split rows and tables');
      await lens.waitForVisualization('lnsDataTable');

      await lens.assertLayerCount(1);

      const metricText = await lens.getDimensionTriggerText('lnsDatatable_metrics', 0);
      const splitRowText1 = await lens.getDimensionTriggerText('lnsDatatable_rows', 0);
      const splitRowText2 = await lens.getDimensionTriggerText('lnsDatatable_rows', 1);

      const dimensions = await testSubjects.findAll('lns-dimensionTrigger');
      expect(dimensions).to.have.length(3);
      expect(metricText).to.be('Count');
      expect(splitRowText1).to.be('@timestamp');
      expect(splitRowText2).to.be('bytes: Descending');
    });

    it('should convert percentage column', async () => {
      await panelActions.convertToLensByTitle('Table - Percentage Column');
      await lens.waitForVisualization('lnsDataTable');

      await lens.assertLayerCount(1);

      const metricText = await lens.getDimensionTriggerText('lnsDatatable_metrics', 0);
      const percentageColumnText = await lens.getDimensionTriggerText('lnsDatatable_metrics', 1);

      await lens.openDimensionEditor('lnsDatatable_metrics > lns-dimensionTrigger', 0, 1);
      expect(await comboBox.getComboBoxSelectedOptions('indexPattern-dimension-format')).to.eql([
        'Percent',
      ]);

      const dimensions = await testSubjects.findAll('lns-dimensionTrigger');
      expect(dimensions).to.have.length(2);
      expect(metricText).to.be('Count');
      expect(percentageColumnText).to.be('Count percentages');
    });
  });
}
