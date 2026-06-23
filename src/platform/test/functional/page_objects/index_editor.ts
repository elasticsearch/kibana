/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import { FtrService } from '../ftr_provider_context';

// Grid index of the add-row control column (after the color-indicator and selection columns)
const ADD_ROW_COLUMN_INDEX = 2;

export class IndexEditorObject extends FtrService {
  private readonly testSubjects = this.ctx.getService('testSubjects');
  private readonly retry = this.ctx.getService('retry');
  private readonly find = this.ctx.getService('find');
  private readonly common = this.ctx.getPageObject('common');
  private readonly dataGrid = this.ctx.getService('dataGrid');
  private readonly es = this.ctx.getService('es');
  private readonly comboBox = this.ctx.getService('comboBox');

  public async getColumnNames(): Promise<string[]> {
    const columnHeaders = await this.testSubjects.findAll('indexEditorColumnNameButton');

    const columnNames: string[] = [];

    await this.retry.try(async () => {
      for (const columnHeader of columnHeaders) {
        const name = await columnHeader.getVisibleText();
        expect(name).to.not.be.empty();
        columnNames.push(name);
      }
    });

    return columnNames;
  }

  public async setColumn(name: string, type: string, columnIndex: number) {
    await this.retry.try(async () => {
      const columnHeaders = await this.testSubjects.findAll('indexEditorColumnNameButton');
      const columnHeader = columnHeaders[columnIndex];
      expect(columnHeader).to.not.be(undefined);
      await columnHeader.click();
    });

    await this.comboBox.set('indexEditorColumnTypeSelect', type);
    await this.testSubjects.setValue('indexEditorColumnNameInput', name);
    await this.common.pressEnterKey();
  }

  public async addColumn(name: string, type: string): Promise<void> {
    await this.testSubjects.click('indexEditorAddColumnButton');

    await this.comboBox.set('indexEditorColumnTypeSelect', type);
    await this.testSubjects.setValue('indexEditorColumnNameInput', name);
    await this.common.pressEnterKey();
  }

  public async deleteColumn(name: string): Promise<void> {
    await this.dataGrid.openColMenuByField(name);
    await this.testSubjects.click('indexEditorDeleteColumnButton');
  }

  public async setCellValue(rowIndex: number, columnIndex: number, value: string): Promise<void> {
    await this.retry.try(async () => {
      await this.testSubjects.click(`indexEditorCellValue-${rowIndex}-${columnIndex}`);
      const input = await this.testSubjects.find('indexEditorCellValueInput');
      await input.clearValueWithKeyboard();
      await input.type(value, { charByChar: true });
    });
    await this.common.pressEnterKey();
  }

  public async addRow(rowIndex: number): Promise<void> {
    const cell = await this.dataGrid.getCellElement(rowIndex, ADD_ROW_COLUMN_INDEX);
    await cell.moveMouseTo();
    await this.testSubjects.click('indexEditorAddRowButton');
  }

  public async deleteRow(rowIndex: number): Promise<void> {
    await this.dataGrid.selectRow(rowIndex);
    await this.dataGrid.openSelectedRowsMenu();
    await this.testSubjects.click('indexEditorDeleteDocs');
  }

  public async saveChangesAndClose(): Promise<void> {
    await this.testSubjects.click('indexEditorSaveAndCloseButton');
    await this.testSubjects.waitForDeleted('lookupIndexFlyout');
  }

  public async saveChanges(): Promise<void> {
    await this.testSubjects.click('indexEditorSaveChangesButton');
    await this.testSubjects.waitForDeleted('indexEditorSaveChangesButton');
  }

  public async closeIndexEditor(): Promise<void> {
    await this.testSubjects.click('indexEditorCloseButton');
  }

  public async verifyIndexContent(
    indexName: string,
    expectedDocs: Record<string, unknown>[]
  ): Promise<void> {
    const indexContent = await this.es.search({
      index: indexName,
    });

    expect(indexContent.hits.hits.length).to.be(expectedDocs.length);

    const docs = indexContent.hits.hits.map((hit) => hit._source);
    expect(docs).to.eql(expectedDocs);
  }

  public async verifyIndexMappings(
    indexName: string,
    expectedMappings: Record<string, unknown>
  ): Promise<void> {
    const indexMappings = await this.es.indices.getMapping({
      index: indexName,
    });

    const actualMappings = indexMappings[indexName].mappings.properties!;

    // Verify each expected property exists with the correct type
    for (const [fieldName, expectedField] of Object.entries(expectedMappings)) {
      const actualField = actualMappings[fieldName];
      expect(actualField.type).to.eql((expectedField as any).type);
    }
  }

  public async uploadFile(filePath: string): Promise<void> {
    const fileInput = await this.testSubjects.find('indexEditorFileInput');
    await fileInput.type(filePath);
  }

  public async search(query: string): Promise<void> {
    // clearValue does not update controlled KQL input; use clearValueWithKeyboard.
    await this.retry.try(async () => {
      await this.testSubjects.click('indexEditorQueryBar');
      const input = await this.find.activeElement();
      await input.clearValueWithKeyboard();
      await input.type(query);
      const currentQuery =
        (await this.testSubjects.getAttribute('indexEditorQueryBar', 'value')) ?? '';
      if (currentQuery !== query) {
        throw new Error(
          `Failed to set index editor query to "${query}", instead query is "${currentQuery}"`
        );
      }
    });
    await this.common.pressEnterKey();
  }
}
