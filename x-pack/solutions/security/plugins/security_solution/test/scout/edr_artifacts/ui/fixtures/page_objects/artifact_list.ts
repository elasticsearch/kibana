/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator, ScoutPage } from '@kbn/scout-security';

/** Cold Security `gotoApp` after a custom-role login can exceed Playwright's 10s default. */
const LIST_PAGE_READY_TIMEOUT_MS = 20_000;

export class ArtifactListPage {
  readonly noPrivilegesPage: Locator;
  readonly emptyPageFeatureAction: Locator;

  constructor(private readonly page: ScoutPage) {
    this.noPrivilegesPage = this.page.testSubj.locator('noPrivilegesPage');
    this.emptyPageFeatureAction = this.page.testSubj.locator('empty-page-feature-action');
  }

  container(pagePrefix: string): Locator {
    return this.page.testSubj.locator(`${pagePrefix}-container`);
  }

  emptyState(pagePrefix: string): Locator {
    return this.page.testSubj.locator(`${pagePrefix}-emptyState`);
  }

  emptyStateAddButton(pagePrefix: string): Locator {
    return this.page.testSubj.locator(`${pagePrefix}-emptyState-addButton`);
  }

  pageAddButton(pagePrefix: string): Locator {
    return this.page.testSubj.locator(`${pagePrefix}-pageAddButton`);
  }

  card(pagePrefix: string): Locator {
    return this.page.testSubj.locator(`${pagePrefix}-card`);
  }

  cardTitle(pagePrefix: string): Locator {
    return this.page.testSubj.locator(`${pagePrefix}-card-header-title`);
  }

  cardDescription(pagePrefix: string): Locator {
    return this.page.testSubj.locator(`${pagePrefix}-card-description`);
  }

  cardActionsButton(pagePrefix: string): Locator {
    return this.page.testSubj.locator(`${pagePrefix}-card-header-actions-button`);
  }

  cardEditAction(pagePrefix: string): Locator {
    return this.page.testSubj.locator(`${pagePrefix}-card-cardEditAction`);
  }

  cardDeleteAction(pagePrefix: string): Locator {
    return this.page.testSubj.locator(`${pagePrefix}-card-cardDeleteAction`);
  }

  flyoutSubmit(pagePrefix: string): Locator {
    return this.page.testSubj.locator(`${pagePrefix}-flyout-submitButton`);
  }

  deleteModalSubmit(pagePrefix: string): Locator {
    return this.page.testSubj.locator(`${pagePrefix}-deleteModal-submitButton`);
  }

  criteria(selector: string): Locator {
    return this.page.testSubj.locator(selector);
  }

  async goto(urlPath: string) {
    await this.page.gotoApp(`security/administration/${urlPath}`);
  }

  async waitForNoPrivileges() {
    await this.noPrivilegesPage.waitFor({
      state: 'visible',
      timeout: LIST_PAGE_READY_TIMEOUT_MS,
    });
  }

  async waitForEmpty(pagePrefix: string) {
    await this.emptyState(pagePrefix).waitFor({
      state: 'visible',
      timeout: LIST_PAGE_READY_TIMEOUT_MS,
    });
  }

  async waitForList(pagePrefix: string) {
    await this.container(pagePrefix).waitFor({
      state: 'visible',
      timeout: LIST_PAGE_READY_TIMEOUT_MS,
    });
  }

  async openCreateFromEmpty(pagePrefix: string) {
    await this.emptyStateAddButton(pagePrefix).click();
    await this.flyoutSubmit(pagePrefix).waitFor({ state: 'visible' });
  }

  async openEdit(pagePrefix: string) {
    await this.cardActionsButton(pagePrefix).click();
    await this.cardEditAction(pagePrefix).click();
    await this.flyoutSubmit(pagePrefix).waitFor({ state: 'visible' });
  }

  async fillTextField(testSubj: string, value: string) {
    await this.page.testSubj.locator(testSubj).fill(value);
  }

  async submitFlyout(pagePrefix: string) {
    await this.flyoutSubmit(pagePrefix).click();
  }

  async deleteArtifact(pagePrefix: string) {
    await this.cardActionsButton(pagePrefix).click();
    await this.cardDeleteAction(pagePrefix).click();
    await this.deleteModalSubmit(pagePrefix).click();
  }
}
