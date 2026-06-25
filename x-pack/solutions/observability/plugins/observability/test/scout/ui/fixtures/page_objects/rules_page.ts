/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator, ScoutPage } from '@kbn/scout-oblt';
import { EuiComboBoxWrapper } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import {
  RULES_SETTINGS_TEST_SUBJECTS,
  RULE_TYPE_MODAL_TEST_SUBJECTS,
  RULE_LIST_TEST_SUBJECTS,
  LOGS_TAB_TEST_SUBJECTS,
  CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS,
  BIGGER_TIMEOUT,
  SHORTER_TIMEOUT,
} from '../constants';

export class RulesPage {
  constructor(private readonly page: ScoutPage) {}

  /**
   * Navigates to the rules list page (Observability)
   */
  async goto(ruleId: string = '') {
    await this.page.gotoApp(ruleId ? `rules/rule/${ruleId}` : 'rules');
    if (!ruleId) {
      await this.page.testSubj.waitForSelector(RULES_SETTINGS_TEST_SUBJECTS.RULE_PAGE_TAB, {
        timeout: BIGGER_TIMEOUT,
      });
    }
  }

  /**
   * Gets the page title/tab locator
   */
  public get pageTitle() {
    return this.page.testSubj.locator(RULES_SETTINGS_TEST_SUBJECTS.RULE_PAGE_TAB);
  }

  // Rules Settings Flyout methods
  /**
   * Gets the settings link button locator
   */
  public get settingsLink() {
    return this.page.testSubj.locator(RULES_SETTINGS_TEST_SUBJECTS.RULES_SETTINGS_LINK);
  }

  /**
   * Gets the rules settings flyout locator
   */
  public get settingsFlyout() {
    return this.page.testSubj.locator(RULES_SETTINGS_TEST_SUBJECTS.RULES_SETTINGS_FLYOUT);
  }

  /**
   * Gets the flyout cancel button locator
   */
  public get settingsFlyoutCancelButton() {
    return this.page.testSubj.locator(
      RULES_SETTINGS_TEST_SUBJECTS.RULES_SETTINGS_FLYOUT_CANCEL_BUTTON
    );
  }

  /**
   * Gets the flyout save button locator
   */
  public get settingsFlyoutSaveButton() {
    return this.page.testSubj.locator(
      RULES_SETTINGS_TEST_SUBJECTS.RULES_SETTINGS_FLYOUT_SAVE_BUTTON
    );
  }

  /**
   * Clicks the settings link to open the flyout
   */
  async openSettingsFlyout() {
    await expect(this.settingsLink).toBeVisible({ timeout: SHORTER_TIMEOUT });
    await this.settingsLink.click();
    await expect(this.settingsFlyout).toBeVisible();
  }

  /**
   * Verifies the settings flyout is visible with expected elements
   */
  async expectSettingsFlyoutVisible() {
    await expect(this.settingsFlyout).toBeVisible();
    await expect(this.settingsFlyoutCancelButton).toBeVisible();
    await expect(this.settingsFlyoutSaveButton).toBeVisible();
  }

  /**
   * Closes the settings flyout by clicking the cancel button
   */
  async closeSettingsFlyout() {
    await this.settingsFlyoutCancelButton.click();
    await expect(this.settingsFlyout).toBeHidden();
  }

  // Rule Type Modal methods
  /**
   * Gets the create rule button locator
   */
  public get createRuleButton() {
    return this.page.testSubj.locator(RULE_TYPE_MODAL_TEST_SUBJECTS.CREATE_RULE_BUTTON);
  }

  /**
   * Gets the rule type modal locator
   */
  public get ruleTypeModal() {
    return this.page.testSubj.locator(RULE_TYPE_MODAL_TEST_SUBJECTS.RULE_TYPE_MODAL);
  }

  /**
   * Gets the search input locator
   */
  public get ruleTypeModalSearch() {
    return this.page.testSubj.locator(RULE_TYPE_MODAL_TEST_SUBJECTS.RULE_TYPE_MODAL_SEARCH);
  }

