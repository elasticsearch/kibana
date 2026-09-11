/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiComboBoxObject, Locator, ScoutPage } from '@kbn/scout';
import { WAIT_FOR_FUNCTION_TIMEOUT_MS } from './lens_editor_helpers';

/** `useDebouncedValue` waits 256ms before committing; add margin for a busy main thread. */
const FORMAT_PARAM_DEBOUNCE_FLUSH_MS = 500;

/** Stable test-subj for the dimension time-shift combo (also passed into `waitForFunction`). */
const TIME_SHIFT_TEST_SUBJ = 'indexPattern-dimension-time-shift';

/** `LensApp` close-editor helpers needed by dimension open/close actions. */
interface LensDimensionsDeps {
  closeDimensionEditorButton: Locator;
  closeDimensionEditor: () => Promise<void>;
}

/**
 * Lens editor dimension triggers, format params, and quick-functions / static-value tabs.
 */
export class LensDimensions {
  /** Locator for all dimension-trigger buttons in the Lens config panel. */
  readonly dimensionTriggerLocator;
  /** Reused across time-shift helpers (enable / set / clear). */
  private readonly timeShift;
  private readonly timeShiftComboInput;
  private readonly timeShiftSearchInput;
  private readonly timeShiftClearButton;
  /** Workspace error one-click fix (e.g. terms → filters for time shift). */
  readonly errorFixAction;
  /** Terms dimension "Advanced" accordion (Other / missing bucket). */
  readonly termsAdvancedAccordion;
  /** Terms "Group remaining values as Other" switch. */
  readonly termsOtherBucketSwitch;
  /** Language switcher inside the open dimension Filter by input. */
  readonly dimensionFilterLanguageButton;
  readonly luceneLanguageMenuItem;
  /** Close (X) control on the open dimension editor flyout. */
  readonly editorCloseButton;
  readonly quickFunctionsTab;
  readonly formulaTab;
  readonly staticValueTab;
  /** Number input only — EuiRange also stamps the same test-subj on the slider. */
  readonly formatDecimalsInput;
  readonly dimensionColorPicker;
  readonly dimensionNameInput;
  private readonly textBasedDimensionFieldCombo: EuiComboBoxObject;

  constructor(private readonly page: ScoutPage, private readonly deps: LensDimensionsDeps) {
    this.dimensionTriggerLocator = this.page.testSubj.locator('lns-dimensionTrigger');
    this.editorCloseButton = deps.closeDimensionEditorButton;
    this.quickFunctionsTab = this.page.testSubj.locator('lens-dimensionTabs-quickFunctions');
    this.formulaTab = this.page.testSubj.locator('lens-dimensionTabs-formula');
    this.staticValueTab = this.page.testSubj.locator('lens-dimensionTabs-static_value');
    this.formatDecimalsInput = this.page.locator(
      'input[type="number"][data-test-subj="indexPattern-dimension-formatDecimals"]'
    );
    this.dimensionColorPicker = this.page.testSubj.locator('~indexPattern-dimension-colorPicker');
    this.dimensionNameInput = this.page.testSubj.locator('name-input');
    this.timeShift = this.page.testSubj.locator(TIME_SHIFT_TEST_SUBJ);
    this.timeShiftComboInput = this.timeShift.locator('[data-test-subj="comboBoxInput"]');
    this.timeShiftSearchInput = this.timeShift.locator(
      'input[data-test-subj="comboBoxSearchInput"]'
    );
    this.timeShiftClearButton = this.timeShift.locator('[data-test-subj="comboBoxClearButton"]');
    this.errorFixAction = this.page.testSubj.locator('errorFixAction');
    this.termsAdvancedAccordion = this.page.testSubj.locator('indexPattern-terms-advanced');
    this.termsOtherBucketSwitch = this.page.testSubj.locator('indexPattern-terms-other-bucket');
    this.dimensionFilterLanguageButton = this.page.testSubj.locator(
      'indexPattern-filter-by-input > switchQueryLanguageButton'
    );
    this.luceneLanguageMenuItem = this.page.testSubj.locator('luceneLanguageMenuItem');
    this.textBasedDimensionFieldCombo = this.page.components.comboBox('text-based-dimension-field');
  }

