/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import type { WebElementWrapper } from '@kbn/ftr-common-functional-ui-services';
import { Key } from 'selenium-webdriver';
import { FtrService } from '../ftr_provider_context';

export class ESQLService extends FtrService {
  private readonly retry = this.ctx.getService('retry');
  private readonly testSubjects = this.ctx.getService('testSubjects');
  private readonly monacoEditor = this.ctx.getService('monacoEditor');
  private readonly log = this.ctx.getService('log');
  private readonly browser = this.ctx.getService('browser');
  private readonly findService = this.ctx.getService('find');

  /** Ensures that the ES|QL code editor is loaded with a given statement */
  public async expectEsqlStatement(statement: string) {
    const codeEditor = await this.testSubjects.find('ESQLEditor');
    expect(await codeEditor.getAttribute('innerText')).to.contain(statement);
  }

  public async isQueryPresentInTable(query: string, items: string[][]) {
    const queryAdded = items.some((item) => {
      return item.some((cell) => cell === query);
    });

    expect(queryAdded).to.be(true);
  }

  public async isHistoryPanelOpen() {
    return await this.testSubjects.exists('ESQLEditor-history-container');
  }

  public async toggleHistoryPanel() {
    const isHistoryOpen = await this.isHistoryPanelOpen();
    await this.testSubjects.click('ESQLEditor-toggle-query-history-icon');
    await this.retry.waitFor('history queries to toggle', async () => {
      const isHistoryOpenAfterToggle = await this.isHistoryPanelOpen();
      return isHistoryOpen !== isHistoryOpenAfterToggle;
    });
  }

  public async getEditorHeight() {
    const editor = await this.testSubjects.find('ESQLEditor');
    return (await editor.getSize()).height;
  }

  public async resizeEditorBy(distance: number) {
    const resizeButton = await this.testSubjects.find('ESQLEditor-resize');
    await this.browser.dragAndDrop({ location: resizeButton }, { location: { x: 0, y: distance } });
  }

  public async getHistoryItems(): Promise<string[][]> {
    const queryHistory = await this.testSubjects.find('ESQLEditor-queryHistory');
    const tableItems = await this.getStarredHistoryTableItems(queryHistory);
    return tableItems;
  }

  public async getStarredItems(): Promise<string[][]> {
    const starredQueries = await this.testSubjects.find('ESQLEditor-starredQueries');
    const tableItems = await this.getStarredHistoryTableItems(starredQueries);
    return tableItems;
  }

  private async getStarredHistoryTableItems(element: WebElementWrapper): Promise<string[][]> {
    const tableBody = await this.retry.try(async () => element.findByTagName('tbody'));
    const $ = await tableBody.parseDomContent();
    return $('tr')
      .toArray()
      .map((tr) => {
        return $(tr)
          .find('td')
          .toArray()
          .map((cell) => {
            // if this is an EUI table, filter down to the specific cell content
            // otherwise this will include mobile-specific header information
            const euiTableCellContent = $(cell).find('.euiTableCellContent');

            if (euiTableCellContent.length > 0) {
              return $(cell).find('.euiTableCellContent').text().trim();
            } else {
              return $(cell).text().trim();
            }
          });
      });
  }

  public async getStarredItem(rowIndex = 0) {
    const queryHistory = await this.testSubjects.find('ESQLEditor-starredQueries');
    const tableBody = await this.retry.try(async () => queryHistory.findByTagName('tbody'));
    const rows = await this.retry.try(async () => tableBody.findAllByTagName('tr'));

    return rows[rowIndex];
  }

  public async clickStarredItem(rowIndex = 0) {
    const row = await this.getStarredItem(rowIndex);
    const toggle = await row.findByTestSubject('ESQLEditor-history-starred-queries-run-button');
    await toggle.click();
  }

  public async getHistoryItem(rowIndex = 0) {
    const queryHistory = await this.testSubjects.find('ESQLEditor-queryHistory');
    const tableBody = await this.retry.try(async () => queryHistory.findByTagName('tbody'));
    const rows = await this.retry.try(async () => tableBody.findAllByTagName('tr'));

    return rows[rowIndex];
  }

  public async clickHistoryItem(rowIndex = 0) {
    const row = await this.getHistoryItem(rowIndex);
    const toggle = await row.findByTestSubject('ESQLEditor-history-starred-queries-run-button');
    await toggle.click();
  }

  public async openHelpMenu() {
    await this.testSubjects.click('esql-help-popover-button');
    await this.retry.waitFor('popover to appear', async () => {
      return await this.testSubjects.exists('esql-quick-reference');
    });
  }

  public async isOpenQuickReferenceFlyout() {
    return await this.testSubjects.exists('esqlInlineDocumentationFlyout');
  }

  public async openQuickReferenceFlyout() {
    await this.openHelpMenu();
    await this.testSubjects.click('esql-quick-reference');
    await this.retry.waitFor('quick reference to appear', async () => {
      return await this.isOpenQuickReferenceFlyout();
    });
  }

  public async waitESQLEditorLoaded(editorSubjId = 'ESQLEditor'): Promise<WebElementWrapper> {
    this.log.debug('waitESQLEditorLoaded: ', editorSubjId);
    return await this.monacoEditor.waitCodeEditorReady(editorSubjId);
  }

  public async getEsqlEditorQuery() {
    await this.waitESQLEditorLoaded();
    return await this.monacoEditor.getCodeEditorValue();
  }

  public async setEsqlEditorQuery(query: string) {
    await this.monacoEditor.setCodeEditorValue(query);
  }

  public async submitEsqlEditorQuery() {
    await this.testSubjects.click('querySubmitButton');
  }

