/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage } from '..';
import { EuiComboBoxWrapper, expect } from '..';

const normalizeComputedColor = (color: string | undefined): string | undefined => {
  if (!color) {
    return undefined;
  }

  const rgbMatch = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, 1)`;
  }

  return color;
};

export class LensApp {
  private readonly lensApp;
  private readonly chartSwitchPopover;
  private readonly chartSwitchList;
  private readonly saveAndReturnButton;
  private readonly saveButton;
  private readonly saveModal;
  private readonly savedObjectTitleInput;
  private readonly confirmSaveButton;
  private readonly closeDimensionEditorButton;
  public readonly applyChangesButton;
  private readonly dimensionFieldComboBox;

  constructor(private readonly page: ScoutPage) {
    this.lensApp = this.page.testSubj.locator('lnsApp');
    this.chartSwitchPopover = this.page.testSubj.locator('lnsChartSwitchPopover');
    this.chartSwitchList = this.page.testSubj.locator('lnsChartSwitchList');
    this.saveAndReturnButton = this.page.testSubj.locator('lnsApp_saveAndReturnButton');
    this.saveButton = this.page.testSubj.locator('lnsApp_saveButton');
    this.saveModal = this.page.testSubj.locator('savedObjectSaveModal');
    this.savedObjectTitleInput = this.page.testSubj.locator('savedObjectTitle');
    this.confirmSaveButton = this.page.testSubj.locator('confirmSaveSavedObjectButton');
    this.closeDimensionEditorButton = this.page.testSubj.locator(
      'lns-indexPattern-dimensionContainerClose'
    );
    this.applyChangesButton = this.page.testSubj.locator('lnsApplyChanges__apply');
    this.dimensionFieldComboBox = new EuiComboBoxWrapper(this.page, 'indexPattern-dimension-field');
  }

  async waitForLensApp() {
    await expect(this.lensApp).toBeVisible();
  }

  async switchToVisualization(visType: string) {
    await this.openChartSwitchPopover();
    await this.page.testSubj.locator(`lnsChartSwitchPopover_${visType}`).click();
  }

  async applyChanges() {
    await this.applyChangesButton.click();
    await expect(this.applyChangesButton).toBeHidden();
  }

  /**
   * Clicks "Save and return" and waits for Lens to close and the dashboard
   * viewport to be visible.
   */
  async saveAndReturn() {
    await expect(this.saveAndReturnButton).toBeVisible();
    await this.saveAndReturnButton.click();
    await expect(this.lensApp).toBeHidden();
    await expect(this.page.testSubj.locator('dshDashboardViewport')).toBeVisible();
  }

  /**
   * Opens the Lens save modal, fills in the title, optionally selects
   * a dashboard target, and confirms.
   */
  async save(
    title: string,
    options?:
      | {
          addToDashboard: 'existing';
          dashboardTitle: string;
        }
      | {
          addToDashboard: 'new';
        }
      | {
          addToDashboard: 'none';
        }
  ) {
    await this.saveButton.click();
    await expect(this.saveModal).toBeVisible();
    await this.savedObjectTitleInput.fill(title);

    if (options?.addToDashboard === 'existing') {
      await this.page.locator('label[for="existing-dashboard-option"]').click();
      await this.page.testSubj.locator('open-dashboard-picker').click();
      await this.page.testSubj
        .locator(`dashboard-picker-option-${options.dashboardTitle.split(' ').join('-')}`)
        .click();
    } else if (options?.addToDashboard === 'new') {
      await this.page.locator('label[for="new-dashboard-option"]').click();
    } else if (options?.addToDashboard === 'none') {
      await this.page.locator('label[for="add-to-library-option"]').click();
    }

    await this.confirmSaveButton.click();
    await expect(this.saveModal).toBeHidden();
  }

  async configureXYDimensions(options?: {
    y?: { operation: string; field?: string };
    x?: { operation: string; field?: string };
    split?: {
      operation: string;
      field?: string;
      palette?: { mode: 'legacy' | 'colorMapping'; id: string };
    };
  }) {
    const y = options?.y ?? { operation: 'average', field: 'bytes' };
    const x = options?.x ?? { operation: 'date_histogram', field: '@timestamp' };
    const split = options?.split ?? { operation: 'terms', field: 'ip' };

    await this.configureDimension({
      dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
      operation: y.operation,
      field: y.field,
    });
    await this.configureDimension({
      dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
      operation: x.operation,
      field: x.field,
    });
    await this.configureDimension({
      dimension: 'lnsXY_splitDimensionPanel > lns-empty-dimension',
      operation: split.operation,
      field: split.field,
      palette: split.palette,
    });
  }

  async configureDimension(opts: {
    dimension: string;
    operation: string;
    field?: string;
    palette?: { mode: 'legacy' | 'colorMapping'; id: string };
    keepOpen?: boolean;
  }) {
    await this.openDimensionSelector(opts.dimension);
    await this.selectOperation(opts.operation);
    if (opts.field) {
      await this.selectField(opts.field);
    }
    if (opts.palette) {
      await this.setPalette(opts.palette.id, opts.palette.mode === 'legacy');
    }
    if (!opts.keepOpen) {
      await this.closeDimensionEditor();
    }
  }

  async openDimensionEditorFor(dimension: string) {
    await this.openDimensionSelector(dimension);
  }

  async closeDimensionEditorPanel() {
    await this.closeDimensionEditor();
  }

  /** Closes the open dimension editor flyout. */
  async closeDimensionEditor() {
    await this.closeDimensionEditorButton.click();
    await expect(this.closeDimensionEditorButton).toBeHidden();
  }

  /**
   * Activates the layer tab at `index` when multiple layers are present.
   * No-op when there is only one layer (tabs are hidden).
   */
  async ensureLayerTabIsActive(index = 0) {
    const tabs = await this.page.locator('[data-test-subj^="unifiedTabs_tab_"]').all();
    const tab = tabs[index];
    if (!tab) {
      return;
    }

    if ((await tab.getAttribute('aria-selected')) === 'true') {
      await expect(this.page.testSubj.locator(`lns-layerPanel-${index}`)).toBeVisible();
      return;
    }

    await tab.click();
    await expect(this.page.testSubj.locator(`lns-layerPanel-${index}`)).toBeVisible();
  }

  /** Returns the selected axis side label from an open dimension editor. */
  async getSelectedAxisSide(): Promise<string> {
    const axisSideButtons = await this.page
      .locator('[data-test-subj^="lnsXY_axisSide_groups_"]')
      .all();

    for (const button of axisSideButtons) {
      if ((await button.getAttribute('aria-pressed')) === 'true') {
        const text = (await button.innerText()).trim();
        if (!text) {
          throw new Error('Axis side button text not yet rendered');
        }
        return text;
      }
    }

    throw new Error('No axis side button is selected');
  }

  /** Returns the selected bar orientation from the style settings flyout. */
  async getSelectedBarOrientationSetting(): Promise<string> {
    await this.openStyleSettingsFlyout();

    const orientationButtons = await this.page
      .locator('[data-test-subj^="lns_barOrientation_"]')
      .all();

    for (const button of orientationButtons) {
      if ((await button.getAttribute('aria-pressed')) === 'true') {
        return (await button.innerText()).trim();
      }
    }

    throw new Error('No bar orientation button is selected');
  }

  async setTermsNumberOfValues(value: number) {
    const input = this.page.locator('input[data-test-subj="indexPattern-terms-values"]');
    await expect(input).toBeVisible();
    await input.click();
    await input.fill(`${value}`);
    await this.page.keyboard.press('Tab');
    await expect(input).toHaveValue(`${value}`);
  }

  async setTableDynamicColoring(coloringType: 'none' | 'cell' | 'text' | 'badge') {
    await this.page.testSubj.click('lnsDatatable_dynamicColoring_groups');
    await this.page.testSubj.click(`lnsDatatable_dynamicColoring_groups_${coloringType}`);
  }

  async setPalette(paletteId: string, isLegacy: boolean) {
    await this.page.testSubj.click('lns_colorEditing_trigger');
    await expect(this.page.testSubj.locator('lns-palettePanelFlyout')).toBeVisible();

    const paletteModeToggle = this.page.testSubj.locator('lns_colorMappingOrLegacyPalette_switch');
    const targetValue = isLegacy ? 'true' : 'false';
    if ((await paletteModeToggle.getAttribute('aria-checked')) !== targetValue) {
      await paletteModeToggle.click();
    }

    if (isLegacy) {
      await this.page.testSubj.click('lns-palettePicker');
      await this.page.locator(`#${paletteId}`).click();
    } else {
      await this.page.testSubj.click('kbnColoring_ColorMapping_PalettePicker');
      await this.page.testSubj.click(`kbnColoring_ColorMapping_Palette-${paletteId}`);
    }

    await this.closePaletteEditor();
  }

  private async closePaletteEditor() {
    await this.page.testSubj.click('lns-indexPattern-SettingWithSiblingFlyoutBack');
    await expect(
      this.page.testSubj.locator('lns-indexPattern-SettingWithSiblingFlyoutBack')
    ).toBeHidden();
  }

  private async openDimensionSelector(dimension: string) {
    await this.page.testSubj.locator(dimension).click();
    await expect(this.closeDimensionEditorButton).toBeVisible();
  }

  /**
   * Opens a dimension editor flyout from a dimension trigger inside a layer panel.
   * Matches the FTR `lens.openDimensionEditor(dimension, layerIndex, dimensionIndex)` API.
   */
  async openDimensionEditor(dimension: string, layerIndex = 0, dimensionIndex = 0) {
    const editors = await this.page.testSubj
      .locator(`lns-layerPanel-${layerIndex} > ${dimension}`)
      .all();
    const editor = editors[dimensionIndex];
    if (!editor) {
      throw new Error(
        `Dimension editor not found at index ${dimensionIndex} for "${dimension}" in layer ${layerIndex}`
      );
    }
    await editor.click();
    await expect(this.closeDimensionEditorButton).toBeVisible();
  }

  /** Returns the selected option labels from an EUI combo box test subject. */
  async getComboBoxSelectedOptions(comboBoxTestSubj: string): Promise<string[]> {
    const comboBox = new EuiComboBoxWrapper(this.page, comboBoxTestSubj);
    const selectedOptions = await comboBox.getSelectedMultiOptions();
    if (selectedOptions.length > 0) {
      return selectedOptions;
    }

    const value = await comboBox.getSelectedValue();
    return value ? [value] : [];
  }

  private async selectOperation(operation: string, isPreviousIncompatible = false) {
    const operationSelector = isPreviousIncompatible
      ? `lns-indexPatternDimension-${operation} incompatible`
      : `lns-indexPatternDimension-${operation}`;
    const operationButton = this.page.testSubj.locator(operationSelector);
    await expect(operationButton).toBeVisible();
    await operationButton.scrollIntoViewIfNeeded();
    await operationButton.click();
    await expect(operationButton).toHaveAttribute('aria-pressed', 'true');
  }

  private async selectField(field: string) {
    await this.dimensionFieldComboBox.selectSingleOption(field, {
      optionTestSubj: `lns-fieldOption-${field}`,
    });
  }

  private async openChartSwitchPopover() {
    await this.chartSwitchPopover.click();
    await expect(this.chartSwitchList).toBeVisible();
  }

  async dragFieldToWorkspace(field: string) {
    const fieldLocator = this.page.testSubj.locator(`lnsFieldListPanelField-___${field}___`);
    const dropTarget = this.page.testSubj.locator('workspace-drag-drop-prompt');
    await fieldLocator.dragTo(dropTarget);
    await this.page.locator('.echCanvasRenderer').waitFor({ state: 'visible' });
  }

  getConvertToEsqlButton() {
    return this.page.getByRole('button', { name: 'Convert to ES|QL' });
  }

  getConvertToEsqModal() {
    return this.page.getByTestId('lnsConvertToEsqlModal');
  }

  getConvertToEsqModalConfirmButton() {
    return this.page.getByTestId('confirmModalConfirmButton');
  }

  getApplyFlyoutButton() {
    return this.page.getByTestId('applyFlyoutButton');
  }

  getSecondaryFlyoutBackButton() {
    return this.page.getByTestId('lns-indexPattern-dimensionContainerClose');
  }

  getInlineEditor() {
    return this.page.getByTestId('customizeLens');
  }

  getCancelFlyoutButton() {
    return this.page.getByTestId('cancelFlyoutButton');
  }

  getEditInLensButton() {
    return this.page.getByTestId('navigateToLensEditorLink');
  }

  /**
   * Waits for the Lens visualization workspace to finish rendering.
   * Polls `data-rendering-count` on the visualization container until it
   * stabilises across two consecutive reads (500 ms apart).
   *
   * Scopes to `lnsWorkspace` so Open in Lens flows on multi-panel dashboards
   * do not match chart test subjects on other embeddables.
   */
  async waitForVisualization(chartSubj = 'lnsVisualizationContainer') {
    const workspace = this.page.testSubj.locator('lnsWorkspace');
    await workspace.waitFor({ state: 'visible', timeout: 30_000 });

    const container = workspace.getByTestId(chartSubj);
    await container.waitFor({ state: 'visible', timeout: 30_000 });

    await this.page.waitForFunction(
      ({ workspaceSubj, chartSubj: subj }) => {
        const workspaceEl = document.querySelector(`[data-test-subj="${workspaceSubj}"]`);
        if (!workspaceEl) {
          return false;
        }
        const el = workspaceEl.querySelector(`[data-test-subj="${subj}"]`);
        if (!el) {
          return false;
        }
        const count = el.getAttribute('data-rendering-count');
        if (count === null) {
          return true;
        }
        if (count === '0') {
          return false;
        }
        const prev = el.getAttribute('data-lns-prev-count');
        el.setAttribute('data-lns-prev-count', count);
        return prev === count;
      },
      { workspaceSubj: 'lnsWorkspace', chartSubj },
      { timeout: 30_000, polling: 500 }
    );
  }

  /**
   * Asserts the number of layers in the Lens editor.
   * When there is only 1 layer the unified-tabs row is hidden.
   */
  async assertLayerCount(expectedCount: number) {
    const layerPanels = this.page.locator('[data-test-subj^="lns-layerPanel-"]');
    await expect(layerPanels).toHaveCount(1);

    const tabs = this.page.locator('[data-test-subj^="unifiedTabs_tab_"]');
    if (expectedCount <= 1) {
      await expect(tabs).toHaveCount(0);
    } else {
      await expect(tabs).toHaveCount(expectedCount);
    }
  }

  /** Returns all dimension-trigger button locators currently rendered in the editor. */
  getDimensionTriggers() {
    return this.page.testSubj.locator('lns-dimensionTrigger').all();
  }

  /** Returns visible labels for all dimension triggers inside a dimension panel. */
  async getDimensionTriggersTexts(dimension: string): Promise<string[]> {
    const triggers = await this.page.testSubj.locator(`${dimension} > lns-dimensionTrigger`).all();
    const texts = await Promise.all(triggers.map((trigger) => trigger.innerText()));
    // Lens inserts zero-width spaces around dots in field names for line-breaking.
    return texts.map((text) => text.replace(/\u200b/g, '').trim());
  }

  /** Returns the visible label of a dimension trigger inside a dimension panel. */
  async getDimensionTriggerText(dimension: string, index = 0): Promise<string> {
    const dimensionTexts = await this.getDimensionTriggersTexts(dimension);
    const text = dimensionTexts[index];
    if (text === undefined) {
      throw new Error(`Dimension trigger not found at index ${index} for "${dimension}"`);
    }
    return text;
  }

  /** Returns the chart type label shown in the chart switcher popover. */
  async getChartSwitchType(): Promise<string> {
    await expect(this.chartSwitchPopover).toBeVisible();
    return (await this.chartSwitchPopover.innerText()).trim();
  }

  async openStyleSettingsFlyout() {
    await this.page.locator('button[data-test-subj="style"]').click();
    await expect(this.page.locator('#lnsDimensionContainerTitle')).toBeVisible();
  }

  /** Reads the selected donut hole size from the style settings flyout. */
  async getDonutHoleSize(): Promise<string> {
    await this.openStyleSettingsFlyout();
    const comboBox = new EuiComboBoxWrapper(this.page, 'lnsEmptySizeRatioOption');
    const selectedOptions = await comboBox.getSelectedMultiOptions();
    if (selectedOptions.length > 0) {
      return selectedOptions[0];
    }

    return comboBox.getSelectedValue();
  }

  /**
   * Hovers over a dimension-trigger button so that metric tiles are in their
   * default (un-hovered) state before asserting colors.
   */
  async hoverOverDimensionButton(index = 0) {
    const triggers = await this.getDimensionTriggers();
    if (triggers[index]) {
      await triggers[index].hover();
    }
    // Move the pointer off the metric tiles so hover styles do not affect color assertions.
    const layerPanels = await this.page.locator('[data-test-subj^="lns-layerPanel-"]').all();
    if (layerPanels[0]) {
      await layerPanels[0].hover();
    }
  }

  /**
   * Reads the current state of every metric tile inside `[data-test-subj="mtrVis"]`.
   * The returned shape matches the FTR `lens.getMetricVisualizationData()` output.
   */
  async getMetricVisualizationData() {
    const tiles = await this.page.locator('[data-test-subj="mtrVis"] .echChart li').all();
    const showingBar = (await this.page.locator('.echSingleMetricProgress').count()) > 0;

    return Promise.all(
      tiles.map(async (tile) => {
        const getText = async (selector: string) => {
          const el = tile.locator(selector);
          if ((await el.count()) === 0) return undefined;
          return el.evaluate((node) => (node as HTMLElement).innerText);
        };
        const getColor = async (selector: string) => {
          const el = tile.locator(selector);
          if ((await el.count()) === 0) return undefined;
          const color = await el.evaluate((node) => getComputedStyle(node).backgroundColor);
          return normalizeComputedColor(color);
        };

        return {
          title: await getText('h2'),
          subtitle: await getText('.echMetricText__subtitle'),
          extraText: await getText('.echMetricText__extraBlock'),
          value: await getText('.echMetricText__valueBlock'),
          color: await getColor('.echMetric'),
          trendlineColor: await (async () => {
            const el = tile.locator('.echSingleMetricSparkline__svg > rect');
            if ((await el.count()) === 0) return undefined;
            return (await el.getAttribute('fill')) ?? undefined;
          })(),
          showingTrendline: (await tile.locator('.echSingleMetricSparkline').count()) > 0,
          showingBar,
        };
      })
    );
  }

  /** Opens the palette panel for the currently active dimension. */
  async openPalettePanel() {
    await this.page.testSubj.click('lns_colorEditing_trigger');
    await this.page.testSubj.locator('lns-palettePanelFlyout').waitFor({
      state: 'visible',
      timeout: 10_000,
    });
  }

  /** Reads color-stop values and colors from the currently open palette panel. */
  async getPaletteColorStops() {
    const stopInputs = await this.page
      .locator('[data-test-subj^="lnsPalettePanel_dynamicColoring_range_value_"]')
      .all();
    const colorAnchors = await this.page.testSubj.locator('euiColorPickerAnchor').all();

    return Promise.all(
      stopInputs.map(async (input, i) => ({
        stop: await input.getAttribute('value'),
        color:
          colorAnchors[i] != null
            ? normalizeComputedColor(
                await colorAnchors[i].evaluate((node) => getComputedStyle(node).backgroundColor)
              )
            : undefined,
      }))
    );
  }
}
