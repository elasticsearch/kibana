/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/discover/group1/_discover.ts

import expect from '@kbn/expect';

import type { FtrProviderContext } from '../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const browser = getService('browser');
  const log = getService('log');
  const retry = getService('retry');
  const kibanaServer = getService('kibanaServer');
  const queryBar = getService('queryBar');
  const inspector = getService('inspector');
  const testSubjects = getService('testSubjects');
  const { common, discover, header, timePicker, unifiedFieldList } = getPageObjects([
    'common',
    'discover',
    'header',
    'timePicker',
    'unifiedFieldList',
  ]);

  const defaultSettings = {
    defaultIndex: 'logstash-*',
  };

  describe('discover test', function describeIndexTests() {
    before(async function () {
      log.debug('load kibana index with default index pattern');
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      await kibanaServer.uiSettings.replace(defaultSettings);
      await common.navigateToApp('discover');
      await timePicker.setDefaultAbsoluteRange();
    });
    after(async () => {
      await kibanaServer.savedObjects.clean({ types: ['search', 'index-pattern'] });
    });
    describe('query', function () {
      const queryName1 = 'Query # 1';

      it('should show correct time range string by timepicker', async function () {
        const time = await timePicker.getTimeConfig();
        expect(time.start).to.be(timePicker.defaultStartTime);
        expect(time.end).to.be(timePicker.defaultEndTime);
        const rowData = await discover.getDocTableIndex(1);
        log.debug('check the newest doc timestamp in UTC (check diff timezone in last test)');
        expect(rowData).to.contain('Sep 22, 2015 @ 23:50:13.253');
      });

      it('save query should show toast message and display query name', async function () {
        await discover.saveSearch(queryName1);
        await discover.waitUntilTabIsLoaded();
        const actualQueryNameString = await discover.getCurrentQueryName();
        expect(actualQueryNameString).to.be(queryName1);
      });

      it('load query should show query name', async function () {
        await discover.loadSavedSearch(queryName1);

        await retry.try(async function () {
          expect(await discover.getCurrentQueryName()).to.be(queryName1);
        });
      });

      it('renaming a saved query should modify name in breadcrumb', async function () {
        const queryName2 = 'Modified Query # 1';
        await discover.loadSavedSearch(queryName1);
        await discover.waitUntilTabIsLoaded();
        await discover.saveSearch(queryName2);
        await discover.waitUntilTabIsLoaded();

        await retry.try(async function () {
          expect(await discover.getCurrentQueryName()).to.be(queryName2);
        });
      });

      it('should show the correct hit count', async function () {
        const expectedHitCount = '14,004';
        await retry.try(async function () {
          expect(await discover.getHitCount()).to.be(expectedHitCount);
        });
      });

      it('should show correct time range string in chart', async function () {
        const actualTimeString = await discover.getChartTimespan();
        const expectedTimeString = `${timePicker.defaultStartTime} - ${timePicker.defaultEndTime} (interval: Auto - 3 hours)`;
        expect(actualTimeString).to.be(expectedTimeString);
      });

      it('should modify the time range when a bar is clicked', async function () {
        await timePicker.setDefaultAbsoluteRange();
        await discover.waitUntilTabIsLoaded();
        await discover.clickHistogramBar();
        await discover.waitUntilTabIsLoaded();
        const time = await timePicker.getTimeConfig();
        expect(time.start).to.be('Sep 21, 2015 @ 09:00:00.000');
        expect(time.end).to.be('Sep 21, 2015 @ 12:00:00.000');
        await retry.waitForWithTimeout(
          'table to contain the right search result',
          3000,
          async () => {
            const rowData = await discover.getDocTableField(1);
            log.debug(`The first timestamp value in doc table: ${rowData}`);
            return rowData.includes('Sep 21, 2015 @ 11:59:22.316');
          }
        );
      });

      it('should show correct initial chart interval of Auto', async function () {
        await timePicker.setDefaultAbsoluteRange();
        await discover.waitUntilTabIsLoaded();
        await testSubjects.click('discoverQueryHits'); // to cancel out tooltips
        const actualInterval = await discover.getChartInterval();

        const expectedInterval = 'auto';
        expect(actualInterval).to.be(expectedInterval);
      });

      it('should not show "no results"', async () => {
        const isVisible = await discover.hasNoResults();
        expect(isVisible).to.be(false);
      });

      it('should reload the saved search with persisted query to show the initial hit count', async function () {
        await timePicker.setDefaultAbsoluteRange();
        await discover.waitUntilTabIsLoaded();
        // apply query some changes
        await queryBar.setQuery('test');
        await queryBar.submitQuery();
        await discover.waitUntilTabIsLoaded();
        await retry.try(async function () {
          expect(await discover.getHitCount()).to.be('22');
        });

        // reset to persisted state
        await queryBar.clearQuery();
        await discover.waitUntilTabIsLoaded();
        await discover.revertUnsavedChanges();
        const expectedHitCount = '14,004';
        await retry.try(async function () {
          expect(await queryBar.getQueryString()).to.be('');
          expect(await discover.getHitCount()).to.be(expectedHitCount);
        });
      });
    });

    describe('query #2, which has an empty time range', () => {
      const fromTime = 'Jun 11, 1999 @ 09:22:11.000';
      const toTime = 'Jun 12, 1999 @ 11:21:04.000';

      before(async () => {
        log.debug('setAbsoluteRangeForAnotherQuery');
        await timePicker.setAbsoluteRange(fromTime, toTime);
        await discover.waitUntilSearchingHasFinished();
      });

      it('should show "no results"', async () => {
        await retry.waitFor('no results screen is displayed', async function () {
          const isVisible = await discover.hasNoResults();
          return isVisible === true;
        });
      });

      it('should suggest a new time range is picked', async () => {
        const isVisible = await discover.hasNoResultsTimepicker();
        expect(isVisible).to.be(true);
      });

      it('should show matches when time range is expanded', async () => {
        await discover.expandTimeRangeAsSuggestedInNoResultsMessage();
        await retry.try(async function () {
          expect(await discover.hasNoResults()).to.be(false);
          expect(await discover.getHitCountInt()).to.be.above(0);
        });
      });
    });

    describe('nested query', () => {
      before(async () => {
        log.debug('setAbsoluteRangeForAnotherQuery');
        await timePicker.setDefaultAbsoluteRange();
        await discover.waitUntilTabIsLoaded();
      });

      it('should support querying on nested fields', async function () {
        await queryBar.setQuery('nestedField:{ child: nestedValue }');
        await queryBar.submitQuery();

        await discover.waitUntilTabIsLoaded();

        await retry.try(async function () {
          expect(await discover.getHitCount()).to.be('1');
        });
      });
    });

    describe('data-shared-item', function () {
      it('should have correct data-shared-item title and description', async () => {
        const expected = {
          title: 'A Saved Search',
          description: 'A Saved Search Description',
        };

        await retry.try(async () => {
          await discover.loadSavedSearch(expected.title);
          await discover.waitUntilTabIsLoaded();
          const { title, description } = await common.getSharedItemTitleAndDescription();
          expect(title).to.eql(expected.title);
          expect(description).to.eql(expected.description);
        });
      });
    });

    describe('time zone switch', () => {
      it('should show bars in the correct time zone after switching', async function () {
        await kibanaServer.uiSettings.update({ 'dateFormat:tz': 'America/Phoenix' });
        await common.navigateToApp('discover');
        await header.awaitKibanaChrome();
        await discover.waitUntilTabIsLoaded();
        await timePicker.setDefaultAbsoluteRange();
        await discover.waitUntilTabIsLoaded();
        await queryBar.clearQuery();
        await discover.waitUntilTabIsLoaded();

        log.debug(
          'check that the newest doc timestamp is now -7 hours from the UTC time in the first test'
        );
        const rowData = await discover.getDocTableIndex(1);
        expect(rowData.startsWith('Sep 22, 2015 @ 16:50:13.253')).to.be.ok();
      });
    });

    describe('invalid time range in URL', function () {
      it('should get the default timerange', async function () {
        await common.navigateToUrl('discover', '#/?_g=(time:(from:now-15m,to:null))', {
          useActualUrl: true,
        });
        await header.awaitKibanaChrome();
        await discover.waitUntilTabIsLoaded();
        const time = await timePicker.getTimeConfig();
        expect(
          time.start === '~ 15 minutes ago' ||
            time.start === 'now-15m' ||
            time.start === 'now-15m/m'
        ).to.be(true);
        expect(time.end).to.be('now');
      });
    });

    describe('managing fields', function () {
      it('should add a field, sort by it, remove it and also sorting by it', async function () {
        await timePicker.setDefaultAbsoluteRangeViaUiSettings();
        await common.navigateToApp('discover');
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.clickFieldListItemAdd('_score');
        await discover.waitUntilTabIsLoaded();
        await discover.clickFieldSort('_score', 'Sort Low-High');
        await discover.waitUntilTabIsLoaded();
        const currentUrlWithScore = await browser.getCurrentUrl();
        expect(currentUrlWithScore).to.contain('_score');
        await unifiedFieldList.clickFieldListItemRemove('_score');
        await discover.waitUntilTabIsLoaded();
        const currentUrlWithoutScore = await browser.getCurrentUrl();
        expect(currentUrlWithoutScore).not.to.contain('_score');
      });
      it('should add a field with customLabel, sort by it, display it correctly', async function () {
        await timePicker.setDefaultAbsoluteRangeViaUiSettings();
        await common.navigateToApp('discover');
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.clickFieldListItemAdd('referer');
        await discover.waitUntilTabIsLoaded();
        await discover.clickFieldSort('referer', 'Sort A-Z');
        expect(await discover.getDocHeader()).to.have.string('Referer custom');
        expect(await unifiedFieldList.getAllFieldNames()).to.contain('Referer custom');
        const url = await browser.getCurrentUrl();
        expect(url).to.contain('referer');
      });
    });

    describe('refresh interval', function () {
      it('should refetch when autofresh is enabled', async () => {
        const intervalS = 5;
        await timePicker.startAutoRefresh(intervalS);
        await discover.waitUntilTabIsLoaded();

        const getRequestTimestamp = async () => {
          // check inspector panel request stats for timestamp
          await discover.openInspectorFromTabMenu();
          const requestStats = await inspector.getTableData();
          const requestStatsRow = requestStats.filter(
            (r) => r && r[0] && r[0].includes('Request timestamp')
          );
          await inspector.close();
          if (!requestStatsRow || !requestStatsRow[0] || !requestStatsRow[0][1]) {
            return '';
          }
          return requestStatsRow[0][1];
        };

        const requestTimestampBefore = await getRequestTimestamp();
        await retry.waitFor('refetch because of refresh interval', async () => {
          const requestTimestampAfter = await getRequestTimestamp();
          log.debug(
            `Timestamp before: ${requestTimestampBefore}, Timestamp after: ${requestTimestampAfter}`
          );
          return Boolean(requestTimestampAfter) && requestTimestampBefore !== requestTimestampAfter;
        });
      });

      after(async () => {
        await inspector.close();
        await timePicker.pauseAutoRefresh();
      });
    });

    describe('resizable layout panels', () => {
      it('should allow resizing the histogram layout panels', async () => {
        const resizeDistance = 100;
        const topPanel = await testSubjects.find('unifiedHistogramResizablePanelFixed');
        const mainPanel = await testSubjects.find('unifiedHistogramResizablePanelFlex');
        const resizeButton = await testSubjects.find('unifiedHistogramResizableButton');
        const topPanelSize = (await topPanel.getPosition()).height;
        const mainPanelSize = (await mainPanel.getPosition()).height;
        await browser.dragAndDrop(
          { location: resizeButton },
          { location: { x: 0, y: resizeDistance } }
        );
        const newTopPanelSize = (await topPanel.getPosition()).height;
        const newMainPanelSize = (await mainPanel.getPosition()).height;
        expect(newTopPanelSize).to.be(topPanelSize + resizeDistance);
        expect(newMainPanelSize).to.be(mainPanelSize - resizeDistance);
      });

      it('should allow resizing the sidebar layout panels', async () => {
        const resizeDistance = 100;
        const leftPanel = await testSubjects.find('discoverLayoutResizablePanelFixed');
        const mainPanel = await testSubjects.find('discoverLayoutResizablePanelFlex');
        const resizeButton = await testSubjects.find('discoverLayoutResizableButton');
        const leftPanelSize = (await leftPanel.getPosition()).width;
        const mainPanelSize = (await mainPanel.getPosition()).width;
        await browser.dragAndDrop(
          { location: resizeButton },
          { location: { x: resizeDistance, y: 0 } }
        );
        const newLeftPanelSize = (await leftPanel.getPosition()).width;
        const newMainPanelSize = (await mainPanel.getPosition()).width;
        expect(newLeftPanelSize).to.be(leftPanelSize + resizeDistance);
        expect(newMainPanelSize).to.be(mainPanelSize - resizeDistance);
      });
    });
  });
}
