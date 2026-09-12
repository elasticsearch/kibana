/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WebDriver, WebElement } from 'selenium-webdriver';
import { By, until } from 'selenium-webdriver';

import { delay } from '@kbn/test-jest-helpers';
import type { Browsers } from './remote/browsers';
import type { FtrProviderContext } from './ftr_provider_context';
import { WebElementWrapper } from './web_element_wrapper';
import type { TimeoutOpt } from '../types';

import { FtrService } from './ftr_provider_context';

export class FindService extends FtrService {
  private readonly log = this.ctx.getService('log');
  private readonly config = this.ctx.getService('config');
  private readonly retry = this.ctx.getService('retry');
  private readonly retryOnStale = this.ctx.getService('retryOnStale');

  private readonly WAIT_FOR_EXISTS_TIME = this.config.get('timeouts.waitForExists');
  private readonly defaultFindTimeout = this.config.get('timeouts.find');
  private readonly fixedHeaderHeight = this.config.get('layout.fixedHeaderHeight');

  public currentWait = this.defaultFindTimeout;

  constructor(
    ctx: FtrProviderContext,
    private readonly browserType: Browsers,
    private readonly driver: WebDriver
  ) {
    super(ctx);
  }

  public async byName(
    selector: string,
    timeout: number = this.defaultFindTimeout
  ): Promise<WebElementWrapper> {
    this.log.debug(`Find.byName('${selector}') with timeout=${timeout}`);
    return await this.findAndWrap(By.name(selector), timeout);
  }

  public async byCssSelector(
    selector: string,
    timeout: number = this.defaultFindTimeout
  ): Promise<WebElementWrapper> {
    this.log.debug(`Find.findByCssSelector('${selector}') with timeout=${timeout}`);
    return this.findAndWrap(By.css(selector), timeout);
  }

  public async byXPath(
    selector: string,
    timeout: number = this.defaultFindTimeout
  ): Promise<WebElementWrapper> {
    this.log.debug(`Find.byXPath('${selector}') with timeout=${timeout}`);
    return this.findAndWrap(By.xpath(selector), timeout);
  }

  public async byClassName(
    selector: string,
    timeout: number = this.defaultFindTimeout
  ): Promise<WebElementWrapper> {
    this.log.debug(`Find.findByClassName('${selector}') with timeout=${timeout}`);
    return this.findAndWrap(By.className(selector), timeout);
  }

  public async activeElement(): Promise<WebElementWrapper> {
    return this.wrap(await this.driver.switchTo().activeElement());
  }

  public async setValue(selector: string, text: string, topOffset?: number): Promise<void> {
    this.log.debug(`Find.setValue('${selector}', '${text}')`);
    return await this.retry.try(async () => {
      const element = await this.byCssSelector(selector);
      await element.click(topOffset);

      // in case the input element is actually a child of the testSubject, we
      // call clearValue() and type() on the element that is focused after
      // clicking on the testSubject
      const input = await this.activeElement();
      if (input) {
        await input.clearValue();
        await input.type(text);
      } else {
        await element.clearValue();
        await element.type(text);
      }
    });
  }

  public async setValueByClass(selector: string, text: string, topOffset?: number): Promise<void> {
    this.log.debug(`Find.setValueByClass('${selector}', '${text}')`);
    return await this.retry.try(async () => {
      const element = await this.byClassName(selector);
      await element.click(topOffset);

      // in case the input element is actually a child of the testSubject, we
      // call clearValue() and type() on the element that is focused after
      // clicking on the testSubject
      const input = await this.activeElement();
      if (input) {
        await input.clearValue();
        await input.type(text);
      } else {
        await element.clearValue();
        await element.type(text);
      }
    });
  }

  public async selectValue(selector: string, value: string): Promise<void> {
    this.log.debug(`Find.selectValue('${selector}', option[value="${value}"]')`);
    const combobox = await this.byCssSelector(selector);
    const $ = await combobox.parseDomContent();
    const text = $(`option[value="${value}"]`).text();
    await combobox.type(text);
  }

  public async filterElementIsDisplayed(elements: WebElementWrapper[]) {
    if (elements.length === 0) {
      return [];
    } else {
      const displayed = [];
      // tslint:disable-next-line:prefer-for-of
      for (let i = 0; i < elements.length; i++) {
        const isDisplayed = await elements[i].isDisplayed();
        if (isDisplayed) {
          displayed.push(elements[i]);
        }
      }
      return displayed;
    }
  }

  public async allByCssSelector(
    selector: string,
    timeout: number = this.defaultFindTimeout
  ): Promise<WebElementWrapper[]> {
    this.log.debug(`Find.allByCssSelector('${selector}') with timeout=${timeout}`);
    await this._withTimeout(timeout);
    try {
      const elements = await this.driver.findElements(By.css(selector));
      return this.wrapAll(elements);
    } finally {
      await this._withTimeout(this.defaultFindTimeout);
    }
  }

