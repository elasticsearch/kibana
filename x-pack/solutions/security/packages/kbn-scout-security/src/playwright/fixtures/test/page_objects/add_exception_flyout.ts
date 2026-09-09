/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { subj } from '@kbn/test-subj-selector';
import { type ScoutPage, type Locator } from '@kbn/scout';

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

  private readonly builderLoaded: Locator;
  private readonly addExceptionButtons: Record<AddExceptionButtonType, Locator>;

  constructor(private readonly page: ScoutPage) {
    this.flyoutTitle = this.page.testSubj.locator('exceptionFlyoutTitle');
    this.builderLoaded = this.page.testSubj.locator('addExceptionFlyoutBuilder-loaded');
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
    // The field combobox mounts empty before useFetchIndexPatterns resolves; wait for its options.
    await this.builderLoaded.waitFor({ state: 'visible' });
  }

  async addException(buttonType: AddExceptionButtonType) {
    await this.addExceptionButtons[buttonType].click();
  }

  /**
   * Reads the currently selected field option(s) for the condition entry at the
   * given index. Useful for asserting that the field combobox was populated
   * (its options come from the rule's index patterns / data view) rather than
   * left empty by a premature `waitForVisible()`.
   */
  async getSelectedConditionField(entryIndex: number): Promise<string[]> {
    const entrySelector = `${subj('exceptionItemEntryContainer')} >> nth=${entryIndex}`;
    const entryScope = this.page.locator(entrySelector);
    const fieldCombo = this.page.components.comboBox('fieldAutocompleteComboBox', entryScope);
    return fieldCombo.getSelectedOptions();
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
    const entryScope = this.page.locator(entrySelector);

    // Scope each combo to this entry (there can be several) via the helper's scope arg.
    const fieldCombo = this.page.components.comboBox('fieldAutocompleteComboBox', entryScope);
    const valueCombo = this.page.components.comboBox('valuesAutocompleteMatch', entryScope);

    // Field is an existing option (type-to-filter, then select); value is committed
    // as a custom onCreateOption match. Both combos start empty, so no clear is needed.
    await fieldCombo.setSelectedOptions([field]);
    await this.selectOperator(entrySelector, operator);
    await valueCombo.setCustomSelectedOptions([value]);
  }

  /**
   * Manually selects an operator on the condition entry at the given selector.
   *
   * We open the dropdown and click the option directly rather than routing
   * through the combobox helper: the operator combo is a required EUI combobox
   * (`isClearable={false}`) that already has a value selected, so picking from
   * the open list is unambiguous.
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
