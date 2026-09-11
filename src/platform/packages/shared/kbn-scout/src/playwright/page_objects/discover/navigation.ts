/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator } from '../../../..';
import { expect } from '../..';
import {
  DiscoverAppBase,
  DISCOVER_QUERY_MODE_KEY,
  type DiscoverGotoOptions,
  type DiscoverQueryMode,
} from './base';

/**
 * Navigation, query-mode, ES|QL editor, wait helpers, and chrome app-menu actions.
 * Applied as the first mixin layer so all later mixins can call these methods via `this`.
 */
export abstract class NavigationMixin extends DiscoverAppBase {
  async goto(options: DiscoverGotoOptions) {
    await this.setQueryMode(options.queryMode);
    await this.page.gotoApp(
      'discover',
      options.savedSearchId ? { hash: `/view/${options.savedSearchId}` } : undefined
    );
    await this.waitForDiscoverPage();
  }

  protected async waitForDiscoverPage() {
    // Discover initialization in serverless CI environments regularly exceeds the default 10s,
    // likely due to additional plugin overhead and root profile resolution.
    await expect(this.page.testSubj.locator('dscPage')).toBeVisible({ timeout: 30_000 });
  }

  protected async hideTabPreview() {
    await this.page.mouse.move(0, 0);
    await this.page.testSubj.locator('unifiedTabs_tabPreview_contentPanel').waitFor({
      state: 'hidden',
    });
  }

  // Waits for a Discover tab to finish loading.
  async waitUntilTabIsLoaded() {
    await this.waitForDiscoverPage();
    await this.waitUntilSearchingHasFinished();
  }

  async waitUntilSearchingHasFinished() {
    await this.dataGrid.waitForLoad();
    await this.waitUntilHitCountHasSettled();
  }

  private async waitUntilHitCountHasSettled() {
    const loadingCounter = this.page.testSubj
      .locator('discoverQueryTotalHits')
      .and(this.page.locator('[data-fetch-status="loading"]'));

    await loadingCounter.waitFor({ state: 'hidden', timeout: 30_000 });
  }

  /**
   * Seeds the persisted query mode in localStorage on the next page load. Discover
   * ignores `currentMode` unless `defaultMode` matches the resolved default (the
   * `discover.isEsqlDefault` flag), so `defaultMode` defaults to `'classic'` to
   * match today's default. When the flag is flipped to make ES|QL the default,
   * update `defaultMode` or the seed is ignored.
   *
   * Not idempotent: each call adds an `addInitScript` that reruns on every later
   * load in order, so the last write wins. Avoid calling it more than once per
   * test unless that stacking is intentional.
   */
  public setQueryMode(currentMode: DiscoverQueryMode, defaultMode: DiscoverQueryMode = 'classic') {
    return this.page.addInitScript(
      ({ storageKey, storageValue }) => {
        window.localStorage.setItem(storageKey, storageValue);
      },
      {
        storageKey: DISCOVER_QUERY_MODE_KEY,
        storageValue: JSON.stringify({ currentMode, defaultMode }),
      }
    );
  }

  /**
   * Detects whether Discover is currently rendering ES|QL or classic
   * (KQL + data view) mode by racing the two mode-specific anchors:
   * the ES|QL editor and the classic KQL `queryInput`.
   */
  async getCurrentQueryMode(): Promise<DiscoverQueryMode> {
    const esqlEditor = this.page.testSubj.locator('ESQLEditor');
    const classicQueryInput = this.page.testSubj.locator('queryInput');

    // Wait until one of the two mode-specific anchors is rendered
    await expect(esqlEditor.or(classicQueryInput)).toBeVisible();

    // Return the mode that is currently visible
    return (await esqlEditor.isVisible()) ? 'esql' : 'classic';
  }

  async selectTextBaseLang() {
    const currentMode = await this.getCurrentQueryMode();

    if (currentMode !== 'esql') {
      await this.page.testSubj.click('select-text-based-language-btn');
    }

    await this.waitUntilSearchingHasFinished();
    await this.codeEditor.waitCodeEditorReady('ESQLEditor');
  }

