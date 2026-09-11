/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage } from '..';
import { expect } from '..';
import { KibanaCodeEditorWrapper } from '../ui_components';

/**
 * Default timeout for `page.waitForFunction` readiness waits.
 */
const WAIT_FOR_FUNCTION_TIMEOUT_MS = 10_000;

interface ChartSwitchPopoverOptions {
  search?: string;
  visType?: string;
}

export class LensApp {
  readonly lensApp;
  readonly saveAndReturnButton;
  readonly saveButton;
  readonly saveModal;
  readonly savedObjectTitleInput;
  readonly confirmSaveButton;
  readonly addToLibraryCheckbox;
  /**
   * Needed by the Lens plugin's `openDimensionEditor` / `secondaryFlyoutBackButton` alias
   * as well as `closeDimensionEditor` here.
   */
  protected readonly closeDimensionEditorButton;
  readonly applyFlyoutButton;
  readonly cancelFlyoutButton;
  protected readonly codeEditor: KibanaCodeEditorWrapper;

  private readonly chartSwitchPopover;
  private readonly chartSwitchList;
  /**
   * Formula Monaco textarea — Lens has no data-test-subj on the editor input.
   * Note: `lnsFormulaWidget` is the overflow/suggest portal on `document.body`, not the editor.
   */
  private readonly formulaEditorTextarea;

  constructor(protected readonly page: ScoutPage) {
    this.lensApp = this.page.testSubj.locator('lnsApp');
    this.chartSwitchPopover = this.page.testSubj.locator('lnsChartSwitchPopover');
    this.chartSwitchList = this.page.testSubj.locator('lnsChartSwitchList');
    this.saveAndReturnButton = this.page.testSubj.locator('lnsApp_saveAndReturnButton');
    this.saveButton = this.page.testSubj.locator('lnsApp_saveButton');
    this.saveModal = this.page.testSubj.locator('savedObjectSaveModal');
    this.savedObjectTitleInput = this.page.testSubj.locator('savedObjectTitle');
    this.confirmSaveButton = this.page.testSubj.locator('confirmSaveSavedObjectButton');
    this.addToLibraryCheckbox = this.page.locator('#add-to-library-checkbox');
    this.closeDimensionEditorButton = this.page.testSubj.locator(
      'lns-indexPattern-dimensionContainerClose'
    );
    this.formulaEditorTextarea = this.page.locator(
      '.lnsFormula__editorContent .monaco-editor textarea'
    );
    this.applyFlyoutButton = this.page.getByTestId('applyFlyoutButton');
    this.cancelFlyoutButton = this.page.getByTestId('cancelFlyoutButton');
    this.codeEditor = new KibanaCodeEditorWrapper(this.page);
  }

  async waitForLensApp() {
    await this.lensApp.waitFor({ state: 'visible', timeout: 20_000 });
  }

  /**
   * Switches the active visualization via the chart switcher.
   *
   * @param visType Chart switcher test-subj suffix (e.g. `lnsMetric`, `bar`), not the display label.
   * @param options.search Optional filter text when the target chart is easier to find by label.
   */
  async switchToVisualization(visType: string, options?: { search?: string }) {
    await this.openChartSwitchPopover({ ...options, visType });
    await this.selectChartSwitchOption(visType);
  }

  /**
   * Opens the chart switcher popover, optionally filtering its list.
   * Prefer `switchToVisualization` to switch; open the popover directly only to assert on
   * its contents (e.g. the warning badge of a chart type), then close it or pick an option.
   *
   * @param options.visType Chart switcher test-subj suffix to wait for after filtering.
   * @param options.search Filter text, needed when the target chart is not rendered by the
   * virtualized list until it is filtered.
   */
  async openChartSwitchPopover(options?: ChartSwitchPopoverOptions) {
    await expect(async () => {
      if (await this.chartSwitchList.isVisible()) {
        return;
      }

      await this.chartSwitchPopover.click({ timeout: 5_000 });
      await this.chartSwitchList.waitFor({ state: 'visible', timeout: 5_000 });
    }).toPass({ timeout: 15_000 });

    if (options?.visType) {
      await this.filterChartSwitchOptions(options.visType, options.search);
    }
  }

