/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { subj as testSubjSelector } from '@kbn/test-subj-selector';
import type { WebElementWrapper } from './web_element_wrapper';
import type { TimeoutOpt } from '../types';
import { FtrService } from './ftr_provider_context';

interface ExistsOptions {
  timeout?: number;
  allowHidden?: boolean;
}

interface SetValueOptions {
  clearWithKeyboard?: boolean;
  typeCharByChar?: boolean;
}

export function nonNullable<T>(v: T): v is NonNullable<T> {
  return v != null;
}

export class TestSubjects extends FtrService {
  public readonly log = this.ctx.getService('log');
  public readonly retry = this.ctx.getService('retry');
  public readonly findService = this.ctx.getService('find');
  public readonly config = this.ctx.getService('config');

  public readonly FIND_TIME = this.config.get('timeouts.find');
  public readonly TRY_TIME = this.config.get('timeouts.try');
  public readonly WAIT_FOR_EXISTS_TIME = this.config.get('timeouts.waitForExists');

  /**
   * Get a promise that resolves with `true` when an element exists, if the element doesn't exist
   * yet it will wait until the element does exist. If we wait until the timeout and the element
   * still doesn't exist the promise will resolve with `false`.
   *
   * This method is intended to quickly answer the question "does this testSubject exist". Its
   * 1.5 second default timeout keeps it responsive, making it a good candidate for putting inside
   * `retry.waitFor()` loops. Callers that need to assert existence should use `existOrFail`
   * instead, which uses a 2-minute timeout and throws on failure.
   *
   * When `options.timeout` is not passed the `timeouts.waitForExists` config is used as
   * the timeout. The default value for that config is currently 1.5 seconds (in ms).
   *
   * If the element is hidden it is not treated as "existing", unless `options.allowHidden`
   * is set to `true`.
   */
  public async exists(selector: string, options: ExistsOptions = {}): Promise<boolean> {
    const { timeout = this.WAIT_FOR_EXISTS_TIME, allowHidden = false } = options;

    this.log.debug(`TestSubjects.exists(${selector})`);
    return await (allowHidden
      ? this.findService.existsByCssSelector(testSubjSelector(selector), timeout)
      : this.findService.existsByDisplayedByCssSelector(testSubjSelector(selector), timeout));
  }

  /**
   * Get a promise that resolves when an element exists, if the element doesn't exist
   * before the timeout is reached the promise will reject with an error.
   *
   * This method is intended to be used as success critieria when something is expected
   * to exist. The default 2 minute timeout is not appropriate for all conditions, but
   * hard-coding timeouts all over tests is also bad, so please use your best judgement.
   *
   * The options are equal to the options accepted by the {@link #exists} method except
   * that `options.timeout` defaults to the `timeouts.try` config, or 2 minutes.
   */
  public async existOrFail(selector: string, existsOptions?: ExistsOptions): Promise<void | never> {
    if (!(await this.exists(selector, { timeout: this.TRY_TIME, ...existsOptions }))) {
      throw new Error(`expected testSubject(${selector}) to exist`);
    }
  }

  /**
   * Get a promise that resolves when an element no longer exists, if the element does exist
   * it will wait until the element does not exist. If we wait until the timeout and the element
   * still exists the promise will reject.
   *
   * This method is intended to quickly assert that an element does not exist. Its
   * 2.5 second timeout responds quickly.
   *
   * When `options.timeout` is not passed the `timeouts.waitForExists` config is used as
   * the timeout. The default value for that config is currently 2.5 seconds.
   *
   * If the element is hidden but still in the DOM it is treated as "existing", unless `options.allowHidden`
   * is set to `true`.
   */
  public async missingOrFail(selector: string, options: ExistsOptions = {}): Promise<void | never> {
    const { timeout = this.WAIT_FOR_EXISTS_TIME, allowHidden = false } = options;

    this.log.debug(`TestSubjects.missingOrFail(${selector})`);
    return await (allowHidden
      ? this.waitForHidden(selector, timeout)
      : this.findService.waitForDeletedByCssSelector(testSubjSelector(selector), timeout));
  }

