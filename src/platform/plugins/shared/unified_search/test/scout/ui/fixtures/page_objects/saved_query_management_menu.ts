/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator, ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

export interface SaveQueryOptions {
  includeFilters?: boolean;
  includeTimeFilter?: boolean;
}

/**
 * Page object for the saved query menu attached to the global query bar
 * (`<SavedQueryManagementComponent>` in `unified_search`). Exposes the
 * popover's save / load / update / delete affordances.
 *
 * Methods return state booleans; specs own the assertions so the same page
 * object works for "should be visible" and "should be hidden" scenarios.
 */
export class SavedQueryManagementMenu {
  public readonly menuButton: Locator;
  public readonly saveButton: Locator;
  public readonly loadButton: Locator;

  private readonly panel: Locator;
  private readonly saveChangesButton: Locator;
  private readonly applyChangesButton: Locator;
  private readonly clearAllFiltersButton: Locator;
  private readonly backToMainPanel: Locator;

  constructor(private readonly page: ScoutPage) {
    this.menuButton = this.page.testSubj.locator('showQueryBarMenu');
    this.saveButton = this.page.testSubj.locator('saved-query-management-save-button');
    this.loadButton = this.page.testSubj.locator('saved-query-management-load-button');
    this.panel = this.page.testSubj.locator('queryBarMenuPanel');
    this.saveChangesButton = this.page.testSubj.locator(
      'saved-query-management-save-changes-button'
    );
    this.applyChangesButton = this.page.testSubj.locator(
      'saved-query-management-apply-changes-button'
    );
    this.clearAllFiltersButton = this.page.testSubj.locator('filter-sets-removeAllFilters');
    // EuiContextMenuPanel renders this back-arrow on every non-root panel.
    this.backToMainPanel = this.page.testSubj.locator('contextMenuPanelTitleButton');
  }

  /**
   * Reads the popover open/closed state from `aria-expanded` on the trigger
   * button rather than checking the panel itself. The button is always in the
   * DOM, while the panel detaches on close — which races with `close()` after
   * a menu item (e.g. "Clear all", "Apply changes") auto-dismisses the popover.
   */
  private async isOpen(): Promise<boolean> {
    return (await this.menuButton.getAttribute('aria-expanded')) === 'true';
  }

  /**
   * Lower-level open: clicks the trigger and waits for `aria-expanded`, without
   * assuming any specific panel content is rendered. Use this when inspecting
   * capability-gated affordances that may be absent (e.g. the saved-query
   * section when `savedQueryManagement.showQueries` is false). For any
   * interaction that targets the root panel, call `open()` instead.
   */
  private async openPopover(): Promise<void> {
    if (await this.isOpen()) return;
    await this.menuButton.click();
    await expect(this.menuButton).toHaveAttribute('aria-expanded', 'true');
    // EUI popover animation has no deterministic settled event; inner-panel clicks
    // race the panel slide. Two-part mitigation: this fixed wait, plus
    // `dispatchEvent('click')` (instead of `.click()`) on inner-panel buttons in the
    // action methods below — it bypasses Playwright actionability checks that flicker
    // while the panel transform is in flight.
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await this.page.waitForTimeout(1000);
  }

  /**
   * Opens the popover and guarantees we land on the root context-menu panel.
   *
   * EuiPopover un-mounts the panel DOM on close, but EuiContextMenu's panel-id
   * state persists across hide/show. Without `ensureOnMainPanel()`, calls that
   * follow a Load-submenu interaction would re-open into the submenu where
   * `loadButton` / `clearAllFiltersButton` don't exist and the click times out.
   */
  async open(): Promise<void> {
    await this.openPopover();
    await this.ensureOnMainPanel();
  }

  async close(): Promise<void> {
    if (!(await this.isOpen())) return;
    await this.menuButton.click();
    await expect(this.menuButton).toHaveAttribute('aria-expanded', 'false');
  }

