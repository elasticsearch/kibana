/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { FtrService } from '../ftr_provider_context';

export class UnifiedSearchPageObject extends FtrService {
  private readonly retry = this.ctx.getService('retry');
  private readonly testSubjects = this.ctx.getService('testSubjects');
  private readonly find = this.ctx.getService('find');
  private readonly PageObjects = this.ctx.getPageObjects(['discover']);

  public async switchDataView(switchButtonSelector: string, dataViewTitle: string) {
    await this.testSubjects.click(switchButtonSelector);

    const indexPatternSwitcher = await this.testSubjects.find('indexPattern-switcher', 500);
    await this.testSubjects.setValue('indexPattern-switcher--input', dataViewTitle);
    await (
      await indexPatternSwitcher.findByCssSelector(`[data-test-subj="dataView-${dataViewTitle}"]`)
    ).click();

    await this.retry.waitFor(
      'wait for updating switcher',
      async () => (await this.getSelectedDataView(switchButtonSelector)) === dataViewTitle
    );
  }

  public async getDataViewList(switchButtonSelector: string) {
    await this.testSubjects.click(switchButtonSelector);

    await this.retry.waitFor(
      'wait for popover',
      async () => await this.testSubjects.exists('indexPattern-switcher')
    );

    const indexPatternSwitcher = await this.testSubjects.find('indexPattern-switcher', 500);
    const items = await indexPatternSwitcher.findAllByCssSelector(
      '.euiSelectableListItem[data-test-subj^="dataView-"]'
    );
    const availableDataViews = await Promise.all(
      items.map(async (item) => {
        const testSubj = (await item.getAttribute('data-test-subj')) ?? '';
        return testSubj.slice('dataView-'.length);
      })
    );

    await this.testSubjects.click(switchButtonSelector);

    return availableDataViews;
  }

  public async getSelectedDataView(switchButtonSelector: string) {
    let visibleText = '';

    await this.retry.waitFor('wait for updating switcher', async () => {
      visibleText = await this.testSubjects.getVisibleText(switchButtonSelector);
      return Boolean(visibleText);
    });

    return visibleText;
  }

  public async selectTextBasedLanguage(language: string) {
    await this.find.clickByCssSelector(
      `[data-test-subj="text-based-languages-switcher"] [title="${language}"]`
    );
  }

  public async switchToDataViewMode() {
    await this.PageObjects.discover.selectDataViewMode();
    await this.retry.waitFor('the modal to open', async () => {
      return await this.testSubjects.exists('discover-esql-to-dataview-modal');
    });
    await this.testSubjects.click('discover-esql-to-dataview-no-save-btn');
    await this.retry.waitFor('the modal to close', async () => {
      return !(await this.testSubjects.exists('discover-esql-to-dataview-modal'));
    });
  }
}