  async stringExistsInCodeBlockOrFail(codeBlockSelector: string, stringToFind: string) {
    await this.retry.try(async () => {
      const responseCodeBlock = await this.find(codeBlockSelector);
      const spans = await this.findService.allDescendantDisplayedByTagName(
        'span',
        responseCodeBlock
      );
      const foundInSpans = await Promise.all(
        spans.map(async (span) => {
          const text = await span.getVisibleText();
          if (text === stringToFind) {
            this.log.debug(`"${text}" matched "${stringToFind}"!`);
            return true;
          } else {
            this.log.debug(`"${text}" did not match "${stringToFind}"`);
          }
        })
      );
      if (!foundInSpans.find((foundInSpan) => foundInSpan)) {
        throw new Error(`"${stringToFind}" was not found. Trying again...`);
      }
    });
  }

  public async append(selector: string, text: string): Promise<void> {
    this.log.debug(`TestSubjects.append(${selector}, ${text})`);
    const input = await this.find(selector);
    await input.click();
    await input.type(text);
  }

  /**
   * Clicks on the element identified by the testSubject selector. If the retries
   * automatically on "stale element" errors unlike clickWhenNotDisabledWithoutRetry.
   * `opts.timeout` defaults to the 'timeouts.find' config, which defaults to 10 seconds
   */
  public async clickWhenNotDisabled(selector: string, opts?: TimeoutOpt) {
    this.log.debug(`TestSubjects.clickWhenNotDisabled(${selector})`);
    await this.findService.clickByCssSelectorWhenNotDisabled(testSubjSelector(selector), opts);
  }

  /**
   * Clicks on the element identified by the testSubject selector. Somewhat surprisingly,
   * this method allows `stale element` errors to propogate, which is why it was renamed
   * from `clickWhenNotDisabled()` and that method was re-implemented to be more consistent
   * with the rest of the functions in this service.
   *
   * `opts.timeout` defaults to the 'timeouts.find' config, which defaults to 10 seconds
   */
  public async clickWhenNotDisabledWithoutRetry(
    selector: string,
    opts?: TimeoutOpt
  ): Promise<void> {
    this.log.debug(`TestSubjects.clickWhenNotDisabledWithoutRetry(${selector})`);
    await this.findService.clickByCssSelectorWhenNotDisabledWithoutRetry(
      testSubjSelector(selector),
      opts
    );
  }

  public async click(
    selector: string,
    timeout: number = this.FIND_TIME,
    topOffsetOrOptions?: number | { topOffset?: number; bottomOffset?: number },
    preclickDelay: number = 0
  ): Promise<void> {
    this.log.debug(`TestSubjects.click(${selector})`);
    await this.findService.clickByCssSelector(
      testSubjSelector(selector),
      timeout,
      topOffsetOrOptions,
      preclickDelay
    );
  }

  public async pressEnter(selector: string, timeout: number = this.FIND_TIME): Promise<void> {
    this.log.debug(`TestSubjects.pressEnter(${selector})`);
    const element = await this.find(selector, timeout);
    await element.focus();
    await element.pressKeys(this.ctx.getService('browser').keys.ENTER);
  }

  public async doubleClick(selector: string, timeout: number = this.FIND_TIME): Promise<void> {
    this.log.debug(`TestSubjects.doubleClick(${selector})`);
    const element = await this.find(selector, timeout);
    await element.moveMouseTo();
    await element.doubleClick();
  }

  async descendantExists(selector: string, parentElement: WebElementWrapper): Promise<boolean> {
    this.log.debug(`TestSubjects.descendantExists(${selector})`);
    return await this.findService.descendantExistsByCssSelector(
      testSubjSelector(selector),
      parentElement
    );
  }

  public async findDescendant(
    selector: string,
    parentElement: WebElementWrapper
  ): Promise<WebElementWrapper> {
    this.log.debug(`TestSubjects.findDescendant(${selector})`);
    return await this.findService.descendantDisplayedByCssSelector(
      testSubjSelector(selector),
      parentElement
    );
  }

  public async findAllDescendant(
    selector: string,
    parentElement: WebElementWrapper
  ): Promise<WebElementWrapper[]> {
    this.log.debug(`TestSubjects.findAllDescendant(${selector})`);
    return await this.findService.allDescendantDisplayedByCssSelector(
      testSubjSelector(selector),
      parentElement
    );
  }

