/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { encode } from '@kbn/rison';
import { EuiDataGridWrapper, type Locator, type ScoutPage } from '@kbn/scout-oblt';
import { ALERTS_TABLE_TEST_SUBJECTS as SUBJ, ALERT_TABLE_DATE_RANGE } from '../constants';

/**
 * Drives the Observability alerts page (`/app/observability/alerts`) table, query
 * bar and alert flyout.
 *
 * Ported from the FTR `observability.alerts.common` service
 * (x-pack/solutions/observability/test/functional/services/observability/alerts/common.ts).
 * Page objects only drive the UI and return state; assertions live in the specs.
 */
export class AlertsTablePage {
  public readonly table: Locator;
  public readonly pageWithData: Locator;
  public readonly noDataState: Locator;
  public readonly errorPrompt: Locator;
  public readonly errorToast: Locator;
  public readonly actionsMenu: Locator;
  public readonly flyout: Locator;
  public readonly flyoutTitle: Locator;
  public readonly flyoutOverviewPanel: Locator;
  public readonly flyoutViewInAppButton: Locator;
  public readonly flyoutAlertDetailsButton: Locator;
  public readonly flyoutViewRuleDetailsLink: Locator;
  // Add-to-case row actions / dialogs
  public readonly addToExistingCaseAction: Locator;
  public readonly addToNewCaseAction: Locator;
  public readonly createCaseFlyout: Locator;
  public readonly addToExistingCaseModal: Locator;
  public readonly queryInput: Locator;
  public readonly dataGrid: EuiDataGridWrapper;
  public readonly groupSelector: Locator;
  // Alert summary widget (full-size, rendered above the table)
  public readonly summaryWidget: Locator;
  public readonly summaryActiveAlertCount: Locator;
  public readonly summaryTotalAlertCount: Locator;
  // Pagination
  public readonly pageSizeButton: Locator;
  public readonly prevPageButton: Locator;
  public readonly nextPageButton: Locator;

  constructor(private readonly page: ScoutPage) {
    this.table = this.page.testSubj.locator(SUBJ.TABLE_LOADED);
    this.dataGrid = new EuiDataGridWrapper(this.page, SUBJ.TABLE_LOADED);
    this.pageWithData = this.page.testSubj.locator(SUBJ.PAGE_WITH_DATA);
    this.noDataState = this.page.testSubj.locator(SUBJ.TABLE_EMPTY_STATE);
    this.errorPrompt = this.page.testSubj.locator(SUBJ.TABLE_ERROR_PROMPT);
    this.errorToast = this.page.testSubj.locator('errorToastMessage');
    this.actionsMenu = this.page.testSubj.locator(SUBJ.ACTIONS_MENU);
    this.groupSelector = this.page.testSubj.locator('group-selector-dropdown');
    this.summaryWidget = this.page.testSubj.locator('alertSummaryWidgetFullSize');
    this.summaryActiveAlertCount = this.page.testSubj.locator('activeAlertCount');
    this.summaryTotalAlertCount = this.page.testSubj.locator('totalAlertCount');
    this.pageSizeButton = this.page.testSubj.locator('tablePaginationPopoverButton');
    this.prevPageButton = this.page.testSubj.locator('pagination-button-previous');
    this.nextPageButton = this.page.testSubj.locator('pagination-button-next');
    this.flyout = this.page.testSubj.locator(SUBJ.FLYOUT);
    this.flyoutTitle = this.page.testSubj.locator('alertsFlyoutTitle');
    this.flyoutOverviewPanel = this.page.testSubj.locator(
      'observabilityAlertFlyoutOverviewTabPanel'
    );
    this.flyoutViewInAppButton = this.page.testSubj.locator('alertsFlyoutViewInAppButton');
    this.flyoutAlertDetailsButton = this.page.testSubj.locator('alertsFlyoutAlertDetailsButton');
    this.flyoutViewRuleDetailsLink = this.page.testSubj.locator('viewRuleDetailsFlyout');
    this.addToExistingCaseAction = this.page.testSubj.locator('add-to-existing-case-action');
    this.addToNewCaseAction = this.page.testSubj.locator('add-to-new-case-action');
    this.createCaseFlyout = this.page.testSubj.locator('create-case-flyout');
    this.addToExistingCaseModal = this.page.testSubj.locator('all-cases-modal');
    this.queryInput = this.page.testSubj.locator('queryInput');
  }

  /**
   * Navigates to the alerts page. By default it uses the fixed time window that
   * matches the `observability/alerts` es_archive; pass `withoutFilter` to land
   * on the page without any URL time range.
   */
  async goto({ withoutFilter = false }: { withoutFilter?: boolean } = {}) {
    const params = withoutFilter
      ? undefined
      : {
          _a: encode({
            rangeFrom: ALERT_TABLE_DATE_RANGE.from,
            rangeTo: ALERT_TABLE_DATE_RANGE.to,
          }),
        };
    await this.page.gotoApp('observability/alerts', params ? { params } : undefined);
    await this.waitForTableToLoad();
  }

  /**
   * Navigates to the alerts page with an arbitrary rison-encoded `_a` app state
   * (e.g. `{ kuery, rangeFrom, rangeTo }`) so URL-driven state hydration can be
   * asserted.
   */
  async gotoWithAppState(appState: Record<string, unknown>) {
    await this.page.gotoApp('observability/alerts', { params: { _a: encode(appState) } });
    await this.waitForTableToLoad();
  }

