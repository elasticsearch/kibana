/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/discover/group1/_discover_histogram.ts

import expect from '@kbn/expect';
import type { TimeStrings } from '../../../page_objects/common_page';
import type { FtrProviderContext } from '../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const elasticChart = getService('elasticChart');
  const kibanaServer = getService('kibanaServer');
  const security = getService('security');
  const { timePicker, dashboard, discover, common, header } = getPageObjects([
    'timePicker',
    'dashboard',
    'discover',
    'common',
    'header',
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
      await timePicker.setDefaultAbsoluteRangeViaUiSettings();
      await common.navigateToApp('discover');
    });

    after(async () => {
      await esArchiver.unload(
        'src/platform/test/functional/fixtures/es_archiver/long_window_logstash'
      );
      await kibanaServer.savedObjects.cleanStandardList();
      await security.testUser.restoreDefaults();
      await common.unsetTime();
    });

    beforeEach(async () => {
      await browser.clearLocalStorage();
    });

    async function prepareTest(time: TimeStrings, interval?: string) {
      await common.setTime(time);
      await common.navigateToApp('discover');
      await discover.waitUntilSearchingHasFinished();
      if (interval) {
        await discover.setChartInterval(interval);
        await header.waitUntilLoadingHasFinished();
      }
    }

    it('should modify the time range when the histogram is brushed', async function () {
      await common.navigateToApp('discover');
      await discover.waitUntilSearchingHasFinished();
      await elasticChart.waitForRenderComplete();
      let prevRowData = '';
      // to make sure the table is already rendered
      await retry.try(async () => {
        prevRowData = await discover.getDocTableField(1);
        log.debug(`The first timestamp value in doc table before brushing: ${prevRowData}`);
      });

      await discover.brushHistogram();
      await discover.waitUntilSearchingHasFinished();
      await elasticChart.waitForRenderComplete();
      const newDurationHours = await timePicker.getTimeDurationInHours();
      expect(Math.round(newDurationHours)).to.be(23); // might fail if histogram's width changes

      await retry.waitFor('doc table containing the documents of the brushed range', async () => {
        const rowData = await discover.getDocTableField(1);
        log.debug(`The first timestamp value in doc table after brushing: ${rowData}`);
        return prevRowData !== rowData;
      });
    });

    it('should update correctly when switching data views and brushing the histogram', async () => {
      await common.navigateToApp('discover');
      await discover.waitUntilSearchingHasFinished();
      await discover.selectIndexPattern('logstash-*');
      await discover.waitUntilSearchingHasFinished();
      await discover.selectIndexPattern('long-window-logstash-*');
      await discover.waitUntilSearchingHasFinished();
      await discover.brushHistogram();
      await discover.waitUntilSearchingHasFinished();
      expect(await discover.getHitCount()).to.be('7');
    });

    it('should update the histogram timerange when the query is resubmitted', async function () {
      await kibanaServer.uiSettings.update({
        'timepicker:timeDefaults': '{  "from": "2015-09-18T19:37:13.000Z",  "to": "now"}',
      });
      await common.navigateToApp('discover');
      await header.awaitKibanaChrome();
      const initialTimeString = await discover.getChartTimespan();
      await queryBar.clickQuerySubmitButton();
      await discover.waitUntilSearchingHasFinished();

      await retry.waitFor('chart timespan to have changed', async () => {
        const refreshedTimeString = await discover.getChartTimespan();
        await queryBar.clickQuerySubmitButton();
        await discover.waitUntilSearchingHasFinished();
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
      const chartIntervalIconTip = await discover.getChartIntervalWarningIcon();
      expect(chartIntervalIconTip).to.be(false);
    });

    it('should visualize monthly data with different years scaled to seconds', async () => {
      const from = 'Jan 1, 2010 @ 00:00:00.000';
      const to = 'Mar 21, 2019 @ 00:00:00.000';
      await prepareTest({ from, to }, 'Second');
      const chartCanvasExist = await elasticChart.canvasExists();
      expect(chartCanvasExist).to.be(true);
      const chartIntervalIconTip = await discover.getChartIntervalWarningIcon();
      expect(chartIntervalIconTip).to.be(true);
    });

    it('should allow hide/show histogram, persisted in url state', async () => {
      const from = 'Jan 1, 2010 @ 00:00:00.000';
      const to = 'Mar 21, 2019 @ 00:00:00.000';
      await prepareTest({ from, to });
      let canvasExists = await elasticChart.canvasExists();
      expect(canvasExists).to.be(true);
      await discover.toggleChartVisibility();
      await retry.try(async () => {
        canvasExists = await elasticChart.canvasExists();
        expect(canvasExists).to.be(false);
      });
      // histogram is hidden, when reloading the page it should remain hidden
      await browser.refresh();
      canvasExists = await elasticChart.canvasExists();
      expect(canvasExists).to.be(false);
      await discover.toggleChartVisibility();
      await header.waitUntilLoadingHasFinished();
      await retry.try(async () => {
        canvasExists = await elasticChart.canvasExists();
        expect(canvasExists).to.be(true);
      });
    });

    it('should allow hide/show histogram, persisted after navigating away and back', async () => {
      const from = 'Jan 1, 2010 @ 00:00:00.000';
      const to = 'Mar 21, 2019 @ 00:00:00.000';
      await prepareTest({ from, to });
      let canvasExists = await elasticChart.canvasExists();
      expect(canvasExists).to.be(true);
      await discover.toggleChartVisibility();
      await retry.try(async () => {
        canvasExists = await elasticChart.canvasExists();
        expect(canvasExists).to.be(false);
      });
      await dashboard.navigateToApp();
      await header.waitUntilLoadingHasFinished();
      await common.navigateToApp('discover');
      await header.waitUntilLoadingHasFinished();
      canvasExists = await elasticChart.canvasExists();
      expect(canvasExists).to.be(false);
      await discover.toggleChartVisibility();
      await header.waitUntilLoadingHasFinished();
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
      await discover.toggleChartVisibility();
      let canvasExists: boolean;
      await retry.try(async () => {
        canvasExists = await elasticChart.canvasExists();
        expect(canvasExists).to.be(false);
      });

      // save search
      await discover.saveSearch(savedSearch);
      await header.waitUntilLoadingHasFinished();

      // open new search
      await discover.clickNewSearchButton();
      await header.waitUntilLoadingHasFinished();

      // load saved search
      await discover.loadSavedSearch(savedSearch);
      await header.waitUntilLoadingHasFinished();
      canvasExists = await elasticChart.canvasExists();
      expect(canvasExists).to.be(false);

      // open chart for saved search
      await discover.toggleChartVisibility();
      await retry.waitFor(`Discover histogram to be displayed`, async () => {
        canvasExists = await elasticChart.canvasExists();
        return canvasExists;
      });

      // save search
      await discover.saveSearch(savedSearch);
      await header.waitUntilLoadingHasFinished();

      // open new search
      await discover.clickNewSearchButton();
      await header.waitUntilLoadingHasFinished();

      // load saved search
      await discover.loadSavedSearch(savedSearch);
      await header.waitUntilLoadingHasFinished();
      canvasExists = await elasticChart.canvasExists();
      expect(canvasExists).to.be(true);
    });

    it('should show permitted hidden histogram state when returning back to discover', async () => {
      // close chart
      await discover.toggleChartVisibility();
      let canvasExists: boolean;
      await retry.try(async () => {
        canvasExists = await elasticChart.canvasExists();
        expect(canvasExists).to.be(false);
      });

      // save search
      await discover.saveSearch('persisted hidden histogram');
      await header.waitUntilLoadingHasFinished();

      // open chart
      await discover.toggleChartVisibility();
      await retry.try(async () => {
        canvasExists = await elasticChart.canvasExists();
        expect(canvasExists).to.be(true);
      });

      // go to dashboard
      await dashboard.navigateToApp();
      await header.waitUntilLoadingHasFinished();

      // go to discover
      await common.navigateToApp('discover');
      await header.waitUntilLoadingHasFinished();
      canvasExists = await elasticChart.canvasExists();
      expect(canvasExists).to.be(true);

      // close chart
      await discover.toggleChartVisibility();
      await retry.try(async () => {
        canvasExists = await elasticChart.canvasExists();
        expect(canvasExists).to.be(false);
      });
    });

    it('should recover from broken query search when clearing the query bar', async () => {
      await common.navigateToApp('discover');
      await discover.waitUntilSearchingHasFinished();
      // type an invalid search query, hit refresh
      await queryBar.setQuery('this is > not valid');
      await queryBar.submitQuery();

      await discover.showsErrorCallout();

      // now remove the query
      await queryBar.clearQuery();
      await queryBar.submitQuery();
      await discover.waitUntilSearchingHasFinished();
      // check no error state
      expect(await discover.isChartVisible()).to.be(true);
    });

    it('should reset all histogram state when resetting the saved search', async () => {
      await common.navigateToApp('discover');
      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();
      await timePicker.setDefaultAbsoluteRange();
      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();
      const savedSearch = 'histogram state';
      await discover.saveSearch(savedSearch);
      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();
      await discover.chooseBreakdownField('extension.keyword');
      await discover.setChartInterval('Second');
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
      await discover.toggleChartVisibility();
      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();
      await discover.revertUnsavedChanges();
      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();
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

    it('should save chart interval in persisted discover session', async () => {
      const savedSearchName = 'with chart interval';
      await common.navigateToApp('discover');
      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();
      await timePicker.setDefaultAbsoluteRange();
      await header.waitUntilLoadingHasFinished();

      await discover.setChartInterval('Second');
      await header.waitUntilLoadingHasFinished();
      await discover.saveSearch(savedSearchName);

      await discover.clickNewSearchButton();
      await header.waitUntilLoadingHasFinished();
      expect(await discover.getChartInterval()).to.be('auto');

      await discover.loadSavedSearch(savedSearchName);
      await header.waitUntilLoadingHasFinished();
      expect(await discover.getChartInterval()).to.be('s');
    });

    it('should clear chart interval in persisted discover session', async () => {
      const savedSearchName = 'with chart interval then cleared';
      await common.navigateToApp('discover');
      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();
      await timePicker.setDefaultAbsoluteRange();
      await header.waitUntilLoadingHasFinished();

      await discover.setChartInterval('Minute');
      await header.waitUntilLoadingHasFinished();
      await discover.saveSearch(savedSearchName);

      await discover.setChartInterval('Auto');
      await header.waitUntilLoadingHasFinished();
      await discover.saveSearch(savedSearchName);

      await discover.clickNewSearchButton();
      await header.waitUntilLoadingHasFinished();

      await discover.loadSavedSearch(savedSearchName);
      await header.waitUntilLoadingHasFinished();
      expect(await discover.getChartInterval()).to.be('auto');
    });
  });
}