  /**
   * Gets the "All" filter button locator
   */
  public get allRuleTypesButton() {
    return this.page.testSubj.locator(RULE_TYPE_MODAL_TEST_SUBJECTS.ALL_RULE_TYPES_BUTTON);
  }

  /**
   * Clicks the create rule button to open the modal
   */
  async openRuleTypeModal() {
    await expect(this.createRuleButton).toBeVisible({ timeout: SHORTER_TIMEOUT });
    await this.createRuleButton.click();
    await expect(this.ruleTypeModal).toBeVisible();
  }

  /**
   * Closes the rule type modal by pressing ESC
   */
  async closeRuleTypeModal() {
    await this.page.keyboard.press('Escape');
    await expect(this.ruleTypeModal).toBeHidden({ timeout: SHORTER_TIMEOUT });
  }

  /**
   * Gets the Rules Table container locator
   */
  public get rulesTableContainer() {
    return this.page.testSubj.locator(RULES_SETTINGS_TEST_SUBJECTS.RULES_TABLE_CONTAINER);
  }

  /**
   * Gets the inner Rules Table locator
   */
  public get rulesTable() {
    return this.page.testSubj.locator(RULES_SETTINGS_TEST_SUBJECTS.RULES_TABLE);
  }

  /**
   * Gets the non-editable rules locator
   */
  public getNonEditableRules() {
    return this.page.testSubj.locator(RULES_SETTINGS_TEST_SUBJECTS.RULE_ROW_NON_EDITABLE);
  }

  /**
   * Gets the editable rules locator
   */
  public getEditableRules() {
    return this.page.testSubj.locator(RULES_SETTINGS_TEST_SUBJECTS.RULE_ROW);
  }

  /**
   * Gets the rule sidebar edit action locator for a specific rule
   * Pass the rule row locator to find the edit button within that row
   */
  public getRuleSidebarEditAction(ruleRow: ReturnType<typeof this.page.testSubj.locator>) {
    return ruleRow.locator(
      `[data-test-subj="${RULE_LIST_TEST_SUBJECTS.RULE_SIDEBAR_EDIT_ACTION}"]`
    );
  }

  /**
   * Gets the edit action hover button locator for a specific rule
   */
  public getEditActionButton(ruleRow: ReturnType<typeof this.page.testSubj.locator>) {
    return ruleRow.locator(
      `[data-test-subj="${RULE_LIST_TEST_SUBJECTS.EDIT_ACTION_HOVER_BUTTON}"]`
    );
  }

  // Logs Tab methods
  /**
   * Gets the logs tab button locator
   */
  public get logsTab() {
    return this.page.testSubj.locator(LOGS_TAB_TEST_SUBJECTS.LOGS_TAB);
  }

  /**
   * Gets the event log table container locator
   */
  public get eventLogTable() {
    return this.page.testSubj.locator(LOGS_TAB_TEST_SUBJECTS.EVENT_LOG_TABLE);
  }

  /**
   * Navigates to the logs tab page via URL
   */
  async gotoLogsTab() {
    await this.page.gotoApp('rules/logs');
    await this.page.testSubj.waitForSelector(LOGS_TAB_TEST_SUBJECTS.EVENT_LOG_TABLE, {
      timeout: BIGGER_TIMEOUT,
    });
  }

  /**
   * Clicks the logs tab to navigate to it
   */
  async clickLogsTab() {
    await expect(this.logsTab).toBeVisible({ timeout: SHORTER_TIMEOUT });
    await this.logsTab.click();
    await this.page.testSubj.waitForSelector(LOGS_TAB_TEST_SUBJECTS.EVENT_LOG_TABLE, {
      timeout: BIGGER_TIMEOUT,
    });
  }

  async waitForLogsTableToLoad() {
    const loadingIndicators = await this.eventLogTable
      .getByRole('progressbar', { name: 'Loading' })
      .all();
    for await (const indicator of loadingIndicators) {
      await expect(indicator).toBeHidden({ timeout: BIGGER_TIMEOUT });
    }
  }