  /**
   * Waits for the table loading indicator to disappear and either the loaded
   * table or the empty state to be present.
   */
  async waitForTableToLoad() {
    await this.page.testSubj
      .locator(SUBJ.TABLE_LOADING)
      .waitFor({ state: 'hidden', timeout: 30_000 });
    await Promise.race([
      this.table.waitFor({ state: 'visible' }),
      this.noDataState.waitFor({ state: 'visible' }),
    ]);
  }

  /**
   * Returns the total number of alerts matching the current query. Reads the
   * data grid's `aria-rowcount` (set by EuiDataGrid to the full alert count)
   * rather than counting rendered cells, which would undercount because the grid
   * virtualizes rows outside the viewport.
   *
   * When a query matches no alerts the page renders the empty state instead of
   * the data grid, so short-circuit to 0 rather than waiting for a grid body
   * that will never appear (which would otherwise time out).
   */
  async getRowCount(): Promise<number> {
    if (await this.noDataState.isVisible()) {
      return 0;
    }
    const grid = this.page.locator(
      '[data-test-subj="alertsTableIsLoaded"] [data-test-subj="euiDataGridBody"]'
    );
    const ariaRowCount = await grid.getAttribute('aria-rowcount');
    return ariaRowCount ? Number.parseInt(ariaRowCount, 10) : 0;
  }

  // Query bar
  async submitQuery(query: string) {
    await this.queryInput.fill(query);
    await this.page.testSubj.click('querySubmitButton');
  }

  async clearQueryBar() {
    await this.queryInput.clear();
    await this.page.testSubj.click('querySubmitButton');
  }

  // Flyout
  async openFlyout(rowIndex: number = 0) {
    // The default column set has no "Reason" column, so the flyout is opened from
    // the `expand-event` action in the leading (non-virtualized) actions column.
    await this.page
      .locator(`[data-gridcell-row-index="${rowIndex}"] [data-test-subj="expand-event"]`)
      .click();
    await this.flyout.waitFor({ state: 'visible' });
  }

  async closeFlyout() {
    await this.flyout.locator('[data-test-subj="euiFlyoutCloseButton"]').click();
    await this.flyout.waitFor({ state: 'hidden' });
  }

  // Row actions
  async openActionsMenuForRow(rowIndex: number = 0) {
    await this.page
      .locator(
        `[data-gridcell-row-index="${rowIndex}"] [data-test-subj="alertsTableRowActionMore"]`
      )
      .click();
    await this.actionsMenu.waitFor({ state: 'visible' });
  }

  async clickViewRuleDetails() {
    await this.page.testSubj.click('viewRuleDetails');
  }

  // Add to case (from the row actions menu opened via `openActionsMenuForRow`)
  async clickAddToNewCase() {
    await this.addToNewCaseAction.click();
  }

  async clickAddToExistingCase() {
    await this.addToExistingCaseAction.click();
  }

  // Pagination
  async setPageSize(rows: 10 | 20 | 50) {
    await this.pageSizeButton.click();
    await this.page.testSubj.click(`tablePagination-${rows}-rows`);
    await this.waitForTableToLoad();
  }

  /**
   * Clicks the (1-based) page button in the table pagination control. The
   * underlying `pagination-button-*` test subjects are 0-based.
   */
  async goToPage(oneBasedPage: number) {
    await this.page.testSubj.click(`pagination-button-${oneBasedPage - 1}`);
    await this.waitForTableToLoad();
  }

  async goToNextPage() {
    await this.nextPageButton.click();
    await this.waitForTableToLoad();
  }

  async goToPrevPage() {
    await this.prevPageButton.click();
    await this.waitForTableToLoad();
  }

  // Rule stats
  /**
   * Reads the numeric value rendered by one of the alert-page rule stat widgets.
   */
  async getRuleStatValue(testSubj: string): Promise<number> {
    const statTitle = this.page.testSubj.locator(testSubj).locator('.euiStat__title');
    const text = (await statTitle.innerText()).trim();
    return Number.parseInt(text, 10);
  }

  // Bulk actions
  /**
   * Toggles the table header "select all" checkbox and waits for the bulk
   * actions button to appear.
   */
  async selectAllVisibleAlerts() {
    await this.page.testSubj.click('bulk-actions-header');
    await this.page.testSubj.locator('selectedShowBulkActionsButton').waitFor({ state: 'visible' });
  }

  async bulkMuteSelected() {
    await this.page.testSubj.click('selectedShowBulkActionsButton');
    await this.page.testSubj.click('bulk-mute');
  }

  async bulkUnmuteSelected() {
    await this.page.testSubj.click('selectedShowBulkActionsButton');
    await this.page.testSubj.click('bulk-unmute');
  }

  /**
   * Reads the title of the most recent toast and dismisses all visible toasts.
   * `waitFor` tolerates multiple matches (waits for the first), and
   * `allInnerTexts` returns every title so we can pick the most recently
   * rendered one without a positional locator method.
   */
  async readAndDismissLatestToastTitle(): Promise<string> {
    const titles = this.page.testSubj.locator('euiToastHeader__title');
    await titles.waitFor({ state: 'visible' });
    const allTitles = await titles.allInnerTexts();
    for (const button of await this.page.testSubj.locator('toastCloseButton').all()) {
      await button.click().catch(() => {});
    }
    return (allTitles[allTitles.length - 1] ?? '').trim();
  }

  /**
   * Re-runs the query bar with `query` and returns the resulting total alert
   * count. Used to poll for server-side updates that the table only reflects on
   * a fresh search (e.g. the muted field, written via a fire-and-forget
   * `updateByQuery`).
   */
  async countForQuery(query: string): Promise<number> {
    await this.clearQueryBar();
    await this.submitQuery(query);
    await this.waitForTableToLoad();
    return this.getRowCount();
  }
}
