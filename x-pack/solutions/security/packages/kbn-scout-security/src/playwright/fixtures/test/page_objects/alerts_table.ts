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

  async clickRuleName(ruleName: string) {
    await this.alertsTable.waitFor({ state: 'visible' });
    // The rule column renders the rule name as a link (data-test-subj="ruleName"); filtered by the
    // (unique) rule name, so the link resolves to a single row.
    const ruleNameLink = this.alertsTable.getByTestId('ruleName').filter({ hasText: ruleName });
    await ruleNameLink.waitFor({ state: 'visible' });
    await ruleNameLink.click();
  }

  async clickNetworkIpCell(ip: string) {
    await this.alertsTable.waitFor({ state: 'visible' });
    // The source.ip / destination.ip columns sit at the far right of the grid and are
    // column-virtualized, so their cells are not in the DOM until scrolled into view. Scroll the
    // virtualized body fully right to mount them before clicking. EUI's react-window scroll
    // container exposes no stable data-test-subj, so the `.euiDataGrid__virtualized` class is a
    // deliberate, documented exception (a stable test-subj on this container would be a good
    // follow-up in EUI/Kibana).
    await this.alertsTable
      .locator('.euiDataGrid__virtualized')
      .evaluate((el) => el.scrollTo({ left: el.scrollWidth }));

    const ipCell = this.alertsTable.getByTestId('network-details').filter({ hasText: ip });
    await ipCell.click();
  }

  async clickHostNameCell(hostName: string) {
    await this.alertsTable.waitFor({ state: 'visible' });
    // `host.name` renders one clickable cell per alert row, so scope to the first data row to stay
    // unambiguous when several alerts share the same host (clicking any of them opens the same host
    // flyout). EUI tags each cell with `data-gridcell-row-index` (data rows start at 0).
    const hostCell = this.alertsTable
      .locator('[data-gridcell-row-index="0"]')
      .getByTestId('host-details-button')
      .filter({ hasText: hostName });
    // `host.name` sits mid-grid and EUI horizontally virtualizes columns, so the cell isn't mounted
    // until scrolled into view. Scroll the virtualized body right in steps until it mounts. EUI's
    // react-window scroll container exposes no stable data-test-subj, so the `.euiDataGrid__virtualized`
    // class is a deliberate, documented exception (same approach as `clickNetworkIpCell`).
    const virtualized = this.alertsTable.locator('.euiDataGrid__virtualized');
    await expect
      .poll(
        async () => {
          if ((await hostCell.count()) > 0) return true;
          await virtualized.evaluate((el) => el.scrollBy({ left: 500 }));
          return false;
        },
        { timeout: 20_000, intervals: [250] }
      )
      .toBe(true);
    await hostCell.click();
  }

  async waitForDetectionsAlertsWrapper() {
    // Increased timeout to 20 seconds because this page sometimes takes longer to load
    return this.detectionsAlertsWrapper.waitFor({ state: 'visible', timeout: 20_000 });
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
