/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator } from '../../../..';
import { expect } from '../..';
import { resolveSelector } from '../../utils';
import { type DataViewOptions } from './base';
import { SaveMixin } from './save';

/**
 * Layout controls — data-view switcher, field editor, sidebar, histogram, document table,
 * and other visual/interaction helpers that belong to Discover's own UI surface.
 * Will be progressively carved out to owner page objects in later PRs.
 */
export abstract class LayoutMixin extends SaveMixin {
  // ── Data view switcher ─────────────────────────────────────────────────────

  private async getVisibleDataViewSwitch() {
    const discoverSwitch = this.page.testSubj.locator('discover-dataView-switch-link');
    const fallbackSwitch = this.page.testSubj.locator('dataView-switch-link');

    // There should be exactly one visible data view switch.
    // If both are visible (bug), fail explicitly instead of picking one
    await this.page
      .locator(
        '[data-test-subj="discover-dataView-switch-link"], [data-test-subj="dataView-switch-link"]'
      )
      .waitFor({ state: 'visible' });

    const discoverVisible = await discoverSwitch.isVisible();
    const fallbackVisible = await fallbackSwitch.isVisible();

    if (discoverVisible === fallbackVisible) {
      throw new Error(
        `Expected exactly one data view switch link to be visible, but discover=${discoverVisible} fallback=${fallbackVisible}`
      );
    }

    return discoverVisible ? discoverSwitch : fallbackSwitch;
  }

  private async openDataViewSwitcher() {
    const dataViewSwitch = await this.getVisibleDataViewSwitch();
    await this.hideTabPreview();
    await dataViewSwitch.click();
  }

  async selectDataView(
    name: string,
    {
      createAdHocIfMissing = true,
      waitForFieldList = true,
    }: { createAdHocIfMissing?: boolean; waitForFieldList?: boolean } = {}
  ) {
    const dataViewSwitch = await this.getVisibleDataViewSwitch();
    const currentValue = await dataViewSwitch.innerText();
    if (currentValue === name) {
      return;
    }
    await this.hideTabPreview();
    await dataViewSwitch.click();
    const switcher = this.page.testSubj.locator('indexPattern-switcher');
    await switcher.waitFor({ state: 'visible' });
    await this.page.testSubj.typeWithDelay('indexPattern-switcher--input', name);
    const matchingDataViewLocator = switcher.locator(`[data-test-subj="dataView-${name}"]`);
    if (!createAdHocIfMissing) {
      // Let Playwright wait for the filtered option to render instead of checking visibility
      // immediately after the final keystroke.
      await matchingDataViewLocator.click();
    } else if (await matchingDataViewLocator.isVisible()) {
      await matchingDataViewLocator.click();
    } else {
      await this.page.testSubj.locator('explore-matching-indices-button').click();
    }
    await switcher.waitFor({ state: 'hidden' });
    if (waitForFieldList) {
      await this.waitUntilFieldListHasCountOfFields();
    }
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
    // Minimal inline interaction with the data view editor flyout. The full
    // `DataViewEditorPage` object lives in the `data_view_editor` plugin, but
    // `kbn-scout` is a base package and must not depend on a plugin, so the few
    // steps Discover needs are driven directly here.
    const flyout = this.page.testSubj.locator('indexPatternEditorFlyout');
    const form = this.page.testSubj.locator('indexPatternEditorForm');
    const titleInput = this.page.testSubj.locator('createIndexPatternTitleInput');
    const timestampField = this.page.testSubj.locator('timestampField');

    await flyout.waitFor({ state: 'visible' });

    // FTR passes the base name and relies on the editor auto-appending `*` as the
    // user types. Scout sets the title verbatim (`fill`), so append the wildcard
    // here to preserve that contract (`name`, `* will be added automatically`).
    const title = name.endsWith('*') ? name : `${name}*`;
    const timestampCombo = this.page.components.comboBox('timestampField');

    await titleInput.waitFor({ state: 'visible', timeout: 30_000 });

    await expect(async () => {
      await titleInput.fill('');
      await titleInput.fill(title);
      // wait for async title validation to settle before continuing.
      await form
        .and(this.page.locator('[data-validation-error="0"]'))
        .waitFor({ state: 'visible' });

      // Wait for an actual selection rather than only `data-is-loading="0"`: that is also the
      // field's initial state, so on its own it cannot tell "options loaded" apart from
      // "loading has not started". Submitting too early still passes validation, but creates
      // the data view with no time field, so no time filter is applied and hit counts include
      // documents outside the selected range.
      await expect
        .poll(
          async () => {
            const isLoading = await timestampField.getAttribute('data-is-loading');
            if (isLoading !== '0') {
              return false;
            }
            return (await timestampCombo.getSelectedOptions()).length > 0;
          },
          { timeout: 15_000, intervals: [200] }
        )
        .toBe(true);

      await this.page.testSubj.click(
        adHoc ? 'exploreIndexPatternButton' : 'saveIndexPatternButton'
      );

      await expect(this.getSelectedDataView()).toHaveText(title, { timeout: 20_000 });
    }).toPass({ timeout: 45_000, intervals: [0] });

    await this.waitUntilTabIsLoaded();
  }