  async selectClassicMode() {
    const currentMode = await this.getCurrentQueryMode();

    if (currentMode !== 'classic') {
      await this.clickAppMenuItem('select-classic-mode-btn');
    }

    await this.waitUntilSearchingHasFinished();
    const queryMode = await this.getCurrentQueryMode();
    expect(queryMode).toBe('classic');
  }

  async writeAndSubmitEsqlQuery(query: string) {
    await this.selectTextBaseLang();
    await this.codeEditor.setCodeEditorValue(query);
    await this.submitQuery();
    await this.waitUntilSearchingHasFinished();
  }

  async writeAndSubmitKqlQuery(query: string) {
    const currentMode = await this.getCurrentQueryMode();

    if (currentMode !== 'classic') {
      throw new Error(
        `writeAndSubmitKqlQuery requires Discover to be in classic mode, but the current mode is "${currentMode}".`
      );
    }

    await this.queryBar.setQuery(query);
    await this.submitQuery();
    await this.waitUntilSearchingHasFinished();
  }

  /**
   * Submits the current query (classic search bar or ES|QL editor) by clicking
   * the query submit button. Does not wait for results — pair with
   * `waitUntilSearchingHasFinished()` or `waitUntilTabIsLoaded()` as appropriate.
   */
  async submitQuery() {
    await this.hideTabPreview();
    await this.page.testSubj.click('querySubmitButton');
  }

  async getQuerySubmitButtonLabel(): Promise<string | null> {
    return this.page.testSubj.locator('querySubmitButton').getAttribute('aria-label');
  }

  async waitForDataGridRowWithRefresh(rowLocator: Locator, timeout = 30_000) {
    await this.submitQuery();
    await this.waitUntilSearchingHasFinished();
    await rowLocator.waitFor({ state: 'visible', timeout });
  }

  public get esqlMenuPopover(): Locator {
    return this.page.testSubj.locator('esql-menu-popover');
  }

  async openRecommendedQueriesPanel() {
    const menuPopover = this.esqlMenuPopover;
    if (!(await menuPopover.isVisible())) {
      await this.page.testSubj.click('esql-help-popover-button');
    }

    await menuPopover.waitFor({ state: 'visible' });

    const recommendedQueriesButton = this.page.testSubj.locator('esql-recommended-queries');
    await expect(recommendedQueriesButton).toBeVisible();
    await recommendedQueriesButton.click();
    await this.page.testSubj.locator('contextMenuPanelTitleButton').waitFor({ state: 'visible' });
  }

  async runRecommendedEsqlQuery(queryLabel: string) {
    await this.openRecommendedQueriesPanel();

    const queryOption = this.esqlMenuPopover.getByRole('menuitem', {
      exact: true,
      name: queryLabel,
    });

    await expect(queryOption).toBeVisible();
    await queryOption.click();
    await this.waitUntilSearchingHasFinished();
  }

  async getEsqlQueryValue(nthIndex: number = 0): Promise<string> {
    return this.codeEditor.getCodeEditorValue(nthIndex);
  }

  async openEsqlQuickReferenceFlyout() {
    await this.page.testSubj.click('esql-help-popover-button');
    await this.esqlMenuPopover.waitFor({ state: 'visible' });
    await this.page.testSubj.click('esql-quick-reference');
    await this.getEsqlQuickReferenceFlyout().waitFor({ state: 'visible' });
  }

  getEsqlQuickReferenceFlyout(): Locator {
    return this.page.testSubj.locator('esqlInlineDocumentationFlyout');
  }

  async isEsqlHistoryPanelOpen(): Promise<boolean> {
    return this.page.testSubj
      .locator('ESQLEditor-history-container')
      .waitFor({ state: 'visible', timeout: 1_000 })
      .then(() => true)
      .catch(() => false);
  }

  async toggleEsqlHistoryPanel() {
    const wasOpen = await this.isEsqlHistoryPanelOpen();
    await this.page.testSubj.locator('ESQLEditor-toggle-query-history-icon').click();
    await this.page.testSubj
      .locator('ESQLEditor-history-container')
      .waitFor({ state: wasOpen ? 'hidden' : 'visible' });
  }

