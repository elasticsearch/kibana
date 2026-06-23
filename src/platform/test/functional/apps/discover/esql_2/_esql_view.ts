/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/discover/esql/_esql_view.ts

import expect from '@kbn/expect';
import kbnRison from '@kbn/rison';
import { NULL_LABEL } from '@kbn/field-formats-common';
import type { FtrProviderContext } from '../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const log = getService('log');
  const dataGrid = getService('dataGrid');
  const testSubjects = getService('testSubjects');
  const monacoEditor = getService('monacoEditor');
  const security = getService('security');
  const inspector = getService('inspector');
  const retry = getService('retry');
  const browser = getService('browser');
  const find = getService('find');
  const esql = getService('esql');
  const dashboardAddPanel = getService('dashboardAddPanel');
  const dataViews = getService('dataViews');
  const elasticChart = getService('elasticChart');
  const filterBar = getService('filterBar');

  const {
    appMenu,
    common,
    discover,
    dashboard,
    header,
    timePicker,
    unifiedFieldList,
    unifiedSearch,
  } = getPageObjects([
    'appMenu',
    'common',
    'discover',
    'dashboard',
    'header',
    'timePicker',
    'unifiedFieldList',
    'unifiedSearch',
  ]);

  const defaultSettings = {
    defaultIndex: 'logstash-*',
    enableESQL: true,
  };

  describe('discover esql view', function () {
    before(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await security.testUser.setRoles([
        'kibana_admin',
        'test_logstash_reader',
        'kibana_sample_read',
      ]);
      log.debug('load kibana index with default index pattern');
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      // and load a set of makelogs data
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await esArchiver.load(
        'src/platform/test/functional/fixtures/es_archiver/kibana_sample_data_flights'
      );
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/kibana_sample_data_flights_index_pattern'
      );
      await kibanaServer.uiSettings.replace(defaultSettings);
      await timePicker.setDefaultAbsoluteRangeViaUiSettings();
      await common.navigateToApp('discover');
      await discover.waitUntilTabIsLoaded();
    });

    after(async () => {
      await timePicker.resetDefaultAbsoluteRangeViaUiSettings();
    });

    describe('ES|QL in Discover', () => {
      beforeEach(async () => {
        await timePicker.setDefaultAbsoluteRangeViaUiSettings();
        await common.navigateToApp('discover');
        await discover.waitUntilTabIsLoaded();
      });

      it('should render esql view correctly', async function () {
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        expect(await testSubjects.exists('showQueryBarMenu')).to.be(true);
        expect(await timePicker.timePickerExists()).to.be(true);
        expect(await testSubjects.exists('addFilter')).to.be(true);
        expect(await testSubjects.exists('dscViewModeDocumentButton')).to.be(true);
        expect(await testSubjects.exists('unifiedHistogramChart')).to.be(true);
        expect(await testSubjects.exists('discoverQueryHits')).to.be(true);
        await testSubjects.click('app-menu-overflow-button');
        expect(await testSubjects.exists('discoverAlertsButton')).to.be(true);
        await testSubjects.click('app-menu-overflow-button');
        expect(await appMenu.menuItemExists('shareTopNavButton')).to.be(true);
        expect(await testSubjects.exists('docTableExpandToggleColumn')).to.be(true);
        expect(await testSubjects.exists('dataGridColumnSortingButton')).to.be(true);
        expect(await testSubjects.exists('fieldListFiltersFieldSearch')).to.be(true);
        expect(await testSubjects.exists('fieldListFiltersFieldTypeFilterToggle')).to.be(true);
        await testSubjects.click('field-@message-showDetails');
        expect(await testSubjects.exists('discoverFieldListPanelEdit-@message')).to.be(true);

        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        expect(await testSubjects.exists('fieldListFiltersFieldSearch')).to.be(true);
        expect(await testSubjects.exists('ESQLEditor')).to.be(true);
        expect(await timePicker.timePickerExists()).to.be(true);

        expect(await testSubjects.exists('showQueryBarMenu')).to.be(false);
        expect(await testSubjects.exists('addFilter')).to.be(false);
        expect(await testSubjects.exists('dscViewModeDocumentButton')).to.be(false);
        // when Lens suggests a table, we render an ESQL based histogram
        expect(await testSubjects.exists('unifiedHistogramChart')).to.be(true);
        expect(await testSubjects.exists('discoverQueryHits')).to.be(true);
        await testSubjects.click('app-menu-overflow-button');
        expect(await testSubjects.exists('discoverAlertsButton')).to.be(true);
        await testSubjects.click('app-menu-overflow-button');
        expect(await appMenu.menuItemExists('shareTopNavButton')).to.be(true);
        // we don't sort for the Document view
        expect(await testSubjects.exists('dataGridColumnSortingButton')).to.be(false);
        expect(await testSubjects.exists('docTableExpandToggleColumn')).to.be(true);
        expect(await testSubjects.exists('fieldListFiltersFieldTypeFilterToggle')).to.be(true);
        await testSubjects.click('field-@message-showDetails');
        expect(await testSubjects.exists('discoverFieldListPanelEditItem')).to.be(false);
      });

      it('should not render the histogram for indices with no @timestamp field', async function () {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        const testQuery = `from kibana_sample_data_flights | limit 10`;

        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();

        expect(await testSubjects.exists('ESQLEditor')).to.be(true);
        // I am not rendering the histogram for indices with no @timestamp field
        expect(await testSubjects.exists('unifiedHistogramChart')).to.be(false);
      });

      it('should render the histogram for indices with no @timestamp field when the ?_tstart, ?_tend params are in the query', async function () {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        const testQuery = `from kibana_sample_data_flights | limit 10 | where timestamp >= ?_tstart and timestamp <= ?_tend`;

        await monacoEditor.setCodeEditorValue(testQuery);

        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();

        const fromTime = 'Apr 10, 2018 @ 00:00:00.000';
        const toTime = 'Nov 15, 2018 @ 00:00:00.000';
        await timePicker.setAbsoluteRange(fromTime, toTime);

        expect(await testSubjects.exists('ESQLEditor')).to.be(true);
        expect(await testSubjects.exists('unifiedHistogramChart')).to.be(true);
      });

      it('should perform test query correctly', async function () {
        await timePicker.setDefaultAbsoluteRange();
        await discover.waitUntilTabIsLoaded();
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();

        const testQuery = `from logstash-* | sort @timestamp | limit 10 | stats countB = count(bytes) by geo.dest | sort countB`;
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();
        // here Lens suggests a XY so it is rendered
        expect(await testSubjects.exists('unifiedHistogramChart')).to.be(true);
        expect(await testSubjects.exists('xyVisChart')).to.be(true);
        const cell = await dataGrid.getCellElementExcludingControlColumns(0, 0);
        expect(await cell.getVisibleText()).to.be('1');
      });

      it('should render when switching to a time range with no data, then back to a time range with data', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();

        const testQuery = `from logstash-* | sort @timestamp | limit 10 | stats countB = count(bytes) by geo.dest | sort countB`;
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();
        let cell = await dataGrid.getCellElementExcludingControlColumns(0, 0);
        expect(await cell.getVisibleText()).to.be('1');
        await timePicker.setAbsoluteRange(
          'Sep 19, 2015 @ 06:31:44.000',
          'Sep 19, 2015 @ 06:31:44.000'
        );
        await discover.waitUntilTabIsLoaded();
        expect(await testSubjects.exists('discoverNoResults')).to.be(true);
        await timePicker.setDefaultAbsoluteRange();
        await discover.waitUntilTabIsLoaded();
        cell = await dataGrid.getCellElementExcludingControlColumns(0, 0);
        expect(await cell.getVisibleText()).to.be('1');
      });

      it('should query an index pattern that doesnt translate to a dataview correctly', async function () {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();

        const testQuery = `from logstash* | sort @timestamp | limit 10 | stats countB = count(bytes) by geo.dest | sort countB`;
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();

        const cell = await dataGrid.getCellElementExcludingControlColumns(0, 0);
        expect(await cell.getVisibleText()).to.be('1');
      });

      it('should render correctly if there are empty fields', async function () {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        const testQuery = `from logstash-* | limit 10 | keep machine.ram_range, bytes`;

        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();
        const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
        expect(await cell.getVisibleText()).to.be(NULL_LABEL);
        expect((await dataGrid.getHeaders()).slice(-2)).to.eql([
          'Numberbytes',
          'machine.ram_range',
        ]);
      });

      it('should work without a FROM statement', async function () {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        const testQuery = `ROW a = 1, b = "two", c = null`;

        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();

        await discover.dragFieldToTable('a');
        const cell = await dataGrid.getCellElementExcludingControlColumns(0, 0);
        expect(await cell.getVisibleText()).to.be('1');
      });

      it('should allow brushing time series', async () => {
        await timePicker.setDefaultAbsoluteRange();
        await discover.waitUntilTabIsLoaded();
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        const testQuery = `from logstash-* | limit 100`;

        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();

        const initialTimeConfig = await timePicker.getTimeConfigAsAbsoluteTimes();
        expect(initialTimeConfig.start).to.equal(timePicker.defaultStartTime);
        expect(initialTimeConfig.end).to.equal(timePicker.defaultEndTime);

        const renderingCount = await elasticChart.getVisualizationRenderingCount();
        await discover.brushHistogram();
        await discover.waitUntilTabIsLoaded();
        // no filter pill created for time brush
        expect(await filterBar.getFilterCount()).to.be(0);
        // chart and time picker updated
        await elasticChart.waitForRenderingCount(renderingCount + 1);
        const newDurationHours = await timePicker.getTimeDurationInHours();
        expect(Math.round(newDurationHours)).to.be(18);
      });
    });

    describe('resource browser', () => {
      it('returns focus to the editor when the data source picker is closed via Escape', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();

        await monacoEditor.setCodeEditorValue('from logstash-*');

        await retry.try(async () => {
          const badge = await find.byCssSelector('.esqlSourcesBadge');
          await badge.click();
          await testSubjects.existOrFail('esqlDataSourceBrowser');
        });

        await browser.pressKeys(browser.keys.ESCAPE);

        await retry.waitFor('data source picker to close', async () => {
          return !(await testSubjects.exists('esqlDataSourceBrowser'));
        });

        const isEditorFocused = await browser.execute(() => {
          const textarea = document.querySelector('[data-test-subj="ESQLEditor"] textarea');
          return document.activeElement === textarea;
        });
        expect(isEditorFocused).to.be(true);
      });
    });

    describe('errors', () => {
      it('should show error messages for syntax errors in query', async function () {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        const brokenQueries = [
          'from logstash-* | limit 10*',
          'from logstash-* | limit A',
          'from logstash-* | where a*',
          'limit 10',
        ];
        for (const testQuery of brokenQueries) {
          await monacoEditor.setCodeEditorValue(testQuery);
          await testSubjects.click('querySubmitButton');
          await discover.waitUntilTabIsLoaded();
          // error in fetching documents because of the invalid query
          await discover.showsErrorCallout();
          const message = await testSubjects.getVisibleText('discoverErrorCalloutMessage');
          expect(message).to.contain(
            "[esql] > Couldn't parse Elasticsearch ES|QL query. Check your query and try again."
          );
          expect(message).to.not.contain('undefined');
          if (message.includes('line')) {
            expect((await monacoEditor.getCurrentMarkers('kibanaCodeEditor')).length).to.eql(1);
          }
        }
      });
    });

    describe('switch modal', () => {
      beforeEach(async () => {
        await common.navigateToApp('discover');
        await discover.waitUntilTabIsLoaded();
        await timePicker.setDefaultAbsoluteRange();
        await discover.waitUntilTabIsLoaded();
      });

      it('should show switch modal when switching to a data view', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        await discover.selectDataViewMode();
        await retry.try(async () => {
          await testSubjects.existOrFail('discover-esql-to-dataview-modal');
        });
      });

      it('should not show switch modal when switching to a data view while a saved search is open', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        const testQuery = 'from logstash-* | limit 100 | drop @timestamp';
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();
        await discover.selectDataViewMode();
        await retry.try(async () => {
          await testSubjects.existOrFail('discover-esql-to-dataview-modal');
        });
        await find.clickByCssSelector(
          '[data-test-subj="discover-esql-to-dataview-modal"] .euiModal__closeIcon'
        );
        await retry.try(async () => {
          await testSubjects.missingOrFail('discover-esql-to-dataview-modal');
        });
        await discover.saveSearch('esql_test');
        await discover.waitUntilTabIsLoaded();
        await discover.selectDataViewMode();
        await discover.waitUntilTabIsLoaded();
        await testSubjects.missingOrFail('discover-esql-to-dataview-modal');
      });

      it('should show switch modal when switching to a data view while a saved search with unsaved changes is open', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        await discover.saveSearch('esql_test2');
        await discover.waitUntilTabIsLoaded();
        const testQuery = 'from logstash-* | limit 100 | drop @timestamp';
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();
        await discover.selectDataViewMode();
        await retry.try(async () => {
          await testSubjects.existOrFail('discover-esql-to-dataview-modal');
        });
      });

      it('should show available data views and search results after switching to classic mode', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();

        await browser.refresh();
        await discover.waitUntilTabIsLoaded();
        await unifiedSearch.switchToDataViewMode();
        await discover.waitUntilTabIsLoaded();
        await discover.assertHitCount('14,004');
        const availableDataViews = await unifiedSearch.getDataViewList(
          'discover-dataView-switch-link'
        );
        ['All logs', 'kibana_sample_data_flights', 'logstash-*'].forEach((item) => {
          expect(availableDataViews).to.contain(item);
        });
        await dataViews.switchToAndValidate('kibana_sample_data_flights');
      });
    });

    describe('inspector', () => {
      beforeEach(async () => {
        await common.navigateToApp('discover');
        await discover.waitUntilTabIsLoaded();
        await timePicker.setDefaultAbsoluteRange();
        await discover.waitUntilTabIsLoaded();
      });

      it('shows Discover and Lens requests in Inspector', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        let retries = 0;
        await retry.try(async () => {
          if (retries > 0) {
            await inspector.close();
            await testSubjects.click('querySubmitButton');
            await discover.waitUntilTabIsLoaded();
          }
          await discover.openInspectorFromTabMenu();
          retries = retries + 1;
          const requestNames = await inspector.getRequestNames();
          expect(requestNames).to.contain('Table');
          expect(requestNames).to.contain('Visualization');
          const request = await inspector.getRequest(1);
          expect(request.command).to.be('POST /_query/async?drop_null_columns=true');
        });
      });

      describe('with slow queries', () => {
        it('should show only one entry in inspector for table/visualization', async function () {
          const state = kbnRison.encode({
            dataSource: { type: 'esql' },
            query: { esql: 'from kibana_sample_data_flights' },
          });
          await common.navigateToActualUrl('discover', `?_a=${state}`, {
            ensureCurrentUrl: false,
          });
          await discover.selectTextBaseLang();
          await discover.waitUntilTabIsLoaded();
          const testQuery = `from logstash-* | limit 10`;
          await monacoEditor.setCodeEditorValue(testQuery);

          await browser.execute(() => {
            window.ELASTIC_ESQL_DELAY_SECONDS = 5;
          });
          await testSubjects.click('querySubmitButton');
          await discover.waitUntilTabIsLoaded();
          // for some reason the chart query is taking a very long time to return (3x the delay)
          // so wait for the chart to be loaded
          await discover.waitForChartLoadingComplete(1);
          await browser.execute(() => {
            window.ELASTIC_ESQL_DELAY_SECONDS = undefined;
          });

          await discover.openInspectorFromTabMenu();
          const requestNames = (await inspector.getRequestNames()).split(',');
          const requestTotalTime = await inspector.getRequestTotalTime();
          expect(requestTotalTime).to.be.greaterThan(5000);
          expect(requestNames.length).to.be(2);
          expect(requestNames).to.contain('Table');
          expect(requestNames).to.contain('Visualization');
        });
      });
    });

    describe('query history', () => {
      beforeEach(async () => {
        await common.navigateToApp('discover');
        await discover.waitUntilTabIsLoaded();
        await timePicker.setDefaultAbsoluteRange();
        await discover.waitUntilTabIsLoaded();
      });

      it('should see my current query in the history', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        await testSubjects.click('ESQLEditor-toggle-query-history-icon');
        const historyItems = await esql.getHistoryItems();
        await esql.isQueryPresentInTable('FROM logstash-*', historyItems);
      });

      it('updating the query should add this to the history', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        const testQuery = 'from logstash-* | limit 100 | drop @timestamp';
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();

        await testSubjects.click('ESQLEditor-toggle-query-history-icon');
        const historyItems = await esql.getHistoryItems();
        await esql.isQueryPresentInTable(
          'from logstash-* | limit 100 | drop @timestamp',
          historyItems
        );
      });

      it('should select a query from the history and submit it', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        await testSubjects.click('ESQLEditor-toggle-query-history-icon');
        // click a history item
        await esql.clickHistoryItem(1);

        const historyItems = await esql.getHistoryItems();
        await esql.isQueryPresentInTable(
          'from logstash-* | limit 100 | drop @timestamp',
          historyItems
        );
      });

      it('should add a failed query to the history', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        const testQuery = 'from logstash-* | limit 100 | woof and meow';
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();

        await testSubjects.click('ESQLEditor-toggle-query-history-icon');
        const historyItem = await esql.getHistoryItem(0);
        await historyItem.findByTestSubject('ESQLEditor-queryHistory-error');
      });
    });

    describe('sorting', () => {
      beforeEach(async () => {
        await common.navigateToApp('discover');
        await discover.waitUntilTabIsLoaded();
        await timePicker.setDefaultAbsoluteRange();
        await discover.waitUntilTabIsLoaded();
      });

      it('should sort correctly', async () => {
        const savedSearchName = 'testSorting';

        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();

        const testQuery = 'from logstash-* | sort @timestamp | limit 100';
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        await unifiedFieldList.clickFieldListItemAdd('bytes');

        await discover.waitUntilTabIsLoaded();

        await retry.waitFor('first cell contains an initial value', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
          const text = await cell.getVisibleText();
          return text === '1,623';
        });

        expect(await testSubjects.getVisibleText('dataGridColumnSortingButton')).to.be(
          'Sort fields'
        );

        await dataGrid.clickDocSortDesc('bytes', 'Sort High-Low');

        await discover.waitUntilTabIsLoaded();

        await retry.waitFor('first cell contains the highest value', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
          const text = await cell.getVisibleText();
          return text === '17,966';
        });

        expect(await testSubjects.getVisibleText('dataGridColumnSortingButton')).to.be(
          'Sort fields\n1'
        );

        await discover.saveSearch(savedSearchName);

        await discover.waitUntilTabIsLoaded();

        await retry.waitFor('first cell contains the same highest value', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
          const text = await cell.getVisibleText();
          return text === '17,966';
        });

        await browser.refresh();

        await discover.waitUntilTabIsLoaded();

        await retry.waitFor('first cell contains the same highest value after reload', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
          const text = await cell.getVisibleText();
          return text === '17,966';
        });

        await discover.clickNewSearchButton();

        await discover.waitUntilTabIsLoaded();

        await discover.loadSavedSearch(savedSearchName);

        await discover.waitUntilTabIsLoaded();

        await retry.waitFor(
          'first cell contains the same highest value after reopening',
          async () => {
            const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
            const text = await cell.getVisibleText();
            return text === '17,966';
          }
        );

        await dataGrid.clickDocSortDesc('bytes', 'Sort Low-High');

        await discover.waitUntilTabIsLoaded();

        await retry.waitFor('first cell contains the lowest value', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
          const text = await cell.getVisibleText();
          return text === '0';
        });

        expect(await testSubjects.getVisibleText('dataGridColumnSortingButton')).to.be(
          'Sort fields\n1'
        );

        await unifiedFieldList.clickFieldListItemAdd('extension');

        await discover.waitUntilTabIsLoaded();

        await dataGrid.clickDocSortDesc('extension', 'Sort A-Z');

        await retry.waitFor('first cell contains the lowest value for extension', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 2);
          const text = await cell.getVisibleText();
          return text === 'css';
        });

        expect(await testSubjects.getVisibleText('dataGridColumnSortingButton')).to.be(
          'Sort fields\n2'
        );

        await browser.refresh();

        await discover.waitUntilTabIsLoaded();

        await retry.waitFor('first cell contains the same lowest value after reload', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
          const text = await cell.getVisibleText();
          return text === '0';
        });

        await retry.waitFor(
          'first cell contains the same lowest value for extension after reload',
          async () => {
            const cell = await dataGrid.getCellElementExcludingControlColumns(0, 2);
            const text = await cell.getVisibleText();
            return text === 'css';
          }
        );

        await discover.saveSearch(savedSearchName);
        await discover.waitUntilTabIsLoaded();

        await common.navigateToApp('dashboard');
        await dashboard.clickNewDashboard();
        await timePicker.setDefaultAbsoluteRange();
        await dashboardAddPanel.clickAddFromLibrary();
        await dashboardAddPanel.addSavedSearch(savedSearchName);
        await header.waitUntilLoadingHasFinished();

        await retry.waitFor(
          'first cell contains the same lowest value as dashboard panel',
          async () => {
            const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
            const text = await cell.getVisibleText();
            return text === '0';
          }
        );

        await retry.waitFor(
          'first cell contains the lowest value for extension as dashboard panel',
          async () => {
            const cell = await dataGrid.getCellElementExcludingControlColumns(0, 2);
            const text = await cell.getVisibleText();
            return text === 'css';
          }
        );

        expect(await testSubjects.getVisibleText('dataGridColumnSortingButton')).to.be(
          'Sort fields\n2'
        );
      });

      it('should sort on custom vars too', async () => {
        const savedSearchName = 'testSortingForCustomVars';

        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();

        const testQuery =
          'from logstash-* | sort @timestamp | limit 100 | keep bytes | eval var0 = abs(bytes) + 1';
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();

        await retry.waitFor('first cell contains an initial value', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
          const text = await cell.getVisibleText();
          return text === '1,624';
        });

        expect(await testSubjects.getVisibleText('dataGridColumnSortingButton')).to.be(
          'Sort fields'
        );

        await dataGrid.clickDocSortDesc('var0', 'Sort High-Low');

        await discover.waitUntilTabIsLoaded();

        await retry.waitFor('first cell contains the highest value', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
          const text = await cell.getVisibleText();
          return text === '17,967';
        });

        expect(await testSubjects.getVisibleText('dataGridColumnSortingButton')).to.be(
          'Sort fields\n1'
        );

        await discover.saveSearch(savedSearchName);

        await discover.waitUntilTabIsLoaded();

        await retry.waitFor('first cell contains the same highest value', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
          const text = await cell.getVisibleText();
          return text === '17,967';
        });

        await browser.refresh();

        await discover.waitUntilTabIsLoaded();

        await retry.waitFor('first cell contains the same highest value after reload', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
          const text = await cell.getVisibleText();
          return text === '17,967';
        });

        await discover.clickNewSearchButton();

        await discover.waitUntilTabIsLoaded();

        await discover.loadSavedSearch(savedSearchName);

        await discover.waitUntilTabIsLoaded();

        await retry.waitFor(
          'first cell contains the same highest value after reopening',
          async () => {
            const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
            const text = await cell.getVisibleText();
            return text === '17,967';
          }
        );

        await dataGrid.clickDocSortDesc('var0', 'Sort Low-High');

        await discover.waitUntilTabIsLoaded();

        await retry.waitFor('first cell contains the lowest value', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
          const text = await cell.getVisibleText();
          return text === '1';
        });

        expect(await testSubjects.getVisibleText('dataGridColumnSortingButton')).to.be(
          'Sort fields\n1'
        );
      });
    });

    describe('filtering by clicking on the table in Discover', () => {
      beforeEach(async () => {
        await common.navigateToApp('discover');
        await discover.waitUntilTabIsLoaded();
        await timePicker.setDefaultAbsoluteRange();
        await discover.waitUntilTabIsLoaded();
      });

      it('should append a where clause by clicking the table', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        const testQuery = `from logstash-* | sort @timestamp desc | limit 10000 | stats countB = count(bytes) by geo.dest | sort countB`;
        await monacoEditor.setCodeEditorValue(testQuery);

        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        await dataGrid.clickCellFilterForButtonExcludingControlColumns(0, 1);
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        const editorValue = await monacoEditor.getCodeEditorValue();
        expect(editorValue).to.eql(
          `from logstash-* | sort @timestamp desc | limit 10000 | stats countB = count(bytes) by geo.dest | sort countB\n| WHERE \`geo.dest\` == "BT"`
        );

        // negate
        await dataGrid.clickCellFilterOutButtonExcludingControlColumns(0, 1);
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        const newValue = await monacoEditor.getCodeEditorValue();
        expect(newValue).to.eql(
          `from logstash-* | sort @timestamp desc | limit 10000 | stats countB = count(bytes) by geo.dest | sort countB\n| WHERE \`geo.dest\`!= "BT"`
        );
      });

      it('should append an end in existing where clause by clicking the table', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        const testQuery = `from logstash-* | sort @timestamp desc | limit 10000 | stats countB = count(bytes) by geo.dest | sort countB | where countB > 0`;
        await monacoEditor.setCodeEditorValue(testQuery);

        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        await dataGrid.clickCellFilterForButtonExcludingControlColumns(0, 1);
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        const editorValue = await monacoEditor.getCodeEditorValue();
        expect(editorValue).to.eql(
          `from logstash-* | sort @timestamp desc | limit 10000 | stats countB = count(bytes) by geo.dest | sort countB | where countB > 0\nAND \`geo.dest\` == "BT"`
        );
      });

      it('should append a where clause by clicking the table without changing the chart type', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        const testQuery = `from logstash-* | sort @timestamp desc | limit 10000 | stats countB = count(bytes) by geo.dest | sort countB`;
        await monacoEditor.setCodeEditorValue(testQuery);

        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        // change the type to line
        await testSubjects.click('unifiedHistogramEditFlyoutVisualization');
        await header.waitUntilLoadingHasFinished();
        await testSubjects.click('lnsChartSwitchPopover');
        await testSubjects.click('lnsChartSwitchPopover_line');
        await header.waitUntilLoadingHasFinished();
        await testSubjects.click('applyFlyoutButton');

        await dataGrid.clickCellFilterForButtonExcludingControlColumns(0, 1);
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        const editorValue = await monacoEditor.getCodeEditorValue();
        expect(editorValue).to.eql(
          `from logstash-* | sort @timestamp desc | limit 10000 | stats countB = count(bytes) by geo.dest | sort countB\n| WHERE \`geo.dest\` == "BT"`
        );

        // check that the type is still line
        await testSubjects.click('unifiedHistogramEditFlyoutVisualization');
        await header.waitUntilLoadingHasFinished();
        const chartSwitcher = await testSubjects.find('lnsChartSwitchPopover');
        const type = await chartSwitcher.getVisibleText();
        expect(type).to.be('Line');
      });

      it('should append a where clause by clicking the table without changing the chart type nor the visualization state', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        const testQuery = `from logstash-* | sort @timestamp desc | limit 10000 | stats countB = count(bytes) by geo.dest | sort countB`;
        await monacoEditor.setCodeEditorValue(testQuery);

        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        // change the type to line
        await testSubjects.click('unifiedHistogramEditFlyoutVisualization');
        await header.waitUntilLoadingHasFinished();
        await testSubjects.click('lnsChartSwitchPopover');
        await testSubjects.click('lnsChartSwitchPopover_line');

        // change the color to red
        await testSubjects.click('lnsXY_yDimensionPanel');
        const colorPickerInput = await testSubjects.find('~indexPattern-dimension-colorPicker');
        await colorPickerInput.clearValueWithKeyboard();
        await colorPickerInput.type('#ff0000');
        await common.sleep(1000); // give time for debounced components to rerender

        await header.waitUntilLoadingHasFinished();
        await testSubjects.click('lns-indexPattern-dimensionContainerClose');
        await testSubjects.click('applyFlyoutButton');

        await dataGrid.clickCellFilterForButtonExcludingControlColumns(0, 1);
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        const editorValue = await monacoEditor.getCodeEditorValue();
        expect(editorValue).to.eql(
          `from logstash-* | sort @timestamp desc | limit 10000 | stats countB = count(bytes) by geo.dest | sort countB\n| WHERE \`geo.dest\` == "BT"`
        );

        // check that the type is still line
        await testSubjects.click('unifiedHistogramEditFlyoutVisualization');
        await header.waitUntilLoadingHasFinished();
        const chartSwitcher = await testSubjects.find('lnsChartSwitchPopover');
        const type = await chartSwitcher.getVisibleText();
        expect(type).to.be('Line');

        // check that the color is still red
        await testSubjects.click('lnsXY_yDimensionPanel');
        const colorPickerInputAfterFilter = await testSubjects.find(
          '~indexPattern-dimension-colorPicker'
        );
        expect(await colorPickerInputAfterFilter.getAttribute('value')).to.be('#FF0000');
      });
    });

    describe('filtering by clicking on the table in Dashboards', () => {
      beforeEach(async () => {
        await common.navigateToApp('discover');
        await discover.waitUntilTabIsLoaded();
        await timePicker.setDefaultAbsoluteRange();
        await discover.waitUntilTabIsLoaded();
      });

      it('should append a filter badge by clicking the table', async () => {
        const savedSearchName = 'esql filter from table';
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();
        const testQuery = `from logstash-* | sort @timestamp desc | limit 10000 | stats countB = count(bytes) by geo.dest | sort countB`;
        await monacoEditor.setCodeEditorValue(testQuery);

        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        await discover.saveSearch(savedSearchName);

        await discover.waitUntilTabIsLoaded();

        // Add to dashboard
        await common.navigateToApp('dashboard');
        await dashboard.clickNewDashboard();

        await timePicker.setDefaultAbsoluteRange();
        await dashboardAddPanel.clickAddFromLibrary();
        await dashboardAddPanel.addSavedSearch(savedSearchName);
        await header.waitUntilLoadingHasFinished();

        const gridCellGroupBy = '[role="gridcell"]:nth-child(4)';
        const gridCellAggValue = '[role="gridcell"]:nth-child(3)';
        const filterForButton = '[data-test-subj="filterForButton"]';

        // This should add a filter badge
        await retry.try(async () => {
          await find.clickByCssSelector(gridCellGroupBy);
          await find.clickByCssSelector(filterForButton);
          await header.waitUntilLoadingHasFinished();
          const filterCount = await filterBar.getFilterCount();
          expect(filterCount).to.equal(1);
        });

        // This shound not add another filter badge
        await header.waitUntilLoadingHasFinished();
        await retry.try(async () => {
          await find.clickByCssSelector(gridCellAggValue);
          const filterButtonExists = await find.existsByCssSelector(filterForButton);
          expect(filterButtonExists).to.be(false);
        });
      });
    });

    describe('histogram breakdown', () => {
      before(async () => {
        await common.navigateToApp('discover');
        await discover.waitUntilTabIsLoaded();
        await timePicker.setDefaultAbsoluteRange();
        await discover.waitUntilTabIsLoaded();
      });

      it('should choose breakdown field', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();

        const testQuery = 'from logstash-*';
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();

        await discover.chooseBreakdownField('extension');
        await discover.waitUntilTabIsLoaded();
        const list = await discover.getHistogramLegendList();
        expect(list).to.eql(['css', 'gif', 'jpg', 'php', 'png']);
      });

      it('should add filter using histogram legend values', async () => {
        await discover.clickLegendFilter('png', '+');
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        const editorValue = await monacoEditor.getCodeEditorValue();
        expect(editorValue).to.eql(`from logstash-*\n| WHERE \`extension\` == "png"`);
      });

      it('should save breakdown field in saved search', async () => {
        // revert the filter
        const testQuery = 'from logstash-*';
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();

        await discover.saveSearch('esql view with breakdown');
        await discover.waitUntilTabIsLoaded();

        await discover.clickNewSearchButton();
        await header.waitUntilLoadingHasFinished();
        const prevList = await discover.getHistogramLegendList();
        expect(prevList).to.eql([]);

        await discover.loadSavedSearch('esql view with breakdown');
        await discover.waitUntilTabIsLoaded();
        const list = await discover.getHistogramLegendList();
        expect(list).to.eql(['css', 'gif', 'jpg', 'php', 'png']);
      });

      it('should choose breakdown field when selected from field stats', async () => {
        await discover.selectTextBaseLang();
        await discover.waitUntilTabIsLoaded();

        const testQuery = 'from logstash-*';
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();

        await unifiedFieldList.clickFieldListAddBreakdownField('extension');
        await discover.waitUntilTabIsLoaded();
        const list = await discover.getHistogramLegendList();
        expect(list).to.eql(['css', 'gif', 'jpg', 'php', 'png']);
      });
    });
  });
}
