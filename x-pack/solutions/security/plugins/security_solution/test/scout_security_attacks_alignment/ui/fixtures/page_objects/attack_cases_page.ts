/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator, ScoutPage } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';
import {
  SECURITY_ALERT_ATTACHMENT_TYPE,
  SECURITY_ATTACK_ATTACHMENT_TYPE,
} from '@kbn/cases-plugin/common';
import {
  ATTACK_CARD_DELETE_ACTION_TEST_ID,
  ATTACK_CARD_TEST_ID,
  ATTACK_TITLE_TEST_ID,
  ATTACK_ALERT_COUNT_TEST_ID,
  ATTACK_TAB_BULK_ACTIONS_TEST_ID,
  ATTACK_TAB_BULK_ACTIONS_BUTTON_TEST_ID,
  ATTACK_TAB_BULK_ACTIONS_POPOVER_TEST_ID,
  ATTACK_TAB_COLUMN_ACTIONS_TEST_ID,
  ATTACK_TAB_COLUMN_ALERTS_TEST_ID,
  ATTACK_TAB_COLUMN_DETECTED_ON_TEST_ID,
  ATTACK_TAB_COLUMN_SUMMARY_TEST_ID,
  ATTACK_TAB_COLUMN_TITLE_TEST_ID,
  ATTACK_TAB_GRID_TEST_ID,
  ATTACK_TAB_ROW_MORE_ACTIONS_POPOVER_TEST_ID,
  ATTACK_TAB_ROW_MORE_ACTIONS_TEST_ID,
  ATTACK_TAB_ROW_SELECT_TEST_ID,
  ATTACK_TAB_ROW_TITLE_TEST_ID,
  ATTACK_TAB_SELECT_ALL_TEST_ID,
  INVESTIGATE_ATTACK_IN_TIMELINE_BUTTON_TEST_ID,
  REMOVE_ATTACK_ALERTS_CHECKBOX_TEST_ID,
  REMOVE_ATTACK_MODAL_TEST_ID,
  SHOW_ATTACK_BUTTON_TEST_ID,
} from '../../../../../common/cases/attachments/attack/test_ids';

/**
 * The card body is built from the presentational components the Detections → Attacks page uses,
 * so these ids belong to those components rather than to the case attachment. They are inlined
 * because importing them would pull React, EUI and Emotion into the Playwright process; keep them
 * in step with the exports named in the comments.
 */
// public/attack_discovery/components/attack_detected_on
const ATTACK_DETECTED_ON_TEST_ID = 'attackDetectedOn';
// public/attack_discovery/components/attack_entity_summary
const ATTACK_ENTITY_SUMMARY_TEST_ID = 'attack-subtitle-summary-text';
// public/attack_discovery/components/attack_summary_sections
const SUMMARY_CONTENT_TEST_ID = 'summaryContent';
const DETAILS_TITLE_TEST_ID = 'detailsTitle';
const DETAILS_CONTENT_TEST_ID = 'detailsContent';
const ATTACK_CHAIN_TITLE_TEST_ID = 'attackChainTitle';

/**
 * The calls to action the Attacks page renders under its summary, which the case card must not.
 * `newAgentBuilderAttachment` and `viewInAiAssistant` are the two variants of the assistant CTA —
 * which one the page renders depends on whether the agent builder chat experience is enabled.
 */
// public/detections/components/attacks/table/attack_details/attack_ai_assistant_button
const AI_ASSISTANT_CTA_TEST_IDS = ['newAgentBuilderAttachment', 'viewInAiAssistant'] as const;
// public/detections/components/attacks/table/attack_details/summary_tab
const INVESTIGATE_IN_TIMELINE_BUTTON_TEST_ID = 'investigateInTimelineButton';

/**
 * The items the attack "Take action" menu composes, from the bulk-action item hooks in
 * `public/detections/hooks/attacks/bulk_actions/bulk_action_items/`. Inlined for the same reason
 * as the ids above, and exported so a spec can name a menu item without repeating a string
 * literal. The grid's row overflow renders this same menu, minus the navigation and AI assistant
 * items.
 */
