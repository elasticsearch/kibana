/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator, ScoutPage } from '@kbn/scout-oblt';
import { EXTENDED_TIMEOUT } from '../constants';

export class ServiceFlyoutPage {
  public readonly flyout: Locator;
  public readonly content: Locator;
  public readonly title: Locator;
  public readonly actions: Locator;
  public readonly transactionsSection: Locator;
  public readonly transactionSparklines: Locator;
  public readonly apmCharts: Locator;

  constructor(private readonly page: ScoutPage) {
    this.flyout = page.testSubj.locator('serviceFlyout');
    this.content = page.testSubj.locator('serviceFlyoutOverview');
    this.title = page.testSubj.locator('serviceFlyoutTitleLink');
    this.actions = page.testSubj.locator('serviceFlyoutActionsButton');
    this.transactionsSection = page.testSubj.locator('serviceFlyoutSection-transactions-loaded');
    this.transactionSparklines = this.transactionsSection.locator(
      '[data-test-subj="transactionSparklineChart"]'
    );
    this.apmCharts = page.testSubj.locator('serviceFlyoutApmCharts');
  }

  getChartLocator(id: string): Locator {
    return this.page.testSubj.locator(`serviceFlyoutLensChart-${id}`);
  }

  async getTitle(): Promise<string | null> {
    return this.title.textContent();
  }

  async waitForHidden(options?: { timeout?: number }) {
    await this.flyout.waitFor({
      state: 'hidden',
      timeout: options?.timeout ?? EXTENDED_TIMEOUT,
    });
  }

  async close() {
    await this.page.testSubj.click('euiFlyoutCloseButton');
    await this.waitForHidden();
  }

  async clickAction(action: string) {
    await this.actions.click();
    await this.page.testSubj.click(`serviceFlyoutActionsMenuItem-${action}`);
  }
}
