/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator } from '../../..';
import type { ScoutPage } from '..';
import { expect } from '..';

/**
 * Test-subject prefixes used by the Unified Tabs component.
 */
export const UNIFIED_TABS_TEST_SUBJ = {
  selectTabBtnPrefix: 'unifiedTabs_selectTabBtn_',
  closeTabBtnPrefix: 'unifiedTabs_closeTabBtn_',
  tabMenuBtnPrefix: 'unifiedTabs_tabMenuBtn_',
  editTabLabelInputPrefix: 'unifiedTabs_editTabLabelInput_',
  newTabBtn: 'unifiedTabs_tabsBar_newTabBtn',
  tabsBar: 'unifiedTabs_tabsBar',
  tabsBarMenuButton: 'unifiedTabs_tabsBarMenuButton',
  tabsBarMenuPanel: 'unifiedTabs_tabsBarMenuPanel',
  duplicateMenuItem: 'unifiedTabs_tabMenuItem_duplicate',
  inspectMenuItem: 'unifiedTabs_tabMenuItem_inspect',
  clearRecentlyClosed: 'unifiedTabs_tabsMenu_clearRecentlyClosed',
  restoreAllRecentlyClosedTabs: 'unifiedTabs_tabsMenu_restoreAllTabs',
  tabPreviewOuterPanelPrefix: 'unifiedTabs_tabPreview_outerPanel_',
  tabPreviewContentPanel: 'unifiedTabs_tabPreview_contentPanel',
  tabPreviewTitlePrefix: 'unifiedTabs_tabPreview_title_',
  tabPreviewQueryPrefix: 'unifiedTabs_tabPreviewCodeBlock_',
  tabPreviewLabelPrefix: 'unifiedTabs_tabPreview_label_',
  recentlyClosedTabPrefix: 'unifiedTabs_tabsMenu_recentlyClosedTab_',
  recentlyClosedGroupPrefix: 'unifiedTabs_tabsMenu_recentlyClosedGroup_',
  recentlyClosedGroupTabPrefix: 'unifiedTabs_tabsMenu_recentlyClosedGroupTab_',
} as const;

export interface TabPreviewContent {
  title: string;
  query: string;
  label: string;
}

export class UnifiedTabs {
  constructor(private readonly page: ScoutPage) {}

  /** Locator for the unified-tabs tab bar. */
  private getTabsBar(): Locator {
    return this.page.testSubj.locator(UNIFIED_TABS_TEST_SUBJ.tabsBar);
  }

  /** Locator matching every tab button in the unified tab bar. */
  getTabs(): Locator {
    return this.getTabsBar().locator(
      `[data-test-subj^="${UNIFIED_TABS_TEST_SUBJ.selectTabBtnPrefix}"]`
    );
  }

  async isTabsBarVisible(): Promise<boolean> {
    return this.getTabsBar()
      .waitFor({ state: 'visible', timeout: 1_000 })
      .then(() => true)
      .catch(() => false);
  }

  private async getTabWrapper(index: number): Promise<Locator> {
    const tabWrappers = await this.page.locator('[data-test-subj^="unifiedTabs_tab_"]').all();

    if (index < 0 || index >= tabWrappers.length) {
      throw new Error(`Tab index ${index} is out of bounds (found ${tabWrappers.length} tabs)`);
    }

    return tabWrappers[index];
  }

  async getTabUnsavedIndicator(index: number): Promise<Locator> {
    const tab = await this.getTabWrapper(index);
    return tab.locator('[data-test-subj^="unifiedTabs__tabChangesIndicator-"]');
  }

  private async getTab(index: number): Promise<Locator> {
    const tabs = await this.getTabs().all();

    if (index < 0 || index >= tabs.length) {
      throw new Error(`Tab index ${index} is out of bounds (found ${tabs.length} tabs)`);
    }

    return tabs[index];
  }

  /**
   * Locator for the currently selected tab in the unified tabs bar.
   */
  private get activeTabLocator(): Locator {
    return this.getTabs().and(this.page.locator('[aria-selected="true"]'));
  }

  /** Currently selected tab button. */
  getActiveTab(): Locator {
    return this.activeTabLocator;
  }

  /**
   * Navigates to a tab by its visible label text and waits for it to become active.
   */
  async navigateToTabByName(name: string) {
    const tab = this.getTabsBar().getByRole('tab', { name });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }

  async getTabLabels(): Promise<string[]> {
    return this.getTabs().evaluateAll((tabs) =>
      tabs.map((tab) => (tab as HTMLElement).innerText.trim())
    );
  }

  async getSelectedTabLabel(): Promise<string> {
    await this.activeTabLocator.waitFor({ state: 'visible' });
    return (await this.activeTabLocator.innerText()).trim();
  }