  public async find(
    selector: string,
    timeout: number = this.FIND_TIME
  ): Promise<WebElementWrapper> {
    this.log.debug(`TestSubjects.find(${selector})`);
    return await this.findService.byCssSelector(testSubjSelector(selector), timeout);
  }

  public async findAll(selector: string, timeout?: number): Promise<WebElementWrapper[]> {
    return await this.retry.try(async () => {
      this.log.debug(`TestSubjects.findAll(${selector})`);
      const all = await this.findService.allByCssSelector(testSubjSelector(selector), timeout);
      return await this.findService.filterElementIsDisplayed(all);
    });
  }

  public async getAttributeAll(selector: string, attribute: string): Promise<string[]> {
    this.log.debug(`TestSubjects.getAttributeAll(${selector}, ${attribute})`);
    return (
      await this._mapAll(selector, async (element: WebElementWrapper) => {
        return await element.getAttribute(attribute);
      })
    ).filter(nonNullable);
  }

  public async getAttribute(
    selector: string,
    attribute: string,
    options?:
      | number
      | {
          findTimeout?: number;
          tryTimeout?: number;
        }
  ): Promise<string | null> {
    const findTimeout =
      (typeof options === 'number' ? options : options?.findTimeout) ??
      this.config.get('timeouts.find');

    const tryTimeout =
      (typeof options !== 'number' ? options?.tryTimeout : undefined) ??
      this.config.get('timeouts.try');

    this.log.debug(
      `TestSubjects.getAttribute(${selector}, ${attribute}, tryTimeout=${tryTimeout}, findTimeout=${findTimeout})`
    );

    return await this.retry.tryForTime(tryTimeout, async () => {
      const element = await this.find(selector, findTimeout);
      return await element.getAttribute(attribute);
    });
  }

  public async setValue(
    selector: string,
    text: string,
    options: SetValueOptions = {},
    topOffset?: number
  ): Promise<void> {
    return await this.retry.try(async () => {
      const { clearWithKeyboard = false, typeCharByChar = false } = options;
      this.log.debug(`TestSubjects.setValue(${selector}, ${text})`);
      await this.click(selector, undefined, topOffset);
      // in case the input element is actually a child of the testSubject, we
      // call clearValue() and type() on the element that is focused after
      // clicking on the testSubject
      const input = await this.findService.activeElement();
      if (clearWithKeyboard === true) {
        await input.clearValueWithKeyboard();
      } else {
        await input.clearValue();
      }
      await input.type(text, { charByChar: typeCharByChar });
    });
  }

  public async selectValue(selector: string, value: string): Promise<void> {
    await this.findService.selectValue(`[data-test-subj="${selector}"]`, value);
  }

  public async isEnabled(selector: string): Promise<boolean> {
    this.log.debug(`TestSubjects.isEnabled(${selector})`);
    const element = await this.find(selector);
    return await element.isEnabled();
  }

  public async isDisplayed(selector: string, timeout?: number): Promise<boolean> {
    this.log.debug(`TestSubjects.isDisplayed(${selector})`);
    const element = await this.find(selector, timeout);
    return await element.isDisplayed();
  }

  public async isSelected(selector: string): Promise<boolean> {
    this.log.debug(`TestSubjects.isSelected(${selector})`);
    const element = await this.find(selector);
    return await element.isSelected();
  }

  public async isSelectedAll(selectorAll: string): Promise<boolean[]> {
    this.log.debug(`TestSubjects.isSelectedAll(${selectorAll})`);
    return await this._mapAll(selectorAll, async (element: WebElementWrapper) => {
      return await element.isSelected();
    });
  }

  public async getVisibleText(selector: string): Promise<string> {
    this.log.debug(`TestSubjects.getVisibleText(${selector})`);
    const element = await this.find(selector);
    return await element.getVisibleText();
  }

  async getVisibleTextAll(selectorAll: string): Promise<string[]> {
    this.log.debug(`TestSubjects.getVisibleTextAll(${selectorAll})`);
    return await this._mapAll(selectorAll, async (element: WebElementWrapper) => {
      return await element.getVisibleText();
    });
  }

