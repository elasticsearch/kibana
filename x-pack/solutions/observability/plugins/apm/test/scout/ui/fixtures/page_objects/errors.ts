/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaUrl, Locator, ScoutPage } from '@kbn/scout-oblt';
import { waitForSearchBarReady } from '../page_helpers';

export class ErrorsPage {
  public tableSearchInput: Locator;
  public errorDistributionChart: Locator;

  constructor(private readonly page: ScoutPage, private readonly kbnUrl: KibanaUrl) {
    this.tableSearchInput = page.testSubj.locator('tableSearchInput');
    this.errorDistributionChart = page.testSubj.locator('errorDistribution');
  }

  async gotoServiceErrorsPage(serviceName: string, start: string, end: string) {
    await this.page.goto(
      `${this.kbnUrl.app('apm')}/services/${serviceName}/errors?rangeFrom=${start}&rangeTo=${end}`
    );
    await waitForSearchBarReady(this.page);
  }

  async gotoErrorDetailsPage(
    serviceName: string,
    errorGroupingKey: string,
    start: string,
    end: string
  ) {
    await this.page.goto(
      `${this.kbnUrl.app(
        'apm'
      )}/services/${serviceName}/errors/${errorGroupingKey}?rangeFrom=${start}&rangeTo=${end}`
    );
    await waitForSearchBarReady(this.page);
  }

  async getSearchBar() {
    await this.page.testSubj.waitForSelector('apmUnifiedSearchBar');
  }

  async waitForErrorsTableToLoad() {
    // Wait for the table search input which appears when the table is loaded
    await this.tableSearchInput.waitFor({ state: 'visible' });
  }

  async waitForErrorDistributionChartToLoad() {
    await this.errorDistributionChart.waitFor({ state: 'visible' });
  }
}