  /**
   * Creates a new data view from the Discover search bar data-view switcher
   * (classic mode only). The editor appends `*` to the title automatically.
   */
  async createDataViewFromSearchBar(options: DataViewOptions) {
    await this.openDataViewSwitcher();
    await this.page.testSubj.click('dataview-create-new');
    await this.fillAndSubmitDataViewEditor(options);
  }

  async createDataViewFromNoDataPrompt(options: DataViewOptions) {
    await this.page.testSubj.click('createDataViewButton');
    await this.fillAndSubmitDataViewEditor(options);
  }

  async getAvailableDataViewsFromSearchBar(): Promise<string[]> {
    await this.openDataViewSwitcher();
    const switcher = this.page.testSubj.locator('indexPattern-switcher');
    await switcher.waitFor({ state: 'visible' });

    const dataViews = await switcher
      .locator('.euiSelectableListItem[data-test-subj^="dataView-"]')
      .evaluateAll((items) =>
        items
          .map((item) => item.getAttribute('data-test-subj')?.slice('dataView-'.length))
          .filter((name): name is string => Boolean(name))
      );

    await this.page.keyboard.press('Escape');
    await switcher.waitFor({ state: 'hidden' });

    return dataViews;
  }

  async isCurrentDataViewAdHoc(): Promise<boolean> {
    const dataViewSwitch = await this.getVisibleDataViewSwitch();
    const dataViewTitle = await dataViewSwitch.getAttribute('title');

    if (!dataViewTitle) {
      throw new Error('Current data view switch is missing a title attribute');
    }

    await this.openDataViewSwitcher();
    const switcher = this.page.testSubj.locator('indexPattern-switcher');
    await switcher.waitFor({ state: 'visible' });
    const isAdHoc = await this.page.testSubj
      .locator(`dataViewItemTempBadge-${dataViewTitle}`)
      .isVisible();
    await this.page.keyboard.press('Escape');
    await switcher.waitFor({ state: 'hidden' });

    return isAdHoc;
  }

  async editCurrentDataViewName(
    name: string,
    { withConfirmation = false }: { withConfirmation?: boolean } = {}
  ) {
    await this.openDataViewSwitcher();
    await this.page.testSubj.click('indexPattern-manage-field');
    const flyout = this.page.testSubj.locator('indexPatternEditorFlyout');
    await flyout.waitFor({ state: 'visible' });
    const nameInput = this.page.testSubj.locator('createIndexPatternNameInput');
    await nameInput.fill(name);
    await expect(nameInput).toHaveValue(name);
    await this.page.testSubj.click('saveIndexPatternButton');
    if (withConfirmation) {
      const confirmButton = this.page.testSubj.locator('confirmModalConfirmButton');
      await confirmButton.waitFor({ state: 'visible' });
      await confirmButton.click();
    }
    await flyout.waitFor({ state: 'hidden', timeout: 30_000 });
    await this.waitUntilTabIsLoaded();
  }

