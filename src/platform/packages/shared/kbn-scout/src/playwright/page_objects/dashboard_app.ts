/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Download } from 'playwright-core';
import type { ScoutPage } from '..';
import { expect } from '..';
import { RenderablePage } from './renderable_page';
import { Toasts } from './toasts';

type CommonlyUsedTimeRange =
  | 'Today'
  | 'Last_15 minutes'
  | 'Last_1 hour'
  | 'Last_24 hours'
  | 'Last_30 days'
  | 'Last_90 days'
  | 'Last_1 year';

interface TimeoutOptions {
  timeout?: number;
}

const DEFAULT_SAVE_MODAL_TIMEOUT = 30_000;
const DEFAULT_LIBRARY_TIMEOUT = 30_000;

export class DashboardApp {
  private readonly renderable: RenderablePage;
  private readonly toasts: Toasts;
  // Dashboard shell and mode controls
  private readonly settingsFlyout;
  private readonly settingsButton;
  private readonly editModeButton;
  private readonly viewOnlyModeButton;
  private readonly dashboardViewport;
  private readonly editInDiscoverLink;
  private readonly embeddablePanel;
  private readonly controlsGroup;
  private readonly controlFrame;
  private readonly optionsListControlSearchInput;
  private readonly tryEsqlLink;

  // Add panel flow
  private readonly addTopNavButton;
  private readonly panelSelectionFlyout;
  private readonly panelSelectionSearchInput;

  // Save flows
  private readonly saveModal;
  private readonly savedObjectTitleInput;
  private readonly confirmSaveButton;
  private readonly quickSaveSecondaryButton;
  private readonly interactiveSaveMenuItem;
  /** Unsaved-changes badge on the save split button. */
  public readonly unsavedChangesIndicator;

  // Library flyout
  private readonly savedObjectsFinderTable;
  private readonly savedObjectFinderLoadingIndicator;
  private readonly savedObjectFinderSearchInput;
  private readonly addEmbeddableSuccess;
  private readonly savedSearchDocTable;

  // Markdown panel
  private readonly markdownEditorApplyButton;
  private readonly markdownRenderer;

  // ES|QL / Visualize editor actions
  private readonly applyFlyoutButton;
  private readonly visualizeSaveAndReturnButton;

  // Drilldown wizard
  private readonly drilldownWizardSubmit;

  // Customize panel flyout
  private readonly customizePanelFlyout;
  private readonly customizePanelSaveButton;
  private readonly customizePanelCancelButton;
  private readonly customizePanelTimeRangeQuickMenuButton;

  constructor(private readonly page: ScoutPage) {
    this.renderable = new RenderablePage(page);
    this.toasts = new Toasts(page);

    // Dashboard shell and mode controls
    this.settingsFlyout = this.page.testSubj.locator('dashboardSettingsFlyout');
    this.settingsButton = this.page.testSubj.locator('dashboardSettingsButton');
    this.editModeButton = this.page.testSubj.locator('dashboardEditMode');
    this.viewOnlyModeButton = this.page.testSubj.locator('dashboardViewOnlyMode');
    this.dashboardViewport = this.page.testSubj.locator('dshDashboardViewport');
    this.editInDiscoverLink = this.page.testSubj.locator(
      'discoverEmbeddableInlineEditEditInDiscoverLink'
    );
    this.embeddablePanel = this.page.testSubj.locator('embeddablePanel');
    this.controlsGroup = this.page.testSubj.locator('controls-group-wrapper');
    this.controlFrame = this.page.testSubj.locator('control-frame');
    this.optionsListControlSearchInput = this.page.testSubj.locator(
      'optionsList-control-search-input'
    );
    this.tryEsqlLink = this.page.testSubj.locator('tryESQLLink');

    // Add panel flow
    this.addTopNavButton = this.page.testSubj.locator('dashboardAddTopNavButton');
    this.panelSelectionFlyout = this.page.testSubj.locator('dashboardPanelSelectionFlyout');
    this.panelSelectionSearchInput = this.page.testSubj.locator(
      'dashboardPanelSelectionFlyout__searchInput'
    );

    // Save flows
    this.saveModal = this.page.testSubj.locator('savedObjectSaveModal');
    this.savedObjectTitleInput = this.page.testSubj.locator('savedObjectTitle');
    this.confirmSaveButton = this.page.testSubj.locator('confirmSaveSavedObjectButton');
    this.quickSaveSecondaryButton = this.page.testSubj.locator(
      'dashboardQuickSaveMenuItem-secondary-button'
    );
    this.interactiveSaveMenuItem = this.page.testSubj.locator('dashboardInteractiveSaveMenuItem');
    this.unsavedChangesIndicator = this.page.testSubj.locator(
      'split-button-notification-indicator'
    );

    // Library flyout
    this.savedObjectsFinderTable = this.page.testSubj.locator('savedObjectsFinderTable');
    this.savedObjectFinderLoadingIndicator = this.page.testSubj.locator(
      'savedObjectFinderLoadingIndicator'
    );
    this.savedObjectFinderSearchInput = this.page.testSubj.locator('savedObjectFinderSearchInput');
    this.addEmbeddableSuccess = this.page.testSubj.locator('addEmbeddableToDashboardSuccess');
    this.savedSearchDocTable = this.page.testSubj.locator('embeddedSavedSearchDocTable');

    // Markdown panel
    this.markdownEditorApplyButton = this.page.testSubj.locator('markdownEditorApplyButton');
    this.markdownRenderer = this.page.testSubj.locator('markdownRenderer');

    // ES|QL / Visualize editor actions
    this.applyFlyoutButton = this.page.testSubj.locator('applyFlyoutButton');
    this.visualizeSaveAndReturnButton = this.page.testSubj.locator('visualizesaveAndReturnButton');

    // Drilldown wizard
    this.drilldownWizardSubmit = this.page.testSubj.locator('drilldownWizardSubmit');

    // Customize panel flyout
    this.customizePanelFlyout = this.page.testSubj.locator('customizePanel');
    this.customizePanelSaveButton = this.page.testSubj.locator('saveCustomizePanelButton');
    this.customizePanelCancelButton = this.page.testSubj.locator('cancelCustomizePanelButton');
    this.customizePanelTimeRangeQuickMenuButton = this.page.testSubj.locator(
      'customizePanelTimeRangeDatePicker > superDatePickerToggleQuickMenuButton'
    );
  }

