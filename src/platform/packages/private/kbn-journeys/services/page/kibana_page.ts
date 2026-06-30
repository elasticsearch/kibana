/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { subj } from '@kbn/test-subj-selector';
import type { ToolingLog } from '@kbn/tooling-log';
import type { ElementHandle, Page } from 'playwright';
import type { Retry } from '..';

interface WaitForRenderArgs {
  expectedItemsCount: number;
  parentLocator?: string;
  itemLocator: string;
  checkAttribute: string;
  timeout: number;
}

export class KibanaPage {
  readonly page: Page;
  readonly log: ToolingLog;
  readonly retry: Retry;
  readonly defaultTimeout = 30_000;

  constructor(page: Page, log: ToolingLog, retry: Retry) {
    this.page = page;
    this.log = log;
    this.retry = retry;
  }

  async waitForHeader() {
    return this.page.waitForSelector('.headerGlobalNav', {
      state: 'attached',
    });
  }

  async waitForListViewTable() {
    await this.page.waitForSelector(`${subj('table-is-ready')}, ${subj('content-list-table')}`, {
      state: 'visible',
    });
  }

  async backToDashboardListing() {
    await this.page.click(subj('breadcrumb dashboardListingBreadcrumb first'));
  }

  async waitForRender({
    expectedItemsCount,
    parentLocator,
    itemLocator,
    checkAttribute,
    timeout,
  }: WaitForRenderArgs) {
    // we can't use `page.waitForFunction` because of CSP while testing on Cloud
    await this.retry.waitForWithTimeout(
      `rendering of ${expectedItemsCount} elements with selector ${itemLocator} ${
        parentLocator ? `and ${parentLocator} parent selector` : ''
      } is completed`,
      timeout,
      async () => {
        const loadingItems: ElementHandle[] = [];
        if (parentLocator) {
          const parentElement = await this.page.$(parentLocator);
          if (parentElement) {
            loadingItems.push(...(await parentElement.$$(itemLocator)));
          } else {
            this.log.debug(`waitForRender: Can't locate ${parentLocator} element`);
            return false;
          }
        } else {
          loadingItems.push(...(await this.page.$$(itemLocator)));
        }
        // check if loading items count is matching the input
        if (loadingItems.length === expectedItemsCount) {
          // check if all loaded items are rendered
          const renderStatuses = await Promise.all(
            loadingItems.map(async (item) => {
              return (await item.getAttribute(checkAttribute)) === 'true';
            })
          );
          const rendered = renderStatuses.filter((isRendered) => isRendered === true);
          this.log.debug(
            `waitForRender: ${rendered.length} out of ${expectedItemsCount} are rendered...`
          );
          return rendered.length === expectedItemsCount;
        } else {
          // not all components are loaded yet
          this.log.debug(
            `waitForRender: ${loadingItems.length} out of ${expectedItemsCount} are loaded...`
          );
          return false;
        }
      }
    );
  }

  async waitForVisualizations({
    count,
    timeout = this.defaultTimeout,
  }: {
    count: number;
    timeout?: number;
  }) {
    await this.waitForRender({
      expectedItemsCount: count,
      itemLocator: '[data-rendering-count]',
      checkAttribute: 'data-render-complete',
      timeout,
    });
  }

  async waitForCharts({
    parentLocator,
    count,
    timeout = this.defaultTimeout,
  }: {
    parentLocator?: string;
    count: number;
    timeout?: number;
  }) {
    await this.waitForRender({
      expectedItemsCount: count,
      parentLocator,
      itemLocator: 'div.echChartStatus',
      checkAttribute: 'data-ech-render-complete',
      timeout,
    });
  }

  async waitForChartsSuggestions(count: number) {
    await this.retry.waitFor(`rendering of ${count} suggestions is completed`, async () => {
      const renderingItems = await this.page.$$('button[data-test-subj="lnsSuggestion"]');
      return renderingItems.length === count;
    });
  }

  async clearInput(locator: string) {
    const textArea = this.page.locator(locator);
    await textArea.clear();
  }

  async clickAndWaitFor(
    locator: string,
    state?: 'attached' | 'detached' | 'visible' | 'hidden' | undefined
  ) {
    const element = this.page.locator(locator);
    await element.click();
    await element.waitFor({ state });
  }
}