  async editDataViewFromSearchBar({
    newIndexPattern,
    newTimeField,
  }: {
    newIndexPattern?: string;
    newTimeField?: string;
  }) {
    await this.openDataViewSwitcher();
    await this.page.testSubj.click('indexPattern-manage-field');

    const flyout = this.page.testSubj.locator('indexPatternEditorFlyout');
    await flyout.waitFor({ state: 'visible' });

    if (newIndexPattern) {
      const titleInput = this.page.testSubj.locator('createIndexPatternTitleInput');
      await titleInput.fill(newIndexPattern);
      const form = this.page.testSubj.locator('indexPatternEditorForm');
      await form
        .and(this.page.locator('[data-validation-error="0"]'))
        .waitFor({ state: 'visible' });
    }

    if (newTimeField) {
      const timestampField = this.page.testSubj.locator('timestampField');
      await timestampField
        .and(this.page.locator('[data-is-loading="0"]'))
        .waitFor({ state: 'visible', timeout: 30_000 });
      await this.page.components.comboBox('timestampField').setSelectedOptions([newTimeField]);
    }

    await this.page.testSubj.click('saveIndexPatternButton');

    const confirmButton = this.page.testSubj.locator('confirmModalConfirmButton');
    const confirmVisible = await confirmButton
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (confirmVisible) {
      await confirmButton.click();
    }

    await flyout.waitFor({ state: 'hidden', timeout: 30_000 });
    await this.waitUntilTabIsLoaded();
  }

  // ── Runtime field / field editor helpers ───────────────────────────────────

  async createRuntimeField({
    fieldName,
    script,
    popularity,
  }: {
    fieldName: string;
    script: string;
    popularity?: number;
  }) {
    await this.openDataViewSwitcher();
    await this.page.testSubj.click('indexPattern-add-field');
    const fieldEditor = this.page.getByRole('dialog', { name: 'Create field' });
    await fieldEditor.waitFor({ state: 'visible' });

    await fieldEditor.getByRole('textbox', { name: 'Name field' }).fill(fieldName);
    await fieldEditor.getByRole('switch', { name: 'Set value' }).click();
    await fieldEditor
      .getByRole('textbox', { name: /Editor content/ })
      .waitFor({ state: 'visible' });
    await this.codeEditor.setCodeEditorValue(script);

    if (typeof popularity === 'number') {
      await this.setPopularity(popularity);
    }

    await fieldEditor.getByRole('button', { name: 'Save' }).click();
    await fieldEditor.waitFor({ state: 'hidden' });
    await this.waitUntilTabIsLoaded();
  }

  async getCurrentDataViewId(): Promise<string> {
    const currentUrl = this.page.url();
    const matches = [...currentUrl.matchAll(/dataViewId:[^,]*/g)];
    const ids = matches.map(([m]) =>
      decodeURIComponent(m).replace('dataViewId:', '').replaceAll("'", '')
    );
    if (!ids.length) {
      throw new Error(
        `Discover URL state doesn't contain a dataViewId reference. URL: ${currentUrl}`
      );
    }
    const first = ids[0];
    if (!ids.every((id) => id === first)) {
      throw new Error('Discover URL state contains different dataViewId references.');
    }
    return first;
  }

  async deleteRuntimeField(fieldName: string) {
    // The field may appear in multiple sidebar sections (Popular + Available);
    // scope to Available fields to avoid strict-mode violations.
    const fieldItem = this.page.testSubj
      .locator('fieldListGroupedAvailableFields')
      .locator(`[data-test-subj="field-${fieldName}"]`);
    await fieldItem.waitFor({ state: 'visible' });
    await fieldItem.click();
    await this.page.locator('[data-popover-open="true"]').waitFor({ state: 'visible' });
    await this.page.testSubj.click(`discoverFieldListPanelDelete-${fieldName}`);
    const confirmModal = this.page.testSubj.locator('runtimeFieldDeleteConfirmModal');
    await confirmModal.waitFor({ state: 'visible' });
    await this.page.testSubj.typeWithDelay('deleteModalConfirmText', 'remove');
    await this.page.testSubj.click('confirmModalConfirmButton');
    await confirmModal.waitFor({ state: 'hidden' });
    await this.waitUntilTabIsLoaded();
  }

  async renameRuntimeField(newFieldName: string) {
    const fieldEditor = this.page.getByRole('dialog', { name: /Edit .* field/ });
    await fieldEditor.waitFor({ state: 'visible' });

    await fieldEditor.getByRole('textbox', { name: 'Name field' }).fill(newFieldName);
    await this.page.testSubj.click('fieldSaveButton');
    await this.page.testSubj.fill('saveModalConfirmText', 'change');
    await this.page.testSubj.click('confirmModalConfirmButton');
    await fieldEditor.waitFor({ state: 'hidden' });
    await this.waitUntilTabIsLoaded();
  }