  async goto() {
    await this.page.gotoApp('dashboards');
  }

  async openDashboardWithId(
    id: string,
    opts: { waitForRender?: boolean } = { waitForRender: true }
  ) {
    await this.page.gotoApp('dashboards', { hash: `/view/${id}` });
    if (opts.waitForRender) {
      await this.waitForRenderComplete();
    }
  }

  /** Navigates to the new dashboard creation page and waits for the editor toolbar to load. */
  async openNewDashboard(options?: TimeoutOptions) {
    await this.page.gotoApp('dashboards', { hash: '/create' });
    await expect(this.addTopNavButton).toBeVisible({ timeout: options?.timeout ?? 20_000 });
  }

  async openTryEsqlDashboard() {
    await this.goto();
    await this.page.testSubj
      .locator('dashboardNoDataPageLoaded')
      .waitFor({ state: 'attached', timeout: 20_000 });
    await this.tryEsqlLink.click();
    await this.waitForPanelsToLoad(1);
  }

  private getSettingsFlyout() {
    return this.settingsFlyout;
  }

  async openSettingsFlyout() {
    // typically serverless projects
    if (await this.settingsButton.isVisible()) {
      await this.settingsButton.click();
    } else {
      // typically stateful deployments
      await this.page.getByRole('button', { name: 'Open dashboard settings' }).click();
    }
    await expect(this.getSettingsFlyout()).toBeVisible();
  }

  async toggleSyncColors(value: boolean) {
    const targetValue = value ? 'true' : 'false';
    const toggle = this.page.testSubj.locator('dashboardSyncColorsCheckbox');
    if ((await toggle.getAttribute('aria-checked')) !== targetValue) {
      await toggle.click();
    }
  }

  async applyDashboardSettings() {
    await this.page.testSubj.click('applyCustomizeDashboardButton');
    await expect(this.getSettingsFlyout()).toBeHidden();
  }

  // ============================================================
  // View Mode Methods
  // ============================================================

  /**
   * Checks if the dashboard is in view mode.
   */
  async getIsInViewMode(): Promise<boolean> {
    return this.editModeButton.isVisible();
  }

  /**
   * Switches the dashboard to edit mode.
   */
  async switchToEditMode() {
    await this.editModeButton.click();
    await this.waitForEditModeActive();
  }

  /**
   * Opens a dashboard by saved object id in edit mode via URL state.
   * Prefer this over the listing-page link when tests may end in the Lens editor.
   */
  async openDashboardWithIdInEditMode(id: string) {
    await this.page.gotoApp('dashboards', { hash: `/view/${id}?_a=(viewMode:edit)` });
    await this.waitForRenderComplete();
    await this.waitForEditModeActive();
  }

  private async waitForEditModeActive() {
    // Wait for edit mode to be active (drag handles appear).
    // Multiple drag handles are expected when multiple panels exist.
    await expect
      .poll(() => this.page.testSubj.locator('embeddablePanelDragHandle').count())
      .toBeGreaterThan(0);
  }

  /**
   * Clicks the cancel button to exit edit mode without saving.
   */
  async clickCancelOutOfEditMode() {
    await expect(this.viewOnlyModeButton).toBeVisible();
    await this.viewOnlyModeButton.click();
    await expect(this.editModeButton).toBeVisible();
  }

  async ensureViewMode() {
    if (!(await this.getIsInViewMode())) {
      await this.clickCancelOutOfEditMode();
    }
  }

  /**
   * Ensures the dashboard is in edit mode, switching from view mode if necessary.
   * Useful after flows (e.g. saving an ES|QL viz from Discover) that already
   * leave the dashboard in edit mode and therefore have no Edit button to click.
   */
  async ensureEditMode() {
    if (await this.getIsInViewMode()) {
      await this.switchToEditMode();
    }
  }

  /**
   * Opens the "Add panel" flyout for selecting panel types to add to the dashboard.
   */
  async openAddPanelFlyout(options?: TimeoutOptions) {
    await this.addTopNavButton.waitFor({ state: 'visible', timeout: options?.timeout ?? 10_000 });
    await this.addTopNavButton.click();
    await expect(this.panelSelectionFlyout).toBeVisible({ timeout: options?.timeout ?? 10_000 });
  }

  async saveDashboard(name: string, options?: TimeoutOptions) {
    await this.clickAppMenuItem('dashboardInteractiveSaveMenuItem');
    await this.savedObjectTitleInput.fill(name);
    await this.confirmSaveModal(options);
  }

  async confirmSaveModal(options?: TimeoutOptions) {
    await this.confirmSaveButton.click();
    await expect(this.saveModal).toBeHidden({
      timeout: options?.timeout ?? DEFAULT_SAVE_MODAL_TIMEOUT,
    });
  }

  private async clickAppMenuItem(testSubj: string) {
    const item = this.page.testSubj.locator(testSubj);
    if (!(await item.isVisible())) {
      await this.page.testSubj.click('app-menu-overflow-button');
    }
    await item.click();
  }

  async saveChangesToExistingDashboard() {
    await this.page.testSubj.click('dashboardQuickSaveMenuItem');
    await expect(this.page.testSubj.locator('dashboardQuickSaveMenuItem')).toBeDisabled();
  }

  async addPanelFromLibrary(...names: string[]) {
    await this.openLibraryFlyout();
    for (let i = 0; i < names.length; i++) {
      await this.savedObjectFinderSearchInput.clear();
      await this.savedObjectFinderSearchInput.type(names[i], { delay: 50 });
      await expect(this.savedObjectFinderLoadingIndicator).toBeHidden({
        timeout: DEFAULT_LIBRARY_TIMEOUT,
      });

      const titleButton = this.page.testSubj.locator(
        `savedObjectTitle${names[i].replace(/ /g, '-')}`
      );
      await expect(titleButton).toBeVisible({ timeout: DEFAULT_LIBRARY_TIMEOUT });
      await titleButton.click();

      // Strip whitespace only: the panel header builds this subject with
      // `replace(/\s/g, '')`, so titles keep their hyphens.
      await expect(
        this.page.testSubj.locator(`embeddablePanelHeading-${names[i].replace(/\s/g, '')}`)
      ).toBeVisible({ timeout: DEFAULT_LIBRARY_TIMEOUT });
    }
    await this.closeLibraryFlyout();
  }