  public async descendantExistsByCssSelector(
    selector: string,
    parentElement: WebElementWrapper,
    timeout: number = this.WAIT_FOR_EXISTS_TIME
  ): Promise<boolean> {
    this.log.debug(`Find.descendantExistsByCssSelector('${selector}') with timeout=${timeout}`);
    await this._withTimeout(timeout);
    try {
      const els = await parentElement._webElement.findElements(By.css(selector));
      return await this.exists(async () => this.wrapAll(els), timeout);
    } finally {
      await this._withTimeout(this.defaultFindTimeout);
    }
  }

  public async descendantDisplayedByCssSelector(
    selector: string,
    parentElement: WebElementWrapper
  ): Promise<WebElementWrapper | never> {
    this.log.debug(`Find.descendantDisplayedByCssSelector('${selector}')`);
    const element = await parentElement._webElement.findElement(By.css(selector));
    const descendant = this.wrap(element, By.css(selector));
    const isDisplayed = await descendant.isDisplayed();
    if (isDisplayed) {
      return descendant;
    } else {
      throw new Error(`Element "${selector}" is not displayed`);
    }
  }

  public async allDescendantDisplayedByCssSelector(
    selector: string,
    parentElement: WebElementWrapper
  ): Promise<WebElementWrapper[]> {
    this.log.debug(`Find.allDescendantDisplayedByCssSelector('${selector}')`);
    const allElements = await this.wrapAll(
      await parentElement._webElement.findElements(By.css(selector))
    );
    return await this.filterElementIsDisplayed(allElements);
  }

  public async allDescendantDisplayedByTagName(
    tagName: string,
    parentElement: WebElementWrapper
  ): Promise<WebElementWrapper[]> {
    this.log.debug(`Find.allDescendantDisplayedByTagName('${tagName}')`);
    const allElements = await this.wrapAll(
      await parentElement._webElement.findElements(By.css(tagName))
    );
    return await this.filterElementIsDisplayed(allElements);
  }

  public async displayedByLinkText(
    linkText: string,
    timeout: number = this.defaultFindTimeout
  ): Promise<WebElementWrapper> {
    this.log.debug(`Find.displayedByLinkText('${linkText}') with timeout=${timeout}`);
    const element = await this.byLinkText(linkText, timeout);
    this.log.debug(`Wait for element become visible: ${linkText} with timeout=${timeout}`);
    await this.driver.wait(until.elementIsVisible(element._webElement), timeout);
    return this.wrap(element, By.linkText(linkText));
  }

  public async displayedByCssSelector(
    selector: string,
    timeout: number = this.defaultFindTimeout
  ): Promise<WebElementWrapper> {
    this.log.debug(`Find.displayedByCssSelector(${selector})`);
    const element = await this.byCssSelector(selector, timeout);
    this.log.debug(`Wait for element become visible: ${selector} with timeout=${timeout}`);
    await this.driver.wait(until.elementIsVisible(element._webElement), timeout);
    return this.wrap(element, By.css(selector));
  }

  public async byLinkText(
    selector: string,
    timeout: number = this.defaultFindTimeout
  ): Promise<WebElementWrapper> {
    this.log.debug(`Find.byLinkText('${selector}') with timeout=${timeout}`);
    return this.findAndWrap(By.linkText(selector), timeout);
  }

  public async byPartialLinkText(
    partialLinkText: string,
    timeout: number = this.defaultFindTimeout
  ): Promise<WebElementWrapper> {
    this.log.debug(`Find.byPartialLinkText('${partialLinkText}')  with timeout=${timeout}`);
    return this.findAndWrap(By.partialLinkText(partialLinkText), timeout);
  }

  public async exists(
    findFunction: (
      el: WebDriver
    ) =>
      | WebElementWrapper
      | WebElementWrapper[]
      | Promise<WebElementWrapper[]>
      | Promise<WebElementWrapper>,
    timeout: number = this.WAIT_FOR_EXISTS_TIME
  ): Promise<boolean> {
    await this._withTimeout(timeout);
    try {
      const found = await findFunction(this.driver);
      await this._withTimeout(this.defaultFindTimeout);
      if (Array.isArray(found)) {
        return found.length > 0;
      } else {
        return found instanceof WebElementWrapper;
      }
    } catch (err) {
      await this._withTimeout(this.defaultFindTimeout);
      return false;
    }
  }

  public async existsByLinkText(
    linkText: string,
    timeout: number = this.WAIT_FOR_EXISTS_TIME
  ): Promise<boolean> {
    this.log.debug(`Find.existsByLinkText('${linkText}')  with timeout=${timeout}`);
    return await this.exists(
      async (drive) => this.wrapAll(await drive.findElements(By.linkText(linkText))),
      timeout
    );
  }

