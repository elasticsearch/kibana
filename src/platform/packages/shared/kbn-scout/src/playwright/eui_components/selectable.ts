/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { subj } from '@kbn/test-subj-selector';
import type { Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import type { ScoutPage } from '../fixtures/scope/test/scout_page';
import { resolveSelector, type SelectorInput } from '../utils';

// https://eui.elastic.co/docs/components/forms/selection/selectable/
export class EuiSelectableWrapper {
  private readonly selectableWrapper: Locator;
  private readonly selectableList: Locator;
  private readonly selectableSearchInput: Locator;
  private readonly selectableClearButton: Locator;
  private readonly selectedOptions: Locator;

  /**
   * Create a new EuiSelectableWrapper instance.
   * new EuiSelectableWrapper(page, { dataTestSubj: 'mySelectable' })
   * new EuiSelectableWrapper(page, 'mySelectable') // backward compatibility
   * new EuiSelectableWrapper(page, { locator: 'role=combobox[name="Searchable example"]' })
   */
  constructor(page: ScoutPage, selector: SelectorInput) {
    this.selectableWrapper = resolveSelector(page, selector);

    this.selectableList = this.selectableWrapper.locator(subj('euiSelectableList'));
    this.selectableSearchInput = this.selectableWrapper.locator('.euiFieldSearch');
    this.selectableClearButton = this.selectableWrapper.locator(subj('clearSearchButton'));
    this.selectedOptions = this.selectableList.locator(
      'li[role="option"][aria-checked="true"] .euiSelectableListItem__text'
    );
  }

  async getSelectedOptions() {
    await this.selectableWrapper.waitFor({ state: 'visible' });
    await this.selectableList.waitFor({ state: 'visible' });

    // Get array of selected option text
    const selectedTexts = await this.selectedOptions.evaluateAll((elements) =>
      elements.map((e) =>
        // Extract only text nodes – ignore text in child <div>
        Array.from(e.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => (n.textContent ?? '').trim())
          .join('')
      )
    );
    return selectedTexts;
  }

  private async checkIfSelected(value: string): Promise<boolean> {
    const selectedOptions = await this.getSelectedOptions();
    return selectedOptions.includes(value);
  }

  private optionLocator(value: string) {
    return this.selectableList.getByRole('option', { name: value, exact: true });
  }

  private async clickOption(value: string) {
    await this.optionLocator(value).click();
  }

  async searchAndSelectFirst(value: string) {
    await this.selectableSearchInput.click();
    await this.selectableSearchInput.pressSequentially(value, { delay: 50 });
    await this.clickOption(value);
    await this.selectableClearButton.click();
  }

  async select(value: string) {
    if (await this.checkIfSelected(value)) {
      throw Error(`Value "${value}" is already selected in the selectable`);
    }
    await this.clickOption(value);
    await expect(this.optionLocator(value)).toHaveAttribute('aria-checked', 'true');
  }

  async unselect(value: string) {
    if (!(await this.checkIfSelected(value))) {
      throw Error(`Value "${value}" is not selected in the selectable`);
    }
    await this.clickOption(value);
    await expect(this.optionLocator(value)).toHaveAttribute('aria-checked', 'false');
  }
}
