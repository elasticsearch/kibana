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
  const retry = getService('retry');
  const panelActions = getService('dashboardPanelActions');
  const kibanaServer = getService('kibanaServer');

  describe('XY', function describeIndexTests() {
    const fixture =
      'x-pack/platform/test/serverless/fixtures/kbn_archives/lens/open_in_lens/agg_based/xy.json';

    before(async () => {
      await kibanaServer.importExport.load(fixture);
      await svlCommonPage.loginWithPrivilegedRole();
    });

    after(async () => {
      await kibanaServer.importExport.unload(fixture);
    });

    beforeEach(async () => {
      await dashboard.navigateToApp(); // required for svl until dashboard PO navigation is fixed
      await dashboard.loadDashboardInEditMode('Convert to Lens - XY');
      await timePicker.setDefaultAbsoluteRange();
    });

    it('should not allow converting if dot size aggregation is defined', async () => {
      expect(await panelActions.canConvertToLensByTitle('XY - Dot size metric')).to.eql(false);
    });

    it('should not allow converting if split chart is defined', async () => {
      expect(await panelActions.canConvertToLensByTitle('XY - Split chart')).to.eql(false);
    });

    it('should not allow converting if more than one axis left/right/top/bottom are defined', async () => {
      expect(await panelActions.canConvertToLensByTitle('XY - Multiple Y Axes')).to.eql(false);
    });

    it('should not allow converting if several split series are defined', async () => {
      expect(await panelActions.canConvertToLensByTitle('XY - Multiple Split Series')).to.eql(
        false
      );
    });

    it('should not allow converting if sibling pipeline agg and split series are defined', async () => {
      expect(
        await panelActions.canConvertToLensByTitle('XY - Sibling pipeline agg w/ split')
      ).to.eql(false);
    });

    it('should not allow converting of unsupported aggregation', async () => {
      expect(await panelActions.canConvertToLensByTitle('XY - Unsupported Agg')).to.eql(false);
    });

    it('should convert in different layers if metrics have different chart types', async () => {
      await panelActions.convertToLensByTitle('XY - Differing Layers');
      await lens.waitForVisualization('xyVisChart');

      await retry.try(async () => {
        await lens.assertLayerCount(2);

        // First layer
        await lens.ensureLayerTabIsActive(0);
        const layerChartSwitches1 = await testSubjects.findAll('lnsChartSwitchPopover');
        expect(layerChartSwitches1.length).to.be(1);
        expect(await layerChartSwitches1[0].getVisibleText()).to.be('Area');
        const yDimensionText1 = await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0);
        expect(yDimensionText1).to.be('Count');

        // Second layer
        await lens.ensureLayerTabIsActive(1);
        const layerChartSwitches2 = await testSubjects.findAll('lnsChartSwitchPopover');
        expect(layerChartSwitches2.length).to.be(1);
        expect(await layerChartSwitches2[0].getVisibleText()).to.be('Bar');
        const yDimensionText2 = await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0);
        expect(yDimensionText2).to.be('Max memory');
      });
    });

    it('should convert in one layer if metrics have the same chart type', async () => {
      await panelActions.convertToLensByTitle('XY - Similar Layers');
      await lens.waitForVisualization('xyVisChart');

      await retry.try(async () => {
        await lens.assertLayerCount(1);
        const layerChartSwitches = await testSubjects.findAll('lnsChartSwitchPopover');
        expect(layerChartSwitches.length).to.be(1);
        expect(await layerChartSwitches[0].getVisibleText()).to.be('Bar');
        const yDimensionText1 = await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0);
        const yDimensionText2 = await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 1);
        expect(yDimensionText1).to.be('Count');
        expect(yDimensionText2).to.be('Max memory');
      });
    });

    it('should convert parent pipeline aggregation', async () => {
      await panelActions.convertToLensByTitle('XY - Parent pipeline agg');
      await lens.waitForVisualization('xyVisChart');

      await retry.try(async () => {
        await lens.assertLayerCount(1);
        const yDimensionText = await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0);
        const splitText = await lens.getDimensionTriggerText('lnsXY_splitDimensionPanel', 0);
        expect(yDimensionText).to.be('Cumulative Sum of Count');
        expect(splitText).to.be('@timestamp');
      });
    });

    it('should convert sibling pipeline aggregation', async () => {
      await panelActions.convertToLensByTitle('XY - Sibling pipeline agg');
      await lens.waitForVisualization('xyVisChart');

      await lens.assertLayerCount(1);

      const yDimensionText = await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0);
      const splitText = await lens.getDimensionTriggerText('lnsXY_splitDimensionPanel', 0);

      expect(yDimensionText).to.be('Overall Max of Count');
      expect(splitText).to.be('@timestamp');

      await lens.openDimensionEditor('lnsXY_splitDimensionPanel > lns-dimensionTrigger');
      const collapseBy = await testSubjects.find('indexPattern-collapse-by');
      expect(await collapseBy.getAttribute('value')).to.be('max');
    });

    it('should draw a reference line', async () => {
      await panelActions.convertToLensByTitle('XY - Reference line');
      await lens.waitForVisualization('xyVisChart');

      await retry.try(async () => {
        await lens.assertLayerCount(2);
        await lens.ensureLayerTabIsActive(0);
        const yDimensionText = await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0);
        expect(yDimensionText).to.be('Count');
        await lens.ensureLayerTabIsActive(1);
        const referenceLineDimensionText = await lens.getDimensionTriggerText(
          'lnsXY_yReferenceLineLeftPanel',
          0
        );

        expect(referenceLineDimensionText).to.be('Static value: 10');
      });
    });

    it('should convert line stacked to area stacked chart', async () => {
      await panelActions.convertToLensByTitle('XY - Stacked lines');
      await lens.waitForVisualization('xyVisChart');

      await retry.try(async () => {
        await lens.assertLayerCount(1);
        const layerChartSwitches = await testSubjects.findAll('lnsChartSwitchPopover');
        expect(layerChartSwitches.length).to.be(1);
        expect(await layerChartSwitches[0].getVisibleText()).to.be('Area');
      });
    });

    it('should convert percentage charts', async () => {
      await panelActions.convertToLensByTitle('XY - Percentage chart');
      await lens.waitForVisualization('xyVisChart');

      await retry.try(async () => {
        await lens.assertLayerCount(1);
        const layerChartSwitches = await testSubjects.findAll('lnsChartSwitchPopover');
        expect(layerChartSwitches.length).to.be(1);
        expect(await layerChartSwitches[0].getVisibleText()).to.be('Area');
      });
    });

    it('should convert horizontal bar', async () => {
      await panelActions.convertToLensByTitle('XY - Horizontal Bar');
      await lens.waitForVisualization('xyVisChart');

      await retry.try(async () => {
        await lens.assertLayerCount(1);
        const layerChartSwitches = await testSubjects.findAll('lnsChartSwitchPopover');
        expect(layerChartSwitches.length).to.be(1);
        expect(await layerChartSwitches[0].getVisibleText()).to.be('Bar');
        expect(await lens.getSelectedBarOrientationSetting()).to.be('Horizontal');
      });
    });

    it('should convert y-axis positions', async () => {
      await panelActions.convertToLensByTitle('XY - Axis positions');
      await lens.waitForVisualization('xyVisChart');

      await lens.assertLayerCount(1);

      const yDimensionText1 = await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0);
      const yDimensionText2 = await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 1);
      expect(yDimensionText1).to.be('Count');
      expect(yDimensionText2).to.be('Max memory');

      await lens.openDimensionEditor('lnsXY_yDimensionPanel > lns-dimensionTrigger');
      let axisPosition = await lens.getSelectedAxisSide();
      expect(axisPosition).to.be('Left');
      await lens.closeDimensionEditor();

      await lens.openDimensionEditor('lnsXY_yDimensionPanel > lns-dimensionTrigger', 0, 1);
      axisPosition = await lens.getSelectedAxisSide();
      expect(axisPosition).to.be('Right');
    });

    it('should convert split series', async () => {
      await panelActions.convertToLensByTitle('XY - Split Series');
      await lens.waitForVisualization('xyVisChart');

      const expectedData = ['win 8', 'win xp', 'win 7', 'ios', 'osx'];
      await lens.enableEchDebugState();
      const data = await lens.getCurrentChartDebugState('xyVisChart');
      await retry.try(async () => {
        const yDimensionText = await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0);
        expect(yDimensionText).to.be('Count');
        const splitDimensionText = await lens.getDimensionTriggerText(
          'lnsXY_splitDimensionPanel',
          0
        );
        expect(splitDimensionText).to.be('machine.os.raw: Descending');
      });
      expect(data?.legend?.items.map((item) => item.name)).to.eql(expectedData);
    });

    it('should convert x-axis', async () => {
      await panelActions.convertToLensByTitle('XY - X Axis');
      await lens.waitForVisualization('xyVisChart');

      const expectedData = ['Count'];
      await lens.enableEchDebugState();
      const data = await lens.getCurrentChartDebugState('xyVisChart');
      await retry.try(async () => {
        const yDimensionText = await lens.getDimensionTriggerText('lnsXY_yDimensionPanel', 0);
        expect(yDimensionText).to.be('Count');
        const xDimensionText = await lens.getDimensionTriggerText('lnsXY_xDimensionPanel', 0);
        expect(xDimensionText).to.be('machine.os.raw: Descending');
      });
      expect(data?.legend?.items.map((item) => item.name)).to.eql(expectedData);
    });
  });
}
