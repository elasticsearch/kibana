/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';

import type { FtrProviderContext } from '../../../ftr_provider_context';

/**
 * Test the querying capabilities of dashboard, and make sure visualizations show the expected results, especially
 * with nested queries and filters on the visualizations themselves.
 */
export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const dashboardExpect = getService('dashboardExpect');
  const pieChart = getService('pieChart');
  const queryBar = getService('queryBar');
  const elasticChart = getService('elasticChart');
  const dashboardAddPanel = getService('dashboardAddPanel');
  const renderable = getService('renderable');
  const testSubjects = getService('testSubjects');
  const filterBar = getService('filterBar');
  const kibanaServer = getService('kibanaServer');
  const security = getService('security');
  const dashboardPanelActions = getService('dashboardPanelActions');
  const { dashboard, header, visualize, timePicker } = getPageObjects([
    'dashboard',
    'header',
    'visualize',
    'timePicker',
  ]);

  describe('dashboard filtering', function () {
    const populateDashboard = async () => {
      await dashboard.clickNewDashboard();
      await timePicker.setDefaultDataRange();
      await dashboardAddPanel.addEveryVisualization('"Filter Bytes Test"');
      await dashboardAddPanel.addEverySavedSearch('"Filter Bytes Test"');

      await dashboardAddPanel.closeAddPanel();
    };

    const addFilterAndRefresh = async () => {
      await header.waitUntilLoadingHasFinished();
      await dashboard.waitForRenderComplete();
      await filterBar.addFilter({ field: 'bytes', operation: 'is', value: '12345678' });
      await header.waitUntilLoadingHasFinished();
      await dashboard.waitForRenderComplete();
      // first round of requests sometimes times out, refresh all visualizations to fetch again
      await queryBar.clickQuerySubmitButton();
      await header.waitUntilLoadingHasFinished();
      await dashboard.waitForRenderComplete();
      await elasticChart.setNewChartUiDebugFlag(true);
    };

    before(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/dashboard/current/kibana'
      );
      // The kbn_archiver above was created from an es_archiver which intentionally had
      // 2 missing index patterns.  But that would fail to load with kbn_archiver.
      // So we unload those 2 index patterns here.
      await kibanaServer.importExport.unload(
        'src/platform/test/functional/fixtures/kbn_archiver/dashboard/current/kibana_unload'
      );
      await security.testUser.setRoles(['kibana_admin', 'test_logstash_reader', 'animals']);
      await kibanaServer.uiSettings.replace({
        defaultIndex: '0bf35f60-3dc9-11e8-8660-4d65aa086b3c',
      });
      await dashboard.navigateToApp();
      await dashboard.preserveCrossAppState();
      await dashboard.gotoDashboardLandingPage();
    });

    after(async () => {
      await security.testUser.restoreDefaults();
      await kibanaServer.savedObjects.cleanStandardList();
    });

    describe('adding a filter that excludes all data', () => {
      before(async () => {
        await populateDashboard();
        await addFilterAndRefresh();
      });

      after(async () => {
        await dashboard.gotoDashboardLandingPage();
      });

      it('filters on pie charts', async () => {
        await pieChart.expectEmptyPieChart();
      });

      it('area, bar and heatmap charts filtered', async () => {
        await dashboardExpect.heatMapNoResults();
      });

      it('data tables are filtered', async () => {
        await dashboardExpect.dataTableNoResult();
      });

      it('goal and guages are filtered', async () => {
        await dashboardExpect.goalAndGuageLabelsExist(['0', '0%']);
      });

      it('tsvb time series shows no data message', async () => {
        expect(await testSubjects.exists('timeseriesVis > visNoResult')).to.be(true);
      });

      it('metric value shows no data', async () => {
        await dashboardExpect.metricValuesExist(['(null)']);
      });

      it('tag cloud values are filtered', async () => {
        await dashboardExpect.emptyTagCloudFound();
      });

      it('tsvb metric is filtered', async () => {
        await dashboardExpect.tsvbMetricValuesExist(['0 custom template']);
      });

      it('tsvb top n is filtered', async () => {
        await dashboardExpect.tsvbTopNValuesExist(['-', '-']);
      });

      it('timelion is filtered', async () => {
        await dashboardExpect.timelionLegendCount(0);
      });

      it('vega is filtered', async () => {
        await dashboardExpect.vegaTextsDoNotExist(['5,000']);
      });
    });

    describe('using a pinned filter that excludes all data', () => {
      before(async () => {
        // Functional tests clear session storage after each suite, so it is important to repopulate unsaved panels
        await populateDashboard();
        await addFilterAndRefresh();

        await filterBar.toggleFilterPinned('bytes');
        await header.waitUntilLoadingHasFinished();
        await dashboard.waitForRenderComplete();
      });

      after(async () => {
        await filterBar.toggleFilterPinned('bytes');
        await dashboard.gotoDashboardLandingPage();
      });

      it('excludes data the same as an unpinned filter', async () => {
        await pieChart.expectEmptyPieChart();
      });
    });

    describe('disabling a filter unfilters the data on', function () {
      before(async () => {
        // Functional tests clear session storage after each suite, so it is important to repopulate unsaved panels
        await populateDashboard();
        await addFilterAndRefresh();

        await filterBar.toggleFilterEnabled('bytes');
        await header.waitUntilLoadingHasFinished();
        await dashboard.waitForRenderComplete();
      });

      it('pie charts', async () => {
        await pieChart.expectPieSliceCount(5);
      });

      it('area, bar and heatmap charts', async () => {
        await dashboardExpect.heatmapXAxisBuckets(11);
      });

      it('data tables', async () => {
        await dashboardExpect.dataTableRowCount(10);
      });

      it('goal and guages', async () => {
        await dashboardExpect.goalAndGuageLabelsExist(['39.958%', '7,544']);
      });

      it('metric value', async () => {
        await dashboardExpect.metricValuesExist(['101']);
      });

      it('tag cloud', async () => {
        await dashboardExpect.tagCloudWithValuesFound(['9,972', '4,886', '1,944', '9,025']);
      });

      it('tsvb metric', async () => {
        await dashboardExpect.tsvbMetricValuesExist(['50,465 custom template']);
      });

      it('tsvb top n', async () => {
        await dashboardExpect.tsvbTopNValuesExist(['6,308.125', '6,308.125']);
      });

      it('tsvb markdown', async () => {
        await dashboardExpect.tsvbMarkdownWithValuesExists(['7,209.286']);
      });

      it('vega', async () => {
        await dashboardExpect.vegaTextsExist(['5,000']);
      });
    });

    describe('nested filtering', () => {
      before(async () => {
        await dashboard.gotoDashboardLandingPage();
        await elasticChart.setNewChartUiDebugFlag(true);
      });

      it('visualization saved with a query filters data', async () => {
        await dashboard.clickNewDashboard();
        await timePicker.setDefaultDataRange();

        await dashboardAddPanel.addVisualization('Rendering-Test:-animal-sounds-pie');
        await header.waitUntilLoadingHasFinished();
        await dashboard.waitForRenderComplete();
        await pieChart.expectPieSliceCount(5);

        await dashboardPanelActions.clickEdit();
        await queryBar.setQuery('weightLbs:>50');
        await queryBar.submitQuery();

        await header.waitUntilLoadingHasFinished();

        // We are on the visualize page, not dashboard, so can't use "dashboard.waitForRenderComplete();"
        // as that expects an item with the `data-shared-items-count` tag.
        await renderable.waitForRender();
        await pieChart.expectPieSliceCount(3);

        await visualize.saveVisualizationExpectSuccess('Rendering Test: animal sounds pie');
        await header.clickDashboard();
        await header.waitUntilLoadingHasFinished();
        await dashboard.waitForRenderComplete();
        await pieChart.expectPieSliceCount(3);
      });

      it('Nested visualization filter pills filters data as expected', async () => {
        await dashboardPanelActions.clickEdit();
        await header.waitUntilLoadingHasFinished();
        await renderable.waitForRender();
        await pieChart.filterOnPieSlice('grr');
        await header.waitUntilLoadingHasFinished();
        await pieChart.expectPieSliceCount(1);

        await visualize.saveVisualizationExpectSuccess('animal sounds pie');
        await header.clickDashboard();

        await pieChart.expectPieSliceCount(1);
      });

      it('Removing filter pills and query unfiters data as expected', async () => {
        await dashboardPanelActions.clickEdit();
        await header.waitUntilLoadingHasFinished();
        await renderable.waitForRender();
        await queryBar.setQuery('');
        await queryBar.submitQuery();
        await filterBar.removeFilter('sound.keyword');
        await header.waitUntilLoadingHasFinished();
        await pieChart.expectPieSliceCount(5);

        await visualize.saveVisualizationExpectSuccess('Rendering Test: animal sounds pie');
        await header.clickDashboard();

        await pieChart.expectPieSliceCount(5);
      });

      it('Pie chart linked to saved search filters data', async () => {
        await dashboardAddPanel.addVisualization(
          'Filter Test: animals: linked to search with filter'
        );
        await elasticChart.setNewChartUiDebugFlag(true);
        await pieChart.expectSliceCountForAllPies(7);
      });

      it('Pie chart linked to saved search filters shows no data with conflicting dashboard query', async () => {
        await elasticChart.setNewChartUiDebugFlag(true);
        await queryBar.setQuery('weightLbs<40');
        await queryBar.submitQuery();
        await dashboard.waitForRenderComplete();

        await pieChart.expectPieSliceCount(5);
      });
    });
  });
}
