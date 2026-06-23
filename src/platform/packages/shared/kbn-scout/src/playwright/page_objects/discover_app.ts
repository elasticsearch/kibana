/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Download } from 'playwright-core';
import type { Locator } from '../../..';
import type { ScoutPage } from '..';
import { expect } from '..';
import { KibanaCodeEditorWrapper } from '../ui_components';
import { DataViewEditorPage } from './data_view_editor_page';
import { resolveSelector } from '../utils/locator_helper';

const DISCOVER_QUERY_MODE_KEY = 'discover.defaultQueryMode';

export type DiscoverQueryMode = 'esql' | 'classic';

export interface DiscoverGotoOptions {
  queryMode?: DiscoverQueryMode;
}

export interface DataViewOptions {
  /** Data view title; `*` is appended automatically by the editor. */
  name: string;
  /** Create a temporary ("ad hoc") data view via "Explore" instead of saving. */
  adHoc?: boolean;
}

export class DiscoverApp {
  public readonly codeEditor: KibanaCodeEditorWrapper;

  constructor(private readonly page: ScoutPage) {
    this.codeEditor = new KibanaCodeEditorWrapper(page);
  }

  async goto(options: DiscoverGotoOptions = {}) {
    if (options.queryMode) await this.setQueryMode(options.queryMode);

    await this.page.gotoApp('discover');
    await this.waitForDiscoverPage();
  }

  private async waitForDiscoverPage() {
    // Discover initialization in serverless CI environments regularly exceeds the default 10s,
    // likely due to additional plugin overhead and root profile resolution.
    await expect(this.page.testSubj.locator('dscPage')).toBeVisible({ timeout: 30_000 });
  }

  private async getVisibleDataViewSwitch() {
    const discoverSwitch = this.page.testSubj.locator('discover-dataView-switch-link');
    const fallbackSwitch = this.page.testSubj.locator('dataView-switch-link');

    // There should be exactly one visible data view switch.
    // If both are visible (bug), fail explicitly instead of picking one
    await expect(discoverSwitch.or(fallbackSwitch)).toBeVisible();

    const discoverVisible = await discoverSwitch.isVisible();
    const fallbackVisible = await fallbackSwitch.isVisible();

    if (discoverVisible === fallbackVisible) {
      throw new Error(
        `Expected exactly one data view switch link to be visible, but discover=${discoverVisible} fallback=${fallbackVisible}`
      );
    }

    return discoverVisible ? discoverSwitch : fallbackSwitch;
  }

  async selectDataView(name: string) {
    const dataViewSwitch = await this.getVisibleDataViewSwitch();
    const currentValue = await dataViewSwitch.innerText();
    if (currentValue === name) {
      return;
    }
    await dataViewSwitch.click();
    await expect(this.page.testSubj.locator('indexPattern-switcher')).toBeVisible();
    await this.page.testSubj.typeWithDelay('indexPattern-switcher--input', name);
    const matchingDataViewLocator = this.page.testSubj
      .locator('indexPattern-switcher')
      .locator(`[title="${name}"]`);
    if (await matchingDataViewLocator.isVisible()) {
      await matchingDataViewLocator.click();
    } else {
      await this.page.testSubj.locator('explore-matching-indices-button').click();
    }
    await expect(this.page.testSubj.locator('indexPattern-switcher')).toBeHidden();
    await this.waitUntilFieldListHasCountOfFields();
  }

  getSelectedDataView(): Locator {
    return this.page.testSubj
      .locator('discover-dataView-switch-link')
      .or(this.page.testSubj.locator('dataView-switch-link'));
  }

  /**
   * Returns the trimmed display name of the currently selected data view.
   */
  async getSelectedDataViewName(): Promise<string> {
    return (await this.getSelectedDataView().innerText()).trim();
  }

  private async fillAndSubmitDataViewEditor({ name, adHoc = false }: DataViewOptions) {
    const editor = new DataViewEditorPage(this.page);
    await this.page.testSubj.locator('indexPatternEditorFlyout').waitFor({ state: 'visible' });

    // FTR passes the base name and relies on the editor auto-appending `*` as the
    // user types. Scout sets the title verbatim (`fill`), so append the wildcard
    // here to preserve that contract (`name`, `* will be added automatically`).
    await editor.setTitle(name.endsWith('*') ? name : `${name}*`);

    // wait for timestamp options; default @timestamp applies.
    await editor.timestampField
      .and(this.page.locator('[data-is-loading="0"]'))
      .waitFor({ state: 'visible', timeout: 30_000 });

    if (adHoc) {
      await this.page.testSubj.click('exploreIndexPatternButton');
      await this.page.testSubj.locator('indexPatternEditorFlyout').waitFor({ state: 'hidden' });
    } else {
      await editor.save();
    }

    await this.waitUntilTabIsLoaded();
  }

