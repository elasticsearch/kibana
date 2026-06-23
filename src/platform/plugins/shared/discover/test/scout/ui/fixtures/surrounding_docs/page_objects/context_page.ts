/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import rison from '@kbn/rison';
import type { Locator, ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

const CONTEXT_LOAD_TIMEOUT = 30_000;

const DEFAULT_INITIAL_STATE = {
  columns: ['@message'],
};

export class ContextPage {
  public readonly predecessorsLoadMoreButton: Locator;
  public readonly successorsLoadMoreButton: Locator;
  public readonly predecessorsCountPicker: Locator;
  public readonly successorsCountPicker: Locator;
  public readonly docTable: Locator;
  public readonly rows: Locator;

  constructor(private readonly page: ScoutPage) {
    this.predecessorsLoadMoreButton = page.testSubj.locator('predecessorsLoadMoreButton');
    this.successorsLoadMoreButton = page.testSubj.locator('successorsLoadMoreButton');
    this.predecessorsCountPicker = page.testSubj.locator('predecessorsCountPicker');
    this.successorsCountPicker = page.testSubj.locator('successorsCountPicker');
    this.docTable = page.testSubj.locator('discoverDocTable');
    this.rows = this.docTable.locator('[data-grid-row-index]');
  }

  async navigateTo(dataViewId: string, anchorId: string, overrideInitialState = {}) {
    const initialState = rison.encode({
      ...DEFAULT_INITIAL_STATE,
      ...overrideInitialState,
    });

    await this.page.gotoApp('discover', {
      hash: `/context/${dataViewId}/${anchorId}?_a=${initialState}`,
    });
    await this.waitUntilContextLoadingHasFinished();
  }

  async waitUntilContextLoadingHasFinished() {
    await this.predecessorsLoadMoreButton.waitFor({
      state: 'visible',
      timeout: CONTEXT_LOAD_TIMEOUT,
    });
    await this.successorsLoadMoreButton.waitFor({
      state: 'visible',
      timeout: CONTEXT_LOAD_TIMEOUT,
    });
    // no waitFor equivalent for "enabled"; expect is intentional sync, not assertion
    await expect(this.predecessorsLoadMoreButton).toBeEnabled({
      timeout: CONTEXT_LOAD_TIMEOUT,
    });
    await expect(this.successorsLoadMoreButton).toBeEnabled({ timeout: CONTEXT_LOAD_TIMEOUT });
  }

  async clickPredecessorLoadMoreButton() {
    await this.predecessorsLoadMoreButton.click();
    await this.waitUntilContextLoadingHasFinished();
  }

  async clickSuccessorLoadMoreButton() {
    await this.successorsLoadMoreButton.click();
    await this.waitUntilContextLoadingHasFinished();
  }

  async getPredecessorCountPickerValue(): Promise<string> {
    return (await this.predecessorsCountPicker.getAttribute('value')) ?? '';
  }

  async getSuccessorCountPickerValue(): Promise<string> {
    return (await this.successorsCountPicker.getAttribute('value')) ?? '';
  }

  async setPredecessorCount(count: number) {
    await this.predecessorsCountPicker.click({ clickCount: 3 });
    await this.predecessorsCountPicker.fill(String(count));
    await this.predecessorsCountPicker.press('Enter');
    await this.waitUntilContextLoadingHasFinished();
  }

  async setSuccessorCount(count: number) {
    await this.successorsCountPicker.click({ clickCount: 3 });
    await this.successorsCountPicker.fill(String(count));
    await this.successorsCountPicker.press('Enter');
    await this.waitUntilContextLoadingHasFinished();
  }

  async getDocumentNumber(): Promise<number> {
    const attr = await this.docTable.getAttribute('data-document-number');
    return Number(attr);
  }

  async openRowActions(rowIndex: number) {
    const row = this.page.locator(`[data-grid-visible-row-index="${rowIndex}"]`);
    const expandButton = row.locator(
      '[data-test-subj="docTableExpandToggleColumn"], [data-test-subj="docTableExpandToggleColumnAnchor"]'
    );
    await expect(expandButton).toBeVisible();
    await expandButton.scrollIntoViewIfNeeded();
    await expandButton.click();
  }

  async viewSurroundingDocs(rowIndex: number) {
    await this.openRowActions(rowIndex);
    await this.clickRowAction(1);
    await this.waitUntilContextLoadingHasFinished();
  }

  async viewSingleDocument(rowIndex: number) {
    await this.openRowActions(rowIndex);
    await this.clickRowAction(0);
    await this.page.testSubj
      .locator('doc-hit')
      .waitFor({ state: 'visible', timeout: CONTEXT_LOAD_TIMEOUT });
  }

  async goBackToDiscover() {
    await this.page.testSubj.click('~breadcrumb-deepLinkId-discover');
    await this.page.testSubj
      .locator('dscPage')
      .waitFor({ state: 'visible', timeout: CONTEXT_LOAD_TIMEOUT });
  }

  async getAnchorRowData(): Promise<string[]> {
    const anchorCellSelector =
      '.euiDataGridRowCell.unifiedDataTable__cell--highlight:not(.euiDataGridRowCell--controlColumn)';
    await this.page
      .locator(`${anchorCellSelector} >> nth=0`)
      .waitFor({ state: 'visible', timeout: CONTEXT_LOAD_TIMEOUT });
    return this.page.locator(anchorCellSelector).evaluateAll((cells) =>
      cells.map((cell) => {
        const content =
          cell.querySelector<HTMLElement>('.euiDataGridRowCell__content') ?? (cell as HTMLElement);
        return content.innerText.trim();
      })
    );
  }

  /**
   * Open the anchor row's doc-viewer flyout and activate the table tab.
   * Mirrors the FTR `dataGrid.clickRowToggle({ isAnchorRow: true })`.
   */
  async openAnchorDocViewer() {
    const anchorExpandBtn = this.page.testSubj.locator('docTableExpandToggleColumnAnchor');
    await anchorExpandBtn.click();

    await this.page.testSubj
      .locator('kbnDocViewer')
      .waitFor({ state: 'visible', timeout: CONTEXT_LOAD_TIMEOUT });

    await this.page.locator('#kbn_doc_viewer_tab_doc_view_table').click();
  }

  async openRowActionsForAnchor() {
    const expandButton = this.page.testSubj.locator('docTableExpandToggleColumnAnchor');
    await expect(expandButton).toBeVisible();
    await expandButton.scrollIntoViewIfNeeded();
    await expandButton.click();
  }

  async clickRowAction(actionIndex: number) {
    const flyout = this.page.testSubj.locator('docViewerFlyout');
    await expect(flyout).toBeVisible({ timeout: 10_000 });
    const actionButton = flyout.locator(
      `[data-test-subj="docTableRowAction"] >> nth=${actionIndex}`
    );
    await expect(actionButton).toBeVisible();
    await actionButton.click();
  }
}
