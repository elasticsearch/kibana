/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import expect from '@kbn/expect';

import { getKbnPalettes, KbnPalette } from '@kbn/palettes';
import type { DebugState } from '@elastic/charts';
import type { WebElementWrapper } from '@kbn/ftr-common-functional-ui-services';
import chroma from 'chroma-js';
import type { FtrProviderContext } from '../../../ftr_provider_context';

const oldColorMappingsDashboardFixture =
  'x-pack/platform/test/functional/fixtures/kbn_archives/lens/old_color_mapping_dashboard.json';

const palettes = getKbnPalettes({ name: 'borealis', darkMode: false });
const defaultPaletteColors = palettes
  .get(KbnPalette.Default)
  .colors()
  .map((c) => c.toLowerCase());
const neutralPaletteColors = palettes
  .get(KbnPalette.Neutral)
  .colors()
  .map((c) => c.toLowerCase());

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { lens, dashboard } = getPageObjects(['lens', 'dashboard']);
  const log = getService('log');
  const retry = getService('retry');
  const browser = getService('browser');
  const elasticChart = getService('elasticChart');
  const kibanaServer = getService('kibanaServer');
  const testSubjects = getService('testSubjects');
  const dashboardPanelActions = getService('dashboardPanelActions');

  // Failing: See https://github.com/elastic/kibana/issues/284790
  describe.skip('lens old color mapping runtime migrations', () => {
    let panels: WebElementWrapper[] = [];
    let panelTitleIndex = new Map<string, number>();

    before(async () => {
      await kibanaServer.importExport.load(oldColorMappingsDashboardFixture);
      await dashboard.navigateToApp();
      await dashboard.loadDashboardInEditMode('Old Color Mappings');
      await elasticChart.setNewChartUiDebugFlag(true);
      await testSubjects.click('querySubmitButton');

      const titles = await dashboard.getPanelTitles();
      panelTitleIndex = new Map(titles.map((t, i) => [t, i]));
      panels = await dashboard.getDashboardPanels();
    });

    after(async () => {
      await kibanaServer.importExport.unload(oldColorMappingsDashboardFixture);
    });

    function getPaneIndex(title: string) {
      const panelIndex = panelTitleIndex.get(title);
      if (panelIndex === undefined) {
        throw new Error(`Panel "${title}" not found`);
      }

      return panelIndex;
    }
    async function getPanelChartDebugState(title: string) {
      const panelIndex = getPaneIndex(title);
      return dashboard.getPanelChartDebugState(panelIndex);
    }

    function getDefaultAutoColors(seriesNames: string[] = []) {
      return seriesNames.map((name, i) => [name, defaultPaletteColors[i]]);
    }

    describe('General', () => {
      describe('XY chart (Bar)', () => {
        const getBarColors = ({ bars = [] }: DebugState) =>
          bars.map(({ name, color }) => [name, color]);

        it('should render correct "Auto Assigned" color mappings', async () => {
          const chartData = await getPanelChartDebugState('Auto Assigned');
          const seriesColors = getBarColors(chartData);
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });

        it('should render correct "Manually Assigned" color mapping', async () => {
          const chartData = await getPanelChartDebugState('Manually Assigned');
          const seriesColors = getBarColors(chartData);
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql([
            ['CN', defaultPaletteColors[1]], // first 2 switched to ensure correct assignment
            ['IN', defaultPaletteColors[0]],
            ...defaultColors.slice(2),
          ]);
        });

        it('should render correct "Fixed Assigned" color mapping', async () => {
          const chartData = await getPanelChartDebugState('Fixed Assigned');
          const seriesColors = getBarColors(chartData);
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          // First and last 2 are set to natural colors
          expect(seriesColors).to.eql([
            ['CN', neutralPaletteColors[3]],
            ['IN', neutralPaletteColors[2]],
            ...defaultColors.slice(2, 13),
            ['VN', neutralPaletteColors[1]],
            ['EG', neutralPaletteColors[0]],
          ]);
        });

        it('should render correct "Custom assigned" color mapping', async () => {
          const chartData = await getPanelChartDebugState('Custom assigned');
          const seriesColors = getBarColors(chartData);

          const dualAssignedColor = '#ffc9c2';
          expect(seriesColors).to.eql([
            ['CN', neutralPaletteColors[3]],
            ['IN', neutralPaletteColors[2]],
            ['US', '#702339'], // custom picked colors below
            ['ID', '#08b725'],
            ['PK', '#f1ff86'],
            ['BR', '#ffc7db'],
            ['RU', '#f6726a'],
            ['NG', dualAssignedColor],
            ['JP', dualAssignedColor],
            ['BD', '#eaae01'],
            ['MX', '#fcd883'],
            ['PH', '#51d4d0'],
            ['IR', '#d76042'],
            ['VN', neutralPaletteColors[4]], // rest are same color
            ['EG', neutralPaletteColors[4]],
          ]);
        });

        it('should render correct "Multi-field auto assigned" color mapping', async () => {
          const chartData = await getPanelChartDebugState('Multi-field auto assigned');
          const seriesColors = getBarColors(chartData);
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });

        it('should render correct "Multi-field manually assigned" color mapping', async () => {
          const chartData = await getPanelChartDebugState('Multi-field manually assigned');
          const seriesColors = getBarColors(chartData);
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql([
            ['CN › jpg', defaultPaletteColors[1]], // first 2 switched to ensure correct assignment
            ['IN › jpg', defaultPaletteColors[0]],
            ...defaultColors.slice(2, 13),
            ['CN › gif', defaultPaletteColors[13]], // last 2 assigned same color
            ['JP › jpg', defaultPaletteColors[13]],
          ]);
        });

        it('should render correct "RangeKey no label auto assigned" color mapping', async () => {
          const chartData = await getPanelChartDebugState('RangeKey no label auto assigned');
          const seriesColors = getBarColors(chartData);
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });

        it('should render correct "RangeKey no label manually assigned" color mapping', async () => {
          const chartData = await getPanelChartDebugState('RangeKey no label manually assigned');
          const seriesColors = getBarColors(chartData);
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });

        it('should render correct "RangeKey no label manually assigned before putting labels" color mapping', async () => {
          const chartData = await getPanelChartDebugState(
            'RangeKey no label manually assigned before putting labels'
          );
          const seriesColors = getBarColors(chartData);
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });

        it('should render correct "RangeKey no label manually assigned after putting labels with label" color mapping', async () => {
          const chartData = await getPanelChartDebugState(
            'RangeKey no label manually assigned after putting labels with label'
          );
          const seriesColors = getBarColors(chartData);
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });
      });

      describe('Pie chart', () => {
        const getPartitionColors = ({ partition = [] }: DebugState) => {
          const colors = partition[0].partitions.map(({ name, color }) => [name, color]);
          const firstColor = colors.pop() as any[];
          return [firstColor, ...colors]; // fix order - first color is left of center
        };
        it('should render correct "Auto Assigned - Pie" color mapping', async () => {
          const chartData = await getPanelChartDebugState('Auto Assigned - Pie');
          const seriesColors = getPartitionColors(chartData);
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });

        it('should render correct "Manually Assigned - Pie" color mapping', async () => {
          const chartData = await getPanelChartDebugState('Manually Assigned - Pie');
          const seriesColors = getPartitionColors(chartData);
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });

        it('should render correct "Multi-field auto assigned - Pie" color mapping', async () => {
          const chartData = await getPanelChartDebugState('Multi-field auto assigned - Pie');
          const seriesColors = getPartitionColors(chartData);
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });

        it('should render correct "RangeKey no label auto assigned - Pie" color mapping', async () => {
          const chartData = await getPanelChartDebugState('RangeKey no label auto assigned - Pie');
          const seriesColors = getPartitionColors(chartData).sort(
            ([{ gte: a }], [{ gte: b }]) => a - b // need to fix order to match legend not by ratio
          );
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });
      });

      describe('Tag Cloud', () => {
        const getTagCloudColors = async (title: string) => {
          const panel = panels[getPaneIndex(title)];
          const tags = await panel.findAllByCssSelector(`svg text`);
          const colors = await Promise.all(
            tags.map(async (t) => ({
              text: await t.getVisibleText(),
              color: chroma(await t.getComputedStyle('fill')).hex(), // eui converts hex to rgb
              fontSize: await t.getComputedStyle('font-size'),
            }))
          );
          return colors
            .sort(({ fontSize: a }, { fontSize: b }) => parseInt(b, 10) - parseInt(a, 10))
            .map(({ text, color }) => [text, color]);
        };

        it('should render correct "Auto Assigned - Tag Cloud" color mapping', async () => {
          const seriesColors = await getTagCloudColors('Auto Assigned - Tag Cloud');
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });

        it('should render correct "Manually Assigned - Tag Cloud" color mapping', async () => {
          const seriesColors = await getTagCloudColors('Manually Assigned - Tag Cloud');
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });

        it('should render correct "Multi-field manually assigned - Tag Cloud" color mapping', async () => {
          const seriesColors = await getTagCloudColors('Multi-field manually assigned - Tag Cloud');
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });

        it('should render correct "RangeKey no label auto assigned - Tag Cloud" color mapping', async () => {
          const seriesColors = await getTagCloudColors(
            'RangeKey no label auto assigned - Tag Cloud'
          );
          const expectedColorMap: Record<string, string> = {
            '0 → 1,000': defaultPaletteColors[0],
            '1,000 → 5,000': defaultPaletteColors[1],
            '5,000 → 10,000': defaultPaletteColors[2],
            '10,000 → +∞': defaultPaletteColors[3],
          };

          expect(seriesColors.length).to.be.greaterThan(2);
          expect(seriesColors.every(([label, color]) => expectedColorMap[label] === color)).to.be(
            true
          );
        });
      });

      describe('Table', () => {
        const getTableColors = async (title: string) => {
          const panel = panels[getPaneIndex(title)];
          const cells = await panel.findAllByCssSelector(
            `[data-test-subj="lnsDataTable"] [data-test-subj="dataGridRowCell"][data-gridcell-column-index="0"]`
          );
          return Promise.all(
            cells.map(async (c) => [
              await c.getVisibleText(),
              chroma(await c.getComputedStyle('background-color')).hex(), // eui converts hex to rgb
            ])
          );
        };

        it('should render correct "Auto Assigned - Table" color mapping', async () => {
          const seriesColors = await getTableColors('Auto Assigned - Table');
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });

        it('should render correct "Manually Assigned - Table" color mapping', async () => {
          const seriesColors = await getTableColors('Manually Assigned - Table');
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });

        it('should render correct "Multi-field auto assigned - Table" color mapping', async () => {
          const seriesColors = await getTableColors('Multi-field auto assigned - Table');
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });

        it('should render correct "RangeKey no label auto assigned - Table" color mapping', async () => {
          const seriesColors = await getTableColors('RangeKey no label auto assigned - Table');
          const defaultColors = getDefaultAutoColors(seriesColors.map(([name]) => name));

          expect(seriesColors).to.eql(defaultColors);
        });
      });
    });

    // tests below are intended to be run in series
    describe('Saving with new color mapping config', () => {
      const customColor = '#0118d8';

      async function editAndApplyColorMapping(panelTitle: string, dimension: string, j = 1) {
        await log.debug(`editAndApplyColorMapping: "${panelTitle}"`);
        const panel = panels[getPaneIndex(panelTitle)];
        await panel.moveMouseTo({ xOffset: 10, yOffset: -10 });
        await dashboardPanelActions.clickInlineEdit(panel);
        await testSubjects.click(dimension);
        await testSubjects.click('lns_colorEditing_trigger');
        // The trigger opens the color-mapping flyout as a sibling; wait for it to
        // actually render before reading its contents instead of assuming the click landed.
        await testSubjects.existOrFail('lns-palettePanelFlyout');
        await retry.try(async () => {
          if (
            !(await testSubjects.exists('lns-colorMapping-colorPicker-tab-custom', {
              timeout: 1000,
            }))
          ) {
            await testSubjects.click('lns-colorMapping-colorSwatch-0');
          }
          await testSubjects.click('lns-colorMapping-colorPicker-tab-custom');
        });
        await testSubjects.setValue('lns-colorMapping-colorPicker-custom-input', customColor, {
          clearWithKeyboard: true,
        });

        await retry.waitFor('verify color is correct before continuing', async () => {
          const swatch = await testSubjects.find('lns-colorMapping-colorSwatch-0');
          const color = chroma(await swatch.getComputedStyle('background-color')).hex(); // eui converts hex to rgb
          return color === customColor;
        });

        await browser.pressKeys(browser.keys.ESCAPE);
        await testSubjects.click('lns-indexPattern-SettingWithSiblingFlyoutBack');
        await lens.closeDimensionEditor();

        await retry.try(async () => {
          // Clicking apply on flyout is ridiculously flaky :(
          await testSubjects.existOrFail('applyFlyoutButton');
          await testSubjects.click('applyFlyoutButton');
          await testSubjects.missingOrFail('applyFlyoutButton');
        });
      }

      const testParams = {
        xy1: ['Manually Assigned', 'lnsXY_splitDimensionPanel'],
        xy2: ['Multi-field manually assigned', 'lnsXY_splitDimensionPanel'],
        xy3: ['RangeKey no label manually assigned', 'lnsXY_splitDimensionPanel'],
        pie: ['Manually Assigned - Pie', 'lnsPie_sliceByDimensionPanel'],
        tagCloud: ['Manually Assigned - Tag Cloud', 'lnsTagcloud_tagDimensionPanel'],
        table: ['Manually Assigned - Table', 'lnsDatatable_rows'],
      } satisfies Record<string, Parameters<typeof editAndApplyColorMapping>>;

      it('should apply new mappings for xy charts', async () => {
        // normal values
        await editAndApplyColorMapping(...testParams.xy1);
        // multi-field values
        await editAndApplyColorMapping(...testParams.xy2);
        // range-key values
        await editAndApplyColorMapping(...testParams.xy3);

        await dashboard.ensureHasUnsavedChangesNotification({ retry: true });
        await dashboard.clickQuickSave();
        await dashboard.ensureMissingUnsavedChangesNotification({ retry: true });
      });

      it('should apply new mappings for pie vis', async () => {
        await editAndApplyColorMapping(...testParams.pie);

        await dashboard.ensureHasUnsavedChangesNotification({ retry: true });
        await dashboard.clickQuickSave();
        await dashboard.ensureMissingUnsavedChangesNotification({ retry: true });
      });

      it('should apply new mappings for tag clouds vis', async () => {
        await editAndApplyColorMapping(...testParams.tagCloud);

        await dashboard.ensureHasUnsavedChangesNotification({ retry: true });
        await dashboard.clickQuickSave();
        await dashboard.ensureMissingUnsavedChangesNotification({ retry: true });
      });

      it('should apply new mappings for table vis', async () => {
        await editAndApplyColorMapping(...testParams.table);

        await dashboard.ensureHasUnsavedChangesNotification({ retry: true });
        await dashboard.clickQuickSave();
        await dashboard.ensureMissingUnsavedChangesNotification({ retry: true });
      });

      async function verifyCustomColor(panelTitle: string, dimension: string) {
        const panel = panels[getPaneIndex(panelTitle)];
        await panel.moveMouseTo();
        await dashboardPanelActions.clickInlineEdit(panel);
        await testSubjects.click(dimension);
        await testSubjects.click('lns_colorEditing_trigger');
        await testSubjects.existOrFail('lns-palettePanelFlyout');
        try {
          const swatch = await testSubjects.find('lns-colorMapping-colorSwatch-0');
          const color = chroma(await swatch.getComputedStyle('background-color')).hex(); // eui converts hex to rgb

          expect(color).to.be(customColor);
        } finally {
          // Always close the inline editor, otherwise a failed assertion leaves the
          // flyout open and cascades into the next test in this series.
          await testSubjects.click('lns-indexPattern-SettingWithSiblingFlyoutBack');
          await lens.closeDimensionEditor();
          await testSubjects.click('cancelFlyoutButton');
        }
      }

      it('should save xy chart custom color mappings from above', async () => {
        await browser.refresh();
        await dashboard.waitForRenderComplete();
        await dashboard.switchToEditMode();
        panels = await dashboard.getDashboardPanels();
        await verifyCustomColor(...testParams.xy1);
        await verifyCustomColor(...testParams.xy2);
        await verifyCustomColor(...testParams.xy3);
      });

      it('should save pie chart custom color mappings from above', async () => {
        await verifyCustomColor(...testParams.pie);
      });

      it('should save tagCloud chart custom color mappings from above', async () => {
        await verifyCustomColor(...testParams.tagCloud);
      });

      it('should save table chart custom color mappings from above', async () => {
        await verifyCustomColor(...testParams.table);
      });
    });
  });
}