  public async existsByDisplayedByCssSelector(
    selector: string,
    timeout: number = this.WAIT_FOR_EXISTS_TIME
  ): Promise<boolean> {
    this.log.debug(`Find.existsByDisplayedByCssSelector('${selector}') with timeout=${timeout}`);
    try {
      await this.retry.tryForTime(timeout, async () => {
        // make sure that the find timeout is not longer than the retry timeout
        await this._withTimeout(Math.min(timeout, this.WAIT_FOR_EXISTS_TIME));
        const elements = await this.driver.findElements(By.css(selector));
        await this._withTimeout(this.defaultFindTimeout);
        const displayed = await this.filterElementIsDisplayed(this.wrapAll(elements));
        if (displayed.length === 0) {
          throw new Error(`${selector} is not displayed`);
        }
      });
    } catch (err) {
      await this._withTimeout(this.defaultFindTimeout);
      return false;
    }
    return true;
  }

  public async existsByCssSelector(
    selector: string,
    timeout: number = this.WAIT_FOR_EXISTS_TIME
  ): Promise<boolean> {
    this.log.debug(`Find.existsByCssSelector('${selector}') with timeout=${timeout}`);
    return await this.exists(async (drive) => {
      return this.wrapAll(await drive.findElements(By.css(selector)));
    }, timeout);
  }

  public async existsByXpath(
    selector: string,
    timeout: number = this.WAIT_FOR_EXISTS_TIME
  ): Promise<boolean> {
    this.log.debug(`Find.existsByXpath('${selector}') with timeout=${timeout}`);
    return await this.exists(async (drive) => {
      return this.wrapAll(await drive.findElements(By.xpath(selector)));
    }, timeout);
  }

  public async clickByCssSelectorWhenNotDisabled(selector: string, opts?: TimeoutOpt) {
    const timeout = opts?.timeout ?? this.defaultFindTimeout;

    await this.retryOnStale(async () => {
      this.log.debug(`Find.clickByCssSelectorWhenNotDisabled(${selector}, timeout=${timeout})`);

      const element = await this.byCssSelector(selector);
      await element.moveMouseTo();
      await this.driver.wait(until.elementIsEnabled(element._webElement), timeout);
      await element.click();
    });
  }

  public async clickByCssSelectorWhenNotDisabledWithoutRetry(
    selector: string,
    opts?: TimeoutOpt
  ): Promise<void> {
    const timeout = opts?.timeout ?? this.defaultFindTimeout;

    this.log.debug(
      `Find.clickByCssSelectorWhenNotDisabledWithoutRetry(${selector}, timeout=${timeout})`
    );

    // Don't wrap this code in a retry, or stale element checks may get caught here and the element
    // will never be re-grabbed.  Let errors bubble, but continue checking for disabled property until
    // it's gone.
    const element = await this.byCssSelector(selector);
    await element.moveMouseTo();
    await this.driver.wait(until.elementIsEnabled(element._webElement), timeout);
    await element.click();
  }

  public async clickByPartialLinkText(
    linkText: string,
    timeout: number = this.defaultFindTimeout
  ): Promise<void> {
    this.log.debug(`Find.clickByPartialLinkText('${linkText}') with timeout=${timeout}`);
    await this.retry.try(async () => {
      const element = await this.byPartialLinkText(linkText, timeout);
      await element.moveMouseTo();
      await element.click();
    });
  }

  public async clickByLinkText(
    linkText: string,
    timeout: number = this.defaultFindTimeout
  ): Promise<void> {
    this.log.debug(`Find.clickByLinkText('${linkText}') with timeout=${timeout}`);
    await this.retry.try(async () => {
      const element = await this.byLinkText(linkText, timeout);
      await element.moveMouseTo();
      await element.click();
    });
  }

  public async byButtonText(
    buttonText: string,
    element: WebDriver | WebElement | WebElementWrapper = this.driver,
    timeout: number = this.defaultFindTimeout
  ): Promise<WebElementWrapper> {
    this.log.debug(`Find.byButtonText('${buttonText}') with timeout=${timeout}`);
    return await this.retry.tryForTime(timeout, async () => {
      // tslint:disable-next-line:variable-name
      const _element = element instanceof WebElementWrapper ? element._webElement : element;
      const allButtons = this.wrapAll(await _element.findElements(By.css('button')));
      const buttonTexts = await Promise.all(
        allButtons.map(async (el) => {
          return el.getVisibleText();
        })
      );
      const index = buttonTexts.findIndex((text) => text.trim() === buttonText.trim());
      if (index === -1) {
        throw new Error('Button not found');
      }
      return allButtons[index];
    });
  }

