/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaUrl, Locator, ScoutPage } from '@kbn/scout';
import { ContentListWrapper } from '@kbn/scout';

export class GraphPage {
  /** Shared wrapper for the Content List listing UI (toolbar, table, selection bar). */
  readonly contentList: ContentListWrapper;

  // Public locators consumed directly by specs.
  readonly createGraphPromptButton: Locator;
  readonly saveButton: Locator;
  readonly currentGraphBreadcrumb: Locator;
  readonly vennLargeTerm1: Locator;
  readonly vennLargeTerm2: Locator;
  readonly vennSmallTerm1: Locator;
  readonly vennSmallOverlap: Locator;
  readonly vennSmallTerm2: Locator;

  // Internal locators — consumed only by methods on this class.
  private readonly newButton: Locator;
  private readonly homeBreadcrumb: Locator;
  private readonly datasourceButton: Locator;
  private readonly addFieldButton: Locator;
  private readonly fieldSearchInput: Locator;
  private readonly exploreButton: Locator;
  private readonly queryInput: Locator;
  private readonly selectAllButton: Locator;
  private readonly invertSelectionButton: Locator;
  private readonly removeSelectionButton: Locator;
  private readonly pauseLayoutButton: Locator;
  private readonly resumeLayoutButton: Locator;
  private readonly saveTitleInput: Locator;
  private readonly saveConfirmButton: Locator;
  private readonly saveSuccessToast: Locator;
  private readonly confirmModalTitle: Locator;
  private readonly confirmModalConfirmButton: Locator;
  private readonly nodeCircles: Locator;
  private readonly clickableEdges: Locator;
  private readonly selectionListFields: Locator;

  constructor(private readonly page: ScoutPage, private readonly kbnUrl: KibanaUrl) {
    this.contentList = new ContentListWrapper(page);
    this.createGraphPromptButton = this.page.testSubj.locator('graphCreateGraphPromptButton');

    this.newButton = this.page.testSubj.locator('graphNewButton');
    this.saveButton = this.page.testSubj.locator('graphSaveButton');
    // Two breadcrumbs register `graphHomeBreadcrumb` (chrome + shared-ux
    // mirror); match `first` to pick the chrome one.
    this.homeBreadcrumb = this.page.locator(
      '[data-test-subj~="graphHomeBreadcrumb"][data-test-subj~="first"]'
    );
    this.currentGraphBreadcrumb = this.page.locator(
      '[data-test-subj~="graphCurrentGraphBreadcrumb"]'
    );
    this.datasourceButton = this.page.testSubj.locator('graphDatasourceButton');
    this.addFieldButton = this.page.testSubj.locator('graph-add-field-button');
    this.fieldSearchInput = this.page.testSubj.locator('graph-field-search');
    this.exploreButton = this.page.testSubj.locator('graph-explore-button');
    this.queryInput = this.page.testSubj.locator('queryInput');

    this.selectAllButton = this.page.testSubj.locator('graphSelectAll');
    this.invertSelectionButton = this.page.testSubj.locator('graphInvertSelection');
    this.removeSelectionButton = this.page.testSubj.locator('graphRemoveSelection');
    this.pauseLayoutButton = this.page.testSubj.locator('graphPauseLayout');
    this.resumeLayoutButton = this.page.testSubj.locator('graphResumeLayout');

    this.saveTitleInput = this.page.testSubj.locator('savedObjectTitle');
    this.saveConfirmButton = this.page.testSubj.locator('confirmSaveSavedObjectButton');
    this.saveSuccessToast = this.page.testSubj.locator('saveGraphSuccess');

    this.confirmModalTitle = this.page.testSubj.locator('confirmModalTitleText');
    this.confirmModalConfirmButton = this.page.testSubj.locator('confirmModalConfirmButton');

    this.nodeCircles = this.page.testSubj.locator('graphNodeCircle');
    this.clickableEdges = this.page.testSubj.locator('graphClickableEdge');
    this.selectionListFields = this.page.locator('[data-test-subj^="graphSelectionListField-"]');

    this.vennLargeTerm1 = this.page.testSubj.locator('graphVennLargeTerm1');
    this.vennLargeTerm2 = this.page.testSubj.locator('graphVennLargeTerm2');
    this.vennSmallTerm1 = this.page.testSubj.locator('graphVennSmallTerm1');
    this.vennSmallOverlap = this.page.testSubj.locator('graphVennSmallOverlap');
    this.vennSmallTerm2 = this.page.testSubj.locator('graphVennSmallTerm2');
  }

  async goto() {
    await this.page.gotoApp('graph');
  }

  async gotoInSpace(spaceId: string) {
    await this.page.goto(this.kbnUrl.app('graph', { space: spaceId }));
  }

  async waitForListing() {
    await this.contentList.waitForReady();
  }