  /**
   * Verifies the logs tab is active/selected
   */
  async expectLogsTabActive() {
    await expect(this.logsTab).toHaveAttribute('aria-selected', 'true');
  }

  /**
   * Gets the rule details page locator
   */
  public get ruleDetails() {
    return this.page.testSubj.locator(LOGS_TAB_TEST_SUBJECTS.RULE_DETAILS);
  }

  /**
   * Gets the editable rules locator
   */
  public async getLogsTableRuleLinks(ruleName: string) {
    return this.eventLogTable.getByRole('button', { name: ruleName }).all();
  }

  /**
   * Clicks on a rule in the event logs table by its name
   */
  async clickOnRuleInEventLogs(ruleLog: Locator) {
    await ruleLog.click();
    await this.page.testSubj.waitForSelector(LOGS_TAB_TEST_SUBJECTS.RULE_DETAILS, {
      timeout: BIGGER_TIMEOUT,
    });
  }

  /**
   * Gets the rule search field locator
   */
  public get ruleSearchField() {
    return this.page.testSubj.locator('ruleSearchField');
  }

  // Edit Rule Flyout methods

  /**
   * Verifies that the edit action button is visible for a specific rule
   */
  async expectEditActionVisible(ruleName: string) {
    const editableRules = this.getEditableRules();
    const ruleRow = editableRules.filter({ hasText: ruleName });
    // Hover over the rule row to make the edit button visible
    await ruleRow.hover();
    // Verify the edit action container is present
    const editActionContainer = this.getRuleSidebarEditAction(ruleRow);
    await expect(editActionContainer).toBeVisible();
    // Verify the edit button itself is visible
    const editButton = this.getEditActionButton(ruleRow);
    await expect(editButton).toBeVisible();
  }
  /**
   * Gets the rules edit flyout locator
   */
  public get editRuleFlyout() {
    return this.page.getByText('Edit Rule');
  }

  /**
   * Gets the flyout cancel button locator
   */
  public get editRuleFlyoutCancelButton() {
    return this.page.getByRole('button', { name: 'Cancel' });
  }

  /**
   * Gets the flyout save button locator
   */
  public get editRuleFlyoutSaveButton() {
    return this.page.getByRole('button', { name: 'Save changes' });
  }
  /**
   * Opens the edit rule flyout by clicking the edit button for a specific rule
   */
  async openEditRuleFlyout(ruleName: string) {
    await this.expectEditActionVisible(ruleName);
    await this.getEditActionButton(this.getEditableRules().filter({ hasText: ruleName })).click();
    await expect(this.editRuleFlyout).toBeVisible();
  }

  /**
   * Verifies the edit rule flyout is visible with expected elements
   */
  async expectEditRuleFlyoutVisible() {
    await expect(this.editRuleFlyout).toBeVisible();
    await expect(this.editRuleFlyoutCancelButton).toBeVisible();
    await expect(this.editRuleFlyoutSaveButton).toBeVisible();
  }

  /**
   * Closes the edit rule flyout by clicking the cancel button
   */
  async closeEditRuleFlyout() {
    await this.editRuleFlyoutCancelButton.click();
    await expect(this.editRuleFlyout).toBeHidden({ timeout: SHORTER_TIMEOUT });
  }

  // Custom Threshold Rule Creation methods

  /**
   * Gets the custom threshold rule type card
   */
  public get customThresholdRuleTypeCard() {
    return this.page.testSubj.locator(
      CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.CUSTOM_THRESHOLD_RULE_TYPE_CARD
    );
  }

  /**
   * Gets the rule form locator
   */
  public get ruleForm() {
    return this.page.testSubj.locator(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.RULE_FORM);
  }

  /**
   * Gets the rule name input field
   */
  public get ruleNameInput() {
    return this.page.testSubj.locator(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.RULE_NAME_INPUT);
  }

  /**
   * Gets the data view expression button
   */
  public get dataViewExpression() {
    return this.page.testSubj.locator(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.DATA_VIEW_EXPRESSION);
  }

