/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator, ScoutPage } from '@kbn/scout';

export class RulesListPage {
  public readonly tagsFilterButton: Locator;
  public readonly selectAllRulesButton: Locator;
  public readonly bulkActionsButton: Locator;
  public readonly bulkDisableMenuItem: Locator;
  public readonly rulesListTable: Locator;
  public readonly ruleSummaryFlyout: Locator;
  public readonly ruleSummaryQuickEditButton: Locator;

  constructor(private readonly page: ScoutPage) {
    this.tagsFilterButton = this.page.testSubj.locator('rulesListTagsFilter');
    this.selectAllRulesButton = this.page.testSubj.locator('selectAllRulesButton');
    this.bulkActionsButton = this.page.testSubj.locator('bulkActionsButton');
    this.bulkDisableMenuItem = this.page.testSubj.locator('bulkDisableRules');
    this.rulesListTable = this.page.testSubj.locator('rulesListTable');
    this.ruleSummaryFlyout = this.page.testSubj.locator('ruleSummaryFlyout');
    this.ruleSummaryQuickEditButton = this.page.testSubj.locator(
      'ruleSummaryFlyoutQuickEditButton'
    );
  }

  async goto() {
    await this.page.gotoApp('management/alertingV2/rules');
  }

  tagsFilterOption(tag: string) {
    return this.page.testSubj.locator(`rulesListTagsFilterOption-${tag}`);
  }

  rowCheckbox(ruleId: string) {
    return this.page.testSubj.locator(`checkboxSelectRow-${ruleId}`);
  }

  expandRuleButton(ruleId: string) {
    return this.page.testSubj.locator(`expandRule-${ruleId}`);
  }

  quickEditButton(ruleId: string) {
    return this.page.testSubj.locator(`quickEditRule-${ruleId}`);
  }

  /**
   * Opens the Tags filter popover, selects one tag, and closes the popover.
   * The first appearance of the option after opening can be slow on initial
   * load while RBAC + tag aggregation runs server-side, hence the longer wait.
   */
  async filterBySingleTag(tag: string) {
    await this.tagsFilterButton.click();
    // Initial tag aggregation can be slow on a freshly-booted Kibana before
    // the alerting indexes are warm; default 5s is too tight in CI.
    await this.tagsFilterOption(tag).waitFor({ state: 'visible', timeout: 60_000 });
    await this.tagsFilterOption(tag).click();
    await this.tagsFilterButton.click();
  }
}
