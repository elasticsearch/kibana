/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { CustomCheerio, CustomCheerioStatic } from '@kbn/ftr-common-functional-ui-services';
import type { FtrProviderContext } from '../ftr_provider_context';

const ENTER_KEY = '\uE007';

export function TriggersActionsPageProvider({ getService }: FtrProviderContext) {
  const find = getService('find');
  const retry = getService('retry');
  const testSubjects = getService('testSubjects');
  const rules = getService('rules');
  const dataGrid = getService('dataGrid');

  function getRowItemData(row: CustomCheerio, $: CustomCheerioStatic) {
    return {
      name: $(row).findTestSubject('rulesTableCell-name').find('.euiTableCellContent').text(),
      duration: $(row)
        .findTestSubject('rulesTableCell-duration')
        .find('.euiTableCellContent')
        .text(),
      interval: $(row)
        .findTestSubject('rulesTableCell-interval')
        .find('.euiTableCellContent')
        .text(),
      tags: $(row)
        .findTestSubject('rulesTableCell-tagsPopover')
        .find('.euiTableCellContent')
        .text(),
    };
  }

  return {
    async getSectionHeadingText() {
      return await testSubjects.getVisibleText('appTitle');
    },
    async clickCreateFirstConnectorButton() {
      const createBtn = await testSubjects.find('createFirstActionButton');
      const createBtnIsVisible = await createBtn.isDisplayed();
      if (createBtnIsVisible) {
        await createBtn.click();
      }
    },
    async getRulesListTitle() {
      const noPermissionsTitle = await find.byCssSelector('[data-test-subj="rulesList"] .euiTitle');
      return await noPermissionsTitle.getVisibleText();
    },
    async clickCreateConnectorButton() {
      const createBtn = await testSubjects.find('createConnectorButton');
      const createBtnIsVisible = await createBtn.isDisplayed();
      if (createBtnIsVisible) {
        await createBtn.click();
      } else {
        await this.clickCreateFirstConnectorButton();
      }
    },
    async tableFinishedLoading() {
      await find.byCssSelector(
        '.euiBasicTable[data-test-subj="actionsTable"]:not(.euiBasicTable-loading)'
      );
    },
    async searchConnectors(searchText: string) {
      const searchBox = await find.byCssSelector('[data-test-subj="actionsList"] .euiFieldSearch');
      await searchBox.click();
      await searchBox.clearValue();
      await searchBox.type(searchText);
      await searchBox.pressKeys(ENTER_KEY);
      await retry.waitFor('connectors list filtered to the search text', async () => {
        const rows = await this.getConnectorsList();
        return rows.length > 0 && rows.every((row) => row.name.includes(searchText));
      });
    },
    async searchAlerts(searchText: string) {
      const searchBox = await testSubjects.find('ruleSearchField');
      await searchBox.click();
      await searchBox.clearValue();
      await searchBox.type(searchText);
      await searchBox.pressKeys(ENTER_KEY);
      await find.byCssSelector(
        '.euiBasicTable[data-test-subj="rulesList"]:not(.euiBasicTable-loading)'
      );
    },
    async getConnectorsList() {
      const table = await find.byCssSelector('[data-test-subj="actionsList"] table');
      const $ = await table.parseDomContent();
      return $.findTestSubjects('connectors-row')
        .toArray()
        .map((row) => {
          return {
            name: $(row)
              .findTestSubject('connectorsTableCell-name')
              .find('.euiTableCellContent')
              .text(),
            actionType: $(row)
              .findTestSubject('connectorsTableCell-actionType')
              .find('.euiTableCellContent')
              .text(),
          };
        });
    },
    async getAlertsList() {
      const table = await find.byCssSelector('[data-test-subj="rulesList"] table');
      const $ = await table.parseDomContent();
      return $.findTestSubjects('rule-row')
        .toArray()
        .map((row) => {
          return getRowItemData(row, $);
        });
    },
    async getAlertsListWithStatus() {
      const table = await find.byCssSelector('[data-test-subj="rulesList"] table');
      const $ = await table.parseDomContent();
      return $.findTestSubjects('rule-row')
        .toArray()
        .map((row) => {
          const rowItem = getRowItemData(row, $);
          return {
            ...rowItem,
            status: $(row)
              .findTestSubject('rulesTableCell-lastResponse')
              .find('.euiTableCellContent')
              .text(),
          };
        });
    },
    async isAlertsListDisplayed() {
      const table = await find.byCssSelector('[data-test-subj="rulesList"] table');
      return table.isDisplayed();
    },
    async isAnEmptyAlertsListDisplayed() {
      await retry.try(async () => {
        const table = await find.byCssSelector('[data-test-subj="rulesList"] table');
        const $ = await table.parseDomContent();
        const rows = $.findTestSubjects('rule-row').toArray();
        expect(rows.length).to.eql(0);
        const emptyRow = await find.byCssSelector(
          '[data-test-subj="rulesList"] table .euiTableRow'
        );
        expect(await emptyRow.getVisibleText()).to.eql('No items found');
      });
      return true;
    },
    async clickOnAlertInAlertsList(name: string) {
      await this.searchAlerts(name);
      await find.clickDisplayedByCssSelector(
        `[data-test-subj="rulesList"] [data-test-subj="rulesListTableRowName-${name}"]`
      );
    },
    async maybeClickOnAlertTab() {
      if (await testSubjects.exists('ruleDetailsTabbedContent')) {
        const alertTab = await testSubjects.find('ruleAlertListTab');
        await alertTab.click();
      }
    },
    async changeTabs(tab: 'rulesTab' | 'connectorsTab') {
      await testSubjects.click(tab);
    },
    async toggleSwitch(testSubject: string) {
      const switchBtn = await testSubjects.find(testSubject);
      await switchBtn.click();
    },
    async clickCreateAlertButton() {
      await rules.common.clickCreateAlertButton();
    },
    async setAlertName(value: string) {
      await testSubjects.setValue('ruleDetailsNameInput', value);
      await this.assertAlertName(value);
    },
    async assertAlertName(expectedValue: string) {
      const actualValue = await testSubjects.getAttribute('ruleDetailsNameInput', 'value');
      expect(actualValue).to.eql(expectedValue);
    },
    async setAlertInterval(value: number, unit?: 's' | 'm' | 'h' | 'd') {
      await testSubjects.setValue('ruleScheduleNumberInput', value.toString());
      if (unit) {
        await testSubjects.selectValue('ruleScheduleUnitInput', unit);
      }
      await this.assertAlertInterval(value, unit);
    },
    async assertAlertInterval(expectedValue: number, expectedUnit?: 's' | 'm' | 'h' | 'd') {
      const actualValue = await testSubjects.getAttribute('ruleScheduleNumberInput', 'value');
      expect(actualValue).to.eql(expectedValue);
      if (expectedUnit) {
        const actualUnitValue = await testSubjects.getAttribute('ruleScheduleUnitInput', 'value');
        expect(actualUnitValue).to.eql(expectedUnit);
      }
    },
    async saveAlert() {
      await testSubjects.click('rulePageFooterSaveButton');
      const isConfirmationModalVisible = await testSubjects.isDisplayed('confirmCreateRuleModal');
      expect(isConfirmationModalVisible).to.eql(true, 'Expect confirmation modal to be visible');
      await testSubjects.click('confirmModalConfirmButton');
    },
    async ensureRuleActionStatusApplied(
      ruleName: string,
      controlName: string,
      expectedStatus: string
    ) {
      await retry.tryForTime(30000, async () => {
        await this.searchAlerts(ruleName);
        const statusControl = await testSubjects.find(controlName);
        const title = (await statusControl.getAttribute('title')) ?? '';
        expect(title.toLowerCase()).to.eql(expectedStatus.toLowerCase());
      });
    },
    async ensureEventLogColumnExists(columnId: string) {
      const columnsButton = await testSubjects.find('dataGridColumnSelectorButton');
      await columnsButton.click();

      const button = await testSubjects.find(
        `dataGridColumnSelectorToggleColumnVisibility-${columnId}`
      );
      const isChecked = await button.getAttribute('aria-checked');

      if (isChecked === 'false') {
        await button.click();
      }

      await columnsButton.click();
    },
    async sortEventLogColumn(columnId: string, direction: string) {
      if (direction === 'asc') {
        await dataGrid.clickColumnActionAt(columnId, 1);
      }
      if (direction === 'desc') {
        await dataGrid.clickColumnActionAt(columnId, 2);
      }
    },
    async clickAlertsPageShowQueryMenuButton() {
      await testSubjects.click('showQueryBarMenu');
    },
    async getAlertsPageQuickFilters() {
      const queryBarMenuPanel = await find.byCssSelector('[data-test-subj="queryBarMenuPanel"]');
      const $ = await queryBarMenuPanel.parseDomContent();
      return $('[data-test-subj^="quick-filters-item"]');
    },
    async getAlertsPageAppliedFilters() {
      return await find.allByCssSelector('[data-test-subj="filter-items-group"] > *');
    },
    async getFilterGroupWrapper() {
      return await find.byCssSelector('.filter-group__wrapper');
    },
  };
}
