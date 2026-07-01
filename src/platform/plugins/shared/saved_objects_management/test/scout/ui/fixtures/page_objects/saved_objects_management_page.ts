/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator, ScoutPage, KibanaUrl } from '@kbn/scout';
import { KibanaCodeEditorWrapper } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

const spacePrefix = (spaceId?: string) => (spaceId && spaceId !== 'default' ? `/s/${spaceId}` : '');

/** Page object for the Saved Objects Management UI. */
export class SavedObjectsManagementPage {
  public readonly table: Locator;
  public readonly selectAllCheckbox: Locator;
  public readonly deleteListButton: Locator;
  public readonly inspectDeleteButton: Locator;
  public readonly inspectSaveButton: Locator;
  public readonly codeEditor: Locator;
  public readonly appNotFoundPageContent: Locator;
  public readonly searchBar: Locator;
  public readonly importTrigger: Locator;
  public readonly importSubmit: Locator;
  public readonly importSuccess: Locator;
  public readonly importDone: Locator;
  public readonly codeEditorWrapper: KibanaCodeEditorWrapper;

  constructor(private readonly page: ScoutPage, private readonly kbnUrl: KibanaUrl) {
    this.table = this.page.testSubj.locator('savedObjectsTable');
    this.selectAllCheckbox = this.page.testSubj.locator('checkboxSelectAll');
    this.deleteListButton = this.page.testSubj.locator('savedObjectsManagementDelete');
    this.inspectDeleteButton = this.page.testSubj.locator('savedObjectEditDelete');
    this.inspectSaveButton = this.page.testSubj.locator('savedObjectEditSave');
    this.codeEditor = this.page.testSubj.locator('kibanaCodeEditor');
    this.appNotFoundPageContent = this.page.testSubj.locator('appNotFoundPageContent');
    this.searchBar = this.page.testSubj.locator('savedObjectSearchBar');
    this.importTrigger = this.page.testSubj.locator('importObjects');
    this.importSubmit = this.page.testSubj.locator('importSavedObjectsImportBtn');
    this.importSuccess = this.page.testSubj.locator('importSavedObjectsSuccess');
    this.importDone = this.page.testSubj.locator('importSavedObjectsDoneBtn');
    this.codeEditorWrapper = new KibanaCodeEditorWrapper(this.page);
  }

  /**
   * Navigates to the SOM listing page. Does NOT wait for the table so the
   * caller can also use it for negative tests (app-not-found / 404).
   */
  async gotoListing(spaceId?: string): Promise<void> {
    await this.page.goto(this.kbnUrl.get(`${spacePrefix(spaceId)}/app/management/kibana/objects`));
  }

  /** Waits for the saved-objects table to render at least one row. */
  async waitForTableLoaded(): Promise<void> {
    await this.table.waitFor({ state: 'visible' });
    await expect(this.page.testSubj.locator('savedObjectsTableRowTitle')).not.toHaveCount(0);
  }

  /** Navigates directly to the SOM inspect view for a specific saved object. */
  async gotoInspect(type: string, id: string, spaceId?: string): Promise<void> {
    await this.page.goto(
      this.kbnUrl.get(`${spacePrefix(spaceId)}/app/management/kibana/objects/${type}/${id}`)
    );
  }

  /** Reads the full Monaco editor model (bypasses viewport virtualisation). */
  async getCodeEditorValue(): Promise<string> {
    await this.codeEditor.waitFor({ state: 'visible' });
    return this.codeEditorWrapper.getCodeEditorValue();
  }

  /** Visible row titles in the table, stripped of EuiLink trailing glyphs. */
  async getRowTitles(): Promise<string[]> {
    await this.waitForTableLoaded();
    const texts = await this.page.testSubj.locator('savedObjectsTableRowTitle').allInnerTexts();
    return texts.map((text) => text.split('\n')[0].trim());
  }

  /** Types into the search bar and waits for the table to refilter. */
  async searchFor(query: string): Promise<void> {
    await this.searchBar.fill('');
    await this.searchBar.fill(query);
    await this.searchBar.press('Enter');
    await this.waitForTableLoaded();
  }

  /** Imports an .ndjson file via the SOM "Import" flow with overwrite enabled. */
  async importFile(absoluteFilePath: string): Promise<void> {
    await this.importTrigger.click();
    // EuiFilePicker has no stable test-subj; drive its underlying input directly.
    await this.page.locator('input[type="file"][accept=".ndjson"]').setInputFiles(absoluteFilePath);
    await this.importSubmit.click();
    await this.importSuccess.waitFor({ state: 'visible', timeout: 30_000 });
    await this.importDone.click();
    await this.table.waitFor({ state: 'visible' });
  }

  /** Opens the row context menu for the given title and clicks "Inspect". */
  async clickInspectByTitle(title: string): Promise<void> {
    const menu = await this.openRowContextMenu(title);
    await menu.locator('[data-test-subj="savedObjectsTableAction-inspect"]').click();
  }

  /** Opens the row context menu for the given title and clicks "Copy to space". */
  async clickCopyToSpaceByTitle(title: string): Promise<void> {
    const menu = await this.openRowContextMenu(title);
    await menu
      .locator('[data-test-subj="savedObjectsTableAction-copy_saved_objects_to_space"]')
      .click();
  }

  /** Clicks the inspect-view delete button and confirms the modal. */
  async deleteFromInspect(): Promise<void> {
    await this.inspectDeleteButton.waitFor({ state: 'visible' });
    await this.inspectDeleteButton.click();
    const confirmTitle = this.page.testSubj.locator('confirmModalTitleText');
    await confirmTitle.waitFor({ state: 'visible' });
    await this.page.testSubj.locator('confirmModalConfirmButton').click();
    await confirmTitle.waitFor({ state: 'hidden' });
  }

  private async openRowContextMenu(title: string): Promise<Locator> {
    // `filter({ hasText })` keeps titles with punctuation matchable.
    const titleLocator = this.page.testSubj
      .locator('savedObjectsTableRowTitle')
      .filter({ hasText: title });
    const row = this.page
      .locator('[data-test-subj~="savedObjectsTableRow"]')
      .filter({ has: titleLocator });
    await row.waitFor({ state: 'visible' });
    await row.locator('[data-test-subj="euiCollapsedItemActionsButton"]').click();
    const menuPanel = this.page.locator('.euiContextMenuPanel');
    await menuPanel.waitFor({ state: 'visible' });
    return menuPanel;
  }
}