  async setPopularity(popularity: number) {
    await this.page.testSubj.click('toggleAdvancedSetting');
    const row = this.page.testSubj.locator('popularityRow');
    await row.locator('[data-test-subj="toggle"]').click();
    await this.page.testSubj.locator('editorFieldCount').fill(String(popularity));
  }

  async setCustomLabel(label: string, { enableToggle = false }: { enableToggle?: boolean } = {}) {
    const row = this.page.testSubj.locator('customLabelRow');
    await row.waitFor({ state: 'visible' });
    if (enableToggle) {
      await row.locator('[data-test-subj="toggle"]').click();
    }
    const input = row.locator('input');
    await input.waitFor({ state: 'visible' });
    await input.fill(label);
  }

  async setCustomDescription(
    description: string,
    { enableToggle = false }: { enableToggle?: boolean } = {}
  ) {
    const row = this.page.testSubj.locator('customDescriptionRow');
    await row.waitFor({ state: 'visible' });
    if (enableToggle) {
      await row.locator('[data-test-subj="toggle"]').click();
    }
    const input = row.locator('textarea, input');
    await input.fill(description);
  }

  getCustomDescriptionFormError(): Locator {
    return this.page.testSubj.locator('customDescriptionRow').locator('.euiFormErrorText');
  }

  async saveOpenFieldEditor({ confirmChange = false }: { confirmChange?: boolean } = {}) {
    const fieldEditor = this.page.testSubj.locator('fieldEditor');
    await fieldEditor.waitFor({ state: 'visible' });
    await this.page.testSubj.click('fieldSaveButton');
    if (confirmChange) {
      const confirmButton = this.page.testSubj.locator('confirmModalConfirmButton');
      await this.page.testSubj.fill('saveModalConfirmText', 'change');
      await confirmButton.waitFor({ state: 'visible' });
      await confirmButton.click();
    }
    await fieldEditor.waitFor({ state: 'hidden' });
    await this.waitUntilTabIsLoaded();
  }

  async discardOpenFieldEditorChanges() {
    const fieldEditor = this.page.testSubj.locator('fieldEditor');
    await fieldEditor.waitFor({ state: 'visible' });
    await this.page.testSubj.click('closeFlyoutButton');
    const confirmButton = this.page.testSubj.locator('confirmModalConfirmButton');
    await confirmButton.click();
    await fieldEditor.waitFor({ state: 'hidden' });
  }

  // ── ES|QL controls ─────────────────────────────────────────────────────────

  /**
   * Creates an ES|QL control from the editor: types a query ending in a variable position,
   * picks "Create control" from the suggestion widget and saves the flyout. Returns once
   * the control group is rendered.
   */
  async createEsqlControl(
    query: string,
    {
      variableName,
      label,
      values,
    }: { variableName?: string; label?: string; values?: string[] } = {}
  ) {
    // Monaco registers its text model only once the editor has mounted, and the ES|QL
    // editor can still be mounting after the tab reports loaded, for instance right after
    // adding a new Discover panel. Setting a value or triggering suggestions before then
    // has no model to act on.
    await this.codeEditor.waitCodeEditorReady('ESQLEditor');
    await this.codeEditor.setCodeEditorValue(query);
    await this.codeEditor.triggerSuggest(query);

    const suggestionWidget = this.codeEditor.getCodeEditorSuggestWidget();
    await suggestionWidget.waitFor({ state: 'visible' });
    await suggestionWidget.locator('.monaco-list-row', { hasText: 'Create control' }).click();

    const flyout = this.page.testSubj.locator('create_esql_control_flyout');
    await flyout.waitFor({ state: 'visible' });

    if (variableName !== undefined) {
      await this.page.testSubj.fill('esqlVariableName', variableName);
    }
    if (label !== undefined) {
      await this.page.testSubj.fill('esqlControlLabel', label);
    }
    if (values) {
      await this.page.testSubj.locator('esqlControlTypeDropdown').click();
      await this.page.testSubj.locator('staticValues').click();
      const valuesComboBox = this.page.components.comboBox('esqlValuesOptions');
      for (const value of values) {
        await valuesComboBox.setCustomSelectedOptions([value]);
      }
    }

    // Save stays disabled until `available_options` is populated (see `formIsInvalid` in
    // esql/public/triggers/esql_controls/control_flyout/index.tsx), and the click waits for
    // it to become enabled. That means waiting on the control's own ES|QL query rather than
    // on rendering, so query latency sets the budget.
    await this.page.testSubj.locator('saveEsqlControlsFlyoutButton').click({ timeout: 30_000 });
    await flyout.waitFor({ state: 'hidden' });
    await this.page.testSubj.locator('controls-group-wrapper').waitFor({ state: 'visible' });
  }

