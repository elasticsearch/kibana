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

    await this.testSubjects.find('indexPattern-switcher', 500);
    // The switcher fetches its data view list asynchronously; typing the filter
    // before it renders races the re-render and can scramble the input, leaving
    // the target option unmatched. Wait for the list to populate first.
    await this.find.byCssSelector('[data-test-subj^="dataView-"]');
    await this.testSubjects.setValue('indexPattern-switcher--input', dataViewTitle);
    await this.testSubjects.click(`dataView-${dataViewTitle}`);

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
    let selectedDataView = '';

    await this.retry.waitFor('wait for updating switcher', async () => {
      const switchButton = await this.testSubjects.find(switchButtonSelector);
      const fullText = await switchButton.findAllByTestSubject('fullText', 1);
      selectedDataView = (
        fullText.length ? await fullText[0].getVisibleText() : await switchButton.getVisibleText()
      ).trim();
      return Boolean(selectedDataView);
    });

    return selectedDataView;
  }

  public async selectTextBasedLanguage(language: string) {
    await this.find.clickByCssSelector(
      `[data-test-subj="text-based-languages-switcher"] [title="${language}"]`
    );
  }

  public async switchToDataViewMode() {
    await this.PageObjects.discover.selectDataViewMode();
  }
}