  async clickQuickSave() {
    await expect(this.page.testSubj.locator('dashboardQuickSaveMenuItem')).toBeVisible();
    await this.page.testSubj.click('dashboardQuickSaveMenuItem');
  }

  async clearUnsavedChanges() {
    const unsavedBadge = this.page.testSubj.locator('dashboardUnsavedChangesBadge');
    if (await unsavedBadge.isVisible()) {
      await this.clickQuickSave();
      await expect(unsavedBadge).toBeHidden();
      await this.toasts.closeAll();
    }
  }

  // ============================================================
  // Library Panel Methods
  // ============================================================

  /**
   * Opens the "Add from library" flyout.
   */
  async openLibraryFlyout(options?: TimeoutOptions) {
    await this.addTopNavButton.click();
    await this.page.testSubj.click('addToDashboardTab-library');
    await expect(this.savedObjectsFinderTable).toBeVisible();
    await expect(this.savedObjectFinderLoadingIndicator).toBeHidden({
      timeout: options?.timeout ?? 30_000,
    });
  }

  /**
   * Closes the library flyout.
   */
  async closeLibraryFlyout() {
    await expect(this.savedObjectsFinderTable).toBeVisible();
    await this.page
      .locator('.euiFlyout', { has: this.savedObjectsFinderTable })
      .locator('[data-test-subj="euiFlyoutCloseButton"]')
      .click();
    await expect(this.savedObjectsFinderTable).toBeHidden();
  }

  /**
   * Searches and filters embeddables in the library flyout.
   * Uses Playwright's native type() to fire proper keyboard events.
   *
   * @param embeddableName - Name with dashes (e.g., 'Rendering-Test:-saved-search')
   * @param embeddableType - Optional type filter (e.g., 'search', 'Visualization')
   * @param options - Optional timeout overrides
   */
  private async filterEmbeddableNames(
    embeddableName: string,
    embeddableType?: string,
    options?: TimeoutOptions
  ) {
    // Build search query using type filter and quoted name.
    // type:(search) "Rendering Test:-saved-search" (only first dash replaced with space)
    const typePrefix = embeddableType ? `type:(${embeddableType}) ` : '';
    const searchQuery = `${typePrefix}"${embeddableName.replace('-', ' ')}"`;

    await this.savedObjectFinderSearchInput.click();
    await this.savedObjectFinderSearchInput.clear();
    // Use native type() which fires keydown/keyup/keypress events (not insertText)
    await this.savedObjectFinderSearchInput.type(searchQuery, { delay: 50 });

    // Wait for search results to load
    await expect(this.savedObjectFinderLoadingIndicator).toBeHidden({
      timeout: options?.timeout ?? 30_000,
    });
  }

  /**
   * Core method to add an embeddable from the library.
   *
   * @param embeddableName - Name with dashes (e.g., 'Rendering-Test:-saved-search')
   * @param embeddableType - Optional type filter (e.g., 'search', 'Visualization')
   * @param options - Optional timeout overrides
   */
  async addEmbeddable(embeddableName: string, embeddableType?: string, options?: TimeoutOptions) {
    await this.openLibraryFlyout(options);
    await this.filterEmbeddableNames(embeddableName, embeddableType, options);

    // Click on the saved object title
    const titleSelector = `savedObjectTitle${embeddableName.split(' ').join('-')}`;
    const titleButton = this.page.testSubj.locator(titleSelector);
    await expect(titleButton).toBeVisible();
    await titleButton.click();

    // Wait for success indicator
    await expect(this.addEmbeddableSuccess).toBeVisible();

    await this.closeLibraryFlyout();

    // Close "Added successfully" toast
    await this.toasts.closeAll();
  }

  /**
   * Adds a saved search to the dashboard.
   * Wrapper around addEmbeddable() with type='search'.
   *
   * @param searchName - Name with dashes (e.g., 'Rendering-Test:-saved-search')
   * @param options - Optional timeout overrides
   */
  async addSavedSearch(searchName: string, options?: TimeoutOptions) {
    return this.addEmbeddable(searchName, 'search', options);
  }

  /**
   * Adds a Lens visualization to the dashboard from the library.
   * Wrapper around addEmbeddable() with type='lens'.
   *
   * @param lensName - Name of the Lens saved object
   * @param options - Optional timeout overrides
   */
  async addLens(lensName: string, options?: TimeoutOptions) {
    return this.addEmbeddable(lensName, 'lens', options);
  }

  /**
   * Adds a new Markdown panel (by value) to the dashboard.
   *
   * @param content - Markdown content to save
   */
  async addMarkdownPanel(content: string) {
    await this.openAddPanelFlyout();
    await this.panelSelectionSearchInput.fill('Markdown text');
    await this.page.testSubj.click('create-action-Markdown text');

    const editorInput = this.page.locator('textarea[aria-label="Dashboard markdown editor"]');
    await expect(editorInput).toBeVisible();
    await editorInput.fill(content);
    await this.markdownEditorApplyButton.click();

    // Scope to the renderer containing the content we just typed; the dashboard may
    // already have other markdown panels, in which case an unfiltered `markdownRenderer`
    // locator would resolve to multiple elements and trip strict mode.
    await expect(this.markdownRenderer.filter({ hasText: content })).toBeVisible();
  }

  async addMapPanel() {
    await this.openAddPanelFlyout();
    await this.panelSelectionSearchInput.fill('Maps');
    await this.page.testSubj.click('create-action-Maps');
  }

  async customizePanel(options: {
    name: string;
    customTimeRageCommonlyUsed?: {
      value: CommonlyUsedTimeRange;
    };
  }) {
    await this.page.testSubj.hover(`embeddablePanelHeading-${options.name.replace(/ /g, '')}`);
    await this.page.testSubj.click('embeddablePanelAction-ACTION_CUSTOMIZE_PANEL');
    if (options.customTimeRageCommonlyUsed) {
      await this.page.testSubj.click('customizePanelShowCustomTimeRange');
      await this.customizePanelTimeRangeQuickMenuButton.click();
      await this.page.testSubj.click(
        `superDatePickerCommonlyUsed_${options.customTimeRageCommonlyUsed.value}`
      );
    }

    await this.customizePanelSaveButton.click();
    await expect(this.customizePanelSaveButton).toBeHidden();
  }