  public async typeEsqlEditorQuery(query: string, editorSubjId = 'ESQLEditor') {
    await this.setEsqlEditorQuery(''); // clear the default query
    await this.monacoEditor.typeCodeEditorValue(query, editorSubjId);
  }

  public async openEsqlControlFlyout(query: string) {
    await this.retry.waitFor('control flyout to open', async () => {
      await this.typeEsqlEditorQuery(query);
      await this.selectEsqlSuggestionByLabel('Create control');

      return await this.testSubjects.exists('create_esql_control_flyout');
    });
  }

  public async createEsqlControl(query: string) {
    await this.waitESQLEditorLoaded();
    await this.openEsqlControlFlyout(query);

    await this.retry.waitFor('ES|QL control flyout to close after saving the control', async () => {
      await this.testSubjects.waitForEnabled('saveEsqlControlsFlyoutButton');
      await this.testSubjects.click('saveEsqlControlsFlyoutButton');
      const flyoutOpen = await this.testSubjects.exists('create_esql_control_flyout', {
        timeout: 2000,
      });
      return !flyoutOpen;
    });

    await this.waitESQLEditorLoaded();
  }

  public async focusEditor(editorSubjId = 'ESQLEditor') {
    await this.retry.try(async () => {
      const editor = await this.testSubjects.find(editorSubjId);
      await editor.click();
    });
  }

  public async isQuickSearchVisorVisible() {
    const visorContainer = await this.testSubjects.find('ESQLEditor-quick-search-visor');
    const visorWrapper = await visorContainer.findByCssSelector(':scope > div');
    const opacity = await visorWrapper.getComputedStyle('opacity');

    return opacity === '1';
  }

  public async triggerSuggestions(editorSubjId = 'ESQLEditor') {
    await this.retry.try(async () => {
      const editor = await this.testSubjects.find(editorSubjId);
      const textarea = await editor.findByCssSelector('textarea');
      await textarea.type([Key.CONTROL, Key.SPACE]);
      const suggestionWidget = await this.monacoEditor.getCodeEditorSuggestWidget();
      expect(await suggestionWidget.isDisplayed()).to.be(true);
    });
  }

  public async selectEsqlSuggestionByLabel(label: string, editorSubjId = 'ESQLEditor') {
    await this.retry.try(
      async () => {
        await this.triggerSuggestions(editorSubjId);

        const suggestionWidget = await this.monacoEditor.getCodeEditorSuggestWidget();
        const suggestions = await suggestionWidget.findAllByCssSelector('.monaco-list-row');

        if (!suggestions.length) {
          throw new Error('No suggestions found');
        }

        let suggestionToSelect;
        for (const suggestion of suggestions) {
          if ((await suggestion.getVisibleText()).includes(label)) {
            suggestionToSelect = suggestion;
            break;
          }
        }

        if (!suggestionToSelect) {
          throw new Error(`Suggestion with label "${label}" not found.`);
        }

        await suggestionToSelect.click();

        await this.testSubjects.waitForDeleted(suggestionToSelect);
      },
      // we need to hit escape to close the widget before we try again.
      async () => {
        const editor = await this.testSubjects.find(editorSubjId);
        const textarea = await editor.findByCssSelector('textarea');
        await textarea.type([Key.ESCAPE]);
        const suggestionWidget = await this.monacoEditor.getCodeEditorSuggestWidget();
        expect(await suggestionWidget.isDisplayed()).to.be(false);
      }
    );
  }

  public async getEsqlBadgeHoverText(badgeClassName: string): Promise<string> {
    return this.retry.try(async () => {
      await this.browser.moveMouseTo({ x: 0, y: 0 });
      const badge = await this.findService.byCssSelector(`.${badgeClassName}`);
      await badge.moveMouseTo();

      await this.findService.byCssSelector(`.monaco-hover`);
      const rows = await this.findService.allByCssSelector(`.monaco-hover .hover-row`);
      const texts = await Promise.all(rows.map((row) => row.getVisibleText()));
      return texts.join(' ').trim();
    });
  }

  public async selectEsqlBadgeHoverOption(badgeClassName: string, optionText: string) {
    await this.retry.try(async () => {
      await this.browser.moveMouseTo({ x: 0, y: 0 });
      const badge = await this.findService.byCssSelector(`.${badgeClassName}`);
      await badge.moveMouseTo();

      await this.findService.byCssSelector(`.monaco-hover`);
      const options = await this.findService.allByCssSelector(`.monaco-hover .hover-row`);
      let optionToSelect;
      for (const option of options) {
        if ((await option.getVisibleText()).includes(optionText)) {
          optionToSelect = option;
          break;
        }
      }

      if (!optionToSelect) {
        throw new Error(`Option with text "${optionText}" not found in badge hover.`);
      }

      await optionToSelect.click();
      return true;
    });
  }

  public async toggleQuickSearchVisor(open: boolean) {
    await this.testSubjects.click('ESQLEditor-toggle-quick-search-visor');
    await this.retry.try(async () => {
      expect(await this.isQuickSearchVisorVisible()).to.be(open);
    });
  }

  public async toggleDatasourceDropdown(open: boolean) {
    if (open) {
      await this.retry.try(async () => {
        try {
          await this.testSubjects.click('visorSourcesDropdownButton');
        } catch (error) {
          if (error instanceof Error && error.message.includes('ElementClickInterceptedError')) {
            // Monaco suggestions can overlap the visor datasource button; dismiss and retry.
            await this.browser.pressKeys(Key.ESCAPE);
          }
          throw error;
        }
      });
    } else {
      await this.browser.pressKeys(Key.ESCAPE);
    }

    await this.retry.try(async () => {
      const exists = await this.testSubjects.exists('esqlEditor-visor-datasourcesList-switcher');
      expect(exists).to.be(open);
    });
  }
}
