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

  const pieChart = getService('pieChart');
  const testSubjects = getService('testSubjects');
  const panelActions = getService('dashboardPanelActions');
  const kibanaServer = getService('kibanaServer');

  describe('Pie', function describeIndexTests() {
    const fixture =
      'x-pack/platform/test/serverless/fixtures/kbn_archives/lens/open_in_lens/agg_based/pie.json';

    before(async () => {
      await kibanaServer.importExport.load(fixture);
      await svlCommonPage.loginWithPrivilegedRole();
    });

    after(async () => {
      await kibanaServer.importExport.unload(fixture);
    });

    beforeEach(async () => {
      await dashboard.navigateToApp(); // required for svl until dashboard PO navigation is fixed
      await dashboard.loadDashboardInEditMode('Convert to Lens - Pie');
      await timePicker.setDefaultAbsoluteRange();
    });

    it('should hide the "Convert to Lens" menu item if no split slices were defined', async () => {
      expect(await panelActions.canConvertToLensByTitle('Pie - No split slices')).to.eql(false);
    });

    it('should hide the "Convert to Lens" menu item if more than 3 split slices were defined', async () => {
      expect(await panelActions.canConvertToLensByTitle('Pie - 4 layers')).to.eql(false);
    });

    it('should show the "Convert to Lens" menu item', async () => {
      expect(await panelActions.canConvertToLensByTitle('Pie - 1 Split slice')).to.eql(true);
    });

    it('should convert aggregation with params', async () => {
      await panelActions.convertToLensByTitle('Pie - Agg with params');
      await lens.waitForVisualization('partitionVisChart');

      await lens.assertLayerCount(1);

      const sliceByText = await lens.getDimensionTriggerText('lnsPie_sliceByDimensionPanel', 0);
      const sizeByText = await lens.getDimensionTriggerText('lnsPie_sizeByDimensionPanel', 0);

      const dimensions = await testSubjects.findAll('lns-dimensionTrigger');
      expect(dimensions).to.have.length(2);
      expect(sliceByText).to.be('machine.os.raw: Descending');
      expect(sizeByText).to.be('Sum of machine.ram');
    });

    it('should convert terms to slice by', async () => {
      const expectedTableData = ['ios', 'osx', 'win 7', 'win 8', 'win xp'];

      await panelActions.convertToLensByTitle('Pie - Basic count');
      await lens.waitForVisualization('partitionVisChart');
      await lens.enableEchDebugState();

      const sliceByText = await lens.getDimensionTriggerText('lnsPie_sliceByDimensionPanel', 0);
      const sizeByText = await lens.getDimensionTriggerText('lnsPie_sizeByDimensionPanel', 0);

      const dimensions = await testSubjects.findAll('lns-dimensionTrigger');
      expect(dimensions).to.have.length(2);
      expect(sliceByText).to.be('machine.os.raw: Descending');
      expect(sizeByText).to.be('Count');

      await pieChart.expectPieChartLabels(expectedTableData);
    });

    it('should convert pie with hole type correctly', async () => {
      await panelActions.convertToLensByTitle('Pie - Basic count');
      await lens.waitForVisualization('partitionVisChart');

      const chartSwitcher = await testSubjects.find('lnsChartSwitchPopover');
      const type = await chartSwitcher.getVisibleText();
      expect(type).to.be('Pie');
      const donutHole = await lens.getDonutHoleSize();
      expect(donutHole).to.be('Small');
    });

    it('should convert Pie types correctly', async () => {
      await panelActions.convertToLensByTitle('Pie - Non Donut');
      await lens.waitForVisualization('partitionVisChart');

      const chartSwitcher = await testSubjects.find('lnsChartSwitchPopover');
      const type = await chartSwitcher.getVisibleText();
      expect(type).to.be('Pie');
    });
  });
}