  /**
   * Dismisses the hover tab-preview panel. The preview is a portal that overlays
   * the area below the tab bar (e.g. the data-view switcher) and intercepts
   * pointer events, so a following click can fail with the preview "subtree
   * intercepts pointer events".
   */
  async hideTabPreview() {
    await this.page.mouse.move(0, 0);
    await this.page.testSubj
      .locator(UNIFIED_TABS_TEST_SUBJ.tabPreviewContentPanel)
      .waitFor({ state: 'hidden' });
  }

  async openTabPreview(index: number) {
    const tab = await this.getTab(index);
    await this.hideTabPreview();
    await tab.hover();
    await this.page.testSubj
      .locator(UNIFIED_TABS_TEST_SUBJ.tabPreviewContentPanel)
      .waitFor({ state: 'visible' });
  }

  private getVisibleTabPreviewPanel(): Locator {
    return this.page
      .locator(`[data-test-subj^="${UNIFIED_TABS_TEST_SUBJ.tabPreviewOuterPanelPrefix}"]`)
      .filter({ has: this.page.testSubj.locator(UNIFIED_TABS_TEST_SUBJ.tabPreviewContentPanel) });
  }

  private async getVisibleTabPreviewText(testSubjectPrefix: string): Promise<string> {
    const elements = this.getVisibleTabPreviewPanel().locator(
      `[data-test-subj^="${testSubjectPrefix}"]`
    );
    const elementCount = await elements.count();

    if (elementCount > 1) {
      throw new Error(`Expected at most one tab preview element for ${testSubjectPrefix}`);
    }

    if (elementCount === 0) {
      return '';
    }

    return (await elements.innerText()).trim();
  }

  async getTabPreviewContent(index: number): Promise<TabPreviewContent> {
    await this.openTabPreview(index);

    return {
      title: await this.getVisibleTabPreviewText(UNIFIED_TABS_TEST_SUBJ.tabPreviewTitlePrefix),
      query: await this.getVisibleTabPreviewText(UNIFIED_TABS_TEST_SUBJ.tabPreviewQueryPrefix),
      label: await this.getVisibleTabPreviewText(UNIFIED_TABS_TEST_SUBJ.tabPreviewLabelPrefix),
    };
  }

  /**
   * Switches to the tab at the given 0-based index and waits for it to become active.
   * Does NOT wait for content to load — consumers should call their own
   * content-loading waiter after this if needed.
   */
  async selectTab(index: number) {
    const tab = await this.getTab(index);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }

  async editTabLabel(index: number, newLabel: string) {
    const tab = await this.getTab(index);
    await tab.dblclick();

    const input = this.page.locator(
      `[data-test-subj^="${UNIFIED_TABS_TEST_SUBJ.editTabLabelInputPrefix}"]`
    );
    await input.waitFor({ state: 'visible' });
    await input.fill(newLabel);
    await input.press('Enter');
    await tab.getByText(newLabel, { exact: true }).waitFor({ state: 'visible' });
  }

  /**
   * Clicks the "New tab" button without waiting for the new tab to settle.
   * Prefer `createNewTab()` for the common case; use this only when a test
   * intentionally opens several tabs in quick succession (rapid-open race).
   */
  async clickNewTabButton() {
    await this.page.testSubj.click(UNIFIED_TABS_TEST_SUBJ.newTabBtn);
  }

  /**
   * Clicks the "New tab" button and waits for the newly created tab to become
   * the active one. Discover new tabs stay uninitialized (no auto-fetch); use
   * `discover.createNewTabAndSearch()` when the test needs results, the sidebar,
   * histogram, or DocViewer or perform a search manually after createNewTab().
   */
  async createNewTab() {
    await this.clickNewTabButton();
    await this.activeTabLocator.waitFor({ state: 'visible' });
    await this.hideTabPreview();
  }

  private async openTabsBarMenu() {
    await this.page.testSubj.click(UNIFIED_TABS_TEST_SUBJ.tabsBarMenuButton);
    await this.page.testSubj
      .locator(UNIFIED_TABS_TEST_SUBJ.tabsBarMenuPanel)
      .waitFor({ state: 'visible' });
  }

  private async closeTabsBarMenu() {
    // Press Escape on the panel itself so focus is inside the popover's focus
    // trap (which owns the Escape-to-close handler) when the key fires. A bare
    // page-level keypress misses when focus has drifted off the panel.
    const panel = this.page.testSubj.locator(UNIFIED_TABS_TEST_SUBJ.tabsBarMenuPanel);
    await panel.press('Escape');
    await panel.waitFor({ state: 'hidden' });
  }

  private getRecentlyClosedTabs(): Locator {
    return this.page.locator(
      `[data-test-subj^="${UNIFIED_TABS_TEST_SUBJ.recentlyClosedTabPrefix}"]`
    );
  }

