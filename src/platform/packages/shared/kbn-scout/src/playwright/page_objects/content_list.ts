/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator } from '@playwright/test';
import type { ScoutPage } from '..';

/**
 * URL-state shape for a Content List listing page. Mirrors the keys handled by
 * `kbn-content-list-provider` URL sync (`q` and `sort`).
 */
export interface ContentListUrlState {
  /** Free-text query (the `q` URL param). */
  q?: string;
  /** Sort spec, e.g. `'title:asc'` (the `sort` URL param). */
  sort?: string;
}

/**
 * RFC 3986–friendly encoder used to mirror the form `kbn-content-list-provider`
 * writes to the URL — `:`, `,`, `(`, `)`, etc. stay readable so the regex built
 * by {@link buildContentListUrlRegex} matches what the provider actually
 * produces.
 *
 * TODO(https://github.com/elastic/kibana/issues/268689): replace this local
 * helper with the shared `encodeUriQuery` extracted from `kibana_utils` once
 * it is promoted to a shared package. Kept in lockstep with `encodeQueryValue`
 * in `@kbn/content-list-provider`'s `url_sync/encode_query_value.ts` —
 * duplicated here only because `@kbn/scout` shouldn't pull the full
 * `@kbn/content-list-provider` (and its React/EUI dep graph) just for an
 * encoder.
 */
const encodeContentListValue = (value: string): string =>
  encodeURIComponent(value)
    .replace(/%21/g, '!')
    .replace(/%24/g, '$')
    .replace(/%27/g, "'")
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%2A/g, '*')
    .replace(/%2C/g, ',')
    .replace(/%2F/g, '/')
    .replace(/%3A/g, ':')
    .replace(/%3B/g, ';')
    .replace(/%40/g, '@');

/**
 * Builds the URL search string (including a leading `?`) for a Content List
 * page given a partial `ContentListUrlState`. Returns an empty string when no
 * params are set, so it can be appended unconditionally to a hash route.
 *
 * Mirrors `kbn-content-list-provider`'s RFC 3986–friendly encoding so colons,
 * commas, parens, etc. stay readable.
 *
 * @example
 *   buildContentListSearch({ q: 'Alpha', sort: 'title:desc' })
 *   // => '?q=Alpha&sort=title:desc'
 */