  /** Locator for a chart type's row in the open chart switcher popover. */
  getChartSwitchOption(visType: string) {
    return this.chartSwitchList.getByTestId(`lnsChartSwitchPopover_${visType}`);
  }

  /**
   * Locator for the badge warning that switching to this chart type would change the current
   * configuration. Resolves only while the popover is open and the option is rendered, so
   * assert the option itself is visible before asserting the badge is absent.
   */
  getChartSwitchWarning(visType: string) {
    return this.getChartSwitchOption(visType).getByTestId(`lnsChartSwitchPopoverAlert_${visType}`);
  }

  /** Picks a chart type from the open chart switcher popover. */
  async selectChartSwitchOption(visType: string) {
    const option = this.getChartSwitchOption(visType);
    await option.waitFor({ state: 'visible', timeout: 15_000 });
    // The virtualized list re-renders while filtered; dispatchEvent bypasses mouse actionability checks.
    await option.dispatchEvent('click');
    // Popover should close after selection; waiting avoids racing with subsequent assertions.
    await this.chartSwitchList.waitFor({ state: 'hidden', timeout: 15_000 });
  }

  /** Returns the chart type label shown in the chart switcher popover. */
  async getChartSwitchType(): Promise<string> {
    await this.chartSwitchPopover.waitFor({ state: 'visible' });
    return (await this.chartSwitchPopover.innerText()).trim();
  }

  private async filterChartSwitchOptions(visType: string, search?: string) {
    const query = search ?? visType.substring(visType.length - 3);
    const searchInput = this.page.testSubj.locator('lnsChartSwitchSearch');

    await searchInput.waitFor({ state: 'visible' });
    await searchInput.fill(query);
    await expect(searchInput).toHaveValue(query, { timeout: 10_000 });
    await this.getChartSwitchOption(visType).waitFor({ state: 'visible', timeout: 15_000 });
  }

  /**
   * Clicks "Save and return" and waits for Lens to close and the dashboard
   * viewport to be visible.
   */
  async saveAndReturn() {
    await this.saveAndReturnButton.waitFor({ state: 'visible' });
    await this.saveAndReturnButton.click();
    await this.lensApp.waitFor({ state: 'hidden' });
    await this.page.testSubj.locator('dshDashboardViewport').waitFor({ state: 'visible' });
  }