  /**
   * Walks the popover back to the root panel. Prefers the EUI back-arrow over
   * a full remount; waiting for the arrow to hide is a deterministic
   * "panel-slide finished" signal that avoids racing the CSS transform.
   */
  private async ensureOnMainPanel(): Promise<void> {
    if (await this.loadButton.isVisible()) return;

    if (await this.backToMainPanel.isVisible()) {
      await this.backToMainPanel.click();
      await this.backToMainPanel.waitFor({ state: 'hidden' });
      await expect(this.loadButton).toBeVisible();
      return;
    }

    // Last resort (e.g. inside the save form): hard-remount resets EuiContextMenu to root.
    await this.close();
    await this.menuButton.click();
    await expect(this.menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(this.loadButton).toBeVisible();
  }

  async saveNewQuery(name: string, options: SaveQueryOptions = {}): Promise<void> {
    await this.open();
    // dispatchEvent instead of click — see openPopover for the EUI panel-slide rationale.
    await this.saveButton.dispatchEvent('click');
    await this.page.testSubj.locator('saveQueryForm').waitFor({ state: 'visible' });
    await this.submitSaveQueryForm(name, options);
  }

  /**
   * Saves the currently loaded query as a new copy. Requires the live query to
   * differ from the loaded one — the popover's "Save query" item is otherwise
   * disabled and the click will time out.
   */
  async saveLoadedQueryAsNew(name: string, options: SaveQueryOptions = {}): Promise<void> {
    await this.saveNewQuery(name, options);
  }

  async updateLoadedQuery(options: SaveQueryOptions = {}): Promise<void> {
    await this.open();
    await this.saveChangesButton.dispatchEvent('click');
    await this.page.testSubj.locator('saveQueryForm').waitFor({ state: 'visible' });
    await this.submitSaveQueryForm(null, options);
  }

  async loadSavedQuery(title: string): Promise<void> {
    await this.openLoadSubmenu();
    await this.page.testSubj.locator(`~load-saved-query-${title}-button`).dispatchEvent('click');
    await this.applyChangesButton.click();
    await this.panel.waitFor({ state: 'hidden' });
  }

  async deleteSavedQuery(title: string): Promise<void> {
    await this.openLoadSubmenu();
    await this.page.testSubj.locator(`~load-saved-query-${title}-button`).dispatchEvent('click');
    await this.page.testSubj.locator('delete-saved-query-button').dispatchEvent('click');
    await this.page.testSubj.locator('confirmModalTitleText').waitFor({ state: 'visible' });
    await this.page.testSubj.locator('confirmModalConfirmButton').click();
  }

  async clearLoadedQuery(): Promise<void> {
    await this.open();
    await this.clearAllFiltersButton.dispatchEvent('click');
    await this.close();
  }

  /**
   * Opens the popover and navigates to the Load submenu.
   *
   * Always force-closes first so EuiPopover remounts on open: an already-open
   * popover serves a stale saved-query list after a save/update/delete.
   */
  private async openLoadSubmenu(): Promise<void> {
    await this.close();
    await this.open();
    await this.loadButton.dispatchEvent('click');
    await this.applyChangesButton.waitFor({ state: 'visible' });
  }

  // ---- state ----

  async hasSavedQuery(title: string): Promise<boolean> {
    await this.openLoadSubmenu();
    const exists = await this.waitForVisible(
      this.page.testSubj.locator(`~load-saved-query-${title}-button`),
      2000
    );
    await this.close();
    return exists;
  }

  async isLoadButtonVisible(): Promise<boolean> {
    await this.open();
    const visible = await this.loadButton.isVisible();
    await this.close();
    return visible;
  }

  async isSaveButtonEnabled(): Promise<boolean> {
    await this.open();
    const enabled = await this.saveButton.isEnabled();
    await this.close();
    return enabled;
  }

  async isSaveChangesButtonVisible(): Promise<boolean> {
    await this.open();
    const visible = await this.saveChangesButton.isVisible();
    await this.close();
    return visible;
  }

  /**
   * Returns the rendered state of the saved-query affordances without
   * assuming they exist. Designed for capability-matrix specs that need to
   * verify the section is hidden for users without
   * `savedQueryManagement.showQueries`. Unlike `isLoadButtonVisible` /
   * `isSaveButtonEnabled`, this skips `ensureOnMainPanel()` so the call does
   * not time out when the main panel has no saved-query items at all.
   */
  async inspectSavedQueryAffordances(): Promise<{
    loadVisible: boolean;
    saveVisible: boolean;
    saveEnabled: boolean;
  }> {
    await this.openPopover();
    const loadVisible = await this.loadButton.isVisible();
    const saveVisible = await this.saveButton.isVisible();
    const saveEnabled = saveVisible && (await this.saveButton.isEnabled());
    await this.close();
    return { loadVisible, saveVisible, saveEnabled };
  }

  /**
   * Returns whether the per-row "delete" button is rendered for the given
   * saved query while the load list is open. Used to validate that read-only
   * users cannot delete other users' queries.
   */
  async isDeleteVisibleForQuery(title: string): Promise<boolean> {
    await this.openLoadSubmenu();
    await this.page.testSubj.locator(`~load-saved-query-${title}-button`).dispatchEvent('click');
    const visible = await this.waitForVisible(
      this.page.testSubj.locator('delete-saved-query-button'),
      2000
    );
    await this.close();
    return visible;
  }

  /** Waits up to `timeoutMs` for the element to appear; returns `false` on timeout. */
  private waitForVisible(locator: Locator, timeoutMs: number): Promise<boolean> {
    return locator
      .waitFor({ state: 'visible', timeout: timeoutMs })
      .then(() => true)
      .catch(() => false);
  }

  private async submitSaveQueryForm(
    title: string | null,
    { includeFilters = true, includeTimeFilter = false }: SaveQueryOptions
  ): Promise<void> {
    if (title) {
      await this.page.testSubj.locator('saveQueryFormTitle').fill(title);
    }
    await this.toggleSwitchTo('saveQueryFormIncludeFiltersOption', includeFilters);
    await this.toggleSwitchTo('saveQueryFormIncludeTimeFilterOption', includeTimeFilter);
    await this.page.testSubj.locator('savedQueryFormSaveButton').click();
    await this.page.testSubj.locator('saveQueryForm').waitFor({ state: 'hidden' });
  }

  private async toggleSwitchTo(testSubj: string, desired: boolean): Promise<void> {
    const el = this.page.testSubj.locator(testSubj);
    if ((await el.isChecked()) !== desired) {
      await el.click();
    }
  }
}
