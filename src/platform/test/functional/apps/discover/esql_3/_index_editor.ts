/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import path from 'path';
import type { FtrProviderContext } from '../ftr_provider_context';

const INDEX_NAME_MANUAL = 'test-lookup-index-manual';
const INDEX_NAME_FILE = 'test-lookup-index-file';
const INDEX_NAME_EDITION = 'test-lookup-index-edition';
const INDEX_NAME_CLOSED = 'test-lookup-index-closed';
const INITIAL_COLUMN_PLACEHOLDERS = 4;
// Leading control columns rendered before the data columns: the unsaved-row color indicator,
// the selection column, and the add-row column.
const NUMBER_OF_CONTROL_COLUMNS = 3;
const IMPORT_FILE_PATH = path.join(__dirname, 'imports', 'customers.csv');

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const security = getService('security');
  const testSubjects = getService('testSubjects');
  const esql = getService('esql');
  const es = getService('es');
  const retry = getService('retry');
  const dataGrid = getService('dataGrid');

  const { indexEditor, common, discover } = getPageObjects([
    'indexEditor',
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

  describe('Index editor', function () {
    before(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      await security.testUser.setRoles(['superuser']);
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await kibanaServer.uiSettings.replace(defaultSettings);
      await common.navigateToApp('discover');

      // Set ESQL mode
      await discover.waitUntilSearchingHasFinished();
      await discover.selectTextBaseLang();
      await discover.waitUntilSearchingHasFinished();
    });

    beforeEach(async () => {
      await cleanLookupJoinIndexes();
    });

    afterEach(async () => {
      await cleanLookupJoinIndexes();
    });

    it('allows creation by file upload', async function () {
      // Type lookup join query with index name inside it
      await esql.typeEsqlEditorQuery(`from logstash-* | LOOKUP JOIN ${INDEX_NAME_FILE}`);

      // Click Create lookup index suggestion
      await esql.selectEsqlSuggestionByLabel(`Create lookup index "${INDEX_NAME_FILE}"`);
      await testSubjects.isDisplayed('lookupIndexFlyout');

      // Import a file
      await indexEditor.uploadFile(IMPORT_FILE_PATH);
      await testSubjects.isDisplayed('fileUploadLiteLookupSteps');
      await testSubjects.click('fileUploadLiteLookupReviewButton', 6000);

      await testSubjects.click('fileUploadLiteLookupImportButton', 6000);

      // Wait for finish button to be enabled and click it
      // wait for file upload component to disappear
      await retry.tryForTime(20000, async () => {
        await testSubjects.waitForEnabled('fileUploadLiteLookupFinishButton', 6000);
        await testSubjects.click('fileUploadLiteLookupFinishButton', 6000);
        await testSubjects.missingOrFail('fileUploadLiteLookupSteps');
      });

      // Check data grid has been populated correctly
      await retry.tryForTime(6000, async () => {
        const gridData = await dataGrid.getDataGridTableData();
        expect(gridData.columns).to.eql([
          '', // Unsaved-row color indicator control column
          'Select column',
          'Actions columnActions', // Add row control column
          'Keywordcustomer_first_name',
          'Keywordcustomer_full_name',
          'Keywordcustomer_gender',
          'Numbercustomer_id',
          'Keywordcustomer_last_name',
          'Keywordemail',
          '', // Add column control column
        ]);
        expect(gridData.rows[0]).to.eql([
          '', // Unsaved-row color indicator control column
          '', // toggles column
          '', // Add row control column
          'Elyssa',
          'Elyssa Underwood',
          'FEMALE',
          27,
          'Underwood',
          'elyssa@underwood-family.zzz',
          '', // Add column control column
        ]);
      });

      // Close flyout and verify index content is correct
      await indexEditor.closeIndexEditor();
      await testSubjects.waitForDeleted('lookupIndexFlyout');

      await retry.tryForTime(6000, async () => {
        await indexEditor.verifyIndexContent(INDEX_NAME_FILE, [
          {
            customer_first_name: 'Elyssa',
            customer_full_name: 'Elyssa Underwood',
            customer_gender: 'FEMALE',
            customer_id: '27',
            customer_last_name: 'Underwood',
            email: 'elyssa@underwood-family.zzz',
          },
        ]);
      });
    });

    it('allows creation by manually adding data', async function () {
      // Type lookup join query
      await esql.typeEsqlEditorQuery('from logstash-* | LOOKUP JOIN ');

      // Click Create lookup index suggestion
      await esql.selectEsqlSuggestionByLabel('Create lookup index');

      // Set index name
      await testSubjects.setValue('indexNameInput', INDEX_NAME_MANUAL);
      await testSubjects.click('indexNameSaveButton');

      // Set column names
      expect((await indexEditor.getColumnNames()).length).to.be(INITIAL_COLUMN_PLACEHOLDERS);

      for (let index = 0; index < INITIAL_COLUMN_PLACEHOLDERS; index++) {
        await indexEditor.setColumn(`column-${index + 1}`, 'keyword', index);
      }

      expect(await indexEditor.getColumnNames()).to.eql([
        'column-1',
        'column-2',
        'column-3',
        'column-4',
      ]);

      // Add a new column
      await indexEditor.addColumn('extra-column', 'keyword');
      expect((await indexEditor.getColumnNames()).length).to.be(INITIAL_COLUMN_PLACEHOLDERS + 1);

      // Add another column and then delete it
      await indexEditor.addColumn('column-to-be-deleted', 'text');
      await indexEditor.deleteColumn('column-to-be-deleted');
      expect((await indexEditor.getColumnNames()).length).to.be(INITIAL_COLUMN_PLACEHOLDERS + 1);

      // Add cell values for the first row
      for (
        let colIndex = NUMBER_OF_CONTROL_COLUMNS;
        colIndex <= INITIAL_COLUMN_PLACEHOLDERS + NUMBER_OF_CONTROL_COLUMNS;
        colIndex++
      ) {
        await indexEditor.setCellValue(
          0,
          colIndex,
          `value-1-${colIndex - NUMBER_OF_CONTROL_COLUMNS + 1}`
        );
      }

      // Add new row with values
      await indexEditor.addRow(0);
      for (
        let colIndex = NUMBER_OF_CONTROL_COLUMNS;
        colIndex <= INITIAL_COLUMN_PLACEHOLDERS + NUMBER_OF_CONTROL_COLUMNS;
        colIndex++
      ) {
        await indexEditor.setCellValue(
          1,
          colIndex,
          `value-2-${colIndex - NUMBER_OF_CONTROL_COLUMNS + 1}`
        );
      }

      // Edit column name
      await indexEditor.setColumn('renamed-column-1', 'text', 0);

      // Save the index
      await indexEditor.saveChangesAndClose();

      // Query should be updated appending the new index name
      const updatedESQLQuery = await esql.getEsqlEditorQuery();
      expect(updatedESQLQuery).to.contain(`| LOOKUP JOIN ${INDEX_NAME_MANUAL}`);

      // Verify the index is created correctly and contains all the data
      await retry.tryForTime(6000, async () => {
        await indexEditor.verifyIndexContent(INDEX_NAME_MANUAL, [
          {
            'renamed-column-1': 'value-1-1',
            'column-2': 'value-1-2',
            'column-3': 'value-1-3',
            'column-4': 'value-1-4',
            'extra-column': 'value-1-5',
          },
          {
            'renamed-column-1': 'value-2-1',
            'column-2': 'value-2-2',
            'column-3': 'value-2-3',
            'column-4': 'value-2-4',
            'extra-column': 'value-2-5',
          },
        ]);

        await indexEditor.verifyIndexMappings(INDEX_NAME_MANUAL, {
          'renamed-column-1': { type: 'text' },
          'column-2': { type: 'keyword' },
          'column-3': { type: 'keyword' },
          'column-4': { type: 'keyword' },
          'extra-column': { type: 'keyword' },
        });
      });
    });

    it('allows editing an existing index', async function () {
      // Create the lookup join index
      await es.indices.create({
        index: INDEX_NAME_EDITION,
        settings: {
          mode: 'lookup',
        },
      });

      await es.bulk({
        index: INDEX_NAME_EDITION,
        refresh: 'wait_for',
        operations: [
          {
            index: { _id: '1' },
          },
          {
            customer_first_name: 'Elyssa',
            customer_full_name: 'Elyssa Underwood',
            customer_gender: 'FEMALE',
            customer_id: '27',
            customer_last_name: 'Underwood',
            email: 'elyssa@underwood-family.zzz',
          },
          {
            index: { _id: '2' },
          },
          {
            customer_first_name: 'Phil',
            customer_full_name: 'Phil Thompson',
            customer_gender: 'MALE',
            customer_id: '50',
            customer_last_name: 'Thompson',
            email: 'phil@thompson-family.zzz',
          },
        ],
      });

      await common.navigateToApp('discover');
      await discover.waitUntilSearchingHasFinished();
      await discover.selectTextBaseLang();
      await discover.waitUntilSearchingHasFinished();

      // Type lookup join query
      await esql.typeEsqlEditorQuery(`from logstash-* | LOOKUP JOIN ${INDEX_NAME_EDITION}`);

      // Hover the index badge and click on the edit option
      await esql.selectEsqlBadgeHoverOption('lookupIndexBadge', 'Edit lookup index');

      expect(await testSubjects.isDisplayed('lookupIndexFlyout')).to.be(true);

      expect((await dataGrid.getDocTableRows()).length).to.be(2);

      // Filter rows
      await indexEditor.search('customer_first_name: Elyssa');
      await retry.tryForTime(6000, async () => {
        expect((await dataGrid.getDocTableRows()).length).to.be(1);
      });
      await indexEditor.search('');
      await retry.tryForTime(6000, async () => {
        expect((await dataGrid.getDocTableRows()).length).to.be(2);
      });

      // Edit cell values (column indices are relative to the leading control columns)
      const firstNameColumn = NUMBER_OF_CONTROL_COLUMNS;
      const fullNameColumn = NUMBER_OF_CONTROL_COLUMNS + 1;
      // 6 existing data columns precede the newly added "age" column
      const ageColumn = NUMBER_OF_CONTROL_COLUMNS + 6;

      await indexEditor.setCellValue(0, firstNameColumn, 'Jasmin');
      await indexEditor.setCellValue(0, fullNameColumn, 'Jasmin Upperwood');

      await indexEditor.setCellValue(1, firstNameColumn, 'Philip');
      await indexEditor.setCellValue(1, fullNameColumn, 'Philip Tompsoon');

      // Add a new row with some values and delete it
      await indexEditor.addRow(0);
      await indexEditor.setCellValue(1, firstNameColumn, 'New Name');
      await indexEditor.setCellValue(1, fullNameColumn, 'New Name Surname');
      expect((await dataGrid.getDocTableRows()).length).to.be(3);

      await indexEditor.deleteRow(1);
      expect((await dataGrid.getDocTableRows()).length).to.be(2);

      // Add a new row with some values
      await indexEditor.addRow(0);
      await indexEditor.setCellValue(1, firstNameColumn, 'Pedro');
      await indexEditor.setCellValue(1, fullNameColumn, 'Pedro Fernandez');
      expect((await dataGrid.getDocTableRows()).length).to.be(3);

      // Add a new column
      await indexEditor.addColumn('age', 'integer');
      await indexEditor.setCellValue(0, ageColumn, '30');
      await indexEditor.setCellValue(1, ageColumn, '40');
      await indexEditor.setCellValue(2, ageColumn, '25');

      // Try to exit without saving changes
      await indexEditor.closeIndexEditor();
      await testSubjects.exists('indexEditorUnsavedChangesModal');

      // Go back to save
      await testSubjects.click('confirmModalCancelButton');
      await testSubjects.waitForDeleted('indexEditorUnsavedChangesModal');
      await indexEditor.saveChangesAndClose();

      // Verify the editions took place correctly
      await retry.tryForTime(10000, async () => {
        await indexEditor.verifyIndexContent(INDEX_NAME_EDITION, [
          {
            customer_first_name: 'Jasmin',
            customer_full_name: 'Jasmin Upperwood',
            customer_gender: 'FEMALE',
            customer_id: '27',
            customer_last_name: 'Underwood',
            email: 'elyssa@underwood-family.zzz',
            age: 30,
          },
          {
            customer_first_name: 'Philip',
            customer_full_name: 'Philip Tompsoon',
            customer_gender: 'MALE',
            customer_id: '50',
            customer_last_name: 'Thompson',
            email: 'phil@thompson-family.zzz',
            age: 25,
          },
          {
            customer_first_name: 'Pedro',
            customer_full_name: 'Pedro Fernandez',
            age: 40,
          },
        ]);
        await indexEditor.verifyIndexMappings(INDEX_NAME_EDITION, {
          age: { type: 'integer' },
          customer_first_name: { type: 'text' },
          customer_full_name: { type: 'text' },
          customer_gender: { type: 'text' },
          customer_id: { type: 'text' },
          customer_last_name: { type: 'text' },
          email: { type: 'text' },
        });
      });
    });

    it('allows to save an edition without closing the flyout', async function () {
      // Type lookup join query with index name inside it
      await esql.typeEsqlEditorQuery(`from logstash-* | LOOKUP JOIN ${INDEX_NAME_MANUAL}`);

      // Click Create lookup index suggestion
      await esql.selectEsqlSuggestionByLabel(`Create lookup index "${INDEX_NAME_MANUAL}"`);
      await testSubjects.isDisplayed('lookupIndexFlyout');

      // Manually set content
      await indexEditor.setColumn(`my_column`, 'text', 0);
      await indexEditor.setCellValue(0, NUMBER_OF_CONTROL_COLUMNS, `value`);

      // Save changes
      await indexEditor.saveChanges();

      // Verify the editions took place correctly
      await retry.tryForTime(10000, async () => {
        await indexEditor.verifyIndexContent(INDEX_NAME_MANUAL, [
          {
            my_column: 'value',
          },
        ]);
      });
    });

    it('shows a warning tooltip for a closed lookup index instead of "Create lookup index"', async function () {
      // Create a lookup index and close it
      await es.indices.create({
        index: INDEX_NAME_CLOSED,
        settings: { mode: 'lookup' },
      });
      await es.indices.close({ index: INDEX_NAME_CLOSED });

      await common.navigateToApp('discover');
      await discover.waitUntilSearchingHasFinished();
      await discover.selectTextBaseLang();
      await discover.waitUntilSearchingHasFinished();

      // Type the closed index into a lookup join query
      await esql.typeEsqlEditorQuery(
        `from logstash-* | LOOKUP JOIN ${INDEX_NAME_CLOSED} ON customer_id`
      );

      // Hover the badge and read the tooltip text — it must contain the closed warning
      const hoverText = await esql.getEsqlBadgeHoverText('lookupIndexClosedBadge');
      expect(hoverText).to.contain('closed');
      expect(hoverText).not.to.contain('Create lookup index');
      expect(hoverText).not.to.contain('Edit lookup index');
    });

    async function cleanLookupJoinIndexes() {
      for (const name of [
        INDEX_NAME_EDITION,
        INDEX_NAME_MANUAL,
        INDEX_NAME_FILE,
        INDEX_NAME_CLOSED,
      ]) {
        const indexExists = await es.indices.exists({ index: name });
        if (indexExists) {
          // Open the index before deletion (closed indices cannot be deleted directly)
          try {
            await es.indices.open({ index: name });
          } catch {
            // ignore if already open
          }
          await es.indices.delete({ index: name });
        }
      }
    }
  });
}