export const ATTACK_TAKE_ACTION_ITEM_TEST_ID = {
  addToExistingCase: 'attack-add-to-existing-case',
  addToNewCase: 'attack-add-to-new-case',
  // The seeded attacks are open, so the status items offered are "acknowledge" and "close".
  markAcknowledged: 'acknowledged-attack-status',
  manageTags: 'attack-tags-context-menu-item',
  manageAssignees: 'attack-assignees-context-menu-item',
  investigateInTimeline: 'attack-investigate-in-timeline-action-item',
  viewInAiAssistant: 'viewInAiAssistant',
} as const;

/**
 * The Attacks section's grid column ids, from `ATTACK_TAB_COLUMN_ID` in
 * `public/cases/attachments/attack/utils.ts`. Inlined for the same reason as the ids above, and
 * exported so specs can name a column without repeating a string literal.
 */
export const ATTACK_GRID_COLUMN_ID = {
  actions: 'actions',
  detectedOn: 'detectedOn',
  title: 'title',
  alerts: 'alerts',
  summary: 'summary',
  riskScore: 'riskScore',
  status: 'status',
  attachedBy: 'attachedBy',
  attachedAt: 'attachedAt',
} as const;

/**
 * The grid's selection control column, which is rendered ahead of the picked columns and is not
 * part of the user's column selection. Filtered out of {@link AttackCasesPage.getGridColumnIds}
 * so a spec can assert the column set the column picker actually drives.
 */
const SELECTION_COLUMN_ID = 'selection';

/**
 * `@elastic/eui` data grid internals. The grid's toolbar, header cells and column picker are
 * EUI's own, so their ids belong to EUI; they are named here rather than inlined at the call
 * sites so an EUI rename surfaces in one place.
 */
const EUI_HEADER_CELL_TEST_ID_PREFIX = 'dataGridHeaderCell-';
const EUI_COLUMN_SELECTOR_BUTTON_TEST_ID = 'dataGridColumnSelectorButton';
const EUI_COLUMN_VISIBILITY_TOGGLE_TEST_ID_PREFIX = 'dataGridColumnSelectorToggleColumnVisibility-';
const EUI_SORT_SELECTOR_BUTTON_TEST_ID = 'dataGridColumnSortingButton';
const EUI_FULL_SCREEN_BUTTON_TEST_ID = 'dataGridFullScreenButton';

/**
 * The Cases plugin's "select a case" modal, opened by the Attacks page's "Add to existing case"
 * action. The select button is suffixed with the case's saved object id.
 */
const SELECT_CASE_MODAL_TEST_ID = 'all-cases-modal';
const SELECT_CASE_BUTTON_TEST_ID_PREFIX = 'cases-table-row-select-';
/** The toast the Cases plugin raises once an attachment lands on an existing case. */
const ATTACH_SUCCESS_TOAST_TEST_ID = 'cases-toast-success-attach';

/**
 * Page object for the attack case-attachment flow:
 * - the Attacks page table "Take action" popover (Add to new/existing case)
 * - the Cases new-case creation flyout and its "select a case" modal
 * - the case view: the attack preview card in the Activity log — including the card's own
 *   removal action — and the Attacks section inside the consolidated Attachments tab
 *
 * The unified attachment framework renders no per-type tab: attacks render as an
 * accordion (`case-view-attachment-accordion-security.attack`) inside the single
 * Attachments tab, and that accordion only exists when the case has at least one
 * `security.attack` attachment. Inside it, the section renders an `EuiDataGrid` styled to match
 * the Alerts section directly above it. Nothing in that grid removes an attachment — an attack is
 * removed from its own entry in the Activity log, as an alert is.
 */
export class AttackCasesPage {
  // Attacks page – table group "Take action" popover
  public readonly takeActionButtons: Locator;
  public readonly addToNewCaseItem: Locator;
  public readonly addToExistingCaseItem: Locator;