export const buildContentListSearch = (params: ContentListUrlState): string => {
  const parts: string[] = [];
  if (params.q !== undefined) {
    parts.push(`q=${encodeContentListValue(params.q)}`);
  }
  if (params.sort !== undefined) {
    parts.push(`sort=${encodeContentListValue(params.sort)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
};

/**
 * Builds a `RegExp` matching the URL of a Content List listing page anchored
 * at the given hash route. Useful with `expect(page).toHaveURL(...)` to assert
 * the `kbn-content-list-provider` URL contract — i.e. `q` and `sort` end up in
 * the URL in the expected shape after the listing rewrites.
 *
 * @param hash - Hash route the listing is mounted at (e.g. `'#/home'`).
 * @param params - Expected URL state (`q`, `sort`).
 *
 * @example
 *   await expect(page).toHaveURL(buildContentListUrlRegex('#/home', { q: 'Alpha' }));
 */
export const buildContentListUrlRegex = (hash: string, params: ContentListUrlState): RegExp => {
  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const target = `${hash}${buildContentListSearch(params)}`;
  return new RegExp(`${escapeRegex(target)}$`);
};

/**
 * Page-object wrapper for the `@kbn/content-list` listing UI (toolbar, table,
 * selection bar). Centralizes the `data-test-subj` selectors emitted by the
 * Content List packages so plugin tests don't have to re-derive them.
 *
 * Compose this in a plugin page object — it intentionally does not own
 * navigation, since each consuming app mounts the listing under a different
 * route and may surface app-specific buttons (e.g. an empty-prompt CTA).
 *
 * @example
 *   class GraphListingPage {
 *     readonly contentList: ContentListWrapper;
 *
 *     constructor(private readonly page: ScoutPage) {
 *       this.contentList = new ContentListWrapper(page);
 *     }
 *
 *     async goto() {
 *       await this.page.gotoApp('graph');
 *       await this.contentList.waitForReady();
 *     }
 *   }
 */
export class ContentListWrapper {
  readonly pageHeader: Locator;
  readonly toolbar: Locator;
  readonly searchBox: Locator;
  readonly clearSearchButton: Locator;
  readonly sortFilterButton: Locator;
  readonly tagsFilterButton: Locator;
  readonly createdByFilterButton: Locator;
  readonly favoritesFilterButton: Locator;
  readonly itemLinks: Locator;
  readonly noResultsPanel: Locator;
  readonly tableSelectAllCheckbox: Locator;
  readonly selectionBarDeleteButton: Locator;
  readonly deleteConfirmButton: Locator;

  constructor(private readonly page: ScoutPage) {
    this.pageHeader = page.testSubj.locator('kibana-content-list-page-header');
    this.toolbar = page.testSubj.locator('contentListToolbar');
    this.searchBox = page.testSubj.locator('contentListToolbar-searchBox');
    this.clearSearchButton = this.searchBox.getByRole('button', {
      name: 'Clear search input',
    });
    this.sortFilterButton = page.testSubj.locator('contentListSortRenderer');
    this.tagsFilterButton = page.testSubj.locator('contentListTagsRenderer');
    this.createdByFilterButton = page.testSubj.locator('contentListCreatedByRenderer');
    this.favoritesFilterButton = page.testSubj.locator('contentListStarredRenderer');
    this.itemLinks = page.testSubj.locator('content-list-table-item-link');
    this.noResultsPanel = page.testSubj.locator('contentListNoResults');
    this.tableSelectAllCheckbox = page.testSubj.locator('checkboxSelectAll');
    // ContentListToolbar passes its own `data-test-subj` prefix to the nested
    // SelectionBar, so the rendered delete button is namespaced under the
    // toolbar. SelectionBar's own default (`contentListSelectionBar-…`) is only
    // reachable when the bar is mounted standalone (e.g. in unit tests).
    this.selectionBarDeleteButton = page.testSubj.locator(
      'contentListToolbar-selectionBar-deleteButton'
    );
    this.deleteConfirmButton = page.testSubj.locator('confirmModalConfirmButton');
  }

  /** Wait for the listing page header to render — a stable readiness signal. */
  async waitForReady() {
    await this.pageHeader.waitFor({ state: 'visible' });
  }

  /**
   * Type characters into the toolbar search box one at a time. Mirrors
   * real-user input so `EuiSearchBar`'s controlled `onChange` fires
   * incrementally.
   */
  async typeIntoSearch(text: string) {
    await this.searchBox.click();
    await this.searchBox.pressSequentially(text, { delay: 30 });
  }

  /** Replace the search box value (no Enter; commit happens on debounce). */
  async setSearch(text: string) {
    await this.searchBox.fill(text);
  }

  /**
   * Replace the search box value and submit with Enter. Mirrors the typical
   * "search and apply" flow surfaced by `EuiSearchBar`.
   */
  async searchFor(text: string) {
    await this.searchBox.fill(text);
    await this.searchBox.press('Enter');
  }

  /** Clear the search box via its built-in clear-input button. */
  async clearSearch() {
    await this.clearSearchButton.click();
  }

  /** Open the sort filter popover and select the option with the given label. */
  async selectSortOption(label: string) {
    await this.sortFilterButton.click();
    await this.page.testSubj
      .locator('sortSelectOptions')
      .getByRole('option', { name: label })
      .click();
  }

  /**
   * Open the tags filter popover and select the option for the given tag name.
   *
   * The subject is derived inline to mirror `getContentListTagOptionSubj` from
   * `@kbn/content-list-common`; it isn't imported because `@kbn/scout` is on the
   * Scout selective-testing critical path and must not depend on that package.
   */
  async selectTag(name: string) {
    await this.tagsFilterButton.click();
    await this.page.testSubj.locator(`tag-searchbar-option-${name.replace(' ', '_')}`).click();
  }

  /** Select all items via the table header checkbox and confirm the bulk-delete dialog. */
  async selectAllAndDelete() {
    await this.tableSelectAllCheckbox.check();
    await this.selectionBarDeleteButton.click();
    await this.deleteConfirmButton.click();
  }
}
