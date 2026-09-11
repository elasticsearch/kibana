/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator, ScoutPage } from '@kbn/scout';

/**
 * App menu item that opens the background search flyout. Exported so Discover specs can drive
 * it through `pageObjects.discover.clickAppMenuItem()`, which handles the item being collapsed
 * into the app menu overflow popover — which is where Discover puts it in both classic and
 * ES|QL mode.
 */
export const BACKGROUND_SEARCH_FLYOUT_ENTRYPOINT = 'openBackgroundSearchFlyoutButton';

const FLYOUT_CLOSE_BUTTON = 'euiFlyoutCloseButton';
// Where the entrypoint hides when the app menu is too narrow to show it outright.
const APP_MENU_OVERFLOW_BUTTON = 'app-menu-overflow-button';
const ROW_RESTORE_LINK = 'sessionManagementNameLink';
const SUBMIT_BUTTON = 'querySubmitButton';
const CANCEL_BUTTON = 'queryCancelButton';
// While a search is in flight the split button switches from `querySubmitButton-*` to
// `queryCancelButton-*`, and only then does it offer "Send to background".
const SEND_TO_BACKGROUND_FROM_CANCEL = 'queryCancelButton-secondary-button';
const SEND_TO_BACKGROUND_FROM_SUBMIT = 'querySubmitButton-secondary-button';
const MANAGEMENT_TABLE = 'searchSessionsMgmtUiTable';
const SAVED_TOAST_LINK = 'backgroundSearchToastLink';
const COMPLETED_TOAST_LINK = 'backgroundSearchCompletedToastLink';

/**
 * Toast copy that indicates a background search failed, timed out, or is still running.
 */
const ERROR_OR_WARNING_PATTERN =
  /Your background search is still running|Timed out|Search Error|Cannot retrieve search results|Unable to connect to the Kibana server|Failed to edit name of the background search|Failed to fetch background search info/;

export interface SendToBackgroundOptions {
  /**
   * Read the secondary button from the submit-state split button instead of the cancel-state
   * one. Only applicable when the search bar is not in a loading/cancel state.
   */
  isSubmitButton?: boolean;
  /**
   * Skip the initial submit-button click and wait-for-cancel-button step. Use this when the
   * search is already in flight before `sendToBackground` is called (e.g., the dashboard is
   * still loading when navigation arrives), so the submit button is hidden by the cancel button.
   */
  alreadyInFlight?: boolean;
}

/**
 * Page object for the in-app background search controls: the "Send to background" secondary
 * submit button, the background search flyout, and the save/completion toasts. These render
 * inside Discover and Dashboard.
 *
 * The standalone management application at /app/management/kibana/search_sessions is covered
 * by `BackgroundSearchManagementPage` instead.
 */
export class BackgroundSearchPage {
  public readonly managementTable: Locator;
  public readonly flyoutEntrypoint: Locator;
  public readonly completedToastLink: Locator;
  private readonly savedToastLink: Locator;

  constructor(private readonly page: ScoutPage) {
    this.managementTable = this.page.testSubj.locator(MANAGEMENT_TABLE);
    this.flyoutEntrypoint = this.page.testSubj.locator(BACKGROUND_SEARCH_FLYOUT_ENTRYPOINT);
    this.completedToastLink = this.page.testSubj.locator(COMPLETED_TOAST_LINK);
    this.savedToastLink = this.page.testSubj.locator(SAVED_TOAST_LINK);
  }

  /**
   * Toasts reporting that a background search failed, timed out, or is still running. Exposed
   * as a locator so specs assert on it with a retrying, web-first assertion rather than a
   * point-in-time boolean.
   */
  public get errorOrWarningToasts(): Locator {
    return this.page.components.toast().toasts.filter({ hasText: ERROR_OR_WARNING_PATTERN });
  }

  /**
   * Send the in-flight search to the background, then wait for the confirmation toast.
   *
   * By default (no options), re-submits the query first: waits for the submit button, clicks it,
   * waits for the cancel button to appear (confirming a search is in flight), then clicks the
   * "Send to background" secondary action.
   *
   * Pass `alreadyInFlight: true` when the search is already in flight before this method is
   * called (e.g., the dashboard is still loading on arrival). In that case the submit button is
   * hidden by the cancel button, so we skip straight to the secondary action.
   */
  async sendToBackground({
    isSubmitButton = false,
    alreadyInFlight = false,
  }: SendToBackgroundOptions = {}) {
    if (alreadyInFlight) {
      // The search is already in flight; the cancel button is shown in place of the submit button.
      // Wait for it and click the "Send to background" secondary action directly.
      await this.page.testSubj
        .locator(CANCEL_BUTTON)
        .waitFor({ state: 'visible', timeout: 30_000 });
      await this.page.testSubj.locator(SEND_TO_BACKGROUND_FROM_CANCEL).click();
    } else {
      const submitButton = this.page.testSubj.locator(SUBMIT_BUTTON);
      // While a search is in flight the submit button is swapped for the cancel button, so wait
      // for it to come back before clicking. Raised above the default because a preceding search
      // is subject to the 5s stalling filter these specs use.
      await submitButton.waitFor({ state: 'visible', timeout: 30_000 });
      await submitButton.click();

      // Confirm the search is actually in flight before reaching for the secondary action.
      // Without this, a query that returns instantly makes the next click race a DOM swap and
      // fail with a confusing "element is not enabled / was detached" error.
      if (!isSubmitButton) {
        await this.page.testSubj.locator(CANCEL_BUTTON).waitFor({ state: 'visible' });
      }

      await this.page.testSubj
        .locator(isSubmitButton ? SEND_TO_BACKGROUND_FROM_SUBMIT : SEND_TO_BACKGROUND_FROM_CANCEL)
        .click();
    }
    await this.savedToastLink.waitFor({ state: 'visible', timeout: 30_000 });
  }

  /** Wait for the flyout's background search table to render. */
  async waitForFlyout() {
    await this.managementTable.waitFor({ state: 'visible' });
  }

  async closeFlyout() {
    await this.page.testSubj.locator(FLYOUT_CLOSE_BUTTON).click();
    await this.managementTable.waitFor({ state: 'hidden' });
  }

  /**
   * Open the flyout from the app menu. Apps that cannot fit the entrypoint in the menu collapse
   * it into the overflow popover, so both placements are handled.
   */
  async openFlyout() {
    if (!(await this.flyoutEntrypoint.isVisible())) {
      await this.page.testSubj.click(APP_MENU_OVERFLOW_BUTTON);
    }
    await this.flyoutEntrypoint.click();
    await this.waitForFlyout();
  }

  /**
   * Restore the background search listed in the open flyout.
   *
   * Only call this once the search has completed: the flyout renders the management table with
   * `hideRefreshButton` and auto-refresh is off by default, so it shows whatever the status was
   * when it mounted and restoring a still-running search warns instead of restoring.
   */
  async restoreFromFlyout() {
    await this.managementTable.getByTestId(ROW_RESTORE_LINK).click();
  }

  /**
   * Wait for the background search to finish, without acting on it. The wait is raised above the
   * default because the toast only appears once Elasticsearch has finished the async search
   * behind the delays these specs use.
   */
  async waitForCompletion() {
    await this.completedToastLink.waitFor({ state: 'visible', timeout: 30_000 });
  }

  /** Restore the completed background search via the link in the completion toast. */
  async openCompletedSearchFromToast() {
    await this.waitForCompletion();
    await this.completedToastLink.click();
  }
}
