/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout';
import { ContentListWrapper } from '@kbn/scout';

/**
 * Page object for the Graph listing page (`/app/graph#/home`).
 *
 * Generic Content List interactions (toolbar search, sort, selection, etc.)
 * are delegated to {@link ContentListWrapper}; this class only owns
 * Graph-specific navigation and CTAs.
 */
export class GraphListingPage {
  readonly contentList: ContentListWrapper;
  readonly createGraphButton: Locator;
  readonly emptyPromptCreateButton: Locator;

  constructor(private readonly page: ScoutPage) {
    this.contentList = new ContentListWrapper(page);
    this.createGraphButton = this.page.testSubj.locator('graphCreateGraphButton');
    this.emptyPromptCreateButton = this.page.testSubj.locator('graphCreateGraphPromptButton');
  }

  /** Navigate to the Graph listing page and wait for the header to be visible. */
  async goto() {
    await this.page.gotoApp('graph');
    await this.contentList.waitForReady();
  }
}
