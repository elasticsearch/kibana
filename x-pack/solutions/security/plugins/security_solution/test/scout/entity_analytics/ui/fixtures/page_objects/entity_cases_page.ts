/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator, ScoutPage } from '@kbn/scout-security';
import { SECURITY_ENTITY_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import { ADD_TO_CASE_TEST_ID } from '../../../../../../common/cases/attachments/entity/test_ids';

/**
 * Page object for entity attachment Cases UI interactions:
 * - Entity flyout Take Action popover (Add to case)
 * - Cases new-case creation flyout
 * - Case view Attachments tab + the "Entities" attachment accordion
 *
 * Note: the Cases UI uses the unified attachment framework, so there is no
 * dedicated "Entities" tab. Entity attachments render as an accordion
 * (`case-view-attachment-accordion-security.entity`) inside the consolidated
 * Attachments tab, and the accordion is only rendered when the case has at
 * least one entity attachment.
 *
 * These helpers deliberately assert against the accordion and its count badge
 * (both rendered by the cases framework from the case's attachments) rather than
 * the Entity Analytics table inside it. The table is gated on EA index-read
 * privileges and entity-store data, which are Entity Analytics' concern, not the
 * cases-attachment feature under test — asserting the accordion keeps this suite
 * runnable as the least-privileged `platform_engineer` role.
 */
export class EntityCasesPage {
  // Entity flyout – Take Action popover
  public readonly takeActionButton: Locator;
  public readonly addToCaseItem: Locator;
  public readonly createNewCaseFromModalButton: Locator;

  // Case view – Attachments tab + Entities accordion
  public readonly attachmentsTab: Locator;
  public readonly attachmentsContainer: Locator;
  public readonly entityAccordion: Locator;
  public readonly entityAccordionBadge: Locator;

  // New-case creation flyout (rendered by the Cases plugin)
  public readonly createCaseNameInput: Locator;
  public readonly createCaseDescriptionInput: Locator;
  public readonly createCaseSubmitButton: Locator;

  // Toast link that navigates to the newly created case
  public readonly caseToastLink: Locator;

  constructor(private readonly page: ScoutPage) {
    this.takeActionButton = page.testSubj.locator('take-action-button');
    this.addToCaseItem = page.testSubj.locator(ADD_TO_CASE_TEST_ID);
    this.createNewCaseFromModalButton = page.testSubj.locator('cases-table-add-case-filter-bar');

    this.attachmentsTab = page.testSubj.locator('case-view-tab-title-attachments');
    this.attachmentsContainer = page.testSubj.locator('case-view-attachments');
    // The unified attachment framework renders one accordion per registered type
    // that has a tab view AND a non-zero count; the accordion id is the attachment
    // type id (`security.entity`).
    this.entityAccordion = page.testSubj.locator(
      `case-view-attachment-accordion-${SECURITY_ENTITY_ATTACHMENT_TYPE}`
    );
    // Count badge on the accordion header; rendered by the cases framework from the
    // number of entity attachments on the case, independent of EA read privileges.
    this.entityAccordionBadge = page.testSubj.locator(
      `case-view-attachment-badge-${SECURITY_ENTITY_ATTACHMENT_TYPE}`
    );

    // Scope to the Cases plugin's stable `caseTitle` form row, then the single
    // `<input>` within it — avoids matching stray `data-test-subj="input"` fields
    // elsewhere on the page and survives aria-label/copy changes.
    this.createCaseNameInput = page.testSubj.locator('caseTitle').locator('input');
    // A description is required to submit the create-case form; scope to the
    // `caseDescription` markdown editor row, then its single textarea.
    this.createCaseDescriptionInput = page.testSubj.locator('caseDescription').locator('textarea');
    this.createCaseSubmitButton = page.testSubj.locator('create-case-submit');

    // Exact plugin-owned test-subj for the "View case" link in the case-created
    // success toast — avoids the brittle `*=toastLink` substring match. Each test
    // creates a single case in its own space, so only one such toast is present;
    // if two ever stacked, Playwright strict mode surfaces it rather than
    // silently clicking the wrong one.
    this.caseToastLink = page.testSubj.locator('toaster-content-case-view-link');
  }

  // Open the host entity flyout directly via URL, no alerts table required. The host
  // must already exist in the entity store (so it resolves to a canonical entity.id
  // and the case take-action items render). Mirrors the entity-flyout-anomalies
  // suite's direct-navigation approach and keeps this test free of detection-rule /
  // alert-generation dependencies.
  async navigateToHostFlyout(entityId: string, hostName: string) {
    const flyout = `(preview:!(),right:(id:host-panel,params:(contextID:host-panel,entityId:${entityId},hostName:${hostName},isPreviewMode:!f,scopeId:alerts-page)))`;
    await this.page.gotoApp('security/entity_analytics_home_page', { params: { flyout } });
    await this.takeActionButton.waitFor({ state: 'visible', timeout: 30000 });
  }

  async openTakeActionMenu() {
    await this.takeActionButton.waitFor();
    await this.takeActionButton.click();
  }

  async clickAddToNewCase() {
    await this.addToCaseItem.click();
    await this.createNewCaseFromModalButton.click();
  }

  async fillCaseName(name: string) {
    await this.createCaseNameInput.waitFor();
    await this.createCaseNameInput.fill(name);
  }

  async fillCaseDescription(description: string) {
    await this.createCaseDescriptionInput.waitFor();
    await this.createCaseDescriptionInput.fill(description);
  }

  async submitNewCase() {
    await this.createCaseSubmitButton.click();
  }

  async navigateToCase(caseId: string) {
    await this.page.gotoApp(`security/cases/${caseId}`);
    // Cold full-page navigation lands on the `case-view-loading` spinner; wait for
    // the case view's own loaded signal before returning so downstream tab clicks
    // aren't racing the case fetch. `case-view-tabs` is the tab bar the cases
    // framework renders only once the case fetch resolves, and — unlike
    // `case-view-title` — it exists in both the legacy and redesigned case views
    // (`xpack.cases.casesRedesign.details` defaults to true), so this readiness
    // wait holds regardless of the redesign flag.
    await this.page.testSubj
      .locator('case-view-tabs')
      .waitFor({ state: 'visible', timeout: 30000 });
  }

  // Case view lands on the Activity tab; the Entities accordion lives inside the
  // consolidated Attachments tab, so open that tab first.
  async openAttachmentsTab() {
    await this.attachmentsTab.waitFor();
    await this.attachmentsTab.click();
    await this.attachmentsContainer.waitFor();
  }

  async clickCaseToastLink() {
    await this.caseToastLink.click();
  }
}
