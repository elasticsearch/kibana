/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator } from '@kbn/scout';
import type { ScoutPage } from '@kbn/scout';

export interface CopyToSpaceSetupOptions {
  destinationSpaceId: string;
  createNewCopies?: boolean;
  overwrite?: boolean;
}

export interface CopyToSpaceSummary {
  success: number;
  pending: number;
  skipped: number;
  errors: number;
}

// EuiStat renders as "<label>\n<count>" — take the trailing number.
const parseStat = (text: string): number => {
  const parts = text.trim().split('\n');
  const last = parts[parts.length - 1];
  const parsed = Number.parseInt(last, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Could not parse a number from stat text '${text}'`);
  }
  return parsed;
};

export class CopySavedObjectsToSpaceFlyout {
  public readonly flyout: Locator;
  public readonly form: Locator;
  public readonly initiateButton: Locator;
  public readonly finishButton: Locator;
  public readonly summarySuccessCount: Locator;
  public readonly summaryPendingCount: Locator;
  public readonly summarySkippedCount: Locator;
  public readonly summaryErrorCount: Locator;

  constructor(private readonly page: ScoutPage) {
    this.flyout = this.page.testSubj.locator('copy-to-space-flyout');
    this.form = this.page.testSubj.locator('copy-to-space-form');
    this.initiateButton = this.page.testSubj.locator('cts-initiate-button');
    this.finishButton = this.page.testSubj.locator('cts-finish-button');
    this.summarySuccessCount = this.page.testSubj.locator('cts-summary-success-count');
    this.summaryPendingCount = this.page.testSubj.locator('cts-summary-pending-count');
    this.summarySkippedCount = this.page.testSubj.locator('cts-summary-skipped-count');
    this.summaryErrorCount = this.page.testSubj.locator('cts-summary-error-count');
  }

  /** Asserts the flyout is open. */
  async waitForOpen(): Promise<void> {
    await this.flyout.waitFor({ state: 'visible' });
  }

  /**
   * Configures the flyout form prior to initiating the copy. When
   * `createNewCopies` is `false`, toggles the matching radio; if `overwrite`
   * is also `false`, picks the "do not overwrite" radio. Selects the
   * destination space via `cts-space-selector-row-${spaceId}`.
   */
  async setupForm({
    createNewCopies = true,
    overwrite = false,
    destinationSpaceId,
  }: CopyToSpaceSetupOptions): Promise<void> {
    if (createNewCopies && overwrite) {
      throw new Error('createNewCopies and overwrite options cannot be used together');
    }

    if (!createNewCopies) {
      await this.form.locator('label[for="createNewCopiesDisabled"]').click();
      if (!overwrite) {
        await this.page.testSubj
          .locator('cts-copyModeControl-overwriteRadioGroup')
          .locator('label[for="overwriteDisabled"]')
          .click();
      }
    }

    await this.page.testSubj.locator(`cts-space-selector-row-${destinationSpaceId}`).click();
  }

  async startCopy(): Promise<void> {
    await this.initiateButton.click();
  }

  /**
   * Waits for the per-space loading indicator to disappear and the success
   * indicator to appear for the supplied destination space.
   */
  async waitForCopyToFinish(destinationSpaceId: string): Promise<void> {
    const loading = this.page.testSubj.locator(
      `cts-summary-indicator-loading-${destinationSpaceId}`
    );
    // Fast copies may skip the loading indicator entirely; swallow the wait.
    await loading.waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
    await this.page.testSubj
      .locator(`cts-summary-indicator-success-${destinationSpaceId}`)
      .waitFor({ state: 'visible', timeout: 30_000 });
  }

  /** Reads the four EuiStat counters in the flyout summary. */
  async getSummaryCounts(): Promise<CopyToSpaceSummary> {
    return {
      success: parseStat(await this.summarySuccessCount.innerText()),
      pending: parseStat(await this.summaryPendingCount.innerText()),
      skipped: parseStat(await this.summarySkippedCount.innerText()),
      errors: parseStat(await this.summaryErrorCount.innerText()),
    };
  }

  /** Closes the flyout and waits for it to disappear. */
  async finishCopy(): Promise<void> {
    await this.finishButton.click();
    await this.flyout.waitFor({ state: 'detached' });
  }
}