  /**
   * Opens the Lens save modal, fills in the title, optionally selects
   * a dashboard target, and confirms. Waits for the modal to close.
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
          saveAsNew?: boolean;
          saveToLibrary?: boolean;
        }
      | {
          addToDashboard: 'none';
        }
  ) {
    await this.saveButton.click();
    await this.saveModal.waitFor({ state: 'visible' });
    await this.savedObjectTitleInput.fill(title);

    // Prefer checking the radio input — label clicks race save-modal remounts.
    if (options?.addToDashboard === 'existing') {
      await this.page.locator('#existing-dashboard-option').check();
      await this.page.testSubj.locator('open-dashboard-picker').click();
      await this.page.testSubj
        .locator(`dashboard-picker-option-${options.dashboardTitle.split(' ').join('-')}`)
        .click();
    } else if (options?.addToDashboard === 'new') {
      if (options.saveAsNew !== undefined) {
        await this.setEuiSwitch('saveAsNewCheckbox', options.saveAsNew);
      }
      await this.page.locator('#new-dashboard-option').check();
      if (options.saveToLibrary !== undefined) {
        if (options.saveToLibrary) {
          await this.addToLibraryCheckbox.check();
        } else {
          await this.addToLibraryCheckbox.uncheck();
        }
      }
    } else if (options?.addToDashboard === 'none') {
      await this.page.locator('#add-to-library-option').check();
    }

    await this.confirmSaveButton.click();
    await this.saveModal.waitFor({ state: 'hidden' });
  }

  async applyFlyoutChanges() {
    await this.applyFlyoutButton.scrollIntoViewIfNeeded();
    await this.applyFlyoutButton.click();
    await this.page.testSubj.locator('lnsWorkspace').waitFor({ state: 'hidden' });
  }

  async cancelFlyoutChanges() {
    await this.cancelFlyoutButton.click();
    await this.page.testSubj.locator('lnsWorkspace').waitFor({ state: 'hidden' });
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
    formula?: string;
    isPreviousIncompatible?: boolean;
    palette?: { mode: 'legacy' | 'colorMapping'; id: string };
    disableEmptyRows?: boolean;
    keepOpen?: boolean;
  }) {
    await this.openDimensionSelector(opts.dimension);
    if (opts.operation === 'formula') {
      await this.switchToFormula();
    } else {
      await this.selectOperation(opts.operation, opts.isPreviousIncompatible);
    }
    if (opts.field) {
      await this.selectField(opts.field);
    }
    if (opts.formula) {
      await this.typeInFormula(opts.formula, { replace: true });
    }
    if (opts.palette) {
      await this.setPalette(opts.palette.id, opts.palette.mode === 'legacy');
    }
    if (opts.disableEmptyRows) {
      await this.setEuiSwitch('indexPattern-include-empty-rows', false);
    }
    if (!opts.keepOpen) {
      await this.closeDimensionEditor();
    }
  }

  async configureTextBasedDimension({
    dimension,
    field,
  }: {
    dimension: string;
    field: string;
  }): Promise<void> {
    await this.page.testSubj.locator(dimension).click();

    const fieldPicker = this.page.components.comboBox('text-based-dimension-field');
    await fieldPicker.setSelectedOptions([field]);

    await this.closeDimensionEditor();
    await this.applyFlyoutButton.click();
  }

  private async openDimensionSelector(dimension: string) {
    await this.page.testSubj.locator(dimension).click();
    await this.closeDimensionEditorButton.waitFor({ state: 'visible' });
  }

  async removeDimension(dimensionTestSubj: string) {
    await this.page.testSubj
      .locator(`${dimensionTestSubj} > indexPattern-dimension-remove`)
      .click();
  }

  async switchToFormula() {
    await this.page.testSubj.click('lens-dimensionTabs-formula');
  }

  async selectOperation(operation: string, isPreviousIncompatible = false) {
    const operationSelector = isPreviousIncompatible
      ? `lns-indexPatternDimension-${operation} incompatible`
      : `lns-indexPatternDimension-${operation}`;
    const operationLabel = this.page.testSubj.locator(`${operationSelector}-label`);
    await operationLabel.waitFor({ state: 'visible' });
    await operationLabel.scrollIntoViewIfNeeded();
    await operationLabel.click();
    await this.page.waitForFunction(
      (selector) =>
        document.querySelector(`[data-test-subj="${selector}"]`)?.getAttribute('aria-pressed') ===
        'true',
      operationSelector,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
  }

  private async selectField(field: string) {
    await this.page.components
      .comboBox('indexPattern-dimension-field')
      .setSelectedOptions([field], {
        timeout: 10_000,
      });
    // ComboBox can show the typed option before Lens layer state commits.
    // data-selected-field is the committed display name and updates only after
    // insertOrReplaceColumn. Poll the attribute as data so labels with CSS
    // metacharacters are not interpolated into a selector.
    await this.page.waitForFunction(
      (expected) =>
        document
          .querySelector('[data-test-subj="indexPattern-dimension-field"]')
          ?.getAttribute('data-selected-field') === expected,
      field,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
  }

  /**
   * Types into the formula Monaco editor.
   * Use `replace: true` to clear first (dimension configure). Omit replace to append
   * (autocomplete paths). Lens auto-inserts quotes/parens after some tokens (e.g. `kql=`),
   * so callers should `expect.poll(() => lens.getFormulaText())` for the final value.
   */
  async typeInFormula(text: string, options?: { replace?: boolean; focus?: boolean }) {
    if (options?.focus !== false) {
      await this.focusFormulaEditor();
    }
    if (options?.replace) {
      const modelIndex = await this.getFormulaModelIndex();
      await this.codeEditor.setCodeEditorValue('', modelIndex);
      await this.focusFormulaEditor();
    }
    await this.page.keyboard.type(text, { delay: 25 });
  }

  /**
   * Focuses the formula Monaco textarea (avoid `{ force: true }` — suggest portals intercept clicks).
   */
  private async focusFormulaEditor() {
    await this.formulaEditorTextarea.waitFor({ state: 'attached' });
    await this.formulaEditorTextarea.evaluate((el) => {
      (el as HTMLTextAreaElement).focus();
    });
  }