  async removePanel(name: string | 'embeddableError') {
    const panelHeaderTestSubj =
      name === 'embeddableError' ? name : `embeddablePanelHeading-${name.replace(/ /g, '')}`;
    await this.page.testSubj.locator(panelHeaderTestSubj).scrollIntoViewIfNeeded();
    await this.page.testSubj.locator(panelHeaderTestSubj).hover();
    await this.page.testSubj.click('embeddablePanelToggleMenuIcon');
    await this.page.testSubj.click('embeddablePanelAction-deletePanel');
    await expect(this.page.testSubj.locator(panelHeaderTestSubj)).toBeHidden();
  }

  async waitForPanelsToLoad(
    expectedCount: number,
    options: { timeout: number; selector: string } = {
      timeout: 20000,
      selector: '[data-test-subj="embeddablePanel"][data-render-complete="true"]',
    }
  ) {
    await expect
      .poll(() => this.page.locator(options.selector).count(), {
        timeout: options.timeout,
        intervals: [100],
      })
      .toBe(expectedCount);
  }

  /**
   * Gets the titles of all panels on the dashboard
   */
  async getPanelTitles(): Promise<string[]> {
    const titleElements = await this.page.testSubj.locator('embeddablePanelTitle').all();
    return Promise.all(titleElements.map(async (el) => (await el.textContent()) ?? ''));
  }

  getPanelTitlesLocator() {
    return this.page.testSubj.locator('embeddablePanelTitle');
  }

  /**
   * Gets the count of panels on the dashboard
   * Returns the count of *visible* embeddable panels on the dashboard. Hidden panels
   * (e.g. those occluded when another panel is maximized) remain in the DOM.
   */
  async getPanelCount(): Promise<number> {
    const panels = await this.embeddablePanel.all();
    const visibilities = await Promise.all(panels.map((panel) => panel.isVisible()));
    return visibilities.filter(Boolean).length;
  }

  getControlsGroupLocator() {
    return this.controlsGroup;
  }

  getControlFramesLocator() {
    return this.controlFrame;
  }

  getDashboardControlsLocator() {
    return this.dashboardViewport.locator('[data-control-id]');
  }

  getControlFrameLocator(controlId: string) {
    return this.getControlFramesLocator()
      .locator(`[data-control-id='${controlId}']`)
      .locator('xpath=ancestor::*[@data-test-subj="control-frame"][1]');
  }

  async getControlIds() {
    await this.getControlFramesLocator().evaluateAll((frames) => {
      if (!frames.length) {
        throw new Error('No control frames found');
      }
    });

    return this.getControlFramesLocator()
      .locator('[data-control-id]')
      .evaluateAll((controls) => {
        return controls.map((control) => control.getAttribute('data-control-id') ?? '');
      });
  }

  async getOnlyControlId() {
    const controlIds = await this.getControlIds();

    if (controlIds.length !== 1 || !controlIds[0]) {
      throw new Error(`Expected exactly one control id, got: ${controlIds.join(', ')}`);
    }

    return controlIds[0];
  }

  /**
   * Id of the dashboard's control, including one that is not in a control group, such as an
   * ES|QL control saved as a top-level `esql_control` panel. Expects a single control, so
   * assert the count in the test first.
   */
  async getDashboardControlId(): Promise<string> {
    const controlId = await this.getDashboardControlsLocator().getAttribute('data-control-id');
    if (!controlId) {
      throw new Error('Dashboard control is rendered but has an empty data-control-id');
    }

    return controlId;
  }

  /**
   * Gets the count of dashboard controls
   */
  async getControlCount(): Promise<number> {
    return this.getControlFramesLocator().count();
  }

  async removeControl(controlId: string) {
    const controlFrame = this.getControlFrameLocator(controlId);
    await controlFrame.locator(`[data-control-id='${controlId}']`).hover();

    const hoverActions = controlFrame.getByTestId(`hover-actions-${controlId}`);
    await hoverActions.waitFor({ state: 'visible' });

    const deleteAction = hoverActions.getByTestId('embeddablePanelAction-deletePanel');
    await deleteAction.waitFor({ state: 'visible' });
    await deleteAction.click();
  }

  async optionsListOpenPopover(controlId: string) {
    await this.page.testSubj.locator(`optionsList-control-${controlId}`).click();
    await this.optionsListControlSearchInput.waitFor({ state: 'visible' });
  }

  async optionsListPopoverSelectOption(availableOption: string) {
    await this.optionsListControlSearchInput.fill(availableOption);

    const option = this.page.testSubj.locator(`optionsList-control-selection-${availableOption}`);
    await option.click();
  }

  /**
   * Closes the options-list popover if it is open, and waits for it to disappear.
   *
   * Dismisses with Escape rather than by toggling the control button: selecting an option
   * re-renders the control, so a click aimed at the button can land on a detached node and
   * leave the popover open.
   */
  async optionsListEnsurePopoverIsClosed() {
    if (await this.optionsListControlSearchInput.isVisible()) {
      await this.page.keyboard.press('Escape');
      await this.optionsListControlSearchInput.waitFor({ state: 'hidden' });
    }
  }

  /**
   * Locator for the selected-options label of an options-list control, e.g. `AE`
   * for a single selection or `AE, CN` for multiple.
   */
  getOptionsListSelectionsLocator(controlId: string) {
    return this.page.testSubj
      .locator(`optionsList-control-${controlId}`)
      .getByTestId('optionsListSelections');
  }

  async getSavedSearchRowCount(): Promise<number> {
    const [rowCount = 0] = await this.getSavedSearchRowCounts();
    return rowCount;
  }

  async getSavedSearchRowCounts(): Promise<number[]> {
    return this.savedSearchDocTable.evaluateAll((tables) =>
      tables.map((table) => {
        const docElement = table.querySelector('[data-document-number]');
        const docCount = Number(docElement?.getAttribute('data-document-number') ?? '0');
        const rowCount = table.querySelectorAll(
          '[data-test-subj="docTableExpandToggleColumn"]'
        ).length;
        return Math.max(docCount, rowCount);
      })
    );
  }

