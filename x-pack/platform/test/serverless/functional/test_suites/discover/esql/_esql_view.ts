/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/esql_2/_esql_view.ts

import expect from '@kbn/expect';
import { NULL_LABEL } from '@kbn/field-formats-common';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const log = getService('log');
  const dataGrid = getService('dataGrid');
  const testSubjects = getService('testSubjects');
  const monacoEditor = getService('monacoEditor');
  const inspector = getService('inspector');
  const retry = getService('retry');
  const browser = getService('browser');
  const find = getService('find');
  const esql = getService('esql');
  const dashboardAddPanel = getService('dashboardAddPanel');
  const dataViews = getService('dataViews');
  const PageObjects = getPageObjects([
    'appMenu',
    'svlCommonPage',
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
  };

  describe('discover esql view', function () {
    before(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
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
      await PageObjects.timePicker.setDefaultAbsoluteRangeViaUiSettings();
      await PageObjects.svlCommonPage.loginAsAdmin();
      await PageObjects.common.navigateToApp('discover');
      await PageObjects.discover.waitUntilTabIsLoaded();
    });

    afterEach(async () => {
      await PageObjects.discover.resetQueryMode();
    });

    after(async () => {
      await PageObjects.timePicker.resetDefaultAbsoluteRangeViaUiSettings();
    });

    describe('ES|QL in Discover', () => {
      beforeEach(async () => {
        await PageObjects.timePicker.setDefaultAbsoluteRangeViaUiSettings();
        await PageObjects.common.navigateToApp('discover');
        await PageObjects.discover.waitUntilTabIsLoaded();
      });

      it('should render esql view correctly', async function () {
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();

        await testSubjects.existOrFail('showQueryBarMenu');
        expect(await PageObjects.timePicker.timePickerExists()).to.be(true);
        await testSubjects.existOrFail('addFilter');
        await testSubjects.existOrFail('dscViewModeDocumentButton');
        await testSubjects.existOrFail('unifiedHistogramChart');
        await testSubjects.existOrFail('discoverQueryHits');
        await testSubjects.click('app-menu-overflow-button');
        await testSubjects.existOrFail('discoverAlertsButton');
        await testSubjects.click('app-menu-overflow-button');
        await PageObjects.appMenu.existOrFail('shareTopNavButton');
        await testSubjects.existOrFail('docTableExpandToggleColumn');
        await testSubjects.existOrFail('dataGridColumnSortingButton');
        await testSubjects.existOrFail('fieldListFiltersFieldSearch');
        await testSubjects.existOrFail('fieldListFiltersFieldTypeFilterToggle');
        await testSubjects.click('field-@message-showDetails');
        await testSubjects.existOrFail('discoverFieldListPanelEdit-@message');

        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.discover.waitUntilTabIsLoaded();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();

        await testSubjects.existOrFail('fieldListFiltersFieldSearch');
        await testSubjects.existOrFail('ESQLEditor');
        expect(await PageObjects.timePicker.timePickerExists()).to.be(true);

        await testSubjects.missingOrFail('showQueryBarMenu');
        await testSubjects.missingOrFail('addFilter');
        await testSubjects.missingOrFail('dscViewModeToggle');
        await testSubjects.missingOrFail('dscViewModeDocumentButton');
        // when Lens suggests a table, we render an ESQL based histogram
        await testSubjects.existOrFail('unifiedHistogramChart');
        await testSubjects.existOrFail('discoverQueryHits');
        await testSubjects.click('app-menu-overflow-button');
        await testSubjects.existOrFail('discoverAlertsButton');
        await testSubjects.click('app-menu-overflow-button');
        await PageObjects.appMenu.existOrFail('shareTopNavButton');
        await testSubjects.missingOrFail('dataGridColumnSortingButton');
        await testSubjects.existOrFail('docTableExpandToggleColumn');
        await testSubjects.existOrFail('fieldListFiltersFieldTypeFilterToggle');
        await testSubjects.click('field-@message-showDetails');
        await testSubjects.missingOrFail('discoverFieldListPanelEditItem');
      });

      it('should not render the histogram for indices with no @timestamp field', async function () {
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.discover.waitUntilTabIsLoaded();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();

        const testQuery = `from kibana_sample_data_flights | limit 10`;

        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await PageObjects.discover.waitUntilTabIsLoaded();

        expect(await testSubjects.exists('ESQLEditor')).to.be(true);
        // I am not rendering the histogram for indices with no @timestamp field
        expect(await testSubjects.exists('unifiedHistogramChart')).to.be(false);
      });

      it('should render the histogram for indices with no @timestamp field when the ?_tstart, ?_tend params are in the query', async function () {
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.discover.waitUntilTabIsLoaded();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();

        const testQuery = `from kibana_sample_data_flights | limit 10 | where timestamp >= ?_tstart and timestamp <= ?_tend`;

        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await PageObjects.discover.waitUntilTabIsLoaded();

        const fromTime = 'Apr 10, 2018 @ 00:00:00.000';
        const toTime = 'Nov 15, 2018 @ 00:00:00.000';
        await PageObjects.timePicker.setAbsoluteRange(fromTime, toTime);
        await PageObjects.discover.waitUntilTabIsLoaded();

        expect(await testSubjects.exists('ESQLEditor')).to.be(true);
        expect(await testSubjects.exists('unifiedHistogramChart')).to.be(true);
      });

      it('should perform test query correctly', async function () {
        await PageObjects.timePicker.setDefaultAbsoluteRange();
        await PageObjects.discover.waitUntilTabIsLoaded();
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.discover.waitUntilTabIsLoaded();
        const testQuery = `from logstash-* | sort @timestamp | limit 10 | stats countB = count(bytes) by geo.dest | sort countB`;

        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await PageObjects.discover.waitUntilTabIsLoaded();
        // here Lens suggests a XY so it is rendered
        await testSubjects.existOrFail('unifiedHistogramChart');
        await testSubjects.existOrFail('xyVisChart');
        const cell = await dataGrid.getCellElementExcludingControlColumns(0, 0);
        expect(await cell.getVisibleText()).to.be('1');
      });

      it('should render when switching to a time range with no data, then back to a time range with data', async () => {
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.discover.waitUntilTabIsLoaded();

        const testQuery = `from logstash-* | sort @timestamp | limit 10 | stats countB = count(bytes) by geo.dest | sort countB`;
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await PageObjects.discover.waitUntilTabIsLoaded();
        let cell = await dataGrid.getCellElementExcludingControlColumns(0, 0);
        expect(await cell.getVisibleText()).to.be('1');
        await PageObjects.timePicker.setAbsoluteRange(
          'Sep 19, 2015 @ 06:31:44.000',
          'Sep 19, 2015 @ 06:31:44.000'
        );
        await PageObjects.discover.waitUntilTabIsLoaded();
        await testSubjects.existOrFail('discoverNoResults');
        await PageObjects.timePicker.setDefaultAbsoluteRange();
        await PageObjects.discover.waitUntilTabIsLoaded();
        cell = await dataGrid.getCellElementExcludingControlColumns(0, 0);
        expect(await cell.getVisibleText()).to.be('1');
      });

      it('should query an index pattern that doesnt translate to a dataview correctly', async function () {
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.discover.waitUntilTabIsLoaded();

        const testQuery = `from logstash* | sort @timestamp | limit 10 | stats countB = count(bytes) by geo.dest | sort countB`;
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await PageObjects.discover.waitUntilTabIsLoaded();

        const cell = await dataGrid.getCellElementExcludingControlColumns(0, 0);
        expect(await cell.getVisibleText()).to.be('1');
      });

      it('should render correctly if there are empty fields', async function () {
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.discover.waitUntilTabIsLoaded();
        const testQuery = `from logstash-* | limit 10 | keep machine.ram_range, bytes`;

        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await PageObjects.discover.waitUntilTabIsLoaded();
        const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
        expect(await cell.getVisibleText()).to.be(NULL_LABEL);
        expect((await dataGrid.getHeaders()).slice(-2)).to.eql([
          'Numberbytes',
          'machine.ram_range',
        ]);
      });

      it('should work without a FROM statement', async function () {
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.discover.waitUntilTabIsLoaded();
        const testQuery = `ROW a = 1, b = "two", c = null`;

        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await PageObjects.discover.waitUntilTabIsLoaded();

        await PageObjects.discover.dragFieldToTable('a');
        const cell = await dataGrid.getCellElementExcludingControlColumns(0, 0);
        expect(await cell.getVisibleText()).to.be('1');
      });
    });

    describe('errors', () => {
      it('should show error messages for syntax errors in query', async function () {
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.discover.waitUntilTabIsLoaded();

        const brokenQueries = [
          'from logstash-* | limit 10*',
          'from logstash-* | limit A',
          'from logstash-* | where a*',
          'limit 10',
        ];
        for (const testQuery of brokenQueries) {
          await monacoEditor.setCodeEditorValue(testQuery);
          await testSubjects.click('querySubmitButton');
          await PageObjects.discover.waitUntilTabIsLoaded();
          // error in fetching documents because of the invalid query
          await PageObjects.discover.showsErrorCallout();
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
        await PageObjects.common.navigateToApp('discover');
        await PageObjects.discover.waitUntilTabIsLoaded();
        await PageObjects.timePicker.setDefaultAbsoluteRange();
        await PageObjects.discover.waitUntilTabIsLoaded();
      });

      it('should show switch modal when switching to a data view', async () => {
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await PageObjects.discover.selectDataViewMode();
        await retry.try(async () => {
          await testSubjects.existOrFail('discover-esql-to-dataview-modal');
        });
      });

      it('should not show switch modal when switching to a data view while a saved search is open', async () => {
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        const testQuery = 'from logstash-* | limit 100 | drop @timestamp';
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await PageObjects.discover.selectDataViewMode();
        await retry.try(async () => {
          await testSubjects.existOrFail('discover-esql-to-dataview-modal');
        });
        await find.clickByCssSelector(
          '[data-test-subj="discover-esql-to-dataview-modal"] .euiModal__closeIcon'
        );
        await retry.try(async () => {
          await testSubjects.missingOrFail('discover-esql-to-dataview-modal');
        });
        await PageObjects.discover.saveSearch('esql_test');
        await PageObjects.discover.selectDataViewMode();
        await testSubjects.missingOrFail('discover-esql-to-dataview-modal');
      });

      it('should show switch modal when switching to a data view while a saved search with unsaved changes is open', async () => {
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await PageObjects.discover.saveSearch('esql_test2');
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        const testQuery = 'from logstash-* | limit 100 | drop @timestamp';
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await PageObjects.discover.selectDataViewMode();
        await retry.try(async () => {
          await testSubjects.existOrFail('discover-esql-to-dataview-modal');
        });
      });

      it('should show available data views and search results after switching to classic mode', async () => {
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();

        await browser.refresh();
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await PageObjects.unifiedSearch.switchToDataViewMode();
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await PageObjects.discover.assertHitCount('14,004');
        const availableDataViews = await PageObjects.unifiedSearch.getDataViewList(
          'discover-dataView-switch-link'
        );
        if (await testSubjects.exists('~nav-item-observability_project_nav')) {
          expect(availableDataViews).to.eql([
            'All logs',
            'kibana_sample_data_flights',
            'logstash-*',
          ]);
        } else {
          ['kibana_sample_data_flights', 'logstash-*'].forEach((item) => {
            expect(availableDataViews).to.contain(item);
          });
        }
        await dataViews.switchToAndValidate('kibana_sample_data_flights');
      });
    });

    describe('inspector', () => {
      beforeEach(async () => {
        await PageObjects.common.navigateToApp('discover');
        await PageObjects.discover.waitUntilTabIsLoaded();
        await PageObjects.timePicker.setDefaultAbsoluteRange();
        await PageObjects.discover.waitUntilTabIsLoaded();
      });

      it('shows Discover and Lens requests in Inspector', async () => {
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.discover.waitUntilTabIsLoaded();
        let retries = 0;
        await retry.try(async () => {
          if (retries > 0) {
            await inspector.close();
            await testSubjects.click('querySubmitButton');
            await PageObjects.discover.waitUntilTabIsLoaded();
          }
          await PageObjects.discover.openInspectorFromTabMenu();
          retries = retries + 1;
          const requestNames = await inspector.getRequestNames();
          expect(requestNames).to.contain('Table');
          expect(requestNames).to.contain('Visualization');
          const request = await inspector.getRequest(1);
          expect(request.command).to.be('POST /_query/async?drop_null_columns=true');
        });
      });
    });

    describe('query history', () => {
      beforeEach(async () => {
        await PageObjects.common.navigateToApp('discover');
        await PageObjects.discover.waitUntilTabIsLoaded();
        await PageObjects.timePicker.setDefaultAbsoluteRange();
        await PageObjects.discover.waitUntilTabIsLoaded();
      });

      it('should see my current query in the history', async () => {
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.discover.waitUntilTabIsLoaded();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();

        await testSubjects.click('ESQLEditor-toggle-query-history-icon');
        const historyItems = await esql.getHistoryItems();
        await esql.isQueryPresentInTable('FROM logstash-*', historyItems);
      });

      it('updating the query should add this to the history', async () => {
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.discover.waitUntilTabIsLoaded();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();

        const testQuery = 'from logstash-* | limit 100 | drop @timestamp';
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await PageObjects.discover.waitUntilTabIsLoaded();

        await testSubjects.click('ESQLEditor-toggle-query-history-icon');
        const historyItems = await esql.getHistoryItems();
        await esql.isQueryPresentInTable(
          'from logstash-* | limit 100 | drop @timestamp',
          historyItems
        );
      });

      it('should select a query from the history and submit it', async () => {
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.discover.waitUntilTabIsLoaded();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();

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
        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.discover.waitUntilTabIsLoaded();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();

        const testQuery = 'from logstash-* | limit 100 | woof and meow';
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await PageObjects.discover.waitUntilTabIsLoaded();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();
        await testSubjects.click('ESQLEditor-toggle-query-history-icon');
        await testSubjects.click('ESQLEditor-history-starred-queries-run-button');
        const historyItem = await esql.getHistoryItem(0);
        await historyItem.findByTestSubject('ESQLEditor-queryHistory-error');
      });
    });

    describe('sorting', () => {
      it('should sort correctly', async () => {
        const savedSearchName = 'testSorting';

        await PageObjects.discover.selectTextBaseLang();
        await PageObjects.discover.waitUntilTabIsLoaded();

        const testQuery = 'from logstash-* | sort @timestamp | limit 100';
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await PageObjects.discover.waitUntilTabIsLoaded();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();

        await PageObjects.unifiedFieldList.clickFieldListItemAdd('bytes');
        await PageObjects.discover.waitUntilTabIsLoaded();

        await retry.waitFor('first cell contains an initial value', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
          const text = await cell.getVisibleText();
          return text === '1,623';
        });

        expect(await testSubjects.getVisibleText('dataGridColumnSortingButton')).to.be(
          'Sort fields'
        );

        await dataGrid.clickDocSortDesc('bytes', 'Sort High-Low');

        await PageObjects.discover.waitUntilTabIsLoaded();

        await retry.waitFor('first cell contains the highest value', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
          const text = await cell.getVisibleText();
          return text === '17,966';
        });

        expect(await testSubjects.getVisibleText('dataGridColumnSortingButton')).to.be(
          'Sort fields\n1'
        );

        await PageObjects.discover.saveSearch(savedSearchName);
        await PageObjects.discover.waitUntilTabIsLoaded();

        await retry.waitFor('first cell contains the same highest value', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
          const text = await cell.getVisibleText();
          return text === '17,966';
        });

        await browser.refresh();

        await PageObjects.discover.waitUntilTabIsLoaded();

        await retry.waitFor('first cell contains the same highest value after reload', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
          const text = await cell.getVisibleText();
          return text === '17,966';
        });

        await PageObjects.discover.clickNewSearchButton();

        await PageObjects.discover.waitUntilTabIsLoaded();

        await PageObjects.discover.loadSavedSearch(savedSearchName);

        await PageObjects.discover.waitUntilTabIsLoaded();

        await retry.waitFor(
          'first cell contains the same highest value after reopening',
          async () => {
            const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
            const text = await cell.getVisibleText();
            return text === '17,966';
          }
        );

        await dataGrid.clickDocSortDesc('bytes', 'Sort Low-High');

        await PageObjects.discover.waitUntilTabIsLoaded();

        await retry.waitFor('first cell contains the lowest value', async () => {
          const cell = await dataGrid.getCellElementExcludingControlColumns(0, 1);
          const text = await cell.getVisibleText();
          return text === '0';
        });

        expect(await testSubjects.getVisibleText('dataGridColumnSortingButton')).to.be(
          'Sort fields\n1'
        );

        await PageObjects.unifiedFieldList.clickFieldListItemAdd('extension');

        await PageObjects.discover.waitUntilTabIsLoaded();

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

        await PageObjects.discover.waitUntilTabIsLoaded();

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

        await PageObjects.discover.saveSearch(savedSearchName);
        await PageObjects.discover.waitUntilTabIsLoaded();

        await PageObjects.common.navigateToApp('dashboard');
        await PageObjects.dashboard.clickNewDashboard();
        await PageObjects.timePicker.setDefaultAbsoluteRange();
        await dashboardAddPanel.clickAddFromLibrary();
        await dashboardAddPanel.addSavedSearch(savedSearchName);
        await PageObjects.header.waitUntilLoadingHasFinished();

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
    });
  });
}
