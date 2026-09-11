/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout';
import { AlertsTablePage } from '../../../alerts_table';

/**
 * Page object for the flyout_v2 document flyout (alert / event) opened via
 * `services.overlays.openSystemFlyout` from the alerts table or Timeline.
 */
export class DocumentFlyout {
  /** Header title text for alerts and events. */
  public readonly title: Locator;
  /** Workflow status badge (open / acknowledged / closed). */
  public readonly statusBadge: Locator;
  /** Assignees content. */
  public readonly assignees: Locator;
  /** "+" button to add assignees. */
  public readonly assigneesAddButton: Locator;
  /** Investigation section header in the overview tab. */
  public readonly investigationSection: Locator;
  /** "Highlighted fields" table inside the Investigation section. */
  public readonly highlightedFieldsTable: Locator;
  /** Visualizations section header in the overview tab. */
  public readonly visualizationsSection: Locator;
  /** Insights section header in the overview tab. */
  public readonly insightsSection: Locator;
  /** Take action footer button. */
  public readonly takeActionButton: Locator;
  /** Take action context menu panel. */
  public readonly takeActionMenu: Locator;
  /** Container for a child document flyout */
  public readonly childDocumentFlyout: Locator;
  /** Alert title text scoped inside the child document flyout. */
  public readonly childDocumentAlertTitle: Locator;
  /** Status-change context menu rendered inside the header badge popover. */
  public readonly statusPopoverMenu: Locator;
  /** EuiSelectable inside the "closing reason" sub-panel. */
  public readonly closingReasonSelectable: Locator;
  /** "Close alert" submit button inside the "closing reason" sub-panel. */
  public readonly closingReasonSubmitButton: Locator;

  /** Main panel wrapper for the assignees popover content. */
  public readonly assigneesApplyPanel: Locator;
  /** "Apply" button inside the assignees popover. */
  public readonly assigneesApplyButton: Locator;

  private readonly page: ScoutPage;

  constructor(page: ScoutPage) {
    this.page = page;
    this.title = page.testSubj.locator('securitySolutionFlyoutAlertTitleText');
    this.statusBadge = page.testSubj.locator('rule-status-badge');
    this.assignees = page.testSubj.locator('securitySolutionFlyoutHeaderAssignees');
    this.assigneesAddButton = page.testSubj.locator(
      'securitySolutionFlyoutHeaderAssigneesAddButton'
    );
    this.investigationSection = page.testSubj.locator(
      'securitySolutionFlyoutInvestigationSectionHeader'
    );
    this.highlightedFieldsTable = page.testSubj.locator(
      'securitySolutionFlyoutHighlightedFieldsDetails'
    );
    this.visualizationsSection = page.testSubj.locator(
      'securitySolutionFlyoutVisualizationsHeader'
    );
    this.insightsSection = page.testSubj.locator('securitySolutionFlyoutInsightsSectionHeader');
    this.takeActionButton = page.testSubj.locator('securitySolutionFlyoutFooterDropdownButton');
    this.takeActionMenu = page.testSubj.locator('takeActionPanelMenu');
    this.childDocumentFlyout = page.testSubj.locator('securitySolutionFlyoutChildDocumentFlyout');
    this.childDocumentAlertTitle = this.childDocumentFlyout.getByTestId(
      'securitySolutionFlyoutAlertTitleText'
    );
    this.statusPopoverMenu = page.testSubj.locator('event-details-alertStatusPopover');
    this.closingReasonSelectable = page.testSubj.locator('alert-closing-reason-selectable');
    this.closingReasonSubmitButton = page.testSubj.locator('alert-closing-reason-submit-button');
    this.assigneesApplyPanel = page.testSubj.locator('securitySolutionAssigneesApplyPanel');
    this.assigneesApplyButton = page.testSubj.locator('securitySolutionAssigneesApplyButton');
  }

  /** Wait for the flyout to be visible and fully loaded. */
  async waitForAlertFlyout() {
    await this.title.waitFor({ state: 'visible', timeout: 15_000 });
  }