  /**
   * Gets the index pattern switcher input
   */
  public get indexPatternInput() {
    return this.page.testSubj.locator(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.INDEX_PATTERN_INPUT);
  }

  /**
   * Gets the explore matching indices button
   */
  public get exploreMatchingIndicesButton() {
    return this.page.testSubj.locator(
      CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.EXPLORE_MATCHING_INDICES_BUTTON
    );
  }

  /**
   * Gets the rule save button
   */
  public get ruleSaveButton() {
    return this.page.testSubj.locator(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.RULE_SAVE_BUTTON);
  }

  /**
   * Gets the confirm modal confirm button
   */
  public get confirmModalButton() {
    return this.page.testSubj.locator(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.CONFIRM_MODAL_BUTTON);
  }

  /**
   * Clicks the custom threshold rule type card
   */
  async clickCustomThresholdRuleType() {
    await expect(this.customThresholdRuleTypeCard).toBeVisible({ timeout: BIGGER_TIMEOUT });
    await this.customThresholdRuleTypeCard.click();
    await expect(this.ruleForm).toBeVisible({ timeout: BIGGER_TIMEOUT });
  }

  /**
   * Sets the rule name
   */
  async setRuleName(name: string) {
    await expect(this.ruleNameInput).toBeVisible();
    // Clear existing value
    await this.ruleNameInput.fill('');
    await this.ruleNameInput.fill(name);
  }

  /**
   * Sets the index pattern and waits for the explore matching indices button
   */
  async setIndexPatternAndWaitForButton(pattern: string) {
    await this.dataViewExpression.click();
    await expect(this.indexPatternInput).toBeVisible();
    await this.indexPatternInput.fill(pattern);
    // Wait for debounce and button to appear
    await expect(this.exploreMatchingIndicesButton).toBeVisible({ timeout: BIGGER_TIMEOUT });
  }

  /**
   * Clicks the explore matching indices button to create ad-hoc data view
   */
  async clickExploreMatchingIndices() {
    await this.exploreMatchingIndicesButton.click();
    // Wait for the button to disappear, which signals the ad-hoc data view was applied
    await expect(this.exploreMatchingIndicesButton).toBeHidden({ timeout: BIGGER_TIMEOUT });
  }

  /**
   * Waits for the form to be ready after data view changes
   */
  async waitForFormReady() {
    // Ensure save button is enabled (form is valid)
    await expect(this.ruleSaveButton).toBeEnabled({ timeout: SHORTER_TIMEOUT });
  }

  /**
   * Saves the rule by clicking save and confirming
   */
  async saveRule() {
    // The rule preview chart polls continuously, alternating between a loading overlay
    // (kbnMountWrapper) and a danger toast. Both intercept pointer events on the footer
    // save button. Using focus + keyboard bypasses pointer-event interception entirely.
    await this.ruleSaveButton.focus();
    await this.page.keyboard.press('Enter');

    await expect(this.confirmModalButton).toBeVisible({ timeout: SHORTER_TIMEOUT });
    await this.confirmModalButton.click();
    // Wait for navigation to rule details page
    await expect(this.ruleDetails).toBeVisible({ timeout: BIGGER_TIMEOUT });
  }

  public get observabilityCategory() {
    return this.ruleTypeModal.locator('.euiFacetButton[title="Observability"]');
  }

  // KQL Filter / Metric Row methods

  /**
   * Gets the aggregation expression for metric A
   */
  public get aggregationExpressionA() {
    return this.page.testSubj.locator(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.AGGREGATION_NAME_A);
  }

  /**
   * Gets the aggregation type select dropdown
   */
  public get aggregationTypeSelect() {
    return this.page.testSubj.locator(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.AGGREGATION_TYPE_SELECT);
  }

  /**
   * Gets the KQL search field
   */
  public get kqlSearchField() {
    return this.page.testSubj.locator(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.KQL_SEARCH_FIELD);
  }

  /**
   * Gets the KQL suggestions panel
   */
  public get kqlSuggestionsPanel() {
    return this.page.testSubj.locator(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.KQL_SUGGESTIONS_PANEL);
  }