  /**
   * Locator for dimension-trigger buttons inside a panel/group.
   */
  getDimensionTriggersLocator(dimension: string) {
    return this.page.testSubj.locator(`${dimension} > lns-dimensionTrigger`);
  }

  /** Returns all dimension-trigger button locators currently rendered in the editor. */
  getDimensionTriggers() {
    return this.dimensionTriggerLocator.all();
  }

  /**
   * Returns visible labels for all dimension triggers inside a panel/group.
   * Empty panels return `[]` (do not wait for a trigger to appear).
   * Panel test-subj may match multiple wrappers (filled + empty slot); read triggers only.
   * Prefer locator assertions via `getDimensionTriggersLocator` when waiting for UI updates.
   */
  async getDimensionTriggersTexts(dimension: string): Promise<string[]> {
    const triggers = await this.getDimensionTriggersLocator(dimension).all();
    const texts: string[] = [];
    for (const trigger of triggers) {
      texts.push(await trigger.innerText());
    }
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

  /**
   * Hovers over a dimension-trigger button so that metric tiles are in their
   * default (un-hovered) state before asserting colors.
   */
  async hoverOverDimensionButton(index = 0) {
    // waitForFunction has no Scout default (unlike expect/actionTimeout).
    await this.page.waitForFunction(
      (minExclusive) =>
        document.querySelectorAll('[data-test-subj="lns-dimensionTrigger"]').length > minExclusive,
      index,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );

    const triggers = await this.dimensionTriggerLocator.all();
    const trigger = triggers[index];
    if (!trigger) {
      throw new Error(`Dimension trigger not found at index ${index}`);
    }
    await trigger.hover();
    // Move the pointer off the metric tiles so hover styles do not affect color assertions.
    await this.page.testSubj.locator('lns-layerPanel-0').hover();
  }

  /** Opens a dimension editor flyout from a dimension trigger inside a layer panel. */
  async openDimensionEditor(dimension: string, layerIndex = 0, dimensionIndex = 0) {
    const editorsLocator = this.page.testSubj.locator(
      `lns-layerPanel-${layerIndex} > ${dimension}`
    );
    await this.page.waitForFunction(
      ({ layerPanel, segments, minCount }) => {
        const layer = document.querySelector(`[data-test-subj="${layerPanel}"]`);
        if (!layer) {
          return false;
        }
        let nodes: Element[] = [layer];
        for (const segment of segments) {
          const next: Element[] = [];
          for (const node of nodes) {
            next.push(...Array.from(node.querySelectorAll(`[data-test-subj="${segment}"]`)));
          }
          nodes = next;
        }
        return nodes.length > minCount;
      },
      {
        layerPanel: `lns-layerPanel-${layerIndex}`,
        segments: dimension.split('>').map((part) => part.trim()),
        minCount: dimensionIndex,
      },
      // waitForFunction has no Scout default (unlike expect/actionTimeout).
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );

    const editors = await editorsLocator.all();
    const editor = editors[dimensionIndex];
    if (!editor) {
      throw new Error(
        `Dimension editor not found at index ${dimensionIndex} for "${dimension}" in layer ${layerIndex}`
      );
    }
    await editor.click();
    await this.deps.closeDimensionEditorButton.waitFor({ state: 'visible' });
  }

  /** Closes the open dimension editor flyout (same as `LensApp.closeDimensionEditor`, kept for FTR parity naming). */
  async closeDimensionEditorPanel() {
    await this.deps.closeDimensionEditor();
  }

  /** Selects a field for a text-based dimension and closes its editor. */
  async setTextBasedDimensionField(dimension: string, field: string, layerIndex = 0) {
    await this.openDimensionEditor(`${dimension} > lns-empty-dimension`, layerIndex);
    await this.textBasedDimensionFieldCombo.setSelectedOptions([field]);
    await this.closeDimensionEditorPanel();
  }

  /** Clears the dimension field combo box (removes the currently selected field). */
  async clearDimensionField() {
    await this.page.components.comboBox('indexPattern-dimension-field').clear();
  }

  /** Enables empty rows for the current date histogram dimension. */
  async enableIncludeEmptyRows() {
    const toggle = this.page.testSubj.locator('indexPattern-include-empty-rows');
    await toggle.click();
    await toggle.and(this.page.locator('[aria-checked="true"]')).waitFor({ state: 'visible' });
  }

  /**
   * Sets terms "Number of values".
   * ValuesInput debounces parent updates (~256ms) and is a controlled EuiFieldNumber —
   * Playwright fill/pressSequentially often update the DOM without committing `params.size`.
   * Mirror `setInputValue`: invoke the component `onChange(number)` via React props/fiber,
   * then wait for the dimension trigger label to include `Top ${value}`.
   */
  async setTermsNumberOfValues(value: number) {
    const input = this.page.locator(
      'input[data-test-subj="indexPattern-terms-values"][type="number"]'
    );
    await input.waitFor({ state: 'visible' });
    await input.scrollIntoViewIfNeeded();
    await input.click();
    await input.evaluate((el, nextValue) => {
      const inputEl = el as HTMLInputElement & Record<string, unknown>;
      const fiberKey = Object.keys(inputEl).find((key) => key.startsWith('__reactFiber$'));
      if (!fiberKey) {
        throw new Error('React fiber not found on indexPattern-terms-values');
      }
      interface FiberNode {
        memoizedProps?: { value?: unknown; onChange?: (v: number) => void };
        return?: FiberNode | null;
      }
      let fiber: FiberNode | null | undefined = inputEl[fiberKey] as FiberNode;
      while (fiber) {
        const props = fiber.memoizedProps;
        // ValuesInput passes numeric value + onChange(number) — not the string input handler.
        if (props && typeof props.value === 'number' && typeof props.onChange === 'function') {
          props.onChange(Number(nextValue));
          return;
        }
        fiber = fiber.return;
      }
      throw new Error('ValuesInput onChange(number) not found in React fiber tree');
    }, `${value}`);
    // Wait for Lens to commit size into the dimension trigger label (not an assertion).
    // waitForFunction has no Scout default (unlike expect/actionTimeout).
    await this.page.waitForFunction(
      (expected) => {
        const triggers = document.querySelectorAll('[data-test-subj="lns-dimensionTrigger"]');
        return Array.from(triggers).some((el) =>
          (el.textContent ?? '').replace(/\u200b/g, '').includes(`Top ${expected}`)
        );
      },
      value,
      { timeout: 15_000 }
    );
  }

  /** Returns whether the open dimension editor has top-level aggregation enabled. */
  async isTopLevelAggregation(): Promise<boolean> {
    const nestingSwitch = this.page.testSubj.locator('indexPattern-nesting-switch');
    await nestingSwitch.waitFor({ state: 'visible' });
    return nestingSwitch.isChecked();
  }

  /** Waits until the static-value dimension input is visible in the open editor. */
  async waitForStaticValueInput() {
    await this.page.testSubj.locator('lns-indexPattern-static_value-input').waitFor({
      state: 'visible',
    });
  }

  /**
   * Enables terms "Group remaining values as Other" on the open dimension editor.
   * Caller must have a terms dimension editor open with Other currently off
   * (saved `lnsXYvis` omits `otherBucket`; the switch is unchecked until clicked).
   */
  async enableTermsOtherBucket() {
    await this.termsAdvancedAccordion.click();
    await this.termsOtherBucketSwitch.waitFor({ state: 'visible' });
    await this.termsOtherBucketSwitch.click();
    await this.termsOtherBucketSwitch
      .and(this.page.locator('[aria-checked="true"]'))
      .waitFor({ state: 'visible' });
  }

  /**
   * Switches the open dimension Filter-by input from KQL to Lucene and closes the language menu.
   * Caller must already have the filter popover open (`workspace.enableFilter`).
   */
  async setDimensionFilterLanguageToLucene() {
    await this.dimensionFilterLanguageButton.click();
    await this.luceneLanguageMenuItem.waitFor({ state: 'visible' });
    await this.luceneLanguageMenuItem.click();
    // FTR clicks the switcher again to dismiss the language menu after selecting Lucene.
    await this.dimensionFilterLanguageButton.click();
    await this.luceneLanguageMenuItem.waitFor({ state: 'hidden' });
  }

  async switchToQuickFunctions() {
    await this.page.testSubj.click('lens-dimensionTabs-quickFunctions');
  }

  async switchToStaticValue() {
    await this.page.testSubj.click('lens-dimensionTabs-static_value');
  }

  /**
   * Clicks an incompatible quick-function option without waiting for it to become selected.
   * Used to assert Lens keeps the prior formula on incomplete transitions.
   */
  async clickIncompatibleOperation(operation: string) {
    await this.page.testSubj.click(`lns-indexPatternDimension-${operation} incompatible`);
  }

  /**
   * Sets the format of the currently open dimension, and optionally its decimal places
   * and suffix/prefix text.
   */
  async editDimensionFormat(format: string, options?: { decimals?: number; prefix?: string }) {
    await this.page.components
      .comboBox('indexPattern-dimension-format')
      .setSelectedOptions([format]);

    if (options?.prefix != null) {
      await this.setFormatParam(
        'input[data-test-subj="indexPattern-dimension-formatSuffix"]',
        options.prefix
      );
    }

    if (options?.decimals != null) {
      // EuiRange with `showInput` stamps `data-test-subj` on both the number input and the
      // range slider; target the number input explicitly to avoid a strict-mode violation.
      await this.setFormatParam(
        'input[type="number"][data-test-subj="indexPattern-dimension-formatDecimals"]',
        `${options.decimals}`
      );
    }
  }

  /**
   * Fills one format-params input and gives its debounced commit time to reach the Lens state.
   *
   * These inputs go through `useDebouncedValue`, whose `onChange` spreads the format params the
   * closure captured, so editing a second param before the first commits overwrites it — and
   * unmounting the editor (`closeDimensionEditor`) drops a pending commit altogether, silently
   * reverting the value. The commit has no DOM signal of its own to wait for.
   */
  private async setFormatParam(selector: string, value: string) {
    await this.page.locator(selector).fill(value);
    // Dismisses the range popover the decimals input opens, and takes focus off the input.
    await this.page.keyboard.press('Tab');
    // React owns these inputs and can reject or reformat what was typed, so wait for the value
    // to stick before letting the debounce run (readiness wait — assertions stay in specs).
    // waitForFunction has no Scout default (unlike expect/actionTimeout).
    await this.page.waitForFunction(
      ({ sel, expected }) => {
        const el = document.querySelector(sel);
        return el instanceof HTMLInputElement && el.value === expected;
      },
      { sel: selector, expected: value },
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await this.page.waitForTimeout(FORMAT_PARAM_DEBOUNCE_FLUSH_MS);
  }

  /** Changes the axis side of the currently open dimension editor. */
  async changeAxisSide(newSide: 'left' | 'right' | 'auto') {
    await this.page.testSubj.click(`lnsXY_axisSide_groups_${newSide}`);
  }

  /** Returns the selected axis side label from an open dimension editor. */
  async getSelectedAxisSide(): Promise<string> {
    const selectedButton = this.page.locator(
      '[data-test-subj^="lnsXY_axisSide_groups_"][aria-pressed="true"]'
    );
    await selectedButton.waitFor({ state: 'visible' });
    const text = (await selectedButton.innerText()).trim();
    if (!text) {
      throw new Error('Axis side button text not yet rendered');
    }
    return text;
  }

  /** Focused field list item — name + test-subj for keyboard-DnD assertions (FTR `assertFocusedField`). */
  async getFocusedField(): Promise<{ name: string; testSubj: string | null }> {
    return this.page.evaluate(() => {
      const input = document.activeElement as HTMLElement | null;
      if (!input) {
        return { name: '', testSubj: null };
      }
      // FTR: activeElement parent holds `data-test-subj="lnsFieldListPanelField"`.
      const parent = input.parentElement;
      let fieldEl: HTMLElement | null = input;
      while (fieldEl && !fieldEl.getAttribute('data-attr-field')) {
        fieldEl = fieldEl.parentElement;
      }
      return {
        name: fieldEl?.getAttribute('data-attr-field') ?? '',
        testSubj: parent?.getAttribute('data-test-subj') ?? null,
      };
    });
  }

  /** Visible text of the focused field list item (for keyboard-DnD assertions). */
  async getFocusedFieldName(): Promise<string> {
    return (await this.getFocusedField()).name;
  }

  /** Visible text of the focused dimension trigger (for keyboard-DnD assertions). */
  async getFocusedDimensionLabel(): Promise<string> {
    return this.page.evaluate(() => {
      const input = document.activeElement;
      if (!input) {
        return '';
      }
      const dimension = input.parentElement?.parentElement;
      return (dimension?.textContent ?? '').replace(/\u200b/g, '').trim();
    });
  }

  /**
   * Opens the advanced accordion so time-shift / filter-by controls are available.
   * Requires an open dimension editor.
   */
  async enableTimeShift() {
    await this.page.testSubj.click('indexPattern-advanced-accordion');
    await this.timeShift.waitFor({ state: 'visible' });
  }

  /**
   * Clears any time-shift value on the open dimension (plain-text combo, not pills).
   * Caller must open the advanced accordion first (`enableTimeShift`).
   */
  async clearTimeShift() {
    await this.timeShiftComboInput.click();
    // Prefer the EUI clear control — Backspace alone often leaves the humanized selection
    // ("6 hours ago (6h)") when the options list is open.
    await this.timeShiftClearButton.waitFor({ state: 'visible' });
    await this.timeShiftClearButton.click();
    await this.page.waitForFunction(
      (testSubj) => {
        const rootEl = document.querySelector(`[data-test-subj="${testSubj}"]`);
        const inputEl = rootEl?.querySelector(
          'input[data-test-subj="comboBoxSearchInput"]'
        ) as HTMLInputElement | null;
        const text = rootEl?.textContent ?? '';
        return !inputEl?.value && !/\d+\s*hours?\s*ago/i.test(text);
      },
      TIME_SHIFT_TEST_SUBJ,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
  }

  /**
   * Sets a custom time-shift value (e.g. `6h`) on the open dimension.
   * Caller must open the advanced accordion first (`enableTimeShift`).
   *
   * Mirrors FTR `comboBox.setCustom`: type + Enter. Lens humanizes the committed
   * label (e.g. `6h` → `6 hours ago (6h)`), so EUI `setCustomSelectedOptions`
   * exact-label membership checks are the wrong readiness signal.
   */
  async setTimeShift(shift: string) {
    await this.timeShiftComboInput.click();
    // Prefer fill over pressSequentially: EUI remounts the search input when the dropdown
    // opens, which races character-by-character typing.
    await this.timeShiftSearchInput.fill(shift);
    await this.timeShiftSearchInput.press('Enter');
    // Lens humanizes the label (e.g. `6h` → `6 hours ago (6h)`). Match the token anywhere
    // under the combo root — committed asPlainText value may not live only on input.value.
    await this.page.waitForFunction(
      ({ testSubj, token }) => {
        const rootEl = document.querySelector(`[data-test-subj="${testSubj}"]`);
        return (rootEl?.textContent ?? '').includes(token);
      },
      { testSubj: TIME_SHIFT_TEST_SUBJ, token: shift },
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
  }

  /**
   * Clicks the workspace error fix action (e.g. convert terms → filters for time shift).
   * Waits for the fix button to clear so the next assert does not race the state update.
   */
  async useFixAction() {
    await this.errorFixAction.click();
    await this.errorFixAction.waitFor({ state: 'hidden', timeout: 30_000 });
  }

  /**
   * Adds another terms field to a multi-field terms aggregation.
   * Requires an open terms dimension editor.
   *
   * FieldInputs uses `useDebouncedValue` (256ms) before `secondaryFields` reaches store
   * state. Closing the editor before that flush drops the pending commit and leaves a
   * single-term column (fix-action then hits field-stats). Wait for the dimension trigger
   * text to reflect the extra field before returning.
   */
  async addTermToAgg(field: string) {
    const fieldCombos = this.page.locator('[data-test-subj^="indexPattern-dimension-field"]');
    const nextIndex = await fieldCombos.count();
    const comboTestSubj = `indexPattern-dimension-field-${nextIndex}`;

    await this.page.testSubj.click('indexPattern-terms-add-field');
    await this.page.testSubj.locator(comboTestSubj).waitFor({ state: 'visible' });
    await this.page.components.comboBox(comboTestSubj).setSelectedOptions([field]);

    await this.page.waitForFunction(
      ({ expected }) => {
        const triggers = [...document.querySelectorAll('[data-test-subj="lns-dimensionTrigger"]')];
        return triggers.some((el) => {
          const text = el.textContent ?? '';
          return text.includes('+ 1 other') || text.includes(expected);
        });
      },
      { expected: field },
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
  }

  /**
   * Sets the display name of the currently open dimension.
   * NameInput remounts when the label commits (`DebouncedInput` key); wait for the value
   * rather than treating a detached node as success.
   */
  async editDimensionLabel(label: string) {
    await this.dimensionNameInput.waitFor({ state: 'visible' });
    await this.dimensionNameInput.scrollIntoViewIfNeeded();
    await this.dimensionNameInput.fill(label);
    await this.page.waitForFunction(
      (expected) => {
        const el = document.querySelector('[data-test-subj="name-input"]');
        return el instanceof HTMLInputElement && el.value === expected;
      },
      label,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
    // The typed value is only in the input: `useDebouncedValue` holds it ~256ms, then commits
    // the whole column from the state its closure captured. Anything edited in between (format,
    // color) is silently reverted by that commit, so wait until the label reaches Lens state.
    // The dimension trigger keeps rendering behind the editor flyout and shows the custom label.
    // waitForFunction has no Scout default (unlike expect/actionTimeout).
    await this.page.waitForFunction(
      (expected) =>
        Array.from(document.querySelectorAll('[data-test-subj="lns-dimensionTrigger"]')).some(
          (el) => (el.textContent ?? '').replace(/\u200b/g, '').includes(expected)
        ),
      label,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
  }

  /**
   * Configures the reference (sub-function / field) of the currently open dimension.
   * Caller must have a reference-based operation editor open (e.g. moving_average).
   *
   * `operation` is the sub-function display label (`Sum`, `Unique count`, …), not the
   * operation id: the reference combo lists labels and EUI matches them exactly.
   */
  async configureReference(opts: { operation?: string; field?: string }) {
    const { operation, field } = opts;
    if (operation != null) {
      await this.page.components
        .comboBox('indexPattern-reference-function')
        .setSelectedOptions([operation]);
    }
    if (field != null) {
      await this.page.components
        .comboBox('indexPattern-dimension-field')
        .setSelectedOptions([field], { timeout: 10_000 });
      await this.page.waitForFunction(
        (expected) =>
          document
            .querySelector('[data-test-subj="indexPattern-dimension-field"]')
            ?.getAttribute('data-selected-field') === expected,
        field,
        { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
      );
    }
  }

  /**
   * Sets the color of the currently open dimension. EUI may normalize case
   * (e.g. `#ff0000` → `#FF0000`); wait until the committed value matches ignoring case.
   */
  async editDimensionColor(hex: string) {
    await this.dimensionColorPicker.waitFor({ state: 'visible' });
    await this.dimensionColorPicker.fill('');
    await this.dimensionColorPicker.fill(hex);
    await this.page.waitForFunction(
      (expected) => {
        const el = document.querySelector('[data-test-subj*="indexPattern-dimension-colorPicker"]');
        return el instanceof HTMLInputElement && el.value.toLowerCase() === expected.toLowerCase();
      },
      hex,
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
  }

  /** Returns the committed color-picker value of the currently open dimension. */
  async getDimensionColor(): Promise<string> {
    await this.dimensionColorPicker.waitFor({ state: 'visible' });
    return this.dimensionColorPicker.inputValue();
  }

  /** Locator for the hover-revealed remove control of a dimension panel. */
  getDimensionRemoveLocator(dimensionTestSubj: string) {
    return this.page.testSubj.locator(`${dimensionTestSubj} > indexPattern-dimension-remove`);
  }

  /**
   * Removes one dimension (the first) in the given panel and waits until its
   * trigger count drops by one. Caller should hover-assert the remove control
   * when that visibility is under test.
   */
  async removeDimension(dimensionTestSubj: string) {
    const triggers = this.getDimensionTriggersLocator(dimensionTestSubj);
    const removeLocator = this.getDimensionRemoveLocator(dimensionTestSubj);
    const countBefore = await triggers.count();
    const buttons = await removeLocator.all();
    const button = buttons[0];
    if (!button) {
      throw new Error(`No remove control for "${dimensionTestSubj}"`);
    }
    await button.hover();
    await button.click();
    await this.page.waitForFunction(
      ({ panelSubj, expected }) =>
        document.querySelectorAll(
          `[data-test-subj="${panelSubj}"] [data-test-subj="lns-dimensionTrigger"]`
        ).length === expected,
      { panelSubj: dimensionTestSubj, expected: Math.max(0, countBefore - 1) },
      { timeout: WAIT_FOR_FUNCTION_TIMEOUT_MS }
    );
  }
}