  async getTagCloudTexts(): Promise<string[][]> {
    const tagClouds = this.page.testSubj.locator('tagCloudVisualization');
    const clouds = await tagClouds.all();
    return Promise.all(
      clouds.map(async (tagCloud) => tagCloud.locator('.echLegendItemLabel').allInnerTexts())
    );
  }

  async getSharedItemsCount(): Promise<number> {
    const attributeName = 'data-shared-items-count';
    const elements = await this.page.locator(`[${attributeName}]`).all();
    if (elements.length === 0) {
      throw new Error(`no element`);
    }
    const attribute = await elements[0].getAttribute(attributeName);
    if (!attribute) {
      throw new Error(`no attribute found for [${attributeName}]`);
    }
    return Number(attribute);
  }

  async getAddPanelFlyoutGroups(): Promise<string[]> {
    const groupElements = await this.panelSelectionFlyout
      .locator('[data-test-subj*="dashboardEditorMenu-"]')
      .all();

    return await Promise.all(
      groupElements.map(async (groupElement) => {
        const testSubj = await groupElement.getAttribute('data-test-subj');
        // remove prefix so strings like 'dashboardEditorMenu-visualizationsGroup' become 'visualizationsGroup'
        const match = testSubj?.match(/dashboardEditorMenu-(.*)/);
        return match?.[1] ?? '';
      })
    );
  }

  async getAddPanelFlyoutActions(): Promise<string[]> {
    const addPanelActions = await this.panelSelectionFlyout
      .locator('[data-test-subj*="create-action-"]:not([data-test-subj$="-wrapper"])')
      .all();

    return await Promise.all(
      addPanelActions.map(async (action) => {
        const testSubj = await action.getAttribute('data-test-subj');
        // remove prefix so strings like 'create-action-Links' become 'Links'
        const match = testSubj?.match(/create-action-(.*)/);
        return match?.[1] ?? '';
      })
    );
  }

  /**
   * Waits for all dashboard controls and panels to finish rendering.
   * Uses the data-render-complete attribute to determine panel rendering completion.
   */
  async waitForRenderComplete() {
    // Dashboard viewport can be slow to appear on cold CI runs (see https://github.com/elastic/kibana/pull/275767);
    // the default 10s flakes on slower agents. Revisit once the root cause is fixed.
    await this.dashboardViewport.waitFor({ state: 'visible', timeout: 30_000 });

    await this.waitForControlsReady();

    try {
      const count = await this.getSharedItemsCount();
      if (count > 0) {
        await this.renderable.waitForRender(count);
        return;
      }
    } catch {
      // fall back to embeddable panel count
    }

    const count = await this.embeddablePanel.count();
    if (count > 0) {
      await this.waitForPanelsToLoad(count);
    }
  }

  private async waitForControlsReady(timeout: number = 60_000) {
    const controlsReadyLocator = this.page.locator('[data-dashboard-controls-ready]');
    await expect(controlsReadyLocator).toBeAttached({ timeout });

    const requiredConsecutiveReadySamples = 3;
    let consecutiveReadySamples = 0;
    await expect
      .poll(
        async () => {
          const isReady =
            (await controlsReadyLocator.getAttribute('data-dashboard-controls-ready')) === 'true';
          consecutiveReadySamples = isReady ? consecutiveReadySamples + 1 : 0;
          return consecutiveReadySamples;
        },
        { timeout, intervals: [100] }
      )
      .toBeGreaterThanOrEqual(requiredConsecutiveReadySamples);
  }

  // ============================================================
  // Customize Panel Methods
  // ============================================================

  private readonly customTimeRangeToggleTestSubj = 'customizePanelShowCustomTimeRange';

  private async waitForCustomTimeRangeToggleState(enabled: boolean) {
    const expected = enabled ? 'true' : 'false';
    const selector = `[data-test-subj="${this.customTimeRangeToggleTestSubj}"]`;
    await this.page.waitForFunction(
      ({ selector: selectorArg, expectedValue }) =>
        document.querySelector(selectorArg)?.getAttribute('aria-checked') === expectedValue,
      { selector, expectedValue: expected }
    );
  }

  private getCustomizePanelFlyout() {
    return this.customizePanelFlyout;
  }

  async enableCustomTimeRange() {
    const toggle = this.getCustomizePanelFlyout().locator(
      `[data-test-subj="${this.customTimeRangeToggleTestSubj}"]`
    );
    if ((await toggle.getAttribute('aria-checked')) !== 'true') {
      await toggle.click();
    }
    await this.waitForCustomTimeRangeToggleState(true);
    await this.getCustomizePanelFlyout()
      .locator('[data-test-subj="superDatePickerToggleQuickMenuButton"]')
      .waitFor({ state: 'visible' });
  }

  async disableCustomTimeRange() {
    const toggle = this.getCustomizePanelFlyout().locator(
      `[data-test-subj="${this.customTimeRangeToggleTestSubj}"]`
    );
    if ((await toggle.getAttribute('aria-checked')) !== 'false') {
      await toggle.click();
    }
    await this.waitForCustomTimeRangeToggleState(false);
  }

  async openDatePickerQuickMenu() {
    await this.getCustomizePanelFlyout()
      .locator('[data-test-subj="superDatePickerToggleQuickMenuButton"]')
      .click();
  }

  async clickCommonlyUsedTimeRange(timeRange: CommonlyUsedTimeRange) {
    await this.page.testSubj.click(`superDatePickerCommonlyUsed_${timeRange}`);
  }

  async openCustomizePanel(title?: string) {
    await this.clickPanelAction('embeddablePanelAction-ACTION_CUSTOMIZE_PANEL', title);
    await expect(this.customizePanelFlyout).toBeVisible();
  }

  async closeCustomizePanel() {
    await this.customizePanelCancelButton.click();
    await expect(this.customizePanelFlyout).toBeHidden();
  }

  async getCustomPanelTitle() {
    return this.page.testSubj.locator('customEmbeddablePanelTitleInput').inputValue();
  }

  async setCustomPanelTitle(customTitle: string) {
    const titleInput = this.page.testSubj.locator('customEmbeddablePanelTitleInput');
    await titleInput.click();
    await titleInput.fill(customTitle);
  }