  /**
   * Runs the given query from the open ES|QL history panel. The row's run button
   * both loads the query into the editor and submits it. Matches the row by query
   * text rather than index, so callers don't depend on history ordering.
   */
  async runEsqlHistoryQuery(query: string) {
    const row = this.page.testSubj
      .locator('ESQLEditor-queryHistory')
      .locator('tr')
      .filter({
        // Match the whole text of the query cell rather than `hasText` on the
        // row: that is a case-insensitive substring match over the timestamp and
        // action buttons too, so one query would also match a row whose query
        // merely contains it.
        has: this.page.testSubj.locator('queryString').getByText(query, { exact: true }),
      });
    await row.locator('[data-test-subj="ESQLEditor-history-starred-queries-run-button"]').click();
    await this.waitUntilSearchingHasFinished();
  }

  async getEsqlEditorHeight(): Promise<number> {
    const editor = this.page.testSubj.locator('ESQLEditor');
    await editor.waitFor({ state: 'visible' });
    const box = await editor.boundingBox();
    if (!box) {
      throw new Error('Unable to measure ES|QL editor height');
    }
    return Math.round(box.height);
  }

  async resizeEsqlEditorBy(distance: number) {
    const resizeButton = this.page.testSubj.locator('ESQLEditor-resize');
    await resizeButton.waitFor({ state: 'visible' });
    const box = await resizeButton.boundingBox();
    if (!box) {
      throw new Error('Unable to find ES|QL editor resize handle');
    }
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX, startY + distance, { steps: 10 });
    await this.page.mouse.up();
  }

  async clickAppMenuItem(
    testId: string,
    { isInOverflowMenu }: { isInOverflowMenu?: boolean } = {}
  ) {
    const item = this.page.testSubj.locator(testId);
    if (!isInOverflowMenu && (await item.isVisible())) {
      await item.click();
      return;
    }
    const overflowButton = this.page.testSubj.locator('app-menu-overflow-button');
    const popover = this.page.testSubj.locator('app-menu-popover');

    // Dismiss any stale popovers
    if (await popover.isVisible()) {
      await overflowButton.click();
      await expect(popover).toBeHidden();
    }

    await expect(overflowButton).toBeVisible();
    await overflowButton.click();

    // If the click was consumed by closing a stale overlay, the popover won't be open.
    // Click the overflow button again if needed.
    const popoverOpened = await popover
      .waitFor({ state: 'visible', timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (!popoverOpened) {
      await overflowButton.click();
    }

    await expect(popover).toBeVisible();
    const menuItem = this.page.testSubj.locator(testId);
    await expect(menuItem).toBeVisible();
    await menuItem.click();
  }

  private async dismissHoverOverlays() {
    await this.page.mouse.move(0, 0);
  }

  /** Opens the search-threshold rule flyout from Alerts (v1 button or v2 legacy option). */
  async openSearchThresholdRuleFlyout() {
    await this.clickAppMenuItem('discoverAlertsButton');
    const ruleOption = this.page.testSubj
      .locator('discoverLegacySearchThresholdRule')
      .or(this.page.testSubj.locator('discoverCreateAlertButton'));
    await expect(ruleOption).toBeVisible();
    await ruleOption.click();
    await expect(this.page.testSubj.locator('addRuleFlyoutTitle')).toBeVisible();
  }

  async clickNewSearch({ isInOverflowMenu }: { isInOverflowMenu?: boolean } = {}) {
    await this.clickAppMenuItem('discoverNewButton', { isInOverflowMenu });
    await this.dismissHoverOverlays();
    await this.waitUntilTabIsLoaded();
  }

  /** Opens a linked panel's inline Dashboard edit session in the full Discover editor. */
  async openInlineEditorInDiscover() {
    await this.page.testSubj.click('discoverEmbeddableInlineEditEditInDiscoverLink');
    await this.waitUntilTabIsLoaded();
  }

  getCurrentQueryNameLocator(): Locator {
    // Project (chrome-next) shows the saved search name in the app header; classic chrome shows it
    // as the last breadcrumb. `.or()` keeps this layout-agnostic without a runtime gate.
    return this.page.testSubj
      .locator('appHeaderTitle')
      .or(this.page.testSubj.locator('breadcrumb last'));
  }

  async getCurrentQueryName(): Promise<string> {
    return await this.getCurrentQueryNameLocator().innerText();
  }
}
