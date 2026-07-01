/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage } from '@kbn/scout';

// Detail page URL after a data view is saved: /app/management/kibana/dataViews/dataView/<id>
export const DATA_VIEW_DETAIL_URL_PATTERN = /\/management\/kibana\/dataViews\/.+/;

/**
 * Page object for the data view editor flyout.
 * Use `DataViewsManagementPage.openCreateWizard()` to open the flyout first,
 * then interact with it through this page object.
 */
export class DataViewEditorPage {
  private readonly flyout;
  private readonly form;
  readonly titleInput;
  readonly timestampField;
  readonly saveButton;
  readonly detailPageTitle;
  readonly detailUrlPattern = DATA_VIEW_DETAIL_URL_PATTERN;

  constructor(private readonly page: ScoutPage) {
    this.flyout = page.testSubj.locator('indexPatternEditorFlyout');
    this.form = page.testSubj.locator('indexPatternEditorForm');
    this.titleInput = page.testSubj.locator('createIndexPatternTitleInput');
    this.timestampField = page.testSubj.locator('timestampField');
    this.saveButton = page.testSubj.locator('saveIndexPatternButton');
    this.detailPageTitle = page.testSubj.locator('indexPatternTitle');
  }

  // Fills the title field and waits for async validation to settle.
  async setTitle(title: string): Promise<void> {
    await this.titleInput.fill(title);
    await this.form
      .and(this.page.locator('[data-validation-error="0"]'))
      .waitFor({ state: 'visible' });
  }

  // Returns the timestamp field combo box value after the field finishes loading.
  async getTimestampFieldValue(): Promise<string> {
    // data-is-loading is on the EuiComboBox element itself; use .and() to narrow to it.
    await this.timestampField
      .and(this.page.locator('[data-is-loading="0"]'))
      .waitFor({ state: 'visible' });
    return this.timestampField.locator('input[data-test-subj="comboBoxSearchInput"]').inputValue();
  }

  async save(): Promise<void> {
    await this.saveButton.click();
    await this.flyout.waitFor({ state: 'hidden' });
  }
}
