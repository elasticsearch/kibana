/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaUrl, ScoutPage } from '@kbn/scout-oblt';
import { expect } from '@kbn/scout-oblt/ui';
import {
  dismissGlobalToastsIfPresent,
  waitForApmSettingsHeaderLink,
  waitForSearchBarReady,
} from '../page_helpers';
import { EXTENDED_TIMEOUT } from '../constants';
import { type TraceWaterfallFlyout, createTraceWaterfallFlyout } from './trace_waterfall_flyout';

export class TransactionDetailsPage {
  public readonly traceWaterfallFlyout: TraceWaterfallFlyout;

  constructor(private readonly page: ScoutPage, private readonly kbnUrl: KibanaUrl) {
    this.traceWaterfallFlyout = createTraceWaterfallFlyout(page);
  }

  async goToTransactionDetails(params: {
    serviceName: string;
    transactionName: string;
    start: string;
    end: string;
  }) {
    const { serviceName, transactionName, start, end } = params;
    const urlServiceName = encodeURIComponent(serviceName);

    await this.page.goto(
      `${this.kbnUrl.app('apm')}/services/${urlServiceName}/transactions/view?${new URLSearchParams(
        {
          transactionName,
          rangeFrom: start,
          rangeTo: end,
        }
      )}`
    );
    await waitForApmSettingsHeaderLink(this.page);
  }

  /**
   * Navigate to transaction view URL without transactionName (invalid URL).
   */
  async goToTransactionViewWithoutTransactionName(params: {
    serviceName: string;
    start: string;
    end: string;
  }) {
    const { serviceName, start, end } = params;
    const urlServiceName = encodeURIComponent(serviceName);

    await this.page.goto(
      `${this.kbnUrl.app('apm')}/services/${urlServiceName}/transactions/view?${new URLSearchParams(
        {
          rangeFrom: start,
          rangeTo: end,
          comparisonEnabled: 'false',
          showCriticalPath: '',
          environment: 'ENVIRONMENT_ALL',
          kuery: '',
          serviceGroup: '',
        }
      )}`
    );
    await waitForApmSettingsHeaderLink(this.page);
  }

  /**
   * From the current page URL (must be transaction details view), remove the
   * transactionName query param and navigate to that URL. Used to simulate
   * a user editing the URL or following a bad link. The app should redirect
   * to the transaction list instead of showing 404.
   */
  async removeTransactionNameFromUrlAndNavigate() {
    const url = new URL(this.page.url());
    url.searchParams.delete('transactionName');
    await this.page.goto(url.toString());
    await waitForApmSettingsHeaderLink(this.page);
  }

  /**
   * Assert the current page is the transaction list (not 404, not view).
   * Use after removeTransactionNameFromUrlAndNavigate to verify redirect.
   */
  async expectTransactionListPageLoaded(serviceName: string) {
    await this.page
      .getByRole('heading', { name: 'Transactions', exact: true })
      .waitFor({ state: 'visible', timeout: EXTENDED_TIMEOUT });
    await expect(this.page.getByTestId('apmMainTemplateHeaderServiceName')).toHaveText(serviceName);
    await expect(this.page.getByTestId('appNotFoundPageContent')).toBeHidden();
  }

  /**
   * Navigate to service inventory page
   */
  async gotoServiceInventory(
    serviceName: string,
    timeRange: { rangeFrom: string; rangeTo: string }
  ) {
    const urlServiceName = encodeURIComponent(serviceName);

    await this.page.goto(
      `${this.kbnUrl.app('apm')}/services/${urlServiceName}?${new URLSearchParams({
        rangeFrom: timeRange.rangeFrom,
        rangeTo: timeRange.rangeTo,
        environment: 'ENVIRONMENT_ALL',
        kuery: '',
        serviceGroup: '',
        transactionType: 'request',
        comparisonEnabled: 'true',
        offset: '1d',
      })}`
    );
    await this.waitForPageToLoad(this.page);
  }

  async reload() {
    await this.page.reload();
    await waitForApmSettingsHeaderLink(this.page);
  }

  async fillApmUnifiedSearchBar(query: string) {
    const searchBar = this.page.getByTestId('apmUnifiedSearchBar');
    await searchBar.fill(query);
    await searchBar.press('Enter');
  }

  async waitForPageToLoad(page: ScoutPage) {
    await waitForSearchBarReady(page);
  }

  // Span links methods

  /**
   * Get span links tab in flyout
   */
  getSpanLinksTab() {
    return this.page.getByTestId('spanLinksTab');
  }

  /**
   * Get span link type select dropdown
   */
  getSpanLinkTypeSelect() {
    return this.page.getByTestId('spanLinkTypeSelect');
  }

  // Stacktrace methods

  /**
   * Get stacktrace tab in flyout
   */
  getStacktraceTab() {
    return this.page.getByTestId('spanStacktraceTab');
  }

  // Transaction interaction methods

  /**
   * Click transaction accordion button using aria-controls selector
   */
  async clickTransactionWithAriaControls(transactionId: string) {
    await this.page.locator(`[aria-controls="${transactionId}"]`).click();
  }

  // Action menu methods

  /**
   * Open the transaction action menu by clicking the "Investigate" button
   */
  async openActionMenu() {
    await dismissGlobalToastsIfPresent(this.page);
    const investigateButton = this.page.getByTestId('apmActionMenuButtonInvestigateButton');
    await investigateButton.waitFor({ state: 'visible', timeout: EXTENDED_TIMEOUT });
    await investigateButton.scrollIntoViewIfNeeded();
    await investigateButton.click();
    // Wait for the popup to be visible
    const popup = this.page.getByTestId('apmActionMenuInvestigateButtonPopup');
    await popup.waitFor({ state: 'visible', timeout: EXTENDED_TIMEOUT });
  }

  /**
   * Get the href attribute of a custom link by its label
   */
  async getCustomLinkHref(label: string): Promise<string | null> {
    const link = this.page.getByRole('link', { name: label });
    await link.waitFor({ state: 'visible', timeout: EXTENDED_TIMEOUT });
    return await link.getAttribute('href');
  }
}
