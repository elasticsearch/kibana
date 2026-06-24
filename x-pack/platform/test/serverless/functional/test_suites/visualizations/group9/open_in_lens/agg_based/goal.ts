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

  describe('Goal', function describeIndexTests() {
    const fixture =
      'x-pack/platform/test/serverless/fixtures/kbn_archives/lens/open_in_lens/agg_based/goal.json';

    before(async () => {
      await kibanaServer.importExport.load(fixture);
      await svlCommonPage.loginWithPrivilegedRole();
    });

    after(async () => {
      await kibanaServer.importExport.unload(fixture);
    });

    beforeEach(async () => {
      await dashboard.navigateToApp(); // required for svl until dashboard PO navigation is fixed
      await dashboard.loadDashboardInEditMode('Convert to Lens - Goal');
      await timePicker.setDefaultAbsoluteRange();
    });

    it('should show the "Convert to Lens" menu item', async () => {
      expect(await panelActions.canConvertToLensByTitle('Goal - Basic')).to.eql(true);
    });

    it('should convert to Lens', async () => {
      await panelActions.convertToLensByTitle('Goal - Basic');
      await lens.waitForVisualization('mtrVis');

      // hovering over dimension button to make sure neither of metrics are hovered so the color is stable
      await lens.hoverOverDimensionButton();
      const data = await lens.getMetricVisualizationData();
      expect(data.length).to.be.equal(1);
      expect(data).to.eql([
        {
          title: 'Count',
          subtitle: undefined,
          extraText: '',
          value: '140.05%',
          color: 'rgba(255, 255, 255, 1)',
          trendlineColor: undefined,
          showingBar: true,
          showingTrendline: false,
        },
      ]);
    });

    it('should convert aggregation with params', async () => {
      await panelActions.convertToLensByTitle('Goal - Agg with params');
      await lens.waitForVisualization('mtrVis');

      await lens.assertLayerCount(1);

      const dimensions = await testSubjects.findAll('lns-dimensionTrigger');
      expect(dimensions).to.have.length(2);
      expect(await dimensions[0].getVisibleText()).to.be('Average machine.ram');
      expect(await dimensions[1].getVisibleText()).to.be('Static value: 1');

      // hovering over dimension button to make sure neither of metrics are hovered so the color is stable
      await lens.hoverOverDimensionButton();
      const data = await lens.getMetricVisualizationData();
      expect(data.length).to.be.equal(1);
      expect(data).to.eql([
        {
          title: 'Average machine.ram',
          subtitle: undefined,
          extraText: '',
          value: '131,040,360.81%',
          color: 'rgba(255, 255, 255, 1)',
          trendlineColor: undefined,
          showingBar: true,
          showingTrendline: false,
        },
      ]);
    });

    it('should convert sibling pipeline aggregation', async () => {
      await panelActions.convertToLensByTitle('Goal - Sibling pipeline agg');
      await lens.waitForVisualization('mtrVis');

      await lens.assertLayerCount(1);

      const dimensions = await testSubjects.findAll('lns-dimensionTrigger');
      expect(dimensions).to.have.length(3);
      expect(await dimensions[0].getVisibleText()).to.be('Overall Max of Count');
      expect(await dimensions[1].getVisibleText()).to.be('Static value: 1');
      expect(await dimensions[2].getVisibleText()).to.be('@timestamp');

      // hovering over dimension button to make sure neither of metrics are hovered so the color is stable
      await lens.hoverOverDimensionButton();
      const data = await lens.getMetricVisualizationData();
      expect(data.length).to.be.equal(1);
      expect(data).to.eql([
        {
          title: 'Overall Max of Count',
          subtitle: undefined,
          extraText: '',
          value: '14.37%',
          color: 'rgba(255, 255, 255, 1)',
          trendlineColor: undefined,
          showingBar: true,
          showingTrendline: false,
        },
      ]);
    });

    it('should convert color ranges', async () => {
      await panelActions.convertToLensByTitle('Goal - Color ranges');
      await lens.waitForVisualization('mtrVis');

      await lens.assertLayerCount(1);

      const dimensions = await testSubjects.findAll('lns-dimensionTrigger');
      expect(dimensions).to.have.length(3);
      expect(await dimensions[0].getVisibleText()).to.be('Average machine.ram');
      expect(await dimensions[1].getVisibleText()).to.be('Static value: 13300000000');
      expect(await dimensions[2].getVisibleText()).to.be('machine.os.raw: Descending');

      // hovering over dimension button to make sure neither of metrics are hovered so the color is stable
      await lens.hoverOverDimensionButton();
      const data = await lens.getMetricVisualizationData();
      expect(data.length).to.be.equal(6);
      expect(data).to.eql([
        {
          title: 'osx',
          subtitle: 'Average machine.ram',
          extraText: '',
          value: '13,228,964,670.613',
          color: 'rgba(255, 255, 255, 1)',
          trendlineColor: undefined,
          showingTrendline: false,
          showingBar: true,
        },
        {
          title: 'win 7',
          subtitle: 'Average machine.ram',
          extraText: '',
          value: '13,186,695,551.251',
          color: 'rgba(255, 255, 255, 1)',
          trendlineColor: undefined,
          showingTrendline: false,
          showingBar: true,
        },
        {
          title: 'win xp',
          subtitle: 'Average machine.ram',
          extraText: '',
          value: '13,073,190,186.423',
          color: 'rgba(255, 255, 255, 1)',
          trendlineColor: undefined,
          showingTrendline: false,
          showingBar: true,
        },
        {
          title: 'win 8',
          subtitle: 'Average machine.ram',
          extraText: '',
          value: '13,031,579,645.108',
          color: 'rgba(255, 255, 255, 1)',
          trendlineColor: undefined,
          showingTrendline: false,
          showingBar: true,
        },
        {
          title: 'ios',
          subtitle: 'Average machine.ram',
          extraText: '',
          value: '13,009,497,206.823',
          color: 'rgba(255, 255, 255, 1)',
          trendlineColor: undefined,
          showingTrendline: false,
          showingBar: true,
        },
        {
          title: undefined,
          subtitle: undefined,
          extraText: undefined,
          value: undefined,
          color: 'rgba(255, 255, 255, 1)',
          trendlineColor: undefined,
          showingTrendline: false,
          showingBar: true,
        },
      ]);

      await dimensions[0].click();

      await lens.openPalettePanel();
      const colorStops = await lens.getPaletteColorStops();

      expect(colorStops).to.eql([
        { stop: '0', color: 'rgba(0, 104, 55, 1)' },
        { stop: '13000000000', color: 'rgba(183, 224, 117, 1)' },
        { stop: '13100000000', color: 'rgba(253, 191, 111, 1)' },
        { stop: '13200000000', color: 'rgba(165, 0, 38, 1)' },
        { stop: '13300000000', color: undefined },
      ]);
    });
  });
}