  /**
   * Opens the metric row popover by clicking on the aggregation expression
   */
  async openMetricRowPopover() {
    await expect(this.aggregationExpressionA).toBeVisible({ timeout: SHORTER_TIMEOUT });
    await this.aggregationExpressionA.click();
    await expect(this.aggregationTypeSelect).toBeVisible({ timeout: SHORTER_TIMEOUT });
  }

  /**
   * Selects COUNT aggregation type to show the KQL filter
   */
  async selectCountAggregation() {
    await this.aggregationTypeSelect.selectOption('count');
    await expect(this.kqlSearchField).toBeVisible({ timeout: SHORTER_TIMEOUT });
  }

  /**
   * Types in the KQL search field
   */
  async typeInKqlFilter(text: string) {
    await this.kqlSearchField.click();
    await this.kqlSearchField.fill(text);
  }

  // Custom Threshold full-form methods (ported from FTR `pages/alerts/custom_threshold.ts`)

  /**
   * Adds a custom tag to the rule via the tags EuiComboBox. The tag is created
   * on the fly (it isn't a pre-existing option), mirroring the FTR
   * `comboBox.setCustom('ruleDetailsTagsInput', ...)`.
   */
  async addRuleTag(tag: string) {
    const tagsComboBox = new EuiComboBoxWrapper(
      this.page,
      CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.RULE_TAGS_INPUT
    );
    await tagsComboBox.setCustomMultiOption(tag);
  }

  /**
   * Sets tags via the EUI ComboBox (creates custom options)
   */
  async setTags(tags: string[]) {
    for (const tag of tags) {
      await this.addRuleTag(tag);
    }
  }

  /**
   * Selects a *saved* data view by name from the data-view switcher. Unlike
   * `setIndexPatternAndWaitForButton` (which creates an ad-hoc data view from a
   * pattern), this picks a persisted data view so its real fields populate the
   * aggregation-field and group-by comboboxes.
   */
  async selectSavedDataView(name: string) {
    await this.dataViewExpression.click();
    await expect(this.indexPatternInput).toBeVisible();
    await this.indexPatternInput.fill(name);
    await this.page
      .locator(`[data-test-subj="indexPattern-switcher"] [data-test-subj="dataView-${name}"]`)
      .click();
    await expect(this.dataViewExpression).toContainText(name, { timeout: BIGGER_TIMEOUT });
  }

  /** Aggregation expression button for metric B (present after adding a 2nd metric). */
  public get aggregationExpressionB() {
    return this.page.testSubj.locator(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.AGGREGATION_NAME_B);
  }

  /**
   * Clicks the add-aggregation button and waits for metric B to appear
   */
  async addSecondAggregation() {
    await this.page.testSubj.click(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.ADD_AGGREGATION_BUTTON);
    await expect(this.aggregationExpressionB).toBeVisible({ timeout: SHORTER_TIMEOUT });
  }

  /**
   * Opens the metric B aggregation row popover
   */
  async openAggregationBPopover() {
    await expect(this.aggregationExpressionB).toBeVisible({ timeout: SHORTER_TIMEOUT });
    await this.aggregationExpressionB.click();
    await expect(this.aggregationTypeSelect).toBeVisible({ timeout: SHORTER_TIMEOUT });
  }

  /**
   * Closes an Observability expression popover (aggregation / custom equation),
   * which exposes a dedicated closable-title button.
   */
  async closeMetricPopover() {
    const closeButton = this.page.testSubj.locator(
      CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.CLOSE_POPOVER_BUTTON
    );
    await expect(closeButton).toBeVisible({ timeout: SHORTER_TIMEOUT });
    await closeButton.click();
    await expect(closeButton).toBeHidden({ timeout: SHORTER_TIMEOUT });
  }

  /**
   * Closes the currently open o11y closable popover
   */
  async closeCurrentPopover() {
    await this.closeMetricPopover();
  }