  // New-case creation flyout (rendered by the Cases plugin)
  public readonly createCaseNameInput: Locator;
  public readonly createCaseDescriptionInput: Locator;
  public readonly createCaseSubmitButton: Locator;
  public readonly caseToastLink: Locator;

  // "Add to existing case" – the Cases plugin's case selector modal
  public readonly selectCaseModal: Locator;
  public readonly selectCaseButtons: Locator;
  public readonly attachSuccessToast: Locator;

  // Case view – Activity log attack card. The card is rendered from the persisted metadata
  // snapshot with the same components as the Attacks page, minus that page's calls to action.
  public readonly activityAttackCard: Locator;
  public readonly activityAttackTitle: Locator;
  public readonly activityAttackDetectedOn: Locator;
  public readonly activityAttackAlertCount: Locator;
  public readonly activityAttackEntitySummary: Locator;
  public readonly activityAttackSummaryContent: Locator;
  public readonly activityAttackDetailsTitle: Locator;
  public readonly activityAttackDetailsContent: Locator;
  public readonly activityAttackChainTitle: Locator;
  public readonly activityAttackAiAssistantCta: Locator;
  public readonly activityAttackInvestigateInTimelineCta: Locator;
  public readonly showAttackButton: Locator;
  public readonly activityAttackDeleteButtons: Locator;

  // Case view – Attachments tab + Attacks accordion
  public readonly attachmentsTab: Locator;
  public readonly activityTab: Locator;
  public readonly attachmentsContainer: Locator;
  public readonly attackAccordion: Locator;
  public readonly attackAccordionBadge: Locator;
  public readonly alertAccordion: Locator;
  public readonly alertAccordionBadge: Locator;

  // Case view – the Attacks section's data grid
  public readonly attackGrid: Locator;
  public readonly attackGridColumnHeaders: Locator;
  public readonly attackGridColumnSelectorButton: Locator;
  public readonly attackGridSortSelectorButton: Locator;
  public readonly attackGridFullScreenButton: Locator;
  public readonly attackGridRowTitles: Locator;
  public readonly attackGridDetectedOnCells: Locator;
  public readonly attackGridTitleCells: Locator;
  public readonly attackGridAlertsCells: Locator;
  public readonly attackGridSummaryCells: Locator;
  public readonly attackGridRowActions: Locator;
  public readonly attackGridShowButtons: Locator;
  public readonly attackGridInvestigateInTimelineButtons: Locator;
  public readonly attackGridMoreActionsButtons: Locator;
  public readonly attackGridMoreActionsPopover: Locator;

  // Case view – the Attacks section's selection and bulk action bar
  public readonly attackGridSelectAllCheckbox: Locator;
  public readonly attackGridRowSelectCheckboxes: Locator;
  public readonly attackGridBulkActions: Locator;
  public readonly attackGridBulkTakeActionButton: Locator;
  public readonly attackGridBulkActionsPopover: Locator;

  // Case view – attack removal prompt
  public readonly removeAttackModal: Locator;
  public readonly removeAttackAlertsCheckbox: Locator;
  public readonly removeAttackConfirmButton: Locator;

  // Attack details flyout (legacy expandable flyout, i.e. `enableNewFlyout: false`)
  public readonly attackDetailsFlyoutBody: Locator;

