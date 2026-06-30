/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import type { ScoutPage } from '../fixtures/scope/test/scout_page';
import { resolveSelector, type SelectorInput } from '../utils';

// https://eui.elastic.co/next/docs/display/toast/
export class EuiToastWrapper {
  private readonly toastWrapper: Locator;
  private readonly toastHeaderTitle: Locator;
  private readonly toastCloseButton: Locator;

  /**
   * Create a new EuiToastWrapper instance.
   * new EuiToastWrapper(page, { dataTestSubj: 'myToast' })
   * new EuiToastWrapper(page, 'myToast') // backward compatibility
   * new EuiToastWrapper(page, { locator: 'role=alert[name="I am a toast"]' })
   */
  constructor(page: ScoutPage, selector: SelectorInput) {
    this.toastWrapper = resolveSelector(page, selector);
    this.toastHeaderTitle = this.toastWrapper.getByTestId('euiToastHeader__title');
    this.toastCloseButton = this.toastWrapper.getByTestId('toastCloseButton');
  }

  async getCount(): Promise<number> {
    return await this.toastWrapper.count();
  }

  getWrapper(): Locator {
    return this.toastWrapper;
  }

  async getHeaderTitle(): Promise<string> {
    return (await this.toastHeaderTitle.textContent()) || '';
  }

  async getBody(): Promise<string> {
    const textEl = this.toastWrapper.getByTestId('euiToastText');
    const count = await textEl.count();

    if (count === 0) return '';

    return (await textEl.textContent()) ?? '';
  }

  async close(): Promise<void> {
    await this.toastCloseButton.click();
  }

  async closeAllToasts() {
    // Get an array of all locators and loop through them
    for (const button of await this.toastCloseButton.all()) {
      await button.click();
    }

    await expect(this.toastCloseButton).toHaveCount(0);
  }
}