  public async clickByButtonText(
    buttonText: string,
    element: WebDriver | WebElement | WebElementWrapper = this.driver,
    timeout: number = this.defaultFindTimeout
  ): Promise<void> {
    this.log.debug(`Find.clickByButtonText('${buttonText}') with timeout=${timeout}`);
    await this.retry.try(async () => {
      const button = await this.byButtonText(buttonText, element, timeout);
      await button.click();
    });
  }

  public async clickByCssSelector(
    selector: string,
    timeout: number = this.defaultFindTimeout,
    topOffsetOrOptions?: number | { topOffset?: number; bottomOffset?: number },
    preclickDelay: number = 0
  ): Promise<void> {
    this.log.debug(`Find.clickByCssSelector('${selector}') with timeout=${timeout}`);
    await this.retry.try(async () => {
      const element = await this.byCssSelector(selector, timeout);
      if (element) {
        await delay(preclickDelay); // give React enough time to bind the click handler to the element
        await element.click(topOffsetOrOptions);
      } else {
        throw new Error(`Element with css='${selector}' is not found`);
      }
    });
  }

  public async clickByDisplayedLinkText(
    linkText: string,
    timeout: number = this.defaultFindTimeout
  ): Promise<void> {
    this.log.debug(`Find.clickByDisplayedLinkText('${linkText}') with timeout=${timeout}`);
    await this.retry.try(async () => {
      const element = await this.displayedByLinkText(linkText, timeout);
      if (element) {
        await element.moveMouseTo();
        await element.click();
      } else {
        throw new Error(`Element with linkText='${linkText}' is not found`);
      }
    });
  }

  public async clickDisplayedByCssSelector(
    selector: string,
    timeout: number = this.defaultFindTimeout
  ) {
    this.log.debug(`Find.clickDisplayedByCssSelector('${selector}') with timeout=${timeout}`);
    await this.retry.try(async () => {
      const element = await this.displayedByCssSelector(selector, timeout);
      if (element) {
        await element.moveMouseTo();
        await element.click();
      } else {
        throw new Error(`Element with css='${selector}' is not found`);
      }
    });
  }

  public async waitForDeletedByCssSelector(
    selector: string,
    timeout: number = this.defaultFindTimeout
  ) {
    this.log.debug(`Find.waitForDeletedByCssSelector('${selector}') with timeout=${timeout}`);
    // Implicit timeout 0: findElements returns immediately when absent, no per-iteration 500ms floor.
    await this._withTimeout(0);
    try {
      await this.driver.wait(
        async () => {
          const found = await this.driver.findElements(By.css(selector));
          return found.length === 0;
        },
        timeout,
        `The element ${selector} was still present when it should have disappeared.`
      );
    } finally {
      await this._withTimeout(this.defaultFindTimeout);
    }
  }

  public async waitForAttributeToChange(
    selector: string,
    attribute: string,
    value: string
  ): Promise<void> {
    this.log.debug(`Find.waitForAttributeToChange('${selector}', '${attribute}', '${value}')`);
    await this.retry.waitFor(`${attribute} to equal "${value}"`, async () => {
      const el = await this.byCssSelector(selector);
      return value === (await el.getAttribute(attribute));
    });
  }

  public async waitForElementStale(
    element: WebElementWrapper,
    timeout: number = this.defaultFindTimeout
  ): Promise<void> {
    this.log.debug(`Find.waitForElementStale with timeout=${timeout}`);
    await this.driver.wait(until.stalenessOf(element._webElement), timeout);
  }

  public async waitForElementHidden(
    element: WebElementWrapper,
    timeout: number = this.defaultFindTimeout
  ) {
    this.log.debug(`Find.waitForElementHidden with timeout=${timeout}`);
    await this.driver.wait(until.elementIsNotVisible(element._webElement), timeout);
  }

  private async _withTimeout(timeout: number) {
    if (timeout !== this.currentWait) {
      this.currentWait = timeout;
      await this.driver.manage().setTimeouts({ implicit: timeout });
    }
  }

  private wrap(webElement: WebElement | WebElementWrapper, locator: By | null = null) {
    return WebElementWrapper.create(
      webElement,
      locator,
      this.driver,
      this.defaultFindTimeout,
      this.fixedHeaderHeight,
      this.log,
      this.browserType
    );
  }

  private wrapAll(webElements: Array<WebElement | WebElementWrapper>) {
    return webElements.map((e) => this.wrap(e));
  }

  private async findAndWrap(locator: By, timeout: number): Promise<WebElementWrapper> {
    const webElement = await this.driver.wait(until.elementLocated(locator), timeout);
    return this.wrap(webElement, locator);
  }
}

export async function FindProvider(ctx: FtrProviderContext) {
  const { browserType, driver } = await ctx.getService('__webdriver__').init();
  return new FindService(ctx, browserType, driver);
}