  constructor(private readonly page: ScoutPage) {
    this.takeActionButtons = page.testSubj.locator('take-action-button');
    this.addToNewCaseItem = page.testSubj.locator('attack-add-to-new-case');
    this.addToExistingCaseItem = page.testSubj.locator('attack-add-to-existing-case');

    // Scope to the Cases plugin's stable form rows, then the single control within each —
    // avoids matching stray generic inputs elsewhere on the page.
    this.createCaseNameInput = page.testSubj.locator('caseTitle').locator('input');
    this.createCaseDescriptionInput = page.testSubj.locator('caseDescription').locator('textarea');
    this.createCaseSubmitButton = page.testSubj.locator('create-case-submit');
    this.caseToastLink = page.testSubj.locator('toaster-content-case-view-link');

    this.selectCaseModal = page.testSubj.locator(SELECT_CASE_MODAL_TEST_ID);
    // Suffixed with the case's saved object id, generated server-side — match the prefix.
    this.selectCaseButtons = this.selectCaseModal.locator(
      `[data-test-subj^="${SELECT_CASE_BUTTON_TEST_ID_PREFIX}"]`
    );
    this.attachSuccessToast = page.testSubj.locator(ATTACH_SUCCESS_TOAST_TEST_ID);

    this.activityAttackCard = page.testSubj.locator(ATTACK_CARD_TEST_ID);
    this.activityAttackTitle = page.testSubj.locator(ATTACK_TITLE_TEST_ID);
    this.activityAttackAlertCount = page.testSubj.locator(ATTACK_ALERT_COUNT_TEST_ID);
    // The section ids are shared with the Attacks page, so scope them to the card rather than to
    // the page: nothing else in the case view may satisfy these assertions.
    this.activityAttackDetectedOn = this.cardSection(ATTACK_DETECTED_ON_TEST_ID);
    this.activityAttackEntitySummary = this.cardSection(ATTACK_ENTITY_SUMMARY_TEST_ID);
    this.activityAttackSummaryContent = this.cardSection(SUMMARY_CONTENT_TEST_ID);
    this.activityAttackDetailsTitle = this.cardSection(DETAILS_TITLE_TEST_ID);
    this.activityAttackDetailsContent = this.cardSection(DETAILS_CONTENT_TEST_ID);
    this.activityAttackChainTitle = this.cardSection(ATTACK_CHAIN_TITLE_TEST_ID);
    this.activityAttackAiAssistantCta = this.cardSection(...AI_ASSISTANT_CTA_TEST_IDS);
    this.activityAttackInvestigateInTimelineCta = this.cardSection(
      INVESTIGATE_IN_TIMELINE_BUTTON_TEST_ID
    );
    // The button's test subject is suffixed with the attachment saved object id, which is
    // generated server-side, so match on the stable prefix. The Activity log's copy of the action
    // is the only one on that tab; the grid's copies are scoped to the grid below.
    this.showAttackButton = page.locator(`[data-test-subj^="${SHOW_ATTACK_BUTTON_TEST_ID}-"]`);
    // The card's own removal action, registered in place of the Cases framework's default trash.
    // Suffixed with the attachment saved object id, so a spec can target one card of several.
    this.activityAttackDeleteButtons = page.locator(
      `[data-test-subj^="${ATTACK_CARD_DELETE_ACTION_TEST_ID}-"]`
    );

    this.attachmentsTab = page.testSubj.locator('case-view-tab-title-attachments');
    this.activityTab = page.testSubj.locator('case-view-tab-title-activity');
    this.attachmentsContainer = page.testSubj.locator('case-view-attachments');
    this.attackAccordion = page.testSubj.locator(
      `case-view-attachment-accordion-${SECURITY_ATTACK_ATTACHMENT_TYPE}`
    );
    this.attackAccordionBadge = page.testSubj.locator(
      `case-view-attachment-badge-${SECURITY_ATTACK_ATTACHMENT_TYPE}`
    );
    this.alertAccordion = page.testSubj.locator(
      `case-view-attachment-accordion-${SECURITY_ALERT_ATTACHMENT_TYPE}`
    );
    this.alertAccordionBadge = page.testSubj.locator(
      `case-view-attachment-badge-${SECURITY_ALERT_ATTACHMENT_TYPE}`
    );

    this.attackGrid = page.testSubj.locator(ATTACK_TAB_GRID_TEST_ID);
    this.attackGridColumnHeaders = this.attackGrid.locator(
      `[data-test-subj^="${EUI_HEADER_CELL_TEST_ID_PREFIX}"]`
    );
    this.attackGridColumnSelectorButton = this.attackGrid.getByTestId(
      EUI_COLUMN_SELECTOR_BUTTON_TEST_ID
    );
    this.attackGridSortSelectorButton = this.attackGrid.getByTestId(
      EUI_SORT_SELECTOR_BUTTON_TEST_ID
    );
    this.attackGridFullScreenButton = this.attackGrid.getByTestId(EUI_FULL_SCREEN_BUTTON_TEST_ID);
    this.attackGridRowTitles = this.attackGrid.getByTestId(ATTACK_TAB_ROW_TITLE_TEST_ID);
    this.attackGridDetectedOnCells = this.attackGrid.getByTestId(
      ATTACK_TAB_COLUMN_DETECTED_ON_TEST_ID
    );
    this.attackGridTitleCells = this.attackGrid.getByTestId(ATTACK_TAB_COLUMN_TITLE_TEST_ID);
    this.attackGridAlertsCells = this.attackGrid.getByTestId(ATTACK_TAB_COLUMN_ALERTS_TEST_ID);
    this.attackGridSummaryCells = this.attackGrid.getByTestId(ATTACK_TAB_COLUMN_SUMMARY_TEST_ID);
    this.attackGridRowActions = this.attackGrid.getByTestId(ATTACK_TAB_COLUMN_ACTIONS_TEST_ID);
    this.attackGridShowButtons = this.attackGrid.locator(
      `[data-test-subj^="${SHOW_ATTACK_BUTTON_TEST_ID}-"]`
    );
    // Both suffixed with the attachment saved object id — match the prefix.
    this.attackGridInvestigateInTimelineButtons = this.attackGrid.locator(
      `[data-test-subj^="${INVESTIGATE_ATTACK_IN_TIMELINE_BUTTON_TEST_ID}-"]`
    );
    this.attackGridMoreActionsButtons = this.attackGrid.locator(
      `[data-test-subj^="${ATTACK_TAB_ROW_MORE_ACTIONS_TEST_ID}-"]`
    );
    // Popover panels are portalled to the document body, so they are scoped to the page rather
    // than to the grid that opened them.
    this.attackGridMoreActionsPopover = page.testSubj.locator(
      ATTACK_TAB_ROW_MORE_ACTIONS_POPOVER_TEST_ID
    );

    this.attackGridSelectAllCheckbox = this.attackGrid.getByTestId(ATTACK_TAB_SELECT_ALL_TEST_ID);
    // Suffixed with the attachment saved object id, generated server-side — match the prefix.
    this.attackGridRowSelectCheckboxes = this.attackGrid.locator(
      `[data-test-subj^="${ATTACK_TAB_ROW_SELECT_TEST_ID}-"]`
    );
    // The bar is appended to the grid's own toolbar, so it lives inside the grid.
    this.attackGridBulkActions = this.attackGrid.getByTestId(ATTACK_TAB_BULK_ACTIONS_TEST_ID);
    this.attackGridBulkTakeActionButton = this.attackGrid.getByTestId(
      ATTACK_TAB_BULK_ACTIONS_BUTTON_TEST_ID
    );
    this.attackGridBulkActionsPopover = page.testSubj.locator(
      ATTACK_TAB_BULK_ACTIONS_POPOVER_TEST_ID
    );

    // Suffixed with the attachment saved object id, generated server-side — match the prefix.
    this.removeAttackModal = page.testSubj.locator(REMOVE_ATTACK_MODAL_TEST_ID);
    this.removeAttackAlertsCheckbox = page.testSubj.locator(REMOVE_ATTACK_ALERTS_CHECKBOX_TEST_ID);
    this.removeAttackConfirmButton = page.testSubj.locator('confirmModalConfirmButton');

    this.attackDetailsFlyoutBody = page.testSubj.locator('attack-details-flyout-body');
  }

