/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaUrl, Locator, ScoutPage } from '@kbn/scout';

export class ExecutionHistoryPage {
  public readonly emptyPrompt: Locator;
  public readonly retryButton: Locator;

  constructor(private readonly page: ScoutPage, private readonly kbnUrl: KibanaUrl) {
    this.emptyPrompt = this.page.getByRole('cell').getByTestId('ruleExecutionHistoryEmptyPrompt');
    this.retryButton = this.page.testSubj.locator('executionHistoryRetryButton');
  }

  async goto(spaceId?: string) {
    if (spaceId) {
      await this.page.goto(
        this.kbnUrl.app('management/alertingV2/execution_history', { space: spaceId })
      );
      return;
    }
    await this.page.gotoApp('management/alertingV2/execution_history');
  }
}
