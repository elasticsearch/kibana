/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator, ScoutPage } from '@kbn/scout';
import {
  CONTENT_LIST_TEST_SUBJECTS,
  getContentListToolbarSubjects,
} from '@kbn/content-list-common';

// Legacy `TableListView` (`@kbn/content-management-table-list-view`) subjects.
const LEGACY_TABLE_LOADED = 'listingTable-isLoaded';
const LEGACY_SEARCH_BOX = 'tableListSearchBox';
const LEGACY_TAGS_FILTER_BUTTON = 'tagFilterPopoverButton';

// `@kbn/content-list` subjects, resolved from the framework's single source of truth.
const CONTENT_LIST_TABLE = CONTENT_LIST_TEST_SUBJECTS.table;
const CONTENT_LIST_TABLE_SKELETON = CONTENT_LIST_TEST_SUBJECTS.tableSkeleton;
const CONTENT_LIST_ITEM_LINK = CONTENT_LIST_TEST_SUBJECTS.itemLink;
const CONTENT_LIST_SEARCH_BOX = getContentListToolbarSubjects().searchBox;
const CONTENT_LIST_TAGS_FILTER_BUTTON = CONTENT_LIST_TEST_SUBJECTS.tagsFilter;

/**
 * Page object for a listing page rendered by *either* the legacy
 * `TableListView` or the `@kbn/content-list` framework.
 *
 * Cross-plugin suites (e.g. saved-objects tagging) drive listing pages they
 * don't own at run time, so a `TableListView` -> Content List migration in one
 * plugin used to silently break those suites — selective testing doesn't
 * schedule them, and the subjects this object targeted only existed on the
 * legacy table (see {@link https://github.com/elastic/kibana/pull/270044}).
 * Resolving both subject families here keeps every consumer working across the
 * migration regardless of which framework a given app has adopted.
 *
 * Lives in `@kbn/content-list-scout` rather than `@kbn/scout` so the Scout core
 * package stays off the `@kbn/content-list-common` dependency edge (Scout is on
 * the selective-testing critical path).
 */
export class ListingTable {
  /** Whichever framework's "loaded" table container is present. */
  private readonly table: Locator;
  /** Whichever framework's per-row item links are present. */
  private readonly itemLinks: Locator;
  /** Whichever framework's toolbar search box is present. */
  private readonly searchBox: Locator;

  constructor(private readonly page: ScoutPage) {
    this.table = page.testSubj
      .locator(LEGACY_TABLE_LOADED)
      .or(page.testSubj.locator(CONTENT_LIST_TABLE));
    this.itemLinks = page
      .locator(`[data-test-subj="${LEGACY_TABLE_LOADED}"] .euiTableRow .euiLink`)
      .or(page.testSubj.locator(CONTENT_LIST_ITEM_LINK));
    this.searchBox = page.testSubj
      .locator(LEGACY_SEARCH_BOX)
      .or(page.testSubj.locator(CONTENT_LIST_SEARCH_BOX));
  }

  private async isContentList(): Promise<boolean> {
    return (await this.page.testSubj.locator(CONTENT_LIST_TABLE).count()) > 0;
  }

  async waitUntilTableIsLoaded(options?: { timeout?: number }) {
    const { timeout } = options ?? {};
    await this.table.waitFor({ state: 'visible', timeout });
    // Content List keeps the table container mounted behind a loading skeleton;
    // wait for that skeleton to clear before interacting. Legacy has no skeleton.
    const skeleton = this.page.testSubj.locator(CONTENT_LIST_TABLE_SKELETON);
    if ((await skeleton.count()) > 0) {
      await skeleton.waitFor({ state: 'hidden', timeout });
    }
  }

  /** Visible text of every row link on the current page. */
  async getAllItemsNames(): Promise<string[]> {
    return this.itemLinks.allInnerTexts();
  }

  /** All rendered item links (one per row) on the current page. */
  getItemLinks(): Locator {
    return this.itemLinks;
  }

  /** Click the row whose item-link text exactly matches `name`. */
  async clickItemByName(name: string) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await this.itemLinks.filter({ hasText: new RegExp(`^${escaped}$`) }).click();
  }

  async searchFor(text: string) {
    await this.searchBox.fill(text);
    await this.searchBox.press('Enter');
    await this.waitUntilTableIsLoaded();
  }

  async selectFilterTags(...tagNames: string[]) {
    const contentList = await this.isContentList();
    await this.page.testSubj.click(
      contentList ? CONTENT_LIST_TAGS_FILTER_BUTTON : LEGACY_TAGS_FILTER_BUTTON
    );
    // Both frameworks emit `tag-searchbar-option-${key}` for tag options.
    for (const tagName of tagNames) {
      await this.page.testSubj.click(`tag-searchbar-option-${tagName.replace(' ', '_')}`);
    }
    // Click the search box to dismiss the popover (click-outside) so the
    // filtered results settle — works for both frameworks.
    await this.searchBox.click();
    await this.waitUntilTableIsLoaded();
  }
}