  /**
   * The attack card's visible text, used to assert that the narrative is rendered as formatted
   * markdown rather than as the raw `{{ field value }}` token syntax.
   */
  async getActivityAttackCardText(): Promise<string> {
    await this.activityAttackCard.waitFor({ state: 'visible', timeout: 30_000 });

    return this.activityAttackCard.innerText();
  }

  /**
   * Resolves the first element a locator matches, once at least one has rendered. Both the
   * attacks table and the case's Attacks section list several rows, so a strict-mode
   * single-element locator will not do; waiting on the count first keeps the resolution from
   * racing the render, which `all()` on its own does not.
   */
  private async resolveFirst(locator: Locator, notFoundMessage: string): Promise<Locator> {
    return this.resolveAt(locator, 0, notFoundMessage);
  }

  /**
   * Resolves the element at `index`, once the locator has matched at least that many. Polling on
   * the count rather than asserting it keeps the resolution from racing a list that renders its
   * rows one at a time, which `all()` on its own does not.
   */
  private async resolveAt(
    locator: Locator,
    index: number,
    notFoundMessage: string
  ): Promise<Locator> {
    await expect
      .poll(async () => locator.count(), { timeout: 30_000, message: notFoundMessage })
      .toBeGreaterThan(index);

    const match = (await locator.all())[index];

    if (!match) {
      throw new Error(notFoundMessage);
    }

    return match;
  }