  async clickCreateGraph() {
    await this.createGraphPromptButton.click();
  }

  /**
   * Wait for the workspace shell. The `Unsaved graph` breadcrumb appears
   * even without data-view access (the canvas is then replaced by a
   * "No data source" panel), so this is safe for read-only/security tests.
   */
  async waitForWorkspace() {
    await this.currentGraphBreadcrumb.waitFor({ state: 'visible' });
  }

  async pickIndexPattern(indexPattern: string) {
    await this.datasourceButton.click();
    await this.page.testSubj.locator(`savedObjectTitle${indexPattern}`).click();
    // "Add fields" stays `aria-disabled` until the fields finish loading.
    await this.addFieldButton.waitFor({ state: 'visible' });
    await this.page.waitForFunction(
      () =>
        document
          .querySelector('[data-test-subj="graph-add-field-button"]')
          ?.getAttribute('aria-disabled') === 'false',
      undefined,
      { timeout: 10000 }
    );
  }

  async addFields(fields: string[]) {
    await this.addFieldButton.click();
    await this.fieldSearchInput.waitFor({ state: 'visible' });
    for (const field of fields) {
      await this.fieldSearchInput.fill(field);
      const option = this.page.testSubj.locator(`graph-field-option-${field}`);
      await option.waitFor({ state: 'visible' });
      await option.click();
    }
    await this.fieldSearchInput.fill('');
    await this.addFieldButton.click();
    await this.fieldSearchInput.waitFor({ state: 'hidden' });
  }

  async runQuery(query: string) {
    await this.queryInput.fill(query);
    await this.exploreButton.click();
  }

  async saveWorkspaceAs(title: string) {
    await this.saveButton.click();
    await this.saveTitleInput.fill(title);
    await this.saveConfirmButton.click();
    await this.saveSuccessToast.waitFor({ state: 'visible' });
  }

  async newWorkspace({ discardChanges = false }: { discardChanges?: boolean } = {}) {
    await this.newButton.click();
    if (discardChanges) {
      await this.confirmModalTitle.waitFor({ state: 'visible' });
      await this.confirmModalConfirmButton.click();
    }
  }

  async goToListingViaBreadcrumb() {
    await this.homeBreadcrumb.click();
  }

  async openWorkspace(title: string) {
    await this.workspaceListingLink(title).click();
  }

  async deleteWorkspace(title: string) {
    const rowLink = this.workspaceListingLink(title);
    await this.contentList.searchFor(title);
    await rowLink.waitFor({ state: 'visible' });
    await this.contentList.selectAllAndDelete();
    await rowLink.waitFor({ state: 'hidden' });
  }

  private workspaceListingLink(title: string): Locator {
    return this.contentList.itemLinks.filter({ hasText: title });
  }

  async nodeCount(): Promise<number> {
    return this.nodeCircles.count();
  }

  async edgeCount(): Promise<number> {
    return this.clickableEdges.count();
  }

  async selectionCount(): Promise<number> {
    return this.selectionListFields.count();
  }

  /**
   * Click the only remaining edge after `isolateEdge`. Dispatches a synthetic
   * SVG click — overlapping thin lines and SVG `pointer-events` make
   * Playwright's actionable click flaky here.
   */
  async clickIsolatedEdge() {
    await this.clickableEdges.evaluateAll((els) => {
      if (els.length !== 1) {
        throw new Error(`Expected exactly one isolated edge, found ${els.length}`);
      }
      (els[0] as SVGElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  async stopLayout() {
    if (await this.pauseLayoutButton.isVisible()) {
      await this.pauseLayoutButton.click();
    }
  }

  async startLayout() {
    if (await this.resumeLayoutButton.isVisible()) {
      await this.resumeLayoutButton.click();
    }
  }

  /**
   * Reduce the selection list to exactly `from` and `to`.
   *
   * Deselecting a node removes its `<SelectedNodeItem>`, so snapshot labels
   * first; click each non-keep node via its own `graph-selected-<label>`
   * selector to avoid stale list-index handles.
   */
  async isolateEdge(from: string, to: string) {
    await this.selectAllButton.click();

    const PREFIX = 'graphSelectionListField-';
    const allLabels = await this.selectionListFields.evaluateAll(
      (els, prefix) =>
        els
          .map((el) => el.getAttribute('data-test-subj') ?? '')
          .map((subj) => (subj.startsWith(prefix) ? subj.slice(prefix.length) : null))
          .filter((label): label is string => label !== null),
      PREFIX
    );

    const keep = new Set([from, to]);
    for (const label of allLabels) {
      if (keep.has(label)) {
        continue;
      }
      await this.page.locator(`[data-test-subj="graph-selected-${label}"]`).click();
    }

    await this.invertSelectionButton.click();
    await this.removeSelectionButton.click();
  }
}
