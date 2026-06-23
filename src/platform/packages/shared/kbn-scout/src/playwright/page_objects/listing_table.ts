/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator } from 'playwright/test';
import type { ScoutPage } from '..';

export class ListingTable {
  private readonly table: Locator;
  private readonly searchBox: Locator;

  constructor(private readonly page: ScoutPage) {
    this.table = this.page.testSubj.locator('listingTable-isLoaded');
    this.searchBox = this.page.testSubj.locator('tableListSearchBox');
  }

  async waitUntilTableIsLoaded(options?: { timeout?: number }) {
    await this.table.waitFor({ state: 'visible', timeout: options?.timeout });
  }

  async getAllItemsNames(): Promise<string[]> {
    const links = this.table.locator('.euiTableRow .euiLink');
    return links.allTextContents();
  }

  async searchFor(text: string) {
    await this.searchBox.fill(text);
    await this.page.keyboard.press('Enter');
    await this.waitUntilTableIsLoaded();
  }

  async selectFilterTags(...tagNames: string[]) {
    await this.page.testSubj.click('tagFilterPopoverButton');
    for (const tagName of tagNames) {
      await this.page.testSubj.click(`tag-searchbar-option-${tagName.replace(' ', '_')}`);
    }
    await this.searchBox.click();
    await this.waitUntilTableIsLoaded();
  }

  /**
   * Filters the listing by the given title. Wraps `title` in quotes so that
   * names containing special characters (e.g. `"(1)"`) are matched literally rather
   * than tokenized by the saved-object search syntax.
   */
  async searchForItemTitle(title: string) {
    await this.searchFor(`"${title}"`);
  }

  async clearSearchFilter() {
    await this.page.testSubj.click('clearSearchButton');
    await this.waitUntilTableIsLoaded();
  }
}