  public async moveMouseTo(selector: string): Promise<void> {
    // Wrapped in a retry because even though the find should do a stale element check of it's own, we seem to
    // have run into a case where the element becomes stale after the find succeeds, throwing an error during the
    // moveMouseTo function.
    await this.retry.try(async () => {
      this.log.debug(`TestSubjects.moveMouseTo(${selector})`);
      const element = await this.find(selector);
      await element.moveMouseTo();
    });
  }

  private async _mapAll<T>(
    selectorAll: string,
    mapFn: (element: WebElementWrapper, index: number, array: WebElementWrapper[]) => Promise<T>
  ): Promise<T[]> {
    return await this.retry.try(async () => {
      const elements = await this.findAll(selectorAll);
      return await Promise.all(elements.map(mapFn));
    });
  }

  public async waitForDeleted(selectorOrElement: string | WebElementWrapper): Promise<void> {
    if (typeof selectorOrElement === 'string') {
      await this.findService.waitForDeletedByCssSelector(testSubjSelector(selectorOrElement));
    } else {
      await this.findService.waitForElementStale(selectorOrElement);
    }
  }

  public async waitForAttributeToChange(
    selector: string,
    attribute: string,
    value: string
  ): Promise<void> {
    await this.findService.waitForAttributeToChange(testSubjSelector(selector), attribute, value);
  }

  public async waitForHidden(selector: string, timeout?: number): Promise<void> {
    this.log.debug(`TestSubjects.waitForHidden(${selector})`);
    const element = await this.find(selector);
    await this.findService.waitForElementHidden(element, timeout);
  }

  public async waitForEnabled(selector: string, timeout: number = this.TRY_TIME): Promise<boolean> {
    const success = await this.retry.tryForTime(timeout, async () => {
      const element = await this.find(selector);
      return (await element.isDisplayed()) && (await element.isEnabled());
    });
    return success;
  }

  public getCssSelector(selector: string): string {
    return testSubjSelector(selector);
  }

  public async scrollIntoView(
    selector: string,
    offset?: number | { topOffset?: number; bottomOffset?: number }
  ) {
    const element = await this.find(selector);
    await element.scrollIntoViewIfNecessary(offset);
  }

  // isChecked always returns false when run on an euiSwitch, because they use the aria-checked attribute
  public async isChecked(selector: string) {
    const checkbox = await this.find(selector);
    return await checkbox.isSelected();
  }

  public async setCheckbox(selector: string, state: 'check' | 'uncheck') {
    const isChecked = await this.isChecked(selector);
    const states = { check: true, uncheck: false };
    if (isChecked !== states[state]) {
      this.log.debug(`updating checkbox ${selector} from ${isChecked} to ${states[state]}`);
      await this.click(selector);
    }
  }

  public async isEuiSwitchChecked(selector: string | WebElementWrapper) {
    let euiSwitch: WebElementWrapper;
    if (typeof selector === 'string') {
      euiSwitch = await this.find(selector);
    } else {
      euiSwitch = selector;
    }
    const isChecked = await euiSwitch.getAttribute('aria-checked');
    return isChecked === 'true';
  }

  public async setEuiSwitch(selector: string, state: 'check' | 'uncheck') {
    const isChecked = await this.isEuiSwitchChecked(selector);
    const states = { check: true, uncheck: false };
    if (isChecked !== states[state]) {
      this.log.debug(`updating checkbox ${selector} from ${isChecked} to ${states[state]}`);
      await this.click(selector);
    }
  }

  public async getAccordionState(selector: string) {
    const container = await this.find(selector);
    const buttons = await container.findAllByCssSelector('button');

    if (buttons.length > 0) {
      const firstButton = buttons[0];
      return await firstButton.getAttribute('aria-expanded');
    } else {
      throw new Error(
        `Container '${selector}' has no 'button' child elements, check for EUI upgrades`
      );
    }
  }

  /**
   * Helper function to wait for accordion state to reach expected value
   * This helps avoid race conditions in tests where UI updates are still in progress
   */
  public async waitForAccordionState(
    selector: string,
    expectedState: string,
    timeout: number = 5000
  ) {
    await this.existOrFail(selector);

    await this.retry.waitForWithTimeout(
      `accordion ${selector} to reach state ${expectedState}`,
      timeout,
      async () => {
        const currentState = await this.getAccordionState(selector);
        return currentState === expectedState;
      }
    );
  }
}