  /** Resolves one or more test subjects within the activity log's attack card. */
  private cardSection(...testSubjects: readonly string[]): Locator {
    return this.activityAttackCard.locator(
      testSubjects.map((subject) => `[data-test-subj="${subject}"]`).join(', ')
    );
  }

  /** Opens the "Take action" popover on the first attack group in the Attacks table. */
  async openFirstAttackTakeActionMenu() {
    await this.openAttackTakeActionMenu(0);
  }

  /**
   * Opens the "Take action" popover on the attack group at `groupIndex`. The Attacks page lists
   * one group per attack, so the index selects which attack the case actions will attach.
   */
  async openAttackTakeActionMenu(groupIndex: number) {
    const takeActionButton = await this.resolveAt(
      this.takeActionButtons,
      groupIndex,
      `No take action button at index ${groupIndex} in the attacks table`
    );

    await takeActionButton.waitFor({ state: 'visible', timeout: 30_000 });
    await takeActionButton.click();
    await this.addToNewCaseItem.waitFor({ state: 'visible', timeout: 30_000 });
  }

  async clickAddToNewCase() {
    await this.addToNewCaseItem.click();
  }

  /**
   * Attaches through "Add to existing case", picking the only case in the space. Returns once the
   * Cases plugin confirms the attachment, so a caller navigating to the case is not racing the
   * write.
   */
  async addToOnlyExistingCase() {
    await this.addToExistingCaseItem.click();
    await this.selectCaseModal.waitFor({ state: 'visible', timeout: 30_000 });

    const selectCaseButton = await this.resolveFirst(
      this.selectCaseButtons,
      'No selectable case found in the case selector modal'
    );

    await selectCaseButton.click();
    await this.selectCaseModal.waitFor({ state: 'hidden', timeout: 30_000 });
    await this.attachSuccessToast.waitFor({ state: 'visible', timeout: 30_000 });
  }

  async createCase(name: string, description: string) {
    await this.createCaseNameInput.waitFor({ state: 'visible', timeout: 30_000 });
    await this.createCaseNameInput.fill(name);
    await this.createCaseDescriptionInput.fill(description);
    await this.createCaseSubmitButton.click();
  }

  /** Follows the "View case" link in the case-created success toast. */
  async clickCaseToastLink() {
    await this.caseToastLink.waitFor({ state: 'visible', timeout: 30_000 });
    await this.caseToastLink.click();
    await this.waitForCaseView();
  }

  async navigateToCase(caseId: string) {
    await this.page.gotoApp(`security/cases/${caseId}`);
    await this.waitForCaseView();
  }

