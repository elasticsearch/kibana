/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import { FtrService } from './ftr_provider_context';
import type { WebElementWrapper } from './web_element_wrapper';

export class ToastsService extends FtrService {
  private readonly testSubjects = this.ctx.getService('testSubjects');
  private readonly retry = this.ctx.getService('retry');
  private readonly find = this.ctx.getService('find');
  private readonly config = this.ctx.getService('config');
  private readonly defaultFindTimeout = this.config.get('timeouts.find');
  /**
   * Returns the title and message of a specific error toast.
   * This method is specific to toasts created via `.addError` since they contain
   * an additional button, that should not be part of the message.
   *
   * @param index The index of the toast (1-based, NOT 0-based!) of the toast. Use first by default.
   * @param titleOnly If this is true, only the title of the error message is returned. There are error messages that only contain a title, no message.
   * @returns The title and message of the specified error toast.
   */
  public async getErrorByIndex(
    index: number = 1,
    titleOnly: boolean = false
  ): Promise<{ title: string; message?: string }> {
    const title = await this.getTitleByIndex(index);
    if (titleOnly) return { title };

    const toast = await this.getElementByIndex(index);
    const messageElement = await this.testSubjects.findDescendant('euiToastText', toast);
    const message: string = await messageElement.getVisibleText();

    return { title, message };
  }

  /**
   * Dismiss a specific toast from the toast list. Since toasts usually should time out themselves,
   * you only need to call this for permanent toasts (e.g. error toasts).
   *
   * @param index The 1-based index of the toast to dismiss. Use first by default.
   */
  public async dismissByIndex(index: number = 1): Promise<void> {
    const toast = await this.getElementByIndex(index);
    await toast.moveMouseTo();
    const dismissButton = await this.testSubjects.findDescendant('toastCloseButton', toast);
    await dismissButton.click();
  }

  public async dismissIfExists(): Promise<void> {
    const toastShown = await this.find.existsByCssSelector('.euiToast');
    if (toastShown) {
      try {
        await this.testSubjects.click('toastCloseButton');
      } catch (err) {
        // ignore errors, toast clear themselves after timeout
      }
    }
  }

  public async getTitleAndDismiss(): Promise<string> {
    const toast = await this.find.byCssSelector('.euiToast', 6 * this.defaultFindTimeout);
    await toast.moveMouseTo();
    const title = await (await this.testSubjects.find('euiToastHeader__title')).getVisibleText();

    await this.testSubjects.click('toastCloseButton');
    return title;
  }

  public async dismiss(): Promise<void> {
    await this.testSubjects.click('toastCloseButton', 6 * this.defaultFindTimeout);
  }

  public async dismissAll(): Promise<void> {
    const allToastElements = await this.getAll();

    if (allToastElements.length === 0) return;

    for (const toastElement of allToastElements) {
      try {
        await toastElement.moveMouseTo();
        const closeBtn = await toastElement.findByTestSubject('toastCloseButton');
        await closeBtn.click();
      } catch (err) {
        // ignore errors, toast clear themselves after timeout
      }
    }
  }

  public async dismissAllWithChecks(): Promise<void> {
    await this.retry.tryForTime(30 * 1000, async (): Promise<void> => {
      await this.dismissAll();
      await this.assertCount(0);
    });
  }

  public async assertCount(expectedCount: number): Promise<void> {
    await this.retry.tryForTime(5 * 1000, async (): Promise<void> => {
      const toastCount = await this.getCount({ timeout: 1000 });
      expect(toastCount).to.eql(
        expectedCount,
        `Toast count should be ${expectedCount} (got ${toastCount})`
      );
    });
  }

  public async getElementByIndex(index: number = 1): Promise<WebElementWrapper> {
    return await (await this.getGlobalList()).findByCssSelector(`.euiToast:nth-child(${index})`);
  }

  public async getTitleByIndex(index: number): Promise<string> {
    const resultToast = await this.getElementByIndex(index);
    const titleElement = await this.testSubjects.findDescendant(
      'euiToastHeader__title',
      resultToast
    );
    const title: string = await titleElement.getVisibleText();
    return title;
  }

  public async getContentByIndex(index: number): Promise<string> {
    const elem = await this.getElementByIndex(index);
    return await elem.getVisibleText();
  }

  public async getAll(): Promise<WebElementWrapper[]> {
    const list = await this.getGlobalList();
    return await list.findAllByCssSelector(`.euiToast`);
  }

  private async getGlobalList(options?: { timeout?: number }): Promise<WebElementWrapper> {
    return await this.testSubjects.find('globalToastList', options?.timeout);
  }

  public async getCount(options?: { timeout?: number }): Promise<number> {
    const list = await this.getGlobalList(options);
    const toasts = await list.findAllByCssSelector(`.euiToast`, options?.timeout);
    return toasts.length;
  }
}
