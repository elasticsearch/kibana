/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout';
import { KibanaCodeEditorWrapper } from '@kbn/scout';

/**
 * Page object for the flyout_v2 IOC (Indicator of Compromise) flyout, opened from the
 * Threat Intelligence indicators table row's `tiToggleIndicatorFlyoutButton`. The flyout
 * has Overview / Table / JSON tabs and a "Take action" footer menu.
 */
export class IOCFlyout {
  /**
   * Flyout header title ("Indicator details"). The header renders it via FlyoutTitle, which
   * suffixes the test subject with "Text".
   */
  public readonly title: Locator;
  /** Header subtitle ("First seen: ..."). */
  public readonly subtitle: Locator;
  /** Indicator name rendered as the overview heading. */
  public readonly indicatorName: Locator;
  /** Container for the Feed / Type / TLP / Confidence header blocks. */
  public readonly highLevelBlocks: Locator;

  // Tabs
  public readonly overviewTab: Locator;
  public readonly tableTab: Locator;
  public readonly jsonTab: Locator;

  // Tab content
  /** Highlighted-fields table rendered in the Overview tab. */
  public readonly overviewTable: Locator;
  /** All-fields table rendered in the Table tab. */
  public readonly fieldsTable: Locator;
  /**
   * JSON viewer rendered in the JSON tab. The shared JsonTab suffixes its base test subject
   * ("indicators-flyout") with "jsonView".
   */
  public readonly jsonViewer: Locator;
  /** "View all fields in table" button in the Overview tab. */
  public readonly viewAllFieldsInTableButton: Locator;

  // Footer "Take action" menu
  public readonly takeActionButton: Locator;
  public readonly investigateInTimelineItem: Locator;
  public readonly addToExistingCaseItem: Locator;
  public readonly addToNewCaseItem: Locator;
  public readonly addToBlockListItem: Locator;

  // Targets opened by the "Take action" items.
  /** Name input of the block list creation flyout (Add to block list). */
  public readonly blocklistFormNameInput: Locator;
  /** "Add to existing case" case-selector modal. */
  public readonly allCasesModal: Locator;
  /** Submit button of the "Add to new case" creation flyout. */
  public readonly createCaseSubmit: Locator;

  /** Wraps the Monaco editor that backs the JSON tab; reads its full model value. */
  private readonly codeEditor: KibanaCodeEditorWrapper;

  constructor(page: ScoutPage) {
    this.codeEditor = new KibanaCodeEditorWrapper(page);
    this.title = page.testSubj.locator('securitySolutionFlyoutIOCDetailsTitleText');
    this.subtitle = page.testSubj.locator('securitySolutionFlyoutIOCDetailsSubtitle');
    this.indicatorName = page.testSubj.locator('tiFlyoutOverviewTitle');
    this.highLevelBlocks = page.testSubj.locator('tiFlyoutOverviewHighLevelBlocks');

    this.overviewTab = page.testSubj.locator('securitySolutionFlyoutIOCDetailsOverviewTab');
    this.tableTab = page.testSubj.locator('securitySolutionFlyoutIOCDetailsTableTab');
    this.jsonTab = page.testSubj.locator('securitySolutionFlyoutIOCDetailsJsonTab');

    this.overviewTable = page.testSubj.locator('tiFlyoutOverviewTableRow');
    this.fieldsTable = page.testSubj.locator('tiFlyoutTable');
    this.jsonViewer = page.testSubj.locator('indicators-flyoutjsonView');
    this.viewAllFieldsInTableButton = page.getByRole('button', {
      name: 'View all fields in table',
    });

    this.takeActionButton = page.testSubj.locator('tiIndicatorFlyoutTakeActionButton');
    this.investigateInTimelineItem = page.testSubj.locator(
      'tiIndicatorFlyoutInvestigateInTimelineContextMenu'
    );
    this.addToExistingCaseItem = page.testSubj.locator(
      'tiIndicatorFlyoutAddToExistingCaseContextMenu'
    );
    this.addToNewCaseItem = page.testSubj.locator('tiIndicatorFlyoutAddToNewCaseContextMenu');
    this.addToBlockListItem = page.testSubj.locator('tiIndicatorFlyoutAddToBlockListContextMenu');

    this.blocklistFormNameInput = page.testSubj.locator('blocklist-form-name-input');
    this.allCasesModal = page.testSubj.locator('all-cases-modal');
    this.createCaseSubmit = page.testSubj.locator('create-case-submit');
  }

  /** Wait for the flyout to be visible and its title rendered. */
  async waitForFlyout() {
    await this.title.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async selectOverviewTab() {
    await this.overviewTab.click();
  }

  async selectTableTab() {
    await this.tableTab.click();
  }

  async selectJsonTab() {
    await this.jsonTab.click();
  }

  /** Open the footer "Take action" context menu. */
  async openTakeActionMenu() {
    await this.takeActionButton.click();
  }

  async clickViewAllFieldsInTable() {
    await this.viewAllFieldsInTableButton.click();
  }

  /**
   * Returns the full text of the JSON tab's Monaco editor. Reads the editor model directly
   * (via `MonacoEnvironment`) rather than the DOM, so the value is complete even though Monaco
   * virtualizes lines. The JSON tab editor is the only Monaco instance on the page.
   */
  async getJsonTabValue(): Promise<string> {
    return this.codeEditor.getCodeEditorValue();
  }
}