  public readonly controls = {
    getControlFrame: (controlId: string): Locator =>
      this.page.locator(`[data-test-subj='control-frame']:has([data-control-id='${controlId}'])`),
    getControlFrameSelectedValue: (controlId: string, value: string): Locator =>
      this.controls.getControlFrame(controlId).getByText(value),
    /**
     * Locator for an options-list control's selected-values label, e.g. `AE` for a
     * single selection or `AE, CN` for multiple. Unlike
     * {@link getControlFrameSelectedValue} this matches the whole label, so it can
     * assert that a value is the *only* selection.
     */
    getSelectionsLocator: (controlId: string): Locator =>
      this.page.testSubj
        .locator(`optionsList-control-${controlId}`)
        .getByTestId('optionsListSelections'),
  };

  // ── Sidebar ────────────────────────────────────────────────────────────────

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

  async openSidebar() {
    await this.page.testSubj.locator('dscShowSidebarButton').click();
    await this.waitUntilFieldListHasCountOfFields();
  }

  async closeSidebar() {
    await this.page.testSubj.locator('dscHideSidebarButton').click();
    await this.page.testSubj.locator('fieldList').waitFor({ state: 'hidden' });
  }

  async isSidebarPanelOpen(): Promise<boolean> {
    return this.page.testSubj
      .locator('fieldList')
      .waitFor({ state: 'visible', timeout: 1_000 })
      .then(() => true)
      .catch(() => false);
  }

  async getSidebarWidth(): Promise<number> {
    const sidebar = this.page.testSubj.locator('discover-sidebar');
    await sidebar.waitFor({ state: 'visible' });
    const box = await sidebar.boundingBox();
    if (!box) {
      throw new Error('Unable to measure Discover sidebar width');
    }
    return Math.round(box.width);
  }

