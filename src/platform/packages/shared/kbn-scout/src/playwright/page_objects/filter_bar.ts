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

interface FilterCreationOptions {
  field: string;
  operator: 'is' | 'is not' | 'is one of' | 'is not one of' | 'exists' | 'does not exist';
  value: string;
}

interface FilterFormOptions {
  field: string;
  operator: string;
  value?: string | string[] | { from: string; to: string };
}

interface FilterStateOptions {
  field: string;
  value: string;
  enabled?: boolean;
  pinned?: boolean;
  negated?: boolean;
}

export class FilterBar {
  constructor(private readonly page: ScoutPage) {}

  async addFilter(options: FilterCreationOptions) {
    await this.page.testSubj.click('addFilter');
    await this.page.testSubj.waitForSelector('addFilterPopover');
    // set field name
    await this.page.testSubj.typeWithDelay(
      'filterFieldSuggestionList > comboBoxSearchInput',
      options.field
    );
    await this.page.testSubj.click(`filterFieldOption-${options.field}`);
    // set operator
    await expect(this.page.testSubj.locator('filterOperatorList')).not.toHaveClass(
      /euiComboBox-isDisabled/
    );
    await this.page.testSubj.typeWithDelay(
      'filterOperatorList > comboBoxSearchInput',
      options.operator
    );
    await this.page.testSubj.click(`filterOperatorOption-${options.operator}`);
    // set value
    const filterParamsInput = this.page.locator('[data-test-subj="filterParams"] input');
    await expect(filterParamsInput).not.toHaveAttribute('disabled');
    // await this.page.waitForTimeout(100); // wait for input to be ready
    await expect(filterParamsInput).toBeEditable();
    await filterParamsInput.focus();
    await this.page.typeWithDelay('[data-test-subj="filterParams"] input', options.value);
    // save filter and wait for popover to close
    await this.page.testSubj.click('saveFilter');
    await expect(
      this.page.testSubj.locator('addFilterPopover'),
      'Filter popover should close after saving'
    ).toBeHidden();

    await expect(
      this.page.testSubj.locator('^filter-badge'),
      'New filter badge should be displayed'
    ).toBeVisible();
  }

  async removeFilter(field: string) {
    const filterBadge = this.page.testSubj.locator(`~filter & ~filter-key-${field}`);
    await filterBadge.click();
    await this.page.testSubj.click('deleteFilter');
  }

  async getFilterCount(): Promise<number> {
    return this.page.testSubj.locator('^filter-badge').count();
  }

  async hasFilter(options: FilterStateOptions) {
    const testSubjLocator = [
      '~filter',
      options.enabled !== undefined && `~filter-${options.enabled ? 'enabled' : 'disabled'}`,
      options.field && `~filter-key-${options.field}`,
      options.value && `~filter-value-${options.value}`,
      options.pinned !== undefined && `~filter-${options.pinned ? 'pinned' : 'unpinned'}`,
      options.negated !== undefined && (options.negated ? '~filter-negated' : ''),
    ]
      .filter(Boolean)
      .join(' & ');

    return this.page.testSubj.isVisible(testSubjLocator, { strict: true });
  }

  async toggleFilterEnabled(field: string) {
    await this.page.testSubj.click(`~filter & ~filter-key-${field}`);
    await this.page.testSubj.click('disableFilter');
  }

  async toggleFilterPinned(field: string) {
    await this.page.testSubj.click(`~filter & ~filter-key-${field}`);
    await this.page.testSubj.click('pinFilter');
  }

  async toggleFilterNegated(field: string) {
    await this.page.testSubj.click(`~filter & ~filter-key-${field}`);
    await this.page.testSubj.click('negateFilter');
  }

  async hasFilterWithId(
    id: string,
    enabled = true,
    pinned = false,
    negated = false
  ): Promise<boolean> {
    const dataSubj = [
      '~filter',
      `~filter-${enabled ? 'enabled' : 'disabled'}`,
      `~filter-${pinned ? 'pinned' : 'unpinned'}`,
      negated ? '~filter-negated' : '',
      `~filter-id-${id}`,
    ]
      .filter(Boolean)
      .join(' & ');
    return this.page.testSubj.isVisible(dataSubj);
  }

  async clickEditFilterById(id: string) {
    await this.page.testSubj.click(`~filter & ~filter-id-${id}`);
    await this.page.testSubj.click('editFilter');
  }

  async getFilterEditorPreview(): Promise<string> {
    const preview = this.page.testSubj.locator('filter-preview');
    return preview.innerText();
  }

  async getFiltersLabel(): Promise<string[]> {
    const filters = this.page.testSubj.locator('~filter');
    return filters.evaluateAll((elements) =>
      elements.map((el) => (el as HTMLElement).innerText.trim())
    );
  }

  async addAndFilter(path: string) {
    const filterForm = this.page.testSubj.locator(`filter-${path}`);
    await filterForm.locator('[data-test-subj="add-and-filter"]').click();
  }

  async addOrFilter(path: string) {
    const filterForm = this.page.testSubj.locator(`filter-${path}`);
    await filterForm.locator('[data-test-subj="add-or-filter"]').click();
  }

  async openFilterBuilder() {
    await this.page.testSubj.click('addFilter');
    await this.page.testSubj.waitForSelector('addFilterPopover', { state: 'visible' });
  }

  async saveAndCloseFilterBuilder() {
    await this.page.testSubj.click('saveFilter');
    await this.page.testSubj.waitForSelector('addFilterPopover', { state: 'hidden' });
  }

  /**
   * Fill a filter form at a given path inside the filter builder.
   * Mirrors the FTR `filterBar.createFilter` / `pasteFilterData` for leaf filters.
   */
  async fillFilterForm(path: string, options: FilterFormOptions) {
    const form = this.page.locator(`[data-test-subj="filter-${path}"]`);
    await form.locator('[data-test-subj="filterFieldSuggestionList"] input').fill(options.field);
    await this.page.testSubj.click(`filterFieldOption-${options.field}`);

    await form.locator('[data-test-subj="filterOperatorList"] input').fill(options.operator);
    await this.page.testSubj.click(`filterOperatorOption-${options.operator}`);

    if (options.value === undefined) {
      return;
    }

    if (typeof options.value === 'object' && !Array.isArray(options.value)) {
      await form.locator('[data-test-subj="range-start"]').fill(options.value.from);
      await form.locator('[data-test-subj="range-end"]').fill(options.value.to);
    } else if (Array.isArray(options.value)) {
      const input = form.locator('[data-test-subj="filterParams"] input');
      for (const v of options.value) {
        await input.fill(v);
        await input.press('Enter');
      }
    } else {
      const input = form.locator('[data-test-subj="filterParams"] input');
      await input.fill(options.value);
      await input.press('Enter');
    }
  }
}
