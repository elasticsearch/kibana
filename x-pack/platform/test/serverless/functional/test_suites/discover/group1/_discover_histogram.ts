/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/group1/_discover_histogram.ts

import expect from '@kbn/expect';
import type { TimeStrings } from '@kbn/test-suites-src/functional/page_objects/common_page';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const elasticChart = getService('elasticChart');
  const kibanaServer = getService('kibanaServer');
  const security = getService('security');
  const PageObjects = getPageObjects([
    'timePicker',
    'dashboard',
    'discover',
    'common',
    'header',
    'svlCommonPage',
  ]);
  const defaultSettings = {
    defaultIndex: 'long-window-logstash-*',
    'dateFormat:tz': 'Europe/Berlin',
  };
  const testSubjects = getService('testSubjects');
  const browser = getService('browser');
  const retry = getService('retry');
  const log = getService('log');
  const queryBar = getService('queryBar');

  describe('discover histogram', function describeIndexTests() {
    before(async () => {
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await esArchiver.load(
        'src/platform/test/functional/fixtures/es_archiver/long_window_logstash'
      );
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/long_window_logstash_index_pattern'
      );
      await security.testUser.setRoles(['kibana_admin', 'long_window_logstash']);
      await kibanaServer.uiSettings.replace(defaultSettings);
      await PageObjects.svlCommonPage.loginAsAdmin();
      await PageObjects.timePicker.setDefaultAbsoluteRangeViaUiSettings();
      await PageObjects.common.navigateToApp('discover');
    });
    after(async () => {
      await esArchiver.unload(
        'src/platform/test/functional/fixtures/es_archiver/long_window_logstash'
      );
      await kibanaServer.savedObjects.cleanStandardList();
      await security.testUser.restoreDefaults();
      await PageObjects.common.unsetTime();
    });

    async function prepareTest(time: TimeStrings, interval?: string) {
      await PageObjects.common.setTime(time);
      await PageObjects.common.navigateToApp('discover');
      await PageObjects.discover.waitUntilSearchingHasFinished();
      if (interval) {
        await PageObjects.discover.setChartInterval(interval);
        await PageObjects.header.waitUntilLoadingHasFinished();
      }
    }

    it('should modify the time range when the histogram is brushed', async function () {
      await PageObjects.common.navigateToApp('discover');
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await elasticChart.waitForRenderComplete();
      let prevRowData = '';
      // to make sure the table is already rendered
      await retry.try(async () => {
        prevRowData = await PageObjects.discover.getDocTableField(1);
        log.debug(`The first timestamp value in doc table before brushing: ${prevRowData}`);
      });

      await PageObjects.discover.brushHistogram();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await elasticChart.waitForRenderComplete();
      const newDurationHours = await PageObjects.timePicker.getTimeDurationInHours();
      // TODO: The Serverless sidebar causes `PageObjects.discover.brushHistogram()`
      // to brush a different range in the histogram, resulting in a different duration.
      // Any visual change in the layout will change the brushed range and thus the duration
      expect(Math.round(newDurationHours)).to.be(26);

      await retry.waitFor('doc table containing the documents of the brushed range', async () => {
        const rowData = await PageObjects.discover.getDocTableField(1);
        log.debug(`The first timestamp value in doc table after brushing: ${rowData}`);
        return prevRowData !== rowData;
      });
    });

    it('should update correctly when switching data views and brushing the histogram', async () => {
      await PageObjects.common.navigateToApp('discover');
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await PageObjects.discover.selectIndexPattern('logstash-*');
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await PageObjects.discover.selectIndexPattern('long-window-logstash-*');
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await PageObjects.discover.brushHistogram();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      // TODO: The Serverless sidebar causes `PageObjects.discover.brushHistogram()`
      // to brush a different range in the histogram, resulting in a different count
      expect(await PageObjects.discover.getHitCount()).to.be('7');
    });

    it('should update the histogram timerange when the query is resubmitted', async function () {
      await kibanaServer.uiSettings.update({
        'timepicker:timeDefaults': '{  "from": "2015-09-18T19:37:13.000Z",  "to": "now"}',
      });
      await PageObjects.common.navigateToApp('discover');
      await PageObjects.header.awaitKibanaChrome();
      const initialTimeString = await PageObjects.discover.getChartTimespan();
      await queryBar.clickQuerySubmitButton();
      await PageObjects.discover.waitUntilSearchingHasFinished();

      await retry.waitFor('chart timespan to have changed', async () => {
        const refreshedTimeString = await PageObjects.discover.getChartTimespan();
        await queryBar.clickQuerySubmitButton();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        log.debug(
          `Timestamp before: ${initialTimeString}, Timestamp after: ${refreshedTimeString}`
        );
        return refreshedTimeString !== initialTimeString;
      });
    });

    it('should visualize monthly data with different day intervals', async () => {
      const from = 'Nov 1, 2017 @ 00:00:00.000';
      const to = 'Mar 21, 2018 @ 00:00:00.000';
      await prepareTest({ from, to }, 'Month');
      const chartCanvasExist = await elasticChart.canvasExists();
      expect(chartCanvasExist).to.be(true);
    });
    it('should visualize weekly data with within DST changes', async () => {
      const from = 'Mar 1, 2018 @ 00:00:00.000';
      const to = 'May 1, 2018 @ 00:00:00.000';
      await prepareTest({ from, to }, 'Week');
      const chartCanvasExist = await elasticChart.canvasExists();
      expect(chartCanvasExist).to.be(true);
    });
    it('should visualize monthly data with different years scaled to 30 days', async () => {
      const from = 'Jan 1, 2010 @ 00:00:00.000';
      const to = 'Mar 21, 2019 @ 00:00:00.000';
      await prepareTest({ from, to }, 'Day');
      const chartCanvasExist = await elasticChart.canvasExists();
      expect(chartCanvasExist).to.be(true);
      const chartIntervalIconTip = await PageObjects.discover.getChartIntervalWarningIcon();
      expect(chartIntervalIconTip).to.be(false);
    });
    it('should visualize monthly data with different years scaled to seconds', async () => {
      const from = 'Jan 1, 2010 @ 00:00:00.000';
      const to = 'Mar 21, 2019 @ 00:00:00.000';
      await prepareTest({ from, to }, 'Second');
      const chartCanvasExist = await elasticChart.canvasExists();
      expect(chartCanvasExist).to.be(true);
      const chartIntervalIconTip = await PageObjects.discover.getChartIntervalWarningIcon();
      expect(chartIntervalIconTip).to.be(true);
    });
    it('should allow hide/show histogram, persisted in url state', async () => {
      const from = 'Jan 1, 2010 @ 00:00:00.000';
      const to = 'Mar 21, 2019 @ 00:00:00.000';
      await prepareTest({ from, to });
      let canvasExists = await elasticChart.canvasExists();
      expect(canvasExists).to.be(true);
      await PageObjects.discover.toggleChartVisibility();
      await retry.try(async () => {
        canvasExists = await elasticChart.canvasExists();
        expect(canvasExists).to.be(false);
      });
      // histogram is hidden, when reloading the page it should remain hidden
      await browser.refresh();
      canvasExists = await elasticChart.canvasExists();
      expect(canvasExists).to.be(false);
      await PageObjects.discover.toggleChartVisibility();
      await PageObjects.header.waitUntilLoadingHasFinished();
      await retry.try(async () => {
        canvasExists = await elasticChart.canvasExists();
        expect(canvasExists).to.be(true);
      });
    });
    it('should allow hiding the histogram, persisted in saved search', async () => {
      const from = 'Jan 1, 2010 @ 00:00:00.000';
      const to = 'Mar 21, 2019 @ 00:00:00.000';
      const savedSearch = 'persisted hidden histogram';
      await prepareTest({ from, to });

      // close chart for saved search
      await PageObjects.discover.toggleChartVisibility();
      let canvasExists: boolean;
      await retry.try(async () => {
        canvasExists = await elasticChart.canvasExists();
        expect(canvasExists).to.be(false);
      });

      // save search
      await PageObjects.discover.saveSearch(savedSearch);
      await PageObjects.header.waitUntilLoadingHasFinished();

      // open new search
      await PageObjects.discover.clickNewSearchButton();
      await PageObjects.header.waitUntilLoadingHasFinished();

      // load saved search
      await PageObjects.discover.loadSavedSearch(savedSearch);
      await PageObjects.header.waitUntilLoadingHasFinished();
      canvasExists = await elasticChart.canvasExists();
      expect(canvasExists).to.be(false);

      // open chart for saved search
      await PageObjects.discover.toggleChartVisibility();
      await retry.waitFor(`Discover histogram to be displayed`, async () => {
        canvasExists = await elasticChart.canvasExists();
        return canvasExists;
      });

      // save search
      await PageObjects.discover.saveSearch(savedSearch);
      await PageObjects.header.waitUntilLoadingHasFinished();

      // open new search
      await PageObjects.discover.clickNewSearchButton();
      await PageObjects.header.waitUntilLoadingHasFinished();

      // load saved search
      await PageObjects.discover.loadSavedSearch(savedSearch);
      await PageObjects.header.waitUntilLoadingHasFinished();
      canvasExists = await elasticChart.canvasExists();
      expect(canvasExists).to.be(true);
    });
    it('should show permitted hidden histogram state when returning back to discover', async () => {
      // close chart
      await PageObjects.discover.toggleChartVisibility();
      let canvasExists: boolean;
      await retry.try(async () => {
        canvasExists = await elasticChart.canvasExists();
        expect(canvasExists).to.be(false);
      });

      // save search
      await PageObjects.discover.saveSearch('persisted hidden histogram');
      await PageObjects.header.waitUntilLoadingHasFinished();

      // open chart
      await PageObjects.discover.toggleChartVisibility();
      await retry.try(async () => {
        canvasExists = await elasticChart.canvasExists();
        expect(canvasExists).to.be(true);
      });

      // go to dashboard
      await PageObjects.dashboard.navigateToApp();
      await PageObjects.header.waitUntilLoadingHasFinished();

      // go to discover
      await PageObjects.common.navigateToApp('discover');
      await PageObjects.header.waitUntilLoadingHasFinished();
      canvasExists = await elasticChart.canvasExists();
      expect(canvasExists).to.be(true);

      // close chart
      await PageObjects.discover.toggleChartVisibility();
      await retry.try(async () => {
        canvasExists = await elasticChart.canvasExists();
        expect(canvasExists).to.be(false);
      });
    });

    it('should recover from broken query search when clearing the query bar', async () => {
      await PageObjects.common.navigateToApp('discover');
      await PageObjects.discover.waitUntilSearchingHasFinished();
      // Make sure the chart is visible
      await PageObjects.discover.toggleChartVisibility();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      // type an invalid search query, hit refresh
      await queryBar.setQuery('this is > not valid');
      await queryBar.submitQuery();

      await PageObjects.discover.showsErrorCallout();

      // now remove the query
      await queryBar.clearQuery();
      await queryBar.submitQuery();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      // check no error state
      expect(await PageObjects.discover.isChartVisible()).to.be(true);
    });

    it('should reset all histogram state when resetting the saved search', async () => {
      await PageObjects.common.navigateToApp('discover');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await PageObjects.timePicker.setDefaultAbsoluteRange();
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      const savedSearch = 'histogram state';
      await PageObjects.discover.saveSearch(savedSearch);
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await PageObjects.discover.chooseBreakdownField('extension.keyword');
      await PageObjects.discover.setChartInterval('Second');
      await retry.try(async () => {
        const requestData =
          (await testSubjects.getAttribute('unifiedHistogramChart', 'data-request-data')) ?? '';
        expect(JSON.parse(requestData)).to.eql({
          dataViewId: 'long-window-logstash-*',
          timeField: '@timestamp',
          timeInterval: 's',
          breakdownField: 'extension.keyword',
        });
      });
      await PageObjects.discover.toggleChartVisibility();
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await PageObjects.discover.revertUnsavedChanges();
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await retry.try(async () => {
        const requestData =
          (await testSubjects.getAttribute('unifiedHistogramChart', 'data-request-data')) ?? '';
        expect(JSON.parse(requestData)).to.eql({
          dataViewId: 'long-window-logstash-*',
          timeField: '@timestamp',
          timeInterval: 'auto',
        });
      });
    });
  });
}
