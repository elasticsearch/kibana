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
  /** Rule details title link when alert navigation is available. */
  public readonly titleLink: Locator;
  /** Header title text for alerts and events. */
  public readonly title: Locator;
  /** Severity badge. */
  public readonly severity: Locator;
  /** Workflow status badge (open / acknowledged / closed). */
  public readonly statusBadge: Locator;
  /** Risk score numeric value in the header. */
  public readonly riskScore: Locator;
  /** Assignees section header. */
  public readonly assigneesTitle: Locator;
  /** Assignees content. */
  public readonly assignees: Locator;
  /** "+" button to add assignees. */
  public readonly assigneesAddButton: Locator;
  /** Notes count badge in the header. */
  public readonly notesCount: Locator;
  /** Full "Add note" button shown when the document has no notes yet. */
  public readonly notesAddButton: Locator;
  /** Compact "+" icon shown when notes already exist and the user can add more. */
  public readonly notesAddButtonIcon: Locator;
  /** View notes button shown when notes exist but the user cannot add more. */
  public readonly notesViewButton: Locator;
  /** Reason preview/popover trigger button ("Show full reason"). */
  public readonly reasonPreviewButton: Locator;
  /** Reason popover content. */
  public readonly reasonPopover: Locator;
  /** Draggable host.name value rendered inside the reason popover (cell-actions enabled). */
  public readonly reasonHostNameValue: Locator;
  /** "Show rule summary" button in the About section (opens the rule flyout). */
  public readonly ruleSummaryButton: Locator;
  /** About section header in the overview tab. */
  public readonly aboutSection: Locator;
  /** Investigation section header in the overview tab. */
  public readonly investigationSection: Locator;
  /** "Highlighted fields" table inside the Investigation section. */
  public readonly highlightedFieldsTable: Locator;
  /** Title of the network details flyout opened from an IP highlighted field. */
  public readonly networkDetailsFlyoutTitle: Locator;
  /** Visualizations section header in the overview tab. */
  public readonly visualizationsSection: Locator;
  /** Insights section header in the overview tab. */
  public readonly insightsSection: Locator;
  /** Response section header in the overview tab. */
  public readonly responseSection: Locator;
  /** "View response details" button in the response section. */
  public readonly responseButton: Locator;
  /** Analyzer preview panel content in the Visualizations section. */
  public readonly analyzerPreview: Locator;
  /** Session preview panel content in the Visualizations section. */
  public readonly sessionPreview: Locator;
  /** Graph preview panel content in the Visualizations section. */
  public readonly graphPreview: Locator;
  /** Take action footer button. */
  public readonly takeActionButton: Locator;
  /** Take action context menu panel. */
  public readonly takeActionMenu: Locator;
  /** Missing alerts privilege fallback content. */
  public readonly missingAlertsPrivilege: Locator;
  /** Loading indicator while the flyout fetches document or privilege data. */
  public readonly loading: Locator;
  /**
   * Remote document callout text.
   * The callout does not expose a stable data-test-subj yet, so match on the rendered message.
   */
  public readonly remoteDocumentCallout: Locator;
  /** Entities overview panel content. */
  public readonly entitiesOverview: Locator;
  /** Host overview card in the entities panel. */
  public readonly entityHostOverview: Locator;
  /** Host name text in the entities panel. */
  public readonly entityHostName: Locator;
  /** User overview card in the entities panel. */
  public readonly entityUserOverview: Locator;
  /** User name text in the entities panel. */
  public readonly entityUserName: Locator;
  /** Correlations panel content. */
  public readonly correlations: Locator;
  /** Prevalence panel content. */
  public readonly prevalence: Locator;
  /** Threat intelligence panel content. */
  public readonly threatIntelligence: Locator;
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

  /** Hover-down popover that appears when the cursor is over any cell-actions-enabled value. */
  public readonly cellActionsHoverPopover: Locator;
  /** "Filter for" cell-action button inside the cell-actions hover popover. */
  public readonly cellActionsFilterInButton: Locator;
  /** "Filter out" cell-action button inside the cell-actions hover popover. */
  public readonly cellActionsFilterOutButton: Locator;
  /** "Add to Timeline" cell-action button inside the cell-actions hover popover. */
  public readonly cellActionsAddToTimelineButton: Locator;
  /** Filter pills rendered in the page search bar; assert with toHaveCount(). */
  public readonly pageFilterBadges: Locator;
  /** Main panel wrapper for the assignees popover content. */
  public readonly assigneesApplyPanel: Locator;
  /** User selection list inside the assignees popover. */
  public readonly assigneesSelectable: Locator;
  /** "Apply" button inside the assignees popover. */
  public readonly assigneesApplyButton: Locator;
  /** Avatars panel shown when at least one user is assigned. */
  public readonly assigneesAvatarsPanel: Locator;

  /** Workflow-status filter chip added to the page search bar by the status cell action. */
  public readonly workflowStatusFilterBadge: Locator;
  /** Tag-selection list inside the Take action "Apply alert tags" sub-panel. */
  public readonly alertTagsSelectable: Locator;
  /** "Add to existing case" case-selector modal. */
  public readonly allCasesModal: Locator;
  /** Heading of the "Add to new case" creation dialog. */
  public readonly createCaseDialogTitle: Locator;

  private readonly page: ScoutPage;
  private readonly notesActionButton: Locator;

  constructor(page: ScoutPage) {
    this.page = page;
    this.titleLink = page.testSubj.locator('securitySolutionFlyoutAlertTitleLink');
    this.title = page.testSubj.locator('securitySolutionFlyoutAlertTitleText');
    this.severity = page.testSubj.locator('severity');
    this.statusBadge = page.testSubj.locator('rule-status-badge');
    this.riskScore = page.testSubj.locator('securitySolutionFlyoutHeaderRiskScoreValue');
    this.assigneesTitle = page.testSubj.locator('securitySolutionFlyoutHeaderAssigneesTitle');
    this.assignees = page.testSubj.locator('securitySolutionFlyoutHeaderAssignees');
    this.assigneesAddButton = page.testSubj.locator(
      'securitySolutionFlyoutHeaderAssigneesAddButton'
    );
    this.notesCount = page.testSubj.locator('securitySolutionFlyoutHeaderNotesCount');
    this.notesAddButton = page.testSubj.locator('securitySolutionFlyoutHeaderNotesAddNoteButton');
    this.notesAddButtonIcon = page.testSubj.locator(
      'securitySolutionFlyoutHeaderNotesAddNoteIconButton'
    );
    this.notesViewButton = page.testSubj.locator(
      'securitySolutionFlyoutHeaderNotesViewNotesButton'
    );
    this.notesActionButton = page.locator(
      [
        '[data-test-subj="securitySolutionFlyoutHeaderNotesAddNoteButton"]',
        '[data-test-subj="securitySolutionFlyoutHeaderNotesAddNoteIconButton"]',
        '[data-test-subj="securitySolutionFlyoutHeaderNotesViewNotesButton"]',
      ].join(', ')
    );
    this.reasonPreviewButton = page.testSubj.locator('securitySolutionFlyoutReasonPreviewButton');
    this.reasonPopover = page.testSubj.locator('securitySolutionFlyoutReasonPopover');
    this.reasonHostNameValue = this.reasonPopover.locator(
      '[data-test-subj="render-content-host.name"]'
    );
    this.ruleSummaryButton = page.testSubj.locator('securitySolutionFlyoutRuleSummaryButton');
    this.aboutSection = page.testSubj.locator('securitySolutionFlyoutAboutSectionHeader');
    this.investigationSection = page.testSubj.locator(
      'securitySolutionFlyoutInvestigationSectionHeader'
    );
    this.highlightedFieldsTable = page.testSubj.locator(
      'securitySolutionFlyoutHighlightedFieldsDetails'
    );
    this.networkDetailsFlyoutTitle = page.testSubj.locator('network-details-flyout-headerText');
    this.visualizationsSection = page.testSubj.locator(
      'securitySolutionFlyoutVisualizationsHeader'
    );
    this.insightsSection = page.testSubj.locator('securitySolutionFlyoutInsightsSectionHeader');
    this.responseSection = page.testSubj.locator('securitySolutionFlyoutResponseSectionHeader');
    this.responseButton = page.testSubj.locator('securitySolutionFlyoutResponseButton');
    this.analyzerPreview = page.testSubj.locator('securitySolutionFlyoutAnalyzerPreviewContent');
    this.sessionPreview = page.testSubj.locator('securitySolutionFlyoutSessionPreviewContent');
    this.graphPreview = page.testSubj.locator('securitySolutionFlyoutGraphPreviewContent');
    this.takeActionButton = page.testSubj.locator('securitySolutionFlyoutFooterDropdownButton');
    this.takeActionMenu = page.testSubj.locator('takeActionPanelMenu');
    this.missingAlertsPrivilege = page.testSubj.locator(
      'securitySolutionFlyoutMissingAlertsPrivilege'
    );
    this.loading = page.locator(
      '[data-test-subj="document-overview-loading"], [data-test-subj="document-overview-wrapper-loading"]'
    );
    this.remoteDocumentCallout = page.getByText(
      /This (alert|event|attack) originates from a (remote cluster|linked project)\. Some features may not be available\./
    );
    this.entitiesOverview = page.testSubj.locator('securitySolutionFlyoutInsightsEntitiesContent');
    this.entityHostOverview = page.testSubj.locator(
      'securitySolutionFlyoutInsightsEntitiesHostOverview'
    );
    this.entityHostName = page.testSubj.locator(
      'securitySolutionFlyoutInsightsEntitiesHostOverviewLink'
    );
    this.entityUserOverview = page.testSubj.locator(
      'securitySolutionFlyoutInsightsEntitiesUserOverview'
    );
    this.entityUserName = page.testSubj.locator(
      'securitySolutionFlyoutInsightsEntitiesUserOverviewLink'
    );
    this.correlations = page.testSubj.locator('securitySolutionFlyoutCorrelationsContent');
    this.prevalence = page.testSubj.locator('securitySolutionFlyoutInsightsPrevalenceContent');
    this.threatIntelligence = page.testSubj.locator(
      'securitySolutionFlyoutInsightsThreatIntelligenceContent'
    );
    this.cellActionsHoverPopover = page.testSubj.locator('hoverActionsPopover');
    this.cellActionsFilterInButton = page.testSubj.locator(
      'actionItem-security-default-cellActions-filterIn'
    );
    this.cellActionsFilterOutButton = page.testSubj.locator(
      'actionItem-security-default-cellActions-filterOut'
    );
    this.cellActionsAddToTimelineButton = page.testSubj.locator(
      'actionItem-security-default-cellActions-addToTimeline'
    );
    this.pageFilterBadges = page.locator('[id^="popoverFor_filter"]');
    this.childDocumentFlyout = page.testSubj.locator('securitySolutionFlyoutChildDocumentFlyout');
    this.childDocumentAlertTitle = this.childDocumentFlyout.getByTestId(
      'securitySolutionFlyoutAlertTitleText'
    );
    this.statusPopoverMenu = page.testSubj.locator('event-details-alertStatusPopover');
    this.closingReasonSelectable = page.testSubj.locator('alert-closing-reason-selectable');
    this.closingReasonSubmitButton = page.testSubj.locator('alert-closing-reason-submit-button');
    this.assigneesApplyPanel = page.testSubj.locator('securitySolutionAssigneesApplyPanel');
    this.assigneesSelectable = page.testSubj.locator('securitySolutionAssigneesSelectable');
    this.assigneesApplyButton = page.testSubj.locator('securitySolutionAssigneesApplyButton');
    this.assigneesAvatarsPanel = page.testSubj.locator('securitySolutionUsersAvatarsPanel');
    // The status cell-action adds a filter whose test subject is `filter-key-<field>`; match the
    // workflow_status field with the testSubj "contains word" (`~`) selector.
    this.workflowStatusFilterBadge = page.testSubj.locator(
      '~filter-key-kibana.alert.workflow_status'
    );
    this.alertTagsSelectable = page.testSubj.locator('alert-tags-selectable-menu');
    this.allCasesModal = page.testSubj.locator('all-cases-modal');
    // The dialog renders the title both as a heading and on the submit button; scope to the heading.
    this.createCaseDialogTitle = page
      .getByRole('dialog')
      .getByRole('heading', { name: 'Create case' });
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

  /** Open notes from whichever header action is rendered for the current notes state. */
  async openNotes() {
    await this.notesActionButton.waitFor({ state: 'visible' });
    await this.notesActionButton.click();
  }

  /** Click the "Show full reason" button and wait for the reason popover to appear. */
  async openReasonPopover() {
    await this.reasonPreviewButton.click();
    await this.reasonPopover.waitFor({ state: 'visible' });
  }

  /** Hover the host.name value inside the reason popover and wait for the cell-actions popover. */
  async hoverReasonHostName() {
    await this.reasonHostNameValue.hover();
    await this.cellActionsHoverPopover.waitFor({ state: 'visible' });
  }

  /**
   * Returns the child-flyout link rendered for a "special" highlighted field, scoped to that
   * field's row in the Highlighted fields table. These fields (e.g. IP fields) open a related
   * tool/child flyout on click; today only IP fields (source.ip / destination.ip) are supported.
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

  /** Hover the status badge and wait for the cell-actions hover popover to appear. */
  async hoverStatusBadge() {
    await this.statusBadge.hover();
    await this.cellActionsHoverPopover.waitFor({ state: 'visible' });
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