  async resizeSidebarBy(distance: number) {
    const resizeButton = this.page.testSubj.locator('discoverLayoutResizableButton');
    await resizeButton.waitFor({ state: 'visible' });
    const box = await resizeButton.boundingBox();
    if (!box) {
      throw new Error('Unable to find Discover sidebar resize handle');
    }
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX + distance, startY, { steps: 10 });
    await this.page.mouse.up();
  }

  private async waitUntilFieldPopoverIsLoaded() {
    await this.page.locator('[data-popover-open="true"]').waitFor({ state: 'visible' });
    await expect(this.page.locator('[data-test-subj*="-statsLoading"]')).toBeHidden();
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

  // ── Histogram ──────────────────────────────────────────────────────────────

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

  getHistogramChart(): Locator {
    return this.page.testSubj.locator('unifiedHistogramChart');
  }

  async getChartTimespan(): Promise<string> {
    // Wait until the attribute no longer contains "Loading"
    const element = this.getHistogramChart();
    await expect(element).not.toHaveAttribute('data-time-range', /Loading/);

    return (await element.getAttribute('data-time-range')) ?? '';
  }

  async getHistogramSuggestionType(): Promise<string | null> {
    const chart = this.page.testSubj.locator('unifiedHistogramChart');
    await chart.waitFor({ state: 'visible' });
    return chart.getAttribute('data-suggestion-type');
  }

  async clickHistogramBar() {
    const canvas = this.page.locator('[data-test-subj="unifiedHistogramChart"] canvas');
    // Click at the center of the canvas
    await canvas.click();
  }

  /**
   * Brushes a short range on the histogram canvas. Offsets match the FTR
   * `brushHistogram` gesture so the selected window stays comparable.
   */
  async brushHistogram() {
    const canvas = this.page.locator('[data-test-subj="unifiedHistogramChart"] canvas');
    await canvas.waitFor({ state: 'visible' });
    const box = await canvas.boundingBox();
    if (!box) {
      throw new Error('Could not read the histogram canvas bounding box');
    }
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await this.page.mouse.move(centerX - 300, centerY + 20);
    await this.page.mouse.down();
    await this.page.mouse.move(centerX - 100, centerY + 30, { steps: 10 });
    await this.page.mouse.up();
  }

  async getHistogramLegendLabels(): Promise<string[]> {
    const labels = this.getHistogramChart().locator('.echLegendItem__label');
    return (await labels.allInnerTexts()).map((text) => text.trim()).filter(Boolean);
  }

  async clickLegendFilter(field: string, type: '+' | '-') {
    const filterType = type === '+' ? 'filterIn' : 'filterOut';
    await this.page.testSubj.click(`legend-${field}`);
    await this.page.testSubj.click(`legend-${field}-${filterType}`);
  }

  getChartIntervalWarningIcon(): Locator {
    return this.page.testSubj.locator('unifiedHistogramIntervalWarning');
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
   * `value` is the selectable item value when it differs from the visible label.
   */
  async chooseBreakdownField(field: string, value = field) {
    await this.page.testSubj.click('unifiedHistogramBreakdownSelectorButton');
    await this.page.testSubj.waitForSelector('unifiedHistogramBreakdownSelectorSelectable', {
      state: 'visible',
    });
    await this.page.testSubj.fill('unifiedHistogramBreakdownSelectorSelectorSearch', field);
    await expect(
      this.page.testSubj.locator('unifiedHistogramBreakdownSelectorSelectable')
    ).toHaveAttribute('data-is-searching', 'false');
    await this.page
      .locator(
        `[data-test-subj="unifiedHistogramBreakdownSelectorSelectable"] .euiSelectableListItem[value="${value}"]`
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
    const visibleText = await this.page.testSubj.innerText(
      'unifiedHistogramBreakdownSelectorButton'
    );

    // The button label truncates long field names via an absolutely positioned
    // overlay, which the browser's visible-text computation renders as if it
    // were on its own line. Collapse that whitespace since it isn't visible on screen.
    return visibleText.replace(/\s+/g, ' ').trim();
  }

  /**
   * Clears the histogram breakdown field by selecting the "No breakdown" option.
   */
  async clearBreakdownField() {
    await this.chooseBreakdownField('No breakdown', '__EMPTY_SELECTOR_OPTION__');
  }

  async showChart() {
    const showButton = this.page.testSubj.locator('dscShowHistogramButton');
    if (await showButton.isVisible()) {
      await showButton.click();
      await this.waitUntilTabIsLoaded();
    }
  }

  async hideChart() {
    const hideButton = this.page.testSubj.locator('dscHideHistogramButton');
    if (await hideButton.isVisible()) {
      await hideButton.click();
      await this.waitUntilTabIsLoaded();
    }
  }

  async navigateToLensEditor() {
    await this.page.testSubj.click('unifiedHistogramEditVisualization');
  }

  async openLensEditFlyout() {
    await this.page.testSubj.locator('unifiedHistogramEditFlyoutVisualization').click();
    await this.getLensEditFlyout().waitFor({ state: 'visible' });
  }

  getLensEditFlyout(): Locator {
    return this.page.testSubj.locator('lnsChartSwitchPopover');
  }

  async expectXYVisChartVisible() {
    await expect(this.page.testSubj.locator('xyVisChart')).toBeVisible();
  }

  // ── Document table ─────────────────────────────────────────────────────────

  async showTable() {
    await this.page.testSubj.click('dscShowTableButton');
    await this.waitUntilTabIsLoaded();
  }

  async hideTable() {
    await this.page.testSubj.click('dscHideTableButton');
    await this.waitUntilTabIsLoaded();
  }

  getHitCountLocator(): Locator {
    return this.page.testSubj.locator('discoverQueryHits');
  }

  async getHitCountInt(): Promise<number> {
    const hitCount = await this.getHitCountLocator().innerText();
    return parseInt(hitCount.replace(/,/g, ''), 10);
  }

  async getHitCount(): Promise<string> {
    return this.getHitCountLocator().innerText();
  }

  getRefreshDataButton(): Locator {
    return this.page.testSubj.locator('refreshDataButton');
  }

  getQueryInEsqlButton(): Locator {
    return this.page.testSubj.locator('queryInEsqlButton');
  }

  getQuerySubmitButton(): Locator {
    return this.page.testSubj.locator('querySubmitButton');
  }

  getQueryCancelButton(): Locator {
    return this.page.testSubj.locator('queryCancelButton');
  }

  getSearchResponseWarningsEmptyPrompt(): Locator {
    return this.page.testSubj.locator('searchResponseWarningsEmptyPrompt');
  }

  async getSearchFetchCount(): Promise<number> {
    const fetchCounter = this.page.locator('[data-fetch-counter]');
    await fetchCounter.waitFor({ state: 'attached' });
    return Number(await fetchCounter.getAttribute('data-fetch-counter'));
  }

  getErrorCalloutTitle(): Locator {
    return this.page.testSubj.locator('discoverErrorCalloutTitle');
  }

  getErrorCalloutMessage(): Locator {
    return this.page.testSubj.locator('discoverErrorCalloutMessage');
  }

  async getDocTableIndex(index: number): Promise<string> {
    const rowIndex = index - 1; // Convert to 0-based index
    const row = this.page.locator(`[data-grid-row-index="${rowIndex}"]`);
    return await row.innerText();
  }

  getSearchTermHighlights(): Locator {
    return this.page.testSubj.locator('docTable').locator('mark');
  }

  async getDocTableField(index: number): Promise<string> {
    const rowIndex = index - 1;
    await this.page.testSubj.click('dataGridFullScreenButton');
    const row = this.page.locator(`[data-grid-row-index="${rowIndex}"]`);
    const text = await row.innerText();
    await this.page.testSubj.click('dataGridFullScreenButton');
    return text.trim();
  }

  getDocHeaderLabels(): Locator {
    return this.page.locator(
      '.euiDataGridHeaderCell:not(.euiDataGridHeaderCell--controlColumn) .euiDataGridHeaderCell__content'
    );
  }

  async getDocHeader(): Promise<string[]> {
    const headers = await this.getDocHeaderLabels().allInnerTexts();
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

  async moveColumn(fieldName: string, direction: 'left' | 'right') {
    await this.dataGrid.openColumnMenuByField(fieldName);
    await this.page.getByText(`Move ${direction}`).click();
  }

  async dragFieldToGrid(fieldName: string[]) {
    const gridLocator = this.page.testSubj.locator('euiDataGridBody');
    for (const field of fieldName) {
      // Fields can appear in both "Popular fields" and the full field list.
      await resolveSelector(this.page, `field-${field}`).dragTo(gridLocator);
    }
  }

  /**
   * Drags a sidebar field onto the grid using the keyboard, mirroring the FTR
   * `dragFieldWithKeyboardToTable` implementation.
   */
  async dragFieldToGridWithKeyboard(fieldName: string) {
    const keyboardHandler = this.page.locator(
      `[data-attr-field="${fieldName}"] [data-test-subj="domDragDrop-keyboardHandler"]`
    );
    await keyboardHandler.focus();
    await this.page.keyboard.press('Enter'); // enter DnD mode
    // domDroppable_overlay renders when DnD is active — use it as a sync point
    await this.page.testSubj.locator('domDroppable_overlay').waitFor({ state: 'visible' });
    await this.page.keyboard.press('ArrowRight'); // move to first drop target (the grid)
    await this.page.keyboard.press('Enter'); // drop
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

  // ── Misc view helpers ──────────────────────────────────────────────────────

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

  async selectFieldStatisticsView() {
    await this.page.testSubj.click('dscViewModeToggleButton');
    await this.page.testSubj.locator('dscViewModeToggleSelectable').waitFor({ state: 'visible' });
    await this.page.testSubj.click('dscViewModeFieldStatsOption');
  }

  async getFirstViewLensButtonFromFieldStatistics(): Promise<Locator> {
    const viewButtons: Locator[] = await this.page.testSubj
      .locator('dataVisualizerActionViewInLensButton')
      .all();
    await expect(viewButtons[0]).toBeVisible();
    return viewButtons[0];
  }

  async expandTimeRangeAsSuggestedInNoResultsMessage() {
    const button = this.page.testSubj.locator('discoverNoResultsViewAllMatches');
    await button.click();
    await this.waitUntilSearchingHasFinished();
  }

  async getTheColumnFromGrid(): Promise<string[]> {
    const columnLocators = await this.page.testSubj.locator('unifiedDataTableColumnTitle').all();
    return await Promise.all(columnLocators.map((locator) => locator.innerText()));
  }
}
