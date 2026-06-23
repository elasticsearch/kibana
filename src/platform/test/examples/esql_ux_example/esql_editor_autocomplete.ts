/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../functional/ftr_provider_context';

const SOURCE_QUERY = 'FROM logstash-* ';

// eslint-disable-next-line import/no-default-export
export default function ({ getService }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');
  const find = getService('find');
  const browser = getService('browser');
  const esql = getService('esql');

  async function waitForSuggestionWidget(visible: boolean) {
    await retry.try(async () => {
      const suggestWidget = await find.byCssSelector('.monaco-editor .suggest-widget');
      const isDisplayed = await suggestWidget.isDisplayed();

      expect(isDisplayed).to.be(visible);
    });
  }

  describe('ES|QL Editor autocomplete', function () {
    beforeEach(async () => {
      await browser.pressKeys(browser.keys.ESCAPE);
      await esql.setEsqlEditorQuery('');
    });

    it('should show suggestions automatically after typing space', async () => {
      await esql.typeEsqlEditorQuery('FROM ');
      await waitForSuggestionWidget(true);
    });

    it('should show suggestions automatically after pipe and space', async () => {
      await esql.typeEsqlEditorQuery(`${SOURCE_QUERY}| `);
      await waitForSuggestionWidget(true);
    });

    it('should not insert unwanted characters after operator selection', async () => {
      await esql.typeEsqlEditorQuery(`${SOURCE_QUERY}| WHERE bytes `);
      await waitForSuggestionWidget(true);

      await browser.pressKeys(browser.keys.ENTER);

      const finalValue = await esql.getEsqlEditorQuery();
      expect(finalValue).to.not.contain('$0');
    });

    it('should accept inline suggestion from query history with TAB', async () => {
      await esql.typeEsqlEditorQuery('FROM logstash-');
      await browser.pressKeys('*');

      await retry.try(async () => {
        const ghostText = await find.byCssSelector('.monaco-editor .ghost-text-decoration');
        expect(await ghostText.isDisplayed()).to.be(true);
      });

      await browser.pressKeys(browser.keys.TAB); // Accept inline suggestion

      await retry.try(async () => {
        const finalValue = await esql.getEsqlEditorQuery();
        expect(finalValue).to.be('FROM logstash-* | WHERE KQL("term")');
      });
    });

    it('should open timepicker and insert date when selecting a day', async () => {
      await esql.typeEsqlEditorQuery(`${SOURCE_QUERY}| WHERE @timestamp > `);
      await esql.selectEsqlSuggestionByLabel('time picker');

      const todayButton = await find.byCssSelector('.react-datepicker__day--today');
      await todayButton.click();

      const finalValue = await esql.getEsqlEditorQuery();
      expect(finalValue).to.contain('T');
    });

    it('should close suggestions when loosing focus', async () => {
      await esql.typeEsqlEditorQuery(`${SOURCE_QUERY}| `);
      await waitForSuggestionWidget(true);

      await browser.pressKeys(browser.keys.ESCAPE);
      await waitForSuggestionWidget(false);
    });

    it('should automatically show suggestions when refocusing editor', async () => {
      await esql.typeEsqlEditorQuery(`${SOURCE_QUERY}| `);
      await waitForSuggestionWidget(true);

      await browser.pressKeys(browser.keys.ESCAPE);
      await waitForSuggestionWidget(false);

      await testSubjects.click('ESQLEditor-toggleWordWrap');

      await esql.focusEditor();
      await waitForSuggestionWidget(true);
    });
  });
}