  /** The id of the case currently open, read back from the case-view URL. */
  async getOpenCaseId(): Promise<string> {
    await this.waitForCaseView();

    const url = this.page.url();
    const caseId = /\/cases\/([^/?#]+)/.exec(url)?.[1];

    if (caseId == null) {
      throw new Error(`Not on a case view, so no case id to read: ${url}`);
    }

    return caseId;
  }

  /**
   * A cold navigation lands on the case-view spinner; `case-view-tabs` is the tab bar the
   * cases framework renders only once the case fetch resolves, so waiting on it keeps
   * downstream tab clicks from racing the fetch.
   */
  async waitForCaseView() {
    await this.page.testSubj
      .locator('case-view-tabs')
      .waitFor({ state: 'visible', timeout: 30_000 });
  }

  /** The case view lands on Activity; the Attacks accordion lives in the Attachments tab. */
  async openAttachmentsTab() {
    await this.attachmentsTab.waitFor({ state: 'visible', timeout: 30_000 });
    await this.attachmentsTab.click();
    await this.attachmentsContainer.waitFor({ state: 'visible', timeout: 30_000 });
  }

  /** Returns to the Activity log, where an attack attachment carries its own removal action. */
  async openActivityTab() {
    await this.activityTab.waitFor({ state: 'visible', timeout: 30_000 });
    await this.activityTab.click();

    const firstCard = await this.resolveFirst(
      this.activityAttackCard,
      'No attack card found in the case activity log'
    );

    await firstCard.waitFor({ state: 'visible', timeout: 30_000 });
  }

  async openAttackFlyoutFromActivity() {
    await this.showAttackButton.waitFor({ state: 'visible', timeout: 30_000 });
    await this.showAttackButton.click();
  }

  /** Opens the attack flyout from the first grid row's actions column. */
  async openAttackFlyoutFromGrid() {
    const firstShowButton = await this.resolveFirst(
      this.attackGridShowButtons,
      'No show attack button found in the attacks grid'
    );

    await firstShowButton.click();
  }

  /**
   * How many action controls the row at `rowIndex` offers. The leading actions column holds them
   * all in one cell, so this counts the buttons the cell renders.
   */
  async getRowActionCount(rowIndex = 0): Promise<number> {
    const actionsCell = await this.resolveAt(
      this.attackGridRowActions,
      rowIndex,
      `No actions cell at row ${rowIndex} in the attacks grid`
    );

    return actionsCell.locator('button').count();
  }

  /** Opens the overflow menu on the grid row at `rowIndex`, which carries the take-action items. */
  async openRowMoreActionsMenu(rowIndex = 0) {
    const moreActionsButton = await this.resolveAt(
      this.attackGridMoreActionsButtons,
      rowIndex,
      `No more actions button at row ${rowIndex} in the attacks grid`
    );

    await moreActionsButton.click();
    await this.attackGridMoreActionsPopover.waitFor({ state: 'visible', timeout: 30_000 });
  }

  /** One item of the row overflow menu, named by a {@link ATTACK_TAKE_ACTION_ITEM_TEST_ID} value. */
  rowMoreActionsMenuItem(testSubject: string): Locator {
    return this.attackGridMoreActionsPopover.locator(`[data-test-subj="${testSubject}"]`);
  }

  /** Dismisses the row overflow menu with the keyboard, as an analyst can. */
  async closeRowMoreActionsMenu() {
    await this.page.keyboard.press('Escape');
    await this.attackGridMoreActionsPopover.waitFor({ state: 'hidden', timeout: 30_000 });
  }

  /** Opens the bulk action bar's "Take action" popover, for the whole selection. */
  async openBulkTakeActionMenu() {
    await this.attackGridBulkTakeActionButton.waitFor({ state: 'visible', timeout: 30_000 });
    await this.attackGridBulkTakeActionButton.click();
    await this.attackGridBulkActionsPopover.waitFor({ state: 'visible', timeout: 30_000 });
  }

  /** One item of the bulk menu, named by a {@link ATTACK_TAKE_ACTION_ITEM_TEST_ID} value. */
  bulkActionsMenuItem(testSubject: string): Locator {
    return this.attackGridBulkActionsPopover.locator(`[data-test-subj="${testSubject}"]`);
  }

  /** Dismisses the bulk action bar's menu with the keyboard, as an analyst can. */
  async closeBulkTakeActionMenu() {
    await this.page.keyboard.press('Escape');
    await this.attackGridBulkActionsPopover.waitFor({ state: 'hidden', timeout: 30_000 });
  }

  /**
   * The grid's column ids in render order, without the selection control column — that is, the
   * set the column picker drives, with the leading actions column first.
   */
  async getGridColumnIds(): Promise<string[]> {
    await expect(this.attackGridColumnHeaders).not.toHaveCount(0, { timeout: 30_000 });

    const testSubjects = await this.attackGridColumnHeaders.evaluateAll((headers) =>
      headers.map((header) => header.getAttribute('data-test-subj') ?? '')
    );

    return testSubjects
      .map((testSubject) => testSubject.slice(EUI_HEADER_CELL_TEST_ID_PREFIX.length))
      .filter((columnId) => columnId !== SELECTION_COLUMN_ID);
  }

  /**
   * Adds a column to the grid through the data grid's own column picker. The switch is a
   * `role="switch"` button rather than a checkbox, so its state is asserted rather than checked.
   */
  async addGridColumn(columnId: string) {
    await this.attackGridColumnSelectorButton.click();

    const toggle = this.page.testSubj.locator(
      `${EUI_COLUMN_VISIBILITY_TOGGLE_TEST_ID_PREFIX}${columnId}`
    );
    await toggle.waitFor({ state: 'visible', timeout: 30_000 });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });

    // Dismissed with the toolbar button that opened it, so the picker stops covering the grid it
    // just changed. Read from the switch going away rather than from the popover: EUI puts
    // `dataGridColumnSelectorPopover` on the anchor, which is in the DOM whether it is open or not.
    await this.attackGridColumnSelectorButton.click();
    await toggle.waitFor({ state: 'hidden', timeout: 30_000 });
  }