  async resetCustomPanelTitle() {
    await this.page.testSubj.click('resetCustomEmbeddablePanelTitleButton');
  }

  getResetCustomPanelTitleButton() {
    return this.page.testSubj.locator('resetCustomEmbeddablePanelTitleButton');
  }

  async getCustomPanelDescription() {
    return this.page.testSubj.locator('customEmbeddablePanelDescriptionInput').inputValue();
  }

  async setCustomPanelDescription(customDescription: string) {
    const descriptionInput = this.page.testSubj.locator('customEmbeddablePanelDescriptionInput');
    await descriptionInput.click();
    await descriptionInput.fill(customDescription);
  }

  async resetCustomPanelDescription() {
    await this.page.testSubj.click('resetCustomEmbeddablePanelDescriptionButton');
  }

  getResetCustomPanelDescriptionButton() {
    return this.page.testSubj.locator('resetCustomEmbeddablePanelDescriptionButton');
  }

  async saveCustomizePanel() {
    await this.customizePanelSaveButton.click();
    await expect(this.customizePanelFlyout).toBeHidden();
  }

  async expectTimeRangeBadgeExists() {
    await expect(
      this.page.testSubj.locator('embeddablePanelBadge-CUSTOM_TIME_RANGE_BADGE')
    ).toBeVisible();
  }

  async expectTimeRangeBadgeMissing() {
    await expect(
      this.page.testSubj.locator('embeddablePanelBadge-CUSTOM_TIME_RANGE_BADGE')
    ).toBeHidden();
  }

  async expectEmptyPlaceholderVisible() {
    await expect(this.page.testSubj.locator('emptyPlaceholder')).toBeVisible();
  }

  async expectXYVisChartVisible() {
    await expect(this.page.testSubj.locator('xyVisChart')).toBeVisible();
  }

  async clickTimeRangeBadge() {
    await this.page.testSubj.click('embeddablePanelBadge-CUSTOM_TIME_RANGE_BADGE');
  }

  // ============================================================
  // Panel Action Methods
  // ============================================================

  /**
   * Formats a panel title for use in test subject selectors.
   */
  private formatTitleForTestSubj(title: string): string {
    return title.replace(/\s/g, '');
  }

  /**
   * Gets the hover actions wrapper for a panel by title.
   *
   * @param title - Panel title. If empty, finds first panel by class.
   */
  getPanelHoverActionsLocator(title?: string) {
    if (!title) {
      // Fallback: find first panel by class when no title provided
      return this.page.locator('.embPanel__hoverActionsAnchor');
    }
    return this.page.testSubj.locator(
      `embeddablePanelHoverActions-${this.formatTitleForTestSubj(title)}`
    );
  }

  /**
   * Opens the context menu for a panel.
   * Scrolls the panel into view and clicks the menu toggle.
   */
  async openPanelContextMenu(title?: string) {
    const panelWrapper = this.getPanelHoverActionsLocator(title);
    await panelWrapper.scrollIntoViewIfNeeded();
    await panelWrapper.hover();

    const contextMenuOpen = panelWrapper.locator(
      '[data-test-subj="embeddablePanelContextMenuOpen"]'
    );
    if (await contextMenuOpen.isVisible()) {
      return;
    }

    const menuIcon = panelWrapper.locator('[data-test-subj="embeddablePanelToggleMenuIcon"]');
    await menuIcon.click();
    await expect(contextMenuOpen).toBeVisible();
  }

  async navigateToLensEditorFromPanel(title?: string) {
    await this.openPanelContextMenu(title);
    await this.page.testSubj.click('embeddablePanelAction-editPanel');
    const navigateToLensEditorLink = this.page.testSubj.locator('navigateToLensEditorLink');
    await expect(navigateToLensEditorLink).toBeVisible();
    await navigateToLensEditorLink.click();
    await expect(this.page.testSubj.locator('lnsApp')).toBeVisible();
  }

  /**
   * Checks if a panel action exists as a descendant of the panel wrapper.
   */
  private async panelActionExistsInWrapper(
    actionTestSubj: string,
    panelWrapper: ReturnType<typeof this.getPanelHoverActionsLocator>
  ): Promise<boolean> {
    // Check if the action is a descendant of the panel wrapper (not globally visible)
    const actionInPanel = panelWrapper.locator(`[data-test-subj="${actionTestSubj}"]`);
    return actionInPanel.isVisible();
  }

  /**
   * Clicks a panel action from the hover actions or context menu.
   *
   * Key difference from before: checks if action is DESCENDANT of panel wrapper,
   * not just globally visible. This prevents clicking wrong panel's actions.
   */
  async clickPanelAction(actionTestSubj: string, title?: string) {
    const panelWrapper = this.getPanelHoverActionsLocator(title);
    await panelWrapper.scrollIntoViewIfNeeded();
    await panelWrapper.hover();

    // Check if action exists as descendant of panel wrapper
    const existsInWrapper = await this.panelActionExistsInWrapper(actionTestSubj, panelWrapper);

    if (existsInWrapper) {
      // Click the action within the panel wrapper
      const actionInPanel = panelWrapper.locator(`[data-test-subj="${actionTestSubj}"]`);
      await actionInPanel.click();
    } else {
      // Open context menu and click action. The menu renders in a portal outside the panel, so it
      // cannot be panel-scoped; filtering to the visible match skips the hidden quick-action
      // buttons that every other panel on the dashboard renders under the same test subject.
      await this.openPanelContextMenu(title);
      await this.page.testSubj.locator(actionTestSubj).filter({ visible: true }).click();
      // Wait for context menu to close after clicking the action
      await expect(this.page.testSubj.locator('embeddablePanelContextMenuOpen')).toBeHidden();
    }
  }

  async editLinkedDiscoverPanel(title: string) {
    await this.clickPanelAction('embeddablePanelAction-editPanel', title);
    await this.editInDiscoverLink.waitFor({ state: 'visible' });
    await this.editInDiscoverLink.click();
  }

  /** Generates and downloads a CSV report for a Discover session panel. */
  async exportPanelAsCsv(title?: string): Promise<Download> {
    await this.toasts.dismissAll();
    await this.clickPanelAction('embeddablePanelAction-generateCsvReport', title);

    const downloadButton = this.page.testSubj.locator('downloadCompletedReportButton');
    // Report generation runs asynchronously and can be slow on shared CI workers.
    await downloadButton.waitFor({ state: 'visible', timeout: 120_000 });

    const downloadPromise = this.page.waitForEvent('download');
    await downloadButton.click();
    return downloadPromise;
  }

