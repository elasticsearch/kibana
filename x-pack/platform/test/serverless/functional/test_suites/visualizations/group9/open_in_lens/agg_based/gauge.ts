/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BulletSubtype } from '@elastic/charts';
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
  const elasticChart = getService('elasticChart');

  describe('Gauge', function describeIndexTests() {
    const fixture =
      'x-pack/platform/test/serverless/fixtures/kbn_archives/lens/open_in_lens/agg_based/gauge.json';

    before(async () => {
      await kibanaServer.importExport.load(fixture);
      await svlCommonPage.loginWithPrivilegedRole();
    });

    after(async () => {
      await kibanaServer.importExport.unload(fixture);
    });

    beforeEach(async () => {
      await dashboard.navigateToApp(); // required for svl until dashboard PO navigation is fixed
      await dashboard.loadDashboardInEditMode('Convert to Lens - Gauge');
      await timePicker.setDefaultAbsoluteRange();
      await elasticChart.setNewChartUiDebugFlag(true);
    });

    it('should show the "Convert to Lens" menu item', async () => {
      expect(await panelActions.canConvertToLensByTitle('Gauge - Basic')).to.eql(true);
    });

    it('should convert aggregation with params', async () => {
      await panelActions.convertToLensByTitle('Gauge - Agg with params');
      await lens.waitForVisualization('gaugeChart');

      await lens.assertLayerCount(1);

      const dimensions = await testSubjects.findAll('lns-dimensionTrigger');
      expect(dimensions).to.have.length(3);
      expect(await dimensions[0].getVisibleText()).to.be('Average machine.ram');
      expect(await dimensions[1].getVisibleText()).to.be('Static value: 0');
      expect(await dimensions[2].getVisibleText()).to.be('Static value: 100');

      const { bullet } = await elasticChart.getChartDebugData();
      const debugData = bullet?.rows[0][0];
      expect(debugData?.subtype).to.be(BulletSubtype.twoThirdsCircle);
      expect(debugData?.title).to.be('Average machine.ram');
      expect(Math.round(debugData?.value ?? 0)).to.be(13104036081);
      expect(debugData?.domain).to.eql([0, 100]);
    });

    it('should not convert aggregation with not supported field type', async () => {
      expect(await panelActions.canConvertToLensByTitle('Gauge - Unsupported field type')).to.eql(
        false
      );
    });

    it('should convert color ranges', async () => {
      await panelActions.convertToLensByTitle('Gauge - Color ranges');
      await lens.waitForVisualization('gaugeChart');

      await lens.assertLayerCount(1);

      const dimensions = await testSubjects.findAll('lns-dimensionTrigger');
      expect(dimensions).to.have.length(3);
      expect(await dimensions[0].getVisibleText()).to.be('Average machine.ram');
      expect(await dimensions[1].getVisibleText()).to.be('Static value: 0');
      expect(await dimensions[2].getVisibleText()).to.be('Static value: 15000000000');

      const { bullet } = await elasticChart.getChartDebugData();
      const debugData = bullet?.rows[0][0];
      expect(debugData?.subtype).to.be(BulletSubtype.twoThirdsCircle);
      expect(debugData?.title).to.be('Average machine.ram');
      expect(Math.round(debugData?.value ?? 0)).to.be(13104036081);
      expect(debugData?.domain).to.eql([0, 15000000000]);

      await dimensions[0].click();

      await lens.openPalettePanel();
      const colorStops = await lens.getPaletteColorStops();

      expect(colorStops).to.eql([
        { stop: '0', color: 'rgba(0, 104, 55, 1)' },
        { stop: '10000', color: 'rgba(183, 224, 117, 1)' },
        { stop: '20000', color: 'rgba(253, 191, 111, 1)' },
        { stop: '30000', color: 'rgba(165, 0, 38, 1)' },
        { stop: '15000000000', color: undefined },
      ]);
    });
  });
}