  /**
   * Lens formula uses the last registered Monaco model (not always index 0).
   * Needed by the Lens plugin's `getFormulaText` as well as `typeInFormula` here.
   */
  protected async getFormulaModelIndex(): Promise<number> {
    return this.page.evaluate(() => {
      const monacoEnv = (
        window as unknown as {
          MonacoEnvironment?: {
            monaco?: { editor?: { getModels: () => unknown[] } };
          };
        }
      ).MonacoEnvironment;
      const models = monacoEnv?.monaco?.editor?.getModels() ?? [];
      return Math.max(0, models.length - 1);
    });
  }

  async setEuiSwitch(testSubj: string, checked: boolean) {
    const switchLocator = this.page.testSubj.locator(testSubj);
    await switchLocator.waitFor({ state: 'visible' });
    const want = checked ? 'true' : 'false';
    // EUI switch is React-controlled: Playwright `setChecked` clicks then immediately
    // re-reads aria-checked and fails before Lens commits the update. Click when needed,
    // then wait for the attribute (no expect() in the page object).
    if ((await switchLocator.getAttribute('aria-checked')) !== want) {
      await switchLocator.click();
    }
    await this.page.waitForFunction(
      ([subj, expected]) =>
        document.querySelector(`[data-test-subj="${subj}"]`)?.getAttribute('aria-checked') ===
        expected,
      [testSubj, want] as const,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
  }

  /**
   * Closes the open dimension editor flyout.
   * Caller must have the dimension editor open.
   */
  async closeDimensionEditor() {
    // Suggested-value panels can remount and exceed the 10s actionTimeout.
    await this.closeDimensionEditorButton.click({ timeout: 15_000 });
    await this.closeDimensionEditorButton.waitFor({ state: 'hidden', timeout: 15_000 });
  }

  /** Opens the palette panel flyout for the currently active dimension. */
  async openPalettePanelFlyout() {
    await this.page.testSubj.click('lns_colorEditing_trigger');
    await this.page.testSubj.locator('lns-palettePanelFlyout').waitFor({
      state: 'visible',
    });
  }

  async closePalettePanelFlyout() {
    await this.page.testSubj.click('lns-indexPattern-SettingWithSiblingFlyoutBack');
    await this.page.testSubj
      .locator('lns-indexPattern-SettingWithSiblingFlyoutBack')
      .waitFor({ state: 'hidden' });
  }

  private async setPalette(paletteId: string, isLegacy: boolean) {
    await this.openPalettePanelFlyout();

    const paletteModeToggle = this.page.testSubj.locator('lns_colorMappingOrLegacyPalette_switch');
    const targetValue = isLegacy ? 'true' : 'false';
    if ((await paletteModeToggle.getAttribute('aria-checked')) !== targetValue) {
      await paletteModeToggle.click();
    }
    // Match `setEuiSwitch`: wait for the controlled toggle to commit before picking a palette.
    await this.page.waitForFunction(
      ([subj, expected]) =>
        document.querySelector(`[data-test-subj="${subj}"]`)?.getAttribute('aria-checked') ===
        expected,
      ['lns_colorMappingOrLegacyPalette_switch', targetValue] as const,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );

    if (isLegacy) {
      await this.page.testSubj.click('lns-palettePicker');
      await this.page.locator(`#${paletteId}`).click();
    } else {
      await this.page.testSubj.click('kbnColoring_ColorMapping_PalettePicker');
      await this.page.testSubj.click(`kbnColoring_ColorMapping_Palette-${paletteId}`);
    }

    await this.closePalettePanelFlyout();
  }

  /**
   * Maps a caller-facing field id to its internal field-list `data-attr-field`/test-subj suffix.
   * Needed by the Lens plugin's other drag-and-drop helpers as well as `dragFieldToWorkspace` here.
   */
  protected getFieldAttrName(field: string): string {
    // The document-count field is stored internally as `___records___`; callers pass `records`.
    return field === 'records' ? '___records___' : field;
  }

  protected getFieldListPanelFieldLocator(field: string) {
    const attrField = this.getFieldAttrName(field);
    if (field === 'records') {
      // The document-count field always has type `document`, so the field-grouping hook
      // routes it to the special-fields list — a plain <ul> with no container test-subj
      // (unlike Available/Selected Fields, which are rendered as accordions). Match on
      // the attribute directly.
      return this.page.locator(`[data-attr-field="${attrField}"]`);
    }
    // Prefer Available Fields — the same field can also appear under Selected Fields after use.
    return this.page.locator(
      `[data-test-subj="lnsIndexPatternAvailableFields"] [data-attr-field="${attrField}"]`
    );
  }

  /**
   * Drags a field onto the Lens workspace (FTR `dragFieldToWorkspace`).
   * Uses HTML5 DnD — Playwright `dragTo` does not reliably drive Lens drop zones.
   */
  async dragFieldToWorkspace(field: string, visualizationTestSubj?: string) {
    const fieldLocator = this.getFieldListPanelFieldLocator(field);
    await fieldLocator.waitFor({ state: 'visible' });
    const fieldTestSubj =
      (await fieldLocator.getAttribute('data-test-subj')) ??
      `lnsFieldListPanelField-${this.getFieldAttrName(field)}`;
    await this.html5DragAndDrop(fieldTestSubj, 'lnsWorkspace');
    await this.waitForLensDragDropToFinish();
    if (visualizationTestSubj) {
      await this.waitForVisualization(visualizationTestSubj);
    } else {
      await this.page.locator('.echCanvasRenderer').waitFor({ state: 'visible' });
    }
  }

  protected async waitForLensDragDropToFinish() {
    // Lens DnD active-group class has no data-test-subj; matches FTR html5DragAndDrop settle wait.
    await this.page.locator('.domDragDrop-isActiveGroup').waitFor({ state: 'hidden' });
  }

  /**
   * HTML5 DnD between test-subj chains (FTR `browser.html5DragAndDrop`).
   * Chains use `>` separators (e.g. `panel > lns-dimensionTrigger`).
   *
   * Dispatches the same event sequence a browser does — dragstart, dragenter, dragover, drop,
   * dragend — and waits for the target to report each state via `@kbn/dom-drag-drop` classes.
   * Both waits matter: drop targets register with the drag-drop context only after the drag
   * starts (`domDroppable--active`), and Lens resolves a drop against the target the last
   * dragover selected (`domDroppable--hover`). Dropping without those lands a partial change,
   * for example moving a dimension between groups removes it from the source group and never
   * adds it to the target one.
   *
   * Needed by the Lens plugin's other drag-and-drop helpers as well as `dragFieldToWorkspace` here.
   */
  protected async html5DragAndDrop(from: string, to: string) {
    await this.page.evaluate(
      async ([fromChain, toChain]) => {
        interface Transfer {
          data: Record<string, string>;
          setData: (key: string, value: string) => void;
          getData: (key: string) => string;
        }

        function createEvent(typeOfEvent: string) {
          const event = document.createEvent('CustomEvent') as CustomEvent & {
            dataTransfer: Transfer;
          };
          event.initCustomEvent(typeOfEvent, true, true, null);
          event.dataTransfer = {
            data: {},
            setData(key: string, value: string) {
              this.data[key] = value;
            },
            getData(key: string) {
              return this.data[key];
            },
          };
          return event;
        }

        function queryChain(chain: string): Element | null {
          const parts = chain.split('>').map((p) => p.trim());
          let nodes: Element[] = [document.body];
          for (const part of parts) {
            const next: Element[] = [];
            for (const node of nodes) {
              next.push(...Array.from(node.querySelectorAll(`[data-test-subj="${part}"]`)));
            }
            nodes = next;
          }
          return nodes[0] ?? null;
        }

        const origin = queryChain(fromChain);
        if (!origin) {
          throw new Error(`html5DragAndDrop: origin not found for ${fromChain}`);
        }

        // Starting a drag re-renders the drop targets, which replaces their DOM nodes, so
        // re-resolve the target on every step instead of holding on to a detached node.
        async function waitForTargetWithClass(className: string, timeout: number) {
          const deadline = Date.now() + timeout;
          while (Date.now() < deadline) {
            const element = queryChain(toChain);
            if (element?.closest('.domDroppable')?.classList.contains(className)) {
              return element;
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          return null;
        }

        const dragStartEvent = createEvent('dragstart');
        origin.dispatchEvent(dragStartEvent);

        // A target that never turns active rejects this drag (Lens has no drop type for it),
        // in which case dropping on it is a no-op: still dispatch the events so the caller's
        // assertions, not this helper, describe what the application did.
        const activeTarget = await waitForTargetWithClass('domDroppable--active', 2_000);
        if (activeTarget) {
          const dragEnterEvent = createEvent('dragenter');
          dragEnterEvent.dataTransfer = dragStartEvent.dataTransfer;
          activeTarget.dispatchEvent(dragEnterEvent);

          const dragOverEvent = createEvent('dragover');
          dragOverEvent.dataTransfer = dragStartEvent.dataTransfer;
          activeTarget.dispatchEvent(dragOverEvent);

          if (!(await waitForTargetWithClass('domDroppable--hover', 5_000))) {
            throw new Error(`html5DragAndDrop: ${toChain} never became the hovered drop target`);
          }
        }

        const dropTarget = queryChain(toChain);
        if (!dropTarget) {
          throw new Error(`html5DragAndDrop: target disappeared for ${toChain}`);
        }
        const dropEvent = createEvent('drop');
        dropEvent.dataTransfer = dragStartEvent.dataTransfer;
        dropTarget.dispatchEvent(dropEvent);

        const dragEndEvent = createEvent('dragend');
        dragEndEvent.dataTransfer = dropEvent.dataTransfer;
        origin.dispatchEvent(dragEndEvent);
      },
      [from, to] as [string, string]
    );
  }

  /**
   * Waits for the Lens visualization workspace to finish rendering.
   * Polls the render count until it stabilises across two consecutive reads (500 ms apart),
   * reading `data-rendering-count` from the embeddable container where it exists (dashboards)
   * and falling back to the Elastic Charts render count, which is all the Lens editor renders.
   *
   * When `options.afterCount` is set, also requires at least one newer completed render than
   * that baseline before settling — use this after an edit that must land in a subsequent
   * chart pass (e.g. reference-line style) so a settle on the pre-edit count can't win the race.
   */
  async waitForVisualization(
    chartSubj = 'lnsVisualizationContainer',
    options?: { afterCount?: number }
  ) {
    const workspace = this.page.testSubj.locator('lnsWorkspace');
    await workspace.waitFor({ state: 'visible', timeout: 20_000 });

    const container = workspace.getByTestId(chartSubj);
    await container.waitFor({ state: 'visible' });

    const afterCount = options?.afterCount;
    const clearPrevRenderCount = async () => {
      await this.page.evaluate(() => {
        delete (window as unknown as { __lensScoutPrevRenderCount?: string })
          .__lensScoutPrevRenderCount;
      });
    };
    await clearPrevRenderCount();
    try {
      await this.page.waitForFunction(
        ({ subj, minExclusive }) => {
          const workspaceEl = document.querySelector('[data-test-subj="lnsWorkspace"]');
          const el = workspaceEl?.querySelector(`[data-test-subj="${subj}"]`);
          if (!el) {
            return false;
          }
          const chartStatus = el.querySelector('.echChartStatus');
          const count =
            el.getAttribute('data-rendering-count') ??
            (chartStatus?.getAttribute('data-ech-render-complete') === 'true'
              ? chartStatus.getAttribute('data-ech-render-count')
              : null);
          if (count === null) {
            // Not an Elastic Charts visualization (e.g. a data table): nothing left to poll.
            return !chartStatus;
          }
          if (count === '0') {
            delete (window as unknown as { __lensScoutPrevRenderCount?: string })
              .__lensScoutPrevRenderCount;
            return false;
          }
          if (minExclusive != null && Number(count) <= minExclusive) {
            return false;
          }
          const win = window as unknown as { __lensScoutPrevRenderCount?: string };
          const prev = win.__lensScoutPrevRenderCount;
          win.__lensScoutPrevRenderCount = count;
          return prev === count;
        },
        { subj: chartSubj, minExclusive: afterCount ?? null },
        // Chart data + render-count settle often exceeds the 10s actionTimeout; keep below the 60s test timeout.
        { polling: 500, timeout: 30_000 }
      );
    } finally {
      // Clear even on timeout so a leftover prev===count can't false-settle the next call.
      await clearPrevRenderCount();
    }
  }
}