  /**
   * Creates a new data view from the Discover search bar data-view switcher
   * (classic mode only). The editor appends `*` to the title automatically.
   */
  async createDataViewFromSearchBar(options: DataViewOptions) {
    const dataViewSwitch = await this.getVisibleDataViewSwitch();
    await dataViewSwitch.click();
    await this.page.testSubj.click('dataview-create-new');
    await this.fillAndSubmitDataViewEditor(options);
  }

  private async clickAppMenuItem(
    testId: string,
    { isInOverflowMenu }: { isInOverflowMenu?: boolean } = {}
  ) {
    const item = this.page.testSubj.locator(testId);
    if (!isInOverflowMenu && (await item.isVisible())) {
      await item.click();
      return;
    }
    const overflowButton = this.page.testSubj.locator('app-menu-overflow-button');
    const popover = this.page.testSubj.locator('app-menu-popover');

    // Dismiss any stale popovers
    if (await popover.isVisible()) {
      await overflowButton.click();
      await expect(popover).toBeHidden();
    }

    await expect(overflowButton).toBeVisible();
    await overflowButton.click();

    // If the click was consumed by closing a stale overlay, the popover won't be open.
    // Click the overflow button again if needed.
    const popoverOpened = await popover
      .waitFor({ state: 'visible', timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (!popoverOpened) {
      await overflowButton.click();
    }

    await expect(popover).toBeVisible();
    const menuItem = this.page.testSubj.locator(testId);
    await expect(menuItem).toBeVisible();
    await menuItem.click();
  }

  async clickNewSearch({ isInOverflowMenu }: { isInOverflowMenu?: boolean } = {}) {
    await this.clickAppMenuItem('discoverNewButton', { isInOverflowMenu });
    await this.page.testSubj.hover('dscHideSidebarButton'); // cancel tooltips
    await this.waitForDiscoverPage();
    await this.page.testSubj.waitForSelector('loadingSpinner', { state: 'hidden' });
  }

  async saveSearch(name: string) {
    await this.page.testSubj.click('discoverSaveButton');
    await this.page.testSubj.fill('savedObjectTitle', name);
    await this.page.testSubj.click('confirmSaveSavedObjectButton');
    await this.page.testSubj.waitForSelector('savedObjectSaveModal', { state: 'hidden' });
  }

  async saveSearchAsNew(name: string) {
    await this.page.testSubj.click('discoverSaveButton');
    await this.page.testSubj.fill('savedObjectTitle', name);
    const checkbox = this.page.testSubj.locator('saveAsNewCheckbox');
    if (!(await checkbox.isChecked())) {
      await checkbox.click();
    }
    await this.page.testSubj.click('confirmSaveSavedObjectButton');
    await this.page.testSubj.waitForSelector('savedObjectSaveModal', { state: 'hidden' });
  }

  /**
   * Save the currently rendered inline visualization (e.g. an ES|QL chart) to a
   * brand-new dashboard via the "Save visualization" flow in the unified
   * histogram. Returns once the save modal has closed.
   */
  async saveVisualizationToNewDashboard(visName: string) {
    await this.page.testSubj.click('unifiedHistogramSaveVisualization');
    await expect(this.page.testSubj.locator('savedObjectSaveModal')).toBeVisible();
    await this.page.testSubj.fill('savedObjectTitle', visName);
    // Clicking the EuiRadio wrapper does not toggle the underlying input
    // reliably; clicking the associated label does.
    await this.page.locator('label[for="new-dashboard-option"]').click();
    await this.page.testSubj.click('confirmSaveSavedObjectButton');
    await expect(this.page.testSubj.locator('savedObjectSaveModal')).toBeHidden();
  }

  async waitUntilFieldListHasCountOfFields() {
    await this.page.testSubj.waitForSelector('fieldListGroupedAvailableFields-countLoading', {
      state: 'hidden',
    });
  }

  /**
   * Returns the number of fields shown in the sidebar "Available fields" group.
   */
  async getSidebarAvailableFieldCount(): Promise<number> {
    await this.waitUntilFieldListHasCountOfFields();
    const count = await this.page.testSubj.innerText('fieldListGroupedAvailableFields-count');
    return Number(count);
  }

  /**
   * Filters the sidebar field list by the given search term.
   */
  async searchFieldInSidebar(name: string) {
    await this.page.testSubj.fill('fieldListFiltersFieldSearch', name);
  }

  /**
   * Assert that the "Selected fields" sidebar group contains exactly the
   * fields named in `expected` — no more, no less. Useful for verifying ES|QL
   * `KEEP` clauses or any explicit column-selection flow.
   */
  async expectSelectedSidebarFieldsToEqual(expected: readonly string[]) {
    await this.waitUntilFieldListHasCountOfFields();
    const selectedFields = this.page.testSubj.locator('fieldListGroupedSelectedFields');
    await expect(selectedFields).toBeVisible();

    const entries = selectedFields.getByTestId(/^dscFieldListPanelField-/);
    await expect(entries).toHaveCount(expected.length);

    for (const field of expected) {
      await expect(selectedFields.getByTestId(`dscFieldListPanelField-${field}`)).toBeVisible();
    }
  }

  async waitForHistogramRendered() {
    await this.page.testSubj.waitForSelector('unifiedHistogramRendered');
  }

  /**
   * Returns the rendered height (rounded to whole pixels) of the fixed histogram panel
   * Rounding avoids sub-pixel noise so callers can assert exact resize deltas.
   */
  async getHistogramHeight(): Promise<number> {
    const histogram = this.page.testSubj.locator('unifiedHistogramResizablePanelFixed');
    await histogram.waitFor();
    const box = await histogram.boundingBox();
    if (!box) {
      throw new Error('Could not read the histogram panel bounding box');
    }
    return Math.round(box.height);
  }

  /**
   * Drags the histogram resize handle vertically by `distance` pixels (positive
   * grows the histogram).
   * Neither Scout nor Playwright has a drag-by-offset helper (Scout's
   * `testSubj.dragTo` only drags element-to-element), so we drive the mouse
   * manually.
   */
  async resizeHistogramBy(distance: number) {
    const resizeButton = this.page.testSubj.locator('unifiedHistogramResizableButton');
    await resizeButton.waitFor();
    const box = await resizeButton.boundingBox();
    if (!box) {
      throw new Error('Could not read the histogram resize handle bounding box');
    }
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX, startY + distance, { steps: 10 });
    await this.page.mouse.up();
  }

  async getCurrentQueryName(): Promise<string> {
    const breadcrumb = this.page.testSubj.locator('breadcrumb last');
    return await breadcrumb.innerText();
  }

  async loadSavedSearch(searchName: string) {
    await this.clickAppMenuItem('discoverOpenButton');
    await this.page.testSubj.waitForSelector('loadSearchForm', { state: 'visible' });

    // Filter for the search
    const searchInput = this.page.testSubj.locator('savedObjectFinderSearchInput');
    await searchInput.fill(`"${searchName.replace('-', ' ')}"`);

    // Click the saved search
    const savedSearchId = searchName.split(' ').join('-');
    await this.page.testSubj.click(`savedObjectTitle${savedSearchId}`);
    await this.waitUntilSearchingHasFinished();
  }

  async getHitCountInt(): Promise<number> {
    const hitCount = await this.page.testSubj.innerText('discoverQueryHits');
    return parseInt(hitCount.replace(/,/g, ''), 10);
  }

  async getChartTimespan(): Promise<string> {
    // Wait until the attribute no longer contains "Loading"
    const element = this.page.testSubj.locator('unifiedHistogramChart');
    await expect(element).not.toHaveAttribute('data-time-range', /Loading/);

    return (await element.getAttribute('data-time-range')) ?? '';
  }

  async clickHistogramBar() {
    const canvas = this.page.locator('[data-test-subj="unifiedHistogramChart"] canvas');
    // Click at the center of the canvas
    await canvas.click();
  }

  async waitUntilSearchingHasFinished() {
    // Give the grid-updating indicator a brief window to appear. Without this,
    // `waitForSelector({ state: 'hidden' })` returns immediately when the
    // indicator hasn't yet mounted — callers would then observe pre-search
    // state (e.g. request-count assertions reading 0 before the search fires).
    try {
      await this.page.testSubj.waitForSelector('discoverDataGridUpdating', {
        state: 'visible',
        timeout: 2_000,
      });
    } catch {
      // Indicator never appeared — assume nothing was in flight.
    }
    await this.page.testSubj.waitForSelector('discoverDataGridUpdating', {
      state: 'hidden',
      timeout: 30_000,
    });
  }

  // Waits for a Discover tab to finish loading.
  async waitUntilTabIsLoaded() {
    await this.waitForDiscoverPage();
    await this.waitUntilSearchingHasFinished();
  }

  // Waits for the document table to be fully rendered and stable
  async waitForDocTableRendered() {
    const table = this.page.testSubj.locator('discoverDocTable');
    const minDurationMs = 2_000;
    const pollIntervalMs = 100;
    const totalTimeoutMs = 30_000;

    await expect(table).toBeVisible({ timeout: totalTimeoutMs });

    let stableSince: number | null = null;

    await expect
      .poll(
        async () => {
          const attr = await table.getAttribute('data-render-complete');
          const now = Date.now();

          if (attr === 'true') {
            if (!stableSince) {
              stableSince = now;
            }
            const elapsed = now - stableSince;
            return elapsed >= minDurationMs;
          } else {
            // Reset if it flips to anything other than 'true'
            stableSince = null;
            return false;
          }
        },
        {
          message: `data-render-complete did not stay 'true' for ${minDurationMs}ms`,
          timeout: totalTimeoutMs,
          intervals: [pollIntervalMs],
        }
      )
      .toBe(true);
  }

  async openDocumentDetails({ rowIndex }: { rowIndex: number }) {
    const expandButton = this.page.locator(
      `[data-grid-visible-row-index="${rowIndex}"] [data-test-subj="docTableExpandToggleColumn"]`
    );

    // Ensure button stable after grid render (catches row shifts)
    await expect(expandButton).toBeVisible();

    // Scroll to, hover, and click the expand button
    await expandButton.scrollIntoViewIfNeeded();
    await expandButton.hover();
    await expandButton.click({ delay: 50 });
  }

  async waitForDocViewerFlyoutOpen() {
    const docViewer = this.page.testSubj.locator('kbnDocViewer');
    await expect(docViewer).toBeVisible({ timeout: 30_000 });
  }

  async openAndWaitForDocViewerFlyout({ rowIndex }: { rowIndex: number }) {
    await this.openDocumentDetails({ rowIndex });
    await this.waitForDocViewerFlyoutOpen();
  }

  /**
   * Close the Discover document-viewer flyout and wait for it to disappear.
   */
  async closeDocViewerFlyout() {
    await this.page.testSubj.click('euiFlyoutCloseButton');
    await this.page.testSubj.waitForSelector('kbnDocViewer', { state: 'hidden' });
  }

  /**
   * Hover the given data-grid cell and click its "expand" action, opening the
   * cell-value popover (which embeds a Monaco editor with the row JSON).
   *
   * @param rowIndex - 0-based visible row index.
   * @param columnId - EUI data-grid column id (e.g. `_source`, `@timestamp`).
   */
  async expandGridCell({ rowIndex, columnId }: { rowIndex: number; columnId: string }) {
    const cell = this.page.locator(
      `[data-grid-visible-row-index="${rowIndex}"] [data-gridcell-column-id="${columnId}"]`
    );
    await cell.hover();
    await cell.locator('[data-test-subj="euiDataGridCellExpandButton"]').click();
    await this.page.testSubj.waitForSelector('euiDataGridExpansionPopover', { state: 'visible' });
  }

  /**
   * Inside an open document-viewer flyout, toggle the grid column for `fieldName`
   * from the field-table tab. Calling this twice on the same field toggles it off.
   */
  async toggleColumnInDocViewer(fieldName: string) {
    const flyout = this.page.testSubj.locator('docViewerFlyout');
    await expect(async () => {
      const nameElement = flyout.locator(`[data-test-subj="tableDocViewRow-${fieldName}-name"]`);
      await nameElement.evaluate((el) => {
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
      });
      await nameElement.hover();
      const toggle = flyout.locator(`[data-test-subj="toggleColumnButton-${fieldName}"]`);
      await toggle.waitFor({ state: 'visible' });
      await toggle.scrollIntoViewIfNeeded();
      await toggle.click();
    }).toPass({ timeout: 15_000 });
  }

  /**
   * Read JSON from the active Monaco source editor (cell expansion popover, or doc
   * flyout after the JSON tab is selected). Retries until the model is non-empty —
   * the wrapper can return `''` before the document attaches.
   */
  async readMonacoJson(): Promise<{ _id: string } & Record<string, unknown>> {
    let parsed: { _id: string } & Record<string, unknown> = { _id: '' };
    await expect(async () => {
      const raw = await this.codeEditor.getCodeEditorValue();
      if (!raw) {
        throw new Error('Monaco editor has not rendered a value yet');
      }
      parsed = JSON.parse(raw);
    }).toPass({ timeout: 30_000 });
    return parsed;
  }

  async getDocTableIndex(index: number): Promise<string> {
    const rowIndex = index - 1; // Convert to 0-based index
    const row = this.page.locator(`[data-grid-row-index="${rowIndex}"]`);
    return await row.innerText();
  }

  async getDocTableField(index: number): Promise<string> {
    const rowIndex = index - 1;
    await this.page.testSubj.click('dataGridFullScreenButton');
    const row = this.page.locator(`[data-grid-row-index="${rowIndex}"]`);
    const text = await row.innerText();
    await this.page.testSubj.click('dataGridFullScreenButton');
    return text.trim();
  }

  async getChartInterval(): Promise<string> {
    const button = this.page.testSubj.locator('unifiedHistogramTimeIntervalSelectorButton');
    return (await button.getAttribute('data-selected-value')) || '';
  }

  /**
   * Pick a histogram chart interval (e.g. `"Day"`).
   */
  async setChartInterval(intervalTitle: string) {
    await this.page.testSubj.click('unifiedHistogramTimeIntervalSelectorButton');
    await this.page.testSubj.waitForSelector('unifiedHistogramTimeIntervalSelectorSelectable', {
      state: 'visible',
    });
    await this.page
      .locator(
        `[data-test-subj="unifiedHistogramTimeIntervalSelectorSelectable"] .euiSelectableListItem[title="${intervalTitle}"]`
      )
      .click();
    await this.page.testSubj.waitForSelector('unifiedHistogramTimeIntervalSelectorSelectable', {
      state: 'hidden',
    });
  }

  /**
   * Click the histogram breakdown selector and pick `field` (or `"No breakdown"`).
   */
  async chooseBreakdownField(field: string) {
    await this.page.testSubj.click('unifiedHistogramBreakdownSelectorButton');
    await this.page.testSubj.waitForSelector('unifiedHistogramBreakdownSelectorSelectable', {
      state: 'visible',
    });
    await this.page.testSubj.fill('unifiedHistogramBreakdownSelectorSelectorSearch', field);
    await this.page
      .locator(
        `[data-test-subj="unifiedHistogramBreakdownSelectorSelectable"] .euiSelectableListItem[value="${field}"]`
      )
      .click();
    await this.page.testSubj.waitForSelector('unifiedHistogramBreakdownSelectorSelectable', {
      state: 'hidden',
    });
  }

  /**
   * Returns the label currently shown on the histogram breakdown selector button
   * (e.g. `"Breakdown by geo.src"` or `"No breakdown"`.
   */
  async getBreakdownFieldValue(): Promise<string> {
    return this.page.testSubj.innerText('unifiedHistogramBreakdownSelectorButton');
  }

  async expandTimeRangeAsSuggestedInNoResultsMessage() {
    const button = this.page.testSubj.locator('discoverNoResultsViewAllMatches');
    await button.click();
    await this.waitUntilSearchingHasFinished();
  }

  async revertUnsavedChanges() {
    // Click the secondary button on the split save button
    await this.page.testSubj.click('discoverSaveButton-secondary-button');

    // Wait for popover and revert
    const revertButton = this.page.testSubj.locator('revertUnsavedChangesButton');
    await expect(revertButton).toBeVisible();
    await revertButton.click();

    await this.waitUntilSearchingHasFinished();
  }

  getColumnHeader(name: string): Locator {
    return this.page.testSubj.locator(`dataGridHeaderCell-${name}`);
  }

  public readonly controls = {
    getControlFrame: (controlId: string): Locator =>
      this.page.locator(`[data-test-subj='control-frame']:has([data-control-id='${controlId}'])`),
    getControlFrameSelectedValue: (controlId: string, value: string): Locator =>
      this.controls.getControlFrame(controlId).getByText(value),
  };

  async clickFieldSort(field: string, sortOption: string) {
    const header = this.getColumnHeader(field);
    await header.click();
    await this.page.testSubj.waitForSelector(`dataGridHeaderCellActionGroup-${field}`, {
      state: 'visible',
    });
    await this.page.locator(`button:has-text("${sortOption}")`).click();
  }

  async getDocHeader(): Promise<string[]> {
    const headers = await this.page
      .locator(
        '.euiDataGridHeaderCell:not(.euiDataGridHeaderCell--controlColumn) .euiDataGridHeaderCell__content'
      )
      .allInnerTexts();
    return headers.map((h) => h.trim());
  }

  /**
   * Returns structured row data from the data grid, excluding control columns.
   * Each inner array contains the visible text of each data cell in that row.
   * When `isAnchorRow` is true, only the highlighted anchor row (context view) is returned.
   */
  async getDataGridRows(options?: { isAnchorRow?: boolean }): Promise<string[][]> {
    const cellSelector = options?.isAnchorRow
      ? '.euiDataGridRowCell.unifiedDataTable__cell--highlight'
      : '.euiDataGridRowCell';

    await this.page.locator(`${cellSelector} >> nth=0`).waitFor({
      state: 'visible',
      timeout: 30_000,
    });

    return this.page.evaluate((sel: string) => {
      const cells = document.querySelectorAll(sel);
      const rows: string[][] = [];
      let rowIdx = -1;
      let prevVisibleRowIndex = -1;

      cells.forEach((cell) => {
        const visibleRowIndex = Number(cell.getAttribute('data-gridcell-visible-row-index'));
        if (prevVisibleRowIndex !== visibleRowIndex) {
          rowIdx++;
          rows[rowIdx] = [];
          prevVisibleRowIndex = visibleRowIndex;
        }
        if (!cell.classList.contains('euiDataGridRowCell--controlColumn')) {
          const content =
            cell.querySelector<HTMLElement>('.euiDataGridRowCell__content') ??
            (cell as HTMLElement);
          rows[rowIdx].push(content.innerText.trim());
        }
      });

      return rows;
    }, cellSelector);
  }

  async showChart() {
    await this.page.testSubj.click('dscShowHistogramButton');
  }

  async hideChart() {
    await this.page.testSubj.click('dscHideHistogramButton');
  }

  async expectXYVisChartVisible() {
    await expect(this.page.testSubj.locator('xyVisChart')).toBeVisible();
  }

  async navigateToLensEditor() {
    await this.page.testSubj.click('unifiedHistogramEditVisualization');
  }

  async getTheColumnFromGrid(): Promise<string[]> {
    const columnLocators = await this.page.testSubj.locator('unifiedDataTableColumnTitle').all();
    return await Promise.all(columnLocators.map((locator) => locator.innerText()));
  }

  async writeAndSubmitKqlQuery(query: string) {
    const currentMode = await this.getCurrentQueryMode();

    if (currentMode !== 'classic') {
      throw new Error(
        `writeAndSubmitKqlQuery requires Discover to be in classic mode, but the current mode is "${currentMode}".`
      );
    }

    await this.page.testSubj.fill('queryInput', query);
    await expect(this.page.testSubj.locator('queryInput')).toHaveValue(query);
    await this.submitQuery();
    await this.waitUntilSearchingHasFinished();
  }

  async dragFieldToGrid(fieldName: string[]) {
    const gridLocator = this.page.testSubj.locator('euiDataGridBody');
    for (const field of fieldName) {
      // Fields can appear in both "Popular fields" and the full field list.
      await resolveSelector(this.page, `field-${field}`).dragTo(gridLocator);
    }
  }

  async getFirstViewLensButtonFromFieldStatistics(): Promise<Locator> {
    const viewButtons: Locator[] = await this.page.testSubj
      .locator('dataVisualizerActionViewInLensButton')
      .all();
    await expect(viewButtons[0]).toBeVisible();
    return viewButtons[0];
  }

  async exportAsCsv(): Promise<Download> {
    // Export may live in the top nav or the overflow menu depending on viewport / Discover layout.
    await this.clickAppMenuItem('exportTopNavButton');
    await this.page.testSubj.click('exportMenuItem-CSV');

    // 2. Trigger the report generation
    await this.page.testSubj.click('generateReportButton');

    // 3. Explicitly wait for the report to finish generating
    // Ensure the button is ready before we try to download
    const downloadBtn = this.page.testSubj.locator('downloadCompletedReportButton');
    await expect(downloadBtn).toBeEnabled({
      timeout: 30_000,
    });

    // 4. Coordinate the click and the event listener
    const [download] = await Promise.all([
      this.page.waitForEvent('download'), // Set listener
      downloadBtn.click(), // Perform action
    ]);

    return download;
  }

  async moveColumn(fieldName: string, direction: 'left' | 'right') {
    await this.page.testSubj.hover(`dataGridHeaderCell-${fieldName}`);
    await this.page.testSubj.click(`dataGridHeaderCellActionButton-${fieldName}`);
    await this.page.getByText(`Move ${direction}`).click();
  }

  async selectTextBaseLang() {
    const currentMode = await this.getCurrentQueryMode();

    if (currentMode !== 'esql') {
      await this.page.testSubj.click('select-text-based-language-btn');
    }

    await this.waitUntilSearchingHasFinished();
    await this.codeEditor.waitCodeEditorReady('ESQLEditor');
  }

  async writeAndSubmitEsqlQuery(query: string) {
    await this.selectTextBaseLang();
    await this.codeEditor.setCodeEditorValue(query);
    await this.submitQuery();
    await this.waitUntilSearchingHasFinished();
  }

  /**
   * Submits the current query (classic search bar or ES|QL editor) by clicking
   * the query submit button. Does not wait for results — pair with
   * `waitUntilSearchingHasFinished()` or `waitUntilTabIsLoaded()` as appropriate.
   */
  async submitQuery() {
    await this.page.testSubj.click('querySubmitButton');
  }

  async waitForDataGridRowWithRefresh(rowLocator: Locator, timeout = 30_000) {
    await this.submitQuery();
    await this.waitUntilSearchingHasFinished();
    await rowLocator.waitFor({ state: 'visible', timeout });
  }

  public get esqlMenuPopover(): Locator {
    return this.page.testSubj.locator('esql-menu-popover');
  }

  async openRecommendedQueriesPanel() {
    const menuPopover = this.esqlMenuPopover;
    if (!(await menuPopover.isVisible())) {
      await this.page.testSubj.click('esql-help-popover-button');
    }

    await menuPopover.waitFor({ state: 'visible' });

    const recommendedQueriesButton = this.page.testSubj.locator('esql-recommended-queries');
    await expect(recommendedQueriesButton).toBeVisible();
    await recommendedQueriesButton.click();
    await this.page.testSubj.locator('contextMenuPanelTitleButton').waitFor({ state: 'visible' });
  }

  async runRecommendedEsqlQuery(queryLabel: string) {
    await this.openRecommendedQueriesPanel();

    const queryOption = this.esqlMenuPopover.getByRole('menuitem', {
      exact: true,
      name: queryLabel,
    });

    await expect(queryOption).toBeVisible();
    await queryOption.click();
    await this.waitUntilSearchingHasFinished();
  }

  async getEsqlQueryValue(nthIndex: number = 0): Promise<string> {
    return this.codeEditor.getCodeEditorValue(nthIndex);
  }

  async addBreakdownFieldFromSidebar(
    field: string,
    section: 'selected' | 'available' = 'available'
  ) {
    const sidebarToggleButton = this.page.testSubj.locator('discover-sidebar-fields-button');
    if (await sidebarToggleButton.isVisible()) {
      await sidebarToggleButton.click();
    }

    await this.waitUntilFieldListHasCountOfFields();

    const sectionTestSubj =
      section === 'selected' ? 'fieldListGroupedSelectedFields' : 'fieldListGroupedAvailableFields';
    const fieldLocator = this.page.testSubj
      .locator(sectionTestSubj)
      .locator(`[data-test-subj="field-${field}"]`);
    await fieldLocator.hover();
    await fieldLocator.click();
    await this.waitUntilFieldPopoverIsLoaded();

    await this.page.testSubj.locator(`fieldPopoverHeader_addBreakdownField-${field}`).click();
    await this.waitUntilSearchingHasFinished();
  }

  private async waitUntilFieldPopoverIsLoaded() {
    await this.page.locator('[data-popover-open="true"]').waitFor({ state: 'visible' });
    await expect(this.page.locator('[data-test-subj*="-statsLoading"]')).toBeHidden();
  }

  /**
   * Scrolls through the virtualized doc table grid to assert that the given
   * text exists somewhere in the rendered rows. Necessary because virtual
   * scrolling only keeps a subset of rows in the DOM at any time.
   */
  async expectDocTableToContainText(text: string) {
    // 200px per step × 50 steps = 10 000px of total scroll coverage,
    // enough for grids with hundreds of rows at default row height (~34px).
    const SCROLL_STEP_PX = 200;
    const MAX_SCROLL_STEPS = 50;
    // Per-position timeout: long enough for Playwright to retry through
    // transient re-renders, short enough to not stall at positions where
    // the text genuinely isn't in the DOM.
    const PER_POSITION_TIMEOUT_MS = 500;

    await this.waitUntilSearchingHasFinished();
    const docTable = this.page.testSubj.locator('discoverDocTable');
    await expect(docTable).toBeVisible();

    const grid = docTable.locator('.euiDataGrid__virtualized');
    await grid.evaluate((el) => el.scrollTo(0, 0));

    for (let i = 0; i < MAX_SCROLL_STEPS; i++) {
      try {
        await expect(docTable).toContainText(text, { timeout: PER_POSITION_TIMEOUT_MS });
        return;
      } catch {
        // Text not found at this scroll position, continue scrolling
      }

      const atBottom = await grid.evaluate((el, step) => {
        if (el.scrollTop + el.clientHeight >= el.scrollHeight) return true;
        el.scrollBy(0, step);
        return false;
      }, SCROLL_STEP_PX);
      if (atBottom) break;
    }

    await expect(docTable).toContainText(text);
  }

  /**
   * Persists the requested Discover query mode in localStorage on the next
   * page load. Useful to make tests resilient to the `discover.isEsqlDefault`
   * feature flag being toggled at the project level.
   *
   * Note: this is not idempotent. Each call registers an additional init
   * script via Playwright's `addInitScript`, and on subsequent page loads
   * every registered script runs in order, so the value written by the
   * last call wins. Avoid calling it multiple times in the same test
   * unless that stacking behavior is intentional.
   */
  public setQueryMode(mode: DiscoverQueryMode) {
    return this.page.addInitScript(
      ([_mode, _discoverQueryModeKey]) => {
        window.localStorage.setItem(_discoverQueryModeKey, JSON.stringify(_mode));
      },
      [mode, DISCOVER_QUERY_MODE_KEY]
    );
  }

  /**
   * Detects whether Discover is currently rendering ES|QL or classic
   * (KQL + data view) mode by racing the two mode-specific anchors:
   * the ES|QL editor and the classic KQL `queryInput`.
   */
  async getCurrentQueryMode(): Promise<DiscoverQueryMode> {
    const esqlEditor = this.page.testSubj.locator('ESQLEditor');
    const classicQueryInput = this.page.testSubj.locator('queryInput');

    // Wait until one of the two mode-specific anchors is rendered
    await expect(esqlEditor.or(classicQueryInput)).toBeVisible();

    // Return the mode that is currently visible
    return (await esqlEditor.isVisible()) ? 'esql' : 'classic';
  }

  async isShowingDocViewer(): Promise<boolean> {
    try {
      await this.page.testSubj
        .locator('kbnDocViewer')
        .waitFor({ state: 'visible', timeout: 30_000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Inside an open document-viewer flyout, type a field name into the search
   * input to filter the fields table. Mirrors the FTR
   * `discover.findFieldByNameOrValueInDocViewer`.
   */
  async findFieldByNameOrValueInDocViewer(name: string) {
    const flyout = this.page.testSubj.locator('docViewerFlyout');
    const searchInput = flyout.locator('[data-test-subj="unifiedDocViewerFieldsSearchInput"]');
    await searchInput.fill(name);
    await expect(searchInput).toHaveValue(name, { timeout: 5_000 });
  }

  /**
   * Inside an open document-viewer flyout, click a cell-level action button
   * for a given field (e.g. `addFilterForValueButton`, `addExistsFilterButton`).
   * Mirrors the FTR `dataGrid.clickFieldActionInFlyout`.
   */
  async clickFieldActionInFlyout(fieldName: string, actionName: string) {
    const isValueAction = ['addFilterForValueButton', 'addFilterOutValueButton'].includes(
      actionName
    );
    const cellTestSubj = isValueAction
      ? `tableDocViewRow-${fieldName}-value`
      : `tableDocViewRow-${fieldName}-name`;

    const flyout = this.page.testSubj.locator('docViewerFlyout');
    await expect(async () => {
      const cell = flyout.locator(`[data-test-subj="${cellTestSubj}"]`);
      await cell.evaluate((el) => {
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
      });
      await cell.hover();

      const actionBtn = flyout.locator(`[data-test-subj="${actionName}-${fieldName}"]`);
      await actionBtn.waitFor({ state: 'visible' });
      await actionBtn.click();
    }).toPass({ timeout: 15_000 });
  }
}
