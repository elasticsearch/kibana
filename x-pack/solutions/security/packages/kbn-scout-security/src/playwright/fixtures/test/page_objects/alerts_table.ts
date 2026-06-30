/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout';
import { expect } from '../../../../../ui';

const PAGE_URL = 'security/alerts';

export class AlertsTablePage {
  public detectionsAlertsWrapper: Locator;
  public alertRow: Locator;
  public alertsTable: Locator;
  public contextMenuButton: Locator;
  public actionsContextMenu: Locator;
  public runWorkflowMenuItem: Locator;
  public workflowPanel: Locator;
  public executeWorkflowButton: Locator;
  public bulkRunWorkflowMenuItem: Locator;
  public bulkWorkflowPanel: Locator;
  public selectedShowBulkActionsButton: Locator;
  public bulkAddToChatMenuItem: Locator;
  public selectAllAlertsButton: Locator;
  public bulkActionsHeaderCheckbox: Locator;

  constructor(private readonly page: ScoutPage) {
    this.detectionsAlertsWrapper = this.page.testSubj.locator('alerts-by-rule-table');
    this.alertsTable = this.page.testSubj.locator('alertsTableIsLoaded'); // Search for loaded Alerts table
    this.alertRow = this.page.testSubj.locator('alertsTableIsLoaded').locator('div.euiDataGridRow');
    this.contextMenuButton = this.page.testSubj.locator('timeline-context-menu-button');
    this.actionsContextMenu = this.page.testSubj.locator('actions-context-menu');
    this.runWorkflowMenuItem = this.page.testSubj.locator('run-workflow-action');
    this.workflowPanel = this.page.testSubj.locator('alert-workflow-context-menu-panel');
    this.executeWorkflowButton = this.page.testSubj.locator('execute-alert-workflow-button');
    this.bulkRunWorkflowMenuItem = this.page.testSubj.locator('bulk-run-alert-workflow-action');
    this.bulkWorkflowPanel = this.page.testSubj.locator('bulk-alert-workflow-context-menu-panel');
    this.selectedShowBulkActionsButton = this.page.testSubj.locator(
      'selectedShowBulkActionsButton'
    );
    this.bulkAddToChatMenuItem = this.page.testSubj.locator('bulk-add-to-chat');
    this.selectAllAlertsButton = this.page.testSubj.locator('selectAllAlertsButton');
    this.bulkActionsHeaderCheckbox = this.page.testSubj.locator('bulk-actions-header');
  }

  async navigate() {
    await this.page.gotoApp(PAGE_URL);
  }

  async openAlertContextMenu(ruleName: string) {
    await this.alertsTable.waitFor({ state: 'visible' });
    const ruleNameCell = this.alertsTable.getByTestId('ruleName').filter({ hasText: ruleName });

    await expect(
      ruleNameCell,
      `Alert with rule '${ruleName}' is not displayed in the alerts table`
    ).toHaveCount(1);

    const row = ruleNameCell.locator('xpath=ancestor::div[contains(@class,"euiDataGridRow")]');
    await row.getByTestId('timeline-context-menu-button').click();
  }

  async expandAlertDetailsFlyout(ruleName: string) {
    await this.alertsTable.waitFor({ state: 'visible' });
    // 1. Find the rule name cell (unique per alert)
    const ruleNameCell = this.alertsTable.getByTestId('ruleName').filter({ hasText: ruleName });

    await expect(
      ruleNameCell,
      `Alert with rule '${ruleName}' is not displayed in the alerts table`
    ).toHaveCount(1);

    // 2. Climb up to the DataGrid row
    const row = ruleNameCell.locator('xpath=ancestor::div[contains(@class,"euiDataGridRow")]');

    // 3. Click expand button in the row
    await row.getByTestId('expand-event').click();
  }

  async waitForDetectionsAlertsWrapper() {
    // Increased timeout to 20 seconds because this page sometimes takes longer to load
    return this.detectionsAlertsWrapper.waitFor({ state: 'visible', timeout: 20_000 });
  }

  /**
   * Open the alert's row context menu and click "Add rule exception". Used by
   * tests that exercise the exception flyout end-to-end (e.g. bulk-close
   * regressions).
   */
  async openAddRuleException(ruleName: string) {
    await this.openAlertContextMenu(ruleName);
    await this.page.testSubj.locator('add-exception-menu-item').click();
  }

  async waitForRuleAlert(ruleName: string) {
    const cell = this.alertsTable.getByTestId('ruleName').filter({ hasText: ruleName });
    await expect(cell).toBeVisible({ timeout: 60_000 });
    return cell;
  }

  async checkAlertRowCheckbox(ruleName: string) {
    const cell = this.alertsTable.getByTestId('ruleName').filter({ hasText: ruleName });
    const row = cell.locator('xpath=ancestor::div[contains(@class,"euiDataGridRow")]');
    await row.getByRole('checkbox').check();
  }
}