  /** Ticks the header checkbox, which selects every row the search has left in the grid. */
  async selectAllAttacks() {
    await this.attackGridSelectAllCheckbox.waitFor({ state: 'visible', timeout: 30_000 });
    await this.attackGridSelectAllCheckbox.check();
  }

  /**
   * Removes one attack from its own entry in the Activity log, which is the only place an attack
   * attachment is removed from. The delete action is suffixed with the attachment saved object
   * id, so the card is named rather than picked by position.
   */
  async removeAttackFromActivityCard({
    savedObjectId,
    withRelatedAlerts,
  }: {
    savedObjectId: string;
    withRelatedAlerts: boolean;
  }) {
    const deleteButton = this.page.testSubj.locator(
      `${ATTACK_CARD_DELETE_ACTION_TEST_ID}-${savedObjectId}`
    );

    await deleteButton.waitFor({ state: 'visible', timeout: 30_000 });
    await deleteButton.click();
    await this.removeAttackModal.waitFor({ state: 'visible', timeout: 30_000 });
    await this.confirmRemoveAttack({ withRelatedAlerts });
  }

  /**
   * Confirms the removal prompt. The related-alerts checkbox is ticked by default and only
   * enables once the attack's alert set has been resolved, so this waits for that rather than
   * racing the request, then asserts the default or clears it.
   */
  async confirmRemoveAttack({ withRelatedAlerts }: { withRelatedAlerts: boolean }) {
    await this.removeAttackAlertsCheckbox.waitFor({ state: 'visible', timeout: 30_000 });
    await expect(this.removeAttackAlertsCheckbox).toBeEnabled({ timeout: 30_000 });

    if (withRelatedAlerts) {
      await expect(this.removeAttackAlertsCheckbox).toBeChecked({ timeout: 30_000 });
    } else {
      await this.removeAttackAlertsCheckbox.uncheck();
    }

    await this.removeAttackConfirmButton.click();
    await this.removeAttackModal.waitFor({ state: 'hidden', timeout: 30_000 });
  }
}
