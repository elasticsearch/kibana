/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { subj } from '@kbn/test-subj-selector';
import { EuiComboBoxWrapper, type ScoutPage, type Locator } from '@kbn/scout';

export enum AddExceptionButtonType {
  OR = 'or',
  AND = 'and',
  NESTED = 'nested',
}

/**
 * Page object for the "Add rule exception" / "Add exception" flyout that
 * surfaces from a detection alert's context menu. Drives the exception
 * builder, the bulk-close checkbox, and the submit button.
 */
export class AddExceptionFlyoutPage {
  public readonly itemNameInput: Locator;
  /** Underlying `<input type="checkbox">` for the bulk-close option. Specs can
   * use `expect(...).toBeEnabled()` directly on this locator. */
  public readonly bulkCloseCheckbox: Locator;
  public readonly submitButton: Locator;
  public readonly flyoutTitle: Locator;

  private readonly addExceptionButtons: Record<AddExceptionButtonType, Locator>;

  constructor(private readonly page: ScoutPage) {
    this.flyoutTitle = this.page.testSubj.locator('exceptionFlyoutTitle');
    this.itemNameInput = this.page.testSubj.locator('exceptionFlyoutNameInput');
    this.bulkCloseCheckbox = this.page.testSubj.locator('bulkCloseAlertOnAddExceptionCheckbox');
    this.submitButton = this.page.testSubj.locator('addExceptionConfirmButton');

    this.addExceptionButtons = {
      [AddExceptionButtonType.OR]: page.testSubj.locator('exceptionsOrButton'),
      [AddExceptionButtonType.AND]: page.testSubj.locator('exceptionsAndButton'),
      [AddExceptionButtonType.NESTED]: page.testSubj.locator('exceptionsNestedButton'),
    };
  }

  async waitForVisible() {
    await this.flyoutTitle.waitFor({ state: 'visible' });
  }

  async addException(buttonType: AddExceptionButtonType) {
    await this.addExceptionButtons[buttonType].click();
  }

  async fillConditionEntry({
    entryIndex,
    field,
    operator,
    value,
  }: {
    entryIndex: number;
    field: string;
    operator: string;
    value: string;
  }) {
    const entrySelector = `${subj('exceptionItemEntryContainer')} >> nth=${entryIndex}`;

    const fieldCombo = new EuiComboBoxWrapper(this.page, {
      locator: `${entrySelector} >> ${subj('fieldAutocompleteComboBox')}`,
    });

    const valueCombo = new EuiComboBoxWrapper(this.page, {
      locator: `${entrySelector} >> ${subj('valuesAutocompleteMatch')}`,
    });

    await fieldCombo.selectSingleOption(field);
    await this.selectOperator(entrySelector, operator);
    await valueCombo.setCustomSingleOption(value);
  }

  /**
   * Manually selects an operator on the condition entry at the given selector.
   *
   * We can't use {@link EuiComboBoxWrapper.selectSingleOption} here: it calls
   * `clear()` first, which clicks the combobox's clear button. The operator
   * combo is a required EUI combobox (`isClearable={false}`) so the clear
   * button isn't rendered, and the click times out. Field/value combos avoid
   * this only because they start empty and `clear()` short-circuits.
   * @param entrySelector
   * @param operator
   */
  private async selectOperator(entrySelector: string, operator: string) {
    const operatorCombo = this.page.locator(
      `${entrySelector} >> ${subj('operatorAutocompleteComboBox')}`
    );
    // Open the dropdown
    await operatorCombo.locator(subj('comboBoxToggleListButton')).click();
    await this.page.getByRole('option', { name: operator, exact: true }).click();
  }

  async setExceptionName(name: string) {
    await this.itemNameInput.fill(name);
  }

  async tickBulkClose() {
    // Playwright's `.check()` is no-op when already checked and fails fast
    // when the checkbox is disabled, which is the right signal for callers.
    await this.bulkCloseCheckbox.check();
  }

  async submit() {
    await this.submitButton.click();
  }
}