  /**
   * Closes a shared triggers-actions expression popover (threshold / time
   * window). These render a generic EUI "Close" button (no test-subj) inside an
   * accessible `dialog`. A previously opened expression popover can still be
   * detaching when the next one opens, so scope the close to the dialog by its
   * accessible name to avoid a Playwright strict-mode violation, then wait for
   * it to close before continuing so the following step never sees two open
   * panels.
   */
  async closeExpressionPopover(dialogName: string) {
    const popover = this.page.getByRole('dialog', { name: dialogName });
    await popover.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(popover).toBeHidden({ timeout: SHORTER_TIMEOUT });
  }

  /**
   * Sets metric A to an `avg` aggregation over the given field. Opens the metric
   * row popover, picks the aggregation type, selects the field, then closes the
   * popover.
   */
  async setAverageAggregation(field: string) {
    await this.openMetricRowPopover();
    await this.aggregationTypeSelect.selectOption('avg');
    const fieldComboBox = new EuiComboBoxWrapper(
      this.page,
      CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.AGGREGATION_FIELD
    );
    await fieldComboBox.selectSingleOption(field);
    await this.closeMetricPopover();
  }

  /**
   * Adds a second metric (B), which defaults to a `count` aggregation, and sets
   * its KQL filter.
   */
  async addCountAggregationWithFilter(filter: string) {
    await this.page.testSubj.click(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.ADD_AGGREGATION_BUTTON);
    await expect(this.aggregationExpressionB).toBeVisible({ timeout: SHORTER_TIMEOUT });
    await this.aggregationExpressionB.click();
    await expect(this.kqlSearchField).toBeVisible({ timeout: SHORTER_TIMEOUT });
    await this.kqlSearchField.fill(filter);
    await this.closeMetricPopover();
  }

  /** Sets the custom equation (e.g. `A - B`) in the equation popover. */
  async setCustomEquation(equation: string) {
    await this.page.testSubj.click(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.CUSTOM_EQUATION);
    const equationField = this.page.testSubj.locator(
      CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.CUSTOM_EQUATION_FIELD
    );
    await expect(equationField).toBeVisible({ timeout: SHORTER_TIMEOUT });
    await equationField.fill(equation);
    await this.closeCurrentPopover();
  }

  /** Sets the inline equation label field (rendered directly on the form). */
  async setEquationLabel(label: string) {
    await this.page.testSubj.fill(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.CUSTOM_EQUATION_LABEL, label);
  }

  /**
   * Sets the threshold comparator and bounds. For two-bound comparators
   * (e.g. `notBetween`) both inputs are provided.
   */
  async setThreshold(comparator: string, thresholds: [number] | [number, number]) {
    await this.page.testSubj.click(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.THRESHOLD_POPOVER);
    await this.page.testSubj
      .locator(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.COMPARATOR_SELECT)
      .selectOption(comparator);
    await this.page.testSubj.fill(
      CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.THRESHOLD_INPUT_0,
      String(thresholds[0])
    );
    if (thresholds.length === 2) {
      await this.page.testSubj.fill(
        CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.THRESHOLD_INPUT_1,
        String(thresholds[1])
      );
    }
    await this.closeExpressionPopover('Threshold');
  }

  /** Sets the rule's evaluation time window (size + unit). */
  async setTimeWindow(size: number, unit: 's' | 'm' | 'h' | 'd') {
    await this.page.testSubj.click(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.FOR_LAST_EXPRESSION);
    await this.page.testSubj.fill(
      CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.TIME_SIZE_INPUT,
      String(size)
    );
    await this.page.testSubj
      .locator(CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.TIME_UNIT_SELECT)
      .selectOption(unit);
    await this.closeExpressionPopover('For the last');
  }

  /** Sets the rule's evaluation time window (size + unit as strings). */
  async setTimeRange(size: string, unit: string) {
    await this.setTimeWindow(Number(size), unit as 's' | 'm' | 'h' | 'd');
  }

  /** Adds a "group by" field via its EuiComboBox. */
  async setGroupBy(field: string) {
    const groupByComboBox = new EuiComboBoxWrapper(
      this.page,
      CUSTOM_THRESHOLD_RULE_TEST_SUBJECTS.GROUP_BY
    );
    await groupByComboBox.selectMultiOption(field);
  }

