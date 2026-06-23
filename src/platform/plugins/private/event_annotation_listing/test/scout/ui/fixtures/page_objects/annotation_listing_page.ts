/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage, Locator } from '@kbn/scout';
import { ContentListWrapper } from '@kbn/scout';

/**
 * Page object for the Annotation Library tab inside the Visualize landing
 * page (`/app/visualize#/annotations`).
 *
 * Generic Content List interactions (toolbar search, sort, selection, etc.)
 * are delegated to {@link ContentListWrapper}; this class only owns
 * annotation-listing navigation and shell-specific test subjects.
 *
 * The annotation listing renders inside a `TabbedTableListView`, so the
 * usual `kibana-content-list-page-header` subject is **not** present —
 * readiness is keyed off the toolbar instead.
 */
export class AnnotationListingPage {
  readonly contentList: ContentListWrapper;
  readonly tabbedPageHeader: Locator;
  readonly emptyPromptCreateButton: Locator;
  readonly noResultsMessage: Locator;

  constructor(private readonly page: ScoutPage) {
    this.contentList = new ContentListWrapper(page);
    this.tabbedPageHeader = this.page.testSubj.locator('top-nav');
    this.emptyPromptCreateButton = this.page.locator('button', {
      hasText: 'Create annotation in Lens',
    });
    this.noResultsMessage = this.page.getByText('No items found');
  }

  /**
   * Navigate to the Annotation Library tab and wait for the Content List
   * search box to render. The search box is the earliest stable signal the inner
   * list has mounted; the surrounding tabbed page header may render before
   * the tab body is in place.
   */
  async goto() {
    await this.page.gotoApp('visualize', { hash: '/annotations' });
    await this.contentList.searchBox.waitFor({ state: 'visible' });
  }

  async selectTag(tagName: string) {
    await this.contentList.tagsFilterButton.click();
    await this.page.testSubj.locator(`tag-searchbar-option-${tagName.replace(' ', '_')}`).click();
  }
}
