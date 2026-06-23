/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage } from '..';

/**
 * Page object for the global query text input (`queryInput`) shared by
 * Discover, Dashboard, Maps, Visualize/Lens and other apps that embed
 * `unified_search`. Covers setting and clearing the live query without
 * submitting; callers own the submit step when they need it.
 */
export class QueryBar {
  constructor(private readonly page: ScoutPage) {}

  async setQuery(query: string): Promise<void> {
    await this.page.testSubj.fill('queryInput', query);
  }

  async getQuery(): Promise<string> {
    return this.page.testSubj.locator('queryInput').inputValue();
  }

  async clearQuery(): Promise<void> {
    await this.page.testSubj.clearInput('queryInput');
  }
}