  /**
   * Clones a panel on the dashboard.
   * The cloned panel becomes a "by value" panel (not linked to library).
   */
  async clonePanel(title?: string) {
    const panels = this.page.testSubj.locator('embeddablePanel');
    const initialCount = await panels.count();

    await this.clickPanelAction('embeddablePanelAction-clonePanel', title);
    await this.page.waitForFunction(
      (expectedCount) =>
        document.querySelectorAll('[data-test-subj="embeddablePanel"]').length > expectedCount,
      initialCount
    );
  }

  /**
   * Unlinks a panel from the library, converting it to a "by value" panel.
   * Unlinks a panel from the library and verifies it is unlinked.
   */
  async unlinkFromLibrary(title?: string) {
    await this.clickPanelAction('embeddablePanelAction-unlinkFromLibrary', title);
    await expect(this.page.testSubj.locator('unlinkPanelSuccess')).toBeVisible();
    // Verify the panel is now unlinked
    await this.expectNotLinkedToLibrary(title);
  }

  /** Opens the inspector flyout for the given panel (or the first panel if omitted). */
  async openInspector(title?: string) {
    await this.clickPanelAction('embeddablePanelAction-openInspector', title);
    await this.page.testSubj.locator('inspectorPanel').waitFor({ state: 'visible' });
  }

  /**
   * From the dashboard listing page, discards the unsaved draft for the given dashboard title.
   * Navigates to the listing first, then clicks the discard button if it exists (guard against
   * tests that failed before a draft was created).
   */
  async discardUnsavedDashboard(title = 'New Dashboard') {
    await this.page.gotoApp('dashboards');
    const discardButton = this.page.testSubj.locator(
      `discard-unsaved-${title.replace(/\s/g, '-')}`
    );
    if (await discardButton.isVisible()) {
      await discardButton.click();
      await this.page.testSubj.click('confirmModalConfirmButton');
      await discardButton.waitFor({ state: 'hidden' });
    }
  }

  /**
   * Saves a panel to the library with a new title.
   * Saves a panel to the library and verifies it is linked.
   */
  async saveToLibrary(newTitle: string, currentTitle?: string) {
    await this.clickPanelAction('embeddablePanelAction-saveToLibrary', currentTitle);

    // Fill in the new title
    await this.savedObjectTitleInput.fill(newTitle);
    await this.confirmSaveButton.click();

    // Wait for success
    await expect(this.page.testSubj.locator('addPanelToLibrarySuccess')).toBeVisible();
    // Verify the panel is now linked
    await this.expectLinkedToLibrary(newTitle);
  }

  /**
   * Checks if a panel has a specific action available.
   * Checks both hover actions and context menu.
   *
   * Uses count() > 0 to include hidden elements.
   * (finds elements even if not visible).
   */
  async panelHasAction(actionTestSubj: string, title?: string): Promise<boolean> {
    const panelWrapper = this.getPanelHoverActionsLocator(title);
    await panelWrapper.scrollIntoViewIfNeeded();
    await panelWrapper.hover();

    // Check if action exists in panel wrapper (hover actions)
    // Using count() to include hidden elements
    const existsInWrapper = await this.panelActionExistsInWrapper(actionTestSubj, panelWrapper);
    if (existsInWrapper) {
      return true;
    }

    // Check in context menu
    await this.openPanelContextMenu(title);
    // Use count() > 0 to find elements even if hidden
    const actionInMenu = this.page.testSubj.locator(actionTestSubj);
    const count = await actionInMenu.count();

    // Close menu by pressing Escape
    await this.page.keyboard.press('Escape');
    return count > 0;
  }

  /**
   * Asserts that a panel action exists (throws if not found).
   */
  async expectExistsPanelAction(actionTestSubj: string, title?: string) {
    const exists = await this.panelHasAction(actionTestSubj, title);
    if (!exists) {
      // Collect available actions for better error message
      await this.openPanelContextMenu(title);
      const allActions = await this.page
        .locator('[data-test-subj^="embeddablePanelAction-"]')
        .all();
      const actionNames: string[] = [];
      for (const action of allActions) {
        const testSubj = await action.getAttribute('data-test-subj');
        if (testSubj) actionNames.push(testSubj);
      }
      await this.page.keyboard.press('Escape');

      throw new Error(
        `Expected panel action "${actionTestSubj}" to exist for panel "${
          title || 'first panel'
        }". Available actions: [${actionNames.join(', ')}]`
      );
    }
  }

  /**
   * Verifies a panel is linked to the library.
   * A linked panel has the "Unlink from library" action available.
   *
   * Switches to edit mode before checking because library actions
   * may not be available in view mode.
   */
  async expectLinkedToLibrary(title?: string) {
    await this.expectExistsPanelAction('embeddablePanelAction-unlinkFromLibrary', title);
  }

  /**
   * Verifies a panel is NOT linked to the library.
   * A non-linked panel has the "Save to library" action available.
   *
   * Switches to edit mode before checking because library actions
   * may not be available in view mode.
   */
  async expectNotLinkedToLibrary(title?: string) {
    await this.expectExistsPanelAction('embeddablePanelAction-saveToLibrary', title);
  }

  async openInlineEditor(id: string) {
    // Hover over the panel to show action buttons
    const embeddableSelector = `[data-test-embeddable-id="${id}"]`;
    await this.page.locator(embeddableSelector).hover();

    // Wait for the edit button to appear and click it
    const editVisualizationConfigurationSelector = `[data-test-subj="hover-actions-${id}"] [data-test-subj="embeddablePanelAction-editPanel"]`;
    await this.page.locator(editVisualizationConfigurationSelector).click();
  }

  /**
   * Returns locator for a specific panel by embeddable id.
   */
  getPanelByEmbeddableId(id: string) {
    return this.page.locator(`[data-test-embeddable-id="${id}"]`);
  }

  async addNewLensPanel() {
    await this.addNewPanel('Create visualization');
  }

  async addNewESQLPanel() {
    await this.addNewPanel('Create visualization (query)');
  }

