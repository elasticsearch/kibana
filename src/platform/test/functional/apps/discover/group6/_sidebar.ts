/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/discover/group6/_sidebar.ts

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const { common, discover, timePicker, header, unifiedSearch, unifiedFieldList } = getPageObjects([
    'common',
    'discover',
    'timePicker',
    'header',
    'unifiedSearch',
    'unifiedFieldList',
  ]);
  const testSubjects = getService('testSubjects');
  const find = getService('find');
  const browser = getService('browser');
  const monacoEditor = getService('monacoEditor');
  const filterBar = getService('filterBar');
  const fieldEditor = getService('fieldEditor');
  const dataViews = getService('dataViews');
  const queryBar = getService('queryBar');
  const retry = getService('retry');
  const dataGrid = getService('dataGrid');
  const log = getService('log');
  const INITIAL_FIELD_LIST_SUMMARY = '48 available fields. 5 empty fields. 4 meta fields.';

  const expectFieldListDescription = async (expectedNumber: string) => {
    return await retry.try(async () => {
      await discover.waitUntilSearchingHasFinished();
      await unifiedFieldList.waitUntilSidebarHasLoaded();
      const ariaDescription = await unifiedFieldList.getSidebarAriaDescription();
      if (ariaDescription !== expectedNumber) {
        log.warning(
          `Expected Sidebar Aria Description: ${expectedNumber}, got: ${ariaDescription}`
        );
        await queryBar.submitQuery();
      }
      expect(ariaDescription).to.be(expectedNumber);
    });
  };

  describe('discover sidebar', function describeIndexTests() {
    beforeEach(async () => {
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      await kibanaServer.uiSettings.replace({
        defaultIndex: 'logstash-*',
      });
      await timePicker.setDefaultAbsoluteRangeViaUiSettings();
      await common.navigateToApp('discover');
      await discover.waitUntilSearchingHasFinished();
    });

    afterEach(async () => {
      await kibanaServer.importExport.unload(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      await kibanaServer.savedObjects.cleanStandardList();
      await kibanaServer.uiSettings.replace({});
      await unifiedFieldList.cleanSidebarLocalStorage();
    });

    describe('field filtering', function () {
      it('should reveal and hide the filter form when the toggle is clicked', async function () {
        await unifiedFieldList.openSidebarFieldFilter();
        await unifiedFieldList.closeSidebarFieldFilter();
      });

      it('should filter by field type', async function () {
        await header.waitUntilLoadingHasFinished();
        await unifiedFieldList.waitUntilSidebarHasLoaded();
        await unifiedFieldList.openSidebarFieldFilter();

        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);

        await testSubjects.click('typeFilter-keyword');
        // first update
        await expectFieldListDescription('6 available fields. 1 empty field. 3 meta fields.');

        await testSubjects.click('typeFilter-number');

        // second update
        await expectFieldListDescription('10 available fields. 3 empty fields. 4 meta fields.');

        await testSubjects.click('fieldListFiltersFieldTypeFilterClearAll');

        // reset
        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);
      });

      it('should show filters by type in ES|QL view', async function () {
        await unifiedFieldList.waitUntilSidebarHasLoaded();
        await unifiedFieldList.openSidebarFieldFilter();
        let options = await find.allByCssSelector('[data-test-subj*="typeFilter"]');
        expect(options).to.have.length(6);
        await unifiedFieldList.closeSidebarFieldFilter();

        await discover.selectTextBaseLang();

        const testQuery = `from logstash-* | limit 10000`;
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await discover.waitUntilTabIsLoaded();
        await unifiedFieldList.waitUntilSidebarHasLoaded();
        await unifiedFieldList.openSidebarFieldFilter();
        options = await find.allByCssSelector('[data-test-subj*="typeFilter"]');
        expect(options).to.have.length(6);

        await expectFieldListDescription('76 available fields. 6 empty fields.');
        await testSubjects.click('typeFilter-number');
        await expectFieldListDescription('4 available fields. 2 empty fields.');
      });

      it('should show empty fields in ES|QL view', async function () {
        await unifiedFieldList.waitUntilSidebarHasLoaded();
        await discover.selectTextBaseLang();

        const testQuery = `from logstash-* | limit 10 | keep machine.ram_range, bytes `;
        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');
        await header.waitUntilLoadingHasFinished();
        await unifiedFieldList.waitUntilSidebarHasLoaded();
        await unifiedFieldList.openSidebarFieldFilter();
        await expectFieldListDescription('2 selected fields. 1 available field. 1 empty field.');
      });
    });

    describe('search', function () {
      beforeEach(async () => {
        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);
      });

      afterEach(async () => {
        const fieldSearch = await testSubjects.find('clearSearchButton');
        await fieldSearch.click();

        // reset
        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);
      });

      it('should be able to search by string', async function () {
        await unifiedFieldList.findFieldByName('i');

        await expectFieldListDescription('28 available fields. 2 empty fields. 3 meta fields.');
        await unifiedFieldList.findFieldByName('p');
        await expectFieldListDescription('4 available fields. 0 meta fields.');

        expect((await unifiedFieldList.getSidebarSectionFieldNames('available')).join(', ')).to.be(
          'clientip, ip, relatedContent.og:description, relatedContent.twitter:description'
        );
      });

      it('should be able to search by wildcard', async function () {
        await unifiedFieldList.findFieldByName('relatedContent*image');
        await expectFieldListDescription('2 available fields. 0 meta fields.');

        expect((await unifiedFieldList.getSidebarSectionFieldNames('available')).join(', ')).to.be(
          'relatedContent.og:image, relatedContent.twitter:image'
        );
      });

      it('should be able to search with spaces as wildcard', async function () {
        await unifiedFieldList.findFieldByName('relatedContent image');

        await expectFieldListDescription('4 available fields. 0 meta fields.');

        expect((await unifiedFieldList.getSidebarSectionFieldNames('available')).join(', ')).to.be(
          'relatedContent.og:image, relatedContent.og:image:height, relatedContent.og:image:width, relatedContent.twitter:image'
        );
      });

      it('should be able to search with fuzzy search (1 typo)', async function () {
        await unifiedFieldList.findFieldByName('rel4tedContent.art');
        await expectFieldListDescription('4 available fields. 0 meta fields.');

        expect((await unifiedFieldList.getSidebarSectionFieldNames('available')).join(', ')).to.be(
          'relatedContent.article:modified_time, relatedContent.article:published_time, relatedContent.article:section, relatedContent.article:tag'
        );
      });

      it('should ignore empty search', async function () {
        await unifiedFieldList.findFieldByName('   '); // only spaces

        await retry.waitFor('the clear button', async () => {
          return await testSubjects.exists('clearSearchButton');
        });

        // expect no changes in the list
        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);
      });
    });

    describe('field stats', function () {
      it('should work for regular and pinned filters', async () => {
        await header.waitUntilLoadingHasFinished();

        const allTermsResult = 'jpg\n65.0%\ncss\n15.4%\npng\n9.8%\ngif\n6.6%\nphp\n3.2%';
        await unifiedFieldList.clickFieldListItem('extension');
        expect(await testSubjects.getVisibleText('dscFieldStats-topValues')).to.be(allTermsResult);

        await filterBar.addFilter({ field: 'extension', operation: 'is', value: 'jpg' });
        await header.waitUntilLoadingHasFinished();

        const onlyJpgResult = 'jpg\n100%';
        await unifiedFieldList.clickFieldListItem('extension');
        expect(await testSubjects.getVisibleText('dscFieldStats-topValues')).to.be(onlyJpgResult);

        await filterBar.toggleFilterNegated('extension');
        await header.waitUntilLoadingHasFinished();

        const jpgExcludedResult = 'css\n44.1%\npng\n28.0%\ngif\n18.8%\nphp\n9.1%';
        await unifiedFieldList.clickFieldListItem('extension');
        expect(await testSubjects.getVisibleText('dscFieldStats-topValues')).to.be(
          jpgExcludedResult
        );

        await filterBar.toggleFilterPinned('extension');
        await header.waitUntilLoadingHasFinished();

        await unifiedFieldList.clickFieldListItem('extension');
        expect(await testSubjects.getVisibleText('dscFieldStats-topValues')).to.be(
          jpgExcludedResult
        );

        await browser.refresh();

        await unifiedFieldList.clickFieldListItem('extension');
        expect(await testSubjects.getVisibleText('dscFieldStats-topValues')).to.be(
          jpgExcludedResult
        );

        await filterBar.toggleFilterEnabled('extension');
        await header.waitUntilLoadingHasFinished();

        await unifiedFieldList.clickFieldListItem('extension');
        expect(await testSubjects.getVisibleText('dscFieldStats-topValues')).to.be(allTermsResult);
      });
    });

    describe('collapse expand', function () {
      it('should initially be expanded', async function () {
        await testSubjects.existOrFail('discover-sidebar');
        await testSubjects.existOrFail('fieldList');
      });

      it('should collapse when clicked', async function () {
        await discover.closeSidebar();
        await testSubjects.existOrFail('dscShowSidebarButton');
        await testSubjects.missingOrFail('fieldList');
      });

      it('should expand when clicked', async function () {
        await discover.openSidebar();
        await testSubjects.existOrFail('discover-sidebar');
        await testSubjects.existOrFail('fieldList');
      });
    });

    describe('renders field groups', function () {
      it('should show field list groups excluding subfields', async function () {
        await unifiedFieldList.waitUntilSidebarHasLoaded();
        expect(await unifiedFieldList.doesSidebarShowFields()).to.be(true);

        // Initial Available fields
        const expectedInitialAvailableFields =
          '@message, @tags, @timestamp, agent, bytes, clientip, extension, geo.coordinates, geo.dest, geo.src, geo.srcdest, headings, host, index, ip, links, machine.os, machine.ram, machine.ram_range, memory, nestedField.child, phpmemory, referer, relatedContent.article:modified_time, relatedContent.article:published_time, relatedContent.article:section, relatedContent.article:tag, relatedContent.og:description, relatedContent.og:image, relatedContent.og:image:height, relatedContent.og:image:width, relatedContent.og:site_name, relatedContent.og:title, relatedContent.og:type, relatedContent.og:url, relatedContent.twitter:card, relatedContent.twitter:description, relatedContent.twitter:image, relatedContent.twitter:site, relatedContent.twitter:title, relatedContent.url, request, response, spaces, type, url, utc_time, xss';
        let availableFields = await unifiedFieldList.getSidebarSectionFieldNames('available');
        expect(availableFields.length).to.be(48);
        expect(availableFields.join(', ')).to.be(expectedInitialAvailableFields);

        // Available fields after scrolling down
        const metaSectionButton = await find.byCssSelector(
          unifiedFieldList.getSidebarSectionSelector('meta', true)
        );
        await metaSectionButton.scrollIntoViewIfNecessary();

        await retry.waitFor('list to update after scrolling', async () => {
          availableFields = await unifiedFieldList.getSidebarSectionFieldNames('available');
          return availableFields.length === 48;
        });

        expect(availableFields.join(', ')).to.be(`${expectedInitialAvailableFields}`);

        // Expand Meta section
        await unifiedFieldList.toggleSidebarSection('meta');
        expect((await unifiedFieldList.getSidebarSectionFieldNames('meta')).join(', ')).to.be(
          '_id, _ignored, _index, _score'
        );
        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);
      });

      it('should show selected and popular fields', async function () {
        await unifiedFieldList.clickFieldListItemAdd('extension');
        await discover.waitUntilSearchingHasFinished();
        await unifiedFieldList.clickFieldListItemAdd('@message');
        await discover.waitUntilSearchingHasFinished();

        expect((await unifiedFieldList.getSidebarSectionFieldNames('selected')).join(', ')).to.be(
          'extension, @message'
        );

        const availableFields = await unifiedFieldList.getSidebarSectionFieldNames('available');
        expect(availableFields.includes('extension')).to.be(true);
        expect(availableFields.includes('@message')).to.be(true);

        await expectFieldListDescription(
          '2 selected fields. 2 popular fields. 48 available fields. 5 empty fields. 4 meta fields.'
        );

        await unifiedFieldList.clickFieldListItemRemove('@message');
        await discover.waitUntilSearchingHasFinished();

        await unifiedFieldList.clickFieldListItemAdd('_id');
        await discover.waitUntilSearchingHasFinished();
        await unifiedFieldList.clickFieldListItemAdd('@message');
        await discover.waitUntilSearchingHasFinished();

        expect((await unifiedFieldList.getSidebarSectionFieldNames('selected')).join(', ')).to.be(
          'extension, _id, @message'
        );

        expect((await unifiedFieldList.getSidebarSectionFieldNames('popular')).join(', ')).to.be(
          '@message, _id, extension'
        );

        await expectFieldListDescription(
          '3 selected fields. 3 popular fields. 48 available fields. 5 empty fields. 4 meta fields.'
        );

        // verify popular fields were persisted
        await browser.refresh();
        await expectFieldListDescription(
          '3 selected fields. 3 popular fields. 48 available fields. 5 empty fields. 4 meta fields.'
        );

        await unifiedFieldList.clickFieldListItemRemove('@message');
        await discover.waitUntilSearchingHasFinished();
        await unifiedFieldList.clickFieldListItemRemove('extension');
        await discover.waitUntilSearchingHasFinished();
        await discover.addRuntimeField('test', `emit('test')`, undefined, 30);
        await discover.waitUntilSearchingHasFinished();

        expect((await unifiedFieldList.getSidebarSectionFieldNames('popular')).join(', ')).to.be(
          'test, @message, extension, _id'
        );

        await expectFieldListDescription(
          '1 selected field. 4 popular fields. 49 available fields. 5 empty fields. 4 meta fields.'
        );

        await unifiedFieldList.clickFieldListItemAdd('bytes');
        await discover.waitUntilSearchingHasFinished();

        expect((await unifiedFieldList.getSidebarSectionFieldNames('popular')).join(', ')).to.be(
          'test, @message, extension, _id, bytes'
        );

        await expectFieldListDescription(
          '2 selected fields. 5 popular fields. 49 available fields. 5 empty fields. 4 meta fields.'
        );
      });

      it('should show selected and available fields in ES|QL mode', async function () {
        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);

        await discover.selectTextBaseLang();
        await monacoEditor.setCodeEditorValue('from logstash-* | limit 10000');
        await testSubjects.click('querySubmitButton');
        await expectFieldListDescription('76 available fields. 6 empty fields.');

        await unifiedFieldList.clickFieldListItemRemove('extension');

        await expectFieldListDescription('76 available fields. 6 empty fields.');

        const testQuery = `from logstash-* | limit 10 | stats countB = count(bytes) by geo.dest | sort countB`;

        await monacoEditor.setCodeEditorValue(testQuery);
        await testSubjects.click('querySubmitButton');

        await expectFieldListDescription('2 selected fields. 2 available fields.');
        expect((await unifiedFieldList.getSidebarSectionFieldNames('selected')).join(', ')).to.be(
          'countB, geo.dest'
        );

        await unifiedSearch.switchToDataViewMode();

        await unifiedSearch.switchDataView('discover-dataView-switch-link', 'logstash-*');

        await expectFieldListDescription('48 available fields. 5 empty fields. 4 meta fields.');
      });

      it('should work correctly for a data view for a missing index', async function () {
        // but we are skipping importing the index itself
        await kibanaServer.importExport.load(
          'src/platform/test/functional/fixtures/kbn_archiver/index_pattern_without_timefield'
        );
        await browser.refresh();
        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);

        await dataViews.switchToAndValidate('with-timefield');

        await expectFieldListDescription('0 available fields. 0 meta fields.');
        await testSubjects.missingOrFail(
          `${unifiedFieldList.getSidebarSectionSelector('available')}-fetchWarning`
        );
        await testSubjects.existOrFail(
          `${unifiedFieldList.getSidebarSectionSelector('available')}NoFieldsCallout-noFieldsExist`
        );

        await dataViews.switchToAndValidate('logstash-*');

        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);
        await kibanaServer.importExport.unload(
          'src/platform/test/functional/fixtures/kbn_archiver/index_pattern_without_timefield'
        );
      });

      it('should work correctly when switching data views', async function () {
        await esArchiver.loadIfNeeded(
          'src/platform/test/functional/fixtures/es_archiver/index_pattern_without_timefield'
        );
        await kibanaServer.importExport.load(
          'src/platform/test/functional/fixtures/kbn_archiver/index_pattern_without_timefield'
        );

        await browser.refresh();
        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);

        await dataViews.switchToAndValidate('without-timefield');

        await expectFieldListDescription('6 available fields. 4 meta fields.');

        await dataViews.switchToAndValidate('with-timefield');

        await expectFieldListDescription('0 available fields. 7 empty fields. 4 meta fields.');
        await testSubjects.existOrFail(
          `${unifiedFieldList.getSidebarSectionSelector('available')}NoFieldsCallout-noFieldsMatch`
        );

        await dataViews.switchToAndValidate('logstash-*');

        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);

        await kibanaServer.importExport.unload(
          'src/platform/test/functional/fixtures/kbn_archiver/index_pattern_without_timefield'
        );

        await esArchiver.unload(
          'src/platform/test/functional/fixtures/es_archiver/index_pattern_without_timefield'
        );
      });

      it('should work when filters change', async () => {
        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);

        await unifiedFieldList.clickFieldListItem('extension');
        expect(await testSubjects.getVisibleText('dscFieldStats-topValues')).to.be(
          'jpg\n65.0%\ncss\n15.4%\npng\n9.8%\ngif\n6.6%\nphp\n3.2%'
        );

        await filterBar.addFilter({ field: 'extension', operation: 'is', value: 'jpg' });

        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);

        // check that the filter was passed down to the sidebar
        await unifiedFieldList.clickFieldListItem('extension');
        expect(await testSubjects.getVisibleText('dscFieldStats-topValues')).to.be('jpg\n100%');
      });

      it('should work for many fields', async () => {
        await esArchiver.loadIfNeeded(
          'src/platform/test/functional/fixtures/es_archiver/many_fields'
        );
        await kibanaServer.importExport.load(
          'src/platform/test/functional/fixtures/kbn_archiver/many_fields_data_view'
        );

        await browser.refresh();
        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);

        await dataViews.switchToAndValidate('indices-stats*');

        await expectFieldListDescription('6873 available fields. 4 meta fields.');

        await dataViews.switchToAndValidate('logstash-*');

        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);

        await kibanaServer.importExport.unload(
          'src/platform/test/functional/fixtures/kbn_archiver/many_fields_data_view'
        );
        await esArchiver.unload('src/platform/test/functional/fixtures/es_archiver/many_fields');
      });

      it('should work with ad-hoc data views and runtime fields', async () => {
        await dataViews.createFromSearchBar({
          name: 'logstash',
          adHoc: true,
          hasTimeField: true,
        });

        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);

        await discover.addRuntimeField(
          '_bytes-runtimefield',
          `emit((doc["bytes"].value * 2).toString())`
        );

        await retry.waitFor('form to close', async () => {
          return !(await testSubjects.exists('fieldEditor'));
        });

        await expectFieldListDescription('49 available fields. 5 empty fields. 4 meta fields.');

        let allFields = await unifiedFieldList.getAllFieldNames();
        expect(allFields.includes('_bytes-runtimefield')).to.be(true);

        await discover.editField('_bytes-runtimefield');
        await fieldEditor.enableCustomLabel();
        await fieldEditor.setCustomLabel('_bytes-runtimefield2');
        await fieldEditor.save();

        await retry.waitFor('form to close', async () => {
          return !(await testSubjects.exists('fieldEditor'));
        });

        await expectFieldListDescription('49 available fields. 5 empty fields. 4 meta fields.');

        allFields = await unifiedFieldList.getAllFieldNames();
        expect(allFields.includes('_bytes-runtimefield2')).to.be(true);
        expect(allFields.includes('_bytes-runtimefield')).to.be(false);
        await discover.removeField('_bytes-runtimefield');
        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);

        allFields = await unifiedFieldList.getAllFieldNames();
        expect(allFields.includes('_bytes-runtimefield2')).to.be(false);
        expect(allFields.includes('_bytes-runtimefield')).to.be(false);
      });

      it('should render even when retrieving documents failed with an error', async () => {
        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);

        await discover.addRuntimeField('_invalid-runtimefield', `emit(‘’);`);

        await header.waitUntilLoadingHasFinished();

        // error in fetching documents because of the invalid runtime field
        await discover.showsErrorCallout();

        await unifiedFieldList.waitUntilSidebarHasLoaded();

        // check that the sidebar is rendered
        await expectFieldListDescription('49 available fields. 5 empty fields. 4 meta fields.');
        let allFields = await unifiedFieldList.getAllFieldNames();
        expect(allFields.includes('_invalid-runtimefield')).to.be(true);

        await browser.refresh();
        await header.waitUntilLoadingHasFinished();
        await discover.showsErrorCallout(); // still has error

        // check that the sidebar is rendered event after a refresh
        await unifiedFieldList.waitUntilSidebarHasLoaded();
        allFields = await unifiedFieldList.getAllFieldNames();
        expect(allFields.includes('_invalid-runtimefield')).to.be(true);

        await discover.removeField('_invalid-runtimefield');
        await header.waitUntilLoadingHasFinished();
        await unifiedFieldList.waitUntilSidebarHasLoaded();
      });

      it('should work correctly when time range is updated', async function () {
        await esArchiver.loadIfNeeded(
          'src/platform/test/functional/fixtures/es_archiver/index_pattern_without_timefield'
        );
        await kibanaServer.importExport.load(
          'src/platform/test/functional/fixtures/kbn_archiver/index_pattern_without_timefield'
        );

        await browser.refresh();
        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);

        await dataViews.switchToAndValidate('with-timefield');

        await expectFieldListDescription('0 available fields. 7 empty fields. 4 meta fields.');
        await testSubjects.existOrFail(
          `${unifiedFieldList.getSidebarSectionSelector('available')}NoFieldsCallout-noFieldsMatch`
        );

        await timePicker.setAbsoluteRange(
          'Sep 21, 2019 @ 00:00:00.000',
          'Sep 23, 2019 @ 00:00:00.000'
        );

        await expectFieldListDescription('7 available fields. 4 meta fields.');

        await kibanaServer.importExport.unload(
          'src/platform/test/functional/fixtures/kbn_archiver/index_pattern_without_timefield'
        );

        await esArchiver.unload(
          'src/platform/test/functional/fixtures/es_archiver/index_pattern_without_timefield'
        );
      });

      it('should remove the table column after a field was deleted', async () => {
        const newField = '_test_field_and_column_removal';
        await discover.addRuntimeField(newField, `emit("hi there")`);

        await retry.waitFor('form to close', async () => {
          return !(await testSubjects.exists('fieldEditor'));
        });

        await header.waitUntilLoadingHasFinished();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        let selectedFields = await unifiedFieldList.getSidebarSectionFieldNames('selected');
        expect(selectedFields.includes(newField)).to.be(false);
        expect(await dataGrid.getHeaderFields()).to.eql(['@timestamp', 'Summary']);

        await unifiedFieldList.clickFieldListItemAdd(newField);
        await header.waitUntilLoadingHasFinished();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        selectedFields = await unifiedFieldList.getSidebarSectionFieldNames('selected');
        expect(selectedFields.includes(newField)).to.be(true);
        expect(await dataGrid.getHeaderFields()).to.eql(['@timestamp', newField]);

        await discover.removeField(newField);
        await header.waitUntilLoadingHasFinished();
        await unifiedFieldList.waitUntilSidebarHasLoaded();

        await retry.waitFor('sidebar to update', async () => {
          return !(await unifiedFieldList.getAllFieldNames()).includes(newField);
        });

        expect(await dataGrid.getHeaderFields()).to.eql(['@timestamp', 'Summary']);
      });
    });
  });
}
