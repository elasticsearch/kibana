/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout';

const TIMELINES_URL = 'security/timelines';
const TIMELINE_TEMPLATES_URL = 'security/timelines/template';

export class TimelinePage {
  readonly panel: Locator;
  readonly queryInput: Locator;
  readonly saveStatus: Locator;
  readonly saveButton: Locator;
  readonly saveTooltip: Locator;
  readonly closeButton: Locator;
  readonly saveModal: Locator;
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;
  readonly saveModalSaveButton: Locator;
  readonly saveAsNewSwitch: Locator;
  readonly newTimelineDropdownButton: Locator;
  readonly createNewTimelineOption: Locator;
  readonly bottomBarToggle: Locator;
  readonly timelinesTable: Locator;
  readonly createFromTemplateButton: Locator;
  readonly customTemplatesTab: Locator;
  readonly kqlTextarea: Locator;
  readonly saveButtonTooltipAnchor: Locator;
  readonly timelineRows: Locator;
  readonly providerBadge: Locator;

  constructor(private readonly page: ScoutPage) {
    this.panel = this.page.testSubj.locator('timeline-modal-header-panel');
    this.providerBadge = this.page.testSubj.locator('providerBadge');
    this.queryInput = this.page.testSubj.locator('timelineQueryInput');
    this.saveStatus = this.panel.locator('[data-test-subj="timeline-save-status"]');
    this.saveButton = this.page.testSubj.locator('timeline-modal-save-timeline');
    this.saveTooltip = this.page.testSubj.locator('timeline-modal-save-timeline-tooltip');
    this.closeButton = this.page.testSubj.locator('timeline-modal-header-close-button');
    this.saveModal = this.page.testSubj.locator('save-timeline-modal');
    this.titleInput = this.page.testSubj.locator('save-timeline-modal-title-input');
    this.descriptionInput = this.page.testSubj.locator('save-timeline-modal-description-input');
    this.saveModalSaveButton = this.page.testSubj.locator('save-timeline-modal-save-button');
    this.saveAsNewSwitch = this.page.testSubj.locator('save-timeline-modal-save-as-new-switch');
    this.newTimelineDropdownButton = this.page.testSubj.locator(
      'timeline-modal-new-timeline-dropdown-button'
    );
    this.createNewTimelineOption = this.page.testSubj.locator('timeline-modal-new-timeline');
    this.bottomBarToggle = this.page.testSubj.locator('timeline-bottom-bar-title-button');
    this.timelinesTable = this.page.testSubj.locator('timelines-table');
    this.createFromTemplateButton = this.page.testSubj.locator('create-from-template');
    this.customTemplatesTab = this.page.testSubj.locator('Custom templates');
    this.kqlTextarea = this.page.testSubj
      .locator('timeline-search-or-filter-search-container')
      .locator('textarea');
    this.saveButtonTooltipAnchor = this.page.locator(
      'span:has([data-test-subj="timeline-modal-save-timeline"])'
    );
    this.timelineRows = this.timelinesTable.locator('tbody').getByRole('row');
  }

  async navigateToTimelines() {
    await this.page.gotoApp(TIMELINES_URL);
    await this.timelinesTable.waitFor({ timeout: 30_000 });
  }

  async navigateToTemplates() {
    await this.page.gotoApp(TIMELINE_TEMPLATES_URL);
  }

  async open() {
    await this.bottomBarToggle.click();
    await this.panel.waitFor();
  }

  async close() {
    await this.closeButton.click();
    await this.panel.waitFor({ state: 'hidden' });
  }

  async createNew() {
    await this.newTimelineDropdownButton.click();
    await this.createNewTimelineOption.click();
  }

  async saveWithName(name: string) {
    await this.openSaveModalAndSetTitle(name);
    await this.confirmSaveModal();
  }

  async saveAsNew(name: string) {
    await this.openSaveModalAndSetTitle(name);
    await this.saveAsNewSwitch.click();
    await this.confirmSaveModal();
  }

  async addNameAndDescription(title: string, description: string) {
    await this.openSaveModalAndSetTitle(title);
    await this.descriptionInput.fill(description);
    await this.confirmSaveModal();
  }

  private async openSaveModalAndSetTitle(name: string) {
    await this.saveButton.click();
    await this.titleInput.clear();
    await this.titleInput.fill(name);
    await this.titleInput.press('Enter');
  }

  private async confirmSaveModal() {
    await this.saveModalSaveButton.click();
    await this.saveModal.waitFor({ state: 'hidden' });
  }

  async executeKQL(query: string) {
    await this.kqlTextarea.click();
    await this.kqlTextarea.clear();
    // QueryStringInput submits this.props.query (React prop) on Enter,
    // not the DOM value. pressSequentially types character-by-character,
    // giving React time to sync props before Enter fires the submit.
    await this.kqlTextarea.pressSequentially(query);
    await this.kqlTextarea.press('Enter');
  }

  async selectCustomTemplates() {
    await this.timelinesTable.waitFor({ timeout: 30_000 });
    await this.customTemplatesTab.click();
  }

  async createTimelineFromTemplate(templateTitle: string) {
    const templateRow = this.timelinesTable
      .locator('tbody')
      .getByRole('row')
      .filter({ hasText: templateTitle });
    await templateRow.locator('[data-test-subj="euiCollapsedItemActionsButton"]').click();
    await this.createFromTemplateButton.click();
  }

  async hoverSaveButton() {
    // EUI wraps disabled buttons in a tooltip anchor <span> that intercepts
    // pointer events, so we hover the wrapper instead of the button itself.
    await this.saveButtonTooltipAnchor.hover();
  }
}