  private getRecentlyClosedGroups(): Locator {
    return this.page.locator(
      `[data-test-subj^="${UNIFIED_TABS_TEST_SUBJ.recentlyClosedGroupPrefix}"]`
    );
  }

  private getRecentlyClosedGroupTabs(): Locator {
    return this.page.locator(
      `[data-test-subj^="${UNIFIED_TABS_TEST_SUBJ.recentlyClosedGroupTabPrefix}"]`
    );
  }

  private getRecentlyClosedRootItems(): Locator {
    return this.page.locator(
      `[data-test-subj^="${UNIFIED_TABS_TEST_SUBJ.recentlyClosedGroupPrefix}"], [data-test-subj^="${UNIFIED_TABS_TEST_SUBJ.recentlyClosedTabPrefix}"]`
    );
  }

  private async getRecentlyClosedItemTitles(items: Locator): Promise<string[]> {
    const texts = await items.evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).innerText.trim())
    );

    return texts.map((text) => text.split('\n')[0]);
  }

  private async getRecentlyClosedItemTexts(items: Locator): Promise<string[]> {
    return items.evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).innerText.trim())
    );
  }

  async getRecentlyClosedTabLabels(): Promise<string[]> {
    await this.openTabsBarMenu();
    const labels = await this.getRecentlyClosedItemTitles(this.getRecentlyClosedTabs());
    await this.closeTabsBarMenu();

    return labels;
  }

  async getRecentlyClosedTabTexts(): Promise<string[]> {
    await this.openTabsBarMenu();
    const labels = await this.getRecentlyClosedItemTexts(this.getRecentlyClosedTabs());
    await this.closeTabsBarMenu();

    return labels;
  }

  async getRecentlyClosedRootTitles(): Promise<string[]> {
    await this.openTabsBarMenu();
    const titles = await this.getRecentlyClosedItemTitles(this.getRecentlyClosedRootItems());
    await this.closeTabsBarMenu();

    return titles;
  }

  async getRecentlyClosedGroupTabTitles(groupIndex: number): Promise<string[]> {
    await this.openTabsBarMenu();
    const groups = await this.getRecentlyClosedGroups().all();
    const group = groups[groupIndex];
    if (!group) {
      throw new Error(`Recently closed group index ${groupIndex} is out of bounds`);
    }
    await group.click();
    await this.page.testSubj
      .locator(UNIFIED_TABS_TEST_SUBJ.restoreAllRecentlyClosedTabs)
      .waitFor({ state: 'visible' });
    const titles = await this.getRecentlyClosedItemTitles(this.getRecentlyClosedGroupTabs());
    await this.closeTabsBarMenu();

    return titles;
  }

  async clearRecentlyClosedTabs() {
    await this.openTabsBarMenu();

    const clearButton = this.page.testSubj.locator(UNIFIED_TABS_TEST_SUBJ.clearRecentlyClosed);
    if (await clearButton.isVisible()) {
      await clearButton.click();
      await clearButton.waitFor({ state: 'hidden' });
    }

    await this.closeTabsBarMenu();
  }

  async closeTab(index: number) {
    const tab = await this.getTab(index);
    const tabTestSubj = await tab.getAttribute('data-test-subj');
    if (!tabTestSubj) {
      throw new Error(`Tab at index ${index} is missing a data-test-subj attribute`);
    }

    const tabId = tabTestSubj.slice(UNIFIED_TABS_TEST_SUBJ.selectTabBtnPrefix.length);
    await tab.hover();
    await this.page.testSubj.click(`${UNIFIED_TABS_TEST_SUBJ.closeTabBtnPrefix}${tabId}`);
    await tab.waitFor({ state: 'hidden' });
    await this.hideTabPreview();
  }

  async restoreRecentlyClosedTab(index: number) {
    await this.openTabsBarMenu();
    const tabs = await this.getRecentlyClosedTabs().all();
    const tab = tabs[index];
    if (!tab) {
      throw new Error(`Recently closed tab index ${index} is out of bounds`);
    }

    await tab.click();
    await this.page.testSubj
      .locator(UNIFIED_TABS_TEST_SUBJ.tabsBarMenuPanel)
      .waitFor({ state: 'hidden' });
    await this.activeTabLocator.waitFor({ state: 'visible' });
    await this.hideTabPreview();
  }

  async restoreRecentlyClosedTabFromGroup(groupIndex: number, tabIndex: number) {
    await this.openTabsBarMenu();
    const groups = await this.getRecentlyClosedGroups().all();
    const group = groups[groupIndex];
    if (!group) {
      throw new Error(`Recently closed group index ${groupIndex} is out of bounds`);
    }
    await group.click();
    await this.page.testSubj
      .locator(UNIFIED_TABS_TEST_SUBJ.restoreAllRecentlyClosedTabs)
      .waitFor({ state: 'visible' });

    const tabs = await this.getRecentlyClosedGroupTabs().all();
    const tab = tabs[tabIndex];
    if (!tab) {
      throw new Error(`Recently closed group tab index ${tabIndex} is out of bounds`);
    }

    await tab.click();
    await this.page.testSubj
      .locator(UNIFIED_TABS_TEST_SUBJ.tabsBarMenuPanel)
      .waitFor({ state: 'hidden' });
    await this.activeTabLocator.waitFor({ state: 'visible' });
    await this.hideTabPreview();
  }

  async restoreAllRecentlyClosedTabsFromGroup(groupIndex: number) {
    await this.openTabsBarMenu();
    const groups = await this.getRecentlyClosedGroups().all();
    const group = groups[groupIndex];
    if (!group) {
      throw new Error(`Recently closed group index ${groupIndex} is out of bounds`);
    }
    await group.click();

    await this.page.testSubj.click(UNIFIED_TABS_TEST_SUBJ.restoreAllRecentlyClosedTabs);
    await this.page.testSubj
      .locator(UNIFIED_TABS_TEST_SUBJ.tabsBarMenuPanel)
      .waitFor({ state: 'hidden' });
    await this.activeTabLocator.waitFor({ state: 'visible' });
    await this.hideTabPreview();
  }

  /**
   * Returns the `data-test-subj` of the currently selected tab
   * (e.g. `unifiedTabs_selectTabBtn_<id>`). Useful for capturing a tab id
   * before navigating away so it can be restored later by test-subj.
   */
  async getActiveTabTestSubj(): Promise<string> {
    await this.activeTabLocator.waitFor({ state: 'visible' });
    const testSubj = await this.activeTabLocator.getAttribute('data-test-subj');
    if (!testSubj) {
      throw new Error('Active tab is missing a data-test-subj attribute');
    }
    return testSubj;
  }

  /**
   * Switches to the tab identified by the given full
   * `unifiedTabs_selectTabBtn_<id>` test subject and waits for it to become
   * the active tab.
   */
  async navigateToTabByTestSubj(testSubj: string) {
    await this.page.testSubj.click(testSubj);
    await this.page
      .locator(`[data-test-subj="${testSubj}"][aria-selected="true"]`)
      .waitFor({ state: 'visible' });
  }

  private async clickActiveTabMenuItem(menuItemTestSubj: string) {
    const activeTabTestSubj = await this.getActiveTabTestSubj();
    const tabId = activeTabTestSubj.slice(UNIFIED_TABS_TEST_SUBJ.selectTabBtnPrefix.length);

    await this.page.testSubj.click(`${UNIFIED_TABS_TEST_SUBJ.tabMenuBtnPrefix}${tabId}`);
    const menuItem = this.page.testSubj.locator(menuItemTestSubj);
    await menuItem.waitFor({ state: 'visible' });
    await menuItem.click();
  }

  async openInspectorForActiveTab() {
    await this.clickActiveTabMenuItem(UNIFIED_TABS_TEST_SUBJ.inspectMenuItem);
  }

  /**
   * Opens the tab menu for the tab identified by its full
   * `unifiedTabs_selectTabBtn_<id>` test subject, clicks "Duplicate", and waits
   * for a new active tab (a different test subject) to appear.
   */
  private async duplicateTabByTestSubj(originalTestSubj: string) {
    const tabId = originalTestSubj.slice(UNIFIED_TABS_TEST_SUBJ.selectTabBtnPrefix.length);

    await this.page.testSubj.click(`${UNIFIED_TABS_TEST_SUBJ.tabMenuBtnPrefix}${tabId}`);
    await this.page.testSubj.click(UNIFIED_TABS_TEST_SUBJ.duplicateMenuItem);

    await this.page
      .locator(
        `[data-test-subj^="${UNIFIED_TABS_TEST_SUBJ.selectTabBtnPrefix}"][aria-selected="true"]:not([data-test-subj="${originalTestSubj}"])`
      )
      .waitFor({ state: 'visible' });
  }

  /**
   * Duplicates the currently active tab via its tab menu.
   * The duplicated tab becomes the active one; this helper waits for the
   * active-tab marker to move to a different test subject before returning.
   */
  async duplicateActiveTab() {
    const testSubj = await this.getActiveTabTestSubj();
    await this.duplicateTabByTestSubj(testSubj);
  }

  /**
   * Duplicates the tab at the given 0-based index via its tab menu.
   * The duplicated tab becomes the active one.
   */
  async duplicateTab(index: number) {
    const tab = await this.getTab(index);
    const originalTestSubj = await tab.getAttribute('data-test-subj');
    if (!originalTestSubj) {
      throw new Error(`Tab at index ${index} is missing a data-test-subj attribute`);
    }

    // The per-tab menu button is only revealed on hover for non-active tabs.
    await tab.hover();
    await this.duplicateTabByTestSubj(originalTestSubj);
  }
}