  /** Opens the add-panel flyout, selects the given panel type, and waits for the flyout to close. */
  async addNewPanel(panelType: string) {
    await this.openAddPanelFlyout();
    await this.page.testSubj.click(`create-action-${panelType}`);
    await expect(this.panelSelectionFlyout).toBeHidden();
  }

  /** Clicks "Apply and close" in the ES|QL editor flyout to commit the query to the panel. */
  async applyAndCloseESQLPanel() {
    await this.applyFlyoutButton.click();
  }

  /** Clicks the "Save and return" button in the legacy Visualize editor. */
  async clickVisualizeSaveAndReturn() {
    await this.visualizeSaveAndReturnButton.click();
    await expect(this.visualizeSaveAndReturnButton).toBeHidden();
  }

  /** Navigates to a dashboard by clicking its title link on the listing page. */
  async clickDashboardTitleLink(dashboardTitle: string) {
    await this.page.testSubj.click(
      `dashboardListingTitleLink-${dashboardTitle.split(' ').join('-')}`
    );
    await this.waitForRenderComplete();
  }

  /**
   * Opens the "Save as..." dialog via the quick-save dropdown,
   * fills in the new title, and confirms.
   */
  async saveDashboardAsCopy(dashboardTitle?: string) {
    await this.quickSaveSecondaryButton.click();
    await this.interactiveSaveMenuItem.isVisible();
    // The dashboard sometimes flags spurious unsaved changes on initial layout,
    // which triggers a continuous toolbar re-render that nudges the popover by a
    // pixel each frame and defeats Playwright's stability check. The menu item
    // is visibly clickable; bypass actionability to land the click.
    await this.interactiveSaveMenuItem.click({ force: true });
    await expect(this.savedObjectTitleInput).toBeVisible();

    if (dashboardTitle !== undefined) {
      await this.savedObjectTitleInput.fill(dashboardTitle);
    }

    await expect(this.confirmSaveButton).toBeEnabled();
    await this.confirmSaveButton.click();
    await expect(this.confirmSaveButton).toBeHidden();
  }

  /** Selects a drilldown trigger and submits the drilldown wizard. */
  async selectDrilldownTriggerAndSubmit(
    trigger: 'on_click_value' | 'on_select_range' | 'on_open_panel_menu'
  ) {
    await this.page.testSubj.click(`triggerPicker-${trigger}`);
    await expect(this.drilldownWizardSubmit).toBeEnabled();
    await this.drilldownWizardSubmit.click();
  }

  // ============================================================
  // Panel Count
  // ============================================================

  async expectPanelCount(expectedCount: number) {
    await expect.poll(() => this.embeddablePanel.count()).toBe(expectedCount);
  }

  // ============================================================
  // Dashboard Listing
  // ============================================================

  getDashboardListingLink(title: string) {
    return this.page.testSubj.locator(`dashboardListingTitleLink-${title.split(' ').join('-')}`);
  }

  // Project (chrome-next) shows the dashboard title in the app header; classic chrome shows it as
  // the last breadcrumb. `.or()` keeps callers layout-agnostic without a runtime gate.
  getAppTitle() {
    return this.page.testSubj
      .locator('appHeaderTitle')
      .or(this.page.testSubj.locator('breadcrumb last'));
  }

  // ============================================================
  // Fullscreen
  // ============================================================

  async enterFullscreen() {
    await this.clickAppMenuItem('dashboardFullScreenMode');
    await expect(this.page.testSubj.locator('exitFullScreenModeButton')).toBeVisible();
  }

  async exitFullscreen() {
    await this.page.keyboard.press('Escape');
    await expect(this.page.testSubj.locator('exitFullScreenModeButton')).toBeHidden();
  }

  // ============================================================
  // Maximize Panel
  // ============================================================

  /**
   * Toggles the expand/minimize state of a panel. Use this for symmetric flows
   * (expand then minimize) that should not assert an end state. For one-way
   * expansion that asserts the maximized layout, use `maximizePanel`.
   */
  async togglePanelExpand(title?: string) {
    if (title) {
      await this.clickPanelAction('embeddablePanelAction-togglePanel', title);
      return;
    }
    const panelWrapper = this.page.locator('.embPanel__hoverActionsAnchor >> nth=0');
    await panelWrapper.scrollIntoViewIfNeeded();
    await panelWrapper.hover();
    const toggleAction = panelWrapper.locator(
      '[data-test-subj="embeddablePanelAction-togglePanel"]'
    );
    if (await toggleAction.isVisible()) {
      await toggleAction.click();
    } else {
      await panelWrapper.locator('[data-test-subj="embeddablePanelToggleMenuIcon"]').click();
      await expect(
        panelWrapper.locator('[data-test-subj="embeddablePanelContextMenuOpen"]')
      ).toBeVisible();
      await this.page.testSubj.click('embeddablePanelAction-togglePanel');
    }
  }

  async maximizePanel(title?: string) {
    await this.togglePanelExpand(title);
    await expect(this.page.locator('.dshLayout-isMaximizedPanel')).toBeVisible();
  }

  // ============================================================
  // URL Drilldown
  // ============================================================

  async createUrlDrilldown(
    name: string,
    url: string,
    trigger: 'on_click_value' | 'on_select_range' | 'on_open_panel_menu' = 'on_click_value'
  ) {
    await this.page.testSubj.click('drilldownFactoryItem-url_drilldown');
    await this.page.testSubj.locator('drilldownNameInput').fill(name);

    const selectAll = process.platform === 'darwin' ? 'Meta+a' : 'Control+a';
    const monacoEditor = this.page.locator(
      '[data-test-subj="url-template-editor-container"] .monaco-editor'
    );
    await monacoEditor.click();
    await this.page.keyboard.press(selectAll);
    await this.page.keyboard.type(url);

    await this.selectDrilldownTriggerAndSubmit(trigger);
  }

  // ============================================================
  // Dashboard Settings Helpers
  // ============================================================

  async setDashboardTitle(title: string) {
    const titleInput = this.page.testSubj.locator('dashboardTitleInput');
    await titleInput.fill(title);
  }

  async setDashboardDescription(description: string) {
    const descriptionInput = this.page.testSubj.locator('dashboardDescriptionInput');
    await descriptionInput.fill(description);
  }
}
