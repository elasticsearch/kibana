/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator, ScoutPage } from '@kbn/scout-security';
import {
  ADD_TO_NEW_CASE_TEST_ID,
  ADD_TO_EXISTING_CASE_TEST_ID,
  ENTITY_TAB_TABLE_TEST_ID,
  ENTITY_TAB_EMPTY_TEST_ID,
} from '../../../../../common/cases/attachments/entity/test_ids';

/**
 * Page object for entity attachment Cases UI interactions:
 * - Entity flyout Take Action popover (Add to new/existing case)
 * - Cases new-case creation flyout
 * - Case view Entities tab
 */
export class EntityCasesPage {
  // Alerts table (used to scope entity link lookups to a specific alert row)
  public readonly alertsTable: Locator;

  // Entity flyout – Take Action popover
  public readonly takeActionButton: Locator;
  public readonly addToNewCaseItem: Locator;
  public readonly addToExistingCaseItem: Locator;

  // Case view – Entities tab
  public readonly entitiesTab: Locator;
  public readonly entityTabTable: Locator;
  public readonly entityTabEmpty: Locator;

  // New-case creation flyout (rendered by the Cases plugin)
  public readonly createCaseNameInput: Locator;
  public readonly createCaseSubmitButton: Locator;

  // Toast link that navigates to the newly created case
  public readonly caseToastLink: Locator;

  constructor(private readonly page: ScoutPage) {
    this.alertsTable = page.testSubj.locator('alertsTableIsLoaded');

    this.takeActionButton = page.testSubj.locator('take-action-button');
    this.addToNewCaseItem = page.testSubj.locator(ADD_TO_NEW_CASE_TEST_ID);
    this.addToExistingCaseItem = page.testSubj.locator(ADD_TO_EXISTING_CASE_TEST_ID);

    this.entitiesTab = page.testSubj.locator('case-view-tab-title-entities');
    this.entityTabTable = page.testSubj.locator(ENTITY_TAB_TABLE_TEST_ID);
    this.entityTabEmpty = page.testSubj.locator(ENTITY_TAB_EMPTY_TEST_ID);

    // Scope to the Cases plugin's stable `caseTitle` form row, then the single
    // `<input>` within it — avoids matching stray `data-test-subj="input"` fields
    // elsewhere on the page and survives aria-label/copy changes.
    this.createCaseNameInput = page.testSubj.locator('caseTitle').locator('input');
    this.createCaseSubmitButton = page.testSubj.locator('create-case-submit');

    // Exact plugin-owned test-subj for the "View case" link in the case-created
    // success toast — avoids the brittle `*=toastLink` substring match. Each test
    // creates a single case in its own space, so only one such toast is present;
    // if two ever stacked, Playwright strict mode surfaces it rather than
    // silently clicking the wrong one.
    this.caseToastLink = page.testSubj.locator('toaster-content-case-view-link');
  }

  async navigateToAlerts() {
    await this.page.gotoApp('security/alerts');
  }

  async openHostFlyoutForRule(ruleName: string) {
    await this.alertsTable.waitFor({ state: 'visible' });
    await this.rowForRule(ruleName).getByTestId('host-details-button').click();
  }

  async openUserFlyoutForRule(ruleName: string) {
    await this.alertsTable.waitFor({ state: 'visible' });
    await this.rowForRule(ruleName).getByTestId('users-link').click();
  }

  // Scope to the data grid row whose `ruleName` cell matches, using the stable
  // ARIA `row` role rather than the internal `euiDataGridRow` EUI class (which an
  // EUI version bump could rename/wrap and silently break row scoping).
  private rowForRule(ruleName: string): Locator {
    return this.alertsTable.getByRole('row').filter({
      has: this.page.testSubj.locator('ruleName').filter({ hasText: ruleName }),
    });
  }

  async openTakeActionMenu() {
    await this.takeActionButton.waitFor();
    await this.takeActionButton.click();
  }

  async clickAddToNewCase() {
    await this.addToNewCaseItem.click();
  }

  async clickAddToExistingCase() {
    await this.addToExistingCaseItem.click();
  }

  async fillCaseName(name: string) {
    await this.createCaseNameInput.waitFor();
    await this.createCaseNameInput.fill(name);
  }

  async submitNewCase() {
    await this.createCaseSubmitButton.click();
  }

  async navigateToCase(caseId: string) {
    await this.page.gotoApp(`security/cases/${caseId}`);
  }

  async clickEntitiesTab() {
    await this.entitiesTab.click();
  }

  async clickCaseToastLink() {
    await this.caseToastLink.click();
  }
}