  // Rule Status Dropdown methods

  /**
   * Gets the rule status dropdown button for a specific rule row
   */
  public getRuleStatusDropdown(ruleRow: Locator) {
    return ruleRow.locator(`[data-test-subj="${RULE_LIST_TEST_SUBJECTS.STATUS_DROPDOWN}"]`);
  }

  /**
   * Gets the disable option in the status dropdown menu
   */
  public get disableDropdownItem() {
    return this.page.testSubj.locator(RULE_LIST_TEST_SUBJECTS.STATUS_DROPDOWN_DISABLED_ITEM);
  }

  /**
   * Gets the enable option in the status dropdown menu
   */
  public get enableDropdownItem() {
    return this.page.testSubj.locator(RULE_LIST_TEST_SUBJECTS.STATUS_DROPDOWN_ENABLED_ITEM);
  }

  /**
   * Clicks the rule status dropdown menu for a rule by name
   */
  async clickRuleStatusDropDownMenu(ruleName: string) {
    const ruleRow = this.getRuleRowByName(ruleName);
    const statusDropdown = this.getRuleStatusDropdown(ruleRow);
    await expect(statusDropdown).toBeVisible({ timeout: SHORTER_TIMEOUT });
    await statusDropdown.click();
  }

  /**
   * Clicks the disable option from the dropdown menu
   */
  async clickDisableFromDropDownMenu() {
    await expect(this.disableDropdownItem).toBeVisible({ timeout: SHORTER_TIMEOUT });
    await this.disableDropdownItem.click();
  }

  /**
   * Clicks the enable option from the dropdown menu
   */
  async clickEnableFromDropDownMenu() {
    await expect(this.enableDropdownItem).toBeVisible({ timeout: SHORTER_TIMEOUT });
    await this.enableDropdownItem.click();
  }

  /**
   * Gets a rule row by name
   */
  public getRuleRowByName(ruleName: string) {
    return this.getEditableRules().filter({ hasText: ruleName });
  }

  /**
   * Gets the status button for a specific rule by name
   */
  public getRuleStatusButton(ruleName: string) {
    const ruleRow = this.getRuleRowByName(ruleName);
    return ruleRow.locator(`[data-test-subj="${RULE_LIST_TEST_SUBJECTS.RULES_TABLE_CELL_STATUS}"]`);
  }

  /**
   * Disables a rule by its name
   */
  async disableRule(ruleName: string) {
    const ruleRow = this.getRuleRowByName(ruleName);
    await expect(ruleRow).toBeVisible({ timeout: SHORTER_TIMEOUT });
    const statusDropdown = this.getRuleStatusDropdown(ruleRow);
    await expect(statusDropdown).toBeVisible({ timeout: SHORTER_TIMEOUT });
    await statusDropdown.click();
    await this.clickDisableFromDropDownMenu();

    await expect(this.confirmModalButton).toBeVisible({ timeout: SHORTER_TIMEOUT });
    await this.confirmModalButton.click();

    await expect(statusDropdown).toHaveAttribute('title', 'Disabled', { timeout: BIGGER_TIMEOUT });
  }

  /**
   * Verifies that a rule's status is "Disabled"
   */
  async expectRuleToBeDisabled(ruleName: string) {
    const ruleRow = this.getRuleRowByName(ruleName);
    const statusDropdown = this.getRuleStatusDropdown(ruleRow);
    await expect(statusDropdown).toHaveAttribute('title', 'Disabled', { timeout: BIGGER_TIMEOUT });
  }

  /**
   * Verifies that a rule's status is "Enabled"
   */
  async expectRuleToBeEnabled(ruleName: string) {
    const ruleRow = this.getRuleRowByName(ruleName);
    const statusDropdown = this.getRuleStatusDropdown(ruleRow);
    await expect(statusDropdown).toHaveAttribute('title', 'Enabled', { timeout: BIGGER_TIMEOUT });
  }
}
