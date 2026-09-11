/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Key } from 'selenium-webdriver';
import type { FtrProviderContext } from './ftr_provider_context';

export function SearchQueryRulesPageProvider({ getService }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');
  const find = getService('find');
  const comboBox = getService('comboBox');
  const browser = getService('browser');

  return {
    QueryRulesEmptyPromptPage: {
      TEST_IDS: {
        GET_STARTED_BUTTON: 'searchQueryRulesEmptyPromptGetStartedButton',
      },
      async expectQueryRulesEmptyPromptPageComponentsToExist() {
        await testSubjects.existOrFail(this.TEST_IDS.GET_STARTED_BUTTON);
      },
      async clickCreateQueryRulesSetButton() {
        await testSubjects.click(this.TEST_IDS.GET_STARTED_BUTTON);
      },
    },
    QueryRulesManagementPage: {
      TEST_IDS: {
        QUERY_RULES_RULESETS_TABLE: 'queryRulesSetTable',
        QUERY_RULES_ITEM_NAME: 'queryRuleSetName',
        QUERY_RULES_ITEM_RULE_COUNT: 'queryRuleSetItemRuleCount',
        QUERY_RULES_ITEM_ACTIONS_DELETE_BUTTON: 'queryRulesSetDeleteButton',
        CREATE_RULESET_BUTTON: 'queryRulesOverviewCreateButton',
        PAGINATION_NEXT_BUTTON: 'pagination-button-next',
        PAGINATION_PREVIOUS_BUTTON: 'pagination-button-previous',
      },
      async clickCreateQueryRulesRulesetButton() {
        await testSubjects.click(this.TEST_IDS.CREATE_RULESET_BUTTON);
      },
      async expectQueryRulesTableToExist() {
        await testSubjects.existOrFail(this.TEST_IDS.QUERY_RULES_RULESETS_TABLE);
      },
      async getQueryRulesRulesetsList() {
        const table = await testSubjects.find(this.TEST_IDS.QUERY_RULES_RULESETS_TABLE);
        const allRows = await table
          .findByTagName('tbody')
          .then((tbody) => tbody.findAllByTagName('tr'));

        return Promise.all(
          allRows.map(async (row) => {
            const $ = await row.parseDomContent();
            return {
              name: $.findTestSubject(this.TEST_IDS.QUERY_RULES_ITEM_NAME).text().trim(),
              ruleCount: Number(
                $.findTestSubject(this.TEST_IDS.QUERY_RULES_ITEM_RULE_COUNT).text()
              ),
            };
          })
        );
      },
      async clickRuleset(name: string) {
        // find rulesets with name and click on it
        const table = await testSubjects.findAll(this.TEST_IDS.QUERY_RULES_ITEM_NAME);
        for (const item of table) {
          const text = await item.getVisibleText();
          if (text === name) {
            await item.click();
            return;
          }
        }
        throw new Error(`Ruleset with name "${name}" not found`);
      },
      async clickDeleteRulesetRow(index: number) {
        const table = await testSubjects.find(this.TEST_IDS.QUERY_RULES_RULESETS_TABLE);
        const allRows = await table
          .findByTagName('tbody')
          .then((tbody) => tbody.findAllByTagName('tr'));
        const deleteButton = await allRows[index].findByTestSubject(
          this.TEST_IDS.QUERY_RULES_ITEM_ACTIONS_DELETE_BUTTON
        );
        await deleteButton.click();
      },
      async expectQueryRulesListPageComponentsToExist() {
        await testSubjects.existOrFail(this.TEST_IDS.QUERY_RULES_RULESETS_TABLE);
        await testSubjects.existOrFail(this.TEST_IDS.QUERY_RULES_ITEM_RULE_COUNT);
      },
      async clickPaginationNext() {
        await testSubjects.click(this.TEST_IDS.PAGINATION_NEXT_BUTTON);
      },
      async clickPaginationPrevious() {
        await testSubjects.click(this.TEST_IDS.PAGINATION_PREVIOUS_BUTTON);
      },
    },
    QueryRulesDetailPage: {
      TEST_IDS: {
        RULESET_DETAILS_PAGE_BACK_BUTTON: 'queryRulesetDetailBackButton',
        RULESET_DETAILS_PAGE_SAVE_BUTTON: 'queryRulesetDetailHeaderSaveButton',
        RULESET_DETAILS_PAGE_HEADER: 'queryRulesetDetailHeader',
        RULESET_DETAILS_PAGE_ACTIONS_BUTTON: 'searchQueryRulesQueryRulesetActionsButton',
        RULESET_DETAILS_PAGE_DELETE_BUTTON: 'queryRulesetDetailDeleteButton',
        RULESET_RULES_CONTAINER: 'searchQueryRulesDroppable',
        RULESET_RULE_ITEM_NAME: 'searchQueryRulesDraggableItem',
        RULESET_RULE_ITEM_ACTIONS_BUTTON: 'searchQueryRulesQueryRulesetDetailButton',
        RULESET_RULE_ITEM_ACTIONS_DELETE_BUTTON: 'searchQueryRulesQueryRulesetDetailDeleteButton',
        RULESET_RULE_ITEM_ACTIONS_EDIT_BUTTON: 'searchQueryRulesQueryRulesetDetailEditButton',
      },
      async expectQueryRulesDetailPageNavigated(name: string) {
        const h1Element = await find.byCssSelector(
          `main header[data-test-subj="${this.TEST_IDS.RULESET_DETAILS_PAGE_HEADER}"] h1`
        );
        const text = await h1Element.getVisibleText();
        if (text !== name) {
          throw new Error(`Expected page title to be "${name}" but got "${text}"`);
        }
      },
      async expectQueryRulesDetailPageBackButtonToExist() {
        await testSubjects.existOrFail(this.TEST_IDS.RULESET_DETAILS_PAGE_BACK_BUTTON);
      },
      async expectQueryRulesDetailPageSaveButtonToExist() {
        await testSubjects.existOrFail(this.TEST_IDS.RULESET_DETAILS_PAGE_SAVE_BUTTON);
      },
      async clickQueryRulesDetailPageSaveButton() {
        await testSubjects.click(this.TEST_IDS.RULESET_DETAILS_PAGE_SAVE_BUTTON);
      },
      async clickQueryRulesDetailPageActionsButton() {
        await testSubjects.click(this.TEST_IDS.RULESET_DETAILS_PAGE_ACTIONS_BUTTON);
      },
      async clickQueryRulesDetailPageDeleteButton() {
        await testSubjects.click(this.TEST_IDS.RULESET_DETAILS_PAGE_DELETE_BUTTON);
      },
      async clickEditRulesetRule(id: number) {
        const items = await testSubjects.findAll(this.TEST_IDS.RULESET_RULE_ITEM_NAME);
        if (items[id]) {
          const actionButton = await items[id].findByTestSubject(
            this.TEST_IDS.RULESET_RULE_ITEM_ACTIONS_BUTTON
          );
          await actionButton.click();
          await testSubjects.click(this.TEST_IDS.RULESET_RULE_ITEM_ACTIONS_EDIT_BUTTON);
        } else {
          throw new Error(`Ruleset rule with id "${id}" not found`);
        }
      },
    },
    QueryRulesCreateRulesetModal: {
      TEST_IDS: {
        CREATE_QUERY_RULES_SET_MODAL_INPUT: 'searchRulesetCreateRulesetModalFieldText',
        CREATE_QUERY_RULES_SET_MODAL_CREATE_BUTTON: 'searchRulesetCreateRulesetModalCreateButton',
      },
      async setQueryRulesSetName(name: string) {
        await testSubjects.setValue(this.TEST_IDS.CREATE_QUERY_RULES_SET_MODAL_INPUT, name);
      },
      async clickSaveButton() {
        await testSubjects.click(this.TEST_IDS.CREATE_QUERY_RULES_SET_MODAL_CREATE_BUTTON);
      },
    },
    QueryRulesDeleteRulesetModal: {
      TEST_IDS: {
        DELETE_QUERY_RULES_RULESET_MODAL_DELETE_BUTTON:
          'searchRulesetDeleteRulesetModalDeleteButton',
        DELETE_QUERY_RULES_RULESET_MODAL_ACKNOWLEDGE_BUTTON: 'confirmDeleteRulesetCheckbox',
        DELETE_QUERY_RULES_RULESET_MODAL_CANCEL_BUTTON:
          'searchRulesetDeleteRulesetModalCancelButton',
      },
      async clickDeleteButton() {
        await testSubjects.click(this.TEST_IDS.DELETE_QUERY_RULES_RULESET_MODAL_DELETE_BUTTON);
      },
      async clickAcknowledgeButton() {
        await testSubjects.setCheckbox(
          this.TEST_IDS.DELETE_QUERY_RULES_RULESET_MODAL_ACKNOWLEDGE_BUTTON,
          'check'
        );
        await retry.waitFor('delete ruleset acknowledge checkbox to be checked', () =>
          testSubjects.isChecked(this.TEST_IDS.DELETE_QUERY_RULES_RULESET_MODAL_ACKNOWLEDGE_BUTTON)
        );
      },
      async clickCancelButton() {
        await testSubjects.click(this.TEST_IDS.DELETE_QUERY_RULES_RULESET_MODAL_CANCEL_BUTTON);
      },
      async clickConfirmDeleteModal() {
        await retry.waitFor('delete ruleset confirm button to be enabled', () =>
          testSubjects.isEnabled('confirmModalConfirmButton')
        );
        await testSubjects.click('confirmModalConfirmButton');
      },
    },
    QueryRulesRuleFlyout: {
      TEST_IDS: {
        RULE_FLYOUT: 'searchQueryRulesQueryRuleFlyout',
        RULE_FLYOUT_UPDATE_BUTTON: 'searchQueryRulesQueryRuleFlyoutUpdateButton',
        RULE_FLYOUT_PIN_MORE_BUTTON: 'searchQueryRulesPinMoreButton',
        RULE_FLYOUT_METADATA_ADD_BUTTON: 'searchQueryRulesQueryRuleMetadataEditorAddCriteriaButton',
        RULE_FLYOUT_DOCUMENT_DRAGGABLE_ID: 'editableResultDocumentId',
        RULE_FLYOUT_DOCUMENT_INDEX: 'editableResultIndexSelector',
        RULE_FLYOUT_ACTION_TYPE_EXCLUDE: 'searchQueryRulesQueryRuleActionTypeExclude',
        RULE_FLYOUT_ACTION_TYPE_PINNED: 'searchQueryRulesQueryRuleActionTypePinned',
        RULE_FLYOUT_CRITERIA_CUSTOM: 'searchQueryRulesQueryRuleCriteriaCustom',
        RULE_FLYOUT_CRITERIA_ALWAYS: 'searchQueryRulesQueryRuleCriteriaAlways',
        RULE_FLYOUT_CRITERIA_METADATA_BLOCK: 'searchQueryRulesQueryRuleMetadataEditor',
        RULE_FLYOUT_CRITERIA_METADATA_BLOCK_FIELD: 'searchQueryRulesQueryRuleMetadataEditorField',
        RULE_FLYOUT_CRITERIA_METADATA_BLOCK_VALUES: 'searchQueryRulesQueryRuleMetadataEditorValues',
      },
      async expectRuleFlyoutToExist() {
        await testSubjects.existOrFail(this.TEST_IDS.RULE_FLYOUT);
      },
      async expectRuleFlyoutNotToExist() {
        await testSubjects.missingOrFail(this.TEST_IDS.RULE_FLYOUT);
      },
      async expectUpdateButtonIsEnabled() {
        await testSubjects.isEnabled(this.TEST_IDS.RULE_FLYOUT_UPDATE_BUTTON);
      },
      async clickUpdateButton() {
        await testSubjects.click(this.TEST_IDS.RULE_FLYOUT_UPDATE_BUTTON);
      },
      async clickActionTypeExclude() {
        await testSubjects.click(this.TEST_IDS.RULE_FLYOUT_ACTION_TYPE_EXCLUDE);
      },
      async clickActionTypePinned() {
        await testSubjects.click(this.TEST_IDS.RULE_FLYOUT_ACTION_TYPE_PINNED);
      },
      async clickCriteriaCustom() {
        await testSubjects.click(this.TEST_IDS.RULE_FLYOUT_CRITERIA_CUSTOM);
      },
      async clickCriteriaAlways() {
        await testSubjects.click(this.TEST_IDS.RULE_FLYOUT_CRITERIA_ALWAYS);
      },
      async changeDocumentIdField(id: number, newValue: string = '') {
        const documentFields = await testSubjects.findAll(
          this.TEST_IDS.RULE_FLYOUT_DOCUMENT_DRAGGABLE_ID
        );
        if (documentFields[id]) {
          const targetField = documentFields[id];
          await targetField.click();
          await targetField.type(newValue);
        } else {
          await testSubjects.click(this.TEST_IDS.RULE_FLYOUT_PIN_MORE_BUTTON);
          await this.changeDocumentIdField(id);
        }
      },
      async changeDocumentIndexField(id: number, newValue: string = '') {
        const comboBoxes = await testSubjects.findAll(this.TEST_IDS.RULE_FLYOUT_DOCUMENT_INDEX);
        if (comboBoxes[id]) {
          const targetComboBox = comboBoxes[id];
          await targetComboBox.click();
          await comboBox.setCustom(this.TEST_IDS.RULE_FLYOUT_DOCUMENT_INDEX, newValue);
          // Press tab to ensure the value is set correctly
          await browser.pressKeys(Key.TAB);
        }
      },
      async changeMetadataField(id: number, newValue: string = '') {
        const metadataFields = await testSubjects.findAll(
          this.TEST_IDS.RULE_FLYOUT_CRITERIA_METADATA_BLOCK
        );
        if (metadataFields[id]) {
          const targetMetadataBlock = metadataFields[id];
          const targetField = await targetMetadataBlock.findByTestSubject(
            this.TEST_IDS.RULE_FLYOUT_CRITERIA_METADATA_BLOCK_FIELD
          );
          await targetField.click();
          await targetField.type(newValue);
        } else {
          await testSubjects.click(this.TEST_IDS.RULE_FLYOUT_METADATA_ADD_BUTTON);
          await this.changeMetadataField(id);
        }
      },
      async changeMetadataValues(_: number, newValue: string = '') {
        await comboBox.setCustom(
          this.TEST_IDS.RULE_FLYOUT_CRITERIA_METADATA_BLOCK_VALUES,
          newValue
        );
      },
    },
  };
}
