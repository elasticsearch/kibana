/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { FtrService } from '../ftr_provider_context';

interface DataViewOptions {
  name: string;
  adHoc?: boolean;
  hasTimeField?: boolean;
  changeTimestampField?: string;
}

export class DataViewsService extends FtrService {
  private readonly retry = this.ctx.getService('retry');
  private readonly testSubjects = this.ctx.getService('testSubjects');
  private readonly find = this.ctx.getService('find');
  private readonly comboBox = this.ctx.getService('comboBox');
  private readonly header = this.ctx.getPageObjects(['header']).header;

  private async create({
    name, // Data View title, * will be added automatically
    adHoc = false, // pass 'true' to have temporary Data View
    hasTimeField = false, // pass 'true' if Data View has timestamp field
    changeTimestampField, // optionally override default timestamp field
  }: DataViewOptions) {
    await this.testSubjects.existOrFail('indexPatternEditorFlyout');

    await this.retry.waitFor('data view title input to be valid', async () => {
      await this.testSubjects.setValue('createIndexPatternTitleInput', name, {
        clearWithKeyboard: true,
        typeCharByChar: true,
      });

      await this.testSubjects.waitForAttributeToChange(
        'createIndexPatternTitleInput',
        'data-is-validating',
        '0'
      );

      const isInvalid = await this.testSubjects.getAttribute(
        'createIndexPatternTitleInput',
        'aria-invalid'
      );

      return isInvalid !== 'true';
    });

    await this.testSubjects.waitForAttributeToChange('timestampField', 'data-is-loading', '0');

    if (await this.testSubjects.isEnabled('timestampField > comboBoxSearchInput')) {
      if (!hasTimeField) {
        await this.comboBox.set('timestampField', "--- I don't want to use the time filter ---");
      } else if (changeTimestampField) {
        await this.comboBox.set('timestampField', changeTimestampField!);
      }
    }

    await this.testSubjects.click(adHoc ? 'exploreIndexPatternButton' : 'saveIndexPatternButton');
    await this.header.waitUntilLoadingHasFinished();
  }

  /**
   * Create a new Data View from top search bar
   */
  async createFromSearchBar({
    name,
    adHoc = false,
    hasTimeField = false,
    changeTimestampField,
  }: DataViewOptions) {
    await this.testSubjects.click('*dataView-switch-link');
    await this.testSubjects.click('dataview-create-new');
    await this.create({ name, adHoc, hasTimeField, changeTimestampField });
  }

  /**
   * Create the first Data View from Prompt, e.g. on Dashboard
   */
  async createFromPrompt({
    name,
    adHoc = false,
    hasTimeField = false,
    changeTimestampField,
  }: DataViewOptions) {
    await this.testSubjects.click('createDataViewButton');
    await this.create({ name, adHoc, hasTimeField, changeTimestampField });
  }

  /**
   * Returns name for the currently selected Data View
   */
  async getSelectedName() {
    return this.testSubjects.getVisibleText('*dataView-switch-link');
  }

  /**
   * Checks if currently selected Data View has temporary badge
   */
  async isAdHoc() {
    const dataView = await this.testSubjects.getAttribute('*dataView-switch-link', 'title');
    await this.testSubjects.click('*dataView-switch-link');
    const hasBadge = await this.testSubjects.exists(`dataViewItemTempBadge-${dataView}`);
    await this.testSubjects.click('*dataView-switch-link');
    return hasBadge;
  }

  /**
   * Checks if currently selected Data View has managed badge
   */
  async isManaged() {
    const dataView = await this.testSubjects.getAttribute('*dataView-switch-link', 'title');
    await this.testSubjects.click('*dataView-switch-link');
    const hasBadge = await this.testSubjects.exists(`dataViewItemManagedBadge-${dataView}`);
    await this.testSubjects.click('*dataView-switch-link');
    return hasBadge;
  }

  /**
   * Opens Create field flayout for the selected Data View
   */
  async clickAddFieldFromSearchBar() {
    await this.testSubjects.click('*dataView-switch-link');
    await this.testSubjects.click('indexPattern-add-field');
    await this.testSubjects.existOrFail('fieldEditor');
  }

  /**
   * Switch Data View from top search bar
   */
  public async switchTo(name: string) {
    const selectedDataView = await this.getSelectedName();
    if (name === selectedDataView) {
      return;
    }
    await this.testSubjects.click('*dataView-switch-link');
    await this.testSubjects.existOrFail('indexPattern-switcher');
    await this.testSubjects.setValue('indexPattern-switcher--input', name);
    await this.find.clickByCssSelector(
      `[data-test-subj="indexPattern-switcher"] [data-test-subj="dataView-${name}"]`
    );
  }

  /**
   * Waits for selected Data View to equal name argument
   */
  public async waitForSwitcherToBe(name: string) {
    await this.retry.waitFor(
      'Data View switcher to be updated',
      async () => (await this.getSelectedName()) === name
    );
  }

  /**
   * Switch Data View from top search bar and validate selection is applied
   */
  public async switchToAndValidate(name: string) {
    await this.switchTo(name);
    await this.waitForSwitcherToBe(name);
  }

  /**
   * Edit currently selected Data View
   */
  public async editFromSearchBar({
    newName,
    newIndexPattern,
    newTimeField,
  }: {
    newName?: string;
    newIndexPattern?: string;
    newTimeField?: string;
  }) {
    await this.testSubjects.click('*dataView-switch-link');
    await this.testSubjects.click('indexPattern-manage-field');
    await this.testSubjects.existOrFail('indexPatternEditorFlyout');
    if (newName) {
      await this.testSubjects.setValue('createIndexPatternNameInput', newName, {
        clearWithKeyboard: true,
        typeCharByChar: true,
      });
    }
    if (newIndexPattern) {
      await this.testSubjects.setValue('createIndexPatternTitleInput', newIndexPattern, {
        clearWithKeyboard: true,
        typeCharByChar: true,
      });
    }
    if (newTimeField) {
      await this.comboBox.set('timestampField', newTimeField);
    }
    await this.testSubjects.click('saveIndexPatternButton');
    if (await this.testSubjects.exists('confirmModalConfirmButton')) {
      await this.testSubjects.click('confirmModalConfirmButton');
    }
  }
}
