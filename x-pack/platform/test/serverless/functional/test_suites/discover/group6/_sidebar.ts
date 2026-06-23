/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/group6/_sidebar.ts

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const PageObjects = getPageObjects([
    'common',
    'svlCommonPage',
    'discover',
    'timePicker',
    'header',
    'unifiedFieldList',
  ]);
  const testSubjects = getService('testSubjects');
  const find = getService('find');
  const browser = getService('browser');
  const filterBar = getService('filterBar');
  const fieldEditor = getService('fieldEditor');
  const retry = getService('retry');
  const dataGrid = getService('dataGrid');
  const dataViews = getService('dataViews');
  const queryBar = getService('queryBar');
  const log = getService('log');
  const INITIAL_FIELD_LIST_SUMMARY = '48 available fields. 5 empty fields. 4 meta fields.';

  const expectFieldListDescription = async (expectedNumber: string) => {
    return await retry.try(async () => {
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();
      const ariaDescription = await PageObjects.unifiedFieldList.getSidebarAriaDescription();
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
    before(async function () {
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await PageObjects.svlCommonPage.loginAsAdmin();
    });

    beforeEach(async () => {
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      await kibanaServer.uiSettings.replace({
        defaultIndex: 'logstash-*',
      });
      await PageObjects.timePicker.setDefaultAbsoluteRangeViaUiSettings();
      await PageObjects.common.navigateToApp('discover');
      await PageObjects.discover.waitUntilSearchingHasFinished();
    });

    afterEach(async () => {
      await kibanaServer.importExport.unload(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      await kibanaServer.savedObjects.cleanStandardList();
      await kibanaServer.uiSettings.replace({});
      await PageObjects.unifiedFieldList.cleanSidebarLocalStorage();
    });

    describe('field filtering', function () {
      it('should reveal and hide the filter form when the toggle is clicked', async function () {
        await PageObjects.unifiedFieldList.openSidebarFieldFilter();
        await PageObjects.unifiedFieldList.closeSidebarFieldFilter();
      });

      it('should filter by field type', async function () {
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();
        await PageObjects.unifiedFieldList.openSidebarFieldFilter();

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

      // TODO: ES|QL tests removed since ES|QL isn't supported in Serverless
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
        await PageObjects.unifiedFieldList.findFieldByName('i');

        await expectFieldListDescription('28 available fields. 2 empty fields. 3 meta fields.');
        await PageObjects.unifiedFieldList.findFieldByName('p');
        await expectFieldListDescription('4 available fields. 0 meta fields.');

        expect(
          (await PageObjects.unifiedFieldList.getSidebarSectionFieldNames('available')).join(', ')
        ).to.be('clientip, ip, relatedContent.og:description, relatedContent.twitter:description');
      });

      it('should be able to search by wildcard', async function () {
        await PageObjects.unifiedFieldList.findFieldByName('relatedContent*image');
        await expectFieldListDescription('2 available fields. 0 meta fields.');

        expect(
          (await PageObjects.unifiedFieldList.getSidebarSectionFieldNames('available')).join(', ')
        ).to.be('relatedContent.og:image, relatedContent.twitter:image');
      });

      it('should be able to search with spaces as wildcard', async function () {
        await PageObjects.unifiedFieldList.findFieldByName('relatedContent image');

        await expectFieldListDescription('4 available fields. 0 meta fields.');

        expect(
          (await PageObjects.unifiedFieldList.getSidebarSectionFieldNames('available')).join(', ')
        ).to.be(
          'relatedContent.og:image, relatedContent.og:image:height, relatedContent.og:image:width, relatedContent.twitter:image'
        );
      });

      it('should be able to search with fuzzy search (1 typo)', async function () {
        await PageObjects.unifiedFieldList.findFieldByName('rel4tedContent.art');
        await expectFieldListDescription('4 available fields. 0 meta fields.');

        expect(
          (await PageObjects.unifiedFieldList.getSidebarSectionFieldNames('available')).join(', ')
        ).to.be(
          'relatedContent.article:modified_time, relatedContent.article:published_time, relatedContent.article:section, relatedContent.article:tag'
        );
      });

      it('should ignore empty search', async function () {
        await PageObjects.unifiedFieldList.findFieldByName('   '); // only spaces

        await retry.waitFor('the clear button', async () => {
          return await testSubjects.exists('clearSearchButton');
        });

        // expect no changes in the list
        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);
      });
    });

    describe('field stats', function () {
      it('should work for regular and pinned filters', async () => {
        await PageObjects.header.waitUntilLoadingHasFinished();

        const allTermsResult = 'jpg\n65.0%\ncss\n15.4%\npng\n9.8%\ngif\n6.6%\nphp\n3.2%';
        await PageObjects.unifiedFieldList.clickFieldListItem('extension');
        expect(await testSubjects.getVisibleText('dscFieldStats-topValues')).to.be(allTermsResult);

        await filterBar.addFilter({ field: 'extension', operation: 'is', value: 'jpg' });
        await PageObjects.header.waitUntilLoadingHasFinished();

        const onlyJpgResult = 'jpg\n100%';
        await PageObjects.unifiedFieldList.clickFieldListItem('extension');
        expect(await testSubjects.getVisibleText('dscFieldStats-topValues')).to.be(onlyJpgResult);

        await filterBar.toggleFilterNegated('extension');
        await PageObjects.header.waitUntilLoadingHasFinished();

        const jpgExcludedResult = 'css\n44.1%\npng\n28.0%\ngif\n18.8%\nphp\n9.1%';
        await PageObjects.unifiedFieldList.clickFieldListItem('extension');
        expect(await testSubjects.getVisibleText('dscFieldStats-topValues')).to.be(
          jpgExcludedResult
        );

        await filterBar.toggleFilterPinned('extension');
        await PageObjects.header.waitUntilLoadingHasFinished();

        await PageObjects.unifiedFieldList.clickFieldListItem('extension');
        expect(await testSubjects.getVisibleText('dscFieldStats-topValues')).to.be(
          jpgExcludedResult
        );

        await browser.refresh();

        await PageObjects.unifiedFieldList.clickFieldListItem('extension');
        expect(await testSubjects.getVisibleText('dscFieldStats-topValues')).to.be(
          jpgExcludedResult
        );

        await filterBar.toggleFilterEnabled('extension');
        await PageObjects.header.waitUntilLoadingHasFinished();

        await PageObjects.unifiedFieldList.clickFieldListItem('extension');
        expect(await testSubjects.getVisibleText('dscFieldStats-topValues')).to.be(allTermsResult);
      });
    });

    describe('collapse expand', function () {
      it('should initially be expanded', async function () {
        await testSubjects.existOrFail('discover-sidebar');
        await testSubjects.existOrFail('fieldList');
      });

      it('should collapse when clicked', async function () {
        await PageObjects.discover.closeSidebar();
        await testSubjects.existOrFail('dscShowSidebarButton');
        await testSubjects.missingOrFail('fieldList');
      });

      it('should expand when clicked', async function () {
        await PageObjects.discover.openSidebar();
        await testSubjects.existOrFail('discover-sidebar');
        await testSubjects.existOrFail('fieldList');
      });
    });

    describe('renders field groups', function () {
      it('should show field list groups excluding subfields', async function () {
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();
        expect(await PageObjects.unifiedFieldList.doesSidebarShowFields()).to.be(true);

        // Initial Available fields
        const expectedInitialAvailableFields =
          '@message, @tags, @timestamp, agent, bytes, clientip, extension, geo.coordinates, geo.dest, geo.src, geo.srcdest, headings, host, index, ip, links, machine.os, machine.ram, machine.ram_range, memory, nestedField.child, phpmemory, referer, relatedContent.article:modified_time, relatedContent.article:published_time, relatedContent.article:section, relatedContent.article:tag, relatedContent.og:description, relatedContent.og:image, relatedContent.og:image:height, relatedContent.og:image:width, relatedContent.og:site_name, relatedContent.og:title, relatedContent.og:type, relatedContent.og:url, relatedContent.twitter:card, relatedContent.twitter:description, relatedContent.twitter:image, relatedContent.twitter:site, relatedContent.twitter:title, relatedContent.url, request, response, spaces, type, url, utc_time, xss';
        let availableFields = await PageObjects.unifiedFieldList.getSidebarSectionFieldNames(
          'available'
        );
        expect(availableFields.length).to.be(48);
        expect(availableFields.join(', ')).to.be(expectedInitialAvailableFields);

        // Available fields after scrolling down
        const metaSectionButton = await find.byCssSelector(
          PageObjects.unifiedFieldList.getSidebarSectionSelector('meta', true)
        );
        await metaSectionButton.scrollIntoViewIfNecessary();

        await retry.waitFor('list to update after scrolling', async () => {
          availableFields = await PageObjects.unifiedFieldList.getSidebarSectionFieldNames(
            'available'
          );
          return availableFields.length === 48;
        });

        expect(availableFields.join(', ')).to.be(`${expectedInitialAvailableFields}`);

        // Expand Meta section
        await PageObjects.unifiedFieldList.toggleSidebarSection('meta');
        expect(
          (await PageObjects.unifiedFieldList.getSidebarSectionFieldNames('meta')).join(', ')
        ).to.be('_id, _ignored, _index, _score');

        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);
      });

      it('should show selected and popular fields', async function () {
        await PageObjects.unifiedFieldList.clickFieldListItemAdd('extension');
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await PageObjects.unifiedFieldList.clickFieldListItemAdd('@message');
        await PageObjects.discover.waitUntilSearchingHasFinished();

        expect(
          (await PageObjects.unifiedFieldList.getSidebarSectionFieldNames('selected')).join(', ')
        ).to.be('extension, @message');

        const availableFields = await PageObjects.unifiedFieldList.getSidebarSectionFieldNames(
          'available'
        );
        expect(availableFields.includes('extension')).to.be(true);
        expect(availableFields.includes('@message')).to.be(true);

        await expectFieldListDescription(
          '2 selected fields. 2 popular fields. 48 available fields. 5 empty fields. 4 meta fields.'
        );

        await PageObjects.unifiedFieldList.clickFieldListItemRemove('@message');
        await PageObjects.discover.waitUntilSearchingHasFinished();

        await PageObjects.unifiedFieldList.clickFieldListItemAdd('_id');
        await PageObjects.discover.waitUntilSearchingHasFinished();
        await PageObjects.unifiedFieldList.clickFieldListItemAdd('@message');
        await PageObjects.discover.waitUntilSearchingHasFinished();

        expect(
          (await PageObjects.unifiedFieldList.getSidebarSectionFieldNames('selected')).join(', ')
        ).to.be('extension, _id, @message');

        expect(
          (await PageObjects.unifiedFieldList.getSidebarSectionFieldNames('popular')).join(', ')
        ).to.be('@message, _id, extension');

        await expectFieldListDescription(
          '3 selected fields. 3 popular fields. 48 available fields. 5 empty fields. 4 meta fields.'
        );
      });

      // TODO: ES|QL tests removed since ES|QL isn't supported in Serverless

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
          `${PageObjects.unifiedFieldList.getSidebarSectionSelector('available')}-fetchWarning`
        );
        await testSubjects.existOrFail(
          `${PageObjects.unifiedFieldList.getSidebarSectionSelector(
            'available'
          )}NoFieldsCallout-noFieldsExist`
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
          `${PageObjects.unifiedFieldList.getSidebarSectionSelector(
            'available'
          )}NoFieldsCallout-noFieldsMatch`
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

        await PageObjects.unifiedFieldList.clickFieldListItem('extension');
        expect(await testSubjects.getVisibleText('dscFieldStats-topValues')).to.be(
          'jpg\n65.0%\ncss\n15.4%\npng\n9.8%\ngif\n6.6%\nphp\n3.2%'
        );

        await filterBar.addFilter({ field: 'extension', operation: 'is', value: 'jpg' });
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();

        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);

        // check that the filter was passed down to the sidebar
        await PageObjects.unifiedFieldList.clickFieldListItem('extension');
        expect(await testSubjects.getVisibleText('dscFieldStats-topValues')).to.be('jpg\n100%');
      });

      it('should work for many fields', async () => {
        await esArchiver.loadIfNeeded(
          'src/platform/test/functional/fixtures/es_archiver/many_fields'
        );
        await kibanaServer.importExport.load(
          'src/platform/test/functional/fixtures/kbn_archiver/many_fields_data_view'
        );
        await dataViews.switchToAndValidate('logstash-*');
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

        await PageObjects.discover.addRuntimeField(
          '_bytes-runtimefield',
          `emit((doc["bytes"].value * 2).toString())`
        );

        await retry.waitFor('form to close', async () => {
          return !(await testSubjects.exists('fieldEditor'));
        });

        await expectFieldListDescription('49 available fields. 5 empty fields. 4 meta fields.');

        let allFields = await PageObjects.unifiedFieldList.getAllFieldNames();
        expect(allFields.includes('_bytes-runtimefield')).to.be(true);

        await PageObjects.discover.editField('_bytes-runtimefield');
        await fieldEditor.enableCustomLabel();
        await fieldEditor.setCustomLabel('_bytes-runtimefield2');
        await fieldEditor.save();

        await retry.waitFor('form to close', async () => {
          return !(await testSubjects.exists('fieldEditor'));
        });

        await expectFieldListDescription('49 available fields. 5 empty fields. 4 meta fields.');

        allFields = await PageObjects.unifiedFieldList.getAllFieldNames();
        expect(allFields.includes('_bytes-runtimefield2')).to.be(true);
        expect(allFields.includes('_bytes-runtimefield')).to.be(false);
        await PageObjects.discover.removeField('_bytes-runtimefield');
        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);

        allFields = await PageObjects.unifiedFieldList.getAllFieldNames();
        expect(allFields.includes('_bytes-runtimefield2')).to.be(false);
        expect(allFields.includes('_bytes-runtimefield')).to.be(false);
      });

      it('should render even when retrieving documents failed with an error', async () => {
        await expectFieldListDescription(INITIAL_FIELD_LIST_SUMMARY);

        await PageObjects.discover.addRuntimeField('_invalid-runtimefield', `emit(‘’);`);

        await PageObjects.header.waitUntilLoadingHasFinished();

        // error in fetching documents because of the invalid runtime field
        await PageObjects.discover.showsErrorCallout();

        // check that the sidebar is rendered
        await expectFieldListDescription('49 available fields. 5 empty fields. 4 meta fields.');

        let allFields = await PageObjects.unifiedFieldList.getAllFieldNames();
        expect(allFields.includes('_invalid-runtimefield')).to.be(true);

        await browser.refresh();
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.discover.showsErrorCallout(); // still has error

        // check that the sidebar is rendered event after a refresh
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();
        allFields = await PageObjects.unifiedFieldList.getAllFieldNames();
        expect(allFields.includes('_invalid-runtimefield')).to.be(true);

        await PageObjects.discover.removeField('_invalid-runtimefield');
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();
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
          `${PageObjects.unifiedFieldList.getSidebarSectionSelector(
            'available'
          )}NoFieldsCallout-noFieldsMatch`
        );

        await PageObjects.timePicker.setAbsoluteRange(
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
        await PageObjects.discover.addRuntimeField(newField, `emit("hi there")`);

        await retry.waitFor('form to close', async () => {
          return !(await testSubjects.exists('fieldEditor'));
        });

        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();

        let selectedFields = await PageObjects.unifiedFieldList.getSidebarSectionFieldNames(
          'selected'
        );
        expect(selectedFields.includes(newField)).to.be(false);
        expect(await dataGrid.getHeaderFields()).to.eql(['@timestamp', 'Summary']);

        await PageObjects.unifiedFieldList.clickFieldListItemAdd(newField);
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();

        selectedFields = await PageObjects.unifiedFieldList.getSidebarSectionFieldNames('selected');
        expect(selectedFields.includes(newField)).to.be(true);
        expect(await dataGrid.getHeaderFields()).to.eql(['@timestamp', newField]);

        await PageObjects.discover.removeField(newField);
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();

        await retry.waitFor('sidebar to update', async () => {
          return !(await PageObjects.unifiedFieldList.getAllFieldNames()).includes(newField);
        });

        expect(await dataGrid.getHeaderFields()).to.eql(['@timestamp', 'Summary']);
      });
    });
  });
}