  /**
   * Open the document flyout for the alert produced by `ruleName`: navigate to the alerts table,
   * wait for the alert to appear, expand its row, and wait for the flyout to load. The flyout is
   * always reached from the alerts table in these suites, so this composes AlertsTablePage to give
   * specs a single entry point instead of repeating the four-step preamble.
   */
  async openForRule(ruleName: string) {
    const alertsTable = new AlertsTablePage(this.page);
    await alertsTable.navigate();
    await alertsTable.waitForRuleAlert(ruleName);
    await alertsTable.expandAlertDetailsFlyout(ruleName);
    await this.waitForAlertFlyout();
  }

  /** Wait for the child document flyout (opened from a tools overlay) to be visible. */
  async waitForChildDocumentFlyout() {
    await this.childDocumentFlyout.waitFor({ state: 'visible', timeout: 15_000 });
  }

  /** Close the child document flyout and wait for it to be removed. */
  async closeChildDocumentFlyout() {
    await this.page.keyboard.press('Escape');
    await this.childDocumentFlyout.waitFor({ state: 'hidden' });
  }

  /** Open the Take action popover and wait for the context menu to appear. */
  async openTakeActionMenu() {
    await this.takeActionButton.click();
    await this.takeActionMenu.waitFor({ state: 'visible' });
  }

  /** Click a menu item inside the Take action context menu by its test-subject. */
  async clickTakeActionItem(testSubj: string) {
    await this.takeActionMenu.locator(`[data-test-subj="${testSubj}"]`).click();
  }

  /**
   * Returns the child-flyout link rendered for a supported highlighted field, scoped to that
   * field's row in the Highlighted fields table. Supported fields include IP addresses, host and
   * user names, and the rule name.
   */
  highlightedFieldChildLink(field: string): Locator {
    return (
      this.highlightedFieldsTable
        .locator('tr')
        .filter({ hasText: field })
        // The shared OpenFlyoutLink component renders the linkable value as an EuiLink with this test
        // subject (OPEN_FLYOUT_LINK_TEST_ID = `${PREFIX}OpenFlyoutLink`); the old
        // `securitySolutionFlyoutChildLink` id no longer exists (renamed in PR #274017).
        .locator('[data-test-subj="securitySolutionFlyoutOpenFlyoutLink"]')
    );
  }

  /** Click the header status badge and wait for the status-change popover to appear. */
  async openStatusPopover() {
    await this.statusBadge.click();
    await this.statusPopoverMenu.waitFor({ state: 'visible' });
  }

  /** Click a status action item inside the header badge popover by its test-subject. */
  async clickStatusPopoverAction(testSubj: string) {
    await this.statusPopoverMenu.locator(`[data-test-subj="${testSubj}"]`).click();
  }

  /** Select a closing reason option by its visible label in the EuiSelectable. */
  async selectClosingReason(label: string) {
    await this.closingReasonSelectable.waitFor({ state: 'visible' });
    await this.closingReasonSelectable.getByRole('option', { name: label }).click();
  }

  /** Click the "Close alert" submit button in the closing reason sub-panel. */
  async submitClosingReason() {
    await this.closingReasonSubmitButton.click();
  }

  /** Click the "+" assignees button and wait for the assignees panel to appear. */
  async openAssigneesPanel() {
    await this.assigneesAddButton.click();
    await this.assigneesApplyPanel.waitFor({ state: 'visible' });
  }

  /** Click the user option for the given username in the assignees selectable. */
  async selectAssignee(username: string) {
    const option = this.page.testSubj.locator(`userProfileSelectableOption-${username}`);
    await option.waitFor({ state: 'visible' });
    await option.click();
    await option.and(this.page.locator('[aria-checked="true"]')).waitFor({ state: 'visible' });
  }

  /** Click the "Apply" button in the assignees panel. */
  async applyAssignees() {
    await this.assigneesApplyButton.click();
  }

  /** Return the avatar locator for the given username, scoped to the flyout header assignees area. */
  getAssigneeAvatar(username: string): Locator {
    return this.assignees.locator(`[data-test-subj="securitySolutionUsersAvatar-${username}"]`);
  }
}
