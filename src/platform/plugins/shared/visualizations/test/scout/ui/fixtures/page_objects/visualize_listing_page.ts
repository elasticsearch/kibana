/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { type ScoutPage, type Locator } from '@kbn/scout';
import { ContentListWrapper } from '@kbn/scout';

/**
 * Page object for the migrated Visualize listing page.
 *
 * Wraps {@link ContentListWrapper} with visualize-specific helpers — opening
 * the row's content-editor flyout, counting items, and the bulk-delete flow
 * already covered by `ContentListWrapper`.
 *
 * The visualize listing is mounted inside `TabbedTableListView`; the
 * `visualizations` tab is selected by default at `/app/visualize#/`.
 */
export class VisualizeListingPage {
  readonly contentList: ContentListWrapper;
  readonly tableRows: Locator;
  readonly emptyPrompt: Locator;
  readonly newVisButton: Locator;
  readonly newVisDialogGroups: Locator;
  readonly dashboardFlowPrompt: Locator;
  readonly contentEditorFlyoutTitle: Locator;
  readonly contentEditorNameInput: Locator;
  readonly contentEditorDescriptionInput: Locator;
  readonly contentEditorSaveButton: Locator;

  constructor(private readonly page: ScoutPage) {
    this.contentList = new ContentListWrapper(page);
    // `EuiBasicTable` does not emit a `data-test-subj` per row. Anchor on the
    // per-row name link cell (always present, one per row) and walk up to the
    // enclosing `<tr>` for row-scoped interactions.
    this.tableRows = page.locator('tr', { has: this.contentList.itemLinks });
    this.emptyPrompt = page.testSubj.locator('emptyListPrompt');
    this.newVisButton = page.testSubj.locator('newItemButton');
    // First step of the new-visualization wizard opened by `showNewVisModal`;
    // the legacy FTR `waitForVisualizationSelectPage` keyed on the same subject.
    this.newVisDialogGroups = page.testSubj.locator('visNewDialogGroups');
    this.dashboardFlowPrompt = page.testSubj.locator('visualize-dashboard-flow-prompt');
    this.contentEditorFlyoutTitle = page.testSubj.locator('flyoutTitle');
    this.contentEditorNameInput = page.testSubj.locator('nameInput');
    this.contentEditorDescriptionInput = page.testSubj.locator('descriptionInput');
    this.contentEditorSaveButton = page.testSubj.locator('saveButton');
  }

  /**
   * Navigate to the visualize landing page and wait for the Content List
   * to be ready.
   *
   * TODO: clintandrewhall - drop this override once the visualize landing
   * page's shell flips from `TabbedTableListView` to `KibanaContentListPage`
   * (currently blocked on the dashboard listing migration). At that point
   * `kibana-content-list-page-header` will be emitted and
   * `ContentListWrapper.waitForReady()` works without help.
   *
   * Until then we wait on the toolbar's search box: the outer
   * `EuiSearchBar` does not forward `data-test-subj` onto its rendered
   * root, so `contentListToolbar` never appears in the DOM even after the
   * `<ContentList>` tree mounts. The `box.data-test-subj` IS forwarded to
   * the input inside it, so `contentListToolbar-searchBox` (exposed as
   * `ContentListWrapper.searchBox`) is reliably present.
   */
  async goto() {
    await this.page.gotoApp('visualize');
    await this.contentList.searchBox.waitFor({ state: 'visible' });
  }

  /** Return the current number of rendered table rows. */
  async itemCount(): Promise<number> {
    return this.tableRows.count();
  }

  /** Click the header create button, opening the new-visualization wizard. */
  async clickCreateNewVisualization() {
    await this.newVisButton.click();
  }

  /**
   * Locate a row by the title rendered in the `Column.Name` cell. Matches the
   * `EuiBasicTable` row containing an item link with the given text.
   */
  rowByTitle(title: string): Locator {
    return this.tableRows.filter({ has: this.contentList.itemLinks.filter({ hasText: title }) });
  }

  /**
   * Open the content-editor flyout for the row matching `title`.
   *
   * `EuiBasicTable` only shows the first two `isPrimary` actions inline (Edit
   * and Delete here); the "View details" action lands in the overflow popover
   * keyed by `euiCollapsedItemActionsButton`. Hovering the row exposes the
   * trigger; clicking it opens an `EuiContextMenu` from which the inspect
   * action is reachable via its own `data-test-subj`.
   */
  async openContentEditorFor(title: string) {
    const row = this.rowByTitle(title);
    await row.hover();
    await row.getByTestId('euiCollapsedItemActionsButton').click();
    await this.page.testSubj.click('content-list-table-action-inspect');
    await this.contentEditorFlyoutTitle.waitFor({ state: 'visible' });
  }

  /**
   * Edit the title/description fields in the open content-editor flyout and save.
   *
   * The flyout's `MetadataForm` debounces field validation, and the content
   * editor keeps `saveButton` disabled until validation settles (clicking it
   * mid-validation is a no-op). Playwright's click actionability waits for the
   * button to be enabled, so the save only fires once validation has settled —
   * no explicit enablement assertion is needed in the page object.
   */
  async editVisualizationDetails({ title, description }: { title?: string; description?: string }) {
    if (title !== undefined) {
      await this.contentEditorNameInput.fill(title);
    }
    if (description !== undefined) {
      await this.contentEditorDescriptionInput.fill(description);
    }
    await this.contentEditorSaveButton.click();
    await this.contentEditorFlyoutTitle.waitFor({ state: 'hidden' });
  }
}
