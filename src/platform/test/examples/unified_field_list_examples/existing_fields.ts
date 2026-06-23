/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/examples/unified_field_list_examples/existing_fields.ts
import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../functional/ftr_provider_context';

const TEST_START_TIME = 'Jan 2, 2021 @ 00:00:00.000';
const TEST_END_TIME = 'Jan 2, 2022 @ 00:00:00.000';
const metaFields = ['_id', '_index', '_score', '_ignored'];

const fieldsWithData = [
  'ts',
  'filter_field',
  'textfield1',
  'textfield2',
  'mapping_runtime_field',
  'data_view_runtime_field',
];

// eslint-disable-next-line import/no-default-export
export default ({ getService, getPageObjects }: FtrProviderContext) => {
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const comboBox = getService('comboBox');
  const retry = getService('retry');
  const testSubjects = getService('testSubjects');
  const monacoEditor = getService('monacoEditor');
  const PageObjects = getPageObjects(['common', 'timePicker', 'header', 'unifiedFieldList']);
  const dataViewTitle = 'existence_index_*';

  async function addDSLFilter(value: string) {
    await testSubjects.click('addFilter');
    await testSubjects.click('editQueryDSL');
    await monacoEditor.waitCodeEditorReady('addFilterPopover');
    await monacoEditor.setCodeEditorValue(value);
    await testSubjects.scrollIntoView('saveFilter');
    await testSubjects.clickWhenNotDisabled('saveFilter');
    await retry.try(async () => {
      await testSubjects.waitForDeleted('saveFilter');
    });
    await PageObjects.header.waitUntilLoadingHasFinished();
  }

  async function removeAllDSLFilters() {
    await testSubjects.click('showQueryBarMenu');
    await testSubjects.click('filter-sets-removeAllFilters');

    await PageObjects.header.waitUntilLoadingHasFinished();
  }

  describe('Fields existence info', () => {
    before(async () => {
      await esArchiver.load(
        'src/platform/test/api_integration/fixtures/es_archiver/index_patterns/constant_keyword'
      );
      await kibanaServer.importExport.load(
        'src/platform/test/api_integration/fixtures/kbn_archiver/index_patterns/constant_keyword.json'
      );
      await PageObjects.common.navigateToApp('unifiedFieldListExamples');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await retry.waitFor('combobox is ready', async () => {
        return await testSubjects.exists('dataViewSelector');
      });
      await comboBox.setCustom('dataViewSelector', dataViewTitle);
      await retry.waitFor('page is ready', async () => {
        return await testSubjects.exists('globalQueryBar');
      });
      await PageObjects.timePicker.setAbsoluteRange(TEST_START_TIME, TEST_END_TIME);
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();
      await PageObjects.unifiedFieldList.openSidebarSection('meta');
    });

    after(async () => {
      await esArchiver.unload(
        'src/platform/test/api_integration/fixtures/es_archiver/index_patterns/constant_keyword'
      );
      await kibanaServer.importExport.unload(
        'src/platform/test/api_integration/fixtures/kbn_archiver/index_patterns/constant_keyword.json'
      );
      await PageObjects.unifiedFieldList.cleanSidebarLocalStorage();
      await kibanaServer.savedObjects.cleanStandardList();
    });

    describe('existence', () => {
      it('should find which fields exist in the sample documents', async () => {
        const sidebarFields = await PageObjects.unifiedFieldList.getAllFieldNames();
        expect(sidebarFields.sort()).to.eql([...metaFields, ...fieldsWithData].sort());
      });

      it('should return fields filtered by term query', async () => {
        const expectedFieldNames = [
          'ts',
          'filter_field',
          'textfield1',
          // textfield2 and mapping_runtime_field are defined on the other index
          'data_view_runtime_field',
        ];

        await addDSLFilter(`{
              "bool": {
                "filter": [{ "term": { "filter_field": "a" } }]
              }
            }`);

        const sidebarFields = await PageObjects.unifiedFieldList.getAllFieldNames();
        expect(sidebarFields.sort()).to.eql([...metaFields, ...expectedFieldNames].sort());

        await removeAllDSLFilters();
      });

      it('should return fields filtered by match_phrase query', async () => {
        const expectedFieldNames = [
          'ts',
          'filter_field',
          'textfield1',
          // textfield2 and mapping_runtime_field are defined on the other index
          'data_view_runtime_field',
        ];

        await addDSLFilter(`{
              "bool": {
                "filter": [{ "match_phrase": { "filter_field": "a" } }]
              }
            }`);

        const sidebarFields = await PageObjects.unifiedFieldList.getAllFieldNames();
        expect(sidebarFields.sort()).to.eql([...metaFields, ...expectedFieldNames].sort());

        await removeAllDSLFilters();
      });

      it('should return fields filtered by time range', async () => {
        const expectedFieldNames = [
          'ts',
          'filter_field',
          'textfield1',
          // textfield2 and mapping_runtime_field are defined on the other index
          'data_view_runtime_field',
        ];

        await addDSLFilter(`{
              "bool": {
                "filter": [{ "term": { "filter_field": "a" } }]
              }
            }`);

        await PageObjects.timePicker.setAbsoluteRange(
          TEST_START_TIME,
          'Dec 12, 2021 @ 00:00:00.000'
        );
        await PageObjects.header.waitUntilLoadingHasFinished();
        await PageObjects.unifiedFieldList.waitUntilSidebarHasLoaded();

        const sidebarFields = await PageObjects.unifiedFieldList.getAllFieldNames();
        expect(sidebarFields.sort()).to.eql([...metaFields, ...expectedFieldNames].sort());

        await removeAllDSLFilters();
      });
    });
  });
};
